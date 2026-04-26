import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const headerSource = readFileSync(
  resolve(process.cwd(), 'features/schedule/ui/layout/ScheduleHeaderBar.tsx'),
  'utf8'
)
const pageSource = readFileSync(resolve(process.cwd(), 'features/schedule/ui/SchedulePageClient.tsx'), 'utf8')

test('saved setup reminder keeps diff visible while role-gating Sync / Publish CTA', () => {
  assert.match(
    headerSource,
    /canAccessDashboardSyncPublish:\s*boolean/,
    'ScheduleHeaderBar should accept an explicit Sync / Publish access flag'
  )
  assert.match(
    headerSource,
    /props\.canAccessDashboardSyncPublish\s*\?\s*\([^]*?Go to Sync \/ Publish[^]*?\)\s*:\s*null/,
    'the Go to Sync / Publish CTA should be hidden when access is false'
  )
  assert.match(
    headerSource,
    /<SnapshotDiffDetails result=\{props\.snapshotDiffResult\} \/>/,
    'the diff details should remain outside the Sync / Publish access gate'
  )
  assert.match(
    pageSource,
    /canAccessDashboardSyncPublish=\{access\.can\('dashboard\.category\.sync-publish'\)\}/,
    'SchedulePageClient should thread the existing dashboard Sync / Publish permission'
  )
  assert.equal(
    pageSource.match(/<ScheduleHeaderBar\b/g)?.length,
    pageSource.match(/canAccessDashboardSyncPublish=\{access\.can\('dashboard\.category\.sync-publish'\)\}/g)?.length,
    'every ScheduleHeaderBar render path should receive the Sync / Publish permission'
  )
})
