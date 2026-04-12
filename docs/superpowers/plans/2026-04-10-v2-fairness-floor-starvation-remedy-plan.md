# V2 Fairness Floor Starvation Remedy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Step 3.4 ranked-slot V2 so a team with meaningful pending does not finish with zero true Step 3 floating coverage when a bounded rescue is legally possible.

**Architecture:** Keep the existing two-stage V2 design: continuity-friendly draft allocation followed by bounded audit-and-repair. Do not change Step 2 business logic, average PCA/team calculation, or V1 behavior. Instead, tighten the V2 fairness-floor defect definition and broaden the bounded `F1` repair ladder so starvation cases are detected and rescued before the final result is accepted.

**Tech Stack:** TypeScript, Node-based regression tests via `npx tsx`, existing Step 3 ranked-slot V2 allocator and repair pipeline.

---

## File Structure

### Core engine files
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
  - Source of truth for `F1` detection. This is where the starvation definition should be narrowed from the current overly restrictive "useful non-duplicate slot only" rule to a legacy-style entitlement floor.
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
  - Source of truth for bounded `F1` rescue candidates. This is where bounded rescue options should be expanded without touching Step 2 or unconstrained rewriting.
- Modify if needed: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
  - Only if the revised `F1` semantics require score comments or tie-break wording updates. Objective order should remain unchanged unless a test proves otherwise.

### Existing regressions to use as anchors
- Read / keep passing: `tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts`
- Read / keep passing: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
- Read / keep passing: `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`
- Read / keep passing: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- Read / keep passing: `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`

### New regression to create
- Create: `tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts`
  - Reproduces the starvation bug in a minimal deterministic setup and proves the final fix.

### Optional follow-up test if the first bug splits into two cases
- Create only if needed: `tests/regression/f85-step34-v2-fairness-floor-allows-ranked-or-unranked-first-rescue.test.ts`
  - Use only if the first test becomes too broad and needs splitting into ranked rescue vs fallback rescue.

## Constraints

### Constraint 1: Do not "fix" `Problem E`
The investigation in this chat established that the apparent "extra coverage" on audited dates was mostly ownership/accounting plus rounding semantics:
- Step 2 special-program coverage must stay excluded from Step 3 pending fulfillment.
- substitutions still count against pending the same way they do now.
- do not change `extraCoverageMode` as part of this plan.

Important clarification:
- this plan is intentionally a `Problem D` / `F1` starvation remedy plan
- it is not the ownership / fulfillment semantics cleanup plan for `Problem E`
- a separate follow-up track may still be needed to improve how the app surfaces:
  - Step 2 reserved special-program coverage
  - substitution coverage
  - true Step 3 floating fulfillment
  - post-fulfillment surplus, if any
- if another agent is already working this plan, keep that work focused on starvation and bounded rescue only

### Constraint 2: Preserve Step 2 and V1 behavior
Do not modify:
- `lib/algorithms/pcaAllocation.ts`
- `lib/features/schedule/stepReset.ts`
- V1 behavior exposed through `allocateFloatingPCA_v1LegacyPreference`

Allowed scope:
- V2 audit semantics
- V2 repair candidate generation
- V2-only regression coverage

### Constraint 3: TDD is mandatory
The implementing agent must:
- write the failing regression first
- run it and observe the expected failure
- implement the smallest V2-only fix
- rerun the new regression
- rerun nearby regressions to protect ranked, duplicate, and continuity behavior

### Constraint 4: Rescue must stay bounded
The fix must not become a free global rewrite of the schedule. Candidate generation must stay in the existing bounded-move family:
- direct open-slot rescue
- one-slot move with bounded fallback
- one-slot swap

If a starvation case needs more than the existing bounded family, add the smallest bounded pattern that covers the failing test and no more.

### Constraint 5: "Meaningful pending" remains quarter-rounded
The bug target is not raw fractional entitlement below one quarter-slot. Keep the existing meaningful-pending threshold aligned with quarter-rounded Step 3 semantics.

---

## Root Cause Summary

