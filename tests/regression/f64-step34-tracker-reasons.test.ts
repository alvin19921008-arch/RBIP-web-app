import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot } from '../../lib/algorithms/pcaAllocation'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
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

function makePca(id: string, slots: number[], floor?: 'upper' | 'lower'): PCAData {
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
    floor_pca: floor ? [floor] : undefined,
  } as PCAData
}

async function main() {
  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [],
    pcaPool: [makePca('preferred-a', [3], 'upper'), makePca('floor-m', [1], 'upper')],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: ['preferred-a'],
        preferred_slots: [1, 3],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
  })

  assert.equal(result.tracker.FO.summary.pendingMet, true)
  assert.equal(result.tracker.FO.summary.highestRankedSlotFulfilled, 1)
  assert.equal(result.tracker.FO.summary.usedUnrankedSlot, false)
  assert.equal(result.tracker.FO.summary.usedDuplicateFloatingSlot, false)
  assert.equal(result.tracker.FO.summary.gymUsedAsLastResort, false)
  assert.equal(result.tracker.FO.summary.preferredPCAUsed, true)
  assert.equal(result.tracker.FO.summary.fromStep34Cycle1, 2)
  assert.equal(result.tracker.FO.summary.fromStep34Cycle3, 0)

  const rankTwoAssignment = result.tracker.FO.assignments.find((assignment) => assignment.slot === 3)
  const rankOneAssignment = result.tracker.FO.assignments.find((assignment) => assignment.slot === 1)

  assert.equal(rankOneAssignment?.cycle, 1)
  assert.equal(rankTwoAssignment?.fulfilledSlotRank, 2)
  assert.equal(rankTwoAssignment?.cycle, 1)
  assert.equal(rankTwoAssignment?.slotSelectionPhase, 'ranked-unused')
  assert.equal(rankTwoAssignment?.pcaSelectionTier, 'preferred')
  assert.equal(rankTwoAssignment?.usedContinuity, false)

  const repaired = await allocateFloatingPCA_v2RankedSlot({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 },
    existingAllocations: [],
    pcaPool: [makePca('fo-primary', [1], 'upper'), makePca('fo-alt', [2], 'upper'), makePca('smm-fallback', [4], 'upper')],
    pcaPreferences: [
      {
        id: 'repair-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
      {
        id: 'repair-smm',
        team: 'SMM',
        preferred_pca_ids: [],
        preferred_slots: [1],
        gym_schedule: 2,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
  })

  const repairAssignment = repaired.tracker.SMM.assignments.find(
    (assignment) =>
      assignment.slot === 1 &&
      assignment.pcaId === 'fo-primary' &&
      assignment.allocationStage === 'repair'
  )
  assert.equal(repairAssignment?.allocationStage, 'repair')
  assert.equal(repairAssignment?.repairReason, 'ranked-coverage')

  const extraCoverage = await allocateFloatingPCA_v2RankedSlot({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: emptyTeamRecord(0),
    existingAllocations: [],
    pcaPool: [makePca('extra-fo', [2], 'upper')],
    pcaPreferences: [
      {
        id: 'extra-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
    extraCoverageMode: 'round-robin-team-order',
  })

  const extraCoverageAssignment = extraCoverage.tracker.FO.assignments.find(
    (assignment) => assignment.slot === 2 && assignment.pcaId === 'extra-fo'
  )
  assert.equal(extraCoverageAssignment?.assignmentTag, 'extra')
  assert.equal(extraCoverageAssignment?.allocationStage, 'extra-coverage')
  assert.equal(extraCoverageAssignment?.repairReason, null)

  const noOp = await allocateFloatingPCA_v2RankedSlot({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0) },
    existingAllocations: [
      {
        id: 'baseline-fo-1',
        schedule_id: '',
        staff_id: 'baseline-fo-1',
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
    pcaPool: [],
    pcaPreferences: [
      {
        id: 'noop-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [1],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
  })
  assert.equal(noOp.tracker.FO.assignments.length, 0)
  assert.equal(noOp.tracker.FO.summary.fromStep34Cycle3, 0)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
