'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function Tooltip({ children, content, side = 'right', className }: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const [portalStyle, setPortalStyle] = React.useState<{ left: number; top: number; transform: string } | null>(null)

  React.useLayoutEffect(() => {
    if (!isVisible) return
    const anchorForPos = anchorRef.current?.getBoundingClientRect()
    if (anchorForPos) {
      const gap = 8
      let left = anchorForPos.right + gap
      let top = anchorForPos.top + anchorForPos.height / 2
      let transform = 'translateY(-50%)'
      if (side === 'left') {
        left = anchorForPos.left - gap
        transform = 'translate(-100%, -50%)'
      } else if (side === 'top') {
        left = anchorForPos.left + anchorForPos.width / 2
        top = anchorForPos.top - gap
        transform = 'translate(-50%, -100%)'
      } else if (side === 'bottom') {
        left = anchorForPos.left + anchorForPos.width / 2
        top = anchorForPos.bottom + gap
        transform = 'translate(-50%, 0)'
      }
      setPortalStyle({ left, top, transform })
    }
  }, [isVisible, side])

  return (
    <div
      ref={anchorRef}
      className="relative inline-block"
      onMouseEnter={() => {
        setIsVisible(true)
      }}
      onMouseLeave={() => {
        setIsVisible(false)
        setPortalStyle(null)
      }}
    >
      {children}
      {isVisible &&
        portalStyle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={cn(
              'fixed z-[9999] px-2 py-1 text-xs text-popover-foreground bg-popover border border-border rounded-md shadow-md whitespace-nowrap pointer-events-none',
              className
            )}
            style={{
              left: portalStyle.left,
              top: portalStyle.top,
              transform: portalStyle.transform,
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  )
}
