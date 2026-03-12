# WIP — Step 2 PCA + Step 3 Algo Review

**Last Updated**: 2026-03-07  
**Status**: Review complete. `F1`, `F2`, `F3`, `F4`, `F5`, `F6`, and `F7` fixed and regression-tested.

---

## Why this exists

This file captures a focused code review of:

- **Step 2 PCA flow**: non-floating PCA allocation, special-program PCA allocation, and non-floating substitution
- **Step 3 PCA flow**: Step 3.0 buffer pre-assignment, Step 3.2 preferred reservations, Step 3.3 adjacent-slot reservations, and Step 3.4 floating PCA algorithm

The goal is to preserve review findings for future agents so they can continue from a new chat without re-discovering the same loopholes.

This is a **static review note**, not a record of already-fixed issues.

---

## Main Risk Theme

The biggest architectural risk is that the codebase currently has **multiple slot-assignment paths** with **different validation rules**:

- Step 2 substitution logic directly mutates `slot1`-`slot4`
- Step 3.2 / 3.3 reservation execution directly mutates `slot1`-`slot4`
- Step 3.4 uses stricter shared helpers like `findAvailablePCAs()` and safe pending-update wrappers

Because these paths do not enforce the same invariants, the schedule can reach states where:

- a slot is assigned when it should have been ineligible
- a PCA is given more slot work than their remaining FTE should allow
- a team receives more PCA coverage than its pending need
- pending values shown to the user no longer match the actual slot state

That is how these bugs can lead to **wrong PCA calculations**, not just wrong UI.

---

## Finding Index

| # | Severity | Area | Trigger Condition | Wrong PCA Calculation Impact |
|---|---|---|---|---|
| F1 | **CRITICAL** | Step 2 partial substitution | A fallback substitution picks a PCA that already has the target slot occupied by a non-special-program assignment | Existing slot ownership can be overwritten, causing assigned PCA slots per team to become false |
| F2 | **CRITICAL** | Step 2 substitution FTE safety | A substitution branch assigns slots to a PCA without checking actual `fte_remaining` | One PCA can cover more slots than allowed, inflating assigned PCA FTE and under-reporting pending |
| F3 | **CRITICAL** | Step 3.3 adjacent-slot selection | User or auto-flow applies more Step 3.3 slots than the team still needs | Team can be overfilled while pending is clamped to zero, masking surplus coverage |
| F4 | **CRITICAL** | Step 3.2 / 3.3 reservation execution | Reservation/execution layer accepts a slot that Step 3.4 would reject | Manual reservations can create illegal slot states that distort later pending and fairness logic |
| F5 | **HIGH** | Step 3 preference protection | Standard mode protects Step 3.3 picks as if they were Step 3.2 preferred picks | Other teams can be blocked from a PCA more aggressively than intended, skewing Step 3.4 allocation |
| F6 | **HIGH** | Step 3.0 auto buffer pre-assign | Auto pre-assignment grabs first free physical slots without canonical feasibility checks | Buffer PCA slots can be assigned in ways that bypass actual slot availability rules |
| F7 | **HIGH** | Step 3 special-program slot interpretation | An allocation carries multiple `special_program_ids` | Step 3 pending/cap math and Step 3.3 adjacency logic can disagree on what counts as special-program coverage |

---

## Detailed Findings

---

### F1 — CRITICAL: Step 2 partial-substitution fallback can overwrite an already-assigned slot

**Files**:

- `lib/algorithms/pcaAllocation.ts`

**Relevant code**:

```ts
// Check if this slot is already assigned to special program
if (existingAllocation[slotField] !== null && existingAllocation.special_program_ids && existingAllocation.special_program_ids.length > 0) {
  continue
}

// Found suitable floating PCA - assign to non-floating PCA's team for this slot
if (existingAllocation) {
  if (missingSlot === 1) existingAllocation.slot1 = subNeed.team
  if (missingSlot === 2) existingAllocation.slot2 = subNeed.team
  if (missingSlot === 3) existingAllocation.slot3 = subNeed.team
  if (missingSlot === 4) existingAllocation.slot4 = subNeed.team
}
```

**Condition / trigger**:

- A floating PCA already has a slot assigned
- That existing slot assignment is **not** tagged as a special-program slot
- The partial substitution fallback reuses that PCA for the same slot

**What goes wrong**:

The guard only blocks overwriting when the occupied slot is tied to `special_program_ids`.  
If the slot is already used by another substitution or another ordinary allocation path, the code still overwrites it.

**How this can lead to wrong PCA calculation**:

- A slot that was previously counted for Team A can be silently reassigned to Team B
- `teamPCAAssigned` becomes logically wrong because the schedule now reflects a different slot owner than the earlier allocation logic assumed
- Pending PCA need can appear lower for the wrong team and higher for the displaced team
- Downstream Step 3 calculations can start from corrupted Step 2 allocations

**Why this matters**:

This is a true data-integrity issue, not just a preference mismatch. The algorithm can lose a previously valid assignment.

---

### F2 — CRITICAL: Step 2 substitution can assign more slots than a PCA's remaining FTE allows

**Files**:

- `lib/algorithms/pcaAllocation.ts`

**Relevant code**:

```ts
const canPCACoverSlots = (pca, slots, existingAlloc) => {
  if (!pca.is_available) return false

  if (pca.availableSlots && pca.availableSlots.length > 0) {
    const canCover = slots.every(slot => pca.availableSlots!.includes(slot))
    if (!canCover) return false
  }

  if (existingAlloc) {
    for (const slot of slots) {
      const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
      if (existingAlloc[slotField] !== null && existingAlloc.special_program_ids && existingAlloc.special_program_ids.length > 0) {
        return false
      }
    }
  }

  return true
}
```

**Condition / trigger**:

- A floating PCA already has some allocated slots
- The substitution branch tries to assign multiple missing slots to that same PCA
- The code path checks slot shape / special-program occupancy, but not the PCA's true remaining slot capacity

**What goes wrong**:

The helper decides whether a PCA can take all requested slots without checking whether the PCA still has enough `fte_remaining`.

**How this can lead to wrong PCA calculation**:

- A PCA can end up covering more than their actual on-duty capacity
- `slot_assigned` can exceed what should be possible from `fte_pca`
- Pending need for the affected team is reduced as if valid coverage exists
- Step 3 then sees less pending than it should, so floating PCA distribution can under-allocate teams that are actually still short

**Why this matters**:

This directly breaks the core accounting rule that each slot must correspond to real remaining PCA capacity.

---

### F3 — CRITICAL: Step 3.3 can overfill a team, and the executor silently accepts it

**Files**:

- `components/allocation/FloatingPCAConfigDialog.tsx`
- `lib/utils/reservationLogic.ts`

**Relevant code**:

```ts
// Add selection (multiple selections allowed per team in 3.3)
setStep33Selections([...step33Selections, { team, slot, pcaId, pcaName }])
```

```ts
// Decrement team's pending FTE by 0.25
updatedPendingFTE[team] = Math.max(0, (updatedPendingFTE[team] || 0) - 0.25)
```

**Condition / trigger**:

- A team has only `0.25` pending, or otherwise limited pending
- User selects multiple adjacent-slot assignments in Step 3.3 for that same team
- Or an auto-flow applies more adjacent-slot assignments than the remaining pending justifies

**What goes wrong**:

The selection layer allows multiple picks, and the execution layer does not reject excess assignments.  
It simply clamps pending to zero.

**How this can lead to wrong PCA calculation**:

- The team can receive more slot coverage than its remaining need
- Pending is clamped to `0`, so the surplus disappears from the numeric state
- Team coverage looks “exactly fulfilled” in the pending model even though the slot ledger shows over-assignment
- This can starve other teams in the same run because real PCA capacity has been consumed but the model hides the overfill

**Why this matters**:

This is a silent over-assignment bug. The incorrect state is not surfaced as an error.

---

### F4 — CRITICAL: Step 3.2 / 3.3 reservation execution is weaker than Step 3.4's canonical rules

**Files**:

- `lib/utils/reservationLogic.ts`
- `lib/utils/floatingPCAHelpers.ts`

**Relevant code**:

```ts
// Step 3.2 reservation eligibility
if (!pca || pca.fte_pca <= 0) continue

const existingAlloc = allocationByStaffId.get(pcaId)
if (existingAlloc) {
  const slotOwner = getSlotTeam(existingAlloc, preferredSlot)
  if (slotOwner !== null) continue
}
```

**Condition / trigger**:

- A PCA/slot looks free by simple occupancy checks
- But that same PCA/slot would fail stricter checks used by Step 3.4, such as:
  - explicit `availableSlots`
  - invalid-slot constraints
  - effective FTE capacity after earlier usage

**What goes wrong**:

Step 3.2 / 3.3 can create assignments that the main Step 3.4 allocator itself would not have produced.

**How this can lead to wrong PCA calculation**:

- A “manual reservation” can consume a slot that should not have been eligible
- Pending is reduced as if the assignment were valid
- Step 3.4 then allocates from an already-distorted base state
- Final team distribution may appear internally consistent but still be wrong because the seed assignments were invalid