The current V2 fairness floor is weaker than the legacy spreadsheet behavior:
- `repairAudit.ts` only reports `F1` when the team lacks a "useful non-duplicate" slot and `canAcquireUsefulNonDuplicateSlot()` succeeds under a narrow definition.
- this misses starvation cases where the team has meaningful rounded pending and should receive at least one bounded rescue slot, but the candidate is not classified as "useful" under the current slot-filter logic.
- because the defect is not raised, `repairMoves.ts` never generates the rescue candidate, and the final V2 result can leave the team with zero true Step 3 floating.

The fix should therefore live in:
- `hasFairnessFloorViolation()` and its helpers in `repairAudit.ts`
- `generateF1Candidates()` and related bounded fallback helpers in `repairMoves.ts`

not in:
- average PCA/team calculation
- Step 2 ownership accounting
- `extraCoverageMode`

---

### Task 1: Lock the starvation bug with a failing regression

**Files:**
- Create: `tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts`
- Read: `tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts`
- Read: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`

- [ ] **Step 1: Write the failing regression first**

Create `tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts` in the same Node-style format as nearby regressions. The scenario should:
- give one team meaningful pending (`0.25` or `0.5`)
- let the draft pass leave that team with zero true Step 3 floating
- ensure a bounded rescue exists by moving or swapping one slot
- assert the current result is wrong before the fix and the desired final behavior is non-zero true Step 3 floating

Use this structure:

```ts
import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return {
    FO: value,
    SMM: value,
    SFM: value,
    CPPC: value,
    MC: value,
    GMC: value,
    NSM: value,
    DRO: value,
  }
}

function makePca(id: string, slots: number[]): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots: slots,
    floor_pca: ['upper'],
  } as PCAData
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  // Build a case where one pending team currently ends with zero true Step 3 floating
  // even though a one-move or one-swap bounded rescue exists.

  // Assert current audit/allocator behavior is missing that rescue.
  // After implementation, update the expected values to the corrected behavior.
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run the new regression and verify RED**

Run:

```bash
npx tsx tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
```

Expected:
- FAIL
- the failure should be because the pending team still has zero true Step 3 floating or because `F1` is not raised when the bounded rescue exists

- [ ] **Step 3: Refine the test until it fails for the right reason**

If the first version fails because of:
- a typo
- impossible rescue setup
- a different defect kind entirely

then rewrite only the test data until the failure proves the intended bug:
- starvation remains
- bounded rescue exists
- current V2 misses it

- [ ] **Step 4: Commit the failing regression**

```bash
git add tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
git commit -m "test: capture v2 fairness-floor starvation bug"
```

---

### Task 2: Tighten `F1` defect detection in the audit layer

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Test: `tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts`

- [ ] **Step 1: Read the current `F1` path before editing**

Focus on:
- `teamHadMeaningfulPending()`
- `teamHasUsefulNonDuplicateSlot()`
- `isUsefulNonDuplicateSlotForTeam()`
- `canAcquireUsefulNonDuplicateSlot()`
- `hasFairnessFloorViolation()`

Write down the exact reason the failing test is missed before editing.

- [ ] **Step 2: Implement the minimal audit change**

Change `repairAudit.ts` so `F1` means:
- the team had meaningful rounded pending at Step 3.4 start
- the team currently has zero true Step 3 coverage that satisfies the fairness floor
- a bounded rescue path exists, even if the rescued slot is not classified by the current overly narrow "useful non-duplicate" helper

Keep the change minimal:
- prefer adjusting helper definitions over adding an entirely new audit subsystem
- preserve `B1`, `A1`, `A2`, and `C1` behavior unless the new test proves overlap is unavoidable

Likely edit shape:

```ts
function hasFairnessFloorViolation(state: AuditState, team: Team): boolean {
  if (!teamHadMeaningfulPending(state, team)) return false
  if (teamAlreadyHasFairnessFloorCoverage(state, team)) return false
  return canAcquireFairnessFloorCoverage(state, team)
}
```

with new helpers that are slightly broader than the current `useful non-duplicate` rule but still bounded and deterministic.

- [ ] **Step 3: Re-run the single regression**

Run:

```bash
npx tsx tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
```

