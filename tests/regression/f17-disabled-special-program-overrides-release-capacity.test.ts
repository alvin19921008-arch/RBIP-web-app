import assert from 'node:assert/strict'

import {
  computeDrmAddOnFte,
  computeReservedSpecialProgramPcaFte,
} from '../../lib/utils/specialProgramPcaCapacity'
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
    {
      id: 'drm',
      name: 'DRM',
      staff_ids: ['dee'],
      weekdays: ['mon'],
      slots: {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      } as any,
      fte_subtraction: {},
      pca_required: 0,
      pca_preference_order: [],
      staff_configs: [
        {
          id: 'cfg-dee-drm',
          program_id: 'drm',
          staff_id: 'dee',
          config_by_weekday: {
            mon: {
              enabled: true,
              slots: [2],
              fte_subtraction: 0,
              is_primary: true,
            },
          },
        },
      ],
    },
  ]

  const staffOverrides = {
    becca: {
      specialProgramOverrides: [
        {
          programId: 'crp',
          enabled: false,
        },
      ],
    },
    helperPca: {
      specialProgramOverrides: [
        {
          programId: 'crp',
          pcaId: 'helperPca',
          slots: [1, 3],
          requiredSlots: [1, 3],
          pcaFTESubtraction: 0.5,
        },
      ],
    },
    dee: {
      specialProgramOverrides: [
        {
          programId: 'drm',
          enabled: false,
        },
        {
          programId: 'drm',
          drmAddOn: 0.4,
        },
      ],
    },
  }

  const reservedFte = computeReservedSpecialProgramPcaFte({
    specialPrograms,
    weekday: 'mon',
    staffOverrides,
  })

  assert.equal(
    reservedFte,
    0,
    `Expected disabled CRP override to release reserved PCA capacity entirely, but got ${reservedFte}`
  )

  const drmAddOn = computeDrmAddOnFte({
    specialPrograms,
    weekday: 'mon',
    staffOverrides,
    defaultAddOn: 0.4,
  })

  assert.equal(
    drmAddOn,
    0,
    `Expected disabled DRM override to suppress the add-on entirely, but got ${drmAddOn}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
