'use client'

import { DraggingTooltip } from '@/components/allocation/DraggingTooltip'

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
  return (
    <DraggingTooltip
      staffId={staffId}
      content={content}
      allowMultiLine={allowMultiLine}
      tooltipClassName="border-4 border-orange-500"
    >
      {children}
    </DraggingTooltip>
  )
}
