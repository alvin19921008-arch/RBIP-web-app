# Schedule Snapshot Auto-Sync + Drift Reminder Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard setup changes easier to reason about by auto-syncing clean current/future schedules to the latest published setup, while keeping dirty schedules pinned and surfacing the existing amber diff reminder/toast as the review path.

**Architecture:** Keep snapshot ownership in `lib/features/schedule/controller/useScheduleController.ts`; extract small pure helpers under `lib/features/schedule/` so load-time auto-sync, drift reminder, and tests share the same rules. Treat any meaningful Step 1 saved override, saved therapist/PCA/bed allocation row, or saved workflow progress as dirty enough to block silent sync. Keep the amber icon available to all roles when the saved snapshot differs from live dashboard; keep admin/developer toast as the attention surface, and make its action dismiss the toast and open the expanded diff table.

**Tech Stack:** Next.js App Router, React client hooks, Supabase JS, TypeScript strict mode, existing schedule controller and snapshot envelope utilities, `npx tsx --test`, `npm run lint`, `npm run build`.

---

## 0. Product Policy

1. **Blank schedules:** Brand-new schedules continue to initialize from current live dashboard data. This is already mostly true in `useScheduleController` when no `daily_schedules` row exists.
2. **Clean current/future schedules:** If a schedule date is today or later and it has no meaningful Step 1 edits, no saved allocation rows, and no saved workflow progress, update its `baseline_snapshot` to the latest live dashboard snapshot automatically on load when drift is detected.
3. **Dirty current/future schedules:** If Step 1 or later saved work exists, never silently replace the snapshot. Show the amber diff reminder for all roles when diff is non-empty. Admin/developer toast should point directly to the expanded diff table.
4. **Past schedules:** Dates before today stay historical. Keep the existing frozen snapshot semantics and use the existing amber diff reminder/admin toast review path.
5. **Toast scope:** Admin/developer drift toast remains role-gated because it references dashboard sync/publish concepts. The clean auto-sync confirmation toast may be shown only to admin/developer in v1 to avoid exposing dashboard language to ordinary users.

---

## 1. Current Code Map

| File | Current responsibility | Planned role |
|------|------------------------|--------------|
| `lib/features/schedule/controller/useScheduleController.ts` | Creates new schedule snapshots, loads existing `baseline_snapshot`, validates/repairs snapshots, loads allocation rows, saves schedule state. | Add load-time clean current/future auto-sync and expose a small sync status for UI toast. Extract duplicated live snapshot fetch into a helper. |
| `lib/utils/staffOverridesMeaningful.ts` | Defines `hasMeaningfulStep1Overrides`, `hasAnyAllocationFacts`, `classifyScheduleMeaning`. | Reuse as dirty anchor; do not duplicate Step 1 dirty logic. |
| `lib/utils/snapshotEnvelope.ts` | Builds/unwraps v2 snapshot envelopes with `globalHeadAtCreation`. | Continue to use for auto-sync writes. |
| `lib/features/config/globalHead.ts` | Fetches current `config_global_head` metadata. | Reuse when building live snapshot envelopes. |
| `features/schedule/ui/hooks/useScheduleSnapshotDiff.ts` | Computes full saved-vs-live diff, shows amber icon state, shows admin/developer drift toast. | Make toast action dismiss current toast and open expanded diff. Use full diff as the UI reminder predicate. |
| `features/schedule/ui/layout/ScheduleHeaderBar.tsx` | Renders amber icon popover and `SnapshotDiffDetails`. | Keep as the review surface; add status copy for auto-sync-blocked dirty schedules if needed. |
| `components/dashboard/ConfigSyncPanel.tsx` | Publishes a selected schedule snapshot to global config, reloads head, evicts drafts. | Leave publish RPC behavior unchanged for v1; no schema change required for load-time current/future auto-sync. |

---

## 2. Definitions

