# V2 Scarcity And Tracker UI Polish Design

Status: approved for implementation, updated after failed tooltip remediation attempt

Date: 2026-04-10

Owner: chat-approved with user

## Summary
This spec locks the approved UI polish decisions for the V2 ranked-slot Step 3 dialog and the team allocation tracker tooltip.

Scope is intentionally narrow:

- fix the V2 Step 3.1 scarcity preview presentation
- keep the preview V2-specific, not shared with V1
- polish tracker wording so V2 reasoning is clearer without leaning on old `C1/C2/C3` framing
- remedy the accidental contamination of the legacy V1 tooltip by restoring the intact V1 style and separating V1/V2 presentation
- remedy the failed first tooltip split by making V2 a standalone implementation rather than a modified legacy renderer

This spec does not redesign the underlying V2 engine or tracker schema.

## Scope

### In scope
- Step 3.1 scarcity preview in `FloatingPCAConfigDialogV2`
- tracker copy and compact layout in the PCA team hover tooltip
- wording decisions for slot-state language
- restoring the intact V1 tooltip style and splitting V1/V2 tooltip rendering
- adding the minimum tracker/header data needed so V2 can show pre-final-allocation rounded pending correctly

### Out of scope
- V1 dialog UI redesign
- changing V2 repair logic
- broader end-user terminology rewrite beyond the approved copy adjustments here

## Locked Product Decisions

### 1. V2-only scarcity preview
The Step 3.1 scarcity preview is a V2-ranked-slot dialog feature.

- It is not a shared V1/V2 component.
- It should reflect the V2 preview result produced inside the V2 Step 3.1 path.

### 2. Hide scarcity preview when clear
If the V2 Step 3.1 preview detects no scarcity signal, the scarcity section should not render.

- Do not replace it with a success banner.
- The dialog should simply continue with its normal instructions and team lane.

### 3. Side-by-side scarcity summary
When scarcity exists, the preview should show two side-by-side outcome summaries separated by a divider:

- `No floating PCA if run now`
- `Still short after allocation`

Each side should be readable at a glance:

- short label
- count
- affected teams

The intent is quick comparison, not a card-heavy analysis block.

Refinement after implementation review:

- the two outcome summaries should read as one compact cluster
- do not let each side stretch to half the modal width
- prefer a content-width row, visually closer to the approved mock, rather than full-width `1fr | divider | 1fr`
- divider and spacing should separate the two outcomes without pushing their text far apart

### 4. Scarcity styling
When shown, the scarcity preview may use warning styling, but it must remain subtle.

- Use the normal dialog surface background as the base.
- Add only a very light amber tint and/or border emphasis.
- Do not use a dark mock-specific navy surface.
- Do not let the scarcity numbers steal focus from the main team lane.
- keep the warning emphasis mostly at the container level; inner divider and inner lines should be lighter still

### 5. Scarcity chips
Keep supporting metadata minimal.

- Do not repeat that this is the ranked-slot engine preview inside the V2-specific dialog.
- Hide any `Projected extra coverage` chip when the value is `0`.

### 6. Tracker framing
The hover tracker should present V2 reasoning as a compact review surface, not a large card stack.

- Keep it flatter and denser than the current mock v1-style tooltip.
- Avoid making it feel like a standalone analysis panel.
- It exists to help review why the allocator produced the final sheet outcome.

### 6a. Remedy for V1 tooltip contamination
The current implementation partially blended V2 wording into the legacy tooltip path. This is not the approved direction.

Approved remedy:

- restore the intact V1 tooltip style from the pre-remedy `PCABlock.tsx` history
- treat that legacy tooltip as the preserved V1 presentation
- do not retrofit V2 summary language into the V1 tooltip
- keep V1 terms such as `C1 / C2 / C3`, legacy cycle order lines, and legacy AM/PM + gym summary exactly in the V1 presentation path unless a separate future V1 spec changes them

Stronger remedy after the failed remediation attempt:

- do not continue iterating on the current mixed tooltip implementation
- restore the exact legacy V1 tooltip block from git history first, then build V2 separately
- if needed, place V1 and V2 tooltip UI in separate standalone files rather than branching deep inside one large render block
- the recovery priority is correctness of separation, not minimizing file count

Implementation direction:

- split tooltip rendering into two branches:
  - legacy V1 tooltip renderer
  - dedicated V2 tooltip renderer
- choose the renderer using the same Step 3 flow/version context as the dialog choice when available
- only use tracker-metadata heuristics as a fallback, not as the preferred product contract

### 6b. V2 tooltip must be a dedicated layout
The V2 tooltip should not be implemented as the V1 grouped-by-PCA tooltip with V2 labels pasted into the same line structure.

Approved rule:

