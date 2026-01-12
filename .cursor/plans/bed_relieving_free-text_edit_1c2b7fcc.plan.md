---
name: Bed relieving free-text edit
overview: Add inline, Excel-like free-text editing for bed-releasing bed numbers in Block 3 (BedBlock), stored as per-schedule overrides and excluded from copy operations.
todos:
  - id: add-state
    content: Add `bedRelievingNotesByTeam` state in `app/(dashboard)/schedule/page.tsx`, load from `staff_overrides.__bedRelieving`, and include it in save payload.
    status: pending
  - id: inline-editor
    content: Upgrade `components/allocation/BedBlock.tsx` to support view mode vs inline edit mode, with auto-resizing textareas and info-icon tooltip showing original computed summary.
    status: pending
  - id: wire-props
    content: Update `components/allocation/TeamColumn.tsx` (and schedule page render) to pass notes + update callbacks into `BedBlock`.
    status: pending
  - id: exclude-from-copy
    content: Update `app/api/schedules/copy/route.ts` to strip `__bedRelieving` from `staff_overrides` before copying (RPC + fallback update).
    status: pending
  - id: warnings
    content: Add non-blocking mismatch warnings comparing typed bed count vs algorithm `num_beds` totals.
    status: pending
---

# Bed relieving free-text editing (Block 3)

## Goal

- Make the Block 3 “Takes:” / “Releases:” content inline-editable.
- On click, switch from computed summary lines (e.g. “2 beds from FO”) to an Excel-like list where each row has:
- **Field 1**: releasing `team (ward)` (free text, default-filled)
- **Field 2**: bed numbers to release (free text, e.g. `5, 6, 7, 8, 9`)
- Show an **info icon** next to the `Takes:` / `Releases:` header *only in edit mode*; hover tooltip shows the original computed summary for reference.
- Persist as **within-day overrides** (saved on the schedule), and **never copied** to other dates (hybrid/full copy).
- Provide **warning (not blocking)** when the number of bed numbers typed doesn’t match the algorithm’s bed count.

## Visual draft (what the user sees)

### Normal view (no manual bed numbers yet)

- Takes:
- `2 beds from FO (R11B)`
- `1 bed from MC (R7A)`
- Releases:
- `3 beds to DRO (R11A)`

### After clicking inside “Takes:” content (edit mode)

- Takes: `[i]` (hover shows: “Takes: 2 beds from FO (R11B), 1 bed from MC (R7A)”)
- Row 1
- left input: `FO (R11B)`
- right textarea: `5, 6, 7, 8, 9`
- small warning under row if mismatch: `Expected 2 beds, got 5`
- Row 2
- left input: `MC (R7A)`
- right textarea: `8`
- actions: `+ Add row` `Save` `Cancel` `Clear`

### After saving (Excel-like display)

- Takes:
- `FO (R11B)`    `5, 6, 7, 8, 9`
- `MC (R7A)`     `8`

(Same interaction pattern for “Releases:”, but rows default-fill from this team’s own releasing wards.)

## Data model (no DB schema change)

Store these as schedule-level metadata inside `daily_schedules.staff_overrides` under a reserved key (so it’s ignored as a staff UUID):

- `staff_overrides.__bedRelieving.byTeam[team].takes[]`
- `staff_overrides.__bedRelieving.byTeam[team].releases[]`

Row shape:

- `{ label: string; bedNumbersText: string }`

Notes:

- `label` is **always the releasing team+ward** (per your selection), e.g. `FO (R11B)`.
- This is **display-only metadata**; it does not affect bed algorithms.

## Where code changes happen

- UI edit/display:
- `components/allocation/BedBlock.tsx`
- `components/allocation/TeamColumn.tsx` (pass new props into `BedBlock`)
- `app/(dashboard)/schedule/page.tsx` (hold the schedule-level state, load/save it)
- Copy exclusion:
- `app/api/schedules/copy/route.ts` (strip `__bedRelieving` before calling RPC and in JS fallback update)

## Key implementation details

- **Default rows** when entering edit mode:
- Takes rows: group current `bedAllocations` by `(from_team, ward)` where `to_team === team`.
- Releases rows: group current `bedAllocations` by `ward` where `from_team === team`, label becomes `${team} (${ward})`.
- **Original summary tooltip**:
- Computed from current `bedAllocations` (the same source the old UI used).
- **Mismatch warning**:
- Parse bed numbers from `bedNumbersText` by splitting on commas/whitespace and counting numeric tokens.
- Compare against the grouped algorithm counts for that row.
- Show a non-blocking warning UI inline (and optionally a toast later if we want).
- **Auto-grow for long bed lists**:
- Use a `<textarea>` with auto-resize (`onInput` set height to `scrollHeight`) so the Card/grid naturally expands.
- `TeamColumn` already uses `grid-rows-[auto_...]`, so height should expand without special layout hacks.

## Persistence rules

- **Save**: include `__bedRelieving` in the `staff_overrides` payload alongside `__bedCounts`.
- **Load**: extract `__bedRelieving` from persisted `staff_overrides` (similar to `__bedCounts`) and keep it in dedicated state.
- **Copy**: explicitly remove `__bedRelieving` from the `staff_overrides` sent to the target schedule (both RPC and fallback).

## Manual test plan

- Create/open a schedule with bed allocations.
- Click “Takes:” → enter bed numbers → Save schedule → reload page/date → verify persisted.
- Verify mismatch warnings appear when counts differ.
- Copy schedule (full + hybrid) → confirm the target schedule does **not** contain the bed-number notes.