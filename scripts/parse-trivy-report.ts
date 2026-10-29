/**
 * DeployForge Trivy Security Report Parser & Policy Gate Evaluator
 *
 * Requirements:
 * 1. Parse Trivy 0.76.1 JSON reports.
 * 2. Count findings by severity (Critical, High, Medium, Low, Unknown).
 * 3. Enforce configurable security gate (default: HIGH, CRITICAL).
 * 4. Strictly distinguish policy violation from scanner execution errors.
 * 5. Generate normalized scan-summary.json.
 * 6. Sanitize report outputs (paths and secrets).
 */

import * as fs from 'fs'
import * as path from 'path'
import { sanitizeLog, sanitizeReportObject } from '../src/lib/server/security/normalizer'

export interface ParsedVulnerability {
  cveId: string
  severity: string
  packageName: string
  installedVersion: string
  fixedVersion?: string
  title: string
  description?: string
  primaryUrl?: string
}

export interface SecurityGateSummary {
  status: 'COMPLETED' | 'FAILED'
  scanResult: 'PASSED' | 'BLOCKED' | 'ERROR'
  blockingPolicyViolated: boolean
  severityThreshold: string
  scanner: string
  scannerVersion: string
  imageTag: string
  scannedAt: string
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  unknownCount: number
  totalCount: number
  errorMessage?: string
  errorCategory?: string
  vulnerabilities: ParsedVulnerability[]
}

export interface ParseOptions {
  reportPath: string
  imageTag?: string
  severityGate?: string // e.g. "HIGH,CRITICAL" or "CRITICAL"
  summaryOutputPath?: string
}

export function parseTrivyReport(options: ParseOptions): SecurityGateSummary {
  const { reportPath, imageTag = 'deployforge-app:latest', severityGate = 'HIGH,CRITICAL' } = options
  const scannedAt = new Date().toISOString()
  const gateLevels = severityGate.toUpperCase().split(',').map((s) => s.trim())

  // Check 1: File existence
  if (!fs.existsSync(reportPath)) {
    return {
      status: 'FAILED',
      scanResult: 'ERROR',
      blockingPolicyViolated: false,
      severityThreshold: severityGate,
      scanner: 'TRIVY',
      scannerVersion: '0.76.1',
      imageTag,
      scannedAt,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      unknownCount: 0,
      totalCount: 0,
      errorMessage: `Trivy scan report not found at: ${reportPath}`,
      errorCategory: 'MISSING_REPORT',
      vulnerabilities: [],
    }
  }

  // Check 2: Valid JSON
  let rawContent: string
  let parsedJson: any
  try {
    rawContent = fs.readFileSync(reportPath, 'utf8')
    parsedJson = JSON.parse(rawContent)
  } catch (err: any) {
    return {
      status: 'FAILED',
      scanResult: 'ERROR',
      blockingPolicyViolated: false,
      severityThreshold: severityGate,
      scanner: 'TRIVY',
      scannerVersion: '0.76.1',
      imageTag,
      scannedAt,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      unknownCount: 0,
      totalCount: 0,
      errorMessage: `Failed to parse Trivy JSON report: ${err.message}`,
      errorCategory: 'MALFORMED_OUTPUT',
      vulnerabilities: [],
    }
  }

  const results = parsedJson?.Results || []
  const vulns: ParsedVulnerability[] = []
  let criticalCount = 0
  let highCount = 0
  let mediumCount = 0
  let lowCount = 0
  let unknownCount = 0

  for (const res of results) {
    // Process Vulnerabilities
    for (const v of res.Vulnerabilities || []) {
      const sev = (v.Severity || 'UNKNOWN').toUpperCase()
      if (sev === 'CRITICAL') criticalCount++
      else if (sev === 'HIGH') highCount++
      else if (sev === 'MEDIUM') mediumCount++
      else if (sev === 'LOW') lowCount++
      else unknownCount++

      vulns.push({
        cveId: v.VulnerabilityID || 'UNKNOWN_CVE',
        severity: sev,
        packageName: v.PkgName || 'unknown_pkg',
        installedVersion: v.InstalledVersion || 'unknown',
        fixedVersion: v.FixedVersion,
        title: sanitizeLog(v.Title || v.VulnerabilityID || 'Security Advisory'),
        description: sanitizeLog(v.Description || ''),
        primaryUrl: v.PrimaryURL,
      })
    }

    // Process Secrets as High / Critical findings
    for (const s of res.Secrets || []) {
      const sev = (s.Severity || 'HIGH').toUpperCase()
      if (sev === 'CRITICAL') criticalCount++
      else highCount++

      vulns.push({
        cveId: `SECRET-${s.RuleID || 'DETECTED'}`,
        severity: sev,
        packageName: sanitizeLog(s.Title || s.Category || 'Exposed Secret'),
        installedVersion: 'detected',
        title: `Exposed Secret Token (${s.RuleID})`,
        description: `Potential secret token detected in ${sanitizeLog(s.Target || '')}`,
      })
    }
  }

  const totalCount = criticalCount + highCount + mediumCount + lowCount + unknownCount

  // Evaluate Policy Gate
  let blockingCount = 0
  if (gateLevels.includes('CRITICAL')) blockingCount += criticalCount
  if (gateLevels.includes('HIGH')) blockingCount += highCount
  if (gateLevels.includes('MEDIUM')) blockingCount += mediumCount
  if (gateLevels.includes('LOW')) blockingCount += lowCount

  const isBlocked = blockingCount > 0

  const summary: SecurityGateSummary = {
    status: 'COMPLETED',
    scanResult: isBlocked ? 'BLOCKED' : 'PASSED',
    blockingPolicyViolated: isBlocked,
    severityThreshold: severityGate,
    scanner: 'TRIVY',
    scannerVersion: '0.76.1',
    imageTag,
    scannedAt,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    unknownCount,
    totalCount,
    errorMessage: isBlocked
      ? `Security Gate Failure: Found ${blockingCount} blocking findings exceeding threshold (${severityGate}). Critical: ${criticalCount}, High: ${highCount}.`
      : undefined,
    vulnerabilities: vulns,
  }

  if (options.summaryOutputPath) {
    fs.mkdirSync(path.dirname(options.summaryOutputPath), { recursive: true })
    fs.writeFileSync(options.summaryOutputPath, JSON.stringify(summary, null, 2), 'utf8')
  }

  return summary
}

