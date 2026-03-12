import assert from 'node:assert/strict'

import type { SpecialProgram } from '../../types/allocation'
import type { Staff } from '../../types/staff'
import {
  getStep1TherapistSpecialProgramInfo,
  getTherapistSpecialProgramUiState,
  normalizeStep1SpecialProgramAvailabilityForSave,
  shouldShowStep1SpecialProgramAvailabilityToggle,
} from '../../lib/utils/step1SpecialProgramAvailability'

async function main() {
  const aggie: Staff = {
    id: 'aggie',
    name: 'Aggie',
    rank: 'SPT',
    team: null,
    status: 'active',
    active: true,
    floating: false,
    special_program: ['CRP'],
  } as Staff

  const otherTherapist: Staff = {
    id: 'backup-appt',
    name: 'Backup APPT',
    rank: 'APPT',
    team: 'CPPC',
    status: 'active',
    active: true,
    floating: false,
    special_program: ['CRP'],
  } as Staff

  const specialPrograms: SpecialProgram[] = [
    {
      id: 'crp',
      name: 'CRP',
      staff_ids: ['aggie', 'backup-appt'],
      weekdays: ['wed'],
      slots: {
        mon: [],
        tue: [],
        wed: [2],
        thu: [],
        fri: [],
      } as any,
      fte_subtraction: {
        aggie: {
          wed: 0,
        },
      },
      pca_required: 0.25,
      therapist_preference_order: {
        CPPC: ['aggie', 'backup-appt'],
      },
      pca_preference_order: [],
      staff_configs: [
        {
          id: 'cfg-aggie-crp',
          program_id: 'crp',
          staff_id: 'aggie',
          config_by_weekday: {
            wed: {
              enabled: true,
              slots: [2],
              fte_subtraction: 0,
              is_primary: true,
            },
          },
        },
        {
          id: 'cfg-backup-crp',
          program_id: 'crp',
          staff_id: 'backup-appt',
          config_by_weekday: {
            wed: {
              enabled: true,
              slots: [2],
              fte_subtraction: 0.5,
            },
          },
        },
      ],
    },
  ]

  const aggieInfo = getStep1TherapistSpecialProgramInfo({
    member: aggie,
    allStaff: [aggie, otherTherapist],
    specialPrograms,
    weekday: 'wed',
  })
  assert.deepEqual(
    aggieInfo,
    {
      programId: 'crp',
      programName: 'CRP',
      slotLabel: '1030-1200',
    },
    `Expected Aggie to get the Step 1.1 badge info for CRP slot "1030-1200", but got ${JSON.stringify(aggieInfo)}`
  )

  const backupInfo = getStep1TherapistSpecialProgramInfo({
    member: otherTherapist,
    allStaff: [aggie, otherTherapist],
    specialPrograms,
    weekday: 'wed',
  })
  assert.equal(
    backupInfo,
    null,
    `Expected non-primary therapists to avoid the Step 1.1 badge, but got ${JSON.stringify(backupInfo)}`
  )

  const aggieUiState = getTherapistSpecialProgramUiState({
    member: aggie,
    allStaff: [aggie, otherTherapist],
    specialPrograms,
    weekday: 'wed',
    leaveType: 'study leave',
    fteRemaining: 0,
    fteSubtraction: 0.25,
  })
  assert.deepEqual(
    aggieUiState,
    {
      info: {
        programId: 'crp',
        programName: 'CRP',
        slotLabel: '1030-1200',
      },
      showToggle: true,
    },
    `Expected the shared therapist special-program UI state to expose Aggie's CRP info and show the toggle, but got ${JSON.stringify(aggieUiState)}`
  )

  assert.equal(
    shouldShowStep1SpecialProgramAvailabilityToggle({
      rank: 'SPT',
      hasSpecialProgramToday: true,
      leaveType: 'half day VL',
      fteRemaining: 0,
      fteSubtraction: 0.25,
    }),
    true,
    'Expected Aggie-style zero-team-FTE SPT rows with leave ambiguity to still show the Step 1.2 availability toggle'
  )

  assert.equal(
    shouldShowStep1SpecialProgramAvailabilityToggle({
      rank: 'SPT',
      hasSpecialProgramToday: true,
      leaveType: 'study leave',
      fteRemaining: 0,
      fteSubtraction: 0.25,
    }),
    true,
    'Expected Aggie-style zero-team-FTE SPT rows to still show the Step 1.2 availability toggle when study leave is chosen'
  )

  assert.equal(
    shouldShowStep1SpecialProgramAvailabilityToggle({
      rank: 'APPT',
      hasSpecialProgramToday: true,
      leaveType: null,
      fteRemaining: 1,
      fteSubtraction: 0,
    }),
    false,
    'Expected on-duty therapists with no leave ambiguity to skip the Step 1.2 availability toggle'
  )

  assert.equal(
    normalizeStep1SpecialProgramAvailabilityForSave({
      hasSpecialProgramToday: true,
      shouldShowToggle: false,
      selected: false,
    }),
    undefined,
    'Expected non-ambiguous rows to save specialProgramAvailable as undefined instead of sticky false'
  )

  assert.equal(
    normalizeStep1SpecialProgramAvailabilityForSave({
      hasSpecialProgramToday: true,
      shouldShowToggle: true,
      selected: false,
    }),
    false,
    'Expected explicit user opt-out in Step 1.2 to save specialProgramAvailable=false'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
