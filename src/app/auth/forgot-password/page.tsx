'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap, ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, FormField } from '@/components/ui/Input'
import { authService } from '@/services'
import { toast } from '@/hooks/useToast'
import { Toaster } from '@/components/ui/Toaster'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Email is required'); return }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email'); return }
    setIsLoading(true)
    await authService.forgotPassword(email)
    setSent(true)
    toast({ title: 'Reset link sent', description: 'Check your inbox (demo — no real email is sent).', variant: 'success' })
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
          {sent ? (
            <div className="text-center py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950/50 mb-4">
                <Mail className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">Check your email</h2>
              <p className="mt-2 text-sm text-slate-400">
                If an account exists for <strong className="text-slate-200">{email}</strong>, a password reset link has been dispatched.
              </p>
              <Link href="/auth/signin">
                <Button variant="outline" className="mt-6">Return to sign in</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-100">Reset your password</h1>
                <p className="mt-1 text-sm text-slate-500">Enter your email and we&apos;ll send you a reset link.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Email address" error={error} required>
                  <Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} placeholder="you@example.com" error={error} />
                </FormField>
                <Button type="submit" isLoading={isLoading} className="w-full">Send reset link</Button>
              </form>
            </>
          )}
        </div>

        <Link href="/auth/signin" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
      </div>
    </div>
  )
}
