import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'

export interface JenkinsJobStatus {
  jobName: string
  buildNumber: number
  status: 'PENDING' | 'BUILDING' | 'SUCCESS' | 'FAILURE' | 'DISABLED'
  durationMs: number
  url: string
}

class JenkinsIntegrationService implements IIntegrationService {
  readonly name = 'Jenkins CI Automation'
  readonly provider = 'JENKINS'

  async getInfo(): Promise<IntegrationServiceInfo> {
    return {
      name: this.name,
      provider: this.provider,
      state: 'disconnected',
      isConfigured: false,
      isSimulated: true,
      description: 'External Jenkins server integration is in disabled standby mode.',
      details: {
        serverUrl: process.env.JENKINS_SERVER_URL || 'https://jenkins.mock.internal',
        configured: false,
        activeWorkers: 0,
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    return {
      connected: false,
      message: 'Jenkins integration is disabled for this environment. Pipelines execute via internal runner.',
      isSimulated: true,
    }
  }

  async triggerJob(jobName: string): Promise<IntegrationResult<JenkinsJobStatus>> {
    return {
      success: false,
      error: 'External Jenkins runner is currently disabled. Use DeployForge Native Orchestrator.',
      data: {
        jobName,
        buildNumber: 0,
        status: 'DISABLED',
        durationMs: 0,
        url: 'about:blank',
      },
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const jenkinsService = new JenkinsIntegrationService()
