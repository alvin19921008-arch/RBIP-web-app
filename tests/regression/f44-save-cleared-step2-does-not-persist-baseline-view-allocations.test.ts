import assert from 'node:assert/strict'

import { normalizeScheduleStateForSave } from '../../lib/features/schedule/saveNormalization'
import type { Team, Staff } from '../../types/staff'
import type { PCAAllocation, TherapistAllocation, BedAllocation } from '../../types/schedule'

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

async function main() {
  const therapist = {
    id: 'therapist-1',
    name: 'Therapist 1',
    team: 'SMM',
    rank: 'SPT',
  } as Staff

  const nonFloatingPca = {
    id: 'pca-nf-1',
    name: 'Non Floating PCA',
    team: 'SMM',
    rank: 'PCA',
    floating: false,
  } as Staff

  const floatingPca = {
    id: 'pca-f-1',
    name: 'Floating PCA',
    team: null,
    rank: 'PCA',
    floating: true,
  } as unknown as Staff

  const therapistAllocations = emptyTeamRecord<(TherapistAllocation & { staff: Staff })[]>([])
  therapistAllocations.SMM = [
    {
      id: 't1',
      schedule_id: 'schedule-1',
      staff_id: therapist.id,
      team: 'SMM',
      fte_therapist: 1,
      fte_remaining: 0,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
      is_substitute_team_head: false,
      spt_slot_display: null,
      is_manual_override: false,
      manual_override_note: null,
      staff: therapist,
    },
  ]

  const pcaAllocations = emptyTeamRecord<(PCAAllocation & { staff: Staff })[]>([])
  pcaAllocations.SMM = [
    {
      id: 'p1',
      schedule_id: 'schedule-1',
      staff_id: nonFloatingPca.id,
      team: 'SMM',
      fte_pca: 1,
      fte_remaining: 1,
      slot_assigned: 0,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
      invalid_slot: null,
      staff: nonFloatingPca,
    },
  ]
  pcaAllocations.FO = [
    {
      id: 'p2',
      schedule_id: 'schedule-1',
      staff_id: floatingPca.id,
      team: 'FO',
      fte_pca: 1,
      fte_remaining: 1,
      slot_assigned: 0,
      slot_whole: null,
      slot1: 'FO',
      slot2: 'FO',
      slot3: 'FO',
      slot4: 'FO',
      leave_type: null,
      special_program_ids: null,
      invalid_slot: null,
      staff: floatingPca,
    },
  ]

  const bedAllocations: BedAllocation[] = [
    {
      id: 'b1',
      schedule_id: 'schedule-1',
      from_team: 'SMM',
      to_team: 'FO',
      ward: 'ward-1',
      num_beds: 2,
      slot: 1,
    } as any,
  ]

  const normalized = normalizeScheduleStateForSave({
    stepStatus: {
      'leave-fte': 'completed',
      'therapist-pca': 'pending',
      'floating-pca': 'pending',
      'bed-relieving': 'pending',
      review: 'pending',
    },
    staffOverrides: {
      [floatingPca.id]: {
        leaveType: null,
        fteRemaining: 1,
        extraCoverageBySlot: { 1: true, 2: true },
      },
    },
    therapistAllocations,
    pcaAllocations,
    bedAllocations,
  })

  assert.equal(
    Object.values(normalized.therapistAllocations).flat().length,
    1,
    'Expected therapist allocations to be preserved so Step 1 duty therapists still render after reload'
  )
  assert.equal(
    Object.values(normalized.pcaAllocations).flat().length,
    0,
    'Expected PCA allocations to be omitted from persisted rows when Step 2 is pending'
  )
  assert.equal(
    normalized.bedAllocations.length,
    0,
    'Expected downstream bed-relieving allocations to be cleared when Step 2 is pending'
  )
  assert.deepEqual(
    normalized.staffOverrides,
    {
      [floatingPca.id]: {
        leaveType: null,
        fteRemaining: 1,
      },
    },
    'Expected stale extraCoverageBySlot flags to be stripped before saving a Step-1-only schedule'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
