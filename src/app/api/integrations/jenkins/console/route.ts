import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { verifyProjectAccess } from '@/lib/server/project-auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'
import { jenkinsClient } from '@/lib/server/jenkins'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { searchParams } = new URL(req.url)
  const deploymentId = searchParams.get('deploymentId')
  const jobName = searchParams.get('jobName') || jenkinsClient.jobName
  const buildNumberParam = searchParams.get('buildNumber')
  const offsetParam = searchParams.get('offset')
  const limitParam = searchParams.get('limit')

  let buildNumber: number | 'latest' = 'latest'
  if (buildNumberParam && buildNumberParam !== 'latest') {
    const parsed = parseInt(buildNumberParam, 10)
    if (isNaN(parsed) || parsed <= 0) {
      return errorResponse(
        `Invalid build number "${buildNumberParam}". Must be a positive integer or 'latest'.`,
        400,
        'VALIDATION_ERROR'
      )
    }
    buildNumber = parsed
  }

  const offset = offsetParam ? parseInt(offsetParam, 10) : 0
  const maxLines = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 200, 10), 1000) : 200

  if (deploymentId) {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { projectId: true },
    })

    if (!deployment) {
      return errorResponse('Deployment not found.', 404, 'NOT_FOUND')
    }

    const { error } = await verifyProjectAccess(deployment.projectId, auth.user.id)
    if (error) {
      return error
    }
  }

  try {
    const consoleLogs = await jenkinsClient.getConsoleOutput(jobName, buildNumber, offset, maxLines)
    if (consoleLogs.text.includes('not found') && consoleLogs.buildNumber === 0) {
      return errorResponse(consoleLogs.text, 404, 'NOT_FOUND')
    }
    return successResponse(consoleLogs)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('JenkinsConsoleOutput', 'Failed to retrieve console output', err, {
      userId: auth.user.id,
      jobName,
      buildNumber,
    })
    const isNotFound = errMsg.includes('not found') || errMsg.includes('not exist')
    return errorResponse(errMsg, isNotFound ? 404 : 500, isNotFound ? 'NOT_FOUND' : 'JENKINS_CONSOLE_ERROR')
  }
}
