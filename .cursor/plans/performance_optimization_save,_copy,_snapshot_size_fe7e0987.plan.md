---
name: "Performance optimization: save, copy, snapshot size"
overview: Optimize save/copy performance by skipping unnecessary snapshot refreshes, batching allocation writes, using RPC transactions, reducing duplicate queries, and minimizing snapshot payload size.
todos:
  - id: save-conditional-snapshot
    content: "Add conditional snapshot refresh logic: skip if health is ok, no missing referenced staff, and no team changes via staff_overrides for RPT/APPT."
    status: pending
  - id: save-batch-writes
    content: Refactor save to use bulk upsert() per table (therapist, PCA, bed, calculations) instead of per-row update/insert.
    status: pending
  - id: save-rpc-function
    content: Create Postgres RPC function save_schedule_v1() for atomic server-side transaction; update saveScheduleToDatabase() to call RPC.
    status: pending
    dependencies:
      - save-batch-writes
  - id: copy-eliminate-duplicates
    content: Load allocations once in copy API, derive referenced staff IDs from arrays instead of separate query.
    status: pending
  - id: copy-non-blocking-dates
    content: Update handleConfirmCopy() to update datesWithData locally and call loadDatesWithData() without await.
    status: pending
  - id: copy-sql-clone
    content: Create Postgres RPC function copy_schedule_v1() using INSERT ... SELECT ... for server-side cloning; update copy API to use RPC.
    status: pending
    dependencies:
      - copy-eliminate-duplicates
  - id: snapshot-minimal-projections
    content: Update buildBaselineSnapshotFromCurrentState() and fetchLiveStaffByIds to store/select only required fields (id, name, rank, team, floating, status, buffer_fte, floor_pca, special_program for staff).
    status: pending
---

# Performance optimization: save, copy, snapshot size

## Outcomes

- **Save is 3-5x faster** by skipping unnecessary snapshot refreshes, batching allocation writes, and using server-side RPC transactions.
- **Copy is 2-3x faster** by eliminating duplicate queries, using SQL-based cloning, and not blocking on non-critical operations.
- **Snapshot payloads are 30-50% smaller** by storing only required fields, reducing network transfer and parse time.

---

## 1) Save optimization: conditional snapshot refresh

### Current behavior

Save always validates/repairs and writes `baseline_snapshot`, even when nothing changed.

### Optimized behavior

Skip snapshot refresh unless one of these conditions is true:

- Snapshot is missing / legacy raw / schema mismatch
- Referenced staff IDs are missing from snapshot staff map
- Snapshot health report status is not `'ok'`
- **Team changes via `staff_overrides`**: If any RPT/APPT staff has `staffOverrides[staffId].team `that differs from their snapshot `staff[].team`, refresh snapshot to capture the new team assignment.

### Implementation

- In `saveScheduleToDatabase()`, before calling `validateAndRepairBaselineSnapshot()`:
- Check if `snapshotHealthReport` exists and is `'ok'` with `missingReferencedStaffCount === 0`.
- Compare `overridesToSave` against `baselineSnapshot.staff` to detect team changes for RPT/APPT.
- Only proceed with validation/repair if conditions require it.
- Store last `SnapshotHealthReport` in state (`snapshotHealthReport`) and reuse it for skip logic.

### Files

- `app/(dashboard)/schedule/page.tsx` - Add conditional check before snapshot refresh in `saveScheduleToDatabase()`.

---

## 2) Save optimization: batch allocation writes

### Current behavior

Save loops through `allocationsToSave` and does per-row `update()` or `insert()` calls, resulting in N+1 queries.

### Optimized behavior

- Group allocations by table (therapist, PCA, bed, calculations).
- Use **bulk `upsert()`** per table instead of per-row operations.
- Use Supabase's `.upsert()` with `onConflict` handling to merge update/insert in one call.

### Implementation

- Replace the per-item loop in `saveScheduleToDatabase()` with:
- Collect all therapist allocations → single `upsert(therapistDataArray)`.
- Collect all PCA allocations → single `upsert(pcaDataArray)`.
- Collect all bed allocations → single `upsert(bedDataArray)` (if any).
- Collect all calculations → single `upsert(calcDataArray)` (if any).
- Use `onConflict: 'schedule_id,staff_id'` (or appropriate unique constraint) to handle updates vs inserts automatically.

### Files

- `app/(dashboard)/schedule/page.tsx` - Refactor `saveScheduleToDatabase()` allocation save loop.

---

## 3) Save optimization: RPC/server-side transaction

### Current behavior

Save makes multiple HTTP round-trips: allocations (batched), snapshot update, metadata update, unmet needs tracking.

### Optimized behavior

Create a Postgres function `save_schedule_v1(schedule_id, allocations_json, metadata_json)` that:

- Upserts allocations in bulk (therapist, PCA, bed, calculations) within a transaction.
- Updates `daily_schedules` metadata (`staff_overrides`, `workflow_state`, `tie_break_decisions`) atomically.
- Optionally validates/repairs baseline snapshot server-side (if conditions require it).
- Returns success/error in one response.

### Implementation

