import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'
import { jenkinsClient } from '@/lib/server/jenkins'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const status = await jenkinsClient.getConnectionStatus()
    return successResponse(status)
  } catch (err: unknown) {
    logger.error('JenkinsStatus', 'Failed to retrieve Jenkins connection status', err, {
      userId: auth.user.id,
    })
    return errorResponse(
      'Failed to inspect Jenkins connection status.',
      500,
      'JENKINS_STATUS_ERROR'
    )
  }
}
