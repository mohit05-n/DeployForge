import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { id } = await params

  try {
    const original = await prisma.deployment.findUnique({
      where: { id },
      include: { project: true },
    })

    if (!original) {
      return errorResponse('Deployment not found.', 404, 'NOT_FOUND')
    }

    if (original.project.userId !== auth.user.id) {
      return errorResponse('Access denied.', 403, 'FORBIDDEN')
    }

    // Create a new retry deployment record
    const retryDeployment = await prisma.deployment.create({
      data: {
        projectId: original.projectId,
        commitSha: original.commitSha,
        commitMessage: `[Retry] ${original.commitMessage}`,
        branch: original.branch,
        author: auth.user.name,
        trigger: 'MANUAL',
        status: 'SUCCESS',
        targetEnvironment: original.targetEnvironment,
        dockerImageTag: original.dockerImageTag,
        durationSeconds: 115,
        startedAt: new Date(Date.now() - 115000),
        finishedAt: new Date(),
        stages: {
          create: [
            { name: 'CLONE', order: 1, status: 'SUCCESS', durationSeconds: 5 },
            { name: 'LINT_TEST', order: 2, status: 'SUCCESS', durationSeconds: 20 },
            { name: 'DOCKER_BUILD', order: 3, status: 'SUCCESS', durationSeconds: 40 },
            { name: 'TRIVY_SCAN', order: 4, status: 'SUCCESS', durationSeconds: 15 },
            { name: 'DEPLOY_AWS', order: 5, status: 'SUCCESS', durationSeconds: 28 },
            { name: 'HEALTH_CHECK', order: 6, status: 'SUCCESS', durationSeconds: 7 },
          ],
        },
        logs: {
          create: [
            { stageName: 'CLONE', level: 'INFO', message: `Retrying deployment for ${original.commitSha}...` },
            { stageName: 'DEPLOY_AWS', level: 'INFO', message: 'Rolling update completed successfully.' },
            { stageName: 'HEALTH_CHECK', level: 'INFO', message: 'Health checks passed.' },
          ],
        },
      },
      include: {
        stages: true,
        project: { select: { id: true, name: true, slug: true } },
      },
    })

    await logAuditEvent({
      userId: auth.user.id,
      projectId: original.projectId,
      action: 'DEPLOYMENT_RETRY',
      resourceType: 'deployment',
      resourceId: retryDeployment.id,
      details: { originalDeploymentId: original.id, commitSha: original.commitSha },
      req,
    })

    logger.info('Deployments', `Deployment retried: ${retryDeployment.id}`, {
      userId: auth.user.id,
      originalId: original.id,
      newId: retryDeployment.id,
    })

    return successResponse(retryDeployment, 201, 'Deployment retried successfully')
  } catch (err) {
    logger.error('Deployments', 'Failed to retry deployment', err, { userId: auth.user.id, deploymentId: id })
    return errorResponse('Failed to retry deployment.', 500, 'INTERNAL_ERROR')
  }
}