- V2 gets its own dedicated layout
- V2 layout should follow the compact review pattern approved in the mock
- V2 layout should remain flatter and denser than the mock cards, but still structurally distinct from the V1 grouped-text tooltip

Stronger implementation direction after the failed remediation attempt:

- prefer a dedicated `V2TrackerTooltip` renderer/component over adding more conditional branches inside the legacy renderer
- prefer a dedicated `V1TrackerTooltip` renderer/component if that makes restoration from git clearer and safer
- shared helper/model code is acceptable, but V1 JSX and V2 JSX should not be interleaved line-by-line
- the approved visual reference remains the V2 tooltip portion of `v2-scarcity-tracker-mockup-v3.html`

### 7. Avoid `C1/C2/C3` as primary V2 language
Do not use old cycle-first wording as the main explanation for V2 tracker rows.

The tracker should still expose the currently useful V2 review concepts:

- `draft`
- `repair`
- `extra coverage`
- `repair reason`
- ranked-slot fulfillment
- slot-path wording
- repair audit issues at team-summary level

Clarification:

- this restriction applies to the V2 tooltip only
- V1 keeps the legacy cycle-first language

Additional clarification after failed implementation review:

- V2 should not show legacy star markers such as `★PCA` or `★Slot`
- V2 should not mix legacy preference signals with V2 tags in the same assignment sentence
- V2 should rely on dedicated V2 concepts such as source tags, tier tags, slot-path wording, ranked-slot fulfillment, repair reason, and repair audit issues

### 8. Slot-state wording
Lock the approved wording change:

- avoid `open`
- avoid `no floating PCA yet`
- prefer `unassigned`

Approved copy:

- `Ranked slot with no floating PCA yet` -> `Ranked unassigned slot`
- `Unranked non-gym slot with no floating PCA yet` -> `Unranked non-gym unassigned slot`

Rationale:

- `open` is ambiguous
- `no floating PCA yet` is clear but clumsy
- `unfilled` risks mixing slot-state and team-state
- `unassigned` is shorter and precise enough for the tooltip

### 9. Tracker header metadata
The compact tracker header should include the team's rounded pending value.

Example shape:

- team name
- mode
- queue position if available
- rounded pending

This header shape is for the V2 tooltip path only.

Critical clarification after failed implementation review:

- `Rounded pending` for the V2 tooltip means the pre-Step-3.4 rounded pending value
- this is the pending value after Step 3.2 and Step 3.3 committed assignments have been applied, but before final Step 3.4 allocation runs
- do not show the post-Step-3 leftover pending in this header
- if the current UI state does not preserve that value, add the minimum tracker/header field needed so it survives rendering and reload paths

### 10. V2 tooltip should follow the approved photo/mock structure
The current compact text-list implementation is not considered equivalent to the approved V2 review layout just because it surfaces the same data.

Approved structure for V2 tooltip:

- header with title, metadata line, and optional review badge
- compact summary grid for total, 3.4 mix, best ranked slot, and status
- repair-issue strip when defects exist
- flat assignment rows with tags and 2-3 compact detail cells

This does not require pixel-perfect duplication of the mock, but it does require the same structural reading pattern.

## Copy Direction

Use operational, lightly technical review language for now.

- Keep `draft / repair / extra coverage` visible because V2 is still under validation.
- Replace awkward engine phrasing with shorter review wording where possible.
- Replace `Committed before Step ...` with `Assigned before final allocation`.

## Intended File Areas

- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `components/allocation/PCABlock.tsx`

Potential supporting logic only if needed:

- helper formatting for tracker labels
- helper booleans for scarcity-preview visibility and optional chip rendering
- helper/model shaping for V1 tooltip vs V2 tooltip inputs
- minimum tracker metadata required for pre-Step-3.4 rounded pending

## Verification Notes

Implementation should verify:

- Step 3.1 V2 dialog hides the scarcity section entirely when both scarcity counts are zero
- Step 3.1 V2 dialog shows side-by-side scarcity outcomes when any scarcity exists
- Step 3.1 V2 dialog keeps the two scarcity outcomes visually close together rather than stretched across the modal
- scarcity styling uses the app dialog surface, with only subtle amber emphasis
- tracker wording uses `unassigned` terminology instead of `open`
- V2 tracker header includes pre-Step-3.4 rounded pending, not post-allocation leftover pending
- V1 tooltip presentation is restored to the intact legacy style
- V2 tooltip presentation is rendered through its own dedicated layout, not by mutating the V1 grouped-line tooltip
- V2 tooltip does not show legacy `★PCA / ★Slot` markers or other V1-first phrasing
- V2 tooltip structurally follows the approved mock/photo reading pattern rather than a single text-list fallback
- tooltip remains compact after the V2 wording changes
