import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'

export async function POST(req: Request) {
  const deliveryId = req.headers.get('x-github-delivery')
  const event = req.headers.get('x-github-event') || 'unknown'
  const signature = req.headers.get('x-hub-signature-256')

  // 1. Signature Header Presence
  if (!signature) {
    logger.warn('GitHubWebhook', 'Webhook rejected: Missing X-Hub-Signature-256 header')
    return errorResponse('Missing webhook signature header X-Hub-Signature-256', 401, 'MISSING_SIGNATURE')
  }

  // 2. Secret Configuration
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error('GitHubWebhook', 'Server misconfiguration: GITHUB_WEBHOOK_SECRET is not set')
    return errorResponse('Webhook secret is not configured on the server', 500, 'SECRET_NOT_CONFIGURED')
  }

  // 3. Read Raw Body
  const rawBody = await req.text()

  // 4. HMAC-SHA256 Signature Verification with constant-time equality
  const expectedSignature = `sha256=${crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex')}`

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    logger.warn('GitHubWebhook', 'Webhook rejected: Invalid signature mismatch')
    return errorResponse('Invalid webhook signature', 401, 'INVALID_SIGNATURE')
  }

  if (!deliveryId) {
    return errorResponse('Missing X-GitHub-Delivery header', 400, 'MISSING_DELIVERY_ID')
  }

  // 5. Idempotency Check: prevent duplicate processing of the same delivery
  const existingDelivery = await prisma.webhookDelivery.findUnique({
    where: { deliveryId },
  })

  if (existingDelivery) {
    logger.info('GitHubWebhook', `Delivery ${deliveryId} already processed (idempotent skipped)`)
    return successResponse({
      idempotent: true,
      message: 'Webhook delivery previously processed',
      deliveryId,
    })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch (err) {
    return errorResponse('Malformed JSON payload', 400, 'INVALID_JSON')
  }

  const repoFullName = payload?.repository?.full_name || payload?.repository?.name || 'unknown'

  // 6. Handle "ping" event (sent by GitHub when webhook is created)
  if (event === 'ping') {
    await prisma.webhookDelivery.create({
      data: {
        deliveryId,
        event: 'ping',
        repository: repoFullName,
        status: 'PROCESSED',
      },
    })

    logger.info('GitHubWebhook', `Ping received from GitHub for repository: ${repoFullName}`)
    return successResponse({
      message: 'GitHub webhook ping acknowledged successfully',
      repository: repoFullName,
      hookId: payload.hook_id,
    })
  }

  // 7. Handle "push" event
  if (event === 'push') {
    const ref = payload.ref as string | undefined
    // Ignore tag pushes or branch deletions
    if (!ref || !ref.startsWith('refs/heads/') || payload.deleted === true) {
      await prisma.webhookDelivery.create({
        data: {
          deliveryId,
          event: 'push',
          repository: repoFullName,
          status: 'IGNORED',
        },
      })
      return successResponse({ message: 'Non-branch push or deletion ignored' })
    }

    const pushedBranch = ref.replace('refs/heads/', '')
    const headCommit = payload.head_commit || (payload.commits && payload.commits[0])

    if (!headCommit) {
      await prisma.webhookDelivery.create({
        data: {
          deliveryId,
          event: 'push',
          repository: repoFullName,
          status: 'IGNORED',
        },
      })
      return successResponse({ message: 'Push contains no commits' })
    }

    const commitSha = headCommit.id as string
    const commitMessage = (headCommit.message as string) || 'GitHub push trigger'
    const authorName = headCommit.author?.name || headCommit.committer?.name || payload.sender?.login || 'GitHub User'

    // Match projects configured for this repository and branch
    const repoMatches = [
      repoFullName,
      `https://github.com/${repoFullName}`,
      `https://github.com/${repoFullName}.git`,
    ]

    const matchedProjects = await prisma.project.findMany({
      where: {
        repository: { in: repoMatches },
        branch: pushedBranch,
      },
    })

    if (matchedProjects.length === 0) {
      await prisma.webhookDelivery.create({
        data: {
          deliveryId,
          event: 'push',
          repository: repoFullName,
          status: 'IGNORED',
        },
      })

      logger.info('GitHubWebhook', `Push to ${repoFullName}:${pushedBranch} ignored (no matching active project)`)
      return successResponse({
        message: 'No active project matches the pushed repository and branch',
        repository: repoFullName,
        branch: pushedBranch,
      })
    }

    const enqueuedDeployments: string[] = []

    for (const project of matchedProjects) {
      // Check if a deployment for this exact project and commit was already created
      const existingDep = await prisma.deployment.findFirst({
        where: {
          projectId: project.id,
          commitSha,
        },
      })

      if (existingDep) {
        logger.info('GitHubWebhook', `Deployment already exists for project ${project.id} commit ${commitSha.slice(0, 7)}`)
        continue
      }

      const shortSha = commitSha.slice(0, 7)
      const dockerTag = `${project.slug}:${shortSha}`

      // Create deployment record with status: PENDING (safe standby mode)
      const deployment = await prisma.deployment.create({
        data: {
          projectId: project.id,
          commitSha,
          commitMessage,
          branch: pushedBranch,
          author: authorName,
          trigger: 'WEBHOOK_PUSH',
          status: 'PENDING', // Initially pending only: no real build execution
          targetEnvironment: project.environment,
          dockerImageTag: dockerTag,
          stages: {
            create: [
              { name: 'CLONE', order: 1, status: 'PENDING' },
              { name: 'LINT_TEST', order: 2, status: 'PENDING' },
              { name: 'DOCKER_BUILD', order: 3, status: 'PENDING' },
              { name: 'TRIVY_SCAN', order: 4, status: 'PENDING' },
              { name: 'TERRAFORM_PLAN', order: 5, status: 'PENDING' },
              { name: 'DEPLOY_AWS', order: 6, status: 'PENDING' },
              { name: 'HEALTH_CHECK', order: 7, status: 'PENDING' },
            ],
          },
          logs: {
            create: [
              {
                stageName: 'CLONE',
                level: 'INFO',
                message: `[Webhook] Enqueued deployment for commit ${shortSha} via push to ${pushedBranch}. Isolated build worker in standby.`,
              },
            ],
          },
        },
      })

      enqueuedDeployments.push(deployment.id)

      await logAuditEvent({
        userId: project.userId,
        projectId: project.id,
        action: 'DEPLOYMENT_WEBHOOK_ENQUEUE',
        resourceType: 'deployment',
        resourceId: deployment.id,
        details: {
          commitSha,
          branch: pushedBranch,
          author: authorName,
          deliveryId,
        },
        req,
      })

      logger.info('GitHubWebhook', `Enqueued pending deployment ${deployment.id} for project ${project.name}`)
    }

    // Record delivery as processed
    await prisma.webhookDelivery.create({
      data: {
        deliveryId,
        event: 'push',
        repository: repoFullName,
        status: 'PROCESSED',
      },
    })

    return successResponse(
      {
        message: 'Push event received and deployment job enqueued',
        repository: repoFullName,
        branch: pushedBranch,
        commitSha: commitSha.slice(0, 7),
        enqueuedDeployments,
      },
      202
    )
  }

  // 8. Other GitHub events: record and acknowledge
  await prisma.webhookDelivery.create({
    data: {
      deliveryId,
      event,
      repository: repoFullName,
      status: 'IGNORED',
    },
  })

  return successResponse({ message: `Event "${event}" acknowledged without action.` })
}
