import assert from 'node:assert/strict'

import { allocateFloatingPCA_rankedV2 } from '../../lib/algorithms/pcaAllocation'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
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

async function main() {
  const result = await allocateFloatingPCA_rankedV2({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [],
    pcaPool: [makePca('preferred-a', [3], 'upper'), makePca('floor-m', [1], 'upper')],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: ['preferred-a'],
        preferred_slots: [1, 3],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
  })

  assert.equal(result.tracker.FO.summary.pendingMet, true)
  assert.equal(result.tracker.FO.summary.highestRankedSlotFulfilled, 1)
  assert.equal(result.tracker.FO.summary.usedUnrankedSlot, false)
  assert.equal(result.tracker.FO.summary.usedDuplicateFloatingSlot, false)
  assert.equal(result.tracker.FO.summary.gymUsedAsLastResort, false)
  assert.equal(result.tracker.FO.summary.preferredPCAUsed, true)

  const rankTwoAssignment = result.tracker.FO.assignments.find((assignment) => assignment.slot === 3)

  assert.equal(rankTwoAssignment?.fulfilledSlotRank, 2)
  assert.equal(rankTwoAssignment?.slotSelectionPhase, 'ranked-unused')
  assert.equal(rankTwoAssignment?.pcaSelectionTier, 'preferred')
  assert.equal(rankTwoAssignment?.usedContinuity, false)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
