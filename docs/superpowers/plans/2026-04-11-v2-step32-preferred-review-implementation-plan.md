# V2 Step 3.2 Preferred Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the V2-only Step 3.2 dialog into a preferred-PCA review surface with a single status-first lane, category summaries, a richer per-team preview model, outcome-based review cards, and Step 3.4 handoff semantics that treat Step 3.2 commits as reservations without replacing the team's remaining preferred PCA list.

**Architecture:** Keep all new behavior inside V2-only UI and V2-feature-scoped preview/handoff files. Build a richer Step 3.2 preview model first, then separate reservation state from preference identity before touching the dialog UI. Finally, replace the current V2 Step 3.2 lane/detail rendering with V2-specific subcomponents that consume the new preview model, render a compact category-summary strip above the lane, present full allocation outcomes instead of isolated slot buttons, surface trade-off states clearly, and preserve the ranked-slot-first contract from the V2 allocator design.

**Tech Stack:** TypeScript, React/Next.js dialog UI, V2 ranked-slot allocator files in `lib/algorithms/floatingPcaV2/`, V2 feature-layer files in `lib/features/schedule/`, Node-based regression tests via `npx tsx`.

---

## File Structure

### Specs / source-of-truth references
- Reference only: `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`
- Reference only: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`

### Preview / model files
- Create: `lib/features/schedule/step32PreferredReviewModel.ts`
  - V2-only Step 3.2 preview derivation, path classification, outcome-scenario assembly, and trade-off detection.
- Create: `lib/features/schedule/step32PreferredReviewCopy.ts`
  - Lane labels, category headings, outcome-card titles/fact-line copy, detail-panel status copy, and trade-off message helpers.
- Modify: `lib/features/schedule/step3V2ReservationPreview.ts`
  - Keep public import path stable; convert into a thin wrapper / re-export surface over the new V2-only model.

### Step 3.4 handoff / allocator contract files
- Modify: `lib/features/schedule/step3V2CommittedSelections.ts`
  - Stop using Step 3.2 / 3.3 reservations as a preferred-PCA identity rewrite; pass committed state separately for provenance / reservation handling.
- Modify: `lib/algorithms/floatingPcaShared/contracts.ts`
  - Add a separate optional V2-facing field for committed Step 3 selections before Step 3.4.
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
  - Keep ranked-slot protection intact while using committed Step 3 selections only for reservation / provenance handling, not for replacing preferred PCA identity.
- Modify: `lib/algorithms/floatingPcaV2/effectivePreferences.ts`
  - Narrow the helper contract / comments so Step 3.2 reservations do not replace the team's preferred PCA set in the V2 wizard path.
- Modify if needed: `lib/algorithms/floatingPcaV2/provenance.ts`
  - Reuse as supporting annotation only; do not move lane-state policy here.

### V2 UI files
- Create: `components/allocation/step32/Step32PreferredReviewLane.tsx`
  - Category summary strip, compact legend, single ordered lane, low-density team cards, selected-card focus ring.
- Create: `components/allocation/step32/Step32PreferredReviewDetailPanel.tsx`
  - Metadata strip, preferred summary, outcome-card chooser, selected-outcome summary, candidate chooser, trade-off note, reservation actions.
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`
  - Replace current Step 3.2 exception-only UI with the new lane + detail panel wiring and reservation state.

### Regression tests
- Modify: `tests/regression/f65-step32-ranked-slot-exception-preview.test.ts`
  - Convert old single-slot exception assertions into the new V2 preview contract.
- Modify: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
  - Replace the old `selected_only` preferred-tier rewrite expectations with the new reservation-preserves-preferred-set contract.
- Modify: `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts`
  - Keep tracker and committed-assignment behavior aligned after the handoff change.
- Create: `tests/regression/f89-step32-preferred-review-state-contract.test.ts`
  - Condition A/B/C/D lane-state contract.
- Create: `tests/regression/f90-step32-preferred-tradeoff-contract.test.ts`
  - Scenario 3 continuity trade-off contract: showable + committable_with_tradeoff, not blocked and not equal to system suggestion.
- Create: `tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts`
  - End-to-end Step 3.2 reservation + Step 3.4 remaining preferred PCA contract.
- Create: `tests/regression/f92-step32-preferred-review-copy-contract.test.ts`
  - Lane labels / legend / trade-off wording contract for the new pure copy helper.

### Files that must stay untouched for behavior isolation
- Do not modify: `components/allocation/FloatingPCAConfigDialog.tsx`
- Do not modify: `components/allocation/TeamReservationCard.tsx`
- Do not modify: `lib/algorithms/floatingPcaLegacy/allocator.ts`
- Do not move new V2 review-state policy into `lib/utils/floatingPCAHelpers.ts`

## Implementation Constraints

### Constraint 1: Keep V2 review policy out of shared and legacy surfaces
The extraction guidance already warned that V1/V2 contamination is risky. This implementation must keep:

