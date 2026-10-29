'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  User, Github, Cloud, Bell, Shield, BarChart2,
  Check, X, ExternalLink, Key, Plus, Eye, EyeOff,
  Trash2, RefreshCw, AlertCircle, Copy, GitBranch, Lock
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, FormField } from '@/components/ui/Input'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { MOCK_USER } from '@/lib/mock-data'
import { cn, getInitials } from '@/lib/utils'
import { githubIntegrationService, GitHubStatus, GitHubRepoOption } from '@/services'

type SettingsTab = 'profile' | 'github' | 'cloud' | 'notifications' | 'security' | 'usage'

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'profile',       label: 'Profile',         icon: User },
  { id: 'github',        label: 'GitHub',           icon: Github },
  { id: 'cloud',         label: 'Cloud providers',  icon: Cloud },
  { id: 'notifications', label: 'Notifications',    icon: Bell },
  { id: 'security',      label: 'Security',         icon: Shield },
  { id: 'usage',         label: 'Usage & limits',   icon: BarChart2 },
]

// ─── Tab panels ───────────────────────────────────────────────────────────
function ProfileTab() {
  const [form, setForm] = useState({ name: MOCK_USER.name, email: MOCK_USER.email })
  const [isSaving, setIsSaving] = useState(false)
  const handleSave = async () => {
    setIsSaving(true)
    await new Promise((r) => setTimeout(r, 800))
    setIsSaving(false)
    toast({ title: 'Profile updated', variant: 'success' })
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-brand-700 flex items-center justify-center text-xl font-bold text-white">
          {getInitials(form.name)}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">{form.name}</p>
          <p className="text-xs text-slate-500">{MOCK_USER.role}</p>
        </div>
      </div>
      <div className="max-w-md space-y-4">
        <FormField label="Full name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </FormField>
        <FormField label="Email address">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <Button onClick={handleSave} isLoading={isSaving}>Save changes</Button>
      </div>
    </div>
  )
}

