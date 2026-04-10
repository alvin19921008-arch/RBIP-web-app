import assert from 'node:assert/strict'

import {
  allocateFloatingPCA_v1LegacyPreference,
  allocateFloatingPCA_v2RankedSlot,
  type PCAData,
} from '../../lib/algorithms/pcaAllocation'
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

function duplicateCount(result: Awaited<ReturnType<typeof allocateFloatingPCA_v2RankedSlot>>, team: Team) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const allocation of result.allocations.filter((row) => row.team === team)) {
    if (allocation.slot1 === team) counts[1] += 1
    if (allocation.slot2 === team) counts[2] += 1
    if (allocation.slot3 === team) counts[3] += 1
    if (allocation.slot4 === team) counts[4] += 1
  }
  return Object.values(counts).filter((count) => count > 1).length
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  const pcaPool: PCAData[] = [
    makePca('a', [2, 4], 'lower'),
    makePca('b', [4], 'upper'),
    makePca('c', [1, 3], 'upper'),
  ]

  const preferences: PCAPreference[] = [
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

  const base = {
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.75, SMM: 0.25 },
    existingAllocations,
    pcaPool,
    pcaPreferences: preferences,
    specialPrograms: [],
    mode: 'standard' as const,
    extraCoverageMode: 'none' as const,
  }

  const v1 = await allocateFloatingPCA_v1LegacyPreference({
    ...base,
    preferenceSelectionMode: 'legacy',
    preferenceProtectionMode: 'exclusive',
    selectedPreferenceAssignments: [],
  })

  const v2 = await allocateFloatingPCA_v2RankedSlot({
    ...base,
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  assert.equal(duplicateCount(v1, 'FO'), 0)
  assert.equal(
    duplicateCount(v2, 'FO'),
    0,
    'Ranked V2 should repair the old core duplicate shape instead of leaving duplicate coverage in the final result.'
  )

  const v1Slots = new Set(v1.tracker.FO.assignments.map((assignment) => assignment.slot))
  assert.equal(v1Slots.has(4), true)

  const repairedSmmAssignment = v2.tracker.SMM.assignments.find(
    (assignment) =>
      assignment.slot === 2 &&
      assignment.pcaId === 'a' &&
      assignment.allocationStage === 'repair'
  )
  assert.equal(repairedSmmAssignment?.repairReason, 'ranked-coverage')

  const foGymAssignment = v2.tracker.FO.assignments.find(
    (assignment) =>
      assignment.slot === 4 &&
      assignment.pcaId === 'a' &&
      assignment.slotSelectionPhase === 'gym-last-resort'
  )
  assert.equal(foGymAssignment?.allocationStage, 'repair')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
