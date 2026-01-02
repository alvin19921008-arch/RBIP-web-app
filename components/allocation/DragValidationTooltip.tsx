'use client'

import { useDndContext } from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useState, useLayoutEffect } from 'react'

interface DragValidationTooltipProps {
  staffId: string
  content: string | React.ReactNode
  children: React.ReactElement
  allowMultiLine?: boolean // If true, allows content to wrap to multiple lines
}

/**
 * Tooltip component that only shows when dragging is detected (not on hover)
 * Used for staff drag validation messages (both buffer and regular staff)
 */
export function DragValidationTooltip({ 
  staffId,
  content, 
  children,
  allowMultiLine = false
}: DragValidationTooltipProps) {
  const { active } = useDndContext()
  
  // Check if this staff is being dragged
  // Handle both simple IDs and composite IDs (staffId::team)
  // If staffId is composite (contains '::'), match exactly
  // If staffId is simple, match both simple and composite forms
  const isDragging = active?.id === staffId || 
    (typeof active?.id === 'string' && !staffId.includes('::') && active.id.startsWith(`${staffId}::`))
  
  const [isVisible, setIsVisible] = useState(false)
  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null)
  const [portalStyle, setPortalStyle] = useState<{ left: number; top: number; transform: string } | null>(null)

  // Show tooltip only when dragging
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
    if (anchorForPos) {
      const gap = 8
      const left = anchorForPos.right + gap
      const top = anchorForPos.top + anchorForPos.height / 2
      const transform = 'translateY(-50%)'
      setPortalStyle({ left, top, transform })
    }
  }, [isVisible, content, anchorElement])

  return (
    <div
      ref={setAnchorElement}
      className="relative block w-full"
    >
      {children}
      {isVisible &&
        portalStyle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={cn(
              'fixed z-[9999] px-2 py-1 text-xs text-popover-foreground bg-popover border border-orange-400 rounded-md shadow-md pointer-events-none',
              allowMultiLine ? 'whitespace-normal max-w-[200px]' : 'whitespace-nowrap'
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
