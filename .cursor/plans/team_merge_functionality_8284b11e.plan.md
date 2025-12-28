---
name: Team Merge Functionality
overview: Implement reversible team merge functionality (runtime alias approach) that allows merging two existing teams into one combined team everywhere on the Schedule page/workflow, while storing schedule allocations under a canonical team enum and preserving history via per-schedule merge snapshots.
todos: []
---

# Team Merge Functionality (Runtime Alias Approach)

## Overview

Implement **reversible team merge** functionality that allows admins to merge two teams (e.g., NSM merged into CPPC) so they appear as **one combined team** everywhere in Schedule UI + workflow, while keeping DB staff rows intact and storing schedule data under a canonical team enum.

## Key Decisions (Confirmed)

- **Merge mode**: Option B (runtime alias) - DB staff/team unchanged, schedule remaps NSM → CPPC
- **Ward aggregation while merged**: Sum both (canonical team beds = CPPC beds + NSM beds)
- **Staff aggregation while merged**: Sum staff (canonical team staff = CPPC staff + NSM staff)
- **History correctness**: Per-schedule snapshot (save merge mapping used for each date)

## Database Changes

### 1) Extend `team_settings` Table

Add `merged_into` column to existing `team_settings` table:

```sql
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS merged_into team NULL;
```

- `merged_into = NULL` for canonical teams (not merged)
- `merged_into = 'CPPC'` means this team is merged into CPPC
- Example: NSM merged into CPPC → `team_settings` row for NSM has `merged_into = 'CPPC'`

### 2) `daily_schedules.team_merge_snapshot`

Add column to `daily_schedules` table:

```sql
ALTER TABLE daily_schedules ADD COLUMN IF NOT EXISTS team_merge_snapshot JSONB NULL;
```

Store per-schedule-date snapshot of merge mapping:

```json
{
  "merged_into": {
    "NSM": "CPPC",
    "OTHER_TEAM": "ANOTHER_TEAM"
  },
  "display_names": {
    "CPPC": "CPPC+NSM",
    "NSM": "NSM"  // not used when merged, but preserved
  }
}
```

**Purpose**: When viewing a saved schedule date, use this snapshot instead of current global merge config to preserve historical correctness.

**Migration**: `supabase/migrations/add_team_merge_support.sql`

## Merge UI (in Team Configuration Dashboard)

### Merge Control

Add to [`components/dashboard/TeamConfigurationPanel.tsx`](components/dashboard/TeamConfigurationPanel.tsx):

- **"Merge Teams" button** at top of panel
- Opens `MergeTeamsDialog`

### MergeTeamsDialog

**Layout**:

```
┌──────────────────────────────────────────────────────────────┐
│ Merge Teams                                           [X]     │
├──────────────────────────────────────────────────────────────┤
│ Select teams to merge:                                       │
│                                                              │
│ Team A: [NSM ▼]                                             │
│ Team B: [CPPC ▼]                                            │
│                                                              │
│ Merged team name: [CPPC+NSM________________]                 │
│                                                              │
│ This will merge NSM into CPPC. NSM will not appear as       │
│ a separate column in the schedule page. All NSM staff and   │
│ ward responsibilities will be treated as part of CPPC.      │
│                                                              │
│ Note: Staff records remain unchanged. Only schedule         │
│ display and calculations are affected.                      │
│                                                              │
│ [Cancel] [Merge Teams]                                       │
└──────────────────────────────────────────────────────────────┘
```

**Merge Logic**:

1. User selects Team A (merged-away) and Team B (canonical)
2. Update `team_settings`:

   - Set Team A: `merged_into = Team B`
   - Update Team B: `display_name = merged name` (if provided)

3. **No staff table updates** (runtime alias approach)

**Unmerge Logic**:

- Reset Team A: `merged_into = NULL`
- Optionally reset Team B: `display_name = Team B` (original name)

## Schedule Page: Apply Merge Everywhere

### Merge Helper Functions

Create [`lib/utils/teamMerge.ts`](lib/utils/teamMerge.ts):

