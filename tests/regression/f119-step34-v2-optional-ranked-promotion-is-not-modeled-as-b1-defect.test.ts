import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import {
  detectOptionalRankedPromotionOpportunities,
  generateOptionalPromotionCandidates,
} from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { formatV2RepairReasonLabel } from '../../lib/features/schedule/pcaTrackerTooltip'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/** P1 optional promotion is discovered separately; a clean audit must not fabricate B1 gaps. */

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
  const initialPendingFTE = { ...emptyTeamRecord(0) }
  const baselineAllocations: PCAAllocation[] = []
  const baselineAssignedSlots = countAssignedSlotsByTeam(baselineAllocations)

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-cppc',
      team: 'CPPC',
      preferred_pca_ids: ['sway-pca'],
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

  const pcaPool = [makePca('sway-pca', [1, 2, 3, 4])]
  const allocations = [makeAllocation('sway-pca', { slot1: 'CPPC', slot4: 'GMC' })]
  const pendingFTE = computePendingLikeAllocator(initialPendingFTE, baselineAssignedSlots, allocations)

  const args = {
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  }

  const defects = detectRankedV2RepairDefects(args)
  assert.equal(defects.some((d) => d.kind === 'B1'), false)

  const candidates = generateOptionalPromotionCandidates(args)
  assert.ok(candidates.length > 0, 'Fixture should admit optional promotion candidates without inventing B1.')

  const opportunities = detectOptionalRankedPromotionOpportunities(args)
  assert.ok(opportunities.length > 0)
  assert.ok(opportunities.every((o) => o.kind === 'P1'))

  assert.equal(
    formatV2RepairReasonLabel('ranked-promotion'),
    'Ranked promotion via bounded swap',
    'Tracker copy for ranked-promotion rows (B4).'
  )
}

main()
