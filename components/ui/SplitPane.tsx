'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type Direction = 'col' | 'row'

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.5
  return Math.max(0, Math.min(1, n))
}

export function SplitPane(props: {
  direction: Direction
  ratio: number // 0..1, size of first pane
  onRatioChange: (ratio: number) => void
  onRatioCommit?: (ratio: number) => void
  minPx?: number
  dividerPx?: number
  className?: string
  paneAClassName?: string
  paneBClassName?: string
  paneA: React.ReactNode
  paneB: React.ReactNode
  dividerAriaLabel?: string
}) {
  const {
    direction,
    ratio,
    onRatioChange,
    onRatioCommit,
    minPx = 280,
    dividerPx = 6,
    className,
    paneAClassName,
    paneBClassName,
    paneA,
    paneB,
    dividerAriaLabel = 'Resize split panes',
  } = props

  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const draggingRef = React.useRef(false)
  const lastCommittedRef = React.useRef(clamp01(ratio))

  React.useEffect(() => {
    lastCommittedRef.current = clamp01(ratio)
  }, [ratio])

  const computeRatioFromEvent = React.useCallback(
    (e: PointerEvent) => {
      const el = rootRef.current
      if (!el) return lastCommittedRef.current
      const rect = el.getBoundingClientRect()
      const raw =
        direction === 'col'
          ? (e.clientX - rect.left) / Math.max(1, rect.width)
          : (e.clientY - rect.top) / Math.max(1, rect.height)
      // Convert minPx into a min ratio relative to container size.
      const minRatio =
        direction === 'col'
          ? minPx / Math.max(1, rect.width)
          : minPx / Math.max(1, rect.height)
      const next = clamp01(raw)
      const clamped = Math.max(minRatio, Math.min(1 - minRatio, next))
      return clamped
    },
    [direction, minPx]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    // Only left-click / primary touch.
    if ((e as any).button != null && (e as any).button !== 0) return
    draggingRef.current = true
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    e.preventDefault()
    e.stopPropagation()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const next = computeRatioFromEvent(e.nativeEvent)
    onRatioChange(next)
    e.preventDefault()
    e.stopPropagation()
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const next = computeRatioFromEvent(e.nativeEvent)
    onRatioChange(next)
    onRatioCommit?.(next)
    e.preventDefault()
    e.stopPropagation()
  }

  const template =
    direction === 'col'
      ? `${Math.round(clamp01(ratio) * 1000) / 10}% ${dividerPx}px 1fr`
      : `${Math.round(clamp01(ratio) * 1000) / 10}% ${dividerPx}px 1fr`

  return (
    <div
      ref={rootRef}
      className={cn('min-w-0 min-h-0 grid', direction === 'col' ? 'grid-cols-[auto_auto_1fr]' : 'grid-rows-[auto_auto_1fr]', className)}
      style={
        direction === 'col'
          ? { gridTemplateColumns: template }
          : { gridTemplateRows: template }
      }
    >
      <div className={cn('min-w-0 min-h-0 overflow-auto', paneAClassName)}>{paneA}</div>

      <div
        role="separator"
        aria-label={dividerAriaLabel}
        aria-orientation={direction === 'col' ? 'vertical' : 'horizontal'}
        tabIndex={0}
        className={cn(
          'bg-border/80 hover:bg-border transition-colors',
          direction === 'col' ? 'cursor-col-resize' : 'cursor-row-resize',
          'relative flex items-center justify-center'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onKeyDown={(e) => {
          // Accessible keyboard resizing (small nudge).
          const step = 0.02
          const isPrev = direction === 'col' ? e.key === 'ArrowLeft' : e.key === 'ArrowUp'
          const isNext = direction === 'col' ? e.key === 'ArrowRight' : e.key === 'ArrowDown'
          if (!isPrev && !isNext) return
          e.preventDefault()
          const next = clamp01((ratio || 0.5) + (isNext ? step : -step))
          onRatioChange(next)
          onRatioCommit?.(next)
        }}
      >
        {/* Subtle handle */}
        <div
          className={cn(
            'rounded-full bg-muted-foreground/40',
            direction === 'col' ? 'w-[2px] h-10' : 'h-[2px] w-10'
          )}
        />
      </div>

      <div className={cn('min-w-0 min-h-0 overflow-auto', paneBClassName)}>{paneB}</div>
    </div>
  )
}