**Why this matters**:

This is the clearest sign of rule drift between manual reservation layers and the final algorithm.

---

### F5 — HIGH: Preference protection is broader than the UI copy implies

**Files**:

- `components/allocation/FloatingPCAConfigDialog.tsx`
- `lib/algorithms/pcaAllocation.ts`

**Relevant code**:

```ts
Preferred = Step 3.2 picks: preferred PCA, preferred slots, or both.
```

```ts
selectedPreferenceAssignments:
  mode === 'standard'
    ? [...step32Assignments, ...step33Assignments].map((a) => ({
        team: a.team,
        slot: a.slot,
        pcaId: a.pcaId,
      }))
```

**Condition / trigger**:

- Standard mode is used
- `selected_only` preference mode is active
- There are Step 3.3 adjacent-slot selections

**What goes wrong**:

The algorithm treats Step 3.3 picks as part of the protected preferred set, even though the UI copy frames “Preferred” around Step 3.2 picks.

**How this can lead to wrong PCA calculation**:

- A PCA chosen in Step 3.3 can become protected from use by other teams
- In `exclusive` protection mode, this can over-lock a PCA, reducing the candidate pool for teams that still have legitimate pending need
- Final Step 3.4 allocation can become more skewed than intended, especially in scarcity cases

**Why this matters**:

This may not be a raw integrity bug like F1-F4, but it can still systematically bias Step 3 output.

---

### F6 — HIGH: Step 3.0 auto buffer pre-assignment bypasses normal slot-feasibility checks

**Files**:

- `app/(dashboard)/schedule/page.tsx`
- `lib/utils/reservationLogic.ts`

**Relevant code**:

```ts
const freeSlots = [1, 2, 3, 4].filter((s) => !taken.has(s)).slice(0, target)

for (const slot of freeSlots) {
  const team = pickNextTeam(currentPending)
  if (!team) break
  const assignment = { team, slot, pcaId: staffRow.id, pcaName: p.name }
  const r = executeSlotAssignments([assignment], currentPending, currentAllocations, floatingPCAs as any)
}
```

**Condition / trigger**:

- Auto path is used for Step 3.0 buffer-floating PCA pre-assignment
- A buffer PCA has more subtle slot restrictions than “not already occupied”

**What goes wrong**:

The auto path picks the first open physical slots and applies them through the weak execution layer, rather than using the stricter shared allocation helpers.

**How this can lead to wrong PCA calculation**:

- Buffer slots can be consumed in a way that Step 3.4 would never have allowed
- Team pending is reduced based on potentially invalid early assignments
- Later Step 3.2 / 3.3 / 3.4 logic starts from an already-biased current state

**Why this matters**:

This affects any scenario where auto pre-assignment is meant to simulate valid buffer usage but is not honoring the same constraints as the real allocator.

---

### F7 — HIGH: multi-program special-program allocations are interpreted inconsistently

**Files**:

- `lib/utils/reservationLogic.ts`
- `app/(dashboard)/schedule/page.tsx`

**Relevant code**:

```ts
const specialProgram = allocation.special_program_ids && allocation.special_program_ids.length > 0
  ? specialPrograms.find(p => allocation.special_program_ids?.includes(p.id))
  : null
```

```ts
const specialSlotSet = new Set<number>()
ids.forEach((id: any) => {
  const s = slotsByProgramId.get(String(id))
  if (!s) return
  s.forEach((slot) => specialSlotSet.add(slot))
})
```

**Condition / trigger**:

- A single allocation carries more than one `special_program_id`

**What goes wrong**:

- Step 3.3 adjacency logic reasons from only the first matching program
- Step 3 pending / cap math reasons from the union of all program slot sets

**How this can lead to wrong PCA calculation**:

- One part of the system may treat a slot as “special-program-consumed”
- Another part may fail to recognize that same slot as special-program-derived
- Result: pending recomputation, cap logic, and adjacency opportunities can disagree

**Why this matters**:

This creates cross-layer inconsistency in the interpretation of the same allocation record.

---

## Recommended Fix Order

1. **F1 + F2 first**
   These are the most serious Step 2 integrity problems because they can produce impossible slot states before Step 3 even begins.

2. **F3 + F4 next**
   These are the biggest Step 3 correctness problems because they allow non-canonical or overfilled assignments to enter the state before Step 3.4.

3. **F5 + F6 + F7 after that**
   These are still important, but they are more about alignment and consistency than raw slot-overwrite integrity.

---

## Triage Classification

This section groups the findings by practical priority, not just technical severity.

