/**
 * DeployForge Docker Build Integration - Types & Contracts
 */

export type ProjectType =
  | 'NODEJS_NEXTJS'
  | 'NODEJS_VITE'
  | 'NODEJS_GENERIC'
  | 'PYTHON_FASTAPI'
  | 'PYTHON_FLASK'
  | 'PYTHON_GENERIC'
  | 'GO_MODULE'
  | 'STATIC_WEB'
  | 'DOCKERFILE_CUSTOM'
  | 'UNKNOWN'

export interface ProjectDetectionRule {
  type: ProjectType
  displayName: string
  description: string
  manifestFiles: string[]
  indicators: string[]
  defaultBuildCommand: string
  defaultStartCommand: string
  defaultPort: number
  recommendedDockerfilePath?: string
}

export interface ProjectDetectionResult {
  type: ProjectType
  displayName: string
  confidence: number // 0.0 to 1.0
  detectedManifests: string[]
  buildCommand: string
  startCommand: string
  port: number
  dockerfilePath?: string
  explanation: string
}

export interface BuildWorkerLimits {
  /** Maximum CPU cores (e.g. '2.0') */
  cpuLimit: string
  /** Maximum memory allocation (e.g. '2g', '512m') */
  memoryLimit: string
  /** Maximum memory reservation (e.g. '512m') */
  memoryReservation?: string
  /** Maximum build duration before aborting (in seconds) */
  timeoutSeconds: number
  /** Maximum workspace disk footprint (in MB) */
  diskLimitMb: number
  /** Maximum process limit (pids-limit) to block fork-bombs */
  pidsLimit: number
  /** Network mode during image construction ('none' | 'isolated' | 'bridge') */
  networkMode: 'none' | 'isolated' | 'bridge'
}

export const DEFAULT_BUILD_LIMITS: BuildWorkerLimits = {
  cpuLimit: '2.0',
  memoryLimit: '2g',
  memoryReservation: '512m',
  timeoutSeconds: 600, // 10 minutes
  diskLimitMb: 10240, // 10 GB
  pidsLimit: 256,
  networkMode: 'isolated',
}

export const HARD_MAX_LIMITS = {
  maxCpu: 4.0,
  maxMemoryBytes: 4 * 1024 * 1024 * 1024, // 4 GB
  maxTimeoutSeconds: 1800, // 30 minutes
  maxPids: 1024,
  maxDiskMb: 20480, // 20 GB
}

export interface BuildLogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  stage?: string
}

export interface BuildJob {
  id: string
  deploymentId: string
  projectId: string
  projectSlug: string
  projectName: string
  repoUrl: string
  commitSha: string
  branch: string
  projectType: ProjectType
  buildCommand: string
  startCommand: string
  dockerfilePath?: string
  port: number
  envVars?: Record<string, string>
  secrets?: Record<string, string> // Never passed to build args or image layers
  limits?: Partial<BuildWorkerLimits>
  files?: Record<string, string> // In-memory virtual repository files (for testing/mocking)
  workspacePath?: string // Local filesystem workspace directory
}

export interface BuildJobResult {
  jobId: string
  deploymentId: string
  success: boolean
  status: 'SUCCESS' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED'
  imageTag: string
  digest?: string
  sizeBytes?: number
  layersCount?: number
  buildDurationSeconds: number
  summary: string
  errorDetails?: string
  logs: BuildLogEntry[]
  workerType: 'mock' | 'docker'
}

export interface IBuildWorker {
  readonly name: string
  readonly type: 'mock' | 'docker'
  executeBuild(job: BuildJob, cancellationSignal?: AbortSignal): Promise<BuildJobResult>
  cancelBuild(jobId: string): Promise<boolean>
}
