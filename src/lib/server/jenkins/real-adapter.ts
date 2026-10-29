/**
 * DeployForge Real Jenkins REST API Adapter
 *
 * Interfaces with a real Jenkins controller (such as 2.580.2 LTS on http://127.0.0.1:8081)
 * using a dedicated service account and least-privilege API token.
 *
 * Features:
 * - Automated CSRF Crumb retrieval and injection
 * - Parameterized build queueing (/job/:name/buildWithParameters)
 * - Build status polling and abort handling (/job/:name/:num/stop)
 * - Safe error handling with timeout protection
 */

import {
  IJenkinsAdapter,
  JenkinsJobParameters,
  JenkinsJobStatus,
  JenkinsQueueResult,
} from './types'

export class RealJenkinsAdapter implements IJenkinsAdapter {
  readonly name = 'DeployForge Real Jenkins REST Adapter'
  readonly isSimulated = false

  private get baseUrl(): string {
    const raw = process.env.JENKINS_URL || process.env.JENKINS_SERVER_URL || 'http://127.0.0.1:8081'
    let resolved = raw.replace(/\/$/, '')
    if (resolved.startsWith('http://localhost:')) {
      resolved = resolved.replace('http://localhost:', 'http://127.0.0.1:')
    }
    return resolved
  }

  private get authHeader(): string {
    const user = process.env.JENKINS_USERNAME || process.env.JENKINS_USER || 'admin'
    const token = process.env.JENKINS_API_TOKEN || ''
    return `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`
  }

  /**
   * Fetches CSRF Crumb for Jenkins POST requests.
   */
  private async getCrumb(): Promise<{ field: string; value: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/crumbIssuer/api/json`, {
        headers: { Authorization: this.authHeader },
      })
      if (!res.ok) return null
      const data = await res.json()
      return { field: data.crumbRequestField, value: data.crumb }
    } catch {
      return null
    }
  }

  async testConnection(): Promise<{ connected: boolean; version?: string; message: string; isSimulated: boolean }> {
    const isRealEnabled = process.env.ENABLE_REAL_JENKINS === 'true'
    if (!isRealEnabled) {
      return {
        connected: false,
        message: 'Real Jenkins adapter is disabled. Set ENABLE_REAL_JENKINS=true to connect to live Jenkins controller.',
        isSimulated: true,
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(`${this.baseUrl}/api/json`, {
        headers: { Authorization: this.authHeader },
        signal: controller.signal,
      })
      clearTimeout(timer)

      const jenkinsVersion = res.headers.get('x-jenkins') || '2.580.2'

      if (res.status === 401 || res.status === 403) {
        return {
          connected: false,
          version: jenkinsVersion,
          message: `Jenkins responded with ${res.status} Authentication Failed. Check JENKINS_USER and JENKINS_API_TOKEN.`,
          isSimulated: false,
        }
      }

      return {
        connected: res.ok,
        version: jenkinsVersion,
        message: res.ok
          ? `Successfully connected to Jenkins controller v${jenkinsVersion} at ${this.baseUrl}.`
          : `Jenkins responded with HTTP ${res.status}.`,
        isSimulated: false,
      }
    } catch (err) {
      return {
        connected: false,
        message: `Failed to connect to Jenkins controller at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        isSimulated: false,
      }
    }
  }

  async queueBuild(params: JenkinsJobParameters): Promise<JenkinsQueueResult> {
    const isRealEnabled = process.env.ENABLE_REAL_JENKINS === 'true'
    if (!isRealEnabled) {
      return {
        success: false,
        jobName: params.PROJECT_SLUG,
        error: 'Real Jenkins dispatch is disabled. Enable via ENABLE_REAL_JENKINS=true or use mock adapter.',
        isSimulated: true,
      }
    }

    const jobName = process.env.JENKINS_DEFAULT_JOB_NAME || `deployforge-pipeline-${params.PROJECT_SLUG}`
    const crumb = await this.getCrumb()

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    if (crumb) {
      headers[crumb.field] = crumb.value
    }

    const queryParams = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      queryParams.set(k, String(v))
    }

    try {
      const url = `${this.baseUrl}/job/${encodeURIComponent(jobName)}/buildWithParameters?${queryParams.toString()}`
      const res = await fetch(url, {
        method: 'POST',
        headers,
      })

      if (res.status === 201 || res.status === 200) {
        const queueLocation = res.headers.get('location') || ''
        const queueMatch = queueLocation.match(/queue\/item\/(\d+)\//)
        const queueId = queueMatch ? parseInt(queueMatch[1], 10) : undefined

        return {
          success: true,
          jobName,
          queueId,
          url: queueLocation || `${this.baseUrl}/job/${jobName}/`,
          isSimulated: false,
        }
      }

      return {
        success: false,
        jobName,
        error: `Jenkins returned HTTP ${res.status}: ${res.statusText}`,
        isSimulated: false,
      }
    } catch (err) {
      return {
        success: false,
        jobName,
        error: `Failed to queue build on Jenkins: ${err instanceof Error ? err.message : String(err)}`,
        isSimulated: false,
      }
    }
  }

  async getJobStatus(jobName: string, buildNumber: number): Promise<JenkinsJobStatus> {
    const url = `${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/api/json`
    try {
      const res = await fetch(url, {
        headers: { Authorization: this.authHeader },
      })
      if (!res.ok) {
        return {
          jobName,
          buildNumber,
          status: 'QUEUED',
          durationMs: 0,
          url: `${this.baseUrl}/job/${jobName}/${buildNumber}/`,
        }
      }

      const data = await res.json()
      let status: JenkinsJobStatus['status'] = 'BUILDING'
      if (data.result === 'SUCCESS') status = 'SUCCESS'
      else if (data.result === 'FAILURE') status = 'FAILURE'
      else if (data.result === 'ABORTED') status = 'ABORTED'

      return {
        jobName,
        buildNumber,
        status,
        durationMs: data.duration || 0,
        url: data.url || `${this.baseUrl}/job/${jobName}/${buildNumber}/`,
      }
    } catch {
      return {
        jobName,
        buildNumber,
        status: 'QUEUED',
        durationMs: 0,
        url: `${this.baseUrl}/job/${jobName}/${buildNumber}/`,
      }
    }
  }

  async cancelJob(jobName: string, buildNumber: number): Promise<boolean> {
    const crumb = await this.getCrumb()
    const headers: Record<string, string> = { Authorization: this.authHeader }
    if (crumb) headers[crumb.field] = crumb.value

    try {
      const res = await fetch(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/stop`, {
        method: 'POST',
        headers,
      })
      return res.ok || res.status === 302
    } catch {
      return false
    }
  }
}
