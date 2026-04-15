import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { buildRankedSlotAllocationScore, compareScores } from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * 0.75 FTE focal FO. Row f130: through **splitPenalty** tied; **tier 2** no duplicate, **tier 3** worse
 * duplicateFloatingCount.
 *
 * - **Tier 2:** `float-a` slots 1+2, `float-b` slot 4 — two PCAs, no slot stacking → dup **0**, split **1**.
 * - **Tier 3:** `float-a` slot1+2, `float-b` slot1+4 — duplicate pressure on slot **1**, same split **1**.
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

  const tier2: PCAAllocation[] = [
    makeAllocation('float-a', { slot1: 'FO', slot2: 'FO' }, 0.5),
    makeAllocation('float-b', { slot4: 'FO' }, 0.25),
  ]
  const tier3: PCAAllocation[] = [
    makeAllocation('float-a', { slot1: 'FO', slot2: 'FO' }, 0.5),
    makeAllocation('float-b', { slot1: 'FO', slot4: 'FO' }, 0.25),
  ]

  const d2 = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: tier2,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })
  const d3 = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: tier3,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  const score2 = buildRankedSlotAllocationScore({
    allocations: tier2,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: d2,
    teamPrefs,
  })
  const score3 = buildRankedSlotAllocationScore({
    allocations: tier3,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: d3,
    teamPrefs,
  })

  assert.equal(score2.splitPenalty, score3.splitPenalty)
  assert.ok(score2.duplicateFloatingCount < score3.duplicateFloatingCount)

  assert.ok(
    compareScores(score2, score3) < 0,
    'Tier 2 must beat tier 3 on duplicateFloatingCount when splitPenalty and higher objectives match.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
