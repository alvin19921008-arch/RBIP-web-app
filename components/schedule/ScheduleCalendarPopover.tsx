'use client'

import { Fragment, memo, useRef, type RefObject } from 'react'
import { CalendarGrid } from '@/components/ui/calendar-grid'
import { useAnchoredPopoverPosition } from '@/lib/hooks/useAnchoredPopoverPosition'
import { isWorkingDay } from '@/lib/utils/dateHelpers'

export const ScheduleCalendarPopover = memo(function ScheduleCalendarPopover(props: {
  open: boolean
  selectedDate: Date
  datesWithData: Set<string>
  holidays: Map<string, string>
  onClose: () => void
  onDateSelect: (date: Date) => void
  anchorRef: RefObject<HTMLButtonElement | null>
  popoverRef?: RefObject<HTMLDivElement | null>
}) {
  const { open, selectedDate, datesWithData, holidays, onClose, onDateSelect, anchorRef, popoverRef } = props
  const internalPopoverRef = useRef<HTMLDivElement | null>(null)
  const effectivePopoverRef = popoverRef ?? internalPopoverRef

  const pos = useAnchoredPopoverPosition({
    open,
    anchorRef,
    popoverRef: effectivePopoverRef,
    placement: 'bottom-start',
    offset: 8,
    pad: 8,
  })

  if (!open) return null

  return (
    <Fragment>
      {/* Backdrop to close on click outside */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Calendar popover */}
      <div
        ref={effectivePopoverRef}
        className="fixed z-50 bg-background border border-border rounded-lg shadow-lg"
        style={pos ? { left: pos.left, top: pos.top } : undefined}
      >
        <CalendarGrid
          selectedDate={selectedDate}
          onDateSelect={onDateSelect}
          datesWithData={datesWithData}
          holidays={holidays}
          isDateDisabled={(date) => !isWorkingDay(date)}
        />
      </div>
    </Fragment>
  )
})

