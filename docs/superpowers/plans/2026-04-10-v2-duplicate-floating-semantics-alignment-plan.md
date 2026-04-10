# V2 Duplicate-Floating Semantics Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align V2 ranked-slot Step 3.4 so duplicate-floating means only true Step 3-owned floating-on-floating stacking, and make the draft allocator, repair audit, final preview, and V2-specific tracker tooltip all follow the same contract.

**Architecture:** Implement this as a semantics-threading refactor, not a copy-only tooltip patch. First add a V2-only ownership/provenance layer at or just after the Step 2 -> Step 3 handoff so the ranked V2 engine can distinguish upstream Step 2 coverage from Step 3-owned floating coverage without changing Step 2 business logic. Then narrow duplicate logic in the ranked V2 draft allocator and repair audit, update preview/tooltip interpretation to share the same contract, and finish by rewriting regressions to prove end-to-end alignment from allocator result to V2 tracking surfaces.

**Tech Stack:** TypeScript, existing Step 3 scheduling algorithms, tracker metadata in `types/schedule.ts`, Node-based regression tests (`npx tsx`), React/Next.js Step 3 preview + tooltip UI.

---

## File Structure

### New and updated specs / references
- Modify: `docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`
  - Keep implementation notes / follow-up clarifications aligned if the final field names differ slightly.
- Modify: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
  - Keep terminology aligned after implementation if any tracker field names are narrowed or renamed.

### Core engine / semantics files
- Modify: `lib/algorithms/floatingPcaV2/draftAllocation.ts`
  - Current draft slot ladder uses broad slot occupancy. Must be narrowed to Step 3-owned floating semantics.
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
  - Current duplicate/fairness logic keys off broad occupancy. Must be narrowed to true duplicate-floating.
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
  - Keep candidate generation aligned with the narrowed `A1` / `A2` / `F1` defect definitions.
- Modify: `lib/features/schedule/step3V2CommittedSelections.ts`
  - Important V2-only boundary file. Preferred place to stamp or thread provenance from the Step 2 -> Step 3 handoff without changing Step 2 business logic.
- Modify: `lib/utils/floatingPCAHelpers.ts`
  - Tracker summary, helper comments, and any broad `duplicateSlot` summary flags must be aligned to the new semantics.
- Modify: `types/schedule.ts`
  - Source of truth for tracker field names / comments. May need new provenance fields or narrowed comments for existing ones.

### Files that must stay behaviorally unchanged in this plan
- Do not modify Step 2 business logic in `lib/algorithms/pcaAllocation.ts`
  - This plan must not change how non-floating, special-program, or substitution allocations are decided.
- Do not change V1 Step 3 business behavior exposed through `allocateFloatingPCA_v1LegacyPreference`
  - Shared helpers may gain additive metadata support, but V1 allocation behavior must stay unchanged.

### Shared interpretation / UI files
- Modify: `lib/features/schedule/duplicateFloatingSemantics.ts`
  - Shared duplicate helper today. Must become the canonical UI-facing true duplicate-floating interpreter and may need broader ownership/provenance input than `staffOverrides` alone.
- Modify: `components/allocation/step34/step34ViewModel.ts`
  - Final Step 3.4 preview wording is the acceptance target for duplicate wording.
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
  - Tooltip must follow preview semantics, not broad tracker field names.
- Modify: `lib/features/schedule/pcaTrackerTooltip.ts`
  - Approved copy helpers / label mapping must stop surfacing broad duplicate wording for non-duplicate stacked cases.
- Modify if needed: `components/allocation/pcaTracker/V2PcaTrackerTooltip.tsx`
  - UI should only change if field names / labels change after semantics narrowing.

### Regression tests to update
- Modify: `tests/regression/f64-step34-tracker-reasons.test.ts`
  - Preview wording contract for duplicate vs neutral wording.
- Modify: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
  - Current expectations rely on broad same-slot occupancy. Must be narrowed.
- Modify: `tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts`
  - Tooltip copy / structure contract must match preview duplicate semantics.
- Modify: `tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts`
  - Shared semantics helper contract must cover upstream-only coverage vs true Step 3 duplicate-floating.

### New regression tests to create
- Create: `tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts`
  - Proves the engine can distinguish upstream Step 2 coverage from Step 3-owned floating coverage.
- Create: `tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts`
  - Proves draft allocator + repair audit only treat true Step 3 floating-on-floating as duplicate-floating.
- Create: `tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts`
  - Proves final allocator result, Step 3.4 preview, and V2 tooltip all agree on duplicate wording.

