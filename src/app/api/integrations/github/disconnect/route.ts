import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { decryptToken } from '@/lib/server/crypto'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'

export async function POST(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const account = await prisma.gitHubAccount.findUnique({
      where: { userId: auth.user.id },
    })

    if (!account) {
      return errorResponse('No connected GitHub account found to disconnect.', 404, 'NOT_CONNECTED')
    }

    const clientId = process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET

    // Attempt to revoke OAuth grant at GitHub if credentials are present
    if (clientId && clientSecret && account.accessTokenEncrypted) {
      try {
        const decryptedToken = decryptToken(account.accessTokenEncrypted)
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

        await fetch(`https://api.github.com/applications/${clientId}/grant`, {
          method: 'DELETE',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'DeployForge-App',
          },
          body: JSON.stringify({ access_token: decryptedToken }),
        }).catch((err) => {
          logger.warn('GitHubOAuth', `Failed to revoke GitHub app grant remotely: ${(err as Error).message}`)
        })
      } catch (e) {
        logger.warn('GitHubOAuth', `Token decryption for revocation failed: ${(e as Error).message}`)
      }
    }

    // Delete stored GitHub credentials from database
    await prisma.gitHubAccount.delete({
      where: { userId: auth.user.id },
    })

    // Update integration record status
    await prisma.integrationRecord.updateMany({
      where: {
        userId: auth.user.id,
        type: 'GITHUB',
      },
      data: {
        status: 'DISCONNECTED',
        configJson: JSON.stringify({ configured: false, disconnectedAt: new Date().toISOString() }),
        lastSyncAt: new Date(),
      },
    })

    // Log security audit event
    await logAuditEvent({
      userId: auth.user.id,
      action: 'INTEGRATION_GITHUB_DISCONNECT',
      resourceType: 'integration',
      details: { username: account.githubUsername },
      req,
    })

    logger.info('GitHubOAuth', `User ${auth.user.id} disconnected GitHub account ${account.githubUsername}`)

    return successResponse({ disconnected: true }, 200, 'GitHub account disconnected successfully')
  } catch (err) {
    logger.error('GitHubOAuth', 'Failed to disconnect GitHub account', err, { userId: auth.user.id })
    return errorResponse('Failed to disconnect GitHub account.', 500, 'DISCONNECT_FAILED')
  }
}
