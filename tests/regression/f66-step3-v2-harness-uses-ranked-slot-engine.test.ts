import assert from 'node:assert/strict'

import { executeStep3V2HarnessAuto } from '../../lib/features/schedule/step3Harness/runStep3V2Harness'
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

function makePreference(team: Team, rankedSlots: number[], preferredPcaIds: string[]): PCAPreference {
  return {
    id: `pref-${team}`,
    team,
    preferred_pca_ids: preferredPcaIds,
    preferred_slots: rankedSlots,
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }
}

async function main() {
  const result = await executeStep3V2HarnessAuto({
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    visibleTeams: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    floatingPCAs: [
      makePca('floor-1', [1, 3], 'upper'),
      makePca('preferred-a', [3], 'upper'),
      makePca('other-1', [2], 'lower'),
    ],
    existingAllocations: [],
    pcaPreferences: [makePreference('FO', [1, 3], ['preferred-a'])],
    specialPrograms: [],
    staffOverrides: {},
    selectedDate: new Date('2026-03-02T08:00:00.000Z'),
    autoStep32: false,
    autoStep33: false,
    bufferPreAssignRatio: 0,
    bufferStaff: [],
  })

  const slotOneAssignment = result.result.tracker.FO.assignments.find((assignment) => assignment.slot === 1)

  assert.equal(
    slotOneAssignment?.slotSelectionPhase,
    'ranked-unused',
    'Expected the Leave Sim V2 harness helper to route through the ranked-slot engine so ranked slot assignment metadata is present.'
  )
  assert.equal(
    slotOneAssignment?.fulfilledSlotRank,
    1,
    'Expected the Leave Sim V2 harness helper to preserve rank fulfillment metadata from the ranked-slot allocator.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
