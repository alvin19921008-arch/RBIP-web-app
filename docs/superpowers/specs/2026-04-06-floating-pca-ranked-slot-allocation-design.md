# Floating PCA Ranked Slot Allocation Design

Status: approved design for planning, revised after 2026-04-09 investigation

Date: 2026-04-06

Revised: 2026-04-09

Semantics addendum: 2026-04-10 (duplicate-floating narrowing and floating-eligible terminology)

Implementation notes: 2026-04-10 (wizard preview/save path + `executeSlotAssignments` executed list)

Owner: chat-approved with user

## Summary
This design revises Step 3 floating PCA allocation so teams can rank the slots they care about instead of choosing only one preferred slot. The original V2 idea was a slot-first greedy allocator. After investigation on 2026-04-09, the approved design is now more specific:

- Step 3.4 V2 remains ranked-slot-aware.
- The first pass should still feel like a human editor: team-order driven, continuity-friendly, and willing to keep using the same PCA when that remains locally useful.
- A bounded audit-and-repair pass is added after the first draft allocation so the allocator can fix globally bad outcomes for ranked coverage, duplicate floating coverage, and over-splitting across many PCAs.

This revised design intentionally blends:

- V2's ranked-slot purpose
- V1's stronger continuity and PCA-choice instincts
- a new deterministic post-pass review that mimics how a human editor would audit and swap assignments on the Excel sheet

Important follow-up:

- the 2026-04-10 standalone spec `docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md` is now the authoritative contract for:
  - narrowing duplicate-floating to true Step 3-owned floating-on-floating stacking
  - distinguishing upstream-covered slots from true duplicate-floating
  - replacing ambiguous `useful` wording with floating-specific terminology in new V2 code/comments/spec text
  - keeping V2 engine, repair audit, preview, tracker, and tooltip aligned on duplicate semantics

## Why This Revision Exists
The investigation established three real issues in the earlier V2 behavior:

### Problem B: ranked-slot loss from caller contract
The ranked wizard path could call V2 with `preferenceSelectionMode: 'selected_only'`, which rebuilt preferences while erasing `preferred_slots`. That meant the ranked allocator sometimes ran without any ranked slots at all.

### Problem C: continuity became too weak
The previous V2 structure re-ran target selection after every `0.25` slot. Continuity existed only as a soft candidate tiebreaker, so V2 split one team's pending across multiple PCAs more often than V1.

### Problem A: duplicates lacked global protection
The previous V2 allowed duplicate fallback too locally. Even when local duplication was legal, the engine did not adequately protect:

- other teams' still-unfilled ranked slots
- other teams' first non-duplicate floating-eligible slot
- PCAs that were globally valuable for another team's preferred or ranked path

The revised design below supersedes the earlier purely greedy interpretation.

## Goals
- Allow each team to rank only the slots they care about.
- Keep ranked-slot fulfillment as the defining purpose of V2.
- Keep meeting pending FTE high priority whenever any legal path exists, but not through globally poor concentration or starvation outcomes.
- Preserve continuity when it remains locally useful and does not needlessly harm global quality.
- Prevent bad concentration patterns where multiple floating PCAs stack onto the same slot while the schedule still has better global options.
- Keep `avoid gym` behavior strong by default, but allow gym as a true last-resort rescue path.
- Make allocator decisions easier to understand through tracker metadata and hover copy.
- Keep the final algorithm deterministic and harness-testable.

## Non-Goals
- Do not redesign the whole Step 3 wizard flow.
- Do not remove preferred PCA as an input.
- Do not make Step 3.2 the authoritative engine for ranked-slot fulfillment.
- Do not require teams to rank all 4 slots.
- Do not build a full combinatorial optimizer for the entire schedule.
- Do not introduce an unconstrained repair pass that freely rewrites the whole schedule.

## Approved Objective Order
When trade-offs exist, the approved schedule-level objective order is:

