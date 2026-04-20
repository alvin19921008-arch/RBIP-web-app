import assert from 'node:assert/strict'

import {
  buildProjectedExtraSlotsTooltipLines,
  buildStep31PreviewExtraCoverageOptions,
  countProjectedExtraSlots,
} from '../../lib/features/schedule/step31ProjectedExtraSlots'
import { seededShuffle } from '../../lib/utils/seededRandom'

async function main() {
  assert.equal(
    countProjectedExtraSlots(undefined),
    0,
    'Expected missing extra coverage map to produce zero projected extra slots'
  )

  assert.equal(
    countProjectedExtraSlots({
      'float-1': [3, 4],
      'float-2': [2],
    }),
    3,
    'Expected projected extra slot count to equal the total number of marked extra slots across all floating PCAs'
  )

  assert.deepEqual(
    buildProjectedExtraSlotsTooltipLines({ neededSlots: 24, availableSlots: 26 }),
    [
      'Floating slots still needed after Step 2: 24',
      'Floating PCA available slots pool: 26',
    ],
    'Expected tooltip lines to explain projected extra slots using Step 3 demand vs floating supply'
  )

  assert.deepEqual(
    buildStep31PreviewExtraCoverageOptions({
      mode: 'standard' as const,
      teamOrder: ['FO'],
    }),
    {
      mode: 'standard',
      teamOrder: ['FO'],
      extraCoverageMode: 'round-robin-team-order',
    },
    'Expected Step 3.1 preview allocation options to enable round-robin extra coverage so preview matches the final Extra-tag behavior'
  )

  const input = ['FO', 'SMM', 'DRO', 'NSM']
  const a = seededShuffle(input, '2026-04-20|example')
  const b = seededShuffle(input, '2026-04-20|example')
  assert.deepEqual(a, b, 'Expected seededShuffle to be deterministic for the same seed')
  assert.deepEqual(
    input,
    ['FO', 'SMM', 'DRO', 'NSM'],
    'Expected seededShuffle to not mutate input'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
