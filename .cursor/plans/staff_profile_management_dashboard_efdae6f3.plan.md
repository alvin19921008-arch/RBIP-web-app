---
name: Staff Profile Management Dashboard
overview: Create a new "Staff Profile" category in the dashboard that allows full CRUD operations for staff data, including adding/editing/deleting staff, managing active/inactive status, and integrating with the schedule page to filter inactive staff.
todos:
  - id: migration_active
    content: Create migration to add 'active' boolean column to staff table
    status: completed
  - id: migration_specialty
    content: Create migration to convert specialty values in spt_allocations to dropdown options
    status: completed
  - id: update_types
    content: Update TypeScript types to include active field in Staff interface
    status: completed
    dependencies:
      - migration_active
  - id: create_staff_profile_panel
    content: Create StaffProfilePanel component with table view, filters, and batch operations
    status: completed
    dependencies:
      - update_types
  - id: create_staff_edit_dialog
    content: Create StaffEditDialog component with all form fields and validation logic
    status: completed
    dependencies:
      - update_types
  - id: update_dashboard_sidebar
    content: Add 'Staff Profile' category to DashboardSidebar
    status: completed
  - id: update_dashboard_page
    content: Add Staff Profile category handling in dashboard page
    status: completed
    dependencies:
      - create_staff_profile_panel
      - update_dashboard_sidebar
  - id: update_spt_panel
    content: Change specialty field from text input to dropdown in SPTAllocationPanel
    status: completed
    dependencies:
      - migration_specialty
  - id: create_inactive_staff_pool
    content: Create InactiveStaffPool component for schedule page
    status: completed
    dependencies:
      - update_types
  - id: update_schedule_page_filter
    content: Update schedule page to filter only active staff for allocations
    status: completed
    dependencies:
      - update_types
  - id: update_staff_pool
    content: Integrate InactiveStaffPool into StaffPool component
    status: completed
    dependencies:
      - create_inactive_staff_pool
  - id: test_integration
    content: Test all CRUD operations, filters, and schedule page integration
    status: pending
    dependencies:
      - update_dashboard_page
      - update_schedule_page_filter
      - update_staff_pool
      - update_spt_panel
---

# Staff Profile Management Dashboard

## Overview

Create a comprehensive Staff Profile management interface in the dashboard that allows users to view, filter, add, edit, and delete staff records. This includes adding a new `active` boolean field to the staff table, managing staff properties, and integrating inactive staff display in the schedule page.

## Database Changes

### 1. Add `active` column to `staff` table

**Migration**: `supabase/migrations/add_active_column_to_staff.sql`

```sql
-- Add 'active' column to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Set all existing staff to active by default
UPDATE staff SET active = true WHERE active IS NULL;
```

### 2. Update `specialty` in `spt_allocations` to dropdown values

**Migration**: `supabase/migrations/migrate_spt_specialty_to_dropdown.sql`

- Map existing specialty values to new dropdown options:
  - Variations of "MSK", "Musculoskeletal", "Ortho", "Orthopedic" → "MSK/Ortho"
  - Variations of "Cardiac", "Cardio", "Cardiology" → "Cardiac"
  - Variations of "Neuro", "Neurology", "Neurological" → "Neuro"
  - Variations of "Cancer", "Oncology" → "Cancer"
  - Everything else → NULL
- Update SPTAllocationPanel to use dropdown instead of text input

## Component Structure

### New Files to Create

1. **`components/dashboard/StaffProfilePanel.tsx`** - Main panel component
2. **`components/dashboard/StaffEditDialog.tsx`** - Dialog for adding/editing staff (separate from existing allocation edit dialog)
3. **`components/allocation/InactiveStaffPool.tsx`** - Component for inactive staff in schedule page

### Files to Modify

1. **`app/(dashboard)/dashboard/page.tsx`** - Add "Staff Profile" category
2. **`components/dashboard/DashboardSidebar.tsx`** - Add Staff Profile to categories
3. **`app/(dashboard)/schedule/page.tsx`** - Filter active staff, add inactive staff pool
4. **`components/allocation/StaffPool.tsx`** - Add inactive staff pool container
5. **`components/dashboard/SPTAllocationPanel.tsx`** - Change specialty from text to dropdown
6. **`types/staff.ts`** - Add `active?: boolean` to Staff interface
7. **`lib/supabase/types.ts`** - Update TypeScript types

