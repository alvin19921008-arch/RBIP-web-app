import assert from 'node:assert/strict'

import { buildStep2SubstitutionDisplayOverrides } from '../../lib/features/schedule/substitutionDisplayPersistence'

async function main() {
  const staff = [
    { id: 'nf-1', name: 'NF One', rank: 'PCA', floating: false, status: 'active', team: 'MC' },
    { id: 'nf-2', name: 'NF Two', rank: 'PCA', floating: false, status: 'active', team: 'MC' },
    { id: 'float-1', name: 'Float One', rank: 'PCA', floating: true, status: 'active', team: null },
  ] as any

  const baseOverrides = {
    'nf-1': { leaveType: null, fteRemaining: 0.75, availableSlots: [2, 3, 4] },
    'nf-2': { leaveType: null, fteRemaining: 0.5, availableSlots: [3, 4] },
  } as Record<string, any>

  const allocations = [
    { id: 'alloc-nf-1', staff_id: 'nf-1', team: 'MC', slot1: null, slot2: 'MC', slot3: 'MC', slot4: 'MC', special_program_ids: null },
    { id: 'alloc-nf-2', staff_id: 'nf-2', team: 'MC', slot1: null, slot2: null, slot3: 'MC', slot4: 'MC', special_program_ids: null },
    { id: 'alloc-float-1', staff_id: 'float-1', team: 'MC', slot1: 'MC', slot2: 'MC', slot3: null, slot4: null, special_program_ids: null },
  ] as any

  const next = buildStep2SubstitutionDisplayOverrides({
    baseOverrides,
    staff,
    allocations,
  })

  assert.deepEqual(
    next['float-1']?.substitutionForBySlot,
    {
      1: { team: 'MC', nonFloatingPCAId: 'nf-1', nonFloatingPCAName: 'NF One' },
      2: { team: 'MC', nonFloatingPCAId: 'nf-2', nonFloatingPCAName: 'NF Two' },
    },
    'Expected auto substitution detection to consume slot ownership so overlapping missing slots do not become last-write-wins'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
