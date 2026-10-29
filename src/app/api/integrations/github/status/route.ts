import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse } from '@/lib/server/response'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientIdConfigured = Boolean(clientId && clientId !== 'mock_gh_client_id')
  const webhookConfigured = Boolean(process.env.GITHUB_WEBHOOK_SECRET)

  const account = await prisma.gitHubAccount.findUnique({
    where: { userId: auth.user.id },
    select: {
      githubUsername: true,
      avatarUrl: true,
      scope: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const webhookUrl = `${appUrl}/api/webhooks/github`

  if (!account) {
    return successResponse({
      connected: false,
      clientIdConfigured,
      webhookConfigured,
      webhookUrl,
    })
  }

  return successResponse({
    connected: true,
    username: account.githubUsername,
    avatarUrl: account.avatarUrl,
    scope: account.scope,
    connectedAt: account.createdAt,
    clientIdConfigured,
    webhookConfigured,
    webhookUrl,
  })
}
