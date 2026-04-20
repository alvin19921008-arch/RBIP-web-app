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
    floatingPCAs: [makePca('manual-step32', [1]), makePca('auto-step34', [2])],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [1, 2],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
    step32Assignments: [{ team: 'FO', slot: 1, pcaId: 'manual-step32', pcaName: 'Manual Step 3.2' }],
    step33Assignments: [],
  })

  assert.equal(result.tracker.FO.summary.v2RealizedSurplusSlotGrant, undefined)
  assert.equal(result.tracker.FO.summary.v2SurplusProvenanceGrantReadSource, undefined)

  const step32Rows = result.tracker.FO.assignments.filter((assignment) => assignment.assignedIn === 'step32')
  const step34Rows = result.tracker.FO.assignments.filter((assignment) => assignment.assignedIn === 'step34')

  assert.equal(step32Rows.length, 1, 'Expected one committed Step 3.2 row in the saved tracker.')
  assert.equal(step34Rows.length, 1, 'Expected one remaining Step 3.4 row in the saved tracker.')
  assert.equal(step32Rows[0]?.v2EnabledBySurplusAdjustedTarget, undefined)
  assert.equal(step34Rows[0]?.v2EnabledBySurplusAdjustedTarget, undefined)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
