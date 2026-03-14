import assert from 'node:assert/strict'

import { computeSpecialProgramAssignedFteByTeam } from '../../lib/utils/scheduleReservationRuntime'
import type { SpecialProgram } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'

async function main() {
  const specialPrograms: SpecialProgram[] = [
    {
      id: 'crp',
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
    },
  ]

  const allocations: PCAAllocation[] = [
    {
      id: 'alloc-1',
      schedule_id: '',
      staff_id: 'pca-1',
      team: 'GMC',
      fte_pca: 1,
      fte_remaining: 0.5,
      slot_assigned: 0.5,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: 'CPPC',
      slot4: 'GMC',
      leave_type: null,
      special_program_ids: ['crp'],
    },
  ]

  const assignedByTeam = computeSpecialProgramAssignedFteByTeam({
    allocations,
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
    assignedByTeam.GMC,
    0.25,
    `Expected override-aware runtime occupancy to classify GMC slot 4 as the CRP slot, but got ${assignedByTeam.GMC}`
  )

  assert.equal(
    assignedByTeam.CPPC,
    0,
    `Expected ordinary CPPC slot 3 coverage to stay general because CRP was overridden to slot 4, but got ${assignedByTeam.CPPC}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
