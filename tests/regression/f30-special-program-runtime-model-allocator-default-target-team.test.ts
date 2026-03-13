import assert from 'node:assert/strict'

import { resolveSpecialProgramRuntimeModel } from '../../lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '../../types/allocation'

function buildProgram(name: string, id: string): SpecialProgram {
  return {
    id,
    name,
    staff_ids: ['aggie'],
    weekdays: ['mon'],
    slots: {
      mon: [1, 2, 3, 4],
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
        id: `cfg-${id}-aggie`,
        program_id: id,
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
}

async function main() {
  const explicitCrpRuntime = resolveSpecialProgramRuntimeModel({
    program: buildProgram('CRP', 'crp-explicit'),
    weekday: 'mon',
    targetTeam: 'GMC',
  })
  assert.equal(explicitCrpRuntime.allocatorDefaultTargetTeam, 'GMC')

  const configuredCrpRuntime = resolveSpecialProgramRuntimeModel({
    program: buildProgram('CRP', 'crp-configured'),
    weekday: 'mon',
    allStaff: [
      {
        id: 'aggie',
        rank: 'SPT',
        team: 'DRO',
      },
    ],
  })
  assert.equal(configuredCrpRuntime.allocatorDefaultTargetTeam, 'DRO')

  const fallbackCrpRuntime = resolveSpecialProgramRuntimeModel({
    program: buildProgram('CRP', 'crp-fallback'),
    weekday: 'mon',
  })
  assert.equal(fallbackCrpRuntime.allocatorDefaultTargetTeam, 'CPPC')

  const roboticRuntime = resolveSpecialProgramRuntimeModel({
    program: buildProgram('Robotic', 'robotic'),
    weekday: 'mon',
  })
  assert.equal(roboticRuntime.allocatorDefaultTargetTeam, 'SMM')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
