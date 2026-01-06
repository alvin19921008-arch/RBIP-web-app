# Work In Progress - Per-Date Snapshot & Copy Functionality

**Last Updated**: 2026-01-03  
**Status**: Implementation Complete - Ready for Testing  
**Related Plan**: `.cursor/plans/per-date_data_isolation_1bad69f4.plan.md`

---

## Overview

This document tracks the implementation of per-date data isolation and schedule copy functionality. The goal is to prevent cross-date contamination by snapshotting dashboard state at schedule creation time, and to provide flexible copy options (full vs hybrid) with buffer staff handling.

---

## Completed Implementation

### 1. Database Schema Changes

**Migration**: `supabase/migrations/add_daily_schedule_snapshots.sql`

Added three new JSONB columns to `daily_schedules` table:
- `baseline_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb` - Frozen snapshot of dashboard state (staff, special programs, wards, etc.)
- `staff_overrides JSONB NOT NULL DEFAULT '{}'::jsonb` - Per-schedule staff modifications (leave types, FTE, available slots, etc.)
- `workflow_state JSONB NOT NULL DEFAULT '{}'::jsonb` - Current step and completed steps tracking

**Type Definitions**: `types/schedule.ts`
- `BaselineSnapshot` interface
- `WorkflowState` interface with `ScheduleStepId` type
- `ScheduleStaffOverrides` type (extends existing staffOverrides structure)

**Schema Update**: `supabase/schema.sql` and `lib/supabase/types.ts` updated to reflect new columns.

---

### 2. Baseline Snapshot Creation & Application

**Location**: `app/(dashboard)/schedule/page.tsx`

**Snapshot Creation**:
- When a new `daily_schedules` row is created (blank day), immediately snapshots current dashboard state:
  - All staff (active, inactive, buffer)
  - Special programs
  - SPT allocations
  - Wards (with team_assignment_portions)
  - PCA preferences
  - Team settings (display names)
- Snapshot is persisted to `daily_schedules.baseline_snapshot` immediately
- **No overwrite protection**: If snapshot already exists (e.g., from copy), it is NOT overwritten

**Snapshot Application**:
- `applyBaselineSnapshot(snapshot: BaselineSnapshot)` helper function:
  - Splits snapshot staff into `staff`, `inactiveStaff`, `bufferStaff` arrays
  - Sets `specialPrograms`, `sptAllocations`, `wards`, `pcaPreferences` from snapshot
  - Ensures schedule uses frozen snapshot instead of live dashboard tables

**Load Path**:
- `loadScheduleForDate()` now:
  1. Loads `baseline_snapshot`, `staff_overrides`, `workflow_state` from DB
  2. If `baseline_snapshot` exists and is non-empty, calls `applyBaselineSnapshot()`
  3. Falls back to live dashboard tables if snapshot is empty (backward compatibility)
  4. Loads `staff_overrides` directly if present, otherwise reconstructs from allocations

---

### 3. Staff Overrides Persistence

**Save Path**: `saveScheduleToDatabase()` in `app/(dashboard)/schedule/page.tsx`

- After saving allocations, now also updates `daily_schedules` with:
  - `staff_overrides`: Full serialization of current `staffOverrides` state
  - `workflow_state`: `{ currentStep, completedSteps }` derived from `stepStatus`
  - `tie_break_decisions`: Existing behavior preserved

**Load Path**:
- If `staff_overrides` is non-empty, uses it directly (single source of truth)
- Otherwise, falls back to existing reconstruction logic from allocations (backward compatible)

**Override Structure** (extends existing):
```typescript
{
  leaveType: LeaveType | null
  fteRemaining: number
  team?: Team
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  amPmSelection?: 'AM' | 'PM'
  specialProgramAvailable?: boolean
  specialProgramOverrides?: SpecialProgramOverrideEntry[]
  slotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null }
  substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
}
```

---

### 4. Workflow State Integration

**Purpose**: Track which steps are completed and current step for each schedule date.

**Save**:
- On `saveScheduleToDatabase()`, builds `completedSteps` array from `stepStatus` where status === 'completed'
- Stores `{ currentStep, completedSteps }` in `workflow_state`

**Load**:
- On schedule load, if `workflow_state` exists:
  - Sets `currentStep` from `workflow_state.currentStep`
  - Marks steps in `workflow_state.completedSteps` as 'completed' in `stepStatus`
- Falls back to data-presence heuristics if `workflow_state` is empty (backward compatible)

**History Page Integration** (Future):
- Can use `workflow_state.completedSteps` to determine completion badges instead of inferring from allocations

---

### 5. Copy API Implementation

**Route**: `app/api/schedules/copy/route.ts`

**Request Body**:
```typescript
{
  fromDate: string  // 'YYYY-MM-DD'
  toDate: string    // 'YYYY-MM-DD'
  mode: 'full' | 'hybrid'
  includeBufferStaff: boolean
}
```

