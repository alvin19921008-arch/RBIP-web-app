import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const hookSource = readFileSync(
  resolve(process.cwd(), 'features/schedule/ui/hooks/useScheduleSnapshotDiff.ts'),
  'utf8'
)

test('drift reminder uses semantic diff and never threshold gating', () => {
  assert.doesNotMatch(
    hookSource,
    /get_config_global_head_v1/,
    'drift toast reminder should not depend on get_config_global_head_v1'
  )
  assert.doesNotMatch(
    hookSource,
    /drift_notification_threshold|thresholdMs|ageMs/,
    'drift toast reminder should not use threshold-based gating'
  )
  assert.match(
    hookSource,
    /const diff = await computeSnapshotDiffFromDbSnapshot\(\)/,
    'drift toast flow should compute a semantic snapshot diff'
  )
  assert.match(
    hookSource,
    /if \(!hasAnySnapshotDiff\(diff\)\) return/,
    'drift toast flow should gate on hasAnySnapshotDiff(diff)'
  )
  assert.match(
    hookSource,
    /if \(userRole !== 'developer' && userRole !== 'admin'\) return/,
    'drift toast should remain role-gated to admin and developer'
  )
})
