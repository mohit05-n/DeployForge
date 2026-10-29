/**
 * DeployForge Security Scanner Types & Contracts
 */

export type ScanSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

export type SeverityThreshold = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type ScanStatus = 'PENDING' | 'SCANNING' | 'COMPLETED' | 'FAILED'

export type ScanResult = 'PASSED' | 'BLOCKED' | 'ERROR'

export type ScanErrorCategory =
  | 'DB_DOWNLOAD_ERROR'
  | 'TIMEOUT'
  | 'SCANNER_UNAVAILABLE'
  | 'MALFORMED_OUTPUT'
  | 'PROCESS_CRASH'

export const SEVERITY_RANKS: Record<ScanSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0,
}

export const THRESHOLD_RANKS: Record<SeverityThreshold, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

export interface NormalizedVulnerability {
  id?: string
  cveId: string
  severity: ScanSeverity
  packageName: string
  installedVersion: string
  fixedVersion?: string | null
  title?: string | null
  description?: string | null
  primaryUrl?: string | null
  publishedAt?: Date | null
}

export interface ScanSummary {
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
  total: number
}

export interface ScanTarget {
  imageTag: string
  imageDigest?: string
  projectId: string
  projectSlug?: string
  deploymentId?: string
  commitSha: string
  severityThreshold?: SeverityThreshold
}

export interface ScanOptions {
  timeoutSeconds?: number
  severityThreshold?: SeverityThreshold
  mockScenario?:
    | 'clean'
    | 'blocking'
    | 'non_blocking'
    | 'db_download_error'
    | 'timeout'
    | 'scanner_unavailable'
    | 'malformed_report'
}

export interface ScanExecutionResult {
  success: boolean
  status: ScanStatus
  scanResult: ScanResult
  blockingPolicyViolated: boolean
  severityThreshold: SeverityThreshold
  summary: ScanSummary
  vulnerabilities: NormalizedVulnerability[]
  rawSanitizedReport: string
  scannerName: string
  scannerVersion: string
  imageTag: string
  imageDigest?: string
  durationSeconds: number
  scannedAt: Date
  errorMessage?: string
  errorCategory?: ScanErrorCategory
  logs: string[]
}

export interface ISecurityScanner {
  readonly name: string
  readonly type: 'docker' | 'cli' | 'mock'
  isAvailable(): Promise<{ available: boolean; error?: string; version?: string }>
  scan(target: ScanTarget, options?: ScanOptions): Promise<ScanExecutionResult>
}
