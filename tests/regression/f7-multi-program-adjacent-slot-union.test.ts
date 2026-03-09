import assert from 'node:assert/strict'

import { computeAdjacentSlotReservations } from '../../lib/utils/reservationLogic'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import type { SpecialProgram } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
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
  currentPendingFTE.SFM = 0.25

  const existingAllocations: PCAAllocation[] = [
    {
      id: 'alloc-multi-program',
      schedule_id: '',
      staff_id: 'multi-program-pca',
      team: 'CPPC',
      fte_pca: 1,
      fte_remaining: 0.5,
      slot_assigned: 0.5,
      slot_whole: null,
      slot1: null,
      slot2: 'CPPC',
      slot3: 'SFM',
      slot4: null,
      leave_type: null,
      special_program_ids: ['crp', 'robotic'],
    },
  ]

  const floatingPCAs: PCAData[] = [
    {
      id: 'multi-program-pca',
      name: 'Multi Program PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 2, 3, 4],
    },
  ]

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'crp',
      name: 'CRP',
      staff_ids: [],
      weekdays: ['mon'],
      slots: {
        mon: [2],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      },
      fte_subtraction: {},
      pca_required: 0.25,
      pca_preference_order: [],
    },
    {
      id: 'robotic',
      name: 'Robotic',
      staff_ids: [],
      weekdays: ['mon'],
      slots: {
        mon: [1, 2, 3, 4],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      },
      fte_subtraction: {},
      pca_required: 0.5,
      pca_preference_order: [],
    },
  ]

  const result = computeAdjacentSlotReservations(
    currentPendingFTE,
    existingAllocations,
    floatingPCAs,
    specialPrograms,
    undefined,
    'mon'
  )

  assert.equal(
    result.adjacentReservations.SFM.length,
    1,
    `Expected SFM to receive one adjacent-slot option from the Robotic-derived slot in a multi-program allocation, but got ${result.adjacentReservations.SFM.length}`
  )

  assert.equal(
    result.adjacentReservations.SFM[0]?.adjacentSlot,
    4,
    `Expected the adjacent slot option to be slot 4 from the Robotic slot 3 assignment, but got ${result.adjacentReservations.SFM[0]?.adjacentSlot}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
