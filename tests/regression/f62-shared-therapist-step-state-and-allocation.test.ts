import assert from 'node:assert/strict'

import {
  applySharedTherapistEditsToTherapistAllocations,
  buildSharedTherapistTeamFteByTeam,
  normalizeSharedTherapistStep2StateForModeChange,
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

  const nextModeOverrides = mergeStep2Point3SharedTherapistOverrides({
    baseOverrides: {
      'shared-rpt': {
        leaveType: null,
        fteRemaining: 1,
      },
      'shared-appt': {
        leaveType: null,
        fteRemaining: 1,
        sharedTherapistModeOverride: 'single-team',
        team: 'MC',
      },
    } as any,
    updates: {
      'shared-rpt': {
        leaveType: null,
        fteRemaining: 1,
        team: 'SFM',
        sharedTherapistModeOverride: 'single-team',
      },
      'shared-appt': {
        leaveType: null,
        fteRemaining: 1,
        team: 'SMM',
        sharedTherapistModeOverride: undefined,
      },
    } as any,
  })

  assert.equal(
    nextModeOverrides['shared-rpt']?.sharedTherapistModeOverride,
    'single-team',
    'Expected Step 2.3 edits to persist an explicit shared therapist mode override when the user switches mode in Step 2.3'
  )

  assert.equal(
    'sharedTherapistModeOverride' in nextModeOverrides['shared-appt'],
    false,
    'Expected Step 2.3 edits to clear the shared therapist mode override when the user switches back to the dashboard default mode'
  )

  assert.deepEqual(
    normalizeSharedTherapistStep2StateForModeChange({
      targetMode: 'single-team',
      staffMode: 'slot-based',
      currentAssignedTeam: 'MC',
      suggestedTeam: 'SFM',
      availableFte: 1,
      availableSlots: [1, 2, 3, 4],
      slotTeamBySlot: {
        1: 'MC',
        2: 'MC',
        3: 'SMM',
        4: 'SMM',
      },
    }),
    {
      allocationMode: 'single-team',
      allocationModeOverride: 'single-team',
      assignedTeam: 'SFM',
      mode: 'auto',
      availableSlots: [1, 2, 3, 4],
      slotTeamBySlot: {
        1: 'SFM',
        2: 'SFM',
        3: 'SFM',
        4: 'SFM',
      },
    },
    'Expected switching Step 2.3 from slot-based to single-team to clear incompatible multi-team slot routing and fall back to the current auto team'
  )

  assert.deepEqual(
    normalizeSharedTherapistStep2StateForModeChange({
      targetMode: 'slot-based',
      staffMode: 'single-team',
      currentAssignedTeam: 'MC',
      suggestedTeam: 'SFM',
      availableFte: 1,
      availableSlots: [],
      slotTeamBySlot: {},
    }),
    {
      allocationMode: 'slot-based',
      allocationModeOverride: 'slot-based',
      assignedTeam: 'MC',
      mode: 'custom',
      availableSlots: [1, 2, 3, 4],
      slotTeamBySlot: {
        1: 'MC',
        2: 'MC',
        3: 'MC',
        4: 'MC',
      },
    },
    'Expected switching Step 2.3 from single-team to slot-based to rebuild coherent whole-day slot routing from the current assigned team'
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
