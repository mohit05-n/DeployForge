'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Zap, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, FormField } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'

export default function SignUpPage() {
  const { signUp } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.email) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirm) errs.confirm = 'Passwords do not match'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setIsLoading(true)
    const { error } = await signUp(form.name, form.email, form.password)
    if (error) {
      toast({ title: 'Sign up failed', description: error, variant: 'error' })
    } else {
      toast({ title: 'Account created!', description: 'Welcome to DeployForge.', variant: 'success' })
      router.push('/dashboard')
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Toaster />
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shadow-lg shadow-brand-900/50">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">DeployForge</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-100">Create your account</h1>
            <p className="mt-1 text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/auth/signin" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>

          <div className="mb-5 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
            <p className="text-xs text-amber-400 font-medium">Demo mode — no account will be created</p>
            <p className="text-xs text-amber-500 mt-0.5">Registration is simulated. Connect a real backend to persist accounts.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField label="Full name" error={errors.name} required>
              <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Alex Chen" error={errors.name} />
            </FormField>
            <FormField label="Email address" error={errors.email} required>
              <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" error={errors.email} />
            </FormField>
            <FormField label="Password" error={errors.password} required>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Min. 8 characters" error={errors.password} className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>
            <FormField label="Confirm password" error={errors.confirm} required>
              <Input id="confirm" type="password" value={form.confirm} onChange={(e) => update('confirm', e.target.value)} placeholder="Repeat your password" error={errors.confirm} />
            </FormField>
            <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
              Create account <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
