# Schedule Drift Reminder Deterministic Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make drift reminders deterministic by keeping amber diff reminders for all users when semantic diff exists, keeping admin/developer drift toast, and removing threshold reminder controls from Dashboard Sync/Publish.

**Architecture:** Keep snapshot ownership and existing schedule sync policy untouched; only adjust reminder signaling surfaces. Move drift toast decision to semantic-diff presence in `useScheduleSnapshotDiff` and remove threshold UI/edit flows from `ConfigSyncPanel` without schema/RPC migration work.

**Tech Stack:** Next.js + React + TypeScript strict mode, node test runner (`tsx --test`), source-based unit tests.

---

## File Structure and Responsibilities

- **Modify:** `features/schedule/ui/hooks/useScheduleSnapshotDiff.ts`
  - Drift toast trigger logic.
  - Remove threshold/age gating logic.
  - Keep role gate, dedupe key, and "Show differences" action behavior.
- **Modify:** `components/dashboard/ConfigSyncPanel.tsx`
  - Remove schedule setup reminders control block (Off/Always/Custom + custom save inputs).
  - Remove local state/helpers used only by the removed control block.
  - Keep all other Sync/Publish/backup/category behaviors intact.
- **Create:** `tests/unit/scheduleSnapshotDiffReminderBehavior.test.ts`
  - Source-based assertions for semantic-diff-driven drift toast behavior and threshold removal.
- **Create:** `tests/unit/configSyncPanelReminderControls.test.ts`
  - Source-based assertions that Off/Always/Custom reminder controls are removed.
- **Verify existing:** `tests/unit/schedule/snapshotSyncPolicy.test.ts`, `tests/unit/scheduleHeaderBarSyncPublishGate.test.ts`

---

### Task 1: Make drift toast semantic-diff deterministic

**Files:**
- Modify: `features/schedule/ui/hooks/useScheduleSnapshotDiff.ts`
- Test: `tests/unit/scheduleSnapshotDiffReminderBehavior.test.ts`

- [ ] **Step 1: Write the failing source-based test for toast gating**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const hookSource = readFileSync(
  resolve(process.cwd(), 'features/schedule/ui/hooks/useScheduleSnapshotDiff.ts'),
  'utf8'
)

