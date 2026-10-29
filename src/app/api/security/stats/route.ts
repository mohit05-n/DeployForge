import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const userProjects = await prisma.project.findMany({
      where: { userId: auth.user.id },
      select: { id: true },
    })

    const projectIds = userProjects.map((p) => p.id)

    if (projectIds.length === 0) {
      return successResponse({
        severities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
        scansCount: { total: 0, passed: 0, blocked: 0, failed: 0 },
        recentScans: [],
      })
    }

    const scans = await prisma.securityScan.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    // Aggregate severities from all scans
    const aggregates = await prisma.securityScan.aggregate({
      where: { projectId: { in: projectIds } },
      _sum: {
        criticalCount: true,
        highCount: true,
        mediumCount: true,
        lowCount: true,
        unknownCount: true,
        totalCount: true,
      },
      _count: {
        id: true,
      },
    })

    const passedCount = await prisma.securityScan.count({
      where: { projectId: { in: projectIds }, scanResult: 'PASSED' },
    })

    const blockedCount = await prisma.securityScan.count({
      where: { projectId: { in: projectIds }, scanResult: 'BLOCKED' },
    })

    const errorCount = await prisma.securityScan.count({
      where: { projectId: { in: projectIds }, scanResult: 'ERROR' },
    })

    return successResponse({
      severities: {
        critical: aggregates._sum.criticalCount || 0,
        high: aggregates._sum.highCount || 0,
        medium: aggregates._sum.mediumCount || 0,
        low: aggregates._sum.lowCount || 0,
        unknown: aggregates._sum.unknownCount || 0,
        total: aggregates._sum.totalCount || 0,
      },
      scansCount: {
        total: aggregates._count.id || 0,
        passed: passedCount,
        blocked: blockedCount,
        failed: errorCount,
      },
      recentScans: scans,
    })
  } catch (err) {
    logger.error('SecurityStats', 'Failed to calculate security stats', err, {
      userId: auth.user.id,
    })
    return errorResponse('Failed to calculate security stats.', 500, 'DATABASE_ERROR')
  }
}
