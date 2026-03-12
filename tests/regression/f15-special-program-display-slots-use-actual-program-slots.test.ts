import assert from 'node:assert/strict'

import { getSpecialProgramSlotsForAllocationTeam } from '../../lib/utils/specialProgramDisplay'

async function main() {
  const slots = getSpecialProgramSlotsForAllocationTeam({
    allocation: {
      staff_id: 'jun',
      slot1: 'GMC',
      slot2: 'MC',
      slot3: 'MC',
      slot4: 'FO',
      special_program_ids: ['crp'],
    } as any,
    team: 'GMC',
    selectedDate: new Date('2026-03-04T08:00:00.000Z'),
    specialPrograms: [
      {
        id: 'crp',
        name: 'CRP',
        weekdays: ['wed'],
        slots: {
          mon: [],
          tue: [],
          wed: [1],
          thu: [],
          fri: [],
        },
      } as any,
    ],
  })

  assert.deepEqual(
    slots,
    [1],
    `Expected CRP display helper to mark the actual configured GMC slot 1 as special-program coverage, but got ${JSON.stringify(slots)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
