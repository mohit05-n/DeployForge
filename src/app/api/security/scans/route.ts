import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { verifyProjectAccess } from '@/lib/server/project-auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'
import {
  executeDirectSecurityScan,
  executeSecurityScanForDeployment,
  SeverityThreshold,
} from '@/lib/server/security'

const TriggerScanSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  deploymentId: z.string().optional(),
  imageTag: z.string().optional(),
  severityThreshold: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  scannerType: z.enum(['mock', 'docker', 'cli']).optional(),
  mockScenario: z
    .enum([
      'clean',
      'blocking',
      'non_blocking',
      'db_download_error',
      'timeout',
      'scanner_unavailable',
      'malformed_report',
    ])
    .optional(),
})

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const status = searchParams.get('status')
  const scanResult = searchParams.get('scanResult')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

  try {
    const scans = await prisma.securityScan.findMany({
      where: {
        project: {
          userId: auth.user.id,
          ...(projectId ? { id: projectId } : {}),
        },
        ...(status ? { status } : {}),
        ...(scanResult ? { scanResult } : {}),
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            repository: true,
            securityThreshold: true,
          },
        },
        deployment: {
          select: {
            id: true,
            commitSha: true,
            branch: true,
            status: true,
          },
        },
        vulnerabilities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return successResponse(scans)
  } catch (err) {
    logger.error('SecurityScans', 'Failed to retrieve security scans', err, {
      userId: auth.user.id,
    })
    return errorResponse('Failed to retrieve security scans.', 500, 'DATABASE_ERROR')
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const body = await req.json().catch(() => ({}))
    const parsed = TriggerScanSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse(
        'Validation failed: ' + parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const {
      projectId,
      deploymentId,
      imageTag,
      severityThreshold,
      scannerType,
      mockScenario,
    } = parsed.data

    // Authorize project ownership
    const projectAccess = await verifyProjectAccess(projectId, auth.user.id)
    if (!projectAccess.project) {
      return (
        projectAccess.error ||
        errorResponse('Project not found or access denied.', 404, 'NOT_FOUND')
      )
    }

    // If deploymentId is provided, run deployment security scan
    if (deploymentId) {
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
      })
      if (!deployment || deployment.projectId !== projectId) {
        return errorResponse('Deployment not found for this project.', 404, 'NOT_FOUND')
      }

      const scanResult = await executeSecurityScanForDeployment(deploymentId, {
        severityThreshold: severityThreshold as SeverityThreshold | undefined,
        scannerType,
        mockScenario,
        userId: auth.user.id,
      })

      return successResponse({
        message: scanResult.blockingPolicyViolated
          ? 'Security scan completed: BLOCKED by policy.'
          : scanResult.success
          ? 'Security scan completed: PASSED.'
          : 'Security scan failed: Scanner error.',
        scan: scanResult,
      })
    }

    // Direct image scan
    const resolvedImageTag =
      imageTag ||
      (await prisma.deployment
        .findFirst({
          where: { projectId, dockerImageTag: { not: null } },
          orderBy: { createdAt: 'desc' },
        })
        .then((d) => d?.dockerImageTag)) ||
      `${projectAccess.project.slug}:latest`

    const scanResult = await executeDirectSecurityScan(projectId, resolvedImageTag, {
      severityThreshold: severityThreshold as SeverityThreshold | undefined,
      scannerType,
      mockScenario,
      userId: auth.user.id,
    })

    return successResponse({
      message: scanResult.blockingPolicyViolated
        ? 'Security scan completed: BLOCKED by policy.'
        : scanResult.success
        ? 'Security scan completed: PASSED.'
        : 'Security scan failed: Scanner error.',
      scan: scanResult,
    })
  } catch (err) {
    logger.error('SecurityScans', 'Failed to execute security scan', err, {
      userId: auth.user.id,
    })
    return errorResponse(
      (err as Error).message || 'Failed to trigger security scan.',
      500,
      'SCAN_TRIGGER_ERROR'
    )
  }
}
