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
    { team: 'FO', slot: 2, pcaId: 'adjacent-a', pcaName: 'Adjacent A' },
    { team: 'FO', slot: 4, pcaId: 'adjacent-b', pcaName: 'Adjacent B' },
  ]

  const floatingPCAs: PCAData[] = [
    {
      id: 'adjacent-a',
      name: 'Adjacent A',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [2],
    },
    {
      id: 'adjacent-b',
      name: 'Adjacent B',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [4],
    },
  ]

  const result = executeSlotAssignments(assignments, adjustedPendingFTE, [], floatingPCAs)

  const assignedSlotCount = result.updatedAllocations.reduce((count, allocation) => {
    return count + [allocation.slot1, allocation.slot2, allocation.slot3, allocation.slot4].filter((slotTeam) => slotTeam !== null).length
  }, 0)

  assert.equal(
    assignedSlotCount,
    1,
    `Expected Step 3.3 execution to consume only one slot when FO had 0.25 pending, but got ${assignedSlotCount} assigned slots`
  )

  assert.equal(
    result.updatedPendingFTE.FO,
    0,
    `Expected FO pending to bottom out at 0 after one legal assignment, but got ${result.updatedPendingFTE.FO}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
