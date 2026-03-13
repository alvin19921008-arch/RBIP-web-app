import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ActionToastProgress, ActionToastVariant } from '@/components/ui/action-toast'

export type ActionToastState = {
  id: number
  title: string
  description?: string
  variant: ActionToastVariant
  actions?: ReactNode
  progress?: ActionToastProgress
  persistUntilDismissed?: boolean
  dismissOnOutsideClick?: boolean
  open: boolean
  /** When true, toast progress and dismiss timer pause on hover. */
  pauseOnHover?: boolean
  /** Duration for progress bar and auto-dismiss. */
  durationMs?: number
  /** When true, show countdown progress bar. */
  showDurationProgress?: boolean
}

const PROGRESS_TICK_MS = 80

export function useActionToast() {
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastIdRef = useRef(0)
  const actionToastContainerRef = useRef<HTMLDivElement | null>(null)
  const hoverPausedRef = useRef(false)
  const progressStartRef = useRef(0)
  const progressElapsedRef = useRef(0)
  const currentToastMetaRef = useRef<{ id: number; durationMs: number } | null>(null)
  const [actionToast, setActionToast] = useState<ActionToastState | null>(null)

  const clearToastTimers = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    if (toastProgressIntervalRef.current) {
      clearInterval(toastProgressIntervalRef.current)
      toastProgressIntervalRef.current = null
    }
  }, [])

  const scheduleAutoDismiss = useCallback(
    (
      id: number,
      durationMs: number,
      opts?: { showProgress?: boolean; resetElapsed?: boolean; totalDurationMs?: number }
    ) => {
      clearToastTimers()
      progressStartRef.current = Date.now()
      if (opts?.resetElapsed !== false) {
        progressElapsedRef.current = 0
      }
      const totalDurationMs = opts?.totalDurationMs ?? durationMs
      const dismissAt = () => {
        setActionToast((prev) => (prev && prev.id === id ? { ...prev, open: false } : prev))
      }
      toastTimerRef.current = setTimeout(dismissAt, durationMs)
      if (opts?.showProgress) {
        toastProgressIntervalRef.current = setInterval(() => {
          if (hoverPausedRef.current) return
          const elapsed = Date.now() - progressStartRef.current + progressElapsedRef.current
          const value = Math.max(0, 1 - elapsed / totalDurationMs)
          setActionToast((prev) => {
            if (!prev || prev.id !== id) return prev
            return { ...prev, progress: { kind: 'determinate', value } }
          })
          if (elapsed >= totalDurationMs) {
            clearToastTimers()
          }
        }, PROGRESS_TICK_MS)
      }
    },
    [clearToastTimers]
  )

  const dismissActionToast = useCallback(() => {
    clearToastTimers()
    currentToastMetaRef.current = null
    setActionToast((prev) => (prev ? { ...prev, open: false } : null))
  }, [clearToastTimers])

  const showActionToast = useCallback(
    (
      title: string,
      variant: ActionToastVariant = 'success',
      description?: string,
      options?: {
        durationMs?: number
        actions?: ReactNode
        progress?: ActionToastProgress
        persistUntilDismissed?: boolean
        dismissOnOutsideClick?: boolean
        showDurationProgress?: boolean
        pauseOnHover?: boolean
      }
    ) => {
      const id = (toastIdRef.current += 1)
      const durationMs = options?.durationMs ?? 3000
      const showProgress = options?.showDurationProgress ?? false
      const pauseOnHover = options?.pauseOnHover ?? false
      hoverPausedRef.current = false
      setActionToast({
        id,
        title,
        description,
        variant,
        actions: options?.actions,
        progress: showProgress ? { kind: 'determinate', value: 1 } : options?.progress,
        persistUntilDismissed: options?.persistUntilDismissed,
        dismissOnOutsideClick: options?.dismissOnOutsideClick,
        pauseOnHover,
        durationMs,
        showDurationProgress: showProgress,
        open: true,
      })

      clearToastTimers()
      if (pauseOnHover && showProgress) {
        currentToastMetaRef.current = { id, durationMs }
      } else {
        currentToastMetaRef.current = null
      }

      if (!options?.persistUntilDismissed) {
        scheduleAutoDismiss(id, durationMs, {
          showProgress,
          resetElapsed: true,
          totalDurationMs: durationMs,
        })
      }

      return id
    },
    [clearToastTimers, scheduleAutoDismiss]
  )

  const updateActionToast = useCallback(
    (
      id: number,
      patch: Partial<Omit<ActionToastState, 'id'>>,
      options?: { durationMs?: number; persistUntilDismissed?: boolean }
    ) => {
      setActionToast((prev) => {
        if (!prev || prev.id !== id) return prev
        const nextPersist =
          typeof options?.persistUntilDismissed === 'boolean'
            ? options.persistUntilDismissed
            : typeof patch.persistUntilDismissed === 'boolean'
              ? patch.persistUntilDismissed
              : prev.persistUntilDismissed
        return { ...prev, ...patch, persistUntilDismissed: nextPersist }
      })

      // Timer policy: only adjust when caller explicitly sets persist policy.
      if (typeof options?.persistUntilDismissed === 'boolean') {
        if (options.persistUntilDismissed) {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
          toastTimerRef.current = null
        } else {
          scheduleAutoDismiss(id, options.durationMs ?? 2500)
        }
      }
    },
    [scheduleAutoDismiss]
  )

  const handleToastExited = useCallback((id: number) => {
    if (currentToastMetaRef.current?.id === id) currentToastMetaRef.current = null
    setActionToast((prev) => (prev && prev.id === id ? null : prev))
  }, [])

  const handleHoverPauseChange = useCallback(
    (paused: boolean) => {
      hoverPausedRef.current = paused
      const meta = currentToastMetaRef.current
      if (!meta) return
      if (paused) {
        progressElapsedRef.current += Date.now() - progressStartRef.current
        clearToastTimers()
      } else {
        const remaining = meta.durationMs - progressElapsedRef.current
        if (remaining <= 0) {
          setActionToast((prev) => (prev && prev.id === meta.id ? { ...prev, open: false } : prev))
          return
        }
        progressStartRef.current = Date.now()
        scheduleAutoDismiss(meta.id, remaining, {
          showProgress: true,
          resetElapsed: false,
          totalDurationMs: meta.durationMs,
        })
      }
    },
    [clearToastTimers, scheduleAutoDismiss]
  )

  useEffect(() => {
    return () => clearToastTimers()
  }, [clearToastTimers])

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
    updateActionToast,
    dismissActionToast,
    handleToastExited,
    handleHoverPauseChange,
  }
}