```typescript
// Load merge config (prefer snapshot, else current)
function getMergeConfig(scheduleDate: Date, scheduleData: DailySchedule | null): {
  mergedInto: Record<Team, Team | null>
  displayNames: Record<Team, string>
} {
  if (scheduleData?.team_merge_snapshot) {
    return scheduleData.team_merge_snapshot
  }
  // Load current from team_settings
  // Build mergedInto map from team_settings.merged_into
  // Build displayNames from team_settings.display_name
}

// Get canonical team for a base team
function getCanonicalTeam(team: Team, mergedInto: Record<Team, Team | null>): Team {
  return mergedInto[team] ?? team
}

// Get visible teams (only canonical teams)
function getVisibleTeams(mergedInto: Record<Team, Team | null>): Team[] {
  return TEAMS.filter(t => mergedInto[t] == null)
}

// Get display name for a team
function getTeamDisplayName(team: Team, displayNames: Record<Team, string>): string {
  return displayNames[team] ?? team
}
```

### Apply Merge in Schedule Page

Modify `[app/(dashboard)/schedule/page.tsx](app/\\(dashboard)/schedule/page.tsx)`:

#### 1) Load Merge Config

- When loading schedule for a date, also load `team_settings` table
- If schedule has `team_merge_snapshot`, use that
- Else build merge config from current `team_settings` (merged_into, display_name)

#### 2) Build Canonical Mappings

```typescript
const mergeConfig = getMergeConfig(selectedDate, scheduleData)
const canonicalOf = (team: Team) => getCanonicalTeam(team, mergeConfig.mergedInto)
const visibleTeams = getVisibleTeams(mergeConfig.mergedInto)
const displayName = (team: Team) => getTeamDisplayName(team, mergeConfig.displayNames)
```

#### 3) Staff Grouping (Canonical)

- When building `therapistAllocations` / `pcaAllocations` by team:
  - Group staff by `canonicalOf(staff.team)` instead of `staff.team`
  - Example: Staff with `staff.team = 'NSM'` are grouped under `canonicalOf('NSM') = 'CPPC'`
  - This ensures merged team column includes staff from both base teams

#### 4) Ward Beds Aggregation (Sum Both)

- When computing ward beds for a canonical team:
  - Sum `wards.team_assignments[baseTeam]` for all base teams that map to this canonical team
  - Example: CPPC+NSM ward beds = `wards.team_assignments['CPPC'] + wards.team_assignments['NSM']` (for each ward)
- When displaying ward labels in Block 5:
  - Prefer `team_assignment_portions[baseTeam]` if exists for any contributing base team
  - If multiple base teams contribute and have different portions, show combined or use canonical team's portion

#### 5) Schedule Grid Columns

- Render columns only for `visibleTeams` (NSM disappears when merged into CPPC)
- Column headers use `displayName(team)` (e.g., `CPPC+NSM`)

#### 6) Bed Relieving

- Build bed relieving context using canonical team aggregation:
  - `bedsForRelieving[canonicalTeam] = sum of bedsForRelieving[baseTeam] for all base teams mapping to canonical`
  - Pass canonical-summed ward assignments to `allocateBeds()` algorithm

#### 7) Saving Schedule Data

- Store allocations/calculations under **canonical team** only:
  - `schedule_therapist_allocations.team = canonicalTeam`
  - `schedule_pca_allocations.team = canonicalTeam`
  - `schedule_calculations.team = canonicalTeam` (only for `visibleTeams`)
- **Save merge snapshot**: When saving a schedule, persist current merge config to `daily_schedules.team_merge_snapshot` for that date
- This ensures history views use the merge mapping that was active when that schedule was created

## Algorithm Integration

### Therapist Allocation

- Algorithm receives staff grouped by canonical team (already handled in schedule page grouping)
- Algorithm uses canonical team keys in output allocations

### PCA Allocation

