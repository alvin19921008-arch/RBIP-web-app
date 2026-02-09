# Changelog (Phase 40+)
#
# This file tracks only the newer phase of changes starting 2026-02-08.
# For older historical reference (project overview / architecture notes / earlier phases), see `CHANGELOG.md`.

## [Unreleased] - 2026-02-08

### Added
- **Schedule copy (setup-only)**: Copy always drops SPT therapist allocations and SPT-FTE; bed allocations and calculations are not copied (workflow requires re-running Step 2–4). Full copy option removed; wizard offers “Copy setup (recommended)” only.
- **DND floating PCA popover**: When a multi-slot floating PCA is dropped onto a team, the slot-selection popover shows the inferred target team as a badge, with ✓ Confirm / ✕ Cancel (hybrid mode). Multi-slot drag-to-discard now uses the same confirm/cancel pattern (tick/cross) instead of drag-only.
- Password visibility toggle on the login page.
- Localhost-only developer auto-login endpoint for local/dev environments.
- Leave Sim controls for Step 2.2 (SPT Final Edit) and Step 3 allocation mode (standard/balanced).
- Table view for “Saved setup snapshot” differences (saved snapshot vs current dashboard).

### Changed
- **Step-wise workflow**: Step buttons 2–4 are clickable after editing staff leave/FTE in Step 1 (no longer require clicking “Next” first).
- **Step 2.0 Special Program Override**: Therapist and PCA selection use in-place Radix-style dropdowns (Select) instead of a separate selection box after “Edit”.
- **Step 2.1 Non-Floating PCA Substitution**: Team name in dialog title and navigation shown with a badge; added two more color theme sets so multiple teams cycle through five distinct themes before recycling.
- Schedule cold-load now resolves the initial schedule date before rendering (prevents “today → last schedule” flicker).
- “Leave edit + draft” in Leave Sim auto-scrolls to draft patches and shows a larger draft viewport.
- “Saved setup snapshot” wording clarified to explicitly compare saved snapshot → current dashboard.

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
