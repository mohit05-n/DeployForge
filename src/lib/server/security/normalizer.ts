/**
 * DeployForge Security Scanner Normalizer and Sanitizer
 *
 * Requirements:
 * 1. Normalize severity, vulnerability ID, package, installed version, fixed version, and timestamp.
 * 2. Sanitize and redact internal file paths and sensitive tokens from reports and logs.
 * 3. Enforce configurable severity thresholds and determine policy violation.
 */

import {
  NormalizedVulnerability,
  ScanSeverity,
  ScanSummary,
  SEVERITY_RANKS,
  SeverityThreshold,
  THRESHOLD_RANKS,
} from './types'

// Patterns to scrub sensitive system and file paths
const PATH_PATTERNS = [
  /[A-Za-z]:\\[^"'\s\n\r]+/g,                  // Windows absolute paths (e.g. E:\DeployForge\...)
  /\/var\/jenkins_home\/[^\s"']+/g,            // Jenkins workspace paths
  /\/home\/[^\s"']+/g,                         // Linux home paths
  /\/root\/[^\s"']+/g,                         // Linux root paths
  /\/Users\/[^\s"']+/g,                        // macOS / Windows user paths
  /\/app\/[a-zA-Z0-9_\-\.\/]+/g,               // Internal container paths
]

// Patterns to scrub secrets, keys, and tokens
const SECRET_PATTERNS = [
  /([A-Za-z0-9_-]{20,40})/g,                  // Generic tokens / hashes if labeled
  /(password|secret|token|key|credential|jwt)\s*[:=]\s*["']?([^"'\s]+)["']?/gi,
  /bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi,
]

/**
 * Sanitizes any string (e.g. log line or raw output), replacing host paths and secrets.
 */
export function sanitizeLog(text: string): string {
  if (!text) return ''

  let sanitized = text

  // Redact secrets with quotes or bare values
  sanitized = sanitized.replace(
    /(password|secret|token|key|credential|jwt)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1: "[REDACTED]"'
  )
  // Second pass for chained keywords like "secret: password=..."
  sanitized = sanitized.replace(
    /(password|secret|token|key|credential|jwt)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1: "[REDACTED]"'
  )
  sanitized = sanitized.replace(/bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]')

  // Redact local / host file paths
  for (const pattern of PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, '<sanitized-path>')
  }

  return sanitized
}

/**
 * Recursively scrubs file paths and secrets from a parsed JSON object.
 */
export function sanitizeReportObject(obj: any): any {
  if (obj === null || obj === undefined) return obj

  if (typeof obj === 'string') {
    return sanitizeLog(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeReportObject(item))
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      // If the key indicates sensitive info or raw path, sanitize
      if (/path|file|dir/i.test(key) && typeof value === 'string') {
        cleaned[key] = '<sanitized-path>'
      } else {
        cleaned[key] = sanitizeReportObject(value)
      }
    }
    return cleaned
  }

  return obj
}

/**
 * Normalizes a raw severity string into standardized ScanSeverity.
 */
export function normalizeSeverity(rawSeverity?: string): ScanSeverity {
  if (!rawSeverity) return 'UNKNOWN'
  const upper = rawSeverity.toUpperCase().trim()
  if (upper in SEVERITY_RANKS) {
    return upper as ScanSeverity
  }
  return 'UNKNOWN'
}

export interface NormalizationResult {
  vulnerabilities: NormalizedVulnerability[]
  summary: ScanSummary
  blockingPolicyViolated: boolean
  sanitizedReportJson: string
}

/**
 * Normalizes Trivy JSON report into standardized DeployForge records.
 */
export function normalizeTrivyReport(
  rawJsonOrString: string | Record<string, any>,
  severityThreshold: SeverityThreshold = 'CRITICAL'
): NormalizationResult {
  let parsed: any

  if (typeof rawJsonOrString === 'string') {
    try {
      parsed = JSON.parse(rawJsonOrString)
    } catch {
      throw new Error('MALFORMED_OUTPUT: Unable to parse Trivy JSON output.')
    }
  } else {
    parsed = rawJsonOrString
  }

  const vulnerabilities: NormalizedVulnerability[] = []
  const summary: ScanSummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    total: 0,
  }

  const thresholdRank = THRESHOLD_RANKS[severityThreshold] ?? THRESHOLD_RANKS.CRITICAL
  let blockingPolicyViolated = false

  // Trivy outputs schema with Results: [ { Target, Vulnerabilities: [ ... ] } ]
  const results = parsed.Results || (Array.isArray(parsed) ? parsed : [])

  for (const res of results) {
    const vulns = res.Vulnerabilities || []
    for (const v of vulns) {
      const severity = normalizeSeverity(v.Severity)
      const rank = SEVERITY_RANKS[severity]

      // Count summary
      switch (severity) {
        case 'CRITICAL':
          summary.critical++
          break
        case 'HIGH':
          summary.high++
          break
        case 'MEDIUM':
          summary.medium++
          break
        case 'LOW':
          summary.low++
          break
        default:
          summary.unknown++
          break
      }
      summary.total++

      // Check policy violation
      if (rank >= thresholdRank) {
        blockingPolicyViolated = true
      }

      // Safe date parsing
      let publishedAt: Date | null = null
      if (v.PublishedDate) {
        const d = new Date(v.PublishedDate)
        if (!isNaN(d.getTime())) {
          publishedAt = d
        }
      }

      vulnerabilities.push({
        cveId: v.VulnerabilityID || 'UNKNOWN-VULN',
        severity,
        packageName: v.PkgName || v.Package || 'unknown-package',
        installedVersion: v.InstalledVersion || 'unknown',
        fixedVersion: v.FixedVersion || null,
        title: v.Title ? sanitizeLog(v.Title) : null,
        description: v.Description ? sanitizeLog(v.Description) : null,
        primaryUrl: v.PrimaryURL || null,
        publishedAt,
      })
    }
  }

  // Create sanitized machine-readable JSON report
  const sanitizedReport = sanitizeReportObject(parsed)
  const sanitizedReportJson = JSON.stringify(sanitizedReport)

  return {
    vulnerabilities,
    summary,
    blockingPolicyViolated,
    sanitizedReportJson,
  }
}
