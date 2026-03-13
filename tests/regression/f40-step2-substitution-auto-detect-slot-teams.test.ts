import assert from 'node:assert/strict'

import { buildStep2SubstitutionDisplayOverrides } from '../../lib/features/schedule/substitutionDisplayPersistence'

async function main() {
  const staff = [
    { id: 'nf-mc', name: 'NF MC', rank: 'PCA', floating: false, status: 'active', team: 'MC' },
    { id: 'float-shared', name: 'Float Shared', rank: 'PCA', floating: true, status: 'active', team: null },
  ] as any

  const allocations = [
    {
      id: 'alloc-nf-mc',
      staff_id: 'nf-mc',
      team: 'MC',
      slot1: null,
      slot2: null,
      slot3: 'MC',
      slot4: 'MC',
      special_program_ids: null,
    },
    {
      id: 'alloc-float-shared',
      staff_id: 'float-shared',
      // Simulate a reused allocation whose base team identity does not match
      // the team being covered for slots 1-2.
      team: 'GMC',
      slot1: 'MC',
      slot2: 'MC',
      slot3: 'GMC',
      slot4: null,
      special_program_ids: null,
    },
  ] as any

  const next = buildStep2SubstitutionDisplayOverrides({
    baseOverrides: {
      'nf-mc': {
        fteRemaining: 0.5,
      },
    },
    staff,
    allocations,
  })

  assert.deepEqual(
    next['float-shared']?.substitutionForBySlot,
    {
      1: {
        nonFloatingPCAId: 'nf-mc',
        nonFloatingPCAName: 'NF MC',
        team: 'MC',
      },
      2: {
        nonFloatingPCAId: 'nf-mc',
        nonFloatingPCAName: 'NF MC',
        team: 'MC',
      },
    },
    'Expected auto-detected substitution display to follow actual slot teams, even when allocation.team points elsewhere'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
