# Schedule UI (`features/schedule/ui`)

React-only schedule workflow UI: shells under `sections/`, step bodies under `steps/`, dialogs, hooks. Domain logic stays in `lib/features/schedule/` (see workspace architecture rules).

## Tailwind v4 scan

Tailwind picks up classes from this tree via **`app/globals.css`**:

```css
@source "../features/**/*.{ts,tsx}";
```

That line is part of Phase 1 / Phase 2f so utilities used only under `features/` are included in the build.

## Design tokens & UI constraints

- **Step / app tokens:** [`../../../styles/rbip-design-tokens.css`](../../../styles/rbip-design-tokens.css)
- **RBIP UI patterns (tooltips, borders, Step 3 colors):** [`../../../.cursor/rules/design-elements-commonality.mdc`](../../../.cursor/rules/design-elements-commonality.mdc)

Prefer semantic shadcn-style variables (`bg-popover`, `border-border`, `text-muted-foreground`, etc.). **Light-first today:** dark mode is not a product target yet; avoid growing `dark:` surface area unless you are intentionally shipping dual-theme for a component.

## Phase 2f note (this slice)

Token alignment touched **developer diagnostics / timing tooltips** in `sections/SchedulePageHeaderRightActions.tsx` only. **Step 3.2 / 3.3** wizard UI (`components/allocation/*` dialogs) was not edited here.

## Phase 4 — components/allocation inventory

This slice did **not** move `components/allocation/*`; it only records what is schedule-allocation vs reused elsewhere so a later slice can migrate without guesswork.

- **Schedule allocation workflow (primary home: schedule page / export):** grid blocks and columns — `TherapistBlock`, `PCABlock`, `BedBlock`, `LeaveBlock`, `CalculationBlock`, `PCACalculationBlock`, `TeamColumn`, `SummaryColumn`, `StaffPool`, `InactiveStaffPool`, `AllocationNotesBoard` (+ `AllocationNotesBoardEditor` / `AllocationNotesBoardReadonly`), **`BedCountsEditDialog` → canonical under `features/schedule/ui/allocation/` (bed-count types in `@/types/schedule`; shim in `components/allocation/`)**, step chrome — `StepIndicator`, `Step2DialogReminder`, drag/DnD helpers — `StaffCard`, `StaffContextMenu`, `DraggingTooltip`, `DragValidationTooltip`, `TeamTransferWarningTooltip`, `SlotSelectionPopover`, `ConfirmPopover`, `TeamPickerPopover`, `PcaAllocationLegendPopover`, buffer flows — `BufferStaffPool`, `BufferStaffCreateDialog`, `BufferStaffConvertDialog`, `BufferSlotSelectionDialog`, team cards — `TeamPendingCard`, `TeamReservationCard`, `TeamAdjacentSlotCard`, dialogs — `Step1LeaveSetupDialog`, **`FloatingPCAConfigDialog*` → canonical under `steps/step3-floating/` (e.g. `FloatingPCAConfigDialogV2.tsx`; shims in `components/allocation/`)**; **`step34ViewModel` → canonical under `steps/step3-floating/substeps/step34-preview/`**, `FloatingPCAEntryDialog` (canonical under `steps/step3-floating/substeps/step30-entry-flow/`), `NonFloatingSubstitutionDialog`, `SpecialProgramOverrideDialog`, `SpecialProgramSubstitutionDialog`, `SptFinalEditDialog`, `SharedTherapistEditDialog`, `TherapistEditDialog`, `StaffEditDialog`, `TieBreakDialog`, `ScheduleCopyWizard`, `TimeIntervalSlider`, `Step3ModeExplainerAnimated`, `StaffCardColorGuideContent`, `pcaTracker/*`, `step3V2/*`, `step32V2/*`; **`teamThemePalette` → canonical under `features/schedule/ui/allocation/` (shim in `components/allocation/`)**.

- **Imported outside the schedule feature today (shared consumers):** `StaffCardColorGuideContent` (help answer `components/help/answers/StaffCardColorGuideAnswer.tsx`), `BufferStaffConvertDialog` (`components/dashboard/StaffProfilePanel.tsx`). Everything else in the list above is currently reached from schedule UI or from other files under `components/allocation/` only.

- **Step 3.4 preview path parity (this slice — done):** **`step34ViewModel`** is canonical under **`steps/step3-floating/substeps/step34-preview/`** per **`ARCHITECTURE_ESSENTIALS.mdc`**; `components/allocation/` keeps thin shims that re-export the schedule UI implementation (same pattern as other items in the inventory list above).

### Phase 6 status

- **`teamThemePalette`** is canonical under **`features/schedule/ui/allocation/teamThemePalette.ts`**; `components/allocation/teamThemePalette.ts` is a thin re-export shim.
- **`BedCountsEditDialog`** is canonical under **`features/schedule/ui/allocation/BedCountsEditDialog.tsx`**; bed-count override types (`BedCountsOverridePayload`, `BedCountsOverrideState`, `BedCountsWardRow`) live in **`@/types/schedule`**; `components/allocation/BedCountsEditDialog.tsx` re-exports the component and types for backwards compatibility. Domain/controller code types bed overrides via **`scheduleControllerTypes.BedCountsOverridesByTeam`** (uses `BedCountsOverrideState` from `@/types/schedule`).
- **Remaining Phase 6 (planned):** peel the rest of the **Phase 4 inventory** allocation surface into `features/schedule/ui/` per `docs/superpowers/plans/2026-04-11-schedule-ui-lib-separation-plan.md` and the **implementation plan** companion (exit criteria, verification matrix).
