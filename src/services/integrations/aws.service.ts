import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'

export interface CloudResourceSummary {
  id: string
  name: string
  type: 'ECS' | 'EKS' | 'APP_RUNNER' | 'RDS' | 'ALB' | 'ECR'
  region: string
  status: 'ACTIVE' | 'PROVISIONING' | 'MAINTENANCE' | 'STOPPED'
  monthlyCostEstimate: number
  details: Record<string, unknown>
}

class AwsIntegrationService implements IIntegrationService {
  readonly name = 'Amazon Web Services (AWS)'
  readonly provider = 'AWS'

  async getInfo(): Promise<IntegrationServiceInfo> {
    return {
      name: this.name,
      provider: this.provider,
      state: 'mock_active',
      isConfigured: true,
      isSimulated: true,
      description: 'AWS Cloud connector simulator. Real AWS provisioning is disabled.',
      details: {
        accountIdMasked: '1234****9012',
        roleArn: process.env.AWS_ROLE_ARN || 'arn:aws:iam::123456789012:role/DeployForgeMockRole',
        defaultRegion: process.env.AWS_REGION || 'us-east-1',
        mockMode: true,
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    return {
      connected: true,
      message: 'AWS IAM Role assumed in read-only sandbox mode (1234****9012).',
      isSimulated: true,
    }
  }

  async listResources(region: string = 'us-east-1'): Promise<IntegrationResult<CloudResourceSummary[]>> {
    const resources: CloudResourceSummary[] = [
      {
        id: 'res-ecs-prod',
        name: 'ecs-production-core',
        type: 'ECS',
        region,
        status: 'ACTIVE',
        monthlyCostEstimate: 72.4,
        details: { tasksRunning: 6, clusterArn: `arn:aws:ecs:${region}:123456789012:cluster/production-core` },
      },
      {
        id: 'res-alb-prod',
        name: 'alb-main-ingress',
        type: 'ALB',
        region,
        status: 'ACTIVE',
        monthlyCostEstimate: 24.5,
        details: { dnsName: 'alb-main-ingress-129482.us-east-1.elb.amazonaws.com', targetsHealthy: 8 },
      },
      {
        id: 'res-rds-postgres',
        name: 'rds-shared-postgres',
        type: 'RDS',
        region,
        status: 'ACTIVE',
        monthlyCostEstimate: 115.0,
        details: { engine: 'PostgreSQL 16.2', storageAllocatedGb: 100, multiAz: true },
      },
      {
        id: 'res-ecr-registry',
        name: 'ecr-deployforge-apps',
        type: 'ECR',
        region,
        status: 'ACTIVE',
        monthlyCostEstimate: 4.2,
        details: { repositoryCount: 4, scanOnPush: true },
      },
    ]

    return {
      success: true,
      data: resources,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }

  async getHealthMetrics(projectName: string): Promise<IntegrationResult<{ cpuUtilization: number; memoryUtilization: number; requestLatencyMs: number; errorRatePercent: number }>> {
    return {
      success: true,
      data: {
        cpuUtilization: 24.6,
        memoryUtilization: 48.2,
        requestLatencyMs: 18.5,
        errorRatePercent: 0.04,
      },
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const awsService = new AwsIntegrationService()
