# RBIP Duty List - Project Journal

> **Purpose**: This document serves as a comprehensive reference for the RBIP Duty List web application. It captures project context, data architecture, code rules, and key patterns to ensure consistency across development sessions and new chat agents.

**Last Updated**: 2026-01-18
**Latest Phase**: Phase 27 - Controller Refactoring & State Consolidation
**Note**: Legacy development phases (1-20) have been moved to `Journal_legacy.md` for reference.  
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

### Phase 22: Contextual Menu System, Buffer PCA Fix & Popover Positioning
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

## Phase 23: Staff Drag Snap-Scroll Enhancement
- ✅ **Snap-Scroll on Drag Start**
  - When dragging a staff card from Staff Pool (regular or buffer), the page auto-scrolls to center the relevant allocation block
  - Therapists (SPT/APPT/RPT) in Step 2 → Block 1: Therapist Allocation
  - Floating PCAs in Step 3 → Block 2: PCA Allocation
  - Uses `scrollIntoView({ behavior: 'smooth', block: 'center' })` on block refs
- ✅ **DragOverlay with Cursor Snapping**
  - Implemented `DragOverlay` with `snapCenterToCursor` modifier from `@dnd-kit/modifiers`
  - Dragged staff card preview follows cursor closely during drag operations
  - Applies to both regular staff and buffer staff from Staff Pool
- ✅ **Block Anchors**
  - Added refs (`therapistAllocationBlockRef`, `pcaAllocationBlockRef`) to Block 1 and Block 2 wrappers
  - Enables precise scroll targeting for snap-scroll behavior

## Phase 25: Drag & Drop UI Fixes & Popover Positioning (Latest)
- ✅ **Floating PCA Slot Transfer Popover Fixes**
  - Fixed popover positioning: now uses document coordinates (adds scrollX/scrollY) to match SlotSelectionPopover's absolute positioning
  - Changed popover to show **only after drop** (not during drag-move) to prevent "jump" from origin to drop target
  - Popover now appears correctly positioned next to drop target after auto-scroll/snap
- ✅ **Staff Card Drag Visual Fix**
  - Fixed "double/ghost" staff card during drag: added `useDragOverlay` prop to `StaffCard`
  - When `useDragOverlay=true` and dragging, original card stays stationary (no transform) while DragOverlay follows cursor
  - Applied to all StaffCard instances in schedule allocation UI
- ✅ **Bed Edit Warning Tooltip**
  - Converted bed relieving "Edit" invalid-step warning from popover to tooltip-style (matches other warnings)
  - Fixed positioning: now uses cursor coordinates with viewport clamping, appears near click point
  - Dismisses on any click or Escape (no auto-timer)
- ✅ **Slot Picker Drag Hover State**
  - Added hover pre-select state for PCA blocks when dragging selected slots from slot-picker popover
  - `externalHover` prop now triggers border highlight even when dnd-kit isn't active (slot-picker uses mouse listeners)
  - Source team excluded from hover highlight (only valid drop targets show pre-select)

## Phase 24: Staff Pool Context Menu & Assign Slot Feature
- ✅ **Staff Pool Contextual Menu System**
  - Added schedule-grid style contextual menu to Staff Pool cards (therapist pool, PCA pool, buffer staff pool)
  - Accessible via **right-click** or **hover pencil click** on staff cards
  - Menu opens at document-relative position (scrolls with page, not clipped by Staff Pool overflow)
  - While menu is open, dragging is disabled for the active card (prevents drag + snap-scroll interference)
  - **Compact sizing**: Reduced menu width (`220px` → `180px`), padding, and font size for more compact appearance
  - **Smart positioning**: Menu top border always aligns with staff card top border; if truncated by viewport, page auto-scrolls (smooth) to make room
- ✅ **Staff Pool-Only "Assign Slot" Action**
  - New menu item **"Assign slot"** (icon: `PlusCircle`) placed after "Leave edit" / "Edit buffer staff" and before "Move slot"
  - **Floating PCA (regular + buffer)**:
    - 2-page non-modal popover flow: Team picker → Slot picker (shows only remaining/unassigned slots) → Confirm
    - If all slots already assigned, menu item disabled with tooltip: "All slots are already assigned."
    - Supports creating **first allocation** when PCA has 0 slots assigned (unlike drag behavior which requires existing allocation)
    - After assignment, Staff Pool battery automatically reflects reduced `trueFTE` (derived from allocations)
  - **Non-floating PCA**: Menu item hidden
  - **Therapist**:
    - **SPT only** (APPT/RPT hidden)
    - Assigns **all remaining weekday SPT FTE** (config FTE minus leave cost minus already-assigned) to selected team
    - If remaining SPT FTE = 0, menu item disabled with tooltip: "All available SPT FTE is already assigned. Use Move slot / Split slot to amend existing assignments."
  - **Buffer staff (all ranks)**: Show "Assign slot" where applicable (buffer therapists: Step 2 only, buffer floating PCA: Step 3 only)
