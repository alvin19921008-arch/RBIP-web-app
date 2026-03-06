# Changelog (Phase 40+)
#
# This file tracks only the newer phase of changes starting 2026-02-08.
# For older historical reference (project overview / architecture notes / earlier phases), see `CHANGELOG.md`.

## [Unreleased] - 2026-03-06 (unified staff edit save)

### Added
- **Staff Edit — unified draft save** — Layer 2 (SPT and Special Program overlays) now stage edits to parent; persistence only on Layer 1 Save. New staff can configure overlays before first save.
- **Access settings — Cache status and clear cache** — New feature `schedule.diagnostics.cache-status` in Account Management → Access settings. Cache status badge and clear cache action are admin+dev gated by default; configurable per role.
- **Staff Edit — dismiss protection** — Main dialog and overlay sheets no longer close on backdrop click or Escape; explicit Cancel/X still close.
- **API `/api/staff/save`** — Single endpoint persisting staff, SPT, and special-program data via RPC `save_staff_edit_dialog_v1`.

### Changed
- **Staff Edit — reminder text** — Concise "Pending until Save." replaces verbose copy on SPT and Special Program cards/overlays.
- **Staff Edit — Special Program** — Removed blocked state for new staff; all edits draft-only until Layer 1 Save.
- **Configured staff — active-only** — Special Program and SPT Allocation panels show and allow adding only active staff (inactive excluded). PCA Preference shows active and buffer PCAs (inactive excluded).

### Fixed
- **RPC `save_staff_edit_dialog_v1`** — Replaced unsupported `jsonb_object_length()` with `EXISTS (SELECT 1 FROM jsonb_object_keys(...))` for Supabase Postgres compatibility.

---

## [Unreleased] - 2026-03-03 (dashboard UX — staff profile, edit dialog, team merge)

### Added
- **Staff Profile Panel — Team filter** — new filter dropdown to filter staff by team (FO, SMM, SFM, CPPC, MC, GMC, NSM, DRO).

### Changed
- **Staff Profile Panel — Radix Select for filters** — Rank, Team, Special Program, Floor PCA, and Status filters now use Radix UI Select instead of native `<select>`; batch "Set Status..." dropdown also converted.
- **Staff Profile Panel — Delete inline confirmation** — single-staff delete button shows "Confirm?" and "Cancel" inline before deleting (per dashboard-ui-design-principles).
- **Staff Profile Panel — Inactive staff actions column** — Edit/Delete buttons for inactive staff now use full colour; grey overlay (`opacity-60`) applied only to other cells (name, rank, team, etc.).
- **Staff Edit Dialog — PCA flow** — Assignment type (Non-floating / Floating) shown first; Team only when non-floating; Floor PCA required when floating, optional when non-floating.
- **Staff Edit Dialog — SPT flow** — Reordered to Specialty → RBIP Supervisor → Team → Special Program; removed "SPT basic configure" info line.
- **Staff Edit Dialog — Flat layout and Radix** — section dividers (`hr`), uppercase headers; all selects use Radix UI; nested border boxes removed.
- **Staff Edit Dialog — Status badge selection** — Active, Inactive, Buffer shown as clickable badge-style buttons (matching Staff Profile table) instead of dropdown.
- **Team Merge Panel — Unmerge inline confirmation** — Unmerge button shows "Confirm?" and "Cancel" inline before unmerging.
- **Saved-setup diff popover — table column sizing** — Removed `min-w-[720px]` so table fits popover; adjusted columns to 12% / 14% / 37% / 37% so Saved snapshot and Dashboard share space without forcing horizontal scroll.

---

## [Unreleased] - 2026-03-02 (UX polish — leave sim, split pane, step dialogs)

