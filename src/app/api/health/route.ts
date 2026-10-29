import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/server/logger'

export async function GET() {
  const startTime = Date.now()
  let dbStatus = 'healthy'
  let dbLatencyMs = 0

  try {
    const t0 = Date.now()
    await prisma.$queryRaw`SELECT 1`
    dbLatencyMs = Date.now() - t0
  } catch (err) {
    dbStatus = 'unhealthy'
    logger.error('HealthCheck', 'Database ping failed', err)
  }

  const isHealthy = dbStatus === 'healthy'
  const statusCode = isHealthy ? 200 : 503

  const healthData = {
    status: isHealthy ? 'healthy' : 'degraded',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: Date.now() - startTime,
    components: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        provider: 'PostgreSQL',
      },
      api: {
        status: 'healthy',
      },
    },
  }

  return NextResponse.json(healthData, { status: statusCode })
}
