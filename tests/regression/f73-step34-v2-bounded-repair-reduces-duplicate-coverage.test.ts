import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { runRankedV2DraftAllocation } from '../../lib/algorithms/floatingPcaV2/draftAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import {
  buildRankedSlotAllocationScore,
  compareScores,
} from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
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

function duplicateCount(allocations: PCAAllocation[], team: Team) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const allocation of allocations) {
    if (allocation.slot1 === team) counts[1] += 1
    if (allocation.slot2 === team) counts[2] += 1
    if (allocation.slot3 === team) counts[3] += 1
    if (allocation.slot4 === team) counts[4] += 1
  }
  return Object.values(counts).filter((count) => count > 1).length
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
  const fairnessScoreWorse = buildRankedSlotAllocationScore({
    allocations: [],
    initialPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    pendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    teamOrder,
    defects: [
      { kind: 'F1', team: 'FO' },
      { kind: 'F1', team: 'SMM' },
    ],
    teamPrefs: buildTeamPrefs([]),
  })
  const fairnessScoreBetter = buildRankedSlotAllocationScore({
    allocations: [],
    initialPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    pendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    teamOrder,
    defects: [{ kind: 'F1', team: 'FO' }],
    teamPrefs: buildTeamPrefs([]),
  })
  assert.equal(
    compareScores(fairnessScoreBetter, fairnessScoreWorse) < 0,
    true,
    'Reducing fairness-floor violations must improve score even when at least one F1 remains.'
  )

  const currentPendingFTE = { ...emptyTeamRecord(0), FO: 0.75, SMM: 0.25 }
  const pcaPool: PCAData[] = [
    makePca('a', [2, 4], 'lower'),
    makePca('b', [4], 'upper'),
    makePca('c', [1, 3], 'upper'),
  ]
  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [4],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'lower',
    },
    {
      id: 'pref-smm',
      team: 'SMM',
      preferred_pca_ids: ['a'],
      preferred_slots: [2],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const existingAllocations: PCAAllocation[] = [
    {
      id: 'existing-fo-2',
      schedule_id: '',
      staff_id: 'existing-fo-2',
      team: 'FO',
      fte_pca: 0.25,
      fte_remaining: 0,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: 'FO',
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'existing-smm-1',
      schedule_id: '',
      staff_id: 'existing-smm-1',
      team: 'SMM',
      fte_pca: 0.25,
      fte_remaining: 0,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'SMM',
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

  assert.equal(duplicateCount(draft.allocations, 'FO'), 1)
  assert.equal(draft.tracker.SMM.assignments[0]?.slotSelectionPhase, 'gym-last-resort')
  assert.equal(draft.tracker.FO.summary.repairAuditDefects?.includes('A1'), true)
  assert.equal(draft.tracker.FO.summary.repairAuditDefects?.includes('A2'), true)
  assert.equal(draft.tracker.SMM.summary.repairAuditDefects?.includes('F1'), true)
  assert.equal(draft.defects.some((defect) => defect.kind === 'A1' && defect.team === 'FO'), true)
  assert.equal(
    draft.defects.some((defect) => defect.kind === 'A2' && defect.team === 'FO' && defect.pcaId === 'a'),
    true
  )
  assert.equal(draft.defects.some((defect) => defect.kind === 'F1' && defect.team === 'SMM'), true)
  const a2Candidates = generateRepairCandidates({
    defect: { kind: 'A2', team: 'FO', pcaId: 'a' },
    allocations: draft.allocations,
    pcaPool,
    teamPrefs: buildTeamPrefs(pcaPreferences),
  })
  assert.equal(
    a2Candidates.some((candidate) => slotOwner(candidate.allocations, 'a', 2) === 'SMM'),
    true,
    'A2 should generate a bounded candidate that frees the globally valuable PCA for the other team.'
  )
  const preferredOnlyA2Candidates = generateRepairCandidates({
    defect: { kind: 'A2', team: 'FO', pcaId: 'pref-only-a' },
    allocations: [
      {
        id: 'pref-only-a',
        schedule_id: '',
        staff_id: 'pref-only-a',
        team: 'FO',
        fte_pca: 1,
        fte_remaining: 0.5,
        slot_assigned: 0.5,
        slot_whole: null,
        slot1: null,
        slot2: 'FO',
        slot3: null,
        slot4: 'FO',
        leave_type: null,
        special_program_ids: null,
      },
    ],
    pcaPool: [makePca('pref-only-a', [2, 4], 'upper')],
    teamPrefs: buildTeamPrefs([
      {
        id: 'pref-only-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
      {
        id: 'pref-only-smm',
        team: 'SMM',
        preferred_pca_ids: ['pref-only-a'],
        preferred_slots: [],
        gym_schedule: 3,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
    ]),
  })
  assert.equal(
    preferredOnlyA2Candidates.some((candidate) => slotOwner(candidate.allocations, 'pref-only-a', 2) === 'SMM'),
    true,
    'A2 should also generate a bounded rescue for preferred-only teams, not just ranked-slot teams.'
  )

  const impossibleDuplicateDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE: { ...emptyTeamRecord(0), FO: 0.5, SMM: 0.25 },
    pendingFTE: { ...emptyTeamRecord(0), SMM: 0.25 },
    allocations: [
      {
        id: 'dup-a',
        schedule_id: '',
        staff_id: 'dup-a',
        team: 'FO',
        fte_pca: 0.25,
        fte_remaining: 0,
        slot_assigned: 0.25,
        slot_whole: null,
        slot1: null,
        slot2: 'FO',
        slot3: null,
        slot4: null,
        leave_type: null,
        special_program_ids: null,
      },
      {
        id: 'dup-b',
        schedule_id: '',
        staff_id: 'dup-b',
        team: 'FO',
        fte_pca: 0.25,
        fte_remaining: 0,
        slot_assigned: 0.25,
        slot_whole: null,
        slot1: null,
        slot2: 'FO',
        slot3: null,
        slot4: null,
        leave_type: null,
        special_program_ids: null,
      },
    ],
    pcaPool: [makePca('dup-a', [2], 'upper'), makePca('dup-b', [2], 'upper')],
    teamPrefs: buildTeamPrefs([
      {
        id: 'impossible-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [2],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
      {
        id: 'impossible-smm',
        team: 'SMM',
        preferred_pca_ids: [],
        preferred_slots: [1],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
    ]),
  })
  assert.equal(
    impossibleDuplicateDefects.some((defect) => defect.kind === 'A1' && defect.team === 'FO'),
    false,
    'A1 should not be reported when duplicate concentration cannot rescue another team.'
  )
  assert.equal(
    impossibleDuplicateDefects.some((defect) => defect.kind === 'F1' && defect.team === 'SMM'),
    false,
    'F1 should stay false when no useful non-duplicate rescue path exists.'
  )
  const noBaselineSwapCandidates = generateRepairCandidates({
    defect: { kind: 'F1', team: 'SMM' },
    allocations: [
      {
        id: 'floating-a',
        schedule_id: '',
        staff_id: 'floating-a',
        team: 'FO',
        fte_pca: 1,
        fte_remaining: 0.75,
        slot_assigned: 0.25,
        slot_whole: null,
        slot1: null,
        slot2: 'FO',
        slot3: null,
        slot4: null,
        leave_type: null,
        special_program_ids: null,
      },
      {
        id: 'baseline-smm-1',
        schedule_id: '',
        staff_id: 'baseline-smm-1',
        team: 'SMM',
        fte_pca: 0.25,
        fte_remaining: 0,
        slot_assigned: 0.25,
        slot_whole: null,
        slot1: 'SMM',
        slot2: null,
        slot3: null,
        slot4: null,
        leave_type: null,
        special_program_ids: null,
      },
    ],
    pcaPool: [makePca('floating-a', [2], 'upper')],
    teamPrefs: buildTeamPrefs([
      {
        id: 'baseline-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
      {
        id: 'baseline-smm',
        team: 'SMM',
        preferred_pca_ids: ['floating-a'],
        preferred_slots: [],
        gym_schedule: 3,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
    ]),
  })
  assert.equal(
    noBaselineSwapCandidates.some((candidate) => candidate.sortKey.includes('baseline-smm-1')),
    false,
    'F1 repair candidates must not rewrite baseline/non-floating allocations from earlier steps.'
  )

  assert.equal(
    duplicateCount(result.allocations, 'FO'),
    0,
    'Task 5 repair should remove FO duplicate slot coverage when SMM can be rescued.'
  )
  assert.equal(
    slotOwner(result.allocations, 'a', 2),
    'SMM',
    'Task 5 repair should restore SMM ranked slot 2 on PCA a.'
  )
  assert.equal(result.pendingPCAFTEPerTeam.SMM, 0)
  assert.equal(result.tracker.SMM.summary.pendingMet, true)
  assert.equal(result.tracker.SMM.summary.gymUsedAsLastResort, false)
  const repairedAssignment = result.tracker.SMM.assignments.find(
    (assignment) =>
      assignment.pcaId === 'a' &&
      assignment.slot === 2 &&
      assignment.allocationStage === 'repair'
  )
  assert.equal(repairedAssignment?.allocationStage, 'repair')
  assert.equal(repairedAssignment?.repairReason, 'ranked-coverage')

  const residualPending = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 1, SMM: 0.25 },
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })
  assert.equal(
    residualPending.pendingPCAFTEPerTeam.FO,
    0.25,
    'Pending should be recomputed relative to Step 3.4 baseline allocations, not all final slots.'
  )
  assert.equal(residualPending.pendingPCAFTEPerTeam.SMM, 0)
  assert.equal(residualPending.tracker.FO.summary.pendingMet, false)
  assert.equal(residualPending.tracker.SMM.summary.pendingMet, true)

  const fairnessOnlyPreferences: PCAPreference[] = [
    {
      id: 'fairness-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'fairness-smm',
      team: 'SMM',
      preferred_pca_ids: ['fair-a'],
      preferred_slots: [],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const fairnessOnlyPool: PCAData[] = [
    makePca('fair-a', [2], 'upper'),
    makePca('fair-c', [3], 'lower'),
  ]
  const fairnessOnlyDraft = runDraftAudit({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    existingAllocations: [],
    pcaPool: fairnessOnlyPool,
    pcaPreferences: fairnessOnlyPreferences,
  })
  assert.equal(
    fairnessOnlyDraft.defects.some((defect) => defect.kind === 'F1' && defect.team === 'SMM'),
    true
  )
  assert.equal(
    fairnessOnlyDraft.defects.some((defect) => defect.kind === 'B1' && defect.team === 'SMM'),
    false,
    'Standalone fairness rescue should not rely on ranked-slot recovery.'
  )

  const fairnessOnlyResult = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    existingAllocations: [],
    pcaPool: fairnessOnlyPool,
    pcaPreferences: fairnessOnlyPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })
  assert.equal(
    slotOwner(fairnessOnlyResult.allocations, 'fair-a', 2),
    'SMM',
    'Standalone fairness repair should free the globally valuable PCA for the pending team.'
  )
  assert.equal(slotOwner(fairnessOnlyResult.allocations, 'fair-c', 3), 'FO')
  assert.equal(fairnessOnlyResult.pendingPCAFTEPerTeam.FO, 0)
  assert.equal(fairnessOnlyResult.pendingPCAFTEPerTeam.SMM, 0)
  const fairnessRepair = fairnessOnlyResult.tracker.SMM.assignments.find(
    (assignment) =>
      assignment.pcaId === 'fair-a' &&
      assignment.slot === 2 &&
      assignment.allocationStage === 'repair'
  )
  assert.equal(fairnessRepair?.repairReason, 'fairness-floor')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
