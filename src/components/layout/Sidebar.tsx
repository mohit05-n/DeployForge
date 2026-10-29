'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FolderGit2, Rocket, Shield, Server, FileText,
  Settings, X, Zap, ChevronRight, LogOut, User
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',       href: '/dashboard',        icon: LayoutDashboard },
  { label: 'Projects',       href: '/projects',         icon: FolderGit2 },
  { label: 'Deployments',    href: '/deployments',      icon: Rocket },
  { label: 'Security',       href: '/security',         icon: Shield },
  { label: 'Infrastructure', href: '/infrastructure',   icon: Server },
  { label: 'Logs',           href: '/logs',             icon: FileText },
  { label: 'Settings',       href: '/settings',         icon: Settings },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href === '/dashboard' && pathname === '/') || pathname.startsWith(item.href + '/')
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-brand-600/20 text-brand-400'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
      )}
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300')} />
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white">{item.badge}</span>
      )}
      {isActive && <ChevronRight className="h-3 w-3 text-brand-400" />}
    </Link>
  )
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user, signOut } = useAuth()
  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="text-sm font-bold text-white">DeployForge</span>
          <p className="text-[11px] text-slate-400 font-medium leading-none">Cloud Platform</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-300 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Platform</p>
        {NAV_ITEMS.slice(0, 5).map((item) => (
          <NavLink key={item.href} item={item} onClick={onClose} />
        ))}
        <div className="my-3 border-t border-sidebar-border" />
        <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Observability</p>
        {NAV_ITEMS.slice(5, 6).map((item) => (
          <NavLink key={item.href} item={item} onClick={onClose} />
        ))}
        <div className="my-3 border-t border-sidebar-border" />
        {NAV_ITEMS.slice(6).map((item) => (
          <NavLink key={item.href} item={item} onClick={onClose} />
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3">
        {user ? (
          <div className="flex items-center gap-3 rounded-lg p-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
              {getInitials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={signOut}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg p-2 bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-slate-500" />
              <span className="text-xs text-slate-400">Not signed in</span>
            </div>
            <Link
              href="/auth/signin"
              className="rounded bg-brand-600 hover:bg-brand-500 text-white text-xs px-2.5 py-1 font-medium transition-colors"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="relative z-50 flex w-64 h-full animate-slide-in">
            <SidebarContent onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}
