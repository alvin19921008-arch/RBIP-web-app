import assert from 'node:assert/strict'

import {
  computeAdjacentSlotReservations,
  computeReservations,
} from '../../lib/utils/reservationLogic'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference, SpecialProgram } from '../../types/allocation'
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
  const adjustedPendingFTE = emptyTeamRecord(0)
  adjustedPendingFTE.FO = 0.25

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: ['pca-illegal-slot', 'pca-substitution', 'pca-legal'],
      preferred_slots: [1],
      floor_pca_selection: null,
      gym_schedule: null,
      avoid_gym_schedule: false,
      strict_preferred_pca: false,
      strict_preferred_slot: false,
    },
  ]

  const floatingPCAs: PCAData[] = [
    {
      id: 'pca-illegal-slot',
      name: 'Illegal Slot PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [2],
    },
    {
      id: 'pca-substitution',
      name: 'Substitution PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 2, 3, 4],
    },
    {
      id: 'pca-legal',
      name: 'Legal PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 3],
    },
    {
      id: 'adjacent-illegal-slot',
      name: 'Adjacent Illegal Slot PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 3, 4],
    },
  ]

  const step32Reservations = computeReservations(
    pcaPreferences,
    adjustedPendingFTE,
    floatingPCAs,
    [],
    {
      'pca-substitution': {
        substitutionForBySlot: {
          1: {
            team: 'SMM',
            nonFloatingPCAId: 'non-floating-1',
            nonFloatingPCAName: 'Covered PCA',
          },
        },
      },
    }
  )

  assert.deepEqual(
    step32Reservations.teamReservations.FO?.pcaIds,
    ['pca-legal'],
    `Expected Step 3.2 reservations to keep only the PCA whose preferred slot is canonically legal, but got ${JSON.stringify(step32Reservations.teamReservations.FO?.pcaIds ?? null)}`
  )

  const currentPendingFTE = emptyTeamRecord(0)
  currentPendingFTE.GMC = 0.25

  const existingAllocations: PCAAllocation[] = [
    {
      id: 'alloc-special-program',
      schedule_id: '',
      staff_id: 'adjacent-illegal-slot',
      team: 'GMC',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: 'GMC',
      slot4: null,
      leave_type: null,
      special_program_ids: ['program-crp'],
    },
  ]

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'program-crp',
      name: 'CRP',
      staff_ids: ['becca'],
      weekdays: ['mon'],
      slots: {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      } as any,
      fte_subtraction: {},
      pca_required: 0.25,
      pca_preference_order: [],
      staff_configs: [
        {
          id: 'cfg-becca-crp',
          program_id: 'program-crp',
          staff_id: 'becca',
          config_by_weekday: {
            mon: {
              enabled: true,
              slots: [3],
              fte_subtraction: 0,
              is_primary: true,
            },
          },
        },
      ],
    },
  ]

  const step33Reservations = computeAdjacentSlotReservations(
    currentPendingFTE,
    existingAllocations,
    floatingPCAs,
    specialPrograms,
    undefined,
    'mon'
  )

  assert.equal(
    step33Reservations.adjacentReservations.GMC.length,
    1,
    `Expected Step 3.3 to recognize canonical CRP slot 3 and offer adjacent slot 4 for GMC, but got ${step33Reservations.adjacentReservations.GMC.length}`
  )

  assert.equal(
    step33Reservations.adjacentReservations.GMC[0]?.adjacentSlot,
    4,
    `Expected Step 3.3 to offer adjacent slot 4 from canonical CRP slot 3, but got ${step33Reservations.adjacentReservations.GMC[0]?.adjacentSlot ?? null}`
  )

  const overrideAwareReservations = computeAdjacentSlotReservations(
    currentPendingFTE,
    [
      {
        ...existingAllocations[0],
        id: 'alloc-special-program-override',
        slot3: null,
        slot4: 'GMC',
      },
    ],
    floatingPCAs,
    specialPrograms,
    {
      becca: {
        specialProgramOverrides: [
          {
            programId: 'program-crp',
            requiredSlots: [4],
          },
        ],
      } as any,
    } as any,
    'mon'
  )

  assert.equal(
    overrideAwareReservations.adjacentReservations.GMC.length,
    1,
    `Expected Step 3.3 to honor the Step 2 requiredSlots override and recognize CRP slot 4 as designated work, but got ${overrideAwareReservations.adjacentReservations.GMC.length}`
  )

  assert.equal(
    overrideAwareReservations.adjacentReservations.GMC[0]?.adjacentSlot,
    3,
    `Expected Step 3.3 to offer adjacent slot 3 when Step 2 overrides CRP to slot 4, but got ${overrideAwareReservations.adjacentReservations.GMC[0]?.adjacentSlot ?? null}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
