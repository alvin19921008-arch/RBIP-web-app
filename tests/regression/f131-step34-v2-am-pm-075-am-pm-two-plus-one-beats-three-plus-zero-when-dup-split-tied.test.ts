import assert from 'node:assert/strict'

import { compareScores, type RankedSlotAllocationScore } from '../../lib/algorithms/floatingPcaV2/scoreSchedule'

/**
 * 0.75 FTE tier (see design **0.75 pending** ladder): AM/PM must prefer **2+1** over **3+0** when
 * lexicographic tiers **1–8** and optional promotion tiers are tied.
 *
 * Allocator integration uses `buildRankedSlotAllocationScore` + real allocations in **f126** / **f129**–**f130**.
 * Here we use **synthetic** `RankedSlotAllocationScore` rows: with only four clock slots and two session
 * bands, a **3+0** band histogram for **three** distinct quarter slots **without** duplicate pressure is
 * geometrically impossible, so dup/split cannot stay tied against a **no-duplicate 2+1** floating slice in
 * a single minimal real pair. The synthetic pair pins the **tier 9–10** contract (`amPmSessionBalance*`).
 */

function main() {
  const shared: Omit<RankedSlotAllocationScore, 'amPmSessionBalanceSpreadScore' | 'amPmSessionBalanceDetailScore'> = {
    highestRankCoverage: 0,
    rankedCoverageSatisfied: 8,
    fairnessSatisfied: 8,
    totalFulfilledPendingQuarterSlots: 3,
    gymLastResortCount: 0,
    rankedSlotMatchCount: 0,
    duplicateFloatingCount: 0,
    splitPenalty: 1,
    promotionTrueStep3RankScore: 0,
    promotionTrueStep3PreferredPcaHits: 0,
  }

  /** Represents a 2+1-style session spread (higher spread + detail). */
  const twoPlusOne: RankedSlotAllocationScore = {
    ...shared,
    amPmSessionBalanceSpreadScore: 1,
    amPmSessionBalanceDetailScore: 201,
  }
  /** Represents a 3+0-style session concentration (worse at AM/PM tier). */
  const threePlusZero: RankedSlotAllocationScore = {
    ...shared,
    amPmSessionBalanceSpreadScore: 0,
    amPmSessionBalanceDetailScore: 0,
  }

  const fullOpts = {
    includeOptionalPromotionTieBreak: true,
    includeAmPmSessionBalanceTieBreak: true,
  } as const

  assert.ok(
    compareScores(twoPlusOne, threePlusZero, fullOpts) < 0,
    '2+1 must beat 3+0 at AM/PM when duplicate, split, and promotion tiers are tied.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