### 1. Must-fix for correctness

These can produce objectively wrong slot state, wrong assigned PCA totals, or wrong pending PCA calculation.

- **F1 — Step 2 partial-substitution fallback can overwrite an already-assigned slot**
  - Why it belongs here: this can directly replace one team's slot assignment with another team's slot assignment inside the same Step 2 run.
  - Calculation consequence: assigned coverage by team can become false, so later pending math starts from corrupted Step 2 data.

- **F2 — Step 2 substitution can assign more slots than a PCA's remaining FTE allows**
  - Why it belongs here: this can create impossible coverage from a PCA who no longer has enough real capacity.
  - Calculation consequence: team coverage is overstated and pending PCA need is understated.

- **F3 — Step 3.3 can overfill a team, and the executor silently accepts it**
  - Why it belongs here: this consumes real slot capacity while hiding the overfill by clamping pending to zero.
  - Calculation consequence: one team can receive surplus coverage while another team loses access to that PCA capacity.

- **F4 — Step 3.2 / 3.3 reservation execution is weaker than Step 3.4's canonical rules**
  - Why it belongs here: manual reservation paths can create assignments the main allocator itself would have rejected.
  - Calculation consequence: Step 3.4 begins from an already-invalid base state, so final PCA totals may look balanced while still being wrong.

### 2. Nice-to-tighten but probably rare

These are real logic mismatches, but they are more conditional and less likely to break an ordinary day than the must-fix group.

- **F5 — Preference protection is broader than the UI copy implies**
  - Why it belongs here: this is more about allocation bias than raw corruption.
  - Calculation consequence: some teams may be blocked from using a PCA more aggressively than intended, especially in scarcity cases.
  - Practical frequency: probably situational; depends on Standard mode plus Step 3.3 selections plus exclusive protection.

- **F7 — Multi-program special-program allocations are interpreted inconsistently**
  - Why it belongs here: it depends on an allocation legitimately carrying multiple `special_program_ids`.
  - Calculation consequence: Step 3 pending/cap math and Step 3.3 adjacency logic can disagree about whether a slot counts as special-program coverage.
  - Practical frequency: likely uncommon unless multi-program tagging becomes normal.

### 3. Mostly code-quality / future-proofing

These still matter, but they look more like architectural drift than a clearly frequent day-to-day miscalculation.

- **F6 — Step 3.0 auto buffer pre-assignment bypasses normal slot-feasibility checks**
  - Why it belongs here: this is mainly risky because it uses a weaker execution path than the canonical allocator.
  - Calculation consequence: auto pre-assigned buffer slots may reduce pending from a state that Step 3.4 would not have produced.
  - Why this is not in the must-fix bucket: it depends on the auto-path and on slot-level constraints actually diverging from the simplified pre-assignment logic.

### Notes on category boundaries

- A future reproducible bug report could justify moving **F6** into the "must-fix for correctness" bucket.
- If multi-program special-program allocations become common, **F7** should likely move up as well.
- **F5** is currently more of a "wrong allocation policy effect" than a "broken slot ledger" issue.

---

## Code Quality / Streamlining Notes

These are not the highest-severity problems, but they are worth preserving for the eventual cleanup pass.

### 1. Unify all slot assignment writes behind one helper

Today, multiple code paths manually write:

- `allocation.slot1 = team`
- `allocation.slot2 = team`
- `allocation.slot3 = team`
- `allocation.slot4 = team`

That should be centralized behind one canonical “assign slot if valid” helper that enforces:

- slot must be currently free
- slot must be in `availableSlots` if declared
- PCA must have enough `fte_remaining`
- special-program-occupied slots are immutable unless explicitly allowed
- team pending cannot go below zero unless the caller is intentionally doing extra coverage

### 2. Reuse Step 3.4 feasibility helpers for Step 3.2 / 3.3

`findAvailablePCAs()`, `getOrCreateAllocation()`, `assignOneSlotAndUpdatePending()`, and `assignUpToPendingAndUpdatePending()` should be treated as the canonical rule engine.

The reservation layer should preferably call into those rules, not re-implement a lighter version.

### 3. Split `lib/algorithms/pcaAllocation.ts` by concern

That file now contains several logically separate systems:

- Step 2 non-floating allocation
- special-program allocation
- Step 2 substitution
- Step 3.4 floating allocation

It would be easier to preserve invariants if these were separated into focused modules.

### 4. Remove leftover debug remnants during cleanup ✓

There were empty `if (team === 'FO') {}` blocks in the Step 3 condition logic. Removed 2026-03-07.

---

