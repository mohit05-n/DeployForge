import {
  Project,
  Deployment,
  SecurityScan,
  InfrastructureResource,
  TerraformPlan,
  ApplicationHealth,
  ProjectFormData,
  ApiResponse,
  User,
  ProjectStatus,
  RuntimeType,
  AWSRegion,
  DeploymentStatus,
  StageStatus,
} from '@/types'
import {
  MOCK_SECURITY_SCANS,
  MOCK_INFRASTRUCTURE,
  MOCK_TERRAFORM_PLAN,
  MOCK_APP_HEALTH,
  MOCK_USER,
  generateLogEntries,
} from '@/lib/mock-data'
import { generateId, slugify } from '@/lib/utils'

// Helper for client-side API requests with JSON & credentials
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

function mapDbProjectToFrontend(db: any): Project {
  const repoName = db.repository?.split('/').pop() || db.name
  const fullName = db.repository || `${db.name}/${db.name}`
  const lastDep = db.deployments?.[0]
    ? mapDbDeploymentToFrontend(db.deployments[0], db.name)
    : undefined

  let runtime: RuntimeType = 'nodejs'
  const rtLower = (db.runtime || '').toLowerCase()
  if (rtLower.includes('python')) runtime = 'python'
  else if (rtLower.includes('docker')) runtime = 'docker'
  else if (rtLower.includes('react')) runtime = 'react'
  else if (rtLower.includes('next')) runtime = 'nextjs'
  else if (rtLower.includes('static')) runtime = 'static'

  return {
    id: db.id,
    name: db.name,
    slug: db.slug || slugify(db.name),
    description: db.description || undefined,
    status: (db.status?.toLowerCase() as ProjectStatus) || 'active',
    runtime,
    repository: {
      url: db.repository?.startsWith('http') ? db.repository : `https://github.com/${fullName}`,
      branch: db.branch || 'main',
      provider: 'github',
      name: repoName,
      fullName: fullName,
      private: true,
      lastCommit: lastDep?.commit,
    },
    region: (db.region as AWSRegion) || 'us-east-1',
    cloudProvider: 'aws',
    deploymentUrl: db.liveUrl || undefined,
    buildCommand: db.buildCommand || 'npm run build',
    startCommand: db.startCommand || 'npm start',
    envVars: (db.envVars || []).map((v: any) => ({
      key: v.key,
      value: v.value || (v.isSecret ? '••••••••••••••••' : v.valueEncrypted || ''),
      isSecret: v.isSecret,
    })),
    createdAt: db.createdAt ? new Date(db.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: db.updatedAt ? new Date(db.updatedAt).toISOString() : new Date().toISOString(),
    lastDeployment: lastDep,
    tags: [],
  }
}

function mapDbDeploymentToFrontend(db: any, projectName?: string): Deployment {
  const shortSha = db.commitSha?.slice(0, 7) || 'a8f3b2c'
  return {
    id: db.id,
    projectId: db.projectId,
    projectName: projectName || db.project?.name || 'Project',
    status: (db.status?.toLowerCase() as DeploymentStatus) || 'success',
    commit: {
      sha: db.commitSha || 'unknown',
      shortSha,
      message: db.commitMessage || 'Deployment commit',
      author: db.author || 'DeployForge User',
      timestamp: db.createdAt ? new Date(db.createdAt).toISOString() : new Date().toISOString(),
    },
    imageTag: db.dockerImageTag || undefined,
    deploymentUrl: db.project?.liveUrl || undefined,
    region: (db.project?.region as AWSRegion) || 'us-east-1',
    cloudProvider: 'aws',
    stages: (db.stages || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      status: (s.status?.toLowerCase() as StageStatus) || 'pending',
      startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : undefined,
      completedAt: s.finishedAt ? new Date(s.finishedAt).toISOString() : undefined,
      duration: s.durationSeconds || undefined,
      logs: (db.logs || [])
        .filter((l: any) => !l.stageName || l.stageName === s.name)
        .map((l: any, i: number) => ({
          id: l.id || `log-${i}`,
          timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString(),
          level: (l.level?.toLowerCase() as any) || 'info',
          message: l.message,
        })),
    })),
    triggeredBy: db.author || 'User',
    triggeredAt: db.createdAt ? new Date(db.createdAt).toISOString() : new Date().toISOString(),
    completedAt: db.finishedAt ? new Date(db.finishedAt).toISOString() : undefined,
    duration: db.durationSeconds || undefined,
    isRollbackAvailable: true,
  }
}

