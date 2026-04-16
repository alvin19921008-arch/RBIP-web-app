'use client'

import dynamic from 'next/dynamic'
import type { DevLeaveSimPanelProps } from '@/components/schedule/DevLeaveSimPanel'

const DevLeaveSimPanelLazy = dynamic(
  () => import('@/components/schedule/DevLeaveSimPanel').then((m) => m.DevLeaveSimPanel),
  { ssr: false }
)

/** Developer Leave Sim entry: dynamic-loads `DevLeaveSimPanel` only when open (Phase 2a bridge). */
export function ScheduleDevLeaveSimBridge(props: DevLeaveSimPanelProps) {
  if (props.userRole !== 'developer' || !props.open) return null
  return <DevLeaveSimPanelLazy {...props} />
}
