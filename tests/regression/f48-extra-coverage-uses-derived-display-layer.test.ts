import assert from 'node:assert/strict'

import {
  mergeExtraCoverageIntoStaffOverridesForDisplay,
  stripExtraCoverageOverrides,
} from '../../lib/features/schedule/extraCoverageVisibility'
import { deriveExtraCoverageByStaffId } from '../../lib/features/schedule/extraCoverageRuntime'
import { normalizeScheduleStateForSave } from '../../lib/features/schedule/saveNormalization'
import type { PCAAllocation, ScheduleCalculations } from '../../types/schedule'
import type { Staff, Team } from '../../types/staff'

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
  const staff: Staff[] = [
    {
      id: 'float-1',
      name: 'Float One',
      rank: 'PCA',
      team: null,
      status: 'active',
      floating: true,
      floor_pca: false,
      buffer_fte: null,
      special_program: null,
      special_program_ids: [],
    } as any,
  ]

  const pcaAllocations = emptyTeamRecord<Array<PCAAllocation & { staff: Staff }>>([])
  pcaAllocations.GMC.push({
    id: 'alloc-1',
    schedule_id: '',
    staff_id: 'float-1',
    team: 'GMC',
    fte_pca: 1,
    fte_remaining: 0.25,
    slot_assigned: 0.75,
    slot_whole: null,
    slot1: 'GMC',
    slot2: 'GMC',
    slot3: 'GMC',
    slot4: null,
    leave_type: null,
    special_program_ids: [],
    staff: staff[0],
  })

  const calculations = emptyTeamRecord<ScheduleCalculations | null>(null)
  calculations.GMC = {
    average_pca_per_team: 0.5,
  } as any

  const baseOverrides = {
    'float-1': {
      leaveType: null,
      fteRemaining: 1,
      extraCoverageBySlot: { 1: true },
    },
  } as Record<string, any>

  const derivedExtra = deriveExtraCoverageByStaffId({
    selectedDate: new Date('2026-03-02T08:00:00.000Z'),
    pcaAllocationsByTeam: pcaAllocations,
    staff,
    specialPrograms: [],
    staffOverrides: stripExtraCoverageOverrides(baseOverrides),
    visibleTeams: ['GMC'],
    teamContributorsByMain: { GMC: ['GMC'] } as Partial<Record<Team, Team[]>>,
    calculations,
    mergedInto: {},
  })

  assert.deepEqual(
    derivedExtra,
    {
      'float-1': { 3: true },
    },
    `Expected extra coverage to be derived from current allocations as slot 3 only, but got ${JSON.stringify(derivedExtra)}`
  )

  const displayOverrides = mergeExtraCoverageIntoStaffOverridesForDisplay({
    staffOverrides: baseOverrides,
    extraCoverageByStaffId: derivedExtra,
    initializedSteps: new Set(['floating-pca']),
  })

  assert.deepEqual(
    displayOverrides['float-1']?.extraCoverageBySlot,
    { 3: true },
    `Expected display overrides to use derived extra coverage slot 3, but got ${JSON.stringify(
      displayOverrides['float-1']?.extraCoverageBySlot ?? null
    )}`
  )

  assert.deepEqual(
    baseOverrides['float-1']?.extraCoverageBySlot,
    { 1: true },
    'Expected merge helper to avoid mutating the durable staffOverrides object'
  )

  const hiddenDisplayOverrides = mergeExtraCoverageIntoStaffOverridesForDisplay({
    staffOverrides: baseOverrides,
    extraCoverageByStaffId: derivedExtra,
    initializedSteps: new Set(),
  })

  assert.equal(
    'extraCoverageBySlot' in (hiddenDisplayOverrides['float-1'] ?? {}),
    false,
    'Expected extra coverage to remain absent before Step 3 is initialized'
  )

  const normalized = normalizeScheduleStateForSave({
    stepStatus: {
      'therapist-pca': 'completed',
      'floating-pca': 'completed',
      'bed-relieving': 'pending',
    },
    staffOverrides: baseOverrides,
    therapistAllocations: emptyTeamRecord([] as any),
    pcaAllocations: emptyTeamRecord([] as any),
    bedAllocations: [],
  })

  assert.equal(
    'extraCoverageBySlot' in (normalized.staffOverrides['float-1'] ?? {}),
    false,
    'Expected save normalization to strip derived extra coverage even after Step 3 is completed'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