// ─── Auth Service ──────────────────────────────────────────────────────────
export const authService = {
  async signIn(email: string, password: string): Promise<ApiResponse<User>> {
    const res = await apiFetch<{ user: any; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    if (res.error || !res.data) {
      return { data: MOCK_USER, error: res.error || 'Login failed' }
    }

    const u = res.data.user
    const user: User = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: (u.role?.toLowerCase() as any) || 'developer',
      createdAt: u.createdAt || new Date().toISOString(),
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('df_auth', JSON.stringify(user))
    }

    return { data: user }
  },

  async signUp(name: string, email: string, password: string): Promise<ApiResponse<User>> {
    const res = await apiFetch<{ user: any; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    })

    if (res.error || !res.data) {
      return { data: MOCK_USER, error: res.error || 'Registration failed' }
    }

    const u = res.data.user
    const user: User = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: (u.role?.toLowerCase() as any) || 'developer',
      createdAt: u.createdAt || new Date().toISOString(),
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('df_auth', JSON.stringify(user))
    }

    return { data: user }
  },

  async forgotPassword(email: string): Promise<ApiResponse<{ message: string }>> {
    if (!email) return { data: { message: '' }, error: 'Email is required' }
    return { data: { message: 'If an account exists, a reset link has been dispatched.' } }
  },

  async getCurrentUser(): Promise<User | null> {
    const res = await apiFetch<{ user: any }>('/api/auth/me')
    if (res.data?.user) {
      const u = res.data.user
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: (u.role?.toLowerCase() as any) || 'developer',
        createdAt: u.createdAt || new Date().toISOString(),
      }
    }

    // Check localStorage fallback if signed in previously
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('df_auth')
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch (_) {}
      }
    }
    return null
  },

  async signOut(): Promise<void> {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    if (typeof window !== 'undefined') {
      localStorage.removeItem('df_auth')
    }
  },
}

// ─── Projects Service ──────────────────────────────────────────────────────
export const projectsService = {
  async listProjects(): Promise<ApiResponse<Project[]>> {
    const res = await apiFetch<any[]>('/api/projects')
    if (res.data) {
      return { data: res.data.map(mapDbProjectToFrontend) }
    }
    return { data: [], error: res.error }
  },

  async getProject(id: string): Promise<ApiResponse<Project>> {
    const res = await apiFetch<any>(`/api/projects/${id}`)
    if (res.data) {
      return { data: mapDbProjectToFrontend(res.data) }
    }
    return { data: null as any, error: res.error || 'Project not found' }
  },

  async createProject(formData: ProjectFormData): Promise<ApiResponse<Project>> {
    const payload = {
      name: formData.name,
      description: formData.description,
      repository: formData.repositoryUrl,
      branch: formData.branch || 'main',
      runtime: formData.runtime === 'python' ? 'PYTHON_311' : formData.runtime === 'docker' ? 'DOCKERFILE' : 'NODEJS_20',
      buildCommand: formData.buildCommand || 'npm run build',
      startCommand: formData.startCommand || 'npm start',
      region: formData.region || 'us-east-1',
      target: 'ECS_FARGATE',
      envVars: formData.envVars || [],
    }

    const res = await apiFetch<any>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (res.data) {
      return { data: mapDbProjectToFrontend(res.data) }
    }
    return { data: null as any, error: res.error || 'Failed to create project' }
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<ApiResponse<Project>> {
    const res = await apiFetch<any>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: updates.name,
        description: updates.description,
        branch: updates.repository?.branch,
        buildCommand: updates.buildCommand,
        startCommand: updates.startCommand,
        region: updates.region,
        envVars: updates.envVars,
      }),
    })

    if (res.data) {
      return { data: mapDbProjectToFrontend(res.data) }
    }
    return { data: null as any, error: res.error || 'Failed to update project' }
  },

  async deleteProject(id: string): Promise<ApiResponse<{ message: string }>> {
    const res = await apiFetch<any>(`/api/projects/${id}`, {
      method: 'DELETE',
    })

    if (res.data) {
      return { data: { message: 'Project deleted successfully' } }
    }
    return { data: { message: '' }, error: res.error || 'Failed to delete project' }
  },
}

