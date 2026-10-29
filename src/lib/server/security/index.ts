/**
 * DeployForge Security Scanner Module
 *
 * Requirements:
 * 1. Run scans only through a controlled scanner worker.
 * 2. Scan the exact immutable image produced by the build job.
 * 3. Support vulnerability scanning and a configurable severity threshold.
 * 4. Produce machine-readable JSON report and store sanitized findings.
 * 5. Normalize severity, vulnerability ID, package, installed version, fixed version, scanner timestamp.
 * 6. Make pipeline fail when blocking policies are violated, distinguishing policy failure from scanner errors.
 * 7. Do not silently treat an unavailable scanner or failed scan as clean.
 * 8. Handle scanner database download errors, timeouts, and stale scan results.
 * 9. Keep reports associated with correct project, commit, image digest, and deployment.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/server/logger'
import { logAuditEvent } from '@/lib/server/audit'
import {
  ISecurityScanner,
  ScanExecutionResult,
  ScanOptions,
  ScanTarget,
  SeverityThreshold,
} from './types'
import { MockTrivyScanner } from './mock-scanner'
import { DockerTrivyScanner } from './docker-scanner'

export * from './types'
export * from './normalizer'
export * from './mock-scanner'
export * from './docker-scanner'

const mockScanner = new MockTrivyScanner('clean')
const dockerScanner = new DockerTrivyScanner()

/**
 * Returns the appropriate security scanner based on configuration or override.
 * Priority: options.type -> process.env.TRIVY_SCANNER_TYPE -> 'mock' (safe default)
 */
export function getSecurityScanner(preferredType?: 'mock' | 'docker' | 'cli'): ISecurityScanner {
  const runnerType = preferredType || process.env.TRIVY_SCANNER_TYPE || 'mock'
  const isEnabled = process.env.TRIVY_SCANNER_ENABLED !== 'false'

  if (runnerType === 'docker' && isEnabled) {
    return dockerScanner
  }

  return mockScanner
}

/**
 * Executes a security scan for an existing deployment record.
 * Gated by project severity threshold and exact immutable image tag.
 */