## Visual Layouts

### Staff Profile Panel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Staff Profile                                                   │
│ Manage staff records and configurations                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Filters:                                                        │
│ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────┐│
│ │ Rank: All ▼ │ │ Special Prog:│ │ Floor PCA:  │ │ Status:  ││
│ │             │ │ All ▼        │ │ All ▼       │ │ All ▼    ││
│ └─────────────┘ └──────────────┘ └─────────────┘ └──────────┘│
│                                                                 │
│ [+ Add New Staff]  [Delete Selected (2)]                       │
│                                                                 │
│ Staff List:                                                     │
│ ┌────────────────────────────────────────────────────────────┐│
│ │ ☑ Name        │ Rank │ Team │ Floating │ Floor │ Program ││
│ │               │      │      │          │       │         ││
│ ├────────────────────────────────────────────────────────────┤│
│ │ ☑ John Doe    │ SPT  │ FO   │ --       │ --    │ CRP     ││
│ │               │      │      │          │       │         ││
│ │ ☐ Jane Smith  │ APPT │ SMM  │ --       │ --    │ --      ││
│ │               │      │      │          │       │         ││
│ │ ☐ ...         │ ...  │ ...  │ ...      │ ...   │ ...     ││
│ │               │      │      │          │       │         ││
│ ├────────────────────────────────────────────────────────────┤│
│ │ ───────────────────────────────────────────────────────────││
│ │ (Divider: Active / Inactive)                                ││
│ ├────────────────────────────────────────────────────────────┤│
│ │ ☐ Inactive 1  │ SPT  │ --   │ --       │ --    │ --      ││
│ │               │      │      │          │       │         ││
│ │ ☐ Inactive 2  │ PCA  │ --   │ Yes      │ Upper │ --      ││
│ └────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Each row shows:                                                │
│ - Checkbox (for batch delete)                                  │
│ - Name (clickable for inline edit - auto-saves to DB on blur/Enter)│
│ - Rank                                                          │
│ - Team (or "--" if null)                                       │
│ - Floating (Yes/No or "--" if not PCA)                         │
│ - Floor PCA (Upper/Lower/Both or "--" if not PCA)             │
│ - Special Program (comma-separated or "--" if null)            │
│ - Active/Inactive toggle (at end of row - saves immediately)   │
│ - Edit icon (pencil - opens full edit dialog)                  │
│                                                                 │
│ Editing Behavior:                                              │
│ - Click name → Inline text input → Edit → On blur/Enter → Auto-saves to DB immediately │
│ - Data persists to DB even if user leaves the page after inline edit │
│ - Click edit icon → Opens full edit dialog → Save button saves to DB│
└─────────────────────────────────────────────────────────────────┘
```

### Staff Edit Dialog Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Edit Staff                              [X]                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Staff Name *                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ John Doe                                                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Rank *                                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SPT ▼                                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Team *                                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ FO ▼                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│ (Instructional text for PCA team logic appears here)         │
│                                                               │
│ Special Program                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [Select programs...] ▼                                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ℹ️ Go to Special Programs dashboard for detailed config     │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ (PCA Property section - only shown if rank = PCA)        │ │
│ │                                                           │ │
│ │ Floating *                                                │ │
│ │ ┌─────────────────────┐                                  │ │
│ │ │ Floating ▼          │                                  │ │
│ │ └─────────────────────┘                                  │ │
│ │                                                           │ │
│ │ Floor PCA *                                               │ │
│ │ ┌─────────────────────┐                                  │ │
│ │ │ Both ▼              │                                  │ │
│ │ └─────────────────────┘                                  │ │
│ │                                                           │ │
│ │ Options: Upper / Lower / Both                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ (SPT Property section - only shown if rank = SPT)        │ │
│ │                                                           │ │
│ │ Specialty                                                 │ │
│ │ ┌─────────────────────┐                                  │ │
│ │ │ MSK/Ortho ▼         │                                  │ │
│ │ └─────────────────────┘                                  │ │
│ │ Options: MSK/Ortho / Cardiac / Neuro / Cancer / nil      │ │
│ │                                                           │ │
│ │ ☐ RBIP Overall Supervisor                                │ │
│ │   (can substitute for team heads when needed)            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☑ Active                                                 │ │
│ │ (Default: checked for new staff)                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│                                                               │
│                              [Cancel]  [Save]                │
└──────────────────────────────────────────────────────────────┘
```