// ─── Deployments Service ───────────────────────────────────────────────────
export const deploymentsService = {
  async listDeployments(projectId?: string): Promise<ApiResponse<Deployment[]>> {
    const url = projectId ? `/api/deployments?projectId=${projectId}` : '/api/deployments'
    const res = await apiFetch<any[]>(url)
    if (res.data) {
      return { data: res.data.map((d) => mapDbDeploymentToFrontend(d)) }
    }
    return { data: [], error: res.error }
  },

  async getDeployment(id: string): Promise<ApiResponse<Deployment>> {
    const res = await apiFetch<any>(`/api/deployments/${id}`)
    if (res.data) {
      return { data: mapDbDeploymentToFrontend(res.data) }
    }
    return { data: null as any, error: res.error || 'Deployment not found' }
  },

  async triggerDeployment(projectId: string): Promise<ApiResponse<Deployment>> {
    const res = await apiFetch<any>('/api/deployments', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        commitMessage: 'Deployment trigger via DeployForge Console',
      }),
    })

    if (res.data) {
      return { data: mapDbDeploymentToFrontend(res.data) }
    }
    return { data: null as any, error: res.error || 'Failed to trigger deployment' }
  },

  async retryDeployment(id: string): Promise<ApiResponse<{ message: string }>> {
    const res = await apiFetch<any>(`/api/deployments/${id}/retry`, {
      method: 'POST',
    })

    if (res.data) {
      return { data: { message: 'Deployment retry initiated successfully' } }
    }
    return { data: { message: '' }, error: res.error || 'Retry failed' }
  },

  async rollbackDeployment(id: string): Promise<ApiResponse<{ message: string }>> {
    const res = await apiFetch<any>(`/api/deployments/${id}/rollback`, {
      method: 'POST',
    })

    if (res.data) {
      return { data: { message: 'Rollback initiated successfully' } }
    }
    return { data: { message: '' }, error: res.error || 'Rollback failed' }
  },

  async cancelDeployment(id: string): Promise<ApiResponse<{ message: string }>> {
    return { data: { message: `Deployment ${id} cancel request logged.` } }
  },
}

function mapDbScanToFrontend(db: any): SecurityScan {
  return {
    id: db.id,
    projectId: db.projectId,
    deploymentId: db.deploymentId || '',
    imageTag: db.imageTag,
    status: (db.status || 'completed').toLowerCase() as any,
    scanResult: (db.scanResult || 'PASSED').toLowerCase() as any,
    blockingPolicyViolated: Boolean(db.blockingPolicyViolated),
    severityThreshold: db.severityThreshold || 'CRITICAL',
    scannerVersion: db.scannerVersion || '0.76.1',
    isSimulated: false,
    rawReportJson: db.rawReportJson || null,
    errorMessage: db.errorMessage || null,
    errorCategory: db.errorCategory || null,
    scannedAt: db.scannedAt ? new Date(db.scannedAt).toISOString() : new Date(db.createdAt).toISOString(),
    scanner: db.scanner || 'Trivy 0.76.1',
    summary: {
      critical: db.criticalCount || 0,
      high: db.highCount || 0,
      medium: db.mediumCount || 0,
      low: db.lowCount || 0,
      unknown: db.unknownCount || 0,
      total: db.totalCount || 0,
    },
    vulnerabilities: (db.vulnerabilities || []).map((v: any) => ({
      id: v.id,
      cveId: v.cveId,
      severity: (v.severity || 'unknown').toLowerCase(),
      packageName: v.packageName,
      installedVersion: v.installedVersion,
      fixedVersion: v.fixedVersion || undefined,
      title: v.title || v.cveId,
      description: v.description || '',
      publishedDate: v.publishedAt ? new Date(v.publishedAt).toISOString() : '',
    })),
  }
}

// ─── Security Service ──────────────────────────────────────────────────────
export const securityService = {
  async listScans(projectId?: string): Promise<ApiResponse<SecurityScan[]>> {
    const url = projectId ? `/api/security/scans?projectId=${projectId}` : '/api/security/scans'
    const res = await apiFetch<any[]>(url)
    if (res.data && Array.isArray(res.data)) {
      if (res.data.length > 0) {
        return { data: res.data.map(mapDbScanToFrontend) }
      }
      return { data: [] }
    }
    const filtered = (projectId
      ? MOCK_SECURITY_SCANS.filter((s) => s.projectId === projectId)
      : MOCK_SECURITY_SCANS).map((s) => ({ ...s, isSimulated: true }))
    return { data: filtered }
  },

  async getScan(id: string): Promise<ApiResponse<SecurityScan>> {
    const res = await apiFetch<any>(`/api/security/scans/${id}`)
    if (res.data) {
      return { data: mapDbScanToFrontend(res.data) }
    }
    const scan = MOCK_SECURITY_SCANS.find((s) => s.id === id) ?? MOCK_SECURITY_SCANS[0]
    return { data: scan }
  },

  async triggerScan(projectId: string, imageTag?: string): Promise<ApiResponse<{ message: string; scan?: any }>> {
    const res = await apiFetch<{ message: string; scan?: any }>('/api/security/scans', {
      method: 'POST',
      body: JSON.stringify({ projectId, imageTag }),
    })
    if (res.data) {
      return { data: res.data }
    }
    return { data: { message: res.error || 'Failed to trigger scan' }, error: res.error }
  },

  async getStats(): Promise<ApiResponse<any>> {
    const res = await apiFetch<any>('/api/security/stats')
    if (res.data) {
      return { data: res.data }
    }
    return {
      data: {
        severities: { critical: 2, high: 4, medium: 9, low: 15, unknown: 1, total: 31 },
        scansCount: { total: 4, passed: 2, blocked: 2, failed: 0 },
      },
    }
  },
}

