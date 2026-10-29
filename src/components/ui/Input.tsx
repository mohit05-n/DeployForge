import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <input
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2',
          'text-sm text-slate-100 placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2',
          'text-sm text-slate-100 placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900',
          'disabled:cursor-not-allowed disabled:opacity-50 resize-none',
          'transition-colors',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
)
Textarea.displayName = 'Textarea'

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('text-sm font-medium text-slate-300', className)}
      {...props}
    />
  )
)
Label.displayName = 'Label'

export function FormField({ label, error, children, required, hint }: {
  label: string
  error?: string
  children: React.ReactNode
  required?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
  options: { value: string; label: string; disabled?: boolean }[]
  placeholder?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, options, placeholder, ...props }, ref) => (
    <div className="w-full">
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2',
          'text-sm text-slate-100',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors appearance-none cursor-pointer',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
)
Select.displayName = 'Select'