**Today key:** Local schedule date string from the same formatting family as `formatDateForInput(selectedDate)`, `YYYY-MM-DD`. Lexicographic comparison is valid for this format.

**Current/future schedule:** `scheduleDateKey >= todayKey`.

**Past schedule:** `scheduleDateKey < todayKey`.

**Dirty schedule:** Any of the following is true:

- `hasMeaningfulStep1Overrides(staff_overrides)` is true.
- At least one row exists in `schedule_therapist_allocations`.
- At least one row exists in `schedule_pca_allocations`.
- At least one row exists in `schedule_bed_allocations`.
- `workflow_state.completedSteps.length > 0`.

**Clean schedule:** A schedule row exists and has a baseline snapshot, but none of the dirty facts above are true.

**Drift:** Full semantic diff between saved `baseline_snapshot` and live dashboard inputs is non-empty, using the same categories already checked by `hasAnySnapshotDiff` in `useScheduleSnapshotDiff`.

---

## 3. Requirements Traceability

| Requirement | Implementation location |
|-------------|-------------------------|
| New blank future schedules initialize from latest live dashboard setup | Preserve existing new-row branch in `useScheduleController`; move live snapshot fetch into reusable helper without changing behavior |
| Clean current/future initialized schedules auto-sync to latest dashboard setup | `useScheduleController` load path after allocation facts are known and before applying baseline snapshot to state |
| Any saved Step 1 edit blocks silent sync | `lib/features/schedule/snapshotSyncPolicy.ts` uses `hasMeaningfulStep1Overrides` |
| Any saved therapist/PCA/bed allocation blocks silent sync | Same policy helper, fed by loaded allocation row counts |
| Dirty current/future schedules use review UX | Existing amber icon + admin/developer toast from `useScheduleSnapshotDiff` |
| Toast action dismisses toast and opens expanded diff table | `useScheduleSnapshotDiff` receives `dismissActionToast` and calls it before opening/expanding |
| Past schedules stay frozen | Policy helper returns `past-frozen`; controller does not auto-sync |
| Avoid duplicate live snapshot fetch code | New `lib/features/schedule/liveBaselineSnapshot.ts` helper |
| Avoid `lib/**` importing `features/**` | All shared policy/helpers live in `lib/**`; UI imports lib, not reverse |

---

## 4. File Map

| File | Action |
|------|--------|
| `lib/features/schedule/snapshotSyncPolicy.ts` | Create pure dirty/disposition helper. |
| `tests/unit/schedule/snapshotSyncPolicy.test.ts` | Create unit tests for clean, dirty, past, current/future classifications. |
| `lib/features/schedule/liveBaselineSnapshot.ts` | Create reusable live baseline snapshot builder extracted from `useScheduleController` new-schedule branch. |
| `lib/features/schedule/controller/useScheduleController.ts` | Modify load path to use helper for new schedules and auto-sync clean current/future existing schedules. Return/track last auto-sync status for UI. |
| `lib/features/schedule/controller/scheduleControllerTypes.ts` or local controller state file | Modify only if a public controller state/action type needs the new auto-sync status. |
| `features/schedule/ui/SchedulePageClient.tsx` | Pass `dismissActionToast` into `useScheduleSnapshotDiff`; show clean auto-sync confirmation if controller exposes one. |
| `features/schedule/ui/hooks/useScheduleSnapshotDiff.ts` | Modify toast action to dismiss and open expanded diff; keep role gate for admin/developer. |
| `features/schedule/ui/layout/ScheduleHeaderBar.tsx` | Modify copy only if dirty blocked status is surfaced in the popover. |
| `tests/regression/f138-schedule-snapshot-auto-sync-policy.test.ts` | Create controller-level regression if pure unit tests do not cover enough behavior; `f138` was unused when this plan was written. |

---

## 5. Tasks

### Task 1: Add Pure Snapshot Sync Policy

**Files:**
- Create: `lib/features/schedule/snapshotSyncPolicy.ts`
- Create: `tests/unit/schedule/snapshotSyncPolicy.test.ts`

