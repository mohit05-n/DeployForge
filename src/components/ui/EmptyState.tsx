import * as React from 'react'
import { AlertCircle, FolderOpen, PackageSearch, ShieldX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-500 mb-4">
        {icon ?? <FolderOpen className="h-8 w-8" />}
      </div>
      <h3 className="text-base font-semibold text-slate-300">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-slate-500 max-w-sm">{description}</p>}
      {action && (
        <Button onClick={action.onClick} className="mt-5" size="sm">
          {action.label}
        </Button>
      )}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-950/50 text-red-400 mb-4">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h3 className="text-base font-semibold text-slate-300">Something went wrong</h3>
      <p className="mt-1.5 text-sm text-slate-500 max-w-sm">
        {message ?? 'An unexpected error occurred. Please try again.'}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-5" size="sm">
          Try again
        </Button>
      )}
    </div>
  )
}

export function NoProjectsState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={<PackageSearch className="h-8 w-8" />}
      title="No projects yet"
      description="Create your first project to start deploying applications to the cloud."
      action={{ label: 'Create project', onClick: onCreate }}
    />
  )
}

export function NoDeploymentsState() {
  return (
    <EmptyState
      icon={<PackageSearch className="h-8 w-8" />}
      title="No deployments"
      description="No deployments found for the current filter. Trigger a deployment to get started."
    />
  )
}

export function NoScansState() {
  return (
    <EmptyState
      icon={<ShieldX className="h-8 w-8" />}
      title="No security scans"
      description="Security scan results appear here after a deployment runs the Trivy scanner."
    />
  )
}
