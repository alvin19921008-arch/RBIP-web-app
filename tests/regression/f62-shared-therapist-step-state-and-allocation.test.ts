import assert from 'node:assert/strict'

import {
  applySharedTherapistEditsToTherapistAllocations,
  buildSharedTherapistTeamFteByTeam,
  mergeStep2Point3SharedTherapistOverrides,
} from '../../lib/features/schedule/sharedTherapistStep'

async function main() {
  assert.deepEqual(
    buildSharedTherapistTeamFteByTeam({
      slotTeamBySlot: {
        1: 'FO',
        2: 'MC',
        3: 'FO',
        4: 'FO',
      },
    }),
    {
      FO: 0.75,
      MC: 0.25,
    },
    'Expected slot-based shared therapist routing to aggregate into per-team FTE totals using 0.25 per slot'
  )

  const nextOverrides = mergeStep2Point3SharedTherapistOverrides({
    baseOverrides: {
      'robotic-pca': {
        specialProgramOverrides: [
          {
            programId: 'robotic',
            pcaId: 'robotic-pca',
            slots: [1, 2, 3, 4],
            requiredSlots: [1, 2, 3, 4],
          },
        ],
      },
      'shared-appt': {
        leaveType: null,
        fteRemaining: 1,
        team: 'SMM',
      },
    } as any,
    updates: {
      'shared-appt': {
        leaveType: null,
        fteRemaining: 1,
        therapistTeamFTEByTeam: {
          FO: 0.75,
          MC: 0.25,
        },
        sharedTherapistSlotTeams: {
          1: 'FO',
          2: 'MC',
          3: 'FO',
          4: 'FO',
        },
      },
    } as any,
  })

  assert.deepEqual(
    nextOverrides['robotic-pca']?.specialProgramOverrides,
    [
      {
        programId: 'robotic',
        pcaId: 'robotic-pca',
        slots: [1, 2, 3, 4],
        requiredSlots: [1, 2, 3, 4],
      },
    ],
    'Expected Step 2.3 shared therapist edits to preserve existing Step 2 special-program overrides'
  )

  assert.deepEqual(
    nextOverrides['shared-appt'],
    {
      leaveType: null,
      fteRemaining: 1,
      therapistTeamFTEByTeam: {
        FO: 0.75,
        MC: 0.25,
      },
      sharedTherapistSlotTeams: {
        1: 'FO',
        2: 'MC',
        3: 'FO',
        4: 'FO',
      },
    },
    'Expected Step 2.3 merge to replace auto whole-team assignment with slot-based shared therapist routing'
  )

  const nextAllocations = applySharedTherapistEditsToTherapistAllocations({
    therapistAllocations: {
      FO: [],
      SMM: [
        {
          id: 'shared-appt-existing',
          schedule_id: '',
          staff_id: 'shared-appt',
          team: 'SMM',
          fte_therapist: 1,
          fte_remaining: 0,
          slot_whole: null,
          slot1: 'SMM',
          slot2: 'SMM',
          slot3: 'SMM',
          slot4: 'SMM',
          leave_type: null,
          special_program_ids: null,
          is_substitute_team_head: false,
          spt_slot_display: null,
          is_manual_override: false,
          manual_override_note: null,
          staff: {
            id: 'shared-appt',
            name: 'Jordan Tan',
            rank: 'APPT',
            special_program: null,
            team: null,
            floating: false,
            floor_pca: null,
            status: 'active',
          },
        },
      ],
      SFM: [],
      CPPC: [],
      MC: [],
      GMC: [],
      NSM: [],
      DRO: [],
    } as any,
    updatesByStaffId: {
      'shared-appt': {
        leaveType: null,
        fteRemaining: 1,
        therapistTeamFTEByTeam: {
          FO: 0.75,
          MC: 0.25,
        },
        sharedTherapistSlotTeams: {
          1: 'FO',
          2: 'MC',
          3: 'FO',
          4: 'FO',
        },
      },
    } as any,
    staffById: new Map([
      [
        'shared-appt',
        {
          id: 'shared-appt',
          name: 'Jordan Tan',
          rank: 'APPT',
          special_program: null,
          team: null,
          floating: false,
          floor_pca: null,
          status: 'active',
        },
      ],
    ]) as any,
    date: new Date('2026-03-14T00:00:00.000Z'),
  })

  assert.equal(
    nextAllocations.SMM.some((allocation: any) => allocation.staff_id === 'shared-appt'),
    false,
    'Expected Step 2.3 shared therapist rewrite to remove stale auto allocation from the previously assigned team'
  )

  assert.deepEqual(
    nextAllocations.FO.map((allocation: any) => ({
      staffId: allocation.staff_id,
      fte: allocation.fte_therapist,
    })),
    [{ staffId: 'shared-appt', fte: 0.75 }],
    'Expected slot-based shared therapist edits to create a FO allocation with the aggregated FO FTE'
  )

  assert.deepEqual(
    nextAllocations.MC.map((allocation: any) => ({
      staffId: allocation.staff_id,
      fte: allocation.fte_therapist,
    })),
    [{ staffId: 'shared-appt', fte: 0.25 }],
    'Expected slot-based shared therapist edits to create a MC allocation with the aggregated MC FTE'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
