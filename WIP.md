# Work In Progress - Per-Date Snapshot & Copy Functionality

**Last Updated**: 2026-01-07  
**Status**: Implementation Complete - Enhanced with Validation & UX Polish  
**Related Plans**: 
- `.cursor/plans/per-date_data_isolation_1bad69f4.plan.md`
- `.cursor/plans/snapshot_validation+repair_a12759be.plan.md`

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
- `BaselineSnapshotEnvelope` interface (versioned: `schemaVersion`, `createdAt`, `source`)
- `BaselineSnapshotStored` type (envelope or legacy raw)
- `WorkflowState` interface with `ScheduleStepId` type
- `SnapshotHealthReport` interface (runtime validation status)
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

**History Page Integration** (Completed):
- History page now uses `workflow_state.completedSteps` to determine completion badges
- Falls back to allocation-based inference for legacy schedules without `workflow_state`
- More accurate than inferring from allocations alone

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

### 10. Versioned Snapshot Envelope

**Location**: `lib/utils/snapshotEnvelope.ts`

**Purpose**: Make snapshots self-describing and versioned for future schema evolution.

**Envelope Structure**:
```typescript
{
  schemaVersion: 1
  createdAt: string  // ISO timestamp
  source: 'save' | 'copy' | 'migration'
  data: BaselineSnapshot  // Actual snapshot payload
}
```

**Backward Compatibility**:
- Legacy raw snapshots (no `schemaVersion`) are automatically wrapped at runtime
- Copy API upgrades legacy snapshots to envelope format opportunistically
- All new snapshots are stored as v1 envelopes

**Files**:
- `lib/utils/snapshotEnvelope.ts` - Envelope creation/unwrapping utilities
- `app/(dashboard)/schedule/page.tsx` - Uses envelope for all snapshot operations
- `app/api/schedules/copy/route.ts` - Creates/upgrades envelopes during copy

---

### 11. Snapshot Validation & Auto-Repair

**Location**: `lib/utils/snapshotValidation.ts`

**Purpose**: Prevent crashes from corrupted/incomplete snapshots and automatically repair missing data.

**Validation Rules**:
- Checks snapshot structure (required keys, array types)
- Deduplicates staff by `id`
- Normalizes invalid fields:
  - Missing/invalid `status` → defaults to `'active'`
  - Invalid `team` → `null`
  - Invalid `rank` → row dropped

**Repair Logic**:
- If `data.staff` is empty OR missing referenced staff IDs, fetches live staff rows for **referenced IDs only** and merges them in
- Marks report as `status: 'repaired'` with issues like `emptyStaffArray`, `missingReferencedStaffRows`, `wrappedLegacySnapshot`

**Auto-Repair on Save**:
- When saving, if validation reports `status !== 'ok'` OR snapshot was merged with missing staff, persists the repaired snapshot back to `daily_schedules.baseline_snapshot`
- Ensures legacy schedules converge to healthy state naturally

**Runtime Validation**:
- Runs on schedule load (before `applyBaselineSnapshot()`)
- Also used in copy/buffer detection APIs to avoid brittle assumptions
- Produces `SnapshotHealthReport` for observability

**Files**:
- `lib/utils/snapshotValidation.ts` - Validation/repair utilities
- `app/(dashboard)/schedule/page.tsx` - Wires validator into load/save paths
- `app/api/schedules/copy/route.ts` - Validates source snapshot before copy
- `app/api/schedules/buffer-staff/route.ts` - Validates snapshot when detecting buffer staff

---

### 12. Admin Diagnostics & UX Polish

**Admin Tooltip Diagnostics**:
- Admin users see diagnostic info in hover tooltip over "Copy" button
- Shows snapshot health (`ok|repaired|fallback`), issues list, staff coverage, snapshot metadata
- Copy dropdown restored to normal white background for all users

**Copy Success Feedback**:
- Copy wizard auto-closes after successful copy
- Bottom-right fixed toast notification (pale yellow, auto-dismisses after 2s)
- Date label briefly glows/highlights for 2s after navigation to new schedule
- Non-blocking: `loadDatesWithData()` called in background (no await)

**Save Success Feedback**:
- Replaced browser `alert()` with same bottom-right toast style for consistency
- Error messages also use toast (no browser alerts)

