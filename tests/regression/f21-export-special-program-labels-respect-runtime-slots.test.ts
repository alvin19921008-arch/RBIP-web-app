import assert from 'node:assert/strict'

import { getSpecialProgramNameBySlotForAllocation } from '../../lib/utils/specialProgramExport'
import type { SpecialProgram } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'

async function main() {
  const allocation: PCAAllocation = {
    id: 'alloc-crp-export',
    schedule_id: '',
    staff_id: 'pca-1',
    team: 'GMC',
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: null,
    slot2: null,
    slot3: null,
    slot4: 'GMC',
    leave_type: null,
    special_program_ids: ['crp'],
  }

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'crp',
      name: 'CRP',
      weekdays: ['mon'],
      staff_ids: ['becca'],
      slots: {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      } as any,
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
  ]

  const labels = getSpecialProgramNameBySlotForAllocation({
    allocation,
    specialPrograms,
    weekday: 'mon',
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
  })

  assert.equal(
    labels[4],
    'CRP',
    `Expected export slot labeling to respect Step 2 override slot 4 for CRP, but got ${JSON.stringify(labels)}`
  )

  const roboticWrongTeamAllocation: PCAAllocation = {
    id: 'alloc-robotic-wrong-team',
    schedule_id: '',
    staff_id: 'pca-robotic',
    team: 'GMC',
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: null,
    slot2: 'GMC',
    slot3: null,
    slot4: null,
    leave_type: null,
    special_program_ids: ['robotic'],
  }

  const roboticPrograms: SpecialProgram[] = [
    {
      id: 'robotic',
      name: 'Robotic',
      weekdays: ['mon'],
      staff_ids: [],
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
    } as any,
  ]

  const roboticLabels = getSpecialProgramNameBySlotForAllocation({
    allocation: roboticWrongTeamAllocation,
    specialPrograms: roboticPrograms,
    weekday: 'mon',
  })

  assert.equal(
    roboticLabels[2],
    undefined,
    `Expected export labeling to skip Robotic slot 2 when it is assigned to a non-runtime team, but got ${JSON.stringify(roboticLabels)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
