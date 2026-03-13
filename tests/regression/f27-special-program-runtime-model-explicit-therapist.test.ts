import assert from 'node:assert/strict'

import { resolveSpecialProgramRuntimeModel } from '../../lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '../../types/allocation'

async function main() {
  const program: SpecialProgram = {
    id: 'crp',
    name: 'CRP',
    staff_ids: ['aggie'],
    weekdays: ['mon'],
    slots: {
      mon: [3],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
    },
    fte_subtraction: {
      aggie: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 },
    },
    pca_required: 0.25,
    pca_preference_order: [],
  } as any

  const runtimeModel = resolveSpecialProgramRuntimeModel({
    program,
    weekday: 'mon',
    staffOverrides: {
      aggie: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            therapistId: 'aggie',
          },
        ],
      },
    } as any,
  })

  assert.equal(
    runtimeModel.explicitOverrideTherapistId,
    'aggie',
    `Expected runtime model to expose explicit override therapist aggie, but got ${runtimeModel.explicitOverrideTherapistId ?? null}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
