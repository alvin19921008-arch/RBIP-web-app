import assert from 'node:assert/strict'

import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import { computeStep3BootstrapState } from '../../lib/features/schedule/step3Bootstrap'
import { buildPcaAllocatorView, buildScheduleRuntimeProjection } from '../../lib/utils/scheduleRuntimeProjection'
import { buildPageStep3RuntimeState } from '../../lib/features/schedule/pageStep3Runtime'
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

async function main() {
  const staff: Staff[] = [
    {
      id: 'float-shared',
      name: 'Float Shared',
      rank: 'PCA',
      team: null,
      status: 'active',
      floating: true,
      floor_pca: false,
      buffer_fte: null,
      special_program: ['CRP'],
      special_program_ids: [],
    } as any,
    {
      id: 'nf-1',
      name: 'Non Floating',
      rank: 'PCA',
      team: 'GMC',
      status: 'active',
      floating: false,
      floor_pca: false,
      buffer_fte: null,
      special_program: null,
      special_program_ids: [],
    } as any,
  ]

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
      pca_preference_order: ['float-shared'],
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

  const pcaAllocations = emptyTeamAllocations()
  pcaAllocations.GMC.push({
    id: 'alloc-special',
    schedule_id: '',
    staff_id: 'float-shared',
    team: 'GMC',
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: null,
    slot2: null,
    slot3: null,
    slot4: 'GMC',
    leave_type: null,
    special_program_ids: ['crp'],
  })

  const staffOverrides = {
    'float-shared': {
      leaveType: null,
      fteRemaining: 1,
      availableSlots: [1, 2, 3, 4],
      specialProgramOverrides: [
        {
          programId: 'crp',
          pcaId: 'float-shared',
          slots: [4],
          requiredSlots: [4],
        },
      ],
      substitutionFor: {
        staffId: 'nf-1',
        slots: [2],
      },
    },
  } as any

  const runtime = buildPageStep3RuntimeState({
    selectedDate: new Date('2026-03-02T08:00:00.000Z'),
    staff,
    staffOverrides,
    pcaAllocations,
    specialPrograms,
  })

  const projection = buildScheduleRuntimeProjection({
    selectedDate: new Date('2026-03-02T08:00:00.000Z'),
    staff,
    staffOverrides,
    excludeSubstitutionSlotsForFloating: true,
    excludeSpecialProgramSlotsForFloating: true,
    clampBufferFteRemaining: true,
  })
  const expectedPcaData: PCAData[] = buildPcaAllocatorView({
    projection,
    fallbackToBaseTeamWhenEffectiveTeamMissing: true,
  })
  const expectedBootstrap = computeStep3BootstrapState({
    pcaAllocations,
    staff,
    specialPrograms,
    weekday: projection.weekday,
    staffOverrides,
  })

  assert.deepEqual(
    runtime.existingAllocations,
    expectedBootstrap.existingAllocations,
    'Expected page Step 3 runtime helper to delegate existing allocation extraction to computeStep3BootstrapState'
  )

  assert.deepEqual(
    runtime.pcaData,
    expectedPcaData,
    'Expected page Step 3 runtime helper to delegate PCA runtime projection to buildScheduleRuntimeProjection/buildPcaAllocatorView'
  )

  const floating = runtime.pcaData.find((entry) => entry.id === 'float-shared')
  assert.deepEqual(
    floating?.availableSlots,
    [1, 3],
    `Expected shared runtime prep to exclude substitution slot 2 and reserved special-program slot 4 while preserving slot 3, but got ${JSON.stringify(
      floating?.availableSlots ?? null
    )}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
