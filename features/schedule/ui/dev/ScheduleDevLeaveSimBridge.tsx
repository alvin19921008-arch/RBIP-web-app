'use client'

import dynamic from 'next/dynamic'
import type { DevLeaveSimPanelProps } from '@/features/schedule/ui/dev/DevLeaveSimPanel'

const DevLeaveSimPanelLazy = dynamic(
  () => import('@/features/schedule/ui/dev/DevLeaveSimPanel').then((m) => m.DevLeaveSimPanel),
  { ssr: false }
)

/** Developer Leave Sim entry: dynamic-loads `DevLeaveSimPanel` only when open (Phase 2a bridge). */
export function ScheduleDevLeaveSimBridge(props: DevLeaveSimPanelProps) {
  if (props.userRole !== 'developer' || !props.open) return null
  return <DevLeaveSimPanelLazy {...props} />
}
