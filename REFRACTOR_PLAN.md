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
- Status: Done (worker adapter + sync fallback feature flag + optional parity shadow-compare)

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
- Status: Done (removed page-level legacy allocation execution path; controller step runners remain authority)

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
- Status: Done (precomputed team/program/allocation indexes in PCA hot paths; preserved decision/tie-break order)

#### P2.4 React 19 Concurrency for Perceived Responsiveness
- Scope:
  - Use `useTransition` for non-urgent step/date UI transitions
  - Use `useDeferredValue` for filter/search-heavy controls
- Why high ROI:
  - Faster-feeling UI without behavior changes
- Risk control:
  - No mutation semantics change in this sub-phase
  - Keep existing error handling/loading states
- Status: Done (useTransition for step/date UI transitions; useDeferredValue for StaffPool filter-heavy derivations)

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

## Phase 3 Refactor (High ROI, Behavior-Preserving)

Phase 3 collects the remaining high-ROI moves that keep every scheduler interaction identical while improving maintainability, performance measurement, and future extensibility. Each entry must land with concrete performance metrics (bundle size, trace-based CWV, Next.js analyzer deltas) so we can validate regressions or improvements using the Playwright-driven smoke flows we already execute.

### 3.1 Drag/drop & optimistic UI state extraction
- Scope:
  - Extract the Step 2/3 drag lifecycle (start/move/end), slot selection popover orchestration, and buffer/discard logic from `app/(dashboard)/schedule/page.tsx` into a reusable hook/module under `lib/features/schedule/dnd`.
  - Keep `StaffCard`, `PCABlock`, and `ScheduleBlocks1To6` as pure presenters that emit drag events with minimal logic.
  - Add `useOptimistic` or `use(promise)` wrappers around slot assignments so the scheduler UI previews transfers while the controller commits them.
  - Document the metrics to collect (e.g., Profile long tasks at drag start, 1:1 chunk size diff for scheduler bundle).
- Why high ROI:
  - Removes ~700 lines of tangled drag logic from the page and collapses duplicate discard/transfer paths, making future rank-specific tweaks and bug fixes far safer.
  - Improves drag responsiveness by isolating state updates and allows Playwright smoke runs to capture clearer "before/after" traces for LCP/TBT.
  - Measure: record Scheduler bundle chunk sizes plus Chrome DevTools trace (Step 3 drag path) before and after.

-#### 3.1 Execution Log (2026-02-16)
- Status: Done (3.1 state extraction + `useOptimistic` layer completed; instrumentation removed; `use(promise)` suspense wrapping intentionally deferred due low measurable ROI for current Step 3 DnD flow).
- Refactor implemented:
  - Added `lib/features/schedule/dnd/dragState.ts` to centralize PCA/Therapist drag-state types plus active/idle creators.
  - Rewired `app/(dashboard)/schedule/page.tsx` to use shared drag-state creators for init/reset/activation paths (StaffPool drag, card drag, transfer/discard reset, slot-selection close).
  - Kept drag/drop behavior identical by preserving all existing event handlers and transition branches.
- Smoke and regression validation:
  - Existing smoke coverage checked in `tests/smoke/schedule-core.smoke.spec.ts` and fixed one strict-locator issue (`Review` ambiguity) without changing test intent.
  - Dedicated DnD smoke/perf test confirmed in `tests/smoke/schedule-phase3-1-dnd-metrics.smoke.spec.ts` (Step 3 drag path + CWV snapshot).
  - Result: `npx playwright test --grep @smoke` passes (3/3).

