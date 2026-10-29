/**
 * DeployForge Controlled Docker Trivy Scanner Worker
 *
 * Runs Trivy in an isolated container worker without exposing internal paths or secrets.
 * Ensures unavailable scanner or failed scan is NEVER silently treated as a clean scan.
 */

import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import {
  ISecurityScanner,
  ScanExecutionResult,
  ScanOptions,
  ScanTarget,
  SeverityThreshold,
} from './types'
import { normalizeTrivyReport, sanitizeLog } from './normalizer'

const execAsync = promisify(exec)

export class DockerTrivyScanner implements ISecurityScanner {
  readonly name = 'Trivy Container Scanner'
  readonly type = 'docker' as const

  private dockerImage = process.env.TRIVY_DOCKER_IMAGE || 'aquasec/trivy:latest'

  async isAvailable(): Promise<{ available: boolean; error?: string; version?: string }> {
    try {
      const { stdout } = await execAsync(`docker run --rm ${this.dockerImage} --version`, {
        timeout: 10000,
      })
      const versionMatch = stdout.match(/Version:\s*([0-9\.]+)/i)
      const version = versionMatch ? versionMatch[1] : stdout.trim()
      return { available: true, version }
    } catch (err) {
      return {
        available: false,
        error: `Docker Trivy worker unavailable: ${(err as Error).message}`,
      }
    }
  }

