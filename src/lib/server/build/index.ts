/**
 * DeployForge Docker Build Integration - Entry Point & Pipeline Orchestration
 */

import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/server/crypto'
import { logger } from '@/lib/server/logger'
import {
  BuildJob,
  BuildJobResult,
  IBuildWorker,
  ProjectType,
} from './types'
import { MockBuildWorker } from './mock-worker'
import { DockerBuildWorker } from './docker-worker'
import { detectProjectType } from './detection'

export * from './types'
export * from './detection'
export * from './image-tag'
export * from './security'
export * from './mock-worker'
export * from './docker-worker'

const mockWorker = new MockBuildWorker()
const dockerWorker = new DockerBuildWorker()

/**
 * Returns the appropriate build worker based on environment configuration.
 * Real Docker build is gated by BUILD_RUNNER_TYPE=docker and ENABLE_REAL_DOCKER_BUILDS=true.
 */
export function getBuildWorker(preferredType?: 'mock' | 'docker'): IBuildWorker {
  const runnerType = preferredType || process.env.BUILD_RUNNER_TYPE || 'mock'
  const isRealGated = process.env.ENABLE_REAL_DOCKER_BUILDS === 'true'

  if (runnerType === 'docker' && isRealGated) {
    return dockerWorker
  }

  return mockWorker
}

/**
 * Executes an isolated build job for an existing Deployment record,
 * updating database records (Deployment, DeploymentStage, DeploymentLog)
 * based on the build worker's confirmed outcome.
 *
 * Security: Do not claim a build succeeded unless the build worker confirms it.
 * Do not deploy images to AWS in this phase.
 */
export async function executeBuildForDeployment(
  deploymentId: string,
  options?: {
    workerType?: 'mock' | 'docker'
    timeoutSeconds?: number
    cancellationSignal?: AbortSignal
  }
): Promise<BuildJobResult> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: {
      project: {
        include: {
          envVars: true,
        },
      },
      stages: true,
    },
  })

  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found.`)
  }

  const project = deployment.project

  // Find or create DOCKER_BUILD stage
  let dockerStage = deployment.stages.find((s) => s.name === 'DOCKER_BUILD')
  if (!dockerStage) {
    dockerStage = await prisma.deploymentStage.create({
      data: {
        deploymentId: deployment.id,
        name: 'DOCKER_BUILD',
        order: 3,
        status: 'PENDING',
      },
    })
  }

  // Mark DOCKER_BUILD stage as RUNNING
  const stageStartTime = new Date()
  await prisma.deploymentStage.update({
    where: { id: dockerStage.id },
    data: {
      status: 'RUNNING',
      startedAt: stageStartTime,
    },
  })

  // Decrypt environment variables and separate safe vars from secrets
  const envVars: Record<string, string> = {}
  const secrets: Record<string, string> = {}

  for (const ev of project.envVars) {
    try {
      const val = decryptSecret(ev.valueEncrypted)
      if (ev.isSecret) {
        secrets[ev.key] = val
      } else {
        envVars[ev.key] = val
      }
    } catch {
      // ignore decryption errors for non-existent values
    }
  }

  // Determine Project Type from runtime or defaults
  let projectType: ProjectType = 'NODEJS_GENERIC'
  if (project.dockerfilePath) {
    projectType = 'DOCKERFILE_CUSTOM'
  } else if (project.runtime.includes('NEXT')) {
    projectType = 'NODEJS_NEXTJS'
  } else if (project.runtime.includes('PYTHON')) {
    projectType = 'PYTHON_GENERIC'
  } else if (project.runtime.includes('GO')) {
    projectType = 'GO_MODULE'
  } else {
    // Attempt auto-detection from name and commands
    const detected = detectProjectType([project.buildCommand, project.startCommand])
    if (detected.type !== 'UNKNOWN') {
      projectType = detected.type
    }
  }

  // Construct BuildJob
  const buildJob: BuildJob = {
    id: `job-${deployment.id.slice(-8)}-${Date.now().toString(36)}`,
    deploymentId: deployment.id,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    repoUrl: project.repository,
    commitSha: deployment.commitSha,
    branch: deployment.branch,
    projectType,
    buildCommand: project.buildCommand,
    startCommand: project.startCommand,
    dockerfilePath: project.dockerfilePath || undefined,
    port: project.port,
    envVars,
    secrets,
    limits: {
      timeoutSeconds: options?.timeoutSeconds || 600,
    },
  }

  const worker = getBuildWorker(options?.workerType)
  logger.info('DockerBuild', `Dispatching build job ${buildJob.id} to worker ${worker.name}`, {
    deploymentId: deployment.id,
    workerType: worker.type,
  })

  // Execute build via isolated worker
  const result = await worker.executeBuild(buildJob, options?.cancellationSignal)

  const stageFinishTime = new Date()
  const durationSeconds = Math.max(1, Math.round((stageFinishTime.getTime() - stageStartTime.getTime()) / 1000))

  // Persist logs in database
  if (result.logs.length > 0) {
    await prisma.deploymentLog.createMany({
      data: result.logs.map((log) => ({
        deploymentId: deployment.id,
        stageName: 'DOCKER_BUILD',
        level: log.level,
        message: log.message,
        timestamp: new Date(log.timestamp),
      })),
    })
  }

  if (result.success) {
    // Update DOCKER_BUILD stage as SUCCESS
    await prisma.deploymentStage.update({
      where: { id: dockerStage.id },
      data: {
        status: 'SUCCESS',
        durationSeconds,
        finishedAt: stageFinishTime,
      },
    })

    // Update deployment record with confirmed immutable image reference
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        dockerImageTag: result.imageTag,
      },
    })

    logger.info('DockerBuild', `Build confirmed by worker: ${result.imageTag}`, {
      deploymentId: deployment.id,
      imageTag: result.imageTag,
      durationSeconds,
    })
  } else {
    // Build failed or timed out: update stage and deployment
    await prisma.deploymentStage.update({
      where: { id: dockerStage.id },
      data: {
        status: result.status === 'TIMED_OUT' ? 'FAILED' : result.status,
        durationSeconds,
        finishedAt: stageFinishTime,
        errorMessage: result.errorDetails || result.summary,
      },
    })

    // Mark deployment as FAILED with error details
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'FAILED',
        errorMessage: result.errorDetails || result.summary,
        finishedAt: stageFinishTime,
      },
    })

    logger.warn('DockerBuild', `Build failed: ${result.summary}`, {
      deploymentId: deployment.id,
      status: result.status,
      errorDetails: result.errorDetails,
    })
  }

  return result
}
