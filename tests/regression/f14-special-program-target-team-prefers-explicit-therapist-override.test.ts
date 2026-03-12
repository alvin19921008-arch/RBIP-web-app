import assert from 'node:assert/strict'

import { resolveSpecialProgramTargetTeam } from '../../lib/utils/specialProgramTargetTeam'

async function main() {
  const team = resolveSpecialProgramTargetTeam({
    programId: 'crp',
    therapistAllocations: [
      {
        staff_id: 'amanda',
        team: 'CPPC',
        special_program_ids: ['crp'],
      },
      {
        staff_id: 'aggie',
        team: 'GMC',
        special_program_ids: ['crp'],
      },
    ],
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
  })

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
