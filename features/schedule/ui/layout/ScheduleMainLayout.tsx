'use client'

import type { ReactNode } from 'react'

export function ScheduleMainLayout(props: {
  children: ReactNode
}) {
  return (
    <div data-tour="step3-interactions" className="relative flex gap-4 min-w-0">{props.children}</div>
  )
}

