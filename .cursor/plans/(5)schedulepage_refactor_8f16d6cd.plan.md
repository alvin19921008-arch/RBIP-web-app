---
name: SchedulePage refactor
overview: Refactor `app/(dashboard)/schedule/page.tsx` to be dramatically smaller and more maintainable by extracting pure helpers + a few custom hooks (A), and moving large JSX subtrees into memoized presentational components (moderate C), while preserving all current data flow, algorithm calls, and step behavior.
todos:
  - id: scan-seams
    content: Scan `app/(dashboard)/schedule/page.tsx` for repeated blocks and confirm extraction boundaries for date helpers, allocation grouping/sorting, and bed relieving math.
    status: completed
  - id: extract-pure-helpers
    content: Create `lib/features/schedule/{date,grouping,bedMath}.ts` and refactor `page.tsx` to call these helpers without changing inputs/outputs.
    status: completed
  - id: extract-hooks
    content: Add `useActionToast`, `useResizeObservedHeight`, `useScheduleDateParam` hooks and wire them into `page.tsx` keeping hook call order stable.
    status: completed
  - id: extract-ui-components
    content: Create memoized presentational components (`components/schedule/ScheduleOverlays.tsx`, `ScheduleCalendarPopover.tsx`) and replace inline JSX/IIFEs with memoized props.
    status: completed
  - id: verify-no-behavior-change
    content: Run build and do a quick manual pass through Step 1–4 + save/copy flows to confirm identical behavior.
    status: completed
---

# Refactor schedule/page.tsx (A + moderate C)

### Goals / non-goals

- **Goal**: Reduce the size and cognitive load of [`app/(dashboard)/schedule/page.tsx`](app/\\\\\\\\\\\\(dashboard\)/schedule/page.tsx)(/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx) without changing behavior.
- **Non-goal**: No algorithm/math changes in `allocateTherapists`, `allocatePCA`, `allocateBeds`, or any snapshot/step logic. This is a *move + reuse + memoize* refactor.

### What we’ll refactor (safe seams already present)

We’ll refactor around existing “named seams” that already partition the file:

- `loadScheduleForDate` (data load + cache)
- `recalculateScheduleCalculations` (calcs + bed math)
- `generateStep2_TherapistAndNonFloatingPCA` / `generateStep3_FloatingPCA` / `calculateStep4_BedRelieving` (step orchestration)
- The large render block starting at `return (` (overlays/menus/dialogs/layout)

### Phase 1 (A): Extract *pure* helpers to reduce duplication (lowest risk)

Create a small `schedule` feature utils folder, e.g.:

- `lib/features/schedule/date.ts`
- Move: `getWeekday`, `formatDateForInput`, `parseDateFromInput`, plus a single shared `formatDateIsoLocal(date)` helper used everywhere.
- `lib/features/schedule/grouping.ts`
- Extract: “group allocations by team + attach staff + sort” helpers used by `applySavedAllocations`, Step 2, Step 3.
- Keep behavior identical by passing in comparator functions and preserving existing sort criteria.
- `lib/features/schedule/bedMath.ts`
- Extract a reusable **pure** function for the duplicated “effective beds + bedsForRelieving” computation.
- Preserve behavior by parameterizing the FTE source:
- In `recalculateScheduleCalculations`: use current `staffOverrides` fallback behavior (as today).
- In `calculateStep4_BedRelieving`: use allocation `fte_therapist` behavior (as today).

This reduces copy/paste blocks and makes future edits much safer.

### Phase 2 (A): Extract a few targeted custom hooks (still low risk)

Add small hooks that wrap existing state/effect code **without changing the order they are called**:

- `lib/hooks/useActionToast.ts`
- Owns `actionToast` state + timer refs + `showActionToast()`.
- Returns `{ actionToast, showActionToast, dismissToast, containerRef }`.
- `lib/hooks/useResizeObservedHeight.ts`
- Wrap the `ResizeObserver` logic currently syncing `rightContentHeight` from `rightContentRef`.
- `lib/hooks/useScheduleDateParam.ts`
- Encapsulate the “read `?date=` from `useSearchParams` and update `selectedDate`” effect.

All other heavy orchestration (Step 2/3/4, load/save/copy) stays in `page.tsx` for stability.