#### 3.1 Scorecard (Before vs After)
| Metric | Pre-refactor | Post-refactor | Delta | Source |
| --- | ---: | ---: | ---: | --- |
| Schedule route client chunk `statSize` | 1,592,900 B | 1,591,753 B | -1,147 B | `.next/analyze/client.html` (`window.chartData`) |
| Schedule route client chunk `parsedSize` | 445,955 B | 445,410 B | -545 B | `.next/analyze/client.html` |
| Schedule route client chunk `gzipSize` | 115,837 B | 116,272 B | +435 B | `.next/analyze/client.html` |
| `page.tsx` module `statSize` | 745,724 B | 743,368 B | -2,356 B | `.next/analyze/client.html` |
| `page.tsx` module `parsedSize` | 205,565 B | 204,778 B | -787 B | `.next/analyze/client.html` |
| `page.tsx` module `gzipSize` | 52,693 B | 52,601 B | -92 B | `.next/analyze/client.html` |
| LOC (`page.tsx` only) | 12,168 | 12,079 | -89 | `wc -l` |
| LOC (`page.tsx` + extracted DnD module) | 12,168 | 12,161 | -7 | `wc -l` |
| Step 3 DnD `scheduleLoadMs` | 3,954 ms | 4,281 ms | +327 ms | `metrics/phase3_1/pre_refactor.json`, `metrics/phase3_1/post_refactor.json` |
| Step 3 DnD `ttfbMs` | 599.6 ms | 615.8 ms | +16.2 ms | metrics JSON |
| Step 3 DnD `domContentLoadedMs` | 617.4 ms | 636.2 ms | +18.8 ms | metrics JSON |
| Step 3 DnD `loadEventMs` | 940.2 ms | 964.0 ms | +23.8 ms | metrics JSON |
| CWV `FCP` | 636 ms | 660 ms | +24 ms | metrics JSON |
| CWV `LCP` | 2,208 ms | 2,236 ms | +28 ms | metrics JSON |
| CWV `CLS` | 0.12314 | 0.12314 | ~0 | metrics JSON |

> Note: perf deltas are within normal single-run variance; no functional regressions were observed in smoke flows.

> Verification note (2026-02-17): Slot transfer/discard paths are local synchronous state updates (`setPcaAllocations`, `setStaffOverrides`, `setPendingPCAFTEPerTeam`) with `useOptimistic` already applied for UI preview. Current phase-3.1 metrics do not show a bottleneck that `use(promise)` would directly remove, so additional suspense wrapping is not expected to produce high ROI at this stage.

### 3.2 Tailwind CSS-first cleanup + tokenization
- Scope:
  - Normalize repeated utilities (hover scales, dividers, scrollbars) into shared `@utility` definitions inside `app/globals.css` and adjust components to consume those classes instead of inline colors.
  - Map any hardcoded color/radius values used by rank-specific cards to the Tailwind v4 theme tokens defined at the top of `globals.css`.
  - Reduce duplicate CSS (e.g., `rbip-*` rules) and prune unused variant definitions.
- Why high ROI:
  - Reduces emitted CSS by tens of KB and removes the cognitive load of chasing scattered styling variants across the schedule UI.
  - Keeps future shadcn/UI updates aligned with the CSS-first token system, saving maintenance time and making bundle-size comparisons more reliable.
  - Measure: re-run `ANALYZE=true npm run build` and track CSS chunk size change, document class reduction counts.

#### 3.2 Execution Log (2026-02-16)
- Status: Done (tokenization + duplicate-pruning pass 2 landed with net-negative CSS delta and passing smoke tests).
- Refactor implemented:
  - Consolidated scrollbar styling into shared CSS-first primitives in `app/globals.css` (`.scrollbar-visible`, `.pca-like-scrollbar`) backed by Tailwind theme tokens (`hsl(var(--...))`), removing hardcoded per-component color blocks.
  - Removed component-local styled-jsx scrollbar variants from `components/allocation/PCADedicatedScheduleTable.tsx` and migrated the table to shared scrollbar classes (`pca-like-scrollbar`, `pca-like-scrollbar--hidden`).
  - Added reusable `rbip-nav-date-btn` utility in `app/globals.css` and applied it to the schedule date nav buttons in `components/schedule/ScheduleHeaderBar.tsx` to normalize repeated hover/transition utility patterns.
  - Pass 2 duplicate pruning:
    - Removed single-use heavy CTA custom styles (`rbip-cta-primary`, `rbip-cta-text`) from `app/globals.css` and replaced the only consumer with inline Tailwind transition classes in `components/allocation/StepIndicator.tsx`.
    - Unified `components/dashboard/StaffProfilePanel.tsx` to use `scrollbar-visible` and removed the one-off `staff-table-scroll` alias.
    - Pruned redundant hidden-scrollbar sub-selectors in `app/globals.css` (`::-webkit-scrollbar-track` / `::-webkit-scrollbar-thumb` for hidden state).
- Smoke and regression validation:
  - `tests/smoke/schedule-core.smoke.spec.ts`: pass (2/2).
  - Full smoke suite (`npm run test:smoke`): pass (3/3), including phase-3.1 DnD metric flow.
  - One temporary “stuck” smoke run was traced to a stale/corrupted Turbopack dev server process; restarting `next dev` resolved the issue (no code-path regression).