- [ ] **Step 1.1: Write policy unit tests first**

Create `tests/unit/schedule/snapshotSyncPolicy.test.ts`:

```ts
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
```

- [ ] **Step 1.2: Run the failing test**

Run:

```bash
npx tsx --test tests/unit/schedule/snapshotSyncPolicy.test.ts
```

Expected: fail because `lib/features/schedule/snapshotSyncPolicy.ts` does not exist.

- [ ] **Step 1.3: Implement the pure helper**

Create `lib/features/schedule/snapshotSyncPolicy.ts`:

```ts
import type { ScheduleStepId } from '@/types/schedule'
import { hasMeaningfulStep1Overrides } from '@/lib/utils/staffOverridesMeaningful'

export type SnapshotDirtyReason =
  | 'step1Overrides'
  | 'therapistAllocations'
  | 'pcaAllocations'
  | 'bedAllocations'
  | 'workflowProgress'

export type SnapshotSyncDisposition =
  | 'current'
  | 'past-frozen'
  | 'auto-sync-clean-current-or-future'
  | 'dirty-review-required'

export function collectSnapshotDirtyReasons(args: {
  staffOverrides: unknown
  hasTherapistAllocations: boolean
  hasPCAAllocations: boolean
  hasBedAllocations: boolean
  workflowCompletedSteps: readonly ScheduleStepId[] | readonly string[] | null | undefined
}): SnapshotDirtyReason[] {
  const reasons: SnapshotDirtyReason[] = []

  if (hasMeaningfulStep1Overrides(args.staffOverrides)) reasons.push('step1Overrides')
  if (args.hasTherapistAllocations) reasons.push('therapistAllocations')
  if (args.hasPCAAllocations) reasons.push('pcaAllocations')
  if (args.hasBedAllocations) reasons.push('bedAllocations')
  if ((args.workflowCompletedSteps?.length ?? 0) > 0) reasons.push('workflowProgress')

  return reasons
}

export function classifySnapshotSyncDisposition(args: {
  scheduleDateKey: string
  todayKey: string
  hasDrift: boolean
  dirtyReasons: readonly SnapshotDirtyReason[]
}): SnapshotSyncDisposition {
  if (!args.hasDrift) return 'current'
  if (args.scheduleDateKey < args.todayKey) return 'past-frozen'
  if (args.dirtyReasons.length > 0) return 'dirty-review-required'
  return 'auto-sync-clean-current-or-future'
}
```

- [ ] **Step 1.4: Verify the policy helper**

Run:

```bash
npx tsx --test tests/unit/schedule/snapshotSyncPolicy.test.ts
```

Expected: all tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add lib/features/schedule/snapshotSyncPolicy.ts tests/unit/schedule/snapshotSyncPolicy.test.ts
git commit -m "$(cat <<'EOF'
Add schedule snapshot sync policy helper.

EOF
)"
```

---

### Task 2: Extract Live Baseline Snapshot Builder

**Files:**
- Create: `lib/features/schedule/liveBaselineSnapshot.ts`
- Modify: `lib/features/schedule/controller/useScheduleController.ts`

- [ ] **Step 2.1: Extract reusable live snapshot fetcher**

Create `lib/features/schedule/liveBaselineSnapshot.ts` using the same table selection and transform behavior currently embedded in the new-schedule branch of `useScheduleController`:

```ts
import type { Team } from '@/types/staff'
import type { BaselineSnapshot, BaselineSnapshotEnvelope } from '@/types/schedule'
import { fetchGlobalHeadAtCreation } from '@/lib/features/config/globalHead'
import { buildBaselineSnapshotEnvelope } from '@/lib/utils/snapshotEnvelope'
import { minifySpecialProgramsForSnapshot } from '@/lib/utils/snapshotMinify'
import { buildSpecialProgramsFromRows } from '@/lib/utils/specialProgramConfigRows'
import { buildTeamMergeSnapshotFromTeamSettings } from '@/lib/features/schedule/teamMerge'

