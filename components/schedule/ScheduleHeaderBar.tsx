'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Weekday } from '@/types/staff'
import { Tooltip } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
  showLoadDiagnostics?: boolean
  currentDateKey?: string
  lastLoadTiming: any
  navToScheduleTiming: any
  perfTick: number
  perfStats: any

  // Date controls
  selectedDate: Date
  selectedDateKey?: string
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
  const [snapshotBannerExpanded, setSnapshotBannerExpanded] = useState(false)
  const snapshotBannerWrapRef = useRef<HTMLDivElement | null>(null)
  const prevWorkingDay = getPreviousWorkingDay(props.selectedDate)
  const nextWorkingDay = getNextWorkingDay(props.selectedDate)
  const prevW = WEEKDAY_NAMES[getWeekday(prevWorkingDay)]
  const nextW = WEEKDAY_NAMES[getWeekday(nextWorkingDay)]
  const prevLabel = `${formatDateDDMMYYYY(prevWorkingDay)} (${prevW})`
  const nextLabel = `${formatDateDDMMYYYY(nextWorkingDay)} (${nextW})`

  useEffect(() => {
    if (!snapshotBannerExpanded) return
    const onMouseDown = (e: MouseEvent) => {
      const el = snapshotBannerWrapRef.current
      if (!el) return
      if (el.contains(e.target as Node)) return
      setSnapshotBannerExpanded(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [snapshotBannerExpanded])

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
            showDiagnostics={props.showLoadDiagnostics}
            title="Schedule Allocation"
            currentDateKey={props.selectedDateKey ?? props.currentDateKey}
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

              {props.showSnapshotUiReminder ? (
                <div ref={snapshotBannerWrapRef} className="relative">
                  <Tooltip
                    side="bottom"
                    className="whitespace-normal max-w-[320px]"
                    content={
                      snapshotBannerExpanded
                        ? 'Click outside to close.'
                        : 'This schedule is using its saved setup. Click to view details.'
                    }
                  >
                    <button
                      type="button"
                      aria-label={snapshotBannerExpanded ? 'Close saved setup reminder' : 'Open saved setup reminder'}
                      onClick={() => setSnapshotBannerExpanded((v) => !v)}
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-full',
                        'text-amber-700 hover:text-amber-800',
                        'hover:bg-amber-50 transition-colors'
                      )}
                    >
                      <AlertCircle className="h-4 w-4" />
                    </button>
                  </Tooltip>

                  <div
                    className={cn(
                      'absolute z-50 left-full ml-2 top-1/2 -translate-y-1/2',
                      'transition-[opacity,transform] duration-200 ease-out origin-left',
                      snapshotBannerExpanded
                        ? 'opacity-100 translate-x-0 scale-100'
                        : 'opacity-0 -translate-x-1 scale-95 pointer-events-none'
                    )}
                    aria-hidden={!snapshotBannerExpanded}
                  >
                    <div className="relative">
                      {/* Arrow pointer */}
                      <div
                        className={cn(
                          'absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45',
                          'bg-amber-50 border-l border-b border-amber-200 shadow-[-2px_2px_3px_rgba(0,0,0,0.05)]'
                        )}
                        aria-hidden="true"
                      />

                      <div className="inline-flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/95 backdrop-blur-sm px-3.5 py-2.5 text-xs text-amber-950 leading-snug w-[360px] max-w-[420px] whitespace-normal shadow-xl">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-semibold">Saved setup for this date</div>
                          <div className="text-amber-900/75">
                            New dashboard changes may not apply here.
                          </div>
                        </div>
                        <button
                          ref={props.snapshotDiffButtonRef}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            props.onToggleSnapshotDiff()
                          }}
                          className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100/80 px-2 py-1.5 text-[11px] font-medium text-amber-950 hover:bg-amber-200 transition-colors flex-shrink-0 shadow-sm"
                        >
                          Show differences
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">{props.rightActions}</div>
      </div>
    </>
  )
}

