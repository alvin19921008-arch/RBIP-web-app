import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ActionToastVariant } from '@/components/ui/action-toast'

export type ActionToastState = {
  id: number
  title: string
  description?: string
  variant: ActionToastVariant
  actions?: ReactNode
  persistUntilDismissed?: boolean
  dismissOnOutsideClick?: boolean
  open: boolean
}

export function useActionToast() {
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastIdRef = useRef(0)
  const actionToastContainerRef = useRef<HTMLDivElement | null>(null)
  const [actionToast, setActionToast] = useState<ActionToastState | null>(null)

  const dismissActionToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    setActionToast((prev) => (prev ? { ...prev, open: false } : null))
  }, [])

  const showActionToast = useCallback(
    (
      title: string,
      variant: ActionToastVariant = 'success',
      description?: string,
      options?: {
        durationMs?: number
        actions?: ReactNode
        persistUntilDismissed?: boolean
        dismissOnOutsideClick?: boolean
      }
    ) => {
      const id = (toastIdRef.current += 1)
      setActionToast({
        id,
        title,
        description,
        variant,
        actions: options?.actions,
        persistUntilDismissed: options?.persistUntilDismissed,
        dismissOnOutsideClick: options?.dismissOnOutsideClick,
        open: true,
      })

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null

      if (!options?.persistUntilDismissed) {
        toastTimerRef.current = setTimeout(() => {
          setActionToast((prev) => (prev && prev.id === id ? { ...prev, open: false } : prev))
        }, options?.durationMs ?? 3000)
      }
    },
    []
  )

  const handleToastExited = useCallback((id: number) => {
    setActionToast((prev) => (prev && prev.id === id ? null : prev))
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // For persistent toasts (e.g., confirm/cancel), dismiss when user clicks elsewhere.
  useEffect(() => {
    if (!actionToast?.open) return
    if (!actionToast.dismissOnOutsideClick) return

    const onMouseDown = (e: MouseEvent) => {
      const container = actionToastContainerRef.current
      if (!container) return
      if (container.contains(e.target as Node)) return
      dismissActionToast()
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [actionToast?.open, actionToast?.dismissOnOutsideClick, dismissActionToast])

  return {
    actionToast,
    actionToastContainerRef,
    showActionToast,
    dismissActionToast,
    handleToastExited,
  }
}

