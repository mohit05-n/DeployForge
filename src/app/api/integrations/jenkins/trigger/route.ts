import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { verifyProjectAccess } from '@/lib/server/project-auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'
import { jenkinsClient } from '@/lib/server/jenkins'

const TriggerSchema = z.object({
  projectId: z.string().optional(),
  deploymentId: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().regex(/^[a-fA-F0-9]{7,40}$/, 'Commit SHA must be 7-40 hex characters').optional(),
  jobName: z.string().optional(),
  requireApproval: z.boolean().optional(),
})

export async function POST(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const rawBody = await req.json().catch(() => ({}))
    const parsed = TriggerSchema.safeParse(rawBody)

    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors[0]?.message || 'Invalid trigger payload.',
        400,
        'VALIDATION_ERROR',
        parsed.error.format()
      )
    }

    const { projectId, branch, jobName, requireApproval } = parsed.data
    let { deploymentId, commitSha } = parsed.data
    const targetJob = jobName || jenkinsClient.jobName

    // If projectId is provided, verify project ownership and tenant isolation
    if (projectId) {
      const { project, error } = await verifyProjectAccess(projectId, auth.user.id)
      if (error || !project) {
        return error || errorResponse('Project not found.', 404, 'NOT_FOUND')
      }

      const targetBranch = branch || project.branch || 'main'

      // If no deploymentId provided, create a deployment record linked to this project
      if (!deploymentId) {
        const generatedSha = commitSha || Math.random().toString(16).substring(2, 9)
        commitSha = generatedSha

        const newDeployment = await prisma.deployment.create({
          data: {
            projectId: project.id,
            commitSha: generatedSha,
            commitMessage: `Triggered via Jenkins CI (${targetJob})`,
            branch: targetBranch,
            author: auth.user.name,
            trigger: 'MANUAL',
            status: 'RUNNING',
            startedAt: new Date(),
            stages: {
              create: [
                { name: 'CLONE', order: 1, status: 'SUCCESS', durationSeconds: 3, startedAt: new Date(), finishedAt: new Date() },
                { name: 'LINT_TEST', order: 2, status: 'RUNNING', startedAt: new Date() },
                { name: 'DOCKER_BUILD', order: 3, status: 'PENDING' },
                { name: 'TRIVY_SCAN', order: 4, status: 'PENDING' },
                { name: 'TERRAFORM_PLAN', order: 5, status: 'PENDING' },
                { name: 'DEPLOY_AWS', order: 6, status: 'PENDING' },
                { name: 'HEALTH_CHECK', order: 7, status: 'PENDING' },
              ],
            },
            logs: {
              create: [
                { stageName: 'CLONE', level: 'INFO', message: `Initializing Jenkins build dispatch for ${project.name} (${targetBranch}).` },
              ],
            },
          },
        })
        deploymentId = newDeployment.id
      }

      // Trigger build with project scoping
      const queueResult = await jenkinsClient.triggerDeploymentForUser(deploymentId, auth.user.id, {
        jobName: targetJob,
        requireApproval,
      })

      if (!queueResult.success) {
        logger.warn('JenkinsTrigger', `Failed to queue Jenkins build for deployment ${deploymentId}`, {
          projectId: project.id,
          error: queueResult.error,
        })
        return errorResponse(
          queueResult.error || 'Failed to queue Jenkins job.',
          502,
          'JENKINS_DISPATCH_ERROR'
        )
      }

      return successResponse({
        success: true,
        deploymentId,
        jobName: queueResult.jobName,
        queueId: queueResult.queueId,
        buildNumber: queueResult.buildNumber,
        status: queueResult.buildNumber ? 'BUILDING' : 'QUEUED',
        url: queueResult.url,
        isSimulated: queueResult.isSimulated,
        message: queueResult.isSimulated
          ? 'Simulated Jenkins build queued successfully (mock mode active).'
          : `Jenkins build queued for job "${queueResult.jobName}".`,
      }, 201)
    }

    // Direct job trigger from dashboard (without specific project)
    const queueResult = await jenkinsClient.triggerJob(targetJob, {
      BRANCH: branch || 'main',
      COMMIT_SHA: commitSha || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4',
    })

    if (!queueResult.success) {
      return errorResponse(
        queueResult.error || 'Failed to queue Jenkins job.',
        502,
        'JENKINS_DISPATCH_ERROR'
      )
    }

    return successResponse({
      success: true,
      jobName: queueResult.jobName,
      queueId: queueResult.queueId,
      buildNumber: queueResult.buildNumber,
      status: queueResult.buildNumber ? 'BUILDING' : 'QUEUED',
      url: queueResult.url,
      isSimulated: queueResult.isSimulated,
      message: queueResult.isSimulated
        ? 'Simulated Jenkins build queued successfully (mock mode active).'
        : `Jenkins build queued for job "${queueResult.jobName}".`,
    }, 201)
  } catch (err: unknown) {
    logger.error('JenkinsTrigger', 'Unexpected error triggering Jenkins build', err, {
      userId: auth.user.id,
    })
    return errorResponse('Failed to trigger Jenkins pipeline.', 500, 'INTERNAL_ERROR')
  }
}
