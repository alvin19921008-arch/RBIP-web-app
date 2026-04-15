import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { compareScores, type RankedSlotAllocationScore } from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import {
  generateOptionalPromotionCandidates,
  type Step3CommittedFloatingAnchor,
} from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * AM/PM session balance is **scoring-only** (`compareScores` / `buildRankedSlotAllocationScore`).
 * Optional promotion and repair **never** emit moves that relocate Step 3.2 / 3.3 commits
 * (`committedStep3Anchors`), regardless of `includeAmPmSessionBalanceTieBreak` in the allocator.
 *
 * (i) Reuse the f120 immutability fixture: with anchors, optional promotion candidate list is empty.
 * (ii) Lexicographic AM/PM can strictly prefer a synthetic score tuple with higher spread/detail, but
 * that preference cannot be realized by relocating an anchor — the better layout is unreachable
 * through gated candidate generators.
 */

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return {
    FO: value,
    SMM: value,
    SFM: value,
    CPPC: value,
    MC: value,
    GMC: value,
    NSM: value,
    DRO: value,
  }
}

function makePca(id: string, slots: number[]): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots: slots,
    floor_pca: ['upper'],
  } as PCAData
}

function makeAllocation(
  staffId: string,
  slots: Partial<Record<'slot1' | 'slot2' | 'slot3' | 'slot4', Team | null>>
): PCAAllocation {
  return {
    id: `alloc-${staffId}`,
    schedule_id: '',
    staff_id: staffId,
    team: null,
    fte_pca: 1,
    fte_remaining: 0.5,
    slot_assigned: 0.5,
    slot_whole: null,
    slot1: slots.slot1 ?? null,
    slot2: slots.slot2 ?? null,
    slot3: slots.slot3 ?? null,
    slot4: slots.slot4 ?? null,
    leave_type: null,
    special_program_ids: null,
  }
}

function countAssignedSlotsByTeam(allocations: PCAAllocation[]): Record<Team, number> {
  const counts = { ...emptyTeamRecord(0) }
  for (const allocation of allocations) {
    if (allocation.slot1) counts[allocation.slot1] += 1
    if (allocation.slot2) counts[allocation.slot2] += 1
    if (allocation.slot3) counts[allocation.slot3] += 1
    if (allocation.slot4) counts[allocation.slot4] += 1
  }
  return counts
}

function computePendingLikeAllocator(
  initialPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>,
  allocations: PCAAllocation[]
): Record<Team, number> {
  const finalAssignedCounts = countAssignedSlotsByTeam(allocations)
  const next = { ...emptyTeamRecord(0) }
  for (const team of TEAMS) {
    const pendingSlotsAtStep34Start = Math.round(((initialPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const newlyCoveredSlots = finalAssignedCounts[team] - baselineAssignedSlots[team]
    const remainingSlots = Math.max(0, pendingSlotsAtStep34Start - newlyCoveredSlots)
    next[team] = remainingSlots * 0.25
  }
  return next
}

function main() {
  const teamOrder: Team[] = ['CPPC', 'GMC', 'FO', 'SMM', 'SFM', 'MC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), CPPC: 0.5 }
  const baselineAllocations: PCAAllocation[] = [
    {
      id: 'baseline-pref',
      schedule_id: '',
      staff_id: 'pref-pca',
      team: null,
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: 'CPPC',
      leave_type: null,
      special_program_ids: null,
    },
  ]
  const baselineAssignedSlots = countAssignedSlotsByTeam(baselineAllocations)

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-cppc',
      team: 'CPPC',
      preferred_pca_ids: ['pref-pca'],
      preferred_slots: [1, 4],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const teamPrefs = TEAMS.reduce(
    (acc, team) => {
      acc[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return acc
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  const pcaPool = [makePca('pref-pca', [1, 4]), makePca('other-pca', [1, 4])]
  const allocations: PCAAllocation[] = [
    makeAllocation('pref-pca', { slot2: 'CPPC', slot4: 'CPPC' }),
    makeAllocation('other-pca', { slot1: 'CPPC' }),
  ]
  const pendingFTE = computePendingLikeAllocator(initialPendingFTE, baselineAssignedSlots, allocations)

  const committedStep3Anchors: Step3CommittedFloatingAnchor[] = [{ team: 'CPPC', slot: 2, pcaId: 'pref-pca' }]

  const withAnchors = generateOptionalPromotionCandidates({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
    committedStep3Anchors,
  })
  assert.equal(
    withAnchors.length,
    0,
    'Optional promotion must not emit candidates that relocate a Step 3.2 preferred PCA+slot anchor (f120 / Constraint 6c).'
  )

  const defects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })
  assert.equal(defects.length, 0)

  const baseLex: Omit<RankedSlotAllocationScore, 'amPmSessionBalanceSpreadScore' | 'amPmSessionBalanceDetailScore'> = {
    highestRankCoverage: 0,
    rankedCoverageSatisfied: 8,
    fairnessSatisfied: 8,
    totalFulfilledPendingQuarterSlots: 0,
    gymLastResortCount: 0,
    rankedSlotMatchCount: 0,
    duplicateFloatingCount: 0,
    splitPenalty: 0,
    promotionTrueStep3RankScore: 0,
    promotionTrueStep3PreferredPcaHits: 0,
  }
  const scoreAnchorRespecting: RankedSlotAllocationScore = {
    ...baseLex,
    amPmSessionBalanceSpreadScore: 0,
    amPmSessionBalanceDetailScore: 0,
  }
  const scoreHypotheticalIfAnchorsIgnored: RankedSlotAllocationScore = {
    ...baseLex,
    amPmSessionBalanceSpreadScore: 1,
    amPmSessionBalanceDetailScore: 99,
  }

  assert.ok(
    compareScores(scoreHypotheticalIfAnchorsIgnored, scoreAnchorRespecting, {
      includeAmPmSessionBalanceTieBreak: true,
    }) < 0,
    'Pure lexicographic AM/PM can favor a post-state that would require relocating a frozen anchor; that state is unreachable because candidate generation excludes anchor moves before scoring.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
