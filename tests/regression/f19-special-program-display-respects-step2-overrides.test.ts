import assert from 'node:assert/strict'

import { getSpecialProgramSlotsForAllocationTeam } from '../../lib/utils/specialProgramDisplay'

async function main() {
  const slots = getSpecialProgramSlotsForAllocationTeam({
    allocation: {
      staff_id: 'jun',
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: 'GMC',
      special_program_ids: ['crp'],
    } as any,
    team: 'GMC',
    selectedDate: new Date('2026-03-02T08:00:00.000Z'),
    specialPrograms: [
      {
        id: 'crp',
        name: 'CRP',
        weekdays: ['mon'],
        slots: {
          mon: [],
          tue: [],
          wed: [],
          thu: [],
          fri: [],
        },
        staff_configs: [
          {
            id: 'cfg-crp',
            program_id: 'crp',
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
      } as any,
    ],
    staffOverrides: {
      becca: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            requiredSlots: [4],
          },
        ],
      },
    } as any,
  } as any)

  assert.deepEqual(
    slots,
    [4],
    `Expected display helper to respect Step 2 requiredSlots override [4], but got ${JSON.stringify(slots)}`
  )

  const roboticSlots = getSpecialProgramSlotsForAllocationTeam({
    allocation: {
      staff_id: 'robotic-pca',
      slot1: null,
      slot2: 'GMC',
      slot3: null,
      slot4: null,
      special_program_ids: ['robotic'],
    } as any,
    team: 'GMC',
    selectedDate: new Date('2026-03-02T08:00:00.000Z'),
    specialPrograms: [
      {
        id: 'robotic',
        name: 'Robotic',
        weekdays: ['mon'],
        slots: {
          mon: [1, 2, 3, 4],
          tue: [],
          wed: [],
          thu: [],
          fri: [],
        },
      } as any,
    ],
  } as any)

  assert.deepEqual(
    roboticSlots,
    [],
    `Expected display helper to skip Robotic slot 2 when it is assigned to a non-runtime team, but got ${JSON.stringify(roboticSlots)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
