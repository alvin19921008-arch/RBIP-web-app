# Step 3 V2 Ranked Slot Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the agreed Step 3 V2 redesign so ranked-slot allocation keeps V2's slot-priority purpose, preserves ranked preferences in caller contracts, uses a continuity-friendly first pass, and applies a bounded audit/repair stage to improve global outcomes for problems A-C.

**Architecture:** Keep `allocateFloatingPCA_v2RankedSlot` as the canonical external API, but refactor its internals into a continuity-friendly draft pass plus a deterministic bounded repair pass. Preserve ranked-slot metadata end to end, add explicit repair-aware tracker reasons, and protect the wizard/harness call contract so manual selections never erase ranked slots.

**Tech Stack:** TypeScript, existing Step 3 scheduling algorithms, Node-based regression tests (`npx tsx`), existing tracker/hover diagnostics.

### Post-implementation (2026-04-10)

- **Wizard preview/save:** Step 3.2/3.3 committed selections are applied via `executeSlotAssignments` before Step 3.4 using `lib/features/schedule/step3V2CommittedSelections.ts` (called from `FloatingPCAConfigDialogV2.tsx`), so `result.allocations` and the tracker match what the schedule page persists.
- **`executeSlotAssignments`:** return value includes `executedAssignments` for accurate Step 3.2/3.3 tracker logging when an assignment is skipped.
- **Regression:** `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts` — include in any full Step 3 V2 sweep alongside `f62`–`f74`.
- **Changelog:** brief product summary in repo root `CHANGELOG_2.md`; full design detail remains in the spec below.

---

## File Structure

### Files to modify
- `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
  - Living design reference. Must stay aligned with final implementation behavior.
- `lib/algorithms/pcaAllocationFloating.ts`
  - Main V2 algorithm internals today. Expected to be trimmed and/or to host orchestration only after extraction.
- `lib/algorithms/floatingPcaV2RankedSlot.ts`
  - Thin canonical export file. Update only if extraction shape changes.
- `lib/utils/floatingPCAHelpers.ts`
  - Team preference interpretation, slot ladders, tracker data structures, and helper logic.
- `components/allocation/FloatingPCAConfigDialogV2.tsx`
  - Ranked Step 3 wizard caller contract. Must preserve ranked slots.
- `tests/regression/f67-step34-selected-only-rank-loss-characterization.test.ts`
  - Update or supersede after fixing the caller contract.
- `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`
  - Must continue passing and may need expectation refinement if tracker metadata changes.
- `tests/regression/f69-step34-extra-coverage-duplicate-characterization.test.ts`
  - Must continue passing; keep extra coverage clearly outside core A-C quality semantics.
- `tests/regression/f70-step34-v2-core-duplicate-characterization.test.ts`
  - Must continue passing or evolve only if the scenario no longer duplicates because the bug is fixed.

### Files likely to create
- `lib/algorithms/floatingPcaV2/effectivePreferences.ts`
  - Preserve base ranked slots while applying manual Step 3.2/3.3 preference selections.
- `lib/algorithms/floatingPcaV2/draftAllocation.ts`
  - Continuity-friendly first pass, still ranked-slot aware.
- `lib/algorithms/floatingPcaV2/repairAudit.ts`
  - Detect A/B/C/fairness defects in the draft result.
- `lib/algorithms/floatingPcaV2/repairMoves.ts`
  - Deterministic bounded move generation and application helpers.
- `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
  - Lexicographic schedule scoring helpers used by the repair pass.
- `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
  - Replaces the current characterization with a passing contract test.
- `tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts`
  - Proves audit can improve a missed higher-ranked slot.
- `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
  - Proves audit can remove a duplicate when a bounded repair exists.
- `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`
  - Proves audit can collapse multi-PCA fulfillment when safe.

