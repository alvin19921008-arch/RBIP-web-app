import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Team } from '@/types/staff'
import { executeSlotAssignments, type SlotAssignment } from '@/lib/utils/reservationLogic'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'

/**
 * In-memory Step 3.2 scratch apply for previews: clone allocations + pending, execute only Step 3.2 rows.
 * Used by Step 3.3 adjacent preview so remaining pending + occupancy match committed Step 3.2 picks.
 */
export function buildStep3V2ScratchAfterStep32(args: {
  adjustedPendingFTE: Record<Team, number>
  existingAllocations: PCAAllocation[]
  floatingPCAs: PCAData[]
  step32Assignments: SlotAssignment[]
}): {
  scratchAllocations: PCAAllocation[]
  pendingAfter32: Record<Team, number>
} {
  const pendingClone = { ...args.adjustedPendingFTE } as Record<Team, number>
  const result = executeSlotAssignments(
    args.step32Assignments,
    pendingClone,
    args.existingAllocations.map((allocation) => ({ ...allocation })),
    args.floatingPCAs
  )
  return {
    scratchAllocations: result.updatedAllocations,
    pendingAfter32: result.updatedPendingFTE,
  }
}

export function buildStep32ScratchAssignmentsFromCommittedByTeam(args: {
  teamOrder: Team[]
  step32CommittedAssignmentsByTeam: Partial<Record<Team, SlotAssignment | null>>
}): SlotAssignment[] {
  return args.teamOrder.flatMap((team) => {
    const assignment = args.step32CommittedAssignmentsByTeam[team]
    if (!assignment) return []
    return [assignment]
  })
}

export function buildReplaceEligibleTeamsFromScratchAssignments(
  step32ScratchAssignments: SlotAssignment[]
): ReadonlySet<Team> {
  return new Set(step32ScratchAssignments.map((assignment) => assignment.team))
}

/** True when Step 3.3 "use" should omit the Step 3.2 save row (replace path, one net slot). */
export function shouldOmitStep32ForStep33ReplaceSave(args: {
  step33Decision: 'use' | 'skip' | undefined
  pendingAfter32Rounded: number
}): boolean {
  return args.step33Decision === 'use' && args.pendingAfter32Rounded < 0.25
}

/** Assigned floating from Steps 3.2–3.3 for UI while replace semantics are in play (avoids double-counting). */
export function computeStep33AssignedFloating3233Preview(args: {
  committedStep32: SlotAssignment | null | undefined
  step33Decision: 'use' | 'skip' | undefined
  pendingAfter32Rounded: number
}): number {
  const has32 = args.committedStep32 != null
  const use33 = args.step33Decision === 'use'
  if (!has32 && !use33) return 0
  if (use33 && has32 && args.pendingAfter32Rounded < 0.25) {
    return roundToNearestQuarterWithMidpoint(0.25)
  }
  let slots = 0
  if (has32) slots += 1
  if (use33) slots += 1
  return roundToNearestQuarterWithMidpoint(slots * 0.25)
}