### Fixed
- **Step indicator lag and algo button transient state** — Step button now updates immediately on click (removed `startTransition` wrapper). Algo button shows "Running..." only when the algorithm is actually running, not during step or date transitions (new `isAlgorithmRunning` prop). Step-transition sync in `useAllocationSync` wrapped in `startTransition` so heavy allocation work runs in the background without blocking paint (~1s perceived improvement).
- **Step 3 merged teams — over-assignment with scarcity** — when teams were merged (e.g. CPPC+NSM), Step 3 used only visible teams for pending FTE and raw allocations, so contributor teams' pending was omitted and cap math was wrong. Now `pendingPCAFTEForStep3Dialog` aggregates by main team and recomputes from displayed target minus assigned valid slots; `existingAllocationsForStep3Dialog` canonicalizes team/slot to main teams. Cap aligns with UI; exceeding cap in Standard mode when surplus exists remains allowed.
- **Schedule load — prefetch snapshot leak** — adjacent-date prefetch could overwrite the current date's baseline snapshot (including team merge), causing random CPPC/NSM split display. Prefetch loads now never apply snapshot or overrides to state; diagnostic tooltip shows `stateGuard`, `prefetchReq`, `applyState` for traceability.

### Changed
- **Step 1–3 dialog headers** — added metadata line (`Step X.x · label`) in `text-xs text-muted-foreground` above the instruction text, with `mt-1` on the instruction span and `pt-4` on the scrollable content area, consistent across all steps.
- **Step 1.1 "Add staff" panel (wide view)** — flattened nested box-in-box layout at `lg+`: outer wrapper becomes top/bottom rules only (`border-t border-b`, no left/right box), "Add staff" and "Draft list" headers lose their `border-b` separator, rank column headers lose their inner `border-b`; column separators remain via `divide-x divide-y`. Mobile layout (`< lg`) is unchanged.
- **Step 1.1 "Add staff / Draft list" column ratio** — widened Add Staff pane from `1.45fr` to `1.7fr` and narrowed Draft List from `0.85fr` to `0.6fr` at `lg+` so the four rank columns have more room and staff names are less truncated. Draft List only shows name, rank/team, and a remove button so the narrower column is comfortable.
- **Step 1.2 – Special program checkbox smart suppression** — "Available during special program slot" checkbox is now hidden when the therapist's FTE remaining is already 0 (fully absent = cannot attend any slot; no ambiguity). Also, the checkbox label now names the specific program (e.g. "Available during **CRP** slot") with the program name in bold, pulled from `specialPrograms` filtered to today's weekday.
- **Step 1.4 review — 2-column layout on wide viewports** — at `lg+` (≥1024px) the review list switches from a single `divide-y` column to a 2-column `grid grid-cols-2 gap-px bg-border` layout; each card gets `bg-background` to punch through the gap colour. Each card keeps its internal `flex justify-between` so FTE stays at the right edge of a half-width card, dramatically reducing horizontal eye-tracking distance. Mobile keeps the existing single-column layout.
- **Step 3.1 allocation method — collapsed header metadata** — when the "Allocation method (Step 3.4)" card is collapsed, the header now shows a preview result next to the mode label:
  - *Standard, no issues*: `· 0-slot teams: nil` (green)
  - *Standard, problems*: `· 0-slot teams: FO, SMM` (amber, with team names)
  - *Balanced, no issues*: `· short teams: nil` (green)
  - *Balanced, problems*: `· short teams: DRO, MC` (amber, with team names)
  - Shows `· computing…` while the dry-run preview is in-flight. Metadata only visible when collapsed; hidden when expanded since full details are shown inside.
- **SPT Allocation Panel — layout alignment on wide viewports** — "FTE / Remove" row and "Contributes FTE / AM·PM summary" row both previously used `justify-between`, pushing info to the far right on wide screens. Both rows now use `flex gap-3` / `flex gap-4` (left-aligned) so the FTE value, Remove button, and AM·PM summary stay clustered with the controls.
- **Design rules — wide viewport proximity and eye-tracking** — added guidance in `.cursor/rules/design-elements-commonality.mdc`: prefer left-aligned clusters over `justify-between` for control rows; use 2-col grids on widescreen when appropriate; document anti-patterns (metadata far from controls, `flex-1` spacers between related items).

### Fixed
- **Split pane — reference hidden, top-down mode** — when split mode was active with top-down direction and the reference pane retracted, the main pane could not scroll and the "Show reference" button was unresponsive. Root cause: the outer wrapper div was missing flex layout classes in split mode. Fixed by adding `flex-1 min-h-0 flex flex-col` when `isSplitMode`, and `shrink-0` on the collapsed strip so it keeps its fixed height.
- **Split pane — "Reference Hidden" label overlap (side-by-side)** — the rotated amber "Reference" text used `absolute inset-0` which overlapped the "Show reference" button at the top of the strip. Replaced with `flex-1 flex items-center justify-center` (in-flow) so the label centres in the space below the button.
- **Split pane — "Reference Hidden" label (top-down collapsed strip)** — top-down retracted strip now shows the same amber "Reference Hidden" text (same font/colour as side-by-side) centred horizontally in the strip, grouped with the expand button as a unit (`flex-1 flex items-center justify-center gap-1.5`). Previously the strip showed only the icon with generic text inside the button.

