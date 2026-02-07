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
  swapped?: boolean // if true, paneA renders on right/bottom
  onRatioChange?: (ratio: number) => void
  onRatioCommit?: (ratio: number) => void
  liveResize?: boolean
  paneOverflow?: 'auto' | 'hidden'
  minPx?: number
  dividerPx?: number
  className?: string
  paneAClassName?: string
  paneBClassName?: string
  paneA: React.ReactNode
  paneB: React.ReactNode
  dividerAriaLabel?: string
  dividerOverlay?: React.ReactNode
}) {
  const {
    direction,
    ratio,
    swapped = false,
    onRatioChange,
    onRatioCommit,
    liveResize = true,
    paneOverflow = 'auto',
    minPx = 280,
    dividerPx = 6,
    className,
    paneAClassName,
    paneBClassName,
    paneA,
    paneB,
    dividerAriaLabel = 'Resize split panes',
    dividerOverlay,
  } = props

  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const draggingRef = React.useRef(false)
  const lastCommittedRef = React.useRef(clamp01(ratio))
  const liveRatioRef = React.useRef(clamp01(ratio))
  const dragRectRef = React.useRef<DOMRect | null>(null)
  const rafRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    lastCommittedRef.current = clamp01(ratio)
    liveRatioRef.current = clamp01(ratio)
    const el = rootRef.current
    if (el) {
      const pct = `${Math.round(clamp01(ratio) * 1000) / 10}%`
      el.style.setProperty('--split-ratio', pct)
    }
  }, [ratio])

  React.useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const scheduleApplyRatio = React.useCallback((next: number) => {
    liveRatioRef.current = next
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      const el = rootRef.current
      if (!el) return
      const pct = `${Math.round(clamp01(liveRatioRef.current) * 1000) / 10}%`
      el.style.setProperty('--split-ratio', pct)
    })
  }, [])

  const computeRatioFromEvent = React.useCallback(
    (e: PointerEvent, rectOverride?: DOMRect | null) => {
      const rect = rectOverride ?? dragRectRef.current ?? rootRef.current?.getBoundingClientRect()
      if (!rect) return lastCommittedRef.current
      // ratio always represents paneA size, regardless of which side it is on.
      const raw = (() => {
        if (direction === 'col') {
          const w = Math.max(1, rect.width)
          return swapped ? (rect.right - e.clientX) / w : (e.clientX - rect.left) / w
        }
        const h = Math.max(1, rect.height)
        return swapped ? (rect.bottom - e.clientY) / h : (e.clientY - rect.top) / h
      })()
      // Convert minPx into a min ratio relative to container size.
      const minRatio =
        direction === 'col'
          ? minPx / Math.max(1, rect.width)
          : minPx / Math.max(1, rect.height)
      const next = clamp01(raw)
      const clamped = Math.max(minRatio, Math.min(1 - minRatio, next))
      return clamped
    },
    [direction, minPx, swapped]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    // Only left-click / primary touch.
    if ((e as any).button != null && (e as any).button !== 0) return
    draggingRef.current = true
    dragRectRef.current = rootRef.current?.getBoundingClientRect() ?? null
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
    const next = computeRatioFromEvent(e.nativeEvent, dragRectRef.current)
    scheduleApplyRatio(next)
    if (liveResize) {
      onRatioChange?.(next)
    }
    e.preventDefault()
    e.stopPropagation()
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const next = computeRatioFromEvent(e.nativeEvent, dragRectRef.current)
    dragRectRef.current = null
    scheduleApplyRatio(next)
    onRatioChange?.(next)
    onRatioCommit?.(next)
    e.preventDefault()
    e.stopPropagation()
  }

  const ratioPct = `${Math.round(clamp01(ratio) * 1000) / 10}%`
  const template =
    direction === 'col'
      ? swapped
        ? `1fr ${dividerPx}px var(--split-ratio, ${ratioPct})`
        : `var(--split-ratio, ${ratioPct}) ${dividerPx}px 1fr`
      : swapped
        ? `1fr ${dividerPx}px var(--split-ratio, ${ratioPct})`
        : `var(--split-ratio, ${ratioPct}) ${dividerPx}px 1fr`
  const paneOverflowClass = paneOverflow === 'hidden' ? 'overflow-hidden' : 'overflow-auto'

  const paneAPlacementStyle: React.CSSProperties =
    direction === 'col'
      ? { gridColumn: swapped ? 3 : 1, gridRow: 1 }
      : { gridRow: swapped ? 3 : 1, gridColumn: 1 }
  const dividerPlacementStyle: React.CSSProperties =
    direction === 'col' ? { gridColumn: 2, gridRow: 1 } : { gridRow: 2, gridColumn: 1 }
  const paneBPlacementStyle: React.CSSProperties =
    direction === 'col'
      ? { gridColumn: swapped ? 1 : 3, gridRow: 1 }
      : { gridRow: swapped ? 1 : 3, gridColumn: 1 }

  return (
    <div
      ref={rootRef}
      className={cn('min-w-0 min-h-0 grid', direction === 'col' ? 'grid-cols-[auto_auto_1fr]' : 'grid-rows-[auto_auto_1fr]', className)}
      style={
        direction === 'col'
          ? {
              gridTemplateColumns: template,
              gridTemplateRows: undefined,
              ['--split-ratio' as any]: ratioPct,
            }
          : {
              gridTemplateRows: template,
              gridTemplateColumns: undefined,
              ['--split-ratio' as any]: ratioPct,
            }
      }
    >
      <div
        className={cn('min-w-0 min-h-0', paneOverflowClass, paneAClassName)}
        style={paneAPlacementStyle}
      >
        {paneA}
      </div>

      <div
        role="separator"
        aria-label={dividerAriaLabel}
        aria-orientation={direction === 'col' ? 'vertical' : 'horizontal'}
        tabIndex={0}
        className={cn(
          'bg-border/80 hover:bg-border transition-colors',
          direction === 'col' ? 'cursor-col-resize' : 'cursor-row-resize',
          // Keep divider controls above pane content (sticky headers, etc.).
          'relative z-20 overflow-visible flex items-center justify-center group'
        )}
        style={dividerPlacementStyle}
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
          scheduleApplyRatio(next)
          onRatioChange?.(next)
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

        {dividerOverlay ? (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              // Overlay is always present; the overlay content itself controls its hover/expanded state.
              'pointer-events-none'
            )}
          >
            <div
              className="pointer-events-auto relative z-30"
              onPointerDown={(e) => {
                // Don't start drag when clicking overlay controls.
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {dividerOverlay}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={cn('min-w-0 min-h-0', paneOverflowClass, paneBClassName)}
        style={paneBPlacementStyle}
      >
        {paneB}
      </div>
    </div>
  )
}