## Implementation Update — Code Quality #1 (Unified Slot Assignment Helper)

### 2026-03-07 — Unified slot assignment writes behind `assignSlotIfValid`

**Scope**:

- Added `assignSlotIfValid()` in `lib/utils/floatingPCAHelpers.ts` as the canonical “assign slot if valid” helper.
- Replaced all PCA slot assignment writes in `lib/algorithms/pcaAllocation.ts`, `lib/utils/reservationLogic.ts`, and `assignSlotsToTeam` with calls to this helper.

**Helper behavior**:

- Slot must be 1–4 and currently free (unless `allowOverwrite`).
- Slot must be in `availableSlots` if declared.
- PCA must have at least `minFteRemaining` (default 0.25) unless `skipFteCheck`.
- Does not update `slot_assigned`, `fte_remaining`, or pending — caller is responsible.

**Call sites updated**:

- Special-program allocation loops (applySpecialProgramToExistingAllocation, programSlots.forEach) in pcaAllocation.ts.
- Invalid-slot pairing (main run + `applyInvalidSlotPairingForDisplay`) — uses `skipFteCheck: true`, `allowOverwrite: true`.
- `executeSlotAssignments` in reservationLogic.ts.
- `assignSlotsToTeam` in floatingPCAHelpers.ts.

**Verification**: All 7 regression tests (f1–f7) pass.

---

## Implementation Update — Code Quality #2 (Split pcaAllocation by concern) ✓

### 2026-03-07 — Step 3.4 floating extraction

**Scope**:

- Extracted Step 3.4 floating allocation into `lib/algorithms/pcaAllocationFloating.ts` as a submodule of the PCA pipeline.
- Added `lib/algorithms/pcaAllocationTypes.ts` for shared `PCAData` type (breaks circular imports).
- `pcaAllocation.ts` re-exports `allocateFloatingPCA_v2`, `FloatingPCAAllocationContextV2`, `FloatingPCAAllocationResultV2`, `PCAData` for backward compatibility.

**Modules**:

- `pcaAllocationTypes.ts` — shared types
- `pcaAllocationFloating.ts` — Step 3.4 algorithm and helpers
- `pcaAllocation.ts` — Step 2 + special-program + orchestration; re-exports

**Verification**: tsc passes; smoke tests pass (5 passed, 3 skipped, 1 flaky unrelated).

---

### 2026-03-07 — Step 3.2 / 3.3 reservation logic harmonized with canonical eligibility

**Scope**:

- Updated `lib/utils/floatingPCAHelpers.ts` and `lib/utils/reservationLogic.ts`
- Updated Step 3 callers in:
  - `components/allocation/FloatingPCAConfigDialog.tsx`
  - `app/(dashboard)/schedule/page.tsx`
- Added a focused regression test:
  - `tests/regression/f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts`

**What was changed**:

- Extended `findAvailablePCAs()` to accept optional `staffOverrides` so substitution-reserved slots can be excluded by the same shared helper used for slot-feasibility checks.
- Extracted the slot-usability filter inside `floatingPCAHelpers.ts` so required-slot and any-slot candidate scans now share one canonical availability predicate.
- Refactored `computeReservations()` (Step 3.2) to derive reservation candidates from `findAvailablePCAs()` instead of hand-rolling slot eligibility checks.
- Refactored `computeAdjacentSlotReservations()` (Step 3.3) to re-check the adjacent slot through `findAvailablePCAs()` before exposing it as a reservation option.
- Passed `staffOverrides` through the Step 3.3 call sites so reservation-time eligibility sees substitution-reserved slots as unavailable.

**Why this completes Code Quality #2**:

- Before this patch, Step 3.2 / 3.3 reservation creation used a lighter eligibility model than the stricter Step 3.4 helper path, so reservations could be offered for slots that were not actually legal under canonical availability rules.
- After this patch, the reservation layer and the executor/allocator path evaluate slot legality through the same shared helper family, which reduces rule drift and makes later refactors safer.
- The Step 3.2 / 3.3 business logic is preserved, but illegal reservation candidates are now filtered out at the same layer that defines canonical feasibility.

**Verification**:

- New regression added and run red first:
  - `npx tsx tests/regression/f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts`
- Post-refactor focused regressions:
  - `npx tsx tests/regression/f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts`
  - `npx tsx tests/regression/f7-multi-program-adjacent-slot-union.test.ts`
  - `npx tsx tests/regression/f6-step30-auto-buffer-valid-slot-selection.test.ts`
  - `npx tsx tests/regression/f4-step32-execution-revalidates-slot-eligibility.test.ts`
  - `npx tsx tests/regression/f3-step33-overfill-pending-cap.test.ts`
