'use client'

import { type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { AlertCircle, ArrowLeft, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import type { Weekday } from '@/types/staff'
import { Tooltip } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getNextWorkingDay, getPreviousWorkingDay, isWorkingDay } from '@/lib/utils/dateHelpers'
import { formatDateDDMMYYYY, getWeekday } from '@/lib/features/schedule/date'
import { ScheduleTitleWithLoadDiagnostics } from '@/components/schedule/ScheduleTitleWithLoadDiagnostics'
import { Popover, PopoverContent, PopoverTrigger, PopoverArrow } from '@/components/ui/popover'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'

const SnapshotDiffDetails = dynamic(
  () => import('@/components/schedule/SnapshotDiffDetails').then((m) => m.SnapshotDiffDetails),
  { ssr: false }
)

const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
}

function formatDateKeyDDMMYYYY(dateKey: string): string {
  // dateKey is expected to be local schedule key: YYYY-MM-DD.
  // Format it without constructing a Date to avoid SSR/CSR timezone hydration mismatches.
  const [y, m, d] = dateKey.split('-')
  if (!y || !m || !d) return dateKey
  return `${d}/${m}/${y}`
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
  savedSetupPopoverOpen: boolean
  onSavedSetupPopoverOpenChange: (open: boolean) => void
  snapshotDiffButtonRef: React.RefObject<HTMLButtonElement | null>
  snapshotDiffExpanded: boolean
  onToggleSnapshotDiffExpanded: () => void
  snapshotDiffLoading: boolean
  snapshotDiffError: string | null
  snapshotDiffResult: SnapshotDiffResult | null

  // Display tools (view/split)
  displayTools?: ReactNode

  // Steps toggle (Show/Hide Steps)
  isViewingMode: boolean
  stepIndicatorCollapsed: boolean
  onToggleStepIndicatorCollapsed: () => void

  // Right-side actions slot (copy/save/etc.)
  rightActions: ReactNode
}) {
  const prevWorkingDay = getPreviousWorkingDay(props.selectedDate)
  const nextWorkingDay = getNextWorkingDay(props.selectedDate)
  const prevW = WEEKDAY_NAMES[getWeekday(prevWorkingDay)]
  const nextW = WEEKDAY_NAMES[getWeekday(nextWorkingDay)]
  const prevLabel = `${formatDateDDMMYYYY(prevWorkingDay)} (${prevW})`
  const nextLabel = `${formatDateDDMMYYYY(nextWorkingDay)} (${nextW})`
  const displayDate = props.selectedDateKey ? formatDateKeyDDMMYYYY(props.selectedDateKey) : formatDateDDMMYYYY(props.selectedDate)

  const shouldShowDevCache = props.userRole === 'developer' || props.showLoadDiagnostics === true
  const devMeta: any = (props.lastLoadTiming as any)?.meta || {}
  const currentKey = props.selectedDateKey ?? props.currentDateKey ?? null
  const metaKey = typeof devMeta?.dateStr === 'string' ? devMeta.dateStr : null
  const isDevMetaStale = !!(metaKey && currentKey && metaKey !== currentKey)
  const isDevMetaPending = !!devMeta?.pending
  const cacheStateLabel = isDevMetaPending ? 'pending' : isDevMetaStale ? 'stale' : devMeta?.cacheHit ? 'hit' : 'miss'
  const cacheLayer = devMeta?.cacheLayer ?? null
  const cacheSource = devMeta?.cacheSource ?? null
  const cacheEntryAt = typeof devMeta?.cacheEntryAt === 'number' ? (devMeta.cacheEntryAt as number) : null
  const cacheBadgeClass = cn(
    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium select-none',
    isDevMetaStale
      ? 'border-red-200 bg-red-50 text-red-700'
      : isDevMetaPending
        ? 'border-slate-200 bg-slate-50 text-slate-600'
        : devMeta?.cacheHit
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
  )

  return (
    <>
      {props.showBackButton ? (
        <Button variant="ghost" size="sm" onClick={props.onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to History
        </Button>
      ) : null}

      <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-3">
        {/* Row 1: title + primary actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            {props.showSnapshotUiReminder ? (
              <Popover open={props.savedSetupPopoverOpen} onOpenChange={props.onSavedSetupPopoverOpenChange}>
                <Tooltip
                  side="bottom"
                  className="whitespace-normal max-w-[320px]"
                  content="This schedule is using its saved setup. Click to view details."
                >
                  <PopoverTrigger asChild>
                    <button
                      ref={props.snapshotDiffButtonRef}
                      type="button"
                      aria-label="Open saved setup reminder"
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-md',
                        'text-amber-700 hover:text-amber-800',
                        'hover:bg-amber-50 transition-colors'
                      )}
                    >
                      <AlertCircle className="h-5 w-5" />
                    </button>
                  </PopoverTrigger>
                </Tooltip>

                <PopoverContent
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  className={cn(
                    'rounded-lg border border-amber-200 bg-amber-50/95 backdrop-blur-sm px-3.5 py-2.5 text-xs text-amber-950 leading-snug shadow-xl transition-[width,max-width] duration-300 ease-out',
                    props.snapshotDiffExpanded ? 'w-[480px] max-w-[560px]' : 'w-[360px] max-w-[420px]'
                  )}
                >
                  <PopoverArrow width={10} height={6} />
                  <div className="w-full space-y-3">
                    <div className="flex items-start justify-between gap-3 w-full">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-semibold text-sm">Saved setup snapshot (this date)</div>
                        <div className="text-amber-900/75">Showing differences: saved snapshot → current dashboard.</div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onToggleSnapshotDiffExpanded()
                        }}
                        className="group inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 transition-colors flex-shrink-0 mt-0.5 select-none"
                      >
                        {props.snapshotDiffExpanded ? 'Hide' : 'Review'}
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform duration-200',
                            props.snapshotDiffExpanded ? 'rotate-180' : null
                          )}
                        />
                      </button>
                    </div>

                    <div
                      className={cn(
                        'overflow-hidden transition-[max-height,opacity] duration-300 ease-out',
                        props.snapshotDiffExpanded ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0'
                      )}
                    >
                      <div className="pt-1 pb-1">
                        {/* Divider */}
                        <div className="h-px bg-amber-200/60 w-full mb-3" />

                        {props.snapshotDiffLoading ? (
                          <div className="text-xs text-amber-950/70 py-2">Loading current dashboard config…</div>
                        ) : props.snapshotDiffError ? (
                          <div className="text-xs text-destructive py-2">Failed to load differences: {props.snapshotDiffError}</div>
                        ) : props.snapshotDiffResult ? (
                          <SnapshotDiffDetails result={props.snapshotDiffResult} />
                        ) : (
                          <div className="text-xs text-amber-950/70 py-2">No differences computed yet.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
            {props.rightActions}
          </div>
        </div>

        {/* Row 2: date controls (left) + display + steps toggle (right) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 relative min-w-0 flex-1">
            <div className="inline-flex shrink-0 items-center border border-border rounded-md overflow-hidden bg-background shadow-xs">
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

            <Tooltip side="bottom" content="Open calendar" wrapperClassName="inline-flex min-w-0">
              <button
                ref={props.calendarButtonRef}
                onClick={props.onToggleCalendar}
                type="button"
                aria-label="Open date picker"
                className={cn(
                  // Soft “ghost pill”: clickable, but not outlined.
                  'inline-flex min-w-0 items-center gap-2 rounded-lg',
                  'px-2 py-1.5',
                  'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted/70',
                  'transition-colors rbip-hover-scale',
                  // Accessibility: focus ring only.
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  props.isDateHighlighted
                    ? 'bg-amber-50 ring-2 ring-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
                    : null
                )}
              >
                <span suppressHydrationWarning className="text-lg font-semibold text-foreground truncate">
                  {displayDate} ({props.weekdayName})
                </span>
                <span className="h-5 w-px bg-border/40" aria-hidden />
                <Calendar className="h-4 w-4 opacity-80" />
              </button>
            </Tooltip>

            {shouldShowDevCache ? (
              <Tooltip
                side="bottom"
                className="whitespace-normal max-w-[360px]"
                content={
                  <div className="text-xs space-y-1">
                    <div className="font-medium">Cache (dev)</div>
                    <div>
                      <span className="text-muted-foreground">read:</span> {cacheStateLabel}
                    </div>
                    <div>
                      <span className="text-muted-foreground">layer:</span> {cacheLayer ?? 'unknown'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">source:</span> {cacheSource ?? 'unknown'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">date(meta):</span> {metaKey ?? 'unknown'}
                      {currentKey ? `, current:${currentKey}` : ''}
                    </div>
                    {cacheEntryAt != null ? (
                      <div>
                        <span className="text-muted-foreground">cachedAt:</span> {new Date(cacheEntryAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                }
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Cache status (developer)"
                  suppressHydrationWarning
                  className={cn(
                    cacheBadgeClass,
                    'cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                    }
                  }}
                >
                  cache:{cacheStateLabel}
                </span>
              </Tooltip>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            {props.displayTools ? <div className="shrink-0">{props.displayTools}</div> : null}
            {props.isViewingMode ? null : (
              <div className="vt-mode-anim flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={props.onToggleStepIndicatorCollapsed}
                  className="h-6 text-xs text-muted-foreground hover:text-foreground"
                >
                  {props.stepIndicatorCollapsed ? (
                    <>
                      Show Steps <ChevronDown className="ml-1 h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Hide Steps <ChevronUp className="ml-1 h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

