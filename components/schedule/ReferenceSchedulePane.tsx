'use client'

import * as React from 'react'
import { Calendar, Columns2, Rows2, PanelRightClose, PanelRightOpen, PanelBottomClose, PanelBottomOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { ScheduleCalendarPopover } from '@/components/schedule/ScheduleCalendarPopover'
import { cn } from '@/lib/utils'
import { TEAMS } from '@/lib/features/schedule/constants'

export function ReferenceSchedulePane(props: {
  direction: 'col' | 'row'
  refHidden: boolean
  refDateLabel: string
  selectedDate: Date
  datesWithData: Set<string>
  holidays: Map<string, string>
  onSelectDate: (d: Date) => void
  onToggleDirection: () => void
  onRetract: () => void
  onExpand?: () => void
  collapsed?: boolean
  disableBlur?: boolean
  showTeamHeader?: boolean
  children?: React.ReactNode
}) {
  const {
    direction,
    refHidden,
    refDateLabel,
    selectedDate,
    datesWithData,
    holidays,
    onSelectDate,
    onToggleDirection,
    onRetract,
    onExpand,
    collapsed,
    disableBlur = false,
    showTeamHeader = false,
    children,
  } = props

  const [calendarOpen, setCalendarOpen] = React.useState(false)
  const calendarButtonRef = React.useRef<HTMLButtonElement | null>(null)

  if (collapsed) {
    // If direction is 'col' (Side-by-Side), the retracted strip is on the RIGHT (vertical).
    // If direction is 'row' (Top-Bottom), the retracted strip is at the BOTTOM (horizontal).
    
    // Note: based on SplitPane usage:
    // direction='col' -> Side-by-Side (grid-cols-[auto_auto_1fr]). Ref is Pane B (Right).
    // direction='row' -> Top-Bottom (grid-rows-[auto_auto_1fr]). Ref is Pane B (Bottom).

    const isSideBySide = direction === 'col'

    return (
      <div
        className={cn(
          'h-full bg-background flex items-center justify-start relative overflow-hidden',
          isSideBySide
            ? 'w-[56px] flex-col py-2 border-l border-border'
            : 'h-[44px] flex-row px-2 border-t border-border w-full'
        )}
      >
        <Tooltip side={isSideBySide ? 'left' : 'top'} content="Show reference">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExpand}
            className={cn('shrink-0', isSideBySide ? 'h-8 w-8 p-0' : 'h-8 px-2')}
          >
            {isSideBySide ? <PanelRightOpen className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}
            {!isSideBySide ? <span className="ml-2 text-xs">Reference</span> : null}
          </Button>
        </Tooltip>

        {isSideBySide ? (
          // Vertical "Reference" label (rotated 90°) like the mock.
          // Use absolute positioning so it never affects layout / overflows horizontally.
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="select-none whitespace-nowrap text-sm font-semibold text-amber-700/90 dark:text-amber-400/90 -rotate-90">
              Reference
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const isSideBySide = direction === 'col'

  return (
    <div className="min-h-0 h-full flex flex-col bg-amber-50/30 dark:bg-amber-950/10">
      <div
        className={cn(
          'sticky top-0 z-30 bg-background/95 border-b border-border bg-amber-50/50 dark:bg-amber-950/20',
          !disableBlur && 'backdrop-blur'
        )}
      >
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Reference (Read-only)</div>
            <div className="text-xs text-muted-foreground truncate">Date: {refDateLabel}</div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Tooltip side="bottom" content="Pick reference date">
              <Button
                ref={calendarButtonRef as any}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCalendarOpen((v) => !v)}
                className="h-8 px-2"
              >
                <Calendar className="h-4 w-4" />
              </Button>
            </Tooltip>

            <Tooltip side="bottom" content={isSideBySide ? 'Switch to top-bottom split' : 'Switch to side-by-side split'}>
              <Button type="button" variant="outline" size="sm" onClick={onToggleDirection} className="h-8 px-2">
                {isSideBySide ? <Rows2 className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}
              </Button>
            </Tooltip>

            <Tooltip side="bottom" content="Retract reference pane">
              <Button type="button" variant="outline" size="sm" onClick={onRetract} className="h-8 px-2">
                {isSideBySide ? <PanelRightClose className="h-4 w-4" /> : <PanelBottomClose className="h-4 w-4" />}
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'overflow-auto flex-1',
          showTeamHeader ? 'px-3 pb-6 pt-0' : 'p-3 pb-6'
        )}
      >
        {showTeamHeader ? (
          <div
            className={cn(
              'sticky top-0 z-20 bg-background/95 border-b border-border',
              !disableBlur && 'backdrop-blur'
            )}
          >
            <div className="grid grid-cols-8 gap-2 py-2 min-w-[960px]">
              {TEAMS.map((team) => (
                <h2 key={`ref-header-${team}`} className="text-lg font-bold text-center">
                  {team}
                </h2>
              ))}
            </div>
          </div>
        ) : null}

        {children}
      </div>

      <ScheduleCalendarPopover
        open={calendarOpen}
        selectedDate={selectedDate}
        datesWithData={datesWithData}
        holidays={holidays}
        onClose={() => setCalendarOpen(false)}
        onDateSelect={(d) => {
          setCalendarOpen(false)
          onSelectDate(d)
        }}
        anchorRef={calendarButtonRef}
      />
    </div>
  )
}

