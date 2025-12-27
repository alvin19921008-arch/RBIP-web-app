# Database Column Mapping Reference

This document maps what the save function tries to save vs what exists in the database schema.

## schedule_pca_allocations Table

### Columns the Save Function Uses:

| Column Name | Type | Required | Status | Notes |
|------------|------|----------|--------|-------|
| `schedule_id` | UUID | Yes | ✅ Exists | Foreign key to daily_schedules |
| `staff_id` | UUID | Yes | ✅ Exists | Foreign key to staff |
| `team` | team enum | Yes | ✅ Exists | Team assignment |
| `fte_pca` | DECIMAL | Yes | ✅ Exists | Base FTE remaining (1.0 - fteSubtraction) |
| `fte_remaining` | DECIMAL | Yes | ✅ Exists | Remaining FTE after assignments |
| `slot_assigned` | DECIMAL | Yes | ⚠️ Needs Migration | Renamed from `fte_assigned` - tracks assigned slots (0.25 per slot) |
| `leave_type` | leave_type enum | Optional | ✅ Exists | Leave type (converted via toDbLeaveType) |
| `slot1` | team enum | Optional | ✅ Exists | Slot 1 assignment |
| `slot2` | team enum | Optional | ✅ Exists | Slot 2 assignment |
| `slot3` | team enum | Optional | ✅ Exists | Slot 3 assignment |
| `slot4` | team enum | Optional | ✅ Exists | Slot 4 assignment |
| `special_program_ids` | UUID[] | Optional | ✅ Exists | Special program UUIDs (NOT names) |
| `invalid_slot` | INTEGER | Optional | ✅ Exists | Slot that is leave/come back |
| `leave_comeback_time` | TEXT | Optional | ✅ Exists | Time in HH:MM format |
| `leave_mode` | TEXT | Optional | ✅ Exists | 'leave' or 'come_back' |

### Columns NOT Saved (but used in code):

| Column Name | Purpose | Status |
|------------|---------|--------|
| `fte_subtraction` | FTE subtraction from leave | ❌ NOT stored | Calculated from staffOverrides when needed |

### Migration Required:

1. **Rename `fte_assigned` to `slot_assigned`** (if `fte_assigned` exists)
   - OR add `slot_assigned` if neither exists
   - See: `batch_add_missing_columns.sql`

## schedule_therapist_allocations Table

### Columns the Save Function Uses:

| Column Name | Type | Required | Status | Notes |
|------------|------|----------|--------|-------|
| `schedule_id` | UUID | Yes | ✅ Exists | Foreign key to daily_schedules |
| `staff_id` | UUID | Yes | ✅ Exists | Foreign key to staff |
| `team` | team enum | Yes | ✅ Exists | Team assignment |
| `fte_therapist` | DECIMAL | Yes | ✅ Exists | Therapist FTE |
| `fte_remaining` | DECIMAL | Yes | ✅ Exists | Remaining FTE |
| `leave_type` | leave_type enum | Optional | ✅ Exists | Leave type (converted via toDbLeaveType) |
| `slot1` | team enum | Optional | ✅ Exists | Slot 1 assignment |
| `slot2` | team enum | Optional | ✅ Exists | Slot 2 assignment |
| `slot3` | team enum | Optional | ✅ Exists | Slot 3 assignment |
| `slot4` | team enum | Optional | ✅ Exists | Slot 4 assignment |
| `special_program_ids` | UUID[] | Optional | ✅ Exists | Special program UUIDs (NOT names) |
| `is_substitute_team_head` | BOOLEAN | Optional | ✅ Exists | Team head substitution flag |
| `spt_slot_display` | TEXT | Optional | ✅ Exists | 'AM' | 'PM' | null |
| `is_manual_override` | BOOLEAN | Optional | ✅ Exists | Manual override flag |
| `manual_override_note` | TEXT | Optional | ✅ Exists | Custom leave type note |

### All columns exist - no migration needed for therapist allocations.

## How to Apply Migrations

1. **Run the batch migration** in Supabase SQL Editor:
   ```sql
   -- Copy and paste the contents of:
   -- supabase/migrations/batch_add_missing_columns.sql
   ```

2. **Verify columns exist**:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'schedule_pca_allocations'
   ORDER BY column_name;
   ```

3. **Expected result**: Should see `slot_assigned` (not `fte_assigned`)

## Code Compatibility

The code has been updated to:
- ✅ Save using `slot_assigned` (target column name)
- ✅ Load handling both `slot_assigned` and `fte_assigned` (for migration transition)
- ✅ NOT save `fte_subtraction` (calculated from staffOverrides, not stored)

After running the batch migration, the database will match what the code expects.