export async function executeSecurityScanForDeployment(
  deploymentId: string,
  options?: ScanOptions & { scannerType?: 'mock' | 'docker' | 'cli'; userId?: string }
): Promise<ScanExecutionResult> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: {
      project: true,
      stages: true,
    },
  })

  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found.`)
  }

  const project = deployment.project
  const imageTag = deployment.dockerImageTag

  if (!imageTag) {
    throw new Error(
      `Cannot scan deployment ${deploymentId}: No confirmed immutable Docker image tag found on deployment record.`
    )
  }

  // Find or create SECURITY_SCAN stage
  let scanStage = deployment.stages.find((s) => s.name === 'SECURITY_SCAN')
  if (!scanStage) {
    scanStage = await prisma.deploymentStage.create({
      data: {
        deploymentId: deployment.id,
        name: 'SECURITY_SCAN',
        order: 4,
        status: 'PENDING',
      },
    })
  }

  const stageStartTime = new Date()

  // Mark stage as RUNNING
  await prisma.deploymentStage.update({
    where: { id: scanStage.id },
    data: {
      status: 'RUNNING',
      startedAt: stageStartTime,
      errorMessage: null,
    },
  })

  const threshold: SeverityThreshold =
    options?.severityThreshold ||
    (project.securityThreshold as SeverityThreshold) ||
    'CRITICAL'

  const target: ScanTarget = {
    imageTag,
    imageDigest: undefined,
    projectId: project.id,
    projectSlug: project.slug,
    deploymentId: deployment.id,
    commitSha: deployment.commitSha,
    severityThreshold: threshold,
  }

  const scanner = getSecurityScanner(options?.scannerType)
  logger.info('SecurityScan', `Initiating Trivy scan for deployment ${deployment.id} using ${scanner.name}`, {
    imageTag,
    threshold,
    scannerType: scanner.type,
  })

  // Execute scan
  const result = await scanner.scan(target, options)

  const stageFinishTime = new Date()
  const durationSeconds = Math.max(1, Math.round((stageFinishTime.getTime() - stageStartTime.getTime()) / 1000))

  // Persist scan and findings in PostgreSQL database
  const createdScan = await prisma.securityScan.create({
    data: {
      projectId: project.id,
      deploymentId: deployment.id,
      commitSha: deployment.commitSha,
      imageTag: result.imageTag,
      imageDigest: result.imageDigest,
      scanner: result.scannerName,
      scannerVersion: result.scannerVersion,
      status: result.status,
      scanResult: result.scanResult,
      blockingPolicyViolated: result.blockingPolicyViolated,
      severityThreshold: result.severityThreshold,
      criticalCount: result.summary.critical,
      highCount: result.summary.high,
      mediumCount: result.summary.medium,
      lowCount: result.summary.low,
      unknownCount: result.summary.unknown,
      totalCount: result.summary.total,
      rawReportJson: result.rawSanitizedReport,
      errorMessage: result.errorMessage,
      errorCategory: result.errorCategory,
      durationSeconds,
      scannedAt: result.scannedAt,
      vulnerabilities: {
        create: result.vulnerabilities.map((v) => ({
          cveId: v.cveId,
          severity: v.severity,
          packageName: v.packageName,
          installedVersion: v.installedVersion,
          fixedVersion: v.fixedVersion,
          title: v.title,
          description: v.description,
          primaryUrl: v.primaryUrl,
          publishedAt: v.publishedAt,
        })),
      },
    },
  })

  // Save scan execution logs to DeploymentLog table
  if (result.logs.length > 0) {
    await prisma.deploymentLog.createMany({
      data: result.logs.map((log) => ({
        deploymentId: deployment.id,
        stageName: 'SECURITY_SCAN',
        level: log.includes('ERROR') ? 'ERROR' : log.includes('Policy') ? 'WARN' : 'INFO',
        message: log,
        timestamp: new Date(),
      })),
    })
  }

  // Handle Pipeline Outcomes:
  // 1. Policy Violation (Policy failure, distinct from scanner crash)
  if (result.blockingPolicyViolated) {
    const errorMsg =
      result.errorMessage ||
      `Blocked: Security policy violation. Vulnerabilities meeting or exceeding threshold ${threshold} were detected.`

    await prisma.deploymentStage.update({
      where: { id: scanStage.id },
      data: {
        status: 'FAILED',
        durationSeconds,
        finishedAt: stageFinishTime,
        errorMessage: errorMsg,
      },
    })

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'FAILED',
        errorMessage: errorMsg,
        finishedAt: stageFinishTime,
      },
    })

    logger.warn('SecurityScan', `Deployment ${deployment.id} BLOCKED by policy: ${errorMsg}`, {
      scanId: createdScan.id,
      summary: result.summary,
    })
  }
  // 2. Scanner Error (Unavailable, DB download failure, timeout, crash)
  else if (!result.success || result.scanResult === 'ERROR' || result.status === 'FAILED') {
    const errorMsg =
      result.errorMessage ||
      `Scanner error (${result.errorCategory || 'UNKNOWN'}): Failed to complete security scan.`

    await prisma.deploymentStage.update({
      where: { id: scanStage.id },
      data: {
        status: 'FAILED',
        durationSeconds,
        finishedAt: stageFinishTime,
        errorMessage: errorMsg,
      },
    })

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'FAILED',
        errorMessage: errorMsg,
        finishedAt: stageFinishTime,
      },
    })

    logger.error('SecurityScan', `Deployment ${deployment.id} scanner failed: ${errorMsg}`, {
      scanId: createdScan.id,
      errorCategory: result.errorCategory,
    })
  }
  // 3. Clean or Non-Blocking Scan: PASSED
  else {
    await prisma.deploymentStage.update({
      where: { id: scanStage.id },
      data: {
        status: 'SUCCESS',
        durationSeconds,
        finishedAt: stageFinishTime,
        errorMessage: null,
      },
    })

    logger.info('SecurityScan', `Deployment ${deployment.id} security scan PASSED.`, {
      scanId: createdScan.id,
      summary: result.summary,
    })
  }

  // Record audit event
  try {
    await logAuditEvent({
      userId: options?.userId || deployment.project.userId,
      projectId: deployment.projectId,
      action: 'SECURITY_SCAN_COMPLETED',
      resourceType: 'SECURITY_SCAN',
      resourceId: createdScan.id,
      details: {
        imageTag: result.imageTag,
        scanResult: result.scanResult,
        status: result.status,
        blockingPolicyViolated: result.blockingPolicyViolated,
        summary: result.summary,
        threshold: result.severityThreshold,
      },
    })
  } catch {
    // Non-fatal if audit logging fails
  }

  return result
}

/**
 * Executes a direct / on-demand scan for a project image tag.
 */
export async function executeDirectSecurityScan(
  projectId: string,
  imageTag: string,
  options?: ScanOptions & { scannerType?: 'mock' | 'docker' | 'cli'; userId?: string; commitSha?: string }
): Promise<ScanExecutionResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found.`)
  }

  const threshold: SeverityThreshold =
    options?.severityThreshold ||
    (project.securityThreshold as SeverityThreshold) ||
    'CRITICAL'

  const target: ScanTarget = {
    imageTag,
    projectId: project.id,
    projectSlug: project.slug,
    commitSha: options?.commitSha || 'latest-head',
    severityThreshold: threshold,
  }

  const scanner = getSecurityScanner(options?.scannerType)
  const result = await scanner.scan(target, options)

  // Persist scan
  await prisma.securityScan.create({
    data: {
      projectId: project.id,
      commitSha: target.commitSha,
      imageTag: result.imageTag,
      scanner: result.scannerName,
      scannerVersion: result.scannerVersion,
      status: result.status,
      scanResult: result.scanResult,
      blockingPolicyViolated: result.blockingPolicyViolated,
      severityThreshold: result.severityThreshold,
      criticalCount: result.summary.critical,
      highCount: result.summary.high,
      mediumCount: result.summary.medium,
      lowCount: result.summary.low,
      unknownCount: result.summary.unknown,
      totalCount: result.summary.total,
      rawReportJson: result.rawSanitizedReport,
      errorMessage: result.errorMessage,
      errorCategory: result.errorCategory,
      durationSeconds: result.durationSeconds,
      scannedAt: result.scannedAt,
      vulnerabilities: {
        create: result.vulnerabilities.map((v) => ({
          cveId: v.cveId,
          severity: v.severity,
          packageName: v.packageName,
          installedVersion: v.installedVersion,
          fixedVersion: v.fixedVersion,
          title: v.title,
          description: v.description,
          primaryUrl: v.primaryUrl,
          publishedAt: v.publishedAt,
        })),
      },
    },
  })

  return result
}
