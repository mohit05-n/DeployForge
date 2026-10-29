'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User } from '@/types'
import { authService } from '@/services'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (name: string, email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    authService.getCurrentUser().then((u) => {
      setUser(u)
      setIsLoading(false)
    })
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authService.signIn(email, password)
    if (result.error) return { error: result.error }
    setUser(result.data)
    if (typeof window !== 'undefined') localStorage.setItem('df_auth', '1')
    return {}
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const result = await authService.signUp(name, email, password)
    if (result.error) return { error: result.error }
    setUser(result.data)
    if (typeof window !== 'undefined') localStorage.setItem('df_auth', '1')
    return {}
  }, [])

  const signOut = useCallback(async () => {
    await authService.signOut()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
