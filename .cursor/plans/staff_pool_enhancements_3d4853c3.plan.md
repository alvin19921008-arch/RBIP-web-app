---
name: Staff Pool Enhancements
overview: Enhance the staff pool with FTE display, battery visualization for floating PCA, slot transfer functionality, leave edit triggers, and UI refinements.
todos:
  - id: fte-display
    content: Add Base_FTE-remaining display next to staff names in StaffPool (except SPT, show when FTE > 0 & < 1, show 0 when FTE = 0)
    status: completed
  - id: leave-edit-recalc
    content: Update handleSaveStaffEdit to trigger recalculateScheduleCalculations and generateAllocationsWithOverrides after updating staffOverrides
    status: completed
  - id: slot-transfer-staff-pool
    content: Enable slot transfer for floating PCA in staff pool with validation (only after Step 3.4 algo runs, show warning popover if attempted earlier)
    status: completed
  - id: battery-display
    content: Implement battery visualization for floating PCA in staff pool (outer border = Base_FTE, green fill = True-FTE)
    status: completed
  - id: ui-refinements
    content: Reduce padding in all pools and add FTE ≠ 1 filter with rank-based sorting
    status: completed
---

# Staff Pool Enhancements

## Overview

Enhance the staff pool component with FTE display, floating PCA battery visualization, slot transfer functionality, automatic recalculation on leave edits, and UI improvements.

## Implementation Plan

### 1. FTE Display in Staff Pool

**Files to modify:**

- `components/allocation/StaffPool.tsx`
- `components/allocation/StaffCard.tsx`

**Changes:**

- Calculate Base_FTE-remaining from `staffOverrides` for each staff member
- **Important**: Base_FTE-remaining = FTE after subtracting leave type, but EXCLUDING special program subtraction
- For staff with rank ≠ SPT and FTE > 0 & < 1: display FTE next to name (e.g., "John 0.7")
- For staff with FTE = 0: display "0" next to name (e.g., "John 0")
- Use same display logic as `TherapistBlock` (lines 99-110 in `TherapistBlock.tsx`)
- Pass `staffOverrides` to `StaffPool` component
- Calculate FTE for display:
  - Base_FTE-remaining = `1.0 - (staffOverrides[staffId]?.fteSubtraction || 0)`
  - Note: `fteSubtraction` should only include leave-related subtraction, not special program FTE

### 2. Leave Edit Trigger & Recalculation

**Files to modify:**

- `app/(dashboard)/schedule/page.tsx` - `handleSaveStaffEdit` function

**Changes:**

- After updating `staffOverrides`, immediately trigger:
  - `recalculateScheduleCalculations()` - updates therapist-FTE/team, avg PCA/team, daily bed load
  - `generateAllocationsWithOverrides(newOverrides)` - updates True-FTE remaining, slot_assigned, Pending PCA-FTE/team
