# Changelog (Phase 40+)
#
# This file tracks only the newer phase of changes starting 2026-02-08.
# For older historical reference (project overview / architecture notes / earlier phases), see `CHANGELOG.md`.

## [Unreleased] - 2026-02-08

### Added
- **Schedule Save button (ScheduleSaveButton)**: Reusable save button with loading state (spinner + sweep/glow animation), brief success state (check + “Saved”), then resting “Saved” with Save icon. Green background retained for dirty/saving/success; single component used in all schedule header instances.
- **Undo / Redo for manual schedule edits**: Multi-step Undo and Redo for user-driven changes only (DnD slot transfer/discard, context-menu slot actions, Step 1 leave/FTE edits, Step 4 bed-relieving notes, bed count overrides, staff card color, therapist move/discard/split/merge). History is cleared on date change and when running Step 2/3/4 algorithms or step-clear actions, so algorithm runs are not undoable. Undo and Redo buttons appear next to the Display controls (and in split-mode header); keyboard shortcuts: Cmd/Ctrl+Z (Undo), Cmd/Ctrl+Shift+Z or Ctrl+Y (Redo), with input/contenteditable guard so text fields keep native undo.
- **UI_WIZARD_DIALOG_HEADER_DRAFT.md**: Visual/copy draft for Step 2 and Step 3 wizard dialog headers (short titles, meta row, stepper chips).
- **Schedule copy (setup-only)**: Copy always drops SPT therapist allocations and SPT-FTE; bed allocations and calculations are not copied (workflow requires re-running Step 2–4). Full copy option removed; wizard offers “Copy setup (recommended)” only.
- **DND floating PCA popover**: When a multi-slot floating PCA is dropped onto a team, the slot-selection popover shows the inferred target team as a badge, with ✓ Confirm / ✕ Cancel (hybrid mode). Multi-slot drag-to-discard now uses the same confirm/cancel pattern (tick/cross) instead of drag-only.
- Password visibility toggle on the login page.
- Localhost-only developer auto-login endpoint for local/dev environments.
- Leave Sim controls for Step 2.2 (SPT Final Edit) and Step 3 allocation mode (standard/balanced).
- Table view for “Saved setup snapshot” differences (saved snapshot vs current dashboard).

### Changed
- **Step-wise workflow**: Step buttons 2–4 are clickable after editing staff leave/FTE in Step 1 (no longer require clicking “Next” first).
- **Step 2.0 Special Program Override**: Therapist and PCA selection use in-place Radix-style dropdowns (Select) instead of a separate selection box after “Edit”.
- **Step 2.0 Special Program Override (special program PCA coverage)**: Special program required slots are treated as the source of truth and can be covered by **multiple PCAs** (slot-atomic). The dialog supports partial-FTE/partial-slot availability, a hybrid “find one PCA to cover all remaining slots → else slot-by-slot” substitution flow, streamlined per-slot coverage display (PCA name under slot button with hover-only remove), and dialog-level scrolling for long days.
- **Step 2.1 Non-Floating PCA Substitution**: Team name in dialog title and navigation shown with a badge; added two more color theme sets. Revamped selection grid header now shows non-floating name in caption, FTE + missing slots inline. Covered status replaces paragraph with minimalist animated icon inline. Navigation buttons unified: footer always holds confirm action; no duplicate Next/Confirm in header. CTA button style refreshed (hover: gentle lift & soft sheen, no aggressive scale/glow).
- Schedule cold-load now resolves the initial schedule date before rendering (prevents “today → last schedule” flicker).
- “Leave edit + draft” in Leave Sim auto-scrolls to draft patches and shows a larger draft viewport.
- “Saved setup snapshot” wording clarified to explicitly compare saved snapshot → current dashboard.
- **Wizard dialog headers (Step 2 & 3)**: Short action titles, meta row (Step X.Y · context), and stepper chips (2.0 Programs · 2.1 Substitute · 2.2 SPT; 3.1 Adjust · 3.2 Preferred · 3.3 Adjacent). Step 3 stepper uses dot separators (aligned with Step 2). Step 3.2/3.3 instruction text shortened for readability.
- **Step 2.0 Special Program Override**: Horizontal carousel dot markers disabled; left/right arrows remain. Step 2.0/2.1/2.2 dialogs use consistent stepper chip layout.
- **Saved setup snapshot diff table**: Repeated “Item” collapsed per group (rowSpan); column widths rebalanced (colgroup) so Item/Field are narrower and Saved/Dashboard columns get more space, reducing horizontal scroll and truncation.
- **Step 2.2 SPT dialog (scan-first cards)**: Card header shows summary chips (On/Off, Leave badge when applicable, Slots, FTE, Team); Slots/Team chips and Manual team override hidden when SPT disabled or on forced-leave. Primary section: Enabled, conditional Contribute FTE, AM/PM slot groups with inline AND/OR only when needed. Leave type VL/SDO/TIL/sick leave auto-maps leave cost to dashboard base FTE and forces SPT off (Option A); clearing leave restores dashboard baseline. Disabling SPT clears team override and auto-opens “More options” with scroll to Leave. FTE chip shows single value or “—”; “Slot display / effective slots” and baseline moved into collapsible “Baseline & details”. Header: Step 2.2 as plain text (no badge), “How this works” details block removed.
- **Display toolbar (View / Split / Undo / Redo)**: Stronger contrast for enabled vs disabled (slate-700/300 resting; disabled much lighter). Hover uses distinct background (slate-200/80) without text color shift.
- **Copy schedule wizard**: Instruction shortened to “SPT allocations are not copied.” “Detected buffer staff” section and “Keep buffer staff…” checkbox shown only when buffer staff is detected on the source date; when none, section is hidden.
- **Schedule page refactor**: Shared Supabase fetch for snapshot-diff inputs (`lib/features/schedule/snapshotDiffLiveInputs.ts`) with TTL and in-flight dedupe; Config Sync panel and schedule page use it. Split reference controller and reference pane mount only in split mode to reduce non-split load. Startup dialog prefetch limited to staff edit, copy wizard, and calendar; step/hover prefetch unchanged.

