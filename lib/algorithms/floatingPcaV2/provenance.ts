import type { PCAAllocation, SlotAssignmentLog } from '@/types/schedule'
import type { Team } from '@/types/staff'
import { getSlotTeam } from '@/lib/utils/floatingPCAHelpers'

export type Step3FloatingSelectionSeed = {
  team: Team
  slot: number
  pcaId: string
}

function isTrackedSlot(value: number): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function getCoveragePriority(kind: NonNullable<SlotAssignmentLog['upstreamCoverageKind']>): number {
  if (kind === 'special-program') return 0
  if (kind === 'substitution-like') return 1
  return 2
}

export function buildStep3FloatingSelectionKey(selection: Step3FloatingSelectionSeed): string {
  return `${selection.team}:${selection.slot}:${selection.pcaId}`
}

export function buildUpstreamCoverageKindByTeamSlot(args: {
  existingAllocations: PCAAllocation[]
  floatingPcaIds?: Set<string>
  excludeStep3OwnedSelections?: Step3FloatingSelectionSeed[]
}): Map<string, NonNullable<SlotAssignmentLog['upstreamCoverageKind']>> {
  const excludeKeys = new Set(
    (args.excludeStep3OwnedSelections ?? []).map((selection) => buildStep3FloatingSelectionKey(selection))
  )
  const coverageByTeamSlot = new Map<string, NonNullable<SlotAssignmentLog['upstreamCoverageKind']>>()

  for (const allocation of args.existingAllocations) {
    for (const slot of [1, 2, 3, 4] as const) {
      const team = getSlotTeam(allocation, slot)
      if (!team || !isTrackedSlot(slot)) continue
      if (excludeKeys.has(buildStep3FloatingSelectionKey({ team, slot, pcaId: allocation.staff_id }))) {
        continue
      }

      const nextKind: NonNullable<SlotAssignmentLog['upstreamCoverageKind']> =
        allocation.special_program_ids?.length
          ? 'special-program'
          : args.floatingPcaIds?.has(allocation.staff_id)
            ? 'substitution-like'
            : 'non-floating'

      const teamSlotKey = `${team}:${slot}`
      const currentKind = coverageByTeamSlot.get(teamSlotKey)
      if (!currentKind || getCoveragePriority(nextKind) < getCoveragePriority(currentKind)) {
        coverageByTeamSlot.set(teamSlotKey, nextKind)
      }
    }
  }

  return coverageByTeamSlot
}
