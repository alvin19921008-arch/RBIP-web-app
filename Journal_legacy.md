# RBIP Duty List - Project Journal

> **Purpose**: This document serves as a comprehensive reference for the RBIP Duty List web application. It captures project context, data architecture, code rules, and key patterns to ensure consistency across development sessions and new chat agents.

**Last Updated**: 2026-01-16
**Latest Phase**: Phase 25 - Frontend Toolchain Upgrade & Loading Optimization  
**Project Type**: Full-stack Next.js hospital therapist/PCA allocation system  
**Tech Stack**: Next.js 16.1+ (App Router, Turbopack), React 19.2+, TypeScript, Supabase (PostgreSQL), Tailwind CSS 4.1+ (CSS-first config), ESLint 9+, Shadcn/ui

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

### Phase 18: Schedule Loading Optimization & SPT FTE=0 Edge Case Fixes 
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

### Phase 19: PCA Dedicated Schedule Table & Staff Pool Scroll Isolation
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

### Phase 20: Points to Note Board & Summary Info Box Enhancements
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


---

**Note**: This file contains legacy development phases (1-20) that have been archived. For current development phases, see `journal.md`.
