import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

  try {
    const events = await prisma.auditEvent.findMany({
      where: {
        userId: auth.user.id,
        ...(projectId ? { projectId } : {}),
      },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const parsedEvents = events.map((ev) => ({
      ...ev,
      details: ev.details ? JSON.parse(ev.details) : null,
    }))

    return successResponse(parsedEvents)
  } catch (err) {
    logger.error('Audit', 'Failed to retrieve audit events', err, { userId: auth.user.id })
    return errorResponse('Failed to retrieve audit logs.', 500, 'DATABASE_ERROR')
  }
}
