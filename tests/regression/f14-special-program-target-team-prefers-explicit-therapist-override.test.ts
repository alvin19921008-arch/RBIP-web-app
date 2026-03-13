import assert from 'node:assert/strict'

import { buildSpecialProgramTargetTeamById } from '../../lib/utils/specialProgramControllerRuntime'

async function main() {
  const targetTeams = buildSpecialProgramTargetTeamById({
    programs: [
      {
        id: 'crp',
        name: 'CRP',
        staff_ids: ['aggie', 'amanda'],
        weekdays: ['mon'],
        slots: {
          mon: [2],
          tue: [],
          wed: [],
          thu: [],
          fri: [],
        },
        fte_subtraction: {
          aggie: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 },
          amanda: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 },
        },
        pca_required: 0.25,
        pca_preference_order: [],
      } as any,
    ],
    therapistAllocations: [
      {
        staff_id: 'amanda',
        team: 'CPPC',
        special_program_ids: ['crp'],
      } as any,
      {
        staff_id: 'aggie',
        team: 'GMC',
        special_program_ids: ['crp'],
      } as any,
    ] as any,
    overrides: {
      aggie: {
        specialProgramOverrides: [
          {
            programId: 'crp',
            therapistId: 'aggie',
          },
        ],
      },
    },
    day: 'mon',
    staff: [
      {
        id: 'aggie',
        rank: 'SPT',
        team: 'GMC',
      },
      {
        id: 'amanda',
        rank: 'RPT',
        team: 'CPPC',
      },
    ] as any,
  })
  const team = targetTeams.crp

  assert.equal(
    team,
    'GMC',
    `Expected explicit Step 2 therapist override to drive CRP target team to GMC, but got ${team}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