## Implementation Constraints

### Constraint 1: Raw `existingAllocations` are not enough
The current V2 engine sees raw team slot ownership through `PCAAllocation[]`, but those allocations do not reliably encode whether a slot came from:

- Step 2 non-floating coverage
- Step 2 special-program coverage
- Step 2 floating substitution-for-non-floating coverage
- Step 3-owned floating coverage

This means the narrowing cannot be implemented correctly by simply rewriting `isUsed(slot)` in `draftAllocation.ts` or `slotCountsByTeam` in `repairAudit.ts` without first threading or reconstructing ownership/provenance metadata.

Preferred implementation direction:

- thread provenance in the V2 path at or just after the Step 2 -> Step 3 handoff
- prefer `step3V2CommittedSelections.ts` and ranked V2 tracker/runtime helpers over Step 2 algorithm rewrites
- treat Step 2 output as business-stable and attach a V2-only provenance sidecar or runtime interpretation layer

### Constraint 2: Preview is the acceptance target for duplicate wording
`components/allocation/step34/step34ViewModel.ts` is the current product-facing interpretation target. Tooltip copy must be aligned to it, not vice versa.

### Constraint 3: Step 3.2 / 3.3 committed assignments count as Step 3-owned floating
Committed Step 3.2 and Step 3.3 selections are executed before Step 3.4 runs and must count as Step 3-owned floating coverage for true duplicate semantics.

### Constraint 4: Keep V1 Step 2 and V1 Step 3 behavior unchanged
This plan must not change:

- Step 2 business logic used before choosing V1 or V2
- V1 legacy Step 3 behavior

Allowed changes:

- additive tracker/runtime metadata
- V2-only provenance helpers
- ranked V2 draft/audit/preview/tooltip interpretation

Disallowed changes:

- changing how Step 2 assigns non-floating / special-program / substitution coverage
- redefining broad shared helpers in a way that alters V1 behavior

### Mandatory review rule for implementing agent
After every task below that changes code, the implementing agent must run a focused review against the approved semantics:
- confirm upstream Step 2-only coverage is still excluded from duplicate-floating
- confirm Step 3.2 / 3.3 committed assignments still count as Step 3-owned floating
- confirm preview and tooltip are driven by the same contract
- confirm no task reintroduces ambiguous `useful` terminology in new V2 code/comments
- confirm no task changes Step 2 business logic or V1 behavior
- confirm tests prove behavior rather than restating implementation details

If any mismatch is found, fix it before moving to the next task.

---

### Task 1: Add failing contracts for the narrowed duplicate semantics

**Files:**
- Modify: `tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts`
- Create: `tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts`
- Create: `tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts`
- Create: `tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts`

- [ ] **Step 1: Extend the shared semantics regression to cover all four approved cases**

Update `tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts` so it explicitly covers:
- non-floating upstream coverage + one Step 3 floating -> not duplicate-floating
- substitution-covered upstream coverage + one Step 3 floating -> not duplicate-floating
- special-program upstream coverage + one Step 3 floating -> not duplicate-floating
- true Step 3 floating + another Step 3 floating on same team + slot -> duplicate-floating

Use a test shape like:

```ts
assert.deepEqual(
  getQualifyingDuplicateFloatingAssignmentsForSlot({
    team: 'FO',
    slot: 2,
    logsForSlot: [/* one Step 3-owned floating row only */],
    staffOverrides: {/* upstream substitution-like case if needed */},
  }).map((log) => log.pcaId),
  [],
  'Expected upstream-only coverage plus one Step 3 floating to stay non-duplicate.'
)
```

- [ ] **Step 2: Add a failing provenance-level contract**

Create `tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts` that proves raw team slot occupancy is insufficient and that the final implementation must distinguish upstream Step 2-only coverage from Step 3-owned floating coverage.

The test should set up:
- one team with a baseline non-floating slot on `2`
- optionally a special-program-covered slot on another case
- pending that still requires Step 3 floating
- assertions that the future provenance helper / audit input marks those slots as upstream-covered, not duplicate-floating

Skeleton:

```ts
import assert from 'node:assert/strict'

async function main() {
  // Build a mixed Step 2 / Step 3 ownership scenario.
  // Assert that upstream-covered slot state is distinguishable from true Step 3 duplicate-floating.
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 3: Add a failing engine contract for true duplicate-floating only**

Create `tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts` with at least two scenarios:
- upstream Step 2 coverage on a slot + one Step 3 floating on same slot -> draft/audit do not classify it as duplicate-floating
- one Step 3-owned floating already on a slot + second Step 3-owned floating on same slot -> duplicate-floating path / defect remains possible

- [ ] **Step 4: Add a failing end-to-end alignment contract**

Create `tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts` that drives one V2 result into:
- final Step 3.4 preview interpretation
- V2 tooltip model interpretation

and asserts they agree on:
- neutral wording for upstream-covered + one Step 3 floating
- duplicate wording only for true duplicate-floating

- [ ] **Step 5: Run the new and updated regressions to verify current failure**

Run:

```bash
npx tsx tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts
npx tsx tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
npx tsx tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
```

Expected:
- at least one of the new tests should FAIL against the current broad duplicate behavior
- failures should clearly point to provenance loss or broad duplicate wording

- [ ] **Step 6: Commit**

```bash
git add tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
git commit -m "test: lock v2 duplicate-floating semantics contracts"
```

---

### Task 2: Thread Step 3 ownership / provenance metadata into the V2 pipeline

**Files:**
- Modify: `types/schedule.ts`
- Modify: `lib/features/schedule/step3V2CommittedSelections.ts`
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Modify if needed: `lib/algorithms/pcaAllocationFloating.ts`
- Modify if needed: `lib/features/schedule/duplicateFloatingSemantics.ts`

- [ ] **Step 1: Define the minimal provenance shape in tracker types**

Add the smallest explicit field set needed to distinguish:
- upstream-covered slot
- Step 3-owned floating assignment
- substitution-like upstream coverage when applicable

Prefer tracker-facing fields on `SlotAssignmentLog` or tightly related helper types instead of trying to infer provenance later from raw `PCAAllocation`.

Guardrail:
- keep this provenance additive and V2-facing
- do not rewrite Step 2 allocation decisions to produce different business outcomes

Expected shape direction:

```ts
step3OwnershipKind?: 'step3-floating'
upstreamCoverageKind?: 'non-floating' | 'special-program' | 'substitution-like' | null
```

If a different naming scheme is cleaner, keep it narrow and explicit.

- [ ] **Step 2: Run typecheck or focused tests to verify the new fields compile**

Run one focused regression or type-aware test command that loads the changed types.

Expected:
- compile failures point to all downstream callsites that need updating

- [ ] **Step 3: Stamp Step 3-owned provenance where assignments are recorded**

Update `step3V2CommittedSelections.ts`, `draftAllocation.ts` callsites, and any shared tracker helper so:
- Step 3.0 / 3.2 / 3.3 / 3.4 tracker rows are explicitly marked as Step 3-owned floating coverage
- current broad slot-count logic is not the only source of duplicate interpretation anymore

Preferred implementation location:
- start at the V2 boundary in `step3V2CommittedSelections.ts`
- only touch deeper shared helpers if the V2 boundary cannot supply enough runtime context

- [ ] **Step 4: Add or thread upstream-coverage hints needed by preview/tooltip**

Where feasible, thread or reconstruct enough metadata so shared duplicate semantics can identify upstream-covered cases without relying on broad raw occupancy alone.

Important:
- do not invent heavyweight schedule-wide persistence if a lighter runtime-only helper solves it
- do not let preview/tooltip infer Step 2 provenance from impossible raw state when the boundary can stamp it earlier
- do not change Step 2 allocation rules just to make provenance easier

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx tsx tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts
npx tsx tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts
```

Expected:
- provenance contract passes
- Step 3.2 / 3.3 committed-selection path still behaves correctly

- [ ] **Step 6: Code review against plan**

Review checklist:
- provenance is explicit enough to narrow duplicate semantics
- upstream-only coverage is now distinguishable from Step 3-owned floating
- Step 3.2 / 3.3 ownership is preserved
- no broad "just infer it from allocations" loophole remains
- no Step 2 business logic changed
- no V1 behavior changed

- [ ] **Step 7: Commit**

```bash
git add types/schedule.ts lib/features/schedule/step3V2CommittedSelections.ts lib/utils/floatingPCAHelpers.ts lib/algorithms/pcaAllocationFloating.ts lib/features/schedule/duplicateFloatingSemantics.ts
git commit -m "refactor: thread v2 floating provenance into tracker semantics"
```

---