### Schedule Page - Inactive Staff Pool

```
┌──────────────────────┐
│ Staff Pool           │
│ [<] [Show All]       │
├──────────────────────┤
│ Therapist Pool       │
│ ▶ SPT                │
│ ▶ APPT               │
│ ▶ RPT                │
├──────────────────────┤
│ PCA Pool             │
│ ▼ PCA                │
│   [PCA cards...]     │
├──────────────────────┤
│ Inactive Staff Pool  │ ← NEW
│ ▼ SPT                │
│   [Inactive SPT...]  │
│ ▶ APPT               │
│ ▶ RPT                │
│ ▶ PCA                │
└──────────────────────┘
```

## Implementation Details

### 1. Staff Profile Panel (`components/dashboard/StaffProfilePanel.tsx`)

**Features:**

- Load all staff from database
- Display in table format with columns: Name, Rank, Team, Floating, Floor PCA, Special Program, Active/Inactive toggle
- Filter by: Rank, Special Program, Floor PCA type, Active/Inactive (combinable filters)
- Sort by: Rank (SPT → APPT → RPT → PCA → inactive), then by name
- Show divider between active and inactive staff
- Batch delete with confirmation dialog
- **Inline name editing**: Click name → text input appears inline → auto-saves to DB on blur/Enter/Escape cancels
- **Full edit dialog**: Click edit icon (pencil) → opens dialog with all fields → Save button saves to DB
- **Active/Inactive toggle** - updates database immediately on change (no dialog)

**Inline Name Editing Details:**

- Click on staff name → converts to editable text input (inline, no dialog)
- On blur (click outside) or Enter key → saves to database immediately
- On Escape key → cancels edit, reverts to original name
- Shows loading state while saving
- Shows error message if save fails
- Updates are persisted to DB - data will be saved even if user leaves the page

**Filter Logic:**

- Rank filter: Multi-select dropdown (SPT, APPT, RPT, PCA, workman)
- Special Program filter: Multi-select from available special programs
- Floor PCA filter: Single select (Upper, Lower, Both, All)
- Active/Inactive filter: Toggle (Active, Inactive, All)
- Filters are combinable (AND logic)

**State Management:**

```typescript
const [staff, setStaff] = useState<Staff[]>([])
const [filteredStaff, setFilteredStaff] = useState<Staff[]>([])
const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set())
const [filters, setFilters] = useState({
  rank: null as StaffRank[] | null,
  specialProgram: null as string[] | null,
  floorPCA: null as 'upper' | 'lower' | 'both' | null,
  active: null as boolean | null,
})
```

### 2. Staff Edit Dialog (`components/dashboard/StaffEditDialog.tsx`)

**Two Ways to Edit:**

1. **Inline name editing** (click name): Quick edit for name only, auto-saves to DB on blur/Enter
2. **Full edit dialog** (click edit icon): Comprehensive edit for all fields, requires Save button

**Opening the Dialog:**

- Full edit dialog can be opened by:

  1. Clicking the edit icon (pencil) in the table row
  2. Clicking "Add New Staff" button (for new staff)

**Important:** Clicking the staff name does NOT open the dialog - it enables inline editing only (no dialog).

**Save Behavior:**

- **Inline name edit**: Auto-saves to DB immediately on blur/Enter - data persists even if user leaves page
- **Full edit dialog**: Requires explicit "Save" button click to persist to database
- Clicking "Cancel" or closing the dialog (X button) discards any changes
- Changes are saved immediately to database when "Save" is clicked
- After save, the dialog closes and the table refreshes to show updated data

