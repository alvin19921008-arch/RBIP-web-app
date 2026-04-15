/**
 * Lexicographic schedule quality for ranked-slot V2 audit/repair (design objective order).
 */

import type { Team } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { RankedV2RepairDefect } from '@/lib/algorithms/floatingPcaV2/repairAudit'
import type { TeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { computeAmPmSessionBalanceTeamScores } from '@/lib/algorithms/floatingPcaV2/amPmSessionBalance'

export type RankedSlotAllocationScore = {
  highestRankCoverage: number
  rankedCoverageSatisfied: number
  fairnessSatisfied: number
  totalFulfilledPendingQuarterSlots: number
  gymLastResortCount: number
  rankedSlotMatchCount: number
  duplicateFloatingCount: number
  splitPenalty: number
  /** True Step 3–owned: higher first-rank coverage (lower first fulfilled index) for optional promotion tie-break. */
  promotionTrueStep3RankScore: number
  /** True Step 3–owned slots on preferred PCAs (tier 2 after rank score). */
  promotionTrueStep3PreferredPcaHits: number
  /** Task Group D: summed per-team spread preference (higher better); neutral tiers contribute 0. */
  amPmSessionBalanceSpreadScore: number
  /** Task Group D: summed per-team deterministic tie among same spread class (higher better). */
  amPmSessionBalanceDetailScore: number
}

/**
 * Compare two schedule scores. Returns a negative value if `a` is strictly better than `b`, positive
 * if `b` is better, 0 if equal.
 *
 * Objective order (higher is better for the first four; lower is better for duplicates and splits):
 * 1. ranked coverage — `highestRankCoverage`
 * 2. ranked-gap satisfaction — `rankedCoverageSatisfied`
 * 3. fairness floor — `fairnessSatisfied`
 * 4. fulfilled pending — `totalFulfilledPendingQuarterSlots`
 * 5. gym last resort — `gymLastResortCount` (lower is better)
 * 6. preserve ranked-slot ownership — `rankedSlotMatchCount`
 * 7. duplicates — `duplicateFloatingCount`
 * 8. split count — `splitPenalty`
 *
 * Optional ranked promotion (Part II): when `includeOptionalPromotionTieBreak` is true and all of the
 * above are equal, compare `promotionTrueStep3RankScore` then `promotionTrueStep3PreferredPcaHits`
 * (rank uplift before preferred PCA).
 *
 * AM/PM session balance (Task Group D): when `includeAmPmSessionBalanceTieBreak` is true, compare
 * `amPmSessionBalanceSpreadScore` then `amPmSessionBalanceDetailScore` **after** `splitPenalty`.
 * If `includeOptionalPromotionTieBreak` is also true, those AM/PM fields run **only after** the
 * promotion pair ties (never before promotion rank / preferred PCA when promotion tie-break is on).
 */
export function compareScores(
  a: RankedSlotAllocationScore,
  b: RankedSlotAllocationScore,
  options?: {
    includeOptionalPromotionTieBreak?: boolean
    includeAmPmSessionBalanceTieBreak?: boolean
  }
): number {
  if (a.highestRankCoverage !== b.highestRankCoverage) {
    return b.highestRankCoverage - a.highestRankCoverage
  }
  if (a.rankedCoverageSatisfied !== b.rankedCoverageSatisfied) {
    return b.rankedCoverageSatisfied - a.rankedCoverageSatisfied
  }
  if (a.fairnessSatisfied !== b.fairnessSatisfied) {
    return b.fairnessSatisfied - a.fairnessSatisfied
  }
  if (a.totalFulfilledPendingQuarterSlots !== b.totalFulfilledPendingQuarterSlots) {
    return b.totalFulfilledPendingQuarterSlots - a.totalFulfilledPendingQuarterSlots
  }
  if (a.gymLastResortCount !== b.gymLastResortCount) {
    return a.gymLastResortCount - b.gymLastResortCount
  }
  if (a.rankedSlotMatchCount !== b.rankedSlotMatchCount) {
    return b.rankedSlotMatchCount - a.rankedSlotMatchCount
  }
  if (a.duplicateFloatingCount !== b.duplicateFloatingCount) {
    return a.duplicateFloatingCount - b.duplicateFloatingCount
  }
  if (a.splitPenalty !== b.splitPenalty) {
    return a.splitPenalty - b.splitPenalty
  }
  if (options?.includeOptionalPromotionTieBreak) {
    if (a.promotionTrueStep3RankScore !== b.promotionTrueStep3RankScore) {
      return b.promotionTrueStep3RankScore - a.promotionTrueStep3RankScore
    }
    if (a.promotionTrueStep3PreferredPcaHits !== b.promotionTrueStep3PreferredPcaHits) {
      return b.promotionTrueStep3PreferredPcaHits - a.promotionTrueStep3PreferredPcaHits
    }
  }
  if (options?.includeAmPmSessionBalanceTieBreak) {
    if (a.amPmSessionBalanceSpreadScore !== b.amPmSessionBalanceSpreadScore) {
      return b.amPmSessionBalanceSpreadScore - a.amPmSessionBalanceSpreadScore
    }
    if (a.amPmSessionBalanceDetailScore !== b.amPmSessionBalanceDetailScore) {
      return b.amPmSessionBalanceDetailScore - a.amPmSessionBalanceDetailScore
    }
  }
  return 0
}

type BuildScoreArgs = {
  allocations: PCAAllocation[]
  initialPendingFTE: Record<Team, number>
  pendingFTE: Record<Team, number>
  teamOrder: Team[]
  defects: RankedV2RepairDefect[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  /** When set with [floatingPcaIds], promotion tie-break metrics use true Step 3–owned floating only. */
  baselineAllocations?: PCAAllocation[]
  floatingPcaIds?: Set<string>
}

const VALID_SLOTS = [1, 2, 3, 4] as const

function hasMeaningfulPending(value: number | undefined): boolean {
  return Math.round(((value ?? 0) + 1e-9) / 0.25) >= 1
}

function getSlotOwner(
  allocation: PCAAllocation,
  slot: (typeof VALID_SLOTS)[number]
): Team | null {
  if (slot === 1) return allocation.slot1
  if (slot === 2) return allocation.slot2
  if (slot === 3) return allocation.slot3
  return allocation.slot4
}

function getBaselineSlotTeam(
  allocation: PCAAllocation | undefined,
  slot: (typeof VALID_SLOTS)[number]
): Team | null {
  if (!allocation) return null
  return getSlotOwner(allocation, slot)
}

function getTrueStep3FloatingSlotsForTeam(
  allocations: PCAAllocation[],
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>,
  team: Team
): Set<(typeof VALID_SLOTS)[number]> {
  const slots = new Set<(typeof VALID_SLOTS)[number]>()
  for (const allocation of allocations) {
    if (!floatingPcaIds.has(allocation.staff_id)) continue
    const baseline = baselineByStaffId.get(allocation.staff_id)
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) !== team) continue
      if (getBaselineSlotTeam(baseline, slot) === team) continue
      slots.add(slot)
    }
  }
  return slots
}