- ✅ **SPT Smart Menu Behavior (Staff Pool)**
  - For SPT with **0 duty FTE for the weekday** (per dashboard config / overrides), menu shows **only "Leave edit"** and **hides all other options** (Assign/Move/Split/Merge/Discard/Fill color)
  - Only shows full menu when SPT has duty FTE > 0 (supposedly has duty but may be on leave)
  - Prevents confusion from disabled actions when SPT has no duty scheduled
- ✅ **Buffer Staff Menu Adjustments (Staff Pool)**
  - **"Edit buffer staff"** replaces "Leave edit" as first menu item (opens `BufferStaffCreateDialog` in edit mode)
  - **"Convert to inactive"** (icon: `UserX`) placed before "Fill color" with **confirm popover** (Cancel/Confirm) instead of immediate conversion
  - Removed on-card **X "Convert to inactive"** button (conversion now only via context menu)
  - Buffer staff no longer show "Leave edit" in Staff Pool menu
- ✅ **Backend Allocation Math**
  - `performPcaSlotAssignFromPool()`: Creates new allocation or updates existing, rebuilds `pcaAllocations` per-team lists, updates `staffOverrides.slotOverrides`, reduces `pendingPCAFTEPerTeam[targetTeam]`
  - SPT assign: Updates `staffOverrides.therapistTeamFTEByTeam` to add remaining FTE to selected team, maintains consistency with existing split/merge logic
  - Buffer therapist assign: Sets `staffOverrides.team` and updates `staff.team` in database
- ✅ **Component Updates**
  - `BufferStaffCreateDialog`: Added edit mode support (`staffToEdit`, `initialAvailableSlots` props) with pre-populated form and update vs insert logic
  - `SlotSelectionPopover`: Added `actionLabel` prop ('move' | 'discard' | 'assign') for context-appropriate copy
  - `StaffPool` / `BufferStaffPool`: Wired `onOpenStaffContextMenu` callback, added `disableDragging` prop to prevent drag while menu open
- ✅ **Files Modified**: `app/(dashboard)/schedule/page.tsx`, `components/allocation/StaffPool.tsx`, `components/allocation/BufferStaffPool.tsx`, `components/allocation/BufferStaffCreateDialog.tsx`, `components/allocation/SlotSelectionPopover.tsx`, `components/allocation/StaffContextMenu.tsx`

## Phase 25: Frontend Toolchain Upgrade & Loading Optimization
- ✅ **Major Dependency Upgrades**
  - Next.js: 14 → 16.1.2 (App Router, Turbopack enabled by default)
  - React & React-DOM: 18 → 19.2.x (React 19 strict mode, improved `React.cloneElement` typing)
  - Tailwind CSS: 3.4 → 4.1.x (full CSS-first config migration, removed `tailwind.config.ts`)
  - ESLint: 8 → 9+ (flat config `eslint.config.mjs`, disabled non-critical rules for migration stability)
  - `@dnd-kit`: Updated to latest ~6.x
- ✅ **Tailwind v4 CSS-First Migration**
  - Removed `tailwind.config.ts` (configuration moved to `app/globals.css`)
  - Added `@theme` block in `globals.css` for Shadcn token mapping and custom keyframes
  - Added `@source` directives for file scanning
  - Added `@custom-variant dark` for class-based dark mode
  - Custom animations: `toast-in`/`toast-out` keyframes for toast notifications
  - Updated utility classes: `shadow-sm` → `shadow-xs`, `border` → `border-border` for v4 compatibility
- ✅ **Next.js Loading.tsx Implementation**
  - Added `app/(dashboard)/schedule/loading.tsx` with skeleton UI for route transitions
  - Added `app/(dashboard)/dashboard/loading.tsx` and `app/(dashboard)/history/loading.tsx`
  - Created `ScheduleLoadingMetricsPing` client component for navigation timing diagnostics
  - Navigation timing integration: tracks `start → loading.tsx shown → mount → grid ready` deltas
  - Load diagnostics tooltip: displays navigation timing metrics for developer role