**Form Fields:**

- **Staff Name** (required, text input)
- **Rank** (required, dropdown: SPT, APPT, RPT, PCA, workman)
- **Team** (conditional required, dropdown):
  - Required for: SPT, APPT, RPT (therapists)
  - Required for: PCA if floating = false (non-floating)
  - Optional for: PCA if floating = true
  - Instructional text: "If non-floating PCA, team is required"
- **Special Program** (optional, multi-select dropdown)
  - Show reminder: "Go to Special Programs dashboard for detailed configuration"
- **PCA Properties** (only if rank = PCA):
  - **Floating** (required, dropdown: "Floating", "Non-floating")
  - **Floor PCA** (required, dropdown: "Upper", "Lower", "Both")
    - "Both" stores as `['upper', 'lower']` in DB (TEXT[])
- **SPT Properties** (only if rank = SPT):
  - **Specialty** (optional, dropdown: "MSK/Ortho", "Cardiac", "Neuro", "Cancer", "nil")
  - **RBIP Supervisor** (checkbox, updates `spt_allocations.is_rbip_supervisor`)
- **Active** (checkbox, defaults to true for new staff)

**Validation:**

- Name: Required
- Rank: Required
- Team: Required based on rank/floating logic
- Floating: Required if rank = PCA
- Floor PCA: Required if rank = PCA

**Save Logic:**

- If new staff: Insert into `staff` table
- If existing staff: Update `staff` table
- If rank = SPT and specialty changed: Update `spt_allocations.specialty`
- If rank = SPT and RBIP supervisor changed: Update `spt_allocations.is_rbip_supervisor`
- Handle `floor_pca` array conversion: "Both" → `['upper', 'lower']`

### 3. Schedule Page Integration

**Filter Active Staff:**

- In `loadStaff()` function: Add `.eq('active', true)` filter
- Only active staff appear in team columns and staff pool

**Inactive Staff Pool Component (`components/allocation/InactiveStaffPool.tsx`):**

- Similar structure to existing StaffPool
- Show all inactive staff organized by rank (SPT → APPT → RPT → PCA)
- Collapsible by rank (same UX as Therapist Pool)
- Uses same StaffCard component
- No drag-and-drop functionality (display only)

**Integration Points:**

1. Update `loadStaff()` in `schedule/page.tsx` to load both active and inactive
2. Filter active staff for team allocations
3. Pass inactive staff to `StaffPool` component
4. Add `InactiveStaffPool` component after PCA Pool in `StaffPool`

### 4. SPT Allocation Panel Update

**Change Specialty Field:**

- Replace text input with dropdown
- Options: "MSK/Ortho", "Cardiac", "Neuro", "Cancer", "nil" (or empty/NULL)
- Use same mapping logic as Staff Profile dialog

**Migration Strategy:**

- Run migration to map existing values
- Update component to use dropdown
- Ensure backward compatibility

## Database Operations

### Staff CRUD Operations

**Create:**

```typescript
await supabase.from('staff').insert({
  name: string,
  rank: StaffRank,
  team: Team | null,
  special_program: string[] | null,
  floating: boolean,
  floor_pca: ('upper' | 'lower')[] | null,
  active: boolean, // default true
})
```

**Update:**

```typescript
await supabase.from('staff').update({
  name: string,
  rank: StaffRank,
  team: Team | null,
  special_program: string[] | null,
  floating: boolean,
  floor_pca: ('upper' | 'lower')[] | null,
  active: boolean,
}).eq('id', staffId)
```

**Delete:**

```typescript
// Batch delete with confirmation
await supabase.from('staff').delete().in('id', selectedIds)
```

**Toggle Active:**

```typescript
await supabase.from('staff').update({ active: boolean }).eq('id', staffId)
```

**Update Name (Inline Edit):**

```typescript
// Inline name update - called on blur/Enter from table row
const handleInlineNameUpdate = async (staffId: string, newName: string) => {
  const { error } = await supabase
    .from('staff')
    .update({ name: newName })
    .eq('id', staffId)
  
  if (error) {
    // Show error, revert UI to original name
    console.error('Error updating name:', error)
    return false
  }
  // Update succeeds - data is persisted to DB immediately
  return true
}
```

