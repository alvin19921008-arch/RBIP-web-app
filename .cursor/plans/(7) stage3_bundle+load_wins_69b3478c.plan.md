---
name: Stage3 bundle+load wins
overview: Implement Stage 3.3 + 3.4 by code-splitting below-the-fold UI and lazily loading heavy/rarely-used modules (algorithms, TipTap editor, holidays/diff helpers) to reduce cold-start JS cost while keeping behavior consistent.
todos:
  - id: baseline-measure
    content: Record current `/schedule` load diagnostics and `next build` route sizes for comparison.
    status: pending
  - id: notes-split
    content: Split Allocation Notes Board into readonly (default) + dynamically loaded TipTap editor.
    status: pending
  - id: lazy-pca-table
    content: Dynamic-import `PCADedicatedScheduleTable` (keep existing skeleton when deferred).
    status: pending
  - id: lazy-algorithms
    content: Move algorithm imports in `useScheduleController` to dynamic imports inside step runner actions; remove direct algorithm usage/imports from `schedule/page.tsx`.
    status: pending
  - id: lazy-helpers
    content: Lazy-load `getHongKongHolidays` and `diffBaselineSnapshot` only when their UI flows are opened.
    status: pending
  - id: prefetch-hooks
    content: Add optional prefetch on hover/focus for algo init buttons and notes Edit button.
    status: pending
  - id: verify
    content: Run `npm run build` and sanity-check schedule load + step runs + notes save; re-check load diagnostics numbers.
    status: pending
isProject: false
---

## Goals

- Reduce **cold-start JS parse/hydration cost** on `/schedule` by removing heavy modules from the initial client bundle.
- Keep the current UX, except for the Notes Board which will become **lightweight read-only by default** and only load the editor on demand (per your preference).
- Maintain TypeScript strict-mode safety and existing schedule workflow rules.

## Current baseline (from your screenshots)

- Cold start is largely **network/RPC bound** (`rpc:load_schedule_v1` ~287–829ms), but `start→mount/gridReady` is ~422ms, so shrinking the initial bundle should still help perceived responsiveness.

## Stage 3.3 — Dynamic-import below-the-fold heavy UI

### A) `PCADedicatedScheduleTable`

- **Change**: Replace the static import in `app/(dashboard)/schedule/page.tsx` with a `next/dynamic` import (ssr:false) and keep the existing skeleton placeholder that already renders when `deferBelowFold` is true.
- **Why**: This table is sizeable and currently included in the initial Schedule bundle even though you already defer its render.

### B) Allocation Notes Board (rarely edited)

- **Change**: Split into 3 parts so TipTap is not in the default bundle:
- `components/allocation/AllocationNotesBoardReadonly.tsx`: lightweight read-only renderer (no TipTap dependency). Render the notice board content frequently.
- `components/allocation/AllocationNotesBoardEditor.tsx`: move the current TipTap-based editor here (imports `@tiptap/*`).
- `components/allocation/AllocationNotesBoard.tsx`: wrapper that shows readonly by default and dynamically imports the editor only when the user clicks “Edit”.
- **Keep**: same persistence API (`doc`, `onSave`) and same visual placement in the layout. Editing becomes a deliberate action.

## Stage 3.4 — Keep Schedule imports lightweight

### A) Lazy-load algorithms (big chunk win)

- **Controller**: In `lib/features/schedule/controller/useScheduleController.ts`, convert algorithm imports to **type-only** and do runtime dynamic imports inside actions:
- In `runStep2TherapistAndNonFloatingPCA`: `await import('@/lib/algorithms/therapistAllocation')` and `await import('@/lib/algorithms/pcaAllocation')`.
- In `runStep3FloatingPCA`: `await import('@/lib/algorithms/pcaAllocation')`.
- In `runStep4BedRelieving`: `await import('@/lib/algorithms/bedAllocation')`.
- **Page**: Remove direct uses/imports of `allocateTherapists`, `allocatePCA`, `allocateBeds` from `app/(dashboard)/schedule/page.tsx` (they’re currently still present).
- Replace the bed-count override effect’s direct `allocateBeds(...)` call with `scheduleActions.runStep4BedRelieving(...)` gated by the same “shouldComputeBeds” logic.
- **Outcome**: The largest algorithm modules won’t be pulled into the initial Schedule JS.

### B) Lazy-load rarely-needed helpers

- **Hong Kong holidays**: In `app/(dashboard)/schedule/page.tsx`, replace the static `getHongKongHolidays` import with a dynamic import inside the effect that runs when calendar/copy UI opens.
- **Snapshot diff**: Replace the static `diffBaselineSnapshot` import with dynamic import inside the drift-check and snapshot-diff effects (only needed when drift UI is active / diff popover opens).

### C) Optional prefetch (smooth first use)

- On hover/focus of:
- “Initialize Algo” buttons: prefetch algorithm chunks via `void import(...)`.
- Notes “Edit” button: prefetch editor chunk.
- This keeps cold-start lean while avoiding a noticeable delay the first time a rare feature is used.

## Verification / acceptance checks

- Build: run `npm run build` to ensure strict typing passes.
- Behavior:
- Schedule load still works (Step 1 baseline view + saved allocations hydration).
- Step 2/3/4 still work (first run may download a new chunk; should show existing loading UI).
- Notes board renders content immediately in readonly mode; clicking Edit loads editor and can save.
- Performance:
- Compare Schedule “Load diagnostics” `start→mount` and `start→gridReady` before/after.
- Check `next build` output for reduced `/schedule` route JS size (directional confirmation).