'use client'

import * as React from 'react'

import type { ActionToastProgress, ActionToastVariant } from '@/components/ui/action-toast'

export type ToastApi = {
  show: (input: ToastInput) => number
  update: (
    id: number,
    patch: Partial<Omit<ToastInput, 'durationMs'>>,
    options?: { durationMs?: number; persistUntilDismissed?: boolean }
  ) => void
  success: (title: string, description?: string, durationMs?: number) => void
  warning: (title: string, description?: string, durationMs?: number) => void
  error: (title: string, description?: string, durationMs?: number) => void
  dismiss: () => void
}

export type ToastInput = {
  title: string
  description?: string
  variant?: ActionToastVariant
  durationMs?: number
  actions?: React.ReactNode
  progress?: ActionToastProgress
  persistUntilDismissed?: boolean
  dismissOnOutsideClick?: boolean
  showDurationProgress?: boolean
  pauseOnHover?: boolean
}

export const ToastContext = React.createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
