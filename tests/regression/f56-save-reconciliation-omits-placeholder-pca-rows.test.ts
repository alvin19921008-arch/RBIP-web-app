import assert from 'node:assert/strict'

import { shouldPersistPcaAllocationForSave } from '../../lib/features/schedule/saveReconciliation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

function buildPcaAllocation(team: Team, overrides: Partial<PCAAllocation> = {}): PCAAllocation {
  return {
    id: 'alloc-1',
    schedule_id: 'schedule-1',
    staff_id: 'staff-1',
    team,
    fte_pca: 1,
    fte_remaining: 1,
    slot_assigned: 0,
    slot_whole: null,
    slot1: team,
    slot2: team,
    slot3: team,
    slot4: team,
    leave_type: null,
    special_program_ids: null,
    invalid_slot: undefined,
    ...overrides,
  }
}

async function main() {
  assert.equal(
    shouldPersistPcaAllocationForSave({
      staffTeam: 'MC',
      floating: false,
      allocation: null,
    }),
    false,
    'Expected override-only non-floating PCA state without allocation facts to be omitted from save payloads'
  )

  assert.equal(
    shouldPersistPcaAllocationForSave({
      staffTeam: 'MC',
      floating: false,
      allocation: buildPcaAllocation('MC', {
        fte_pca: 0,
        fte_remaining: 0,
        leave_type: 'VL',
      }),
    }),
    false,
    'Expected legacy zero-slot placeholder PCA rows with only team-default slots to be dropped on re-save'
  )

  assert.equal(
    shouldPersistPcaAllocationForSave({
      staffTeam: 'GMC',
      floating: false,
      allocation: buildPcaAllocation('GMC', {
        fte_pca: 0.5,
        fte_remaining: 0,
        slot_assigned: 0.5,
        leave_type: 'VL',
      }),
    }),
    true,
    'Expected partial-day PCA rows with real assigned-slot facts to keep persisting'
  )

  assert.equal(
    shouldPersistPcaAllocationForSave({
      staffTeam: 'FO',
      floating: true,
      allocation: buildPcaAllocation('FO', {
        slot_assigned: 1,
        fte_remaining: 0,
      }),
    }),
    true,
    'Expected floating PCA rows with actual allocation facts to keep persisting'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
