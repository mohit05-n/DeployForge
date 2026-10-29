/**
 * DeployForge Mock Build Worker
 *
 * Provides deterministic, isolated build execution simulation for local development,
 * UI testing, and staging environments without requiring a local Docker daemon.
 *
 * Fully respects:
 * - Resource limits and timeouts
 * - Cancellation tokens
 * - Security policy enforcement (no host socket mounts, secret stripping from build args)
 * - Immutable image tag generation
 * - Detailed structured logging
 */

import {
  BuildJob,
  BuildJobResult,
  BuildLogEntry,
  IBuildWorker,
} from './types'
import { generateImageTag } from './image-tag'
import { enforceWorkerLimits, sanitizeBuildArgs, validateMountSecurity } from './security'
import { validateBuildAndStartCommands, validateRepositoryLayout } from './detection'

export class MockBuildWorker implements IBuildWorker {
  readonly name = 'DeployForge Isolated Mock Worker'
  readonly type = 'mock' as const

  private activeJobs = new Map<string, { abortController: AbortController }>()

  async cancelBuild(jobId: string): Promise<boolean> {
    const jobRecord = this.activeJobs.get(jobId)
    if (jobRecord) {
      jobRecord.abortController.abort()
      this.activeJobs.delete(jobId)
      return true
    }
    return false
  }

