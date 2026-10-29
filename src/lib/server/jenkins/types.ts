/**
 * DeployForge Jenkins CI/CD Integration - Types & Contracts
 */

export interface JenkinsConfig {
  serverUrl: string
  username: string
  apiToken: string
  defaultJobName: string
  callbackSecret: string
  untrustedAgentLabel: string
  privilegedAgentLabel: string
  timeoutMinutes: number
}

export interface JenkinsJobParameters {
  DEPLOYMENT_ID: string
  PROJECT_ID: string
  PROJECT_SLUG: string
  PROJECT_NAME: string
  REPO_URL: string
  BRANCH: string
  COMMIT_SHA: string
  PROJECT_TYPE: string
  BUILD_COMMAND: string
  START_COMMAND: string
  PORT: number
  DOCKERFILE_PATH: string
  REQUIRE_APPROVAL: boolean
  CALLBACK_URL: string
  CALLBACK_TOKEN: string
  ECR_REPOSITORY_URI?: string
  AWS_REGION?: string
}

export interface JenkinsQueueResult {
  success: boolean
  jobName: string
  queueId?: number
  buildNumber?: number
  url?: string
  error?: string
  isSimulated: boolean
}

export interface JenkinsJobStatus {
  jobName: string
  buildNumber: number
  status: 'QUEUED' | 'BUILDING' | 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'DISABLED'
  durationMs: number
  url: string
  currentStage?: string
  logs?: string[]
}

export interface JenkinsCallbackLogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
}

export interface JenkinsCallbackVulnerability {
  cveId: string
  severity: string
  packageName: string
  installedVersion: string
  fixedVersion?: string
  title?: string
  description?: string
  primaryUrl?: string
}

export interface JenkinsCallbackSecurityScan {
  scanner?: string
  scannerVersion?: string
  status?: 'COMPLETED' | 'FAILED'
  scanResult: 'PASSED' | 'BLOCKED' | 'ERROR'
  blockingPolicyViolated?: boolean
  severityThreshold?: string
  criticalCount?: number
  highCount?: number
  mediumCount?: number
  lowCount?: number
  unknownCount?: number
  totalCount?: number
  rawReportJson?: string | Record<string, unknown>
  errorMessage?: string
  errorCategory?: string
  durationSeconds?: number
  scannedAt?: string
  vulnerabilities?: JenkinsCallbackVulnerability[]
}

export interface JenkinsCallbackPayload {
  deploymentId: string
  projectId: string
  commitSha: string
  buildNumber: number
  jobName: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
  stageName?: string
  stageStatus?: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
  dockerImageTag?: string
  publishedImageUri?: string
  summary: string
  errorMessage?: string
  logs: JenkinsCallbackLogEntry[]
  securityScan?: JenkinsCallbackSecurityScan
}

export interface IJenkinsAdapter {
  readonly name: string
  readonly isSimulated: boolean
  testConnection(): Promise<{ connected: boolean; version?: string; message: string; isSimulated: boolean }>
  queueBuild(params: JenkinsJobParameters): Promise<JenkinsQueueResult>
  getJobStatus(jobName: string, buildNumber: number): Promise<JenkinsJobStatus>
  cancelJob(jobName: string, buildNumber: number): Promise<boolean>
}