- V2 Step 3.2 review-state derivation
- V2 path / trade-off classification
- V2 reservation semantics

inside V2-only or V2-feature-scoped files.

Allowed:

- reuse shared mechanics such as `findAvailablePCAs`, `executeSlotAssignments`, and tracker append helpers
- reuse provenance data as supplemental annotation

Disallowed:

- editing V1 dialog files to host V2 review behavior
- reusing `TeamReservationCard.tsx` as a shared V1/V2 component
- broadening shared helpers to encode V2-specific lane-state or trade-off rules

### Constraint 2: Ranked-slot protection stays above preferred-PCA wish
The new Step 3.2 UI must not imply that every visible later preferred path is equal to the system suggestion.

The system suggestion must still prefer:

- protect the earliest satisfiable ranked slot first
- preserve continuity when the same PCA can continue to later ranked slots

But the UI may expose a user-committable later preferred path when:

- the earliest satisfiable ranked slot remains protected
- pending can still be met
- the cost is a lower-priority trade-off such as reduced continuity

### Constraint 3: Step 3.2 reservations mutate state, not preference identity
When a Step 3.2 reservation is committed:

- it must affect allocations, pending, tracker, and provenance
- it must not collapse the team's preferred PCA list to only the committed PCA

This means the V2 handoff must stop overloading `selectedPreferenceAssignments` as both:

- a reservation/state input
- a preferred-PCA identity rewrite

### Constraint 4: Copy contract must be testable
Lane labels, category headings, legend text, outcome-card titles/fact lines, and continuity trade-off wording should not be buried as ad-hoc inline strings in `FloatingPCAConfigDialogV2.tsx`.

Preferred implementation direction:

- centralize approved Step 3.2 copy in a pure helper module
- import that module into the new UI components
- test the helper directly with a small Node regression

### Constraint 5: Repo-wide `tsc --noEmit` is currently noisy
Use focused regression tests plus IDE diagnostics on modified files. Do not block this work on unrelated repo-wide type errors.

---

### Task 1: Lock the new Step 3.2 review contracts with failing tests

**Files:**
- Modify: `tests/regression/f65-step32-ranked-slot-exception-preview.test.ts`
- Modify: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- Modify: `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts`
- Create: `tests/regression/f89-step32-preferred-review-state-contract.test.ts`
- Create: `tests/regression/f90-step32-preferred-tradeoff-contract.test.ts`
- Create: `tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts`
- Create: `tests/regression/f92-step32-preferred-review-copy-contract.test.ts`

- [ ] **Step 1: Rewrite `f65` to assert the new "alternative path" preview shape**

Update `tests/regression/f65-step32-ranked-slot-exception-preview.test.ts` so the old single-slot exception case now expects:

- `reviewState === 'alternative'`
- the earliest feasible ranked path to be the system suggestion
- a later preferred outcome card to be present
- the later preferred outcome to be marked `committable_with_tradeoff`
- the later preferred outcome copy to keep `Protects rank #1` visible in its summary lines

Use a target assertion shape like:

```ts
const preview = computeStep3V2ReservationPreview({
  pcaPreferences: preferences,
  adjustedPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
  floatingPCAs: [makePca('pca-a', [3]), makePca('floor-m', [1, 3])],
  existingAllocations: [],
})

const fo = preview.teamReviews.FO
assert.equal(fo?.reviewState, 'alternative')
assert.equal(fo?.systemSuggestedPathKey, 'ranked:1')
assert.equal(
  fo?.outcomeOptions.find((option) => option.outcomeKey === 'preferred-ranked:3')?.commitState,
  'committable_with_tradeoff'
)
assert.deepEqual(
  fo?.outcomeOptions.find((option) => option.outcomeKey === 'preferred-ranked:3')?.summaryLines,
  ['Protects rank #1', 'Keeps preferred on rank #2', 'Uses 2 PCAs']
)
```

- [ ] **Step 2: Add the A/B/C/D team-state regression**

Create `tests/regression/f89-step32-preferred-review-state-contract.test.ts` covering:

- condition D -> `not_applicable`
- condition B -> `not_applicable`
- condition C preferred-only matched or unavailable as appropriate
- condition A -> `matched`, `alternative`, and `unavailable` cases

Start from a tiny helper layout:

```ts
function makePreference(partial: Partial<PCAPreference> & { id: string; team: Team }): PCAPreference {
  return {
    preferred_pca_ids: [],
    preferred_slots: [],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
    ...partial,
  }
}
```

- [ ] **Step 3: Add the continuity trade-off regression**

Create `tests/regression/f90-step32-preferred-tradeoff-contract.test.ts` for the clarified Scenario 3:

- ranked `1 > 3`
- preferred PCA available on `3` only
- floor PCA available on `1 + 3`

Assert:

