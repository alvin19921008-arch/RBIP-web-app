import assert from 'node:assert/strict'

import { detectChanges } from '../../lib/hooks/useAllocationSync'

async function main() {
  const previous = {
    'shared-appt': {
      leaveType: null,
      fteRemaining: 1,
      sharedTherapistSlotTeams: {
        1: 'SMM',
        2: 'SMM',
        3: 'SMM',
        4: 'SMM',
      },
    },
  }

  const current = {
    'shared-appt': {
      leaveType: null,
      fteRemaining: 1,
      sharedTherapistSlotTeams: {
        1: 'MC',
        2: 'MC',
        3: 'SMM',
        4: 'SMM',
      },
    },
  }

  assert.deepEqual(
    detectChanges(current as any, previous as any),
    {
      hasTeamChange: true,
      hasFTEChange: true,
      hasLeaveChange: false,
      hasSlotChange: true,
      hasAnyChange: true,
      changedStaffIds: ['shared-appt'],
    },
    'Expected shared therapist slot-team changes to trigger therapist allocation sync just like therapistTeamFTEByTeam changes'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
