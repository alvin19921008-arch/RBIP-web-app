import assert from 'node:assert/strict'

import { resolveSpecialProgramRuntimeModel } from '../../lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '../../types/allocation'

async function main() {
  const roboticProgram: SpecialProgram = {
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
  } as any

  const roboticRuntime = resolveSpecialProgramRuntimeModel({
    program: roboticProgram,
    weekday: 'mon',
    staffOverrides: {
      any: {
        specialProgramOverrides: [
          {
            programId: 'robotic',
            requiredSlots: [2, 4],
          },
        ],
      },
    } as any,
  })

  assert.equal(roboticRuntime.isActiveOnWeekday, true)
  assert.deepEqual(roboticRuntime.effectiveRequiredSlots, [2, 4])
  assert.deepEqual(roboticRuntime.slotTeamBySlot, {
    2: 'SMM',
    4: 'SFM',
  })

  const crpProgram: SpecialProgram = {
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
  } as any

  const crpRuntime = resolveSpecialProgramRuntimeModel({
    program: crpProgram,
    weekday: 'mon',
    targetTeam: 'GMC',
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

  assert.equal(crpRuntime.isActiveOnWeekday, true)
  assert.deepEqual(crpRuntime.effectiveRequiredSlots, [4])
  assert.deepEqual(crpRuntime.slotTeamBySlot, {
    4: 'GMC',
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