---

## [Unreleased] - 2026-03-01 (feedback system)

### Added
- **Bug / Feedback Reporting System** — full in-app feedback loop for users and developer.
  - **Floating draggable button** (`MessageSquarePlus`, bottom-right) with Framer Motion micro-interactions: spring hover/press, icon tilt on drag, origin-expand drawer animation, unread-reply badge.
  - **Submission drawer** (slide-in overlay, no navigation): "Similar issues" panel with +1 upvoting, new-report form (type, severity, category, sub-category, description, steps to reproduce), manual screenshot capture ("Capture now" / Retake / Crop region / Discard), CSS-keyframe indeterminate progress bar during capture, `flushSync` + double-`requestAnimationFrame` to show loading state before main-thread capture work.
  - **Region selector** — snipping-tool crop overlay; drawer slides off-screen while selecting, returns with cropped preview.
  - **`/feedback` page** — full-page version for all authenticated roles; developer role auto-redirects to `/feedback/review`.
  - **`/feedback/review` page** — developer-only: sidebar filters (status, type, category, severity), flat report list with severity left-strip colour coding, slide-in detail panel (auto-context viewer, status selector, internal dev notes, optional reply to submitter, delete).
  - **Navbar** — "Reports" nav link added for developer role with iOS-style red unread badge (count of `status = 'new'` reports, polled every 60s, clears on click); "Report an issue" entry added to account dropdown for all roles.
  - **Database** — `feedback_reports` + `feedback_upvotes` tables with RLS, `upvote_count` sync trigger, `updated_at` trigger (`supabase/migrations/20260301_add_feedback_system.sql`).
  - **API routes** — `GET/POST/PATCH/DELETE /api/feedback`, `POST/GET /api/feedback/upvote`, `POST /api/feedback/screenshot` (Vercel Blob), `POST /api/feedback/mark-read`.

---

## [Unreleased] - 2026-03-01 (cache/draft/snapshot hardening)

### Fixed / Hardened
- **Cache · Draft · Snapshot system hardening (F1–F11)** — Full details in `WIP2.md`.
  - **F1 (CRITICAL)**: Post-save `currentScheduleUpdatedAt` was client-fabricated, causing silent post-save draft discard on date switch. Now reads actual DB `updated_at` from both the non-RPC update path (`.select('updated_at')`) and the RPC path (separate lightweight fetch).
  - **F2 (HIGH)**: Source date cache was not cleared after the copy-schedule route mutated the source snapshot. `clearCachedSchedule(fromDate)` added alongside the existing target clear in `handleConfirmCopy`.
  - **F3 (HIGH)**: New schedule baseline snapshot was built from the previous date's stale React state. Replaced with a parallel batch of live DB fetches (`staff`, `special_programs`, `spt_allocations`, `wards`, `pca_preferences`) at schedule creation time.
  - **F4**: Null-wildcard in draft identity `updatedAtMatches` was too permissive (a `null` draft matched any non-null base). Now requires both sides to be null or both to match as non-null strings.
  - **F5**: Snapshot repair was ephemeral — the repaired envelope was never written back to DB, so the repair staff query re-fired on every cold load. Repair result now fire-and-forget persisted to `daily_schedules.baseline_snapshot` immediately after repair.
  - **F6**: Epoch bump (global Publish/Pull) silently destroyed all in-flight drafts with no user notification. `bumpEpochAndGetEvictedDraftDates()` now captures live drafts before bumping; `ConfigSyncPanel` shows a `toast.warning` listing affected dates.
  - **F7**: `MAX_DIRTY_DATES = 5` overflow only evicted the sessionStorage pointer, leaving the in-memory draft as an invisible orphan. `markDirtyScheduleDate` now also calls `draftCache.delete()` for the evicted entry.
  - **F8**: Added JSDoc constraint comment at `cacheSchedule()` and the cache-hit read site documenting that `overrides` must always represent DB-persisted state.
  - **F9**: Removed dead `writeThrough` code — the source-type union member, persist guard, and read-path legacy-entry guard were all protecting an abandoned design pattern with no active callers.
  - **F10**: `DraftScheduleData` no longer stores `baselineSnapshot` — the field was serialised on every flush but unconditionally ignored at restore, adding unnecessary memory overhead (can be hundreds of KB per dirty date).
  - **F11**: Added JSDoc to `getScheduleCacheEpoch()` and `bumpScheduleCacheEpoch()` documenting the two symmetric sessionStorage-unavailable failure modes (perpetual over-eviction vs epoch-protection bypass).

