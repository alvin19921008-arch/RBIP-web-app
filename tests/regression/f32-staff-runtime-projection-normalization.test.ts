import assert from 'node:assert/strict'

import { buildStaffRuntimeById } from '../../lib/utils/staffRuntimeProjection'
import type { Staff } from '../../types/staff'

async function main() {
  const staff: Staff[] = [
    {
      id: 'pca-float',
      name: 'Float One',
      rank: 'PCA',
      team: 'GMC',
      status: 'active',
      floating: true,
      floor_pca: false,
      buffer_fte: null,
      special_program: null,
      special_program_ids: [],
    } as any,
    {
      id: 'pca-nonfloat',
      name: 'Non Float',
      rank: 'PCA',
      team: 'DRO',
      status: 'active',
      floating: false,
      floor_pca: false,
      buffer_fte: null,
      special_program: null,
      special_program_ids: [],
    } as any,
  ]

  const runtimeNoSubstitutionExclusion = buildStaffRuntimeById({
    staff,
    staffOverrides: {
      'pca-float': {
        leaveType: null,
        fteRemaining: 1,
        availableSlots: [1, 2, 3, 4],
        invalidSlots: [{ slot: 3, timeRange: { start: '10:00', end: '11:00' } }],
        substitutionForBySlot: {
          2: { nonFloatingPCAId: 'nf', nonFloatingPCAName: 'NF', team: 'GMC' },
        } as any,
      },
      'pca-nonfloat': {
        leaveType: null,
        fteRemaining: 1,
        invalidSlots: [{ slot: 4, timeRange: { start: '11:00', end: '12:00' } }],
      },
    } as any,
  })

  assert.equal(
    runtimeNoSubstitutionExclusion['pca-float']?.effectiveInvalidSlot,
    3,
    'Expected invalidSlot to be derived from invalidSlots[0].slot when legacy invalidSlot is absent'
  )
  assert.deepEqual(
    runtimeNoSubstitutionExclusion['pca-float']?.availableSlots,
    [1, 2, 4],
    `Expected invalid slot to be removed from availableSlots, got ${JSON.stringify(runtimeNoSubstitutionExclusion['pca-float']?.availableSlots)}`
  )
  assert.deepEqual(
    runtimeNoSubstitutionExclusion['pca-float']?.substitutionSlots,
    [2],
    'Expected substitution slots to be collected from substitutionForBySlot'
  )

  const runtimeWithSubstitutionExclusion = buildStaffRuntimeById({
    staff,
    staffOverrides: {
      'pca-float': {
        leaveType: null,
        fteRemaining: 1,
        invalidSlots: [{ slot: 3, timeRange: { start: '10:00', end: '11:00' } }],
        substitutionForBySlot: {
          2: { nonFloatingPCAId: 'nf', nonFloatingPCAName: 'NF', team: 'GMC' },
          4: { nonFloatingPCAId: 'nf2', nonFloatingPCAName: 'NF2', team: 'GMC' },
        } as any,
      },
    } as any,
    excludeSubstitutionSlotsForFloating: true,
  })

  assert.deepEqual(
    runtimeWithSubstitutionExclusion['pca-float']?.availableSlots,
    [1],
    `Expected substitution + invalid slot normalization to produce [1], got ${JSON.stringify(runtimeWithSubstitutionExclusion['pca-float']?.availableSlots)}`
  )

  assert.equal(
    runtimeNoSubstitutionExclusion['pca-nonfloat']?.effectiveInvalidSlot,
    4,
    'Expected invalidSlot derivation to also work for non-floating PCA entries'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
