# Work In Progress - Schedule Page Refactor & Performance Roadmap

**Last Updated**: 2026-01-22  
**Status**: In progress  
**Current Stage**: Stage 2 (Controller Hook + State Consolidation)

---

## Why this exists

`app/(dashboard)/schedule/page.tsx` is currently a large “god component” (11k+ lines) that mixes:
- UI layout + dialogs/popovers
- schedule loading/caching/snapshot validation
- step workflow orchestration + algorithm execution
- drag-and-drop handlers + many state variables

This document tracks a **step-by-step refactor + loading speed optimization plan** so future chats can resume by stage.

---

## Stage 0 — Baseline & Profiling (do first, keep it quick)

- [x] **0.1 Confirm baseline metrics**
  - **Measure**: first load, date switch (prev/next), open heavy dialogs, Step 2/3 algo run time
  - **Capture**: dev timings already present in schedule page (load/save/copy timing tooltips)

- [x] **0.2 Identify top render hot spots**
  - **Goal**: confirm which blocks rerender too often (StaffPool, TeamColumn grid, PCA dedicated table, overlays)
  - **Action**: use React DevTools Profiler (manual) and note worst offenders

- [x] **0.3 Define a “first paint contract”**
  - **Must render first**: header + date controls, team grid skeleton/overlay, minimum staff/allocations to show schedule
  - **Can defer**: PCA Dedicated table, Allocation Notes board, snapshot diff panel content, secondary dialogs

- [x] **0.4 Implement minimal deferral for first-paint smoothness**
  - Defer below-the-fold heavy UI (PCA Dedicated table + Notes board) until after grid is ready / browser idle.
  - Goal: reduce main-thread contention on date switch and cold load.

**Exit criteria**: you have a short note of “slowest interactions + suspected causes”.

---

## Stage 1 — Low-Risk Refactor (no behavior changes)

### 1A. Extract view-only subcomponents from `page.tsx`

- [ ] **1.1 `ScheduleHeaderBar`**
  - Includes: date navigation, calendar button/popover anchor, copy/save actions, snapshot banner + “Show differences”

- [ ] **1.2 `ScheduleDiffPopover`**
  - Popover panel UI only (diff calculation stays in controller for now)
  - Keeps the “only show categories that have changes” rule

- [x] **1.2 `ScheduleDiffPopover`**
  - Implemented as `components/schedule/SnapshotDiffPopover.tsx`

- [x] **1.1a Extract developer Load diagnostics tooltip**
  - Implemented as `components/schedule/ScheduleTitleWithLoadDiagnostics.tsx` (used in schedule header title)

- [x] **1.1 `ScheduleHeaderBar`**
  - Implemented as `components/schedule/ScheduleHeaderBar.tsx`

- [x] **1.3 `ScheduleDialogsLayer`**
  - Implemented as `components/schedule/ScheduleDialogsLayer.tsx`
  - `page.tsx` now renders the bottom-of-page dialogs via a single `<ScheduleDialogsLayer ... />` call (behavior unchanged)

- [x] **1.4 `ScheduleMainLayout`**
  - Implemented as `components/schedule/ScheduleMainLayout.tsx`
  - `page.tsx` now wraps the primary 2-column body with `<ScheduleMainLayout>...</ScheduleMainLayout>`

### 1B. Move pure constants/helpers out of page

- [x] **1.5 Move constants**
  - Moved `TEAMS`, `WEEKDAYS`, `WEEKDAY_NAMES`, `ALLOCATION_STEPS`, `DEFAULT_DATE`, `EMPTY_BED_ALLOCATIONS` into `lib/features/schedule/constants.ts`
  - `page.tsx` now imports these instead of defining them inline

- [x] **1.6 Move tiny formatting helpers**
  - Removed duplicated ward label formatter in `page.tsx` and reused `formatWardLabel()` from `lib/features/schedule/bedMath.ts`

**Exit criteria**: `page.tsx` becomes a “wiring” file; total lines meaningfully reduced; no behavior change.

---

## Stage 2 — Controller Hook + State Consolidation (big readability win)

### 2A. Create a controller hook

- [x] **2.1 Create `useScheduleController()`**
  - Owns: `selectedDate`, loading state, snapshot state, workflow state, staffOverrides, allocations, calculations
  - Exposes: explicit actions like `beginDateTransition`, `loadScheduleForDate`, `saveSchedule`, `copySchedule`, `runStep2`, `runStep3`, etc.