1. Protect higher-ranked slot coverage first.
2. Improve pending fulfillment, but with a fairness floor:
   - do not over-serve one team while another pending team is left without any non-duplicate floating-eligible slot if a bounded repair can improve that
   - redistribution may happen, but it must stay bounded and must not recklessly strip a team that is already reasonably served
3. Prefer continuity from the same PCA.
4. Minimize duplicate floating coverage.

This objective order applies most strongly in the post-pass audit/repair stage.

## Approved Product Decisions

### 1. Slot preference model
- `preferred_slots` remains the stored field.
- The field is interpreted as an ordered ranked list, highest priority first.
- Teams can rank all 4 slots or only the slots they care about.
- Unranked non-gym slots form a lower-priority bucket.

Examples:
- `1 > 3 > 4` means slot `2` is unranked.
- `1 > 3` means slots `2` and `4` are unranked.
- `[]` means the team has no ranked slot preference.

### 2. First-pass philosophy
The first pass should mimic how a human editor usually allocates on the spreadsheet:

- team-order driven, not strict round-robin
- continuity-friendly once a good PCA/team pairing has started
- still ranked-slot aware
- still gym-avoidant

The first pass is intentionally allowed to be locally greedy. It is not required to solve every global trade-off immediately, because the audit-and-repair pass will review the draft allocation afterward.

### 3. First-pass slot ladder
For the team currently being processed, the first pass should use this local slot ladder:

1. ranked-unused non-gym
2. unranked-unused non-gym
3. duplicate non-gym only when no non-duplicate floating-eligible non-gym slot remains for that team
4. gym only as true last resort

Important clarification:
- The first pass is not "any floating-eligible slot first across all teams."
- V2 must still preserve ranked-slot priority within the team currently being processed.
- The audit stage, not the first pass, is where global correction happens.

Semantics clarification:

- `ranked-unused` and `unranked-unused` describe the Step 3 floating path, not raw sheet occupancy
- upstream Step 2 non-floating / special-program / substitution-like coverage does not, by itself, make a slot duplicate-floating

### 4. PCA choice ladder inside the first pass
Inside the active slot step, PCA choice should remain similar to V1's stronger PCA instincts:

1. Prefer a PCA that can satisfy the current slot and continue into another still-floating-eligible slot.
2. Within that group, prefer preferred PCA.
3. If no preferred PCA works, prefer floor PCA.
4. If no floor PCA works, use non-floor PCA.

Continuity may happen immediately during the first pass. It does not need to wait for every other team to receive one slot first.

This is deliberate: continuity belongs in the human-like draft allocation, while global correction belongs in the audit stage.

### 5. Duplicate-slot policy
Duplicate floating coverage is not forbidden, but it is a true fallback:

- local duplicate fallback becomes legal only after the active team has no non-duplicate floating-eligible non-gym slot left
- when duplication is locally unavoidable, duplicate ranked slots first
- if ranked duplicates are exhausted, duplicate unranked non-gym slots
- gym duplicates are last resort of last resort

However, duplicate assignments remain provisional until the audit pass finishes. A duplicate that was locally legal in the first pass may still be removed or reassigned later.

Critical semantics clarification:

- duplicate-floating is a floating-only concept
- duplicate-floating exists only when a true Step 3-owned floating assignment is already on a team + slot and another true Step 3-owned floating assignment is added to that same team + slot
- upstream Step 2 coverage alone must not be treated as duplicate-floating

### 6. Global protection rules for audit
Before the final result is accepted, the audit stage must check whether a locally legal assignment is globally poor.

The audit must specifically look for:

- a duplicate using a PCA that is still valuable for another team's ranked or preferred path
- a team left with no non-duplicate floating-eligible slot while another team has extra concentration
- a higher-ranked slot that could be recovered by bounded reassignment
- one team unnecessarily split across multiple PCAs when a bounded repair could collapse that into fewer PCAs

### 7. Fairness floor
The agreed fairness floor is:

- before the final result is accepted, every pending team should get at least one non-duplicate floating-eligible slot if legally possible after bounded repair
- ranked floating-eligible slot wins first; otherwise use an unranked non-gym floating-eligible slot

