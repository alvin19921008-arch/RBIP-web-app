import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { buildRankedSlotAllocationScore, compareScores } from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * 0.75 FTE focal team FO (three quarter slots). Tier matrix row f129.
 *
 * - **Tier 1:** PCA `float-a` alone — slots 1,2,3 → `splitPenalty` 0 (non-split triple).
 * - **Tier 2:** `float-a` slots 1+2, `float-b` slot 4 → `splitPenalty` 1 (split across PCAs).
 * Non-focal teams: none. `duplicateFloatingCount` is **0** for both (asserted).
 *
 * Discriminant: tier **8** (`splitPenalty`) only; `includeAmPmSessionBalanceTieBreak` is **off**
 * so AM/PM cannot decide this pair.
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
  slots: Partial<Record<'slot1' | 'slot2' | 'slot3' | 'slot4', Team | null>>,
  fteRemaining = 0.25
): PCAAllocation {
  return {
    id: `alloc-${staffId}`,
    schedule_id: '',
    staff_id: staffId,
    team: null,
    fte_pca: 1,
    fte_remaining: fteRemaining,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: slots.slot1 ?? null,
    slot2: slots.slot2 ?? null,
    slot3: slots.slot3 ?? null,
    slot4: slots.slot4 ?? null,
    leave_type: null,
    special_program_ids: null,
  }
}

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), FO: 0.75 }
  const pendingFTE = { ...emptyTeamRecord(0) }

  const pcaPool: PCAData[] = [makePca('float-a', [1, 2, 3, 4]), makePca('float-b', [1, 2, 3, 4])]

  const pcaPreferences: PCAPreference[] = []
  const teamPrefs = TEAMS.reduce(
    (acc, team) => {
      acc[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return acc
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  const baselineAllocations: PCAAllocation[] = []

  const tier1: PCAAllocation[] = [
    makeAllocation('float-a', { slot1: 'FO', slot2: 'FO', slot3: 'FO' }, 0.25),
  ]
  const tier2: PCAAllocation[] = [
    makeAllocation('float-a', { slot1: 'FO', slot2: 'FO' }, 0.5),
    makeAllocation('float-b', { slot4: 'FO' }, 0.25),
  ]

  const defects1 = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: tier1,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })
  const defects2 = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: tier2,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  const score1 = buildRankedSlotAllocationScore({
    allocations: tier1,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: defects1,
    teamPrefs,
  })
  const score2 = buildRankedSlotAllocationScore({
    allocations: tier2,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: defects2,
    teamPrefs,
  })

  assert.equal(score1.duplicateFloatingCount, 0)
  assert.equal(score2.duplicateFloatingCount, 0)
  assert.equal(score1.duplicateFloatingCount, score2.duplicateFloatingCount)
  assert.equal(score1.highestRankCoverage, score2.highestRankCoverage)
  assert.equal(score1.rankedCoverageSatisfied, score2.rankedCoverageSatisfied)
  assert.equal(score1.fairnessSatisfied, score2.fairnessSatisfied)
  assert.equal(score1.totalFulfilledPendingQuarterSlots, score2.totalFulfilledPendingQuarterSlots)
  assert.equal(score1.gymLastResortCount, score2.gymLastResortCount)
  assert.equal(score1.rankedSlotMatchCount, score2.rankedSlotMatchCount)
  assert.ok(score1.splitPenalty < score2.splitPenalty)

  assert.ok(
    compareScores(score1, score2) < 0,
    'Tier 1 (non-split triple) must beat tier 2 on splitPenalty when duplicateFloatingCount is tied through tier 7.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
