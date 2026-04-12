import assert from 'node:assert/strict'

import { runStep3V2CommittedSelections } from '../../lib/features/schedule/step3V2CommittedSelections'
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

async function main() {
  const result = await runStep3V2CommittedSelections({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [],
    floatingPCAs: [makePca('a', [1]), makePca('b', [3])],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: ['a', 'b'],
        preferred_slots: [1, 3],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
    step32Assignments: [{ team: 'FO', slot: 1, pcaId: 'a', pcaName: 'a' }],
    step33Assignments: [],
  })

  const step34Rank2 = result.tracker.FO.assignments.find(
    (assignment) => assignment.assignedIn === 'step34' && assignment.slot === 3
  )
  assert.equal(step34Rank2?.pcaId, 'b')
  assert.equal(step34Rank2?.pcaSelectionTier, 'preferred')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
