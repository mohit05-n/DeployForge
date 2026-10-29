import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { id } = await params

  try {
    const scan = await prisma.securityScan.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            userId: true,
            securityThreshold: true,
          },
        },
        deployment: {
          select: {
            id: true,
            commitSha: true,
            branch: true,
            status: true,
            createdAt: true,
          },
        },
        vulnerabilities: {
          orderBy: [
            { severity: 'asc' }, // Will sort in application code by rank
            { cveId: 'asc' },
          ],
        },
      },
    })

    if (!scan) {
      return errorResponse('Security scan not found.', 404, 'NOT_FOUND')
    }

    // Authorization check
    if (scan.project.userId !== auth.user.id) {
      return errorResponse('Access denied to this security scan.', 403, 'FORBIDDEN')
    }

    return successResponse(scan)
  } catch (err) {
    logger.error('SecurityScanDetails', `Failed to retrieve scan ${id}`, err, {
      userId: auth.user.id,
    })
    return errorResponse('Failed to retrieve security scan details.', 500, 'DATABASE_ERROR')
  }
}
