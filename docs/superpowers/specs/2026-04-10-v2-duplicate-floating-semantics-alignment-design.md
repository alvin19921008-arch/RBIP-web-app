# V2 Duplicate-Floating Semantics Alignment Design

Status: approved for implementation

Date: 2026-04-10

Owner: chat-approved with user

## Summary
This spec narrows and aligns the meaning of duplicate-floating coverage across the V2 ranked-slot Step 3.4 draft allocator, repair audit, final preview, tracker summary, and V2-specific tracker tooltip.

The current codebase still mixes two different ideas:

- generic team slot occupancy from upstream Step 2 or other earlier coverage
- true duplicate-floating coverage created by Step 3-owned floating fulfillment

That drift causes both engine behavior and user-facing tracking copy to over-report duplicate behavior. This spec fixes that by introducing one shared semantic contract and by replacing ambiguous "useful" wording in code/comments with floating-specific terminology.

This is a standalone semantics spec. The broader V2 ranked-slot design remains in `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`, but that document must also be updated to cross-reference and reflect the locked terminology here.

## Scope

### In scope
- V2 Step 3.4 duplicate-floating semantics
- Step 2 -> Step 3 boundary rules for floating demand and slot interpretation
- V2 draft allocator duplicate detection and slot-ladder wording
- V2 repair audit duplicate detection and fairness wording
- V2 final preview wording for duplicate vs non-duplicate cases
- V2 tracker / tooltip wording and interpretation
- replacing ambiguous "useful" terminology in code comments/spec language with floating-specific language
- regression coverage for engine result + V2-specific tracking alignment

### Out of scope
- V1 tracker or V1 allocator semantics
- redesigning Step 1 or Step 2 algorithms
- changing the persisted external allocator name `allocateFloatingPCA_v2RankedSlot`
- broader UI polish unrelated to duplicate/floating semantics
- database migrations

## Problem Statement
The current V2 implementation still treats broad team slot occupancy as if it were the same as duplicate-floating coverage.

That is too broad for this workflow.

For this product, Step 3 exists to satisfy the team's remaining floating pending after Step 2 has already assigned:

- baseline non-floating PCA coverage
- special-program coverage
- substitution-for-non-floating coverage

Those upstream Step 2 assignments must not by themselves cause Step 3 to conclude that:

- a slot is already duplicate-floating
- a duplicate-floating defect exists
- the tooltip or preview should say duplicate

The canonical failure case is:

- a team already has non-floating or substitution-like coverage on a slot
- Step 3 then adds one floating PCA on that same slot
- the current code can still treat that as duplicate-like because broad occupancy was counted

That is not the approved product meaning.

## Locked Product Decisions

### 1. Duplicate-floating is a floating-only concept
Duplicate-floating must never be inferred solely from generic team slot occupancy.

Approved rule:

- duplicate-floating exists only when a team already has true Step 3-owned floating coverage on a slot and another true Step 3-owned floating assignment is added to that same team + slot

This excludes upstream Step 2-only coverage from duplicate-floating interpretation.

### 2. Step 3 demand is driven by post-Step-2 pending, not generic occupancy
Step 3 floating demand is determined by the team's rounded pending after Step 2 and after any committed Step 3.2 / Step 3.3 selections are applied.

Example:

- team average PCA target = `1.78`
- Step 2 already assigned `1.0` non-floating PCA
- remaining pending = `0.78`
- rounded pending = `0.75`
- Step 3 should treat this as needing `3` floating slots

This floating demand is independent of whether the team's sheet already shows upstream non-floating or special-program coverage on some day slots.

### 3. Replace "useful" as the primary code/comment term
The word `useful` is too vague for this workflow and should not be the primary term for new V2 code comments, helper names, or semantics docs.

Approved terminology for code/comments/spec language:

- `floating-eligible slot`
- `ranked floating-eligible slot`
- `unranked non-gym floating-eligible slot`
- `gym last-resort floating-eligible slot`
- `upstream-covered slot`
- `true duplicate-floating slot`

Clarification:

- this naming change is primarily for semantics, code comments, helper names, and implementation docs
- existing approved short UI copy such as `Ranked unassigned slot` and `Unranked non-gym unassigned slot` may remain where that copy is already locked by the V2 tooltip UI spec
- however, that UI copy must be interpreted as "no Step 3-owned floating assigned yet on this slot path", not as a claim that the raw sheet has no upstream coverage

## Canonical Semantic Contract

