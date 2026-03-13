import assert from 'node:assert/strict'

import {
  applySpecialProgramOverrides,
  buildSpecialProgramTargetTeamById,
} from '../../lib/utils/specialProgramControllerRuntime'
import type { SpecialProgram } from '../../types/allocation'
import type { Staff, Team, Weekday } from '../../types/staff'

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
  ]

  const targetTeams = buildSpecialProgramTargetTeamById({
    programs,
    therapistAllocations: [],
    day: 'mon' as Weekday,
    staff,
    overrides: {
      aggie: {
        team: 'DRO',
      },
    },
  })

  assert.equal(
    targetTeams.crp,
    'DRO',
    `Expected target-team fallback to honor schedule staff team override for the configured therapist, but got ${targetTeams.crp ?? null}`
  )

  const modifiedPrograms = applySpecialProgramOverrides({
    specialPrograms: programs,
    overrides: {
      aggie: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            therapistId: 'aggie',
            therapistFTESubtraction: 0,
            requiredSlots: [4],
          },
        ],
      } as any,
      jun: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            pcaId: 'jun',
            slots: [4],
          },
        ],
      } as any,
    },
    weekday: 'mon',
  })

  const modifiedCrp = modifiedPrograms[0] as any
  assert.deepEqual(
    modifiedCrp.slots?.mon,
    [4],
    `Expected controller runtime helper to apply Step 2 requiredSlots override [4], but got ${JSON.stringify(modifiedCrp.slots?.mon)}`
  )
  assert.deepEqual(
    modifiedCrp.__manualPcaCovers,
    [{ pcaId: 'jun', slots: [4] }],
    `Expected controller runtime helper to preserve manual PCA cover slots, but got ${JSON.stringify(modifiedCrp.__manualPcaCovers)}`
  )
  assert.deepEqual(
    modifiedCrp.pca_preference_order,
    ['jun'],
    `Expected controller runtime helper to prioritize manual PCA cover in preference order, but got ${JSON.stringify(modifiedCrp.pca_preference_order)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
