'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Filter, GitBranch, Clock, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { DeploymentStatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { NoDeploymentsState } from '@/components/ui/EmptyState'
import { deploymentsService } from '@/services'
import { formatRelativeTime, formatDuration } from '@/lib/utils'
import type { Deployment, DeploymentStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Deploying', value: 'deploying' },
  { label: 'Queued', value: 'queued' },
]

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    deploymentsService.listDeployments().then((res) => {
      setDeployments(res.data)
      setIsLoading(false)
    })
  }, [])

  const filtered = deployments.filter((d) => {
    const matchesSearch = d.projectName.toLowerCase().includes(search.toLowerCase()) ||
      d.commit.message.toLowerCase().includes(search.toLowerCase()) ||
      d.commit.shortSha.includes(search)
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Deployments</h1>
        <p className="page-subtitle">Track and manage all deployment runs across your projects.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deployments..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <SkeletonTable rows={6} /> : filtered.length === 0 ? <NoDeploymentsState /> : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Project</th>
                <th className="hidden sm:table-cell">Commit</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Duration</th>
                <th className="hidden lg:table-cell">Region</th>
                <th className="hidden sm:table-cell">Triggered</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dep) => (
                <tr key={dep.id}>
                  <td>
                    <Link href={`/projects/${dep.projectId}`} className="text-sm font-medium text-slate-200 hover:text-brand-400 transition-colors">
                      {dep.projectName}
                    </Link>
                  </td>
                  <td className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">{dep.commit.shortSha}</code>
                      <span className="text-xs text-slate-500 truncate max-w-[180px]">{dep.commit.message}</span>
                    </div>
                  </td>
                  <td><DeploymentStatusBadge status={dep.status} /></td>
                  <td className="hidden md:table-cell text-xs text-slate-500">
                    {dep.duration ? formatDuration(dep.duration) : (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3 animate-spin-slow" /> Running</span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell text-xs font-mono text-slate-500">{dep.region}</td>
                  <td className="hidden sm:table-cell text-xs text-slate-500">
                    <div>{dep.triggeredBy}</div>
                    <div className="text-slate-600">{formatRelativeTime(dep.triggeredAt)}</div>
                  </td>
                  <td>
                    <Link href={`/deployments/${dep.id}`} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 whitespace-nowrap">
                      View <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
