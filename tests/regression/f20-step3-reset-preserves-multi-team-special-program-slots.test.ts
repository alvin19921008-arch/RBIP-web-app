import assert from 'node:assert/strict'

import { computeStep3ResetForReentry } from '../../lib/features/schedule/stepReset'
import type { PCAAllocation } from '../../types/schedule'
import type { Staff, Team } from '../../types/staff'

function emptyTeamAllocations(): Record<Team, Array<PCAAllocation & { staff: Staff }>> {
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

function emptyAverage(): Record<Team, number> {
  return {
    FO: 0,
    SMM: 0,
    SFM: 0,
    CPPC: 0,
    MC: 0,
    GMC: 0,
    NSM: 0,
    DRO: 0,
  }
}

async function main() {
  const floatingPca = {
    id: 'pca-robotic',
    name: 'Robotic PCA',
    rank: 'PCA',
    floating: true,
    status: 'active',
    team: null,
    floor_pca: false,
    special_program: ['Robotic'],
    special_program_ids: ['program-robotic'],
  } as any as Staff

  const alloc: PCAAllocation & { staff: Staff } = {
    id: 'alloc-robotic',
    schedule_id: '',
    staff_id: floatingPca.id,
    team: 'SMM',
    fte_pca: 1,
    fte_remaining: 0.5,
    slot_assigned: 0.5,
    slot_whole: null,
    slot1: 'SMM',
    slot2: null,
    slot3: 'SFM',
    slot4: null,
    leave_type: null,
    special_program_ids: ['program-robotic'],
    staff: floatingPca,
  }

  const pcaAllocations = emptyTeamAllocations()
  pcaAllocations.SMM.push(alloc)
  pcaAllocations.SFM.push(alloc)

  const result = computeStep3ResetForReentry({
    pcaAllocations,
    staff: [floatingPca],
    bufferStaff: [],
    staffOverrides: {},
    averagePcaByTeam: emptyAverage(),
    specialPrograms: [
      {
        id: 'program-robotic',
        name: 'Robotic',
        weekdays: ['mon'],
        slots: {
          mon: [1, 2, 3, 4],
          tue: [],
          wed: [],
          thu: [],
          fri: [],
        },
      } as any,
    ],
    weekday: 'mon',
  })

  assert.equal(
    result.cleanedPcaAllocations.SFM.length,
    1,
    `Expected Step 3 reset to preserve the slot-team view of a multi-team robotic allocation, but SFM had ${result.cleanedPcaAllocations.SFM.length} preserved allocations`
  )

  assert.equal(
    result.cleanedPcaAllocations.SFM[0]?.slot3,
    'SFM',
    `Expected Step 3 reset to preserve robotic slot 3 under SFM, but got ${result.cleanedPcaAllocations.SFM[0]?.slot3 ?? null}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
