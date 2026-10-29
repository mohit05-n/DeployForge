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

export default function SignInPage() {
  const { signIn } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('alex.chen@deployforge.dev')
  const [password, setPassword] = useState('demo-password')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const validate = () => {
    const errs: typeof errors = {}
    if (!email) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Enter a valid email'
    if (!password) errs.password = 'Password is required'
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setIsLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      toast({ title: 'Sign in failed', description: error, variant: 'error' })
    } else {
      toast({ title: 'Welcome back!', description: 'Signed in successfully.', variant: 'success' })
      router.push('/dashboard')
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Toaster />
      <div className="w-full max-w-md">
        {/* Logo */}
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
            <h1 className="text-xl font-bold text-slate-100">Sign in to your account</h1>
            <p className="mt-1 text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                Sign up free
              </Link>
            </p>
          </div>

          {/* Demo credentials notice */}
          <div className="mb-5 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
            <p className="text-xs text-amber-400 font-medium">Demo mode — pre-filled credentials</p>
            <p className="text-xs text-amber-500 mt-0.5">No real authentication is performed. Any credentials will work.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField label="Email address" error={errors.email} required>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email}
              />
            </FormField>

            <FormField label="Password" error={errors.password} required>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  error={errors.password}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-slate-700 bg-slate-800 text-brand-600" />
                <span className="text-sm text-slate-400">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Authentication is isolated behind a service interface for future backend integration.
        </p>
      </div>
    </div>
  )
}
