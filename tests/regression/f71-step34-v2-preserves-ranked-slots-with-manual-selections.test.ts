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
 * Contract: Step 3.4 V2 ranked allocator must keep base [preferred_slots] order when
 * [selectedPreferenceAssignments] is present. Manual picks may bias [preferred_pca_ids]
 * but must not erase ranked-slot priority (highest-ranked legal slot first).
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
    preferenceSelectionMode: 'selected_only' as const,
    selectedPreferenceAssignments: [
      {
        team: 'FO' as const,
        slot: 3,
        pcaId: 'slot-3',
        source: 'step32' as const,
      },
    ],
  }

  const result = await allocateFloatingPCA_v2RankedSlot(base)

  const assignment = result.tracker.FO.assignments[0]
  assert.equal(assignment?.slot, 3, 'Expected highest-ranked legal slot (3) before lower rank (1)')
  assert.equal(assignment?.slotSelectionPhase, 'ranked-unused')
  assert.equal(assignment?.fulfilledSlotRank, 1)

  /**
   * Step 3.3 manual picks (source: step33) must merge into effective [preferred_pca_ids] so PCA
   * tiering prefers that PCA, without changing ranked-slot order (slot 1 still first target).
   */
  const preferenceRank1: PCAPreference = {
    id: 'pref-fo-rank1',
    team: 'FO',
    preferred_pca_ids: [],
    preferred_slots: [1],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }
  const step33BiasBase = {
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25 },
    existingAllocations: [],
    pcaPool: [makePca('a', [1]), makePca('b', [1])],
    pcaPreferences: [preferenceRank1],
    specialPrograms: [],
    mode: 'standard' as const,
    extraCoverageMode: 'none' as const,
    preferenceSelectionMode: 'selected_only' as const,
    selectedPreferenceAssignments: [
      {
        team: 'FO' as const,
        slot: 2,
        pcaId: 'b',
        source: 'step33' as const,
      },
    ],
  }
  const step33Result = await allocateFloatingPCA_v2RankedSlot(step33BiasBase)
  const step33Assignment = step33Result.tracker.FO.assignments[0]
  assert.equal(
    step33Assignment?.slot,
    1,
    'Ranked-slot priority unchanged: first legal ranked slot remains 1'
  )
  assert.equal(
    step33Assignment?.pcaId,
    'b',
    'Step 3.3 selection must bias preferred PCA tier so b wins tie-break over a'
  )
  assert.equal(step33Assignment?.pcaSelectionTier, 'preferred')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