export async function fetchLiveTeamSettingsSnapshot(supabase: any): Promise<{
  teamDisplayNames: Partial<Record<Team, string>>
  teamMerge: ReturnType<typeof buildTeamMergeSnapshotFromTeamSettings>
}> {
  const result = await supabase
    .from('team_settings')
    .select('team,display_name,merged_into,merge_label_override,merged_pca_preferences_override')
    .order('team')
  if (result.error) throw result.error

  const rows = (result.data || []) as any[]
  const teamDisplayNames: Partial<Record<Team, string>> = {}
  rows.forEach((row) => {
    const team = row?.team as Team | undefined
    if (!team) return
    const raw = typeof row?.display_name === 'string' ? row.display_name.trim() : ''
    if (raw) teamDisplayNames[team] = raw
  })

  return {
    teamDisplayNames,
    teamMerge: buildTeamMergeSnapshotFromTeamSettings(rows as any),
  }
}

export async function fetchLiveBaselineSnapshotEnvelope(args: {
  supabase: any
  source: 'save' | 'migration' | 'copy'
}): Promise<{ snapshot: BaselineSnapshot; envelope: BaselineSnapshotEnvelope }> {
  const {
    supabase,
    source,
  } = args

  const [
    globalHeadAtCreation,
    liveTeamConfig,
    liveStaffRes,
    liveSpecialProgramsRes,
    liveSpecialProgramConfigsRes,
    liveSptRes,
    liveWardsRes,
    livePcaPrefRes,
  ] = await Promise.all([
    fetchGlobalHeadAtCreation(supabase),
    fetchLiveTeamSettingsSnapshot(supabase).catch(() => null),
    supabase.from('staff').select('id,name,rank,team,shared_therapist_mode,floating,status,buffer_fte,floor_pca,special_program'),
    supabase.from('special_programs').select('id,name,staff_ids,weekdays,slots,fte_subtraction,pca_required,therapist_preference_order,pca_preference_order'),
    supabase.from('special_program_staff_configs').select('id,program_id,staff_id,config_by_weekday,created_at,updated_at'),
    supabase.from('spt_allocations').select('id,staff_id,specialty,teams,weekdays,slots,slot_modes,fte_addon,config_by_weekday,substitute_team_head,is_rbip_supervisor,active,created_at,updated_at'),
    supabase.from('wards').select('id,name,total_beds,team_assignments,team_assignment_portions'),
    supabase.from('pca_preferences').select('id,team,preferred_pca_ids,preferred_slots,avoid_gym_schedule,gym_schedule,floor_pca_selection'),
  ])

  if (liveStaffRes.error) throw liveStaffRes.error
  if (liveSpecialProgramsRes.error) throw liveSpecialProgramsRes.error
  if (liveSpecialProgramConfigsRes.error) throw liveSpecialProgramConfigsRes.error
  if (liveSptRes.error) throw liveSptRes.error
  if (liveWardsRes.error) throw liveWardsRes.error
  if (livePcaPrefRes.error) throw livePcaPrefRes.error

  const liveSpecialPrograms = buildSpecialProgramsFromRows({
    programRows: (liveSpecialProgramsRes.data || []) as any[],
    staffConfigRows: (liveSpecialProgramConfigsRes.data || []) as any[],
  })

  const snapshot: BaselineSnapshot = {
    staff: (liveStaffRes.data || []) as any,
    specialPrograms: minifySpecialProgramsForSnapshot(liveSpecialPrograms as any) as any,
    sptAllocations: (liveSptRes.data || []) as any,
    wards: (liveWardsRes.data || []) as any,
    pcaPreferences: (livePcaPrefRes.data || []) as any,
    teamDisplayNames: (liveTeamConfig as any)?.teamDisplayNames,
    teamMerge: (liveTeamConfig as any)?.teamMerge,
  }

  return {
    snapshot,
    envelope: buildBaselineSnapshotEnvelope({
      data: snapshot,
      source,
      globalHeadAtCreation,
    }),
  }
}
```

- [ ] **Step 2.2: Replace the new-schedule inline live snapshot code**

In `lib/features/schedule/controller/useScheduleController.ts`, import the helper:

```ts
import { fetchLiveBaselineSnapshotEnvelope } from '@/lib/features/schedule/liveBaselineSnapshot'
```

Then replace the new-schedule branch’s inline `Promise.all` live table fetch with:

```ts
const [{ envelope: baselineEnvelopeToSave, snapshot: baselineSnapshotToSave }, seededStaffOverrides] =
  await Promise.all([
    fetchLiveBaselineSnapshotEnvelope({ supabase, source: 'save' }),
    seedAllocationNotesForNewSchedule({ supabase, date, dateStr }),
  ])
