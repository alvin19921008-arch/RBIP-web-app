import assert from 'node:assert/strict'

import { derivePcaSubstitutionInfo } from '../../lib/features/schedule/pcaSubstitutionDisplay'

async function main() {
  const staffOverrides = {
    'nf-gmc': { leaveType: null, fteRemaining: 0.75, availableSlots: [2, 3, 4] },
    'nf-mc': { leaveType: null, fteRemaining: 0.75, availableSlots: [2, 3, 4] },
  }

  const allPcaStaff = [
    { id: 'nf-gmc', name: 'NF GMC', rank: 'PCA', floating: false, team: 'GMC' },
    { id: 'nf-mc', name: 'NF MC', rank: 'PCA', floating: false, team: 'MC' },
    { id: 'float-gmc-cover', name: 'Float GMC Cover', rank: 'PCA', floating: true, team: null },
    { id: 'float-gmc-regular', name: 'Float GMC Regular', rank: 'PCA', floating: true, team: null },
    { id: 'float-mc-cover', name: 'Float MC Cover', rank: 'PCA', floating: true, team: null },
  ] as any

  const gmcCover = {
    id: 'alloc-gmc-cover',
    staff_id: 'float-gmc-cover',
    slot1: 'GMC',
    slot2: null,
    slot3: null,
    slot4: null,
    special_program_ids: null,
    staff: allPcaStaff[2],
  } as any

  const gmcRegular = {
    id: 'alloc-gmc-regular',
    staff_id: 'float-gmc-regular',
    slot1: null,
    slot2: 'GMC',
    slot3: null,
    slot4: null,
    special_program_ids: null,
    staff: allPcaStaff[3],
  } as any

  const mcCover = {
    id: 'alloc-mc-cover',
    staff_id: 'float-mc-cover',
    slot1: 'MC',
    slot2: null,
    slot3: null,
    slot4: null,
    special_program_ids: null,
    staff: allPcaStaff[4],
  } as any

  assert.deepEqual(
    derivePcaSubstitutionInfo({
      team: 'GMC',
      floatingAlloc: gmcCover,
      staffOverrides: staffOverrides as any,
      allPCAStaff: allPcaStaff as any,
    }),
    {
      isSubstituting: true,
      isWholeDaySubstitution: false,
      substitutedSlots: [1],
    },
    'Expected the GMC cover PCA to be marked as substituting for slot 1'
  )

  assert.deepEqual(
    derivePcaSubstitutionInfo({
      team: 'GMC',
      floatingAlloc: gmcRegular,
      staffOverrides: staffOverrides as any,
      allPCAStaff: allPcaStaff as any,
    }),
    {
      isSubstituting: false,
      isWholeDaySubstitution: false,
      substitutedSlots: [],
    },
    'Expected unrelated GMC floating PCA to stay non-substituting'
  )

  assert.deepEqual(
    derivePcaSubstitutionInfo({
      team: 'MC',
      floatingAlloc: mcCover,
      staffOverrides: staffOverrides as any,
      allPCAStaff: allPcaStaff as any,
    }),
    {
      isSubstituting: true,
      isWholeDaySubstitution: false,
      substitutedSlots: [1],
    },
    'Expected the MC cover PCA to be marked as substituting independently'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
