import assert from 'node:assert/strict'

import {
  applySharedTherapistEditsToTherapistAllocations,
  getEffectiveSharedTherapistAllocationMode,
  normalizeSharedTherapistStep1StateForModeChange,
} from '../../lib/features/schedule/sharedTherapistStep'

async function main() {
  assert.equal(
    getEffectiveSharedTherapistAllocationMode({
      staffMode: 'slot-based',
      overrideMode: undefined,
    }),
    'slot-based',
    'Expected shared therapist mode to default to the dashboard setting when there is no per-day override'
  )

  assert.equal(
    getEffectiveSharedTherapistAllocationMode({
      staffMode: 'slot-based',
      overrideMode: 'single-team',
    }),
    'single-team',
    'Expected per-day shared therapist mode override to take precedence over the dashboard default'
  )

  assert.deepEqual(
    normalizeSharedTherapistStep1StateForModeChange({
      targetMode: 'slot-based',
      capacity: 1,
      fteRemaining: 0.4,
      fteSubtraction: 0.6,
      availableSlots: [],
      invalidSlots: [{ slot: 4, timeRange: { start: '1500', end: '1530' } }],
      amPmSelection: 'PM',
    }),
    {
      fteRemaining: 0.5,
      fteSubtraction: 0.5,
      availableSlots: [1, 2],
      invalidSlots: [],
      amPmSelection: undefined,
    },
    'Expected switching a shared therapist into slot-based mode to round to the nearest quarter and immediately clear incompatible single-team state'
  )

  assert.deepEqual(
    normalizeSharedTherapistStep1StateForModeChange({
      targetMode: 'single-team',
      capacity: 1,
      fteRemaining: 0.75,
      fteSubtraction: 0.25,
      availableSlots: [1, 2, 3],
      invalidSlots: [{ slot: 4, timeRange: { start: '1500', end: '1530' } }],
      amPmSelection: 'AM',
    }),
    {
      fteRemaining: 0.75,
      fteSubtraction: 0.25,
      availableSlots: undefined,
      invalidSlots: undefined,
      amPmSelection: undefined,
    },
    'Expected switching a shared therapist into single-team mode to clear slot-based day state immediately'
  )

  const nextAllocations = applySharedTherapistEditsToTherapistAllocations({
    therapistAllocations: {
      FO: [],
      SMM: [],
      SFM: [],
      CPPC: [],
      MC: [],
      GMC: [],
      NSM: [],
      DRO: [],
    } as any,
    updatesByStaffId: {
      'shared-rpt': {
        leaveType: 'study leave',
        fteRemaining: 0.4,
        team: 'MC',
      },
    } as any,
    staffById: new Map([
      [
        'shared-rpt',
        {
          id: 'shared-rpt',
          name: 'Casey Lim',
          rank: 'RPT',
          special_program: null,
          team: null,
          floating: false,
          floor_pca: null,
          status: 'active',
        },
      ],
    ]) as any,
    date: new Date('2026-03-15T00:00:00.000Z'),
  })

  assert.deepEqual(
    nextAllocations.MC.map((allocation: any) => ({
      staffId: allocation.staff_id,
      fte: allocation.fte_therapist,
      slot1: allocation.slot1,
      slot2: allocation.slot2,
      slot3: allocation.slot3,
      slot4: allocation.slot4,
    })),
    [
      {
        staffId: 'shared-rpt',
        fte: 0.4,
        slot1: null,
        slot2: null,
        slot3: null,
        slot4: null,
      },
    ],
    'Expected single-team shared therapist edits to behave like regular therapist allocations instead of forcing all four slots'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
