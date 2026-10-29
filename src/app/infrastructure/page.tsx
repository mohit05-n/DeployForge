'use client'

import { useEffect, useState } from 'react'
import {
  Server, Database, Globe, Shield, Box, LayoutGrid,
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ResourceStatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { infrastructureService } from '@/services'
import { formatDateTime } from '@/lib/utils'
import type { InfrastructureResource, ResourceType, TerraformPlan } from '@/types'

const RESOURCE_ICONS: Record<ResourceType, React.ElementType> = {
  ec2_instance:     Server,
  ecs_cluster:      LayoutGrid,
  ecs_service:      LayoutGrid,
  ecr_repository:   Box,
  load_balancer:    Globe,
  rds_instance:     Database,
  elasticache:      Database,
  s3_bucket:        Box,
  cloudfront:       Globe,
  vpc:              Shield,
  security_group:   Shield,
  iam_role:         Shield,
}

function TerraformActionBadge({ action }: { action: TerraformPlan['changes'][number]['action'] }) {
  const map = {
    create:  { label: '+ create', className: 'text-emerald-400 bg-emerald-950/50 border-emerald-800/50' },
    update:  { label: '~ update', className: 'text-amber-400 bg-amber-950/50 border-amber-800/50' },
    delete:  { label: '- delete', className: 'text-red-400 bg-red-950/50 border-red-800/50' },
    'no-op': { label: '  no-op', className: 'text-slate-500 bg-slate-800/50 border-slate-700' },
  }
  const { label, className } = map[action]
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${className}`}>{label}</span>
  )
}

export default function InfrastructurePage() {
  const [resources, setResources] = useState<InfrastructureResource[]>([])
  const [plan, setPlan] = useState<TerraformPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showApplyDialog, setShowApplyDialog] = useState(false)
  const [totalCost, setTotalCost] = useState(0)

  useEffect(() => {
    Promise.all([
      infrastructureService.listResources(),
      infrastructureService.getTerraformPlan('proj_01'),
    ]).then(([r, p]) => {
      setResources(r.data)
      setPlan(p.data)
      const cost = r.data.reduce((acc, res) => acc + (res.cost?.monthly ?? 0), 0)
      setTotalCost(cost)
      setIsLoading(false)
    })
  }, [])

  const handleApply = async () => {
    setShowApplyDialog(false)
    toast({
      title: 'Apply disabled in demo mode',
      description: 'Connect a real backend with Terraform integration to apply infrastructure changes.',
      variant: 'warning',
    })
  }

  const runningCount = resources.filter((r) => r.status === 'running').length

  return (
    <div className="space-y-6 animate-fade-in">
      <Toaster />
      <ConfirmDialog
        open={showApplyDialog}
        onClose={() => setShowApplyDialog(false)}
        onConfirm={handleApply}
        title="Apply Terraform plan"
        description="This would apply real infrastructure changes. In demo mode, no changes will be made to your cloud account."
        confirmLabel="Apply (demo — no real changes)"
        confirmVariant="destructive"
      />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Infrastructure</h1>
          <p className="page-subtitle">Cloud resource inventory and Terraform plan management.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-amber-800/50 bg-amber-950/30 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400">Demo Mode — no real cloud connected</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total resources',    value: resources.length,  icon: <Server className="h-5 w-5" /> },
          { label: 'Running',            value: runningCount,       icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" /> },
          { label: 'Est. monthly cost',  value: `$${totalCost.toFixed(0)}`, icon: <TrendingUp className="h-5 w-5 text-brand-400" /> },
          { label: 'Pending changes',    value: plan ? plan.summary.toAdd + plan.summary.toChange + plan.summary.toDestroy : 0, icon: <AlertTriangle className="h-5 w-5 text-amber-400" /> },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">{item.label}</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{item.value}</p>
              </div>
              <div className="text-slate-500">{item.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Resources table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Resource inventory</h2>
        </div>
        {isLoading ? <SkeletonTable rows={6} /> : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Resource</th>
                <th className="hidden sm:table-cell">Type</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Region</th>
                <th className="hidden lg:table-cell">Monthly cost</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((res) => {
                const Icon = RESOURCE_ICONS[res.type] ?? Box
                return (
                  <tr key={res.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-200">{res.name}</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                        {res.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td><ResourceStatusBadge status={res.status} /></td>
                    <td className="hidden md:table-cell text-xs font-mono text-slate-500">{res.region}</td>
                    <td className="hidden lg:table-cell text-xs text-slate-400">
                      {res.cost ? `$${res.cost.monthly.toFixed(2)}/mo` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Terraform plan */}
      {plan && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Terraform Plan</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {plan.summary.toAdd} to add · {plan.summary.toChange} to change · {plan.summary.toDestroy} to destroy
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 font-mono">{plan.status}</span>
              <Button size="sm" onClick={() => setShowApplyDialog(true)} variant="outline">
                Apply plan
              </Button>
            </div>
          </div>

          <div className="p-5">
            <div className="rounded-lg bg-slate-950 border border-slate-800 divide-y divide-slate-800 overflow-hidden font-mono text-xs">
              {plan.changes.map((change, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-2.5">
                  <TerraformActionBadge action={change.action} />
                  <span className="text-slate-400 flex-1 truncate">{change.address}</span>
                  {change.details && <span className="text-slate-600 hidden md:block truncate max-w-[200px]">{change.details}</span>}
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
              <p className="text-xs text-amber-400">
                <strong>Terraform apply is disabled in demo mode.</strong> Pressing &ldquo;Apply plan&rdquo; will not modify any real cloud resources. Connect a real backend to enable infrastructure automation.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
