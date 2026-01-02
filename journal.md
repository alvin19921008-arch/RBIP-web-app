# RBIP Duty List - Project Journal

> **Purpose**: This document serves as a comprehensive reference for the RBIP Duty List web application. It captures project context, data architecture, code rules, and key patterns to ensure consistency across development sessions and new chat agents.

**Last Updated**: 2025-01-16  
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
7. [Step 3 Wizard Architecture](#step-3-wizard-architecture)
8. [Key Algorithms](#key-algorithms)
9. [Important Patterns](#important-patterns)
10. [Common Pitfalls & Solutions](#common-pitfalls--solutions)

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
  - Step 3: Floating PCA allocation with interactive wizard (3.0 → 3.1 → 3.2 → 3.3 → 3.4)
  - Step 4: Bed relieving calculation
  - Step 5: Review and finalization
- **Interactive Step 3 Wizard** for floating PCA allocation:
  - **Step 3.0**: Wizard entry point with workflow overview
  - **Step 3.1**: Adjust pending FTE per team and set team priority order
  - **Step 3.2**: Preferred slot reservation and assignment
  - **Step 3.3**: Adjacent slot assignment from special program PCAs
  - **Step 3.4**: Final floating PCA algorithm execution
- **Buffer Staff System**: Temporary staff with configurable FTE for flexible team assignments
- Manual override capabilities at each step
- Special program support (CRP, DRM, Robotic, etc.)
- Preference-based allocation (PCA preferences, team preferences)
- Tie-breaker resolution with user decision persistence
- Role-based access (Admin vs Regular user)
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
  - Completion status indicators: 'Step 1', 'Step 2', 'Step 3.2', 'Complete'
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

### Phase 9: Pending FTE Bug Fix & Safe Wrapper System (Latest)
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
  - `special_program`: TEXT[] (program NAMES, not UUIDs - see below)
  - `status`: TEXT enum ('active', 'inactive', 'buffer') - buffer staff for temporary assignments
  - `buffer_fte`: DECIMAL (nullable - FTE value for buffer staff, used instead of default 1.0)

#### Teams
- **Type**: `Team` enum
- **Values**: `'FO' | 'SMM' | 'SFM' | 'CPPC' | 'MC' | 'GMC' | 'NSM' | 'DRO'`
- Used throughout the system for team assignments

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
- **TypeScript**: `'VL' | 'half day VL' | 'TIL' | 'SDO' | 'sick leave' | 'study leave' | 'medical follow-up' | 'others' | string | null`
- **Database**: `'VL' | 'SL' | 'TIL' | 'study leave' | 'conference'` (enum)
- **Mapping**:
  - `'VL'` → `'VL'`
  - `'half day VL'` → `'VL'` (half-day info via `fte_remaining = 0.5`)
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

### State Management Rules

#### Rule 5: staffOverrides is Single Source of Truth
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

#### Rule 6: Average PCA/Team Persistence
- `average_pca_per_team` is calculated in Step 1 (after staff overrides)
- This value is a **target** and should **persist unchanged** through Steps 2-4
- Do NOT recalculate it based on actual allocations
- Floating PCA substitutions should NOT change this target

#### Rule 7: Step Initialization
- Steps are marked as "initialized" after algorithm runs
- When `staffOverrides` changes, clear initialized steps to force re-run:
```typescript
setInitializedSteps(new Set())  // Clear when staff edited
```

### Algorithm Rules

#### Rule 8: Rounding Consistency
- Use `roundToNearestQuarterWithMidpoint()` for pending FTE checks
- Both `getNextHighestPendingTeam()` and inner while loops must use the same rounding
- Prevents infinite loops when raw pending > 0 but rounded pending = 0

#### Rule 9: DRM Special Program
- DRM is **NOT** a special program that requires designated PCA staff
- DRM only adds +0.4 FTE to DRO team's `average_pca_per_team`
- Skip DRM during special program PCA allocation phase
- Still respect the higher DRO requirement during floating PCA allocation

#### Rule 10: Floating PCA Substitution
- Step 2: Non-floating PCA substitution (when non-floating has leave)
- Step 3: Additional floating PCA allocation (based on pending FTE)
- Step 3 should NOT assign to slots already covered by Step 2 substitutions
- Track slots taken by other floating PCAs to prevent duplicates

---

## State Management

### Three-Layer State Architecture

The schedule page uses a three-layer state management pattern:

1. **Layer 1: Saved State** (from database)
   - Loaded on initial render
   - Persisted to database on save

2. **Layer 2: Algorithm State** (generated from staff + overrides)
   - Generated by allocation algorithms
   - Based on current `staffOverrides`

3. **Layer 3: Override State** (user modifications)
   - `staffOverrides`: Staff leave/FTE edits
   - Manual slot edits
   - Ward bed edits

### Key State Variables

#### `staffOverrides`
- **Type**: `Record<string, { leaveType, fteRemaining, fteSubtraction?, availableSlots?, invalidSlot?, leaveComebackTime?, isLeave?, slotOverrides? }>`
- **Purpose**: Single source of truth for staff modifications
- **Updated**: When user edits staff in Step 1, manually reallocates after algorithm, or performs slot transfers
- **slotOverrides**: Stores manual slot transfer assignments: `{ slot1?, slot2?, slot3?, slot4? }` (Team | null per slot)

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
- **Algorithm**: `generateStep2_TherapistAndNonFloatingPCA()`
- **Phases**:
  1. Therapist allocation (SPT, APPT, RPT)
  2. Non-floating PCA allocation
  3. Special program PCA allocation (except DRM)
  4. Non-floating PCA substitution (when non-floating has leave)
- **Key Function**: `allocatePCA()` with `phase: 'non-floating-with-special'`
- **State Updates**: Updates `therapistAllocations`, `pcaAllocations`, `calculations`

### Step 3: Floating PCA (Multi-Step Wizard)
- **Purpose**: Distribute floating PCAs to teams based on pending FTE with proactive user adjustments
- **Structure**: Entry point (3.0) → Three sub-steps (3.1, 3.2, 3.3) → Final algorithm execution (3.4)
- **Component**: `FloatingPCAConfigDialog` - Interactive wizard dialog

#### Step 3.0: Wizard Entry Point
- **Purpose**: Initial overview and workflow introduction
- **Features**: Instructional dialog explaining the Step 3 workflow
- **User Actions**: Navigate to Step 3.1 to begin adjustments

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

---

## Step 3 Wizard Architecture

### Component Structure
The Step 3 wizard is implemented as a multi-step dialog (`FloatingPCAConfigDialog`) that guides users through three sub-steps before the final algorithm execution:

1. **Step 3.1**: `TeamPendingCard` components in a drag-and-drop enabled container
2. **Step 3.2**: `TeamReservationCard` components with checkbox selections
3. **Step 3.3**: `TeamAdjacentSlotCard` components with checkbox selections

### Data Flow Architecture
```
Step 3.1 (Adjust FTE & Order)
  ↓
adjustedFTE, teamOrder
  ↓
Step 3.2 (Preferred Slots)
  ↓
step32Assignments → executeSlotAssignments()
  ↓
currentPendingFTE (updated), pcaAllocations (updated)
  ↓
Step 3.3 (Adjacent Slots)
  ↓
step33Selections → executeSlotAssignments()
  ↓
currentPendingFTE (updated), pcaAllocations (updated)
  ↓
Step 3.4 (Final Algorithm)
  ↓
generateStep3_FloatingPCA(currentPendingFTE, teamOrder)
```

### Reservation Logic
- **Preferred Slots (3.2)**: Identifies PCA + slot combinations where:
  - Team's rounded pending FTE > 0
  - PCA is on duty
  - Slot is available
  - Team has preference for this PCA + slot
- **Adjacent Slots (3.3)**: Identifies slots adjacent to special program assignments where:
  - Team's rounded pending FTE > 0
  - Special program PCA has an available adjacent slot (1↔2, 3↔4)
  - Adjacent slot is not already assigned
  - **Critical**: Only considers slots actually assigned by special programs (not Step 3.2 assignments)

### Slot Time Labels
- Slot 1: 0900-1030
- Slot 2: 1030-1200
- Slot 3: 1330-1500
- Slot 4: 1500-1630

---

## Common Pitfalls & Solutions

### Pitfall 1: Special Program IDs Type Mismatch
**Problem**: Passing program names instead of UUIDs  
**Solution**: Always use `programNamesToIds()` before saving

### Pitfall 2: Leave Type Enum Mismatch
**Problem**: Passing TypeScript leave types directly to database  
**Solution**: Always use `toDbLeaveType()` before saving

### Pitfall 3: Average PCA/Team Recalculation
**Problem**: Recalculating `average_pca_per_team` in Steps 2-4, changing the target  
**Solution**: Only calculate in Step 1, persist as target through Steps 2-4

### Pitfall 4: Infinite Loop in Floating PCA Allocation
**Problem**: Raw pending > 0 but rounded pending = 0, causing infinite loop  
**Solution**: Use `roundToNearestQuarterWithMidpoint()` consistently in both `getNextHighestPendingTeam()` and inner while loops

### Pitfall 5: Duplicate Slot Assignments
**Problem**: Step 3 assigning to slots already covered by Step 2 substitutions  
**Solution**: Track `slotsTakenByOtherFloating` and exclude them when assigning

### Pitfall 6: DRM Special Program Error
**Problem**: Algorithm trying to find designated PCA for DRM  
**Solution**: Skip DRM during special program allocation phase (it's only an FTE add-on)

### Pitfall 7: Step 3.3 Adjacent Slot Logic Error
**Problem**: Step 3.2 assigned slots incorrectly treated as special program slots  
**Solution**: Use `isSlotFromSpecialProgram()` helper to distinguish special program slots from other assignments

### Pitfall 8: TypeScript Strict Mode Errors
**Problem**: Build fails with type errors that pass in dev mode  
**Solution**: 
- Use `createEmptyTeamRecord<T>()` for Record initialization
- Use guard clauses instead of non-null assertions
- Use `PromiseLike<any>[]` for Supabase query builders in `Promise.all()`
- Always run `npm run build` before committing

### Pitfall 9: Manual Slot Transfer Step Validation
**Problem**: Users attempting slot transfers in wrong step  
**Solution**: 
- Floating PCA slot transfer only allowed in Step 3 onwards (validated with warning popover)
- Validation triggers when card is dragged OUT of original team column
- Warning popover appears near original card, auto-dismisses after 5 seconds

### Pitfall 10: SPT Allocation Running in Step 1
**Problem**: SPT allocation logic (including RBIP supervisor) was running automatically in Step 1  
**Solution**: 
- Added `includeSPTAllocation` flag to `AllocationContext`
- Set to `false` in `generateAllocationsWithOverrides` (Step 1) and `useAllocationSync` hook
- Set to `true` only in `generateStep2_TherapistAndNonFloatingPCA` (Step 2 initialization)
- SPT allocations now only appear when Step 2 "Initialize Algo" button is clicked

### Pitfall 11: Avg PCA/Team Fluctuation During Step Transitions
**Problem**: `avg PCA/team` was fluctuating during step transitions (e.g., Step 2 → Step 3)  
**Root Cause**: 
- `recalculateScheduleCalculations()` was using `totalPCAFromAllocations` (unstable, changes with allocations)
- This caused the requirement to change as floating PCAs were assigned/unassigned
- Also, `recalculateScheduleCalculations()` wasn't being called automatically when allocations changed  
**Solution**: 
- Use `totalPCAOnDuty` (stable, from staff database) instead of `totalPCAFromAllocations` for requirement calculation
- Added `useEffect` to auto-recalculate `scheduleCalculations` when `therapistAllocations` or `pcaAllocations` change
- Formula: `averagePCAPerTeam = (ptPerTeam * totalPCAOnDuty) / totalPTOnDutyAllTeams`
- Ensures displayed requirement is stable regardless of allocation state

### Pitfall 12: SPT Allocations Disappearing on Step Transition
**Problem**: SPT allocations created in Step 2 disappeared when transitioning to Step 3  
**Root Cause**: 
- `useAllocationSync` was regenerating therapist allocations without preserving SPT allocations
- `syncTherapistAllocations()` with `includeSPTAllocation: false` didn't preserve existing SPT allocations  
**Solution**: 
- Modified `syncTherapistAllocations()` to preserve existing SPT allocations from `therapistAllocations` state
- Added optimization to skip full therapist regeneration during Step 2+ → Step 3+ transitions
- When skipping regeneration, only updates FTE/leave from `staffOverrides` on existing allocations
- Preserves Step 2's SPT team assignments while allowing FTE/leave updates

### Pitfall 13: SPT Duplicate When Dragging Between Teams
**Problem**: Dragging SPT to another team caused it to appear in both old and new teams  
**Root Cause**: 
- Preserve logic in `syncTherapistAllocations()` checked only within the same team
- When SPT moved from Team A to Team B:
  - New allocation created in Team B (correct)
  - Preserve logic found old allocation in Team A
  - Checked if SPT exists in Team A's new result (it didn't, because new one is in Team B)
  - Re-added old allocation to Team A (bug!)  
**Solution**: 
- Updated preserve logic to check across ALL teams before preserving SPT allocations
- Collect all existing SPT allocations from all teams first
- Check if SPT exists in ANY team in the new result before preserving
- If not found, preserve it but update team from `staffOverrides.team` or original team
- Prevents duplicates when SPTs are moved between teams

### Pitfall 14: Over-Fill Team Pending PCA/Team Issue
**Problem**: Users could adjust pending FTE values in Step 3.1 to exceed available floating PCA capacity, causing over-allocation  
**Root Cause**: 
- Step 3.1 allowed manual FTE adjustments without validation against total available floating PCA FTE
- Upper limit constraint only prevented exceeding original pre-adjusted value, not total system capacity
**Solution**: 
- Upper limit constraint in Step 3.1 prevents adjustments beyond original pre-adjusted pending FTE
- Final algorithm (Step 3.4) respects total floating PCA capacity and assigns based on available FTE
- Step 3.2/3.3 assignments reduce available capacity for final algorithm, preventing over-allocation
- **Critical**: Adjusted FTE values are targets, but actual allocation is limited by available floating PCA pool

### Pitfall 15: Pending FTE Overwrite Bug (Critical Allocation Bug)
**Problem**: Teams with pending FTE > 0.25 (e.g., 1.0) would only receive 0.25 FTE (one slot) instead of their full requirement  
**Root Cause**: 
- When `assignSlotsToTeam()` was called with `pendingFTE: 0.25` (local request for one slot), the code incorrectly overwrote global `pendingFTE[team]` with `result.newPendingFTE`
- `result.newPendingFTE` is only the remaining of the local 0.25 request (often 0), NOT the team's global pending FTE
- This caused the algorithm to think the team was satisfied after just one slot, stopping further assignments
**Solution**: 
- Changed all one-slot calls to subtract `0.25 * slotsAssigned.length` from global pending instead of overwriting
- Implemented safe wrapper system (`assignOneSlotAndUpdatePending` and `assignUpToPendingAndUpdatePending`) that automatically handles correct pending updates
- Wrappers read/write `pendingFTEByTeam` directly, preventing manual update errors
- Refactored entire `pcaAllocation.ts` to use wrappers exclusively, making the bug impossible to regress
- Added optional `context` parameter to wrappers for debugging (human-readable labels)
**Fixed Locations**:
- Condition A Step 1/2/3 (preferred slot attempts with `pendingFTE: 0.25`)
- Condition A Step 4 (fill remaining from preferred PCA - one-slot loop)
- Condition B preferred-slot attempts (floor/non-floor with `pendingFTE: 0.25`)
- Cycle 3 cleanup (one-slot-at-a-time with `pendingFTE: 0.25`)

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
- `components/allocation/PCABlock.tsx` - PCA allocation display
- `components/allocation/TherapistBlock.tsx` - Therapist allocation display
- `components/allocation/StaffEditDialog.tsx` - Staff editing dialog
- `components/allocation/TieBreakDialog.tsx` - Tie-breaker dialog
- `components/allocation/FloatingPCAConfigDialog.tsx` - Step 3 wizard dialog (3.1, 3.2, 3.3)
- `components/allocation/TeamPendingCard.tsx` - Team card for Step 3.1 (pending FTE adjustment)
- `components/allocation/TeamReservationCard.tsx` - Team card for Step 3.2 (preferred slot reservation)
- `components/allocation/TeamAdjacentSlotCard.tsx` - Team card for Step 3.3 (adjacent slot assignment)
- `components/history/ScheduleHistoryList.tsx` - Individual schedule entry in history page
- `components/history/MonthSection.tsx` - Month grouping section in history page
- `components/history/DeleteConfirmDialog.tsx` - Confirmation dialog for schedule deletion

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

1. **Always check `lib/db/types.ts`** before saving to database
2. **Always use `staffOverrides`** as single source of truth for staff modifications
3. **Never recalculate `average_pca_per_team`** after Step 1
4. **Always use rounding utilities** for FTE comparisons
5. **Skip DRM** during special program PCA allocation
6. **Track slots** to prevent duplicate assignments
7. **Use preparation functions** (`prepareTherapistAllocationForDb`, `preparePCAAllocationForDb`) for complete type safety
8. **Step 3 Wizard**: Understand the data flow from 3.1 → 3.2 → 3.3 → 3.4
9. **Reservation Logic**: Preferred slots and adjacent slots are "reservations" (not guaranteed) until user approves
10. **Adjacent Slot Logic**: Only consider slots actually assigned by special programs, not Step 3.2 assignments
11. **TypeScript Strict Mode**: Use `createEmptyTeamRecord<T>()`, guard clauses, and `PromiseLike` for Supabase queries
12. **State Immutability**: Always clone state objects before modification in Step 3 wizard
13. **Manual Slot Transfers**: Stored in `staffOverrides.slotOverrides`, update `assigned_PCA-FTE/team` and `pendingPCA-FTE/team`, special program slots are non-draggable
14. **Step-Based Validation**: Enforce step restrictions for slot transfers, therapist transfers, and leave editing with warning popovers
15. **SPT Allocation Timing**: SPT allocation only runs in Step 2 when "Initialize Algo" is clicked, not in Step 1
16. **History Page**: Queries schedules with any allocation data, groups by month, supports batch delete and navigation
17. **Date Picker**: Non-modal popover with data indicators, holiday highlighting, and past/future date styling
18. **Checkbox Component**: Always destructure `onClick` from props and merge with internal `onCheckedChange` handler to prevent override issues
19. **Buffer Staff**: Use `buffer_fte` instead of default 1.0 FTE; buffer therapists assignable in Step 1 & 2 only; buffer floating PCA assignable in Step 3 onwards
20. **Step 3.0**: Entry point to Step 3 wizard before sub-steps 3.1-3.4
21. **Over-Fill Prevention**: Step 3.1 adjustments have upper limits; Step 3.4 algorithm respects available floating PCA capacity to prevent over-allocation
22. **Pending FTE Update Safety**: Always use `assignOneSlotAndUpdatePending()` for one-slot calls and `assignUpToPendingAndUpdatePending()` for global pending calls - never manually update `pendingFTE[team]` after calling these wrappers
23. **"Remaining" Slot Tag**: Slots assigned as "fill remaining from same PCA" are automatically tagged with `assignmentTag: 'remaining'` and displayed in tooltip

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

