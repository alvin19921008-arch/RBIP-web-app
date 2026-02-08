'use client'

import * as React from 'react'

import { ActionToast, type ActionToastProgress, type ActionToastVariant } from '@/components/ui/action-toast'

type ToastInput = {
  title: string
  description?: string
  variant?: ActionToastVariant
  durationMs?: number
  actions?: React.ReactNode
  progress?: ActionToastProgress
  persistUntilDismissed?: boolean
}

type ToastApi = {
  show: (input: ToastInput) => void
  success: (title: string, description?: string, durationMs?: number) => void
  warning: (title: string, description?: string, durationMs?: number) => void
  error: (title: string, description?: string, durationMs?: number) => void
  dismiss: () => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

type ToastState = {
  id: number
  title: string
  description?: string
  variant: ActionToastVariant
  actions?: React.ReactNode
  progress?: ActionToastProgress
  persistUntilDismissed?: boolean
  open: boolean
}

const DEFAULT_DURATION_MS = 3000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const timerRef = React.useRef<number | null>(null)
  const idRef = React.useRef(0)
  const [toast, setToast] = React.useState<ToastState | null>(null)

  const dismiss = React.useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setToast(prev => (prev ? { ...prev, open: false } : null))
  }, [])

  const show = React.useCallback(
    ({ title, description, variant = 'success', durationMs, actions, persistUntilDismissed, progress }: ToastInput) => {
      const id = (idRef.current += 1)
      setToast({ id, title, description, variant, actions, persistUntilDismissed, progress, open: true })

      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = null

      if (!persistUntilDismissed) {
        timerRef.current = window.setTimeout(() => {
          setToast(prev => (prev && prev.id === id ? { ...prev, open: false } : prev))
        }, durationMs ?? DEFAULT_DURATION_MS)
      }
    },
    []
  )

  const api = React.useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, description, durationMs) => show({ title, description, variant: 'success', durationMs }),
      warning: (title, description, durationMs) => show({ title, description, variant: 'warning', durationMs }),
      error: (title, description, durationMs) => show({ title, description, variant: 'error', durationMs }),
    }),
    [dismiss, show]
  )

  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <div className="fixed right-4 top-4 z-[9999] pointer-events-none">
          <ActionToast
            key={toast.id}
            title={toast.title}
            description={toast.description}
            actions={toast.actions}
            progress={toast.progress}
            variant={toast.variant}
            open={toast.open}
            onClose={api.dismiss}
            onExited={() => {
              setToast(prev => (prev && prev.id === toast.id ? null : prev))
            }}
          />
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

