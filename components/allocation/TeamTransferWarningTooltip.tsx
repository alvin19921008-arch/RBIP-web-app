'use client'

import { useDndContext } from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useState, useLayoutEffect } from 'react'

interface TeamTransferWarningTooltipProps {
  staffId: string
  content: string | React.ReactNode
  children: React.ReactElement
  allowMultiLine?: boolean // If true, allows content to wrap to multiple lines
}

/**
 * Tooltip component for team transfer warnings (APPT, RPT)
 * Shows with THICKER orange border to emphasize the warning
 * Only appears when dragging is detected
 */
export function TeamTransferWarningTooltip({ 
  staffId,
  content, 
  children,
  allowMultiLine = false
}: TeamTransferWarningTooltipProps) {
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
              'fixed z-[9999] px-2 py-1 text-xs text-popover-foreground bg-popover border-4 border-orange-500 rounded-md shadow-md pointer-events-none',
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
