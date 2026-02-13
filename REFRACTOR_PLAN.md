# Schedule Page Refactor Plan (High ROI Only)

## Goals
- Reduce cold-start bundle and render work
- Remove redundant state/effects
- Keep functionality identical

## Scope
- Focus on `app/(dashboard)/schedule/page.tsx`
- Skip “move-only” refactors without measurable ROI

## High-ROI Candidates

### 1) Remove legacy "showBackButton"
- Status: Done
- Delete state + effect + props usage
- Rationale: feature removed; fewer renders and simpler props

### 2) Eliminate URL-sync useEffects
- Status: Done (top-down split divider fixed; splitRatio derived from URL)
- Replace `splitDirection`, `splitRatio`, `isSplitSwapped` state with derived values
- Remove 3 `useEffect` syncs
- Rationale: reduces render cycles and state churn

### 3) Collapse resolver state → ref-only or hook
- Status: Done (resolver refs only, no state sync effects)
- Replace resolver state + effect sync with ref-only resolver storage
- Rationale: reduces re-renders and repetitive patterns

### 4) Shared Supabase fetch helpers
- Status: Done
- Extract shared “snapshot diff inputs” fetch (with back-compat column fallback) into `lib/features/schedule/snapshotDiffLiveInputs.ts`
- Add short TTL + in-flight dedupe so drift check and popover diff reuse the same live payload
- Reuse the same helper in `components/dashboard/ConfigSyncPanel.tsx` to keep snapshot diff behavior aligned
- Rationale: de-dup logic, reduce repeated runtime calls, and keep diff behavior consistent

### 5) Lazy-load heavy UI clusters not on critical path
- Status: In progress (high-ROI parts done)
- Split reference controller + pane portal now mount only in split mode
- Stage startup dialog prefetch to high-probability actions only (staff edit, copy wizard, calendar)
- Keep step/hover-triggered prefetch for step-specific heavy dialogs
- Rationale: reduce initial JS execution and memory

## Explicitly Out of Scope (Low ROI)
- Pure file splitting without performance benefit
- Style-only refactors unless they enable reuse or reduce runtime logic

## Test Plan
- Manual: navigation to schedule page, step flows 1–5, copy wizard, dialogs
- Verify: no regression in allocations, snapshots, or diagnostics popovers

## Phase 2 Refactor (High ROI, Behavior-Preserving)

This phase follows the refactoring-specialist guideline:
- Understand first, then plan, then execute in small steps, then verify
- Preserve behavior (no new features mixed into refactor)
- Run tests/lint/smoke checks after each logical change

### P2 Goals
- Improve responsiveness during heavy Step 2/3 operations
- Improve scalability for larger staff/allocation datasets
- Reduce duplicate compute paths that can drift in behavior
- Keep user behavior and outputs 100% identical

### P2 Workstreams (Priority Order)

#### P2.1 Allocation Engine Off Main Thread (Web Worker)
- Scope:
  - Move heavy PCA allocation execution path behind a worker adapter
  - Keep request/response payload shape identical to current `allocatePCA` outputs
- Why high ROI:
  - Reduces UI blocking during Step 2/3 on large schedules
  - Keeps interactions responsive while compute runs
- Risk control:
  - Keep existing sync path behind feature flag as fallback
  - Compare worker vs sync outputs on fixed fixtures before enabling by default
- Status: Planned

#### P2.2 Consolidate Duplicate Allocation Execution Paths
- Scope:
  - Remove legacy page-level allocation execution paths in `app/(dashboard)/schedule/page.tsx`
  - Keep controller step runners as single execution authority
- Why high ROI:
  - Reduces duplicated compute and state-sync drift risk
  - Simplifies debugging and future optimization work
- Risk control:
  - Preserve current action entry points and toasts/messages
  - Validate all step transitions and rollback/back behavior
- Status: Planned

#### P2.3 Algorithm Hot-Path Data Structures
- Scope:
  - Replace repeated `find/filter` lookups in hot loops with precomputed maps/indexes
  - Keep algorithm decision order and tie-break behavior unchanged
- Why high ROI:
  - Improves throughput for medium/large schedule sizes
  - Stabilizes runtime as data complexity grows
- Risk control:
  - Fixture-based output parity checks (before/after)
  - Tie-break determinism checks
- Status: Planned