- Broader verification:
  - `npm run build` ✓
  - `npm run test:smoke` ✓ (7 passed, 2 skipped)
  - `npm run lint` still fails due pre-existing repository-wide issues unrelated to this patch (`playwright-report/index.html` / other generated output already in the worktree)

---

## Implementation Update — Code Quality #4 (Remove debug remnants)

### 2026-03-07 — Remove `if (team === 'FO') {}` blocks

**Scope**:

- Removed all empty debug blocks from `lib/algorithms/pcaAllocationFloating.ts`.
- 7 occurrences removed (condition A preferred-PCA loop and processFloorPCAFallback).

---

## Suggested Regression Tests

Current coverage status for this review set:

1. **Added**: Step 2 partial substitution does not overwrite an already-assigned slot
   - `tests/regression/f1-step2-partial-substitution-overwrite.test.ts`
2. **Added**: Step 2 substitution refuses assignments beyond `fte_remaining`
   - `tests/regression/f2-step2-substitution-fte-cap.test.ts`
3. **Added**: Step 3.3 execution refuses assignments beyond remaining pending
   - `tests/regression/f3-step33-overfill-pending-cap.test.ts`
4. **Added**: Step 3.2 / 3.3 execution revalidates stale slot eligibility before applying
   - `tests/regression/f4-step32-execution-revalidates-slot-eligibility.test.ts`
5. **Added**: Step 3.3-only selections do not participate in Step 3.4 preferred-PCA protection
   - `tests/regression/f5-step33-selection-should-not-protect-pca.test.ts`
6. **Added**: Step 3.0 auto buffer pre-assignment chooses legal slots instead of raw first-free slots
   - `tests/regression/f6-step30-auto-buffer-valid-slot-selection.test.ts`
7. **Added**: Multi-`special_program_ids` allocations produce identical interpretation in pending math and adjacent-slot logic
   - `tests/regression/f7-multi-program-adjacent-slot-union.test.ts`
8. **Added**: Step 3.2 / 3.3 reservation creation reuses canonical slot-eligibility rules
   - `tests/regression/f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts`

---

## Implementation Update

This section records what has actually been changed after the review.

### 2026-03-07 — F1 fix implemented

**Scope**:

- Fixed **F1 only** in `lib/algorithms/pcaAllocation.ts`
- Added a focused regression test:
  - `tests/regression/f1-step2-partial-substitution-overwrite.test.ts`

**What was changed**:

- In the Step 2 partial-substitution fallback branches, an occupied slot is now treated as unavailable regardless of whether it was occupied by:
  - special-program assignment
  - prior substitution
  - any other ordinary allocation already written in the same Step 2 run

**Why this fixes F1**:

- Before the patch, the fallback only blocked overwriting when the slot was occupied by a special program.
- After the patch, the fallback refuses to reuse a slot that is already occupied at all.
- This prevents the algorithm from silently replacing Team A's slot assignment with Team B's assignment while still counting both teams as covered.

### 2026-03-07 — F2 fix implemented

**Scope**:

- Fixed **F2 only** in `lib/algorithms/pcaAllocation.ts`
- Added a focused regression test:
  - `tests/regression/f2-step2-substitution-fte-cap.test.ts`

**What was changed**:

- Added a shared Step 2 helper to compute how many quarter-slots a PCA can still legally take from its current `fte_remaining`
- Reused that helper in the partial-substitution paths so:
  - the "cover all missing slots with one PCA" strategy now rejects a PCA that lacks enough remaining capacity
  - per-slot fallback branches now refuse to write another slot when `fte_remaining` is already exhausted
  - user-driven partial-substitution writes into an existing allocation are capped by remaining legal slot capacity before `slot_assigned` is recomputed

**Why this fixes F2**:

- Before the patch, Step 2 could treat a PCA as slot-eligible based on physical slot shape alone, even if that PCA had already spent most of its FTE elsewhere in the same run.
- After the patch, Step 2 cannot assign more quarter-slots than the PCA still has remaining.
- This keeps `slot_assigned`, `fte_remaining`, and pending-team math aligned with real on-duty capacity.

### 2026-03-07 — F3 fix implemented

**Scope**:

- Fixed **F3 only** in `lib/utils/reservationLogic.ts`
- Added a focused regression test:
  - `tests/regression/f3-step33-overfill-pending-cap.test.ts`

**What was changed**:

- Added an execution-time guard in `executeSlotAssignments()` so Step 3.2 / 3.3 reservation execution now checks the team's remaining rounded pending before consuming another quarter-slot
- If the team has less than `0.25` pending left, the executor now skips any extra queued assignment instead of silently writing another slot and clamping pending to zero again

