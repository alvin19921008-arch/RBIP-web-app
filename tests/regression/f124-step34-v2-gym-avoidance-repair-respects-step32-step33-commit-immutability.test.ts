import assert from 'node:assert/strict'

import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2GymAvoidableDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { runGymAvoidanceRepairLoop, type Step3CommittedFloatingAnchor } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return {
    FO: value,
    SMM: value,
    SFM: value,
    CPPC: value,
    MC: value,
    GMC: value,
    NSM: value,
    DRO: value,
  }
}

function makePca(id: string, slots: number[]): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots: slots,
    floor_pca: ['upper'],
  } as PCAData
}

function makeAllocation(
  staffId: string,
  slots: Partial<Record<'slot1' | 'slot2' | 'slot3' | 'slot4', Team | null>>
): PCAAllocation {
  return {
    id: `alloc-${staffId}`,
    schedule_id: '',
    staff_id: staffId,
    team: 'FO',
    fte_pca: 1,
    fte_remaining: 0.5,
    slot_assigned: 0.5,
    slot_whole: null,
    slot1: slots.slot1 ?? null,
    slot2: slots.slot2 ?? null,
    slot3: slots.slot3 ?? null,
    slot4: slots.slot4 ?? null,
    leave_type: null,
    special_program_ids: null,
  }
}

function countAssignedSlotsByTeam(allocations: PCAAllocation[]): Record<Team, number> {
  const counts = { ...emptyTeamRecord(0) }
  for (const allocation of allocations) {
    if (allocation.slot1) counts[allocation.slot1] += 1
    if (allocation.slot2) counts[allocation.slot2] += 1
    if (allocation.slot3) counts[allocation.slot3] += 1
    if (allocation.slot4) counts[allocation.slot4] += 1
  }
  return counts
}

function computePendingLikeAllocator(
  initialPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>,
  allocations: PCAAllocation[]
): Record<Team, number> {
  const finalAssignedCounts = countAssignedSlotsByTeam(allocations)
  const next = { ...emptyTeamRecord(0) }
  for (const team of TEAMS) {
    const pendingSlotsAtStep34Start = Math.round(((initialPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const newlyCoveredSlots = finalAssignedCounts[team] - baselineAssignedSlots[team]
    const remainingSlots = Math.max(0, pendingSlotsAtStep34Start - newlyCoveredSlots)
    next[team] = remainingSlots * 0.25
  }
  return next
}

function main() {
  const teamOrder: Team[] = [...TEAMS]
  const initialPendingFTE = { ...emptyTeamRecord(0) }
  initialPendingFTE.FO = 0.5

  const baselineAllocations: PCAAllocation[] = [
    makeAllocation('float-a', { slot1: null, slot2: null, slot3: null, slot4: null }),
  ]
  const baselineAssignedSlots = countAssignedSlotsByTeam(baselineAllocations)

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [1, 2],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const teamPrefs = TEAMS.reduce(
    (acc, team) => {
      acc[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return acc
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  const pcaPool = [makePca('float-a', [1, 2, 3, 4])]
  const allocations = [
    makeAllocation('float-a', {
      slot1: 'FO',
      slot2: null,
      slot3: null,
      slot4: 'FO',
    }),
  ]
  const pendingFTE = computePendingLikeAllocator(initialPendingFTE, baselineAssignedSlots, allocations)

  const committedStep3Anchors: Step3CommittedFloatingAnchor[] = [
    { team: 'FO', slot: 1, pcaId: 'float-a' },
  ]

  const gymCtx = {
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
    committedStep3Anchors,
  }
  assert.deepEqual(detectRankedV2GymAvoidableDefects(gymCtx), [{ kind: 'G1', team: 'FO' }])

  const slot1OwnerBefore = allocations[0].slot1

  runGymAvoidanceRepairLoop({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
    baselineAssignedSlots,
    committedStep3Anchors,
  })

  assert.equal(
    allocations[0].slot1,
    slot1OwnerBefore,
    'Step 3.2 / 3.3 committed slot 1 assignment must not change.'
  )
  assert.equal(allocations[0].slot1, 'FO', 'Step 3.2 anchor on slot 1 must remain FO for the same PCA.')
  assert.equal(allocations[0].slot4, null, 'Gym slot should be cleared after repair.')
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
