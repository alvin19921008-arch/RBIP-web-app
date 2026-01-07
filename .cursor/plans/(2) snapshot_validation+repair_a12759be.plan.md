# Snapshot validation, auto-repair, and history integration

## Outcomes

- **Baseline snapshots become versioned + self-describing** (`schemaVersion`, `createdAt`, `source`).
- **Runtime validation/repair** on schedule load prevents empty/corrupt snapshots from breaking UI or copy/buffer detection.
- **Auto-repair on Save** persists repaired/merged snapshots (covers WIP.md:292).
- **History page uses `workflow_state`** for completion badges (WIP.md:296).
- **Admin-only “Dev/Testing Options” hover panel** under the Copy menu shows **runtime-only** health diagnostics.

---

## 1) Versioned snapshot envelope (implement)

### What changes

- Change the stored shape of `daily_schedules.baseline_snapshot` from a raw object to an **envelope**:
- `schemaVersion: 1`
- `createdAt: ISO string`
- `source: 'save' | 'copy' | 'migration'`
- `data: { staff, specialPrograms, sptAllocations, wards, pcaPreferences, teamDisplayNames }`

### Where

- Schedule creation/load path: `[app/(dashboard)/schedule/page.tsx](app/\\\\\\\\\\(dashboard)/schedule/page.tsx)`
- Copy path: [`app/api/schedules/copy/route.ts`](app/api/schedules/copy/route.ts)

### Backward compatibility

- If snapshot is in “old raw” shape (no `schemaVersion`), treat it as `schemaVersion=0` and **wrap it** at runtime.

---

## 2) Runtime validation + graceful repair (implement)

### Add a shared validator

Create a utility (e.g. [`lib/utils/snapshotValidation.ts`](lib/utils/snapshotValidation.ts)) that exports:

- `validateAndRepairBaselineSnapshot({ snapshot, referencedStaffIds, liveFetchers }): { snapshot: BaselineSnapshotEnvelope; report: SnapshotHealthReport }`
- `extractReferencedStaffIds({ therapistAllocs, pcaAllocs, staffOverrides }): Set<string>`

### Validation rules (minimum)

- Snapshot must have required keys; `data.staff` must be an array.
- Deduplicate staff by `id`.
- Normalize/guard:
- invalid/missing `status` → default `'active'`
- invalid `team` → `null`
- invalid `rank` → drop that row

### Repair rules (key)

- If `data.staff` is empty OR missing referenced IDs, fetch live `staff` rows for **referenced IDs only** and merge them in.
- Mark report as `status: 'repaired'` with issues like `emptyStaffArray`, `missingReferencedStaffRows`, `wrappedLegacySnapshot`.

### Where it runs

- On schedule load in `[app/(dashboard)/schedule/page.tsx](app/\\\\\\\\\\(dashboard)/schedule/page.tsx) `before `applyBaselineSnapshot(...)`.
- In APIs that depend on snapshot content (copy/buffer detection) to avoid brittle assumptions:
- [`app/api/schedules/copy/route.ts`](app/api/schedules/copy/route.ts)
- [`app/api/schedules/buffer-staff/route.ts`](app/api/schedules/buffer-staff/route.ts)

---

## 3) Auto-repair persistence on Save (WIP.md:292) (implement)

### What

- When runtime validation reports `status !== 'ok'` OR snapshot was merged with missing referenced staff, persist the repaired snapshot back to `daily_schedules.baseline_snapshot` during Save.
- Keep the current “append-only merge” behavior (never remove staff rows), but ensure it merges into the **envelope.data.staff** array.

### Where

- `[app/(dashboard)/schedule/page.tsx](app/\\\\\\\\\\(dashboard)/schedule/page.tsx) `in `saveScheduleToDatabase()` (this already does a baseline merge; we’ll adapt it to the new envelope + validator report and make it consistent).

---

## 4) History page integration (WIP.md:296) (implement)

### What

- Load `workflow_state` for schedule list items and compute completion badges from `workflow_state.completedSteps`.
- Keep fallback to current inference for legacy schedules where `workflow_state` is missing.

### Where

- `[app/(dashboard)/history/page.tsx](app/\\\\\\\\\\(dashboard)/history/page.tsx) `(query needs to include `workflow_state`)
- [`components/history/ScheduleHistoryList.tsx`](components/history/ScheduleHistoryList.tsx) or wherever status badge is derived
- [`lib/utils/scheduleHistory.ts`](lib/utils/scheduleHistory.ts) (centralize badge logic)

---

## 5) Admin-only “Dev/Testing Options” hover panel (runtime-only) (implement)

### Gating

- Visible only when `user_profiles.role === 'admin'`.

### Content (runtime-only)

Show a compact diagnostic block in the Copy dropdown (styled like your existing dev menu sections) with:

- Snapshot health: `ok | repaired | fallback`
- Issues list (short codes)
- Snapshot envelope: `schemaVersion`, `source`, `createdAt`
- Staff coverage: `snapshotStaffCount`, `missingReferencedCount`
- Whether `staff_overrides` exists and how many keys

### Where

- Copy/Reset menu UI in `[app/(dashboard)/schedule/page.tsx](app/\\\\\\\\\\(dashboard)/schedule/page.tsx)`
- Likely reuse the same dropdown container that already renders “Reset to Baseline” and add a border-t section for diagnostics.

---

## Notes / constraints

- Keep DB type safety rules for allocations (`lib/db/types.ts`).
- No new DB column needed for health (per your choice: **runtime-only**).