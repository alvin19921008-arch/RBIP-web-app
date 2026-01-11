'use client'

import * as React from 'react'
import { CheckCircle2, X, XCircle, AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ActionToastVariant = 'success' | 'warning' | 'error'

type ActionToastProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  variant?: ActionToastVariant
  open: boolean
  onClose: () => void
  onExited: () => void
}

function getVariantStyles(variant: ActionToastVariant) {
  switch (variant) {
    case 'success':
      return {
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-700" />,
        iconWrap: 'bg-emerald-100',
        border: 'border-emerald-200',
      }
    case 'warning':
      return {
        icon: <AlertTriangle className="h-5 w-5 text-amber-700" />,
        iconWrap: 'bg-amber-100',
        border: 'border-amber-200',
      }
    case 'error':
      return {
        icon: <XCircle className="h-5 w-5 text-red-700" />,
        iconWrap: 'bg-red-100',
        border: 'border-red-200',
      }
  }
}

export function ActionToast({
  title,
  description,
  actions,
  variant = 'success',
  open,
  onClose,
  onExited,
}: ActionToastProps) {
  const styles = getVariantStyles(variant)
  const hasDescription = typeof description === 'string' && description.trim().length > 0
  const hasActions = actions != null

  return (
    <div
      role="status"
      aria-live="polite"
      onAnimationEnd={() => {
        if (!open) onExited()
      }}
      className={cn(
        'relative pointer-events-auto w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-lg',
        'px-4 py-3 pr-10',
        styles.border,
        open
          ? 'animate-in fade-in slide-in-from-right-full duration-300'
          : 'animate-out fade-out slide-out-to-right-full duration-200'
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
          {hasActions ? <div className="mt-3">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

