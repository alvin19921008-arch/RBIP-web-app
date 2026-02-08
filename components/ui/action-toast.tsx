'use client'

import * as React from 'react'
import { CheckCircle2, X, XCircle, AlertTriangle, Info } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ActionToastVariant = 'success' | 'warning' | 'error' | 'info'

export type ActionToastProgress =
  | { kind: 'indeterminate' }
  | { kind: 'determinate'; value: number } // 0..1

type ActionToastProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  progress?: ActionToastProgress
  variant?: ActionToastVariant
  open: boolean
  onClose: () => void
  onExited: () => void
}

function getVariantStyles(variant: ActionToastVariant) {
  switch (variant) {
    case 'info':
      return {
        icon: <Info className="h-5 w-5 text-sky-700" />,
        iconWrap: 'bg-sky-100',
        border: 'border-sky-200',
        bar: 'bg-sky-500',
      }
    case 'success':
      return {
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-700" />,
        iconWrap: 'bg-emerald-100',
        border: 'border-emerald-200',
        bar: 'bg-emerald-500',
      }
    case 'warning':
      return {
        icon: <AlertTriangle className="h-5 w-5 text-amber-700" />,
        iconWrap: 'bg-amber-100',
        border: 'border-amber-200',
        bar: 'bg-amber-500',
      }
    case 'error':
      return {
        icon: <XCircle className="h-5 w-5 text-red-700" />,
        iconWrap: 'bg-red-100',
        border: 'border-red-200',
        bar: 'bg-red-500',
      }
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function ActionToast({
  title,
  description,
  actions,
  progress,
  variant = 'success',
  open,
  onClose,
  onExited,
}: ActionToastProps) {
  const styles = getVariantStyles(variant)
  const hasDescription = typeof description === 'string' && description.trim().length > 0
  const hasActions = actions != null
  const showProgress = progress != null
  const exitTimerRef = React.useRef<number | null>(null)
  const EXIT_MS = 220

  React.useEffect(() => {
    // If we're closing, schedule onExited even if no CSS animation events fire.
    if (!open) {
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = window.setTimeout(() => {
        onExited()
      }, EXIT_MS)
      return
    }

    // If reopened, cancel any pending exit.
    if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current)
    exitTimerRef.current = null
  }, [open, onExited])

  React.useEffect(() => {
    return () => {
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (e.currentTarget !== e.target) return
        if (!open) onExited()
      }}
      className={cn(
        'relative pointer-events-auto w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-lg',
        'px-4 py-3 pr-10',
        styles.border,
        // Tailwind v4 CSS-first animation tokens (defined in app/globals.css @theme).
        open ? 'animate-toast-in' : 'animate-toast-out'
      )}
    >
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onClose}
        className={cn(
          'absolute right-3 top-3 rounded-md p-1 text-muted-foreground',
          'hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <X className="h-4 w-4" />
      </button>

      <div className={cn('flex gap-3', hasDescription ? 'items-start' : 'items-center')}>
        <div className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full', styles.iconWrap)}>
          {styles.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5 text-foreground">{title}</div>
          {description ? (
            <div className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</div>
          ) : null}
          {showProgress ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                {progress.kind === 'determinate' ? (
                  <div
                    className={cn('h-full', styles.bar)}
                    style={{ width: `${Math.round(clamp01(progress.value) * 100)}%` }}
                  />
                ) : (
                  <div className={cn('h-full w-1/3 rbip-progress-indeterminate', styles.bar)} />
                )}
              </div>
            </div>
          ) : null}
          {hasActions ? <div className="mt-3">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

