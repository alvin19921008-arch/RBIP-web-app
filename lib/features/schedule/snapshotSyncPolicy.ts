import type { ScheduleStepId } from '@/types/schedule'
import { hasMeaningfulStep1Overrides } from '@/lib/utils/staffOverridesMeaningful'

export type SnapshotDirtyReason =
  | 'step1Overrides'
  | 'therapistAllocations'
  | 'pcaAllocations'
  | 'bedAllocations'
  | 'workflowProgress'

export type SnapshotSyncDisposition =
  | 'current'
  | 'past-frozen'
  | 'auto-sync-clean-current-or-future'
  | 'dirty-review-required'

export function collectSnapshotDirtyReasons(args: {
  staffOverrides: unknown
  hasTherapistAllocations: boolean
  hasPCAAllocations: boolean
  hasBedAllocations: boolean
  workflowCompletedSteps: readonly ScheduleStepId[] | readonly string[] | null | undefined
}): SnapshotDirtyReason[] {
  const reasons: SnapshotDirtyReason[] = []

  if (hasMeaningfulStep1Overrides(args.staffOverrides)) reasons.push('step1Overrides')
  if (args.hasTherapistAllocations) reasons.push('therapistAllocations')
  if (args.hasPCAAllocations) reasons.push('pcaAllocations')
  if (args.hasBedAllocations) reasons.push('bedAllocations')
  if ((args.workflowCompletedSteps?.length ?? 0) > 0) reasons.push('workflowProgress')

  return reasons
}

export function classifySnapshotSyncDisposition(args: {
  scheduleDateKey: string
  todayKey: string
  hasDrift: boolean
  dirtyReasons: readonly SnapshotDirtyReason[]
}): SnapshotSyncDisposition {
  if (!args.hasDrift) return 'current'
  if (args.scheduleDateKey < args.todayKey) return 'past-frozen'
  if (args.dirtyReasons.length > 0) return 'dirty-review-required'
  return 'auto-sync-clean-current-or-future'
}

export function shouldFetchSnapshotSemanticDiff(args: {
  scheduleDateKey: string
  todayKey: string
  dirtyReasons: readonly SnapshotDirtyReason[]
  maybeHasVersionDrift: boolean
}): boolean {
  if (args.scheduleDateKey < args.todayKey) return false
  if (args.dirtyReasons.length > 0) return args.maybeHasVersionDrift
  return true
}
