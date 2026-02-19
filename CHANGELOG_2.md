# Changelog (Phase 40+)
#
# This file tracks only the newer phase of changes starting 2026-02-08.
# For older historical reference (project overview / architecture notes / earlier phases), see `CHANGELOG.md`.

## [Unreleased] - 2026-02-19

### Added
- **GifViewer component**: Expandable GIF viewer for help center FAQ answers. Ghost button overlay on thumbnails opens centered modal with backdrop blur; max-width 560px for optimal 720p viewing.
- **Access context provider**: Server-side role fetching in dashboard layout eliminates "flash" of admin-only features. `AccessProvider` wraps authenticated routes with initial role/settings from server; `useAccessControl` uses context as initial state.
- **Snapshot reminder FAQ**: Detailed answer explaining yellow alert icon, which categories are compared (staff profile, team config, ward config, special programs, SPT allocations, PCA preferences), and admin sync/publish actions.

### Changed
- **Layout width constraints**: Responsive min-width (`1024px` → `1280px` lg → `1440px` xl) and max-width capped at `1600px` via CSS variable `--rbip-app-max-width`. Root container uses `mx-auto` for centering on ultra-wide screens.
- **StaffCardColorGuideAnswer**: Removed yellow background when displayed in help center; uses neutral card styling. Content colors use semantic `text-foreground`/`text-muted-foreground` for both popover and help center contexts.
- **Schedule copy performance & resilience**: Copy now prefers the DB RPC path (`rpc:yes`), skips baseline rebase when the source snapshot head matches current Global, and surfaces RPC/rebase diagnostics (including `rpcError`) in the developer timing tooltip. Added atomic long-term RPC `copy_schedule_with_rebase_v1` (copy + rebase in one transaction) with graceful fallback when unavailable.

### Fixed
- **Mobile navbar width**: Navbar now has `min-w-[1024px]` to match dashboard layout, preventing content overflow on narrow screens.
- **Step 3.1 team order horizontal scroll**: Added visible thin scrollbar on mobile for the team order drag area.
- **Copy landing step & UX cues**: After copy-to-new-day, Step Indicator lands on Step 1 (Leave & FTE). Date highlight and “Leave setup” CTA pulse are now synchronized on the same “arrival” trigger and share one duration constant.

## [Unreleased] - 2026-02-17

### Added
- **Step 2.2 SPT dialog custom leave types**: When leave type is "others", dialog now shows a custom text input field that preserves the custom leave description from Step 1. Custom text is displayed in the leave badge and saved as the actual leave type.
- **Step 2.1 streamlined layout**: Removed outer border boxes, consolidated header to single row (PCA name + team badge + missing slots), removed redundant table caption. Added visual hierarchy with horizontal dividers instead of nested containers.
- **StaffEditDialog SPT FTE visualization**: Added minus (−) and equals (=) symbols between FTE fields to show equation relationship (FTE − FTE Cost = FTE Remaining). Added instruction text for SPT leave edit.
- **Step 1 leave setup wizard**: Added a multi-stage dialog that builds the leave draft list, keeps therapist and PCA edits separate, supports quick search/picker interactions, and previews exactly which staff have leave before saving; the draft list now only surfaces staff with a non-on-duty leave type.
- **Help-focused GIF assist**: Step 2.0 help popover now shows the animated “step 2 PCA cover” clip, and FAQ answers for the summary info box, Staff Pool, and contextual actions render matching GIFs via the shared `helpMedia` helper. Added `scripts/upload-help-media.mjs` + `npm run blob:upload-help-media` so you can batch-upload the clips to Vercel Blob and keep `NEXT_PUBLIC_HELP_MEDIA_*` URLs in sync. This helper and script now include new SHS/student adjustments and saved snapshot diff clips for the Beds and Snapshot FAQ answers.

### Fixed
- **SpecialProgramOverrideDialog slot re-selection bug**: Fixed issue where deselecting and reselecting a slot would show it as "uncovered" even though the primary PCA could cover it. Now auto-assigns primary PCA to re-added slots.
- **SPT leave state sync in Step 2.2**: SPTs with any non-on-duty leave type now correctly display as "leave" state in Step 2.2 dialog.
- **Step 2.0 multi-slot coverage helper**: The “Cover remaining slots” helper now stays visible even when all slots are covered, and the dropdown lists the primary/used PCAs so you can reassign without reopening the dialog.
- **Help center / tour guidance polish**: Step 1/2/3 help icons now live in dialog headers, the Help Center dialog closes via overlay or Esc, tours/faqs became context-aware (Dashboard vs Schedule), and FAQ answers now reference the shared staff-card color guide + detailed Sync/Publish help.

### Changed
- **StaffEditDialog AM/PM selection**: Removed AM/PM selection for SPT rank; now only available for RPT and APPT therapists.
- **Step 2.2 SPT dialog spacing**: Reduced vertical padding in "Add SPT" section (py-4 → py-2), increased card title size (text-base → text-lg), tightened card content spacing (pt-3 → pt-2, space-y-3 → space-y-2).
- **Step 1 leave setup mobile polish**: Footer buttons now share the Step 2 sticky layout so they stay manageable on narrow viewports; bulk action labels shorten to “Apply”/“Clear” on mobile, the therapist/PCA lists can scroll without clipping, and the footer button row doesn’t push the entire dialog to full width.  
- **Step 2.1 substitution confirmation spacing**: “All missing slots are covered” now stays close to the footer divider and the callout sits nearer the footer line without extra blank space, helping it line up with the sticky button row.
- **Desktop canvas alignment**: Dashboard content and navbar now share one `--rbip-app-max-width` (1440px) so the layout and header stay centered without varying widths on different components.

### Added
- **Step 2.2 SPT dialog UI revamp**: New three-state design (Working/Leave/Off) with conditional field visibility. Replaced binary Enabled toggle with segmented control. Team Assignment Override moved to primary section with all 8 teams available. Leave type now prominent when "On Leave" state selected. Card header shows Slots (e.g., "1, 2"), FTE, and Team badges. FTE simplified/detail toggle when 3 slots (0.75 FTE). Compact spacing throughout. New ToggleGroup and Separator UI components.

### Reverted
- **Step 2.1 UI**: Reverted experimental UI changes; restored original navigation for NonFloatingSubstitutionDialog.

### Changed
- **Legacy schema fallback removal**: Dropped the old `select('*')` / missing-column fallbacks across the schedule controller, gateway helpers, history page, copy route, and buffer-staff route now that the Supabase schema includes all modern columns (`status`, `buffer_fte`, `team_assignment_portions`, `config_by_weekday`, `base_average_pca_per_team`, `expected_beds_per_team`, `required_pca_per_team`, etc.). Added `supabase/verify_modern_schema_pre_legacy_cleanup.sql` so future cleanups can verify DB compatibility before pruning fallbacks.

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
