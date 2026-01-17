'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type CursorTooltipProps = {
  open: boolean
  content: ReactNode
  clientX: number
  clientY: number
  className?: string
  maxWidthClassName?: string
  offset?: { x: number; y: number }
}

export function CursorTooltip({
  open,
  content,
  clientX,
  clientY,
  className,
  maxWidthClassName,
  offset = { x: 12, y: 12 },
}: CursorTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }

    // Render first, then measure to clamp.
    requestAnimationFrame(() => {
      const el = tooltipRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()

      const pad = 8
      let left = clientX + offset.x
      let top = clientY + offset.y

      // Clamp in viewport
      const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad)
      const maxTop = Math.max(pad, window.innerHeight - rect.height - pad)
      left = Math.min(Math.max(pad, left), maxLeft)
      top = Math.min(Math.max(pad, top), maxTop)

      setPos({ left, top })
    })
  }, [open, clientX, clientY, offset.x, offset.y])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={tooltipRef}
      className={cn(
        'fixed z-[11000] px-2 py-1 text-xs text-popover-foreground bg-popover border border-border rounded-md shadow-md pointer-events-none',
        maxWidthClassName ?? 'whitespace-normal max-w-[260px]',
        pos ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
      }}
    >
      {content}
    </div>,
    document.body
  )
}