- system suggestion is `ranked:1` with the floor PCA
- the `ranked:3` preferred path exists
- that path is not blocked
- that path is `committable_with_tradeoff`
- trade-off wording points to continuity loss, not rank-slot loss

Core assertions:

```ts
assert.equal(fo.systemSuggestedPathKey, 'ranked:1')
assert.equal(fo.pathOptions.find((o) => o.pathKey === 'ranked:3')?.commitState, 'committable_with_tradeoff')
assert.equal(fo.pathOptions.find((o) => o.pathKey === 'ranked:3')?.tradeoffKind, 'continuity')
```

- [ ] **Step 4: Add the reservation-preserves-preferred-set regression**

Create `tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts` using `runStep3V2CommittedSelections()` to prove:

- Step 3.2 can commit preferred PCA `A` to one slot
- Step 3.4 can still treat `B` as preferred for the remaining unmet pending

Use a setup like:

```ts
const result = await runStep3V2CommittedSelections({
  teamOrder,
  currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
  existingAllocations: [],
  floatingPCAs: [makePca('a', [1]), makePca('b', [3])],
  pcaPreferences: [{
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: ['a', 'b'],
    preferred_slots: [1, 3],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }],
  specialPrograms: [],
  step32Assignments: [{ team: 'FO', slot: 1, pcaId: 'a', pcaName: 'a' }],
  step33Assignments: [],
})

const step34Rank2 = result.tracker.FO.assignments.find(
  (assignment) => assignment.assignedIn === 'step34' && assignment.slot === 3
)
assert.equal(step34Rank2?.pcaId, 'b')
assert.equal(step34Rank2?.pcaSelectionTier, 'preferred')
```

- [ ] **Step 5: Add the copy contract regression**

Create `tests/regression/f92-step32-preferred-review-copy-contract.test.ts` that directly imports the future pure copy helper and locks:

- `N/A`
- `Matched`
- `Alt slot`
- `Unavailable`
- category headings (`Matched`, `Alt path`, `Unavailable`, `No review`)
- the compact legend
- outcome-card fact-line copy that keeps `Protects rank #1` visible on the alternative outcomes
- the continuity trade-off line

Use a test shape like:

```ts
assert.equal(getStep32LaneLabel('not_applicable'), 'N/A')
assert.equal(getStep32LaneLabel('matched'), 'Matched')
assert.equal(getStep32CategoryHeading('alternative'), 'Alt path')
assert.deepEqual(
  getOutcomeSummaryLines({
    variant: 'preferred_ranked',
    protectedRankLabel: 'rank #1',
    preferredRankLabel: 'rank #2',
  }),
  ['Protects rank #1', 'Keeps preferred on rank #2', 'Uses 2 PCAs']
)
assert.equal(getTradeoffMessage('continuity'), 'Rank #1 stays protected, but continuity is reduced because the team would use 2 PCAs instead of 1.')
```

- [ ] **Step 6: Run the focused regressions and verify failure**

Run:

```bash
npx tsx tests/regression/f65-step32-ranked-slot-exception-preview.test.ts
npx tsx tests/regression/f89-step32-preferred-review-state-contract.test.ts
npx tsx tests/regression/f90-step32-preferred-tradeoff-contract.test.ts
npx tsx tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
```

Expected:
- at least one new or updated test FAILS against the current implementation
- failures point to missing state shape, missing copy helper, or the old preferred-list replacement semantics

- [ ] **Step 7: Commit**

```bash
git add tests/regression/f65-step32-ranked-slot-exception-preview.test.ts tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts tests/regression/f89-step32-preferred-review-state-contract.test.ts tests/regression/f90-step32-preferred-tradeoff-contract.test.ts tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts tests/regression/f92-step32-preferred-review-copy-contract.test.ts
git commit -m "test: lock v2 step32 preferred review contracts"
```

---

### Task 2: Build a V2-only Step 3.2 preview and copy model

**Files:**
- Create: `lib/features/schedule/step32PreferredReviewModel.ts`
- Create: `lib/features/schedule/step32PreferredReviewCopy.ts`
- Modify: `lib/features/schedule/step3V2ReservationPreview.ts`

- [ ] **Step 1: Create V2-only Step 3.2 preview types and path-key helpers**

Create `lib/features/schedule/step32PreferredReviewModel.ts` with stable, testable types:

```ts
export type Step32ReviewState = 'not_applicable' | 'matched' | 'alternative' | 'unavailable'
export type Step32CommitState = 'showable' | 'committable' | 'committable_with_tradeoff' | 'blocked'
export type Step32TradeoffKind = 'continuity' | 'other'

export interface Step32PathOption {
  pathKey: string
  kind: 'ranked' | 'unranked' | 'gym'
  slot: 1 | 2 | 3 | 4
  timeRange: string
  rank?: number
  isEarliestFeasiblePath: boolean
  preferredCandidates: Array<{ id: string; name: string }>
  floorCandidates: Array<{ id: string; name: string }>
  nonFloorCandidates: Array<{ id: string; name: string }>
  systemSuggestedPcaId?: string
  systemSuggestedPcaName?: string
  pathState: 'preferred_available' | 'system_only' | 'unavailable'
  commitState: Step32CommitState
  tradeoffKind?: Step32TradeoffKind
  note?: string
}

export interface Step32OutcomeRow {
  slot: 1 | 2 | 3 | 4
  timeRange: string
  pcaLabel: string
  pcaKind: 'preferred' | 'floor' | 'non_floor'
}

export interface Step32OutcomeOption {
  outcomeKey: string
  title: string
  primaryPathKey: string
  rows: Step32OutcomeRow[]
  summaryLines: string[]
  commitState: Step32CommitState
  tradeoffKind?: Step32TradeoffKind
  isSystemRecommended: boolean
}
```

Also add a stable helper:

```ts
export function getStep32PathKey(kind: 'ranked' | 'unranked' | 'gym', slot: 1 | 2 | 3 | 4): string {
  return `${kind}:${slot}`
}
```

- [ ] **Step 2: Implement per-team path derivation without touching shared helpers**

In `step32PreferredReviewModel.ts`, implement a pure builder that:

- uses `getTeamPreferenceInfo()` only as an input reader
- uses `findAvailablePCAs()` to gather feasible candidates per slot
- classifies preferred / floor / non-floor candidates for each path
- derives `reviewState`, `systemSuggestedPathKey`, `pathOptions`, and UI-facing `outcomeOptions`

Use a shape like:

```ts
export function buildStep32PreferredReviewPreview(args: {
  pcaPreferences: PCAPreference[]
  adjustedPendingFTE: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, StaffOverrideWithSubstitution>
}): Step32PreferredReviewPreview {
  // Build all-team review model here.
}
```

Important implementation rule:

- keep trade-off detection local to this V2 model
- do not move continuity / review-state policy into `floatingPCAHelpers.ts`
- keep outcome-card assembly local to this V2 model so the UI consumes full scenarios rather than reconstructing them ad hoc in TSX

- [ ] **Step 3: Add the pure copy helper for labels and trade-off text**

Create `lib/features/schedule/step32PreferredReviewCopy.ts` with pure helpers:

```ts
export function getStep32LaneLabel(state: Step32ReviewState): string {
  if (state === 'not_applicable') return 'N/A'
  if (state === 'matched') return 'Matched'
  if (state === 'alternative') return 'Alt slot'
  return 'Unavailable'
}

export function getStep32CategoryHeading(state: Step32ReviewState): string {
  if (state === 'matched') return 'Matched'
  if (state === 'alternative') return 'Alt path'
  if (state === 'unavailable') return 'Unavailable'
  return 'No review'
}

export function getStep32LegendItems() {
  return [
    { key: 'matched', label: 'Preferred matched' },
    { key: 'alternative', label: 'Preferred available on another path' },
    { key: 'unavailable', label: 'No preferred PCA available' },
    { key: 'not_applicable', label: 'No preferred review needed' },
  ] as const
}
```

Include:

```ts
export function getOutcomeSummaryLines(args: {
  variant: 'recommended_continuity' | 'preferred_ranked' | 'preferred_later'
  protectedRankLabel: string
  preferredRankLabel?: string
}): string[] {
  if (args.variant === 'recommended_continuity') {
    return [`Protects ${args.protectedRankLabel}`, 'Continuous one-PCA path', 'Recommended by allocator']
  }
  if (args.variant === 'preferred_ranked') {
    return [
      `Protects ${args.protectedRankLabel}`,
      `Keeps preferred on ${args.preferredRankLabel ?? 'later rank'}`,
      'Uses 2 PCAs',
    ]
  }
  return [`Protects ${args.protectedRankLabel}`, 'Preferred used later', 'Unranked fallback']
}

export function getTradeoffMessage(kind: Step32TradeoffKind): string {
  if (kind === 'continuity') {
    return 'Rank #1 stays protected, but continuity is reduced because the team would use 2 PCAs instead of 1.'
  }
  return 'This path is allowed, but it trades off a lower-priority quality signal.'
}
```

- [ ] **Step 4: Convert `step3V2ReservationPreview.ts` into a stable public wrapper**

Keep the existing import path stable by changing `lib/features/schedule/step3V2ReservationPreview.ts` to:

```ts
export {
  buildStep32PreferredReviewPreview as computeStep3V2ReservationPreview,
  getStep32PathKey,
  type Step32PreferredReviewPreview as Step3V2ReservationPreview,
  type Step32TeamReview as Step3V2TeamReservation,
} from '@/lib/features/schedule/step32PreferredReviewModel'
```

If type aliases need slightly different names for compatibility, keep the old export names but back them with the new V2-only model.

