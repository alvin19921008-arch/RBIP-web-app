import assert from 'node:assert/strict'

import { executeSlotAssignments, type SlotAssignment } from '../../lib/utils/reservationLogic'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
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

async function main() {
  const adjustedPendingFTE = emptyTeamRecord(0)
  adjustedPendingFTE.FO = 0.25

  const assignments: SlotAssignment[] = [
    { team: 'FO', slot: 1, pcaId: 'restricted-slot-pca', pcaName: 'Restricted Slot PCA' },
  ]

  const floatingPCAs: PCAData[] = [
    {
      id: 'restricted-slot-pca',
      name: 'Restricted Slot PCA',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [2],
    },
  ]

  const result = executeSlotAssignments(assignments, adjustedPendingFTE, [], floatingPCAs)

  assert.equal(
    result.updatedAllocations.length,
    0,
    `Expected execution to reject slot 1 for a PCA only available in slot 2, but got ${result.updatedAllocations.length} allocation(s)`
  )

  assert.equal(
    result.updatedPendingFTE.FO,
    0.25,
    `Expected FO pending to remain 0.25 when the selected reservation is ineligible, but got ${result.updatedPendingFTE.FO}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
