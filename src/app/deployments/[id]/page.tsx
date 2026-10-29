'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, RefreshCw, RotateCcw, CheckCircle2, XCircle,
  Clock, Loader2, MinusCircle, ExternalLink, GitBranch, Tag
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DeploymentStatusBadge, StageBadge } from '@/components/ui/Badge'
import { SkeletonPage } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { deploymentsService } from '@/services'
import { formatDateTime, formatRelativeTime, formatDuration } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Deployment, DeploymentStage, LogLevel, StageStatus } from '@/types'

const STAGE_ICONS: Record<StageStatus, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-slate-500" />,
  running: <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  failed:  <XCircle className="h-4 w-4 text-red-400" />,
  skipped: <MinusCircle className="h-4 w-4 text-slate-600" />,
}

const LOG_COLORS: Record<LogLevel, string> = {
  info:    'text-slate-400',
  warn:    'text-amber-400',
  error:   'text-red-400',
  debug:   'text-slate-600',
  success: 'text-emerald-400',
}

function StagePanel({ stage, isExpanded, onToggle }: {
  stage: DeploymentStage
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      stage.status === 'running' ? 'border-blue-800/50 bg-blue-950/10' :
      stage.status === 'failed'  ? 'border-red-800/50 bg-red-950/10' :
      stage.status === 'success' ? 'border-slate-800 bg-slate-900' :
                                    'border-slate-800 bg-slate-900/50'
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {STAGE_ICONS[stage.status]}
          <span className={cn('text-sm font-medium', stage.status === 'skipped' ? 'text-slate-600' : 'text-slate-200')}>
            {stage.name}
          </span>
          <StageBadge status={stage.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {stage.duration && <span>{formatDuration(stage.duration)}</span>}
          {stage.startedAt && <span className="hidden sm:block">{formatDateTime(stage.startedAt)}</span>}
        </div>
      </button>

      {isExpanded && stage.logs.length > 0 && (
        <div className="border-t border-slate-800 bg-slate-950 p-4 rounded-b-lg overflow-x-auto max-h-72 overflow-y-auto">
          {stage.logs.map((log) => (
            <div key={log.id} className="flex gap-3 log-line">
              <span className="text-slate-600 flex-shrink-0 select-none">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className={cn('flex-shrink-0 w-14', LOG_COLORS[log.level])}>[{log.level.toUpperCase()}]</span>
              <span className={LOG_COLORS[log.level]}>{log.message}</span>
            </div>
          ))}
        </div>
      )}
      {isExpanded && stage.logs.length === 0 && stage.status !== 'pending' && (
        <div className="border-t border-slate-800 p-4 text-xs text-slate-600 font-mono">No logs available for this stage.</div>
      )}
    </div>
  )
}

export default function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [showRetryDialog, setShowRetryDialog] = useState(false)
  const [showRollbackDialog, setShowRollbackDialog] = useState(false)
  const [isActioning, setIsActioning] = useState(false)

  useEffect(() => {
    deploymentsService.getDeployment(id).then((res) => {
      setDeployment(res.data)
      // Auto-expand failed or running stages
      const autoExpand = new Set(
        res.data.stages
          .filter((s) => s.status === 'failed' || s.status === 'running')
          .map((s) => s.id)
      )
      setExpandedStages(autoExpand)
      setIsLoading(false)
    })
  }, [id])

  const toggleStage = (id: string) =>
    setExpandedStages((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleRetry = async () => {
    if (!deployment) return
    setIsActioning(true)
    const result = await deploymentsService.retryDeployment(deployment.id)
    setIsActioning(false)
    setShowRetryDialog(false)
    toast({ title: 'Retry queued', description: result.data.message, variant: 'success' })
  }

  const handleRollback = async () => {
    if (!deployment) return
    setIsActioning(true)
    const result = await deploymentsService.rollbackDeployment(deployment.id)
    setIsActioning(false)
    setShowRollbackDialog(false)
    toast({ title: 'Rollback initiated', description: result.data.message, variant: 'warning' })
  }

  if (isLoading) return <SkeletonPage />
  if (!deployment) return <div className="text-slate-500 text-sm">Deployment not found.</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <Toaster />
      <ConfirmDialog
        open={showRetryDialog}
        onClose={() => setShowRetryDialog(false)}
        onConfirm={handleRetry}
        title="Retry deployment"
        description="Re-queue this deployment with the same commit SHA and target configuration."
        confirmLabel="Retry"
        confirmVariant="default"
        isLoading={isActioning}
      />
      <ConfirmDialog
        open={showRollbackDialog}
        onClose={() => setShowRollbackDialog(false)}
        onConfirm={handleRollback}
        title="Rollback deployment"
        description="Roll back to the previous successful deployment image tag and revision."
        confirmLabel="Rollback"
        confirmVariant="destructive"
        isLoading={isActioning}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/deployments" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-1 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> All deployments
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-100">{deployment.projectName}</h1>
            <DeploymentStatusBadge status={deployment.status} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Triggered by {deployment.triggeredBy} · {formatRelativeTime(deployment.triggeredAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deployment.status === 'failed' && (
            <Button size="sm" onClick={() => setShowRetryDialog(true)}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          )}
          {deployment.isRollbackAvailable && (
            <Button variant="outline" size="sm" onClick={() => setShowRollbackDialog(true)}>
              <RotateCcw className="h-4 w-4" /> Rollback
            </Button>
          )}
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Commit',
            value: deployment.commit.shortSha,
            sub: deployment.commit.message,
            icon: <GitBranch className="h-4 w-4" />,
          },
          {
            label: 'Image tag',
            value: deployment.imageTag ?? 'N/A',
            sub: 'ECR image',
            icon: <Tag className="h-4 w-4" />,
          },
          {
            label: 'Duration',
            value: deployment.duration ? formatDuration(deployment.duration) : 'In progress',
            sub: deployment.completedAt ? `Completed ${formatRelativeTime(deployment.completedAt)}` : 'Still running...',
            icon: <Clock className="h-4 w-4" />,
          },
          {
            label: 'Region',
            value: deployment.region,
            sub: deployment.cloudProvider.toUpperCase(),
            icon: <ExternalLink className="h-4 w-4" />,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1.5">
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </div>
            <p className="text-sm font-mono font-semibold text-slate-200 truncate">{item.value}</p>
            <p className="text-xs text-slate-600 mt-0.5 truncate">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Deployment URL */}
      {deployment.deploymentUrl && (
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-400 font-semibold">Deployment URL</p>
            <a href={deployment.deploymentUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-emerald-300 hover:text-emerald-200 transition-colors flex items-center gap-1 mt-0.5">
              {deployment.deploymentUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {/* Pipeline stages */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-200">Pipeline stages</h2>
          <button
            onClick={() => setExpandedStages(new Set(deployment.stages.map((s) => s.id)))}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            Expand all
          </button>
        </div>
        <div className="space-y-2">
          {deployment.stages.map((stage) => (
            <StagePanel
              key={stage.id}
              stage={stage}
              isExpanded={expandedStages.has(stage.id)}
              onToggle={() => toggleStage(stage.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
