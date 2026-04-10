import assert from 'node:assert/strict'

import { runStep3V2CommittedSelections } from '../../lib/features/schedule/step3V2CommittedSelections'
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

function makeExistingAllocation(args: {
  id: string
  team: Team
  slot: 1 | 2 | 3 | 4
  specialProgramIds?: string[] | null
}): PCAAllocation {
  return {
    id: args.id,
    schedule_id: '',
    staff_id: args.id,
    team: args.team,
    fte_pca: 0.25,
    fte_remaining: 0,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: args.slot === 1 ? args.team : null,
    slot2: args.slot === 2 ? args.team : null,
    slot3: args.slot === 3 ? args.team : null,
    slot4: args.slot === 4 ? args.team : null,
    leave_type: null,
    special_program_ids: args.specialProgramIds ?? null,
  }
}

function countTeamCoverage(allocations: PCAAllocation[], team: Team, slot: 1 | 2 | 3 | 4): number {
  return allocations.filter((allocation) => {
    if (slot === 1) return allocation.slot1 === team
    if (slot === 2) return allocation.slot2 === team
    if (slot === 3) return allocation.slot3 === team
    return allocation.slot4 === team
  }).length
}

async function main() {
  const result = await runStep3V2CommittedSelections({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [
      makeExistingAllocation({
        id: 'baseline-fo-slot2',
        team: 'FO',
        slot: 2,
      }),
      makeExistingAllocation({
        id: 'special-fo-slot3',
        team: 'FO',
        slot: 3,
        specialProgramIds: ['robotics'],
      }),
    ],
    floatingPCAs: [makePca('float-slot2', [2], 'upper'), makePca('float-slot3', [3], 'upper')],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: ['float-slot2', 'float-slot3'],
        preferred_slots: [2, 3],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
    step32Assignments: [{ team: 'FO', slot: 2, pcaId: 'float-slot2', pcaName: 'Float Slot 2' }],
    step33Assignments: [{ team: 'FO', slot: 3, pcaId: 'float-slot3', pcaName: 'Float Slot 3' }],
  })

  assert.equal(
    countTeamCoverage(result.allocations, 'FO', 2),
    2,
    'Raw slot occupancy should show FO slot 2 as stacked after Step 2 baseline plus Step 3.2 coverage.'
  )
  assert.equal(
    countTeamCoverage(result.allocations, 'FO', 3),
    2,
    'Raw slot occupancy should show FO slot 3 as stacked after Step 2 special-program plus Step 3.3 coverage.'
  )

  const step32Assignment = result.tracker.FO.assignments.find(
    (assignment) => assignment.assignedIn === 'step32' && assignment.slot === 2
  )
  const step33Assignment = result.tracker.FO.assignments.find(
    (assignment) => assignment.assignedIn === 'step33' && assignment.slot === 3
  )

  assert.equal(
    step32Assignment?.duplicateSlot,
    false,
    'Committed Step 3.2 coverage on top of a baseline non-floating slot should not be pre-labeled as duplicate-floating.'
  )
  assert.equal(
    step33Assignment?.duplicateSlot,
    false,
    'Committed Step 3.3 coverage on top of a special-program-covered slot should not be pre-labeled as duplicate-floating.'
  )

  assert.equal(
    (step32Assignment as any)?.step3OwnershipKind,
    'step3-floating',
    'Step 3.2 tracker rows should stamp Step 3 ownership explicitly so raw occupancy is not the only signal.'
  )
  assert.equal(
    (step32Assignment as any)?.upstreamCoverageKind,
    'non-floating',
    'Tracker rows should preserve that slot 2 was upstream-covered by baseline non-floating work.'
  )
  assert.equal(
    (step33Assignment as any)?.step3OwnershipKind,
    'step3-floating',
    'Step 3.3 tracker rows should stamp Step 3 ownership explicitly so true floating-on-floating can be distinguished later.'
  )
  assert.equal(
    (step33Assignment as any)?.upstreamCoverageKind,
    'special-program',
    'Tracker rows should preserve that slot 3 was upstream-covered by special-program work.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
