import assert from 'node:assert/strict'

import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { shouldPreferFirstRepairOnScoreTie } from '../../lib/algorithms/floatingPcaV2/repairMoveSelection'
import {
  buildRankedSlotAllocationScore,
  compareScores,
} from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * When two A1 repairs tie on `compareScores`, the allocator must prefer `a1:swap:` over `a1:peel:`
 * (`repairMoveSelection.shouldPreferFirstRepairOnScoreTie`).
 *
 * @see docs/superpowers/plans/2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md Task 4
 */

const RANKED_V2_REPAIR_SCORE_COMPARE_OPTIONS = { includeAmPmSessionBalanceTieBreak: true } as const

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

function scoreRepairCandidate(args: {
  teamOrder: Team[]
  initialPendingFTE: Record<Team, number>
  baselineAllocations: PCAAllocation[]
  candidateAllocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: ReturnType<typeof buildTeamPrefs>
}) {
  const baselineAssignedSlots = countAssignedSlotsByTeamSnapshot(args.baselineAllocations)
  const pendingFTE = computePendingFromAllocationsSnapshot(
    args.initialPendingFTE,
    baselineAssignedSlots,
    args.candidateAllocations
  )
  const floatingPcaIds = new Set(args.pcaPool.map((p) => p.id))
  const defects = detectRankedV2RepairDefects({
    teamOrder: args.teamOrder,
    initialPendingFTE: args.initialPendingFTE,
    pendingFTE,
    allocations: args.candidateAllocations,
    pcaPool: args.pcaPool,
    teamPrefs: args.teamPrefs,
    baselineAllocations: args.baselineAllocations,
  })
  return buildRankedSlotAllocationScore({
    allocations: args.candidateAllocations,
    initialPendingFTE: args.initialPendingFTE,
    pendingFTE,
    teamOrder: args.teamOrder,
    defects,
    teamPrefs: args.teamPrefs,
    baselineAllocations: args.baselineAllocations,
    floatingPcaIds,
  })
}

/** Replicates allocator repair-loop tie pick when scores are equal (first argument = new candidate). */
function pickBetterRepairOnScoreTie(
  candidate: { sortKey: string; score: ReturnType<typeof buildRankedSlotAllocationScore> },
  best: { sortKey: string; score: ReturnType<typeof buildRankedSlotAllocationScore> }
) {
  const cmp = compareScores(candidate.score, best.score, RANKED_V2_REPAIR_SCORE_COMPARE_OPTIONS)
  if (cmp < 0) return candidate
  if (cmp > 0) return best
  return shouldPreferFirstRepairOnScoreTie(candidate.sortKey, best.sortKey) ? candidate : best
}

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  const pcaPool: PCAData[] = [
    makePca('dro-dup-a', [2, 4], 'upper'),
    makePca('dro-dup-b', [2], 'upper'),
    makePca('nsm-clean', [2, 4], 'upper'),
  ]

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-dro',
      team: 'DRO',
      preferred_pca_ids: [],
      preferred_slots: [2, 4],
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
    'fixture should surface A1 on DRO'
  )

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

  const peel = a1Candidates.find((c) => c.sortKey.startsWith('a1:peel:'))
  const swap = a1Candidates.find((c) => c.sortKey.startsWith('a1:swap:'))
  assert.ok(peel, 'expected a peel A1 candidate')
  assert.ok(swap, 'expected a swap A1 candidate')

  const scorePeel = scoreRepairCandidate({
    teamOrder,
    initialPendingFTE,
    baselineAllocations,
    candidateAllocations: peel.allocations,
    pcaPool,
    teamPrefs,
  })
  const scoreSwap = scoreRepairCandidate({
    teamOrder,
    initialPendingFTE,
    baselineAllocations,
    candidateAllocations: swap.allocations,
    pcaPool,
    teamPrefs,
  })

  const vs = compareScores(scoreSwap, scorePeel, RANKED_V2_REPAIR_SCORE_COMPARE_OPTIONS)
  assert.equal(
    vs,
    0,
    'swap and peel should tie on repair lexicographic score so tie-break applies'
  )

  assert.equal(
    shouldPreferFirstRepairOnScoreTie(swap.sortKey, peel.sortKey),
    true,
    'swap sortKey should beat peel when scores tie'
  )
  assert.equal(
    shouldPreferFirstRepairOnScoreTie(peel.sortKey, swap.sortKey),
    false,
    'peel should not beat swap when scores tie'
  )

  const chosen = pickBetterRepairOnScoreTie(
    { sortKey: swap.sortKey, score: scoreSwap },
    { sortKey: peel.sortKey, score: scorePeel }
  )
  assert.equal(chosen.sortKey.startsWith('a1:swap:'), true)
  assert.equal(
    pickBetterRepairOnScoreTie(
      { sortKey: peel.sortKey, score: scorePeel },
      { sortKey: swap.sortKey, score: scoreSwap }
    ).sortKey.startsWith('a1:swap:'),
    true,
    'order of arguments should not change the winner'
  )

  assert.equal(
    shouldPreferFirstRepairOnScoreTie('a1:peel:x:2:DRO->NSM', 'a1:old-legacy-no-prefix'),
    true,
    'peel prefix should beat legacy a1: keys without peel/swap'
  )
}

void main()
