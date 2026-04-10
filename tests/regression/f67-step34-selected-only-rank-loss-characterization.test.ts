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

/**
 * Ranked V2: legacy vs selected_only (no Step 3.2 picks) should agree on ranked-slot priority,
 * since base [preferred_slots] must survive into effective preferences for the V2 engine.
 */
async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const preference: PCAPreference = {
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: [],
    preferred_slots: [3, 1],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }

  const base = {
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25 },
    existingAllocations: [],
    pcaPool: [makePca('slot-3', [3]), makePca('slot-1', [1])],
    pcaPreferences: [preference],
    specialPrograms: [],
    mode: 'standard' as const,
    extraCoverageMode: 'none' as const,
  }

  const legacyPreferences = await allocateFloatingPCA_v2RankedSlot({
    ...base,
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  const selectedOnly = await allocateFloatingPCA_v2RankedSlot({
    ...base,
    preferenceSelectionMode: 'selected_only',
    selectedPreferenceAssignments: [],
  })

  const legacyAssignment = legacyPreferences.tracker.FO.assignments[0]
  const selectedOnlyAssignment = selectedOnly.tracker.FO.assignments[0]

  assert.equal(legacyAssignment?.slot, 3)
  assert.equal(legacyAssignment?.slotSelectionPhase, 'ranked-unused')
  assert.equal(legacyAssignment?.fulfilledSlotRank, 1)

  assert.equal(selectedOnlyAssignment?.slot, legacyAssignment?.slot)
  assert.equal(selectedOnlyAssignment?.slotSelectionPhase, legacyAssignment?.slotSelectionPhase)
  assert.equal(selectedOnlyAssignment?.fulfilledSlotRank, legacyAssignment?.fulfilledSlotRank)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
