import { unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import type { BaselineSnapshot, BaselineSnapshotStored, ScheduleCalculations } from '@/types/schedule'
import type { Team } from '@/types/staff'

export function resolveBaselineSnapshotForCache(args: {
  hasBaselineSnapshot: boolean
  rawBaselineSnapshotStored: BaselineSnapshotStored | null | undefined
  validatedBaselineSnapshot: BaselineSnapshot | null
}): BaselineSnapshot | null {
  if (!args.hasBaselineSnapshot) return null
  if (args.validatedBaselineSnapshot) return args.validatedBaselineSnapshot
  if (!args.rawBaselineSnapshotStored) return null

  try {
    return unwrapBaselineSnapshotStored(args.rawBaselineSnapshotStored).data
  } catch {
    return null
  }
}

export function getStoredCalculationsFromBaselineSnapshot(
  baselineSnapshot: BaselineSnapshot | null
): Record<Team, ScheduleCalculations | null> | null {
  const fromSnapshot = baselineSnapshot?.calculatedValues?.calculations
  return fromSnapshot && typeof fromSnapshot === 'object' ? (fromSnapshot as Record<Team, ScheduleCalculations | null>) : null
}
