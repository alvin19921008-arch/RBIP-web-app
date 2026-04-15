import assert from 'node:assert/strict'

import {
  computeAdjacentSlotReservations,
  executeSlotAssignments,
} from '../../lib/utils/reservationLogic'
import {
  buildStep3V2ScratchAfterStep32,
  shouldOmitStep32ForStep33ReplaceSave,
} from '../../lib/features/schedule/step3V2ScratchPreview'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import type { SpecialProgram } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'
import { roundToNearestQuarterWithMidpoint } from '../../lib/utils/rounding'

function emptyTeamRecord(value: number): Record<Team, number> {
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
  assert.equal(
    shouldOmitStep32ForStep33ReplaceSave({ step33Decision: 'use', pendingAfter32Rounded: 0 }),
    true
  )
  assert.equal(
    shouldOmitStep32ForStep33ReplaceSave({ step33Decision: 'use', pendingAfter32Rounded: 0.25 }),
    false
  )
  assert.equal(
    shouldOmitStep32ForStep33ReplaceSave({ step33Decision: 'skip', pendingAfter32Rounded: 0 }),
    false
  )

  const adjustedPendingFTE = emptyTeamRecord(0)
  adjustedPendingFTE.GMC = 0.25

  const floatingPCAs: PCAData[] = [
    {
      id: 'pca-legal',
      name: '君',
      floating: true,
      special_program: null,
      fte_pca: 1,
      fte_remaining: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 2, 3, 4],
    },
    {
      id: 'adjacent-illegal-slot',
      name: 'Adjacent PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      fte_remaining: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 3, 4],
    },
  ]

  const existingAllocations: PCAAllocation[] = [
    {
      id: 'alloc-special-program',
      schedule_id: '',
      staff_id: 'adjacent-illegal-slot',
      team: 'GMC',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: 'GMC',
      slot4: null,
      leave_type: null,
      special_program_ids: ['program-crp'],
    },
  ]

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'program-crp',
      name: 'CPR',
      staff_ids: ['becca'],
      weekdays: ['mon'],
      slots: {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      } as any,
      fte_subtraction: {},
      pca_required: 0.25,
      pca_preference_order: [],
      staff_configs: [
        {
          id: 'cfg-becca-crp',
          program_id: 'program-crp',
          staff_id: 'becca',
          config_by_weekday: {
            mon: {
              enabled: true,
              slots: [3],
              fte_subtraction: 0,
              is_primary: true,
            },
          },
        },
      ],
    },
  ]

  const step32Assignments = [
    { team: 'GMC' as const, slot: 1, pcaId: 'pca-legal', pcaName: '君' },
  ]

  const scratch = buildStep3V2ScratchAfterStep32({
    adjustedPendingFTE: adjustedPendingFTE,
    existingAllocations,
    floatingPCAs,
    step32Assignments: step32Assignments,
  })

  assert.equal(
    roundToNearestQuarterWithMidpoint(scratch.pendingAfter32.GMC || 0),
    0,
    'Expected Step 3.2 scratch to consume all GMC pending floating for this fixture'
  )

  const noReplace = computeAdjacentSlotReservations(
    scratch.pendingAfter32,
    scratch.scratchAllocations,
    floatingPCAs,
    specialPrograms,
    undefined,
    'mon'
  )
  assert.equal(
    noReplace.adjacentReservations.GMC.length,
    0,
    'With exhausted pending and no replace eligibility, adjacent rows must not imply an additive assign'
  )

  const withReplace = computeAdjacentSlotReservations(
    scratch.pendingAfter32,
    scratch.scratchAllocations,
    floatingPCAs,
    specialPrograms,
    undefined,
    'mon',
    { replaceEligibleTeams: new Set<Team>(['GMC']) }
  )
  assert.ok(
    withReplace.adjacentReservations.GMC.length >= 1,
    'Replace path should still surface adjacent special-program rows when Step 3.2 exhausted pending'
  )

  const step32Save: typeof step32Assignments = []
  const step33Save = [{ team: 'GMC' as const, slot: 4, pcaId: 'adjacent-illegal-slot', pcaName: 'Adjacent PCA' }]

  const merged = executeSlotAssignments(
    [...step32Save, ...step33Save],
    { ...adjustedPendingFTE } as Record<Team, number>,
    existingAllocations.map((allocation) => ({ ...allocation })),
    floatingPCAs
  )

  assert.equal(merged.executedAssignments.length, 1)
  assert.equal(merged.executedAssignments[0]?.slot, 4)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
