# Changelog (Phase 40+)
#
# This file tracks only the newer phase of changes starting 2026-02-08.
# For older historical reference (project overview / architecture notes / earlier phases), see `CHANGELOG.md`.

## [Unreleased] - 2026-02-17

### Added
- **Step 2.2 SPT dialog UI revamp**: New three-state design (Working/Leave/Off) with conditional field visibility. Replaced binary Enabled toggle with segmented control. Team Assignment Override moved to primary section (no longer in "More options"). Leave type now prominent when "On Leave" state selected. Compact spacing throughout. Simplified card header with status badges. New ToggleGroup and Separator UI components.

### Reverted
- **Step 2.1 UI**: Reverted experimental UI changes; restored original navigation for NonFloatingSubstitutionDialog.

## [Unreleased] - 2026-02-13

### Added
- **Schedule export (mobile)**: On mobile devices, the schedule Export button opens a dropdown with **Download** and **Save as image**. Save as image uses the Web Share API so users can save to Photos or share; falls back to download if share is unavailable. Mobile export uses JPEG (faster) and lower pixel ratio for quicker generation; desktop keeps PNG and one-click export. Button label is now "Export" with icon (no longer "Export PNG").
- **Onboarding and Help Center**: Manual-only guided tours (Driver.js) and text-only FAQ. Help available from Schedule and Dashboard (Help button) and from a dedicated `/help` page (navbar link). Two tours: **Schedule Core** (copy, staff pool, step flow, bed adjustments, summary box, bed relieving, Step 3 interactions) and **Dashboard Admin** (Special Programs, PCA Preferences, SPT Allocations, Sync / Publish). Tour popovers support Previous/Next and step progress (e.g. 6/12) with themed styling; close (X) and Done correctly destroy the tour. FAQ is grouped by category with accordion (details/summary) and category icons (CalendarDays, Building2, LayoutList, Settings). Pending-tour handoff via `localStorage` when starting a tour from `/help` while on another page. Role-gated: admin tour and admin FAQ section visible only to admin/developer.
- **Staff pool & PCA legends**: Added info icons and popovers next to the Staff Pool header and the PCA Allocation section header; the demo cards keep the same width as real staff cards so the floating battery, green substitution, blue bracketed partial slots, and buffer-star suffix all match production visuals.
- **Phase 3.4 algorithm compaction & instrumentation**: Deduped Step 2 special-program assignment logic (shared helper + map-backed allocation lookups), cached floating/ reservation lookups, added Step 2/3 runtime instrumentation, and introduced `tests/smoke/schedule-phase3-4-algo-metrics.smoke.spec.ts` plus supporting `metrics/phase3_4/*.json` snapshots so Step 2 → Step 3 flow is exercised without hitting disabled-step guards.
- **Dashboard Sync / Publish – snapshot date picker**: Replaced the snapshot date dropdown with a calendar date picker (Popover + CalendarGrid). Only dates with a saved `baseline_snapshot` are selectable; available snapshot dates are shown in black (emphasized); popover uses card-style background and border. Normalized date keys from DB for reliable selection.
- **Step 3 extra coverage**: When all teams have met their pending needs, floating PCA allocation keeps filling leftover slots in team-order, labels them as “Extra coverage,” and tags them in `staffOverrides.extraCoverageBySlot` so both the PCA table and cards highlight the purple “Extra” badge. Clearing Step 3 now sanitizes preserved special-program/substitution allocations (stripping Step 3 slots, re-computing `slot_assigned`/`fte_remaining`), while slot counts and pending state stay aligned.