Expected:
- still FAIL, but now later in the flow if the audit detects `F1` and repair generation has not yet been fixed
- or PASS if the existing repair move family was already sufficient once `F1` is detected

- [ ] **Step 4: Commit the audit-layer fix if it is independently green**

Only if the regression is already green after the audit change:

```bash
git add lib/algorithms/floatingPcaV2/repairAudit.ts tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
git commit -m "fix: widen v2 fairness-floor defect detection"
```

If the regression is still red because repair generation is missing, do not commit yet. Continue to Task 3.

---

### Task 3: Expand bounded `F1` rescue generation

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Test: `tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts`

- [ ] **Step 1: Inspect existing `generateF1Candidates()` against the failing case**

Confirm which bounded rescue is missing:
- direct open-slot rescue
- one-slot move with fallback
- one-slot swap
- fallback move ordering too narrow

- [ ] **Step 2: Implement the smallest bounded candidate expansion**

Update `generateF1Candidates()` or `buildFallbackMoveCandidate()` so the failing scenario produces a legal bounded rescue candidate.

Guardrails:
- do not rewrite baseline / non-floating allocations
- do not add unconstrained global reshuffles
- prefer deterministic iteration order consistent with existing `localeCompare` ordering

Possible minimal patterns:
- allow fairness fallback over a broader slot order than `duplicateRankOrder`
- allow the rescue team to take a first legal non-gym slot even when it is unranked
- allow a one-slot move + bounded fallback that the current helper skips

- [ ] **Step 3: Re-run the starvation regression and verify GREEN**

Run:

```bash
npx tsx tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
```

Expected:
- PASS
- the pending team no longer ends with zero true Step 3 floating when bounded rescue exists
- tracker / pending output remain internally consistent

- [ ] **Step 4: Commit the repair-layer fix**

```bash
git add lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/floatingPcaV2/repairMoves.ts tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
git commit -m "fix: rescue v2 fairness-floor starvation cases"
```

---

### Task 4: Protect nearby V2 behavior with focused regression reruns

**Files:**
- Test: `tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts`
- Test: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
- Test: `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`
- Test: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- Test: `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`

- [ ] **Step 1: Run the focused V2 regression set**

Run:

```bash
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts
```

Expected:
- all PASS
- no regressions to ranked rescue, duplicate rescue, continuity, or manual-selection behavior

- [ ] **Step 2: If one nearby regression fails, fix only the smallest root cause**

Rules:
- do not weaken the new starvation regression
- do not touch Step 2 or V1
- prefer refining `F1` eligibility or candidate ordering over reworking all repair types

- [ ] **Step 3: Re-run the full focused set until all are green**

Repeat the commands from Step 1 until:
- `f84` passes
- `f72`, `f73`, `f74`, `f71`, and `f68` all pass

- [ ] **Step 4: Commit the stabilized regression-safe fix**

```bash
git add lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/floatingPcaV2/repairMoves.ts tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
git commit -m "test: cover v2 fairness-floor starvation regression"
```

If the nearby regression fixes required test updates or comment clarifications, include those files too.

---

### Task 5: Final verification and handoff notes

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- Modify if needed: `docs/superpowers/plans/2026-04-10-v2-fairness-floor-starvation-remedy-plan.md`

- [ ] **Step 1: Run lint on touched files only if necessary**

If the edits introduce type or lint-sensitive changes, run:

```bash
npx eslint lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/floatingPcaV2/repairMoves.ts tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
```

Expected:
- PASS

If the repo lint configuration is too broad or noisy, record that clearly instead of guessing.

- [ ] **Step 2: Re-state what changed in product terms**

Document in the final handoff:
- starvation cases with meaningful pending are now rescued when a bounded path exists
- Step 2 accounting and extra-coverage semantics were intentionally left unchanged
- nearby ranked / duplicate / continuity regressions stayed green

- [ ] **Step 3: Update the plan doc only if implementation reality diverged**

If the actual fix needed:
- a slightly different new test filename
- a narrower helper name
- a split `f84` / `f85` test strategy

then update this plan file so the record matches reality.

