'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Rocket, CheckCircle2, XCircle, Activity, Plus, TrendingUp, GitBranch
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { StatCard } from '@/components/ui/Card'
import { DeploymentStatusBadge, ProjectStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SkeletonPage } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { monitoringService, projectsService, deploymentsService } from '@/services'
import { MOCK_DEPLOYMENT_CHART_DATA } from '@/lib/mock-data'
import { formatRelativeTime, formatDuration } from '@/lib/utils'
import type { Project, Deployment } from '@/types'
import { JenkinsPipelineWidget } from '@/components/jenkins/JenkinsPipelineWidget'

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
      <p className="text-xs font-semibold text-slate-300 mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [stats, setStats] = useState({ total: 0, successful: 0, failed: 0, successRate: 0, averageDuration: 0 })

  useEffect(() => {
    Promise.all([
      projectsService.listProjects(),
      deploymentsService.listDeployments(),
      monitoringService.getDeploymentStats(),
    ]).then(([p, d, s]) => {
      setProjects(p.data)
      setDeployments(d.data)
      setStats(s.data)
      setIsLoading(false)
    })
  }, [])

  if (isLoading) return <SkeletonPage />

  const runningProjects = projects.filter((p) => p.status === 'active').length
  const recentDeployments = deployments.slice(0, 6)

  // Aggregate real deployment chart data over last 7 days
  const chartData = (() => {
    if (deployments.length === 0) return []
    const days: Record<string, { date: string; successful: number; failed: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      days[key] = { date: key, successful: 0, failed: 0 }
    }
    deployments.forEach((dep) => {
      const key = new Date(dep.triggeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (days[key]) {
        if (dep.status === 'success') days[key].successful++
        else if (dep.status === 'failed') days[key].failed++
      }
    })
    return Object.values(days)
  })()

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Monitor your deployments, projects, and application health.</p>
        </div>
        <Link href="/projects/new">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New project
          </Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Projects"
          value={projects.length}
          delta={projects.length > 0 ? `${runningProjects} active` : 'No projects'}
          trend={projects.length > 0 ? 'up' : 'neutral'}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          title="Successful Deploys"
          value={stats.successful}
          delta={stats.total > 0 ? `${stats.successRate}% success rate` : 'No deploy history'}
          trend={stats.successful > 0 ? 'up' : 'neutral'}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          title="Failed Deploys"
          value={stats.failed}
          delta={stats.failed > 2 ? 'Attention needed' : 'Zero failures'}
          trend={stats.failed > 2 ? 'down' : 'neutral'}
          icon={<XCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Apps Running"
          value={runningProjects}
          delta={projects.length > 0 ? `${runningProjects}/${projects.length} running` : 'No active apps'}
          trend="neutral"
          icon={<Rocket className="h-5 w-5" />}
        />
      </div>

      {/* Jenkins CI/CD Pipeline Integration Widget */}
      <JenkinsPipelineWidget />

      {/* Charts + recent activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Deployment chart */}
        <div className="xl:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Deployment Activity</h2>
              <p className="text-xs text-slate-500 mt-0.5">Last 7 days</p>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="py-8">
              <EmptyState
                title="No deployment activity yet"
                description="Deployments executed via Jenkins or GitHub webhooks will be tracked and charted here."
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="successful" name="Successful" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick stats */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-4">Platform Summary</h2>
          <div className="space-y-3">
            {[
              { label: 'Success rate', value: `${stats.successRate}%`, color: 'bg-emerald-500' },
              { label: 'Avg. deploy time', value: stats.total > 0 ? formatDuration(stats.averageDuration) : '—', color: 'bg-brand-500' },
              { label: 'Active projects', value: `${runningProjects}`, color: 'bg-violet-500' },
              { label: 'Total deployments', value: `${stats.total}`, color: 'bg-slate-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  <span className="text-sm text-slate-400">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-200">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 mb-3">Quick actions</p>
            <div className="space-y-2">
              <Link href="/projects/new" className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
                <Plus className="h-4 w-4 text-brand-400" /> New project
              </Link>
              <Link href="/deployments" className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
                <TrendingUp className="h-4 w-4 text-emerald-400" /> View deployments
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent deployments */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Recent Deployments</h2>
          <Link href="/deployments" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
            View all
          </Link>
        </div>
        {recentDeployments.length === 0 ? (
          <EmptyState title="No deployments yet" description="Deployments triggered via Jenkins or GitHub will appear here." />
        ) : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Project</th>
                <th className="hidden sm:table-cell">Commit</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Duration</th>
                <th className="hidden lg:table-cell">Triggered</th>
              </tr>
            </thead>
            <tbody>
              {recentDeployments.map((dep) => (
                <tr key={dep.id}>
                  <td>
                    <Link href={`/deployments/${dep.id}`} className="font-medium text-slate-200 hover:text-brand-400 transition-colors">
                      {dep.projectName}
                    </Link>
                  </td>
                  <td className="hidden sm:table-cell">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <GitBranch className="h-3 w-3" />
                      <code className="font-mono">{dep.commit.shortSha}</code>
                      <span className="truncate max-w-[200px]">{dep.commit.message}</span>
                    </div>
                  </td>
                  <td><DeploymentStatusBadge status={dep.status} /></td>
                  <td className="hidden md:table-cell text-slate-500 text-xs">
                    {dep.duration ? formatDuration(dep.duration) : '—'}
                  </td>
                  <td className="hidden lg:table-cell text-slate-500 text-xs">
                    {formatRelativeTime(dep.triggeredAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent projects */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Recent Projects</h2>
          <Link href="/projects" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
            View all
          </Link>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            title="No projects found"
            description="Create a project to connect your GitHub repository and configure CI/CD deployments."
            action={{
              label: 'Create project',
              onClick: () => router.push('/projects/new'),
            }}
          />
        ) : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th className="hidden sm:table-cell">Runtime</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Region</th>
                <th className="hidden lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 5).map((proj) => (
                <tr key={proj.id}>
                  <td>
                    <Link href={`/projects/${proj.id}`} className="font-medium text-slate-200 hover:text-brand-400 transition-colors">
                      {proj.name}
                    </Link>
                    {proj.description && (
                      <p className="text-xs text-slate-500 mt-0.5 hidden sm:block truncate max-w-xs">{proj.description}</p>
                    )}
                  </td>
                  <td className="hidden sm:table-cell">
                    <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">{proj.runtime}</span>
                  </td>
                  <td><ProjectStatusBadge status={proj.status} /></td>
                  <td className="hidden md:table-cell text-xs text-slate-500 font-mono">{proj.region}</td>
                  <td className="hidden lg:table-cell text-xs text-slate-500">{formatRelativeTime(proj.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
