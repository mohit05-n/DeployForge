import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'

export interface TerraformPlanResource {
  address: string
  type: string
  action: 'create' | 'update' | 'delete' | 'no-op'
  changeDetails: string
}

export interface TerraformPlanResult {
  planId: string
  resourcesToCreate: number
  resourcesToUpdate: number
  resourcesToDelete: number
  resources: TerraformPlanResource[]
  summary: string
  canApply: boolean
  warning: string
}

class TerraformIntegrationService implements IIntegrationService {
  readonly name = 'HashiCorp Terraform'
  readonly provider = 'TERRAFORM'

  async getInfo(): Promise<IntegrationServiceInfo> {
    return {
      name: this.name,
      provider: this.provider,
      state: 'mock_active',
      isConfigured: true,
      isSimulated: true,
      description: 'Infrastructure as Code dry-run and plan simulator. Remote execution is disabled.',
      details: {
        version: '1.9.4',
        stateBackend: 's3-remote-state-mock',
        executionEnabled: false,
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    return {
      connected: true,
      message: 'Terraform plan engine active in dry-run mode. Destructive apply operations are locked.',
      isSimulated: true,
    }
  }

  async generatePlan(projectName: string, targetRegion: string): Promise<IntegrationResult<TerraformPlanResult>> {
    const resources: TerraformPlanResource[] = [
      {
        address: 'aws_ecs_task_definition.app',
        type: 'aws_ecs_task_definition',
        action: 'create',
        changeDetails: `Create new task definition revision for ${projectName} in ${targetRegion}`,
      },
      {
        address: 'aws_ecs_service.app',
        type: 'aws_ecs_service',
        action: 'update',
        changeDetails: 'Update desired task definition ARN and trigger blue/green rollout',
      },
      {
        address: 'aws_cloudwatch_log_group.app',
        type: 'aws_cloudwatch_log_group',
        action: 'no-op',
        changeDetails: 'Log retention set to 30 days (already converged)',
      },
    ]

    return {
      success: true,
      data: {
        planId: `tfplan-${Buffer.from(projectName + Date.now()).toString('hex').slice(0, 8)}`,
        resourcesToCreate: 1,
        resourcesToUpdate: 1,
        resourcesToDelete: 0,
        resources,
        summary: 'Plan: 1 to add, 1 to change, 0 to destroy.',
        canApply: false,
        warning: 'Terraform execution is disabled in this environment. Plan is for review only.',
      },
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }

  async applyPlan(_planId: string): Promise<IntegrationResult<{ executed: false; reason: string }>> {
    // Explicitly reject applying Terraform
    return {
      success: false,
      error: 'Terraform apply is disabled by platform policy. Deployment is managed via AWS ECS rolling updates.',
      data: {
        executed: false,
        reason: 'Policy restriction: direct terraform apply blocked.',
      },
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const terraformService = new TerraformIntegrationService()