#### P2.4 React 19 Concurrency for Perceived Responsiveness
- Scope:
  - Use `useTransition` for non-urgent step/date UI transitions
  - Use `useDeferredValue` for filter/search-heavy controls
- Why high ROI:
  - Faster-feeling UI without behavior changes
- Risk control:
  - No mutation semantics change in this sub-phase
  - Keep existing error handling/loading states
- Status: Planned

#### P2.5 Virtualize Heavy Lists/Tables (Conditional, Data-Driven)
- Priority:
  - Deferred by default
  - Implement only if profiler thresholds are exceeded
- Scope (if triggered):
  - Evaluate virtualization for `components/allocation/StaffPool.tsx`
  - Evaluate virtualization for `components/allocation/PCADedicatedScheduleTable.tsx`
- Why lower priority now:
  - Current pool size is bounded and PCA count is small
  - Prior virtualization attempts introduced UI regressions (incomplete loading, fixed spacing artifacts)
  - ROI is limited unless measurable render bottlenecks appear
- Trigger gates (must meet before implementation):
  - `StaffPool` or `PCADedicatedTable` profiler commit duration repeatedly > 16ms in normal workflow, OR
  - Noticeable interaction/scroll jank on baseline hardware during Steps 2/3, OR
  - Staff pool growth beyond current expected bounds (sustained > 250 visible cards)
- Measurement method:
  - Use existing developer profiler wrapper metrics (`StaffPool`, `TeamGrid`, `PCADedicatedTable`)
  - Record before/after timings for Step 2 initialize, Step 3 wizard, and scroll interactions
- Risk control:
  - No rollout without parity checks on card ordering, drag/drop behavior, tooltip behavior, and full-card visibility
  - Keep non-virtualized fallback path until parity is confirmed
- Status: Deferred / Trigger-based

## Phase 2 Smoke Test Plan (Preserve Functionality)

Run these smoke tests after each P2 sub-phase and once at full P2 completion.

### A) Core Workflow Integrity (Steps 1-5)
- Open schedule page on a date with saved data and on a new date
- Step 1:
  - Edit leave/FTE for therapist and PCA
  - Confirm `staffOverrides`-driven updates appear immediately
- Step 2:
  - Run initialize algo
  - Open/confirm Special Program Override dialog
  - Open/confirm Non-floating substitution flow
- Step 3:
  - Run floating wizard 3.0 -> 3.4
  - Validate tie-break dialog behavior when tie occurs
  - Confirm pending FTE and final PCA assignment consistency
- Step 4:
  - Run bed relieving and validate relieving table updates
- Step 5:
  - Review state and ensure no missing cards/sections

### B) Persistence and Snapshot Safety
- Save schedule, hard refresh, reload same date
- Confirm:
  - Current step and completed steps are restored
  - allocations/notes/overrides are restored exactly
  - no cross-date contamination when switching dates
- Copy schedule (hybrid mode) and verify copied-up-to-step behavior

### C) Drag/Drop and Interaction Regression
- Drag therapist cards in Step 2 and floating PCA in Step 3
- Confirm:
  - Step-gating tooltips still enforce rules
  - slot assignment visuals and counts remain correct
  - context menus still open/act correctly

### D) Split Mode and Reference Pane
- Enter split mode, switch `refDate`, toggle hide/show reference pane
- Confirm:
  - no stuck loading skeleton in reference pane
  - main and reference data remain isolated
  - scroll/layout behavior unchanged

### E) High-Load Performance Smoke
- Use a heavier day (more staff/allocations) and run:
  - Step 2 initialize
  - Step 3 wizard completion
  - Save and date switch
- Confirm:
  - no UI freeze longer than expected baseline
  - interactions remain possible during processing
  - final outputs match previous known-good result

### F) Minimal Automated Regression Checklist
- Lint: `npm run lint`
- Build: `npm run build`
- Smoke: `npm run test:smoke` (Playwright `@smoke`)
- Optional perf capture (developer mode):
  - record Step 2 and Step 3 timings before/after each P2 sub-phase
  - compare render commits for `StaffPool`, `TeamGrid`, `PCADedicatedTable`

## P2 Exit Criteria
- All smoke tests pass
- No behavior drift in step outputs on fixed fixtures
- No new lint/build errors
- Measurable improvement in at least one:
  - Step 2/3 runtime
  - UI responsiveness during compute
  - large-list/table render smoothness
