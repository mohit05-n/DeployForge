import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'
import { jenkinsClient, JenkinsJobParameters } from '@/lib/server/jenkins'

export interface JenkinsJobStatus {
  jobName: string
  buildNumber: number
  status: 'PENDING' | 'QUEUED' | 'BUILDING' | 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'DISABLED'
  durationMs: number
  url: string
}

class JenkinsIntegrationService implements IIntegrationService {
  readonly name = 'Jenkins CI Automation'
  readonly provider = 'JENKINS'

  async getInfo(): Promise<IntegrationServiceInfo> {
    const config = jenkinsClient.getConfigurationSummary()
    const conn = await jenkinsClient.getConnectionStatus()

    let state: IntegrationServiceInfo['state'] = 'mock_active'
    if (!config.isConfigured) {
      state = 'disconnected'
    } else if (conn.reachable) {
      state = config.isRealEnabled ? 'connected' : 'mock_active'
    } else {
      state = 'error'
    }

    return {
      name: this.name,
      provider: this.provider,
      state,
      isConfigured: config.isConfigured,
      isSimulated: true, // Type contract requires literal true for frontend mock safety
      description: config.isRealEnabled
        ? `Real Jenkins ${conn.version || '2.580.2'} controller active with agent isolation.`
        : 'Jenkins pipeline simulation active with least-privilege service account.',
      details: {
        serverUrl: config.serverUrl,
        jobName: config.jobName,
        connectionState: conn.status,
        jenkinsVersion: conn.version || '2.580.2',
        untrustedAgent: 'untrusted-build-agent',
        privilegedAgent: 'privileged-release-agent',
        installedPlugins: [
          'workflow-aggregator',
          'pipeline-model-definition',
          'credentials-binding',
          'git',
          'build-timeout',
          'timestamper',
          'ws-cleanup',
          'plain-credentials',
        ],
        securityPolicies: [
          'Least-privilege service account credentials',
          'HMAC-SHA256 authenticated webhook callbacks',
          'Untrusted test execution isolated from privileged release agents',
          'Automated log redaction of tokens and secrets',
        ],
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    const conn = await jenkinsClient.getConnectionStatus()
    return {
      connected: conn.reachable || !jenkinsClient.isRealEnabled,
      message: conn.message,
      isSimulated: true,
    }
  }

  async triggerJob(
    jobName: string,
    params?: Partial<JenkinsJobParameters>
  ): Promise<IntegrationResult<JenkinsJobStatus>> {
    const queueResult = await jenkinsClient.triggerJob(jobName, params)

    return {
      success: queueResult.success,
      data: {
        jobName: queueResult.jobName,
        buildNumber: queueResult.buildNumber || 1,
        status: queueResult.success ? 'QUEUED' : 'FAILURE',
        durationMs: 0,
        url: queueResult.url || jenkinsClient.url,
      },
      error: queueResult.error,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const jenkinsService = new JenkinsIntegrationService()
