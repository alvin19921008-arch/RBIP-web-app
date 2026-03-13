import assert from 'node:assert/strict'

import { getSpecialProgramSlotsForAllocationTeam } from '../../lib/utils/specialProgramDisplay'
import { getSpecialProgramNameBySlotForAllocation } from '../../lib/utils/specialProgramExport'
import type { SpecialProgram } from '../../types/allocation'

async function main() {
  const selectedDate = new Date('2026-03-16T00:00:00.000Z') // mon
  const specialPrograms: SpecialProgram[] = [
    {
      id: 'robotic',
      name: 'Robotic',
      staff_ids: [],
      weekdays: ['mon'],
      slots: { mon: [1, 2], tue: [], wed: [], thu: [], fri: [] } as any,
      fte_subtraction: {},
      pca_required: 0.5,
      pca_preference_order: [],
    } as any,
  ]

  const misrouted = {
    id: 'alloc-misrouted',
    schedule_id: '',
    staff_id: 'pca-1',
    team: 'SFM',
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: null,
    slot2: 'SFM',
    slot3: null,
    slot4: null,
    leave_type: null,
    special_program_ids: ['robotic'],
  } as any

  const displaySlots = getSpecialProgramSlotsForAllocationTeam({
    allocation: misrouted,
    team: 'SFM',
    selectedDate,
    specialPrograms,
  })
  const exportLabels = getSpecialProgramNameBySlotForAllocation({
    allocation: misrouted,
    specialPrograms,
    weekday: 'mon',
  })

  assert.deepEqual(
    displaySlots,
    [],
    `Expected display helper to ignore misrouted Robotic slot2->SFM occupancy, got ${JSON.stringify(displaySlots)}`
  )
  assert.equal(
    exportLabels[2] ?? null,
    null,
    `Expected export helper to also ignore misrouted Robotic slot2->SFM occupancy, got ${exportLabels[2] ?? null}`
  )

  const canonical = {
    ...misrouted,
    id: 'alloc-canonical',
    team: 'SMM',
    slot2: 'SMM',
  } as any
  const canonicalSlots = getSpecialProgramSlotsForAllocationTeam({
    allocation: canonical,
    team: 'SMM',
    selectedDate,
    specialPrograms,
  })
  const canonicalLabels = getSpecialProgramNameBySlotForAllocation({
    allocation: canonical,
    specialPrograms,
    weekday: 'mon',
  })

  assert.deepEqual(
    canonicalSlots,
    [2],
    `Expected display helper to include canonical Robotic slot2->SMM occupancy, got ${JSON.stringify(canonicalSlots)}`
  )
  assert.equal(
    canonicalLabels[2],
    'Robotic',
    `Expected export helper to label canonical Robotic slot2->SMM occupancy, got ${canonicalLabels[2] ?? null}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
