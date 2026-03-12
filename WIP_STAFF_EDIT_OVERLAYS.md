# WIP — Staff Edit Dialog: Special Program & SPT Overlay / Navigation

**Last Updated**: 2026-03-06  
**Status**: SPT overlay **DONE**. Special Program overlay **DONE**. Unified Layer 1 save flow **DONE**.

---

## Achieved: SPT Overlay

The SPT overlay is implemented and uses a Mission Control–style layered UI.

### What was done

1. **Reusable Layer 2 sheet** (`StaffEditOverlaySheet.tsx`)
   - Centered slide-in panel; `createPortal` to `document.body`
   - Participates in `__rbip_dialog_stack__` for Escape-key handling
   - z-index: outer `z-[60]`, panel `z-[61]`

2. **SPT wrapper** (`StaffEditDialogSPTOverlay.tsx`)
   - Hosts `SPTAllocationForm` in the sheet
   - Overlay `Save` now stages draft changes back to Layer 1 instead of writing directly to Supabase

3. **Staff Edit Dialog integration**
   - SPT section replaced with a **preview card** (clickable) that opens the overlay
   - Preview text: Specialty, RBIP Supervisor ★, Teams ("All teams" when all selected), Days ("All weekdays" when all selected)
   - New and existing SPT staff can open Layer 2 before final save
   - When overlay is open: Layer 1 slides left to a sliver; edge tab on the left returns to staff edit

4. **Layer 2 Select fix**
   - Radix `SelectContent` uses `z-[80]` so dropdowns render above the sheet (was `z-50`)

5. **SPT form polish**
   - Inline Confirm/Cancel for weekday Remove
   - Label: "Display text on staff card on schedule page when FTE=0:"

### Files

- `components/dashboard/StaffEditOverlaySheet.tsx` — reusable Layer 2 sheet
- `components/dashboard/StaffEditDialogSPTOverlay.tsx` — SPT overlay content
- `components/dashboard/StaffEditDialog.tsx` — Layer 1 staging, SPT preview, edge tab
- `components/dashboard/SPTAllocationPanel.tsx` — exports `SPTAllocationForm`
- `components/ui/select.tsx` — `SelectContent` z-index set to `z-[80]`

---

## Animation Pipeline (Layer 1 & Layer 2)

**Use the same pipeline for the Special Program overlay.** New agents should replicate this behaviour.

### Layer 1 (Staff Edit Dialog) when Layer 2 is open

| Concern | Implementation |
|---------|----------------|
| **Slide-out** | `useLayoutEffect` + `requestAnimationFrame` measures `dialogRef.current.getBoundingClientRect()`, computes `delta = -(rect.left + rect.width - sliverPx)` where `sliverPx = 28`, sets `stageX` |
| **Transform** | `style={{ transform: \`translate3d(${stageX}px, 0, 0)\` }}` |
| **Transition** | `transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1)]` |
| **Dimming** | `brightness-[0.92] saturate-[0.85] contrast-[0.95]` (opaque, no opacity/backdrop-blur) |
| **De-emphasis** | `pointer-events-none` |
| **Height** | `h-[calc(100dvh-24px)] max-h-none overflow-hidden` so the sliver is full-height (Mission Control–style) |
| **Preview state** | When `overlayOpen`: show truncated summary (name, rank, status, team, programs); hide full form with `className={overlayOpen ? 'hidden' : undefined}` so form stays mounted |
| **Edge tab** | `createPortal` a fixed button at `left-0 top-1/2 -translate-y-1/2 z-[70]`, `h-40 w-10`, `rounded-r-xl`, vertical text (`[writing-mode:vertical-rl] rotate-180`), "Edit staff · {name}" |

### Layer 2 (Overlay sheet)

| Concern | Implementation |
|---------|----------------|
| **Backdrop** | `fixed inset-0 z-[60]`, transparent hit-area; click/touch on backdrop closes sheet |
| **Panel** | `z-[61]`, `max-w-xl`, `max-h-[90vh]`, `overflow-hidden` |
| **Framer Motion** | Wrapper: `initial={{ opacity: 0 }}` → `animate={{ opacity: 1 }}` → `exit={{ opacity: 0 }}`, `duration: 0.18`, `ease: [0.2, 0.9, 0.2, 1]` |
| **Panel slide** | `initial={{ x: 240, opacity: 0 }}` → `animate={{ x: 0, opacity: 1 }}` → `exit={{ x: 240, opacity: 0 }}`, `type: 'tween'`, `duration: 0.28`, same easing |
| **Portal** | `createPortal(..., document.body)` |
| **Escape** | Sheet participates in `__rbip_dialog_stack__`; Escape closes only top-most overlay |
| **Select menus** | Ensure `SelectContent` has `z-[80]` so dropdowns render above the sheet |

### Easing

