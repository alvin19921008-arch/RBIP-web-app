'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { clampFixedPositionToViewport } from '@/lib/utils/overlayPosition'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  wrapperClassName?: string
  zIndex?: number
  enableOnTouch?: boolean
  /** When true, the bubble accepts pointer hover so users can move from anchor to read multi-line content. */
  interactive?: boolean
}

export function Tooltip({
  children,
  content,
  side = 'right',
  className,
  wrapperClassName,
  zIndex,
  enableOnTouch = false,
  interactive = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  const [isTouchDevice, setIsTouchDevice] = React.useState(false)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const tooltipRef = React.useRef<HTMLDivElement>(null)
  const anchorLeaveTimerRef = React.useRef<number | null>(null)
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null)
  const [portalPos, setPortalPos] = React.useState<{ left: number; top: number } | null>(null)
  const tooltipDisabled = isTouchDevice && !enableOnTouch
  const preferTouchToggle = enableOnTouch && isTouchDevice

  const clearAnchorLeaveTimer = React.useCallback(() => {
    if (anchorLeaveTimerRef.current != null) {
      window.clearTimeout(anchorLeaveTimerRef.current)
      anchorLeaveTimerRef.current = null
    }
  }, [])

  React.useEffect(() => () => clearAnchorLeaveTimer(), [clearAnchorLeaveTimer])

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(pointer: coarse), (hover: none)')
    const update = () => setIsTouchDevice(media.matches)
    update()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  const computeAndClamp = React.useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect()
    const tip = tooltipRef.current?.getBoundingClientRect()
    if (!a || !tip) return

    const gap = 8
    const pad = 8

    let left = 0
    let top = 0

    if (side === 'left') {
      left = a.left - gap - tip.width
      top = a.top + a.height / 2 - tip.height / 2
    } else if (side === 'top') {
      left = a.left + a.width / 2 - tip.width / 2
      top = a.top - gap - tip.height
    } else if (side === 'bottom') {
      left = a.left + a.width / 2 - tip.width / 2
      top = a.bottom + gap
    } else {
      // right
      left = a.right + gap
      top = a.top + a.height / 2 - tip.height / 2
    }

    const clamped = clampFixedPositionToViewport({ left, top, width: tip.width, height: tip.height, pad })
    setPortalPos(clamped)
  }, [side])

  React.useLayoutEffect(() => {
    if (!isVisible) {
      clearAnchorLeaveTimer()
      setAnchorRect(null)
      setPortalPos(null)
      return
    }
    const a = anchorRef.current?.getBoundingClientRect()
    setAnchorRect(a ?? null)
  }, [isVisible, side, clearAnchorLeaveTimer])

  React.useLayoutEffect(() => {
    if (!isVisible) return
    if (!anchorRect) return
    // Render first, then measure + clamp.
    requestAnimationFrame(() => {
      try {
        computeAndClamp()
      } catch {
        // ignore
      }
    })
  }, [isVisible, anchorRect, side, computeAndClamp])

  React.useEffect(() => {
    if (!isVisible) return
    const onResize = () => computeAndClamp()
    const onScroll = () => computeAndClamp()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [isVisible, computeAndClamp])

  React.useEffect(() => {
    if (!isVisible || !preferTouchToggle) return
    const onPointerDownOutside = (ev: PointerEvent) => {
      const anchor = anchorRef.current
      const tip = tooltipRef.current
      const t = ev.target
      if (!t || !(t instanceof Node)) return
      if (anchor?.contains(t) || tip?.contains(t)) return
      setIsVisible(false)
      setPortalPos(null)
    }
    document.addEventListener('pointerdown', onPointerDownOutside, true)
    return () => document.removeEventListener('pointerdown', onPointerDownOutside, true)
  }, [isVisible, preferTouchToggle])

  return (
    <div
      ref={anchorRef}
      className={cn('relative', wrapperClassName ?? 'inline-block')}
      onPointerDown={() => {
        if (tooltipDisabled && isVisible) {
          setIsVisible(false)
          setPortalPos(null)
        }
      }}
      onMouseEnter={() => {
        if (tooltipDisabled || preferTouchToggle) return
        clearAnchorLeaveTimer()
        setIsVisible(true)
        setPortalPos(null)
      }}
      onMouseLeave={() => {
        if (tooltipDisabled || preferTouchToggle) return
        if (interactive) {
          anchorLeaveTimerRef.current = window.setTimeout(() => {
            setIsVisible(false)
            setPortalPos(null)
            anchorLeaveTimerRef.current = null
          }, 160)
          return
        }
        setIsVisible(false)
        setPortalPos(null)
      }}
      onClick={(e) => {
        if (!preferTouchToggle) return
        e.stopPropagation()
        setIsVisible((v) => !v)
        setPortalPos(null)
      }}
    >
      {children}
      {!tooltipDisabled &&
        isVisible &&
        anchorRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            className={cn(
              'fixed z-[9999] px-2 py-1 text-xs text-popover-foreground bg-popover border border-border rounded-md shadow-md whitespace-nowrap',
              interactive ? 'pointer-events-auto' : 'pointer-events-none',
              portalPos ? 'opacity-100' : 'opacity-0',
              className
            )}
            style={{
              left: portalPos?.left ?? 0,
              top: portalPos?.top ?? 0,
              zIndex: typeof zIndex === 'number' ? zIndex : undefined,
            }}
            onMouseEnter={() => {
              if (!interactive) return
              clearAnchorLeaveTimer()
            }}
            onMouseLeave={() => {
              if (!interactive) return
              setIsVisible(false)
              setPortalPos(null)
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  )
}