function GitHubTab() {
  const [status, setStatus] = useState<GitHubStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [repos, setRepos] = useState<GitHubRepoOption[]>([])
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copiedWebhook, setCopiedWebhook] = useState(false)

  const loadRepositories = useCallback(async () => {
    setIsLoadingRepos(true)
    const res = await githubIntegrationService.listRepositories()
    if (res.data) {
      setRepos(res.data)
    }
    setIsLoadingRepos(false)
  }, [])

  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    const res = await githubIntegrationService.getStatus()
    if (res.data) {
      setStatus(res.data)
      if (res.data.connected) {
        loadRepositories()
      }
    } else {
      setErrorMsg(res.error || 'Failed to check GitHub connection status.')
    }
    setIsLoading(false)
  }, [loadRepositories])

  useEffect(() => {
    fetchStatus()

    // Check URL parameters for OAuth redirect feedback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const oauthStatus = params.get('status')
      const oauthError = params.get('error')

      if (oauthStatus === 'connected') {
        toast({
          title: 'GitHub Connected',
          description: 'Your GitHub account has been successfully connected via OAuth.',
          variant: 'success',
        })
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname + '?tab=github')
      } else if (oauthError) {
        setErrorMsg(`GitHub authorization error: ${decodeURIComponent(oauthError)}`)
        toast({
          title: 'Connection Failed',
          description: decodeURIComponent(oauthError),
          variant: 'error',
        })
        window.history.replaceState({}, document.title, window.location.pathname + '?tab=github')
      }
    }
  }, [fetchStatus])

  const handleConnect = async () => {
    setIsConnecting(true)
    setErrorMsg(null)
    const res = await githubIntegrationService.getAuthUrl()
    if (res.data?.url) {
      window.location.href = res.data.url
    } else {
      setIsConnecting(false)
      setErrorMsg(res.error || 'Failed to initiate GitHub authorization flow.')
      toast({
        title: 'OAuth Error',
        description: res.error || 'Please ensure GITHUB_CLIENT_ID is configured in your .env file.',
        variant: 'error',
      })
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your GitHub account? This will revoke repository access.')) {
      return
    }

    setIsDisconnecting(true)
    const res = await githubIntegrationService.disconnect()
    setIsDisconnecting(false)

    if (res.data?.disconnected) {
      toast({
        title: 'GitHub Disconnected',
        description: 'Your GitHub credentials have been removed.',
        variant: 'success',
      })
      setStatus((prev) => (prev ? { ...prev, connected: false, username: undefined, avatarUrl: undefined } : null))
      setRepos([])
    } else {
      toast({
        title: 'Disconnect Failed',
        description: res.error || 'Failed to disconnect GitHub account.',
        variant: 'error',
      })
    }
  }

  const copyWebhookUrl = () => {
    const url = status?.webhookUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/github`
    navigator.clipboard.writeText(url)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2000)
    toast({ title: 'Webhook URL copied to clipboard', variant: 'success' })
  }

  const isConnected = Boolean(status?.connected)

  return (
    <div className="space-y-6 max-w-2xl">
      {errorMsg && (
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-300">Connection notice</p>
            <p className="text-xs text-rose-400/90 mt-0.5">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 text-xs">Dismiss</button>
        </div>
      )}

      {/* Connection Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected && status?.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={status.avatarUrl}
                alt={status.username || 'GitHub'}
                className="h-10 w-10 rounded-lg border border-slate-700 object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                <Github className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-200">
                  {isConnected && status?.username ? `@${status.username}` : 'GitHub'}
                </p>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                    <X className="h-3 w-3" /> Not connected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isConnected
                  ? `Authorized on ${new Date(status?.connectedAt || Date.now()).toLocaleDateString()}`
                  : 'Connect your GitHub account to import repositories and configure webhooks.'}
              </p>
            </div>
          </div>

          <div>
            {isConnected ? (
              <Button
                size="sm"
                variant="outline"
                className="border-rose-900/60 text-rose-400 hover:bg-rose-950/40"
                onClick={handleDisconnect}
                isLoading={isDisconnecting}
              >
                <Trash2 className="h-4 w-4" /> Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnect} isLoading={isConnecting || isLoading}>
                <Github className="h-4 w-4" /> Connect GitHub
              </Button>
            )}
          </div>
        </div>

        {isConnected && status?.scope && (
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>OAuth Scopes:</span>
            <code className="font-mono text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded">{status.scope}</code>
          </div>
        )}
      </div>

      {/* Accessible Repositories Preview */}
      {isConnected && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Accessible repositories</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isLoadingRepos ? 'Scanning repositories...' : `${repos.length} repository authorizations active`}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={loadRepositories} isLoading={isLoadingRepos}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {repos.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {repos.slice(0, 5).map((repo) => (
                <div key={repo.id} className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-medium text-slate-200">{repo.fullName}</span>
                    {repo.isPrivate && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                        <Lock className="h-2.5 w-2.5" /> Private
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    {repo.language && <span>{repo.language}</span>}
                    <a href={repo.url} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
              {repos.length > 5 && (
                <p className="text-xs text-slate-500 text-center pt-1">
                  +{repos.length - 5} more repositories available in project creation wizard
                </p>
              )}
            </div>
          ) : !isLoadingRepos ? (
            <p className="text-xs text-slate-500">No repositories found under this account.</p>
          ) : null}
        </div>
      )}

      {/* Webhook Configuration Information */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Push webhook integration</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure this webhook URL on your GitHub repository to enqueue deployment jobs automatically on git push.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400">Payload URL</label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={status?.webhookUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/github`}
              className="font-mono text-xs text-slate-300 bg-slate-950"
            />
            <Button size="sm" variant="outline" onClick={copyWebhookUrl}>
              {copiedWebhook ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-slate-400 font-medium">Content type</p>
            <p className="font-mono text-slate-300 mt-1">application/json</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-slate-400 font-medium">Secret Verification</p>
            <p className="text-slate-300 mt-1 flex items-center gap-1">
              {status?.webhookConfigured ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Configured (HMAC-SHA256)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-400 font-medium">Set GITHUB_WEBHOOK_SECRET</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-blue-900/40 bg-blue-950/20 p-3 text-xs text-blue-300 space-y-1">
          <p className="font-semibold text-blue-200">How webhook execution works:</p>
          <p>
            Pushes trigger HMAC-SHA256 verified webhooks that enqueue a <code className="bg-blue-900/50 px-1 rounded">PENDING</code> deployment job.
            DeployForge processes deliveries idempotently to avoid redundant builds.
          </p>
        </div>
      </div>
    </div>
  )
}

function CloudTab() {
  return (
    <div className="space-y-4">
      {[
        { name: 'Amazon Web Services', provider: 'aws', connected: false, note: 'Requires AWS IAM role or access key configuration in the backend.' },
        { name: 'Google Cloud Platform', provider: 'gcp', connected: false, note: 'Coming soon. GCP integration is not yet implemented.' },
        { name: 'Microsoft Azure', provider: 'azure', connected: false, note: 'Coming soon. Azure integration is not yet implemented.' },
      ].map((p) => (
        <div key={p.provider} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">{p.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {p.connected ? (
                    <><Check className="h-3 w-3 text-emerald-400" /><span className="text-xs text-emerald-400">Connected</span></>
                  ) : (
                    <><X className="h-3 w-3 text-slate-500" /><span className="text-xs text-slate-500">Not connected</span></>
                  )}
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={p.provider !== 'aws'}>
              {p.provider === 'aws' ? 'Configure' : 'Coming soon'}
            </Button>
          </div>
          <p className="text-xs text-slate-600">{p.note}</p>
        </div>
      ))}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors',
        value ? 'bg-brand-600' : 'bg-slate-700'
      )}
    >
      <span className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', value && 'translate-x-4')} />
    </button>
  )
}

