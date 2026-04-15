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
    fte_remaining: 0.75,
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
  const initialPendingFTE = { ...emptyTeamRecord(0), FO: 0.25 }
  const pendingFTE = { ...emptyTeamRecord(0) }

  const pcaPool: PCAData[] = [makePca('float-a', [1, 2, 3, 4])]

  const pcaPreferences: PCAPreference[] = []
  const teamPrefs = TEAMS.reduce(
    (acc, team) => {
      acc[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return acc
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  const allocationsAm: PCAAllocation[] = [makeAllocation('float-a', { slot1: 'FO' })]
  const allocationsPm: PCAAllocation[] = [makeAllocation('float-a', { slot4: 'FO' })]

  const defectsAm = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: allocationsAm,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
  })
  const defectsPm = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: allocationsPm,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
  })

  const floatingPcaIds = new Set(pcaPool.map((p) => p.id))
  const baselineAllocations: PCAAllocation[] = []

  const scoreAm = buildRankedSlotAllocationScore({
    allocations: allocationsAm,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: defectsAm,
    teamPrefs,
    baselineAllocations,
    floatingPcaIds,
  })
  const scorePm = buildRankedSlotAllocationScore({
    allocations: allocationsPm,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: defectsPm,
    teamPrefs,
    baselineAllocations,
    floatingPcaIds,
  })

  assert.equal(scoreAm.amPmSessionBalanceSpreadScore, 0)
  assert.equal(scoreAm.amPmSessionBalanceDetailScore, 0)
  assert.equal(scorePm.amPmSessionBalanceSpreadScore, 0)
  assert.equal(scorePm.amPmSessionBalanceDetailScore, 0)
  assert.equal(scoreAm.promotionTrueStep3RankScore, scorePm.promotionTrueStep3RankScore)
  assert.equal(scoreAm.promotionTrueStep3PreferredPcaHits, scorePm.promotionTrueStep3PreferredPcaHits)

  assert.equal(
    compareScores(scoreAm, scorePm, { includeAmPmSessionBalanceTieBreak: true }),
    0,
    '0.25 FTE (one quarter) is AM/PM-neutral: band placement must not break ties when higher objectives match.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