### 1. Floating-eligible slot
A floating-eligible slot is a team day slot that Step 3 may use to satisfy remaining floating pending.

This concept is Step 3-specific. It must not be collapsed into a raw "occupied/unoccupied" sheet interpretation.

Each floating-eligible slot belongs to one of these path classes:

- ranked floating-eligible slot
- unranked non-gym floating-eligible slot
- gym last-resort floating-eligible slot

### 2. Ranked floating-eligible slot
A ranked floating-eligible slot is a slot listed in the team's ranked `preferred_slots` order and not currently being treated as a true duplicate-floating slot for Step 3.

Important clarification:

- upstream Step 2 coverage on a ranked slot does not remove its ranked floating-eligible status
- the slot remains part of the team's Step 3 slot ladder until a true Step 3-owned floating assignment occupies it

### 3. Unranked non-gym floating-eligible slot
An unranked non-gym floating-eligible slot is any non-gym slot for the team that is not in the ranked list and is still available as a Step 3 slot path.

### 4. Gym last-resort floating-eligible slot
If `avoid gym` is enabled, the gym slot remains in the team's day structure but must stay blocked until no non-gym floating-eligible path remains.

### 5. Upstream-covered slot
An upstream-covered slot is a slot whose current coverage exists because of Step 2 or other pre-Step-3 obligations.

For this spec, upstream-covered includes:

- non-floating PCA coverage from Step 2
- special-program slot coverage, whether provided by non-floating or floating PCA in Step 2
- floating substitution-for-non-floating coverage
- any other Step 2-only coverage that does not belong to Step 3 floating fulfillment

Approved rule:

- upstream-covered is not the same as true floating coverage for Step 3 duplicate semantics
- upstream-covered slots remain eligible Step 3 slot paths unless another true Step 3 floating assignment already occupies that same team + slot

### 6. True Step 3-owned floating coverage
True Step 3-owned floating coverage means a floating assignment that belongs to Step 3's own fulfillment path.

This includes:

- Step 3.0 buffer/manual floating assignments
- committed Step 3.2 floating assignments
- committed Step 3.3 floating assignments
- Step 3.4 draft assignments
- Step 3.4 repair assignments
- Step 3.4 extra-coverage assignments if that mode is enabled

This does not include:

- Step 2 non-floating assignments
- Step 2 special-program coverage, even if the staff member happens to be floating
- Step 2 floating substitution-for-non-floating coverage

### 7. True duplicate-floating slot
A true duplicate-floating slot exists only when:

1. the same team already has one true Step 3-owned floating assignment on a slot
2. another true Step 3-owned floating assignment is also placed on that same team + slot

Examples:

- non-floating on slot 2 + one Step 3 floating on slot 2 -> **not duplicate-floating**
- substitution-covered non-floating on slot 3 + one Step 3 floating on slot 3 -> **not duplicate-floating**
- Step 2 special-program coverage on slot 1 + one Step 3 floating on slot 1 -> **not duplicate-floating**
- Step 3 floating already on slot 4 + another Step 3 floating on slot 4 -> **duplicate-floating**

## Step 2 -> Step 3 Boundary Rules

### 1. Pending is authoritative
The Step 3 allocator must continue to receive real post-Step-2 pending as its demand input.

Approved rule:

- Step 2 determines how much floating work remains
- Step 3 fulfills that floating demand
- Step 3 must not reinterpret Step 2 occupancy as if it already satisfied or blocked Step 3 duplicate semantics

### 2. Upstream coverage must not consume Step 3 duplicate semantics
Step 3 must not treat upstream-covered slots as if they were already duplicate-floating.

This applies both when:

- selecting the draft slot ladder
- deciding whether a team has already used a ranked slot in the Step 3 sense
- deciding whether duplicate fallback has started
- deciding whether repair defects A1 / A2 / F1 exist

### 3. Step 3.2 and Step 3.3 remain part of Step 3 ownership
Committed Step 3.2 and Step 3.3 assignments are executed into real allocations before Step 3.4 runs. Those assignments remain part of Step 3-owned floating coverage and must count toward true duplicate-floating semantics.

## V2 Draft Allocator Rules

### 1. Draft slot ladder terminology
For V2 draft code/comments/spec language, the earlier "useful" wording should be replaced by floating-specific wording.

Approved ladder wording:

1. ranked floating-eligible non-gym slot with no true Step 3 floating yet
2. unranked non-gym floating-eligible slot with no true Step 3 floating yet
3. true duplicate-floating non-gym fallback
4. gym last-resort floating-eligible slot

