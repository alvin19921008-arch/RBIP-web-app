---
name: Schedule History Page
overview: Create a history page that displays all schedules with data, grouped by month, with batch delete functionality and navigation to schedule page.
todos:
  - id: create_history_query
    content: Create data query function to fetch all schedules with any allocation data, grouped and sorted by month
    status: completed
  - id: create_schedule_entry_component
    content: Create ScheduleHistoryList component for individual schedule entries with date, weekday, badge, checkbox, and delete button
    status: completed
  - id: create_month_section_component
    content: Create MonthSection component with month header, select all button, and scrollable container (max 7 entries)
    status: completed
    dependencies:
      - create_schedule_entry_component
  - id: create_delete_dialog
    content: Create DeleteConfirmDialog component with warning message and confirmation
    status: completed
  - id: implement_batch_delete
    content: Implement batch delete functionality with selection state management and month-level select all
    status: completed
    dependencies:
      - create_delete_dialog
  - id: implement_navigation
    content: Implement navigation to schedule page with date parameter and back button support
    status: completed
  - id: implement_completion_detection
    content: Implement logic to detect schedule completion status and display appropriate badges
    status: completed
    dependencies:
      - create_history_query
  - id: integrate_history_page
    content: Integrate all components into history page with proper state management and error handling
    status: completed
    dependencies:
      - create_month_section_component
      - implement_batch_delete
      - implement_navigation
      - implement_completion_detection
---

# Schedule History Page Implementation

## Overview

Create a comprehensive history page that displays all schedules with any fillable data, organized by month, with batch delete capabilities and navigation to individual schedules.

## Files to Create/Modify

### 1. `app/(dashboard)/history/page.tsx`

Main history page component that:

- Queries all schedules with data (therapist allocations, PCA allocations, or bed allocations)
- Groups schedules by month (latest months first, latest dates within month first)
- Displays schedules in scrollable containers (max 7 entries per month)
- Implements batch delete with select all functionality
- Shows completion status badges for incomplete schedules
- Provides navigation to schedule page with back button support

### 2. `components/history/ScheduleHistoryList.tsx` (New)

Component for displaying schedule entries with:

- Date and weekday display
- Completion status badge (for incomplete schedules)
- Checkbox for batch selection
- Individual delete button
- Click handler to navigate to schedule page

### 3. `components/history/MonthSection.tsx` (New)

Component for each month section that:

- Displays month name (e.g., "Dec, Nov")
- Shows "Select All" button for that month
- Contains scrollable container (max 7 entries, overflow scroll)
- Handles month-level selection state

### 4. `components/history/DeleteConfirmDialog.tsx` (New)

Dialog component for deletion confirmation that:

- Shows warning about irreversibility
- Displays count of schedules to be deleted
- Provides confirm/cancel buttons
- Matches existing dialog patterns in the app

## Implementation Details

### Data Query Strategy

Query `daily_schedules` table and join with allocation tables to find schedules with data:

```sql
SELECT DISTINCT ds.id, ds.date, ds.created_at, ds.updated_at
FROM daily_schedules ds
LEFT JOIN schedule_therapist_allocations ta ON ta.schedule_id = ds.id
LEFT JOIN schedule_pca_allocations pa ON pa.schedule_id = ds.id
LEFT JOIN schedule_bed_allocations ba ON ba.schedule_id = ds.id
WHERE ta.id IS NOT NULL OR pa.id IS NOT NULL OR ba.id IS NOT NULL
ORDER BY ds.date DESC
```

### Month Grouping Logic

1. Parse dates and group by year-month
2. Sort months: latest year-month first (handle Dec 2025 → Jan 2026 edge case)
3. Within each month, sort dates: latest first
4. Format month names: "Dec 2025", "Nov 2025" (abbreviated month name)

### Completion Status Detection

Determine completion status by checking which allocation tables have data:

- **Complete**: Has therapist allocations AND PCA allocations AND bed allocations
- **Step 3.2**: Has therapist allocations AND PCA allocations (but may be incomplete)
- **Step 2**: Has therapist allocations only
- **Step 1**: Has only staff overrides (leave/FTE data) - stored in allocations with leave_type

