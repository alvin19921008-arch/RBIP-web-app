import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { runRankedV2DraftAllocation } from '../../lib/algorithms/floatingPcaV2/draftAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { finalizeRankedSlotFloatingTracker } from '../../lib/algorithms/floatingPcaV2/trackerSummaryDerivations'
import { roundToNearestQuarterWithMidpoint } from '../../lib/utils/rounding'
import {
  TEAMS,
  createEmptyTracker,
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
  finalizeRankedSlotFloatingTracker(tracker)

  return { allocations, pendingFTE, tracker, defects }
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const currentPendingFTE = { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 }
  const pcaPool: PCAData[] = [
    makePca('fo-primary', [1]),
    makePca('fo-alt', [2]),
    makePca('smm-fallback', [4]),
  ]
  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-smm',
      team: 'SMM',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 2,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-cppc',
      team: 'CPPC',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const draft = runDraftAudit({
    teamOrder,
    currentPendingFTE,
    existingAllocations: [],
    pcaPool,
    pcaPreferences,
  })

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE,
    existingAllocations: [],
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  assert.equal(slotOwner(draft.allocations, 'fo-primary', 1), 'FO')
  assert.equal(slotOwner(draft.allocations, 'smm-fallback', 4), 'SMM')
  assert.equal(draft.tracker.SMM.summary.highestRankedSlotFulfilled, null)
  assert.equal(draft.tracker.SMM.summary.repairAuditDefects?.includes('B1'), true)
  assert.equal(draft.defects.some((defect) => defect.kind === 'B1' && defect.team === 'SMM'), true)
  assert.equal(
    draft.defects.some((defect) => defect.kind === 'B1' && defect.team === 'CPPC'),
    false,
    'Zero-pending teams should not be flagged for recoverable ranked-slot defects.'
  )

  const swapOnlyPreferences: PCAPreference[] = [
    {
      id: 'swap-pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [2],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'swap-pref-smm',
      team: 'SMM',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const swapOnlyDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    pendingFTE: emptyTeamRecord(0),
    allocations: [
      {
        id: 'swap-slot-1',
        schedule_id: '',
        staff_id: 'swap-slot-1',
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
        id: 'swap-slot-2',
        schedule_id: '',
        staff_id: 'swap-slot-2',
        team: 'SMM',
        fte_pca: 0.25,
        fte_remaining: 0,
        slot_assigned: 0.25,
        slot_whole: null,
        slot1: null,
        slot2: 'SMM',
        slot3: null,
        slot4: null,
        leave_type: null,
        special_program_ids: null,
      },
    ],
    pcaPool: [makePca('swap-slot-1', [1]), makePca('swap-slot-2', [2])],
    teamPrefs: buildTeamPrefs(swapOnlyPreferences),
  })
  assert.equal(
    swapOnlyDefects.some((defect) => defect.kind === 'B1' && defect.team === 'SMM'),
    true,
    'Swap-only rescues should still be detected as recoverable ranked-slot defects.'
  )

  const impossibleRescueDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    pendingFTE: { ...emptyTeamRecord(0), SMM: 0.25 },
    allocations: [
      {
        id: 'impossible-slot-1',
        schedule_id: '',
        staff_id: 'impossible-slot-1',
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
    ],
    pcaPool: [makePca('impossible-slot-1', [1])],
    teamPrefs: buildTeamPrefs(swapOnlyPreferences),
  })
  assert.equal(
    impossibleRescueDefects.some((defect) => defect.kind === 'B1' && defect.team === 'SMM'),
    false,
    'B1 should not be reported when no bounded move or swap is actually feasible.'
  )
  assert.equal(
    impossibleRescueDefects.some((defect) => defect.kind === 'F1' && defect.team === 'SMM'),
    false,
    'F1 should not be reported when no useful non-duplicate rescue path exists.'
  )

  assert.equal(
    slotOwner(result.allocations, 'fo-primary', 1),
    'SMM',
    'Task 5 repair should move FO to slot 2 so SMM recovers ranked slot 1.'
  )
  assert.equal(slotOwner(result.allocations, 'fo-alt', 2), 'FO')
  assert.equal(result.pendingPCAFTEPerTeam.SMM, 0)
  assert.equal(result.tracker.SMM.summary.pendingMet, true)
  assert.equal(result.tracker.SMM.summary.highestRankedSlotFulfilled, 1)
  const repairedAssignment = result.tracker.SMM.assignments.find(
    (assignment) =>
      assignment.pcaId === 'fo-primary' &&
      assignment.slot === 1 &&
      assignment.allocationStage === 'repair'
  )
  assert.equal(repairedAssignment?.allocationStage, 'repair')
  assert.equal(repairedAssignment?.repairReason, 'ranked-coverage')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
