import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
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

function countSlotAssignments(
  result: Awaited<ReturnType<typeof allocateFloatingPCA_v2RankedSlot>>,
  team: Team,
  slot: 1 | 2 | 3 | 4
) {
  let count = 0
  for (const allocation of result.allocations.filter((row) => row.team === team)) {
    if (slot === 1 && allocation.slot1 === team) count += 1
    if (slot === 2 && allocation.slot2 === team) count += 1
    if (slot === 3 && allocation.slot3 === team) count += 1
    if (slot === 4 && allocation.slot4 === team) count += 1
  }
  return count
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const preference: PCAPreference = {
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: [],
    preferred_slots: [1],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }

  const base = {
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25 },
    existingAllocations: [],
    pcaPool: [makePca('a', [1]), makePca('b', [1])],
    pcaPreferences: [preference],
    specialPrograms: [],
    mode: 'standard' as const,
    preferenceSelectionMode: 'legacy' as const,
    selectedPreferenceAssignments: [],
  }

  const noExtraCoverage = await allocateFloatingPCA_v2RankedSlot({
    ...base,
    extraCoverageMode: 'none',
  })

  const roundRobinExtraCoverage = await allocateFloatingPCA_v2RankedSlot({
    ...base,
    extraCoverageMode: 'round-robin-team-order',
  })

  assert.equal(countSlotAssignments(noExtraCoverage, 'FO', 1), 1)
  assert.equal(countSlotAssignments(roundRobinExtraCoverage, 'FO', 1), 2)

  assert.equal(noExtraCoverage.tracker.FO.assignments.length, 1)
  assert.equal(roundRobinExtraCoverage.tracker.FO.assignments.length, 2)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
