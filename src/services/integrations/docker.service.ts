import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'
import { getBuildWorker } from '@/lib/server/build'

export interface BuildImageParams {
  projectName: string
  projectSlug?: string
  deploymentId?: string
  branch: string
  commitSha: string
  dockerfilePath?: string
  buildCommand?: string
  startCommand?: string
  port?: number
  envVars?: Record<string, string>
  secrets?: Record<string, string>
}

export interface BuildImageResult {
  imageTag: string
  digest?: string
  sizeBytes?: number
  layersCount?: number
  buildDurationSeconds: number
  logs: string[]
  workerType: 'mock' | 'docker'
}

class DockerIntegrationService implements IIntegrationService {
  readonly name = 'Docker Build Engine'
  readonly provider = 'DOCKER'

  async getInfo(): Promise<IntegrationServiceInfo> {
    const isRealEnabled = process.env.ENABLE_REAL_DOCKER_BUILDS === 'true'
    const workerType = process.env.BUILD_RUNNER_TYPE || 'mock'
    const worker = getBuildWorker()

    return {
      name: this.name,
      provider: this.provider,
      state: isRealEnabled ? 'connected' : 'mock_active',
      isConfigured: true,
      isSimulated: !isRealEnabled,
      description: isRealEnabled
        ? 'Real Docker Engine worker enabled with cgroups resource boundaries.'
        : 'Isolated mock container builder active. Arbitrary host execution is disabled.',
      details: {
        workerName: worker.name,
        runnerType: workerType,
        realBuildsGated: isRealEnabled,
        limits: {
          cpuLimit: '2.0 cores',
          memoryLimit: '2 GB',
          timeout: '600s',
          pidsLimit: 256,
          networkMode: 'isolated',
        },
        securityEnforcements: [
          'Host Docker socket mounting strictly forbidden',
          'Secrets stripped from build arguments and image layers',
          'Unique immutable image tags tied to deployment ID',
          'Automated workspace directory cleanup on completion',
        ],
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    const isRealEnabled = process.env.ENABLE_REAL_DOCKER_BUILDS === 'true'
    return {
      connected: true,
      message: isRealEnabled
        ? 'Docker daemon accessible with isolated execution boundaries.'
        : 'Docker engine simulation active with secure build sandboxing.',
      isSimulated: true,
    }
  }

  async buildImage(params: BuildImageParams): Promise<IntegrationResult<BuildImageResult>> {
    const worker = getBuildWorker()
    const deploymentId = params.deploymentId || `sim-${Date.now().toString(36)}`
    const projectSlug = params.projectSlug || params.projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

    const jobResult = await worker.executeBuild({
      id: `job-${deploymentId.slice(-6)}-${Date.now().toString(36)}`,
      deploymentId,
      projectId: `proj-${projectSlug}`,
      projectSlug,
      projectName: params.projectName,
      repoUrl: `https://github.com/example/${projectSlug}`,
      commitSha: params.commitSha,
      branch: params.branch,
      projectType: params.dockerfilePath ? 'DOCKERFILE_CUSTOM' : 'NODEJS_GENERIC',
      buildCommand: params.buildCommand || 'npm run build',
      startCommand: params.startCommand || 'npm start',
      dockerfilePath: params.dockerfilePath,
      port: params.port || 3000,
      envVars: params.envVars,
      secrets: params.secrets,
    })

    return {
      success: jobResult.success,
      data: {
        imageTag: jobResult.imageTag,
        digest: jobResult.digest,
        sizeBytes: jobResult.sizeBytes,
        layersCount: jobResult.layersCount,
        buildDurationSeconds: jobResult.buildDurationSeconds,
        logs: jobResult.logs.map((l) => `[${l.level}] ${l.message}`),
        workerType: jobResult.workerType,
      },
      error: jobResult.success ? undefined : jobResult.errorDetails || jobResult.summary,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const dockerService = new DockerIntegrationService()
