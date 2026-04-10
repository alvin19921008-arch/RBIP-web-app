import assert from 'node:assert/strict'

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
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
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

function makeAllocation(id: string, team: Team, slot: 1 | 2 | 3 | 4): PCAAllocation {
  return {
    id,
    schedule_id: '',
    staff_id: id,
    team,
    fte_pca: 0.25,
    fte_remaining: 0,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: slot === 1 ? team : null,
    slot2: slot === 2 ? team : null,
    slot3: slot === 3 ? team : null,
    slot4: slot === 4 ? team : null,
    leave_type: null,
    special_program_ids: null,
  }
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
    baselineAllocations: args.existingAllocations,
  })

  const defects = detectRankedV2RepairDefects({
    teamOrder: args.teamOrder,
    initialPendingFTE: args.currentPendingFTE,
    pendingFTE,
    allocations,
    pcaPool: args.pcaPool,
    teamPrefs,
    baselineAllocations: args.existingAllocations,
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

  return { allocations, tracker, defects }
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  const upstreamOnlyDraft = runDraftAudit({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25 },
    existingAllocations: [makeAllocation('baseline-fo-slot2', 'FO', 2)],
    pcaPool: [makePca('float-a', [2], 'upper')],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: ['float-a'],
        preferred_slots: [2],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
  })

  const upstreamAssignment = upstreamOnlyDraft.tracker.FO.assignments.find(
    (assignment) => assignment.pcaId === 'float-a'
  )

  assert.equal(
    upstreamAssignment?.slotSelectionPhase,
    'ranked-unused',
    'A ranked slot with only upstream Step 2 coverage should stay in the non-duplicate bucket for Step 3.4.'
  )
  assert.equal(
    upstreamAssignment?.duplicateSlot,
    false,
    'One Step 3 floating row on top of upstream Step 2 coverage should not be marked as duplicate-floating.'
  )
  assert.equal(
    upstreamOnlyDraft.tracker.FO.summary.usedDuplicateFloatingSlot,
    false,
    'Tracker summary should stay clear of duplicate-floating when broad same-slot occupancy came only from upstream work.'
  )

  const trueDuplicateDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE: { ...emptyTeamRecord(0), FO: 0.5, SMM: 0.25 },
    pendingFTE: { ...emptyTeamRecord(0), SMM: 0.25 },
    allocations: [makeAllocation('dup-a', 'FO', 2), makeAllocation('dup-b', 'FO', 2)],
    pcaPool: [makePca('dup-a', [2], 'upper'), makePca('dup-b', [2], 'upper')],
    teamPrefs: buildTeamPrefs([
      {
        id: 'dup-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [2],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
      {
        id: 'dup-smm',
        team: 'SMM',
        preferred_pca_ids: [],
        preferred_slots: [2],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
    ]),
    baselineAllocations: [],
  })

  assert.equal(
    trueDuplicateDefects.some((defect) => defect.kind === 'A1' && defect.team === 'FO'),
    true,
    'True Step 3 floating-on-floating stacking should still leave the duplicate-reduction defect path available.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
