export type IntegrationState = 'connected' | 'disconnected' | 'mock_active' | 'error'

export interface IntegrationServiceInfo {
  name: string
  provider: string
  state: IntegrationState
  isConfigured: boolean
  isSimulated: boolean
  description: string
  details?: Record<string, unknown>
}

export interface IntegrationResult<T> {
  success: boolean
  data?: T
  error?: string
  isSimulated: true
  timestamp: string
}

export interface IIntegrationService {
  readonly name: string
  readonly provider: string
  getInfo(): Promise<IntegrationServiceInfo>
  testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }>
}