```

Keep the existing insert payload fields the same:

```ts
baseline_snapshot: baselineEnvelopeToSave as any,
staff_overrides: seededStaffOverrides,
```

- [ ] **Step 2.3: Keep local state behavior unchanged**

Ensure any local variable previously named `baselineSnapshotToSave` still feeds the same cache/apply paths if referenced later. If the variable is only used for envelope creation, remove it from the controller.

- [ ] **Step 2.4: Verify build-level imports**

Run:

```bash
npm run lint
```

Expected: no import-layering or unused import errors.

- [ ] **Step 2.5: Commit**

```bash
git add lib/features/schedule/liveBaselineSnapshot.ts lib/features/schedule/controller/useScheduleController.ts
git commit -m "$(cat <<'EOF'
Extract live baseline snapshot builder.

EOF
)"
```

---

### Task 3: Auto-Sync Clean Current/Future Schedules On Load

**Files:**
- Modify: `lib/features/schedule/controller/useScheduleController.ts`
- Modify: `lib/features/schedule/controller/scheduleControllerTypes.ts` only if needed
- Test: `tests/regression/f138-schedule-snapshot-auto-sync-policy.test.ts` if controller logic is extracted enough to test

- [ ] **Step 3.1: Add controller-level sync status type**

Near the controller state types, add a small status shape. If there is already a controller types file used by `SchedulePageClient`, place this there; otherwise keep it local and expose via state.

```ts
type SnapshotAutoSyncStatus =
  | {
      kind: 'synced'
      dateKey: string
      fromGlobalVersion: number | null
      toGlobalVersion: number | null
    }
  | {
      kind: 'blocked'
      dateKey: string
      reasons: import('@/lib/features/schedule/snapshotSyncPolicy').SnapshotDirtyReason[]
    }
  | null
