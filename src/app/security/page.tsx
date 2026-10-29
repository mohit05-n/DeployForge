'use client'

import { useEffect, useState } from 'react'
import { Shield, ShieldAlert, ShieldCheck, ScanLine, RefreshCw } from 'lucide-react'
import { SeverityBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { securityService } from '@/services'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'
import type { SecurityScan, Vulnerability } from '@/types'

function SeverityCount({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-xl border bg-slate-900 p-5 ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-current opacity-70 mb-1">{label}</p>
      <p className="text-3xl font-bold text-current">{count}</p>
    </div>
  )
}

export default function SecurityPage() {
  const [scans, setScans] = useState<SecurityScan[]>([])
  const [selectedScan, setSelectedScan] = useState<SecurityScan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTriggering, setIsTriggering] = useState(false)

  useEffect(() => {
    securityService.listScans().then((res) => {
      setScans(res.data)
      if (res.data.length > 0) setSelectedScan(res.data[0])
      setIsLoading(false)
    })
  }, [])

  const handleTriggerScan = async () => {
    setIsTriggering(true)
    const result = await securityService.triggerScan('all')
    setIsTriggering(false)
    toast({ title: 'Scan triggered', description: result.data.message, variant: 'success' })
  }

  const allVulns: Vulnerability[] = scans.flatMap((s) => s.vulnerabilities)
  const totalBySeverity = {
    critical: allVulns.filter((v) => v.severity === 'critical').length,
    high:     allVulns.filter((v) => v.severity === 'high').length,
    medium:   allVulns.filter((v) => v.severity === 'medium').length,
    low:      allVulns.filter((v) => v.severity === 'low').length,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Toaster />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Security</h1>
          <p className="page-subtitle">Vulnerability scan results from Trivy across all projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-amber-800/50 bg-amber-950/30 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-400">Demo data</span>
          </div>
          <Button size="sm" onClick={handleTriggerScan} isLoading={isTriggering}>
            <ScanLine className="h-4 w-4" /> Scan all
          </Button>
        </div>
      </div>

      {/* Demo notice */}
      <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-300">Demo Mode — Simulated scan results</p>
            <p className="text-xs text-blue-500 mt-0.5">
              These results are generated from mock data. Connect a real backend with Trivy integration to see actual vulnerability scans from your Docker images.
            </p>
          </div>
        </div>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SeverityCount label="Critical" count={totalBySeverity.critical} color="border-red-900/60 text-red-400" />
        <SeverityCount label="High"     count={totalBySeverity.high}     color="border-amber-900/60 text-amber-400" />
        <SeverityCount label="Medium"   count={totalBySeverity.medium}   color="border-blue-900/60 text-blue-400" />
        <SeverityCount label="Low"      count={totalBySeverity.low}      color="border-slate-700 text-slate-400" />
      </div>

      {/* Scan history */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Scan history</h2>
          {isLoading ? <SkeletonTable rows={3} /> : (
            <div className="space-y-2">
              {scans.map((scan) => (
                <button
                  key={scan.id}
                  onClick={() => setSelectedScan(scan)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    selectedScan?.id === scan.id
                      ? 'border-brand-500 bg-brand-950/20 ring-1 ring-brand-500'
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-200">{scan.imageTag.split(':')[0]}</span>
                    {scan.summary.critical > 0 ? (
                      <ShieldAlert className="h-4 w-4 text-red-400" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-500 truncate">{scan.imageTag}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {scan.summary.critical > 0 && <span className="text-xs text-red-400">{scan.summary.critical} critical</span>}
                    {scan.summary.high > 0     && <span className="text-xs text-amber-400">{scan.summary.high} high</span>}
                    {scan.summary.medium > 0   && <span className="text-xs text-blue-400">{scan.summary.medium} medium</span>}
                  </div>
                  {scan.scannedAt && (
                    <p className="text-xs text-slate-600 mt-1.5">{formatRelativeTime(scan.scannedAt)}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Vulnerability table */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              Findings {selectedScan && `— ${selectedScan.imageTag}`}
            </h2>
            {selectedScan?.scannedAt && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <RefreshCw className="h-3 w-3" />
                {selectedScan.scanner} · {formatDateTime(selectedScan.scannedAt)}
              </div>
            )}
          </div>

          {selectedScan && selectedScan.vulnerabilities.length === 0 ? (
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-8 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-emerald-300">No vulnerabilities found</p>
              <p className="text-xs text-emerald-600 mt-1">This image passed the Trivy scan with no findings.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>CVE ID</th>
                    <th>Package</th>
                    <th>Severity</th>
                    <th className="hidden md:table-cell">Installed</th>
                    <th className="hidden md:table-cell">Fixed in</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedScan?.vulnerabilities ?? []).map((vuln) => (
                    <tr key={vuln.id}>
                      <td>
                        <a href={`https://nvd.nist.gov/vuln/detail/${vuln.cveId}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono text-brand-400 hover:text-brand-300 transition-colors">
                          {vuln.cveId}
                        </a>
                        <p className="text-xs text-slate-600 mt-0.5 max-w-xs truncate">{vuln.title}</p>
                      </td>
                      <td className="font-mono text-xs text-slate-300">{vuln.packageName}</td>
                      <td><SeverityBadge severity={vuln.severity} /></td>
                      <td className="hidden md:table-cell font-mono text-xs text-slate-500">{vuln.installedVersion}</td>
                      <td className="hidden md:table-cell font-mono text-xs text-emerald-400">{vuln.fixedVersion ?? 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
