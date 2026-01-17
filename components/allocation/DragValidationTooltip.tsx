'use client'

import { DraggingTooltip } from '@/components/allocation/DraggingTooltip'

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
  return (
    <DraggingTooltip
      staffId={staffId}
      content={content}
      allowMultiLine={allowMultiLine}
      tooltipClassName="border border-orange-400"
    >
      {children}
    </DraggingTooltip>
  )
}