```

- [ ] **Step 3.2: Add state for last auto-sync status**

In `useScheduleController`, add:

```ts
const [lastSnapshotAutoSyncStatus, setLastSnapshotAutoSyncStatus] = useState<SnapshotAutoSyncStatus>(null)
```

Expose it from the controller state object near `baselineSnapshot` / `snapshotHealthReport`:

```ts
lastSnapshotAutoSyncStatus,
```

- [ ] **Step 3.3: Add a local drift predicate for envelopes**

Use metadata as a cheap gate before doing a full semantic diff. The full diff is still required before writing.

```ts
function snapshotHeadDiffers(snapshotHead: any, liveHead: any): boolean {
  const snapCat = snapshotHead?.category_versions
  const liveCat = liveHead?.category_versions
  if (snapCat && typeof snapCat === 'object' && liveCat && typeof liveCat === 'object') {
    for (const [key, liveValue] of Object.entries(liveCat)) {
      const snapValue = (snapCat as Record<string, unknown>)[key]
      if (typeof liveValue === 'number' && typeof snapValue === 'number' && liveValue !== snapValue) return true
    }
    return false
  }
  if (snapshotHead?.global_version != null && liveHead?.global_version != null) {
    return Number(snapshotHead.global_version) !== Number(liveHead.global_version)
  }
  return false
}
```

- [ ] **Step 3.4: Add clean current/future auto-sync branch after allocation rows are loaded**

After `therapistAllocs`, `pcaAllocs`, and `bedAllocs` are known, but before `applyBaselineSnapshot`, compute dirty facts and disposition:

```ts
const todayKey = formatDateForInput(new Date())
const dirtyReasons = collectSnapshotDirtyReasons({
  staffOverrides: overrides,
  hasTherapistAllocations: therapistAllocs.length > 0,
  hasPCAAllocations: pcaAllocs.length > 0,
  hasBedAllocations: bedAllocs.length > 0,
  workflowCompletedSteps: effectiveWorkflowState?.completedSteps ?? [],
})
```

Then:

```ts
const { envelope: storedEnvelope } = unwrapBaselineSnapshotStored(rawBaselineSnapshotStored as any)
const liveHead = await fetchGlobalHeadAtCreation(supabase)
const maybeHasVersionDrift = snapshotHeadDiffers((storedEnvelope as any)?.globalHeadAtCreation, liveHead)
```

If `maybeHasVersionDrift` is false, continue existing load behavior.

If it is true, compute a full diff:

```ts
const liveInputs = await fetchSnapshotDiffLiveInputs({
  supabase,
  includeTeamSettings: true,
  cacheKey: `schedule-load-auto-sync:${dateStr}:${scheduleId}`,
  ttlMs: 0,
})
const { diffBaselineSnapshot } = await import('@/lib/features/schedule/snapshotDiff')
const diff = diffBaselineSnapshot({
  snapshot: storedEnvelope.data as any,
  live: liveInputs,
})
const hasDrift = hasAnySnapshotDiffForController(diff)
```

Create `hasAnySnapshotDiffForController` as a small local helper mirroring `useScheduleSnapshotDiff` until a later cleanup extracts that predicate into `lib/features/schedule/snapshotDiffHasAny.ts`.

- [ ] **Step 3.5: Write auto-sync only for clean current/future schedules**

```ts
const disposition = classifySnapshotSyncDisposition({
  scheduleDateKey: dateStr,
  todayKey,
  hasDrift,
  dirtyReasons,
})

if (disposition === 'auto-sync-clean-current-or-future') {
  const { envelope, snapshot } = await fetchLiveBaselineSnapshotEnvelope({ supabase, source: 'save' })
  await supabase
    .from('daily_schedules')
    .update({ baseline_snapshot: envelope as any })
    .eq('id', scheduleId)

  rawBaselineSnapshotStored = envelope as any
  validatedBaselineSnapshotData = snapshot
  setLastSnapshotAutoSyncStatus({
    kind: 'synced',
    dateKey: dateStr,
    fromGlobalVersion: Number((storedEnvelope as any)?.globalHeadAtCreation?.global_version ?? null) || null,
    toGlobalVersion: Number((envelope as any)?.globalHeadAtCreation?.global_version ?? null) || null,
  })
} else if (disposition === 'dirty-review-required') {
  setLastSnapshotAutoSyncStatus({ kind: 'blocked', dateKey: dateStr, reasons: dirtyReasons })
} else {
  setLastSnapshotAutoSyncStatus(null)
}
```

Implementation detail: `rawBaselineSnapshotStored` is currently declared as `const`; change it to `let` only if the implementation updates the variable in-place before validation. Do not use a non-null assertion.

- [ ] **Step 3.6: Preserve validation and repair behavior**

Even after auto-sync writes a new envelope, continue through `validateAndRepairBaselineSnapshot` and `applyBaselineSnapshot` so the state/caches use the same path as normal loads.

- [ ] **Step 3.7: Verify no extra auto-sync for dirty/past schedules**

Add a regression test if controller helpers are extracted enough to test without a real browser. Minimum expected cases:

```ts
assert.equal(dispositionForPastDirtyOrClean, 'past-frozen')
assert.equal(dispositionForFutureStep1Dirty, 'dirty-review-required')
assert.equal(dispositionForFutureAllocationDirty, 'dirty-review-required')
assert.equal(dispositionForFutureClean, 'auto-sync-clean-current-or-future')
```

If the controller path is not easily unit-testable in this iteration, rely on Task 1 unit tests plus manual Playwright smoke in Task 6.

- [ ] **Step 3.8: Commit**

```bash
git add lib/features/schedule/controller/useScheduleController.ts lib/features/schedule/controller/scheduleControllerTypes.ts tests/regression
git commit -m "$(cat <<'EOF'
Auto-sync clean current and future schedule snapshots.