### Files to inspect while implementing
- `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- `lib/algorithms/floatingPcaV1LegacyPreference.ts`
- `lib/algorithms/pcaAllocation.ts`
- `components/allocation/FloatingPCAConfigDialog.tsx`
- `tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts`
- `tests/regression/f64-step34-tracker-reasons.test.ts`
- `tests/regression/f65-floating-pca-engine-export-contract.test.ts`
- `tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts`

### Mandatory review rule for implementing agent
After every task below that changes code, the implementing agent must run a focused code review against the plan:
- confirm the edited code still matches the objective order from the spec
- confirm no task silently reintroduces `selected_only` rank loss
- confirm no task changes canonical export names
- confirm no task weakens determinism by adding unstable iteration order
- confirm tests added in the task actually prove the intended behavior instead of duplicating implementation details

If any mismatch is found, fix it before moving to the next task.

---

### Task 1: Lock the caller-contract fix for ranked V2

**Files:**
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Create: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- Modify or delete: `tests/regression/f67-step34-selected-only-rank-loss-characterization.test.ts`

- [ ] **Step 1: Write the failing regression test for preserving ranked slots**

Create `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts` with a scenario where:
- base `preferred_slots` is non-empty
- `selectedPreferenceAssignments` exists
- the ranked allocator still sees the base ranked order and fulfills the highest ranked slot when legal

Use a test shape like:

```ts
import assert from 'node:assert/strict'
import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return { FO: value, SMM: value, SFM: value, CPPC: value, MC: value, GMC: value, NSM: value, DRO: value }
}