  async scan(target: ScanTarget, options?: ScanOptions): Promise<ScanExecutionResult> {
    const startTime = Date.now()
    const threshold: SeverityThreshold =
      options?.severityThreshold || target.severityThreshold || 'CRITICAL'
    const timeoutSeconds = options?.timeoutSeconds || 180

    const logs: string[] = [
      `[Trivy Worker] Initializing controlled scanner container (${this.dockerImage})...`,
      `[Trivy Worker] Target image: ${target.imageTag}`,
      `[Trivy Worker] Security threshold: ${threshold}`,
    ]

    // Verify worker availability first
    const availability = await this.isAvailable()
    if (!availability.available) {
      const errorMsg = availability.error || 'Scanner worker container is unavailable.'
      logs.push(`[Trivy Worker ERROR] ${errorMsg}`)
      return {
        success: false,
        status: 'FAILED',
        scanResult: 'ERROR',
        blockingPolicyViolated: false,
        severityThreshold: threshold,
        summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
        vulnerabilities: [],
        rawSanitizedReport: JSON.stringify({ error: 'SCANNER_UNAVAILABLE', details: errorMsg }),
        scannerName: this.name,
        scannerVersion: 'unknown',
        imageTag: target.imageTag,
        imageDigest: target.imageDigest,
        durationSeconds: 1,
        scannedAt: new Date(),
        errorCategory: 'SCANNER_UNAVAILABLE',
        errorMessage: errorMsg,
        logs: logs.map((l) => sanitizeLog(l)),
      }
    }

    const scannerVersion = availability.version || '0.76.1'

    // Controlled docker run arguments
    // Mounting Docker socket only for scanning the local Docker daemon image cache
    // and persisting vulnerability database in a named volume
    const dockerArgs = [
      'run',
      '--rm',
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
      '-v',
      'deployforge_trivy_cache:/root/.cache',
      '--network',
      'bridge',
      this.dockerImage,
      'image',
      '--format',
      'json',
      '--quiet',
      target.imageTag,
    ]

    return new Promise<ScanExecutionResult>((resolve) => {
      let stdoutData = ''
      let stderrData = ''
      let isTimedOut = false

      const child = spawn('docker', dockerArgs, {
        windowsHide: true,
      })

      const timeoutTimer = setTimeout(() => {
        isTimedOut = true
        child.kill('SIGKILL')
      }, timeoutSeconds * 1000)

      child.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString()
      })

      child.on('close', (code) => {
        clearTimeout(timeoutTimer)
        const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))

        if (isTimedOut) {
          logs.push(`[Trivy Worker ERROR] Scan execution timed out after ${timeoutSeconds}s.`)
          return resolve({
            success: false,
            status: 'FAILED',
            scanResult: 'ERROR',
            blockingPolicyViolated: false,
            severityThreshold: threshold,
            summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
            vulnerabilities: [],
            rawSanitizedReport: JSON.stringify({ error: 'TIMEOUT', timeoutSeconds }),
            scannerName: this.name,
            scannerVersion,
            imageTag: target.imageTag,
            imageDigest: target.imageDigest,
            durationSeconds,
            scannedAt: new Date(),
            errorCategory: 'TIMEOUT',
            errorMessage: `Scan timed out after exceeding limit of ${timeoutSeconds}s.`,
            logs: logs.map((l) => sanitizeLog(l)),
          })
        }

        // Check for DB download errors
        const combinedError = stderrData + '\n' + stdoutData
        if (
          /failed to download vulnerability DB|failed to download DB|download error|403 Forbidden|connection refused/i.test(
            combinedError
          ) &&
          !stdoutData.trim().startsWith('{')
        ) {
          logs.push(`[Trivy Worker ERROR] Vulnerability database download error.`)
          return resolve({
            success: false,
            status: 'FAILED',
            scanResult: 'ERROR',
            blockingPolicyViolated: false,
            severityThreshold: threshold,
            summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
            vulnerabilities: [],
            rawSanitizedReport: JSON.stringify({
              error: 'DB_DOWNLOAD_ERROR',
              details: sanitizeLog(stderrData.slice(0, 500)),
            }),
            scannerName: this.name,
            scannerVersion,
            imageTag: target.imageTag,
            imageDigest: target.imageDigest,
            durationSeconds,
            scannedAt: new Date(),
            errorCategory: 'DB_DOWNLOAD_ERROR',
            errorMessage: 'Trivy database update failed. Check network connectivity or registry rate limits.',
            logs: logs.map((l) => sanitizeLog(l)),
          })
        }

        // Check if output is empty or non-zero with no JSON
        if (code !== 0 && !stdoutData.trim().startsWith('{')) {
          logs.push(`[Trivy Worker ERROR] Scanner process exited with code ${code}: ${stderrData.slice(0, 300)}`)
          return resolve({
            success: false,
            status: 'FAILED',
            scanResult: 'ERROR',
            blockingPolicyViolated: false,
            severityThreshold: threshold,
            summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
            vulnerabilities: [],
            rawSanitizedReport: JSON.stringify({
              error: 'PROCESS_CRASH',
              exitCode: code,
              stderr: sanitizeLog(stderrData),
            }),
            scannerName: this.name,
            scannerVersion,
            imageTag: target.imageTag,
            imageDigest: target.imageDigest,
            durationSeconds,
            scannedAt: new Date(),
            errorCategory: 'PROCESS_CRASH',
            errorMessage: `Trivy container process failed with exit code ${code}.`,
            logs: logs.map((l) => sanitizeLog(l)),
          })
        }

        // Parse and normalize JSON
        try {
          const { vulnerabilities, summary, blockingPolicyViolated, sanitizedReportJson } =
            normalizeTrivyReport(stdoutData, threshold)

          logs.push(
            `[Trivy Worker] Scan completed. Found ${summary.critical} Critical, ${summary.high} High, ${summary.medium} Medium, ${summary.low} Low.`
          )
          logs.push(
            `[Trivy Worker Policy] Configured threshold: ${threshold}. Policy violated: ${
              blockingPolicyViolated ? 'YES (Scan BLOCKED)' : 'NO (Scan PASSED)'
            }`
          )

          return resolve({
            success: !blockingPolicyViolated,
            status: 'COMPLETED',
            scanResult: blockingPolicyViolated ? 'BLOCKED' : 'PASSED',
            blockingPolicyViolated,
            severityThreshold: threshold,
            summary,
            vulnerabilities,
            rawSanitizedReport: sanitizedReportJson,
            scannerName: this.name,
            scannerVersion,
            imageTag: target.imageTag,
            imageDigest: target.imageDigest,
            durationSeconds,
            scannedAt: new Date(),
            errorMessage: blockingPolicyViolated
              ? `Policy violation: ${summary.critical} critical and ${summary.high} high vulnerabilities meet or exceed threshold ${threshold}.`
              : undefined,
            logs: logs.map((l) => sanitizeLog(l)),
          })
        } catch {
          logs.push(`[Trivy Worker ERROR] Failed to parse Trivy output as valid JSON.`)
          return resolve({
            success: false,
            status: 'FAILED',
            scanResult: 'ERROR',
            blockingPolicyViolated: false,
            severityThreshold: threshold,
            summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
            vulnerabilities: [],
            rawSanitizedReport: JSON.stringify({ error: 'MALFORMED_OUTPUT' }),
            scannerName: this.name,
            scannerVersion,
            imageTag: target.imageTag,
            imageDigest: target.imageDigest,
            durationSeconds,
            scannedAt: new Date(),
            errorCategory: 'MALFORMED_OUTPUT',
            errorMessage: 'MALFORMED_OUTPUT: Trivy produced an invalid or corrupted scan report.',
            logs: logs.map((l) => sanitizeLog(l)),
          })
        }
      })

      child.on('error', (err) => {
        clearTimeout(timeoutTimer)
        const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))
        logs.push(`[Trivy Worker ERROR] Subprocess error: ${err.message}`)
        resolve({
          success: false,
          status: 'FAILED',
          scanResult: 'ERROR',
          blockingPolicyViolated: false,
          severityThreshold: threshold,
          summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
          vulnerabilities: [],
          rawSanitizedReport: JSON.stringify({ error: 'SCANNER_UNAVAILABLE', details: err.message }),
          scannerName: this.name,
          scannerVersion,
          imageTag: target.imageTag,
          imageDigest: target.imageDigest,
          durationSeconds,
          scannedAt: new Date(),
          errorCategory: 'SCANNER_UNAVAILABLE',
          errorMessage: `Failed to spawn Trivy container worker: ${err.message}`,
          logs: logs.map((l) => sanitizeLog(l)),
        })
      })
    })
  }
}
