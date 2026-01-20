'use client'

import type { ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Weekday } from '@/types/staff'
import { Tooltip } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { getNextWorkingDay, getPreviousWorkingDay, isWorkingDay } from '@/lib/utils/dateHelpers'
import { formatDateDDMMYYYY, getWeekday } from '@/lib/features/schedule/date'
import { ScheduleTitleWithLoadDiagnostics } from '@/components/schedule/ScheduleTitleWithLoadDiagnostics'

const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
}

export function ScheduleHeaderBar(props: {
  // Back button
  showBackButton: boolean
  onBack: () => void

  // Title + developer diagnostics
  userRole: 'developer' | 'admin' | 'user'
  lastLoadTiming: any
  navToScheduleTiming: any
  perfTick: number
  perfStats: any

  // Date controls
  selectedDate: Date
  weekdayName: string
  isDateHighlighted: boolean
  calendarButtonRef: React.RefObject<HTMLButtonElement | null>
  onToggleCalendar: () => void
  onSelectDate: (date: Date) => void

  // Snapshot banner
  showSnapshotUiReminder: boolean
  snapshotDiffButtonRef: React.RefObject<HTMLButtonElement | null>
  onToggleSnapshotDiff: () => void

  // Right-side actions slot (copy/save/etc.)
  rightActions: ReactNode
}) {
  const prevWorkingDay = getPreviousWorkingDay(props.selectedDate)
  const nextWorkingDay = getNextWorkingDay(props.selectedDate)
  const prevW = WEEKDAY_NAMES[getWeekday(prevWorkingDay)]
  const nextW = WEEKDAY_NAMES[getWeekday(nextWorkingDay)]
  const prevLabel = `${formatDateDDMMYYYY(prevWorkingDay)} (${prevW})`
  const nextLabel = `${formatDateDDMMYYYY(nextWorkingDay)} (${nextW})`

  return (
    <>
      {props.showBackButton ? (
        <Button variant="ghost" size="sm" onClick={props.onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to History
        </Button>
      ) : null}

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <ScheduleTitleWithLoadDiagnostics
            userRole={props.userRole}
            title="Schedule Allocation"
            lastLoadTiming={props.lastLoadTiming}
            navToScheduleTiming={props.navToScheduleTiming}
            perfTick={props.perfTick}
            perfStats={props.perfStats}
          />

          <div className="flex items-center gap-2 relative">
            <div className="inline-flex items-center border border-border rounded-md overflow-hidden bg-background shadow-xs">
              <Tooltip side="bottom" content={`Previous working day: ${prevLabel}`}>
                <button
                  type="button"
                  aria-label="Previous working day"
                  onClick={() => props.onSelectDate(prevWorkingDay)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 hover:scale-110 active:scale-95 border-r border-border"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </Tooltip>

              <button
                type="button"
                aria-label="Go to today"
                onClick={() => {
                  const today = new Date()
                  const target = isWorkingDay(today) ? today : getNextWorkingDay(today)
                  props.onSelectDate(target)
                }}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 hover:scale-105 active:scale-95 border-r border-border"
              >
                Today
              </button>

              <Tooltip side="bottom" content={`Next working day: ${nextLabel}`}>
                <button
                  type="button"
                  aria-label="Next working day"
                  onClick={() => props.onSelectDate(nextWorkingDay)}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 hover:scale-110 active:scale-95"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>

            <div className="inline-flex items-center gap-1">
              <span
                className={`text-lg font-semibold rounded px-2 py-1 transition-shadow transition-colors ${
                  props.isDateHighlighted ? 'bg-amber-50 ring-2 ring-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.55)]' : ''
                }`}
              >
                {formatDateDDMMYYYY(props.selectedDate)} ({props.weekdayName})
              </span>

              <button
                ref={props.calendarButtonRef}
                onClick={props.onToggleCalendar}
                className="cursor-pointer inline-flex items-center -ml-1"
                type="button"
                aria-label="Open date picker"
              >
                <Tooltip side="bottom" content="Open calendar">
                  <span className="inline-flex">
                    <Calendar className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                  </span>
                </Tooltip>
              </button>
            </div>
          </div>
        </div>

        {props.showSnapshotUiReminder ? (
          <div className="mx-3 min-w-0">
            <div className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-950 leading-snug max-w-[420px] whitespace-normal">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-700 flex-shrink-0" />
              <span className="break-words">
                You’re viewing the saved snapshot for this date. Later dashboard changes may not appear here.
              </span>
              <button
                ref={props.snapshotDiffButtonRef}
                type="button"
                onClick={props.onToggleSnapshotDiff}
                className="ml-1 inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-amber-200 transition-colors"
              >
                Show differences
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">{props.rightActions}</div>
      </div>
    </>
  )
}