---

## [Unreleased] - 2026-03-01

### Fixed
- **GifViewer – Rounded corners on all thumbnails**: Replaced `object-contain` + `w-full` on the thumbnail `<img>` with `max-w-full max-h-[220px] w-auto h-auto` so `border-radius` clips correctly on all GIF aspect ratios. Outer wrapper restructured to `block w-full max-w-[360px]` (block-level for new-line placement) + inner `inline-flex w-fit` (shrink-wraps to image width so the expand button tracks the thumbnail).
- **Snapshot diff – UUID in Team Settings**: `SnapshotDiffResult` now exports a `staffIdToName` record built from the full `idToName` map. `SnapshotDiffDetails` uses this map to resolve UUID strings to human-readable names in all categories (Team Settings, PCA Preferences, etc.).
- **Team merge non-deterministic flicker on 23/2**: Draft restore was overwriting `baselineSnapshot` (which carries per-date `teamMerge` config) with a potentially stale draft snapshot, causing CPPC+NSM to briefly show merged then revert to unmerged. Draft patch now preserves the `baselineSnapshot` from the schedule load; comment added to document the invariant.
- **Export – PCA Dedicated Schedule split-table layout**: Removed the two-table export split. PCA Dedicated Schedule now exports as a single wide table containing all staff columns, giving a consistent single-table layout in the exported PNG.

### Changed
- **Step 3 Animated Controls – liquid-glass tint**: Control panel background updated from `bg-white/10` (invisible over white) to `bg-slate-200/50` with `border-slate-300/45` so the frosted panel reads clearly over the white animation canvas. Shadow opacity and specular highlight strengthened for light mode; button hover updated to `hover:bg-white/30`. Space below controls increased from `pt-8` to `pt-9` to give a small gap above the "Teams (Need)" / "PCAS (AVAIL)" headers.
- **Snapshot diff – Item column narrowed**: Item column reduced from 22% to 14%; Saved snapshot and Dashboard columns each grow from 31% to 35.5%, reducing horizontal scroll and giving more room for cell content.
- **Export – PCA Dedicated Schedule**: Removed the now-unused `maxColumnsPerChunk` prop and `chunkArray` helper.

## [Unreleased] - 2026-02-28

### Fixed
- **Vercel build failures (TypeScript strict errors)**:
  - `TeamConfigurationPanel`: `runChecked` helper type widened from `Promise` to `PromiseLike` to accept Supabase `PostgrestFilterBuilder` (which is a thenable, not a native Promise).
  - `SnapshotDiffDetails`: Added explicit `string` type annotation to `preferredPcaIds.map((id: string) => ...)` callback.
  - `lib/utils/teamMerge.ts`: Added `|| {}` fallback for `mergeLabelOverrideByTeam` and `mergedPcaPreferencesOverrideByTeam` when reading from `liveSnapshot` (both are optional in `TeamMergeSnapshot` but required in `TeamMergeResolvedConfig`).