function NotificationsTab() {
  const [settings, setSettings] = useState({
    email: true, slack: false, deploymentSuccess: true,
    deploymentFailure: true, securityAlerts: true, billingAlerts: false,
  })
  const toggle = (key: keyof typeof settings) => setSettings((s) => ({ ...s, [key]: !s[key] }))
  const options = [
    { key: 'email',             label: 'Email notifications',  desc: 'Receive notifications via email' },
    { key: 'slack',             label: 'Slack',                desc: 'Webhook integration (requires Slack configuration)' },
    { key: 'deploymentSuccess', label: 'Deployment success',   desc: 'Notify when a deployment succeeds' },
    { key: 'deploymentFailure', label: 'Deployment failure',   desc: 'Notify when a deployment fails' },
    { key: 'securityAlerts',    label: 'Security alerts',      desc: 'Notify when critical vulnerabilities are found' },
    { key: 'billingAlerts',     label: 'Billing alerts',       desc: 'Notify when usage approaches limits' },
  ] as const
  return (
    <div className="max-w-lg space-y-2">
      {options.map((opt) => (
        <div key={opt.key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-slate-200">{opt.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
          </div>
          <Toggle value={settings[opt.key]} onChange={() => toggle(opt.key)} />
        </div>
      ))}
      <div className="pt-2">
        <Button onClick={() => toast({ title: 'Notification settings saved', variant: 'success' })}>Save preferences</Button>
      </div>
    </div>
  )
}

function SecurityTab() {
  const [showKey, setShowKey] = useState(false)
  const apiKey = 'df_sk_••••••••••••••••••••••••••••••••'
  return (
    <div className="space-y-6 max-w-lg">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Two-factor authentication</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Authenticator app</p>
            <p className="text-xs text-slate-500">Not configured</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => toast({ title: '2FA setup available in Phase 8', variant: 'warning' })}>
            Enable 2FA
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">API keys</h3>
          <Button size="sm" variant="outline" onClick={() => toast({ title: 'API key generated', variant: 'success' })}>
            <Plus className="h-4 w-4" /> New key
          </Button>
        </div>
        <div className="rounded-lg border border-slate-800 p-3 flex items-center gap-3">
          <Key className="h-4 w-4 text-slate-500" />
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-300">Default key</p>
            <code className="text-xs font-mono text-slate-500">
              {showKey ? 'df_sk_local_key_placeholder_value_12345' : apiKey}
            </code>
          </div>
          <button onClick={() => setShowKey(!showKey)} className="text-slate-500 hover:text-slate-300">
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-slate-500">API keys are encrypted and managed with least-privilege role bindings.</p>
      </div>
    </div>
  )
}

function UsageTab() {
  const limits = [
    { label: 'Projects',     used: 6,    limit: 10,  unit: '' },
    { label: 'Deployments',  used: 47,   limit: 100, unit: '/mo' },
    { label: 'Build minutes', used: 234,  limit: 500, unit: '/mo' },
    { label: 'Storage (ECR)', used: 2.3,  limit: 10,  unit: ' GB' },
  ]
  return (
    <div className="space-y-4 max-w-lg">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <p className="text-xs text-slate-400">Resource quotas and tier limits enforced for current workspace.</p>
      </div>
      {limits.map((item) => {
        const pct = Math.round((item.used / item.limit) * 100)
        return (
          <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300">{item.label}</span>
              <span className="text-xs text-slate-500">{item.used}{item.unit} / {item.limit}{item.unit}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', pct > 80 ? 'bg-amber-500' : 'bg-brand-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-slate-600 mt-1">{pct}% used</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Settings shell ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  const TAB_CONTENT: Record<SettingsTab, React.ReactNode> = {
    profile:       <ProfileTab />,
    github:        <GitHubTab />,
    cloud:         <CloudTab />,
    notifications: <NotificationsTab />,
    security:      <SecurityTab />,
    usage:         <UsageTab />,
  }

  return (
    <div className="animate-fade-in">
      <Toaster />
      <div className="mb-6">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account, integrations, and preferences.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar nav */}
        <nav className="lg:w-52 flex-shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap text-left',
                    activeTab === tab.id
                      ? 'bg-brand-600/20 text-brand-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-5">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
            {TAB_CONTENT[activeTab]}
          </div>
        </div>
      </div>
    </div>
  )
}
