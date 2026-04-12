import assert from 'node:assert/strict'

import * as repairAudit from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * Task 6 (RED): donor protection for bounded donation must be explicit in audit + candidate wiring.
 *
 * 1) Plan helpers (`teamCanDonateBoundedly`, `donationWouldBreakDonorFairnessFloor`, …) are not exported yet.
 * 2) For a donor who would drop to zero meaningful true Step 3 floating coverage if slot 1 moved,
 *    candidate generation must not fabricate a rescue that assigns the contested slot to the requester
 *    without a donor-safe replacement path (swap / fallback / bounded donation with donor still covered).
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

function buildTeamPrefs(pcaPreferences: PCAPreference[]) {
  return TEAMS.reduce(
    (record, team) => {
      record[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return record
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )
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

function slotOwner(allocations: PCAAllocation[], pcaId: string, slot: 1 | 2 | 3 | 4) {
  const allocation = allocations.find((row) => row.staff_id === pcaId)
  if (!allocation) return null
  return slot === 1
    ? allocation.slot1
    : slot === 2
      ? allocation.slot2
      : slot === 3
        ? allocation.slot3
        : allocation.slot4
}

function countTrueStep3FloatingSlots(args: {
  allocations: PCAAllocation[]
  team: Team
  baselineAllocations: PCAAllocation[]
  floatingPcaIds: Set<string>
}): number {
  const { allocations, team, baselineAllocations, floatingPcaIds } = args
  const baselineByStaff = new Map(baselineAllocations.map((row) => [row.staff_id, row]))
  let count = 0
  for (const allocation of allocations) {
    if (!floatingPcaIds.has(allocation.staff_id)) continue
    const baseline = baselineByStaff.get(allocation.staff_id)
    for (const slot of [1, 2, 3, 4] as const) {
      const owner = slotOwner([allocation], allocation.staff_id, slot)
      if (owner !== team) continue
      const baseOwner = baseline ? slotOwner([baseline], allocation.staff_id, slot) : null
      if (baseOwner === team) continue
      count += 1
    }
  }
  return count
}

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), GMC: 0.25 }
  const pendingFTE = { ...emptyTeamRecord(0), GMC: 0.25 }

  const pcaPool: PCAData[] = [makePca('shaohua', [1])]
  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-gmc',
      team: 'GMC',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-dro',
      team: 'DRO',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const teamPrefs = buildTeamPrefs(pcaPreferences)

  const allocations: PCAAllocation[] = [
    {
      id: 'alloc-shaohua',
      schedule_id: '',
      staff_id: 'shaohua',
      team: 'DRO',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'DRO',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]
  const baselineAllocations: PCAAllocation[] = []
  const floatingIds = new Set(pcaPool.map((pca) => pca.id))

  const defects = repairAudit.detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  const b1Defect = defects.find((defect) => defect.kind === 'B1' && defect.team === 'GMC')
  const forcedB1 = { kind: 'B1' as const, team: 'GMC' as const }
  const candidates = generateRepairCandidates({
    defect: b1Defect ?? forcedB1,
    allocations,
    pcaPool,
    teamPrefs,
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    baselineAllocations,
  })

  const harmful = candidates.some((candidate) => {
    if (slotOwner(candidate.allocations, 'shaohua', 1) !== 'GMC') return false
    const donorAfter = countTrueStep3FloatingSlots({
      allocations: candidate.allocations,
      team: 'DRO',
      baselineAllocations,
      floatingPcaIds: floatingIds,
    })
    return donorAfter === 0
  })

  assert.equal(
    harmful,
    false,
    'Repair candidates must not move the contested ranked slot to the requester when that would strip the donor of all true Step 3 floating coverage without an explicit safe donation path.'
  )

  const exported = repairAudit as Record<string, unknown>
  assert.equal(
    typeof exported.teamCanDonateBoundedly === 'function',
    true,
    'repairAudit should export teamCanDonateBoundedly for donor harm gating shared with repairMoves/allocator.'
  )
  assert.equal(
    typeof exported.donationWouldBreakDonorFairnessFloor === 'function',
    true,
    'repairAudit should export donationWouldBreakDonorFairnessFloor so harmful donations are blocked before scoring.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