**Files**:
- `app/(dashboard)/schedule/page.tsx` - Toast system, date glow animation, admin tooltip
- `components/ui/tooltip.tsx` - Enhanced to support ReactNode content for diagnostic panel

---

## Known Issues / Edge Cases

### 1. Legacy Schedules Without Snapshots
- **Issue**: Old schedules created before this change have empty `baseline_snapshot`
- **Current Behavior**: Falls back to live dashboard tables (still subject to contamination)
- **Solution**: Copy API builds snapshot when copying from legacy schedule, but existing legacy schedules remain vulnerable until manually copied or snapshot is built on first save

### 2. Buffer Staff in Baseline Snapshot
- **Issue**: If buffer staff is created AFTER schedule snapshot was taken, it won't appear in baseline
- **Current Behavior**: Auto-repair on save merges any newly referenced staff (including buffer) into baseline snapshot
- **Status**: Resolved via snapshot validation/repair system

### 3. Snapshot Size
- **Consideration**: Large snapshots (many staff/wards/programs) stored as JSONB
- **Current**: No size limits enforced
- **Monitoring**: Watch for performance issues with very large snapshots

---

## Testing Checklist

- [ x] Create new blank schedule → verify snapshot created immediately
- [ x] Copy full schedule → verify all data copied including workflow_state
- [ x] Copy hybrid schedule → verify Step 3+ reset, Step 1+2 preserved
- [ ] Copy with buffer staff excluded → verify buffer staff converted to inactive in target
- [x ] Copy from legacy schedule (no snapshot) → verify snapshot built during copy
- [ x] Edit sched ule after copy → verify edits don't affect source schedule
- [ x] Copy "to next working day" → verify dates auto-resolved correctly
- [ x] Copy "from a specific date" → verify calendar grid disables correct dates
- [ x] Buffer staff detection → verify shows only buffer staff actually used in source
- [ x] Workflow state persistence → verify step completion tracked correctly

---

## Next Steps / Future Enhancements

1. **Performance Optimization** (Planned)
   - Conditional snapshot refresh: skip if health is ok and no team changes
   - Batch allocation writes: use bulk `upsert()` instead of per-row operations
   - RPC/server-side transactions: create `save_schedule_v1()` and `copy_schedule_v1()` Postgres functions
   - Snapshot size reduction: store only required fields (minimal projections)
   - See `.cursor/plans/performance_optimization_save,_copy,_snapshot_size_fe7e0987.plan.md`

2. **Migration Script**
   - Optional: Build snapshots for all existing schedules (one-time migration)
   - Would eliminate cross-date contamination for legacy schedules

3. **Snapshot Compression** (If Needed)
   - Monitor snapshot size and consider compression if performance degrades
   - Consider indexing JSONB columns if query performance degrades

---

## File Changes Summary

### New Files
- `app/api/schedules/copy/route.ts` - Copy API endpoint
- `app/api/schedules/buffer-staff/route.ts` - Buffer staff detection endpoint
- `components/allocation/ScheduleCopyWizard.tsx` - Copy wizard UI component
- `supabase/migrations/add_daily_schedule_snapshots.sql` - Database migration
- `lib/utils/snapshotEnvelope.ts` - Versioned snapshot envelope utilities
- `lib/utils/snapshotValidation.ts` - Snapshot validation and auto-repair logic

### Modified Files
- `app/(dashboard)/schedule/page.tsx` - Snapshot creation/application, copy UI integration, workflow state persistence, validation/repair, admin diagnostics, toast notifications, date glow animation
- `app/(dashboard)/history/page.tsx` - Uses `workflow_state.completedSteps` for completion badges
- `lib/utils/dateHelpers.ts` - Working day helpers with HK holiday support
- `lib/utils/scheduleHistory.ts` - Added `getCompletionStatusFromWorkflow()` with legacy fallback
- `components/ui/calendar-grid.tsx` - Added `isDateDisabled` prop
- `components/ui/tooltip.tsx` - Enhanced to support ReactNode content for admin diagnostic panel
- `types/schedule.ts` - Added `BaselineSnapshot`, `BaselineSnapshotEnvelope`, `BaselineSnapshotStored`, `WorkflowState`, `ScheduleStepId`, `SnapshotHealthReport` types
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