- [ ] **Step 5: Run the Step 3.2 preview regressions and make them pass**

Run:

```bash
npx tsx tests/regression/f65-step32-ranked-slot-exception-preview.test.ts
npx tsx tests/regression/f89-step32-preferred-review-state-contract.test.ts
npx tsx tests/regression/f90-step32-preferred-tradeoff-contract.test.ts
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
```

Expected:
- PASS for the pure preview/copy contract tests
- remaining failures, if any, should now be limited to Step 3.4 handoff semantics

- [ ] **Step 6: Commit**

```bash
git add lib/features/schedule/step32PreferredReviewModel.ts lib/features/schedule/step32PreferredReviewCopy.ts lib/features/schedule/step3V2ReservationPreview.ts tests/regression/f65-step32-ranked-slot-exception-preview.test.ts tests/regression/f89-step32-preferred-review-state-contract.test.ts tests/regression/f90-step32-preferred-tradeoff-contract.test.ts tests/regression/f92-step32-preferred-review-copy-contract.test.ts
git commit -m "feat: add v2 step32 preferred review model"
```

---

### Task 3: Separate Step 3.2 reservation state from Step 3.4 preferred identity

**Files:**
- Modify: `lib/algorithms/floatingPcaShared/contracts.ts`
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
- Modify: `lib/algorithms/floatingPcaV2/effectivePreferences.ts`
- Modify: `lib/features/schedule/step3V2CommittedSelections.ts`
- Modify: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- Modify: `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts`
- Modify: `tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts`

- [ ] **Step 1: Add a separate contract field for committed Step 3 reservations**

In `lib/algorithms/floatingPcaShared/contracts.ts`, add a V2-facing field distinct from `selectedPreferenceAssignments`:

```ts
committedStep3Assignments?: Array<{
  team: Team
  slot: number
  pcaId: string
  source?: 'step32' | 'step33'
}>
```

Keep `selectedPreferenceAssignments` for legacy / compatibility callers, but document that V2 Step 3.2 reservations no longer use it to replace preferred identity.

- [ ] **Step 2: Stop `runStep3V2CommittedSelections()` from rewriting preferred identity**

In `lib/features/schedule/step3V2CommittedSelections.ts`, change the allocator call from:

```ts
preferenceSelectionMode: args.preferenceSelectionMode ?? 'selected_only',
selectedPreferenceAssignments: committedAssignments.map(...)
```

to:

```ts
preferenceSelectionMode: 'legacy',
committedStep3Assignments: committedAssignments.map((assignment) => ({
  team: assignment.team,
  slot: assignment.slot,
  pcaId: assignment.pcaId,
  source: assignment.source,
})),
```

This keeps reservations as stateful inputs without replacing the preferred PCA set.

- [ ] **Step 3: Update the V2 allocator to use committed selections only for provenance / reservation handling**

In `lib/algorithms/floatingPcaV2/allocator.ts`, split the two concerns:

- effective preference identity
- committed Step 3 reservation provenance

Use a structure like:

```ts
const committedStep3Assignments = context.committedStep3Assignments ?? []
const effectivePreferences = pcaPreferences

const upstreamCoverageByTeamSlot = buildUpstreamCoverageKindByTeamSlot({
  existingAllocations,
  floatingPcaIds,
  excludeStep3OwnedSelections: committedStep3Assignments.map((assignment) => ({
    team: assignment.team,
    slot: assignment.slot,
    pcaId: assignment.pcaId,
  })),
})
```

Do not rebuild V2 effective `preferred_pca_ids` from committed Step 3 assignments in this path.

- [ ] **Step 4: Narrow `effectivePreferences.ts` so it no longer reads like the V2 wizard contract**

Update `lib/algorithms/floatingPcaV2/effectivePreferences.ts` comments and, if needed, signature usage so it is explicit that:

- this helper is not the Step 3.2 reservation handoff contract
- V2 Step 3.2 reservations preserve base preferred PCA identity

If the helper becomes unused in the V2 wizard path, leave it behaviorally intact for legacy-compatible callers but update comments accordingly:

```ts
/**
 * Legacy / explicit selection-driven preference override helper.
 * The V2 Step 3.2 preferred-review flow no longer uses this helper to encode reservations.
 */
```

- [ ] **Step 5: Rewrite the affected regressions to the new contract**

Update:

- `f71` so it still asserts ranked-slot order preservation, but no longer expects a Step 3.3 selection to rewrite preferred tier globally
- `f75` so it continues to assert committed Step 3.2 / 3.3 tracker ownership and pre-Step-3.4 pending behavior
- `f91` so it passes end-to-end

For `f71`, replace the old preferred-tier rewrite assertion:

```ts
assert.equal(step33Assignment?.pcaId, 'b')
assert.equal(step33Assignment?.pcaSelectionTier, 'preferred')
```

with a reservation-preservation assertion such as:

```ts
assert.equal(step33Result.tracker.FO.summary.fromStep33, 1)
assert.equal(step33Result.tracker.FO.assignments.some((assignment) => assignment.assignedIn === 'step33'), true)
```

- [ ] **Step 6: Run the handoff regressions and make them pass**

Run:

```bash
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
npx tsx tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts
npx tsx tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts
```

Expected:
- PASS
- committed Step 3 reservations affect allocations/tracker
- base preferred PCA set remains available for remaining Step 3.4 work

- [ ] **Step 7: Commit**

```bash
git add lib/algorithms/floatingPcaShared/contracts.ts lib/algorithms/floatingPcaV2/allocator.ts lib/algorithms/floatingPcaV2/effectivePreferences.ts lib/features/schedule/step3V2CommittedSelections.ts tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts
git commit -m "feat: preserve preferred set after step32 reservations"
```

---

### Task 4: Build V2-only Step 3.2 lane and detail-panel components

**Files:**
- Create: `components/allocation/step32/Step32PreferredReviewLane.tsx`
- Create: `components/allocation/step32/Step32PreferredReviewDetailPanel.tsx`
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`

**Visual Draft:**

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Floating PCA allocation                                                Step 3.2 · Preferred│
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Preferred PCA review                                                                       │
│ 5 teams · 2 matched · 1 alt path · 1 unavailable · 3 no review needed                     │
│                                                                                            │
│ Matched                 Alt path                Unavailable             No review           │
│ 2 teams                 1 team                  1 team                  3 teams             │
│ FO · CPPC               SMM                     GMC                     DRO · 7N · 8N       │
│                                                                                            │
│ Legend:  ✓ Matched     ⚠ Alt path     ✕ Unavailable     ○ No review needed                │
│                                                                                            │
│ ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐                                       │
│ │ 1st  │   │ 2nd  │   │ 3rd  │   │ 4th  │   │ 5th  │                                       │
│ │ DRO  │   │ FO   │   │ SMM  │   │ CPPC │   │ GMC  │                                       │
│ │  ○   │   │  ⚠   │   │  ⚠   │   │  ✓   │   │  ✕   │                                       │
│ │ N/A  │   │ Alt  │   │ Alt  │   │ Match│   │ Unav │                                       │
│ └──────┘   └──────┘   └──────┘   └──────┘   └──────┘                                       │
│                                                                                            │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ FO · 2nd in order                                                        [ Alt path ]      │
│ Pending 0.50     Assigned 0.00                                                            │
│                                                                                            │
│ Preferred PCA      光劭, …                                                                 │
│ Ranked slots       #1 1030-1200     #2 1330-1500                                          │
│ Other usable       0900-1030, 1500-1630                                                    │
│                                                                                            │
│ CHOOSE AN OUTCOME                                                                          │
│                                                                                            │
│ ┌───────────────────────────────┐  ┌───────────────────────────────┐  ┌──────────────────┐ │
│ │ Recommended · Continuity      │  │ Preferred on rank #2         │  │ Preferred later   │ │
│ │ 1030-1200   Floor-M           │  │ 1030-1200   Floor-M           │  │ 1030-1200 Floor-M│ │
│ │ 1330-1500   Floor-M           │  │ 1330-1500   Preferred: 光劭    │  │ 1500-1630 光劭   │ │
│ │ Protects rank #1              │  │ Protects rank #1              │  │ Protects rank #1 │ │
│ │ Continuous one-PCA path       │  │ Keeps preferred on rank #2    │  │ Preferred used   │ │
│ │ Recommended by allocator      │  │ Uses 2 PCAs                   │  │ later             │ │
│ └───────────────────────────────┘  └───────────────────────────────┘  └──────────────────┘ │
│                                                                                            │
│ Selected outcome summary                                                                   │
│ Rank #1 remains protected. Current choice keeps one continuous PCA across both ranked      │
│ slots, so allocator recommends Floor-M for 1030-1200 and 1330-1500.                        │
│                                                                                            │
│ Available PCA on selected outcome                                                          │
│ ○ Floor-M          system recommendation                                                   │
│ ○ 光劭             preferred PCA                                                           │
│ ○ Other usable PCA…                                                                        │
│                                                                                            │
│ [ Commit selected outcome ]   [ Leave open for Step 3.4 ]   [ Clear commit ]               │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- [ ] **Step 1: Create the status-first lane component**

Create `components/allocation/step32/Step32PreferredReviewLane.tsx` with props like:

```tsx
interface Step32PreferredReviewLaneProps {
  teamOrder: Team[]
  teamReviews: Record<Team, Step32TeamReview>
  selectedTeam: Team | null
  onSelectTeam: (team: Team) => void
}
```

Render:

- compact legend from `getStep32LegendItems()`
- compact status summary strip above the legend with four text columns: `Matched`, `Alt path`, `Unavailable`, `No review`
- each status column shows count plus small team-name text in team-order sequence
- one ordered row of cards
- order + team + icon + short label only

Use the Step 3.4 icon family:

```tsx
const StatusIcon =
  review.reviewState === 'matched'
    ? CheckCircle2
    : review.reviewState === 'alternative'
      ? AlertCircle
      : review.reviewState === 'unavailable'
        ? XCircle
        : Circle
