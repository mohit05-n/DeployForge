'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Activity, Play, RefreshCw, Terminal, CheckCircle2,
  XCircle, Clock, AlertTriangle, ExternalLink, ChevronDown,
  ChevronUp, ShieldCheck, ShieldAlert, Server
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/hooks/useToast'
import {
  jenkinsClientService,
  JenkinsStatusResponse,
  JenkinsBuildResponse,
} from '@/services'

export function JenkinsPipelineWidget() {
  const [status, setStatus] = useState<JenkinsStatusResponse | null>(null)
  const [latestBuild, setLatestBuild] = useState<JenkinsBuildResponse | null>(null)
  const [consoleText, setConsoleText] = useState<string>('')
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isTriggering, setIsTriggering] = useState(false)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setIsLoadingStatus(true)
    setErrorMessage(null)
    const res = await jenkinsClientService.getStatus()
    if (res.data) {
      setStatus(res.data)
      if (res.data.reachable) {
        // Fetch latest build details
        const bRes = await jenkinsClientService.getBuild(res.data.jobName, 'latest')
        if (bRes.data) {
          setLatestBuild(bRes.data)
        }
      }
    } else {
      setErrorMessage(res.error || 'Failed to connect to Jenkins.')
    }
    setIsLoadingStatus(false)
  }, [])

  const fetchLogs = useCallback(async (buildNum?: number) => {
    setIsLoadingLogs(true)
    const targetBuild = buildNum || latestBuild?.buildNumber || 'latest'
    const res = await jenkinsClientService.getConsole(status?.jobName, targetBuild)
    if (res.data) {
      setConsoleText(res.data.text)
    } else if (res.error) {
      setConsoleText(`[DeployForge] Failed to load console logs: ${res.error}`)
    }
    setIsLoadingLogs(false)
  }, [latestBuild?.buildNumber, status?.jobName])

  const handleTrigger = async () => {
    setIsTriggering(true)
    setErrorMessage(null)
    const res = await jenkinsClientService.triggerBuild({
      jobName: status?.jobName || 'DeployForge-Build',
    })

    if (res.data && res.data.success) {
      toast({
        title: 'Jenkins Pipeline Triggered',
        description: res.data.message || `Build queued for job "${res.data.jobName}".`,
        variant: 'success',
      })

      // Update state with newly queued/started build
      if (res.data.buildNumber) {
        setLatestBuild({
          jobName: res.data.jobName,
          buildNumber: res.data.buildNumber,
          status: 'BUILDING',
          durationMs: 0,
          url: res.data.url || status?.serverUrl || '',
          isSimulated: res.data.isSimulated,
        })
      }

      // Auto-open console to monitor
      setShowConsole(true)
      setTimeout(() => {
        fetchStatus()
        fetchLogs(res.data?.buildNumber)
      }, 1500)
    } else {
      const err = res.error || 'Failed to trigger Jenkins pipeline.'
      setErrorMessage(err)
      toast({
        title: 'Build Trigger Failed',
        description: err,
        variant: 'error',
      })
    }
    setIsTriggering(false)
  }

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const renderStatusBadge = () => {
    if (isLoadingStatus) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400">
          <RefreshCw className="h-3 w-3 animate-spin" /> Checking...
        </span>
      )
    }

    if (errorMessage && errorMessage.toLowerCase().includes('sign in')) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 text-xs font-medium text-amber-400">
          <ShieldAlert className="h-3 w-3" /> Sign-in Required
        </span>
      )
    }

    if (!status || status.status === 'unconfigured' || !status.configured) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 text-xs font-medium text-amber-400">
          <AlertTriangle className="h-3 w-3" /> Configuration Required
        </span>
      )
    }

    if (status.status === 'reachable') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 text-xs font-medium text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Connected {status.version ? `(v${status.version})` : ''}
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-950/40 border border-rose-800/40 px-2.5 py-1 text-xs font-medium text-rose-400">
        <XCircle className="h-3 w-3" /> Connection Failed
      </span>
    )
  }

  const renderBuildBadge = (bStatus?: string) => {
    switch (bStatus?.toUpperCase()) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Success
          </span>
        )
      case 'BUILDING':
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-blue-950/60 border border-blue-800/50 px-2 py-0.5 text-xs font-medium text-blue-400">
            <RefreshCw className="h-3 w-3 animate-spin" /> Running
          </span>
        )
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 text-xs font-medium text-amber-400">
            <Clock className="h-3 w-3" /> Queued
          </span>
        )
      case 'FAILURE':
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-950/60 border border-rose-800/50 px-2 py-0.5 text-xs font-medium text-rose-400">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        )
      case 'ABORTED':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
            Aborted
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
            Idle
          </span>
        )
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
      {/* Widget Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
            <Server className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">Jenkins CI/CD Pipeline</h2>
              {status?.isSimulated && (
                <span className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                  Mock Mode
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live build execution & test verification via <code className="font-mono text-slate-400">{status?.jobName || 'DeployForge-Build'}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {renderStatusBadge()}
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchStatus}
            disabled={isLoadingStatus}
            className="text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="bg-amber-950/30 border-b border-amber-900/40 p-3 px-5 text-xs text-amber-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{errorMessage}</span>
          </div>
          <div className="flex items-center gap-2">
            {errorMessage.toLowerCase().includes('sign in') && (
              <Link
                href="/auth/signin"
                className="rounded bg-brand-600 hover:bg-brand-500 text-white px-2.5 py-1 font-medium transition-colors"
              >
                Sign In
              </Link>
            )}
            <button
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-slate-200 text-xs font-semibold ml-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Info & Actions */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Target Job Info */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] font-medium text-slate-400">Target Pipeline Job</p>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-xs font-semibold text-slate-200">
                {status?.jobName || 'DeployForge-Build'}
              </span>
              {status?.serverUrl && (
                <a
                  href={`${status.serverUrl}/job/${status.jobName || 'DeployForge-Build'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-brand-400 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {status?.jobExists === false ? 'Job not found on controller' : 'Configured from Jenkinsfile'}
            </p>
          </div>

          {/* Latest Build Status */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] font-medium text-slate-400">Latest Build Run</p>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-xs font-semibold text-slate-200">
                {latestBuild?.buildNumber ? `#${latestBuild.buildNumber}` : (status?.latestBuildNumber ? `#${status.latestBuildNumber}` : '—')}
              </span>
              {renderBuildBadge(latestBuild?.status)}
            </div>
            <p className="text-[10px] text-slate-500 mt-1 truncate">
              {latestBuild?.currentStage || (latestBuild?.durationMs ? `${(latestBuild.durationMs / 1000).toFixed(1)}s elapsed` : 'Ready to execute')}
            </p>
          </div>

          {/* Security & Authentication */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] font-medium text-slate-400">Authentication & Security</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-400" />
              <span className="text-slate-300 font-medium">HTTP Basic + Crumb</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 truncate">
              Credentials bound server-side (zero leak)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleTrigger}
              isLoading={isTriggering}
              disabled={isLoadingStatus}
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              <Play className="h-3.5 w-3.5 mr-1" /> Trigger Build
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const nextState = !showConsole
                setShowConsole(nextState)
                if (nextState && !consoleText) {
                  fetchLogs()
                }
              }}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Terminal className="h-3.5 w-3.5 mr-1 text-slate-400" />
              {showConsole ? 'Hide Console' : 'View Console'}
              {showConsole ? (
                <ChevronUp className="h-3.5 w-3.5 ml-1 text-slate-500" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-1 text-slate-500" />
              )}
            </Button>
          </div>

          {showConsole && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchLogs()}
              isLoading={isLoadingLogs}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh Output
            </Button>
          )}
        </div>

        {/* Console Output Drawer */}
        {showConsole && (
          <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden text-xs animate-fade-in">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800/80 text-[11px] text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Console Output: {status?.jobName} #{latestBuild?.buildNumber || status?.latestBuildNumber || 'latest'}</span>
              </div>
              <span className="text-[10px] text-slate-500">Sensitive tokens & secrets automatically redacted</span>
            </div>
            <div className="p-3 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap select-text">
              {isLoadingLogs && !consoleText ? (
                <span className="text-slate-500 flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Fetching console logs from Jenkins...
                </span>
              ) : consoleText ? (
                consoleText
              ) : (
                <span className="text-slate-600">No console output received yet. Click &quot;Refresh Output&quot; or trigger a new build.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
