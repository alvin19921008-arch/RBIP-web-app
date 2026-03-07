import assert from 'node:assert/strict'

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
  const mod = await import('../../lib/utils/reservationLogic')
  const simulateStep30BufferPreAssignments = (mod as any).simulateStep30BufferPreAssignments

  assert.equal(
    typeof simulateStep30BufferPreAssignments,
    'function',
    'Expected simulateStep30BufferPreAssignments() to exist for Step 3.0 auto-buffer regression coverage'
  )

  const currentPendingFTE = emptyTeamRecord(0)
  currentPendingFTE.FO = 0.25

  const floatingPCAs: PCAData[] = [
    {
      id: 'buffer-pca',
      name: 'Buffer PCA',
      floating: true,
      special_program: null,
      fte_pca: 0.5,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [3, 4],
    },
  ]

  const result = simulateStep30BufferPreAssignments({
    currentPendingFTE,
    currentAllocations: [],
    floatingPCAs,
    bufferFloatingPCAIds: ['buffer-pca'],
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    ratio: 0.5,
  })

  assert.equal(
    result.step30Assignments.length,
    1,
    `Expected one Step 3.0 auto-buffer assignment, but got ${result.step30Assignments.length}`
  )

  assert.equal(
    result.step30Assignments[0]?.slot,
    3,
    `Expected Step 3.0 auto-buffer assignment to choose the first legal slot 3, but got slot ${result.step30Assignments[0]?.slot}`
  )

  assert.equal(
    result.updatedPendingFTE.FO,
    0,
    `Expected FO pending to drop to 0 after the legal auto-buffer assignment, but got ${result.updatedPendingFTE.FO}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
