'use client'

import * as React from 'react'

import { ActionToast, type ActionToastProgress, type ActionToastVariant } from '@/components/ui/action-toast'
import { ToastContext, type ToastApi, type ToastInput } from '@/components/ui/toast-context'

const DEFAULT_DURATION_MS = 3000
const PROGRESS_TICK_MS = 100

type ToastState = {
  id: number
  title: string
  description?: string
  variant: ActionToastVariant
  actions?: React.ReactNode
  progress?: ActionToastProgress
  persistUntilDismissed?: boolean
  pauseOnHover?: boolean
  open: boolean
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const timerRef = React.useRef<number | null>(null)
  const progressIntervalRef = React.useRef<number | null>(null)
  const idRef = React.useRef(0)
  const activeToastIdRef = React.useRef<number | null>(null)
  const totalDurationMsRef = React.useRef(0)
  const remainingMsRef = React.useRef(0)
  const countdownStartedAtMsRef = React.useRef(0)
  const isPausedRef = React.useRef(false)
  const shouldPauseOnHoverRef = React.useRef(false)
  const shouldTrackDurationProgressRef = React.useRef(false)
  const [toast, setToast] = React.useState<ToastState | null>(null)

  const clearCountdownTimers = React.useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    if (progressIntervalRef.current) window.clearInterval(progressIntervalRef.current)
    progressIntervalRef.current = null
  }, [])

  const startProgressInterval = React.useCallback((id: number) => {
    if (!shouldTrackDurationProgressRef.current) return
    if (progressIntervalRef.current) window.clearInterval(progressIntervalRef.current)
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - countdownStartedAtMsRef.current
      const remaining = Math.max(0, remainingMsRef.current - elapsed)
      const total = Math.max(1, totalDurationMsRef.current)
      const value = remaining / total
      setToast((prev) =>
        prev && prev.id === id ? { ...prev, progress: { kind: 'determinate', value } } : prev
      )
      if (remaining <= 0 && progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }, PROGRESS_TICK_MS)
  }, [])

  const dismiss = React.useCallback(() => {
    clearCountdownTimers()
    activeToastIdRef.current = null
    shouldTrackDurationProgressRef.current = false
    shouldPauseOnHoverRef.current = false
    isPausedRef.current = false
    setToast(prev => (prev ? { ...prev, open: false } : null))
  }, [clearCountdownTimers])

  const setCountdownPaused = React.useCallback(
    (paused: boolean) => {
      const activeId = activeToastIdRef.current
      if (!activeId) return
      if (!shouldPauseOnHoverRef.current) return
      if (paused === isPausedRef.current) return

      if (paused) {
        const elapsed = Date.now() - countdownStartedAtMsRef.current
        remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed)
        clearCountdownTimers()
        isPausedRef.current = true
        return
      }

      if (remainingMsRef.current <= 0) {
        setToast(prev => (prev && prev.id === activeId ? { ...prev, open: false } : prev))
        return
      }

      isPausedRef.current = false
      countdownStartedAtMsRef.current = Date.now()
      timerRef.current = window.setTimeout(() => {
        setToast(prev => (prev && prev.id === activeId ? { ...prev, open: false } : prev))
      }, remainingMsRef.current)
      startProgressInterval(activeId)
    },
    [clearCountdownTimers, startProgressInterval]
  )

  const show = React.useCallback(
    ({
      title,
      description,
      variant = 'success',
      durationMs,
      actions,
      persistUntilDismissed,
      progress,
      showDurationProgress,
      pauseOnHover,
    }: ToastInput) => {
      const id = (idRef.current += 1)
      const resolvedDurationMs = Math.max(1, durationMs ?? DEFAULT_DURATION_MS)
      const trackDurationProgress = !persistUntilDismissed && !!showDurationProgress
      const initialProgress = trackDurationProgress
        ? { kind: 'determinate' as const, value: 1 }
        : progress

      setToast({
        id,
        title,
        description,
        variant,
        actions,
        persistUntilDismissed,
        progress: initialProgress,
        pauseOnHover,
        open: true,
      })

      clearCountdownTimers()
      activeToastIdRef.current = id
      shouldTrackDurationProgressRef.current = trackDurationProgress
      shouldPauseOnHoverRef.current = !persistUntilDismissed && !!pauseOnHover
      isPausedRef.current = false
      totalDurationMsRef.current = resolvedDurationMs
      remainingMsRef.current = resolvedDurationMs
      countdownStartedAtMsRef.current = Date.now()

      if (!persistUntilDismissed) {
        timerRef.current = window.setTimeout(() => {
          setToast(prev => (prev && prev.id === id ? { ...prev, open: false } : prev))
        }, resolvedDurationMs)
        startProgressInterval(id)
      }
    },
    [clearCountdownTimers, startProgressInterval]
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
      clearCountdownTimers()
    }
  }, [clearCountdownTimers])

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
            onHoverPauseChange={(paused) => {
              if (!toast.pauseOnHover || toast.persistUntilDismissed) return
              setCountdownPaused(paused)
            }}
            onExited={() => {
              setToast(prev => (prev && prev.id === toast.id ? null : prev))
              if (activeToastIdRef.current === toast.id) {
                clearCountdownTimers()
                activeToastIdRef.current = null
                shouldTrackDurationProgressRef.current = false
                shouldPauseOnHoverRef.current = false
                isPausedRef.current = false
              }
            }}
          />
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}
