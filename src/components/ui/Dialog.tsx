'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          'relative z-10 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl',
          'animate-fade-in p-6',
          className
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-slate-100">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmLabel?: string
  confirmVariant?: 'default' | 'destructive'
  isLoading?: boolean
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description,
  confirmLabel = 'Confirm', confirmVariant = 'destructive', isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button variant={confirmVariant} onClick={onConfirm} isLoading={isLoading}>{confirmLabel}</Button>
      </div>
    </Dialog>
  )
}