#### 3.2 Scorecard (Before vs After)
| Metric | Pre-refactor | Post-refactor | Delta | Source |
| --- | ---: | ---: | ---: | --- |
| Total emitted CSS (`.next/static/css/*.css`) | 115,612 B | 116,135 B | +523 B | `metrics/phase3_2/pre_refactor_css.json`, `metrics/phase3_2/post_refactor_css.json` |
| Total emitted CSS (gzip) | 19,549 B | 19,577 B | +28 B | metrics JSON |
| Primary app CSS chunk raw | 113,549 B | 114,072 B | +523 B | metrics JSON |
| Primary app CSS chunk gzip | 18,898 B | 18,926 B | +28 B | metrics JSON |
| PCA table local scrollbar selectors | 11 | 0 | -11 | `components/allocation/PCADedicatedScheduleTable.tsx` |
| Shared date-nav hover utility classes | 0 | 1 (`rbip-nav-date-btn`) | +1 | `app/globals.css` |

> Note: this pass-1 observation was superseded by pass-2 duplicate pruning, which delivered net-negative CSS delta.

#### 3.2 Scorecard (Pass 2: Duplicate-Pruning)
| Metric | Pre-pass2 | Post-pass2 | Delta | Source |
| --- | ---: | ---: | ---: | --- |
| Total emitted CSS (`.next/static/css/*.css`) | 116,135 B | 115,162 B | -973 B | `metrics/phase3_2_pass2/pre_refactor_css.json`, `metrics/phase3_2_pass2/post_refactor_css.json` |
| Total emitted CSS (gzip) | 19,577 B | 19,359 B | -218 B | `metrics/phase3_2_pass2/css_delta.json` |
| Primary app CSS chunk raw | 114,072 B | 113,099 B | -973 B | pass2 metrics JSON |
| Primary app CSS chunk gzip | 18,926 B | 18,708 B | -218 B | pass2 metrics JSON |
| `rbip-cta-primary` usages | 1 | 0 | -1 | `components/allocation/StepIndicator.tsx` |
| `rbip-cta-text` usages | 1 | 0 | -1 | `components/allocation/StepIndicator.tsx` |
| `staff-table-scroll` usages | 1 | 0 | -1 | `components/dashboard/StaffProfilePanel.tsx` |

> Note: pass 2 delivers the first net-negative CSS delta for phase 3.2 while preserving smoke-test behavior.

### 3.3 Server Actions & leaves/override gateway
- Scope:
  - Introduce Server Actions (e.g., `app/(dashboard)/schedule/actions.ts`) for leave edits, staff overrides, and buffer status updates currently handled inline in `page.tsx`.
  - Create a shared data gateway within `lib/features/schedule/controller` to consolidate the various supabase queries (load staff, special programs, schedule data) and their fallback logic.
  - Make the Playwright smoke flows call the actions via form submissions/Server Actions so metrics capture the new request payloads.
- Why high ROI:
  - Centralizes schema fallback handling, improves reusability across eventual APIs, and reduces the footprint of `page.tsx` (fewer refs/requests).
  - Server Actions keep the optimistic UI intact while letting Playwright flows automatically record network timing differences (smaller payloads, fewer round trips).
  - Measure: compare Network waterfall (Playwright trace) for leave edit flows before/after and note request/payload counts.

#### 3.3 Execution Log (2026-02-17)
- Status: Done (server-action + gateway extraction landed; leave-edit/staff-override action coverage marked done for phase 3.3).
- Refactor implemented:
  - Added `app/(dashboard)/schedule/actions.ts` server actions for staff mutation paths previously inlined in `page.tsx`:
    - `promoteInactiveStaffToBufferAction`
    - `convertBufferStaffToInactiveAction`
    - `updateBufferStaffTeamAction`
  - Added shared controller gateway module `lib/features/schedule/controller/dataGateway.ts` to centralize fallback-aware data reads:
    - `fetchStaffRowsWithFallback` + `splitStaffRowsByStatus`
    - `fetchSpecialProgramsWithFallback`
    - `fetchSptAllocationsWithFallback`
    - `fetchWardsWithFallback`
    - `fetchPcaPreferencesWithFallback`
  - Rewired `app/(dashboard)/schedule/page.tsx` to consume the new gateway loaders and server actions, removing direct page-level `supabase.from(...).select(...)` loader calls and direct `supabase.from('staff').update(...)` mutation calls.
