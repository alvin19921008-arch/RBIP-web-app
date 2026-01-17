'use client'

import { Fragment, memo, type RefObject } from 'react'
import { CalendarGrid } from '@/components/ui/calendar-grid'

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

  if (!open) return null

  return (
    <Fragment>
      {/* Backdrop to close on click outside */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Calendar popover */}
      <div
        ref={popoverRef}
        className="fixed z-50 bg-background border border-border rounded-lg shadow-lg"
        style={{
          top: anchorRef.current ? anchorRef.current.getBoundingClientRect().bottom + 8 : 0,
          left: anchorRef.current
            ? Math.max(8, Math.min(anchorRef.current.getBoundingClientRect().left, window.innerWidth - 320))
            : 0,
        }}
      >
        <CalendarGrid selectedDate={selectedDate} onDateSelect={onDateSelect} datesWithData={datesWithData} holidays={holidays} />
      </div>
    </Fragment>
  )
})

