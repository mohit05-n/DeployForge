'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, FormField, Select } from '@/components/ui/Input'
import { projectsService } from '@/services'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { SkeletonPage } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/Dialog'
import type { Project, AWSRegion } from '@/types'

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', branch: '', region: 'us-east-1' as AWSRegion, buildCommand: '', startCommand: '' })
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    projectsService.getProject(id).then((res) => {
      const p = res.data
      setProject(p)
      setForm({
        name: p.name,
        description: p.description ?? '',
        branch: p.repository.branch,
        region: p.region,
        buildCommand: p.buildCommand,
        startCommand: p.startCommand,
      })
      setIsLoading(false)
    })
  }, [id])

  const handleSave = async () => {
    if (!project) return
    setIsSaving(true)
    await projectsService.updateProject(project.id, {
      name: form.name,
      description: form.description,
      buildCommand: form.buildCommand,
      startCommand: form.startCommand,
      region: form.region,
    })
    setIsSaving(false)
    toast({ title: 'Settings saved', variant: 'success' })
  }

  const handleDelete = async () => {
    if (!project) return
    setIsDeleting(true)
    await projectsService.deleteProject(project.id)
    toast({ title: 'Project deleted', variant: 'success' })
    router.push('/projects')
  }

  if (isLoading) return <SkeletonPage />

  return (
    <div className="animate-fade-in">
      <Toaster />
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete project"
        description={`Delete "${project?.name}"? This removes all deployment history and cannot be undone.`}
        isLoading={isDeleting}
      />

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="page-title">Project settings</h1>
          <p className="page-subtitle">{project?.name}</p>
        </div>
      </div>

      <div className="max-w-xl space-y-8">
        {/* General */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">General</h2>
          <FormField label="Project name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Description">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <FormField label="Default branch">
            <Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
          </FormField>
        </section>

        {/* Build */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">Build & deploy</h2>
          <FormField label="Build command">
            <Input value={form.buildCommand} onChange={(e) => setForm({ ...form, buildCommand: e.target.value })} className="font-mono text-xs" />
          </FormField>
          <FormField label="Start command">
            <Input value={form.startCommand} onChange={(e) => setForm({ ...form, startCommand: e.target.value })} className="font-mono text-xs" />
          </FormField>
          <FormField label="Region">
            <Select
              value={form.region}
              options={[
                { value: 'us-east-1', label: 'US East (N. Virginia)' },
                { value: 'us-west-2', label: 'US West (Oregon)' },
                { value: 'eu-west-1', label: 'EU West (Ireland)' },
                { value: 'eu-central-1', label: 'EU Central (Frankfurt)' },
                { value: 'ap-southeast-1', label: 'AP Southeast (Singapore)' },
                { value: 'ap-northeast-1', label: 'AP Northeast (Tokyo)' },
              ]}
              onChange={(e) => setForm({ ...form, region: e.target.value as AWSRegion })}
            />
          </FormField>
        </section>

        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={isSaving}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        </div>

        {/* Danger zone */}
        <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
          <h2 className="text-sm font-semibold text-red-400 mb-3">Danger zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Delete this project</p>
              <p className="text-xs text-slate-500 mt-0.5">Permanently remove this project and all its deployment history.</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>Delete</Button>
          </div>
        </section>
      </div>
    </div>
  )
}
