import assert from 'node:assert/strict'

import { derivePcaDisplayFlagsBySlot } from '../../lib/features/schedule/pcaDisplayClassification'

async function main() {
  const staff = [
    { id: 'nf-smm', name: 'NF SMM', rank: 'PCA', floating: false, status: 'active', team: 'SMM' },
    { id: 'float-1', name: 'Float 1', rank: 'PCA', floating: true, status: 'active', team: null },
  ] as any

  const allocation = {
    id: 'alloc-float-1',
    staff_id: 'float-1',
    team: 'SMM',
    slot1: 'SMM',
    slot2: null,
    slot3: null,
    slot4: null,
    special_program_ids: null,
    staff: staff[1],
  } as any

  const flags = derivePcaDisplayFlagsBySlot({
    allocation,
    staffOverrides: {
      'nf-smm': {
        leaveType: null,
        fteRemaining: 0.75,
        availableSlots: [2, 3, 4],
      },
      'float-1': {
        leaveType: null,
        fteRemaining: 1,
      },
    },
    allPCAStaff: staff,
    specialPrograms: [],
    weekday: 'mon',
    showExtraCoverageStyling: true,
  })

  assert.equal(
    flags[1].isSubstitution,
    true,
    'Expected shared slot-classification helper to mark slot 1 as substitution from non-floating missing-slot context'
  )

  const specialFlags = derivePcaDisplayFlagsBySlot({
    allocation: {
      ...allocation,
      special_program_ids: ['robotic'],
    } as any,
    staffOverrides: {
      'nf-smm': { leaveType: null, fteRemaining: 0.75, availableSlots: [2, 3, 4] },
      'float-1': { leaveType: null, fteRemaining: 1 },
    },
    allPCAStaff: staff,
    specialPrograms: [
      {
        id: 'robotic',
        name: 'Robotic',
        staff_ids: [],
        weekdays: ['mon'],
        slots: { mon: [1] },
        fte_subtraction: {},
        pca_required: 0.25,
      } as any,
    ],
    weekday: 'mon',
    showExtraCoverageStyling: true,
  })

  assert.equal(
    specialFlags[1].programName,
    'Robotic',
    'Expected shared slot-classification helper to surface special-program label for slot 1'
  )
  assert.equal(
    specialFlags[1].isSubstitution,
    false,
    'Expected shared slot-classification helper to suppress substitution styling on special-program slots for card/table parity'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
