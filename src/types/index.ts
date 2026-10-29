// ─── Auth ──────────────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  createdAt: string
  role: 'admin' | 'developer' | 'viewer'
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

// ─── Projects ──────────────────────────────────────────────────────────────
export type ProjectStatus = 'active' | 'deploying' | 'failed' | 'paused' | 'archived'
export type RuntimeType = 'nodejs' | 'python' | 'docker' | 'static' | 'nextjs' | 'react'
export type CloudProvider = 'aws' | 'gcp' | 'azure'
export type AWSRegion =
  | 'us-east-1'
  | 'us-west-2'
  | 'eu-west-1'
  | 'eu-central-1'
  | 'ap-southeast-1'
  | 'ap-northeast-1'

export interface Repository {
  url: string
  branch: string
  provider: 'github' | 'gitlab' | 'bitbucket'
  name: string
  fullName: string
  private: boolean
  lastCommit?: Commit
}

export interface Commit {
  sha: string
  shortSha: string
  message: string
  author: string
  timestamp: string
}

export interface EnvironmentVariable {
  key: string
  value: string
  isSecret: boolean
}

export interface Project {
  id: string
  name: string
  slug: string
  description?: string
  status: ProjectStatus
  runtime: RuntimeType
  repository: Repository
  region: AWSRegion
  cloudProvider: CloudProvider
  deploymentUrl?: string
  buildCommand: string
  startCommand: string
  envVars: EnvironmentVariable[]
  createdAt: string
  updatedAt: string
  lastDeployment?: Deployment
  tags: string[]
}

export interface ProjectFormData {
  name: string
  description?: string
  repositoryUrl: string
  branch: string
  runtime: RuntimeType
  region: AWSRegion
  cloudProvider: CloudProvider
  buildCommand: string
  startCommand: string
  envVars: EnvironmentVariable[]
}

// ─── Deployments ───────────────────────────────────────────────────────────
export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'testing'
  | 'scanning'
  | 'publishing'
  | 'deploying'
  | 'health_check'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'rolled_back'

export type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export interface DeploymentStage {
  id: string
  name: string
  status: StageStatus
  startedAt?: string
  completedAt?: string
  duration?: number // seconds
  logs: LogEntry[]
}

export interface Deployment {
  id: string
  projectId: string
  projectName: string
  status: DeploymentStatus
  commit: Commit
  imageTag?: string
  deploymentUrl?: string
  region: AWSRegion
  cloudProvider: CloudProvider
  stages: DeploymentStage[]
  triggeredBy: string
  triggeredAt: string
  completedAt?: string
  duration?: number
  isRollbackAvailable: boolean
  previousDeploymentId?: string
}

export interface DeploymentSummary {
  total: number
  successful: number
  failed: number
  successRate: number
  averageDuration: number
}

// ─── Logs ──────────────────────────────────────────────────────────────────
export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  source?: string
}

// ─── Security ──────────────────────────────────────────────────────────────
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export interface Vulnerability {
  id: string
  cveId: string
  severity: Severity
  packageName: string
  installedVersion: string
  fixedVersion?: string
  title: string
  description: string
  publishedDate: string
}

export interface SecurityScan {
  id: string
  projectId: string
  deploymentId: string
  imageTag: string
  status: 'pending' | 'scanning' | 'completed' | 'failed'
  scanResult?: 'passed' | 'blocked' | 'error' | 'pending'
  blockingPolicyViolated?: boolean
  severityThreshold?: string
  scannerVersion?: string
  isSimulated?: boolean
  rawReportJson?: string | null
  errorMessage?: string | null
  errorCategory?: string | null
  scannedAt?: string
  scanner: string
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    unknown: number
    total: number
  }
  vulnerabilities: Vulnerability[]
}

// ─── Infrastructure ────────────────────────────────────────────────────────
export type ResourceType =
  | 'ec2_instance'
  | 'ecs_cluster'
  | 'ecs_service'
  | 'ecr_repository'
  | 'load_balancer'
  | 'rds_instance'
  | 'elasticache'
  | 's3_bucket'
  | 'cloudfront'
  | 'vpc'
  | 'security_group'
  | 'iam_role'

export type ResourceStatus = 'running' | 'stopped' | 'pending' | 'error' | 'unknown'

export interface InfrastructureResource {
  id: string
  name: string
  type: ResourceType
  status: ResourceStatus
  region: AWSRegion
  cloudProvider: CloudProvider
  projectId?: string
  tags: Record<string, string>
  cost?: {
    monthly: number
    currency: string
  }
  details: Record<string, string | number | boolean>
}

export interface TerraformPlan {
  id: string
  projectId: string
  status: 'pending' | 'planned' | 'applying' | 'applied' | 'failed'
  createdAt: string
  summary: {
    toAdd: number
    toChange: number
    toDestroy: number
  }
  changes: TerraformChange[]
}

export interface TerraformChange {
  address: string
  type: ResourceType
  action: 'create' | 'update' | 'delete' | 'no-op'
  details?: string
}

// ─── Monitoring ────────────────────────────────────────────────────────────
export interface MetricDataPoint {
  timestamp: string
  value: number
}

export interface ApplicationHealth {
  projectId: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  uptime: number // percentage
  responseTime?: number // ms
  errorRate?: number // percentage
  lastChecked: string
}

// ─── Integrations / Settings ───────────────────────────────────────────────
export interface GitHubIntegration {
  connected: boolean
  username?: string
  avatarUrl?: string
  connectedAt?: string
  repositories?: number
}

export interface CloudIntegration {
  provider: CloudProvider
  connected: boolean
  accountId?: string
  region?: AWSRegion
  connectedAt?: string
}

export interface NotificationSettings {
  email: boolean
  slack: boolean
  deploymentSuccess: boolean
  deploymentFailure: boolean
  securityAlerts: boolean
  billingAlerts: boolean
}

export interface UserProfile {
  user: User
  github: GitHubIntegration
  cloudProviders: CloudIntegration[]
  notifications: NotificationSettings
  twoFactorEnabled: boolean
  apiKeys: ApiKey[]
}

export interface ApiKey {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsed?: string
  permissions: string[]
}

// ─── UI / Generic ──────────────────────────────────────────────────────────
export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ApiResponse<T> {
  data: T
  meta?: PaginationMeta
  error?: string
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export type SortOrder = 'asc' | 'desc'