### Added / Changed
- **Team Config – Inactive Staff search**: Inactive staff now appear in a dedicated "Inactive Staff" section when search query matches their name. Shows name, rank badge, muted "Inactive" badge, and "Last team: X". Selecting an inactive staff member stages them with an "Inactive to Active" badge; saving activates them and assigns them to the team.
- **Team Config – Transfer pre-save reminder**: Flat amber reminder text ("Pending transfer — applies only after Save.") shown above each rank's pending transfer rows (no banner box). Global inactive-activation reminder banner shown above action buttons only when inactive staff are staged.
- **Team Config – Info banner**: Expanded from `max-w-2xl` to `w-full`.
- **Team Config – Ward assignment flow**: Selecting a checkbox immediately adds the ward to "Wards assigned" with green background and "+Assign" badge (no inline Confirm step). Remove (X) button moved inline next to ward controls; clicking triggers Confirm/× inline confirmation.
- **Team Merge Panel**: Active merges show `(since <timestamp>)` in smaller bracketed font using `updated_at`.
- **Config Sync / Meta Banner – Version display**: Raw `v###` replaced with 5-digit GitHub-style `#00070` display ID. Tooltip shows both display ID and internal `v###`. Sync status badge ("In sync" / "Snapshot behind") added next to Source snapshot header.
- **Config Sync – Backups section revamp**: Removed outer bordered container; uppercase tracking header; "Create backup" styled as subtle form pane; backup list uses `divide-y`; "Restore" button has inline Confirm/Cancel confirmation.
- **Config Sync – Team merge banner**: Explanatory sentence and merge details moved to second line for cleaner layout.
- **Config Sync – Publish / Pull buttons**: `CloudUpload` / `CloudDownload` icons added; snapshot date shown in smaller font as `(Feb 26, 2026)`; inline Confirm/Cancel flow for both actions. Mock buttons in help center (`DashboardSyncPublishAnswer.tsx`) updated to match.
- **Help Center – GifViewer**: Removed ring border; rounded corners to `rounded-xl` on thumbnail and `rounded-2xl` on lightbox modal for liquid-glass consistency.

## [Unreleased] - 2026-02-27

### Added
- **Step 3.1 Allocation Mode – Animated Explainers**:
  - New `Step3ModeExplainerAnimated.tsx` component replacing placeholder SVGs with interactive Framer Motion animations.
  - Standard mode explainer: 4-step animation showing greedy allocation (FO → CPPC → NSM).
  - Balanced mode explainer: 6-step animation showing round-robin turns across teams.
  - Animated flying blocks with real DOM coordinate measurement (source/target slot anchors) for pixel-perfect alignment.
  - Playback controls (play/pause, prev/next step) with liquid-glass styled control bar.
  - Blue tone scheme: light blue (PCA available) → bright blue (flying) → deep blue (team filled).
  - Hidden by default; revealed inside "Pros & cons" collapsible with side-by-side layout (text left, animation right).
- **Team Config Dashboard – UX Polish**:
  - **Ward Assignment**: Inline confirm flow for adding wards; selecting a ward enters preview state with "+Assign" badge and Confirm/X buttons; actual assignment only after confirmation.
  - **Transfer/Save Reminders**: Tiny amber reminder text shown when staff transfers or new ward assignments are pending: "Only clicking 'Save' confirms...".
  - **Input Widths**: Narrowed "Team name" field (`w-24`) and "Search staff" field (`max-w-xs`) to better match actual content width.
- **Schedule Page – UX Polish**:
  - **Split Slot Disabled State**: SPT cards at 0.25 FTE now show disabled "Split slot" menu item with tooltip: "SPT at 0.25 FTE cannot be split further."
- **Special Program Dashboard – UX Polish**:
  - **Configured Staff Expand**: Entire row is now clickable to expand/collapse staff configuration (not just chevron icon).
- **SPT Allocation Dashboard – UX Polish**:
  - **Retracted State Expand**: Clicking anywhere on allocation row expands/collapses details (matches Special Program behavior).
- **Export Mode – PCA Dedicated Schedule**:
  - Split tables (for 14+ PCAs) now use consistent natural width sizing; chunk cards align top and bottom edges; Slot 1-4 column width stays consistent across chunks.

### Changed
- **Team Config Dashboard – Code Refactor**:
  - Unified rank state (APPT/RPT/PCA) into `RankBucket` model; extracted `RankMemberSection` component replacing 350+ lines of duplicated JSX.
  - Hardened save path with checked Supabase operations and rank-driven update loop (prevents silent partial failures).

## [Unreleased] - 2026-02-24

