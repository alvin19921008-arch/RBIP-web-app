'use client'

import { type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { AlertCircle, Calendar, ArrowLeftRight, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import type { Weekday } from '@/types/staff'
import type { TimingReport } from '@/lib/utils/timing'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getNextWorkingDay, getPreviousWorkingDay, isWorkingDay } from '@/lib/utils/dateHelpers'
import { formatDateDDMMYYYY, getWeekday } from '@/lib/features/schedule/date'
import { ScheduleTitleWithLoadDiagnostics } from '@/features/schedule/ui/layout/ScheduleTitleWithLoadDiagnostics'
import { Popover, PopoverContent, PopoverTrigger, PopoverArrow, PopoverClose } from '@/components/ui/popover'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'

const SnapshotDiffDetails = dynamic(
  () => import('@/features/schedule/ui/overlays/SnapshotDiffDetails').then((m) => m.SnapshotDiffDetails),
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
  // Title + developer diagnostics
  userRole: 'developer' | 'admin' | 'user'
  showLoadDiagnostics?: boolean
  /** When true, show cache status badge and clear cache action (access-settings gated, admin+dev by default) */
  showCacheStatus?: boolean
  currentDateKey?: string
  lastLoadTiming: TimingReport | null
  navToScheduleTiming: {
    targetHref: string
    startMs: number
    loadingShownMs: number | null
    mountedMs: number | null
    gridReadyMs: number
  } | null
  perfTick: number
  perfStats: Record<
    string,
    | {
        commits: number
        totalActualMs: number
        maxActualMs: number
        lastActualMs: number
        lastPhase: 'mount' | 'update' | 'nested-update'
      }
    | undefined
  >

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
  canAccessDashboardSyncPublish: boolean

  // Display tools (view/split)
  displayTools?: ReactNode

  onClearCache?: () => void

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

  const shouldShowDevCache = props.showCacheStatus === true || props.showLoadDiagnostics === true
  type DevLoadMeta = {
    dateStr?: string
    pending?: boolean
    cacheHit?: boolean
    cacheLayer?: string
    cacheSource?: string
    cacheEntryAt?: number
    loadFrom?: string
    draftHit?: boolean
    draftApplied?: boolean
    draftIdentityMatched?: boolean
    draftIdentityMismatchReason?: string
    scheduleId?: string
    scheduleUpdatedAt?: string
    cacheEpoch?: number
    cacheEntryEpoch?: number
    draftDirtyReasons?: string[]
  }
  const devMeta: DevLoadMeta = (props.lastLoadTiming as { meta?: DevLoadMeta } | null | undefined)?.meta ?? {}
  const currentKey = props.selectedDateKey ?? props.currentDateKey ?? null
  const metaKey = typeof devMeta?.dateStr === 'string' ? devMeta.dateStr : null
  const isDevMetaStale = !!(metaKey && currentKey && metaKey !== currentKey)
  const isDevMetaPending = !!devMeta?.pending
  const cacheStateLabel = isDevMetaPending ? 'pending' : isDevMetaStale ? 'stale' : devMeta?.cacheHit ? 'hit' : 'miss'
  const cacheLayer = devMeta?.cacheLayer ?? null
  const cacheSource = devMeta?.cacheSource ?? null
  const cacheEntryAt = typeof devMeta?.cacheEntryAt === 'number' ? (devMeta.cacheEntryAt as number) : null
  const loadFrom = typeof devMeta?.loadFrom === 'string' ? (devMeta.loadFrom as string) : null
  const draftHit = !!devMeta?.draftHit
  const draftApplied = !!devMeta?.draftApplied
  const draftIdentityMatched = typeof devMeta?.draftIdentityMatched === 'boolean' ? !!devMeta.draftIdentityMatched : null
  const draftMismatch = typeof devMeta?.draftIdentityMismatchReason === 'string' ? (devMeta.draftIdentityMismatchReason as string) : null
  const scheduleId = typeof devMeta?.scheduleId === 'string' ? (devMeta.scheduleId as string) : null
  const scheduleUpdatedAt = typeof devMeta?.scheduleUpdatedAt === 'string' ? (devMeta.scheduleUpdatedAt as string) : null
  const cacheEpoch = typeof devMeta?.cacheEpoch === 'number' ? (devMeta.cacheEpoch as number) : null
  const cacheEntryEpoch = typeof devMeta?.cacheEntryEpoch === 'number' ? (devMeta.cacheEntryEpoch as number) : null
  const draftDirtyReasons = Array.isArray(devMeta?.draftDirtyReasons) ? (devMeta.draftDirtyReasons as string[]) : null
  const cacheBadgeClass = cn(
    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium select-none',
    isDevMetaStale
      ? 'border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15'
      : isDevMetaPending
        ? 'border-border bg-muted text-muted-foreground'
        : devMeta?.cacheHit
          ? 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
          : 'border-amber-500/35 bg-amber-500/[0.08] text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100'
  )

  return (
    <>
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
                        'text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200',
                        'hover:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-colors'
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
                    'rounded-lg border border-border bg-card/95 text-card-foreground backdrop-blur-sm px-3.5 py-2.5 text-xs leading-snug shadow-xl ring-1 ring-amber-500/15 dark:bg-card dark:ring-amber-400/20 transition-[width,max-width] duration-300 ease-out',
                    props.snapshotDiffExpanded ? 'w-[480px] max-w-[560px]' : 'w-[360px] max-w-[420px]'
                  )}
                >
                  <PopoverArrow width={10} height={6} />
                  <div className="w-full space-y-3">
                    <div className="flex items-start justify-between gap-3 w-full">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-semibold text-sm">Saved setup snapshot (this date)</div>
                        <div className="text-muted-foreground">Showing differences: saved snapshot → current dashboard.</div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onToggleSnapshotDiffExpanded()
                        }}
                        className="group inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100 transition-colors flex-shrink-0 mt-0.5 select-none"
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
                      <div className="pt-1 pb-1 max-h-[62vh] overflow-y-auto pr-1">
                        {/* Divider */}
                        <div className="h-px bg-border w-full mb-3" />

                        {props.snapshotDiffLoading ? (
                          <div className="text-xs text-muted-foreground py-2">Loading current dashboard config…</div>
                        ) : props.snapshotDiffError ? (
                          <div className="text-xs text-destructive py-2">Failed to load differences: {props.snapshotDiffError}</div>
                        ) : props.snapshotDiffResult ? (
                          <SnapshotDiffDetails result={props.snapshotDiffResult} />
                        ) : (
                          <div className="text-xs text-muted-foreground py-2">No differences computed yet.</div>
                        )}
                      </div>

                      {props.canAccessDashboardSyncPublish ? (
                        <div className="pt-3 mt-3 border-t border-border">
                          <p className="text-[11px] text-muted-foreground mb-2">Pull dashboard config to this date.</p>
                          <Link
                            href="/dashboard?category=sync-publish"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted hover:border-amber-500/40 dark:hover:border-amber-400/35 transition-colors"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            Go to Sync / Publish
                          </Link>
                        </div>
                      ) : null}
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
                  className="rbip-nav-date-btn px-2 py-1.5 hover:scale-110 border-r border-border"
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
                className="rbip-nav-date-btn px-3 py-1.5 text-xs font-medium hover:scale-105 border-r border-border"
              >
                Today
              </button>

              <Tooltip side="bottom" content={`Next working day: ${nextLabel}`}>
                <button
                  type="button"
                  aria-label="Next working day"
                  onClick={() => props.onSelectDate(nextWorkingDay)}
                  className="rbip-nav-date-btn px-2 py-1.5 hover:scale-110"
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
                    ? 'bg-amber-500/12 ring-2 ring-amber-400/70 shadow-[0_0_12px_rgba(245,158,11,0.35)] dark:bg-amber-500/20 dark:ring-amber-400/55 dark:shadow-[0_0_14px_rgba(245,158,11,0.28)]'
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
              <div className="inline-flex items-center gap-0">
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
                        <span className="text-muted-foreground">loadFrom:</span> {loadFrom ?? 'unknown'}
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
                      <div>
                        <span className="text-muted-foreground">draft:</span>{' '}
                        {draftApplied ? 'applied' : draftHit ? 'hit(not-applied)' : 'miss'}
                        {draftIdentityMatched == null ? '' : draftIdentityMatched ? ', idCheck:pass' : ', idCheck:fail'}
                        {draftMismatch ? ` (${draftMismatch})` : ''}
                      </div>
                      {draftDirtyReasons && draftDirtyReasons.length > 0 ? (
                        <div>
                          <span className="text-muted-foreground">draftReasons:</span> {draftDirtyReasons.join(',')}
                        </div>
                      ) : null}
                      <div>
                        <span className="text-muted-foreground">scheduleId:</span> {scheduleId ?? 'unknown'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">updatedAt:</span> {scheduleUpdatedAt ?? 'unknown'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">epoch:</span> {cacheEpoch ?? 'unknown'}
                        {cacheEntryEpoch == null ? '' : `, entryEpoch:${cacheEntryEpoch}`}
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
                    aria-label="Cache status"
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
                {props.showCacheStatus && props.onClearCache ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="Cache actions"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-muted-foreground ring-offset-background transition-colors hover:border hover:border-border hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="bottom"
                      className="w-auto rounded-md border border-border bg-card px-1 py-1 shadow-lg"
                    >
                      <PopoverClose asChild>
                        <button
                          type="button"
                          onClick={props.onClearCache}
                          className="w-full rounded-sm px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        >
                          clear cache
                        </button>
                      </PopoverClose>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            {props.displayTools ? <div className="shrink-0">{props.displayTools}</div> : null}
          </div>
        </div>
      </div>
    </>
  )
}