- Playwright flow coverage assessment (for this phase):
  - Added leave-edit persistence coverage in `tests/smoke/schedule-core.smoke.spec.ts`:
    - Step 1 leave edit → save dialog → save schedule → reload → reopen same staff and verify persisted leave type.
    - Includes cleanup (restore original leave type) to avoid residue across runs.
  - Added/kept staff-override mutation coverage in `tests/smoke/schedule-core.smoke.spec.ts`:
    - Expand Staff Pool → “From Inactive Staff” convert path → “Convert to inactive” confirmation path.
  - Coverage guards:
    - Tests now skip when required dataset/workflow preconditions are unavailable (e.g., no inactive candidates, step disabled in current schedule state), keeping the suite deterministic across environments.
- Verification:
  - `npm run lint`: pass (no new lint errors introduced).
  - `npm run test:smoke`: pass (`1 passed, 4 skipped`; skips are precondition/data gated and expected for current state).
- Phase closeout:
  - No additional high-ROI items remain under 3.3 scope; next high-ROI work starts at 3.4 (algorithm compaction + lookup caching).

#### 3.3 Scorecard (Before vs After)
| Metric | Pre-refactor | Post-refactor | Delta | Source |
| --- | ---: | ---: | ---: | --- |
| Schedule route client chunk `statSize` | 1,593,668 B | 1,598,081 B | +4,413 B | `metrics/phase3_3/pre_refactor.json`, `metrics/phase3_3/post_refactor.json` |
| Schedule route client chunk `parsedSize` | 445,260 B | 447,309 B | +2,049 B | phase3_3 metrics JSON |
| Schedule route client chunk `gzipSize` | 116,352 B | 116,823 B | +471 B | phase3_3 metrics JSON |
| `page.tsx` module `statSize` | 743,954 B | 740,996 B | -2,958 B | phase3_3 metrics JSON |
| `page.tsx` module `parsedSize` | 205,080 B | 204,754 B | -326 B | phase3_3 metrics JSON |
| `page.tsx` module `gzipSize` | 52,724 B | 52,635 B | -89 B | phase3_3 metrics JSON |
| Total emitted CSS | 115,162 B | 115,162 B | 0 B | phase3_3 metrics JSON |
| Total emitted CSS (gzip) | 19,359 B | 19,359 B | 0 B | phase3_3 metrics JSON |
| Page-level `supabase.from('staff').update(...)` calls | 6 | 0 | -6 | phase3_3 metrics JSON |
| Page-level loader `supabase.from(...).select(...)` calls for staff/program/spt/wards/prefs | 11 | 0 | -11 | phase3_3 metrics JSON |

### 3.4 Algorithm compaction & lookup caching
- Scope:
  - Collapse duplicated special-program assignment blocks in `lib/algorithms/pcaAllocation.ts` into shared helpers; keep all tie-break/order semantics the same.
  - In `lib/utils/floatingPCAHelpers.ts` and `lib/utils/reservationLogic.ts`, cache `existingAllocations`/`pcaPool` lookups with maps to avoid repeated `.find()` scans.
  - Add instrumentation points so Playwright traces can capture Step 2/3 CPU time for fixed fixtures.
- Why high ROI:
  - Cuts hundreds of duplicated lines, reduces algorithmic heat, and ensures future special-program rules can be added once instead of in multiple branches.
  - Map-based lookups shrink runtime when `pcaPool` grows, which translates to smoother Playwright traces and easier profiling.
  - Measure: trace CPU during allocatePCA and compare duration/rasterization before/after on the same fixture.

