import assert from 'node:assert/strict'

import {
  allocateFloatingPCA_v1LegacyPreference,
  allocateFloatingPCA_v2RankedSlot,
  type PCAData,
} from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
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

function makePca(id: string, slots: number[], floor?: 'upper' | 'lower'): PCAData {
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
    floor_pca: floor ? [floor] : undefined,
  } as PCAData
}

function countTeamPcasUsed(result: Awaited<ReturnType<typeof allocateFloatingPCA_v1LegacyPreference>>, team: Team) {
  return new Set(
    result.allocations
      .filter((allocation) => allocation.team === team)
      .filter((allocation) => allocation.slot1 || allocation.slot2 || allocation.slot3 || allocation.slot4)
      .map((allocation) => allocation.staff_id)
  ).size
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const preference: PCAPreference = {
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: ['pca-a'],
    preferred_slots: [1, 3],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }

  const base = {
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [],
    pcaPool: [makePca('pca-a', [1, 2], 'upper'), makePca('pca-b', [3], 'upper')],
    pcaPreferences: [preference],
    specialPrograms: [],
    mode: 'standard' as const,
  }

  const v1 = await allocateFloatingPCA_v1LegacyPreference({
    ...base,
    preferenceSelectionMode: 'legacy',
    preferenceProtectionMode: 'exclusive',
    selectedPreferenceAssignments: [],
  })

  const v2 = await allocateFloatingPCA_v2RankedSlot({
    ...base,
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  assert.equal(countTeamPcasUsed(v1, 'FO'), 1)
  assert.equal(
    countTeamPcasUsed(v2, 'FO'),
    1,
    'Ranked V2 draft pass should continue immediately with the same PCA when it still has useful slots'
  )

  const v1Row = v1.allocations.find((allocation) => allocation.staff_id === 'pca-a' && allocation.team === 'FO')
  assert.equal(v1Row?.slot1, 'FO')
  assert.equal(v1Row?.slot2, 'FO')

  const v2First = v2.tracker.FO.assignments[0]
  const v2Second = v2.tracker.FO.assignments[1]
  assert.equal(v2First?.slot, 1)
  assert.equal(v2First?.pcaId, 'pca-a')
  assert.equal(v2First?.fulfilledSlotRank, 1)
  assert.equal(v2Second?.slot, 2)
  assert.equal(v2Second?.pcaId, 'pca-a')
  assert.equal(v2Second?.slotSelectionPhase, 'unranked-unused')
  assert.equal(v2Second?.usedContinuity, true)
  assert.equal(v2Second?.fulfilledSlotRank, null)

  const rankedFirstPreference: PCAPreference = {
    id: 'pref-fo-ranked-first',
    team: 'FO',
    preferred_pca_ids: ['pca-c'],
    preferred_slots: [3, 1],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }

  const rankedFirst = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [],
    pcaPool: [makePca('pca-c', [1, 3], 'upper'), makePca('pca-d', [2], 'upper')],
    pcaPreferences: [rankedFirstPreference],
    specialPrograms: [],
    mode: 'standard' as const,
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  assert.equal(countTeamPcasUsed(rankedFirst, 'FO'), 1)
  assert.equal(
    rankedFirst.tracker.FO.assignments[0]?.slot,
    3,
    'Continuity must not skip the highest-ranked legal slot'
  )
  assert.equal(rankedFirst.tracker.FO.assignments[0]?.pcaId, 'pca-c')
  assert.equal(rankedFirst.tracker.FO.assignments[0]?.fulfilledSlotRank, 1)
  assert.equal(rankedFirst.tracker.FO.assignments[1]?.slot, 1)
  assert.equal(rankedFirst.tracker.FO.assignments[1]?.pcaId, 'pca-c')
  assert.equal(rankedFirst.tracker.FO.assignments[1]?.usedContinuity, true)
  assert.equal(rankedFirst.tracker.FO.assignments[1]?.fulfilledSlotRank, 2)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
