import assert from 'node:assert/strict'

import { buildSpecialProgramControllerRuntimeState } from '../../lib/utils/specialProgramControllerRuntime'
import type { SpecialProgram } from '../../types/allocation'
import type { Staff, Weekday } from '../../types/staff'
import type { TherapistAllocation } from '../../types/schedule'

async function main() {
  const programs: SpecialProgram[] = [
    {
      id: 'crp',
      name: 'CRP',
      weekdays: ['mon'],
      staff_ids: ['aggie'],
      slots: { mon: [3], tue: [], wed: [], thu: [], fri: [] },
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
      pca_preference_order: [],
      pca_required: 0.25,
    } as any,
    {
      id: 'drm',
      name: 'DRM',
      weekdays: ['mon'],
      staff_ids: ['dina'],
      slots: { mon: [1], tue: [], wed: [], thu: [], fri: [] },
      fte_subtraction: {
        dina: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 },
      },
      staff_configs: [],
      pca_preference_order: [],
      pca_required: 0,
    } as any,
  ]

  const staff: Staff[] = [
    {
      id: 'aggie',
      name: 'Aggie',
      rank: 'SPT',
      team: 'GMC',
      status: 'active',
      floating: false,
      floor_pca: false as any,
    } as any,
    {
      id: 'dina',
      name: 'Dina',
      rank: 'RPT',
      team: 'DRO',
      status: 'active',
      floating: false,
      floor_pca: false as any,
    } as any,
  ]

  const therapistAllocations: TherapistAllocation[] = [
    {
      staff_id: 'aggie',
      team: 'DRO',
      special_program_ids: ['crp'],
    } as any,
  ]

  const runtimeState = buildSpecialProgramControllerRuntimeState({
    specialPrograms: programs,
    therapistAllocations,
    day: 'mon' as Weekday,
    staff,
    overrides: {
      aggie: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            therapistId: 'aggie',
            requiredSlots: [4],
          },
        ],
      } as any,
      helper: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            pcaId: 'helper',
            slots: [4],
          },
        ],
      } as any,
      dina: {
        specialProgramOverrides: [
          {
            programId: 'drm',
            enabled: false,
          },
        ],
      } as any,
    },
  })

  assert.deepEqual(
    (runtimeState.specialPrograms.find((program) => program.id === 'crp') as any)?.slots?.mon,
    [4],
    `Expected bundled controller runtime state to expose overridden CRP slots [4], but got ${JSON.stringify(
      (runtimeState.specialPrograms.find((program) => program.id === 'crp') as any)?.slots?.mon
    )}`
  )

  assert.equal(
    runtimeState.specialProgramTargetTeamById.crp,
    'DRO',
    `Expected bundled controller runtime state to preserve explicit therapist-driven CRP target team DRO, but got ${runtimeState.specialProgramTargetTeamById.crp ?? null}`
  )

  assert.equal(
    (runtimeState.specialPrograms.find((program) => program.id === 'drm') as any)?.weekdays?.includes('mon'),
    false,
    'Expected bundled controller runtime state to remove disabled DRM from the active weekday list'
  )

  assert.equal(
    runtimeState.specialProgramTargetTeamById.drm ?? null,
    null,
    `Expected bundled controller runtime state to omit target-team routing for disabled DRM, but got ${runtimeState.specialProgramTargetTeamById.drm ?? null}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
