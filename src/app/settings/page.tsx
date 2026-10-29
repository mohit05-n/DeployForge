'use client'

import { useState } from 'react'
import {
  User, Github, Cloud, Bell, Shield, BarChart2,
  Check, X, ExternalLink, Key, Plus, Eye, EyeOff
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, FormField } from '@/components/ui/Input'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'
import { MOCK_USER } from '@/lib/mock-data'
import { cn, getInitials } from '@/lib/utils'

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
  const [isConnecting, setIsConnecting] = useState(false)
  const handleConnect = async () => {
    setIsConnecting(true)
    await new Promise((r) => setTimeout(r, 1000))
    setIsConnecting(false)
    toast({
      title: 'GitHub integration not configured',
      description: 'Connect a real OAuth backend to enable GitHub integration.',
      variant: 'warning',
    })
  }
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center">
              <Github className="h-5 w-5 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">GitHub</p>
              <p className="text-xs text-slate-500">Not connected</p>
            </div>
          </div>
          <Button size="sm" onClick={handleConnect} isLoading={isConnecting}>
            <Github className="h-4 w-4" /> Connect GitHub
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4">
        <p className="text-sm font-medium text-amber-300">Demo mode</p>
        <p className="text-xs text-amber-500 mt-0.5">
          GitHub OAuth is not configured. To enable real repository browsing and webhook integration, implement a GitHub OAuth app in the backend and configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.
        </p>
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
          <Button size="sm" variant="outline" onClick={() => toast({ title: 'Not available in demo mode', variant: 'warning' })}>
            Enable 2FA
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">API keys</h3>
          <Button size="sm" variant="outline" onClick={() => toast({ title: 'API key created (demo)', variant: 'success' })}>
            <Plus className="h-4 w-4" /> New key
          </Button>
        </div>
        <div className="rounded-lg border border-slate-800 p-3 flex items-center gap-3">
          <Key className="h-4 w-4 text-slate-500" />
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-300">Default key</p>
            <code className="text-xs font-mono text-slate-500">
              {showKey ? 'df_sk_demo_key_not_real_placeholder_value_12345' : apiKey}
            </code>
          </div>
          <button onClick={() => setShowKey(!showKey)} className="text-slate-500 hover:text-slate-300">
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-amber-400">API keys are not persisted in demo mode. Do not use for real integrations.</p>
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
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
        <p className="text-xs text-amber-400">Usage metrics are simulated in demo mode. Real usage tracking requires a connected backend.</p>
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