- Create migration: `supabase/migrations/add_save_schedule_rpc.sql` with function definition.
- Update `saveScheduleToDatabase()` to call `supabase.rpc('save_schedule_v1', {...})` instead of multiple `.from().upsert()` calls.
- Keep client-side validation/type conversion (UUID conversion, FTE normalization) before calling RPC.

### Files

- `supabase/migrations/add_save_schedule_rpc.sql` - New migration with RPC function.
- `app/(dashboard)/schedule/page.tsx` - Replace allocation save logic with RPC call.

---

## 4) Copy optimization: eliminate duplicate queries

### Current behavior

Copy queries allocations twice:

1. In `getReferencedStaffIdsForSchedule()` (selects `staff_id` only).
2. Later for full clone (selects `*`).

### Optimized behavior

- Load allocations once with `select('*')`.
- Derive referenced staff IDs from the loaded arrays (no separate query).

### Implementation

- In `app/api/schedules/copy/route.ts`:
- Load allocations first (therapist, PCA, bed, calculations) in parallel.
- Extract referenced IDs from loaded arrays: `new Set([...therapistAllocations.map(a => a.staff_id), ...pcaAllocations.map(a => a.staff_id), ...Object.keys(sourceOverrides)])`.
- Remove `getReferencedStaffIdsForSchedule()` call (or make it use pre-loaded data).

### Files

- `app/api/schedules/copy/route.ts` - Reorder queries to load allocations first, derive IDs from arrays.

---

## 5) Copy optimization: non-blocking loadDatesWithData

### Current behavior

After copy, `handleConfirmCopy()` awaits `loadDatesWithData()`, which can be slow and isn't required to show the copied schedule.

### Optimized behavior

- Update `datesWithData` locally (add the new date) immediately.
- Kick off `loadDatesWithData()` in background (no `await`).

### Implementation

- In `handleConfirmCopy()`:
- After successful copy, add target date to `datesWithData` set: `setDatesWithData(prev => new Set([...prev, formatDateForInput(toDate)]))`.
- Call `loadDatesWithData()` without `await` (fire-and-forget).

### Files

- `app/(dashboard)/schedule/page.tsx` - Update `handleConfirmCopy()` to update `datesWithData` locally and call `loadDatesWithData()` without await.

---

## 6) Copy optimization: SQL-based clone

### Current behavior

Copy does "delete all target allocations, then insert clones" via multiple Supabase calls.

### Optimized behavior

Use Postgres `INSERT ... SELECT ...` to clone allocations in one SQL statement per table, executed server-side.

### Implementation

- Create migration: `supabase/migrations/add_copy_schedule_rpc.sql` with function `copy_schedule_v1(from_schedule_id, to_schedule_id, mode, include_buffer_staff)`.
- Function should:
- Delete target allocations/calculations.
- Insert clones via `INSERT INTO schedule_therapist_allocations SELECT ... FROM schedule_therapist_allocations WHERE schedule_id = from_schedule_id` (with `schedule_id` replaced).
- Handle mode filtering (hybrid vs full) and buffer staff filtering in SQL.
- Update target `daily_schedules` metadata atomically.
- Update `app/api/schedules/copy/route.ts` to call RPC instead of manual delete/insert loops.

### Files

- `supabase/migrations/add_copy_schedule_rpc.sql` - New migration with copy RPC function.
- `app/api/schedules/copy/route.ts` - Replace delete/insert logic with RPC call.

---

## 7) Snapshot size reduction: minimal projections

### Current behavior

Snapshot stores full `staff.*`, `wards.*`, etc. (all columns), including fields not used by schedule UI/algorithms.

### Optimized behavior

Store only fields actually needed:

- Staff: `id, name, rank, team, floating, status, buffer_fte, floor_pca, special_program` (exclude unused columns like `created_at`, `updated_at`, etc.).
- Wards: `name, total_beds, team_assignments, team_assignment_portions` (exclude unused metadata).
- Special programs: `id, name` (exclude description/metadata if not used).
- SPT allocations: only fields referenced during allocation.
- PCA preferences: only fields used by algorithms.

### Implementation

- Update `buildBaselineSnapshotFromCurrentState()` to project minimal fields:
- `staff.map(s => ({ id, name, rank, team, floating, status, buffer_fte, floor_pca, special_program }))`.
- Similar projections for other entities.
- Update `validateAndRepairBaselineSnapshot()` `fetchLiveStaffByIds` to select only required columns: `select('id, name, rank, team, floating, status, buffer_fte, floor_pca, special_program')` instead of `select('*')`.

### Files

- `app/(dashboard)/schedule/page.tsx` - Update `buildBaselineSnapshotFromCurrentState()` to project minimal fields.
- `lib/utils/snapshotValidation.ts` - Update `fetchLiveStaffByIds` calls to use column lists.
- `app/api/schedules/copy/route.ts` - Update `buildBaselineSnapshot()` to use column lists.

---

## Notes / constraints

- Keep backward compatibility: existing snapshots with full fields should still work (validator normalizes them).
- RPC functions should handle type conversions (UUID validation, FTE normalization) or accept pre-validated JSON.
- Test with large schedules (100+ staff, 200+ allocations) to measure improvement.