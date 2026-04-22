'use client'

import type { FC, ReactNode, Dispatch, SetStateAction } from 'react'
import dynamic from 'next/dynamic'

import { SplitPane } from '@/components/ui/SplitPane'
import { cn } from '@/lib/utils'
import { formatDateDDMMYYYY } from '@/lib/features/schedule/date'

const ReferenceSchedulePane = dynamic(
  () => import('@/features/schedule/ui/panes/ReferenceSchedulePane').then((m) => m.ReferenceSchedulePane),
  { ssr: false }
)

export interface ScheduleSplitLayoutProps {
  MaybeProfiler: FC<{ id: string; children: ReactNode }>
  showReference: boolean
  isRefHidden: boolean
  onToggleRefHidden: () => void
  splitDirection: 'row' | 'col'
  splitRatio: number
  isSplitSwapped: boolean
  onSplitSwap: () => void
  onSplitRatioCommit: (ratio: number) => void
  setRefPortalHost: Dispatch<SetStateAction<HTMLDivElement | null>>
  /** Reference date shown when the ref pane is collapsed. */
  referenceDateForPane: Date
  datesWithData: Set<string>
  holidays: Map<string, string>
  onRevealReferencePane: () => void
  isSplitMode: boolean
  mainHeader: ReactNode
  splitHeaderBar: ReactNode
  mainLayout: ReactNode
  splitReferenceLayer: ReactNode
}

/**
 * Split-mode chrome: ref-hidden path, or SplitPane with main vs reference host + `splitReferenceLayer` portal.
 */
export function ScheduleSplitLayout(props: ScheduleSplitLayoutProps) {
  const {
    MaybeProfiler,
    showReference,
    isRefHidden,
    onToggleRefHidden,
    splitDirection,
    splitRatio,
    isSplitSwapped,
    onSplitSwap,
    onSplitRatioCommit,
    setRefPortalHost,
    referenceDateForPane,
    datesWithData,
    holidays,
    onRevealReferencePane,
    isSplitMode,
    mainHeader,
    splitHeaderBar,
    mainLayout,
    splitReferenceLayer,
  } = props

  if (!showReference) {
    const refCollapsedDateLabel = formatDateDDMMYYYY(referenceDateForPane)
    return (
      <>
        <div
          className={cn('h-full min-h-0 flex overflow-hidden', splitDirection === 'col' ? 'flex-row' : 'flex-col')}
        >
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {/* Fixed header for Main Pane in retracted mode */}
            {mainHeader}

            <div className="flex-1 min-w-0 min-h-0 overflow-auto">
              <div className="inline-block min-w-full align-top">
                {splitHeaderBar}
                {mainLayout}
              </div>
            </div>
          </div>
          <ReferenceSchedulePane
            collapsed={true}
            direction={splitDirection}
            refHidden={true}
            disableBlur={isSplitMode}
            showTeamHeader={false}
            refDateLabel={refCollapsedDateLabel}
            selectedDate={referenceDateForPane}
            datesWithData={datesWithData}
            holidays={holidays}
            onSelectDate={() => {}}
            onToggleDirection={() => {}}
            onRetract={() => {}}
            onExpand={onRevealReferencePane}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <MaybeProfiler id="SplitPane">
        <div className="flex-1 min-h-0">
          <SplitPane
            direction={splitDirection}
            ratio={splitRatio}
            swapped={isSplitSwapped}
            liveResize={false}
            paneOverflow="hidden"
            dividerOverlay={
              <div
                className={cn(
                  'group/pill rounded-full border border-border bg-background/95 shadow-sm',
                  'overflow-hidden transition-[max-width] duration-150 ease-out',
                  // Retracted by default; expands only when hovering the pill itself.
                  'max-w-9 hover:max-w-[220px]'
                )}
                aria-label="Split controls"
                title="Split controls"
              >
                <div className="flex items-center gap-1 px-1 py-1">
                  {/* Retracted indicator */}
                  <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground group-hover/pill:hidden select-none">
                    ⋯
                  </div>

                  {/* Expanded controls */}
                  <div className="hidden group-hover/pill:flex items-center gap-1">
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-full transition-colors"
                      onClick={onSplitSwap}
                      aria-label="Swap panes"
                      title="Swap panes"
                    >
                      Swap
                    </button>
                    <div className="h-4 w-px bg-border" aria-hidden />
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-full transition-colors"
                      onClick={onToggleRefHidden}
                      aria-label={isRefHidden ? 'Show reference pane' : 'Hide reference pane'}
                      title={isRefHidden ? 'Show reference pane' : 'Hide reference pane'}
                    >
                      {isRefHidden ? 'Show ref' : 'Hide ref'}
                    </button>
                  </div>
                </div>
              </div>
            }
            onRatioCommit={onSplitRatioCommit}
            minPx={splitDirection === 'row' ? 240 : 420}
            // Explicit height is required for top-down (row) mode percentage tracks.
            // Outer split wrapper is `h-[calc(100vh-64px)]` with `py-4` (2rem total), so match its content box.
            className="min-h-0 w-full h-[calc(100vh-64px-2rem)]"
            paneAClassName="bg-blue-50/20 dark:bg-blue-950/10"
            paneBClassName="bg-amber-50/20 dark:bg-amber-950/10"
            paneA={
              <MaybeProfiler id="SplitMainPane">
                <div className="h-full min-h-0 flex flex-col">
                  {/* Fixed header for Main Pane */}
                  {mainHeader}

                  {/* Scrollable Main content (includes schedule header bar + full layout) */}
                  <div className="flex-1 min-w-0 min-h-0 overflow-auto">
                    <div className="inline-block min-w-full align-top">
                      {splitHeaderBar}
                      {mainLayout}
                    </div>
                  </div>
                </div>
              </MaybeProfiler>
            }
            paneB={<div ref={setRefPortalHost} className="h-full min-h-0" />}
          />
        </div>
      </MaybeProfiler>
      {splitReferenceLayer}
    </>
  )
}
