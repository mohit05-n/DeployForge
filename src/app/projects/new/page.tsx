'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, ChevronRight, ChevronLeft, Plus, Trash2, Eye, EyeOff,
  GitBranch, Github, ExternalLink, RefreshCw, Lock
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, FormField, Select, Textarea } from '@/components/ui/Input'
import { projectsService, githubIntegrationService, GitHubRepoOption, GitHubBranchOption } from '@/services'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import type { ProjectFormData, RuntimeType, AWSRegion, EnvironmentVariable } from '@/types'

// ─── Step metadata ────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Project',    desc: 'Name & source' },
  { label: 'Repository', desc: 'URL & branch' },
  { label: 'Runtime',    desc: 'Framework' },
  { label: 'Build',      desc: 'Commands' },
  { label: 'Env Vars',   desc: 'Configuration' },
  { label: 'Target',     desc: 'Region' },
  { label: 'Review',     desc: 'Confirm' },
]

const RUNTIMES: { value: RuntimeType; label: string; description: string }[] = [
  { value: 'nodejs',  label: 'Node.js',           description: 'Express, Fastify, NestJS, and other Node.js applications' },
  { value: 'python',  label: 'Python',            description: 'FastAPI, Flask, Django, and other Python applications' },
  { value: 'docker',  label: 'Dockerfile',        description: 'Custom Dockerfile for any application type' },
  { value: 'nextjs',  label: 'Next.js',           description: 'Next.js full-stack React framework' },
  { value: 'react',   label: 'React / Static',    description: 'Static React SPA or any static site' },
]

const REGIONS: { value: AWSRegion; label: string }[] = [
  { value: 'us-east-1',      label: 'US East (N. Virginia)' },
  { value: 'us-west-2',      label: 'US West (Oregon)' },
  { value: 'eu-west-1',      label: 'EU West (Ireland)' },
  { value: 'eu-central-1',   label: 'EU Central (Frankfurt)' },
  { value: 'ap-southeast-1', label: 'AP Southeast (Singapore)' },
  { value: 'ap-northeast-1', label: 'AP Northeast (Tokyo)' },
]

const INITIAL_FORM: ProjectFormData = {
  name: '',
  description: '',
  repositoryUrl: '',
  branch: 'main',
  runtime: 'nodejs',
  region: 'us-east-1',
  cloudProvider: 'aws',
  buildCommand: 'npm run build',
  startCommand: 'npm run start',
  envVars: [],
}

// ─── Stepper header ───────────────────────────────────────────────────────
function StepperHeader({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-8">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={cn(
            'flex flex-col items-center',
            i <= current ? 'opacity-100' : 'opacity-40'
          )}>
            <div className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-all',
              i < current  ? 'bg-brand-600 border-brand-600 text-white' :
              i === current ? 'border-brand-500 text-brand-400 bg-slate-800' :
                              'border-slate-700 text-slate-500 bg-slate-900'
            )}>
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className="mt-1 text-xs text-slate-500 hidden sm:block whitespace-nowrap">{step.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn('h-px flex-1 min-w-4 mx-1', i < current ? 'bg-brand-600' : 'bg-slate-800')} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Steps ────────────────────────────────────────────────────────────────
function Step1({ form, setForm, errors }: { form: ProjectFormData; setForm: (f: ProjectFormData) => void; errors: Record<string, string> }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Project details</h2>
        <p className="text-sm text-slate-500 mt-0.5">Give your project a name and optional description.</p>
      </div>
      <FormField label="Project name" error={errors.name} required hint="Lowercase letters, numbers, and hyphens. Used as the slug.">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-api-service" error={errors.name} />
      </FormField>
      <FormField label="Description" hint="Optional: briefly describe what this project does.">
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A brief description of your project" />
      </FormField>
      <FormField label="Repository source">
        <Select
          value="github"
          options={[
            { value: 'github', label: 'GitHub' },
            { value: 'gitlab', label: 'GitLab (coming soon)', disabled: true },
            { value: 'bitbucket', label: 'Bitbucket (coming soon)', disabled: true },
          ]}
          onChange={() => {}}
        />
      </FormField>
    </div>
  )
}