function computePromotionTrueStep3Metrics(
  args: BuildScoreArgs,
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>
): { promotionTrueStep3RankScore: number; promotionTrueStep3PreferredPcaHits: number } {
  let promotionTrueStep3RankScore = 0
  let promotionTrueStep3PreferredPcaHits = 0

  for (const team of args.teamOrder) {
    if (!hasMeaningfulPending(args.initialPendingFTE[team])) continue
    const pref = args.teamPrefs[team]
    const rankedSlots = pref.rankedSlots.filter(
      (slot): slot is (typeof VALID_SLOTS)[number] =>
        VALID_SLOTS.includes(slot as (typeof VALID_SLOTS)[number]) &&
        !(pref.avoidGym && pref.gymSlot === slot)
    )
    if (rankedSlots.length === 0) continue

    const trueSlots = getTrueStep3FloatingSlotsForTeam(
      args.allocations,
      baselineByStaffId,
      floatingPcaIds,
      team
    )
    const firstIdx = rankedSlots.findIndex((slot) => trueSlots.has(slot))
    if (firstIdx >= 0) {
      promotionTrueStep3RankScore += rankedSlots.length - firstIdx
    }

    for (const allocation of args.allocations) {
      if (!floatingPcaIds.has(allocation.staff_id)) continue
      if (!pref.preferredPCAIds.includes(allocation.staff_id)) continue
      const baseline = baselineByStaffId.get(allocation.staff_id)
      for (const slot of VALID_SLOTS) {
        if (getSlotOwner(allocation, slot) !== team) continue
        if (getBaselineSlotTeam(baseline, slot) === team) continue
        promotionTrueStep3PreferredPcaHits += 1
      }
    }
  }

  return { promotionTrueStep3RankScore, promotionTrueStep3PreferredPcaHits }
}

