import { ApiResponse } from '@/types'

export interface JenkinsStatusResponse {
  status: 'unconfigured' | 'reachable' | 'unreachable'
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

export interface JenkinsTriggerResponse {
  success: boolean
  deploymentId?: string
  jobName: string
  queueId?: number
  buildNumber?: number
  status?: string
  url?: string
  isSimulated: boolean
  message: string
}

export interface JenkinsBuildResponse {
  jobName: string
  buildNumber: number
  status: 'QUEUED' | 'BUILDING' | 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'PENDING'
  durationMs: number
  estimatedDuration?: number
  url: string
  isSimulated: boolean
  currentStage?: string
  timestamp?: string
  message?: string
}

export interface JenkinsConsoleResponse {
  jobName: string
  buildNumber: number
  text: string
  hasMore: boolean
  nextOffset: number
  isSimulated: boolean
  totalLength?: number
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<{ data: T | null; error?: string }> {
  try {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok || json.success === false) {
      const errorMessage = json.error?.message || json.message || `Request failed with status ${res.status}`
      return { data: null, error: errorMessage }
    }

    return { data: json.data !== undefined ? json.data : json }
  } catch (err) {
    return { data: null, error: (err as Error).message || 'Network error' }
  }
}

class JenkinsClientService {
  async getStatus(): Promise<{ data: JenkinsStatusResponse | null; error?: string }> {
    return apiFetch<JenkinsStatusResponse>('/api/integrations/jenkins/status')
  }

  async triggerBuild(payload?: {
    projectId?: string
    deploymentId?: string
    branch?: string
    commitSha?: string
    jobName?: string
  }): Promise<{ data: JenkinsTriggerResponse | null; error?: string }> {
    return apiFetch<JenkinsTriggerResponse>('/api/integrations/jenkins/trigger', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    })
  }

  async getBuild(
    jobName?: string,
    buildNumber?: number | 'latest',
    queueId?: number
  ): Promise<{ data: JenkinsBuildResponse | null; error?: string }> {
    const params = new URLSearchParams()
    if (jobName) params.set('jobName', jobName)
    if (buildNumber !== undefined) params.set('buildNumber', String(buildNumber))
    if (queueId !== undefined) params.set('queueId', String(queueId))

    const url = `/api/integrations/jenkins/build${params.toString() ? `?${params.toString()}` : ''}`
    return apiFetch<JenkinsBuildResponse>(url)
  }

  async getConsole(
    jobName?: string,
    buildNumber?: number | 'latest',
    offset = 0
  ): Promise<{ data: JenkinsConsoleResponse | null; error?: string }> {
    const params = new URLSearchParams()
    if (jobName) params.set('jobName', jobName)
    if (buildNumber !== undefined) params.set('buildNumber', String(buildNumber))
    if (offset) params.set('offset', String(offset))

    const url = `/api/integrations/jenkins/console${params.toString() ? `?${params.toString()}` : ''}`
    return apiFetch<JenkinsConsoleResponse>(url)
  }
}

export const jenkinsClientService = new JenkinsClientService()