This fairness floor belongs primarily to the audit-and-repair stage, not as a hard rule that blocks all early continuity in the first pass.

### 8. Preference contract for ranked V2 callers
The ranked V2 engine must preserve the team's ranked slots even when Step 3.2 or Step 3.3 produced manual selections.

Approved rule:
- manual selections may narrow or bias preferred PCA choice
- manual selections must not erase the base `preferred_slots` ranking

This fixes the earlier `selected_only` contract failure.

### 9. Gym policy
- If `avoid gym` is enabled, the allocator should avoid the gym slot during ranked, unranked, and duplicate fallback whenever another legal path exists.
- Gym may be used only when it is truly the final remaining legal path to satisfy pending FTE.

### 10. Extra coverage policy
`extraCoverageMode` is not part of the core ranked-slot fulfillment quality model for A-C.

Approved interpretation:
- core Step 3 V2 fulfillment should be evaluated with `extraCoverageMode: 'none'`
- if any extra-coverage mode is retained for diagnostics or experiments, it must be treated as a separate post-core augmentation
- extra coverage must not be allowed to hide or redefine the quality metrics for A-C

## Recommended Architecture

### Recommended approach: continuity-first draft + bounded repair
Keep Step 3.2 as a light optional/manual assist and make Step 3.4 the authoritative ranked-slot fulfillment engine, but split Step 3.4 internally into two stages:

1. continuity-friendly first pass
2. bounded audit-and-repair pass

Rationale:
- Step 3.2 is still too small and UI-oriented to carry the full ranked-slot algorithm.
- The original all-in-one V2 greedy loop proved too local for A-C.
- A bounded repair stage better matches how a human editor allocates first, then reviews the full sheet and swaps assignments for a better global outcome.

### Recommended internal units
The implementation should prefer smaller focused helpers instead of continuing to grow one large V2 function:

- preference contract / effective preferences
- first-pass target + PCA ordering
- audit defect detection
- repair move generation and application
- schedule score comparison / acceptance logic

The canonical external allocator name remains `allocateFloatingPCA_v2RankedSlot`.

## Component Responsibilities

### Dashboard PCA Preferences
File area: `components/dashboard/PCAPreferencePanel.tsx`

Changes:
- Keep ranked slot ordering as the data model.
- Keep preferred PCA ordering as-is.
- Keep gym declaration separate.
- If `avoid gym` is on, the gym slot remains visible to the user but is treated by the allocator as blocked until true last resort.

Recommended UI language:
- Section title: `Ranked Slots`
- Help copy: `Allocator tries these first, in order. Rank only the slots you care about.`
- When `avoid gym` is enabled and the gym slot is ranked:
  - `Gym-ranked slots stay avoided unless no other valid path remains.`

### Step 3.2
File area: `lib/utils/reservationLogic.ts`

Revised role:
- Step 3.2 remains a light manual aid.
- It may secure a clean preferred-PCA match for a currently feasible ranked slot.
- It must not become the source of truth for final ranked-slot fulfillment.
- Step 3.2 selections may bias preferred PCA handling, but must not wipe ranked-slot order for Step 3.4.

### Step 3 V2 wizard (preview / save)
File areas: `components/allocation/FloatingPCAConfigDialogV2.tsx`, `lib/features/schedule/step3V2CommittedSelections.ts`

When the user commits Step 3.2 and/or Step 3.3 choices, those selections are **executed** into pending FTE and floating PCA allocations (same mechanism as `executeSlotAssignments` elsewhere) **before** Step 3.4 ranked V2 runs. Step 3.4 then sees real slot occupancy and pending, not only PCA-bias metadata. Tracker rows for executed Step 3.2/3.3 assignments use `assignedIn: 'step32' | 'step33'` so the Step 3.4 review UI and saved `allocationTracker` stay consistent with persisted `result.allocations`.

`executeSlotAssignments` reports **`executedAssignments`** so callers only log tracker rows for assignments that actually applied (e.g. pending exhausted or slot unavailable).