### Fixed
- **Slot selection popover**: Hint text (“Default target” + team badge) no longer truncates; footer uses a stacked layout so the hint wraps and tick/cross buttons sit on the next line.
- **Step 2.0 Special Program Override dialog** now preselects therapist and PCA slots from dashboard config when no prior Step 2 overrides exist. Editing a staff member in Step 1 (leave/FTE or "A/v during special program") clears Step 2-only override keys (`specialProgramOverrides`, `substitutionFor`, etc.) so the dialog re-seeds from dashboard (e.g. CRP therapist and correct weekday slot) instead of reusing stale selections.
- PCA Dedicated Schedule table labeling for non-floating PCAs (“主位”) and substitution (“替位”) display.
- Sticky first column right divider visibility during horizontal scroll.
- Refresh icon tooltip uses app tooltip styling and spins once on hover.
- Dashboard no longer shows misleading “no access/no sections” message while permissions are still loading.
- Leave Sim: PCA `fteRemaining` is derived from ticked available slots (invalid slot reduces remaining FTE accordingly).
- Time interval slider supports click-to-jump (in addition to dragging).
- **Duplicate SPT cards in therapist block**: When Step 2.2 was skipped (or on Step 2 reruns), the same SPT could appear twice. The therapist allocation algorithm now skips SPT in the default team-assignment phase (Step 4) so SPTs are only created in the dedicated SPT phase (6a/6b); Phase 6a has a safety guard to never emit a second allocation per staff; Step 2 controller and allocation sync defensively dedupe SPT by staff_id before setting state.
- **Hydration error in Step 2.2 (SPT Final Edit) dialog**: Console error "div cannot be a descendant of p" was caused by `Badge` rendering a div inside `DialogDescription` (a p). `Badge` now renders a span so nesting is valid and the hydration warning is gone.
- **PCA block card display on step change**: Non-floating PCA (e.g. 婉儀) no longer flips to “Whole day” when switching to Step 2 before running the algorithm; slot display consistently uses `staffOverrides.availableSlots` across steps. Floating PCA substitution label order preserved (e.g. “0900-1030, PM” with PM in green, no reorder to “PM, 0900-1030”).
- **Therapist card overflow (Step 2.2)**: Long FTE strings (e.g. “0.5 AM + 0.25 PM”) wrap in the card header instead of overflowing; right-side FTE uses `max-w-[60%]`, `whitespace-normal`, `break-words`.
- **Step 2.2 Simplify/Detail button**: Small swap icon (ArrowLeftRight) added next to “Simplify”/“Detail” to indicate toggle.
- **Step 3.1 scarcity callout**: Duplicate “Preview (Standard if run now)…” line removed; copy streamlined (trigger/today/shortage in separate lines; “slack” removed to avoid redundancy with shortage).
- **Reference pane**: Changing reference date no longer restarts load repeatedly (effect keyed by ref date only; ref-stable actions and in-flight guard prevent thrash). Collapse/expand is faster by not rendering reference portal content when collapsed.