test('drift toast is semantic-diff-driven and no longer threshold-driven', () => {
  assert.doesNotMatch(
    hookSource,
    /get_config_global_head_v1/,
    'hook should not fetch global head for drift toast gating'
  )
  assert.doesNotMatch(
    hookSource,
    /drift_notification_threshold|thresholdMs|ageMs/,
    'hook should not contain threshold/age drift toast gating logic'
  )
  assert.match(
    hookSource,
    /const diff = await computeSnapshotDiffFromDbSnapshot\(\)/,
    'hook should compute semantic diff before deciding drift toast'
  )
  assert.match(
    hookSource,
    /if \(!hasAnySnapshotDiff\(diff\)\) return/,
    'hook should only toast when semantic diff is non-empty'
  )
  assert.match(
    hookSource,
    /if \(userRole !== 'developer' && userRole !== 'admin'\) return/,
    'hook should keep admin/developer role gate for drift toast'
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/unit/scheduleSnapshotDiffReminderBehavior.test.ts`
Expected: FAIL because old threshold/RPC patterns still exist.

- [ ] **Step 3: Implement minimal deterministic toast logic in hook**

```ts
// inside drift-toast useEffect async block
const diff = await computeSnapshotDiffFromDbSnapshot()
if (cancelled) return
if (!hasAnySnapshotDiff(diff)) return

setSnapshotDiffError(null)
setSnapshotDiffResult(diff || null)
showDriftNotice()
```

And remove threshold-based gating code paths:
- `get_config_global_head_v1` RPC call.
- `drift_notification_threshold` parsing.
- snapshot-age threshold checks.
- metadata-version fallback drift gate for toast.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/unit/scheduleSnapshotDiffReminderBehavior.test.ts`
Expected: PASS.

- [ ] **Step 5: Request code review for Task 1**

Run review with base/head for Task 1 diff and resolve all Important+ issues before Task 2.

---

### Task 2: Remove Off/Always/Custom reminder controls from ConfigSyncPanel

**Files:**
- Modify: `components/dashboard/ConfigSyncPanel.tsx`
- Test: `tests/unit/configSyncPanelReminderControls.test.ts`

- [ ] **Step 1: Write failing source-based test for removed reminder control block**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const panelSource = readFileSync(
  resolve(process.cwd(), 'components/dashboard/ConfigSyncPanel.tsx'),
  'utf8'
)

test('ConfigSyncPanel no longer renders schedule setup reminder mode controls', () => {
  assert.doesNotMatch(panelSource, /Schedule setup reminders/)
  assert.doesNotMatch(panelSource, /\bOff\b/)
  assert.doesNotMatch(panelSource, /\bAlways\b/)
  assert.doesNotMatch(panelSource, /\bCustom\b/)
  assert.doesNotMatch(panelSource, /set_drift_notification_threshold_v1/)
  assert.doesNotMatch(panelSource, /thresholdUiMode|customThresholdValue|customThresholdUnit/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/unit/configSyncPanelReminderControls.test.ts`
Expected: FAIL because reminder controls are still present.

- [ ] **Step 3: Remove reminder control UI and dead state/handlers**

Remove from `ConfigSyncPanel.tsx`:
- Threshold mode types and helpers used only for reminder mode UI.
- Custom threshold state (`customThresholdValue`, `customThresholdUnit`, `thresholdUiMode`).
- `handleSaveThreshold` handler and any callsites.
- Entire “Schedule setup reminders” UI section.

Keep:
- `reloadGlobalHead()` for global head metadata used by other panel sections.
- Publish/pull/backups/category diff functionality unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/unit/configSyncPanelReminderControls.test.ts`
Expected: PASS.

- [ ] **Step 5: Request code review for Task 2**

Run review with base/head for Task 2 diff and resolve all Important+ issues.

---

### Task 3: Verification and regression safety checks

**Files:**
- Verify: `tests/unit/schedule/snapshotSyncPolicy.test.ts`
- Verify: `tests/unit/scheduleHeaderBarSyncPublishGate.test.ts`
- Verify: `tests/unit/scheduleSnapshotDiffReminderBehavior.test.ts`
- Verify: `tests/unit/configSyncPanelReminderControls.test.ts`

- [ ] **Step 1: Run required schedule policy regressions**

Run: `npx tsx --test tests/unit/schedule/snapshotSyncPolicy.test.ts`
Expected: PASS.

- [ ] **Step 2: Run required Sync/Publish gate regression**

Run: `npx tsx --test tests/unit/scheduleHeaderBarSyncPublishGate.test.ts`
Expected: PASS.

- [ ] **Step 3: Run newly added reminder-focused tests**

Run:
- `npx tsx --test tests/unit/scheduleSnapshotDiffReminderBehavior.test.ts`
- `npx tsx --test tests/unit/configSyncPanelReminderControls.test.ts`

Expected: PASS.

- [ ] **Step 4: Run repository validation**

Run:
- `npm run lint`
- `npm run build`

Expected: exit code 0 for both.

- [ ] **Step 5: Manual smoke checklist (if browser/dev server available)**

Confirm:
1. Future clean schedule → auto-sync + success toast + no amber.
2. Future dirty schedule → no auto-sync + amber + admin/dev drift toast.
3. Past schedule with diff → no auto-sync + amber + admin/dev drift toast.
4. Dashboard Sync/Publish no longer shows Off/Always/Custom reminder setting.

- [ ] **Step 6: Request final code review before completion**

Run review for full branch diff and resolve Important+ issues before completion report.

---

## Self-Review Checklist

- Objective coverage:
  - Deterministic drift toast = semantic diff based and role-gated.
  - Dashboard reminder mode controls removed.
  - Existing snapshot sync policy and role-gated Sync/Publish CTA preserved.
- Placeholder scan: no TODO/TBD placeholders in tasks.
- Type consistency: no new relaxed typing or strict-mode bypasses.