### Step 3.4
Primary file area: `lib/algorithms/pcaAllocationFloating.ts`

Revised role:
- authoritative ranked-slot fulfillment engine
- continuity-friendly draft allocator
- bounded global audit/repair stage

## Step 3.4 Stage 1: continuity-friendly draft
For the active team, the draft allocator should:

1. Try ranked-unused non-gym slots in exact ranked order.
2. If no ranked-unused slot is currently usable, try unranked-unused non-gym slots.
3. Once a PCA has been chosen, allow immediate continuity when it stays within the active team's slot ladder and remains floating-eligible.
4. Only allow duplicate non-gym after the active team has no non-duplicate floating-eligible non-gym slot left.
5. Only allow gym when no non-gym legal path remains.

This stage is intentionally not a full global optimizer.

## Step 3.4 Stage 2: bounded audit-and-repair
After the draft allocation is complete, the allocator must audit the whole schedule and try small deterministic repairs.

### Defects the audit must detect
- `B1`: a higher-ranked slot is still unfilled even though a bounded reassignment can fill it
- `A1`: a team has true duplicate-floating coverage while another pending team still lacks a non-duplicate floating-eligible slot
- `A2`: a duplicate or continuity assignment consumed a PCA that is still globally valuable for another team's ranked or preferred path
- `C1`: one team is split across more PCAs than necessary even though a bounded repair can preserve or improve overall quality
- `F1`: fairness-floor violation, where a pending team is left without any non-duplicate floating-eligible slot despite a feasible repair

Clarification:

- `A1` and the duplicate branch of `A2` must use the narrow true duplicate-floating definition from the 2026-04-10 semantics spec
- upstream Step 2 occupancy alone must not create duplicate-floating defects

### Allowed repair moves
The repair pass must stay small and deterministic. Approved move shapes:

1. move one assigned slot from one team to another
2. swap one assigned slot between two teams
3. collapse a team's multi-PCA fulfillment into fewer PCAs when quality is not worsened
4. replace a duplicate slot with a non-duplicate slot when the schedule score improves

The repair pass must not perform unconstrained whole-schedule rewrites.

### Repair acceptance rule
Each candidate repair should be scored lexicographically. A repair is accepted only if it is strictly better on the approved priority order:

1. ranked-slot coverage
2. fairness floor
3. fulfilled pending
4. duplicate reduction
5. split reduction

Implementation note:
- The implementation may use a concrete score vector.
- The repair pass must remain deterministic.
- The repair pass must be bounded by explicit limits on move size and iteration count.

### Bounded redistribution rule
Redistribution is allowed, but must stay conservative:

- do not freely strip a well-served team just to chase a tiny optimization elsewhere
- one-slot redistribution is acceptable when it clearly improves ranked coverage or fairness
- the repair pass must not create large swings such as taking multiple slots away from one team just to rescue another

This reflects the user's stated Excel editing pattern.

## PCA Selection Ladder Inside Each Slot Step
Once the allocator is trying to satisfy the current highest-priority slot target, PCA selection should follow this cascade:

1. Prefer a PCA that can satisfy the current slot and continue into another still-floating-eligible slot.
2. Within that group, prefer preferred PCA.
3. If no preferred PCA works, prefer floor PCA.
4. If no floor PCA works, use non-floor PCA.

Important constraint:
- Ranked-slot order still outranks continuity.
- A PCA that can cover rank `#2` and `#3` must not outrank the only PCA that can cover rank `#1`.

## Partial Ranking Semantics
- Ranked slots are a strict ordered list.
- Unranked slots form a lower-priority non-gym bucket.
- The draft allocator must exhaust ranked-unused and then unranked-unused before allowing local duplicate fallback.
- Once duplication becomes necessary, duplicate ranked order becomes active again.

Follow-up terminology note:

- this document originally used `useful` as shorthand
- for newer V2 code/comments/specs, prefer the more explicit term `floating-eligible`

## Diagnostics Design

