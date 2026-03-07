import assert from 'node:assert/strict'

import { allocatePCA, type PCAData } from '../../lib/algorithms/pcaAllocation'
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

function emptyWeekdayRecord<T>(value: T) {
  return {
    mon: value,
    tue: value,
    wed: value,
    thu: value,
    fri: value,
  }
}

async function main() {
  const pcaPool: PCAData[] = [
    {
      id: 'non-floating-fo',
      name: 'Non Floating FO',
      floating: false,
      special_program: null,
      fte_pca: 0.5,
      leave_type: null,
      is_available: true,
      team: 'FO',
      availableSlots: [3, 4],
    },
    {
      id: 'floating-half',
      name: 'Floating Half',
      floating: true,
      special_program: ['CRP'],
      fte_pca: 0.5,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 2, 3],
    },
  ]

  const averagePCAPerTeam = emptyTeamRecord(0)
  averagePCAPerTeam.FO = 1
  averagePCAPerTeam.CPPC = 0.25

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: ['floating-half'],
      preferred_slots: [],
      avoid_gym_schedule: false,
      gym_schedule: null,
      floor_pca_selection: null,
    },
  ]

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'crp',
      name: 'CRP',
      staff_ids: [],
      weekdays: ['mon'],
      slots: {
        mon: [3],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      },
      fte_subtraction: emptyWeekdayRecord({}),
      pca_required: 0.25,
      pca_preference_order: ['floating-half'],
    },
  ]

  const result = await allocatePCA({
    date: new Date('2026-03-02T08:00:00.000Z'),
    totalPCAAvailable: 1,
    pcaPool,
    averagePCAPerTeam,
    specialPrograms,
    pcaPreferences,
    phase: 'non-floating-with-special',
  })

  const floatingAllocation = result.allocations.find((allocation) => allocation.staff_id === 'floating-half')
  assert.ok(floatingAllocation, 'Expected floating-half allocation to exist')

  assert.equal(
    floatingAllocation!.slot_assigned,
    0.5,
    `Expected floating-half to consume at most its 0.5 FTE across special program plus substitution, but got slot_assigned=${floatingAllocation!.slot_assigned}`
  )

  assert.equal(
    result.pendingPCAFTEPerTeam.FO,
    0.25,
    `Expected FO to remain short by 0.25 because only one substitution slot should remain after CRP, but got pending=${result.pendingPCAFTEPerTeam.FO}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
