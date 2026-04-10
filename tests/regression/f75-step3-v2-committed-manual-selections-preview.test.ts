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
    floatingPCAs: [makePca('step32-pca', [3]), makePca('step33-pca', [2])],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [3, 1],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
    step32Assignments: [{ team: 'FO', slot: 3, pcaId: 'step32-pca', pcaName: 'step32-pca' }],
    step33Assignments: [{ team: 'FO', slot: 2, pcaId: 'step33-pca', pcaName: 'step33-pca' }],
  })

  assert.equal(result.pendingPCAFTEPerTeam.FO, 0)

  const step32Allocation = result.allocations.find((allocation) => allocation.staff_id === 'step32-pca')
  const step33Allocation = result.allocations.find((allocation) => allocation.staff_id === 'step33-pca')
  assert.equal(step32Allocation?.slot3, 'FO')
  assert.equal(step33Allocation?.slot2, 'FO')

  assert.equal(result.tracker.FO.summary.fromStep32, 1)
  assert.equal(result.tracker.FO.summary.fromStep33, 1)
  assert.equal(result.tracker.FO.summary.fromStep34Cycle1, 0)
  assert.equal(result.tracker.FO.summary.fromStep34Cycle3, 0)

  const step32TrackerAssignment = result.tracker.FO.assignments.find(
    (assignment) => assignment.assignedIn === 'step32' && assignment.slot === 3
  )
  const step33TrackerAssignment = result.tracker.FO.assignments.find(
    (assignment) => assignment.assignedIn === 'step33' && assignment.slot === 2
  )
  assert.equal(step32TrackerAssignment?.fulfilledSlotRank, 1)
  assert.equal(step33TrackerAssignment?.slotSelectionPhase, 'unranked-unused')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
