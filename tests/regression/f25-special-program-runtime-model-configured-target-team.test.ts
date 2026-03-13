import assert from 'node:assert/strict'

import { resolveSpecialProgramRuntimeModel } from '../../lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '../../types/allocation'

async function main() {
  const crpProgram: SpecialProgram = {
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
    staff_configs: [
      {
        id: 'cfg-aggie-crp',
        program_id: 'crp',
        staff_id: 'aggie',
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
    pca_required: 0.25,
    pca_preference_order: [],
  } as any

  const runtimeModel = resolveSpecialProgramRuntimeModel({
    program: crpProgram,
    weekday: 'mon',
    allStaff: [
      {
        id: 'aggie',
        rank: 'SPT',
        team: 'DRO',
      },
    ],
  })

  assert.equal(
    runtimeModel.configuredPrimaryTherapistId,
    'aggie',
    `Expected runtime model to expose configured primary therapist aggie, but got ${runtimeModel.configuredPrimaryTherapistId ?? null}`
  )
  assert.equal(
    runtimeModel.configuredFallbackTargetTeam,
    'DRO',
    `Expected runtime model to expose configured fallback target team DRO, but got ${runtimeModel.configuredFallbackTargetTeam ?? null}`
  )
  assert.deepEqual(
    runtimeModel.slotTeamBySlot,
    {},
    `Expected runtime model without explicit targetTeam to avoid slot-team routing, but got ${JSON.stringify(runtimeModel.slotTeamBySlot)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