- ✅ **Legacy Loading Overlay Removal**
  - Removed dimming overlay + spinner (`LoadingAnimation` component deleted)
  - Replaced with non-dimming skeleton overlay for team grid (opaque `bg-background`, blocks interaction until data ready)
  - Removed `navbarHeightPx` prop from `NavigationLoadingProvider` (legacy dimming overlay remnant)
  - Navigation loading now uses top progress bar + `loading.tsx` skeletons only
- ✅ **Team Grid Skeleton Overlay**
  - Skeleton overlay activates on initial load and in-page date switches (prevents editing stale data)
  - Covers only team grid column (not summary/staff pool)
  - `beginDateTransition()` helper ensures skeleton shows immediately on date change
- ✅ **Navigation Timing Diagnostics**
  - Mount-time fallback: computes `navToScheduleTiming` when cached data skips loading overlay
  - Tooltip shows navigation deltas even when `lastLoadTiming` is missing
  - Developer-only tooltip with detailed timing breakdown
- ✅ **Build & Type Safety**
  - TypeScript strict mode compliance maintained throughout upgrades
  - All builds pass (`npm run build` successful)
  - React 19 compatibility: fixed `React.cloneElement` strict typing issues

### Technical Achievements
- ✅ **Type Safety**: Comprehensive database type conversion utilities
- ✅ **State Management**: Three-layer architecture (Saved → Algorithm → Override)
- ✅ **Algorithm Robustness**: Rounding consistency, infinite loop prevention
- ✅ **UI/UX**: Interactive wizards, drag-and-drop, real-time feedback
- ✅ **Code Quality**: TypeScript strict mode, comprehensive error handling
- ✅ **Documentation**: Rule files for database types and TypeScript patterns

