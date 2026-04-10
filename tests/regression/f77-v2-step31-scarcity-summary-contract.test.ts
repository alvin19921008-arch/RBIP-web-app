import assert from 'node:assert/strict'

import { buildV2Step31ScarcitySummary } from '../../lib/features/schedule/step31V2ScarcitySummary'

async function main() {
  assert.equal(
    buildV2Step31ScarcitySummary({
      status: 'ready',
      standardZeroTeams: [],
      balancedShortTeams: [],
      standardProjectedExtraSlots: 0,
    }),
    null,
    'Expected the V2 Step 3.1 scarcity block to stay hidden when both scarcity counts are zero.'
  )

  assert.deepEqual(
    buildV2Step31ScarcitySummary({
      status: 'ready',
      standardZeroTeams: ['MC'],
      balancedShortTeams: ['MC'],
      standardProjectedExtraSlots: 0,
    }),
    {
      zeroTeams: ['MC'],
      shortTeams: ['MC'],
      zeroCount: 1,
      shortCount: 1,
      projectedExtraSlots: 0,
      showProjectedExtraSlots: false,
    },
    'Expected the V2 Step 3.1 scarcity summary to expose compact count/team data and hide projected extra coverage when the value is zero.'
  )

  assert.deepEqual(
    buildV2Step31ScarcitySummary({
      status: 'ready',
      standardZeroTeams: ['CPPC', 'MC'],
      balancedShortTeams: ['MC'],
      standardProjectedExtraSlots: 2,
    })?.showProjectedExtraSlots,
    true,
    'Expected projected extra coverage to remain available only when the value is greater than zero.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