### Task 3: Narrow duplicate detection in the draft allocator and repair audit

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/draftAllocation.ts`
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Modify if needed: `lib/features/schedule/duplicateFloatingSemantics.ts`
- Modify if needed: `lib/utils/floatingPCAHelpers.ts`

- [ ] **Step 1: Write or refine failing assertions for draft duplicate fallback**

Use `f81` to assert:
- upstream-covered ranked slot does not force `ranked-duplicate`
- true Step 3-owned floating already on a slot can still trigger duplicate-floating fallback

- [ ] **Step 2: Run the focused engine tests to confirm failure**

Run:

```bash
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts
```

Expected:
- at least one failure showing broad duplicate classification still exists

- [ ] **Step 3: Replace broad slot-occupancy checks with Step 3-owned duplicate checks**

In `draftAllocation.ts`:
- stop using raw `getTeamExistingSlots()` / broad slot counts as the duplicate trigger
- build target buckets from the narrowed contract:
  - ranked floating-eligible non-gym with no true Step 3 floating yet
  - unranked non-gym floating-eligible with no true Step 3 floating yet
  - true duplicate-floating non-gym fallback
  - gym last resort

Important:
- narrow this only for the ranked V2 path
- do not turn broad shared slot helpers into V2-only semantics if V1 still depends on them

In `repairAudit.ts`:
- replace broad `(slotCount > 1)` duplicate logic with true Step 3 duplicate-floating concentration
- narrow `A1`
- narrow the duplicate branch of `A2`
- rewrite `F1` helper wording / logic to use non-duplicate floating-eligible slots

- [ ] **Step 4: Keep continuity and rescue logic intact**

Update `repairMoves.ts` only as needed so:
- repair candidate generation still works with the new narrowed defect detection
- no bounded repair path depends on the old broad same-slot occupancy meaning

- [ ] **Step 5: Run focused engine verification**

Run:

```bash
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
```

Expected:
- all PASS with duplicate semantics narrowed

- [ ] **Step 6: Code review against plan**

Review checklist:
- draft duplicate fallback is now driven by Step 3-owned floating coverage only
- repair audit defects A1 / A2 / F1 are aligned to the new contract
- continuity still works and is not mislabeled as duplicate
- no broad `slotCountsByTeam > 1` shortcut remains for duplicate-floating
- no Step 2 business logic changed
- no V1 legacy behavior changed

- [ ] **Step 7: Commit**

```bash
git add lib/algorithms/floatingPcaV2/draftAllocation.ts lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/floatingPcaV2/repairMoves.ts lib/features/schedule/duplicateFloatingSemantics.ts lib/utils/floatingPCAHelpers.ts tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
git commit -m "fix: narrow v2 duplicate semantics in draft and audit"
```

---

### Task 4: Align Step 3.4 preview and V2 tooltip to the same duplicate contract

**Files:**
- Modify: `components/allocation/step34/step34ViewModel.ts`
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- Modify: `lib/features/schedule/pcaTrackerTooltip.ts`
- Modify if needed: `components/allocation/pcaTracker/V2PcaTrackerTooltip.tsx`
- Modify if needed: `lib/features/schedule/duplicateFloatingSemantics.ts`

- [ ] **Step 1: Write failing preview/tooltip wording assertions**

Update:
- `tests/regression/f64-step34-tracker-reasons.test.ts`
- `tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts`
- `tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts`

Add assertions that:
- upstream-covered + one Step 3 floating uses neutral wording such as `To fulfill pending FTE`
- true duplicate-floating uses duplicate wording
- tooltip and preview agree for the same tracker state

- [ ] **Step 2: Run the focused wording tests to confirm current drift**

Run:

```bash
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts
npx tsx tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts
npx tsx tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
```

Expected:
- at least one failure from current broad `ranked-duplicate` wording

- [ ] **Step 3: Make preview wording the canonical interpretation target**

Update `step34ViewModel.ts` so it:
- continues to show duplicate wording only for `>= 2` true Step 3-owned floating rows on the same team + slot
- uses neutral wording for upstream-covered stacked cases

If needed, move shared logic into `duplicateFloatingSemantics.ts` so preview and tooltip cannot drift.

- [ ] **Step 4: Make tooltip wording defer to the shared contract**

Update `v2PcaTrackerTooltipModel.ts` and `pcaTrackerTooltip.ts` so:
- broad `ranked-duplicate` labels do not leak into user-facing duplicate wording
- neutral stacked cases use `To fulfill pending FTE`
- approved `Ranked unassigned slot` / `Unranked non-gym unassigned slot` copy remains allowed where it still matches the narrowed semantics

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts
npx tsx tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts
npx tsx tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
```

Expected:
- all PASS

- [ ] **Step 6: Code review against plan**

