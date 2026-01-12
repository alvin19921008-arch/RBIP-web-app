---
name: cold-start_schedule_load_optimizations_and_admin_tooltip_diagnostics
overview: Reduce cold-start schedule load time after refresh by cutting Supabase round-trips and React re-render churn, and add an admin-only hover tooltip on the “Schedule Allocation” title showing timings and which optimization paths were used (RPC vs batched queries, calcs source, snapshot usage, etc.).
todos:
  - id: add-load-schedule-rpc
    content: Create `supabase/migrations/add_load_schedule_rpc.sql` implementing `load_schedule_v1(p_date date)` returning schedule + allocations + calculations in one JSON payload.
    status: pending
  - id: wire-rpc-into-loader
    content: Update `loadScheduleForDate()` in `app/(dashboard)/schedule/page.tsx` to use the RPC (with fallback to existing multi-query path if RPC missing) and to apply baseline snapshot before allocation reconstruction.
    status: pending
  - id: skip-loadAllData-when-snapshot-exists
    content: Change schedule page boot flow to skip `loadAllData()` on cold start when `baseline_snapshot` exists; keep fallback for legacy/blank schedules.
    status: pending
  - id: lazy-load-dates-with-data
    content: Remove `loadDatesWithData()` from initial mount and trigger it lazily (e.g., on calendar open or after schedule load).
    status: pending
  - id: fix-useSavedAllocations-rerender-churn
    content: Refactor `useSavedAllocations()` to avoid calling `setTherapistAllocations`/`setPcaAllocations` inside loops; perform single state updates after building/sorting maps.
    status: pending
  - id: admin-hover-diagnostics-tooltip
    content: Add an admin-only tooltip wrapping the “Schedule Allocation” H1 showing TimingReport + optimization flags (rpcUsed, calculationsSource, snapshotUsed, counts, sizes).
    status: pending
---

# Cold-start schedule load speedup + admin hover diagnostics

## Goals

- **Cold start after refresh**: reduce 8–10s load by minimizing network round trips and heavy client-side state churn.
- **Admin diagnostics**: show a hover tooltip (admin only) over the “Schedule Allocation” H1 with **timings + which optimizations were used**.

## Key files to change

- `[app/(dashboard)/schedule/page.tsx](/Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/app/\\\\(dashboard)/schedule/page.tsx)`
- [`supabase/migrations/add_load_schedule_rpc.sql`](/Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/supabase/migrations/add_load_schedule_rpc.sql) (new)
- (Reuse existing) [`lib/utils/timing.ts`](/Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/lib/utils/timing.ts) and [`components/ui/tooltip.tsx`](/Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/ui/tooltip.tsx)

## Changes (what + why)

### 1) One-round-trip schedule load via Supabase RPC (biggest cold-start win)

- Add **`load_schedule_v1(p_date date)`** (SECURITY INVOKER) to return a single JSON payload:
  - schedule metadata: `id,is_tentative,tie_break_decisions,baseline_snapshot,staff_overrides,workflow_state`
  - allocations arrays: therapist/PCA/bed
  - calculations rows from `schedule_calculations`
  - optionally: inside RPC, if `is_tentative=false`, update it to true (saves a follow-up call)
- Update `loadScheduleForDate()` in `schedule/page.tsx` to:
  - call `supabase.rpc('load_schedule_v1', { p_date: dateStr })`
  - apply baseline snapshot early (so staff pools exist before rebuilding allocation objects)
  - use the returned arrays directly (replacing the current `Promise.all([...select('*')...])` block)

### 2) Stop loading base tables on cold start when snapshot exists

- Currently, the mount effect always calls `loadAllData()` (staff + programs + wards + prefs) and `loadDatesWithData()`.
- Change startup flow so:
  - **First** load the schedule (via RPC) and **apply `baseline_snapshot`** (this already derives staff pools in `applyBaselineSnapshot()`).
  - Only **fallback to `loadAllData()`** when the schedule is missing a baseline snapshot (legacy/blank schedule).

### 3) Remove non-essential cold-start queries (`loadDatesWithData`)

- Don’t call `loadDatesWithData()` on initial mount.
- Load it lazily only when the calendar UI is opened (or after the main schedule finishes loading).

### 4) Reduce React re-render churn during `useSavedAllocations`

- Fix `useSavedAllocations()` so it does **exactly one** `setTherapistAllocations(...)` and **one** `setPcaAllocations(...)` (after building + sorting), not repeatedly inside `TEAMS.forEach`.
- This cuts a large number of synchronous renders during cold start.

### 5) Admin-only hover tooltip diagnostics on the Schedule title

- Wrap the H1 `Schedule Allocation` (line ~7080) in the existing `Tooltip` component **only when `userRole==='admin'`**.
- Collect a `TimingReport` using `createTimingCollector()` during cold start with stages such as:
  - `rpcLoadSchedule`
  - `applyBaselineSnapshot`
  - `hydrateOverrides`
  - `buildAllocationMaps`
  - `setAllocationsState`
  - (optional) `loadDatesWithData` if/when triggered
- Add “feature-used” flags in the diagnostic meta:
  - `rpcUsed: true`
  - `baselineSnapshotUsed: true/false`
  - `calculationsSource: 'schedule_calculations' | 'snapshot.calculatedValues' | 'recalculated'`
  - `batchedQueriesUsed: true/false` (true when RPC is disabled and Promise.all path used)
  - counts: allocation row counts, snapshot byte size (approx via `JSON.stringify(...).length`)
- Tooltip content will render multi-line using `className="whitespace-pre-wrap max-w-[520px]" `and a `<pre>` block.
```7080:7082:/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx
<h1 className="text-2xl font-bold">Schedule Allocation</h1>
```


## Test plan

- Hard refresh `/schedule` and verify:
  - total time shown in tooltip drops materially (expect biggest gain from RPC + skipping `loadAllData`)
  - allocations and calculations still match saved state
  - admin tooltip only appears for admin users; regular users see no tooltip
  - calendar dots still work (loaded lazily)