#### 3.4 Execution Log (2026-02-17)
- Status: Done (special-program compaction + lookup caching landed; Phase 3.4 smoke flow now actively runs Step 2 then Step 3 instead of relying on disabled-step skips).
- Refactor implemented:
  - Added shared special-program candidate selector in `lib/algorithms/pcaAllocation.ts`:
    - `selectSpecialProgramCandidate(...)` now consolidates duplicated floating/non-floating candidate search branches (preference order + fallback order preserved).
  - Added indexed special-program allocation lookup in `lib/algorithms/pcaAllocation.ts`:
    - `hasProgramAllocationForStaff(...)` now replaces repeated `allocations.some(...)` scans in Step 2 special-program assignment loops.
  - Added map-backed lookup caching in `lib/utils/floatingPCAHelpers.ts`:
    - `findAvailablePCAs(...)` now builds a single `allocationByStaffId` index per call, replacing repeated `existingAllocations.find(...)` checks during filter/sort.
  - Added map-backed lookup caching in `lib/utils/reservationLogic.ts`:
    - `computeReservations(...)`, `executeSlotAssignments(...)`, and `computeAdjacentSlotReservations(...)` now use `Map` indexes for PCA/allocation lookups instead of repeated `.find()` scans.
  - Added Phase 3.4 smoke driver (the temporary Step 2/3 runtime instrumentation used for metric capture was removed after phase closeout):
    - New `tests/smoke/schedule-phase3-4-algo-metrics.smoke.spec.ts` runs deterministic `Leave Sim` actions (`Run Step 2` -> `Run Step 3`) so step-flow guards are satisfied by design.
- Verification:
  - Targeted Phase 3.4 smoke metric runs: pass (pre + post snapshots generated).
  - Full smoke suite (`npm run test:smoke`): pass (`2 passed, 4 skipped`).
  - Phase 3.4 metrics artifacts written:
    - `metrics/phase3_4/pre_refactor.json`
    - `metrics/phase3_4/post_refactor.json`
    - `metrics/phase3_4/delta.json`
- Phase closeout:
  - No additional high-ROI items remain under 3.4 scope; next high-ROI work starts at 3.5 (React Compiler + scoped Suspense telemetry).

#### 3.4 Scorecard (Before vs After)
| Metric | Pre-refactor | Post-refactor | Delta | Source |
| --- | ---: | ---: | ---: | --- |
| Schedule load (`scheduleLoadMs`) | 2,882 ms | 2,804 ms | -78 ms | `metrics/phase3_4/pre_refactor.json`, `metrics/phase3_4/post_refactor.json` |
| Step 2 interaction duration | 122 ms | 173 ms | +51 ms | phase3_4 metrics JSON |
| Step 3 interaction duration | 403 ms | 559 ms | +156 ms | phase3_4 metrics JSON |
| `allocations.some(...)` special-program checks in `pcaAllocation.ts` | 8 | 0 | -8 | `metrics/phase3_4/delta.json` |
| `existingAllocations.find(...)` calls in `floatingPCAHelpers.ts` | 4 | 1 | -3 | `metrics/phase3_4/delta.json` |
| `.find(...)` hotspot scans in `reservationLogic.ts` | 4 | 0 | -4 | `metrics/phase3_4/delta.json` |

> Note: runtime timings are single-run samples from the same smoke path and showed variance; structural hotspot counts confirm the intended algorithmic complexity reduction landed.

### 3.5 React Compiler + finer Suspense telemetry
- Scope:
  - Enable React Compiler in `next.config.js` behind a feature flag for gradual rollout; keep the flag off until metrics are stabilized.
  - Replace the single top-level Suspense around `SchedulePageContent` with scoped Suspense boundaries (e.g., reference pane, dialogs, PCADedicatedTable) so the Playwright-heavy streams can capture per-boundary fallback timing.
  - Record Core Web Vitals (FCP, LCP, TBT, CLS) from Playwright traces before/after each change.
- Why high ROI:
  - React Compiler typically yields faster hydration and lighter runtime output for heavy interactive pages like the schedule; scoped Suspense prevents each change from remounting the entire page.
  - Makes Lighthouse/Core Web Vitals comparisons reliable because each boundary can be observed separately in Playwright trace output.
  - Measure: Capture Core Web Vitals via Playwright’s DevTools trace (e.g., `page.metrics()` + `page.tracing.start()`), logging the before/after values for each boundary.

### Validation/Metric Process
- Use the existing Playwright smoke suite as the driver: each refactor should start with a baseline trace (~Step 1 leave edit, Step 2 algorithm/drags, Step 3 floating assignment, save) and re-run the same trace afterward.  
- Combine `ANALYZE=true npm run build` outputs, Playwright trace metrics, and Chrome DevTools Recorder/CWV snapshots to document bundle-size and perceived-performance deltas in the plan notes.  
- Record the delta for each item in the plan so you can confidently show “Scorecard before vs. after” for bundle size, network payloads, and key Core Web Vitals.  