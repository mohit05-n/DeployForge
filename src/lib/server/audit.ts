import { prisma } from '@/lib/prisma'
import { logger } from './logger'
import { getClientIp } from './rate-limiter'

export interface LogAuditParams {
  userId?: string
  projectId?: string
  action: string
  resourceType: string
  resourceId?: string
  details?: Record<string, unknown>
  req?: Request
}

export async function logAuditEvent({
  userId,
  projectId,
  action,
  resourceType,
  resourceId,
  details,
  req,
}: LogAuditParams): Promise<void> {
  try {
    const ipAddress = req ? getClientIp(req) : '127.0.0.1'
    const userAgent = req?.headers.get('user-agent')?.slice(0, 255) || 'Unknown'

    // Mask any potential sensitive details before storing
    const safeDetails = details ? JSON.stringify(details) : null

    await prisma.auditEvent.create({
      data: {
        userId: userId || null,
        projectId: projectId || null,
        action,
        resourceType,
        resourceId: resourceId || null,
        details: safeDetails,
        ipAddress,
        userAgent,
      },
    })

    logger.info('AuditEvent', `Audit event recorded: ${action}`, {
      action,
      resourceType,
      resourceId,
      userId,
      projectId,
    })
  } catch (err) {
    // Audit logging should not crash the primary transaction, but log the error
    logger.error('AuditEvent', `Failed to record audit event: ${action}`, err)
  }
}
