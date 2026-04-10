import {
  allocateFloatingPCA_v2RankedSlot,
  type FloatingPCAAllocationResultV2,
  type PCAData,
} from '@/lib/algorithms/pcaAllocation'
import {
  buildUpstreamCoverageKindByTeamSlot,
  finalizeTrackerSummary,
  getTeamPreferenceInfo,
  isFloorPCAForTeam,
  recordAssignment,
} from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { executeSlotAssignments, type SlotAssignment } from '@/lib/utils/reservationLogic'
import type { PCAPreference, SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Team } from '@/types/staff'

type ManualAssignmentSource = 'step32' | 'step33'

interface RunStep3V2CommittedSelectionsArgs {
  teamOrder: Team[]
  currentPendingFTE: Record<Team, number>
  existingAllocations: PCAAllocation[]
  floatingPCAs: PCAData[]
  pcaPreferences: PCAPreference[]
  specialPrograms: SpecialProgram[]
  step32Assignments: SlotAssignment[]
  step33Assignments: SlotAssignment[]
  mode?: 'standard' | 'balanced'
  extraCoverageMode?: 'none' | 'round-robin-team-order'
  preferenceSelectionMode?: 'legacy' | 'selected_only'
}

function appendCommittedAssignmentsToTracker(args: {
  result: FloatingPCAAllocationResultV2
  teamOrder: Team[]
  executedAssignments: Array<SlotAssignment & { source: ManualAssignmentSource }>
  floatingPCAs: PCAData[]
  pcaPreferences: PCAPreference[]
  existingAllocations: PCAAllocation[]
}): void {
  const { result, teamOrder, executedAssignments, floatingPCAs, pcaPreferences, existingAllocations } = args
  const allocationOrderMap = new Map<Team, number>()
  teamOrder.forEach((team, index) => allocationOrderMap.set(team, index + 1))

  const pcaById = new Map(floatingPCAs.map((pca) => [pca.id, pca]))
  const floatingPcaIds = new Set(floatingPCAs.map((pca) => pca.id))
  const upstreamCoverageByTeamSlot = buildUpstreamCoverageKindByTeamSlot({
    existingAllocations,
    floatingPcaIds,
  })
  const step3OwnedCountsByTeamSlot = new Map<string, number>()

  for (const team of teamOrder) {
    for (const assignment of result.tracker[team].assignments) {
      if (assignment.assignedIn !== 'step34') continue
      const slotKey = `${team}:${assignment.slot}`
      step3OwnedCountsByTeamSlot.set(slotKey, (step3OwnedCountsByTeamSlot.get(slotKey) ?? 0) + 1)
    }
  }
  for (const assignment of executedAssignments) {
    const slotKey = `${assignment.team}:${assignment.slot}`
    step3OwnedCountsByTeamSlot.set(slotKey, (step3OwnedCountsByTeamSlot.get(slotKey) ?? 0) + 1)
  }

  for (const assignment of executedAssignments) {
    const pref = getTeamPreferenceInfo(assignment.team, pcaPreferences)
    const pca = pcaById.get(assignment.pcaId)
    const rankIndex = pref.rankedSlots.indexOf(assignment.slot as 1 | 2 | 3 | 4)
    const isPreferredPca = pref.preferredPCAIds.includes(assignment.pcaId)
    const isFloorPca = pca ? isFloorPCAForTeam(pca, pref.teamFloor) : undefined
    const isGymLastResort = pref.avoidGym && pref.gymSlot === assignment.slot
    const slotKey = `${assignment.team}:${assignment.slot}`
    const upstreamCoverageKind = upstreamCoverageByTeamSlot.get(slotKey) ?? null
    const trueDuplicateFloating = (step3OwnedCountsByTeamSlot.get(slotKey) ?? 0) > 1

    recordAssignment(result.tracker as any, assignment.team, {
      slot: assignment.slot,
      pcaId: assignment.pcaId,
      pcaName: assignment.pcaName,
      assignedIn: assignment.source,
      step3OwnershipKind: 'step3-floating',
      upstreamCoverageKind,
      wasPreferredSlot: assignment.slot === (pref.preferredSlot ?? -1),
      wasPreferredPCA: isPreferredPca,
      wasFloorPCA: isFloorPca,
      gymSlotAvoided: pref.gymSlot != null ? assignment.slot !== pref.gymSlot : undefined,
      fulfilledSlotRank: rankIndex >= 0 ? rankIndex + 1 : null,
      slotSelectionPhase: isGymLastResort
        ? 'gym-last-resort'
        : rankIndex >= 0
          ? 'ranked-unused'
          : 'unranked-unused',
      pcaSelectionTier: isPreferredPca ? 'preferred' : isFloorPca ? 'floor' : 'non-floor',
      usedContinuity: false,
      duplicateSlot: trueDuplicateFloating,
      allocationOrder: allocationOrderMap.get(assignment.team),
    } as any)
  }

  finalizeTrackerSummary(result.tracker as any)
}

export async function runStep3V2CommittedSelections(
  args: RunStep3V2CommittedSelectionsArgs
): Promise<FloatingPCAAllocationResultV2> {
  let pendingFTE = { ...args.currentPendingFTE }
  let allocations = args.existingAllocations.map((allocation) => ({ ...allocation }))

  const committedAssignments: Array<SlotAssignment & { source: ManualAssignmentSource }> = []

  const step32Result = executeSlotAssignments(
    args.step32Assignments,
    pendingFTE,
    allocations,
    args.floatingPCAs
  )
  pendingFTE = step32Result.updatedPendingFTE
  allocations = step32Result.updatedAllocations
  committedAssignments.push(
    ...step32Result.executedAssignments.map((assignment) => ({ ...assignment, source: 'step32' as const }))
  )

  const step33Result = executeSlotAssignments(
    args.step33Assignments,
    pendingFTE,
    allocations,
    args.floatingPCAs
  )
  pendingFTE = step33Result.updatedPendingFTE
  allocations = step33Result.updatedAllocations
  committedAssignments.push(
    ...step33Result.executedAssignments.map((assignment) => ({ ...assignment, source: 'step33' as const }))
  )

  const preStep34RoundedPendingByTeam = Object.fromEntries(
    args.teamOrder.map((team) => [team, roundToNearestQuarterWithMidpoint(pendingFTE[team] || 0)])
  ) as Record<Team, number>

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder: args.teamOrder,
    currentPendingFTE: pendingFTE,
    existingAllocations: allocations,
    pcaPool: args.floatingPCAs,
    pcaPreferences: args.pcaPreferences,
    specialPrograms: args.specialPrograms,
    mode: args.mode ?? 'standard',
    extraCoverageMode: args.extraCoverageMode ?? 'none',
    preferenceSelectionMode: args.preferenceSelectionMode ?? 'selected_only',
    selectedPreferenceAssignments: committedAssignments.map((assignment) => ({
      team: assignment.team,
      slot: assignment.slot,
      pcaId: assignment.pcaId,
      source: assignment.source,
    })),
  })

  appendCommittedAssignmentsToTracker({
    result,
    teamOrder: args.teamOrder,
    executedAssignments: committedAssignments,
    floatingPCAs: args.floatingPCAs,
    pcaPreferences: args.pcaPreferences,
    existingAllocations: args.existingAllocations,
  })

  for (const team of args.teamOrder) {
    result.tracker[team].summary.preStep34RoundedPendingFte = preStep34RoundedPendingByTeam[team]
  }

  return result
}
