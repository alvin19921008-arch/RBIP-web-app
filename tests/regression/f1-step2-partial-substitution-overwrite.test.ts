import assert from 'node:assert/strict'

import { allocatePCA, type PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference, SpecialProgram } from '../../types/allocation'
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
  const pcaPool: PCAData[] = [
    {
      id: 'non-floating-fo',
      name: 'Non Floating FO',
      floating: false,
      special_program: null,
      fte_pca: 0.75,
      leave_type: null,
      is_available: true,
      team: 'FO',
      availableSlots: [2, 3, 4],
    },
    {
      id: 'non-floating-smm',
      name: 'Non Floating SMM',
      floating: false,
      special_program: null,
      fte_pca: 0.75,
      leave_type: null,
      is_available: true,
      team: 'SMM',
      availableSlots: [2, 3, 4],
    },
    {
      id: 'floating-slot-1',
      name: 'Floating Slot 1',
      floating: true,
      special_program: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1],
    },
  ]

  const averagePCAPerTeam = emptyTeamRecord(0)
  averagePCAPerTeam.FO = 1
  averagePCAPerTeam.SMM = 1

  const specialPrograms: SpecialProgram[] = []
  const pcaPreferences: PCAPreference[] = []

  const result = await allocatePCA({
    date: new Date('2026-03-02T08:00:00.000Z'),
    totalPCAAvailable: 2.5,
    pcaPool,
    averagePCAPerTeam,
    specialPrograms,
    pcaPreferences,
    phase: 'non-floating-with-special',
  })

  const remainingNeed = result.pendingPCAFTEPerTeam.FO + result.pendingPCAFTEPerTeam.SMM

  assert.equal(
    remainingNeed,
    0.25,
    `Expected one team to remain short by 0.25 because only one floating slot 1 exists, but got pending total ${remainingNeed}`
  )

  const floatingAllocation = result.allocations.find((allocation) => allocation.staff_id === 'floating-slot-1')
  assert.ok(floatingAllocation, 'Expected a floating substitution allocation to exist')

  const occupiedSlotCount = [floatingAllocation!.slot1, floatingAllocation!.slot2, floatingAllocation!.slot3, floatingAllocation!.slot4]
    .filter((team) => team !== null)
    .length

  assert.equal(
    occupiedSlotCount,
    1,
    `Expected the single-slot floating PCA to occupy exactly one slot, but got ${occupiedSlotCount}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
