import assert from 'node:assert/strict'

import {
  classifyScheduleMeaning,
  hasAnyAllocationFacts,
  hasMeaningfulStep1Overrides,
} from '../../lib/utils/staffOverridesMeaningful'

async function main() {
  assert.equal(
    hasMeaningfulStep1Overrides({
      '__bedCounts': { byTeam: { MC: 12 } },
      '__allocationNotes': { doc: null },
    }),
    false,
    'Expected schedule-level metadata keys alone to stay non-meaningful for Step 1 semantics'
  )

  assert.equal(
    hasMeaningfulStep1Overrides({
      'pca-1': { leaveType: 'VL', fteRemaining: 0 },
    }),
    true,
    'Expected real staff override entries to keep a Step-1-only schedule meaningful'
  )

  assert.equal(
    hasMeaningfulStep1Overrides({
      'pca-step2-only': {
        specialProgramOverrides: [{ programId: 'robotic', slots: [1, 2] }],
      },
    }),
    false,
    'Expected later-step-only PCA metadata to stay non-meaningful for Step 1 semantics'
  )

  assert.equal(
    hasMeaningfulStep1Overrides({
      __staffStatusOverrides: {
        'buffer-1': { status: 'buffer', buffer_fte: 0.5 },
      },
    }),
    true,
    'Expected schedule-local staff status overrides to count as meaningful Step 1 roster state'
  )

  assert.equal(
    hasAnyAllocationFacts({
      hasTherapistAllocations: false,
      hasPCAAllocations: false,
      hasBedAllocations: false,
    }),
    false,
    'Expected an empty schedule to report no allocation facts'
  )

  assert.equal(
    hasAnyAllocationFacts({
      hasTherapistAllocations: false,
      hasPCAAllocations: true,
      hasBedAllocations: false,
    }),
    true,
    'Expected any persisted allocation table to count as real schedule facts'
  )

  assert.equal(
    classifyScheduleMeaning({
      staffOverrides: {
        'pca-1': { leaveType: 'VL', fteRemaining: 0 },
      },
      hasTherapistAllocations: false,
      hasPCAAllocations: false,
      hasBedAllocations: false,
    }),
    'step1',
    'Expected override-only schedules to stay meaningful even after placeholder PCA rows disappear'
  )

  assert.equal(
    classifyScheduleMeaning({
      staffOverrides: {
        '__bedCounts': { byTeam: { MC: 12 } },
      },
      hasTherapistAllocations: false,
      hasPCAAllocations: false,
      hasBedAllocations: false,
    }),
    'empty',
    'Expected metadata-only schedules to stay cleanup-eligible and not masquerade as meaningful work'
  )

  assert.equal(
    classifyScheduleMeaning({
      staffOverrides: {
        'pca-step2-only': {
          substitutionForBySlot: {
            1: { nonFloatingPCAId: 'nf-1', nonFloatingPCAName: 'NF One', team: 'MC' },
          },
        },
      },
      hasTherapistAllocations: false,
      hasPCAAllocations: false,
      hasBedAllocations: false,
    }),
    'empty',
    'Expected later-step-only PCA metadata to stay cleanup-eligible when no Step 1 meaning or allocations exist'
  )

  assert.equal(
    classifyScheduleMeaning({
      staffOverrides: {
        __staffStatusOverrides: {
          'buffer-1': { status: 'buffer', buffer_fte: 0.5 },
        },
      },
      hasTherapistAllocations: false,
      hasPCAAllocations: false,
      hasBedAllocations: false,
    }),
    'step1',
    'Expected schedule-local staff status overrides to keep no-allocation schedules meaningful'
  )

  assert.equal(
    classifyScheduleMeaning({
      staffOverrides: {
        'pca-1': { leaveType: 'VL', fteRemaining: 0 },
      },
      hasTherapistAllocations: true,
      hasPCAAllocations: false,
      hasBedAllocations: false,
    }),
    'allocations',
    'Expected real allocation facts to take precedence over Step 1-only meaning'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
