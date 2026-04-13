import assert from 'node:assert/strict'

import { computeStep3BootstrapState } from '../../lib/features/schedule/step3Bootstrap'
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
      id: 'pca-1',
      name: 'Bootstrap PCA',
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
      id: 'program-crp',
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
      pca_preference_order: [],
      staff_configs: [
        {
          id: 'cfg-becca-crp',
          program_id: 'program-crp',
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

  const canonicalAllocations = emptyTeamAllocations()
  canonicalAllocations.GMC.push({
    id: 'alloc-canonical',
    schedule_id: '',
    staff_id: 'pca-1',
    team: 'GMC',
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: null,
    slot2: null,
    slot3: 'GMC',
    slot4: null,
    leave_type: null,
    special_program_ids: ['program-crp'],
  })

  const canonicalBootstrap = computeStep3BootstrapState({
    pcaAllocations: canonicalAllocations,
    staff,
    specialPrograms,
    weekday: 'mon',
  })

  assert.equal(
    canonicalBootstrap.existingTeamPCAAssigned.GMC,
    0,
    `Expected Step 3 bootstrap to exclude canonical CRP slot 3 from GMC assigned FTE, but got ${canonicalBootstrap.existingTeamPCAAssigned.GMC}`
  )
  assert.equal(
    Object.values(canonicalBootstrap.nonFloatingFteBreakdownByTeam.GMC ?? {}).reduce((a, v) => a + (v ?? 0), 0),
    0,
    'Expected non-floating breakdown for GMC to sum to 0 when only special-program slot covers GMC'
  )

  const overrideAllocations = emptyTeamAllocations()
  overrideAllocations.GMC.push({
    id: 'alloc-override',
    schedule_id: '',
    staff_id: 'pca-1',
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
    special_program_ids: ['program-crp'],
  })

  const overrideBootstrap = computeStep3BootstrapState({
    pcaAllocations: overrideAllocations,
    staff,
    specialPrograms,
    weekday: 'mon',
    staffOverrides: {
      becca: {
        specialProgramOverrides: [
          {
            programId: 'program-crp',
            requiredSlots: [4],
          },
        ],
      },
    } as any,
  })

  assert.equal(
    overrideBootstrap.existingTeamPCAAssigned.GMC,
    0,
    `Expected Step 3 bootstrap to exclude Step 2 override slot 4 from GMC assigned FTE, but got ${overrideBootstrap.existingTeamPCAAssigned.GMC}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
