'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: 'default' | 'success' | 'error' | 'warning'
  duration?: number
}

let globalAddToast: ((toast: Omit<Toast, 'id'>) => void) | null = null

export function setGlobalToast(fn: (toast: Omit<Toast, 'id'>) => void) {
  globalAddToast = fn
}

export function toast(t: Omit<Toast, 'id'>) {
  if (globalAddToast) globalAddToast(t)
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
    const duration = t.duration ?? 4000
    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
      timeoutRefs.current.delete(id)
    }, duration)
    timeoutRefs.current.set(id, timeout)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
    const ref = timeoutRefs.current.get(id)
    if (ref) clearTimeout(ref)
    timeoutRefs.current.delete(id)
  }, [])

  useEffect(() => {
    setGlobalToast(addToast)
    return () => { globalAddToast = null }
  }, [addToast])

  return { toasts, addToast, removeToast }
}
