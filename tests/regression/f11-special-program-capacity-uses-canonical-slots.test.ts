import assert from 'node:assert/strict'

import { computeReservedSpecialProgramPcaFte } from '../../lib/utils/specialProgramPcaCapacity'
import type { SpecialProgram } from '../../types/allocation'

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
      pca_required: 0.5,
      pca_preference_order: [],
      staff_configs: [
        {
          id: 'cfg-becca-crp',
          program_id: 'crp',
          staff_id: 'becca',
          config_by_weekday: {
            mon: {
              enabled: true,
              slots: [1, 3],
              fte_subtraction: 0,
              is_primary: true,
            },
          },
        },
      ],
    },
  ]

  const reservedFte = computeReservedSpecialProgramPcaFte({
    specialPrograms,
    weekday: 'mon',
  })

  assert.equal(
    reservedFte,
    0.5,
    `Expected reserved CRP capacity to follow canonical weekday slots [1,3] for 0.5 FTE, but got ${reservedFte}`
  )

  const overriddenReservedFte = computeReservedSpecialProgramPcaFte({
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
    },
  })

  assert.equal(
    overriddenReservedFte,
    0.25,
    `Expected Step 2 override requiredSlots [4] to take precedence over canonical slots for reserved capacity, but got ${overriddenReservedFte}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
