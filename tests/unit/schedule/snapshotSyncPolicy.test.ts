import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifySnapshotSyncDisposition,
  collectSnapshotDirtyReasons,
} from '../../../lib/features/schedule/snapshotSyncPolicy'

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