- Algorithm receives staff grouped by canonical team
- Non-floating PCA substitution, floating PCA distribution all work on canonical teams
- Step 3 wizard (pending FTE, preferred slots, etc.) operates on canonical teams

### Bed Allocation

- Algorithm receives `bedsForRelieving` keyed by canonical teams
- Algorithm receives `wards` with canonical-summed `team_assignments`
- Algorithm outputs bed allocations using canonical teams

## Edge Cases

### Unmerge During Active Schedule Editing

- If user unmerges teams while editing an unsaved schedule:
  - Schedule page should reload merge config (use current, not snapshot)
  - Unsaved allocations may need remapping (handle gracefully or warn user)

### History View Consistency

- When viewing a past schedule date:
  - Always use `daily_schedules.team_merge_snapshot` if present
  - This ensures historical schedules show with the merge mapping that was active at the time

### Multiple Merges

- Support chaining: Team A merged into Team B, Team B merged into Team C
  - `canonicalOf()` should resolve recursively: `canonicalOf(A) -> canonicalOf(B) -> C`
  - Ensure `team_settings.merged_into` doesn't create cycles (validation on save)

## Files to Create

1. [`lib/utils/teamMerge.ts`](lib/utils/teamMerge.ts) - Merge helper functions
2. [`components/dashboard/MergeTeamsDialog.tsx`](components/dashboard/MergeTeamsDialog.tsx) - Merge dialog component
3. [`supabase/migrations/add_team_merge_support.sql`](supabase/migrations/add_team_merge_support.sql) - DB migration

## Files to Modify

1. [`components/dashboard/TeamConfigurationPanel.tsx`](components/dashboard/TeamConfigurationPanel.tsx) - Add merge button and dialog integration
2. `[app/(dashboard)/schedule/page.tsx](app/\\(dashboard)/schedule/page.tsx)` - Apply merge config throughout (staff grouping, ward aggregation, column rendering, saving snapshots)
3. [`hooks/useScheduleState.ts`](hooks/useScheduleState.ts) - May need merge-aware state handling
4. [`lib/algorithms/bedAllocation.ts`](lib/algorithms/bedAllocation.ts) - Accept canonical-summed ward assignments
5. [`lib/algorithms/therapistAllocation.ts`](lib/algorithms/therapistAllocation.ts) - May need canonical team awareness
6. [`lib/algorithms/pcaAllocation.ts`](lib/algorithms/pcaAllocation.ts) - May need canonical team awareness

## Data Flow Summary

### Merge Setup (Admin Action):

1. Admin opens Team Configuration dashboard
2. Clicks "Merge Teams"
3. Selects Team A (NSM) and Team B (CPPC)
4. Saves → Updates `team_settings`: NSM.merged_into = CPPC, CPPC.display_name = "CPPC+NSM"

### Schedule Page (Runtime):

1. Load schedule for selected date
2. Load `team_settings` (or use `daily_schedules.team_merge_snapshot` if exists)
3. Build canonical mappings: `canonicalOf('NSM') = 'CPPC'`
4. Group staff by canonical team (NSM staff → CPPC group)
5. Sum ward beds by canonical team (CPPC beds = CPPC base + NSM base)
6. Render columns only for visible teams (NSM hidden, CPPC shown as "CPPC+NSM")
7. Algorithms operate on canonical teams
8. Save allocations under canonical teams only
9. Save merge snapshot to `daily_schedules.team_merge_snapshot`

### Unmerge:

1. Admin resets `team_settings.merged_into = NULL` for NSM
2. Next schedule load uses current config (no merge)
3. NSM appears as separate column again
4. Historical schedules still use their saved snapshots (preserved)

## Notes

- Merge is **reversible** - no data loss, staff rows unchanged
- Merge affects **Schedule page and workflow only** - Staff Profile dashboard still shows original team assignments
- **Per-schedule snapshots** ensure historical schedules render correctly even after unmerge
- Ward beds are **summed** (CPPC+NSM = sum of both teams' ward beds)
- Staff are **aggregated** (CPPC+NSM column shows staff from both base teams)