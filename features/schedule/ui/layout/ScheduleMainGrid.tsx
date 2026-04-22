'use client'

import type { ReactNode } from 'react'

import { ScheduleMainLayout } from '@/features/schedule/ui/layout/ScheduleMainLayout'

/**
 * Main schedule two-pane shell: summary + staff column, and the scrollable team grid.
 * Intentionally props-only: column bodies stay composed by the parent to avoid a huge prop surface
 * (see schedule decomposition spec — Phase 8 / §9.2).
 */
export interface ScheduleMainGridProps {
  rightContentHeight: number | undefined
  leftColumn: ReactNode
  rightColumn: ReactNode
}

export function ScheduleMainGrid(props: ScheduleMainGridProps) {
  return (
    <ScheduleMainLayout>
      <div
        className="shrink-0 flex flex-col gap-4 self-start min-h-0"
        style={typeof props.rightContentHeight === 'number' && props.rightContentHeight > 0 ? { height: props.rightContentHeight } : undefined}
      >
        {props.leftColumn}
      </div>
      {props.rightColumn}
    </ScheduleMainLayout>
  )
}
