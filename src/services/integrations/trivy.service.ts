import { IIntegrationService, IntegrationResult, IntegrationServiceInfo } from './types'

export interface VulnerabilityFinding {
  id: string
  cveId: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  packageName: string
  installedVersion: string
  fixedVersion?: string
  title: string
  description: string
  nvdUrl: string
}

export interface TrivyScanReport {
  imageTag: string
  vulnerabilities: VulnerabilityFinding[]
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }
  scannerVersion: string
  databaseVersion: string
  scanDurationSeconds: number
}

class TrivyIntegrationService implements IIntegrationService {
  readonly name = 'Trivy Security Scanner'
  readonly provider = 'TRIVY'

  async getInfo(): Promise<IntegrationServiceInfo> {
    return {
      name: this.name,
      provider: this.provider,
      state: 'mock_active',
      isConfigured: true,
      isSimulated: true,
      description: 'Container vulnerability and CVE static analysis scanner simulation',
      details: {
        scannerVersion: 'v0.56.2',
        databaseVersion: '2026.10-v2',
        vulnerabilitySources: ['NVD', 'Debian Security Tracker', 'GitHub Advisory'],
      },
    }
  }

  async testConnection(): Promise<{ connected: boolean; message: string; isSimulated: true }> {
    return {
      connected: true,
      message: 'Trivy vulnerability database loaded (2026.10-v2). Ready for container scans.',
      isSimulated: true,
    }
  }

  async scanImage(imageTag: string): Promise<IntegrationResult<TrivyScanReport>> {
    const vulnerabilities: VulnerabilityFinding[] = [
      {
        id: 'vuln-1',
        cveId: 'CVE-2024-21626',
        severity: 'HIGH',
        packageName: 'runc',
        installedVersion: '1.1.11-1',
        fixedVersion: '1.1.12-1',
        title: 'runc file descriptor leak during container init',
        description: 'An attacker could escape the container via leaked file descriptors during container startup.',
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-21626',
      },
      {
        id: 'vuln-2',
        cveId: 'CVE-2024-3817',
        severity: 'MEDIUM',
        packageName: 'openssl',
        installedVersion: '3.0.11-1',
        fixedVersion: '3.0.13-1',
        title: 'Excessive resource allocation in SSL session renegotiation',
        description: 'Specially crafted client certificates could lead to elevated CPU load on TLS termination.',
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-3817',
      },
      {
        id: 'vuln-3',
        cveId: 'CVE-2024-24576',
        severity: 'LOW',
        packageName: 'libcurl',
        installedVersion: '8.4.0-2',
        fixedVersion: '8.5.0-1',
        title: 'Minor timing side-channel in HSTS parsing',
        description: 'Strict transport security header parsing timing discrepancy under edge condition.',
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-24576',
      },
    ]

    const report: TrivyScanReport = {
      imageTag,
      vulnerabilities,
      summary: {
        critical: 0,
        high: 1,
        medium: 1,
        low: 1,
        total: 3,
      },
      scannerVersion: '0.56.2',
      databaseVersion: '2026.10-v2',
      scanDurationSeconds: 16,
    }

    return {
      success: true,
      data: report,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    }
  }
}

export const trivyService = new TrivyIntegrationService()
