import assert from 'node:assert/strict'

import { allocateTherapists, type StaffData } from '../../lib/algorithms/therapistAllocation'
import type { SpecialProgram, SPTAllocation } from '../../types/allocation'

async function main() {
  const staff: StaffData[] = [
    {
      id: 'aggie',
      name: 'Aggie',
      rank: 'SPT',
      team: null,
      special_program: ['CRP'],
      fte_therapist: 0,
      leave_type: null,
      is_available: true,
      availableSlots: [2],
    },
  ]

  const sptAllocations: SPTAllocation[] = [
    {
      id: 'spt-aggie',
      staff_id: 'aggie',
      specialty: 'Behaviour',
      teams: ['CPPC'],
      substitute_team_head: false,
      active: true,
      config_by_weekday: {
        wed: {
          enabled: true,
          contributes_fte: false,
          slots: [2],
          slot_modes: { am: 'AND', pm: 'AND' },
        },
      },
    },
  ]

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'crp',
      name: 'CRP',
      staff_ids: ['aggie'],
      weekdays: ['wed'],
      slots: {
        wed: [2],
        mon: [],
        tue: [],
        thu: [],
        fri: [],
      } as any,
      fte_subtraction: {
        aggie: {
          wed: 0,
        },
      },
      pca_required: 0.25,
      therapist_preference_order: {
        CPPC: ['aggie'],
      },
      pca_preference_order: [],
    },
  ]

  const result = allocateTherapists({
    date: new Date('2026-03-04T08:00:00.000Z'),
    previousSchedule: null,
    staff,
    specialPrograms,
    sptAllocations,
    manualOverrides: {},
  })

  const aggieAllocation = result.allocations.find((allocation) => allocation.staff_id === 'aggie')
  assert.ok(aggieAllocation, 'Expected Aggie to receive a therapist allocation from SPT weekday config')

  assert.equal(
    aggieAllocation!.team,
    'CPPC',
    `Expected Aggie to be assigned to CPPC, but got ${aggieAllocation!.team}`
  )

  assert.equal(
    aggieAllocation!.fte_therapist,
    0,
    `Expected Aggie to contribute 0 PT-FTE to the team, but got ${aggieAllocation!.fte_therapist}`
  )

  assert.deepEqual(
    aggieAllocation!.special_program_ids,
    ['crp'],
    `Expected Aggie to still be tagged as the CRP runner even when therapist subtraction is 0, but got ${JSON.stringify(aggieAllocation!.special_program_ids)}`
  )

  assert.equal(
    result.calculations.ptPerTeam.CPPC,
    0,
    `Expected CPPC PT total to remain 0 when Aggie adds 0 and subtracts 0, but got ${result.calculations.ptPerTeam.CPPC}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