- [x] **2.1a Extract domain state into controller (Option A)**
  - Added `lib/features/schedule/controller/useScheduleController.ts`
  - `page.tsx` now consumes the domain state via `useScheduleController()` while keeping dialogs/popovers state in the page for now

- [x] **2.1b Controller API uses style-1 `{ state, actions }`**
  - `useScheduleController()` now returns `{ state, actions }` instead of exposing raw setters at the top level
  - First domain action moved in: `actions.beginDateTransition()`

- [x] **2.1c Move `loadScheduleForDate` into controller**
  - `loadScheduleForDate` is now `schedule.actions.loadScheduleForDate`
  - Controller now owns `tieBreakDecisions` (domain) and baseline snapshot apply/build helpers needed by the loader

- [x] **2.1d Move date-change hydration orchestration into controller**
  - Date change effect now calls `schedule.actions.loadAndHydrateDate({ date, ... })`
  - Saved allocations hydration moved into controller (`actions.applySavedAllocationsFromDb`)

- [x] **2.1e Move save orchestration into controller**
  - `page.tsx` save handler is now a thin wrapper calling `schedule.actions.saveScheduleToDatabase({ ... })`
  - Controller now owns: row building, save RPC fallback, snapshot refresh, metadata updates, cache invalidation

- [x] **2.1f Fix persisted overrides key mismatch (bed counts)**
  - Save uses `staff_overrides.__bedCounts.byTeam`
  - Controller loader now reads `__bedCounts.byTeam` (was mistakenly reading `__bedCountsOverridesByTeam`)

**Remaining (Stage 2.1)**:
- [x] Move “copy schedule” fetch/orchestration behind a controller action (page keeps dialog open/close state)
- [x] Move “reset to baseline” into controller (pure domain reset)
- [ ] Move step runners (therapist/PCA/bed algorithms + workflow transitions) behind controller actions
  - [x] Step 2 runner moved (`actions.runStep2TherapistAndNonFloatingPCA`)
  - [x] Step 3 runner moved (`actions.runStep3FloatingPCA`)
  - [x] Step 4 runner moved (`actions.runStep4BedRelieving`)
- [x] Add step navigation actions (avoid raw `setCurrentStep` usage)
  - `actions.goToStep`, `actions.goToNextStep`, `actions.goToPreviousStep`
  - `page.tsx` no longer calls `setCurrentStep(...)` directly
- [x] Reduce raw setter surface area (stable API + explicit escape hatch)
  - `useScheduleController().actions` now exposes a small stable API
  - Raw `setX` functions moved behind `actions._unsafe`
  - Incremental migration: common mutations moved into explicit actions
    - `actions.applyStaffEditDomain(...)`
    - `actions.updateBedRelievingNotes(...)`
    - Clear/reset orchestration moved into controller actions:
      - `actions.clearDomainFromStep(stepId)`
      - `actions.resetStep3ForReentry()`
      - `actions.applyBaselineViewAllocations(overrides)`
      - `actions.markStepCompleted(stepId)`

### 2B. Consolidate state (reduce rerenders and complexity)

- [x] **2.2 Replace many `useState` with `useReducer`**
  - Separate **Domain State** vs **UI State**:
    - **Domain**: snapshot, staff, wards, preferences, allocations, calculations, overrides, workflowState
    - **UI**: open dialogs, popover state/positions, tooltips, loading bars, drag overlays
  - Implemented in `lib/features/schedule/controller/useScheduleController.ts`:
    - Domain state is now a single reducer-backed store (no `useState` left in controller)
    - Setter-style actions are preserved as stable wrappers around reducer dispatch (minimizes `page.tsx` churn)

- [ ] **2.3 Derive more via memo selectors**
  - Move derived data into `useMemo` selectors (or store selectors later) instead of storing duplicates

**Exit criteria**: schedule actions live behind a stable API; view layer becomes thin; fewer global rerenders.

---

## Stage 3 — Data Load Speed (real performance improvements)

### 3A. Date navigation feels instant (cache-first)

- [x] **3.1 Prefetch adjacent working days data**
  - After loading date D, background-load D-1 and D+1 via the same loader and store in `lib/utils/scheduleCache.ts`
  - Goal: Prev/Next almost always hits cache