function getAssignedSlotsForTeam(allocations: PCAAllocation[], team: Team): number[] {
  const slots: number[] = []
  for (const allocation of allocations) {
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) === team) {
        slots.push(slot)
      }
    }
  }
  return slots
}

/** Step-3 floating PCA rows only — used for AM/PM session balance when [floatingPcaIds] is supplied. */
function getAssignedSlotsForTeamFromFloatingPcasOnly(
  allocations: PCAAllocation[],
  team: Team,
  floatingPcaIds: Set<string>
): number[] {
  const slots: number[] = []
  for (const allocation of allocations) {
    if (!floatingPcaIds.has(allocation.staff_id)) continue
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) === team) {
        slots.push(slot)
      }
    }
  }
  return slots
}

function getRankedSlotMatchCountForTeam(
  allocations: PCAAllocation[],
  team: Team,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): number {
  const pref = teamPrefs[team]
  const rankedSlots = new Set(
    pref.rankedSlots.filter(
      (slot): slot is (typeof VALID_SLOTS)[number] =>
        VALID_SLOTS.includes(slot as (typeof VALID_SLOTS)[number]) &&
        !(pref.avoidGym && pref.gymSlot === slot)
    )
  )
  if (rankedSlots.size === 0) return 0

  let count = 0
  for (const allocation of allocations) {
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) === team && rankedSlots.has(slot)) {
        count += 1
      }
    }
  }
  return count
}

function getDistinctPcaCountForTeam(allocations: PCAAllocation[], team: Team): number {
  const pcaIds = new Set<string>()
  for (const allocation of allocations) {
    if (VALID_SLOTS.some((slot) => getSlotOwner(allocation, slot) === team)) {
      pcaIds.add(allocation.staff_id)
    }
  }
  return pcaIds.size
}

