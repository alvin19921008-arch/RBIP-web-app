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

- **Schedule allocation workflow (primary home: schedule page / export):** grid blocks and columns — `TherapistBlock`, `PCABlock`, `BedBlock`, `LeaveBlock`, `CalculationBlock`, `PCACalculationBlock`, `TeamColumn`, `SummaryColumn`, `StaffPool`, `InactiveStaffPool`, `AllocationNotesBoard` (+ `AllocationNotesBoardEditor` / `AllocationNotesBoardReadonly`), `BedCountsEditDialog`, step chrome — `StepIndicator`, `Step2DialogReminder`, drag/DnD helpers — `StaffCard`, `StaffContextMenu`, `DraggingTooltip`, `DragValidationTooltip`, `TeamTransferWarningTooltip`, `SlotSelectionPopover`, `ConfirmPopover`, `TeamPickerPopover`, `PcaAllocationLegendPopover`, buffer flows — `BufferStaffPool`, `BufferStaffCreateDialog`, `BufferStaffConvertDialog`, `BufferSlotSelectionDialog`, team cards — `TeamPendingCard`, `TeamReservationCard`, `TeamAdjacentSlotCard`, dialogs — `Step1LeaveSetupDialog`, **`FloatingPCAConfigDialog*` + `step34ViewModel` → canonical under `steps/step3-floating/` (Phase 5; shims remain in `components/allocation/`)**, `FloatingPCAEntryDialog` (canonical under `steps/step3-floating/substeps/step30-entry-flow/`), `NonFloatingSubstitutionDialog`, `SpecialProgramOverrideDialog`, `SpecialProgramSubstitutionDialog`, `SptFinalEditDialog`, `SharedTherapistEditDialog`, `TherapistEditDialog`, `StaffEditDialog`, `TieBreakDialog`, `ScheduleCopyWizard`, `TimeIntervalSlider`, `Step3ModeExplainerAnimated`, `StaffCardColorGuideContent`, `pcaTracker/*`, `step3V2/*`, `step32V2/*`, and `teamThemePalette.ts`.

- **Imported outside the schedule feature today (shared consumers):** `StaffCardColorGuideContent` (help answer `components/help/answers/StaffCardColorGuideAnswer.tsx`), `BufferStaffConvertDialog` (`components/dashboard/StaffProfilePanel.tsx`). Everything else in the list above is currently reached from schedule UI or from other files under `components/allocation/` only.

- **Still to migrate (follow-up):** remaining schedule-primary allocation tree from `components/allocation/` into `features/schedule/ui/` (likely `steps/`, `dialogs/`, and shared leaf widgets), update `SchedulePageClient` and any cross-imports, and leave thin shims in `components/allocation/` only where non-schedule routes must keep stable deep imports. Resolve the `BedCountsOverrideState` type reference in `lib/features/schedule/controller/scheduleControllerTypes.ts` when dialog UI moves (extract shared types to `lib/` or co-locate with the dialog).
