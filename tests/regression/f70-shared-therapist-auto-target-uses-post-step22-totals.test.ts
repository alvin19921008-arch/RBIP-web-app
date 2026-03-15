import assert from 'node:assert/strict'

import { getSharedTherapistSuggestedTeam } from '../../lib/features/schedule/sharedTherapistStep'

async function main() {
  assert.equal(
    getSharedTherapistSuggestedTeam({
      ptPerTeamByTeam: {
        FO: 4,
        SMM: 3.25,
        SFM: 2.75,
        CPPC: 3,
        MC: 3.5,
        GMC: 3.25,
        NSM: 3,
        DRO: 3.25,
      },
    }),
    'SFM',
    'Expected Step 2.3 auto target to use the post-Step-2.2 PT totals directly, so MC 3.5 and SFM 2.75 suggests SFM'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