### UI Components Structure

```
HistoryPage
├── Header (title, batch delete button when items selected)
├── MonthSection[] (for each month)
│   ├── Month Header (month name, select all button)
│   └── ScrollableContainer (max-height for 7 entries)
│       └── ScheduleHistoryList[] (schedule entries)
│           ├── Checkbox
│           ├── Date + Weekday
│           ├── Completion Badge (if incomplete)
│           ├── Click area (navigate to schedule)
│           └── Delete button
└── DeleteConfirmDialog
```

### Batch Delete Implementation

Reference `components/dashboard/StaffProfilePanel.tsx` patterns:

- Use `Set<string>` for selected schedule IDs
- "Select All" button per month toggles all schedules in that month
- Batch delete button appears when any schedules are selected
- Confirmation dialog shows count and warning

### Navigation Implementation

- Use Next.js router to navigate: `router.push('/schedule?date=YYYY-MM-DD')`
- Store return path in sessionStorage or query param for back button
- Schedule page should check for return path and show back button

### Scrollable Container

- Max height calculated for 7 entries (estimate ~50px per entry = 350px)
- Use `overflow-y-auto` with custom scrollbar styling
- Match StaffProfilePanel scrollable table pattern

## Edge Cases to Handle

1. **Month Boundary**: Dec 2025 → Jan 2026 sorting (compare year-month as tuple)
2. **Incomplete Data**: Schedules with partial allocations (show badge)
3. **Empty Months**: Skip months with no schedules
4. **Large Datasets**: Consider pagination if >100 schedules (future enhancement)
5. **Timezone**: Use date strings consistently (YYYY-MM-DD format)

## Visual Layout Draft

```
┌─────────────────────────────────────────────────────────┐
│ Schedule History                    [Delete Selected (3)]│
├─────────────────────────────────────────────────────────┤
│                                                           │
│ ┌─ December 2025 ───────────────────────────────────┐  │
│ │ [Select All]                                        │  │
│ │ ┌────────────────────────────────────────────────┐ │  │
│ │ │ ☑ 2025-12-31 (Fri) [Complete]        [🗑️]    │ │  │
│ │ │ ☐ 2025-12-30 (Thu) [Step 3.2]         [🗑️]    │ │  │
│ │ │ ☐ 2025-12-29 (Wed) [Complete]          [🗑️]    │ │  │
│ │ │ ☐ 2025-12-28 (Tue) [Step 2]            [🗑️]    │ │  │
│ │ │ ☐ 2025-12-27 (Mon) [Complete]          [🗑️]    │ │  │
│ │ │ ☐ 2025-12-26 (Fri) [Complete]          [🗑️]    │ │  │
│ │ │ ☐ 2025-12-25 (Thu) [Complete]          [🗑️]    │ │  │
│ │ │ ☐ 2025-12-24 (Wed) [Complete]          [🗑️]    │ │  │
│ │ └────────────────────────────────────────────────┘ │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                           │
│ ┌─ November 2025 ───────────────────────────────────┐  │
│ │ [Select All]                                        │  │
│ │ ┌────────────────────────────────────────────────┐ │  │
│ │ │ ☐ 2025-11-30 (Fri) [Complete]          [🗑️]    │ │  │
│ │ │ ... (scrollable if >7 entries)                 │ │  │
│ │ └────────────────────────────────────────────────┘ │  │
│ └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Testing Considerations

1. Test with schedules spanning multiple months/years
2. Test with incomplete schedules (various steps)
3. Test batch delete with mixed selections
4. Test navigation and back button functionality
5. Test edge case: Dec 2025 → Jan 2026 transition
6. Test with empty history (no schedules)
7. Test scrollable containers with >7 entries

## Dependencies

- Reuse existing UI components: `Card`, `Button`, `Checkbox`, `Dialog`
- Use `createClientComponentClient` from `@/lib/supabase/client`
- Use `useRouter` from `next/navigation` for navigation
- Reuse `getWeekday` function from schedule page or create utility
- Use date formatting utilities (date-fns or native Date methods)