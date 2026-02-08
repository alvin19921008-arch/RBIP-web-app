# Changelog (Phase 40+)
#
# This file tracks only the newer phase of changes starting 2026-02-08.
# For older historical reference (project overview / architecture notes / earlier phases), see `CHANGELOG.md`.

## [Unreleased] - 2026-02-08

### Added
- Password visibility toggle on the login page.
- Localhost-only developer auto-login endpoint for local/dev environments.
- Leave Sim controls for Step 2.2 (SPT Final Edit) and Step 3 allocation mode (standard/balanced).
- Table view for “Saved setup snapshot” differences (saved snapshot vs current dashboard).

### Changed
- Schedule cold-load now resolves the initial schedule date before rendering (prevents “today → last schedule” flicker).
- “Leave edit + draft” in Leave Sim auto-scrolls to draft patches and shows a larger draft viewport.
- “Saved setup snapshot” wording clarified to explicitly compare saved snapshot → current dashboard.

### Fixed
- PCA Dedicated Schedule table labeling for non-floating PCAs (“主位”) and substitution (“替位”) display.
- Sticky first column right divider visibility during horizontal scroll.
- Refresh icon tooltip uses app tooltip styling and spins once on hover.
- Dashboard no longer shows misleading “no access/no sections” message while permissions are still loading.
- Leave Sim: PCA `fteRemaining` is derived from ticked available slots (invalid slot reduces remaining FTE accordingly).
- Time interval slider supports click-to-jump (in addition to dragging).
