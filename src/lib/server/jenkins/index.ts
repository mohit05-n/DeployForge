/**
 * DeployForge Jenkins Integration - Pipeline Dispatcher & Adapter Orchestration
 */

import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'
import {
  IJenkinsAdapter,
  JenkinsJobParameters,
  JenkinsQueueResult,
} from './types'
import { MockJenkinsAdapter } from './mock-adapter'
import { RealJenkinsAdapter } from './real-adapter'
import {
  generateCallbackToken,
  validateProjectAndCommit,
} from './security'

export * from './types'
export * from './security'
export * from './jenkinsfile-generator'
export * from './mock-adapter'
export * from './real-adapter'
export * from './jenkins-client'

const mockAdapter = new MockJenkinsAdapter()
const realAdapter = new RealJenkinsAdapter()

/**
 * Returns either the MockJenkinsAdapter (for UI dev and test runs)
 * or the RealJenkinsAdapter (when ENABLE_REAL_JENKINS=true).
 */
export function getJenkinsAdapter(preferred?: 'mock' | 'real'): IJenkinsAdapter {
  if (preferred === 'real' || (process.env.ENABLE_REAL_JENKINS === 'true' && preferred !== 'mock')) {
    return realAdapter
  }
  return mockAdapter
}

/**
 * Validates project ownership, commit SHA, and dispatches a build to the Jenkins pipeline adapter.
 */
export async function queueJenkinsDeployment(
  deploymentId: string,
  userId: string,
  options?: {
    preferredAdapter?: 'mock' | 'real'
    requireApproval?: boolean
    appUrl?: string
  }
): Promise<JenkinsQueueResult> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: true },
  })

  if (!deployment) {
    return {
      success: false,
      jobName: 'unknown',
      error: `Deployment ${deploymentId} not found.`,
      isSimulated: true,
    }
  }

  // 1. Validate project authorization and commit identity
  const authVal = await validateProjectAndCommit(deployment.projectId, deployment.commitSha, userId)
  if (!authVal.valid || !authVal.project) {
    return {
      success: false,
      jobName: deployment.project.slug,
      error: authVal.error || 'Project authorization failed.',
      isSimulated: true,
    }
  }

  const project = authVal.project
  const baseUrl = options?.appUrl || process.env.APP_URL || 'http://localhost:3000'
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/jenkins`
  const callbackToken = generateCallbackToken(deployment.id, project.id)

  // 2. Prepare immutable parameters
  const jobParams: JenkinsJobParameters = {
    DEPLOYMENT_ID: deployment.id,
    PROJECT_ID: project.id,
    PROJECT_SLUG: project.slug,
    PROJECT_NAME: project.name,
    REPO_URL: project.repository,
    BRANCH: deployment.branch,
    COMMIT_SHA: deployment.commitSha,
    PROJECT_TYPE: project.dockerfilePath ? 'DOCKERFILE_CUSTOM' : 'NODEJS_GENERIC',
    BUILD_COMMAND: project.buildCommand || 'npm run build',
    START_COMMAND: project.startCommand || 'npm start',
    PORT: project.port || 3000,
    DOCKERFILE_PATH: project.dockerfilePath || 'Dockerfile',
    REQUIRE_APPROVAL: options?.requireApproval === true,
    CALLBACK_URL: callbackUrl,
    CALLBACK_TOKEN: callbackToken,
  }

  const adapter = getJenkinsAdapter(options?.preferredAdapter)
  logger.info('Jenkins', `Queueing pipeline job on ${adapter.name}`, {
    deploymentId: deployment.id,
    projectSlug: project.slug,
    commitSha: deployment.commitSha,
  })

  // 3. Queue job via adapter
  const queueResult = await adapter.queueBuild(jobParams)

  if (queueResult.success) {
    await logAuditEvent({
      userId,
      projectId: project.id,
      action: 'JENKINS_JOB_QUEUED',
      resourceType: 'deployment',
      resourceId: deployment.id,
      details: {
        jobName: queueResult.jobName,
        buildNumber: queueResult.buildNumber,
        queueId: queueResult.queueId,
        commitSha: deployment.commitSha,
      },
    })
  }

  return queueResult
}
