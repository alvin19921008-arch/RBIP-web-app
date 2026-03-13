import assert from 'node:assert/strict'

import { buildStep2SubstitutionDisplayOverrides } from '../../lib/features/schedule/substitutionDisplayPersistence'

async function main() {
  const staff = [
    { id: 'nf-mc', name: 'NF MC', rank: 'PCA', floating: false, status: 'active', team: 'MC' },
    { id: 'nf-gmc', name: 'NF GMC', rank: 'PCA', floating: false, status: 'active', team: 'GMC' },
    { id: 'float-mc', name: 'Float MC', rank: 'PCA', floating: true, status: 'active', team: null },
    { id: 'float-gmc', name: 'Float GMC', rank: 'PCA', floating: true, status: 'active', team: null },
    { id: 'float-gmc-extra', name: 'Float GMC Extra', rank: 'PCA', floating: true, status: 'active', team: null },
  ] as any

  const allocations = [
    { id: 'alloc-nf-mc', staff_id: 'nf-mc', team: 'MC', slot1: null, slot2: 'MC', slot3: 'MC', slot4: 'MC', special_program_ids: null },
    { id: 'alloc-nf-gmc', staff_id: 'nf-gmc', team: 'GMC', slot1: null, slot2: 'GMC', slot3: 'GMC', slot4: 'GMC', special_program_ids: null },
    { id: 'alloc-float-mc', staff_id: 'float-mc', team: 'MC', slot1: 'MC', slot2: null, slot3: null, slot4: null, special_program_ids: null },
    { id: 'alloc-float-gmc', staff_id: 'float-gmc', team: 'GMC', slot1: 'GMC', slot2: null, slot3: null, slot4: null, special_program_ids: null },
    { id: 'alloc-float-gmc-extra', staff_id: 'float-gmc-extra', team: 'GMC', slot1: null, slot2: 'GMC', slot3: null, slot4: null, special_program_ids: null },
  ] as any

  const resolvedSelections = {
    'MC-nf-mc': [{ floatingPCAId: 'float-mc', slots: [1] }],
    'GMC-nf-gmc': [{ floatingPCAId: 'float-gmc', slots: [1] }],
  }

  const next = buildStep2SubstitutionDisplayOverrides({
    baseOverrides: {},
    resolvedSelections,
    staff,
    allocations,
  })

  assert.deepEqual(
    next['float-mc']?.substitutionForBySlot,
    {
      1: {
        nonFloatingPCAId: 'nf-mc',
        nonFloatingPCAName: 'NF MC',
        team: 'MC',
      },
    },
    'Expected explicit MC selection to persist as the only substitution mapping for float-mc'
  )

  assert.deepEqual(
    next['float-gmc']?.substitutionForBySlot,
    {
      1: {
        nonFloatingPCAId: 'nf-gmc',
        nonFloatingPCAName: 'NF GMC',
        team: 'GMC',
      },
    },
    'Expected explicit GMC selection to persist as the only substitution mapping for float-gmc'
  )

  assert.equal(
    next['float-gmc-extra'],
    undefined,
    'Expected later auto-detection not to add extra GMC substitute mappings once explicit selections exist'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