### Added
- **Deploy (Vercel + Supabase)**: `DEPLOY.md` and `.env.example` document required env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for Vercel; missing vars are a common cause of deploy/runtime failures.
- **Banner Panel Design (design-elements-commonality.mdc)**: New rule section for informational/confirmation panels: container `rounded-xl`, `bg-{color}-50/40`, `border-{color}-100/60`, `p-3`, `shadow-sm`; inner flex layout and example for workflow banners.
- **Team Configuration Panel – Add Members & Wards**:
  - **From Other Teams**: Masonry-style 2-column grid with `bg-muted/20` separation; unselected teams as clickable text (expand/collapse); expanded team spans full width with scrollable staff list.
  - **Wards assigned**: Inline expand design—only selected wards shown by default; "Assign wards" button reveals scrollable unselected-ward list; remove (X) per selected ward.
  - **Workflow guidance banner**: Styled per Banner Panel Design (`rounded-xl`, `bg-blue-50/40`, `border-blue-100/60`, `p-3`, `shadow-sm`).
- **PCA Preference Panel revamp**:
  - **Floor PCA Selection**: Replaced native `<select>` with button group [None/Upper/Lower]
  - **Add Preferred PCA**: New selection flow with:
    - Filter logic: Only show active and buffer status PCAs (exclude inactive)
    - Regular and buffer PCA separated with divider
    - Selection → Confirmation panel pattern with removable tags
    - "Add Selected" and "Clear" buttons for confirmation
  - **Configured Preferred PCA**:
    - Numbered list with MoveUp/MoveDown arrows for reordering
    - Smart arrow display: only show relevant arrows (1 PCA = no arrows, top item = only down arrow, bottom item = only up arrow)
    - Inline delete confirmation (trash icon shows "Confirm?" button)
  - **Preferred Slot buttons**: Updated active state styling to blue-600 per design guidelines
  - **Scarcity Threshold**: Replaced native `<select>` with button group [Auto/Remind/Off]
  - **Section headers**: Applied uppercase tracking styling per design principles

### Fixed
- **Special Program Panel state refresh**: Fixed bug where newly added staff didn't appear immediately in the edit form after adding
- **Auth – Supabase session warning**: Replaced `getSession()` with `getUser()` for trusted user identity in `lib/auth.ts` (getCurrentUser), login page (session check and post-login verify), and login debug client; removes console warning about session storage not being authentic.
- **TeamConfigurationPanel hooks order**: Removed inline `useState` inside ward-selector IIFE; `showWardSelector` uses only the top-level state so hook order is stable (fixes "Rendered more hooks than during the previous render").

### Changed
- **Step 3.1 (Floating PCA Config) dialog**:
  - **Allocation method collapsible (Option A)**: Allocation method section is now collapsible and defaults to collapsed; header shows summary (e.g. "Standard (keeps 3.2/3.3)" or "Balanced (take turns)") with chevron; reduces visual load on Step 3.1.
  - **Preferred / strictness clarity**: Added intro line "Preferred = Step 3.2 picks: preferred PCA, preferred slots, or both." and badge pills for key phrases: `ALL a/v slots`, `preferred PCA`, `selected slots` in the "How strict to honor preferred picks?" section.
  - **Pros & cons**: Chevron icon on expandable "Pros & cons"; removed still image and enlarge/zoom button (SvgViewer usage dropped from dialog).
  - **Banners**: Scarcity banner full width to match other dialog content; staff pool snapshot notice smaller font (`text-[11px]`), tighter padding (`px-1.5 py-1`), compact styling for narrow sidebar.
- **Team Configuration Panel**: Control buttons (remove X) placed next to staff name (no `ml-auto`); "x assigned" / "x selected" counts inline with section labels (no `justify-between`); removed redundant "Transfer from another team" menu; Add Members search auto-expands team when query matches; selected staff from other teams shown inline with green "Transfer" badge; RPT/specialty badges in search results next to name (flex layout).
- **SPT Allocation Panel**: Specialty and SPT staff dropdowns use `w-fit min-w-36` so they don’t span full width.
- **PCA Preference Panel**: Remove (trash) button for configured preferred PCA moved next to staff name (`gap-2` instead of `justify-between`).
- **Wards assigned**: "x selected" label inline with "Wards assigned" (same pattern as staff sections).
- **Button active state**: Use `bg-blue-600 text-white` for selection buttons per design-elements-commonality.mdc (except Save button)
- **SPT Allocation Panel flat design**: Removed border boxes around allocation items, replaced with `divide-y` list layout. Specialty now on dedicated second row. Ghost buttons for lighter visual weight.
- **Cursor skill/rules consolidation**: Consolidated Playwright smoke testing guidance:
  - Renamed `playwright-smoke-rbip` → `playwright-smoke` (removed redundant prefix)
  - Merged two rules (`playwright-smoke-on-demand`, `playwright-config-on-demand`) into single `playwright-smoke.mdc`
  - Created global `ui-trend-scout` skill for context-aware design trend searching across all projects
  - Optimized `design-elements-commonality.mdc` to constraint-based format (removed verbose examples)