**Full Copy Mode**:
- Copies `baseline_snapshot`, `staff_overrides`, `workflow_state`, `tie_break_decisions`
- Clones all therapist allocations, PCA allocations, bed allocations, calculations
- Preserves all steps (1-4) and tie-break decisions

**Hybrid Copy Mode**:
- Copies `baseline_snapshot` and `staff_overrides` (Step 1 + Step 2 intent)
- Clones therapist allocations (all)
- Clones PCA allocations filtered to:
  - Non-floating PCAs
  - Special-program PCAs (`special_program_ids` non-empty)
  - Substitution PCAs (identified via `staff_overrides.*.substitutionFor`)
- **Does NOT copy**: Floating PCA allocations (non-substitution), bed allocations, calculations
- Sets `workflow_state` to resume at Step 3 (`currentStep: 'floating-pca'`)

**Buffer Staff Handling**:
- Detects buffer staff from **source schedule's latest state** (allocations + staff_overrides), not global staff
- If `includeBufferStaff: false`:
  - Converts buffer staff to `status: 'inactive'` in target baseline snapshot
  - Filters out buffer staff from cloned allocations
- Uses new `/api/schedules/buffer-staff` endpoint to detect buffer staff actually used in source

**Response**:
```typescript
{
  success: true
  mode: 'full' | 'hybrid'
  fromDate: string
  toDate: string
  copiedUpToStep: string  // e.g. 'floating-pca' (for incomplete source warning)
}
```

---

### 6. Copy Wizard UI

**Component**: `components/allocation/ScheduleCopyWizard.tsx`

**Step Order** (swapped per user request):
1. **Step 1 - Date Selection** (only for "specific date" flows)
   - Uses `CalendarGrid` component with holiday styling
   - Disables weekends and HK public holidays
   - For "Copy TO": only allows empty working days
   - For "Copy FROM": only allows filled working days
   - Skipped for "next/last working day" flows (dates pre-resolved)

2. **Step 2 - Copy Type Selection** (Full vs Partial)
   - Two selectable cards with bullet-point explanations
   - User must choose before proceeding