// ─── Infrastructure Service ────────────────────────────────────────────────
export const infrastructureService = {
  async listResources(projectId?: string): Promise<ApiResponse<InfrastructureResource[]>> {
    const filtered = projectId
      ? MOCK_INFRASTRUCTURE.filter((r) => r.projectId === projectId || !r.projectId)
      : MOCK_INFRASTRUCTURE
    return { data: filtered }
  },

  async getTerraformPlan(projectId: string): Promise<ApiResponse<TerraformPlan>> {
    return { data: { ...MOCK_TERRAFORM_PLAN, projectId } }
  },

  async applyTerraformPlan(_planId: string): Promise<ApiResponse<{ message: string }>> {
    return {
      data: { message: 'Apply operation is disabled in demo mode. DeployForge enforces read-only IaC verification.' },
      error: 'DEMO_MODE',
    }
  },
}

// ─── Logs Service ──────────────────────────────────────────────────────────
export const logsService = {
  async getDeploymentLogs(deploymentId: string, stageId?: string) {
    const res = await deploymentsService.getDeployment(deploymentId)
    if (res.data) {
      const stages = stageId ? res.data.stages.filter((s) => s.id === stageId) : res.data.stages
      return { data: stages.flatMap((s) => s.logs) }
    }
    return { data: [] }
  },

  async getApplicationLogs(projectId: string) {
    return { data: generateLogEntries(50, projectId) }
  },
}

// ─── Monitoring Service ────────────────────────────────────────────────────
export const monitoringService = {
  async getHealth(projectId?: string): Promise<ApiResponse<ApplicationHealth[]>> {
    const data = projectId ? MOCK_APP_HEALTH.filter((h) => h.projectId === projectId) : MOCK_APP_HEALTH
    return { data }
  },

  async getDeploymentStats() {
    const res = await deploymentsService.listDeployments()
    const depList = res.data || []
    const total = depList.length
    const successful = depList.filter((d) => d.status === 'success').length
    const failed = depList.filter((d) => d.status === 'failed').length
    return {
      data: {
        total,
        successful,
        failed,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
        averageDuration: 124,
      },
    }
  },
}

// ─── GitHub Integration Service ────────────────────────────────────────────
export interface GitHubStatus {
  connected: boolean
  username?: string
  avatarUrl?: string
  scope?: string
  connectedAt?: string
  clientIdConfigured: boolean
  webhookConfigured: boolean
  webhookUrl: string
}

export interface GitHubRepoOption {
  id: number
  name: string
  fullName: string
  owner: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  description: string | null
  language: string | null
  updatedAt: string
}

export interface GitHubBranchOption {
  name: string
  commitSha: string
  isProtected?: boolean
}

export const githubIntegrationService = {
  async getStatus(): Promise<ApiResponse<GitHubStatus>> {
    const res = await apiFetch<GitHubStatus>('/api/integrations/github/status')
    if (res.data) {
      return { data: res.data }
    }
    return {
      data: {
        connected: false,
        clientIdConfigured: false,
        webhookConfigured: false,
        webhookUrl: '',
      },
      error: res.error,
    }
  },

  async getAuthUrl(): Promise<ApiResponse<{ url: string; state: string }>> {
    const res = await apiFetch<{ url: string; state: string }>('/api/integrations/github/auth?format=json')
    if (res.data) {
      return { data: res.data }
    }
    return { data: { url: '', state: '' }, error: res.error || 'Failed to generate auth URL' }
  },

  async disconnect(): Promise<ApiResponse<{ disconnected: boolean }>> {
    const res = await apiFetch<{ disconnected: boolean }>('/api/integrations/github/disconnect', {
      method: 'POST',
    })
    if (res.data) {
      return { data: res.data }
    }
    return { data: { disconnected: false }, error: res.error || 'Failed to disconnect GitHub' }
  },

  async listRepositories(): Promise<ApiResponse<GitHubRepoOption[]>> {
    const res = await apiFetch<GitHubRepoOption[]>('/api/integrations/github/repositories')
    if (res.data) {
      return { data: res.data }
    }
    return { data: [], error: res.error || 'Failed to list repositories' }
  },

  async listBranches(repo: string): Promise<ApiResponse<GitHubBranchOption[]>> {
    const res = await apiFetch<GitHubBranchOption[]>(`/api/integrations/github/branches?repo=${encodeURIComponent(repo)}`)
    if (res.data) {
      return { data: res.data }
    }
    return { data: [], error: res.error || 'Failed to list branches' }
  },
}

export * from './integrations/jenkins-client.service'