function Step2({ form, setForm, errors }: { form: ProjectFormData; setForm: (f: ProjectFormData) => void; errors: Record<string, string> }) {
  const [isCheckingGitHub, setIsCheckingGitHub] = useState(true)
  const [isGitHubConnected, setIsGitHubConnected] = useState(false)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [repos, setRepos] = useState<GitHubRepoOption[]>([])
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [branches, setBranches] = useState<GitHubBranchOption[]>([])
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [selectedRepoFull, setSelectedRepoFull] = useState<string>('')
  const [useManualUrl, setUseManualUrl] = useState(false)

  useEffect(() => {
    async function checkGitHub() {
      setIsCheckingGitHub(true)
      const res = await githubIntegrationService.getStatus()
      if (res.data?.connected) {
        setIsGitHubConnected(true)
        setGithubUsername(res.data.username || null)
        loadRepos()
      } else {
        setIsGitHubConnected(false)
        setUseManualUrl(true)
      }
      setIsCheckingGitHub(false)
    }
    checkGitHub()
  }, [])

  const loadRepos = async () => {
    setIsLoadingRepos(true)
    const res = await githubIntegrationService.listRepositories()
    if (res.data && res.data.length > 0) {
      setRepos(res.data)
    }
    setIsLoadingRepos(false)
  }

  const handleSelectRepo = async (fullName: string) => {
    setSelectedRepoFull(fullName)
    const repo = repos.find((r) => r.fullName === fullName)
    if (!repo) return

    const canonicalUrl = repo.url || `https://github.com/${fullName}`
    const defaultBranch = repo.defaultBranch || 'main'

    setForm({
      ...form,
      repositoryUrl: canonicalUrl,
      branch: defaultBranch,
      name: form.name || repo.name,
    })

    // Fetch branches for selected repo
    setIsLoadingBranches(true)
    const branchRes = await githubIntegrationService.listBranches(fullName)
    if (branchRes.data && branchRes.data.length > 0) {
      setBranches(branchRes.data)
    } else {
      setBranches([{ name: defaultBranch, commitSha: '' }])
    }
    setIsLoadingBranches(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Repository</h2>
          <p className="text-sm text-slate-500 mt-0.5">Specify the GitHub repository and branch to deploy.</p>
        </div>

        {isGitHubConnected && (
          <button
            type="button"
            onClick={() => setUseManualUrl(!useManualUrl)}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            {useManualUrl ? '← Select from GitHub' : 'Enter URL manually'}
          </button>
        )}
      </div>

      {/* GitHub Connection Banner */}
      {!isCheckingGitHub && (
        <div className={cn(
          'rounded-xl border p-4 flex items-center justify-between',
          isGitHubConnected
            ? 'border-emerald-800/40 bg-emerald-950/20'
            : 'border-amber-800/40 bg-amber-950/20'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center',
              isGitHubConnected ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/50 text-amber-400'
            )}>
              <Github className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                {isGitHubConnected ? `Connected as @${githubUsername}` : 'GitHub account not connected'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isGitHubConnected
                  ? 'Access granted to your authorized repositories and organizations.'
                  : 'Connect GitHub in Settings to select repositories and branches with one click.'}
              </p>
            </div>
          </div>
          {!isGitHubConnected && (
            <Link href="/settings?tab=github" target="_blank" className="flex-shrink-0">
              <Button size="sm" variant="outline" className="text-xs">
                Connect GitHub <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Connected GitHub Repositories Selector */}
      {isGitHubConnected && !useManualUrl ? (
        <div className="space-y-4">
          <FormField label="Select repository" error={errors.repositoryUrl} required hint="Choose an authorized GitHub repository to deploy.">
            {isLoadingRepos ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading your repositories...
              </div>
            ) : repos.length > 0 ? (
              <Select
                value={selectedRepoFull}
                options={[
                  { value: '', label: 'Select a repository...' },
                  ...repos.map((r) => ({
                    value: r.fullName,
                    label: `${r.fullName} ${r.isPrivate ? '(Private)' : ''} [${r.language || 'Code'}]`,
                  })),
                ]}
                onChange={(e) => handleSelectRepo(e.target.value)}
              />
            ) : (
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-400">
                No repositories found under this account. You can enter the URL manually.
              </div>
            )}
          </FormField>

          {/* Branch Selector for selected repository */}
          {selectedRepoFull && (
            <FormField label="Branch" required hint="Default branch for automated deployments and webhook triggers.">
              {isLoadingBranches ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading branches...
                </div>
              ) : branches.length > 0 ? (
                <Select
                  value={form.branch}
                  options={branches.map((b) => ({
                    value: b.name,
                    label: b.name,
                  }))}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                />
              ) : (
                <Input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="main"
                />
              )}
            </FormField>
          )}
        </div>
      ) : (
        /* Manual URL Entry */
        <div className="space-y-4">
          <FormField label="Repository URL" error={errors.repositoryUrl} required hint="Full GitHub HTTPS URL, e.g. https://github.com/owner/repository">
            <Input
              value={form.repositoryUrl}
              onChange={(e) => setForm({ ...form, repositoryUrl: e.target.value })}
              placeholder="https://github.com/owner/repository"
              error={errors.repositoryUrl}
            />
          </FormField>
          <FormField label="Branch" required hint="Default deployment branch (e.g. main, master, staging)">
            <Input
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              placeholder="main"
            />
          </FormField>
        </div>
      )}
    </div>
  )
}

function Step3({ form, setForm }: { form: ProjectFormData; setForm: (f: ProjectFormData) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Runtime & framework</h2>
        <p className="text-sm text-slate-500 mt-0.5">Select the runtime that matches your application.</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {RUNTIMES.map((rt) => (
          <button
            key={rt.value}
            onClick={() => setForm({ ...form, runtime: rt.value })}
            className={cn(
              'w-full text-left rounded-lg border p-4 transition-all',
              form.runtime === rt.value
                ? 'border-brand-500 bg-brand-950/30 ring-1 ring-brand-500'
                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={cn('text-sm font-semibold', form.runtime === rt.value ? 'text-brand-300' : 'text-slate-200')}>
                  {rt.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{rt.description}</p>
              </div>
              {form.runtime === rt.value && (
                <Check className="h-4 w-4 text-brand-400 flex-shrink-0" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Step4({ form, setForm }: { form: ProjectFormData; setForm: (f: ProjectFormData) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Build & start commands</h2>
        <p className="text-sm text-slate-500 mt-0.5">Commands run inside the container to build and start your app.</p>
      </div>
      <FormField label="Build command" hint="e.g. npm run build, pip install -r requirements.txt">
        <Input value={form.buildCommand} onChange={(e) => setForm({ ...form, buildCommand: e.target.value })} placeholder="npm run build" className="font-mono text-xs" />
      </FormField>
      <FormField label="Start command" hint="e.g. npm run start, uvicorn main:app --host 0.0.0.0 --port 8000">
        <Input value={form.startCommand} onChange={(e) => setForm({ ...form, startCommand: e.target.value })} placeholder="npm run start" className="font-mono text-xs" />
      </FormField>
    </div>
  )
}

function Step5({ form, setForm }: { form: ProjectFormData; setForm: (f: ProjectFormData) => void }) {
  const addVar = () => setForm({ ...form, envVars: [...form.envVars, { key: '', value: '', isSecret: false }] })
  const removeVar = (i: number) => setForm({ ...form, envVars: form.envVars.filter((_, idx) => idx !== i) })
  const updateVar = (i: number, field: keyof EnvironmentVariable, value: string | boolean) =>
    setForm({ ...form, envVars: form.envVars.map((v, idx) => idx === i ? { ...v, [field]: value } : v) })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Environment variables</h2>
        <p className="text-sm text-slate-500 mt-0.5">Configure runtime environment variables. Secret values are masked in logs.</p>
      </div>

      <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 p-3">
        <p className="text-xs text-blue-400">Never put private keys or cloud credentials in environment variables visible to frontend code. These are passed to the backend deployment service only.</p>
      </div>

      {form.envVars.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">No environment variables configured.</p>
      ) : (
        <div className="space-y-2">
          {form.envVars.map((ev, i) => (
            <EnvVarRow key={i} ev={ev} onUpdate={(f, v) => updateVar(i, f, v)} onRemove={() => removeVar(i)} />
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={addVar}>
        <Plus className="h-4 w-4" /> Add variable
      </Button>
    </div>
  )
}

function EnvVarRow({ ev, onUpdate, onRemove }: {
  ev: EnvironmentVariable
  onUpdate: (field: keyof EnvironmentVariable, value: string | boolean) => void
  onRemove: () => void
}) {
  const [showValue, setShowValue] = useState(!ev.isSecret)
  return (
    <div className="flex items-center gap-2">
      <Input value={ev.key} onChange={(e) => onUpdate('key', e.target.value)} placeholder="KEY" className="font-mono text-xs w-40 flex-shrink-0" />
      <div className="relative flex-1">
        <Input
          value={ev.value}
          onChange={(e) => onUpdate('value', e.target.value)}
          placeholder="value"
          type={ev.isSecret && !showValue ? 'password' : 'text'}
          className="font-mono text-xs pr-8"
        />
        {ev.isSecret && (
          <button type="button" onClick={() => setShowValue(!showValue)} className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300">
            {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <button
        onClick={() => onUpdate('isSecret', !ev.isSecret)}
        title={ev.isSecret ? 'Mark as plain' : 'Mark as secret'}
        className={cn('text-xs px-2 py-1.5 rounded border transition-colors flex-shrink-0', ev.isSecret ? 'border-amber-700 text-amber-400 bg-amber-950/30' : 'border-slate-700 text-slate-500 hover:border-slate-600')}
      >
        {ev.isSecret ? '🔒' : '🔓'}
      </button>
      <button onClick={onRemove} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function Step6({ form, setForm }: { form: ProjectFormData; setForm: (f: ProjectFormData) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Deployment target</h2>
        <p className="text-sm text-slate-500 mt-0.5">Select the cloud provider and region.</p>
      </div>
      <FormField label="Cloud provider">
        <Select
          value={form.cloudProvider}
          options={[
            { value: 'aws', label: 'Amazon Web Services (AWS)' },
            { value: 'gcp', label: 'Google Cloud Platform (coming soon)', disabled: true },
            { value: 'azure', label: 'Microsoft Azure (coming soon)', disabled: true },
          ]}
          onChange={(e) => setForm({ ...form, cloudProvider: e.target.value as typeof form.cloudProvider })}
        />
      </FormField>
      <FormField label="Region" required>
        <Select
          value={form.region}
          options={REGIONS.map((r) => ({ value: r.value, label: r.label }))}
          onChange={(e) => setForm({ ...form, region: e.target.value as AWSRegion })}
        />
      </FormField>
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
        <p className="text-xs text-amber-400">AWS credentials are not configured. Cloud integration must be set up in Settings before real deployments can be triggered.</p>
      </div>
    </div>
  )
}

function Step7({ form }: { form: ProjectFormData }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Review & create</h2>
        <p className="text-sm text-slate-500 mt-0.5">Review your project configuration before creating it.</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-800/50 divide-y divide-slate-800">
        {[
          { label: 'Project name',    value: form.name || '—' },
          { label: 'Description',     value: form.description || '—' },
          { label: 'Repository',      value: form.repositoryUrl || '—' },
          { label: 'Branch',          value: form.branch },
          { label: 'Runtime',         value: form.runtime },
          { label: 'Build command',   value: form.buildCommand },
          { label: 'Start command',   value: form.startCommand },
          { label: 'Cloud provider',  value: form.cloudProvider.toUpperCase() },
          { label: 'Region',          value: form.region },
          { label: 'Env variables',   value: `${form.envVars.length} configured` },
        ].map((row) => (
          <div key={row.label} className="flex justify-between items-center px-4 py-2.5">
            <span className="text-xs text-slate-500">{row.label}</span>
            <span className="text-xs font-mono text-slate-300 max-w-xs text-right truncate">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Wizard shell ─────────────────────────────────────────────────────────
export default function NewProjectPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ProjectFormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (step === 0 && !form.name.trim()) errs.name = 'Project name is required'
    if (step === 1 && !form.repositoryUrl.trim()) errs.repositoryUrl = 'Repository URL is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (!validate()) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const handleBack = () => setStep((s) => Math.max(s - 1, 0))

  const handleSubmit = async () => {
    setIsSubmitting(true)
    const result = await projectsService.createProject(form)
    setIsSubmitting(false)
    if (result.error) {
      toast({ title: 'Failed to create project', description: result.error, variant: 'error' })
    } else {
      toast({ title: 'Project created!', description: `${form.name} has been created successfully.`, variant: 'success' })
      router.push(`/projects/${result.data.id}`)
    }
  }

  const stepComponents = [
    <Step1 key={0} form={form} setForm={setForm} errors={errors} />,
    <Step2 key={1} form={form} setForm={setForm} errors={errors} />,
    <Step3 key={2} form={form} setForm={setForm} />,
    <Step4 key={3} form={form} setForm={setForm} />,
    <Step5 key={4} form={form} setForm={setForm} />,
    <Step6 key={5} form={form} setForm={setForm} />,
    <Step7 key={6} form={form} />,
  ]

  return (
    <div className="animate-fade-in">
      <Toaster />
      <div className="mb-6">
        <h1 className="page-title">New project</h1>
        <p className="page-subtitle">Follow the steps to configure and create your project.</p>
      </div>

      <div className="max-w-xl">
        <StepperHeader current={step} />

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl min-h-[400px]">
          {stepComponents[step]}

          <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-800">
            <Button variant="ghost" onClick={handleBack} disabled={step === 0}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Step {step + 1} of {STEPS.length}</span>
              {step < STEPS.length - 1 ? (
                <Button onClick={handleNext}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} isLoading={isSubmitting}>
                  <Check className="h-4 w-4" /> Create project
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
