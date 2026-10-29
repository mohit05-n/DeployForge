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
  const [showRawReport, setShowRawReport] = useState(false)

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
          <p className="page-subtitle">Container image vulnerability scanning with Trivy security worker.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-300 font-medium">Trivy Worker Active</span>
          </div>
          <Button size="sm" onClick={handleTriggerScan} isLoading={isTriggering}>
            <ScanLine className="h-4 w-4" /> Trigger Scan
          </Button>
        </div>
      </div>

      {/* Controlled Scanner Worker & Policy Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-200">Controlled Scanner Worker</p>
              <p className="text-xs text-slate-400 mt-1">
                Scans the exact immutable image tag produced by Docker builds. Reports are normalized, sanitized, and stored with CVE metadata.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-200">Policy Enforcement</p>
              <p className="text-xs text-slate-400 mt-1">
                Severity threshold: <span className="font-semibold text-red-400">CRITICAL</span>. Deployments fail when blocking CVEs exceed policy. Scanner network and download errors are strictly isolated from policy failures.
              </p>
            </div>
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
              {scans.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400 text-sm">
                  No security scans recorded yet. Trigger an on-demand scan or run a Jenkins pipeline.
                </div>
              ) : (
                scans.map((scan) => {
                  const isBlocked = scan.scanResult === 'blocked' || scan.blockingPolicyViolated || scan.summary.critical > 0
                  const isError = scan.scanResult === 'error' || scan.status === 'failed'

                  return (
                    <button
                      key={scan.id}
                      onClick={() => setSelectedScan(scan)}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        selectedScan?.id === scan.id
                          ? 'border-brand-500 bg-brand-950/20 ring-1 ring-brand-500'
                          : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-sm font-semibold text-slate-200 truncate">{scan.imageTag.split(':')[0]}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {scan.isSimulated && (
                            <span className="text-[10px] font-medium tracking-wide uppercase bg-amber-950/60 text-amber-300 border border-amber-800/40 px-1.5 py-0.5 rounded">
                              Simulated
                            </span>
                          )}
                          {isError ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-full">
                              <ShieldAlert className="h-3 w-3" /> Scanner Error
                            </span>
                          ) : isBlocked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/40 border border-red-800/40 px-2 py-0.5 rounded-full">
                              <ShieldAlert className="h-3 w-3" /> Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="h-3 w-3" /> Passed
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs font-mono text-slate-500 truncate">{scan.imageTag}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {scan.summary.critical > 0 && <span className="text-xs text-red-400">{scan.summary.critical} critical</span>}
                        {scan.summary.high > 0     && <span className="text-xs text-amber-400">{scan.summary.high} high</span>}
                        {scan.summary.medium > 0   && <span className="text-xs text-blue-400">{scan.summary.medium} medium</span>}
                        {scan.summary.low > 0      && <span className="text-xs text-slate-400">{scan.summary.low} low</span>}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                        <span>{scan.scanner}</span>
                        {scan.scannedAt && <span>{formatRelativeTime(scan.scannedAt)}</span>}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Vulnerability table */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              Findings {selectedScan && `— ${selectedScan.imageTag}`}
              {selectedScan?.isSimulated && (
                <span className="ml-2 text-xs font-normal text-amber-400">(Simulated Data)</span>
              )}
            </h2>
            {selectedScan?.scannedAt && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  {selectedScan.scanner} · {formatDateTime(selectedScan.scannedAt)}
                </div>
              </div>
            )}
          </div>

          {selectedScan?.errorMessage && (
            <div className="mb-4 rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-xs text-amber-300">
              <span className="font-semibold uppercase tracking-wider block mb-1">
                {selectedScan.errorCategory || 'Notice'}:
              </span>
              {selectedScan.errorMessage}
            </div>
          )}

          {selectedScan && selectedScan.vulnerabilities.length === 0 ? (
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-8 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-emerald-300">Clean Image — No vulnerabilities found</p>
              <p className="text-xs text-emerald-600 mt-1">This immutable image passed the Trivy scan with 0 CVE findings.</p>
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
                        <p className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{vuln.title}</p>
                      </td>
                      <td className="font-mono text-xs text-slate-300">{vuln.packageName}</td>
                      <td><SeverityBadge severity={vuln.severity} /></td>
                      <td className="hidden md:table-cell font-mono text-xs text-slate-500">{vuln.installedVersion}</td>
                      <td className="hidden md:table-cell font-mono text-xs text-emerald-400">{vuln.fixedVersion ?? 'None available'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Machine-Readable Report Viewer */}
          {selectedScan?.rawReportJson && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">Sanitized Machine-Readable Report</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRawReport(!showRawReport)}
                >
                  {showRawReport ? 'Hide Raw JSON Report' : 'View Raw JSON Report'}
                </Button>
              </div>
              {showRawReport && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 overflow-hidden">
                  <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-96 whitespace-pre-wrap">
                    {typeof selectedScan.rawReportJson === 'string'
                      ? selectedScan.rawReportJson
                      : JSON.stringify(selectedScan.rawReportJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
