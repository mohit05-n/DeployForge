'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Bell, Search, ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onMenuClick: () => void
}

const breadcrumbMap: Record<string, string> = {
  dashboard:      'Overview',
  projects:       'Projects',
  deployments:    'Deployments',
  security:       'Security',
  infrastructure: 'Infrastructure',
  logs:           'Logs & Monitoring',
  settings:       'Settings',
  new:            'New',
  details:        'Details',
}

function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-sm">
      <Link href="/dashboard" className="text-slate-500 hover:text-slate-300 transition-colors">
        <Home className="h-4 w-4" />
      </Link>
      {segments.map((seg, i) => {
        const href = '/' + segments.slice(0, i + 1).join('/')
        const label = breadcrumbMap[seg] ?? seg
        const isLast = i === segments.length - 1
        return (
          <React.Fragment key={href}>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            {isLast ? (
              <span className="font-medium text-slate-200">{label}</span>
            ) : (
              <Link href={href} className="text-slate-500 hover:text-slate-300 transition-colors">
                {label}
              </Link>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="lg:hidden text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-2">
        {/* Demo Mode pill */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-amber-800/50 bg-amber-950/50 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-medium text-amber-400">Demo Mode</span>
        </div>
        <button
          className="text-slate-500 hover:text-slate-300 transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand-500" />
        </button>
      </div>
    </header>
  )
}
