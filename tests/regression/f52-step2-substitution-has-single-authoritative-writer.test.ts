import assert from 'node:assert/strict'

import { buildAuthoritativeStep2SubstitutionOverrides } from '../../lib/features/schedule/substitutionWriteAuthority'

async function main() {
  const staff = [
    { id: 'nf-old', name: 'NF Old', rank: 'PCA', floating: false, status: 'active', team: 'MC' },
    { id: 'nf-new', name: 'NF New', rank: 'PCA', floating: false, status: 'active', team: 'MC' },
    { id: 'float-a', name: 'Float A', rank: 'PCA', floating: true, status: 'active', team: null },
  ] as any

  const next = buildAuthoritativeStep2SubstitutionOverrides({
    baseOverrides: {
      'float-a': {
        leaveType: null,
        fteRemaining: 1,
        customFlag: 'keep-me',
        substitutionForBySlot: {
          1: { team: 'MC', nonFloatingPCAId: 'nf-old', nonFloatingPCAName: 'NF Old' },
        },
      },
    },
    staff,
    allocations: [
      {
        id: 'alloc-float-a',
        staff_id: 'float-a',
        team: 'MC',
        slot1: null,
        slot2: 'MC',
        slot3: null,
        slot4: null,
        special_program_ids: null,
      },
    ] as any,
    resolvedSelections: {
      'MC-nf-new': [{ floatingPCAId: 'float-a', slots: [2] }],
    },
  })

  assert.deepEqual(
    next['float-a']?.substitutionForBySlot,
    {
      2: { team: 'MC', nonFloatingPCAId: 'nf-new', nonFloatingPCAName: 'NF New' },
    },
    'Expected authoritative Step 2 substitution writer to replace stale same-team mappings with explicit selection'
  )

  assert.equal(
    next['float-a']?.customFlag,
    'keep-me',
    'Expected authoritative substitution write path to preserve unrelated override fields'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
