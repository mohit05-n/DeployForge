import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/server/crypto'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const settingsUrl = `${appUrl}/settings`

  // 1. Handle GitHub returned errors (e.g. user cancelled)
  if (error) {
    logger.warn('GitHubOAuth', `GitHub authorization rejected: ${error} - ${errorDescription}`)
    return NextResponse.redirect(
      `${settingsUrl}?tab=github&error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  // 2. Validate presence of code and state
  if (!code || !state) {
    logger.warn('GitHubOAuth', 'Callback invoked with missing code or state')
    return NextResponse.redirect(`${settingsUrl}?tab=github&error=missing_code_or_state`)
  }

  try {
    // 3. Atomically validate and consume the OAuth state (single-use replay protection)
    const storedState = await prisma.oAuthState.findUnique({
      where: { state },
    })

    if (!storedState) {
      logger.warn('GitHubOAuth', 'Callback failed: state not found or previously consumed')
      return NextResponse.redirect(`${settingsUrl}?tab=github&error=invalid_state`)
    }

    // Immediately remove state to prevent replay attacks
    await prisma.oAuthState.delete({
      where: { id: storedState.id },
    })

    // Check expiration
    if (new Date() > storedState.expiresAt) {
      logger.warn('GitHubOAuth', 'Callback failed: OAuth state expired')
      return NextResponse.redirect(`${settingsUrl}?tab=github&error=expired_state`)
    }

    const userId = storedState.userId
    const clientId = process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET
    const redirectUri = `${appUrl}/api/integrations/github/callback`

    if (!clientId || !clientSecret) {
      logger.error('GitHubOAuth', 'GitHub OAuth credentials missing in environment')
      return NextResponse.redirect(`${settingsUrl}?tab=github&error=server_configuration_error`)
    }

    // 4. Exchange authorization code for access token with GitHub
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      logger.error('GitHubOAuth', 'Token exchange failed', tokenData)
      return NextResponse.redirect(
        `${settingsUrl}?tab=github&error=${encodeURIComponent(
          tokenData.error_description || 'token_exchange_failed'
        )}`
      )
    }

    const accessToken = tokenData.access_token as string
    const scope = (tokenData.scope as string) || ''

    // 5. Fetch user profile from GitHub API
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DeployForge-App',
      },
    })

    if (!userRes.ok) {
      logger.error('GitHubOAuth', `Failed to fetch GitHub user profile: ${userRes.status}`)
      return NextResponse.redirect(`${settingsUrl}?tab=github&error=failed_fetching_github_profile`)
    }

    const ghUser = await userRes.json()

    // 6. Encrypt access token before storing (never plaintext, never logged)
    const accessTokenEncrypted = encryptToken(accessToken)

    // 7. Store GitHub account record linked to user
    await prisma.gitHubAccount.upsert({
      where: { userId },
      update: {
        githubUserId: String(ghUser.id),
        githubUsername: ghUser.login,
        avatarUrl: ghUser.avatar_url,
        accessTokenEncrypted,
        scope,
      },
      create: {
        userId,
        githubUserId: String(ghUser.id),
        githubUsername: ghUser.login,
        avatarUrl: ghUser.avatar_url,
        accessTokenEncrypted,
        scope,
      },
    })

    // 8. Update IntegrationRecord status to CONNECTED
    await prisma.integrationRecord.upsert({
      where: {
        userId_type: {
          userId,
          type: 'GITHUB',
        },
      },
      update: {
        status: 'CONNECTED',
        name: 'GitHub App Connection',
        configJson: JSON.stringify({
          githubUserId: String(ghUser.id),
          username: ghUser.login,
          avatarUrl: ghUser.avatar_url,
          connectedAt: new Date().toISOString(),
          scope,
        }),
        lastSyncAt: new Date(),
        errorMessage: null,
      },
      create: {
        userId,
        type: 'GITHUB',
        name: 'GitHub App Connection',
        status: 'CONNECTED',
        configJson: JSON.stringify({
          githubUserId: String(ghUser.id),
          username: ghUser.login,
          avatarUrl: ghUser.avatar_url,
          connectedAt: new Date().toISOString(),
          scope,
        }),
        lastSyncAt: new Date(),
      },
    })

    // 9. Record security audit event
    await logAuditEvent({
      userId,
      action: 'INTEGRATION_GITHUB_CONNECT',
      resourceType: 'integration',
      details: {
        githubUserId: ghUser.id,
        username: ghUser.login,
        scope,
      },
      req,
    })

    logger.info('GitHubOAuth', `User ${userId} successfully connected GitHub account: ${ghUser.login}`)

    return NextResponse.redirect(`${settingsUrl}?tab=github&status=connected`)
  } catch (err) {
    logger.error('GitHubOAuth', 'Callback processing error', err)
    return NextResponse.redirect(`${settingsUrl}?tab=github&error=unexpected_error`)
  }
}
