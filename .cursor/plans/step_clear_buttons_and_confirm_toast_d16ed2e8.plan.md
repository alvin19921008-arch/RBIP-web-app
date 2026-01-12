---
name: step_clear_buttons_and_confirm_toast
overview: Add per-step Clear buttons (Steps 1–4) that wipe only that step’s allocations/inputs, with cascade+warning when later-step data exists, and an interactive confirm/cancel toast for destructive clears.
todos:
  - id: stepindicator-clear-ui
    content: Add Clear button UI + new props to `components/allocation/StepIndicator.tsx` for Steps 1–4.
    status: pending
  - id: toast-actions
    content: Extend `ActionToast` + toast APIs to support action buttons and non-auto-dismiss warning toasts.
    status: pending
  - id: schedule-clear-handlers
    content: Implement per-step and cascade clear logic in `app/(dashboard)/schedule/page.tsx` and wire into StepIndicator.
    status: pending
  - id: success-toasts
    content: Add success + warning toasts describing which steps were cleared, including confirm/cancel in warning.
    status: pending
---

# Step Clear Buttons + Confirm Toast

## Goals

- Add a **Clear** button in the Step Indicator for **Steps 1–4**, next to the existing **Initialize/Re-run Algorithm** button (Step 2–4) and standalone for Step 1.
- Clear only **step-scoped** data:
  - **Step 1**: clear Step-1 staff inputs in `staffOverrides` (leave/FTE/slots/invalid slots/AM-PM/specialProgramAvailable) while **preserving** schedule-level metadata (`__allocationNotes`, `__bedCounts`, etc.).
  - **Step 2**: clear therapist allocations + Step-2 PCA allocations + Step 2.0 overrides + Step 2.1 substitution selections, **preserving Step-1 overrides**.
  - **Step 3**: clear floating PCA allocations and manual floating transfers (`staffOverrides.slotOverrides`) and Step-3 tracking state, **preserving Step-2 results**.
  - **Step 4**: clear bed allocations + bed relieving notes (`__bedRelieving`), **preserving** bed count overrides (`__bedCounts`).
- If **later-step data exists**, clicking Clear on an earlier step must show a **confirm/cancel warning**; confirming clears **that step and all later steps**.
- Use the existing toast system, but extend it so a **toast can contain clickable buttons** for confirm/cancel.

## Key code touchpoints

- Step Indicator currently renders the algo button here:
  - [`/Users/alvin/Desktop/RBIP duty list web app/components/allocation/StepIndicator.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/allocation/StepIndicator.tsx)
    - The button block is around:
```194:206:/Users/alvin/Desktop/RBIP duty list web app/components/allocation/StepIndicator.tsx
        {onInitialize && ['therapist-pca', 'floating-pca', 'bed-relieving'].includes(currentStep) && (
          <div className="flex justify-center">
            <Button
              onClick={onInitialize}
              disabled={isLoading}
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? 'Running...' : isInitialized ? 'Re-run Algorithm' : 'Initialize Algorithm'}
            </Button>
          </div>
        )}
```

- Schedule page already has a “reset everything” helper we can pattern-match but **do not reuse directly** (it clears notes/bedCounts too):
  - [`/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/app/\\\\\\\\(dashboard)/schedule/page.tsx)
```5107:5133:/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx
  const resetToBaseline = () => {
    setStaffOverrides({})
    setSavedOverrides({})
    setBedCountsOverridesByTeam({})
    setSavedBedCountsOverridesByTeam({})
    setBedRelievingNotesByToTeam({})
    setSavedBedRelievingNotesByToTeam({})
    setAllocationNotesDoc(null)
    setSavedAllocationNotesDoc(null)
    setStep2Result(null)
    setTherapistAllocations({ FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] })
    setPcaAllocations({ FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] })
    setBedAllocations([])
    setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })
    setStepStatus({
      'leave-fte': 'pending',
      'therapist-pca': 'pending',
      'floating-pca': 'pending',
      'bed-relieving': 'pending',
      'review': 'pending',
    })
    setCurrentStep('leave-fte')
    setTieBreakDecisions({})
  }
```

- Toast components to extend for “buttons inside toast”:
  - [`/Users/alvin/Desktop/RBIP duty list web app/components/ui/action-toast.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/ui/action-toast.tsx)
  - [`/Users/alvin/Desktop/RBIP duty list web app/components/ui/toast-provider.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/ui/toast-provider.tsx)
  - Schedule page also uses `ActionToast` locally (not the provider) around where it renders the toast.

## Implementation plan

### 1) Add “Clear” UI to Step Indicator

