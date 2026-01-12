# RBIP Duty List - Project Journal

> **Purpose**: This document serves as a comprehensive reference for the RBIP Duty List web application. It captures project context, data architecture, code rules, and key patterns to ensure consistency across development sessions and new chat agents.

**Last Updated**: 2026-01-12
**Latest Phase**: Phase 22 - Buffer PCA FTE Display Fix & Popover Positioning Enhancement  
**Project Type**: Full-stack Next.js hospital therapist/PCA allocation system  
**Tech Stack**: Next.js 14+ (App Router), TypeScript, Supabase (PostgreSQL), Tailwind CSS, Shadcn/ui

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Core Development Accomplishments](#core-development-accomplishments)
3. [Data Architecture](#data-architecture)
4. [Code Rules & Conventions](#code-rules--conventions)
5. [State Management](#state-management)
6. [Allocation Workflow](#allocation-workflow)
7. [Key Algorithms](#key-algorithms)
8. [Important Patterns](#important-patterns)
9. [Common Pitfalls & Solutions](#common-pitfalls--solutions)

---

## Project Overview

### Purpose
A hospital therapist and PCA (Patient Care Assistant) allocation system that automates daily duty assignments with manual override capabilities. The system manages:
- **Therapist Allocation**: SPT, APPT, RPT staff assignments to teams
- **PCA Allocation**: Non-floating and floating PCA distribution
- **Bed Allocation**: Optimized relieving bed assignments
- **Schedule Management**: Daily schedules with history (5 working days)

### Key Features
- **Step-wise allocation workflow** (5 main steps with sub-steps)
  - Step 1: Leave & FTE management
  - Step 2: Therapist & Non-Floating PCA allocation
    - **Step 2.0**: Special Program Overrides Dialog (ad-hoc/urgent changes to special program allocations)
    - **Step 2.1**: Non-Floating PCA Substitution Dialog (when non-floating PCAs need substitution)
  - Step 3: Floating PCA allocation with interactive wizard (3.0 → 3.1 → 3.2 → 3.3 → 3.4)
  - Step 4: Bed relieving calculation
  - Step 5: Review and finalization
- **Interactive Step 3 Wizard** for floating PCA allocation:
  - **Step 3.0**: Wizard entry point with workflow overview
    - Buffer PCA behavior: if user does not pre-assign buffer PCA, Step 3 algo may assign it; if user pre-assigns before Step 3 algo run, it is treated as `staffOverrides` and the algo preserves that allocation pattern
  - **Step 3.1**: Adjust pending FTE per team and set team priority order
  - **Step 3.2**: Preferred slot reservation and assignment
  - **Step 3.3**: Adjacent slot assignment from special program PCAs
  - **Step 3.4**: Final floating PCA algorithm execution
- **Buffer Staff System**: Temporary staff with configurable FTE for flexible team assignments
- Manual override capabilities at each step
- Special program support (CRP, DRM, Robotic, etc.)
- Preference-based allocation (PCA preferences, team preferences)
- Tie-breaker resolution with user decision persistence
- Role-based access (User vs Admin vs Developer)
- Schedule cloning and history (5 working days)

### Project Structure
```
/app
  /(auth) - Authentication pages
  /(dashboard) - Main application pages
    /schedule - Main allocation page (core workflow)
    /dashboard - Admin dashboard (staff management)
    /history - Schedule history viewer
/components
  /allocation - Allocation UI components
  /dashboard - Dashboard components
  /ui - Shadcn UI components
/lib
  /algorithms - Core allocation algorithms
  /db - Database type safety utilities
  /supabase - Supabase client setup
  /utils - Utility functions
/types - TypeScript type definitions
/supabase - Database schema and migrations
```

---

## Core Development Accomplishments

### Phase 1: Foundation & Basic Allocation
- ✅ Implemented 5-step allocation workflow
- ✅ Therapist allocation algorithm (SPT, APPT, RPT)
- ✅ Non-floating PCA allocation with default team assignments
- ✅ Special program support (CRP, Robotic, etc.)
- ✅ Bed allocation algorithm for relieving
- ✅ Database schema and type safety utilities
- ✅ Staff override system for manual edits

### Phase 2: Floating PCA & Advanced Features
- ✅ Floating PCA allocation algorithm
- ✅ Non-floating PCA substitution (when non-floating has leave)
- ✅ Tie-breaker resolution with user decision persistence
- ✅ Preference-based allocation (PCA preferences, team preferences)
- ✅ DRM special program handling (+0.4 FTE add-on for DRO)
- ✅ Slot-based assignment tracking
- ✅ Leave/come-back time handling

### Phase 3: Interactive Step 3 Wizard
- ✅ **Step 3.0**: Initial wizard entry point with instructional overview
  - Entry point before sub-steps (3.1, 3.2, 3.3)
  - Shows summary of floating PCA allocation workflow
- ✅ **Step 3.1**: Pending FTE adjustment and team priority ordering
  - Compact team cards with adjustable FTE sliders
  - Drag-and-drop reordering within tie-breaker groups
  - Visual indicators (colored borders, arrows)
  - Upper limit constraints
- ✅ **Step 3.2**: Preferred slot reservation and assignment
  - Pre-mapping of preferred PCA + slot combinations
  - Checkbox selection with conflict validation
  - Skip option (reserved slots remain available)
  - Real-time FTE tracking (expected vs assigned)
- ✅ **Step 3.3**: Adjacent slot assignment from special programs
  - Identification of adjacent slots (1↔2, 3↔4)
  - Special program info display
  - Visual distinction (green borders, dark grey borders)
  - Card shrinking for teams with no options
- ✅ **Step 3.4**: Final floating PCA algorithm execution
  - Uses adjusted pending FTE and team order from 3.1-3.3
  - Respects all pre-assignments made in 3.2 and 3.3
- ✅ Data flow architecture ensuring smooth transitions between steps
- ✅ Type safety improvements (TypeScript strict mode compliance)
- ✅ Comprehensive error handling and validation

### Phase 4: Manual Slot Transfers & Step-Based Validation (Latest)
- ✅ **Manual Floating PCA Slot Transfer**
  - Drag-and-drop interface for transferring PCA slots between teams
  - Single-slot PCAs: Direct drag transfers 0.25 FTE
  - Multi-slot PCAs: Popover-based slot selection before transfer
  - Slot transfers stored in `staffOverrides.slotOverrides` structure
  - Updates `assigned_PCA-FTE/team` and `pendingPCA-FTE/team` in real-time
  - Special program slots are non-draggable and reject drops
  - Allocation splitting: PCAs with both special program and regular slots in same team display as separate cards
- ✅ **Step-Based Data Validation**
  - Floating PCA slot transfer: Only allowed in Step 3 ('floating-pca') onwards
  - Therapist transfer: Only allowed in Step 1 ('leave-fte') and Step 2 ('therapist-pca')
  - Leave arrangement editing: Only allowed in Step 1 ('leave-fte')
  - Warning popovers with 5-second auto-dismiss and manual close button
- ✅ **SPT Allocation Step Restriction**
  - SPT allocation (including RBIP supervisor logic) only runs in Step 2 when user clicks "Initialize Algo"
  - Step 1 only registers leave types and FTE remaining, no SPT allocations

### Phase 5: Allocation Stability & SPT Preservation Fixes (Latest)
- ✅ **Avg PCA/Team Stability Fix**
  - Fixed bug where `avg PCA/team` was fluctuating during step transitions
  - Root cause: Calculation was using `totalPCAFromAllocations` (unstable, changes with allocations) instead of `totalPCAOnDuty` (stable, from staff database)
  - Solution: Use `totalPCAOnDuty` (sum of all on-duty PCAs from staff DB) for requirement calculation
  - Added `useEffect` to auto-recalculate `scheduleCalculations` when `therapistAllocations` or `pcaAllocations` change
  - Ensures displayed `avg PCA/team` updates immediately after Step 2 algo adds SPTs to teams
- ✅ **SPT Allocation Preservation Fix**
  - Fixed bug where SPT allocations disappeared when transitioning from Step 2 to Step 3
  - Root cause: `useAllocationSync` was regenerating therapist allocations without preserving SPT allocations
  - Solution: Modified `syncTherapistAllocations()` to preserve existing SPT allocations when `includeSPTAllocation: false`
  - Added optimization to skip full therapist regeneration during Step 2+ → Step 3+ transitions (only updates FTE/leave from `staffOverrides`)
- ✅ **SPT Duplicate Bug Fix**
  - Fixed bug where dragging SPT to another team caused it to appear in both old and new teams
  - Root cause: Preserve logic checked only within the same team, re-adding old allocation to old team
  - Solution: Updated preserve logic to check across ALL teams before preserving SPT allocations
  - Now correctly moves SPTs between teams without creating duplicates
  - Old team's PT/team count no longer includes moved SPTs

### Phase 6: Dashboard Management Panels (Latest)
- ✅ **Ward Config and Bed Stat Dashboard**
  - Ward cards arranged in 5 rows by floor (R7-R11)
  - Edit dialog for ward name and bed number with instructional text
  - Add new wards functionality (automatically placed in respective floor rows)
  - Delete wards with confirmation (only newly added wards can be deleted, initial wards are protected)
  - Database integration with `wards` table
  - Visual layout: Grid-based card display organized by floor level
- ✅ **Team Configuration Dashboard**
  - Team cards with expandable edit mode (similar to PCA preference dashboard)
  - Edit dialog features:
    - Team display name (customizable, e.g., "CPPC+NSM")
    - Team head (APPT) selection with "Current" and "Available to assign" sections
    - Team's RPT selection with separate current/unassigned staff lists
    - Team's non-floating PCA selection with separate current/unassigned staff lists
    - Designated ward & responsible bed number:
      - Checkbox menu to select wards
      - Portion support: "Set portion" / "Edit portion" popover dialog
      - Portion input (e.g., "1/3", "2/3", "3/4") with validation
      - Actual bed number auto-calculated from portion, allows manual override
      - Validation: actual beds cannot exceed ward total beds
      - Display shows portion label (e.g., "1/3 R7A") in team card preview
  - Database integration:
    - `team_settings` table for custom team display names
    - `wards.team_assignment_portions` JSONB column for portion labels
    - `staff.team` updates for staff assignments
  - Inactive staff filtering: Only active staff shown in selection lists and previews
  - Staff assignment logic: Separate tracking for removed vs newly assigned staff
  - Schedule page integration: Block 5 displays portion labels from `team_assignment_portions`
- ✅ **Staff Profile Dashboard**
  - Comprehensive staff management interface
  - Filtering by rank, special program, floor PCA, and active status
  - Sorting by rank, team, floating status, floor PCA, and special program
  - Inline name editing with save/cancel
  - Staff edit dialog for detailed editing
  - Active/inactive status toggle with batch operations
  - **Critical**: When staff set to inactive, `team` property is automatically nullified
  - Batch toggle active/inactive for multiple selected staff
  - Headcount display by rank (SPT, APPT, RPT, PCA, Workman)
  - Visual layout: Table-based display with filtering and sorting controls

### Phase 7: Buffer Staff System (Latest)
- ✅ **Buffer Staff Feature**
  - Buffer staff with `status: 'buffer'` and `buffer_fte` field
  - Buffer therapists (SPT, APPT, RPT): Draggable in Step 1 & 2 only
  - Buffer floating PCA: Draggable in Step 3 onwards
  - Buffer staff pool with separate display from regular staff
  - Buffer staff creation dialog with rank, team, FTE, and special program configuration
  - Tooltip validation: Buffer therapists show "Dragging is only allowed in Step 1 and 2" in Step 3+
  - Step 2 indicator shows buffer therapist assignment status ("detected and assigned" / "detected and not yet assigned")
- ✅ **Algorithm Integration**
  - Buffer staff included in allocation algorithms
  - Buffer therapists can be assigned to teams in Step 1 & 2
  - Buffer floating PCA can be assigned in Step 3
  - Buffer FTE (`buffer_fte`) used instead of default 1.0 FTE
  - Independent dragging: Buffer staff cards maintain separate draggable instances per team assignment
- ✅ **Backend Data Bug Fixes**
  - Fixed type conversion issues for buffer staff data
  - Proper handling of `buffer_fte` DECIMAL precision
  - Status field integration with existing staff management system

### Phase 8: History Page & UI Enhancements
- ✅ **Schedule History Page**
  - Displays all schedules with any allocation data (even partially completed)
  - Grouped by month with latest schedules first within each month
  - Month boundary handling (Dec 2025 → Jan 2026 sorting)
  - Each schedule entry shows: date, weekday name, completion status badge
  - Completion status indicators: 'Step 1', 'Step 2', 'Step 3.2', 'Step 4+' (green badge for complete schedules)
  - Individual schedule navigation to schedule page with return path
  - Batch delete functionality with "Select All" per month
  - Individual delete with confirmation dialog
  - Scrollable month sections (max 7 entries visible, scroll for more)
  - Database integration: Queries `daily_schedules` and checks `schedule_therapist_allocations`, `schedule_pca_allocations`, `schedule_bed_allocations` for data presence
  - Session storage integration: Stores `scheduleReturnPath` for back navigation
- ✅ **Staff Pool Enhancements**
  - Filter button renamed from "FTE ≠ 1" to "On leave" for clarity
  - Auto-expand relevant ranks when "On leave" filter is activated
  - "Retract All" button in Therapist Pool header to collapse all therapist ranks
  - Non-floating PCA staff cards use green border (`border-green-700`) matching schedule page styling
  - Default behavior: Staff pool retracted by default, clicking ">Staff Pool" expands all ranks except inactive staff pool
  - Fixed `getTrueFTERemaining` to skip special program FTE subtraction in Step 1 (only subtracts in Step 2+)
- ✅ **Date Picker Optimization**
  - Non-modal popover positioned near calendar icon (replaces centered modal dialog)
  - Data indicators: Dot (•) displayed below day number for dates with schedule data
  - Past/future date styling: Past dates use `opacity-60` and muted colors, future dates use `font-semibold`
  - Hong Kong public holiday highlighting: Holidays and Sundays displayed in red (`text-red-600 dark:text-red-400`)
  - Holiday tooltips: Hover tooltips show holiday names for public holidays
  - Uses `date-holidays` library for accurate Hong Kong holiday dates
  - Click-outside handler to close popover
  - Dynamic positioning with edge case handling (viewport boundaries)
- ✅ **Checkbox Selection Bug Fix**
  - Fixed checkbox selection issue in history page
  - Root cause: `onClick` prop was overriding Checkbox component's internal `onCheckedChange` handler
  - Solution: Destructured `onClick` from props and merged handlers to call both `onCheckedChange` and prop's `onClick`
  - Excluded `onClick` from spread props using `Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>`

### Phase 17: Bed Relieving Notes Inline Editing & Critical Algorithm Fixes
- ✅ **Inline Bed Relieving Notes Editor (Block 3)**
  - Replaced summary text "Takes/Releases [N] beds from [teams]" with inline editable interface
  - **Taking side (editable)**: Free-text bed number input with ward dropdown selection
    - Ward dropdown shows releasing team's designated wards (e.g., "R9C", "R10A")
    - Auto-resizing textarea for bed numbers (e.g., "5, 6, 7, 8, 9")
    - Multiple rows per releasing team (one row per ward)
    - Auto-focus: Ward dropdown first (if empty), then bed numbers textarea (if ward selected)
    - Radix Select close autofocus prevention to maintain textarea focus after ward selection
  - **Releasing side (read-only, visual feedback)**: 
    - Lines turn grey when counterparty (taking team) has entered bed numbers
    - Entire "Releases" section hidden when all outgoing lines are marked "done"
  - **Display mode**: Team name (left-aligned) and sorted bed numbers (right-aligned), no card containers
  - **Re-edit functionality**: Hover pencil icon per team row for re-editing specific teams
  - **Action buttons**: Icon-only Clear/Cancel/Save with tooltips
  - **Data persistence**: Stored in `staffOverrides.__bedRelieving` (within-day only, not copied across dates)
  - **Validation**: Non-blocking warning if typed bed count doesn't match algorithm's expected count
  - **Component**: `components/allocation/BedBlock.tsx` with state management for edit/display modes
- ✅ **Critical Bed Allocation Algorithm Fix**
  - **Problem**: Block 5 showed decimal bed needs (e.g., NSM: 14.62) but Block 3 allocated fewer beds (e.g., NSM: 3), causing team starvation
  - **Root Cause**: Bed relieving calculations used `totalBedsAllTeams` (raw total, e.g., 533) for "expected beds" but `totalBedsDesignated` (after SHS/students deductions, e.g., 518) for "designated beds", creating impossible positive global sum (+15 beds)
  - **Solution**: Use `totalBedsEffectiveAllTeams` (sum of `totalBedsDesignated` across teams) consistently for both expected beds calculation and bed allocation algorithm
  - **Impact**: Global `bedsForRelieving` sum now equals ~0, enabling proper allocation matching Block 5 targets
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx` (recalculateScheduleCalculations, bedEffect, calculateStep4_BedRelieving), `lib/algorithms/bedAllocation.ts` (roundBedsPreserveSum with sum-preserving rounding)
- ✅ **Summary Column Enhancement**
  - Added "After SHS/students" row in sidebar summary (only shown when any team has SHS/student deductions)
  - Displays effective total beds after deductions for clarity
  - Component: `components/allocation/SummaryColumn.tsx`

### Phase 18: Schedule Loading Optimization & SPT FTE=0 Edge Case Fixes (Latest)
- ✅ **Cold Start Loading Optimization**
  - **Problem**: Initial schedule load after refresh took 8-10 seconds with progressive "Avg PCA/team" value jumps (blank → 1.8125 → final)
  - **Root Cause**: Sequential database queries, repeated client-side calculations, lack of caching, expensive computations during hydration
  - **Solution**: Multi-pronged optimization approach:
    - **Supabase RPC (`load_schedule_v1`)**: Single-round-trip data fetch for all schedule-related data (schedule metadata, therapist/PCA/bed allocations, calculations)
    - **Deferred base data loads**: Non-essential queries (e.g., `loadDatesWithData`) deferred until after main schedule loads
    - **In-memory cache (`scheduleCache`)**: Client-side cache with TTL for fast subsequent navigations
    - **Hydration guards**: Prevented `recalculateScheduleCalculations` calls during initial hydration via `isHydratingSchedule` state
    - **Optimized `loadDatesWithData()`**: Query only `daily_schedules.date` initially, use in-memory cache, perform allocation existence checks in parallel batches
  - **Admin Diagnostic Tooltip**: Hover tooltip on "Schedule Allocation" title showing runtime, optimization features used (RPC, batched queries, pre-calculated values), and detailed timings
  - **Impact**: Reduced cold start time from 8-10s to significantly faster, eliminated progressive value jumps
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`, `lib/utils/scheduleCache.ts`, `lib/hooks/useAllocationSync.ts`, `supabase/migrations/add_load_schedule_rpc.sql`
- ✅ **SPT FTE=0 Edge Case Fix (Aggie Case)**
  - **Problem**: SPT with dashboard `fte_addon = 0` but still on duty (leave type = "On duty (no leave") was incorrectly:
    - Counted as FTE = 1 in team PT/team calculations (causing bloated counts)
    - Displayed as "Aggie 1 AM" instead of "Aggie AM" (showing incorrect FTE prefix)
    - Not auto-selectable in special program substitution dialogs
  - **Root Cause**: Multiple code paths defaulted SPT FTE to 1.0 when `fte_addon = 0`, and "on duty" string normalization was missing
  - **Solution**:
    - **Leave type normalization**: Created `lib/utils/leaveType.ts` with `isOnDutyLeaveType()` helper to handle both `null` and legacy string values ("On duty (no leave)", "none", etc.)
    - **SPT base FTE respect**: All override creation paths now pull SPT base FTE from `spt_allocations.fte_addon` (even if 0) instead of defaulting to 1.0
    - **Therapist block display**: Allow SPT with FTE=0 + on-duty + `spt_slot_display` to appear in team column; display shows slot suffix only (no "1" prefix)
    - **Special program availability**: SPT with FTE=0 + on-duty treated as eligible for special program assignment
    - **Auto-repair legacy overrides**: Existing saved overrides with default 1.0 automatically synced back to dashboard-configured FTE when on duty + leave cost = 0
  - **Impact**: SPT with FTE=0 correctly contribute 0 to PT/team, display correctly, and are eligible for special program auto-selection
  - **Files Modified**: `components/allocation/TherapistBlock.tsx`, `components/allocation/SpecialProgramOverrideDialog.tsx`, `components/allocation/SpecialProgramSubstitutionDialog.tsx`, `app/(dashboard)/schedule/page.tsx`, `lib/algorithms/therapistAllocation.ts`, `lib/utils/leaveType.ts` (new)
- ✅ **CRP Special Program Dialog Fixes**
  - **Problem**: CRP dialog could not auto-select configured therapist (Aggie) or auto-fill therapist FTE subtraction as 0
  - **Root Cause**: Dashboard save logic omitted explicit `0` entries from `fte_subtraction` (only saved values > 0), so Step 2.0 dialog couldn't detect configured runner or auto-fill 0
  - **Solution**:
    - **Dashboard save fix**: For CRP, persist `fte_subtraction` even when value is 0 (if weekday is enabled)
    - **Legacy fallback**: If `fte_subtraction` omits configured runner, infer from staffId-keyed slots structure
    - **Auto-fill default**: If configured CRP therapist found but subtraction missing, default to 0
    - **No auto-fallback**: Restored original behavior - if configured CRP therapist unavailable, show substitution alert (no preference-order/any-therapist fallback)
  - **Impact**: CRP dialog now correctly auto-selects configured therapist and auto-fills 0 when dashboard configured
  - **Files Modified**: `components/dashboard/SpecialProgramPanel.tsx`, `components/allocation/SpecialProgramOverrideDialog.tsx`
- ✅ **Calendar Dots Consistency Fix**
  - **Problem**: Calendar dots showed all dates with `daily_schedules` rows (including "semi-blank" Step 1-only schedules), while History page showed only dates with actual allocations
  - **Solution**: Modified `loadDatesWithData()` to query allocation tables (`schedule_therapist_allocations`, `schedule_pca_allocations`, `schedule_bed_allocations`) and only mark dates with dots if allocation data exists
  - **Impact**: Calendar dots now consistent with History page - both show only dates with saved allocations
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`
- ✅ **Copy Button Disabled Fix**
  - **Problem**: Copy menu buttons (to next/last/specific date) were disabled after initial page load due to deferred `loadDatesWithData()` mounting
  - **Solution**: Pre-fetch `datesWithData` in background after main schedule loads, introduce `datesWithDataLoading` state, display "Loading schedule dates…" placeholder in copy menu when data not yet available
  - **Impact**: Eliminated disabled-to-enabled flicker, copy menu always functional
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`
- ✅ **Calendar Lag Fixes**
  - **Problem**: Calendar in copy wizard was laggy when opening dialog and toggling months
  - **Root Cause**: `isHongKongHoliday()` created new `Holidays('HK')` instances per calendar cell render
  - **Solution**: 
    - Module-level `Holidays('HK')` instance and `yearHolidayCache` for reuse
    - Memoized `isCalendarDateDisabled` with `useCallback` using pre-loaded `holidays` map
    - Local `formatDateIso` function for faster date formatting
  - **Impact**: Calendar opens instantly, month toggling is smooth
  - **Files Modified**: `components/allocation/ScheduleCopyWizard.tsx`, `lib/utils/hongKongHolidays.ts`
- ✅ **Buffer Therapist Detection Fix**
  - **Problem**: Buffer therapists were not detected and excluded when "include buffer staff" option was unchecked during copy operation
  - **Root Cause**: Buffer staff detection only considered staff IDs from allocations/overrides, missing buffer therapists present only in `baseline_snapshot`
  - **Solution**: Modified both `/api/schedules/buffer-staff` and `/api/schedules/copy` to include all staff IDs from `baseline_snapshot` in `referencedIds` set
  - **Impact**: Buffer therapists correctly detected and excluded when `includeBufferStaff = false`
  - **Files Modified**: `app/api/schedules/buffer-staff/route.ts`, `app/api/schedules/copy/route.ts`
- ✅ **Bed Allocation Auto-Show Fix**
  - **Problem**: Bed allocations for completed schedules (Step 4+) only showed after clicking "Step 4 algo button" instead of automatically on initial load
  - **Root Cause**: `useEffect` erroneously clearing loaded bed allocations for completed schedules
  - **Solution**: Fixed `useEffect` logic to preserve bed allocations when schedule is completed (Step 4+)
  - **Impact**: Bed allocations automatically display on initial load for completed schedules
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`
- ✅ **Tooltip Truncation Fix**
  - **Problem**: Admin diagnostic tooltip was truncated on left side of viewport
  - **Solution**: Refactored `Tooltip` component to use direct `left/top` positioning with dynamic measurement and clamping within viewport boundaries
  - **Impact**: Tooltip stays fully visible within viewport
  - **Files Modified**: `components/ui/tooltip.tsx`

### Phase 19: PCA Dedicated Schedule Table & Staff Pool Scroll Isolation (Latest)
- ✅ **PCA Dedicated Schedule Table**
  - **Purpose**: Read-only table presenting PCA allocation data from a PCA-per-column perspective (complement to team-based grid)
  - **Location**: Below entire team grid (Block 6), separate from team grid with independent column widths
  - **Layout**: 
    - Row 1: PCA names (floating → non-floating → buffer, sorted by name)
    - Rows 2-5: Slot assignments (Slot 1-4) showing team assignments per PCA
  - **Display Logic**:
    - **Substitutions**: Team name in green with underline (floating PCA substituting for non-floating)
    - **Leave (full day)**: Merged rows showing "NA" on line 1, leave type in brackets on line 2
    - **Leave (partial)**: Per-slot "NA (leaveType)" display
    - **Invalid slots**: Team name + time interval (HHMM-HHMM) in blue, wrapped to 2 lines
    - **Non-floating PCA (主位)**: Merged available slots showing "Team 主位" (主位 wraps to 2nd line as whole word)
    - **Special programs**: Team name on line 1, program name on line 2 (red text)
  - **Step Gating**: Shows data up to furthest completed step; Step 1 shows leave/invalid slot edits from `staffOverrides`
  - **Scrolling**:
    - Horizontal scrolling with wheel-to-horizontal conversion (carousel-like)
    - Scroll isolation: wheel events inside table container prevent page scroll
    - Auto-hide scrollbar: Shows on mouse enter/move, hides immediately on mouse leave, auto-dismisses after 3s idle
    - Navigation buttons (left/right arrows) with same auto-hide behavior
  - **Refresh Button**: Ghost refresh button to re-render table from current in-memory state
  - **Component**: `components/allocation/PCADedicatedScheduleTable.tsx`
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`, `components/allocation/PCADedicatedScheduleTable.tsx`
- ✅ **Staff Pool Scroll Isolation**
  - **Purpose**: Unified vertical scrollbar for entire Staff Pool list (Therapist Pool + PCA Pool + Buffer Staff Pool + Inactive Staff Pool) with isolated scrolling
  - **Layout Changes**:
    - Left column wrapper uses flex layout with `ResizeObserver` to match right column height (aligns bottom with PCA table)
    - Staff Pool uses single scroll container wrapping all internal cards
    - Summary column stays fixed above scrollable Staff Pool list
  - **Scrolling Behavior**:
    - **Isolated scrolling**: Wheel events inside Staff Pool scroll area prevent page scroll (native `wheel` listener with `passive: false`)
    - **Auto-hide scrollbar**: Same behavior as PCA table (show on enter/move, hide on leave, 3s idle dismiss)
    - **Left-side scrollbar**: Uses `direction: rtl` on scroll container + `direction: ltr` on inner wrapper to position scrollbar on left (avoids clashing with hover edit icon on staff cards)
  - **Component**: `components/allocation/StaffPool.tsx`
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`, `components/allocation/StaffPool.tsx`
- ✅ **Reusable CSS Scrollbar Classes**
  - **Purpose**: Centralized scrollbar styling for consistent appearance across components
  - **Classes**:
    - `.pca-like-scrollbar`: PCA table-style scrollbar (thumb: `#9ca3af`, track: `#e5e7eb`, hover: `#6b7280`)
    - `.pca-like-scrollbar--hidden`: Hides scrollbar completely (for auto-hide behavior)
    - `.scrollbar-visible`: Generic visible scrollbar for checkbox panels (thumb: `#cbd5e1`, track: `#f1f5f9`)
  - **Dark Mode Support**: All scrollbar classes include dark mode variants
  - **Usage**: Apply base class + conditional hidden variant based on visibility state
  - **Files Modified**: `app/globals.css`

### Phase 20: Points to Note Board & Summary Info Box Enhancements (Latest)
- ✅ **Points to Note Board**
  - **Purpose**: Rich-text notes board for general allocation rules and reminders
  - **Location**: Below PCA Dedicated Schedule table, spanning full width of team grid (FO to DRO borders)
  - **Features**:
    - Rich text editing with Tiptap editor (bold, italic, underline, text color, highlight, bullets/numbering)
    - Display mode (renders rich text) and edit mode (toolbar with formatting controls)
    - Toolbar: left-aligned on 2nd line, includes undo/redo (Ctrl/Cmd+Z/Y), bold, italic, underline, text color, highlight (Highlighter icon), bullets/numbering
    - Edit mode: expands up to 15 lines, then scrolls (`max-h-[360px] overflow-y-auto`)
    - Save/Cancel buttons (regular button styling)
    - Dashboard-like state: auto-seeds new schedules from previous working day's saved note
    - Independent of step workflow (editable in any step)
  - **Data Storage**: Stored in `daily_schedules.staff_overrides.__allocationNotes` (JSONB with Tiptap document structure)
  - **Integration**: Integrated with snapshot, copy/save, and fast-loading (RPC, caching, batch queries) features
  - **Component**: `components/allocation/AllocationNotesBoard.tsx`
  - **RPC**: `update_schedule_allocation_notes_v1` for immediate persistence without affecting other `staff_overrides`
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`, `components/allocation/AllocationNotesBoard.tsx`, `lib/utils/scheduleCache.ts`, `supabase/migrations/add_update_allocation_notes_rpc.sql`, `types/schedule.ts`
- ✅ **Summary Info Box Enhancements**
  - **Total PCA**: Label changed to "Total PCA" (removed "FTE"), displays "regular + buffer" when buffer exists, tooltip shows breakdown + leave/sick leave FTE costs
  - **Total PT**: Displays "regular + buffer" when buffer exists, tooltip shows breakdown + leave/sick leave FTE costs (SPT-aware: only counts on configured weekdays using `fte_addon`)
  - **After SHS/students**: Tooltip shows SHS and Student bed totals breakdown
  - **Leave/Sick Leave**: Tooltips display FTE cost totals (not headcount), with 2 decimal precision (no rounding)
  - **SPT-Aware Calculations**: PT totals and leave counts respect SPT weekday service and `fte_addon` (0.5, etc.), excluding SPT not scheduled for current weekday
  - **Component**: `components/allocation/SummaryColumn.tsx`
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`, `components/allocation/SummaryColumn.tsx`
- ✅ **UI Enhancements**
  - **Sticky Team Header**: Excel-like freeze effect - team header row (FO/SMM/...) stays visible at top when scrolling down, disappears when entire grid scrolls out of view
  - **Horizontal Scroll Sync**: Header and grid scroll horizontally in sync (bidirectional)
  - **Minimum Page Width**: Added `min-w-[1360px]` to prevent squishing on narrow viewports (horizontal scroll instead)
  - **Navigation Icons**: Added SVG icons to top nav bar (CalendarDays for Schedule, LayoutDashboard for Dashboard, History for History)
  - **Step Indicator Compactness**: Reduced vertical padding for more compact layout
  - **Copy Wizard Wording**: Updated to "Choose how much of the source schedule to copy from YYYY-MM-DD to YYYY-MM-DD" with `whitespace-nowrap` for dates
  - **Toast Alignment**: Fixed vertical centering for single-line notification text
  - **Files Modified**: `app/(dashboard)/schedule/page.tsx`, `components/layout/Navbar.tsx`, `components/allocation/StepIndicator.tsx`, `components/allocation/ScheduleCopyWizard.tsx`, `components/ui/action-toast.tsx`

### Phase 21: Account Management, Access Roles, Step Clear & Step Validation Enhancements
- ✅ **Account Management Dashboard**
  - New Dashboard panel: list/create/edit/delete accounts + batch delete
  - Columns: username, email (nullable), created date, access badge + dropdown
  - Developer-only: shows internal auth email (e.g. `username@rbip.local`) and can reset other users’ passwords
  - Admin: can manage non-developer accounts only; cannot assign Developer; Developer accounts are hidden from Admin/User
  - Protects against deleting/demoting the last remaining Developer
  - Migration: `supabase/migrations/add_account_management_roles_and_usernames.sql`
- ✅ **Username or Email Login**
  - Login accepts “email or username” (username resolves to internal auth email via `/api/auth/resolve-login`)
- ✅ **Navbar Account Menu**
  - Replaced Logout button with profile menu (Edit profile / Change password / Logout)
  - Edit profile: username/email only; access is read-only; password change remains separate dialog
- ✅ **Developer-only Diagnostics**
  - Schedule load/copy/save diagnostics and dev tooltips are now visible to Developer only
- ✅ **Step Tools**
  - Step 1–4: Clear buttons with per-step clearing, cascade clearing with confirm toast when later-step data exists
  - Block 3 bed relieving note editing is step-gated (Step 4 only) with warning tooltip when attempted earlier
- ✅ **Staff Pool Scroll Stability**
  - Restored left-side Staff Pool vertical scrolling and aligned bottom edge to PCA Dedicated Schedule table (excluding notes board)

### Phase 22: Contextual Menu System, Buffer PCA Fix & Popover Positioning (Latest)
- ✅ **Contextual Menu System for Staff Cards**
  - New `StaffContextMenu` component accessible via edit pencil icon click or right-click on staff card
  - Menu options: Leave edit, Move slot, Discard slot, Split slot (therapist only), Merge slot (therapist only), Fill color
  - Step-based validation: Options disabled based on current step with tooltips (e.g., therapist actions only in Step 2, PCA actions only in Step 3+)
  - Move slot: Team picker popover → slot picker (multi-slot PCA) → confirmation; supports cross-team transfers with reminders
  - Discard slot: Multi-select highlight mode for therapist, slot picker for multi-slot PCA; updates staff pool battery accordingly
  - Split slot: Creates 2 standalone cards for same therapist; user inputs FTE for each portion (multiples of 0.25); supports swap input mode for non-0.25-multiple totals
  - Merge slot: User selects multiple cards of same therapist; supports swap mode to merge current team into selected destination
  - Fill color: Color picker with 10 color options; stored in `staffOverrides.cardColorByTeam` and savable to DB
  - Multi-page popover system: `TeamPickerPopover`, `SlotSelectionPopover`, `ConfirmPopover` with Prev/Next navigation and page indicators
  - Database schema change: Changed `schedule_therapist_allocations` unique constraint from `UNIQUE(schedule_id, staff_id)` to `UNIQUE(schedule_id, staff_id, team)` to support split allocations
- ✅ **Buffer PCA FTE Display Fix**
  - Fixed bug where buffer floating PCA with `buffer_fte=0.5` was incorrectly shown as 1.0 / 4 slots in Step 2.1 and Staff Pool
  - Root cause: Buffer PCA `availableSlots` was being clamped to `[1,2]`, causing Step 2.1 to exclude it when missing slots were `[3,4]`; Staff Pool calculated true FTE from `availableSlots.length` instead of `buffer_fte`
  - Solution: Removed algorithm-side slot clamp (buffer PCA stays flexible across all slots, capacity still enforced via `fte_pca`); fixed `BufferStaffPool.getTrueFTERemaining()` to cap by `buffer_fte/override.fteRemaining` instead of `availableSlots.length`; updated Step 2.1 dialog to display buffer capacity correctly
- ✅ **Popover Positioning Enhancement**
  - Changed contextual menu and all popovers from `position: fixed` to `position: absolute` so they scroll with the page
  - Updated position calculation to store document coordinates (`client + window.scrollX/Y`) instead of viewport coordinates
  - Affected components: `StaffContextMenu`, `TeamPickerPopover`, `ConfirmPopover`, `SlotSelectionPopover`, and inline popovers in schedule page (split/merge/color/warning)

### Phase 9: Pending FTE Bug Fix & Safe Wrapper System
- ✅ **Critical Bug Fix: Pending FTE Overwrite Issue**
  - **Problem**: When `assignSlotsToTeam()` was called with `pendingFTE: 0.25` (local request), the global `pendingFTE[team]` was incorrectly overwritten with `result.newPendingFTE` (which is only the local remaining, often 0)
  - **Impact**: Teams with pending FTE > 0.25 (e.g., 1.0) would prematurely stop receiving slots after the first 0.25 assignment, causing under-allocation
  - **Root Cause**: `result.newPendingFTE` represents the remaining of the local request (0.25), not the team's global pending FTE
  - **Solution**: Changed all one-slot calls to subtract `0.25 * slotsAssigned.length` from global pending instead of overwriting with `result.newPendingFTE`
  - **Fixed Locations**:
    - Condition A Step 1/2/3 (preferred slot attempts)
    - Condition A Step 4 (fill remaining from preferred PCA - one-slot loop)
    - Condition B preferred-slot attempts (floor/non-floor)
    - Cycle 3 cleanup (one-slot-at-a-time)
- ✅ **Safe Wrapper System for Pending FTE Updates**
  - **Purpose**: Prevent regression of pending FTE overwrite bug by making the correct update pattern structural
  - **Implementation**: Added two wrapper functions in `lib/utils/floatingPCAHelpers.ts`:
    - `assignOneSlotAndUpdatePending()`: For one-slot (0.25) requests - automatically subtracts from global pending
    - `assignUpToPendingAndUpdatePending()`: For global pending requests - uses `result.newPendingFTE` correctly
  - **Key Features**:
    - Both wrappers accept optional `context` parameter (human-readable labels like "Preferred PCA + preferred slot → preferred slot from preferred PCA")
    - Both wrappers automatically update `pendingFTEByTeam[team]` internally, preventing manual update errors
    - Wrappers read/write the shared `pendingFTEByTeam` record directly, removing the footgun of passing wrong pending values
  - **Refactoring**: Completely refactored `lib/algorithms/pcaAllocation.ts` to use wrappers exclusively:
    - Removed all direct calls to `assignSlotsToTeam()`
    - All Conditions A/B/C/D now use appropriate wrapper based on intent
    - All fallback functions (floor/non-floor) use appropriate wrapper
    - Cycle 3 cleanup uses one-slot wrapper
  - **Benefits**:
    - Type-safe: Impossible to accidentally call wrong wrapper (TypeScript enforces correct usage)
    - Self-documenting: Context strings make debugging easier
    - Regression-proof: Future edits cannot reintroduce the overwrite bug
- ✅ **"Remaining" Slot Tag in Tracking Tooltip**
  - **Feature**: Added `assignmentTag?: 'remaining'` field to `SlotAssignmentLog` interface
  - **Purpose**: Track slots assigned as "fill remaining slots from same PCA" (e.g., Condition B follow-up fill, Condition A Step 4 fill)
  - **Display**: Tooltip in `PCABlock.tsx` now shows `, remaining` inline for slots tagged with this marker
  - **Usage**: Automatically tagged when slots are assigned via "fill remaining from same PCA" logic
- ✅ **TypeScript Strict Mode Compliance Fixes**
  - Fixed `Record<PanelType, string>` type error in dashboard page (excluded `null` from Record keys)
  - Fixed `invalid_slot: null` type error in schedule page (changed to `undefined`)
  - Fixed missing `slot_whole` property in buffer PCA allocation creation
  - Fixed `currentStep` prop missing from `TherapistBlockProps` interface
  - Fixed `special_program` type mismatches in buffer staff dialogs (changed from `string[]` to `StaffSpecialProgram[]`)
  - Fixed `allocationLog.assignments[0]` type narrowing issue in `PCABlock.tsx`
  - Fixed `active` property missing from `Staff` interface (added as optional for legacy/DB column support)
  - Fixed checkbox component type mismatch (`HTMLInputElement` vs `HTMLButtonElement`)
  - Fixed holiday utility type error (handled array return from `date-holidays` library)
  - All fixes verified with `npm run build` (strict TypeScript compilation passes)

### Phase 15: Bed Counts Edit Dialog & Copy Fix
- ✅ **Bed Counts Edit Dialog**
  - Replaced inline "Total beds" editing in Beds Calculations (Block 5) with hover pencil icon + modal dialog
  - Dialog features:
    - Base total bed counts (read-only, derived from per-ward sums)
    - Per-ward bed counts (editable, one input per designated ward for that team)
    - SHS bed counts (optional, nullable, collapsible section)
    - Student placement bed counts (optional, nullable, collapsible section)
    - Final total beds preview (base total minus SHS/Students deductions)
  - Validation:
    - Each per-ward bed count must be ≤ that ward's `total_beds` (Ward Config bed stat)
    - SHS + Students ≤ baseTotal
    - Empty inputs treated as `null` (reverts to baseline ward assignment)
  - Display in schedule grid:
    - First line: `Total beds: <finalTotal>`
    - Second line (only if deductions > 0): `SHS:<n>   <AcademicCapIcon>:<n>` with tooltip "Student placement bed counts"
  - Data persistence:
    - Stored in `daily_schedules.staff_overrides.__bedCounts.byTeam[team]`
    - Structure: `{ wardBedCounts: Record<wardName, number | null>, shsBedCounts: number | null, studentPlacementBedCounts: number | null }`
    - Carried over via Copy schedule (both Hybrid and Full modes)
  - Integration:
    - Removed legacy `editableBeds` / `savedEditableBeds` state pathway
    - Recomputes `total_beds_designated` as `baseTotal - SHS - Students` in all calculation functions
    - Updates bed allocations and relieving beds when overrides change
    - Marks `bed-relieving` step as modified when bed counts change
- ✅ **Copy Schedule Bug Fixes**
  - Fixed copy API failing due to missing `pca_unmet_needs_tracking` table (legacy-safe handling)
  - Fixed copy API failing due to `id: undefined` violating NOT NULL constraint (now omits `id` field entirely)
  - Ensures target schedule is marked `is_tentative = true` BEFORE inserting allocations (RLS requirement)
  - Added proper error handling and reporting for all allocation insert operations
  - Fixed mismatch between History page / date picker dots and actual saved data (allocations now properly inserted)

### Phase 16: UI/UX Optimization & Critical Bug Fixes
- ✅ **Toast Notification System**
  - **Reusable toast component** (`ActionToast`) with three variants: success (green tick), warning (yellow alert), error (red cross)
  - **Top-right positioning** with slide-in/slide-out animations
  - **Auto-dismiss** after 3 seconds with manual close button (X icon)
  - **Global toast provider** (`ToastProvider`) with `useToast` hook for easy access across components
  - **Replaced all browser `alert()` calls** with appropriate toast notifications (success/warning/error)
  - **Success toasts** added after confirmed actions complete (e.g., after `confirm()` dialogs)
  - **In-field validation messages** preserved (HTML5 `required` attributes remain unchanged)
- ✅ **Navigation Loading & Animation System**
  - **Global navigation loading provider** (`NavigationLoadingProvider`) wraps dashboard layout
  - **Lottie animation overlay** (transparent background with dimming) during page transitions
  - **Thicker top loading bar** (6px) with indeterminate animation for navigation
  - **Navbar exclusion**: Top header/navbar remains non-dimmed and interactive during loading
  - **Schedule page special handling**: Only content below step indicator dims during initial load
  - **Grid loading overlay**: Local overlay for schedule page grid that waits for full data rendering before undimming
  - **Auto-start on navigation**: Detects internal link clicks and starts loading animation automatically
  - **Auto-stop on route change**: Navigation loading automatically stops when route change completes
- ✅ **Critical Bug Fixes**
  - **Staff Duplication Bug**: Fixed React key collision issue where baseline allocations used empty `id: ''`, causing duplicate rendering
    - Solution: Baseline allocations now use stable unique IDs: `baseline-therapist:${dateStr}:${staffId}:${team}` and `baseline-pca:${dateStr}:${staffId}:${team}`
  - **Save Schedule Failure**: Fixed two issues preventing schedule saves
    - RPC ambiguity error: Renamed `schedule_id` parameter to `p_schedule_id` in `save_schedule_v1` function to resolve SQL ambiguity
    - Foreign key constraint: Added preflight check to detect missing staff IDs and filter them from save payload with user warning
    - Missing staff IDs are automatically removed from allocations and in-memory state to prevent FK violations
  - **History Page Step Badge Inconsistency**: Fixed badge suppression for complete schedules
    - Complete schedules (Step 4+) now display green "Step 4+" badge instead of being hidden
    - Badge styling: Green background (`bg-emerald-600`) for complete status, outline variant for incomplete steps

### Phase 14: Performance Optimization & Step Validation
- ✅ **Snapshot Size Reduction**
  - Implemented sparse `specialPrograms` serialization (`minifySpecialProgramsForSnapshot`)
  - Only essential fields stored in `baseline_snapshot` JSONB
  - Versioned envelope format (`schemaVersion`, `source`, `createdAt`)
  - Snapshot validation & auto-repair on load
- ✅ **Batch Upsert Operations**
  - Consolidated multiple individual database writes into batch operations
  - Reduced database round-trips during save/copy operations
- ✅ **Server-Side RPC Functions**
  - `save_schedule_v1`: Transactional save (allocation upserts + metadata update)
  - `copy_schedule_v1`: Transactional copy (clone allocations + metadata)
  - Falls back to client-side JS if RPC unavailable
  - Improves data consistency and reduces race conditions
- ✅ **Save & Copy Performance Optimization**
  - Conditional snapshot refresh (only when staff/program changes detected)
  - Timing instrumentation for admin diagnostics
  - Dramatic reduction in save/copy execution time
- ✅ **Universal Loading Bar & Navigation Loading System**
  - **Thicker top loading bar** (6px height, up from 3px) for better visibility
  - **Global navigation loading system** (`NavigationLoadingProvider`) with context-based state management
  - **Lottie animation overlay** during page navigation (Schedule/Dashboard/History transitions)
  - **Transparent dimming effect** with backdrop blur for content area (navbar remains non-dimmed and interactive)
  - **Schedule page initial load handling**: Grid-specific loading overlay that ensures content is fully rendered before undimming (prevents "blank column moment")
  - **Auto-dismiss on route change**: Navigation loading automatically stops when route change completes
  - **Click-based navigation detection**: Automatically starts loading animation for internal link clicks
  - **Schedule page special handling**: Skips global dimming overlay for `/schedule` targets (uses local grid overlay instead)
  - **Stage-driven progress** (0-100%) for save/copy operations
  - **Admin-only detailed timing tooltips** on Copy/Save buttons
  - **CSS keyframe animation** (`navbar-indeterminate`) for indeterminate progress bar
- ✅ **Date Navigation Controls**
  - 3-button navigation block (Previous / Today / Next working day)
  - Hover tooltips showing exact target dates
  - Hover enlarge/pre-select effects
  - Calendar icon repositioned to right of date label
- ✅ **Step Validation & Data Population Fixes**
  - Partial copy correctly resets Steps 3-5 to pending state
  - Step-gated bed allocation computation (only when Step 4 active/completed)
  - Blank schedules start at Step 1 with no auto-population of later steps
  - Workflow state properly applied on load (prevents stale "review" UI)
  - Fixed "step 4 data in block 3" issue by gating bed allocation display
  - Fixed blank schedule auto-running Step 2 algorithm (now waits for user initialization)

### Phase 13: Buffer Staff Edit & SPT FTE Enhancement
- ✅ **Buffer Staff Edit Functionality**
  - Added edit icon (pencil) next to delete icon on buffer staff cards
  - Opens BufferStaffCreateDialog in edit mode with pre-populated properties
  - Dialog title changes to "Edit Buffer Staff" when editing
  - Supports editing all buffer staff properties: rank, team, special program, floating status, floor PCA, buffer FTE, available slots
  - Uses `update` instead of `insert` when saving edits
- ✅ **SPT FTE Edit Enhancement in Step 1**
  - Added "FTE" field (not "Add-on") before "FTE Cost due to Leave" and "FTE Remaining on Duty"
  - Shows SPT configured FTE from dashboard with override capability (multiples of 0.25, 0.25-1.0)
  - Number input with step=0.25 (similar to buffer FTE dialog)
  - "FTE Cost due to Leave" no longer auto-fills from dashboard FTE (reflects true user input)
  - "FTE Remaining on Duty" auto-calculated as "SPT FTE - Leave Cost" (read-only)
  - Legacy auto-filled "FTE Cost due to Leave" values automatically nullified
  - Step 2 therapist allocation respects SPT FTE overrides by updating `sptAllocations.fte_addon`
  - SPT allocation skipped when staff is unavailable/0 FTE
- ✅ **SPT Display Fixes**
  - Fixed SPT FTE display in StaffPool: Shows FTE remaining when SPT has duty on current weekday (from `sptAllocations`)
  - Fixed schedule page SPT display: Only shows "AM/PM" suffix when FTE = 0.25 or 0.5 AND slot pattern matches
  - When SPT override FTE (e.g., 0.75) doesn't match slot pattern, displays just the number (no AM/PM)
  - Slot-based breakdown logic: Groups slots 1-2 (AM) and 3-4 (PM) separately for display
- ✅ **Step Dialog Badges**
  - Added "Step 2.0" badge to Special Program Overrides dialog title
  - Added "Step 2.1" badge to Non-Floating PCA Substitution dialog title
  - Updated Floating PCA Configuration dialog to dynamically display "Step 3.0", "3.1", "3.2", "3.3" badges
  - Added hover tooltip to "Skip" button in Step 2.1 dialog (consistent with Step 2.0)
  - Consistent badge styling across all step dialogs

### Phase 12: Special Program Overrides Dialog (Step 2.0)
- ✅ **Special Program Overrides Dialog**
  - New dialog appears before Step 2 algorithm execution (Step 2.0)
  - Enables ad-hoc/urgent changes to special program allocations for current day only
  - Horizontal card carousel layout with responsive fixed widths (`min-w-[390px] max-w-[450px]`)
  - CSS scroll snapping for smooth card-to-card transitions
  - Navigation controls: arrow buttons and dot indicators
  - Vertical scrolling within cards when content overflows
  - Shows all special programs active on current weekday (not just those with staff assigned)
  - Always appears, loading existing `staffOverrides` as candidates
- ✅ **Program-Specific Features**
  - **Robotic**: No therapist section (therapist field and FTE subtraction removed); only PCA fields
  - **CRP**: Thursday toggle for therapist FTE subtraction (0.25 or 0.4) - replaces input field with button group
  - **DRM**: "PCA FTE Add-on" (renamed from "FTE Add-on"); "Therapist FTE Subtraction by Special Program" (separate from other programs)
  - **All Programs**: "FTE Subtraction" → "FTE Subtraction by Special Program"
- ✅ **PCA FTE Auto-Calculation**
  - For Robotic and CRP: FTE subtraction auto-calculated as `0.25 × number of slots selected` (read-only, no "Auto:" prefix)
  - User cannot manually input PCA FTE subtraction for these programs
- ✅ **Substitution & Buffer Staff Integration**
  - "Substitution needed" alert with dropdown menu (next to alert icon)
  - Dropdown includes "Create a buffer staff" option
  - Substitution auto-fill: When substitution selected, configured slot time (PCA) or FTE subtraction (therapist) automatically populates
  - Substitution validation: Staff must have `FTE-remaining >= FTE required` by special program
  - Buffer staff creation: `minRequiredFTE` validation prevents creation if `buffer FTE < FTE required`
  - Auto-selection: Newly created buffer staff automatically selected after creation
- ✅ **Helper Functions for Configured Baselines**
  - `getProgramSlotsForWeekday()`: Derives configured slots from dashboard configuration
  - `getConfiguredTherapistFTESubtractionForWeekday()`: Derives therapist FTE subtraction baseline
  - `getConfiguredPCAFTESubtractionForWeekday()`: Derives PCA FTE subtraction baseline
  - `getConfiguredProgramSlotsForWeekday()`: Gets configured slots for a program
  - `getMinRequiredFTEForProgram()`: Calculates minimum required FTE for substitution/buffer creation
  - Ensures consistent application of dashboard configurations
- ✅ **Data Structure Extensions**
  - Extended `staffOverrides` type to include:
    - `specialProgramOverrides?: Array<{ programId, therapistId?, pcaId?, slots?, therapistFTESubtraction?, pcaFTESubtraction?, drmAddOn? }>`
  - Overrides stored per staff member, scoped to current day only
- ✅ **Algorithm Integration**
  - Selected buffer PCAs injected into `specialPrograms.pca_preference_order` before `allocatePCA` runs
  - Ensures algorithm recognizes and allocates buffer PCAs in Step 2
  - Therapist SP override processing: Modified `specialPrograms` array before `allocateTherapists` to include substituted therapists

### Phase 11: Enhanced Leave Edit Dialog Features
- ✅ **Half Day TIL Support**
  - Added "half day TIL" leave type option (maps to 0.5 FTE, same as "half day VL")
  - AM/PM selection automatically appears for therapists when FTE = 0.5 or 0.25 (applies to both half day VL and half day TIL)
  - AM/PM selection stored in `staffOverrides.amPmSelection` and displayed on schedule page (e.g., "0.5 AM")
- ✅ **Special Program Availability Checkbox for Therapists**
  - Therapists with special program property (excluding DRO) can indicate availability during special program slot
  - Checkbox displays program name in bold brackets and slot time in bold quotation marks (e.g., "Available during special program **(Robotic)** slot **"1030-1200"**?")
  - Slot time calculated from `specialProgram.slots[staffId][weekday]` structure
  - Stored in `staffOverrides.specialProgramAvailable` for algorithm integration
  - Slot time display uses `whitespace-nowrap` to prevent breaking in the middle (wraps to next line as whole if needed)
- ✅ **Enhanced PCA Slot Management**
  - Available slots selection uses blue button styling per design guidelines (time ranges only, e.g., "0900-1030")
  - Unavailable slots section auto-populates immediately (no 2s delay) based on non-selected slots
  - Invalid slots feature: PCAs can mark specific unavailable slots as "Partially present (not counted as FTE)"
  - Time interval slider for invalid slots: 15-minute interval selection with instructional text ("Slide the bar to indicate which time interval the PCA would be present")
  - Invalid slots stored as array: `staffOverrides.invalidSlots: Array<{ slot: number; timeRange: { start: string; end: string } }>`
  - Invalid slot time ranges displayed in blue brackets on schedule page (e.g., "(1030-1100)")
  - Invalid slots are display-only and do not affect FTE calculations (only available slots count toward FTE)
  - Removed legacy inputs: "What time to leave/come back", "Leave or Come Back" radio buttons, "Slot to Leave/Come Back" radio buttons
- ✅ **FTE Validation System**
  - Validates that rounded FTE remaining (to nearest 0.25) matches available slots FTE
  - Catches both directions: rounded FTE > slots FTE OR slots FTE > rounded FTE (any difference > 0.01)
  - Error message indicates direction (greater than/less than) and suggests correct number of slots
  - Validation error clears when user changes FTE input or available slots
  - "FTE must be between 0 and 1" message only shows when FTE is actually out of range, not for far off cases
- ✅ **Data Structure Extensions**
  - Extended `staffOverrides` type to include:
    - `invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>`
    - `amPmSelection?: 'AM' | 'PM'`
    - `specialProgramAvailable?: boolean`
  - Backward compatibility: Old single `invalidSlot` system converted to new array format when loading

### Phase 10: Non-Floating PCA Substitution & Team Transfer Features
- ✅ **Interactive Non-Floating PCA Substitution Dialog**
  - Dialog appears during Step 2 algorithm execution when non-floating PCAs with FTE ≠ 1 need substitution
  - Wizard-style dialog if >1 teams need substitution; simple dialog for single team
  - Floating PCA candidates sorted by: preferred PCA → floor PCA matching team → non-floor PCA
  - Excludes non-floating PCAs of other teams and PCAs actually assigned to special programs with overlapping slots
  - User selections stored in `staffOverrides.substitutionFor` with `nonFloatingPCAId`, `team`, and `slots`
  - Substitution slots excluded from Step 3.2 slot selection (via `computeReservations`)
  - Special program allocation runs before substitution dialog to correctly reserve slots
- ✅ **Team Transfer for Fixed-Team Therapists (APPT, RPT)**
  - Emergency fallback feature for urgent team reassignments
  - Allowed in Step 2 only with warning tooltip (thicker orange border)
  - Warning tooltip: "Team transfer for fixed-team staff detected."
  - FTE carried to target team; original team loses PT-FTE/team
  - Stored in `staffOverrides.team` (does NOT change `staff.team` property - override only)
  - Works for both schedule page and Staff Pool drag operations
- ✅ **UI Enhancements for Substitution Display**
  - Green text for partial substitution slots (specific slots substituted)
  - Green border for whole-day substituting floating PCA
  - Separate display for mixed slots (substituting + regular slots)
  - Prevents "false green" - only actual substituting slots turn green
  - Slot text wrapping: Time ranges (HHMM-HHMM) never break across lines
  - Dynamic Step 1 slot display: Non-floating PCA cards update immediately based on `staffOverrides`
- ✅ **Drag Validation Tooltip System**
  - Replaced non-modal popover dialogs with drag-activated tooltips
  - Tooltip content matches rank: PCA (2-line) vs Therapist (1-line)
  - Shows only when dragging is detected (not on hover)
  - Applied to regular staff, buffer staff, and Staff Pool
  - Step validation: Therapists (Step 2 only), Floating PCA (Step 3 only)
- ✅ **SPT Slot Discard Functionality**
  - SPT slot discard removes entire allocation from team (like buffer therapist)
  - Shared function `removeTherapistAllocationFromTeam()` for consistency
  - No slot selection popover - immediate removal regardless of slot count
  - Works correctly for both single and multi-slot SPT allocations

### Technical Achievements
- ✅ **Type Safety**: Comprehensive database type conversion utilities
- ✅ **State Management**: Three-layer architecture (Saved → Algorithm → Override)
- ✅ **Algorithm Robustness**: Rounding consistency, infinite loop prevention
- ✅ **UI/UX**: Interactive wizards, drag-and-drop, real-time feedback
- ✅ **Code Quality**: TypeScript strict mode, comprehensive error handling
- ✅ **Documentation**: Rule files for database types and TypeScript patterns

---

## Data Architecture

### Core Entities

#### Staff
- **Table**: `staff`
- **Key Fields**:
  - `id`: UUID (primary key)
  - `name`: TEXT
  - `rank`: `staff_rank` enum ('SPT', 'APPT', 'RPT', 'PCA', 'workman')
  - `team`: `team` enum (nullable - default team assignment)
  - `floating`: BOOLEAN (for PCA - indicates floating vs non-floating)
  - `floor_pca`: TEXT[] (PCA only - floor eligibility: 'upper', 'lower', or both)
  - `special_program`: TEXT[] (program NAMES, not UUIDs - see below)
  - `status`: TEXT enum ('active', 'inactive', 'buffer') - buffer staff for temporary assignments
  - `buffer_fte`: DECIMAL (nullable - FTE value for buffer staff, used instead of default 1.0)

#### Teams
- **Type**: `Team` enum
- **Values**: `'FO' | 'SMM' | 'SFM' | 'CPPC' | 'MC' | 'GMC' | 'NSM' | 'DRO'`
- Used throughout the system for team assignments
- **Floor PCA preference (team-level)**: stored in `pca_preferences.floor_pca_selection` ('upper' | 'lower' | null) and used for floor-matching heuristics (e.g., substitution candidate sorting)

#### Special Programs
- **Table**: `special_programs`
- **Key Fields**:
  - `id`: UUID (use this for `special_program_ids` in allocations)
  - `name`: TEXT (human-readable name like 'Robotic', 'DRM', 'CRP')
  - `weekdays`: `weekday[]` enum array
  - `slots`: JSONB (slot assignments per weekday)
  - `fte_subtraction`: JSONB (FTE adjustments per staff per weekday)
  - `pca_required`: DECIMAL (PCA requirement for program)
- **Critical**: `staff.special_program` stores NAMES (TEXT[]), but `allocation.special_program_ids` stores UUIDs (UUID[])

#### Daily Schedule
- **Table**: `daily_schedules`
- **Key Fields**:
  - `id`: UUID
  - `date`: DATE
  - `is_tentative`: BOOLEAN
  - `tie_break_decisions`: JSONB (stores user tie-breaker decisions)

#### Therapist Allocations
- **Table**: `schedule_therapist_allocations`
- **Key Fields**:
  - `staff_id`: UUID → `staff.id`
  - `team`: `team` enum
  - `fte_therapist`: DECIMAL
  - `fte_remaining`: DECIMAL
  - `slot1-4`: `team` enum (nullable - slot-based assignments)
  - `leave_type`: `leave_type` enum (see below)
  - `special_program_ids`: UUID[] (NOT TEXT[] - must convert from names)
  - `is_substitute_team_head`: BOOLEAN
  - `spt_slot_display`: TEXT ('AM' | 'PM' | null)
  - `manual_override_note`: TEXT (for custom leave types)

#### PCA Allocations
- **Table**: `schedule_pca_allocations`
- **Key Fields**:
  - `staff_id`: UUID → `staff.id`
  - `team`: `team` enum
  - `fte_pca`: DECIMAL
  - `fte_remaining`: DECIMAL
  - `slot_assigned`: DECIMAL (0.25 per slot, tracks assigned slots)
  - `slot1-4`: `team` enum (nullable - slot-based assignments)
  - `leave_type`: `leave_type` enum
  - `special_program_ids`: UUID[] (NOT TEXT[] - must convert from names)
  - `invalid_slot`: INTEGER (slot that is leave/come back)
  - `leave_comeback_time`: TEXT (HH:MM format)
  - `leave_mode`: TEXT ('leave' | 'come_back')
  - `fte_subtraction`: DECIMAL (FTE subtraction from leave, excluding special program)

#### Bed Allocations
- **Table**: `schedule_bed_allocations`
- **Key Fields**:
  - `from_team`: `team` enum
  - `to_team`: `team` enum
  - `ward`: TEXT
  - `num_beds`: INTEGER
  - `slot`: INTEGER (nullable)

#### Schedule Calculations
- **Table**: `schedule_calculations`
- **Key Fields**:
  - `team`: `team` enum
  - `average_pca_per_team`: DECIMAL (target value, persists through steps)
  - `base_average_pca_per_team`: DECIMAL (for DRO - without DRM +0.4 add-on)
  - `required_pca_per_team`: DECIMAL
  - `pca_on_duty`: DECIMAL
  - Various bed/PT ratios

#### Wards
- **Table**: `wards`
- **Key Fields**:
  - `id`: UUID (primary key)
  - `name`: TEXT (ward name, e.g., "R7A", "R8B")
  - `total_beds`: INTEGER (total bed count for the ward)
  - `team_assignments`: JSONB (Record<Team, number> - beds assigned per team)
  - `team_assignment_portions`: JSONB (Record<Team, string> - optional portion labels like "1/3", "2/3")
- **Usage**: Used in bed allocation calculations and displayed in Schedule page Block 5
- **Portion Labels**: Stored in `team_assignment_portions` for user-defined fraction labels (e.g., "1/3 R7A")

#### Team Settings
- **Table**: `team_settings`
- **Key Fields**:
  - `team`: `team` enum (primary key)
  - `display_name`: TEXT (custom team display name, e.g., "CPPC+NSM")
  - `created_at`: TIMESTAMP WITH TIME ZONE
  - `updated_at`: TIMESTAMP WITH TIME ZONE
- **Usage**: Allows custom team names for display while maintaining canonical team enum in database
- **Default**: If no custom name set, uses team enum value as display name

### PCA Total Values (Critical Distinction)

The system uses three different PCA total values for different purposes. Understanding the distinction is critical for stability:

#### `totalPCA` (Step 2 Algorithm Only)
- **Location**: Calculated in `generateStep2_TherapistAndNonFloatingPCA()`
- **Source**: Sum of `fte_pca` from all available PCAs in `pcaData` array
- **Calculation**: `pcaData.filter(p => p.is_available).reduce((sum, p) => sum + p.fte_pca, 0)`
- **Purpose**: Used only in Step 2 to calculate `rawAveragePCAPerTeam` for the algorithm's internal calculations
- **Stability**: Stable during Step 2 execution
- **Note**: `fte_pca` = Base FTE remaining = `1.0 - fteSubtraction` (excludes special program subtraction)

#### `totalPCAOnDuty` (Stable Requirement Calculation)
- **Location**: Calculated in `recalculateScheduleCalculations()`
- **Source**: Sum of FTE from all on-duty PCAs in `staff` database + `staffOverrides`
- **Calculation**: `staff.filter(s => s.rank === 'PCA').reduce((sum, s) => sum + currentFTE, 0)`
  - Uses `staffOverrides[s.id]?.fteRemaining` if set, otherwise defaults to 1.0 (or 0 if on leave)
- **Purpose**: Used for displayed `avg PCA/team` requirement calculation and `bedsPerPCA`
- **Stability**: **STABLE** - does not change as allocations are assigned/unassigned
- **Formula**: `averagePCAPerTeam = (ptPerTeam * totalPCAOnDuty) / totalPTOnDutyAllTeams`
- **Why Stable**: Derived from staff database (source of truth), not from current allocation state

#### `totalPCAFromAllocations` (Reference/Debugging Only)
- **Location**: Calculated in `recalculateScheduleCalculations()`
- **Source**: Sum of FTE from PCAs currently in `pcaAllocations` state
- **Calculation**: Sums FTE from `pcaAllocations`, using `Set` to avoid double-counting if PCA assigned to multiple teams
- **Purpose**: **Reference/debugging only** - NOT used in any calculations
- **Stability**: **UNSTABLE** - changes as floating PCAs are assigned/unassigned
- **Note**: Kept for comparison/logging purposes only

**Key Rule**: Always use `totalPCAOnDuty` for requirement calculations to ensure stability. Never use `totalPCAFromAllocations` for calculations as it fluctuates with allocation state.

### Type System

#### TypeScript Types vs Database Types

**Critical**: The application uses TypeScript types that are WIDER than database types. Always use conversion utilities from `lib/db/types.ts`.

**Leave Types**:
- **TypeScript**: `'VL' | 'half day VL' | 'TIL' | 'half day TIL' | 'SDO' | 'sick leave' | 'study leave' | 'medical follow-up' | 'others' | string | null`
- **Database**: `'VL' | 'SL' | 'TIL' | 'study leave' | 'conference'` (enum)
- **Mapping**:
  - `'VL'` → `'VL'`
  - `'half day VL'` → `'VL'` (half-day info via `fte_remaining = 0.5`)
  - `'half day TIL'` → `'TIL'` (half-day info via `fte_remaining = 0.5`)
  - `'SDO'` → `'VL'`
  - `'sick leave'` → `'SL'`
  - `'TIL'` → `'TIL'`
  - `'study leave'` → `'study leave'`
  - `'conference'` → `'conference'`
  - `'medical follow-up'` → `null` (store in `manual_override_note`)
  - `'others'` → `null` (store in `manual_override_note`)
  - Custom strings → `null` (store in `manual_override_note`)

**Special Program IDs**:
- **TypeScript**: `string[] | null` (can be names or UUIDs)
- **Database**: `UUID[] | null` (MUST be UUIDs)
- **Conversion**: Use `programNamesToIds()` from `lib/db/types.ts`

**FTE Values**:
- **TypeScript**: `number` (JavaScript floating point)
- **Database**: `DECIMAL` (PostgreSQL)
- **Precision**: Use `normalizeFTE()` to round to 2 decimal places before saving

---

## Code Rules & Conventions

### Database Type Safety (CRITICAL)

**ALWAYS** use conversion utilities from `lib/db/types.ts`:

```typescript
import {
  toDbLeaveType,
  fromDbLeaveType,
  assertValidSpecialProgramIds,
  prepareTherapistAllocationForDb,
  preparePCAAllocationForDb,
  programNamesToIds,
  normalizeFTE,
} from '@/lib/db/types'
```

#### Rule 1: Special Program IDs
- **NEVER** pass program names directly to `special_program_ids`
- **ALWAYS** convert names to UUIDs first:
```typescript
// ✅ CORRECT
const programIds = programNamesToIds(staff.special_program, specialPrograms)
assertValidSpecialProgramIds(programIds, 'therapist allocation')
await supabase.from('schedule_therapist_allocations').upsert({
  special_program_ids: programIds,  // UUIDs
})

// ❌ WRONG
await supabase.from('schedule_therapist_allocations').upsert({
  special_program_ids: staff.special_program,  // Names - will fail!
})
```

#### Rule 2: Leave Types
- **ALWAYS** convert TypeScript leave types to database enum before saving:
```typescript
// ✅ CORRECT
const dbLeaveType = toDbLeaveType(staffEdit.leaveType)
const manualNote = isCustomLeaveType(staffEdit.leaveType) ? staffEdit.leaveType : null
await supabase.from('schedule_therapist_allocations').upsert({
  leave_type: dbLeaveType,  // DB enum value
  manual_override_note: manualNote,  // Custom types stored here
})

// ❌ WRONG
await supabase.from('schedule_therapist_allocations').upsert({
  leave_type: staffEdit.leaveType,  // May contain 'sick leave' - DB rejects!
})
```

#### Rule 3: FTE Precision
- **ALWAYS** normalize FTE values before saving:
```typescript
// ✅ CORRECT
await supabase.from('schedule_pca_allocations').upsert({
  fte_pca: normalizeFTE(allocation.fte_pca),  // Rounded to 2 decimals
})

// ❌ WRONG
await supabase.from('schedule_pca_allocations').upsert({
  fte_pca: allocation.fte_pca,  // May have floating point errors
})
```

#### Rule 4: Use Preparation Functions
For complete type safety, use preparation functions:
```typescript
// ✅ CORRECT - handles all conversions
const dbData = prepareTherapistAllocationForDb({
  allocation: therapistAlloc,
  specialPrograms: specialPrograms,
})
await supabase.from('schedule_therapist_allocations').upsert(dbData)
```

#### Rule 5: Snapshot Envelope & Validation
- **ALWAYS** use envelope utilities for baseline snapshots:
```typescript
import { buildBaselineSnapshotEnvelope, unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import { validateAndRepairBaselineSnapshot } from '@/lib/utils/snapshotValidation'

// ✅ CORRECT - wrap snapshot in envelope before saving
const envelope = buildBaselineSnapshotEnvelope({
  data: baselineSnapshot,
  source: 'save',  // or 'copy' | 'migration'
})
await supabase.from('daily_schedules').update({ baseline_snapshot: envelope })

// ✅ CORRECT - unwrap and validate on load
const { envelope, data } = unwrapBaselineSnapshotStored(storedSnapshot)
const result = await validateAndRepairBaselineSnapshot({
  storedSnapshot,
  referencedStaffIds,
  fetchLiveStaffByIds: async (ids) => {
    const { data } = await supabase.from('staff').select('id, name, rank, team, floating, status, buffer_fte, floor_pca, special_program').in('id', ids)
    return data || []
  },
  buildFallbackBaseline: () => buildBaselineSnapshotFromCurrentState(),
  sourceForNewEnvelope: 'save',
})
```

- **NEVER** save raw snapshot objects directly (always use envelope)
- **ALWAYS** validate snapshots on load to handle corrupted/incomplete data gracefully

### State Management Rules

#### Rule 6: staffOverrides is Single Source of Truth
- `staffOverrides` is the **single source of truth** for all staff modifications
- Any manual edits after algorithm runs should update `staffOverrides`
- Subsequent algorithm runs should use `staffOverrides` to build input data
- Pattern:
```typescript
// When user edits staff in Step 1
setStaffOverrides(prev => ({
  ...prev,
  [staffId]: { leaveType, fteRemaining, ... }
}))

// When building data for algorithm
const pcaData = buildPCADataFromCurrentState(staffOverrides)
```

#### Rule 7: Average PCA/Team Persistence
- `average_pca_per_team` is calculated in Step 1 (after staff overrides)
- This value is a **target** and should **persist unchanged** through Steps 2-4
- Do NOT recalculate it based on actual allocations
- Floating PCA substitutions should NOT change this target

#### Rule 8: Step Initialization
- Steps are marked as "initialized" after algorithm runs
- When `staffOverrides` changes, clear initialized steps to force re-run:
```typescript
setInitializedSteps(new Set())  // Clear when staff edited
```

### Algorithm Rules

#### Rule 9: Rounding Consistency
- Use `roundToNearestQuarterWithMidpoint()` for pending FTE checks
- Both `getNextHighestPendingTeam()` and inner while loops must use the same rounding
- Prevents infinite loops when raw pending > 0 but rounded pending = 0

#### Rule 10: DRM Special Program
- DRM is **NOT** a special program that requires designated PCA staff
- DRM only adds +0.4 FTE to DRO team's `average_pca_per_team`
- Skip DRM during special program PCA allocation phase
- Still respect the higher DRO requirement during floating PCA allocation

#### Rule 11: Floating PCA Substitution
- Step 2: Non-floating PCA substitution (when non-floating has leave)
- Step 3: Additional floating PCA allocation (based on pending FTE)
- Step 3 should NOT assign to slots already covered by Step 2 substitutions
- Track slots taken by other floating PCAs to prevent duplicates

---

## State Management

### Per-Date Data Isolation Architecture

**Core Principle**: Each schedule date has its own isolated snapshot of dashboard state to prevent cross-date contamination.

**Snapshot System**:
- `baseline_snapshot` (JSONB): Frozen snapshot of dashboard state (staff, special programs, wards, etc.) at schedule creation
- `staff_overrides` (JSONB): Per-schedule staff modifications (single source of truth)
- `workflow_state` (JSONB): Current step and completed steps tracking

**Versioned Envelope Format**:
```typescript
{
  schemaVersion: 1
  createdAt: string  // ISO timestamp
  source: 'save' | 'copy' | 'migration'
  data: BaselineSnapshot  // Actual snapshot payload
}
```

**Validation & Auto-Repair**:
- Runtime validation on load: checks structure, deduplicates staff, normalizes invalid fields
- Auto-repair: merges missing referenced staff from live DB into snapshot
- Persists repaired snapshot on save if validation reports issues

**Isolation Guarantee**: Once a schedule has a non-empty `baseline_snapshot`, dashboard edits do NOT affect that schedule. Only explicit copy operations update snapshots.

### Three-Layer State Architecture

The schedule page uses a three-layer state management pattern:

1. **Layer 1: Saved State** (from database)
   - Loaded on initial render
   - Includes `baseline_snapshot`, `staff_overrides`, `workflow_state`
   - Persisted to database on save

2. **Layer 2: Algorithm State** (generated from snapshot + overrides)
   - Generated by allocation algorithms
   - Based on `baselineSnapshot` (frozen) + current `staffOverrides`

3. **Layer 3: Override State** (user modifications)
   - `staffOverrides`: Staff leave/FTE edits
   - Manual slot edits
   - Ward bed edits

### Key State Variables

#### `staffOverrides`
- **Type**: `Record<string, { leaveType, fteRemaining, fteSubtraction?, availableSlots?, invalidSlots?, amPmSelection?, specialProgramAvailable?, slotOverrides?, substitutionFor?, specialProgramOverrides? }> & { __bedCounts?: { byTeam: Record<Team, BedCountsOverrideState> } }`
- **Purpose**: Single source of truth for staff modifications + schedule-level bed count overrides
- **Updated**: When user edits staff in Step 1, manually reallocates after algorithm, or performs slot transfers
- **invalidSlots**: Array of invalid slot objects with time ranges: `Array<{ slot: number; timeRange: { start: string; end: string } }>` (display-only, does not affect FTE)
- **amPmSelection**: Therapist AM/PM selection for FTE = 0.5 or 0.25: `'AM' | 'PM'` (AM = slots 1-2 range, PM = slots 3-4 range)
- **specialProgramAvailable**: Therapist special program availability flag: `boolean` (indicates if therapist is available during special program slot)
- **slotOverrides**: Stores manual slot transfer assignments: `{ slot1?, slot2?, slot3?, slot4? }` (Team | null per slot)
- **substitutionFor**: Non-floating PCA substitution override: `{ nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }`
- **specialProgramOverrides**: Special program assignment overrides (Step 2.0): `Array<{ programId: string; therapistId?, pcaId?, slots?, therapistFTESubtraction?, pcaFTESubtraction?, drmAddOn? }>` (scoped to current day only)
- **__bedCounts** (schedule-level metadata): Bed count overrides per team: `{ byTeam: Record<Team, { wardBedCounts?: Record<wardName, number | null>, shsBedCounts?: number | null, studentPlacementBedCounts?: number | null }> }`
  - Stored in `daily_schedules.staff_overrides` but NOT treated as staff UUID (ignored by `extractReferencedStaffIds` and copy/buffer-staff APIs)
  - Carried over via Copy schedule (both Hybrid and Full modes)

#### `pcaAllocations`
- **Type**: `Record<Team, (PCAAllocation & { staff: Staff })[]>`
- **Purpose**: Current PCA allocations grouped by team
- **Updated**: After Step 2 and Step 3 algorithm runs

#### `calculations`
- **Type**: `Record<Team, ScheduleCalculations | null>`
- **Purpose**: Calculated metrics per team
- **Key Fields**:
  - `average_pca_per_team`: Target value (persists through steps)
  - `base_average_pca_per_team`: Base value for DRO (without DRM add-on)
  - `required_pca_per_team`: Required PCA based on beds/PT ratio

#### `initializedSteps`
- **Type**: `Set<string>`
- **Purpose**: Tracks which steps have run their algorithms
- **Cleared**: When `staffOverrides` changes (forces re-run)

#### `baselineSnapshot`
- **Type**: `BaselineSnapshot | null`
- **Purpose**: Frozen snapshot of dashboard state for current schedule date
- **Source**: Loaded from `daily_schedules.baseline_snapshot` (versioned envelope)
- **Updated**: Only on schedule load or explicit copy operation
- **Isolation**: Prevents cross-date contamination from dashboard edits

#### `snapshotHealthReport`
- **Type**: `SnapshotHealthReport | null`
- **Purpose**: Runtime validation status (ok/repaired/fallback, issues list, staff coverage)
- **Updated**: On schedule load via `validateAndRepairBaselineSnapshot()`
- **Usage**: Admin diagnostics tooltip, conditional snapshot refresh on save

---

## Allocation Workflow

### Step 1: Leave & FTE
- **Purpose**: Set staff leave types and FTE remaining
- **User Actions**: Edit staff cards to set leave/FTE
- **State Updates**: Updates `staffOverrides`
- **Calculations**: Recalculates `average_pca_per_team` based on updated PCA pool
- **Key Function**: `recalculateScheduleCalculations()`

### Step 2: Therapist & Non-Floating PCA
- **Purpose**: Generate therapist and non-floating PCA allocations
- **Structure**: Special Program Overrides Dialog (2.0) → Algorithm Execution → Non-Floating PCA Substitution Dialog (2.1)
- **Algorithm**: `generateStep2_TherapistAndNonFloatingPCA()`

#### Step 2.0: Special Program Overrides Dialog
- **Purpose**: Allow ad-hoc/urgent changes to special program allocations before algorithm execution
- **Component**: `SpecialProgramOverrideDialog`
- **Features**:
  - Horizontal card carousel layout showing all active special programs
  - Displays/edit assigned therapist/PCA per program
  - Displays/change slots (skip for DRM)
  - Displays/change FTE subtraction/add-on
  - Substitution dropdown with "Create a buffer staff" option
  - Auto-fills configured slot time/FTE when substitution selected
  - Always appears, loading existing `staffOverrides` as candidates
- **User Actions**: Edit special program assignments, select substitutions, create buffer staff
- **State Updates**: Updates `staffOverrides.specialProgramOverrides`
- **Integration**: Selected buffer PCAs injected into `specialPrograms.pca_preference_order` before algorithm

#### Step 2 Algorithm Execution
- **Phases**:
  1. Therapist allocation (SPT, APPT, RPT) - includes special program overrides
  2. Non-floating PCA allocation
  3. Special program PCA allocation (except DRM) - includes Step 2.0 overrides
  4. Non-floating PCA substitution (Step 2.1) - when non-floating has leave / FTE ≠ 1
- **Key Function**: `allocatePCA()` with `phase: 'non-floating-with-special'`
- **State Updates**: Updates `therapistAllocations`, `pcaAllocations`, `calculations`

#### Step 2.1: Non-Floating PCA Substitution Dialog
- **Purpose**: Select floating PCAs to substitute for non-floating PCAs with FTE ≠ 1
- **Component**: `NonFloatingSubstitutionDialog`
- **Features**:
  - Wizard-style dialog if >1 teams need substitution; simple dialog for single team
  - Pre-detects existing `staffOverrides.substitutionFor` entries (from Step 1 or Step 2.0 buffer non-floating PCAs)
  - Infers already-allocated floating PCAs from saved allocations to prevent duplicates
  - Floating PCA candidates sorted by: preferred PCA → floor PCA matching team → non-floor PCA
  - Excludes non-floating PCAs of other teams and PCAs assigned to special programs with overlapping slots
- **User Actions**: Select floating PCA substitutes, skip (let algo allocate automatically)
- **State Updates**: Updates `staffOverrides.substitutionFor` with `nonFloatingPCAId`, `team`, and `slots`
- **Integration**: Substitution slots excluded from Step 3.2 slot selection (via `computeReservations`)

### Step 3: Floating PCA (Multi-Step Wizard)
- **Purpose**: Distribute floating PCAs to teams based on pending FTE with proactive user adjustments
- **Structure**: Entry point (3.0) → Three sub-steps (3.1, 3.2, 3.3) → Final algorithm execution (3.4)
- **Component**: `FloatingPCAConfigDialog` - Interactive wizard dialog

#### Step 3.0: Wizard Entry Point
- **Purpose**: Initial overview and workflow introduction
- **Features**: Instructional dialog explaining the Step 3 workflow
- **User Actions**: Navigate to Step 3.1 to begin adjustments
- **Buffer PCA behavior**: if user skips pre-assigning buffer PCA, Step 3 algo may allocate it; if user pre-assigns buffer PCA before Step 3 algo run, it is treated as `staffOverrides` and preserved by the algo

#### Step 3.1: Adjust Pending FTE & Team Order
- **Purpose**: Allow users to adjust pending PCA-FTE values per team and set team priority order
- **Features**:
  - Compact team cards showing adjustable pending FTE
  - Display original pre-adjusted rounded pending FTE as reference
  - Upper limit constraint: cannot exceed original pre-adjusted value
  - Drag-and-drop reordering within tie-breaker groups
  - Visual indicators: colored borders for tie-breaker groups, arrows showing order
- **User Actions**: Adjust FTE sliders, drag team cards to reorder
- **State Updates**: Updates `adjustedFTE`, `teamOrder`
- **Key Component**: `TeamPendingCard`

#### Step 3.2: Preferred Slot Reservation
- **Purpose**: Pre-assign preferred PCA + preferred slot combinations before final algorithm
- **Features**:
  - Pre-mapping identifies available preferred PCA + slot combinations
  - Reservation system (internal, not guaranteed - conflicts allowed)
  - Checkbox selection for reserved slots
  - Data validation: same slot of same PCA can only be selected by one team
  - "Skip Assignments" option (reserved slots remain available for final algorithm)
  - Shows expected adjusted rounded pending FTE and assigned FTE per team
- **User Actions**: Select preferred slot assignments, approve or skip
- **State Updates**: Updates `step32Assignments`, `currentPendingFTE`, `pcaAllocations`
- **Key Component**: `TeamReservationCard`
- **Key Function**: `computePreferredSlotReservations()`, `executeSlotAssignments()`

#### Step 3.3: Adjacent Slot Assignment
- **Purpose**: Assign adjacent slots from special program PCAs (slots 1↔2, 3↔4)
- **Features**:
  - Identifies adjacent slots available from special program PCA assignments
  - Shows 3.2 assigned slots in gray (non-interactive)
  - Checkbox selection for adjacent slots
  - Displays special program info (program name + slot time) in grey text
  - Card shrinking for teams with no reserved/adjacent slots
  - Visual indicators: green border for teams with adjacent slots, dark grey for teams with 3.2 only
- **User Actions**: Select adjacent slot assignments, approve or skip
- **State Updates**: Updates `step33Selections`, `currentPendingFTE`, `pcaAllocations`
- **Key Component**: `TeamAdjacentSlotCard`
- **Key Function**: `computeAdjacentSlotReservations()`
- **Critical Logic**: Only considers slots actually assigned by special programs (not Step 3.2 assignments)

#### Step 3.4: Final Floating PCA Algorithm
- **Purpose**: Execute final floating PCA allocation algorithm with updated pending FTE
- **Algorithm**: `generateStep3_FloatingPCA()`
- **Key Features**:
  - Uses `currentPendingFTE` from Step 3.3 (reflects all user adjustments)
  - Uses `teamOrder` from Step 3.1 (user-defined priority)
  - Respects `average_pca_per_team` target from Step 1
  - Does NOT assign to slots already covered by Step 2 substitutions or Step 3.2/3.3 assignments
  - Handles tie-breaker dialogs (if still needed after adjustments)
  - **Critical**: Actual allocation is limited by available floating PCA pool capacity (cannot over-allocate)
- **Key Function**: `allocatePCA()` with `phase: 'floating'`
- **State Updates**: Updates `pcaAllocations`, `pendingPCAFTEPerTeam`

### Step 4: Bed Relieving
- **Purpose**: Calculate bed distribution for relieving
- **Algorithm**: `generateStep4_BedRelieving()`
- **Key Features**:
  - Derived calculation based on therapist allocations
  - Ward beds are always editable (not step-locked)
- **State Updates**: Updates `bedAllocations`

### Step 5: Review
- **Purpose**: Review and finalize schedule
- **User Actions**: Review all allocations, save schedule

---

## Key Algorithms

### PCA Allocation Algorithm (`lib/algorithms/pcaAllocation.ts`)

**Main Function**: `allocatePCA(context: PCAAllocationContext)`

**Phases**:
1. **Non-floating**: Assign non-floating PCAs to their default teams
2. **Special Program**: Assign PCAs to special program requirements (except DRM)
3. **Floating**: Distribute floating PCAs based on pending FTE

**Key Logic**:
- **Priority 1**: Special program requirements (Step 2 only)
- **Priority 2**: Non-floating PCA substitution (Step 2)
- **Priority 3**: Highest pending FTE first (Step 3)
- **Priority 4**: Preference-based allocation

**Critical Patterns**:
- Use `roundToNearestQuarterWithMidpoint()` for pending checks
- Track slots taken by other floating PCAs
- Skip DRM during special program phase
- Handle tie-breaker callbacks for equal pending FTE

### Therapist Allocation Algorithm (`lib/algorithms/therapistAllocation.ts`)

**Main Function**: `allocateTherapist(context: TherapistAllocationContext)`

**Key Features**:
- Default team assignments from `staff.team`
- Manual override support
- Team head substitution (Katie SPT)
- SPT slot-based display (AM/PM)
- Special program FTE adjustments

### Bed Allocation Algorithm (`lib/algorithms/bedAllocation.ts`)

**Main Function**: `allocateBeds(context: BedAllocationContext)`

**Key Features**:
- Optimized relieving bed combinations
- Minimize wards per team
- Minimize discrepancy between teams

---

## Important Patterns

### Pattern 1: Incremental Updates
- `staffOverrides` is the single source of truth
- Manual edits update `staffOverrides`
- Algorithm runs use `staffOverrides` to build input data
- Subsequent steps reflect manual edits

### Pattern 2: Data Recalculation
- Use `recalculateFromCurrentState()` to get latest allocations
- Use `buildPCADataFromCurrentState()` to build algorithm input
- Ensures algorithm uses current state, not stale data

### Pattern 3: Substitution Styling
- Green border + underline indicates substitution
- Only shown after Step 2 algorithm runs (`step2Initialized` prop)
- Not shown immediately on navigation to Step 2

### Pattern 4: DRM Display
- DRO team shows:
  - "DRM +0.4" row (red text)
  - "Avg PCA/team" (base value, without +0.4)
  - "Final PCA/team" (value with +0.4)
- `base_average_pca_per_team` = `average_pca_per_team` - 0.4 (for DRO only)

### Pattern 5: Floating Point Precision
- Use `normalizeFTE()` before database saves
- Use `roundToNearestQuarterWithMidpoint()` for pending checks
- Use tolerance (0.01) when comparing floating point values

### Pattern 6: Error Handling
- Special program errors shown in Step Progress Bar
- `pcaAllocationErrors` state tracks allocation errors
- Errors prevent step completion

### Pattern 7: Tie-Breaker Decisions
- Stored in `tieBreakDecisions` state
- Key format: `${sortedTeams.join(',')}:${pendingFTE.toFixed(4)}`
- Persisted to `daily_schedules.tie_break_decisions` (JSONB)
- Reused when same tie-breaker situation occurs

### Pattern 8: Step 3 Wizard Data Flow
- **Data Immutability**: Clone state objects (`adjustedFTE`, `existingAllocations`) before modification
- **Progressive Updates**: Each mini-step updates `currentPendingFTE` and `pcaAllocations`
- **State Transition**: 
  - 3.1 → `adjustedFTE`, `teamOrder`
  - 3.2 → `step32Assignments`, `currentPendingFTE` (updated), `pcaAllocations` (updated)
  - 3.3 → `step33Selections`, `currentPendingFTE` (updated), `pcaAllocations` (updated)
  - 3.4 → Final algorithm receives `currentPendingFTE` and `teamOrder`
- **Slot Assignment Execution**: `executeSlotAssignments()` updates `staffOverrides`, `pendingPCAFTEPerTeam`, and `pcaAllocations`
- **Reservation Logic**: `computePreferredSlotReservations()` and `computeAdjacentSlotReservations()` identify available slots without guaranteeing assignment

### Pattern 9: TypeScript Strict Mode Compliance
- **Record Initialization**: Use `createEmptyTeamRecord<T>()` or `createEmptyTeamRecordFactory<T>()` instead of `{}`
- **Nullable Types**: Use guard clauses (`if (!value) return`) instead of non-null assertions (`!`)
- **Supabase Query Builder**: Use `PromiseLike<any>[]` or convert with `.then()` for `Promise.all()`
- **Component Props**: Ensure parent and child component prop types match exactly
- **Build Verification**: Always run `npm run build` to catch strict mode errors

### Pattern 10: Reusable CSS Scrollbar Classes
- **Purpose**: Consistent scrollbar styling across components with auto-hide capability
- **Available Classes**:
  - `.pca-like-scrollbar`: PCA table-style scrollbar (gray theme, 12px width/height)
  - `.pca-like-scrollbar--hidden`: Hides scrollbar completely (for auto-hide behavior)
  - `.scrollbar-visible`: Generic visible scrollbar for checkbox panels (lighter gray theme)
- **Usage Pattern**:
```typescript
// Auto-hide scrollbar (PCA table, Staff Pool)
<div className={`overflow-y-auto pca-like-scrollbar ${visible ? '' : 'pca-like-scrollbar--hidden'}`}>
  {/* content */}
</div>

// Always-visible scrollbar (checkbox panels)
<div className="overflow-y-auto scrollbar-visible">
  {/* content */}
</div>
```
- **Left-Side Scrollbar Trick**: Use `direction: rtl` on scroll container + `direction: ltr` on inner wrapper to position scrollbar on left side
- **Dark Mode**: All classes include dark mode variants automatically
- **Location**: `app/globals.css`

---

## Common Pitfalls & Solutions

### Pitfall 1: Special Program IDs Type Mismatch
**Problem**: Passing program names instead of UUIDs  
**Solution**: Always use `programNamesToIds()` before saving

### Pitfall 2: Leave Type Enum Mismatch
**Problem**: Passing TypeScript leave types directly to database  
**Solution**: Always use `toDbLeaveType()` before saving

### Pitfall 3: Snapshot Envelope Missing
**Problem**: Saving raw snapshot objects without envelope wrapper  
**Solution**: Always use `buildBaselineSnapshotEnvelope()` before saving to `baseline_snapshot`

### Pitfall 4: Snapshot Validation Skipped
**Problem**: Loading snapshots without validation, causing crashes on corrupted data  
**Solution**: Always use `validateAndRepairBaselineSnapshot()` on load to handle incomplete/corrupted snapshots gracefully

### Pitfall 5: Average PCA/Team Recalculation
**Problem**: Recalculating `average_pca_per_team` in Steps 2-4, changing the target  
**Solution**: Only calculate in Step 1, persist as target through Steps 2-4

### Pitfall 6: Pending FTE Overwrite Bug (Critical Allocation Bug)
**Problem**: Teams with pending FTE > 0.25 (e.g., 1.0) would only receive 0.25 FTE (one slot) instead of their full requirement  
**Root Cause**: When `assignSlotsToTeam()` was called with `pendingFTE: 0.25` (local request), code incorrectly overwrote global `pendingFTE[team]` with `result.newPendingFTE` (often 0)  
**Solution**: Use safe wrapper system (`assignOneSlotAndUpdatePending`, `assignUpToPendingAndUpdatePending`) that subtracts from global pending instead of overwriting

### Pitfall 7: Buffer Non-Floating PCA Not Recognized as Substitute (Critical)
**Problem**: Buffer PCA created as "non-floating" was treated as regular staff, causing Step 2.1 to generate duplicate substitutes  
**Solution**: Detect missing regular non-floating PCAs and available full-day buffer PCAs, set `staffOverrides.substitutionFor` on buffer PCA, set missing PCA's `team` to `null` in `pcaData`

### Pitfall 8: TypeScript Strict Mode Errors
**Problem**: Build fails with type errors that pass in dev mode  
**Solution**: 
- Use `createEmptyTeamRecord<T>()` for Record initialization
- Use guard clauses instead of non-null assertions
- Use `PromiseLike<any>[]` for Supabase query builders in `Promise.all()`
- Always run `npm run build` before committing

---

## File Reference Guide

### Core Files
- `app/(dashboard)/schedule/page.tsx` - Main schedule page (2828 lines)
- `app/(dashboard)/history/page.tsx` - Schedule history page with batch operations
- `lib/algorithms/pcaAllocation.ts` - PCA allocation algorithm (2084 lines)
- `lib/algorithms/therapistAllocation.ts` - Therapist allocation algorithm
- `lib/algorithms/bedAllocation.ts` - Bed allocation algorithm
- `lib/db/types.ts` - Database type safety utilities
- `types/schedule.ts` - Schedule-related TypeScript types
- `types/staff.ts` - Staff-related TypeScript types
- `types/allocation.ts` - Allocation-related TypeScript types

### Component Files
- `components/allocation/PCADedicatedScheduleTable.tsx` - PCA-centric schedule table (read-only, below team grid)
- `components/allocation/PCABlock.tsx` - PCA allocation display
- `components/allocation/TherapistBlock.tsx` - Therapist allocation display
- `components/allocation/CalculationBlock.tsx` - Beds Calculations display with hover pencil icon and bed counts edit dialog trigger
- `components/allocation/BedCountsEditDialog.tsx` - Bed counts edit dialog (per-ward bed counts, SHS, Student placement with validation)
- `components/allocation/StaffEditDialog.tsx` - Staff editing dialog (leave/FTE, available slots, invalid slots, AM/PM selection, special program availability)
- `components/allocation/SpecialProgramOverrideDialog.tsx` - Special program overrides dialog (Step 2.0) with horizontal card carousel
- `components/allocation/SpecialProgramSubstitutionDialog.tsx` - Staff substitution dialog for special programs
- `components/allocation/NonFloatingSubstitutionDialog.tsx` - Non-floating PCA substitution dialog (Step 2.1)
- `components/allocation/TimeIntervalSlider.tsx` - Time interval slider component for invalid slot time range selection
- `components/allocation/TieBreakDialog.tsx` - Tie-breaker dialog
- `components/allocation/FloatingPCAConfigDialog.tsx` - Step 3 wizard dialog (3.1, 3.2, 3.3)
- `components/allocation/TeamPendingCard.tsx` - Team card for Step 3.1 (pending FTE adjustment)
- `components/allocation/TeamReservationCard.tsx` - Team card for Step 3.2 (preferred slot reservation)
- `components/allocation/TeamAdjacentSlotCard.tsx` - Team card for Step 3.3 (adjacent slot assignment)
- `components/history/ScheduleHistoryList.tsx` - Individual schedule entry in history page with step badge display
- `components/history/MonthSection.tsx` - Month grouping section in history page
- `components/history/DeleteConfirmDialog.tsx` - Confirmation dialog for schedule deletion
- `components/ui/action-toast.tsx` - Reusable toast notification component (success/warning/error variants)
- `components/ui/toast-provider.tsx` - Global toast context provider with `useToast` hook
- `components/ui/loading-animation.tsx` - Lottie animation component for loading overlays
- `components/ui/navigation-loading.tsx` - Global navigation loading provider with progress bar and dimming overlay

### Dashboard Component Files
- `components/dashboard/TeamConfigurationPanel.tsx` - Team configuration management (staff assignments, ward responsibilities, portion settings)
- `components/dashboard/WardConfigPanel.tsx` - Ward configuration and bed statistics management
- `components/dashboard/StaffProfilePanel.tsx` - Staff profile management with filtering, sorting, and batch operations
- `components/dashboard/DashboardSidebar.tsx` - Dashboard navigation sidebar with collapsible categories
- `components/dashboard/PortionPopover.tsx` - Portion editing dialog for ward bed assignments
- `components/dashboard/WardEditDialog.tsx` - Ward editing dialog
- `components/dashboard/StaffEditDialog.tsx` - Staff editing dialog (dashboard version)

### Utility Files
- `lib/utils/rounding.ts` - FTE rounding utilities
- `lib/utils/dateHelpers.ts` - Date manipulation utilities
- `lib/utils/slotHelpers.ts` - Slot assignment utilities
- `lib/utils/reservationLogic.ts` - Step 3.2/3.3 reservation logic (preferred slots, adjacent slots)
- `lib/utils/types.ts` - TypeScript type utilities (Record initialization helpers)
- `lib/utils/scheduleHistory.ts` - Schedule history utilities (grouping, formatting, completion status)
- `lib/utils/hongKongHolidays.ts` - Hong Kong public holiday utilities using `date-holidays` library

---

## Notes for New Chat Agents

**Critical Gotchas & Architectural Constraints:**

1. **Database Type Safety (CRITICAL)**: Always use `lib/db/types.ts` utilities (`toDbLeaveType`, `programNamesToIds`, `normalizeFTE`) - TypeScript types are WIDER than database enums
2. **staffOverrides is Single Source of Truth**: All staff modifications must update `staffOverrides`; algorithms read from it
3. **Never Recalculate `average_pca_per_team` After Step 1**: It's a target value that persists through Steps 2-4
4. **Bed Relieving Calculations**: Use `totalBedsEffectiveAllTeams` (after SHS/students deductions) consistently for both expected beds and allocation algorithm - using raw `totalBedsAllTeams` creates impossible positive global sums
5. **Pending FTE Update Safety**: Always use `assignOneSlotAndUpdatePending()` for one-slot calls and `assignUpToPendingAndUpdatePending()` for global pending calls - never manually update `pendingFTE[team]` after calling wrappers
6. **TypeScript Strict Mode**: Use `createEmptyTeamRecord<T>()` for Record initialization, guard clauses instead of `!`, `PromiseLike<any>[]` for Supabase queries in `Promise.all()`
7. **Step 3 Wizard State**: Always clone state objects (`adjustedFTE`, `existingAllocations`) before modification; each mini-step progressively updates `currentPendingFTE` and `pcaAllocations`
8. **Adjacent Slot Logic (Step 3.3)**: Only considers slots actually assigned by special programs, NOT Step 3.2 assignments
9. **Bed Relieving Notes**: Stored in `staffOverrides.__bedRelieving` (within-day only, NOT copied across dates via copy schedule)
10. **Snapshot Envelope**: Always use `buildBaselineSnapshotEnvelope()` before saving; always validate with `validateAndRepairBaselineSnapshot()` on load

---

## Future Considerations

- ✅ **Completed**: Step 3 wizard with sub-modules (3.1, 3.2, 3.3)
- ✅ **Completed**: Tie-breaker adjustment (Step 3.1)
- ✅ **Completed**: Preference approval (Step 3.2)
- ✅ **Completed**: Adjacent slot assignment (Step 3.3)
- ✅ **Completed**: Schedule history page with batch operations
- ✅ **Completed**: Staff pool UI enhancements and filtering
- ✅ **Completed**: Date picker optimization with holiday support
- Potential enhancements:
  - Additional visualization for allocation patterns
  - Export/import functionality for schedules
  - Advanced reporting and analytics
  - Mobile-responsive optimizations

---

**End of Journal**

