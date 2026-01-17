'use client'

import { useDndContext } from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react'

type DraggingTooltipProps = {
  staffId: string
  content: string | ReactNode
  children: ReactElement
  allowMultiLine?: boolean
  tooltipClassName?: string
}

/**
 * A tooltip that shows only while dragging the specified `staffId` (supports composite IDs like staffId::team).
 * Shared implementation for drag validation + team transfer warning tooltips.
 */
export function DraggingTooltip({
  staffId,
  content,
  children,
  allowMultiLine = false,
  tooltipClassName,
}: DraggingTooltipProps) {
  const { active } = useDndContext()

  const isDragging =
    active?.id === staffId ||
    (typeof active?.id === 'string' && !staffId.includes('::') && active.id.startsWith(`${staffId}::`))

  const [isVisible, setIsVisible] = useState(false)
  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null)
  const [portalStyle, setPortalStyle] = useState<{ left: number; top: number; transform: string } | null>(null)

  useLayoutEffect(() => {
    if (isDragging) {
      setIsVisible(true)
    } else {
      setIsVisible(false)
      setPortalStyle(null)
    }
  }, [isDragging])

  useLayoutEffect(() => {
    if (!isVisible || !anchorElement) return
    const anchorForPos = anchorElement.getBoundingClientRect()
    const gap = 8
    const left = anchorForPos.right + gap
    const top = anchorForPos.top + anchorForPos.height / 2
    const transform = 'translateY(-50%)'
    setPortalStyle({ left, top, transform })
  }, [isVisible, content, anchorElement])

  return (
    <div ref={setAnchorElement} className="relative block w-full">
      {children}
      {isVisible &&
        portalStyle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={cn(
              'fixed z-[9999] px-2 py-1 text-xs text-popover-foreground bg-popover rounded-md shadow-md pointer-events-none',
              allowMultiLine ? 'whitespace-normal max-w-[200px]' : 'whitespace-nowrap',
              tooltipClassName
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