### Team-level summary
The hover summary should answer:
- Was pending met?
- What was the highest ranked slot fulfilled?
- Did the allocator use an unranked slot?
- Did the allocator use duplicate floating coverage?
- Did it use gym as last resort?
- Was preferred PCA used?
- Did audit/repair change the first draft?

Suggested summary fields:
- `Pending met: Yes / No`
- `Highest ranked slot fulfilled: #1 / #2 / None`
- `Used unranked slot: Yes / No`
- `Used duplicate floating slot: Yes / No`
- `Gym used: No / Last resort`
- `Preferred PCA used: Yes / No`
- `Post-pass repair applied: Yes / No`

Suggested summary copy:
- `Pending met. Highest ranked fulfilled: #2.`
- `Pending met using unranked non-gym slot.`
- `Pending met after post-pass repair improved ranked coverage.`
- `Pending met with ranked duplicate after unused slots exhausted.`
- `Pending met with gym as last resort.`
- `Pending not fully met; no legal slot path remained.`

### Per-assignment explanation
Each assignment line should communicate:
- the slot and, if applicable, its fulfilled rank
- whether it came from ranked-unused, unranked-unused, ranked-duplicate, or gym-last-resort fallback
- which PCA tier was used
- whether continuity was used
- whether audit/repair later moved or replaced it

Suggested assignment copy:
- `slot 1 (rank #1, preferred PCA)`
- `slot 3 (rank #2, same-PCA continuity)`
- `slot 2 (unranked, floor PCA fallback)`
- `slot 1 (rank #1 duplicate, non-gym fallback)`
- `slot 4 (gym last resort to meet pending)`
- `slot 3 reassigned in audit to improve global ranked coverage`

### Recommended tracker additions
The hover can remain literal and easy to read if the tracker records explicit reasons.

Recommended new assignment/tracker fields:
- `fulfilledSlotRank?: number | null`
- `slotSelectionPhase?: 'ranked-unused' | 'unranked-unused' | 'ranked-duplicate' | 'gym-last-resort'`
- `pcaSelectionTier?: 'preferred' | 'floor' | 'non-floor'`
- `usedContinuity?: boolean`
- `duplicateSlot?: boolean`
- `allocationStage?: 'draft' | 'repair' | 'extra-coverage'`
- `repairReason?: 'ranked-coverage' | 'fairness-floor' | 'duplicate-reduction' | 'continuity-reduction' | null`

## Scenario Table

| Scenario | Team input | Expected result | Why |
| --- | --- | --- | --- |
| 1. Simple preferred hit | Need `0.25`; ranked `1 > 3`; preferred PCA available on `1` | Assign preferred PCA to `1` | Highest ranked slot first; preferred PCA can satisfy it directly |
| 2. Same PCA continuity across ranked slots | Need `0.5`; ranked `2 > 3`; same PCA available on both `2` and `3` | Same PCA gets `2 + 3` in the draft pass | Ranked slots first, and continuity across different floating-eligible slots is best human-like outcome |
| 3. Rank #1 forces non-preferred PCA | Need `0.5`; ranked `1 > 3`; preferred PCAs cannot cover `1`; floor PCA can cover `1 + 3` | Floor PCA gets `1 + 3` | Rank #1 outranks preferred-PCA wish; continuity then helps finish rank #2 |
| 4. Rank #1 first, preferred PCA second | Need `0.5`; ranked `1 > 3`; floor PCA can cover only `1`; preferred PCA available on `3` | Floor PCA gets `1`, preferred PCA gets `3` | Must solve rank #1 first; then preferred PCA helps on next ranked slot |
| 5. Ranked exhausted, use unranked | Need `0.5`; ranked only `1`; `1` is assigned, `3` is free, no other ranked slot exists | Use `1`, then unused unranked non-gym `3` | Pending must be met; unused unranked slot beats duplication |
| 6. Local continuity before global repair | Team A can immediately continue with the same PCA; Team B still has a floating-eligible slot available | First pass may let Team A continue | Human editors draft this way; global correction belongs in audit |
| 7. Audit repairs duplicate concentration | Team A draft ended with true duplicate-floating while Team B has no non-duplicate floating-eligible slot | Audit reassigns if a bounded repair exists | Duplicate is fallback only, not automatically final |
| 8. Audit rescues missing higher-ranked slot | Draft meets pending but misses another team's higher-ranked slot | Audit may reassign one slot if the schedule score improves | Ranked coverage has highest global priority |
| 9. Audit reduces over-splitting | Draft uses multiple PCAs for one team even though one PCA could safely cover more of it | Audit collapses to fewer PCAs when schedule quality does not worsen | Continuity is a desired global quality signal |
| 10. Gym only as final rescue | Need `0.25`; ranked `1 > 3`; all non-gym paths impossible; gym slot `4` exists and `avoid gym` is on | Use `4` only if it is the only remaining path to meet pending | Gym remains blocked until true last resort |
| 11. Partial ranking only | Need `0.5`; ranked `1 > 3`; slots `2` and `4` unranked | Try `1`, then `3`, then unused unranked non-gym before any duplicate | Unranked slots are a lower-priority bucket, not forbidden |
| 12. No ranked slots configured | Need `0.5`; no ranked slots; gym avoided | Use unused non-gym slots with continuity and PCA cascade | Normal fallback behavior without slot preference |

