import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { runRankedV2DraftAllocation } from '../../lib/algorithms/floatingPcaV2/draftAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { roundToNearestQuarterWithMidpoint } from '../../lib/utils/rounding'
import {
  TEAMS,
  createEmptyTracker,
  finalizeTrackerSummary,
  getTeamPreferenceInfo,
  recordAssignment,
} from '../../lib/utils/floatingPCAHelpers'
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

function distinctPcaIdsForTeam(allocations: PCAAllocation[], team: Team) {
  return new Set(
    allocations
      .filter((allocation) => {
        return (
          allocation.slot1 === team ||
          allocation.slot2 === team ||
          allocation.slot3 === team ||
          allocation.slot4 === team
        )
      })
      .map((allocation) => allocation.staff_id)
  )
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

function runDraftAudit(args: {
  teamOrder: Team[]
  currentPendingFTE: Record<Team, number>
  existingAllocations: PCAAllocation[]
  pcaPool: PCAData[]
  pcaPreferences: PCAPreference[]
}) {
  const allocations = args.existingAllocations.map((allocation) => ({ ...allocation }))
  const pendingFTE = { ...args.currentPendingFTE }
  const tracker = createEmptyTracker()
  const teamPrefs = buildTeamPrefs(args.pcaPreferences)
  const allocationOrderMap = new Map<Team, number>()

  args.teamOrder.forEach((team, index) => {
    allocationOrderMap.set(team, index + 1)
    tracker[team].summary.allocationMode = 'standard'
  })

  const recordAssignmentWithOrder = (team: Team, log: Parameters<typeof recordAssignment>[2]) => {
    recordAssignment(tracker, team, {
      ...log,
      allocationOrder: allocationOrderMap.get(team),
    })
  }

  runRankedV2DraftAllocation({
    teamOrder: args.teamOrder,
    pendingFTE,
    allocations,
    pcaPool: args.pcaPool,
    teamPrefs,
    tracker,
    recordAssignmentWithOrder,
  })

  const defects = detectRankedV2RepairDefects({
    teamOrder: args.teamOrder,
    initialPendingFTE: args.currentPendingFTE,
    pendingFTE,
    allocations,
    pcaPool: args.pcaPool,
    teamPrefs,
  })

  for (const team of TEAMS) {
    tracker[team].summary.pendingMet =
      roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25
    tracker[team].summary.repairAuditDefects = []
  }
  for (const defect of defects) {
    const existing = tracker[defect.team].summary.repairAuditDefects ?? []
    if (!existing.includes(defect.kind)) {
      existing.push(defect.kind)
    }
    tracker[defect.team].summary.repairAuditDefects = existing
  }
  finalizeTrackerSummary(tracker)

  return { allocations, pendingFTE, tracker, defects }
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const currentPendingFTE = { ...emptyTeamRecord(0), FO: 0.25 }
  const pcaPool: PCAData[] = [makePca('collapse', [1, 3])]
  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: ['collapse'],
      preferred_slots: [1, 3],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const existingAllocations: PCAAllocation[] = [
    {
      id: 'existing-fo-1',
      schedule_id: '',
      staff_id: 'existing-fo-1',
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

  const draft = runDraftAudit({
    teamOrder,
    currentPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
  })

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  assert.equal(distinctPcaIdsForTeam(draft.allocations, 'FO').size, 2)
  assert.equal(draft.tracker.FO.summary.highestRankedSlotFulfilled, 2)
  assert.equal(draft.tracker.FO.summary.repairAuditDefects?.includes('C1'), true)
  assert.equal(draft.defects.some((defect) => defect.kind === 'C1' && defect.team === 'FO'), true)

  const blockedCollapsePrefs: PCAPreference[] = [
    {
      id: 'blocked-fo',
      team: 'FO',
      preferred_pca_ids: ['collapse'],
      preferred_slots: [1, 3],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'blocked-smm',
      team: 'SMM',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const blockedCollapseDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    pendingFTE: { ...emptyTeamRecord(0), SMM: 0.25 },
    allocations: [
      {
        id: 'blocked-fo-1',
        schedule_id: '',
        staff_id: 'blocked-fo-1',
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
      {
        id: 'blocked-fo-3',
        schedule_id: '',
        staff_id: 'blocked-fo-3',
        team: 'FO',
        fte_pca: 0.25,
        fte_remaining: 0,
        slot_assigned: 0.25,
        slot_whole: null,
        slot1: null,
        slot2: null,
        slot3: 'FO',
        slot4: null,
        leave_type: null,
        special_program_ids: null,
      },
    ],
    pcaPool: [makePca('collapse', [1, 3])],
    teamPrefs: buildTeamPrefs(blockedCollapsePrefs),
  })
  assert.equal(
    blockedCollapseDefects.some((defect) => defect.kind === 'C1' && defect.team === 'FO'),
    false,
    "C1 should not be reported when collapsing onto one PCA would consume another team's only ranked rescue path."
  )

  assert.equal(
    distinctPcaIdsForTeam(result.allocations, 'FO').size,
    1,
    'Task 5 repair should collapse FO onto a single PCA when one bounded reassignment is enough.'
  )
  assert.equal(
    slotOwner(result.allocations, 'collapse', 1),
    'FO',
    'Task 5 repair should move FO slot 1 onto the collapse PCA.'
  )
  assert.equal(result.pendingPCAFTEPerTeam.FO, 0)
  assert.equal(result.tracker.FO.summary.pendingMet, true)
  assert.equal(result.tracker.FO.summary.highestRankedSlotFulfilled, 1)
  const repairedAssignment = result.tracker.FO.assignments.find(
    (assignment) =>
      assignment.pcaId === 'collapse' &&
      assignment.slot === 1 &&
      assignment.allocationStage === 'repair'
  )
  assert.equal(repairedAssignment?.allocationStage, 'repair')
  assert.equal(repairedAssignment?.repairReason, 'continuity-reduction')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