```

- [ ] **Step 2: Create the detail panel component with outcome cards and trade-off note**

Create `components/allocation/step32/Step32PreferredReviewDetailPanel.tsx` with props like:

```tsx
interface Step32PreferredReviewDetailPanelProps {
  review: Step32TeamReview
  queuePosition: number
  selectedOutcomeKey: string | null
  onSelectOutcome: (outcomeKey: string) => void
  selectedPcaId: string | null
  onSelectPca: (pcaId: string) => void
  committedAssignment: SlotAssignment | null
  onCommit: () => void
  onLeaveOpen: () => void
  onClearCommit: () => void
}
```

Render:

- metadata strip: team, order, pending, assigned, state badge
- preferred summary
- outcome cards instead of single-slot buttons
- each card must read as a full allocation result, not an isolated slot pick
- render 2+ assignment rows inside each card when needed so a user can see both the rank-#1 protection row and the later preferred/fallback row in one place
- render non-badge fact lines under the assignment rows using the copy helper, for example:
  - `Protects rank #1`
  - `Keeps preferred on rank #2`
  - `Uses 2 PCAs`
- selected-outcome summary paragraph below the cards that reflects the currently selected outcome and any PCA override
- candidate chooser grouped as preferred / floor / non-floor
- explicit trade-off banner when `commitState === 'committable_with_tradeoff'`

Important UI rule:

- cards may still be clickable/selectable controls, but their visual language should be compact scenario cards, not ordinary slot buttons
- do not render the fact lines as pills or badges; use plain compact text lines
- when multiple PCAs can satisfy the selected outcome, the card rows may show the default/system labels while the selected-outcome summary below reflects the user's override choice

Use a trade-off callout like:

```tsx
{selectedOutcome?.commitState === 'committable_with_tradeoff' ? (
  <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
    {getTradeoffMessage(selectedOutcome.tradeoffKind ?? 'other')}
  </div>
) : null}
```

- [ ] **Step 3: Replace Step 3.2 decision enums in `FloatingPCAConfigDialogV2.tsx`**

Remove the old:

```ts
type Step32Decision = 'system' | 'keep-preferred' | 'skip'
const [step32Decisions, setStep32Decisions] = useState<...>({})
```

Replace it with explicit draft + committed selection state:

```ts
const [selectedStep32OutcomeByTeam, setSelectedStep32OutcomeByTeam] = useState<Partial<Record<Team, string>>>({})
const [selectedStep32PcaByTeam, setSelectedStep32PcaByTeam] = useState<Partial<Record<Team, string>>>({})
const [step32CommittedAssignmentsByTeam, setStep32CommittedAssignmentsByTeam] =
  useState<Partial<Record<Team, SlotAssignment | null>>>({})
```

Derive:

```ts
const step32AssignmentsForSave = useMemo<SlotAssignment[]>(
  () =>
    teamOrder.flatMap((team) => {
      const assignment = step32CommittedAssignmentsByTeam[team]
      return assignment ? [assignment] : []
    }),
  [teamOrder, step32CommittedAssignmentsByTeam]
)
```

- [ ] **Step 4: Wire the new lane + detail components into the Step 3.2 render path**

In `FloatingPCAConfigDialogV2.tsx`, replace the current flagged-only block with:

```tsx
<Step32PreferredReviewLane
  teamOrder={teamOrder}
  teamReviews={reservationPreview.teamReviews}
  selectedTeam={selectedStep32Team}
  onSelectTeam={setSelectedStep32Team}
/>

{selectedStep32Team && selectedReview ? (
  <Step32PreferredReviewDetailPanel
    review={selectedReview}
    queuePosition={teamOrder.indexOf(selectedStep32Team) + 1}
    selectedOutcomeKey={selectedStep32OutcomeByTeam[selectedStep32Team] ?? null}
    onSelectOutcome={(outcomeKey) => ...}
    selectedPcaId={selectedStep32PcaByTeam[selectedStep32Team] ?? null}
    onSelectPca={(pcaId) => ...}
    committedAssignment={step32CommittedAssignmentsByTeam[selectedStep32Team] ?? null}
    onCommit={() => ...}
    onLeaveOpen={() => ...}
    onClearCommit={() => ...}
  />
) : null}
```

Default selected team rule:

- prefer first review-applicable team in order
- if none are review-applicable, select nothing

Wire the detail panel against `selectedReview.outcomeOptions` rather than rebuilding scenario copy inline from raw slot-path data inside the dialog component.

