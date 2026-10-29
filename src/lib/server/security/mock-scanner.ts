/**
 * DeployForge Mock Security Scanner
 *
 * Implements ISecurityScanner with configurable scenarios for automated testing and CI.
 */

import {
  ISecurityScanner,
  ScanExecutionResult,
  ScanOptions,
  ScanTarget,
  SeverityThreshold,
} from './types'
import { normalizeTrivyReport, sanitizeLog } from './normalizer'

export class MockTrivyScanner implements ISecurityScanner {
  readonly name = 'Trivy Mock Scanner'
  readonly type = 'mock' as const

  private defaultScenario: ScanOptions['mockScenario'] = 'clean'

  constructor(defaultScenario: ScanOptions['mockScenario'] = 'clean') {
    this.defaultScenario = defaultScenario
  }

  async isAvailable(): Promise<{ available: boolean; error?: string; version?: string }> {
    return { available: true, version: '0.76.1-mock' }
  }

  async scan(target: ScanTarget, options?: ScanOptions): Promise<ScanExecutionResult> {
    const scenario = options?.mockScenario || this.defaultScenario
    const threshold: SeverityThreshold = options?.severityThreshold || target.severityThreshold || 'CRITICAL'
    const startTime = Date.now()

    const baseLogs = [
      `[Trivy] Initializing security scanner worker for image: ${target.imageTag}`,
      `[Trivy] Checking vulnerability database freshness...`,
    ]

    // Scenario 1: Scanner Unavailable
    if (scenario === 'scanner_unavailable') {
      const durationSeconds = 1
      return {
        success: false,
        status: 'FAILED',
        scanResult: 'ERROR',
        blockingPolicyViolated: false,
        severityThreshold: threshold,
        summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
        vulnerabilities: [],
        rawSanitizedReport: JSON.stringify({ error: 'SCANNER_UNAVAILABLE' }),
        scannerName: this.name,
        scannerVersion: '0.76.1-mock',
        imageTag: target.imageTag,
        imageDigest: target.imageDigest,
        durationSeconds,
        scannedAt: new Date(),
        errorCategory: 'SCANNER_UNAVAILABLE',
        errorMessage: 'Scanner worker is unavailable: Trivy engine binary or container image not found.',
        logs: [
          ...baseLogs,
          '[Trivy ERROR] Scanner daemon unreachable or missing binary.',
        ],
      }
    }

    // Scenario 2: DB Download Error
    if (scenario === 'db_download_error') {
      const durationSeconds = 2
      return {
        success: false,
        status: 'FAILED',
        scanResult: 'ERROR',
        blockingPolicyViolated: false,
        severityThreshold: threshold,
        summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
        vulnerabilities: [],
        rawSanitizedReport: JSON.stringify({ error: 'DB_DOWNLOAD_ERROR' }),
        scannerName: this.name,
        scannerVersion: '0.76.1-mock',
        imageTag: target.imageTag,
        imageDigest: target.imageDigest,
        durationSeconds,
        scannedAt: new Date(),
        errorCategory: 'DB_DOWNLOAD_ERROR',
        errorMessage: 'Trivy database update failed: connection refused or rate limit reached when downloading vulnerability database.',
        logs: [
          ...baseLogs,
          '[Trivy ERROR] fatal error: failed to download vulnerability DB: 403 Forbidden or network timeout',
        ],
      }
    }

    // Scenario 3: Timeout
    if (scenario === 'timeout') {
      const timeoutLimit = options?.timeoutSeconds || 10
      return {
        success: false,
        status: 'FAILED',
        scanResult: 'ERROR',
        blockingPolicyViolated: false,
        severityThreshold: threshold,
        summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
        vulnerabilities: [],
        rawSanitizedReport: JSON.stringify({ error: 'TIMEOUT' }),
        scannerName: this.name,
        scannerVersion: '0.76.1-mock',
        imageTag: target.imageTag,
        imageDigest: target.imageDigest,
        durationSeconds: timeoutLimit,
        scannedAt: new Date(),
        errorCategory: 'TIMEOUT',
        errorMessage: `Scan timed out after exceeding allocated limit of ${timeoutLimit} seconds.`,
        logs: [
          ...baseLogs,
          `[Trivy ERROR] Scan worker killed due to timeout (${timeoutLimit}s).`,
        ],
      }
    }

    // Scenario 4: Malformed Report
    if (scenario === 'malformed_report') {
      const durationSeconds = 1
      return {
        success: false,
        status: 'FAILED',
        scanResult: 'ERROR',
        blockingPolicyViolated: false,
        severityThreshold: threshold,
        summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
        vulnerabilities: [],
        rawSanitizedReport: '{ invalid_json: incomplete_chunk',
        scannerName: this.name,
        scannerVersion: '0.76.1-mock',
        imageTag: target.imageTag,
        imageDigest: target.imageDigest,
        durationSeconds,
        scannedAt: new Date(),
        errorCategory: 'MALFORMED_OUTPUT',
        errorMessage: 'MALFORMED_OUTPUT: Unable to parse Trivy JSON output.',
        logs: [
          ...baseLogs,
          '[Trivy ERROR] Scanner emitted truncated or corrupt non-JSON output.',
        ],
      }
    }

    // Prepare standard simulated Trivy raw JSON
    let sampleTrivyJson: any

    if (scenario === 'clean') {
      sampleTrivyJson = {
        SchemaVersion: 2,
        ArtifactName: target.imageTag,
        ArtifactType: 'container_image',
        Metadata: {
          ImageID: target.imageDigest || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          DiffIDs: [],
        },
        Results: [
          {
            Target: target.imageTag,
            Class: 'os-pkgs',
            Type: 'alpine',
            Vulnerabilities: [],
          },
        ],
      }
    } else if (scenario === 'blocking') {
      sampleTrivyJson = {
        SchemaVersion: 2,
        ArtifactName: target.imageTag,
        ArtifactType: 'container_image',
        Metadata: {
          ImageID: target.imageDigest || 'sha256:blockingdigest1234567890',
        },
        Results: [
          {
            Target: target.imageTag,
            Class: 'os-pkgs',
            Type: 'alpine',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2023-45853',
                PkgName: 'zlib',
                InstalledVersion: '1.2.11',
                FixedVersion: '1.2.12',
                Severity: 'CRITICAL',
                Title: 'zlib: integer overflow and resultant buffer overflow in zipOpenNewFileInZip4_64',
                Description: 'MiniZip in zlib through 1.2.13 has an integer overflow and resultant heap-based buffer overflow in zipOpenNewFileInZip4_64.',
                PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2023-45853',
                PublishedDate: '2023-10-14T02:15:00Z',
              },
              {
                VulnerabilityID: 'CVE-2023-5363',
                PkgName: 'openssl',
                InstalledVersion: '3.0.8-r0',
                FixedVersion: '3.0.9-r0',
                Severity: 'CRITICAL',
                Title: 'openssl: Incorrect cipher key & IV length processing',
                Description: 'A bug in the processing of key and IV lengths can cause truncation and insecure cryptographic operations.',
                PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2023-5363',
                PublishedDate: '2023-10-24T13:15:00Z',
              },
              {
                VulnerabilityID: 'CVE-2023-6129',
                PkgName: 'openssl',
                InstalledVersion: '3.0.8-r0',
                FixedVersion: '3.0.9-r0',
                Severity: 'HIGH',
                Title: 'openssl: POLY1305 MAC implementation corrupted on AVX-512',
                Description: 'The POLY1305 MAC implementation contains a buffer overrun vulnerability on systems with AVX-512 capabilities.',
                PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2023-6129',
                PublishedDate: '2024-01-09T18:15:00Z',
              },
            ],
          },
        ],
      }
    } else {
      // non_blocking: only MEDIUM and LOW
      sampleTrivyJson = {
        SchemaVersion: 2,
        ArtifactName: target.imageTag,
        ArtifactType: 'container_image',
        Results: [
          {
            Target: target.imageTag,
            Class: 'os-pkgs',
            Type: 'alpine',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2024-21626',
                PkgName: 'runc',
                InstalledVersion: '1.1.10',
                FixedVersion: '1.1.11',
                Severity: 'MEDIUM',
                Title: 'runc: internal file descriptor leak',
                Description: 'A file descriptor leak allows an attacker to escape containers under specific configurations.',
                PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2024-21626',
                PublishedDate: '2024-01-31T22:15:00Z',
              },
              {
                VulnerabilityID: 'CVE-2023-38039',
                PkgName: 'curl',
                InstalledVersion: '8.4.0',
                FixedVersion: '8.5.0',
                Severity: 'LOW',
                Title: 'curl: HTTP headers size limit bypass',
                Description: 'When receiving HTTP headers, curl does not limit the overall headers size.',
                PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2023-38039',
                PublishedDate: '2023-10-11T09:15:00Z',
              },
            ],
          },
        ],
      }
    }

    const {
      vulnerabilities,
      summary,
      blockingPolicyViolated,
      sanitizedReportJson,
    } = normalizeTrivyReport(sampleTrivyJson, threshold)

    const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))

    const resultLogs = [
      ...baseLogs,
      `[Trivy] Vulnerability DB is up to date (schema v2).`,
      `[Trivy] Scanning target container image: ${target.imageTag}`,
      `[Trivy] Findings: ${summary.critical} Critical, ${summary.high} High, ${summary.medium} Medium, ${summary.low} Low (Total: ${summary.total})`,
      `[Trivy Policy] Configured threshold: ${threshold}. Policy violated: ${blockingPolicyViolated ? 'YES (Scan BLOCKED)' : 'NO (Scan PASSED)'}`,
    ]

    return {
      success: !blockingPolicyViolated,
      status: 'COMPLETED',
      scanResult: blockingPolicyViolated ? 'BLOCKED' : 'PASSED',
      blockingPolicyViolated,
      severityThreshold: threshold,
      summary,
      vulnerabilities,
      rawSanitizedReport: sanitizedReportJson,
      scannerName: this.name,
      scannerVersion: '0.76.1-mock',
      imageTag: target.imageTag,
      imageDigest: target.imageDigest || 'sha256:mockdigest12345',
      durationSeconds,
      scannedAt: new Date(),
      errorMessage: blockingPolicyViolated
        ? `Policy violation: ${summary.critical} critical and ${summary.high} high vulnerabilities exceed threshold ${threshold}.`
        : undefined,
      logs: resultLogs.map((l) => sanitizeLog(l)),
    }
  }
}
