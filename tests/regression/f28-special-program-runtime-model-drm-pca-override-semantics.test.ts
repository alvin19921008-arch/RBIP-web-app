import assert from 'node:assert/strict'

import { applySpecialProgramOverrides } from '../../lib/utils/specialProgramControllerRuntime'
import { resolveSpecialProgramRuntimeModel } from '../../lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '../../types/allocation'

async function main() {
  const drmProgram: SpecialProgram = {
    id: 'drm',
    name: 'DRM',
    staff_ids: ['dina'],
    weekdays: ['mon'],
    slots: {
      mon: [1],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
    },
    fte_subtraction: {
      dina: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 },
    },
    pca_required: 0,
    pca_preference_order: [],
  } as any

  const runtimeModel = resolveSpecialProgramRuntimeModel({
    program: drmProgram,
    weekday: 'mon',
    staffOverrides: {
      helper: {
        specialProgramOverrides: [
          {
            programId: 'drm',
            pcaId: 'helper',
            slots: [2],
          },
        ],
      },
    } as any,
  })

  assert.equal(
    runtimeModel.acceptsPcaCoverOverrides,
    false,
    `Expected DRM runtime model to reject PCA cover overrides, but got ${String(runtimeModel.acceptsPcaCoverOverrides)}`
  )

  const modifiedPrograms = applySpecialProgramOverrides({
    specialPrograms: [drmProgram],
    overrides: {
      helper: {
        specialProgramOverrides: [
          {
            programId: 'drm',
            pcaId: 'helper',
            slots: [2],
          },
        ],
      },
    } as any,
    weekday: 'mon',
  })

  const modifiedDrm = modifiedPrograms[0] as any
  assert.equal(
    modifiedDrm.__manualPcaCovers ?? null,
    null,
    `Expected DRM adaptation to skip manual PCA covers, but got ${JSON.stringify(modifiedDrm.__manualPcaCovers)}`
  )
  assert.deepEqual(
    modifiedDrm.pca_preference_order,
    [],
    `Expected DRM adaptation to preserve empty PCA preference order, but got ${JSON.stringify(modifiedDrm.pca_preference_order)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
