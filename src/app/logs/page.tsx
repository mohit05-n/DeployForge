'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Search, Download, RefreshCw, Activity, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { SkeletonPage } from '@/components/ui/Skeleton'
import { logsService, projectsService, monitoringService } from '@/services'
import { MOCK_PROJECTS } from '@/lib/mock-data'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { LogEntry, LogLevel, ApplicationHealth } from '@/types'

const LOG_BG: Record<LogLevel, string> = {
  info:    '',
  warn:    'bg-amber-950/20',
  error:   'bg-red-950/20',
  debug:   '',
  success: 'bg-emerald-950/20',
}

const LOG_COLOR: Record<LogLevel, string> = {
  info:    'text-slate-400',
  warn:    'text-amber-400',
  error:   'text-red-400',
  debug:   'text-slate-600',
  success: 'text-emerald-400',
}

function HealthStatusIcon({ status }: { status: ApplicationHealth['status'] }) {
  if (status === 'healthy') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  if (status === 'degraded') return <AlertCircle className="h-4 w-4 text-amber-400" />
  if (status === 'unhealthy') return <AlertCircle className="h-4 w-4 text-red-400" />
  return <Clock className="h-4 w-4 text-slate-500" />
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [health, setHealth] = useState<ApplicationHealth[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState('proj_01')
  const [levelFilter, setLevelFilter] = useState('all')
  const [search, setSearch] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  const fetchLogs = useCallback(async () => {
    const [logRes, healthRes] = await Promise.all([
      logsService.getApplicationLogs(selectedProject),
      monitoringService.getHealth(),
    ])
    setLogs(logRes.data)
    setHealth(healthRes.data)
    setIsLoading(false)
  }, [selectedProject])

  useEffect(() => {
    setIsLoading(true)
    fetchLogs()
  }, [selectedProject, fetchLogs])

  const filteredLogs = logs.filter((log) => {
    const matchLevel = levelFilter === 'all' || log.level === levelFilter
    const matchSearch = !search || log.message.toLowerCase().includes(search.toLowerCase())
    return matchLevel && matchSearch
  })

  const handleDownload = () => {
    const content = filteredLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${selectedProject}-${Date.now()}.txt`
    a.click()
  }

  if (isLoading) return <SkeletonPage />

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Logs & Monitoring</h1>
          <p className="page-subtitle">Application logs and health metrics. Metrics are simulated in demo mode.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-amber-800/50 bg-amber-950/30 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400">Demo data</span>
        </div>
      </div>

      {/* Health overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {health.map((h) => {
          const project = MOCK_PROJECTS.find((p) => p.id === h.projectId)
          return (
            <div key={h.projectId} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-200">{project?.name ?? h.projectId}</span>
                <HealthStatusIcon status={h.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <p className="text-slate-600">Uptime</p>
                  <p className="text-emerald-400 font-mono font-semibold">{h.uptime}%</p>
                </div>
                {h.responseTime && (
                  <div>
                    <p className="text-slate-600">Response</p>
                    <p className="text-slate-300 font-mono font-semibold">{h.responseTime}ms</p>
                  </div>
                )}
                {h.errorRate !== undefined && (
                  <div>
                    <p className="text-slate-600">Error rate</p>
                    <p className={cn('font-mono font-semibold', h.errorRate > 1 ? 'text-red-400' : 'text-slate-300')}>{h.errorRate}%</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-2">CPU/Memory: simulated — connect real monitoring</p>
            </div>
          )
        })}
      </div>

      {/* Log viewer */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-800">
          <Activity className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-100">Application logs</h2>
          <Select
            value={selectedProject}
            options={MOCK_PROJECTS.filter((p) => p.status === 'active' || p.status === 'deploying').map((p) => ({ value: p.id, label: p.name }))}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="h-8 text-xs w-auto"
          />
          <div className="flex items-center gap-1 ml-auto">
            {(['all', 'info', 'warn', 'error', 'debug'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  levelFilter === lvl ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-800/50 bg-slate-950/30">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter log messages..."
            className="flex-1 bg-transparent text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none"
          />
          <button onClick={fetchLogs} className="text-slate-500 hover:text-slate-300 transition-colors" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleDownload} className="text-slate-500 hover:text-slate-300 transition-colors" title="Download logs">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="bg-slate-950 max-h-96 overflow-y-auto p-4 space-y-0.5 font-mono">
          {filteredLogs.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">No logs match your filters.</p>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className={cn('flex gap-3 log-line rounded px-2 py-0.5', LOG_BG[log.level])}>
                <span className="text-slate-600 flex-shrink-0 select-none w-24">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={cn('flex-shrink-0 w-16 uppercase text-xs', LOG_COLOR[log.level])}>[{log.level}]</span>
                <span className={cn('text-xs', LOG_COLOR[log.level])}>{log.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>

        <div className="px-5 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-600">
          <span>Showing {filteredLogs.length} of {logs.length} entries</span>
          <span>Simulated log stream · connect real backend for live streaming</span>
        </div>
      </div>
    </div>
  )
}
