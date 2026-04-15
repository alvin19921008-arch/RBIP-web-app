import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import {
  detectRankedV2GymAvoidableDefects,
  detectRankedV2RepairDefects,
} from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateOptionalPromotionCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * Constraint 6f: after Part III clears an avoidable gym story, optional promotion must not accept
 * a repair-valid candidate that would re-raise `G1`. We assert every promotion candidate that
 * passes required-repair audit also passes `detectRankedV2GymAvoidableDefects` on the post-gym
 * snapshot, and the full allocator ends with no gym-avoidable defects.
 */

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

function defaultPreference(team: Team): PCAPreference {
  return {
    id: `pref-${team}`,
    team,
    preferred_pca_ids: [],
    preferred_slots: [1, 2],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
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

async function main() {
  const teamOrder: Team[] = [...TEAMS]
  const currentPendingFTE = { ...emptyTeamRecord(0), FO: 0.5 }

  const existingAllocations: PCAAllocation[] = [
    {
      id: 'alloc-float-a',
      schedule_id: '',
      staff_id: 'float-a',
      team: 'FO',
      fte_pca: 1,
      fte_remaining: 0.5,
      slot_assigned: 0.5,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]

  const pcaPreferences: PCAPreference[] = TEAMS.map((team) =>
    team === 'FO'
      ? {
          id: 'pref-fo',
          team: 'FO',
          preferred_pca_ids: [],
          preferred_slots: [1, 2],
          gym_schedule: 4,
          avoid_gym_schedule: true,
          floor_pca_selection: 'upper',
        }
      : defaultPreference(team)
  )

  const teamPrefs = TEAMS.reduce(
    (acc, team) => {
      acc[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return acc
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  const pcaPool = [makePca('float-a', [1, 2, 3, 4])]

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  const baselineAssignedSlots = countAssignedSlotsByTeam(existingAllocations)
  const pendingAfter = computePendingLikeAllocator(
    currentPendingFTE,
    baselineAssignedSlots,
    result.allocations
  )

  const gymCtx = {
    teamOrder,
    initialPendingFTE: currentPendingFTE,
    pendingFTE: pendingAfter,
    allocations: result.allocations.map((row) => ({ ...row })),
    pcaPool,
    teamPrefs,
    baselineAllocations: existingAllocations,
  }

  assert.deepEqual(detectRankedV2GymAvoidableDefects(gymCtx), [])
  assert.deepEqual(detectRankedV2RepairDefects(gymCtx), [])

  const promotionCandidates = generateOptionalPromotionCandidates({
    teamOrder,
    initialPendingFTE: currentPendingFTE,
    pendingFTE: pendingAfter,
    allocations: gymCtx.allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: existingAllocations,
  })

  for (const candidate of promotionCandidates) {
    const candPending = computePendingLikeAllocator(
      currentPendingFTE,
      baselineAssignedSlots,
      candidate.allocations
    )
    const repairOk =
      detectRankedV2RepairDefects({
        teamOrder,
        initialPendingFTE: currentPendingFTE,
        pendingFTE: candPending,
        allocations: candidate.allocations,
        pcaPool,
        teamPrefs,
        baselineAllocations: existingAllocations,
      }).length === 0
    if (!repairOk) continue

    assert.deepEqual(
      detectRankedV2GymAvoidableDefects({
        teamOrder,
        initialPendingFTE: currentPendingFTE,
        pendingFTE: candPending,
        allocations: candidate.allocations,
        pcaPool,
        teamPrefs,
        baselineAllocations: existingAllocations,
      }),
      [],
      `Promotion candidate ${candidate.sortKey} is repair-clean and must not reintroduce G1 (Constraint 6f).`
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