## Error Handling and Edge Cases
- If no ranked slots are configured, Step 3.4 should behave like a no-slot-preference team and still honor gym avoidance and floor/PCA cascades.
- If a ranked slot is the gym slot and `avoid gym` is enabled, the slot remains visible in the user's ranking but is treated as blocked until last resort.
- If pending cannot be fully met after ranked-unused, unranked-unused, duplicate non-gym, and gym-last-resort checks, diagnostics should explicitly say no legal path remained.
- Step 3.2 must not consume more team pending than remains after earlier selections.
- Step 3.4 draft must not allow duplicate-slot stacking before non-duplicate floating-eligible slots are exhausted for that team.
- The final accepted result must preserve ranked slots in the effective preference contract.
- The repair stage must stop after bounded deterministic work; no infinite retry loop or unconstrained re-optimization.

## Testing Guidance
This design should be implemented with focused regression coverage around:
- preserving ranked slots when Step 3.2/3.3 manual selections exist
- rank-first over preferred-PCA conflicts
- same-PCA continuity across different slots
- duplicate-slot prevention while non-duplicate floating-eligible or repairable alternatives exist
- bounded repair rescuing higher-ranked slots
- bounded repair reducing duplicates without unacceptable fulfillment loss
- bounded repair reducing over-splitting when safe
- gym-last-resort rescue behavior
- tracker reason fields for draft vs repair decisions
- non-floating / special-program / substitution-like upstream coverage not being misclassified as duplicate-floating
- final V2 preview and V2 tooltip staying aligned on duplicate wording

Recommended test layers:
- unit tests for effective preference construction, target ordering, and repair scoring
- regression tests for the scenario table above
- one focused caller-path test for the ranked Step 3 wizard contract (committed Step 3.2/3.3 → allocations + tracker; see `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts`)

## Primary Files / Areas
- `components/dashboard/PCAPreferencePanel.tsx`
- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `lib/features/schedule/step3V2CommittedSelections.ts`
- `lib/utils/reservationLogic.ts`
- `lib/utils/floatingPCAHelpers.ts`
- `lib/algorithms/pcaAllocationFloating.ts`
- any extracted V2 helper files under `lib/algorithms/`
- relevant Step 3 tests in `tests/regression`

## Implementation Notes
- This document is design-only and does not prescribe a DB migration.
- The preferred path is to reuse `preferred_slots: number[]` and change its semantics.
- The implementation should favor explicit tracker metadata over reconstructing hover reasons from allocator side effects.
- The implementation should favor a continuity-friendly first pass plus bounded repair over a purely greedy one-slot loop.
- The implementation should preserve the canonical code-facing name `allocateFloatingPCA_v2RankedSlot`.
- The narrower duplicate-floating contract is defined in `docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`.
