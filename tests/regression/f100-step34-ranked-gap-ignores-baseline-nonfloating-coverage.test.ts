import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
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

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), FO: 0.25, GMC: 0.25 }
  const pendingFTE = { ...emptyTeamRecord(0), FO: 0, GMC: 0.25 }
  const baselineAllocations: PCAAllocation[] = [
    {
      id: 'baseline-gmc-1',
      schedule_id: '',
      staff_id: 'baseline-gmc-1',
      team: 'GMC',
      fte_pca: 0.25,
      fte_remaining: 0,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'GMC',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]
  const allocations: PCAAllocation[] = [
    ...baselineAllocations.map((allocation) => ({ ...allocation })),
    {
      id: 'floating-slot-1',
      schedule_id: '',
      staff_id: 'floating-slot-1',
      team: 'FO',
      fte_pca: 0.25,
      fte_remaining: 0,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'FO',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]
  const pcaPool: PCAData[] = [makePca('floating-slot-1', [1]), makePca('fo-fallback', [2])]
  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [2],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-gmc',
      team: 'GMC',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 2,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
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
    defects.some((defect) => defect.kind === 'B1' && defect.team === 'GMC'),
    true,
    'B1 should still be raised when a ranked slot is covered only by baseline non-floating ownership rather than floating coverage.'
  )

  const candidates = generateRepairCandidates({
    defect: { kind: 'B1', team: 'GMC' },
    allocations,
    pcaPool,
    teamPrefs,
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    baselineAllocations,
  })

  assert.equal(
    candidates.some(
      (candidate) =>
        slotOwner(candidate.allocations, 'floating-slot-1', 1) === 'GMC' &&
        slotOwner(candidate.allocations, 'fo-fallback', 2) === 'FO'
    ),
    true,
    'B1 repair should generate a bounded ranked-slot rescue even when the requester already owns that clock slot in baseline non-floating coverage.'
  )

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: initialPendingFTE,
    existingAllocations: baselineAllocations.map((allocation) => ({ ...allocation })),
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  assert.equal(
    slotOwner(result.allocations, 'floating-slot-1', 1),
    'GMC',
    'Full allocator should choose the GMC ranked-slot rescue once baseline non-floating coverage no longer blocks B1 scoring.'
  )
  assert.equal(
    result.tracker.GMC.assignments.some(
      (assignment) =>
        assignment.pcaId === 'floating-slot-1' &&
        assignment.slot === 1 &&
        assignment.fulfilledSlotRank === 1
    ),
    true,
    'Tracker should record GMC slot 1 as the fulfilled first-ranked floating assignment.'
  )
  assert.equal(
    result.tracker.GMC.summary.highestRankedSlotFulfilled,
    1,
    'Tracker summary should report that GMC got its highest-ranked slot once the allocator chooses the rescue.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
