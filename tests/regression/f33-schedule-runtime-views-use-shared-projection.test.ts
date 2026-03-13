import assert from 'node:assert/strict'

import {
  buildPcaAllocatorView,
  buildScheduleRuntimeProjection,
  buildTherapistAllocatorView,
} from '../../lib/utils/scheduleRuntimeProjection'
import type { Staff } from '../../types/staff'

async function main() {
  const staff: Staff[] = [
    {
      id: 'spt-1',
      name: 'SPT One',
      rank: 'SPT',
      team: 'FO',
      status: 'active',
      floating: false,
      floor_pca: false,
      buffer_fte: null,
      special_program: null,
      special_program_ids: [],
    } as any,
    {
      id: 'pca-1',
      name: 'PCA One',
      rank: 'PCA',
      team: 'GMC',
      status: 'active',
      floating: true,
      floor_pca: ['upper'],
      buffer_fte: null,
      special_program: ['crp'],
      special_program_ids: [],
    } as any,
  ]

  const projection = buildScheduleRuntimeProjection({
    selectedDate: new Date('2026-03-16T00:00:00.000Z'),
    staff,
    staffOverrides: {
      'pca-1': {
        leaveType: null,
        fteRemaining: 0.75,
        team: 'DRO',
        availableSlots: [1, 2, 3, 4],
        invalidSlots: [{ slot: 2, timeRange: { start: '09:00', end: '10:00' } }],
      },
    } as any,
  })

  const therapistView = buildTherapistAllocatorView({
    projection,
    sptWeekdayByStaffId: {
      'spt-1': { baseFte: 0.5 },
    } as any,
  })

  const sptRow = therapistView.find((row) => row.id === 'spt-1')
  assert.ok(sptRow, 'Expected therapist view to include SPT row')
  assert.equal(
    sptRow?.fte_therapist,
    0.5,
    `Expected SPT row to use weekday baseFte 0.5 without override, got ${sptRow?.fte_therapist}`
  )

  const pcaView = buildPcaAllocatorView({ projection })
  const pcaRow = pcaView.find((row) => row.id === 'pca-1')
  assert.ok(pcaRow, 'Expected PCA view to include PCA row')
  assert.equal(pcaRow?.team, 'DRO', `Expected PCA team override DRO, got ${pcaRow?.team ?? null}`)
  assert.equal(pcaRow?.invalidSlot, 2, `Expected PCA invalid slot derived as 2, got ${pcaRow?.invalidSlot ?? null}`)
  assert.deepEqual(
    pcaRow?.availableSlots,
    [1, 3, 4],
    `Expected invalid slot removed from available slots, got ${JSON.stringify(pcaRow?.availableSlots)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
