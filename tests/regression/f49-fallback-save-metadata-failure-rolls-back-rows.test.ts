import assert from 'node:assert/strict'

import { executeFallbackSaveWithRollback } from '../../lib/features/schedule/saveFallbackAtomic'

type Snapshot = {
  rows: {
    therapist: string[]
    pca: string[]
    bed: string[]
    calculations: string[]
  }
  metadata: {
    workflowState: string
    staffOverridesVersion: string
  }
}

async function main() {
  const dbState: Snapshot = {
    rows: {
      therapist: ['old-therapist-row'],
      pca: ['old-pca-row'],
      bed: ['old-bed-row'],
      calculations: ['old-calc-row'],
    },
    metadata: {
      workflowState: 'old-workflow',
      staffOverridesVersion: 'old-overrides',
    },
  }

  const result = await executeFallbackSaveWithRollback<Snapshot, { updatedAt: string | null }>({
    captureSnapshot: async () => ({ snapshot: structuredClone(dbState) }),
    writeRows: async () => {
      dbState.rows = {
        therapist: ['new-therapist-row'],
        pca: ['new-pca-row'],
        bed: ['new-bed-row'],
        calculations: ['new-calc-row'],
      }
      return { ok: true }
    },
    writeMetadata: async () => ({
      error: {
        message: 'daily_schedules metadata update failed',
      },
    }),
    restoreSnapshot: async (snapshot) => {
      dbState.rows = structuredClone(snapshot.rows)
      dbState.metadata = structuredClone(snapshot.metadata)
      return { ok: true }
    },
  })

  assert.equal(result.ok, false, 'Expected metadata failure to fail fallback save')
  if (result.ok) return
  assert.equal(result.stage, 'metadata', 'Expected failure stage to point at metadata write')
  assert.equal(result.rollbackAttempted, true, 'Expected fallback save to attempt rollback on metadata failure')
  assert.equal(result.rollbackError, null, 'Expected rollback to succeed for metadata failure recovery')

  assert.deepEqual(
    dbState,
    {
      rows: {
        therapist: ['old-therapist-row'],
        pca: ['old-pca-row'],
        bed: ['old-bed-row'],
        calculations: ['old-calc-row'],
      },
      metadata: {
        workflowState: 'old-workflow',
        staffOverridesVersion: 'old-overrides',
      },
    },
    'Expected fallback rollback to restore old rows/metadata so mixed-generation state is never persisted'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
