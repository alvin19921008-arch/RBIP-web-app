import assert from 'node:assert/strict'

import { computeStalePcaStaffIdsForReplace } from '../../lib/features/schedule/saveReconciliation'

async function main() {
  assert.deepEqual(
    computeStalePcaStaffIdsForReplace({
      existingStaffIds: ['a', 'b', 'c'],
      submittedStaffIds: [],
    }),
    ['a', 'b', 'c'],
    'Expected empty PCA payload to clear all previously persisted PCA rows'
  )

  assert.deepEqual(
    computeStalePcaStaffIdsForReplace({
      existingStaffIds: ['a', 'b', 'c'],
      submittedStaffIds: ['b', 'c', 'd'],
    }),
    ['a'],
    'Expected rows absent from the latest payload to be deleted as stale'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
