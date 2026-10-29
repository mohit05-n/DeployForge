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
  const queueIdParam = searchParams.get('queueId')

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

  let queueId: number | undefined
  if (queueIdParam) {
    const parsedQ = parseInt(queueIdParam, 10)
    if (!isNaN(parsedQ) && parsedQ > 0) {
      queueId = parsedQ
    }
  }

  // If deploymentId is given, authorize user access to that deployment's project
  if (deploymentId) {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { projectId: true, status: true },
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
    const status = await jenkinsClient.getBuildStatus(jobName, buildNumber, queueId)
    if (status.message && status.status === 'FAILURE' && status.buildNumber === 0) {
      const isNotFound = status.message.includes('not found') || status.message.includes('not exist')
      return errorResponse(
        status.message,
        isNotFound ? 404 : 502,
        isNotFound ? 'NOT_FOUND' : 'JENKINS_QUERY_ERROR'
      )
    }
    return successResponse(status)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('JenkinsBuildStatus', 'Failed to retrieve Jenkins build status', err, {
      userId: auth.user.id,
      jobName,
      buildNumber,
    })
    const isNotFound = errMsg.includes('not found') || errMsg.includes('not exist')
    return errorResponse(errMsg, isNotFound ? 404 : 500, isNotFound ? 'NOT_FOUND' : 'JENKINS_QUERY_ERROR')
  }
}