### Changed
- **Snapshot diff (schedule page)**: Alert icon and “Review differences” now use the same semantic check (field-level diff from DB snapshot). Diff is computed deterministically from `daily_schedules.baseline_snapshot` and live config (no TTL cache for this path) so the table and icon stay in sync; staff status changes appear in the diff when snapshot and live differ.
- **Step 2 wizard stepper (2.1 & 2.2)**: Step 2.1 (Non-Floating Substitute) and Step 2.2 (SPT) dialogs now use the same stepper style as Step 2.0: dot separators (·), no border or divider, same chip classes (`mb-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground`). Removed ChevronRight separators and 2.1’s `border-b`, 2.2’s bordered container.
- **Step 3.1 preview help**: “How to read this” now focuses on assigned vs pending counts; the redundant risk sentence was removed so the dedicated scarcity callout stays as the single warning source.
- **Mobile staff-card flow**: Touch sensors now require a brief hold/tolerance so scrolls don’t trigger accidental drags; long-press on cards shows a tiny pulse, suppresses the native iOS callout, and drains pending timers once a drag begins so context menus never stick. Drag overlays on mobile are larger/brighter and travel just below your finger while haptic signals fire whenever the drag passes a new drop zone.
- **Step 2.1 substitutions / leave harness navigation**: Each substitution card now shows the non-floating PCA with a team badge and “Missing slots: 1,2,3…” so the target is clear even when only one team is pending. Applying the Leave Sim Harness “clean” action now marks Step 1 as modified so the Step Indicator allows stepping to Step 2 immediately, and team pickers (move/split) visually disable the source team button while still showing the destination badge.
- **Step 3 UI & PCA calculation help**: Block 6 now has an info popover that spells out the reserved-slot + DRM base-pool math and shows the real per-team balance totals; the Step 3 stepper and CTA buttons (Step 3.1 “Continue…” and Step 3.2 “Assign & Continue / Skip”) dynamically hide unreachable 3.2/3.3 actions, swap to “Run final allocation” when nothing remains, and explain each action in a tooltip so the user never follows a misleading “Continue to 3.2.”
- **Responsive dialog chrome (Step 2 & 3)**: The shared dialog wrapper now respects device width + safe-area insets, the Step 2.1/2.2 footers wrap CTAs instead of stretching full-width, the Step 2.2 “Select SPT” trigger stays slim, helper copy stays concise, and the viewport meta plus `crypto.randomUUID` polyfill keep mobile browsers stable.
- **Drag interaction & scrolling**: DnD auto-scroll is disabled on the main schedule grid and the Step 3 team-order reorder list so touching a card near the edge no longer recenters the board.
- **Phase 3.1 drag refactor**: Completed the drag-state extraction and `useOptimistic` wiring, and removed the temporary DnD instrumentation that was only needed to capture the Phase 3 metrics.

### Added
- **Playwright smoke testing scaffold**: Chromium-only Playwright setup for fast refactor safety gates, including `playwright.config.ts`, `tests/smoke/*`, and npm scripts (`test:smoke`, `test:smoke:headed`, `test:smoke:debug`). Smoke tests prefer localhost dev auto-login and fall back to env credentials when needed.
- **Cursor on-demand smoke skill/rules**: Project skill `.cursor/skills/playwright-smoke-rbip` plus scoped rules (`playwright-smoke-on-demand`, `playwright-config-on-demand`) so smoke-test guidance is loaded only when editing smoke test/config files (token-efficient).
- **Phase 2.1 – PCA allocation off main thread**: Web Worker adapter for heavy PCA allocation (`lib/features/schedule/pcaAllocation.worker.ts`, `pcaAllocationEngine.ts`, `pcaAllocationWorkerTypes.ts`). Request/response shape unchanged; optional env flags `NEXT_PUBLIC_SCHEDULE_PCA_WORKER` and `NEXT_PUBLIC_SCHEDULE_PCA_WORKER_SHADOW_COMPARE`; sync fallback when worker is disabled or fails.

### Changed
- **Refactor plan (Phase 2)**: Added Phase 2 high-ROI refactor plan and smoke test gates; virtualization was downgraded to a conditional, profiler-triggered item (deferred by default).
- **Phase 2.2 – Single allocation authority**: Removed legacy page-level full allocation path from schedule page; controller step runners are the only place that run therapist/PCA/bed algorithms. Staff-edit flow no longer triggers in-page full allocation; Step 2/3/4 run only via controller and step UI.
- **Phase 2.3 – Algorithm hot-path indexes**: Precomputed maps/indexes in PCA allocation (team preference by team, special program by id, pca pool by id, allocation by staff_id) to replace repeated `find`/`filter` in hot loops; decision order and tie-break behavior unchanged.
- **Phase 2.4 – React 19 concurrency**: `useTransition` for non-urgent step and date transitions (next/previous step, step click, date change); `useDeferredValue` in StaffPool for filter-heavy derived lists (rank filter, FTE filter, staff/overrides/allocations) so UI stays responsive during filter changes.
- **Login debug/test pages**: React hooks (useState, useEffect, useToast) moved above early returns so hook order is stable (fixes rules-of-hooks lint errors).
- **TherapistBlock**: `staffOverrides` prop type extended with `sptOnDayOverride.displayText` for SPT display text.
- **TimeIntervalSlider**: Document listener callbacks use `globalThis.MouseEvent` to fix React vs DOM MouseEvent type mismatch in build.
- **PCA allocation worker**: Worker scope typed without `DedicatedWorkerGlobalScope` for build compatibility.

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