### Phase 3 (moderate C): Move big JSX subtrees into memoized presentational components

Create memoized components that take props and render UI only (no new state machines, no providers):

- `components/schedule/ScheduleOverlays.tsx`
- Renders: top loading bar, `SlotSelectionPopover`, both `StaffContextMenu`s, plus other “always on top” UI.
- `React.memo` + stable props.
- In `page.tsx`, replace inline `items={(() => { ... })()}` with `useMemo`-computed `gridMenuItems` / `poolMenuItems` arrays so render becomes declarative.
- `components/schedule/ScheduleCalendarPopover.tsx`
- Extract the calendar popover JSX (the `fixed` backdrop + positioned `CalendarGrid`).

This yields a much shorter `return (...)` section and avoids recreating large menu arrays every render.

### Guardrails to keep behavior unchanged

- No changes inside algorithm functions; only move code into helpers called with the same inputs.
- No changes to `staffOverrides` schema, snapshot envelope logic, or step gating.
- Preserve `useEffect` ordering by calling new hooks in the same relative location.
- Any extracted helper gets unit-like “golden behavior” verification by comparing outputs in dev logs during refactor (temporary) and removing after.

### Expected impact (estimates) + how we’ll measure

Because the main schedule “load speed” is dominated by **data fetch (Supabase RPC/queries)** + **initial state hydration**, pure refactors (moving code across files) usually don’t move the needle much by themselves. The measurable improvements come mostly from **render work reduction** (memoization + avoiding rebuilding large props) and, optionally, **code-splitting** (lazy-loading rarely-used dialogs). This plan targets the former (safe), and leaves the latter as an optional add-on if you want it.

- **Loading speed (initial navigation to Schedule)**:
- **Likely improvement**: **0–5%** (often ~0ms to a few 10s of ms), because network/RPC dominates.
- **When it improves more**: if we add optional lazy-loading of heavy dialogs, we can reduce initial JS execution on first mount, sometimes yielding **5–15%** better “time to interactive” on slower machines.

- **Runtime efficiency (rerender cost while interacting)**:
- **Likely improvement**: **5–20% fewer wasted renders / less main-thread work** on interactions that currently rebuild large inline arrays/closures (context menu item builders, overlay props, etc.).
- **Primary wins**: `useMemo` for menu items, stable callbacks, and `React.memo` for large UI subtrees that don’t need to rerender on unrelated state changes.

- **Developer efficiency / maintainability**:
- **Likely improvement**: reduce `page.tsx` from ~11.5k LOC to roughly **5–7k LOC** in the first pass (A + moderate C), by moving helpers/hooks/components out.
- **Why it matters**: less merge conflict surface, easier mental model, safer changes (especially around Step 2/3/4).

- **Bundle size / chunk size (Schedule route)**:
- **If we only extract modules (A + moderate C)**: **~0–3% change** in the Schedule route chunk size (often effectively unchanged). Splitting files usually **does not** shrink JS; Next still needs the same code.
- **If we add optional lazy-loading (`next/dynamic`) for rarely-used dialogs** (e.g. copy wizard, some context-action popovers): potential reduction in initial chunk by **~20–150KB gzipped** (very dependent on what we can safely defer). Tradeoff: first open of that dialog may incur a small load delay.

**Measurement plan (so we can replace estimates with real numbers):**

- **Before/after chunk sizes**: compare emitted file sizes in `.next/static/chunks/` for the schedule route (and note gzip where possible).\n+- **Runtime timings**: use existing timing infrastructure (`lastLoadTiming` / `navToScheduleTiming`) to compare before/after on the same machine and same data conditions.\n+- **Rerender profiling**: quick React Profiler spot-check on the schedule page during a few common interactions (opening menus, toggling dialogs, dragging a card).\n+

### Validation after refactor

- Typecheck/build: `npm run build`.
- Quick manual flows on Schedule page:
- Load a saved schedule (RPC + cache path), switch dates, verify no progressive `avg PCA/team` jumps.
- Run Step 2, ensure dialogs (2.0/2.1) still appear and behave identically.
- Run Step 3 with tie-break + 3.1/3.2/3.3 wizard.
- Run Step 4 bed relieving and confirm Block 3/5 consistency.
- Save/Copy and confirm top loading bar + timing tooltip still work.