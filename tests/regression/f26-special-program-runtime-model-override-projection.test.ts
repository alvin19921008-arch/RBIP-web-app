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
            therapistFTESubtraction: 0.5,
            requiredSlots: [4],
          },
        ],
      },
      helper: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            pcaId: 'helper',
            slots: [4],
          },
        ],
      },
    } as any,
  })

  assert.deepEqual(
    runtimeModel.therapistOverrides,
    [{ therapistId: 'aggie', therapistFTESubtraction: 0.5 }],
    `Expected runtime model to expose therapist overrides, but got ${JSON.stringify(runtimeModel.therapistOverrides)}`
  )
  assert.deepEqual(
    runtimeModel.pcaOverrides,
    [{ pcaId: 'helper', slots: [4] }],
    `Expected runtime model to expose PCA overrides, but got ${JSON.stringify(runtimeModel.pcaOverrides)}`
  )
  assert.deepEqual(
    runtimeModel.effectiveRequiredSlots,
    [4],
    `Expected runtime model to keep effective required slots [4], but got ${JSON.stringify(runtimeModel.effectiveRequiredSlots)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