### SPT Allocation Updates

**Update Specialty:**

```typescript
await supabase.from('spt_allocations')
  .update({ specialty: string | null })
  .eq('staff_id', staffId)
```

**Update RBIP Supervisor:**

```typescript
await supabase.from('spt_allocations')
  .update({ is_rbip_supervisor: boolean })
  .eq('staff_id', staffId)
```

## Data Flow

1. **Staff Profile Panel loads** → Fetch all staff from DB
2. **Filters applied** → Client-side filtering (can be optimized to server-side later)
3. **Staff displayed** → Sorted by rank, then name, with active/inactive divider
4. **Name clicked** → Inline text input appears (NO dialog) → Edit → On blur/Enter → Auto-saves to DB immediately
5. **Edit icon clicked** → Open dialog with current staff data
6. **Save clicked in dialog** → Update staff table, update SPT allocations if needed (explicit save, changes persist to DB)
7. **Cancel clicked or dialog closed** → Discard changes, no DB update
8. **Active toggle clicked** → Immediate update to database (no dialog needed)
9. **Delete clicked** → Show confirmation, then delete from database
10. **Schedule page loads** → Filter active staff for allocations, show inactive in separate pool

## Special Considerations

### Floor PCA "Both" Handling

- UI shows: "Both" option in dropdown
- Database stores: `['upper', 'lower']` as TEXT[]
- Conversion logic:
  - Display: Check if array contains both → show "Both", else show individual values
  - Save: "Both" → `['upper', 'lower']`, "Upper" → `['upper']`, "Lower" → `['lower']`

### Specialty Migration

- Map existing values using fuzzy matching:
  - "MSK", "Musculoskeletal", "Ortho", "Orthopedic" → "MSK/Ortho"
  - "Cardiac", "Cardio", "Cardiology" → "Cardiac"
  - "Neuro", "Neurology", "Neurological" → "Neuro"
  - "Cancer", "Oncology" → "Cancer"
  - Everything else → NULL

### RBIP Supervisor Logic

- If staff rank = SPT and RBIP supervisor checkbox is checked:
  - Find or create SPT allocation for this staff
  - Update `is_rbip_supervisor` field
- Reference existing implementation in SPTAllocationPanel for consistency

## Testing Checklist

- [ ] Create new staff with all field combinations
- [ ] Edit existing staff and verify all fields update correctly
- [ ] Test inline name editing: click name, edit, blur/Enter saves to DB
- [ ] Test inline name editing: Escape cancels edit, reverts to original
- [ ] Test inline name editing: verify data persists after leaving page
- [ ] Toggle active/inactive and verify schedule page filtering
- [ ] Test filters (individual and combined)
- [ ] Test batch delete with confirmation
- [ ] Verify inactive staff pool appears in schedule page
- [ ] Verify specialty dropdown in SPT Allocation Panel
- [ ] Verify floor PCA "Both" conversion works correctly
- [ ] Verify RBIP supervisor checkbox updates SPT allocations
- [ ] Verify team validation logic for PCA (floating vs non-floating)
- [ ] Test edge cases: null values, empty arrays, etc.

## Files to Create/Modify

**Create:**

- `components/dashboard/StaffProfilePanel.tsx`
- `components/dashboard/StaffEditDialog.tsx`
- `components/allocation/InactiveStaffPool.tsx`
- `supabase/migrations/add_active_column_to_staff.sql`
- `supabase/migrations/migrate_spt_specialty_to_dropdown.sql`

**Modify:**

- `app/(dashboard)/dashboard/page.tsx` - Add category
- `components/dashboard/DashboardSidebar.tsx` - Add Staff Profile category
- `app/(dashboard)/schedule/page.tsx` - Filter active staff, integrate inactive pool
- `components/allocation/StaffPool.tsx` - Add inactive staff pool
- `components/dashboard/SPTAllocationPanel.tsx` - Change specialty to dropdown
- `types/staff.ts` - Add active field
- `lib/supabase/types.ts` - Update types