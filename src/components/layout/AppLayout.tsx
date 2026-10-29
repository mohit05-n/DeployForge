'use client'

import * as React from 'react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Toaster } from '@/components/ui/Toaster'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 lg:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
