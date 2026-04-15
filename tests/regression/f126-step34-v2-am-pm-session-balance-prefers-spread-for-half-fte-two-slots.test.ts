import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import {
  buildRankedSlotAllocationScore,
  compareScores,
} from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/** Focal team FO: Step 3.4 entry pending floating = 0.5 FTE (two quarter slots). */

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

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), FO: 0.5 }
  const pendingFTE = { ...emptyTeamRecord(0) }

  const pcaPool: PCAData[] = [makePca('float-a', [1, 2, 3, 4])]
  const floatingPcaIds = new Set(pcaPool.map((p) => p.id))
  const pcaPreferences: PCAPreference[] = []
  const teamPrefs = TEAMS.reduce(
    (acc, team) => {
      acc[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return acc
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  /** 1+1 across AM/PM bands: slot1 (A) + slot4 (B). */
  const onePlusOneAcrossBands: PCAAllocation[] = [makeAllocation('float-a', { slot1: 'FO', slot4: 'FO' })]
  /** 2+0 same band: slots 1 and 2 (both A). */
  const twoInSameBand: PCAAllocation[] = [makeAllocation('float-a', { slot1: 'FO', slot2: 'FO' })]

  const baselineAllocations: PCAAllocation[] = []

  const defectsA = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: onePlusOneAcrossBands,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })
  const defectsB = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: twoInSameBand,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  const scoreSpread = buildRankedSlotAllocationScore({
    allocations: onePlusOneAcrossBands,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: defectsA,
    teamPrefs,
    baselineAllocations,
    floatingPcaIds,
  })
  const scoreDense = buildRankedSlotAllocationScore({
    allocations: twoInSameBand,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: defectsB,
    teamPrefs,
    baselineAllocations,
    floatingPcaIds,
  })

  assert.equal(scoreSpread.duplicateFloatingCount, scoreDense.duplicateFloatingCount)
  assert.equal(scoreSpread.splitPenalty, scoreDense.splitPenalty)
  assert.equal(scoreSpread.highestRankCoverage, scoreDense.highestRankCoverage)
  assert.equal(scoreSpread.rankedCoverageSatisfied, scoreDense.rankedCoverageSatisfied)
  assert.equal(scoreSpread.fairnessSatisfied, scoreDense.fairnessSatisfied)
  assert.equal(scoreSpread.totalFulfilledPendingQuarterSlots, scoreDense.totalFulfilledPendingQuarterSlots)
  assert.equal(scoreSpread.gymLastResortCount, scoreDense.gymLastResortCount)
  assert.equal(scoreSpread.rankedSlotMatchCount, scoreDense.rankedSlotMatchCount)

  assert.ok(scoreSpread.amPmSessionBalanceSpreadScore > scoreDense.amPmSessionBalanceSpreadScore)

  assert.ok(
    compareScores(scoreSpread, scoreDense, { includeAmPmSessionBalanceTieBreak: true }) < 0,
    'With AM/PM tie-break enabled, 1+1 across bands must beat 2+0 when all higher objectives and defects match.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