## [Unreleased] - 2026-02-22

### Added
- **Dashboard UI polish for team merge**:
  - **Team Configuration Panel**: Added `+TeamName` badge showing actual merged team names (e.g., `+NSM`) instead of just count. Badge displays for main teams that have contributing merged-away teams.
  - **PCA Preferences Panel**: Main teams show `+TeamName` badge with merged team names. Merged-away teams display muted card styling with "Managed by MainTeam" banner and read-only inherited preferences.
  - **Team Merge Panel**: Complete UI redesign with:
    - Progressive disclosure: Merge editor only visible when creating/editing
    - Side-by-side merge preview with full team details (Heads, RPT, Non-floating PCA, Wards, Total beds)
    - Combined result box showing aggregated team statistics
    - Categorized merge effects reference (Visual Layer, Patient Care, System Behavior) with icons
- **Shared team merge utilities (`lib/utils/teamMergeHelpers.tsx`)**: Centralized helper functions (`computeMergedIntoMap`, `getTeamMergeStatus`, `computeDisplayNames`) and `TeamMergeBadge` component for consistent merge badge rendering across dashboards.

### Changed
- **TeamConfigurationPanel merge badge display**: Merged-away teams now show "Merged into X" badge next to team name while remaining fully editable. Previously only main teams showed the `+contributing teams` badge.
- **PCAPreferencePanel refactored**: Replaced local merge status implementations with shared utilities from `teamMergeHelpers.tsx` for consistency across dashboards.

### Fixed
- **Step 2.1 auto-scroll for merged teams**: Fixed three bugs affecting auto-scroll in merged team scenarios:
  1. **Wrong team key in scroll lookup**: Scroll handler used `pending.team` instead of `nextSub.team` to construct the next substitution key.
  2. **Substitution lookup failed**: `handleSelectionChange` and `addCoverSelection` only searched `substitutionsByTeam[team]`, but in merged teams the substitution is filed under the merged team. Added `findSubstitution()` helper that searches across all teams.
  3. **Wrong team in scroll intent**: Scroll intent stored the substitution's original team instead of the display team (merged team). Now uses `getCurrentDisplayTeam()` for correct team reference.

### Added
- **Dashboard UI refactor - flat hierarchy design**:
  - **Outer Card removal**: Removed Card wrappers from 9 dashboard panels (SPT Allocation, Special Programs, Account Management, Access Settings, Staff Profile, Ward Config, PCA Preference, Team Configuration, Config Sync) following flat hierarchy design principles (max 2 nesting levels).
  - **Layout flattening**: Replaced nested "box under box" layouts with horizontal dividers and spacing.
  - **Duplicate title removal**: Removed redundant titles in Account Management, Access Settings, Config Sync, and PCA Preference panels.
  - **Special Programs panel**:
    - Progressive disclosure with collapsible rank sections (THERAPISTS / PCA) using lucide chevron icons
    - Per-staff expand/collapse with summary view showing weekday FTE individually
    - Multi-select add staff with confirmation pane showing selected staff as removable tags
    - Inline delete confirmation (trash icon shows "Confirm?" button)
  - **PCA Preference panel**:
    - Inactive staff filtered from preference order
    - Warning banner ignores buffer PCA (only checks regular staff)
    - Buffer staff included in list with "(Floating, Buffer)" label
  - **Add Staff list**: Filtered to exclude inactive staff, with regular staff shown first and buffer staff separated by divider at bottom.
  - **State refresh**: Fixed state refresh bug where newly added staff appeared immediately without page refresh.

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
- **Cursor on-demand smoke skill/rules**: Consolidated project skill `.cursor/skills/playwright-smoke` plus merged rule (`playwright-smoke.mdc`) for smoke test and config files—loaded on-demand for token efficiency.
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
