import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'

export interface BuildImageParams {
  projectName: string
  branch: string
  commitSha: string
  dockerfilePath?: string
}

export interface BuildImageResult {
  imageTag: string
  digest: string
  sizeBytes: number
  layersCount: number
  buildDurationSeconds: number
  logs: string[]
}

class DockerIntegrationService implements IIntegrationService {
  readonly name = 'Docker Build Engine'
  readonly provider = 'DOCKER'

  async getInfo(): Promise<IntegrationServiceInfo> {
    return {
      name: this.name,
      provider: this.provider,
      state: 'mock_active',
      isConfigured: true,
      isSimulated: true,
      description: 'Simulated container builder engine. Arbitrary host execution is disabled.',
      details: {
        engineVersion: '29.8.1-simulated',
        registry: '123456789012.dkr.ecr.us-east-1.amazonaws.com',
        layerCaching: true,
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    return {
      connected: true,
      message: 'Docker engine simulation active with secure build sandboxing.',
      isSimulated: true,
    }
  }

  async buildImage(params: BuildImageParams): Promise<IntegrationResult<BuildImageResult>> {
    const shortSha = params.commitSha.slice(0, 7)
    const imageTag = `${params.projectName}:${shortSha}`
    const digest = `sha256:${Buffer.from(imageTag + Date.now()).toString('hex').slice(0, 64)}`

    const logs = [
      `[Docker] Parsing Dockerfile from ${params.dockerfilePath || 'Dockerfile'}...`,
      `[Docker] Stage 1/3: FROM node:20-alpine AS deps`,
      `[Docker] CACHE: using cached layer sha256:4bd1b696`,
      `[Docker] Stage 2/3: FROM node:20-alpine AS builder`,
      `[Docker] Running package build for ${params.projectName} on branch ${params.branch}...`,
      `[Docker] Build completed in 32.4s`,
      `[Docker] Stage 3/3: FROM node:20-alpine AS runner`,
      `[Docker] Image tagged as ${imageTag}`,
      `[Docker] Pushing to ECR registry 123456789012.dkr.ecr.us-east-1.amazonaws.com...`,
      `[Docker] Successfully pushed ${imageTag} (${digest.slice(0, 19)}...)`,
    ]

    return {
      success: true,
      data: {
        imageTag,
        digest,
        sizeBytes: 142 * 1024 * 1024,
        layersCount: 9,
        buildDurationSeconds: 42,
        logs,
      },
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const dockerService = new DockerIntegrationService()
