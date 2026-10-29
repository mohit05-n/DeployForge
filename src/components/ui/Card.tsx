import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-800 bg-slate-900 text-slate-100 shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-1 p-5 border-b border-slate-800', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-base font-semibold leading-tight text-slate-100', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-slate-500', className)} {...props}>
      {children}
    </p>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center p-5 pt-0', className)} {...props}>
      {children}
    </div>
  )
}

// Stat card for dashboard metrics
export function StatCard({
  title,
  value,
  delta,
  icon,
  trend,
  className,
}: {
  title: string
  value: string | number
  delta?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  className?: string
}) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-1.5 text-2xl font-bold text-slate-100">{value}</p>
            {delta && (
              <p className={cn(
                'mt-1 text-xs font-medium',
                trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-500'
              )}>
                {delta}
              </p>
            )}
          </div>
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-brand-400">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
