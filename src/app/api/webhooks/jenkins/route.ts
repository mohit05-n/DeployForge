/**
 * DeployForge Jenkins Inbound Webhook Callback Receiver
 *
 * Requirements:
 * 1. Authenticate and authorize every callback to DeployForge.
 * 2. Publish structured job status and safe redacted log excerpts back to database.
 * 3. Update deployment records and pipeline stages idempotently.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/server/logger'
import { logAuditEvent } from '@/lib/server/audit'
import {
  JenkinsCallbackPayload,
  verifyCallbackToken,
  redactConsoleLogs,
} from '@/lib/server/jenkins'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  
  try {
    const body: JenkinsCallbackPayload = await req.json()
    const { deploymentId, status, stageName, stageStatus, dockerImageTag, summary, logs } = body

    if (!deploymentId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'deploymentId is required in callback payload.' } },
        { status: 400 }
      )
    }

    // 1. Authenticate and authorize the callback token
    const isAuthorized = verifyCallbackToken(authHeader, deploymentId)
    if (!isAuthorized) {
      logger.warn('JenkinsWebhook', `Rejected unauthorized callback for deployment ${deploymentId}`)
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing Jenkins callback authorization token.' } },
        { status: 401 }
      )
    }

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true, stages: true },
    })

    if (!deployment) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Deployment ${deploymentId} not found.` } },
        { status: 404 }
      )
    }

    // 2. Persist redacted logs
    if (logs && Array.isArray(logs) && logs.length > 0) {
      await prisma.deploymentLog.createMany({
        data: logs.map((l) => ({
          deploymentId: deployment.id,
          stageName: stageName || 'JENKINS_CI',
          level: l.level || 'INFO',
          message: redactConsoleLogs(l.message),
          timestamp: l.timestamp ? new Date(l.timestamp) : new Date(),
        })),
      })
    }

    // 3. Update matching DeploymentStage if provided
    if (stageName) {
      const stage = deployment.stages.find((s) => s.name === stageName)
      if (stage) {
        await prisma.deploymentStage.update({
          where: { id: stage.id },
          data: {
            status: stageStatus || (status === 'SUCCESS' ? 'SUCCESS' : status === 'FAILED' ? 'FAILED' : 'RUNNING'),
            finishedAt: stageStatus === 'SUCCESS' || stageStatus === 'FAILED' ? new Date() : undefined,
          },
        })
      }
    }

    // 4. Ingest Security Scan results if reported by Jenkins
    if (body.securityScan) {
      const scan = body.securityScan
      const resolvedTag =
        dockerImageTag ||
        deployment.dockerImageTag ||
        `${deployment.project.slug}:${deployment.commitSha.substring(0, 7)}`

      const rawJson =
        typeof scan.rawReportJson === 'string'
          ? scan.rawReportJson
          : scan.rawReportJson
          ? JSON.stringify(scan.rawReportJson)
          : null

      const createdScan = await prisma.securityScan.create({
        data: {
          projectId: deployment.projectId,
          deploymentId: deployment.id,
          commitSha: deployment.commitSha,
          imageTag: resolvedTag,
          scanner: scan.scanner || 'TRIVY',
          scannerVersion: scan.scannerVersion || '0.76.1',
          status: scan.status || (scan.scanResult === 'ERROR' ? 'FAILED' : 'COMPLETED'),
          scanResult: scan.scanResult, // 'PASSED' | 'BLOCKED' | 'ERROR'
          blockingPolicyViolated:
            scan.blockingPolicyViolated ?? (scan.scanResult === 'BLOCKED'),
          severityThreshold:
            scan.severityThreshold || deployment.project.securityThreshold || 'CRITICAL',
          criticalCount: scan.criticalCount ?? 0,
          highCount: scan.highCount ?? 0,
          mediumCount: scan.mediumCount ?? 0,
          lowCount: scan.lowCount ?? 0,
          unknownCount: scan.unknownCount ?? 0,
          totalCount:
            scan.totalCount ??
            (scan.criticalCount ?? 0) +
              (scan.highCount ?? 0) +
              (scan.mediumCount ?? 0) +
              (scan.lowCount ?? 0),
          rawReportJson: rawJson,
          errorMessage:
            scan.errorMessage ||
            (scan.scanResult === 'BLOCKED' ? scan.errorMessage || summary : undefined),
          errorCategory: scan.errorCategory,
          durationSeconds: scan.durationSeconds,
          scannedAt: scan.scannedAt ? new Date(scan.scannedAt) : new Date(),
          vulnerabilities:
            scan.vulnerabilities && Array.isArray(scan.vulnerabilities)
              ? {
                  create: scan.vulnerabilities.map((v) => ({
                    cveId: v.cveId,
                    severity: v.severity,
                    packageName: v.packageName,
                    installedVersion: v.installedVersion,
                    fixedVersion: v.fixedVersion,
                    title: v.title,
                    description: v.description,
                    primaryUrl: v.primaryUrl,
                  })),
                }
              : undefined,
        },
      })

      // Ensure SECURITY_SCAN stage is updated or created
      const secStage = deployment.stages.find((s) => s.name === 'SECURITY_SCAN' || s.name === 'TRIVY_SCAN')
      if (secStage) {
        await prisma.deploymentStage.update({
          where: { id: secStage.id },
          data: {
            status: scan.scanResult === 'PASSED' ? 'SUCCESS' : 'FAILED',
            durationSeconds: scan.durationSeconds ?? secStage.durationSeconds,
            errorMessage: scan.scanResult === 'PASSED' ? null : scan.errorMessage || summary,
            finishedAt: new Date(),
          },
        })
      }

      await logAuditEvent({
        userId: deployment.project.userId,
        projectId: deployment.projectId,
        action: 'SECURITY_SCAN_COMPLETED',
        resourceType: 'SECURITY_SCAN',
        resourceId: createdScan.id,
        details: {
          source: 'JENKINS_PIPELINE',
          scanResult: scan.scanResult,
          criticalCount: scan.criticalCount,
          highCount: scan.highCount,
          imageTag: resolvedTag,
        },
        req,
      })
    }

    // 5. Update overall Deployment status
    if (status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED') {
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: status === 'SUCCESS' ? 'SUCCESS' : status === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
          dockerImageTag: body.publishedImageUri || dockerImageTag || deployment.dockerImageTag,
          errorMessage: status === 'FAILED' ? summary : undefined,
          finishedAt: new Date(),
        },
      })
    }

    await logAuditEvent({
      userId: deployment.project.userId,
      projectId: deployment.projectId,
      action: 'JENKINS_CALLBACK_RECEIVED',
      resourceType: 'deployment',
      resourceId: deployment.id,
      details: {
        stageName,
        stageStatus,
        status,
        summary,
        buildNumber: body.buildNumber,
        publishedImageUri: body.publishedImageUri,
      },
      req,
    })

    logger.info('JenkinsWebhook', `Processed callback for deployment ${deploymentId}: status=${status}, stage=${stageName}`, {
      deploymentId,
      status,
      stageName,
    })

    return NextResponse.json({
      success: true,
      processed: true,
      deploymentId,
      status,
      stageName,
    })
  } catch (err) {
    logger.error('JenkinsWebhook', 'Failed to process Jenkins callback', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to process callback.' } },
      { status: 500 }
    )
  }
}
