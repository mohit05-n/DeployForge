import * as React from 'react'
import { cn } from '@/lib/utils'
import type {
  DeploymentStatus,
  ProjectStatus,
  StageStatus,
  Severity,
  ResourceStatus,
} from '@/types'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'purple'

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-700 text-slate-300',
  success: 'bg-emerald-900/50 text-emerald-400 border border-emerald-800/50',
  warning: 'bg-amber-900/50 text-amber-400 border border-amber-800/50',
  error: 'bg-red-900/50 text-red-400 border border-red-800/50',
  info: 'bg-blue-900/50 text-blue-400 border border-blue-800/50',
  neutral: 'bg-slate-800 text-slate-400 border border-slate-700',
  purple: 'bg-violet-900/50 text-violet-400 border border-violet-800/50',
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
  pulse?: boolean
}

export function Badge({ variant = 'default', dot, pulse, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full bg-current', pulse && 'animate-pulse')} />
      )}
      {children}
    </span>
  )
}

export function DeploymentStatusBadge({ status }: { status: DeploymentStatus }) {
  const map: Record<DeploymentStatus, { label: string; variant: BadgeVariant; dot?: boolean; pulse?: boolean }> = {
    queued:       { label: 'Queued',        variant: 'neutral', dot: true },
    building:     { label: 'Building',      variant: 'info',    dot: true, pulse: true },
    testing:      { label: 'Testing',       variant: 'info',    dot: true, pulse: true },
    scanning:     { label: 'Scanning',      variant: 'info',    dot: true, pulse: true },
    publishing:   { label: 'Publishing',    variant: 'info',    dot: true, pulse: true },
    deploying:    { label: 'Deploying',     variant: 'purple',  dot: true, pulse: true },
    health_check: { label: 'Health Check',  variant: 'info',    dot: true, pulse: true },
    success:      { label: 'Success',       variant: 'success', dot: true },
    failed:       { label: 'Failed',        variant: 'error',   dot: true },
    cancelled:    { label: 'Cancelled',     variant: 'neutral', dot: true },
    rolled_back:  { label: 'Rolled Back',   variant: 'warning', dot: true },
  }
  const config = map[status]
  return <Badge variant={config.variant} dot={config.dot} pulse={config.pulse}>{config.label}</Badge>
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const map: Record<ProjectStatus, { label: string; variant: BadgeVariant; dot?: boolean; pulse?: boolean }> = {
    active:    { label: 'Active',     variant: 'success', dot: true },
    deploying: { label: 'Deploying',  variant: 'info',    dot: true, pulse: true },
    failed:    { label: 'Failed',     variant: 'error',   dot: true },
    paused:    { label: 'Paused',     variant: 'neutral', dot: true },
    archived:  { label: 'Archived',   variant: 'neutral', dot: true },
  }
  const config = map[status]
  return <Badge variant={config.variant} dot={config.dot} pulse={config.pulse}>{config.label}</Badge>
}

export function StageBadge({ status }: { status: StageStatus }) {
  const map: Record<StageStatus, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'neutral' },
    running: { label: 'Running', variant: 'info' },
    success: { label: 'Success', variant: 'success' },
    failed:  { label: 'Failed',  variant: 'error' },
    skipped: { label: 'Skipped', variant: 'neutral' },
  }
  const config = map[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, { label: string; variant: BadgeVariant }> = {
    critical: { label: 'Critical', variant: 'error' },
    high:     { label: 'High',     variant: 'warning' },
    medium:   { label: 'Medium',   variant: 'info' },
    low:      { label: 'Low',      variant: 'neutral' },
    unknown:  { label: 'Unknown',  variant: 'neutral' },
  }
  const config = map[severity]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function ResourceStatusBadge({ status }: { status: ResourceStatus }) {
  const map: Record<ResourceStatus, { label: string; variant: BadgeVariant; dot?: boolean }> = {
    running: { label: 'Running', variant: 'success', dot: true },
    stopped: { label: 'Stopped', variant: 'neutral', dot: true },
    pending: { label: 'Pending', variant: 'warning', dot: true },
    error:   { label: 'Error',   variant: 'error',   dot: true },
    unknown: { label: 'Unknown', variant: 'neutral', dot: true },
  }
  const config = map[status]
  return <Badge variant={config.variant} dot={config.dot}>{config.label}</Badge>
}