export function buildRankedSlotAllocationScore(args: BuildScoreArgs): RankedSlotAllocationScore {
  let highestRankCoverage = 0
  let rankedCoverageSatisfied = 0
  let totalFulfilledPendingQuarterSlots = 0
  let gymLastResortCount = 0
  let rankedSlotMatchCount = 0
  let duplicateFloatingCount = 0
  let splitPenalty = 0
  let promotionTrueStep3RankScore = 0
  let promotionTrueStep3PreferredPcaHits = 0
  let amPmSessionBalanceSpreadScore = 0
  let amPmSessionBalanceDetailScore = 0

  for (const team of args.teamOrder) {
    const pref = args.teamPrefs[team]
    const assignedSlots = getAssignedSlotsForTeam(args.allocations, team)
    const assignedSlotSet = new Set(assignedSlots)
    const assignedSlotsForSessionBalance =
      args.floatingPcaIds != null
        ? getAssignedSlotsForTeamFromFloatingPcasOnly(args.allocations, team, args.floatingPcaIds)
        : assignedSlots

    const firstRankIndex = pref.rankedSlots.findIndex((slot) => assignedSlotSet.has(slot))
    if (firstRankIndex >= 0) {
      highestRankCoverage += pref.rankedSlots.length - firstRankIndex
    }

    const initialSlots = Math.round(((args.initialPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const remainingSlots = Math.round(((args.pendingFTE[team] ?? 0) + 1e-9) / 0.25)
    totalFulfilledPendingQuarterSlots += Math.max(0, initialSlots - remainingSlots)
    rankedSlotMatchCount += getRankedSlotMatchCountForTeam(args.allocations, team, args.teamPrefs)

    for (const slot of VALID_SLOTS) {
      const count = assignedSlots.filter((assignedSlot) => assignedSlot === slot).length
      if (count > 1) duplicateFloatingCount += count - 1
    }

    if (pref.avoidGym && pref.gymSlot != null) {
      const gym = pref.gymSlot
      if (gym === 1 || gym === 2 || gym === 3 || gym === 4) {
        gymLastResortCount += countGymLastResortUsesForTeam(args.allocations, team, gym)
      }
    }

    const distinctPcas = getDistinctPcaCountForTeam(args.allocations, team)
    if (distinctPcas > 1) splitPenalty += distinctPcas - 1

    const amPm = computeAmPmSessionBalanceTeamScores(
      args.initialPendingFTE[team] ?? 0,
      assignedSlotsForSessionBalance
    )
    amPmSessionBalanceSpreadScore += amPm.spreadScore
    amPmSessionBalanceDetailScore += amPm.detailScore
  }

  const fairnessPendingTeams = args.teamOrder.filter((team) =>
    hasMeaningfulPending(args.initialPendingFTE[team])
  ).length
  const rankedPendingTeams = args.teamOrder.filter(
    (team) => hasMeaningfulPending(args.initialPendingFTE[team]) && args.teamPrefs[team].rankedSlots.length > 0
  ).length
  const rankedViolationCount = args.defects.filter((defect) => defect.kind === 'B1').length
  const fairnessViolationCount = args.defects.filter((defect) => defect.kind === 'F1').length
  rankedCoverageSatisfied = Math.max(0, rankedPendingTeams - rankedViolationCount)
  const fairnessSatisfied = Math.max(0, fairnessPendingTeams - fairnessViolationCount)

  if (args.baselineAllocations != null && args.floatingPcaIds != null) {
    const baselineByStaffId = new Map<string, PCAAllocation | undefined>()
    for (const row of args.baselineAllocations) {
      baselineByStaffId.set(row.staff_id, row)
    }
    const promo = computePromotionTrueStep3Metrics(args, baselineByStaffId, args.floatingPcaIds)
    promotionTrueStep3RankScore = promo.promotionTrueStep3RankScore
    promotionTrueStep3PreferredPcaHits = promo.promotionTrueStep3PreferredPcaHits
  }

  return {
    highestRankCoverage,
    rankedCoverageSatisfied,
    fairnessSatisfied,
    totalFulfilledPendingQuarterSlots,
    gymLastResortCount,
    rankedSlotMatchCount,
    duplicateFloatingCount,
    splitPenalty,
    promotionTrueStep3RankScore,
    promotionTrueStep3PreferredPcaHits,
    amPmSessionBalanceSpreadScore,
    amPmSessionBalanceDetailScore,
  }
}

function countGymLastResortUsesForTeam(
  allocations: PCAAllocation[],
  team: Team,
  gymSlot: number
): number {
  let uses = 0
  for (const allocation of allocations) {
    for (const slot of VALID_SLOTS) {
      if (slot !== gymSlot) continue
      if (getSlotOwner(allocation, slot) === team) {
        uses += 1
      }
    }
  }
  return uses
}
