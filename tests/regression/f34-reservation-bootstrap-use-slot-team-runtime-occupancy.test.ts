import assert from 'node:assert/strict'

import { computeStep3BootstrapState } from '../../lib/features/schedule/step3Bootstrap'
import { computeAdjacentSlotReservations } from '../../lib/utils/reservationLogic'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import type { SpecialProgram } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Staff, Team } from '../../types/staff'

function emptyTeamAllocations(): Record<Team, Array<PCAAllocation & { staff?: Staff }>> {
  return {
    FO: [],
    SMM: [],
    SFM: [],
    CPPC: [],
    MC: [],
    GMC: [],
    NSM: [],
    DRO: [],
  }
}

function emptyPendingRecord(value: number): Record<Team, number> {
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
      id: 'pca-robotic',
      name: 'Robotic PCA',
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

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'robotic',
      name: 'Robotic',
      staff_ids: [],
      weekdays: ['mon'],
      slots: { mon: [1, 2], tue: [], wed: [], thu: [], fri: [] } as any,
      fte_subtraction: {},
      pca_required: 0.5,
      pca_preference_order: [],
    } as any,
  ]

  const misroutedAllocation: PCAAllocation = {
    id: 'alloc-robotic-misroute',
    schedule_id: '',
    staff_id: 'pca-robotic',
    team: 'SFM',
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: null,
    slot2: 'SFM',
    slot3: null,
    slot4: null,
    leave_type: null,
    special_program_ids: ['robotic'],
  }

  const pcaAllocations = emptyTeamAllocations()
  pcaAllocations.SFM.push(misroutedAllocation)

  const bootstrap = computeStep3BootstrapState({
    pcaAllocations,
    staff,
    specialPrograms,
    weekday: 'mon',
  })

  assert.equal(
    bootstrap.existingTeamPCAAssigned.SFM,
    0.25,
    `Expected Step 3 bootstrap to count misrouted Robotic slot2->SFM as normal assigned FTE (not special-program reserved), but got ${bootstrap.existingTeamPCAAssigned.SFM}`
  )

  const pending = emptyPendingRecord(0)
  pending.SFM = 0.25
  const floatingPCAs: PCAData[] = [
    {
      id: 'pca-robotic',
      name: 'Robotic PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 2, 3, 4],
    },
  ]

  const adjacent = computeAdjacentSlotReservations(pending, [misroutedAllocation], floatingPCAs, specialPrograms, undefined, 'mon')

  assert.equal(
    adjacent.adjacentReservations.SFM.length,
    0,
    `Expected Step 3.3 to ignore misrouted Robotic slot2->SFM as special-program occupancy, but got ${adjacent.adjacentReservations.SFM.length} adjacent options`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
