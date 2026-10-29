import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  isLoading?: boolean
}

const variantStyles = {
  default: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 shadow-sm',
  destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm',
  outline: 'border border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:ring-brand-500',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:ring-brand-500',
  link: 'bg-transparent text-brand-400 underline-offset-4 hover:underline p-0 h-auto focus-visible:ring-brand-500',
  secondary: 'bg-slate-700 text-slate-200 hover:bg-slate-600 focus-visible:ring-slate-500 shadow-sm',
}

const sizeStyles = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-8 px-3 py-1.5 text-xs',
  lg: 'h-11 px-6 py-3 text-base',
  icon: 'h-9 w-9',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
          'disabled:pointer-events-none disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