async function main() {
  // Base ranked slots must survive manual selections.
  // The assertion should fail against the old selected_only behavior.
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run the new test to confirm current failure**

Run:

```bash
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
```

Expected:
- FAIL under the old `selected_only` contract
- Failure should clearly show ranked slots were lost or the wrong slot was chosen

- [ ] **Step 3: Implement minimal contract-preserving preference logic**

Refactor the effective-preference logic so manual selections can bias preferred PCA choice without erasing ranked slots.

Implementation requirements:
- base `preferred_slots` must always survive into V2 effective preferences
- if selected Step 3.2/3.3 assignments exist, they may influence `preferred_pca_ids`
- do not keep the behavior `preferred_slots: []`
- do not change the external signature of `allocateFloatingPCA_v2RankedSlot`

Expected code shape:

```ts
return TEAMS.map((team) => {
  const base = baseByTeam.get(team)
  const selectedPcaIds = Array.from(selectedPcaByTeam.get(team) ?? new Set<string>())
  const basePreferredPcaIds = base?.preferred_pca_ids ?? []

  return {
    ...(base ?? { id: `__effective_pref_${team}`, team }),
    team,
    preferred_pca_ids: selectedPcaIds.length > 0 ? selectedPcaIds : basePreferredPcaIds,
    preferred_slots: base?.preferred_slots ?? [],
  }
})
```

- [ ] **Step 4: Update the V2 wizard caller to use the fixed contract intentionally**

In `components/allocation/FloatingPCAConfigDialogV2.tsx`:
- stop using a contract that semantically erases ranked slots
- add a short comment explaining that manual selections may bias PCA choice but must not erase ranked order

- [ ] **Step 5: Run focused regression verification**

Run:

```bash
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts && \
npx tsx tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts && \
npx tsx tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts
```

Expected:
- all PASS

- [ ] **Step 6: Code review against plan**

Review checklist:
- ranked slots are preserved end to end
- caller contract is explicit and documented
- no legacy ambiguous naming is reintroduced
- test proves the contract, not just current implementation internals

- [ ] **Step 7: Commit**

```bash
git add components/allocation/FloatingPCAConfigDialogV2.tsx lib/algorithms/pcaAllocationFloating.ts tests/regression/f67-step34-selected-only-rank-loss-characterization.test.ts tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
git commit -m "fix: preserve ranked slots in step 3 v2 preference contract"
```

---

### Task 2: Extract and stabilize effective-preference and scoring helpers

**Files:**
- Create: `lib/algorithms/floatingPcaV2/effectivePreferences.ts`
- Create: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Test: `tests/regression/f64-step34-tracker-reasons.test.ts`

- [ ] **Step 1: Write small helper tests or extend existing regression coverage**

Add focused assertions that:
- effective preferences preserve ranked slots
- duplicate rank order excludes gym when `avoidGym` is on
- schedule scoring sorts quality in the order:
  - ranked coverage
  - fairness floor
  - fulfilled pending
  - duplicates
  - split count

If a new focused test file is needed, create it under `tests/regression/`.

- [ ] **Step 2: Run helper-focused tests and confirm failures where applicable**

Run the exact affected tests, for example:

```bash
npx tsx tests/regression/f62-ranked-slot-preference-contracts.test.ts
```

Expected:
- existing assertions still pass
- any new score assertions should fail until score helper exists

- [ ] **Step 3: Extract helper modules without changing behavior**

Create:
- `effectivePreferences.ts`
- `scoreSchedule.ts`

Required exported shapes:

```ts
export type RankedSlotAllocationScore = {
  highestRankCoverage: number
  fairnessSatisfied: number
  totalFulfilledPendingQuarterSlots: number
  duplicateFloatingCount: number
  splitPenalty: number
}

export function compareScores(a: RankedSlotAllocationScore, b: RankedSlotAllocationScore): number
export function buildEffectiveRankedPreferences(/* existing input shape */): PCAPreference[]
```

Implementation rule:
- extraction should be behavior-preserving at this task
- do not yet add repair behavior here

- [ ] **Step 4: Wire the main V2 allocator to use the extracted helpers**

Replace inline logic in `pcaAllocationFloating.ts` with imports from the new helper files while preserving current runtime behavior.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx tsx tests/regression/f62-ranked-slot-preference-contracts.test.ts && \
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts && \
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
```

Expected:
- all PASS

- [ ] **Step 6: Code review against plan**

Review checklist:
- extracted helpers have one clear responsibility each
- score ordering matches the spec exactly
- no behavior change slipped in under “refactor”

- [ ] **Step 7: Commit**

```bash
git add lib/algorithms/floatingPcaV2/effectivePreferences.ts lib/algorithms/floatingPcaV2/scoreSchedule.ts lib/algorithms/pcaAllocationFloating.ts lib/utils/floatingPCAHelpers.ts tests/regression
git commit -m "refactor: extract ranked v2 preference and scoring helpers"
```

---

### Task 3: Implement the continuity-friendly V2 draft pass

**Files:**
- Create: `lib/algorithms/floatingPcaV2/draftAllocation.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Test: `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`
- Test: `tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts`

- [ ] **Step 1: Add a failing test or tighten an existing one for immediate continuity**

The test should prove:
- once a PCA is chosen for a team, the draft pass may continue immediately with that PCA
- continuity must still respect ranked-first slot order for that team

If `f68` already proves the needed shape, extend it instead of duplicating it.

- [ ] **Step 2: Run the continuity test and capture current behavior**

Run:

```bash
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts
```

Expected:
- PASS on current characterization
- use it as a safety net while changing the implementation

- [ ] **Step 3: Implement `draftAllocation.ts`**

Create a draft allocator that:
- processes teams in the incoming `teamOrder`
- uses the per-team slot ladder:
  - ranked-unused non-gym
  - unranked-unused non-gym
  - duplicate non-gym only when no useful unused non-gym remains for that team
  - gym last
- allows immediate continuity with the same PCA after initial selection
- prefers PCA choice in order:
  - can continue usefully
  - preferred PCA
  - floor PCA
  - non-floor PCA

Core entry shape:

```ts
export function runRankedV2DraftAllocation(args: {
  teamOrder: Team[]
  pendingFTE: Record<Team, number>
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  tracker: AllocationTracker
  recordAssignmentWithOrder: (team: Team, log: SlotAssignmentLog) => void
}): void
```

- [ ] **Step 4: Replace the old inline greedy loop with the draft helper**

In `pcaAllocationFloating.ts`:
- keep `allocateFloatingPCA_v2RankedSlot` as the orchestration entry
- delegate the first-pass logic to `runRankedV2DraftAllocation`
- preserve current result shape

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx tsx tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts && \
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts && \
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
```

Expected:
- all PASS

- [ ] **Step 6: Code review against plan**

Review checklist:
- continuity is stronger than old V2 but ranked-first still holds
- first pass is team-order driven, not strict round-robin
- duplicate fallback is still local-only and provisional at this stage

- [ ] **Step 7: Commit**

```bash
git add lib/algorithms/floatingPcaV2/draftAllocation.ts lib/algorithms/pcaAllocationFloating.ts tests/regression
git commit -m "refactor: add continuity-friendly ranked v2 draft pass"
```

---

### Task 4: Add bounded audit detection for A/B/C/fairness defects

**Files:**
- Create: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Create: `tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts`
- Create: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
- Create: `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`

- [ ] **Step 1: Write failing regression tests for audit-detectable improvements**

Add three tests:
- `f72`: draft misses a higher-ranked slot that can be recovered by moving or swapping one slot
- `f73`: draft contains a duplicate that can be removed by one bounded repair
- `f74`: draft splits a team across too many PCAs and can be safely collapsed

Each test should assert the pre-repair defect and the post-repair improved result.

- [ ] **Step 2: Run the new tests to verify failure before implementation**

Run:

```bash
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts && \
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts && \
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
```

Expected:
- FAIL until repair audit/moves are implemented

- [ ] **Step 3: Implement repair-audit defect detection**

Create `repairAudit.ts` with defect types exactly matching the spec:

```ts
export type RankedV2RepairDefect =
  | { kind: 'B1'; team: Team }
  | { kind: 'A1'; team: Team }
  | { kind: 'A2'; team: Team; pcaId: string }
  | { kind: 'C1'; team: Team }
  | { kind: 'F1'; team: Team }

export function detectRankedV2RepairDefects(/* context */): RankedV2RepairDefect[]
```

Implementation rule:
- defect detection must be deterministic
- do not mutate allocations here

- [ ] **Step 4: Wire audit detection after the draft pass**

In `pcaAllocationFloating.ts`, after draft allocation:
- compute defects
- do not yet apply moves if move generation is not implemented
- thread defect info through debug/tracker comments if helpful

- [ ] **Step 5: Run the targeted tests and confirm only audit detection pieces pass**

Run:

```bash
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts
```

Expected:
- may still FAIL if move application is not yet present
- if you split tests into detect-vs-repair layers, the detect layer should PASS

- [ ] **Step 6: Code review against plan**

Review checklist:
- defect kinds match the spec exactly
- no mutation in audit detection
- deterministic iteration order is explicit

- [ ] **Step 7: Commit**

```bash
git add lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/pcaAllocationFloating.ts tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
git commit -m "feat: add ranked v2 repair audit detection"
```

---

### Task 5: Implement bounded repair moves and acceptance scoring

**Files:**
- Create: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Test: `tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts`
- Test: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
- Test: `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`

- [ ] **Step 1: Implement one-slot move and swap primitives with isolated tests**

Create deterministic helpers such as:

```ts
export function applyOneSlotMove(/* ... */): RepairCandidate | null
export function applyOneSlotSwap(/* ... */): RepairCandidate | null
export function applyContinuityCollapse(/* ... */): RepairCandidate | null
```

Rules:
- never create invalid slot occupancy in a PCA row
- never exceed PCA slot availability
- never violate gym avoidance semantics unless the moved slot is already a legal gym-last-resort path

- [ ] **Step 2: Implement lexicographic acceptance scoring**

Update `scoreSchedule.ts` so repairs are accepted only if strictly better on:
- ranked-slot coverage
- fairness floor
- fulfilled pending
- duplicate count
- split penalty

Do not collapse this into one lossy weighted number unless the vector comparison remains exact.

- [ ] **Step 3: Implement bounded repair loop**

In `pcaAllocationFloating.ts`:
- iterate through detected defects in deterministic order
- generate candidate moves
- score each candidate
- accept the best strictly improving candidate
- repeat up to a hard iteration cap

Required bounds:

```ts
const MAX_REPAIR_ITERATIONS = 8
const MAX_CANDIDATES_PER_DEFECT = 24
```

Use constants with comments if you choose different values, but they must remain explicit and small.

- [ ] **Step 4: Record repair-stage tracker metadata**

When a repair modifies the final allocation, record:
- `allocationStage: 'repair'`
- `repairReason`

Do not silently overwrite draft reasoning without leaving repair metadata.

- [ ] **Step 5: Run focused repair regression verification**

Run:

```bash
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts && \
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts && \
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
```

Expected:
- all PASS

- [ ] **Step 6: Code review against plan**

Review checklist:
- repair loop is bounded
- repairs are one-slot local moves or swaps, not whole-schedule rewrites
- acceptance ordering matches spec exactly
- repair metadata is observable in tracker output

- [ ] **Step 7: Commit**

```bash
git add lib/algorithms/floatingPcaV2/repairMoves.ts lib/algorithms/floatingPcaV2/scoreSchedule.ts lib/algorithms/pcaAllocationFloating.ts tests/regression
git commit -m "feat: add bounded repair pass for ranked v2 allocation"
```

---

### Task 6: Integrate tracker/diagnostic updates for draft vs repair

**Files:**
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Test: `tests/regression/f64-step34-tracker-reasons.test.ts`

- [ ] **Step 1: Add failing assertions for repair-aware tracker fields**

Extend `f64` or add a new test so tracker output must include:
- `allocationStage`
- `repairReason` when applicable

- [ ] **Step 2: Run the tracker test and confirm failure before implementation**

Run:

```bash
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts
```

Expected:
- FAIL until tracker fields are wired

- [ ] **Step 3: Implement tracker field extensions**

Update tracker typing and recording helpers so new fields are supported without breaking old consumers.

Required additions:

```ts
allocationStage?: 'draft' | 'repair' | 'extra-coverage'
repairReason?: 'ranked-coverage' | 'fairness-floor' | 'duplicate-reduction' | 'continuity-reduction' | null
```

- [ ] **Step 4: Ensure old UI consumers remain backward-compatible**

If any UI path reads assignment logs directly:
- keep old fields intact
- only add optional new fields

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts && \
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts
```

Expected:
- all PASS

- [ ] **Step 6: Code review against plan**

Review checklist:
- tracker additions are additive, not breaking
- repair reasons are explicit and not reconstructed heuristically in tests

- [ ] **Step 7: Commit**

```bash
git add lib/utils/floatingPCAHelpers.ts lib/algorithms/pcaAllocationFloating.ts tests/regression/f64-step34-tracker-reasons.test.ts
git commit -m "feat: add repair-aware tracker metadata for ranked v2"
```

---

### Task 7: Full regression sweep and final code review

**Files:**
- Modify as needed based on failures from this task only

- [ ] **Step 1: Run the full focused Step 3 V2 regression suite**

Run:

```bash
npx tsx tests/regression/f62-ranked-slot-preference-contracts.test.ts && \
npx tsx tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts && \
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts && \
npx tsx tests/regression/f65-floating-pca-engine-export-contract.test.ts && \
npx tsx tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts && \
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts && \
npx tsx tests/regression/f69-step34-extra-coverage-duplicate-characterization.test.ts && \
npx tsx tests/regression/f70-step34-v2-core-duplicate-characterization.test.ts && \
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts && \
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts && \
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts && \
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts && \
npx tsx tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts
```

Expected:
- all PASS

- [ ] **Step 2: Run lint on touched files**

Run:

```bash
npx eslint lib/algorithms/pcaAllocationFloating.ts lib/algorithms/floatingPcaV2/*.ts lib/utils/floatingPCAHelpers.ts lib/features/schedule/step3V2CommittedSelections.ts lib/utils/reservationLogic.ts components/allocation/FloatingPCAConfigDialogV2.tsx tests/regression/f6*.ts tests/regression/f7*.ts
```

Expected:
- no lint errors

- [ ] **Step 3: Perform mandatory human-style code review of the final implementation**

Review against the spec and this plan. Verify:
- ranked slots are never erased by manual selections
- first pass is continuity-friendly and team-order driven
- repair pass is bounded and deterministic
- duplicate fallback is provisional and globally repairable
- no repair move can worsen ranked-slot coverage while claiming to improve quality
- no repair move performs broad schedule rewrites
- tracker metadata distinguishes draft vs repair
- V1 canonical behavior and exports remain intact

If any mismatch appears, fix it before completion.

- [ ] **Step 4: Re-run any tests affected by review fixes**

Run only the exact failing/affected commands from Steps 1-2 again.

- [ ] **Step 5: Commit final implementation**

```bash
git add lib/algorithms/pcaAllocationFloating.ts lib/algorithms/floatingPcaV2/*.ts lib/utils/floatingPCAHelpers.ts components/allocation/FloatingPCAConfigDialogV2.tsx tests/regression docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md docs/superpowers/plans/2026-04-09-step3-v2-ranked-slot-repair-plan.md
git commit -m "feat: add bounded repair to step 3 ranked v2 allocator"
```

---

## Self-Review

### Spec coverage
- Caller-contract rank preservation: covered in Task 1
- Continuity-friendly first pass: covered in Task 3
- Bounded audit/repair: covered in Tasks 4-5
- Tracker diagnostics: covered in Task 6
- Full verification and code review: covered in Task 7

### Placeholder scan
- No `TODO`, `TBD`, or “handle appropriately” placeholders remain
- Every task includes concrete file paths and commands

### Type consistency
- Canonical external allocator remains `allocateFloatingPCA_v2RankedSlot`
- Repair defect names align with the updated spec
- Tracker field names align with the updated spec

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-09-step3-v2-ranked-slot-repair-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