EOF
)"
```

---

### Task 4: Streamline Admin/Developer Drift Toast Action

**Files:**
- Modify: `features/schedule/ui/hooks/useScheduleSnapshotDiff.ts`
- Modify: `features/schedule/ui/SchedulePageClient.tsx`

- [ ] **Step 4.1: Extend hook params**

In `useScheduleSnapshotDiff`, add:

```ts
dismissActionToast: () => void
```

to the params object and destructure it.

- [ ] **Step 4.2: Pass dismiss action from page client**

In `SchedulePageClient.tsx`, update the hook call:

```ts
useScheduleSnapshotDiff({
  supabase,
  currentScheduleId,
  selectedDateStr,
  baselineSnapshot,
  loading,
  gridLoading,
  userRole,
  showActionToast,
  dismissActionToast,
})
```

- [ ] **Step 4.3: Dismiss toast before opening expanded diff**

Change the existing `Show differences` button callback:

```ts
onClick: () => {
  dismissActionToast()
  setSavedSetupPopoverOpen(true)
  setSnapshotDiffExpanded(true)
},
```

Keep the label as `Show differences`; do not label the toast action `Update`, because the toast should navigate to review rather than mutate snapshots.

- [ ] **Step 4.4: Add hook dependency**

Add `dismissActionToast` to the drift-toast effect dependency list.

- [ ] **Step 4.5: Commit**

```bash
git add features/schedule/ui/hooks/useScheduleSnapshotDiff.ts features/schedule/ui/SchedulePageClient.tsx
git commit -m "$(cat <<'EOF'
Open expanded snapshot diff from drift toast.

EOF
)"
```

---

### Task 5: Show Auto-Sync Confirmation For Admin/Developer

**Files:**
- Modify: `features/schedule/ui/SchedulePageClient.tsx`

- [ ] **Step 5.1: Read controller auto-sync status**

Add `lastSnapshotAutoSyncStatus` to the `scheduleState` destructuring near `baselineSnapshot`.

- [ ] **Step 5.2: Add a deduped success toast effect**

Add a ref near other toast refs:

```ts
const lastSnapshotAutoSyncToastKeyRef = useRef<string | null>(null)
```

Add an effect after `showActionToast` is defined:

```ts
useEffect(() => {
  if (userRole !== 'developer' && userRole !== 'admin') return
  if (!lastSnapshotAutoSyncStatus || lastSnapshotAutoSyncStatus.kind !== 'synced') return

  const key = `${lastSnapshotAutoSyncStatus.dateKey}|${lastSnapshotAutoSyncStatus.toGlobalVersion ?? 'unknown'}`
  if (lastSnapshotAutoSyncToastKeyRef.current === key) return
  lastSnapshotAutoSyncToastKeyRef.current = key

  showActionToast(
    'Schedule setup updated',
    'success',
    'This clean current/future schedule is now using the latest published setup.'
  )
}, [lastSnapshotAutoSyncStatus, showActionToast, userRole])
```

- [ ] **Step 5.3: Do not show success toast for blocked dirty schedules**

Do not toast on `kind: 'blocked'` in this task. The existing amber reminder/admin drift toast already covers the review path.

- [ ] **Step 5.4: Commit**

```bash
git add features/schedule/ui/SchedulePageClient.tsx
git commit -m "$(cat <<'EOF'
Confirm clean schedule snapshot auto-sync.

