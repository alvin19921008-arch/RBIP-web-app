import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const configSyncPanelSource = readFileSync(
  resolve(process.cwd(), 'components/dashboard/ConfigSyncPanel.tsx'),
  'utf8'
)

test('config sync panel no longer exposes schedule reminder controls', () => {
  assert.doesNotMatch(
    configSyncPanelSource,
    /Schedule setup reminders/,
    'ConfigSyncPanel should not render the schedule setup reminders heading'
  )
  assert.doesNotMatch(
    configSyncPanelSource,
    /Schedule setup reminders[\s\S]*?\bOff\b[\s\S]*?\bAlways\b[\s\S]*?\bCustom\b/,
    'ConfigSyncPanel should not include Off/Always/Custom segmented reminder mode controls'
  )
  assert.doesNotMatch(
    configSyncPanelSource,
    /set_drift_notification_threshold_v1/,
    'ConfigSyncPanel should not call the drift notification threshold RPC'
  )
  assert.doesNotMatch(
    configSyncPanelSource,
    /\b(thresholdUiMode|customThresholdValue|customThresholdUnit)\b/,
    'ConfigSyncPanel should not keep local reminder threshold UI state variables'
  )
})
