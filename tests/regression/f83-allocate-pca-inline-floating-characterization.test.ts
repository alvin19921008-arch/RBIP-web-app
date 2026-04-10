import assert from 'node:assert/strict'

import { allocatePCA, type PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
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

function makePca(id: string, slots: number[]): PCAData {
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
    floor_pca: ['upper'],
  } as PCAData
}

const preference: PCAPreference = {
  id: 'pref-fo',
  team: 'FO',
  preferred_pca_ids: [],
  preferred_slots: [1, 3],
  gym_schedule: 4,
  avoid_gym_schedule: true,
  floor_pca_selection: 'upper',
}

async function main() {
  const base = {
    date: new Date('2026-04-10T08:00:00.000Z'),
    totalPCAAvailable: 1,
    pcaPool: [makePca('float-a', [1, 3])],
    averagePCAPerTeam: { ...emptyTeamRecord(0), FO: 0.5 },
    specialPrograms: [],
    pcaPreferences: [preference],
    staffOverrides: {},
  }

  const floatingOnly = await allocatePCA({
    ...base,
    phase: 'floating',
    existingAllocations: [],
    existingTeamPCAAssigned: emptyTeamRecord(0),
  })

  const floatingRow = floatingOnly.allocations.find((allocation) => allocation.staff_id === 'float-a')
  assert.equal(floatingRow?.slot1, 'FO')
  assert.equal(floatingRow?.slot3, 'FO')
  assert.equal(floatingOnly.pendingPCAFTEPerTeam.FO, 0)

  const allPhase = await allocatePCA({
    ...base,
    phase: 'all',
  })

  const allPhaseRow = allPhase.allocations.find((allocation) => allocation.staff_id === 'float-a')
  assert.equal(allPhaseRow?.slot1, 'FO')
  assert.equal(allPhaseRow?.slot3, 'FO')
  assert.equal(allPhase.pendingPCAFTEPerTeam.FO, 0)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