### 2. Broad occupancy must not trigger duplicate fallback
The draft allocator must not push a team into duplicate fallback merely because the sheet already has Step 2 coverage on that slot.

Approved rule:

- a ranked slot that already has upstream Step 2 coverage but no true Step 3 floating yet still belongs to the non-duplicate part of the Step 3 slot ladder
- the allocator should only treat a slot as duplicate-floating for draft targeting if true Step 3-owned floating coverage already exists on that team + slot

### 3. PCA continuity remains allowed
Continuity remains part of the human-like draft allocator, but continuity does not redefine duplicate semantics.

Approved rule:

- continuing with the same PCA across different floating-eligible slots is continuity
- stacking another Step 3 floating assignment onto a slot already covered by a true Step 3 floating is duplicate-floating
- stacking onto upstream Step 2 coverage is not duplicate-floating merely because the slot is already covered in the sheet

## V2 Repair Audit Rules

### 1. A1 must use true duplicate-floating only
`A1` must no longer be triggered by broad team slot concentration caused only by upstream Step 2 coverage.

Approved rule:

- `A1` exists only when a team has true duplicate-floating concentration and another pending team still lacks a non-duplicate floating-eligible path that bounded repair could rescue

### 2. A2 duplicate branch must use true duplicate-floating only
`A2` currently protects globally valuable PCAs when duplicate or continuity assignments consume them.

Approved rule:

- the duplicate branch of `A2` must use the narrow true duplicate-floating definition
- continuity can still remain an `A2` trigger when a Step 3 continuity decision consumes a globally valuable PCA for another team's ranked or preferred path
- upstream Step 2 coverage alone must not create an `A2` duplicate claim

### 3. F1 fairness wording must become floating-specific
`F1` must stop relying on the vague phrase `useful non-duplicate slot`.

Approved fairness-floor wording:

- before final acceptance, each pending team should get at least one non-duplicate floating-eligible slot if legally possible after bounded repair
- ranked floating-eligible slot wins first
- otherwise use an unranked non-gym floating-eligible slot
- gym remains last resort

### 4. B1 and C1 keep their role
`B1` ranked rescue and `C1` split reduction remain valid audit concepts, but they must not rely on broad duplicate semantics from upstream Step 2 coverage.

## V2 Preview / Tracker / Tooltip Alignment

### 1. Final Step 3.4 preview is the acceptance target for duplicate wording
The Step 3.4 preview should remain the authoritative user-facing interpretation target for duplicate wording. The V2 tooltip must match it.

Approved rule:

- show duplicate wording only when the slot has `>= 2` true Step 3-owned floating assignments for that same team + slot
- otherwise, if the allocator chose a stacked path that is not a true duplicate-floating case, use neutral wording such as `To fulfill pending FTE`

### 2. Upstream-covered + one Step 3 floating is not duplicate wording
When a slot is upstream-covered and Step 3 adds one floating assignment on that slot:

- do not show `Duplicate floating coverage`
- do not show `Ranked duplicate assignment` or equivalent duplicate copy
- use neutral path wording such as `To fulfill pending FTE`

### 3. Tooltip and preview must share one interpretation layer
The V2 tooltip must not invent its own duplicate semantics.

Approved direction:

- preview and tooltip must reuse one shared semantics contract or helper family
- if separate helpers are required for engine-facing data and UI-facing tracker rows, they must still be driven by the same canonical definitions in this spec

### 4. Tracker field semantics review
The current tracker field names such as:

- `slotSelectionPhase: 'ranked-duplicate'`
- `duplicateSlot`
- `usedDuplicateFloatingSlot`

may now be broader than the approved meaning.

Approved implementation direction:

- keep the external allocator name unchanged
- for tracker/internal fields, either:
  - rename them to reflect true duplicate-floating semantics, or
  - keep the field names temporarily but narrow their meaning and update comments/tests so they no longer imply broad occupancy-based duplicates
- do not leave the old broad meaning undocumented

## UI / Copy Direction

### 1. Code/comment language
Use `floating-eligible` instead of `useful` or `clean` in new V2 code comments, spec text, helper comments, and review notes.

Avoid:

- `useful slot`
- `clean slot`
- `non-useful slot`

Prefer:

- `ranked floating-eligible slot`
- `unranked non-gym floating-eligible slot`
- `non-duplicate floating-eligible slot`
- `upstream-covered slot`

### 2. User-facing copy
Do not force the phrase `floating-eligible` into the tooltip or preview if shorter approved copy already exists.