// CLI Execution if run directly
if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/parse-trivy-report.ts <trivy-report.json> [--image <tag>] [--gate <HIGH,CRITICAL>] [--out <summary.json>]')
    process.exit(2)
  }

  const reportPath = args[0]
  let imageTag = 'deployforge-app:latest'
  let severityGate = 'HIGH,CRITICAL'
  let summaryOutputPath: string | undefined

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--image' && args[i + 1]) imageTag = args[++i]
    if (args[i] === '--gate' && args[i + 1]) severityGate = args[++i]
    if (args[i] === '--out' && args[i + 1]) summaryOutputPath = args[++i]
  }

  const result = parseTrivyReport({ reportPath, imageTag, severityGate, summaryOutputPath })

  console.log('======================================================')
  console.log('       DeployForge Security Gate Assessment           ')
  console.log('======================================================')
  console.log(`Image       : ${result.imageTag}`)
  console.log(`Status      : ${result.status}`)
  console.log(`Result      : ${result.scanResult}`)
  console.log(`Gate Policy : ${result.severityThreshold}`)
  console.log(`Critical    : ${result.criticalCount}`)
  console.log(`High        : ${result.highCount}`)
  console.log(`Medium      : ${result.mediumCount}`)
  console.log(`Low         : ${result.lowCount}`)
  console.log(`Total       : ${result.totalCount}`)
  console.log('------------------------------------------------------')

  if (result.scanResult === 'ERROR') {
    console.error(`❌ SCANNER ERROR: ${result.errorMessage}`)
    process.exit(2)
  } else if (result.scanResult === 'BLOCKED') {
    console.error(`🚨 POLICY VIOLATION: ${result.errorMessage}`)
    process.exit(1)
  } else {
    console.log('✅ SECURITY GATE PASSED: Zero blocking findings detected.')
    process.exit(0)
  }
}
