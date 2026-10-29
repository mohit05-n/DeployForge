'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ExternalLink, GitBranch, Globe, Rocket, Settings, Trash2,
  RefreshCw, ChevronRight, Clock, Code2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProjectStatusBadge, DeploymentStatusBadge } from '@/components/ui/Badge'
import { SkeletonPage } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { projectsService, deploymentsService } from '@/services'
import { formatRelativeTime, formatDateTime, formatDuration } from '@/lib/utils'
import type { Project, Deployment } from '@/types'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeploying, setIsDeploying] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    Promise.all([
      projectsService.getProject(id),
      deploymentsService.listDeployments(id),
    ]).then(([p, d]) => {
      setProject(p.data)
      setDeployments(d.data)
      setIsLoading(false)
    })
  }, [id])

  const handleDeploy = async () => {
    if (!project) return
    setIsDeploying(true)
    const result = await deploymentsService.triggerDeployment(project.id)
    setIsDeploying(false)
    if (result.error) {
      toast({ title: 'Deploy failed', description: result.error, variant: 'error' })
    } else {
      toast({ title: 'Deployment queued!', description: 'Demo mode — no real deployment triggered.', variant: 'success' })
      router.push(`/deployments/${result.data.id}`)
    }
  }

  const handleDelete = async () => {
    if (!project) return
    setIsDeleting(true)
    await projectsService.deleteProject(project.id)
    setIsDeleting(false)
    toast({ title: 'Project deleted', description: `${project.name} has been removed.`, variant: 'success' })
    router.push('/projects')
  }

  if (isLoading) return <SkeletonPage />
  if (!project) return <div className="text-slate-500 text-sm">Project not found.</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <Toaster />
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete project"
        description={`Permanently delete "${project.name}" and all its deployment history? This action cannot be undone.`}
        confirmLabel="Delete project"
        isLoading={isDeleting}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-100">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            {project.description && (
              <p className="text-sm text-slate-500 mt-0.5">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {project.deploymentUrl && (
            <a href={project.deploymentUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4" /> Visit
              </Button>
            </a>
          )}
          <Link href={`/projects/${project.id}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" /> Settings
            </Button>
          </Link>
          <Button size="sm" onClick={handleDeploy} isLoading={isDeploying}>
            <Rocket className="h-4 w-4" /> Deploy
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Repository', value: project.repository.fullName, icon: <GitBranch className="h-4 w-4" />, sub: `Branch: ${project.repository.branch}` },
          { label: 'Runtime', value: project.runtime, icon: <Code2 className="h-4 w-4" />, sub: `Provider: ${project.cloudProvider.toUpperCase()}` },
          { label: 'Region', value: project.region, icon: <Globe className="h-4 w-4" />, sub: `${project.cloudProvider.toUpperCase()}` },
          { label: 'Last Updated', value: formatRelativeTime(project.updatedAt), icon: <Clock className="h-4 w-4" />, sub: formatDateTime(project.updatedAt) },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1.5">
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </div>
            <p className="text-sm font-semibold text-slate-200 font-mono">{item.value}</p>
            <p className="text-xs text-slate-600 mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Last commit */}
      {project.repository.lastCommit && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Latest commit</h2>
          <div className="flex items-center gap-3">
            <code className="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-300">
              {project.repository.lastCommit.shortSha}
            </code>
            <span className="text-sm text-slate-300">{project.repository.lastCommit.message}</span>
            <span className="text-xs text-slate-500 ml-auto">
              by {project.repository.lastCommit.author} · {formatRelativeTime(project.repository.lastCommit.timestamp)}
            </span>
          </div>
        </div>
      )}

      {/* Build/start commands */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Build command', value: project.buildCommand },
          { label: 'Start command', value: project.startCommand },
        ].map((cmd) => (
          <div key={cmd.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500 mb-1.5">{cmd.label}</p>
            <code className="text-xs font-mono text-slate-300">{cmd.value}</code>
          </div>
        ))}
      </div>

      {/* Env vars */}
      {project.envVars.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-100">Environment variables</h2>
          </div>
          <table className="data-table w-full">
            <thead>
              <tr><th>Key</th><th>Value</th><th>Type</th></tr>
            </thead>
            <tbody>
              {project.envVars.map((ev) => (
                <tr key={ev.key}>
                  <td><code className="font-mono text-xs text-slate-300">{ev.key}</code></td>
                  <td><code className="font-mono text-xs text-slate-500">{ev.isSecret ? '••••••••' : ev.value}</code></td>
                  <td><span className={`text-xs px-2 py-0.5 rounded ${ev.isSecret ? 'bg-amber-950/50 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>{ev.isSecret ? 'Secret' : 'Plain'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deployments */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Deployment history</h2>
          <Button variant="ghost" size="sm" onClick={handleDeploy} isLoading={isDeploying}>
            <RefreshCw className="h-4 w-4" /> Redeploy
          </Button>
        </div>
        {deployments.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No deployments yet. Click &ldquo;Deploy&rdquo; to trigger the first deployment.
          </div>
        ) : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Commit</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Duration</th>
                <th className="hidden lg:table-cell">Triggered by</th>
                <th className="hidden sm:table-cell">Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((dep) => (
                <tr key={dep.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">{dep.commit.shortSha}</code>
                      <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[200px]">{dep.commit.message}</span>
                    </div>
                  </td>
                  <td><DeploymentStatusBadge status={dep.status} /></td>
                  <td className="hidden md:table-cell text-xs text-slate-500">{dep.duration ? formatDuration(dep.duration) : '—'}</td>
                  <td className="hidden lg:table-cell text-xs text-slate-500">{dep.triggeredBy}</td>
                  <td className="hidden sm:table-cell text-xs text-slate-500">{formatRelativeTime(dep.triggeredAt)}</td>
                  <td>
                    <Link href={`/deployments/${dep.id}`} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
                      Details <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
