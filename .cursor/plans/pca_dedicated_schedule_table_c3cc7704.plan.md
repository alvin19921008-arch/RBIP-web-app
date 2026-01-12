---
name: pca_dedicated_schedule_table
overview: Add a read-only PCA-centric schedule grid (PCA-per-column, slot-per-row) under the existing team-based grid on the Schedule page, reusing the same allocation/override data and styling rules (substitution green+underline, invalid-slot blue interval, leave/NA, special program labels), while keeping fast RPC-based loading unaffected.
todos:
  - id: extract-shared-display-helpers
    content: Extract/centralize substitution + special-program + invalid-slot display helpers so PCA table and PCABlock stay consistent.
    status: pending
  - id: build-pca-dedicated-component
    content: Implement `components/allocation/PCADedicatedScheduleTable.tsx` with rowSpan merging + styling rules + wheel-to-horizontal scroll.
    status: pending
  - id: wire-into-schedule-page
    content: Render the new PCA table under Block 2 in `app/(dashboard)/schedule/page.tsx`, ensuring width clamps to team grid and table scrolls internally.
    status: pending
  - id: verify-edge-cases
    content: Validate full-day leave merges, non-floating 主位 merges, invalid slot formatting, special program 2-line display, substitution styling, and no regression to load performance.
    status: pending
---

# PCA Dedicated Schedule Table

## Goal

Create a **read-only** “PCA dedicated schedule” table under the existing team-based grid on the Schedule page. It presents the **same PCA allocation data as Block 2**, but from a **PCA-per-column** perspective:

- Row 1: PCA headers (columns ordered **floating (incl buffer)** → **non-floating (incl buffer)**)
- Rows 2–5: slot 1–4, each cell showing **Team name** and (if applicable) **Special Program name** on a second line.

## Visual draft (layout + merged cells)

```text
[Under existing team grid]

PCA Dedicated Schedule (read-only)
┌─────────┬──────────────┬──────────────┬──────────────┬──────────────┬ ...
│         │ Amy (Float)  │ Ben (Float)  │ BufF (Float) │ Cat (NonFl)  │ ...
├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼ ...
│ Slot 1  │ FO           │ CPPC         │ SMM          │ CPPC 主位     │
│         │              │ CRP          │              │ (rowspan=3)  │
├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼ ...
│ Slot 2  │ NSM          │ NA – VL      │ SFM          │ (merged)     │
│         │ (1030-1100)  │              │ Robotic      │              │
├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼ ...
│ Slot 3  │ DRO          │ NA – VL      │ SFM          │ NA – medical │
│         │              │              │ Robotic      │ follow up    │
├─────────┼──────────────┼──────────────┼──────────────┼──────────────┼ ...
│ Slot 4  │ DRO          │ NA – VL      │ SFM          │ NA – medical │
│         │              │              │ Robotic      │ follow up    │
└─────────┴──────────────┴──────────────┴──────────────┴──────────────┴ ...

Notes:
- Substitution slot/team text is green + underlined.
- Invalid slot shows 2 lines: Team on line 1, (HHMM-HHMM) in blue on line 2.
- Full-day leave (leave cost 1.0) merges Slot 1–4 rows into one cell showing the leave type.
- Non-floating “主位” merges adjacent available-slot rows into one cell with “<Team> 主位”.
```

## Data source (no new fetches)

- Use already-loaded schedule state from `[app/(dashboard)/schedule/page.tsx](/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx)`:
  - `pcaAllocations` (the canonical per-slot `slot1..slot4` teams)
  - `staffOverrides` (leave type, availableSlots, invalidSlots, substitutionFor)
  - `staff` snapshot (includes buffer staff, rank/floating/team)
  - `specialPrograms` + `weekday` (for special program labeling)

This keeps **RPC cold-start optimizations** intact (pure render/derived data, memoized).

## Display rules (as requested)

- **Special program slots**: cell shows **Team on line 1** and **Program name on line 2**.
- **Substitution slots**: if a floating PCA is substituting for a non-floating slot, the **Team text** is **green + underlined**.
- **Unavailable due to leave**: show `NA – <leaveType>`.
- **Full-day leave (leave cost 1.0)**: merge Slot 1–4 rows and display the **leave type**.
- **Invalid slot**: show
  - line 1: Team
  - line 2: `(HHMM-HHMM)` in blue
- **Non-floating 主位**:
  - If non-floating PCA is available all day on its team (and no special-program per-slot labeling needed), merge Slot 1–4 into one cell: `<Team> 主位`.
  - If partially available (FTE ≠ 1 and ≠ 0), merge **adjacent available-slot runs** into `<Team> 主位` cells.

## Scrolling behavior

- The PCA table sits in a container whose **right edge matches the team grid width** (i.e., does not extend beyond the DRO column area).
- If the table is wider than its container:
  - enable `overflow-x-auto` for horizontal scrolling.
  - add a wheel handler so **vertical wheel scroll inside the table becomes horizontal scroll** (carousel-like), only when horizontal overflow exists.

## Implementation approach

- **New component**: `[components/allocation/PCADedicatedScheduleTable.tsx](/Users/alvin/Desktop/RBIP duty list web app/components/allocation/PCADedicatedScheduleTable.tsx)`
  - Pure presentational component.
  - Uses `useMemo` to:
    - build a `Map<staffId, mergedAllocation>` from `Object.values(pcaAllocations).flat()` (robust if duplicates exist).
    - compute per-PCA per-slot `CellSpec` (content + styles) and rowspans.
  - Renders semantic `<table>` with `rowSpan` to support merging.
  - Adds an `onWheel` handler on the scroll container (with `{ passive: false }` listener) to map `deltaY` → `scrollLeft` when `scrollWidth > clientWidth`.

- **Shared helper extraction (to avoid mismatched styling vs Block 2)**:
  - Create utilities (or extract from `PCABlock.tsx`) so both views follow the same rules:
    - substitution detection (including the “derive from non-floating missing slots” logic)
    - special program slot identification (Robotic/CRP rules + program slot config)
    - invalid slot formatting (new `invalidSlots[]` + legacy `invalid_slot` fallback)

- **Integrate into Schedule page**:
  - Insert below Block 2 (PCA Allocation) in `[app/(dashboard)/schedule/page.tsx](/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx)`.
  - Pass in `staff.filter(s => s.rank === 'PCA')` (including buffer), `pcaAllocations`, `staffOverrides`, `specialPrograms`, and `weekday`.
  - Ensure wrapper uses `w-full max-w-full overflow-x-hidden` and internal table scroller uses `overflow-x-auto` so it **does not widen** the existing team-grid scroller.

## Verification

- Confirm rendering on:
  - blank schedule (no allocations): shows headers + mostly NA/empty appropriately.
  - Step 2+ with substitutions: green+underline team labels on substituted slots.
  - invalidSlots present: 2-line team + blue interval.
  - full-day leave: merged slot rows.
  - non-floating partial availability: correct adjacent-slot merges.
- Run `npm run build` after implementation to ensure TypeScript strict mode passes.