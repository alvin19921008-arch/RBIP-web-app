import assert from 'node:assert/strict'

import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import {
  countTeamsMaterialShort,
  teamHasMaterialRemainingFloatingPending,
} from '../../lib/algorithms/floatingPcaV2/duplicateRepairPolicy'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * A1 widened in repairAudit: NSM can have a clean true Step 3 row plus ≥0.25 pending and still
 * count as a relief recipient. This regression locks `generateA1Candidates` so peels only go to
 * teams with material pending and never increase materially-short team count.
 *
 * @see docs/superpowers/plans/2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md Task 3
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

function makePca(id: string, slots: number[], floor: 'upper' | 'lower'): PCAData {
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
    floor_pca: [floor],
  } as PCAData
}

function buildTeamPrefs(pcaPreferences: PCAPreference[]) {
  return TEAMS.reduce(
    (record, team) => {
      record[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return record
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )
}

function countAssignedSlotsByTeamSnapshot(allocations: PCAAllocation[]): Record<Team, number> {
  const counts = emptyTeamRecord(0)
  for (const allocation of allocations) {
    if (allocation.slot1) counts[allocation.slot1] += 1
    if (allocation.slot2) counts[allocation.slot2] += 1
    if (allocation.slot3) counts[allocation.slot3] += 1
    if (allocation.slot4) counts[allocation.slot4] += 1
  }
  return counts
}

function computePendingFromAllocationsSnapshot(
  initialPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>,
  allocations: PCAAllocation[]
): Record<Team, number> {
  const finalAssignedCounts = countAssignedSlotsByTeamSnapshot(allocations)
  const next = emptyTeamRecord(0)
  for (const team of TEAMS) {
    const pendingSlotsAtStep34Start = Math.round(((initialPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const newlyCoveredSlots = finalAssignedCounts[team] - baselineAssignedSlots[team]
    const remainingSlots = Math.max(0, pendingSlotsAtStep34Start - newlyCoveredSlots)
    next[team] = remainingSlots * 0.25
  }
  return next
}

function allocRow(
  staffId: string,
  team: Team,
  slot: 1 | 2 | 3 | 4,
  owner: Team
): PCAAllocation {
  return {
    id: `id-${staffId}`,
    schedule_id: '',
    staff_id: staffId,
    team,
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: slot === 1 ? owner : null,
    slot2: slot === 2 ? owner : null,
    slot3: slot === 3 ? owner : null,
    slot4: slot === 4 ? owner : null,
    leave_type: null,
    special_program_ids: null,
  }
}

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  const pcaPool: PCAData[] = [
    makePca('dro-dup-a', [2], 'upper'),
    makePca('dro-dup-b', [2], 'upper'),
    makePca('nsm-clean', [4], 'upper'),
  ]

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-dro',
      team: 'DRO',
      preferred_pca_ids: [],
      preferred_slots: [2],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-nsm',
      team: 'NSM',
      preferred_pca_ids: [],
      preferred_slots: [2, 4],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const baselineAllocations: PCAAllocation[] = []
  const initialPendingFTE = { ...emptyTeamRecord(0), NSM: 0.5, DRO: 0.5 }
  const allocations: PCAAllocation[] = [
    allocRow('dro-dup-a', 'DRO', 2, 'DRO'),
    allocRow('dro-dup-b', 'DRO', 2, 'DRO'),
    allocRow('nsm-clean', 'NSM', 4, 'NSM'),
  ]
  const pendingFTE = computePendingFromAllocationsSnapshot(
    initialPendingFTE,
    countAssignedSlotsByTeamSnapshot(baselineAllocations),
    allocations
  )

  assert.equal(
    teamHasMaterialRemainingFloatingPending(pendingFTE, 'NSM'),
    true,
    'NSM should still have material floating pending while holding one clean non-duplicate slot.'
  )

  const teamPrefs = buildTeamPrefs(pcaPreferences)
  const defects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  assert.equal(
    defects.some((d) => d.kind === 'A1' && d.team === 'DRO'),
    true,
    'Expected A1 on DRO when another team has a useful clean row but still has material pending (widened audit).'
  )

  const shortBefore = countTeamsMaterialShort(pendingFTE)
  const baselineAssignedSlots = countAssignedSlotsByTeamSnapshot(baselineAllocations)

  const a1Candidates = generateRepairCandidates({
    defect: { kind: 'A1', team: 'DRO' },
    allocations,
    pcaPool,
    teamPrefs,
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    baselineAllocations,
  })

  assert.equal(a1Candidates.length >= 1, true, 'Expected at least one A1 peel candidate toward NSM.')

  for (const candidate of a1Candidates) {
    const afterPending = computePendingFromAllocationsSnapshot(
      initialPendingFTE,
      baselineAssignedSlots,
      candidate.allocations
    )
    assert.equal(
      countTeamsMaterialShort(afterPending) <= shortBefore,
      true,
      `A1 candidate ${candidate.sortKey} must not increase materially short team count (${shortBefore} → ${countTeamsMaterialShort(afterPending)}).`
    )
  }

}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
