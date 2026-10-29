import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { decryptToken } from '@/lib/server/crypto'
import { validateGitHubRepoUrl } from '@/lib/server/validation'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logger } from '@/lib/server/logger'

export interface GitHubBranchItem {
  name: string
  commitSha: string
  isProtected?: boolean
}

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const url = new URL(req.url)
  const repoParam = url.searchParams.get('repo')
  if (!repoParam) {
    return errorResponse('Query parameter "repo" is required.', 400, 'MISSING_REPO_PARAM')
  }

  const repoVal = validateGitHubRepoUrl(repoParam)
  if (!repoVal.valid || !repoVal.owner || !repoVal.repo) {
    return errorResponse(repoVal.error || 'Invalid repository identifier.', 400, 'INVALID_REPOSITORY')
  }

  const account = await prisma.gitHubAccount.findUnique({
    where: { userId: auth.user.id },
  })

  if (!account || !account.accessTokenEncrypted) {
    return errorResponse(
      'GitHub account is not connected. Please connect your GitHub account in Settings.',
      400,
      'GITHUB_NOT_CONNECTED'
    )
  }

  let accessToken: string
  try {
    accessToken = decryptToken(account.accessTokenEncrypted)
  } catch (err) {
    logger.error('GitHubBranches', 'Failed to decrypt access token', err, { userId: auth.user.id })
    return errorResponse('Failed to decrypt stored credentials.', 500, 'DECRYPTION_ERROR')
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repoVal.owner)}/${encodeURIComponent(
        repoVal.repo
      )}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'DeployForge-App',
        },
      }
    )

    if (res.status === 404) {
      return errorResponse(`Repository "${repoVal.fullName}" not found or access denied.`, 404, 'REPO_NOT_FOUND')
    }

    if (!res.ok) {
      logger.error('GitHubBranches', `GitHub API returned ${res.status} for ${repoVal.fullName}`)
      return errorResponse('Failed to fetch branches from GitHub.', 502, 'GITHUB_API_ERROR')
    }

    const branchesData = await res.json()
    if (!Array.isArray(branchesData)) {
      return successResponse<GitHubBranchItem[]>([])
    }

    const branches: GitHubBranchItem[] = branchesData.map((b: any) => ({
      name: b.name,
      commitSha: b.commit?.sha || '',
      isProtected: Boolean(b.protected),
    }))

    return successResponse(branches)
  } catch (err) {
    logger.error('GitHubBranches', 'Network error querying GitHub branches', err, {
      userId: auth.user.id,
      repo: repoVal.fullName,
    })
    return errorResponse('Network error contacting GitHub API.', 500, 'NETWORK_ERROR')
  }
}