- [ ] **Step 5: Run Step 3.2-focused regressions and fix UI-model mismatches**

Run:

```bash
npx tsx tests/regression/f65-step32-ranked-slot-exception-preview.test.ts
npx tsx tests/regression/f89-step32-preferred-review-state-contract.test.ts
npx tsx tests/regression/f90-step32-preferred-tradeoff-contract.test.ts
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
npx tsx tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts
```

Expected:
- PASS
- Step 3.2 lane is driven by the new preview model
- Step 3.2 committed assignments still flow into preview / tracker counts correctly

- [ ] **Step 6: Commit**

```bash
git add components/allocation/step32/Step32PreferredReviewLane.tsx components/allocation/step32/Step32PreferredReviewDetailPanel.tsx components/allocation/FloatingPCAConfigDialogV2.tsx
git commit -m "feat: redesign v2 step32 preferred review ui"
```

---

### Task 5: Final verification and cleanup

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`
- Modify if needed: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- Modify: any touched implementation/test files from earlier tasks only if verification reveals drift

- [ ] **Step 1: Re-run the full focused regression suite for this feature**

Run:

```bash
npx tsx tests/regression/f65-step32-ranked-slot-exception-preview.test.ts
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
npx tsx tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts
npx tsx tests/regression/f89-step32-preferred-review-state-contract.test.ts
npx tsx tests/regression/f90-step32-preferred-tradeoff-contract.test.ts
npx tsx tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
```

Expected:
- all PASS

- [ ] **Step 2: Run the nearby V2 ranked-slot anchor tests to confirm no semantic drift**

Run:

```bash
npx tsx tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts
npx tsx tests/regression/f79-step3-v2-prestep34-pending-contract.test.ts
```

Expected:
- PASS
- ranked-slot-first behavior and pre-Step-3.4 pending tracking remain intact

- [ ] **Step 3: Check modified files for IDE diagnostics and fix any local issues**

Check diagnostics for:

- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `components/allocation/step32/Step32PreferredReviewLane.tsx`
- `components/allocation/step32/Step32PreferredReviewDetailPanel.tsx`
- `lib/features/schedule/step32PreferredReviewModel.ts`
- `lib/features/schedule/step32PreferredReviewCopy.ts`
- `lib/features/schedule/step3V2ReservationPreview.ts`
- `lib/features/schedule/step3V2CommittedSelections.ts`
- `lib/algorithms/floatingPcaShared/contracts.ts`
- `lib/algorithms/floatingPcaV2/allocator.ts`
- `lib/algorithms/floatingPcaV2/effectivePreferences.ts`

Expected:
- no new local diagnostics in modified files

- [ ] **Step 4: Update spec wording only if final field names differ**

If final code names differ from the spec but semantics match, make the smallest spec wording adjustment. Do not broaden scope.

Example:

```md
- `committable_with_tradeoff`
+ `allowed_with_tradeoff`
```

- [ ] **Step 5: Commit**

```bash
git add components/allocation/FloatingPCAConfigDialogV2.tsx components/allocation/step32/Step32PreferredReviewLane.tsx components/allocation/step32/Step32PreferredReviewDetailPanel.tsx lib/features/schedule/step32PreferredReviewModel.ts lib/features/schedule/step32PreferredReviewCopy.ts lib/features/schedule/step3V2ReservationPreview.ts lib/features/schedule/step3V2CommittedSelections.ts lib/algorithms/floatingPcaShared/contracts.ts lib/algorithms/floatingPcaV2/allocator.ts lib/algorithms/floatingPcaV2/effectivePreferences.ts tests/regression/f65-step32-ranked-slot-exception-preview.test.ts tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts tests/regression/f89-step32-preferred-review-state-contract.test.ts tests/regression/f90-step32-preferred-tradeoff-contract.test.ts tests/regression/f91-step32-reservation-preserves-remaining-preferred-set.test.ts tests/regression/f92-step32-preferred-review-copy-contract.test.ts docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md
git commit -m "feat: implement v2 step32 preferred review flow"
```

## Self-Review

### Spec coverage
- The plan covers the new Step 3.2 preview model, single-lane UI, copy contract, V2-only file boundaries, and the Step 3.4 reservation handoff semantics.
- The plan explicitly preserves the ranked-slot-first rule and adds the continuity trade-off contract from the updated Scenario 3.

### Placeholder scan
- No `TODO`, `TBD`, or "write tests for the above" placeholders remain.
- Every task includes concrete files, code shapes, commands, and expected outputs.

### Type consistency
- The plan consistently uses:
  - `Step32ReviewState`
  - `Step32CommitState`
  - `Step32TradeoffKind`
  - `committedStep3Assignments`
- The public import path `computeStep3V2ReservationPreview` remains stable through a wrapper / re-export.

## Execution Handoff
Plan complete and saved to `docs/superpowers/plans/2026-04-11-v2-step32-preferred-review-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
