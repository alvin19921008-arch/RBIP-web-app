'use client'

import type { ReactNode } from 'react'

export function ScheduleMainLayout(props: {
  children: ReactNode
}) {
  return (
    <div className="relative flex gap-4 min-w-0">{props.children}</div>
  )
}