### Phase 26: Snapshot UI & Step Reset Refactoring
- ✅ **Snapshot UI Reminders**
  - Compact "Snapshot mode" banner in header (between date controls and copy/save actions) when viewing non-today date with `baselineSnapshot`
  - General message: "You're viewing the saved snapshot for this date. Later dashboard changes may not appear here."
  - Staff Pool label indicating snapshot mode (rendered inside scrollable content, doesn't affect column height)
  - Both banner and label visually distinctive (amber alert styling)
- ✅ **"Show Differences" Feature**
  - Non-modal popover panel in header banner showing differences between snapshot and live dashboard config
  - Fetches live config on-demand (staff, wards, PCA preferences, special programs, SPT allocations)
  - Displays structured diffs (added, removed, changed items per category)
  - Graceful handling of missing DB columns (e.g., `team_assignment_portions`)
  - Anchored to button, clamped to viewport, closes on outside click
- ✅ **Step Reset Helper Refactoring**
  - Centralized reset logic in `lib/features/schedule/stepReset.ts` to prevent inconsistencies between "Clear" buttons and "Algo entry" resets
  - `resetStep2OverridesForAlgoEntry`: Clears `availableSlots` for floating PCAs (preserves buffer PCA availability)
  - `computeStep3ResetForReentry`: Computes Step 3 reset state (cleans allocations preserving manual buffer assignments, rebuilds from `bufferManualSlotOverrides`, recalculates pending FTE)
  - Ensures both call sites use identical reset logic
- ✅ **Buffer PCA Step 3 Fixes**
  - Step 3 reset preserves manual buffer PCA slot assignments (`bufferManualSlotOverrides`)
  - Step 3.1 dialog enhanced: Three buffer PCA status classes (Fully assigned, Partially assigned, Pending to be assigned) with distinct icons and staff name listings
  - Condensed instructional text with collapsible details section
  - Buffer staff names displayed as visually distinct chips/badges
- ✅ **Step 2.0 UI/Logic Tweaks**
  - Carousel card layout: Slot buttons use CSS grid (`grid-cols-4`) to ensure single-row display
  - Compact dropdown/input widths (`max-w-[320px]` for selects, `max-w-[180px]` for numeric inputs)
  - Removed hard-coded filter excluding buffer PCAs from special program candidate list
  - Buffer PCAs with compatible special program properties now shown as candidates
  - Display includes floating status (e.g., "Name (Buffer Floating)")
- ✅ **Staff Pool Layout Fix**
  - Fixed Staff Pool scroll/height disruption caused by snapshot label
  - Snapshot notice rendered as sticky element inside scrollable content
  - Parent wrapper uses `flex-1 min-h-0` to correctly fill available height
  - Ensures Staff Pool is height-constrained with proper internal scrolling

### Phase 27: Controller Refactoring & State Consolidation (See WIP.md Stage 1-2 for details)
- ✅ **Schedule Controller Hook (`useScheduleController`)**
  - Created `lib/features/schedule/controller/useScheduleController.ts` to centralize domain state and actions
  - Domain state moved from `page.tsx` into controller (selectedDate, allocations, calculations, staffOverrides, workflowState, baselineSnapshot, etc.)
  - Exposes stable API: `{ state, actions }` where `actions` contains explicit domain actions
  - Raw `setX` functions moved behind `actions._unsafe` escape hatch to prevent accidental usage
- ✅ **State Consolidation with `useReducer`**
  - Replaced multiple `useState` calls in controller with single `useReducer`-backed store
  - Separated **Domain State** (controller-owned) from **UI State** (page-owned: dialogs, popovers, tooltips, drag overlays)
  - Setter-style actions preserved as stable wrappers around reducer dispatch (minimizes `page.tsx` churn)
- ✅ **Domain Actions Moved into Controller**
  - **Date navigation**: `beginDateTransition`, `loadScheduleForDate`, `loadAndHydrateDate`
  - **Persistence**: `saveScheduleToDatabase`, `copySchedule`, `resetToBaseline`
  - **Step runners**: `runStep2TherapistAndNonFloatingPCA`, `runStep3FloatingPCA`, `runStep4BedRelieving`
  - **Step navigation**: `goToStep`, `goToNextStep`, `goToPreviousStep` (eliminated raw `setCurrentStep` usage)
  - **Domain mutations**: `applyStaffEditDomain`, `updateBedRelievingNotes`, `clearDomainFromStep`, `resetStep3ForReentry`, `applyBaselineViewAllocations`, `markStepCompleted`
- ✅ **UI Component Extraction (Stage 1)**
  - `ScheduleHeaderBar`: Header with date navigation, title, snapshot banner, actions
  - `SnapshotDiffPopover`: "Show differences" popover panel
  - `ScheduleDialogsLayer`: Centralized dialog/popover layer (bed edit, staff edit, tiebreak, copy wizard, etc.)
  - `ScheduleMainLayout`: Main two-column layout (summary + staff pool + grid)
  - `ScheduleTitleWithLoadDiagnostics`: Title with developer-only load diagnostics tooltip
  - Constants moved to `lib/features/schedule/constants.ts`
- ✅ **Benefits Achieved**
  - **Maintainability**: Domain logic centralized in controller, `page.tsx` is now mostly UI wiring
  - **Type Safety**: Stable controller API reduces risk of incorrect state mutations
  - **Extensibility**: New domain actions can be added without touching `page.tsx`
  - **Testability**: Controller logic can be tested independently from UI
  - **Code Organization**: Clear separation between domain (controller) and presentation (page)
- **Reference**: See `WIP.md` Stage 1-2 for detailed refactoring roadmap and progress tracking

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
- `app/(dashboard)/schedule/page.tsx` - Main schedule page
- `app/(dashboard)/schedule/loading.tsx` - Schedule page skeleton UI for route transitions
- `app/(dashboard)/schedule/schedule-loading-metrics-ping.tsx` - Client component for navigation timing diagnostics
- `app/(dashboard)/dashboard/loading.tsx` - Dashboard page skeleton UI
- `app/(dashboard)/history/page.tsx` - Schedule history page with batch operations
- `app/(dashboard)/history/loading.tsx` - History page skeleton UI
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
- `components/ui/navigation-loading.tsx` - Global navigation loading provider with top progress bar (legacy dimming overlay removed)

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

## Phase 28: Snapshot-local buffer staff (read+write) and copy exclusion

- **Snapshot-local buffer conversion**: Schedule “From Inactive Staff” reads inactive staff strictly from the schedule snapshot roster; converting inactive → buffer is stored schedule-locally in `daily_schedules.staff_overrides.__staffStatusOverrides` (with `nameAtTime` / `rankAtTime`) and persists on Save.
- **No global fallback**: Removed hybrid snapshot/global fallback that caused inconsistent UI and intermittent “nil inactive staff” due to client fetch lifecycle/caching.
- **Copy wizard**: “Exclude buffer staff” drops allocations involving schedule-local buffer staff ids and strips buffer overrides on the target schedule.
- **RPC support**: Added `supabase/migrations/update_copy_schedule_rpc_buffer_staff_ids.sql` to update `copy_schedule_v1` to exclude allocations via passed `buffer_staff_ids` rather than global `staff.status`.
- **Cache gotcha**: After Sync/Publish “Pull Global → snapshot”, the Schedule page may still show older snapshot data until cache expires or you hard-refresh.

---

**End of Journal**

