'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Filter, ExternalLink, GitBranch, Globe } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ProjectStatusBadge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { NoProjectsState } from '@/components/ui/EmptyState'
import { projectsService } from '@/services'
import { formatRelativeTime } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Deploying', value: 'deploying' },
  { label: 'Failed', value: 'failed' },
  { label: 'Paused', value: 'paused' },
  { label: 'Archived', value: 'archived' },
]

const RUNTIME_ICONS: Record<string, string> = {
  nodejs:  '⬢',
  python:  '🐍',
  docker:  '🐳',
  static:  '📄',
  nextjs:  '▲',
  react:   '⚛',
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    projectsService.listProjects().then((res) => {
      setProjects(res.data)
      setIsLoading(false)
    })
  }, [])

  const filtered = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">{projects.length} project{projects.length !== 1 ? 's' : ''} in your workspace</p>
        </div>
        <Link href="/projects/new">
          <Button size="sm"><Plus className="h-4 w-4" />New project</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-slate-500" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Project grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        projects.length === 0
          ? <NoProjectsState onCreate={() => window.location.href = '/projects/new'} />
          : (
            <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center">
              <p className="text-slate-500 text-sm">No projects match your filters.</p>
              <button onClick={() => { setSearch(''); setStatusFilter('all') }} className="mt-2 text-sm text-brand-400 hover:text-brand-300">
                Clear filters
              </button>
            </div>
          )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((proj) => (
            <ProjectCard key={proj.id} project={proj} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="block group">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700 hover:bg-slate-800/50 transition-all duration-200 h-full">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{RUNTIME_ICONS[project.runtime] ?? '📦'}</span>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 group-hover:text-brand-400 transition-colors">
                {project.name}
              </h3>
              <p className="text-xs font-mono text-slate-500">{project.runtime}</p>
            </div>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>

        {project.description && (
          <p className="text-xs text-slate-500 mb-3 line-clamp-2">{project.description}</p>
        )}

        <div className="space-y-1.5 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{project.repository.fullName}</span>
            <span className="text-slate-600">@{project.repository.branch}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 flex-shrink-0" />
            <span className="font-mono">{project.region}</span>
          </div>
        </div>

        {project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <span key={tag} className="rounded px-1.5 py-0.5 text-xs bg-slate-800 text-slate-500">{tag}</span>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-600">{formatRelativeTime(project.updatedAt)}</span>
          {project.deploymentUrl && (
            <span className="flex items-center gap-1 text-xs text-brand-400 group-hover:text-brand-300 transition-colors">
              <ExternalLink className="h-3 w-3" />
              Live
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
