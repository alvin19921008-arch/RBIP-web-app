import assert from 'node:assert/strict'

import { resolveSpecialProgramRuntimeModel } from '../../lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '../../types/allocation'

function buildProgram(name: string, id: string): SpecialProgram {
  return {
    id,
    name,
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
    pca_required: 0.25,
    pca_preference_order: [],
  } as any
}

async function main() {
  const roboticRuntime = resolveSpecialProgramRuntimeModel({
    program: buildProgram('Robotic', 'robotic'),
    weekday: 'mon',
    targetTeam: 'SMM',
  })
  assert.equal(roboticRuntime.usesSharedAllocationIdentity, true)

  const crpRuntime = resolveSpecialProgramRuntimeModel({
    program: buildProgram('CRP', 'crp'),
    weekday: 'mon',
    targetTeam: 'GMC',
  })
  assert.equal(crpRuntime.usesSharedAllocationIdentity, true)

  const drmRuntime = resolveSpecialProgramRuntimeModel({
    program: buildProgram('DRM', 'drm'),
    weekday: 'mon',
    targetTeam: 'DRO',
  })
  assert.equal(drmRuntime.usesSharedAllocationIdentity, false)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