- Update [`components/allocation/StepIndicator.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/allocation/StepIndicator.tsx)
  - Add new props:
    - `onClearStep?: (stepId: string) => void`
    - `clearDisabled?: boolean` (or derive from `isLoading` + `currentStep`)
  - Render a **Clear** button for `currentStep` in `{ 'leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving' }`.
  - Layout: replace the current centered single-button container with a `flex justify-center gap-2` container.

### 2) Extend ActionToast to support inline action buttons

- Update [`components/ui/action-toast.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/ui/action-toast.tsx)
  - Add optional prop like `actions?: React.ReactNode`.
  - Render an actions row (e.g. `mt-3 flex justify-end gap-2`) beneath description.
  - Ensure the toast remains clickable:
    - It already uses `pointer-events-auto`; keep that.

### 3) Update toast APIs to allow confirm/cancel warnings

- Update [`components/ui/toast-provider.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/ui/toast-provider.tsx)
  - Extend `ToastInput` to accept `actions?: React.ReactNode` and pass it to `ActionToast`.
  - If `actions` are present, default `durationMs` to a long value (or require explicit dismiss), so the user has time to click.
- Update the schedule page’s local toast helper (`showActionToast`) similarly:
  - Add optional `durationMs` + `actions` support so we can show confirm/cancel toasts from the schedule page without rewriting the page to use the global provider.

### 4) Implement step-scoped clear logic in Schedule page

- Update [`app/(dashboard)/schedule/page.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/app/\\\\\\\\(dashboard)/schedule/page.tsx)
  - Add a `handleClearStep(stepId)` passed into `StepIndicator`.
  - Add a helper `hasLaterStepData(targetStepId)` using step order + `stepStatus` (per your requirement: warning whenever later-step data exists).
  - Show a **warning toast** with **Cancel / Confirm** buttons when `hasLaterStepData` is true.
  - On confirm, perform a **cascade clear**:
    - Clear `targetStepId` and all later steps’ state, and set their `stepStatus` back to `pending` (and `review` to `pending`).
    - Remove cleared steps from `initializedSteps`.

#### Step-specific clear actions (non-cascade path)

- **Clear Step 1 (`leave-fte`)**
  - `setStaffOverrides({})` and `setSavedOverrides({})` (this clears Step-1 staff edits; schedule-level metadata stays because it’s stored in separate state: `bedCountsOverridesByTeam`, `bedRelievingNotesByToTeam`, `allocationNotesDoc`).
  - Also clear Step 2–4 allocations/state (because Step 1 is upstream) if they exist; if they exist, this will happen via the cascade path.
- **Clear Step 2 (`therapist-pca`)**
  - `setTherapistAllocations(emptyByTeam)`
  - Clear Step-2 PCA allocations and Step-2 intermediate state: `setPcaAllocations(emptyByTeam)`, `setStep2Result(null)`
  - Remove Step-2 override inputs from `staffOverrides` while keeping Step-1 fields:
    - delete `specialProgramOverrides`
    - delete `substitutionFor`
    - (Assumption) delete `team` overrides used for fixed-team transfers; preserve baseline `staff.team`.
- **Clear Step 3 (`floating-pca`)**
  - Remove Step-3 inputs/tracking:
    - delete `staffOverrides.slotOverrides`
    - `setAdjustedPendingFTE(null)`, `setTeamAllocationOrder(null)`, `setAllocationTracker(null)`, reset `pendingPCAFTEPerTeam`
  - Restore PCA allocations to **Step-2-only** by re-running `allocatePCA` with `phase: 'non-floating-with-special'` using current `staffOverrides` + `specialPrograms` + `pcaPreferences`.
    - This avoids needing a “Step2 snapshot” that the DB doesn’t store.
- **Clear Step 4 (`bed-relieving`)**
  - `setBedAllocations([])`
  - `setBedRelievingNotesByToTeam({})` and `setSavedBedRelievingNotesByToTeam({})`
  - Keep `bedCountsOverridesByTeam` intact.

### 5) Success/failure notifications

- After any successful clear, show a success toast like:
  - “Cleared Step 3” or “Cleared Steps 2–4” (cascade case)

## Acceptance checks

- Step 1–4 each show a **Clear** button in the Step Indicator.
- Clearing Step N only affects Step N (and later only via the warning-confirm flow).
- Confirm/cancel toast buttons are clickable and work.
- Step statuses + `initializedSteps` update consistently so the UI doesn’t claim a cleared step is still completed.

## Files to change

- [`/Users/alvin/Desktop/RBIP duty list web app/components/allocation/StepIndicator.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/allocation/StepIndicator.tsx)
- [`/Users/alvin/Desktop/RBIP duty list web app/components/ui/action-toast.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/ui/action-toast.tsx)
- [`/Users/alvin/Desktop/RBIP duty list web app/components/ui/toast-provider.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/components/ui/toast-provider.tsx)
- [`/Users/alvin/Desktop/RBIP duty list web app/app/(dashboard)/schedule/page.tsx`](file:///Users/alvin/Desktop/RBIP%20duty%20list%20web%20app/app/\\\\\\\\(dashboard)/schedule/page.tsx)