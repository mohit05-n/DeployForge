/**
 * DeployForge Mock Jenkins Pipeline Adapter
 *
 * Provides safe, deterministic simulation of Jenkins CI/CD pipeline runs for
 * local development, UI testing, and automated integration tests without
 * requiring a live Jenkins cluster.
 */

import {
  IJenkinsAdapter,
  JenkinsJobParameters,
  JenkinsJobStatus,
  JenkinsQueueResult,
} from './types'

export class MockJenkinsAdapter implements IJenkinsAdapter {
  readonly name = 'DeployForge Mock Jenkins Pipeline Adapter'
  readonly isSimulated = true

  private jobs = new Map<string, JenkinsJobStatus>()
  private nextBuildNumber = 101

  async testConnection(): Promise<{ connected: boolean; version: string; message: string; isSimulated: boolean }> {
    return {
      connected: true,
      version: '2.580.2-simulated',
      message: 'Jenkins server simulation active with isolated build agents.',
      isSimulated: true,
    }
  }

  async queueBuild(params: JenkinsJobParameters): Promise<JenkinsQueueResult> {
    const jobName = `deployforge-pipeline-${params.PROJECT_SLUG}`
    const buildNumber = this.nextBuildNumber++
    const jobKey = `${jobName}#${buildNumber}`
    const queueId = 1000 + buildNumber
    const shortSha = params.COMMIT_SHA.slice(0, 7)
    const shortDep = params.DEPLOYMENT_ID.slice(-10)
    const imageTag = `deployforge/${params.PROJECT_SLUG}:${shortSha}-${shortDep}`

    // Check for simulated failure trigger
    const willFail = params.BRANCH.includes('fail-jenkins') || params.COMMIT_SHA.includes('fail-jenkins')

    const initialStatus: JenkinsJobStatus = {
      jobName,
      buildNumber,
      status: 'QUEUED',
      durationMs: 0,
      url: `http://127.0.0.1:8081/job/${jobName}/${buildNumber}/`,
      currentStage: 'Checkout & Validation',
      logs: [
        `[Jenkins] Build #${buildNumber} enqueued for deployment ${params.DEPLOYMENT_ID}`,
        `[Jenkins] Running on unprivileged agent: untrusted-build-agent-01`,
        `[Jenkins] Target commit: ${params.COMMIT_SHA} on branch ${params.BRANCH}`,
      ],
    }

    this.jobs.set(jobKey, initialStatus)

    // Simulate asynchronous pipeline progression
    setTimeout(() => {
      const job = this.jobs.get(jobKey)
      if (job && job.status !== 'ABORTED') {
        job.status = willFail ? 'FAILURE' : 'SUCCESS'
        job.durationMs = 45000
        job.currentStage = willFail ? 'Tests & Quality' : 'Health Verification'
        job.logs?.push(
          `[Jenkins] Stage Checkout & Validation: SCM sync verified at ${shortSha}.`,
          `[Jenkins] Stage Tests & Quality: executed command "${params.BUILD_COMMAND}".`,
          willFail
            ? '[Jenkins] ERROR: Tests failed with exit code 1. Halting pipeline.'
            : `[Jenkins] Stage Docker Build: Image tagged as ${imageTag}.`,
          willFail
            ? '[Jenkins] Pipeline finished with outcome FAILURE.'
            : '[Jenkins] Stage Trivy Security Scan: 0 critical vulnerabilities found.',
          willFail
            ? '[Jenkins] Build failed.'
            : `[Jenkins] Stage Image Publication: Published ${imageTag} to container registry.`,
          willFail
            ? ''
            : `[Jenkins] Stage Health Verification: Verified contract on port ${params.PORT}.`
        )
      }
    }, 100)

    return {
      success: true,
      jobName,
      queueId,
      buildNumber,
      url: initialStatus.url,
      isSimulated: true,
    }
  }

  async getJobStatus(jobName: string, buildNumber: number): Promise<JenkinsJobStatus> {
    const jobKey = `${jobName}#${buildNumber}`
    const job = this.jobs.get(jobKey)

    if (job) {
      return job
    }

    return {
      jobName,
      buildNumber,
      status: 'SUCCESS',
      durationMs: 42000,
      url: `http://127.0.0.1:8081/job/${jobName}/${buildNumber}/`,
      currentStage: 'Complete',
      logs: [`[Jenkins] Build #${buildNumber} finished successfully.`],
    }
  }

  async cancelJob(jobName: string, buildNumber: number): Promise<boolean> {
    const jobKey = `${jobName}#${buildNumber}`
    const job = this.jobs.get(jobKey)
    if (job) {
      job.status = 'ABORTED'
      job.logs?.push(`[Jenkins] Build #${buildNumber} was aborted by operator request.`)
      return true
    }
    return true
  }
}
