# Data Flow Analysis: staffOverrides vs Saved Allocation Data

## Problem Statement
The average PCA/team calculation doesn't update in Step 1 when `staffOverrides` changes because the calculation uses saved allocation data instead of the current `staffOverrides` state.

## Key Functions and Their Data Sources

### 1. `useSavedAllocations(therapistAllocs, pcaAllocs, overrides)`
**Location:** `app/(dashboard)/schedule/page.tsx:496`

**When called:**
- When loading saved allocations from database (initial load)

**Data sources:**
- **Parameter `overrides`**: Saved overrides from database (initial state)
- **State `staffOverrides`**: Uses the STATE variable (may be outdated if user edited)
- **`alloc.fte_pca`**: Saved allocation FTE from database

**Calculation logic:**
```typescript
// Line 651-657: totalPCAFromAllocations
const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining  // Uses STATE
const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)

// Line 677-681: pcaOnDuty
const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining  // Uses STATE
const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
```

**Issue:** Uses `staffOverrides` STATE, but this function only runs ONCE when loading. When user edits in Step 1, `staffOverrides` state changes but this function doesn't re-run.

---

### 2. `generateAllocationsWithOverrides(overrides)`
**Location:** `app/(dashboard)/schedule/page.tsx:743`

**When called:**
- When generating new allocations (Step 2+)
- When no saved allocations exist

**Data sources:**
- **Parameter `overrides`**: Passed from caller (could be `staffOverrides` state or saved overrides)
- **`alloc.fte_pca`**: From newly generated allocations

**Calculation logic:**
```typescript
// Line 1124-1130: totalPCAFromAllocations
const overrideFTE = overrides[alloc.staff_id]?.fteRemaining  // Uses PARAMETER
const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)

// Line 1177-1180: pcaOnDuty
const overrideFTE = overrides[alloc.staff_id]?.fteRemaining  // Uses PARAMETER
const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
```

**Status:** ✅ Correctly uses parameter `overrides` (which should be current `staffOverrides` state)

---

### 3. `handleSaveStaffEdit(...)`
**Location:** `app/(dashboard)/schedule/page.tsx:737`

**When called:**
- When user saves staff edit in Step 1

**What it does:**
- Updates `staffOverrides` STATE
- Does NOT trigger recalculation of `calculations` state

**Issue:** After updating `staffOverrides`, the `calculations` state (which contains `average_pca_per_team`) is NOT recalculated.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: User Edits Staff Leave                              │
│                                                              │
│  handleSaveStaffEdit()                                      │
│    ↓                                                         │
│  setStaffOverrides(newOverrides)  ← Updates STATE           │
│    ↓                                                         │
│  ❌ calculations state NOT updated                          │
│    (average_pca_per_team still uses old data)              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Initial Load: useSavedAllocations()                         │
│                                                              │
│  Load from DB → pcaAllocs, overrides                        │
│    ↓                                                         │
│  setStaffOverrides(overrides)  ← Sets STATE                 │
│    ↓                                                         │
│  Calculate totalPCAFromAllocations                           │
│    Uses: staffOverrides STATE + alloc.fte_pca               │
│    ↓                                                         │
│  setCalculations(scheduleCalcs)  ← Sets calculations       │
│    (average_pca_per_team = 2.11)                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Step 2: Generate Allocations                                │
│                                                              │
│  generateAllocationsWithOverrides(staffOverrides)           │
│    ↓                                                         │
│  Calculate totalPCAFromAllocations                           │
│    Uses: overrides PARAMETER + alloc.fte_pca                │
│    ↓                                                         │
│  setCalculations(scheduleCalcs)  ← Updates calculations     │
│    (average_pca_per_team = updated value)                  │
└─────────────────────────────────────────────────────────────┘
```

## Root Cause

**The problem:** `useSavedAllocations` calculates `average_pca_per_team` ONCE when loading saved data, but doesn't recalculate when `staffOverrides` state changes in Step 1.

**Why it happens:**
1. `useSavedAllocations` runs only when loading from DB
2. It uses `staffOverrides` STATE at that moment
3. When user edits in Step 1, `staffOverrides` state updates
4. But `useSavedAllocations` doesn't re-run, so `calculations` state stays stale

## Solution Options

### Option 1: Recalculate on staffOverrides change (Recommended)
Add a `useEffect` that recalculates `calculations` when `staffOverrides` changes:

```typescript
useEffect(() => {
  if (hasSavedAllocations && Object.keys(staffOverrides).length > 0) {
    // Recalculate using current staffOverrides
    recalculateScheduleCalculations()
  }
}, [staffOverrides, hasSavedAllocations, pcaAllocations, ...])
```

### Option 2: Extract calculation function
Create a shared function that both `useSavedAllocations` and the `useEffect` can call.

### Option 3: Use derived state
Calculate `average_pca_per_team` on-the-fly in the render, using current `staffOverrides` state.

## Instrumentation Added

Logs added to trace:
1. `useSavedAllocations` - when calculating totalPCAFromAllocations (runId: run11)
2. `generateAllocationsWithOverrides` - when calculating totalPCAFromAllocations (runId: run11)
3. `handleSaveStaffEdit` - when staffOverrides state updates (runId: run11)
4. Both functions - when calculating averagePCA for FO team (runId: run11)
5. Special tracking for staff ID `b01a3662-ea71-4559-92ab-7446ce65ebe5` (珊)

## Next Steps

1. Run the app and edit 珊 to FTE=0
2. Check logs to see:
   - Which function calculates averagePCA
   - What data source it uses (state vs parameter)
   - Whether calculations are updated after edit
3. Implement fix based on log evidence

