import assert from 'node:assert/strict'

import { buildBaselineSnapshotEnvelope } from '../../lib/utils/snapshotEnvelope'
import { resolveBaselineSnapshotForCache } from '../../lib/features/schedule/snapshotCacheProjection'

async function main() {
  const rawBaseline = {
    staff: [{ id: 'staff-1', name: 'Legacy One', rank: 'PCA', team: 'FO', status: 'active', floating: false }],
  } as any
  const rawEnvelope = buildBaselineSnapshotEnvelope({ data: rawBaseline, source: 'migration' })

  const repairedBaseline = {
    ...rawBaseline,
    staff: [
      ...rawBaseline.staff,
      { id: 'staff-2', name: 'Repaired Two', rank: 'PCA', team: 'SMM', status: 'active', floating: false },
    ],
  } as any

  const resolvedWithRepair = resolveBaselineSnapshotForCache({
    hasBaselineSnapshot: true,
    rawBaselineSnapshotStored: rawEnvelope as any,
    validatedBaselineSnapshot: repairedBaseline as any,
  })

  assert.deepEqual(
    resolvedWithRepair,
    repairedBaseline,
    'Expected cache projection to prefer validated/repaired baseline snapshot over raw stored envelope data'
  )

  const resolvedWithoutRepair = resolveBaselineSnapshotForCache({
    hasBaselineSnapshot: true,
    rawBaselineSnapshotStored: rawEnvelope as any,
    validatedBaselineSnapshot: null,
  })

  assert.deepEqual(
    resolvedWithoutRepair,
    rawBaseline,
    'Expected cache projection to fall back to raw baseline snapshot only when no validated snapshot is available'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
