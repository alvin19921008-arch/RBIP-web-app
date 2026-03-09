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
      id: 'floating-crp',
      name: 'Floating CRP',
      floating: true,
      special_program: ['CRP'],
      fte_pca: 0.25,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [2, 3],
    },
  ]

  const averagePCAPerTeam = emptyTeamRecord(0)
  averagePCAPerTeam.CPPC = 0.25
  averagePCAPerTeam.GMC = 0.25

  const pcaPreferences: PCAPreference[] = []

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'crp',
      name: 'CRP',
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
      pca_preference_order: ['floating-crp'],
      staff_configs: [
        {
          id: 'cfg-becca-crp',
          program_id: 'crp',
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

  const result = await allocatePCA({
    date: new Date('2026-03-02T08:00:00.000Z'),
    totalPCAAvailable: 0.25,
    pcaPool,
    averagePCAPerTeam,
    specialPrograms,
    pcaPreferences,
    phase: 'non-floating-with-special',
    specialProgramTargetTeamById: {
      crp: 'GMC',
    },
  } as any)

  const crpAllocation = result.allocations.find((allocation) => allocation.special_program_ids?.includes('crp'))
  assert.ok(crpAllocation, 'Expected a CRP PCA allocation to be created')

  assert.equal(
    crpAllocation!.team,
    'GMC',
    `Expected CRP PCA allocation to follow the canonical therapist team GMC, but got ${crpAllocation!.team}`
  )

  assert.equal(
    crpAllocation!.slot2,
    null,
    `Expected canonical CRP slot 3 to be used instead of the fallback slot 2, but got slot2=${crpAllocation!.slot2}`
  )

  assert.equal(
    crpAllocation!.slot3,
    'GMC',
    `Expected CRP slot 3 to be assigned to GMC from canonical weekday config, but got ${crpAllocation!.slot3}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
