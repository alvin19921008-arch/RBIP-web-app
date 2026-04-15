import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { buildRankedSlotAllocationScore, compareScores } from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * 0.75 FTE focal FO. Row f132: **Tier 1** (single PCA slots 1–3, no dup / no split) vs **Tier 3**
 * (duplicate on slot 1: `float-a` + `float-b` both cover slot 1, plus `float-a` slot 2).
 *
 * **First differing lexicographic tier:** **7** (`duplicateFloatingCount`) — tier 1 has 0, tier 3 > 0.
 * (Tier 8 `splitPenalty` also differs here but is not reached.)
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
  const tier3: PCAAllocation[] = [
    makeAllocation('float-a', { slot1: 'FO', slot2: 'FO' }, 0.5),
    makeAllocation('float-b', { slot1: 'FO' }, 0.25),
  ]

  const d1 = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: tier1,
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

  const score1 = buildRankedSlotAllocationScore({
    allocations: tier1,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: d1,
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

  assert.equal(score1.duplicateFloatingCount, 0)
  assert.ok(score3.duplicateFloatingCount > 0)

  assert.ok(
    compareScores(score1, score3) < 0,
    'Tier 1 must lexicographically beat tier 3 (duplicate tier 7 is first difference for this fixture).'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
