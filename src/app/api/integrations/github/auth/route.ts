import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId || clientId === 'mock_gh_client_id') {
    return errorResponse(
      'GitHub OAuth client ID is not configured. Please set GITHUB_CLIENT_ID in your server environment.',
      400,
      'OAUTH_NOT_CONFIGURED'
    )
  }

  try {
    // Generate cryptographically random state token
    const state = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry

    // Delete any old expired states for this user
    await prisma.oAuthState.deleteMany({
      where: {
        OR: [
          { userId: auth.user.id },
          { expiresAt: { lt: new Date() } },
        ],
      },
    })

    // Store state bound to user
    await prisma.oAuthState.create({
      data: {
        userId: auth.user.id,
        state,
        expiresAt,
      },
    })

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    const redirectUri = `${appUrl}/api/integrations/github/callback`
    const scope = 'repo,read:user,admin:repo_hook'

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
      scope
    )}&state=${encodeURIComponent(state)}`

    logger.info('GitHubOAuth', `Generated authorization URL for user ${auth.user.id}`)

    const url = new URL(req.url)
    if (url.searchParams.get('format') === 'json' || req.headers.get('accept')?.includes('application/json')) {
      return successResponse({ url: authUrl, state })
    }

    return NextResponse.redirect(authUrl)
  } catch (err) {
    logger.error('GitHubOAuth', 'Failed to generate OAuth state', err, { userId: auth.user.id })
    return errorResponse('Failed to initiate GitHub authorization.', 500, 'OAUTH_INIT_FAILED')
  }
}
