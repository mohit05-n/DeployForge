import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'
import {
  githubService,
  awsService,
  jenkinsService,
  trivyService,
  terraformService,
  dockerService,
} from '@/services/integrations'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const records = await prisma.integrationRecord.findMany({
      where: { userId: auth.user.id },
      orderBy: { type: 'asc' },
    })

    // Parse config JSON safely
    const parsed = records.map((r) => ({
      ...r,
      config: r.configJson ? JSON.parse(r.configJson) : null,
      configJson: undefined,
    }))

    return successResponse(parsed)
  } catch (err) {
    logger.error('Integrations', 'Failed to retrieve integration records', err, { userId: auth.user.id })
    return errorResponse('Failed to retrieve integrations.', 500, 'DATABASE_ERROR')
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const body = await req.json().catch(() => ({}))
    const targetType = body.type as string | undefined

    // Query active service information abstractions
    const services = [
      githubService,
      awsService,
      jenkinsService,
      trivyService,
      terraformService,
      dockerService,
    ]

    const filtered = targetType
      ? services.filter((s) => s.provider === targetType.toUpperCase())
      : services

    const syncResults = await Promise.all(
      filtered.map(async (svc) => {
        const info = await svc.getInfo()
        const test = await svc.testConnection()

        const status = test.connected ? 'CONNECTED' : 'DISCONNECTED'
        const configJson = JSON.stringify({
          ...info.details,
          isSimulated: true,
          lastVerifiedMessage: test.message,
        })

        // Upsert into DB for this user
        const updated = await prisma.integrationRecord.upsert({
          where: {
            userId_type: {
              userId: auth.user.id,
              type: svc.provider,
            },
          },
          update: {
            status,
            name: svc.name,
            configJson,
            lastSyncAt: new Date(),
          },
          create: {
            userId: auth.user.id,
            type: svc.provider,
            name: svc.name,
            status,
            configJson,
            lastSyncAt: new Date(),
          },
        })

        return {
          type: svc.provider,
          name: svc.name,
          status: updated.status,
          isSimulated: true,
          message: test.message,
        }
      })
    )

    await logAuditEvent({
      userId: auth.user.id,
      action: 'INTEGRATION_SYNC',
      resourceType: 'integration',
      details: { syncedCount: syncResults.length },
      req,
    })

    return successResponse(syncResults, 200, 'Integrations status verified successfully')
  } catch (err) {
    logger.error('Integrations', 'Failed to sync integrations', err, { userId: auth.user.id })
    return errorResponse('Failed to synchronize integrations.', 500, 'INTERNAL_ERROR')
  }
}