Review checklist:
- preview remains the acceptance target
- tooltip uses the same duplicate semantics as preview
- no user-facing duplicate wording appears for upstream-covered + one Step 3 floating
- no new ambiguous `useful` wording was introduced
- no V1 tooltip or V1 flow behavior was changed as part of this semantics pass

- [ ] **Step 7: Commit**

```bash
git add components/allocation/step34/step34ViewModel.ts lib/features/schedule/v2PcaTrackerTooltipModel.ts lib/features/schedule/pcaTrackerTooltip.ts components/allocation/pcaTracker/V2PcaTrackerTooltip.tsx lib/features/schedule/duplicateFloatingSemantics.ts tests/regression/f64-step34-tracker-reasons.test.ts tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
git commit -m "fix: align v2 preview and tooltip duplicate wording"
```

---

### Task 5: Normalize tracker fields, comments, and summary flags

**Files:**
- Modify: `types/schedule.ts`
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- Modify if needed: `components/allocation/step34/step34ViewModel.ts`

- [ ] **Step 1: Write a focused tracker summary contract**

Extend or add tests so the tracker contract proves:
- `usedDuplicateFloatingSlot` or any replacement field only reflects true duplicate-floating
- comments / labels do not imply broad occupancy-based duplicates
- legacy broad semantics are no longer silently encoded in tracker metadata

- [ ] **Step 2: Run the tracker contract and confirm current mismatch if still present**

Run:

```bash
npx tsx tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
```

- [ ] **Step 3: Narrow or rename tracker fields**

Implementation options:
- either rename fields such as `duplicateSlot` / `usedDuplicateFloatingSlot`
- or keep the names but narrow comments and behavior so they now mean true duplicate-floating only

Do not leave broad meaning undocumented.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx tsx tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts
npx tsx tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
```

Expected:
- all PASS

- [ ] **Step 5: Commit**

```bash
git add types/schedule.ts lib/utils/floatingPCAHelpers.ts lib/features/schedule/v2PcaTrackerTooltipModel.ts components/allocation/step34/step34ViewModel.ts tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
git commit -m "refactor: narrow v2 tracker duplicate field semantics"
```

---

### Task 6: Run the full focused V2 sweep and update docs/changelog notes

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`
- Modify if needed: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- Modify if needed: `CHANGELOG_2.md`

- [ ] **Step 1: Run the complete focused regression sweep**

Run:

```bash
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
npx tsx tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts
npx tsx tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts
npx tsx tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts
npx tsx tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
npx tsx tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
```

Expected:
- all PASS

- [ ] **Step 2: Update docs only if final field names or helper names differ**

If implementation used slightly different field names than the spec:
- update the standalone semantics spec
- update the older ranked-slot design doc
- keep the semantic contract unchanged

- [ ] **Step 3: Add a brief changelog note if warranted**

If the repo root changelog is still being used for Step 3 V2 summary notes, add one concise line stating:
- V2 duplicate-floating now means true Step 3-owned floating-on-floating only
- preview and tooltip share the same interpretation

- [ ] **Step 4: Final review against acceptance criteria**

Review checklist:
- upstream Step 2 non-floating does not create duplicate-floating
- upstream special-program coverage does not create duplicate-floating
- upstream substitution-like coverage does not create duplicate-floating
- Step 3.2 / 3.3 committed floating still count as Step 3-owned floating
- preview and tooltip agree on duplicate wording
- engine result + tracker/tooltip alignment is now regression-proven
- Step 2 business logic still matches the pre-change behavior
- V1 legacy behavior still matches the pre-change behavior

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md CHANGELOG_2.md
git commit -m "docs: finalize v2 duplicate-floating semantics alignment"
```

---

## Self-Review

### 1. Spec coverage
- Shared semantic contract: covered by Tasks 1-2
- Step 2 -> Step 3 boundary rules: covered by Task 2
- Draft allocator narrowing: covered by Task 3
- Repair audit narrowing: covered by Task 3
- Preview / tooltip alignment: covered by Task 4
- Tracker field review: covered by Task 5
- Regression proof of allocator result + V2 tracking alignment: covered by Tasks 1, 4, and 6

### 2. Placeholder scan
- No `TBD`, `TODO`, or "write tests" placeholders remain without file paths and expected behaviors.

### 3. Type consistency
- The plan assumes `SlotAssignmentLog` / `TeamAllocationLog` may gain narrower semantics or extra provenance-style fields.
- The plan does not require changing the canonical external export name `allocateFloatingPCA_v2RankedSlot`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-10-v2-duplicate-floating-semantics-alignment-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
