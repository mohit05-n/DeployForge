'use client'

import * as React from 'react'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast, type Toast } from '@/hooks/useToast'

const variantConfig = {
  default: { icon: Info, className: 'border-slate-700 bg-slate-900', iconClass: 'text-slate-400' },
  success: { icon: CheckCircle2, className: 'border-emerald-800/60 bg-emerald-950/80', iconClass: 'text-emerald-400' },
  error:   { icon: AlertCircle, className: 'border-red-800/60 bg-red-950/80', iconClass: 'text-red-400' },
  warning: { icon: AlertTriangle, className: 'border-amber-800/60 bg-amber-950/80', iconClass: 'text-amber-400' },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const config = variantConfig[toast.variant]
  const Icon = config.icon
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-sm',
      'animate-slide-in w-80 max-w-sm',
      config.className
    )}>
      <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', config.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-100">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-slate-400">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toasts, removeToast } = useToast()
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>
  )
}
