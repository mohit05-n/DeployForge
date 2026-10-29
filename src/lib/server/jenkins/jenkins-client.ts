/**
 * DeployForge Server-Side Jenkins Client
 *
 * Implements least-privilege REST API interaction with Jenkins controllers.
 * 
 * Supports:
 * - Environment variables: JENKINS_URL, JENKINS_JOB_NAME, JENKINS_USERNAME, JENKINS_API_TOKEN
 *   (with backwards-compatible aliases for JENKINS_SERVER_URL, JENKINS_USER, JENKINS_DEFAULT_JOB_NAME)
 * - Default internal Jenkins URL: http://jenkins:8080 (or host http://localhost:8081 if set)
 * - Default job name: DeployForge-Build
 * - Connection-status checking with distinct states: 'unconfigured' | 'reachable' | 'unreachable'
 * - Parameterized and standard job triggering with CSRF Crumb resolution
 * - Intelligent queue item polling without hanging requests indefinitely
 * - Latest build number and build status tracking
 * - Safe console log retrieval with sensible output limits and automated credential redaction
 * - Request timeouts, sanitized logging, and non-disclosure of secrets
 * - Preservation of deterministic mock mode as default
 */

import { logger } from '@/lib/server/logger'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/server/audit'
import {
  validateProjectAndCommit,
  generateCallbackToken,
  redactConsoleLogs,
} from './security'
import {
  IJenkinsAdapter,
  JenkinsJobParameters,
  JenkinsJobStatus,
  JenkinsQueueResult,
} from './types'
import { MockJenkinsAdapter } from './mock-adapter'

export type JenkinsConnectionState = 'unconfigured' | 'reachable' | 'unreachable'

export interface JenkinsConnectionStatus {
  status: JenkinsConnectionState
  configured: boolean
  reachable: boolean
  authenticated: boolean
  isSimulated: boolean
  serverUrl: string
  jobName: string
  version?: string
  message: string
  timestamp: string
  jobExists?: boolean
  latestBuildNumber?: number
}

export interface JenkinsConsoleLogResult {
  jobName: string
  buildNumber: number
  text: string
  hasMore: boolean
  nextOffset: number
  isSimulated: boolean
  totalLength?: number
}

export class JenkinsClient {
  private static instance: JenkinsClient
  private mockAdapter: MockJenkinsAdapter

  constructor() {
    this.mockAdapter = new MockJenkinsAdapter()
  }

  public static getInstance(): JenkinsClient {
    if (!JenkinsClient.instance) {
      JenkinsClient.instance = new JenkinsClient()
    }
    return JenkinsClient.instance
  }

  /**
   * Resolves the configured Jenkins URL.
   * Defaults to internal container URL http://jenkins:8080 if not set.
   */
  public get url(): string {
    const raw = process.env.JENKINS_URL || process.env.JENKINS_SERVER_URL || 'http://jenkins:8080'
    let resolved = raw.replace(/\/$/, '')
    // On Windows Node.js (v18+), fetch('http://localhost:8081') resolves localhost to IPv6 ::1
    // whereas Docker container ports on Windows are bound to 127.0.0.1 (IPv4).
    // Normalize localhost to 127.0.0.1 when running outside Docker to prevent ECONNREFUSED.
    if (resolved.startsWith('http://localhost:')) {
      resolved = resolved.replace('http://localhost:', 'http://127.0.0.1:')
    }
    return resolved
  }

  /**
   * Resolves the configured Jenkins target job name.
   * Defaults to DeployForge-Build.
   */
  public get jobName(): string {
    return process.env.JENKINS_JOB_NAME || process.env.JENKINS_DEFAULT_JOB_NAME || 'DeployForge-Build'
  }

  /**
   * Resolves the configured Jenkins username.
   */
  private get username(): string {
    return (process.env.JENKINS_USERNAME || process.env.JENKINS_USER || '').trim()
  }

  /**
   * Resolves the configured Jenkins API token.
   */
  private get apiToken(): string {
    return (process.env.JENKINS_API_TOKEN || '').trim()
  }

