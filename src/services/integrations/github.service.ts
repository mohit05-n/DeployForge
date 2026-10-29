import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'

export interface GitHubRepository {
  id: number
  name: string
  fullName: string
  defaultBranch: string
  isPrivate: boolean
  url: string
  language: string
  updatedAt: string
}

export interface GitHubBranch {
  name: string
  commitSha: string
  isDefault: boolean
}

class GitHubIntegrationService implements IIntegrationService {
  readonly name = 'GitHub Integration'
  readonly provider = 'GITHUB'

  async getInfo(): Promise<IntegrationServiceInfo> {
    return {
      name: this.name,
      provider: this.provider,
      state: 'mock_active',
      isConfigured: true,
      isSimulated: true,
      description: 'Simulated GitHub App connection for repository and branch discovery',
      details: {
        organization: 'deployforge-demo',
        permissionScope: 'repo:read, webhook:write',
        mockMode: true,
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    return {
      connected: true,
      message: 'Simulated GitHub API connection active. Ready for repository discovery.',
      isSimulated: true,
    }
  }

  async listRepositories(): Promise<IntegrationResult<GitHubRepository[]>> {
    const repos: GitHubRepository[] = [
      {
        id: 101,
        name: 'payment-service',
        fullName: 'deployforge-demo/payment-service',
        defaultBranch: 'main',
        isPrivate: true,
        url: 'https://github.com/deployforge-demo/payment-service',
        language: 'TypeScript',
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 102,
        name: 'auth-service',
        fullName: 'deployforge-demo/auth-service',
        defaultBranch: 'main',
        isPrivate: true,
        url: 'https://github.com/deployforge-demo/auth-service',
        language: 'Go',
        updatedAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 103,
        name: 'inventory-api',
        fullName: 'deployforge-demo/inventory-api',
        defaultBranch: 'main',
        isPrivate: false,
        url: 'https://github.com/deployforge-demo/inventory-api',
        language: 'Python',
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 104,
        name: 'analytics-worker',
        fullName: 'deployforge-demo/analytics-worker',
        defaultBranch: 'main',
        isPrivate: true,
        url: 'https://github.com/deployforge-demo/analytics-worker',
        language: 'Rust',
        updatedAt: new Date(Date.now() - 172800000).toISOString(),
      },
    ]

    return {
      success: true,
      data: repos,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }

  async listBranches(repoFullName: string): Promise<IntegrationResult<GitHubBranch[]>> {
    const branches: GitHubBranch[] = [
      { name: 'main', commitSha: 'a8f3b2c1d', isDefault: true },
      { name: 'staging', commitSha: '3c4d5e6f7', isDefault: false },
      { name: 'feature/payment-v2', commitSha: '7b8c9d0e1', isDefault: false },
    ]

    return {
      success: true,
      data: branches,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const githubService = new GitHubIntegrationService()
