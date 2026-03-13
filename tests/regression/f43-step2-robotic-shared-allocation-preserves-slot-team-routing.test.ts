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
      id: 'robotic-pca',
      name: 'Robotic PCA',
      floating: true,
      special_program: ['Robotic'],
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 2, 3, 4],
    },
  ]

  const averagePCAPerTeam = emptyTeamRecord(0)
  averagePCAPerTeam.SMM = 0.5
  averagePCAPerTeam.SFM = 0.5

  const pcaPreferences: PCAPreference[] = []
  const specialPrograms: SpecialProgram[] = [
    {
      id: 'robotic',
      name: 'Robotic',
      staff_ids: [],
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      slots: {
        wed: [1, 2, 3, 4],
      } as any,
      fte_subtraction: {},
      pca_required: 1,
      pca_preference_order: ['robotic-pca'],
    } as any,
  ]

  const result = await allocatePCA({
    date: new Date('2026-03-04T08:00:00.000Z'),
    totalPCAAvailable: 1,
    pcaPool,
    averagePCAPerTeam,
    specialPrograms,
    pcaPreferences,
    phase: 'non-floating-with-special',
    specialProgramTargetTeamById: {
      robotic: 'SMM',
    },
  } as any)

  const roboticAllocation = result.allocations.find((allocation) => allocation.special_program_ids?.includes('robotic'))
  assert.ok(roboticAllocation, 'Expected a Robotic shared allocation to be created')

  assert.equal(
    roboticAllocation!.slot1,
    'SMM',
    `Expected Robotic slot 1 to route to SMM, but got ${roboticAllocation!.slot1 ?? null}`
  )
  assert.equal(
    roboticAllocation!.slot2,
    'SMM',
    `Expected Robotic slot 2 to route to SMM, but got ${roboticAllocation!.slot2 ?? null}`
  )
  assert.equal(
    roboticAllocation!.slot3,
    'SFM',
    `Expected Robotic slot 3 to route to SFM from runtime slot-team routing, but got ${roboticAllocation!.slot3 ?? null}`
  )
  assert.equal(
    roboticAllocation!.slot4,
    'SFM',
    `Expected Robotic slot 4 to route to SFM from runtime slot-team routing, but got ${roboticAllocation!.slot4 ?? null}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
