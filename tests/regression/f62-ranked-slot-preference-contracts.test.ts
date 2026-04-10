import assert from 'node:assert/strict'

import { buildEffectiveRankedPreferences } from '../../lib/algorithms/floatingPcaV2/effectivePreferences'
import { compareScores, type RankedSlotAllocationScore } from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import { getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'

function score(partial: Partial<RankedSlotAllocationScore>): RankedSlotAllocationScore {
  return {
    highestRankCoverage: 0,
    fairnessSatisfied: 0,
    totalFulfilledPendingQuarterSlots: 0,
    duplicateFloatingCount: 0,
    splitPenalty: 0,
    ...partial,
  }
}

async function main() {
  const pref: PCAPreference = {
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: ['pca-a', 'pca-b'],
    preferred_slots: [1, 3],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }

  const info = getTeamPreferenceInfo('FO', [pref])

  assert.deepEqual(info.rankedSlots, [1, 3])
  assert.deepEqual(info.unrankedNonGymSlots, [2])
  assert.deepEqual(info.duplicateRankOrder, [1, 3, 2])
  assert.equal(info.gymSlot, 4)
  assert.equal(info.avoidGym, true)
  assert.equal(info.preferredSlot, 1)

  // JSON/DB may return numeric strings; helpers must still recognize ranked order and gym slot.
  const prefStringy = {
    ...pref,
    preferred_slots: ['2', '1'] as unknown as number[],
    gym_schedule: '4' as unknown as number,
  }
  const infoStringy = getTeamPreferenceInfo('FO', [prefStringy as PCAPreference])
  assert.deepEqual(infoStringy.rankedSlots, [2, 1])
  assert.equal(infoStringy.gymSlot, 4)
  assert.deepEqual(infoStringy.unrankedNonGymSlots, [3])

  // When gym appears in the ranked list and avoid_gym is on, duplicate-rank ladder must not
  // treat gym as an earlier duplicate target than unranked non-gym slots.
  const prefGymRanked: PCAPreference = {
    id: 'pref-gym-ranked',
    team: 'SMM',
    preferred_pca_ids: [],
    preferred_slots: [1, 4],
    gym_schedule: 4,
    avoid_gym_schedule: true,
  }
  const gymRankedInfo = getTeamPreferenceInfo('SMM', [prefGymRanked])
  assert.deepEqual(gymRankedInfo.rankedSlots, [1, 4])
  assert.deepEqual(gymRankedInfo.duplicateRankOrder, [1, 2, 3])

  // Effective ranked preferences: base ranked slots must survive Step 3.2/3.3 PCA selections.
  const baseFo: PCAPreference = {
    id: 'pref-fo-base',
    team: 'FO',
    preferred_pca_ids: ['pca-a', 'pca-b'],
    preferred_slots: [2, 1],
  }
  const effectiveMerged = buildEffectiveRankedPreferences([baseFo], [
    { team: 'FO', pcaId: 'pca-picked' },
  ])
  const foEff = effectiveMerged.find((p) => p.team === 'FO')
  assert.deepEqual(foEff?.preferred_slots, [2, 1])
  assert.deepEqual(foEff?.preferred_pca_ids, ['pca-picked'])

  const effectiveOrdered = buildEffectiveRankedPreferences([baseFo], [
    { team: 'FO', pcaId: 'pca-second' },
    { team: 'FO', pcaId: 'pca-first' },
    { team: 'FO', pcaId: 'pca-second' },
  ])
  assert.deepEqual(effectiveOrdered.find((p) => p.team === 'FO')?.preferred_slots, [2, 1])
  assert.deepEqual(
    effectiveOrdered.find((p) => p.team === 'FO')?.preferred_pca_ids,
    ['pca-second', 'pca-first']
  )

  const effectiveNoSelection = buildEffectiveRankedPreferences([baseFo], [])
  assert.deepEqual(effectiveNoSelection.find((p) => p.team === 'FO')?.preferred_pca_ids, [
    'pca-a',
    'pca-b',
  ])

  // Schedule score comparator: lexicographic quality order (higher is better for the first three
  // metrics; lower is better for duplicates and split penalty).
  assert.ok(compareScores(score({ highestRankCoverage: 2 }), score({ highestRankCoverage: 1 })) < 0)
  assert.ok(compareScores(score({ highestRankCoverage: 1 }), score({ highestRankCoverage: 2 })) > 0)

  const tieRank = { highestRankCoverage: 1 }
  assert.ok(
    compareScores(score({ ...tieRank, fairnessSatisfied: 2 }), score({ ...tieRank, fairnessSatisfied: 1 })) < 0
  )
  assert.ok(
    compareScores(score({ ...tieRank, fairnessSatisfied: 1 }), score({ ...tieRank, fairnessSatisfied: 2 })) > 0
  )

  const tieFair = { highestRankCoverage: 1, fairnessSatisfied: 1 }
  assert.ok(
    compareScores(
      score({ ...tieFair, totalFulfilledPendingQuarterSlots: 8 }),
      score({ ...tieFair, totalFulfilledPendingQuarterSlots: 4 })
    ) < 0
  )

  const tiePending = { ...tieFair, totalFulfilledPendingQuarterSlots: 4 }
  assert.ok(
    compareScores(
      score({ ...tiePending, duplicateFloatingCount: 0 }),
      score({ ...tiePending, duplicateFloatingCount: 3 })
    ) < 0
  )
  assert.ok(
    compareScores(
      score({ ...tiePending, duplicateFloatingCount: 2 }),
      score({ ...tiePending, duplicateFloatingCount: 1 })
    ) > 0
  )

  const tieDup = { ...tiePending, duplicateFloatingCount: 1 }
  assert.ok(compareScores(score({ ...tieDup, splitPenalty: 1 }), score({ ...tieDup, splitPenalty: 4 })) < 0)
  assert.ok(compareScores(score({ ...tieDup, splitPenalty: 5 }), score({ ...tieDup, splitPenalty: 2 })) > 0)

  assert.equal(compareScores(score({ highestRankCoverage: 3 }), score({ highestRankCoverage: 3 })), 0)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
