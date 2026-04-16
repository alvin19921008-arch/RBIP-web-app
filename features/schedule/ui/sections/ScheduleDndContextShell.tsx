'use client'

import { DndContext } from '@dnd-kit/core'
import type { ComponentProps, ReactNode } from 'react'

type DndPick = Pick<
  ComponentProps<typeof DndContext>,
  'sensors' | 'onDragStart' | 'onDragMove' | 'onDragEnd'
>

export type ScheduleDndContextShellProps = DndPick & {
  children: ReactNode
}

/** `@dnd-kit` root for the schedule page — keeps DnD wiring in `ui/sections/` (Phase 2c). */
export function ScheduleDndContextShell({
  sensors,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
}: ScheduleDndContextShellProps) {
  return (
    <DndContext sensors={sensors} autoScroll={false} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  )
}
