import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifySnapshotSyncDisposition,
  collectSnapshotDirtyReasons,
  shouldFetchSnapshotSemanticDiff,
} from '../../../lib/features/schedule/snapshotSyncPolicy'
import { fetchLiveBaselineSnapshotEnvelope } from '../../../lib/features/schedule/liveBaselineSnapshot'

test('clean current schedule with drift is eligible for auto-sync', () => {
  const reasons = collectSnapshotDirtyReasons({
    staffOverrides: {},
    hasTherapistAllocations: false,
    hasPCAAllocations: false,
    hasBedAllocations: false,
    workflowCompletedSteps: [],
  })

  assert.deepEqual(reasons, [])
  assert.equal(
    classifySnapshotSyncDisposition({
      scheduleDateKey: '2026-04-22',
      todayKey: '2026-04-22',
      hasDrift: true,
      dirtyReasons: reasons,
    }),
    'auto-sync-clean-current-or-future'
  )
})

test('clean future schedule with drift is eligible for auto-sync', () => {
  assert.equal(
    classifySnapshotSyncDisposition({
      scheduleDateKey: '2026-04-23',
      todayKey: '2026-04-22',
      hasDrift: true,
      dirtyReasons: [],
    }),
    'auto-sync-clean-current-or-future'
  )
})

test('past schedule with drift stays frozen', () => {
  assert.equal(
    classifySnapshotSyncDisposition({
      scheduleDateKey: '2026-04-21',
      todayKey: '2026-04-22',
      hasDrift: true,
      dirtyReasons: [],
    }),
    'past-frozen'
  )
})

test('meaningful Step 1 override blocks silent sync', () => {
  const reasons = collectSnapshotDirtyReasons({
    staffOverrides: {
      staff_1: { leaveType: 'AL' },
    },
    hasTherapistAllocations: false,
    hasPCAAllocations: false,
    hasBedAllocations: false,
    workflowCompletedSteps: [],
  })

  assert.deepEqual(reasons, ['step1Overrides'])
  assert.equal(
    classifySnapshotSyncDisposition({
      scheduleDateKey: '2026-04-23',
      todayKey: '2026-04-22',
      hasDrift: true,
      dirtyReasons: reasons,
    }),
    'dirty-review-required'
  )
})

test('saved allocation rows block silent sync', () => {
  assert.deepEqual(
    collectSnapshotDirtyReasons({
      staffOverrides: {},
      hasTherapistAllocations: true,
      hasPCAAllocations: true,
      hasBedAllocations: true,
      workflowCompletedSteps: [],
    }),
    ['therapistAllocations', 'pcaAllocations', 'bedAllocations']
  )
})

test('completed workflow steps block silent sync', () => {
  assert.deepEqual(
    collectSnapshotDirtyReasons({
      staffOverrides: {},
      hasTherapistAllocations: false,
      hasPCAAllocations: false,
      hasBedAllocations: false,
      workflowCompletedSteps: ['leave-fte'],
    }),
    ['workflowProgress']
  )
})

test('no drift returns current even for current or future schedules', () => {
  assert.equal(
    classifySnapshotSyncDisposition({
      scheduleDateKey: '2026-04-23',
      todayKey: '2026-04-22',
      hasDrift: false,
      dirtyReasons: [],
    }),
    'current'
  )
})

test('clean current or future schedules fetch semantic diff even without metadata drift', () => {
  assert.equal(
    shouldFetchSnapshotSemanticDiff({
      scheduleDateKey: '2026-04-23',
      todayKey: '2026-04-22',
      dirtyReasons: [],
      maybeHasVersionDrift: false,
    }),
    true
  )
})

test('past schedules skip controller semantic diff even when metadata drifts', () => {
  assert.equal(
    shouldFetchSnapshotSemanticDiff({
      scheduleDateKey: '2026-04-21',
      todayKey: '2026-04-22',
      dirtyReasons: [],
      maybeHasVersionDrift: true,
    }),
    false
  )
})

test('dirty current or future schedules use metadata as semantic diff gate', () => {
  const params = {
    scheduleDateKey: '2026-04-23',
    todayKey: '2026-04-22',
    dirtyReasons: ['workflowProgress'] as const,
  }

  assert.equal(shouldFetchSnapshotSemanticDiff({ ...params, maybeHasVersionDrift: false }), false)
  assert.equal(shouldFetchSnapshotSemanticDiff({ ...params, maybeHasVersionDrift: true }), true)
})

function createLiveSnapshotSupabaseStub(overrides: Record<string, { data?: any[] | null; error?: any }>) {
  return {
    from(table: string) {
      if (table === 'config_global_head') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: null }
                  },
                }
              },
            }
          },
        }
      }

      return {
        async select() {
          return overrides[table] ?? { data: [], error: null }
        },
      }
    },
  }
}

test('strict live snapshot fetch throws on core live-data query errors', async () => {
  const supabase = createLiveSnapshotSupabaseStub({
    staff: { data: null, error: new Error('staff read failed') },
  })

  await assert.rejects(
    fetchLiveBaselineSnapshotEnvelope({ supabase, source: 'save', strict: true }),
    /staff read failed/
  )
})

test('tolerant live snapshot fetch preserves empty fallback for blank schedule initialization', async () => {
  const supabase = createLiveSnapshotSupabaseStub({
    staff: { data: null, error: new Error('staff read failed') },
  })

  const { snapshot } = await fetchLiveBaselineSnapshotEnvelope({ supabase, source: 'save' })

  assert.deepEqual(snapshot.staff, [])
})