- [x] **3.1b Persist cache across refresh (sessionStorage)**
  - Size-limited sessionStorage persistence so “first load after refresh” can be a cache hit.

- [ ] **3.2 Fetch concurrency + minimal selects**
  - Ensure schedule load fetches independent tables concurrently (Promise.all)
  - Only select fields needed for first paint; defer “nice-to-have”

### 3B. Reduce main bundle / first JS cost

- [x] **3.3 Dynamic-import below-the-fold heavy UI**
  - `PCADedicatedScheduleTable` is now `next/dynamic` (ssr:false) and still gated by `deferBelowFold` with an existing skeleton placeholder.
  - `AllocationNotesBoard` is now **read-only by default** (lightweight renderer) and lazy-loads the TipTap editor only when user clicks **Edit** (with loading skeleton).
  - Notes editor is preloaded on hover/focus of the Edit button.

- [x] **3.4 Keep `page.tsx` imports lightweight**
  - Step algorithms (`allocateTherapists` / `allocatePCA` / `allocateBeds`) are lazy-imported inside controller step runners; remaining legacy call sites in `schedule/page.tsx` also switched to dynamic imports.
  - Heavy helpers are deferred:
    - HK holidays (`date-holidays`) is now loaded only when Calendar/Copy UI opens.
    - Snapshot diff logic is loaded only when drift check/diff popover needs it.
  - Step “Initialize Algorithm” button now prefetches the relevant algorithm chunk on hover/focus.

### 3C. Reduce TTFB for authenticated routes (auth fast-path)

- [x] **3.5 Verify Supabase sessions locally with `SUPABASE_JWT_SECRET`**
  - Goal: remove the high-latency auth network call that can dominate **TTFB** on dashboard layouts.
  - Change: `lib/auth.ts#getCurrentUser()` now attempts a fast-path by verifying `session.access_token` locally via `jose` (`jwtVerify`) when `SUPABASE_JWT_SECRET` is set.
  - Benefit: avoids `supabase.auth.getUser()` (network) in the common case; keeps a secure fallback to Supabase if local verification fails.
  - Validation (manual):
    - Log in, navigate to `/schedule` or `/dashboard`, and confirm **no** `supabase.co/auth/v1/user` call is made for basic auth checks (Network tab).
    - Compare TTFB / Document Latency for authenticated navigations; expect meaningful reduction vs the network-validated path.

**Exit criteria**: faster first paint and faster date switch under cache.

---

## Stage 4 — Reduce CPU work and rerenders (smoothness)

- [ ] **4.1 Remove expensive deep compares (avoid `JSON.stringify` in render paths)**
  - Use explicit “dirty version” counters or structured compare only on save attempt

- [ ] **4.2 Memoization at the edges**
  - `React.memo` for heavy leaf components when props are stable (Team columns, staff lists)
  - Ensure callbacks are stable (`useCallback`) and props are not recreated unnecessarily

- [ ] **4.3 Optional: move heavy Step 2/3 algorithms off the main thread**
  - Web Worker for `allocatePCA` / `allocateTherapists` if UI jank is noticeable

**Exit criteria**: fewer rerenders during common edits; dragging and interactions stay responsive.

---

## Stage 5 — “Done Definition” and guardrails

- [ ] **5.1 Add lightweight regression guardrails**
  - Smoke test: load date, switch date, run Step 2/3, open key dialogs
  - Ensure snapshot envelope + validation rules remain enforced

- [ ] **5.2 Update `CHANGELOG.md`** (formerly `journal_new.md`)
  - Add a short note of what refactors were done and where the controller hook lives

---

## Notes / Decisions Log

- **Keep snapshot isolation**: `baseline_snapshot` is the frozen truth for non-today schedules.
- **Keep DB type safety**: always use `lib/db/types.ts` conversion utilities before saving.
- **Prefer low-risk refactors first**: extract UI components before touching business logic.

---

## Quick “What stage are we in?” checklist

- **Stage 0**: we have baseline numbers and know what’s slow
- **Stage 1**: UI extracted; `page.tsx` is mostly wiring
- **Stage 2**: controller hook + reducer state
- **Stage 3**: navigation speed and bundle size improvements
- **Stage 4**: CPU/rerender smoothness improvements
- **Stage 5**: guardrails + documentation