EOF
)"
```

---

### Task 6: Verification And Manual Smoke

**Files:**
- No planned source edits

- [ ] **Step 6.1: Run policy test**

```bash
npx tsx --test tests/unit/schedule/snapshotSyncPolicy.test.ts
```

Expected: pass.

- [ ] **Step 6.2: Run lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 6.3: Run build**

```bash
npm run build
```

Expected: pass.

- [ ] **Step 6.4: Manual smoke: clean future schedule**

1. Pick a future weekday schedule with no meaningful Step 1 overrides and no allocation rows.
2. Change/publish a dashboard setting so the schedule’s saved snapshot differs from live dashboard.
3. Open the schedule date.
4. Expected: snapshot auto-syncs to live; admin/developer sees `Schedule setup updated`; amber diff icon is absent after sync.

- [ ] **Step 6.5: Manual smoke: dirty future schedule**

1. Pick a future weekday schedule with a saved Step 1 edit or saved allocation row.
2. Change/publish a dashboard setting.
3. Open the schedule date.
4. Expected: snapshot does not auto-sync; amber icon appears for all roles when diff is non-empty; admin/developer drift toast appears.
5. Click `Show differences`.
6. Expected: toast dismisses; saved setup popover opens; diff table is expanded.

- [ ] **Step 6.6: Manual smoke: past schedule**

1. Pick a past schedule whose snapshot differs from live dashboard.
2. Open the schedule date.
3. Expected: no auto-sync write; existing amber reminder/diff behavior remains available.

- [ ] **Step 6.7: Commit verification notes only if files changed during verification**

If verification causes no source edits, do not create an empty commit.

---

## 6. Out Of Scope For This Plan

- Adding a new database-level effective-from publication date. V1 uses “current/future relative to today” because that matches the described operational rule and avoids schema churn.
- Bulk background migration of all future schedules immediately when dashboard publish completes. V1 syncs on schedule load, which avoids writing many rows and respects dirty schedules without a server-side batch job.
- A destructive “force update dirty schedule and clear allocations” action. Dirty schedules stay review-only in v1. If a later product decision wants a force update, it should be a separate plan with stronger confirmation and rollback behavior.
- Changing ordinary users’ access to Dashboard Sync / Publish. The amber reminder remains visible, but admin/developer-only dashboard concepts stay role-gated.

---

## 7. Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Auto-sync mutates a schedule someone already worked on | Dirty policy blocks on Step 1 overrides, allocation rows, and workflow progress. |
| Version metadata says drift but full diff is empty | Controller computes full semantic diff before writing. |
| Extra load-time queries slow the schedule page | Use metadata gate first; only compute full diff and fetch live snapshot when head versions differ. |
| New helper violates import layering | Helpers live under `lib/**` and import only `lib/**` / `types/**`. |
| Toast and icon still disagree | Icon remains full diff. Toast remains admin/developer and session-deduped, but its action now directly opens the same diff surface. |
| Existing older snapshots lack `globalHeadAtCreation` | Treat missing metadata as no auto-sync in v1; the existing diff reminder still works after full diff is computed by UI. |

---

## 8. Self-Review

- **Spec coverage:** The plan covers clean auto-sync, Step 1/allocation dirty anchors, past freeze, admin/developer toast action, and verification.
- **Placeholder scan:** No implementation step depends on an unnamed file; optional regression coverage uses `tests/regression/f138-schedule-snapshot-auto-sync-policy.test.ts`.
- **Type consistency:** `SnapshotDirtyReason`, `SnapshotSyncDisposition`, and `SnapshotAutoSyncStatus` names are consistent across tasks.
- **Scope check:** No schema migration, no background batch job, and no destructive dirty schedule update are included in v1.