- Keep user on Step 1 (don't auto-advance)
- Mark Step 1 as 'modified' and allow proceeding to Step 2
- This treats the edit as an allocation so user can proceed to Step 2

### 3. Floating PCA Slot Transfer in Staff Pool

**Files to modify:**

- `components/allocation/StaffPool.tsx`
- `components/allocation/StaffCard.tsx`
- `app/(dashboard)/schedule/page.tsx`

**Changes:**

- Enable drag-and-drop for floating PCA cards in staff pool
- Add validation: only allow slot transfer when:
  - Staff is floating PCA (`staff.floating === true`)
  - Current step is 'floating-pca' (Step 3)
  - Step 3.4 algorithm has run (`initializedSteps.has('floating-pca')`)
- Show warning popover (non-modal) if user attempts drag before Step 3.4 algo runs
- Reuse existing warning popover UI from schedule page (lines 3470-3494)
- Pass `currentStep`, `initializedSteps`, and slot transfer handlers to `StaffPool`
- Integrate with existing slot transfer logic in schedule page

### 4. Floating PCA Battery Display (Staff Pool Only)

**Files to modify:**

- `components/allocation/StaffCard.tsx`
- `components/allocation/StaffPool.tsx`

**Visual Design:**

```
┌─────────────────────────┐
│ ┌─────────────────────┐ │  ← Outer border (grey, based on Base_FTE-remaining)
│ │ ████████░░░░░░░░░░░░ │ │  ← Green fill (based on True-FTE-remaining)
│ │ John 0.5            │ │  ← Name + FTE display
│ └─────────────────────┘ │
└─────────────────────────┘
```

**Implementation:**

- Add new props to `StaffCard`:
  - `baseFTE?: number` - Base_FTE-remaining (for outer border)
  - `trueFTE?: number` - True-FTE-remaining (for green fill)
  - `isFloatingPCA?: boolean` - Flag to enable battery display
- Calculate values in `StaffPool`:
  - `baseFTE = 1.0 - (staffOverrides[id]?.fteSubtraction || 0)`
  - `trueFTE = calculateTrueFTEFromAllocations()` - accounts for:
    - Base_FTE-remaining
    - Special program FTE subtraction (from `specialPrograms` and current allocations)
    - Already assigned slots (from `pcaAllocations`)
- Battery visualization:
  - Outer border: `border-[2px] border-gray-400 `with width = `baseFTE * 100%` (relative to card width)
  - Green background fill: `bg-green-100 dark:bg-green-900/30` with width = `trueFTE * 100%` (relative to outer border width)
  - Staff name and FTE text overlay on top of green background (use `relative z-10` on text container)
  - Structure: Card container → Outer border container (positioned) → Green background (absolute, inside border) → Text content (relative z-10, overlaying green)
  - Use absolute positioning for layered effect
- Color choice: Use `bg-green-100` for light mode and `bg-green-900/30` for dark mode to match existing theme (similar to `bg-green-50` and `bg-green-950/30` used in `TeamAdjacentSlotCard.tsx`)
- Only apply to floating PCA in staff pool (not in team columns)

**True-FTE Calculation Logic:**

```typescript
// Base FTE from leave settings
const baseFTE = 1.0 - (staffOverrides[id]?.fteSubtraction || 0)

// Available slots (from staffOverrides or default to all 4)
const availableSlots = staffOverrides[id]?.availableSlots || [1, 2, 3, 4]

// Initial True-FTE = available slots * 0.25
let trueFTE = availableSlots.length * 0.25

// Subtract special program FTE (if assigned in Step 2)
const specialProgramFTE = calculateSpecialProgramFTE(id, specialPrograms, weekday)

// Subtract already assigned slots (from pcaAllocations)
const assignedSlots = getAssignedSlotsFromAllocations(id, pcaAllocations)
const assignedFTE = assignedSlots.length * 0.25

// Final True-FTE = initial - special program - assigned
trueFTE = Math.max(0, trueFTE - specialProgramFTE - assignedFTE)
```

### 5. UI Refinements

**Files to modify:**

- `components/allocation/StaffPool.tsx`
- `components/allocation/InactiveStaffPool.tsx`

**Changes:**

- Reduce padding in all CardContent sections:
  - Change `space-y-2` to `space-y-1` (therapist pool)
  - Change `CardContent` padding from default to `p-1` or `p-2`
  - Ensure all three pools (therapist, PCA, inactive) have same minimal padding
- Add filter button next to "Show All":
  - Button: "Show FTE ≠ 1" (toggle filter)
  - When active: filter staff where `fteRemaining !== 1.0` (use Base_FTE-remaining)
  - After filtering, sort by: SPT → APPT → RPT → PCA (maintain rank order)
  - Filter applies to all three pools (therapist, PCA, inactive)

### 6. Data Flow & Props

**New props for StaffPool:**

```typescript
interface StaffPoolProps {
  therapists: Staff[]
  pcas: Staff[]
  inactiveStaff?: Staff[]
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
  // New props:
  staffOverrides?: Record<string, StaffOverride>
  specialPrograms?: SpecialProgram[]
  pcaAllocations?: Record<Team, (PCAAllocation & { staff: Staff })[]>
  currentStep?: string
  initializedSteps?: Set<string>
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  onSlotTransfer?: (staffId: string, targetTeam: Team, slots: number[]) => void
}
```

**New props for StaffCard:**

```typescript
interface StaffCardProps {
  // ... existing props
  baseFTE?: number // For battery outer border
  trueFTE?: number // For battery green fill
  isFloatingPCA?: boolean // Enable battery display
  showFTE?: boolean // Show FTE next to name
  currentStep?: string // For slot transfer validation
  initializedSteps?: Set<string> // For slot transfer validation
}
```

## Visual Draft: Battery Display

```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │ ← Outer border (grey-400, 2px)
│ │ ████████████░░░░░░░░░░░░░░░░░░░░ │ │ ← Green BACKGROUND (green-100/dark:green-900/30)
│ │                                   │ │
│ │  John 0.5                        │ │ ← Name + Base FTE (OVERLAY on green)
│ │                                   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
     ↑                    ↑
  Base FTE = 0.5    True FTE = 0.25
  (50% border)      (50% of border filled)

Example: Base FTE = 0.5, True FTE = 0.25
- Outer border covers 50% of card width
- Green BACKGROUND covers 50% of outer border (25% of total card)
- Staff name and FTE text are overlaid on top of the green background
- Green color: `bg-green-100` (light) / `bg-green-900/30` (dark) to match theme
```

## Implementation Order

1. Add FTE display next to names (Base_FTE-remaining)
2. Add filter for FTE ≠ 1
3. Reduce padding in all pools
4. Implement battery display for floating PCA
5. Enable slot transfer with validation
6. Update leave edit to trigger recalculations

## Testing Considerations

- Verify FTE display shows correct values (Base_FTE-remaining)
- Test battery display updates as slots are assigned
- Test slot transfer validation (warning before Step 3.4)
- Test leave edit triggers all recalculations
- Verify filter works correctly with sorting
- Test padding consistency across all pools