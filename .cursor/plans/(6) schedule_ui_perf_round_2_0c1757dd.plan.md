---
name: Schedule UI perf round 2
overview: Second optimization pass focused on lower rerenders and smaller initial Schedule bundle by memoizing heavy subtrees, stabilizing props/callbacks, and code-splitting large dialogs with safe prefetch—without changing any workflow behavior or algorithms.
todos:
  - id: baseline-metrics
    content: Record current Schedule chunk sizes and timings (before/after comparison points).
    status: pending
  - id: memo-team-columns
    content: Memoize TeamColumn and stabilize per-team props/callbacks in schedule page; introduce staffOverrides slicing per team.
    status: pending
  - id: optimize-pca-block
    content: "Refactor PCABlock hotpaths: memoize derived lists/maps, reduce repeated finds, optionally extract pure display helpers."
    status: pending
  - id: optimize-therapist-block
    content: Memoize TherapistBlock derived computations and add map-based lookups; add React.memo after prop stabilization.
    status: pending
  - id: optimize-staff-pool
    content: "Targeted StaffPool optimizations: memoize filtered lists and stabilize render-loop helpers."
    status: pending
  - id: code-split-dialogs
    content: Use next/dynamic for heavy dialogs and add safe prefetch (idle + hover).
    status: pending
  - id: validate-and-report
    content: Build + smoke test + report measured size/timing deltas.
    status: pending
---

# Next optimization round (balanced: rerender + bundle)

### Goals / non-goals

- **Goal**: Improve Schedule page UI performance while keeping **all workflow behavior, backend math, and data management identical**.
- **Goal**: Reduce wasted renders and per-render work in frequently-rendered blocks.
- **Goal**: Reduce initial Schedule JS bundle by code-splitting large, infrequently used dialogs (with prefetch to keep UX smooth).
- **Non-goal**: No changes to allocation algorithms or step semantics.

### Phase 0: Baseline measurements (so we can prove wins)

- Capture current Schedule chunk sizes from `.next/static/chunks/` (and optionally gzipped sizes via `gzip -c`).
- Capture existing Schedule load timings using your built-in diagnostics (`lastLoadTiming`, `navToScheduleTiming`).
- Optional: React Profiler quick pass on typical interactions (open context menu, drag staff card, open Step dialogs).

### Phase 1: Reduce rerenders at the Schedule “grid” layer

Target: prevent “whole grid rerender” when only a small part changes.

- Add `React.memo` to `TeamColumn` and ensure stable props.
- File: [`components/allocation/TeamColumn.tsx`](components/allocation/TeamColumn.tsx)(/Users/alvin/Desktop/RBIP duty list web app/components/allocation/TeamColumn.tsx)
- In [`app/(dashboard)/schedule/page.tsx`](app/\\\\\(dashboard\)/schedule/page.tsx)(/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx):
- Use `useMemo` to build **per-team props objects** so only the affected team column changes.
- Avoid passing “global” objects when a slice works:
- Build `staffOverridesByTeam[team] `(subset for staff IDs shown in that team) and pass that to `PCABlock`/`TherapistBlock` instead of the full `staffOverrides` object.
- This is the single biggest low-risk rerender win.
- Ensure event handlers passed down are stable (`useCallback`) where they’re used as props to memoized children.

### Phase 2: Component-level hotpath optimization

#### `PCABlock` (highest ROI)

- File: [`components/allocation/PCABlock.tsx`](components/allocation/PCABlock.tsx)(/Users/alvin/Desktop/RBIP duty list web app/components/allocation/PCABlock.tsx)
- Convert the heaviest derived computations to `useMemo`:
- `pcaAllocationsWithFTE` filtering
- slot display computation (`getSlotDisplayForTeamFiltered`) by precomputing a map keyed by `allocation.id` (and override slice)
- precompute `specialProgramsById` and `programNameById` maps to avoid repeated `.find()` inside loops
- Consider extracting pure helpers to `lib/features/schedule/pcaDisplay.ts` (or similar) to keep the component smaller and more testable.

#### `TherapistBlock`

- File: [`components/allocation/TherapistBlock.tsx`](components/allocation/TherapistBlock.tsx)(/Users/alvin/Desktop/RBIP duty list web app/components/allocation/TherapistBlock.tsx)
- Use `useMemo` for:
- filtered `therapistAllocations`
- `ptPerTeam`
- `teamSpecialPrograms`
- Replace repeated `specialPrograms.find()` with a precomputed `Map`.
- Add `React.memo` once props are stabilized.

#### `StaffPool` (targeted)

- File: [`components/allocation/StaffPool.tsx`](components/allocation/StaffPool.tsx)(/Users/alvin/Desktop/RBIP duty list web app/components/allocation/StaffPool.tsx)
- Keep the current scroll/DOM event logic (it’s already careful), but:
- Use `useMemo` for filtered lists (rank filters, on-leave filter) so we don’t recompute arrays on every render.
- Ensure helper functions that are used in render loops are `useCallback` or moved out as pure functions.

### Phase 3: Code-split heavy dialogs (next/dynamic) + prefetch

Targets (largest first):

- `SpecialProgramOverrideDialog` (~1557 LOC)
- `FloatingPCAConfigDialog` (~1033 LOC)
- `StaffEditDialog` (~806 LOC)
- `BufferStaffCreateDialog` (~528 LOC)
- `ScheduleCopyWizard` (~477 LOC)

Approach:

- Create a single lazy entry file, e.g. `components/schedule/lazy.ts`, exporting dynamic components.
- Replace direct imports in `schedule/page.tsx` with `dynamic(() => import(...), { ssr: false, loading: () => null })`.
- Add safe prefetch:
- `requestIdleCallback` (or `setTimeout`) after initial mount to prefetch the top 2–3 most likely dialogs.
- Prefetch specific dialogs on hover/focus of the buttons that open them (Copy, Initialize Algo, etc.).

### Validation

- `npm run build`.
- Smoke test (same as you already did): open schedule, Step 2/3 dialogs, drag actions, copy wizard, save.
- Re-measure chunk sizes + timing metrics and summarize actual deltas.

### Expected impact (rough ranges)

- **Interaction smoothness**: typically **5–25%** less wasted render work (depends on how often `staffOverrides` changes and how well slicing stabilizes props).
- **Initial bundle**: code-splitting the big dialogs often yields **~30–200KB gzipped** reduction on the initial Schedule chunk (highly dependent on what Next bundles together). Prefetch keeps UX close to current.
- **Cold-start navigation time**: usually a **small** improvement unless the device is CPU-bound; expect **0–10%**.