  async executeBuild(job: BuildJob, cancellationSignal?: AbortSignal): Promise<BuildJobResult> {
    const startTime = Date.now()
    const logs: BuildLogEntry[] = []
    const limits = enforceWorkerLimits(job.limits)
    const abortController = new AbortController()

    this.activeJobs.set(job.id, { abortController })

    const emitLog = (level: 'INFO' | 'WARN' | 'ERROR', message: string, stage?: string) => {
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        stage: stage || 'DOCKER_BUILD',
      })
    }

    try {
      emitLog('INFO', `[IsolatedWorker] Initialized build job ${job.id} for project ${job.projectName}`)
      emitLog('INFO', `[IsolatedWorker] Resource limits: CPU=${limits.cpuLimit}, Memory=${limits.memoryLimit}, Timeout=${limits.timeoutSeconds}s, PIDs=${limits.pidsLimit}, Network=${limits.networkMode}`)

      // 1. Security Check: Validate no host socket mounts
      const securityCheck = validateMountSecurity([])
      if (!securityCheck.valid) {
        emitLog('ERROR', `[Security] Mount violation: ${securityCheck.violations.join(', ')}`)
        return this.createFailureResult(job, 'SECURITY_VIOLATION', securityCheck.violations.join('; '), logs, startTime)
      }

      // 2. Security Check: Sanitize build arguments to never bake secrets into image layers
      const { safeArgs, strippedKeys } = sanitizeBuildArgs(job.envVars, job.secrets)
      if (strippedKeys.length > 0) {
        emitLog('WARN', `[Security] Stripped sensitive keys from Docker build arguments: ${strippedKeys.join(', ')}`)
      }
      emitLog('INFO', `[Security] Allowed safe build arguments: ${Object.keys(safeArgs).length} variables configured`)

      // 3. Validation: Validate repository layout if virtual files are supplied
      if (job.files) {
        const layoutVal = validateRepositoryLayout(Object.keys(job.files))
        if (!layoutVal.valid) {
          emitLog('ERROR', `[Validation] Repository layout error: ${layoutVal.errors.join(', ')}`)
          return this.createFailureResult(job, 'INVALID_REPOSITORY_LAYOUT', layoutVal.errors.join('; '), logs, startTime)
        }
      }

      // 4. Validation: Validate build and start commands
      const cmdVal = validateBuildAndStartCommands(job.buildCommand, job.startCommand)
      if (!cmdVal.valid) {
        emitLog('ERROR', `[Validation] Command validation failed: ${cmdVal.error}`)
        return this.createFailureResult(job, 'INVALID_COMMANDS', cmdVal.error || 'Command validation failed', logs, startTime)
      }

      // 5. Validation: Reject UNKNOWN project type
      if (job.projectType === 'UNKNOWN') {
        const errMsg = 'Cannot build project: No recognized application manifests found in repository root.'
        emitLog('ERROR', `[Validation] ${errMsg}`)
        return this.createFailureResult(job, 'UNSUPPORTED_PROJECT_TYPE', errMsg, logs, startTime)
      }

      // 6. Check for immediate cancellation
      if (cancellationSignal?.aborted || abortController.signal.aborted) {
        emitLog('WARN', '[IsolatedWorker] Build cancelled by user request.')
        return this.createCancelledResult(job, logs, startTime)
      }

      // 7. Check for simulated failure trigger (e.g. branch or commit containing 'fail-build')
      if (job.branch?.includes('fail-build') || job.commitSha?.includes('fail-build')) {
        emitLog('INFO', '[Docker] Step 1/4: Compiling application container image...')
        emitLog('ERROR', '[Docker] Build process exited with error code 1: Build script exited abnormally.')
        return this.createFailureResult(job, 'BUILD_FAILED', 'Container compilation exited with non-zero exit code.', logs, startTime)
      }

      // 8. Check for simulated timeout trigger (timeoutSeconds <= 0 or flag)
      if (job.limits?.timeoutSeconds && job.limits.timeoutSeconds <= 1) {
        emitLog('ERROR', `[IsolatedWorker] Build exceeded time limit of ${job.limits.timeoutSeconds}s; process terminated.`)
        return this.createTimeoutResult(job, logs, startTime)
      }

      // 9. Simulate multi-stage build execution steps
      emitLog('INFO', `[Docker] Resolving base image for ${job.projectType}...`)
      emitLog('INFO', `[Docker] CACHE: Using cached intermediate layer for dependencies.`)
      emitLog('INFO', `[Docker] Step 1/3: FROM builder AS compilation`)
      emitLog('INFO', `[Docker] Running build command: "${job.buildCommand || 'none'}" in isolated sandbox.`)
      emitLog('INFO', `[Docker] Step 2/3: Generating isolated runtime artifact with user nextjs/app non-root privileges.`)

      // Generate unique, immutable image tag
      const imageTag = generateImageTag(job.projectSlug, job.commitSha, job.deploymentId)
      const mockDigest = `sha256:${Buffer.from(`${imageTag}-${job.id}`).toString('hex').padEnd(64, '0').slice(0, 64)}`

      emitLog('INFO', `[Docker] Step 3/3: Tagging immutable image ${imageTag}`)
      emitLog('INFO', `[Docker] Calculated OCI image digest: ${mockDigest}`)
      emitLog('INFO', `[Docker] Image layers successfully finalized (size: ~124.5 MB, layers: 7).`)
      emitLog('INFO', `[IsolatedWorker] Build job ${job.id} completed successfully in ${(Date.now() - startTime) / 1000}s.`)

      const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))

      return {
        jobId: job.id,
        deploymentId: job.deploymentId,
        success: true,
        status: 'SUCCESS',
        imageTag,
        digest: mockDigest,
        sizeBytes: 124 * 1024 * 1024 + 512 * 1024,
        layersCount: 7,
        buildDurationSeconds: durationSeconds,
        summary: `Successfully built and tagged immutable container image ${imageTag}`,
        logs,
        workerType: 'mock',
      }
    } finally {
      this.activeJobs.delete(job.id)
    }
  }

  private createFailureResult(
    job: BuildJob,
    code: string,
    message: string,
    logs: BuildLogEntry[],
    startTime: number
  ): BuildJobResult {
    const imageTag = generateImageTag(job.projectSlug, job.commitSha, job.deploymentId)
    return {
      jobId: job.id,
      deploymentId: job.deploymentId,
      success: false,
      status: 'FAILED',
      imageTag,
      buildDurationSeconds: Math.max(1, Math.round((Date.now() - startTime) / 1000)),
      summary: `Build failed: ${message}`,
      errorDetails: `[${code}] ${message}`,
      logs,
      workerType: 'mock',
    }
  }

  private createTimeoutResult(job: BuildJob, logs: BuildLogEntry[], startTime: number): BuildJobResult {
    const imageTag = generateImageTag(job.projectSlug, job.commitSha, job.deploymentId)
    return {
      jobId: job.id,
      deploymentId: job.deploymentId,
      success: false,
      status: 'TIMED_OUT',
      imageTag,
      buildDurationSeconds: Math.max(1, Math.round((Date.now() - startTime) / 1000)),
      summary: 'Build job exceeded maximum execution time limit.',
      errorDetails: 'Job was terminated because it exceeded the configured timeout threshold.',
      logs,
      workerType: 'mock',
    }
  }

  private createCancelledResult(job: BuildJob, logs: BuildLogEntry[], startTime: number): BuildJobResult {
    const imageTag = generateImageTag(job.projectSlug, job.commitSha, job.deploymentId)
    return {
      jobId: job.id,
      deploymentId: job.deploymentId,
      success: false,
      status: 'CANCELLED',
      imageTag,
      buildDurationSeconds: Math.max(1, Math.round((Date.now() - startTime) / 1000)),
      summary: 'Build was cancelled by operator.',
      errorDetails: 'Build cancelled prior to completion.',
      logs,
      workerType: 'mock',
    }
  }
}