  /**
   * Returns whether real Jenkins is explicitly activated.
   */
  public get isRealEnabled(): boolean {
    if (process.env.ENABLE_REAL_JENKINS === 'true') {
      return true
    }
    if (process.env.BUILD_RUNNER_TYPE === 'jenkins') {
      return true
    }
    if (process.env.BUILD_RUNNER_TYPE === 'mock' || process.env.ENABLE_REAL_JENKINS === 'false') {
      return false
    }
    return this.isConfigured
  }

  /**
   * Checks whether the necessary authentication credentials are provided.
   */
  public get isConfigured(): boolean {
    return Boolean(this.url && this.username && this.apiToken)
  }

  /**
   * Returns a sanitized view of configuration (no secrets exposed).
   */
  public getConfigurationSummary() {
    return {
      serverUrl: this.url,
      jobName: this.jobName,
      usernameConfigured: Boolean(this.username),
      apiTokenConfigured: Boolean(this.apiToken),
      isConfigured: this.isConfigured,
      isRealEnabled: this.isRealEnabled,
      isSimulated: !this.isRealEnabled,
    }
  }

  /**
   * Safely formats Basic Auth header.
   */
  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.username}:${this.apiToken}`).toString('base64')}`
  }

  /**
   * Retrieves CSRF Crumb from Jenkins for safe mutation operations.
   */
  private async getCrumb(timeoutMs = 4000): Promise<{ field: string; value: string } | null> {
    if (!this.isConfigured) return null

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const res = await fetch(`${this.url}/crumbIssuer/api/json`, {
        headers: { Authorization: this.authHeader },
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) return null
      const data = await res.json()
      return { field: data.crumbRequestField, value: data.crumb }
    } catch {
      return null
    }
  }

  /**
   * Distinguishes connection status among: 'unconfigured' | 'reachable' | 'unreachable'
   * Also verifies whether the target job exists and inspects the latest build number.
   */
  public async getConnectionStatus(timeoutMs = 5000): Promise<JenkinsConnectionStatus> {
    const timestamp = new Date().toISOString()

    // 1. Check if unconfigured
    if (!this.isConfigured) {
      return {
        status: 'unconfigured',
        configured: false,
        reachable: false,
        authenticated: false,
        isSimulated: !this.isRealEnabled,
        serverUrl: this.url,
        jobName: this.jobName,
        message: 'Jenkins credentials unconfigured. Set JENKINS_URL, JENKINS_USERNAME, and JENKINS_API_TOKEN in environment.',
        timestamp,
      }
    }

    // 2. Credentials exist: Probe connectivity & authentication
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const res = await fetch(`${this.url}/api/json`, {
        headers: { Authorization: this.authHeader },
        signal: controller.signal,
      })
      clearTimeout(timer)

      const versionHeader = res.headers.get('x-jenkins') || undefined

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'unreachable',
          configured: true,
          reachable: false,
          authenticated: false,
          isSimulated: !this.isRealEnabled,
          serverUrl: this.url,
          jobName: this.jobName,
          version: versionHeader,
          message: `Jenkins authentication failed: Invalid credentials (HTTP ${res.status}). Verify JENKINS_USERNAME and JENKINS_API_TOKEN.`,
          timestamp,
        }
      }

      if (!res.ok) {
        return {
          status: 'unreachable',
          configured: true,
          reachable: false,
          authenticated: false,
          isSimulated: !this.isRealEnabled,
          serverUrl: this.url,
          jobName: this.jobName,
          version: versionHeader,
          message: `Jenkins returned unexpected HTTP status ${res.status}.`,
          timestamp,
        }
      }

      // Check configured job existence
      let jobExists = false
      let latestBuildNumber: number | undefined

      try {
        const jobCtrl = new AbortController()
        const jobTimer = setTimeout(() => jobCtrl.abort(), 3000)
        const jobRes = await fetch(`${this.url}/job/${encodeURIComponent(this.jobName)}/api/json`, {
          headers: { Authorization: this.authHeader },
          signal: jobCtrl.signal,
        })
        clearTimeout(jobTimer)

        if (jobRes.ok) {
          jobExists = true
          const jobData = await jobRes.json()
          latestBuildNumber = jobData.lastBuild?.number || (jobData.builds?.[0]?.number ?? 0)
        }
      } catch {
        // Job check failed non-critically
      }

      return {
        status: 'reachable',
        configured: true,
        reachable: true,
        authenticated: true,
        isSimulated: !this.isRealEnabled,
        serverUrl: this.url,
        jobName: this.jobName,
        version: versionHeader,
        jobExists,
        latestBuildNumber,
        message: jobExists
          ? `Connected to Jenkins controller${versionHeader ? ` v${versionHeader}` : ''} at ${this.url}. Job "${this.jobName}" ready (Latest Build: #${latestBuildNumber || 0}).`
          : `Connected to Jenkins controller${versionHeader ? ` v${versionHeader}` : ''} at ${this.url}. Note: Job "${this.jobName}" not found.`,
        timestamp,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        status: 'unreachable',
        configured: true,
        reachable: false,
        authenticated: false,
        isSimulated: !this.isRealEnabled,
        serverUrl: this.url,
        jobName: this.jobName,
        message: `Failed to connect to Jenkins at ${this.url}: ${errMsg}`,
        timestamp,
      }
    }
  }

  /**
   * Triggers a Jenkins job execution.
   * Automatically polls the queue location without hanging the request indefinitely.
   */
  public async triggerJob(
    jobName?: string,
    params?: Partial<JenkinsJobParameters> & Record<string, any>,
    options?: { timeoutMs?: number; forceMock?: boolean }
  ): Promise<JenkinsQueueResult> {
    const targetJob = jobName || this.jobName
    const useMock = options?.forceMock || !this.isRealEnabled || !this.isConfigured

    // Format normalized parameters
    const normalizedParams: JenkinsJobParameters = {
      DEPLOYMENT_ID: params?.DEPLOYMENT_ID || `deploy-${Date.now().toString(36)}`,
      PROJECT_ID: params?.PROJECT_ID || 'proj-default',
      PROJECT_SLUG: params?.PROJECT_SLUG || 'app',
      PROJECT_NAME: params?.PROJECT_NAME || 'DeployForge App',
      REPO_URL: params?.REPO_URL || 'https://github.com/mohit05-n/DeployForge',
      BRANCH: params?.BRANCH || 'main',
      COMMIT_SHA: params?.COMMIT_SHA || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4',
      PROJECT_TYPE: params?.PROJECT_TYPE || 'NODEJS_NEXTJS',
      BUILD_COMMAND: params?.BUILD_COMMAND || 'npm run build',
      START_COMMAND: params?.START_COMMAND || 'npm start',
      PORT: params?.PORT || 3000,
      DOCKERFILE_PATH: params?.DOCKERFILE_PATH || 'Dockerfile',
      REQUIRE_APPROVAL: params?.REQUIRE_APPROVAL === true,
      CALLBACK_URL: params?.CALLBACK_URL || `${process.env.APP_URL || 'http://localhost:3000'}/api/webhooks/jenkins`,
      CALLBACK_TOKEN: params?.CALLBACK_TOKEN || 'token-simulated',
    }

    if (useMock) {
      logger.info('JenkinsClient', `Triggering mock Jenkins job: ${targetJob}`, {
        deploymentId: normalizedParams.DEPLOYMENT_ID,
        isSimulated: true,
      })
      const res = await this.mockAdapter.queueBuild(normalizedParams)
      return {
        ...res,
        jobName: targetJob,
        isSimulated: true,
      }
    }

    // Real Jenkins execution
    const timeoutMs = options?.timeoutMs || 8000
    try {
      const crumb = await this.getCrumb(timeoutMs)
      const headers: Record<string, string> = {
        Authorization: this.authHeader,
      }
      if (crumb) {
        headers[crumb.field] = crumb.value
      }

      // Check if job exists
      const jobCheckRes = await fetch(`${this.url}/job/${encodeURIComponent(targetJob)}/api/json`, {
        headers: { Authorization: this.authHeader },
      })
      if (jobCheckRes.status === 404) {
        return {
          success: false,
          jobName: targetJob,
          error: `Job "${targetJob}" was not found on Jenkins controller.`,
          isSimulated: false,
        }
      }

      let res: Response
      const hasCustomParams = Boolean(params && Object.keys(params).length > 0)

      if (hasCustomParams) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        const queryParams = new URLSearchParams()
        for (const [k, v] of Object.entries(normalizedParams)) {
          if (v !== undefined && v !== null) {
            queryParams.set(k, String(v))
          }
        }

        const endpoint = `${this.url}/job/${encodeURIComponent(targetJob)}/buildWithParameters?${queryParams.toString()}`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)

        res = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
        })
        clearTimeout(timer)

        // If parameterized trigger fails because job has no parameters defined, fallback to standard build
        if (res.status === 400 || res.status === 405) {
          const fallbackCtrl = new AbortController()
          const fallbackTimer = setTimeout(() => fallbackCtrl.abort(), timeoutMs)
          delete headers['Content-Type']
          res = await fetch(`${this.url}/job/${encodeURIComponent(targetJob)}/build`, {
            method: 'POST',
            headers,
            signal: fallbackCtrl.signal,
          })
          clearTimeout(fallbackTimer)
        }
      } else {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        res = await fetch(`${this.url}/job/${encodeURIComponent(targetJob)}/build`, {
          method: 'POST',
          headers,
          signal: controller.signal,
        })
        clearTimeout(timer)
      }

      if (res.status === 201 || res.status === 200) {
        const queueLocation = res.headers.get('location') || ''
        const queueMatch = queueLocation.match(/queue\/item\/(\d+)\//)
        const queueId = queueMatch ? parseInt(queueMatch[1], 10) : undefined

        logger.info('JenkinsClient', `Real Jenkins job queued: ${targetJob}`, {
          queueId,
          queueLocation,
        })

        // Poll queue item briefly (up to 2.5s) to resolve the build number without blocking indefinitely
        let allocatedBuildNumber: number | undefined
        if (queueId) {
          for (let i = 0; i < 5; i++) {
            await new Promise((r) => setTimeout(r, 450))
            try {
              const qRes = await fetch(`${this.url}/queue/item/${queueId}/api/json`, {
                headers: { Authorization: this.authHeader },
              })
              if (qRes.ok) {
                const qData = await qRes.json()
                if (qData.executable?.number) {
                  allocatedBuildNumber = qData.executable.number
                  break
                }
              }
            } catch {
              break
            }
          }
        }

        return {
          success: true,
          jobName: targetJob,
          queueId,
          buildNumber: allocatedBuildNumber,
          url: allocatedBuildNumber
            ? `${this.url}/job/${targetJob}/${allocatedBuildNumber}/`
            : queueLocation || `${this.url}/job/${targetJob}/`,
          isSimulated: false,
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          jobName: targetJob,
          error: `Jenkins authentication failed: Invalid credentials (HTTP ${res.status}).`,
          isSimulated: false,
        }
      }

      return {
        success: false,
        jobName: targetJob,
        error: `Jenkins returned HTTP ${res.status}: ${res.statusText}`,
        isSimulated: false,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error('JenkinsClient', `Failed to queue build on real Jenkins`, err, { jobName: targetJob })
      return {
        success: false,
        jobName: targetJob,
        error: `Jenkins request failed: ${errMsg}`,
        isSimulated: false,
      }
    }
  }

  /**
   * Retrieves build status and details from Jenkins.
   * If buildNumber is 'latest' or omitted, resolves the latest build number for the job.
   */
  public async getBuildStatus(
    jobName?: string,
    buildNumber?: number | 'latest',
    queueId?: number
  ): Promise<JenkinsJobStatus & { message?: string }> {
    const targetJob = jobName || this.jobName

    if (!this.isRealEnabled || !this.isConfigured) {
      const targetBuild = typeof buildNumber === 'number' && buildNumber > 0 ? buildNumber : 101
      return this.mockAdapter.getJobStatus(targetJob, targetBuild)
    }

    try {
      // If queueId is given without buildNumber, inspect queue item
      if (queueId && (!buildNumber || buildNumber === 'latest')) {
        const queueRes = await fetch(`${this.url}/queue/item/${queueId}/api/json`, {
          headers: { Authorization: this.authHeader },
        })
        if (queueRes.ok) {
          const queueData = await queueRes.json()
          if (queueData.executable?.number) {
            return this.getBuildStatus(targetJob, queueData.executable.number)
          }
          if (queueData.cancelled) {
            return {
              jobName: targetJob,
              buildNumber: 0,
              status: 'ABORTED',
              durationMs: 0,
              url: `${this.url}/queue/item/${queueId}/`,
              currentStage: 'Cancelled in queue',
              message: 'Build was cancelled from the Jenkins queue.',
            }
          }
          return {
            jobName: targetJob,
            buildNumber: 0,
            status: 'QUEUED',
            durationMs: 0,
            url: `${this.url}/queue/item/${queueId}/`,
            currentStage: queueData.why || 'Enqueued in build queue',
            message: queueData.why || 'Waiting for an available executor.',
          }
        }
      }

      // Check if job exists and resolve 'latest' buildNumber
      let targetBuild = buildNumber
      if (!targetBuild || targetBuild === 'latest') {
        const jobRes = await fetch(`${this.url}/job/${encodeURIComponent(targetJob)}/api/json`, {
          headers: { Authorization: this.authHeader },
        })
        if (jobRes.status === 404) {
          throw new Error(`Job "${targetJob}" not found on Jenkins controller.`)
        }
        if (!jobRes.ok) {
          throw new Error(`Failed to query job "${targetJob}" (HTTP ${jobRes.status}).`)
        }
        const jobData = await jobRes.json()
        const resolved = jobData.lastBuild?.number || jobData.builds?.[0]?.number
        if (!resolved) {
          if (jobData.inQueue) {
            return {
              jobName: targetJob,
              buildNumber: 0,
              status: 'QUEUED',
              durationMs: 0,
              url: `${this.url}/job/${targetJob}/`,
              currentStage: 'Enqueued',
              message: 'Build is currently queued.',
            }
          }
          return {
            jobName: targetJob,
            buildNumber: 0,
            status: 'QUEUED',
            durationMs: 0,
            url: `${this.url}/job/${targetJob}/`,
            currentStage: 'Pending',
            message: 'No builds recorded yet for this job.',
          }
        }
        targetBuild = resolved
      }

      const parsedNum = typeof targetBuild === 'string' ? parseInt(targetBuild, 10) : (targetBuild || 0)
      if (isNaN(parsedNum) || parsedNum <= 0) {
        throw new Error(`Invalid build number: "${targetBuild}". Must be a positive integer.`)
      }
      const num: number = parsedNum

      const res = await fetch(`${this.url}/job/${encodeURIComponent(targetJob)}/${num}/api/json`, {
        headers: { Authorization: this.authHeader },
      })

      if (res.status === 404) {
        throw new Error(`Build #${num} does not exist for job "${targetJob}".`)
      }

      if (!res.ok) {
        return {
          jobName: targetJob,
          buildNumber: num,
          status: 'QUEUED',
          durationMs: 0,
          url: `${this.url}/job/${targetJob}/${num}/`,
        }
      }

      const data = await res.json()
      let status: JenkinsJobStatus['status'] = 'BUILDING'
      if (data.building) {
        status = 'BUILDING'
      } else if (data.result === 'SUCCESS') {
        status = 'SUCCESS'
      } else if (data.result === 'FAILURE') {
        status = 'FAILURE'
      } else if (data.result === 'ABORTED') {
        status = 'ABORTED'
      }

      return {
        jobName: targetJob,
        buildNumber: num,
        status,
        durationMs: data.duration || 0,
        url: data.url || `${this.url}/job/${targetJob}/${num}/`,
        currentStage: status === 'BUILDING' ? 'Pipeline in progress' : undefined,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        jobName: targetJob,
        buildNumber: 0,
        status: 'FAILURE',
        durationMs: 0,
        url: `${this.url}/job/${targetJob}/`,
        message: errMsg,
      }
    }
  }

  /**
   * Retrieves sanitized console log text with automated secret redaction and sensible limits.
   */
  public async getConsoleOutput(
    jobName?: string,
    buildNumber?: number | 'latest',
    offset = 0,
    maxLines = 200
  ): Promise<JenkinsConsoleLogResult> {
    const targetJob = jobName || this.jobName

    if (!this.isRealEnabled || !this.isConfigured) {
      const targetBuild = typeof buildNumber === 'number' && buildNumber > 0 ? buildNumber : 101
      const mockStatus = await this.mockAdapter.getJobStatus(targetJob, targetBuild)
      const logs = (mockStatus.logs || []).join('\n')
      return {
        jobName: targetJob,
        buildNumber: targetBuild,
        text: redactConsoleLogs(logs),
        hasMore: false,
        nextOffset: logs.length,
        isSimulated: true,
        totalLength: logs.length,
      }
    }

    try {
      // Resolve latest build number if needed
      let num = buildNumber
      if (!num || num === 'latest') {
        const jobRes = await fetch(`${this.url}/job/${encodeURIComponent(targetJob)}/api/json`, {
          headers: { Authorization: this.authHeader },
        })
        if (jobRes.status === 404) {
          throw new Error(`Job "${targetJob}" not found.`)
        }
        const jobData = await jobRes.json()
        num = jobData.lastBuild?.number || jobData.builds?.[0]?.number
        if (!num) {
          return {
            jobName: targetJob,
            buildNumber: 0,
            text: '[DeployForge] No build runs recorded yet for this job.',
            hasMore: false,
            nextOffset: 0,
            isSimulated: false,
          }
        }
      }

      const parsedNum = typeof num === 'string' ? parseInt(num, 10) : num
      if (isNaN(parsedNum) || parsedNum <= 0) {
        throw new Error(`Invalid build number: "${num}". Must be a positive integer.`)
      }

      const url = `${this.url}/job/${encodeURIComponent(targetJob)}/${parsedNum}/logText/progressiveText?start=${offset}`
      const res = await fetch(url, {
        headers: { Authorization: this.authHeader },
      })

      if (res.status === 404) {
        return {
          jobName: targetJob,
          buildNumber: parsedNum,
          text: `[DeployForge] Console output not found for build #${parsedNum} of job "${targetJob}".`,
          hasMore: false,
          nextOffset: offset,
          isSimulated: false,
        }
      }

      if (!res.ok) {
        return {
          jobName: targetJob,
          buildNumber: parsedNum,
          text: `[DeployForge] Failed to retrieve logs from Jenkins (HTTP ${res.status}: ${res.statusText}).`,
          hasMore: false,
          nextOffset: offset,
          isSimulated: false,
        }
      }

      const rawText = await res.text()
      const hasMore = res.headers.get('x-more-data') === 'true'
      const nextOffset = parseInt(res.headers.get('x-text-size') || String(offset + rawText.length), 10)

      // Apply sensible line limit (tail last maxLines if log is very long)
      let lines = rawText.split('\n')
      let truncated = false
      if (lines.length > maxLines) {
        lines = lines.slice(-maxLines)
        truncated = true
      }
      const processedText = (truncated ? `[DeployForge] ... (older logs truncated, showing latest ${maxLines} lines) ...\n` : '') + lines.join('\n')

      return {
        jobName: targetJob,
        buildNumber: parsedNum,
        text: redactConsoleLogs(processedText),
        hasMore,
        nextOffset,
        isSimulated: false,
        totalLength: rawText.length,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        jobName: targetJob,
        buildNumber: 0,
        text: `[DeployForge] Log retrieval error: ${errMsg}`,
        hasMore: false,
        nextOffset: offset,
        isSimulated: false,
      }
    }
  }

  /**
   * Cancels a running Jenkins build.
   */
  public async cancelBuild(jobName?: string, buildNumber?: number): Promise<boolean> {
    const targetJob = jobName || this.jobName
    const targetBuild = buildNumber || 1

    if (!this.isRealEnabled || !this.isConfigured) {
      return this.mockAdapter.cancelJob(targetJob, targetBuild)
    }

    try {
      const crumb = await this.getCrumb()
      const headers: Record<string, string> = { Authorization: this.authHeader }
      if (crumb) headers[crumb.field] = crumb.value

      const res = await fetch(`${this.url}/job/${encodeURIComponent(targetJob)}/${targetBuild}/stop`, {
        method: 'POST',
        headers,
      })
      return res.ok || res.status === 302
    } catch {
      return false
    }
  }

  /**
   * High-level workflow: Validates project access, creates or updates deployment record,
   * dispatches the Jenkins build, and logs audit events.
   */
  public async triggerDeploymentForUser(
    deploymentId: string,
    userId: string,
    options?: {
      jobName?: string
      forceMock?: boolean
      requireApproval?: boolean
    }
  ): Promise<JenkinsQueueResult> {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: true,
      },
    })

    if (!deployment) {
      return {
        success: false,
        jobName: options?.jobName || this.jobName,
        error: `Deployment record "${deploymentId}" was not found.`,
        isSimulated: !this.isRealEnabled,
      }
    }

    // 1. Validate project ownership and commit SHA
    const authVal = await validateProjectAndCommit(deployment.projectId, deployment.commitSha, userId)
    if (!authVal.valid || !authVal.project) {
      return {
        success: false,
        jobName: options?.jobName || this.jobName,
        error: authVal.error || 'Project authorization failed.',
        isSimulated: !this.isRealEnabled,
      }
    }

    const project = authVal.project
    const targetJob = options?.jobName || this.jobName
    const callbackUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/webhooks/jenkins`
    const callbackToken = generateCallbackToken(deployment.id, project.id)

    // 2. Queue build through Jenkins client
    const queueResult = await this.triggerJob(
      targetJob,
      {
        DEPLOYMENT_ID: deployment.id,
        PROJECT_ID: project.id,
        PROJECT_SLUG: project.slug,
        PROJECT_NAME: project.name,
        REPO_URL: project.repository,
        BRANCH: deployment.branch,
        COMMIT_SHA: deployment.commitSha,
        PROJECT_TYPE: project.dockerfilePath ? 'DOCKERFILE_CUSTOM' : 'NODEJS_NEXTJS',
        BUILD_COMMAND: project.buildCommand || 'npm run build',
        START_COMMAND: project.startCommand || 'npm start',
        PORT: project.port || 3000,
        DOCKERFILE_PATH: project.dockerfilePath || 'Dockerfile',
        REQUIRE_APPROVAL: options?.requireApproval === true,
        CALLBACK_URL: callbackUrl,
        CALLBACK_TOKEN: callbackToken,
      },
      { forceMock: options?.forceMock }
    )

    // 3. Update deployment logs & stage
    if (queueResult.success) {
      await prisma.deploymentLog.create({
        data: {
          deploymentId: deployment.id,
          stageName: 'DOCKER_BUILD',
          level: 'INFO',
          message: `Jenkins job ${targetJob} triggered (Queue ID: ${queueResult.queueId || 'simulated'}, Mode: ${queueResult.isSimulated ? 'Mock' : 'Real'}).`,
        },
      })

      await logAuditEvent({
        userId,
        projectId: project.id,
        action: 'JENKINS_BUILD_TRIGGERED',
        resourceType: 'deployment',
        resourceId: deployment.id,
        details: {
          jobName: targetJob,
          queueId: queueResult.queueId,
          buildNumber: queueResult.buildNumber,
          isSimulated: queueResult.isSimulated,
          commitSha: deployment.commitSha,
        },
      })
    }

    return queueResult
  }
}

export const jenkinsClient = JenkinsClient.getInstance()