Use `cubic-bezier(0.2, 0.9, 0.2, 1)` for macOS-style slide transitions.

---

## Achieved: Special Program Overlay

The Special Program overlay is now implemented on top of Layer 1 of the staff edit dialog, using the same Mission Control–style staging pattern as SPT.

### What was done

1. **Generalized Layer 1 overlay state**
   - `StaffEditDialog.tsx` now supports both overlay types through one active overlay state instead of an SPT-only boolean
   - Layer 1 sliver, dimming, hidden-but-mounted form, and left edge tab are shared by SPT and Special Program overlays

2. **Special Program Layer 2 wrapper**
   - New `StaffEditDialogSpecialProgramOverlay.tsx`
   - Staff-scoped editor for one program + one staff member only
   - Overlay `Save` now stages draft changes back to Layer 1 instead of writing directly to Supabase

3. **Layer 1 preview cards**
   - In the Special Program section, each selected program now gets its own preview / trigger card
   - Card shows configured vs not configured state using the grouped weekday / slot / FTE summary
   - Card copy now uses concise draft-state text: `Pending until Save.`

4. **Summary sync**
   - `StaffEditDialog.tsx` owns the staged Layer 2 drafts for both SPT and special programs
   - Saving inside the overlay updates the corresponding Layer 1 card immediately, but DB persistence happens only when Layer 1 `Save` is clicked

### Scope decisions implemented

- **Unified draft model**: both new and existing staff use the same draft-only Layer 2 flow
- **Single final save**: Layer 2 `Save` commits into Layer 1 draft state; DB persistence happens only on Layer 1 `Save`
- **Staff-scoped editor**: does not expose the full dashboard-wide program editor inside staff edit
- **Dismiss protection**: backdrop click and `Escape` no longer dismiss the main dialog or the overlay sheet

### Related files

- `components/dashboard/StaffEditDialog.tsx` — generalized overlay host + special-program cards
- `components/dashboard/StaffEditDialogSpecialProgramOverlay.tsx` — new Layer 2 special-program editor
- `components/dashboard/StaffEditOverlaySheet.tsx` — reused as-is
- `components/dashboard/StaffEditDialogSPTOverlay.tsx` — unchanged pattern reference
- `tests/smoke/dashboard-staff-edit-special-program-overlay.smoke.spec.ts` — targeted smoke coverage

---

## Validation Checklist

Run through these manually in `Dashboard > Staff Profile`:

1. **New staff → special program Layer 2 is available**
   - Click `Add New Staff`
   - Tick one special program
   - Confirm a new card appears for that program (for example `CRP configuration`)
   - Confirm the card is clickable immediately
   - Confirm the helper text is the concise reminder `Pending until Save.`

2. **Special program Layer 2 opening behavior**
   - Click the program card
   - Confirm Layer 1 slides left into a sliver
   - Confirm the left edge tab appears
   - Confirm the overlay title names both the program and the staff member
   - Confirm clicking outside the sheet does **not** dismiss it
   - Confirm pressing `Escape` does **not** dismiss it

3. **Special program draft staging**
   - In Layer 2, enable one or more weekdays
   - Select slots and enter FTE
   - Click `Save`
   - Confirm the overlay closes and the Layer 1 card preview updates immediately
   - Confirm the parent dialog is still open
   - Confirm the card still says `Pending until Save.`

4. **SPT draft staging**
   - Create a new SPT staff draft or open an existing SPT staff member
   - Open the `SPT allocation` overlay
   - Confirm the overlay is available before the final Layer 1 save
   - Confirm the helper text is `Pending until Save.`
   - Make a small edit and click `Save`
   - Confirm the Layer 1 SPT card preview updates without closing the parent dialog

5. **Single final save for new staff**
   - From `Add New Staff`, stage one Layer 1 change and one Layer 2 change
   - Click the main dialog `Save`
   - Reopen that new staff member
   - Confirm the regular staff fields persisted
   - Confirm the special-program / SPT draft data persisted under the saved staff row

6. **Single final save for existing staff**
   - Open an existing staff member
   - Stage one Layer 1 change and one Layer 2 change
   - Click the main dialog `Save`
   - Reopen the same staff member
   - Confirm both Layer 1 and Layer 2 edits persisted

7. **Main dialog dismissal protection**
   - Open `Add New Staff` or edit an existing staff member
   - Click outside the main dialog
   - Confirm the dialog stays open
   - Press `Escape`
   - Confirm the dialog stays open
   - Use the explicit `Cancel` / `X` controls and confirm they still close the dialog

### Automated verification already run

- `npm run test:smoke -- tests/smoke/dashboard-staff-edit-special-program-overlay.smoke.spec.ts`
- `npm run lint`
- `npm run build`
- `npm run test:smoke:headed -- tests/smoke/dashboard-staff-edit-special-program-overlay.smoke.spec.ts`
