import assert from 'node:assert/strict'

import {
  buildProjectedExtraSlotsTooltipLines,
  buildStep31PreviewExtraCoverageOptions,
  countProjectedExtraSlots,
} from '../../lib/features/schedule/step31ProjectedExtraSlots'
import { computeStep31ExtraAfterNeedsBudget } from '../../lib/features/schedule/step3ExtraAfterNeedsBudget'
import { createEmptyTeamRecord } from '../../lib/utils/types'
import { seededShuffle } from '../../lib/utils/seededRandom'
import type { Team } from '../../types/staff'

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

  const teams: Team[] = ['FO', 'SMM', 'DRO', 'NSM']
  const avg: Record<Team, number> = {
    ...createEmptyTeamRecord(0),
    FO: 1.13,
    SMM: 1.13,
    DRO: 1.13,
    NSM: 1.13,
  }
  const existing: Record<Team, number> = {
    ...createEmptyTeamRecord(0),
    FO: 1.0,
    SMM: 1.0,
    DRO: 1.0,
    NSM: 1.0,
  }
  const pending: Record<Team, number> = {
    ...createEmptyTeamRecord(0),
    FO: 0.0,
    SMM: 0.0,
    DRO: 0.25,
    NSM: 0.25,
  }

  const noSpare = computeStep31ExtraAfterNeedsBudget({
    teams,
    avgByTeam: avg,
    existingAssignedFteByTeam: existing,
    pendingFloatingFteByTeam: pending,
    availableFloatingSlots: 2,
    tieBreakSeed: '2026-04-20',
  })
  assert.equal(noSpare.poolSpareSlots, 0)
  assert.equal(noSpare.extraBudgetSlots, 0, 'Expected no extras when pool spare is zero')

  const withSpare = computeStep31ExtraAfterNeedsBudget({
    teams,
    avgByTeam: avg,
    existingAssignedFteByTeam: existing,
    pendingFloatingFteByTeam: pending,
    availableFloatingSlots: 3,
    tieBreakSeed: '2026-04-20',
  })
  assert.equal(withSpare.poolSpareSlots, 1)
  assert.equal(withSpare.extraBudgetSlots, 1, 'Expected one extra when aggregate qualifies and pool spare is one')
  assert.ok(withSpare.recipientsPreview.length > 0)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
