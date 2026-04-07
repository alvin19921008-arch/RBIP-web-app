import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2, type PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference, SpecialProgram } from '../../types/allocation'
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

async function main() {
  const currentPendingFTE = emptyTeamRecord(0)
  currentPendingFTE.FO = 0.25

  const pcaPool: PCAData[] = [
    {
      id: 'preferred-a',
      name: 'Preferred A',
      floating: true,
      special_program: null,
      fte_pca: 0.25,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [3],
      floor_pca: ['upper'],
    } as any,
  ]

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: ['preferred-a'],
      preferred_slots: [1, 3],
      avoid_gym_schedule: true,
      gym_schedule: 4,
      floor_pca_selection: 'upper',
    },
  ]

  const specialPrograms: SpecialProgram[] = []

  const result = await allocateFloatingPCA_v2({
    mode: 'standard',
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE,
    existingAllocations: [],
    pcaPool,
    pcaPreferences,
    specialPrograms,
  })

  assert.equal(result.tracker.FO.summary.pendingMet, true)
  assert.equal(result.tracker.FO.summary.highestRankedSlotFulfilled, 2)
  assert.equal(result.tracker.FO.summary.usedUnrankedSlot, false)
  assert.equal(result.tracker.FO.summary.usedDuplicateFloatingSlot, false)
  assert.equal(result.tracker.FO.summary.gymUsedAsLastResort, false)

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
