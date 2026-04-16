'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { RBIP_APP_MIN_WIDTH_CLASS } from '@/lib/layoutWidth'

export type ScheduleMainBoardChromeProps = {
  isSplitMode: boolean
  children: ReactNode
}

/**
 * Primary schedule workspace chrome (padding, min-width, split-mode viewport height).
 * Phase 2c — layout shell under `ui/sections/`; board bodies remain in `SchedulePageClient` / allocation components.
 */
export function ScheduleMainBoardChrome({ isSplitMode, children }: ScheduleMainBoardChromeProps) {
  return (
    <div
      className={cn(
        'w-full px-8 py-4 bg-background',
        RBIP_APP_MIN_WIDTH_CLASS,
        // In split mode, behave like a full-viewport workspace (Arena/NotebookLM style):
        // panes scroll independently; the page itself shouldn't require scrolling to reach pane B.
        isSplitMode && 'h-[calc(100vh-64px)] flex flex-col min-h-0 overflow-hidden'
      )}
    >
      {children}
    </div>
  )
}
