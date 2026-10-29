import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { decryptToken } from '@/lib/server/crypto'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'

export interface GitHubRepoItem {
  id: number
  name: string
  fullName: string
  owner: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  description: string | null
  language: string | null
  updatedAt: string
}

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const account = await prisma.gitHubAccount.findUnique({
    where: { userId: auth.user.id },
  })

  if (!account || !account.accessTokenEncrypted) {
    return errorResponse(
      'GitHub account is not connected. Please connect your GitHub account in Settings to list repositories.',
      400,
      'GITHUB_NOT_CONNECTED'
    )
  }

  let accessToken: string
  try {
    accessToken = decryptToken(account.accessTokenEncrypted)
  } catch (err) {
    logger.error('GitHubRepos', 'Failed to decrypt access token', err, { userId: auth.user.id })
    return errorResponse('Failed to decrypt stored credentials. Please reconnect your GitHub account.', 500, 'DECRYPTION_ERROR')
  }

  try {
    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'DeployForge-App',
        },
      }
    )

    if (res.status === 401) {
      logger.warn('GitHubRepos', `GitHub token invalid or expired for user ${auth.user.id}`)
      return errorResponse('GitHub authorization has expired or been revoked. Please reconnect in Settings.', 401, 'GITHUB_TOKEN_EXPIRED')
    }

    if (!res.ok) {
      logger.error('GitHubRepos', `GitHub API error: status ${res.status}`)
      return errorResponse('Failed to fetch repositories from GitHub.', 502, 'GITHUB_API_ERROR')
    }

    const reposData = await res.json()
    if (!Array.isArray(reposData)) {
      return successResponse<GitHubRepoItem[]>([])
    }

    const repositories: GitHubRepoItem[] = reposData.map((r: any) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login || '',
      url: r.html_url,
      defaultBranch: r.default_branch || 'main',
      isPrivate: Boolean(r.private),
      description: r.description || null,
      language: r.language || null,
      updatedAt: r.updated_at || new Date().toISOString(),
    }))

    return successResponse(repositories)
  } catch (err) {
    logger.error('GitHubRepos', 'Network error querying GitHub API', err, { userId: auth.user.id })
    return errorResponse('Network error contacting GitHub API.', 500, 'NETWORK_ERROR')
  }
}