3. **Step 3 - Buffer Staff Inclusion**
   - Fetches buffer staff from `/api/schedules/buffer-staff?date=...` (source schedule's actual buffer staff)
   - Shows lists of buffer therapists and buffer PCAs
   - Checkbox: "Keep buffer staff in copied schedule" (default: checked)
   - If unchecked, buffer staff converted to inactive in target schedule

**Integration**: `app/(dashboard)/schedule/page.tsx`
- Copy dropdown button in header (between SummaryColumn and Save button)
- Dynamic labels:
  - "Copy to next working day" (if current has data, next is empty)
  - "Copy from last working day" (if current is empty, last has data)
  - "Copy to a specific date" (if current has data)
  - "Copy from a specific date" (if current is empty)
- Opens wizard dialog with appropriate `flowType` and `direction`

---

### 7. Buffer Staff Detection API

**Route**: `app/api/schedules/buffer-staff/route.ts`

**Purpose**: Detect buffer staff actually used in a source schedule (from allocations + staff_overrides), not global buffer pool.

**Query**: `GET /api/schedules/buffer-staff?date=YYYY-MM-DD`

**Logic**:
1. Loads schedule by date
2. Collects staff IDs from:
   - `schedule_therapist_allocations.staff_id`
   - `schedule_pca_allocations.staff_id`
   - Keys in `staff_overrides`
3. For each referenced staff ID:
   - Checks `baseline_snapshot.staff` first (if present)
   - Falls back to live `staff.status` if missing from snapshot
   - Includes if `status === 'buffer'`
4. Returns full `Staff` objects for buffer staff found

**Response**:
```typescript
{
  bufferStaff: Staff[]
}
```

**Usage**: Copy wizard calls this endpoint to show buffer staff actually used in source schedule, not global buffer pool.

---

### 8. Working Day Helpers

**Location**: `lib/utils/dateHelpers.ts`

**New Functions**:
- `isWorkingDay(date: Date): boolean` - Returns false for weekends AND HK public holidays/Sundays
- `getNextWorkingDay(date: Date): Date` - Finds next Mon-Fri (excluding holidays)
- `getPreviousWorkingDay(date: Date): Date | null` - Finds previous Mon-Fri (excluding holidays)

**Integration**: Uses `isHongKongHoliday()` from `lib/utils/hongKongHolidays.ts` to exclude holidays.

---

### 9. Calendar Grid Enhancements

**Component**: `components/ui/calendar-grid.tsx`

**New Props**:
- `isDateDisabled?: (date: Date) => boolean` - Optional function to disable specific dates

**Usage in Copy Wizard**:
- Disables weekends and HK holidays
- For "Copy TO": disables dates with existing data
- For "Copy FROM": disables dates without data

---

## Known Issues / Edge Cases

### 1. Legacy Schedules Without Snapshots
- **Issue**: Old schedules created before this change have empty `baseline_snapshot`
- **Current Behavior**: Falls back to live dashboard tables (still subject to contamination)
- **Solution**: Copy API builds snapshot when copying from legacy schedule, but existing legacy schedules remain vulnerable until manually copied or snapshot is built on first save

### 2. Buffer Staff in Baseline Snapshot
- **Issue**: If buffer staff is created AFTER schedule snapshot was taken, it won't appear in baseline
- **Current Behavior**: Copy API falls back to live `staff.status` for referenced IDs missing from snapshot
- **Future Enhancement**: On save, merge any newly referenced staff (especially buffer) into baseline snapshot

### 3. Snapshot Size
- **Consideration**: Large snapshots (many staff/wards/programs) stored as JSONB
- **Current**: No size limits enforced
- **Monitoring**: Watch for performance issues with very large snapshots

---

## Testing Checklist

- [ ] Create new blank schedule → verify snapshot created immediately
- [ ] Copy full schedule → verify all data copied including workflow_state
- [ ] Copy hybrid schedule → verify Step 3+ reset, Step 1+2 preserved
- [ ] Copy with buffer staff excluded → verify buffer staff converted to inactive in target
- [ ] Copy from legacy schedule (no snapshot) → verify snapshot built during copy
- [ ] Edit schedule after copy → verify edits don't affect source schedule
- [ ] Copy "to next working day" → verify dates auto-resolved correctly
- [ ] Copy "from a specific date" → verify calendar grid disables correct dates
- [ ] Buffer staff detection → verify shows only buffer staff actually used in source
- [ ] Workflow state persistence → verify step completion tracked correctly

---

## Next Steps / Future Enhancements

1. **Snapshot Merging on Save**
   - When saving, merge any newly referenced staff (especially buffer staff created after snapshot) into baseline snapshot
   - Prevents "baseline missing buffer row" blind spots

2. **History Page Integration**
   - Use `workflow_state.completedSteps` to determine completion badges
   - More accurate than inferring from allocations

3. **Snapshot Validation**
   - Add runtime validation when loading snapshot (check for required fields)
   - Handle corrupted/incomplete snapshots gracefully

4. **Performance Optimization**
   - Consider indexing JSONB columns if query performance degrades
   - Monitor snapshot size and consider compression if needed

5. **Migration Script**
   - Optional: Build snapshots for all existing schedules (one-time migration)
   - Would eliminate cross-date contamination for legacy schedules

---

## File Changes Summary

### New Files
- `app/api/schedules/copy/route.ts` - Copy API endpoint
- `app/api/schedules/buffer-staff/route.ts` - Buffer staff detection endpoint
- `components/allocation/ScheduleCopyWizard.tsx` - Copy wizard UI component
- `supabase/migrations/add_daily_schedule_snapshots.sql` - Database migration

### Modified Files
- `app/(dashboard)/schedule/page.tsx` - Snapshot creation/application, copy UI integration, workflow state persistence
- `lib/utils/dateHelpers.ts` - Working day helpers with HK holiday support
- `components/ui/calendar-grid.tsx` - Added `isDateDisabled` prop
- `types/schedule.ts` - Added `BaselineSnapshot`, `WorkflowState`, `ScheduleStepId` types
- `lib/supabase/types.ts` - Updated `daily_schedules` type to include new JSONB columns
- `supabase/schema.sql` - Updated schema to include new columns

---

## Architecture Notes

### Data Flow for Copy Operation

```
User clicks "Copy to next working day"
  ↓
Schedule page determines source/target dates
  ↓
Opens ScheduleCopyWizard with flowType='next-working-day'
  ↓
User selects Full/Partial copy (Step 2)
  ↓
Wizard fetches buffer staff from /api/schedules/buffer-staff?date=sourceDate
  ↓
User confirms include/exclude buffer (Step 3)
  ↓
Wizard calls onConfirmCopy() → POST /api/schedules/copy
  ↓
Copy API:
  1. Loads source schedule (with baseline_snapshot, staff_overrides, workflow_state)
  2. Builds snapshot if missing (from current dashboard state)
  3. Detects buffer staff from source allocations + staff_overrides
  4. Filters/clones allocations based on mode and includeBufferStaff
  5. Updates target schedule with snapshot, overrides, workflow_state
  ↓
Schedule page navigates to target date and reloads
```

### Snapshot Isolation Guarantee

Once a schedule has a non-empty `baseline_snapshot`:
- Dashboard edits (staff changes, ward changes, etc.) do NOT affect that schedule
- Schedule always uses frozen snapshot data
- Only way to update snapshot is via explicit copy operation (which builds new snapshot)

---

## Related Documentation

- Original plan: `.cursor/plans/per-date_data_isolation_1bad69f4.plan.md`
- Journal: `journal.md` (Phase 13+)
- Database type safety rules: `.cursor/rules/` (database types, TypeScript strict mode)

---

**End of WIP Document**