Approved user-facing intent:

- keep compact operational wording in preview and tooltip
- reserve duplicate wording only for true duplicate-floating
- use `To fulfill pending FTE` for non-duplicate stacked cases
- preserve the already approved V2 slot labels from the V2 tooltip UI spec where they still fit this semantics contract

## Recommended File Areas

### Core semantics / engine
- `lib/algorithms/floatingPcaV2/draftAllocation.ts`
- `lib/algorithms/floatingPcaV2/repairAudit.ts`
- `lib/algorithms/floatingPcaV2/repairMoves.ts`
- `lib/utils/floatingPCAHelpers.ts`
- any new extracted helper for V2 floating slot semantics

### Preview / tracker / tooltip
- `components/allocation/step34/step34ViewModel.ts`
- `lib/features/schedule/duplicateFloatingSemantics.ts`
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- `lib/features/schedule/pcaTrackerTooltip.ts`
- `types/schedule.ts`

### Existing boundary / caller paths
- `lib/features/schedule/step3V2CommittedSelections.ts`

## Regression Coverage

### Required scenario families
Implementation must add or update regression coverage for all of the following:

1. **Non-floating + one Step 3 floating on same slot**
   - expected: not duplicate-floating
   - expected preview/tooltip wording: neutral / `To fulfill pending FTE`

2. **Substitution-covered non-floating + one Step 3 floating on same slot**
   - expected: not duplicate-floating
   - expected preview/tooltip wording: neutral / `To fulfill pending FTE`

3. **Step 2 special-program-covered slot + one Step 3 floating on same slot**
   - expected: not duplicate-floating
   - expected engine duplicate audit: no duplicate triggered solely from that case

4. **One Step 3 floating already on slot + second Step 3 floating on same slot**
   - expected: true duplicate-floating
   - expected preview/tooltip wording: duplicate wording is allowed

5. **Repair audit A1 / A2 / F1**
   - expected: these defects key off the narrowed true duplicate-floating contract
   - expected: upstream Step 2-only coverage does not create false duplicate pressure

6. **Preview / tooltip alignment**
   - expected: V2 final preview and V2 tooltip agree on duplicate vs neutral wording for the same tracker state

### Recommended test file updates
- Update `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
  - remove reliance on broad baseline/non-floating same-slot occupancy as duplicate-floating
  - add a case proving upstream-only coverage does not create duplicate defects

- Update `tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts`
  - extend the contract to cover:
    - non-floating upstream coverage
    - substitution-covered upstream coverage
    - special-program upstream coverage
    - true Step 3 floating-on-floating duplication

- Update `tests/regression/f64-step34-tracker-reasons.test.ts`
  - ensure preview wording says duplicate only for true duplicate-floating
  - ensure upstream-covered stacked cases use neutral wording

- Update `tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts`
  - ensure tooltip wording matches the preview semantics for duplicate vs neutral cases

### Recommended new regression files
- Add `tests/regression/f80-step34-v2-true-duplicate-floating-engine-contract.test.ts`
  - focused engine-level contract for draft allocator + repair audit duplicate semantics

- Add `tests/regression/f81-v2-tracker-tooltip-preview-duplicate-alignment.test.ts`
  - focused contract that the final preview and V2 tooltip stay aligned on duplicate wording

## Acceptance Criteria
- Step 3 duplicate detection no longer keys off broad upstream occupancy alone.
- Step 2 non-floating coverage does not by itself create duplicate-floating in V2.
- Step 2 special-program coverage does not by itself create duplicate-floating in V2.
- Step 2 substitution-for-non-floating coverage does not by itself create duplicate-floating in V2.
- Only true Step 3-owned floating-on-floating stacking counts as duplicate-floating.
- V2 draft allocator uses floating-specific semantics rather than the vague `useful` concept.
- V2 repair audit defect logic uses the narrowed duplicate semantics.
- V2 preview and V2 tooltip show duplicate wording only for true duplicate-floating.
- Neutral stacked cases use wording such as `To fulfill pending FTE`.
- Regression coverage proves that final V2 allocator results and V2-specific tracking surfaces agree on the same duplicate contract.

## Implementation Notes
- This spec intentionally narrows semantics without changing the canonical external allocator name.
- Field renames are optional only if compatibility cost is too high; semantic narrowing and documentation are mandatory.
- The preferred implementation direction is to extract shared semantics helpers rather than duplicating engine-side and UI-side duplicate logic.
