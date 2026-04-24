/**
 * Repair-candidate tie-breaking when `compareScores` returns 0 (lexicographic score equality).
 *
 * Used by `allocator.ts` when choosing among equally good repair moves. For A1 keys, swap-shaped
 * moves (`a1:swap:`) outrank single-sided peels (`a1:peel:`), which outrank legacy `a1:` keys
 * that omit the peel/swap discriminator (older fixtures).
 *
 * **Donor relief (after `b1:donate`, queue non-empty, same iteration only):** when scores tie,
 * never override a strictly better score — only `compareScores === 0` paths call here. Order:
 * 1. `a1:peel:` whose rescue is in the donor queue — prefer peel toward the **earlier** (higher-need)
 *    team in `priorityDonorsOrdered` (same convention as queue sort: index 0 = worst deprivation).
 * 2. Among remaining ties, existing A1 ordering: `a1:swap:` before `a1:peel:` before legacy `a1:`,
 *    then `localeCompare` on sortKey.
 * 3. Non-A1 pairs: `localeCompare` (lower wins).
 */

import type { Team } from '@/types/staff'
import { parseA1PeelRescueTeam } from '@/lib/algorithms/floatingPcaV2/donorReliefPolicy'

export type DonorReliefTieBreakContext = {
  active: boolean
  priorityDonorsOrdered: readonly Team[]
}

/** Lower rank = preferred when scores tie, and = earlier in repair candidate scan order (see `generateRepairCandidates` + `MAX_CANDIDATES_PER_DEFECT`). */
function a1RepairSortKeyKindRank(sortKey: string): number {
  if (sortKey.startsWith('a1:swap:')) return 0
  if (sortKey.startsWith('a1:peel:')) return 1
  return 2
}

/**
 * Sort order for A1 repair keys: swap before peel before legacy `a1:…`, then `localeCompare`
 * (so the bounded candidate slice is more likely to include swap-shaped moves than peel-only order).
 */
export function compareA1RepairSortKeysForScanOrder(a: string, b: string): number {
  const ra = a1RepairSortKeyKindRank(a)
  const rb = a1RepairSortKeyKindRank(b)
  if (ra !== rb) return ra - rb
  return a.localeCompare(b)
}

function peelRescueIndexInDonorQueue(sortKey: string, queue: readonly Team[]): number | null {
  if (!sortKey.startsWith('a1:peel:')) return null
  const rescue = parseA1PeelRescueTeam(sortKey)
  if (!rescue) return null
  const idx = queue.indexOf(rescue)
  return idx >= 0 ? idx : null
}

/**
 * Whether the first sort key should replace the second when repair scores are equal.
 *
 * @param newCandidateSortKey — proposed repair (`candidate.sortKey` in the allocator loop)
 * @param currentBestSortKey — incumbent best-at-tie (`bestCandidate.sortKey`)
 * @returns true if the new candidate should win the tie (same direction as
 *   `newCandidateSortKey.localeCompare(currentBestSortKey) < 0` for non-A1 keys)
 */
export function shouldPreferFirstRepairOnScoreTie(
  newCandidateSortKey: string,
  currentBestSortKey: string,
  donorRelief?: DonorReliefTieBreakContext
): boolean {
  if (donorRelief?.active && donorRelief.priorityDonorsOrdered.length > 0) {
    const queue = donorRelief.priorityDonorsOrdered
    const newIdx = peelRescueIndexInDonorQueue(newCandidateSortKey, queue)
    const bestIdx = peelRescueIndexInDonorQueue(currentBestSortKey, queue)
    if (newIdx != null || bestIdx != null) {
      if (newIdx != null && bestIdx != null) {
        if (newIdx !== bestIdx) return newIdx < bestIdx
      } else if (newIdx != null) {
        return true
      } else {
        return false
      }
    }
  }

  const candA1 = newCandidateSortKey.startsWith('a1:')
  const bestA1 = currentBestSortKey.startsWith('a1:')
  if (candA1 && bestA1) {
    const rCand = a1RepairSortKeyKindRank(newCandidateSortKey)
    const rBest = a1RepairSortKeyKindRank(currentBestSortKey)
    if (rCand !== rBest) {
      return rCand < rBest
    }
    return newCandidateSortKey.localeCompare(currentBestSortKey) < 0
  }
  return newCandidateSortKey.localeCompare(currentBestSortKey) < 0
}
