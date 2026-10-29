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
    const deployment = await prisma.deployment.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            userId: true,
            name: true,
            slug: true,
            repository: true,
            region: true,
            target: true,
            liveUrl: true,
          },
        },
        stages: {
          orderBy: { order: 'asc' },
        },
        logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    })

    if (!deployment) {
      return errorResponse('Deployment not found.', 404, 'NOT_FOUND')
    }

    // Verify ownership
    if (deployment.project.userId !== auth.user.id) {
      return errorResponse('You do not have permission to view this deployment.', 403, 'FORBIDDEN')
    }

    return successResponse(deployment)
  } catch (err) {
    logger.error('Deployments', 'Failed to retrieve deployment details', err, {
      userId: auth.user.id,
      deploymentId: id,
    })
    return errorResponse('Failed to retrieve deployment details.', 500, 'DATABASE_ERROR')
  }
}