**Why this fixes F3**:

- Before the patch, Step 3.3 could queue multiple adjacent-slot selections for a team with only `0.25` pending, and the executor would still consume all of them.
- After the patch, only assignments backed by real remaining pending are applied.
- This keeps slot consumption aligned with team need and prevents hidden overfill from stealing PCA capacity from other teams.

### 2026-03-07 — F4 fix implemented

**Scope**:

- Fixed **F4 only** in `lib/utils/reservationLogic.ts`
- Added a focused regression test:
  - `tests/regression/f4-step32-execution-revalidates-slot-eligibility.test.ts`

**What was changed**:

- Hardened `executeSlotAssignments()` so each queued Step 3.2 / 3.3 assignment is revalidated against current slot eligibility before it mutates pending or allocations
- Reused the stricter Step 3.4 candidate filter (`findAvailablePCAs`) at execution time, so stale selections are now rejected if the PCA/slot fails canonical availability or effective-FTE checks

**Why this fixes F4**:

- Before the patch, Step 3 reservation execution trusted the queued assignment and only checked simple pending math.
- After the patch, execution refuses assignments that Step 3.4 itself would have rejected.
- This keeps manual reservation paths from seeding the final algorithm with illegal slot states.

### 2026-03-07 — F5 fix implemented

**Scope**:

- Fixed **F5 only** in:
  - `lib/algorithms/pcaAllocation.ts`
  - `components/allocation/FloatingPCAConfigDialog.tsx`
  - `app/(dashboard)/schedule/page.tsx`
- Added a focused regression test:
  - `tests/regression/f5-step33-selection-should-not-protect-pca.test.ts`

**What was changed**:

- Added an explicit `source` tag to `selectedPreferenceAssignments` so Step 3.4 can tell whether a selection came from Step 3.2 or Step 3.3
- Updated the Step 3 dialog and schedule-page preview caller to pass `source: 'step32'` or `source: 'step33'`
- Selection-driven preference protection now ignores Step 3.3-only selections and only treats Step 3.2 picks as protection-driving “preferred” picks

**Why this fixes F5**:

- Before the patch, a Step 3.3 adjacent-slot choice could lock the whole PCA under `exclusive` protection, even though the UI copy defines “Preferred” around Step 3.2 picks.
- After the patch, Step 3.3 picks still execute as real allocations, but they no longer widen Step 3.4 preferred-PCA protection.
- This brings the Standard-mode protection behavior back into line with the UI wording and avoids over-locking scarce PCA capacity.

### 2026-03-07 — F6 fix implemented

**Scope**:

- Fixed **F6 only** in:
  - `lib/utils/reservationLogic.ts`
  - `app/(dashboard)/schedule/page.tsx`
- Added a focused regression test:
  - `tests/regression/f6-step30-auto-buffer-valid-slot-selection.test.ts`

**What was changed**:

- Extracted Step 3.0 auto-buffer pre-assignment into a shared helper:
  - `simulateStep30BufferPreAssignments()`
- The helper now derives candidate Step 3.0 slots from the same slot-feasibility rules used by the stricter allocator path, instead of blindly taking the first physically free slots
- The schedule page now uses that helper for Step 3.0 auto pre-assignment, so simulated buffer usage stays aligned with real executable slot availability

**Why this fixes F6**:

- Before the patch, Step 3.0 auto pre-assignment could look at slot order only, try slot `1`, and miss a later valid slot like `3` that the buffer PCA was actually allowed to work.
- After the patch, Step 3.0 only chooses slots that are genuinely legal for that PCA under the current allocation state.
- This prevents auto pre-assignment from biasing Step 3.1+ with an invalid or artificially under-filled starting state.

### 2026-03-07 — F7 fix implemented

**Scope**:

- Fixed **F7 only** in `lib/utils/reservationLogic.ts`
- Added a focused regression test:
  - `tests/regression/f7-multi-program-adjacent-slot-union.test.ts`

**What was changed**:

- Split the Step 3.3 special-program slot check into program-level helpers so reservation logic can evaluate each `special_program_id` independently
- Changed `isSlotFromSpecialProgram()` to treat a slot as special-program-derived if **any** linked program claims that slot/team combination, instead of stopping at the first matching program id
- Updated adjacent-slot metadata to derive the displayed program name from the specific program that actually owns that slot

**Why this fixes F7**:

- Before the patch, Step 3.3 adjacency logic would only inspect the first matching program on a multi-program allocation, so a later program's valid special-program slot could be ignored.
- After the patch, Step 3.3 interprets multi-program allocations with the same union semantics already used by Step 3 pending/cap math.
- This keeps adjacency opportunities, pending recomputation, and cap math aligned around the same understanding of special-program coverage.

**Current status by finding**:

- `F1`: **Fixed**
- `F2`: **Fixed**
- `F3`: **Fixed**
- `F4`: **Fixed**
- `F5`: **Fixed**
- `F6`: **Fixed**
- `F7`: **Fixed**

### Verification run

**Automated regression tests**:

```bash
npx tsx tests/regression/f7-multi-program-adjacent-slot-union.test.ts
npx tsx tests/regression/f6-step30-auto-buffer-valid-slot-selection.test.ts
npx tsx tests/regression/f5-step33-selection-should-not-protect-pca.test.ts
npx tsx tests/regression/f4-step32-execution-revalidates-slot-eligibility.test.ts
npx tsx tests/regression/f3-step33-overfill-pending-cap.test.ts
npx tsx tests/regression/f2-step2-substitution-fte-cap.test.ts
npx tsx tests/regression/f1-step2-partial-substitution-overwrite.test.ts
```

**Result**:

- Passed on 2026-03-07

**What the regression proves**:

- Multi-program special-program allocations now produce the same slot interpretation in Step 3.3 adjacency logic that Step 3 pending/cap math already uses.
- The earlier `F1`-`F6` protections still hold after the Step 3.3 special-program interpretation fix.

---

## Manual Test For F7

Use this if you want to manually verify the **latest** fixed finding in the app.

### Goal

Verify that a PCA allocation carrying more than one `special_program_id` is interpreted consistently by Step 3 pending/cap math and Step 3.3 adjacent-slot logic.

### Ideal scenario to prepare

Create or pick a schedule where:

1. One floating PCA is assigned to more than one special program on the same date
   - easiest example: one allocation includes both `CRP` and `Robotic`
2. That same PCA allocation actually occupies slots that belong to different program slot maps
   - example: slot `2` on `CPPC` for `CRP`, and slot `3` on `SFM` for `Robotic`
3. The adjacent slot for one of those special-program-derived slots is free
   - example: slot `4` remains empty next to the `Robotic` slot `3`
4. The corresponding team still has `0.25` pending so Step 3.3 should expose the adjacent-slot option

### Steps

1. Open the schedule for the target date.
2. Configure one PCA so its single allocation is tagged with multiple special programs and occupies slots from more than one of those programs.
3. Open the Step 3 flow and inspect the pending/cap view for the affected teams.
4. Move to Step 3.3 and review the adjacent-slot options offered for the team next to one of those special-program slots.
5. Review:
   - whether the affected slot is treated as special-program coverage in the Step 3 pending/cap math
   - whether Step 3.3 also recognizes that same slot as a special-program-derived slot
   - whether the adjacent slot option appears for the correct team

### Expected result after fix

- If pending/cap math treats a slot as special-program-consumed, Step 3.3 should also treat that slot as the source of an adjacent reservation opportunity.
- In the example above, the `Robotic` slot on `SFM` should allow Step 3.3 to offer slot `4` for `SFM` when it is free and pending remains.
- Multi-program allocations should behave the same regardless of the order of ids inside `special_program_ids`.

### Failure signature from the old bug

Before the fix, the bad outcome could look like:

- Step 3 pending/cap math subtracts special-program coverage for a slot because it unions all linked program slot maps
- Step 3.3 fails to recognize that same slot as special-program-derived because it only inspected the first matching program id
- The adjacent-slot opportunity is missing or changes depending on the ordering of `special_program_ids`

### Fast spot-check question

Ask:

> "Does Step 3.3 see the same special-program-derived slot that Step 3 pending/cap math sees, even when the allocation has multiple program ids?"

If the answer is “no” or “only when the ids are in one particular order,” the old bug is still present. After the fix, both Step 3 layers should agree.

---

## Future Agent Notes

- Treat this file as a **review baseline**, not as proof that the bugs are fixed.
- Exception: `F1`, `F2`, `F3`, `F4`, `F5`, `F6`, and `F7` have now been fixed and regression-tested. Re-verify if nearby code changes again.
- Re-check current code before patching; branch state may have changed.
- Preserve the architectural rule that **`staffOverrides` is the single source of truth**, but also preserve the Step 3 rule that special-program slots do **not** satisfy normal floating PCA pending.
- If fixing Step 3 reservation paths, prefer converging them toward the Step 3.4 helper logic rather than creating yet another rule copy.
