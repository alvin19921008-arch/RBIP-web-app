# Floating PCA Ranked Slot Allocation Design

Status: approved design for planning

Date: 2026-04-06

Owner: chat-approved with user

## Summary
This design revises Step 3 floating PCA allocation so teams can rank the slots they care about instead of choosing only one preferred slot. The final allocator becomes slot-first, with pending fulfillment as the top priority, ranked slots as the primary target order, continuity as a secondary optimization, preferred PCA as a helpful but non-authoritative signal, and gym usage reserved for true last resort.

The redesign keeps Step 3.2 as a light manual assist and moves the real ranked-slot fulfillment policy into Step 3.4. The hover diagnostic is expanded so users can see which rank was fulfilled, whether the allocator had to use unranked or duplicate fallback, whether gym was used as last resort, and whether preferred PCA or continuity was honored.

## Current Context
The current implementation stores `preferred_slots` as an array but effectively treats it as a single-slot preference.

Current code shape:
- `components/dashboard/PCAPreferencePanel.tsx` limits preferred slot selection to 1.
- `lib/utils/reservationLogic.ts` Step 3.2 reservation logic only uses `preferred_slots[0]`.
- `lib/utils/floatingPCAHelpers.ts` reduces team slot preference to a single `preferredSlot`.
- `lib/algorithms/pcaAllocationFloating.ts` is still largely structured around Condition A/B/C/D and often keeps filling from the same PCA after securing a single preferred slot.
- `components/allocation/PCABlock.tsx` already exposes assignment-level hover diagnostics and can be extended instead of replaced.

## Goals
- Allow each team to rank only the slots they care about.
- Keep meeting team pending FTE as the first priority whenever any legal path exists.
- Make ranked slot fulfillment more important than matching a particular preferred PCA.
- Preserve continuity when it helps fulfill ranked order, without allowing continuity to skip a higher-ranked slot.
- Prevent bad concentration patterns where multiple different floating PCAs stack onto the same slot while another useful unused slot is still available.
- Keep `avoid gym` behavior strong by default, but allow gym as a true last-resort rescue path.
- Make allocator decisions easier to understand through hover diagnostics and summary copy.

## Non-Goals
- Do not redesign the whole Step 3 wizard flow.
- Do not remove preferred PCA as an input.
- Do not make Step 3.2 the authoritative engine for ranked-slot fulfillment.
- Do not require teams to rank all 4 slots.
- Do not introduce unrelated allocator refactors outside this ranked-slot redesign.

## Approved Product Decisions

### 1. Slot preference model
- `preferred_slots` remains the stored field.
- The field is reinterpreted as an ordered ranked list, highest priority first.
- Teams can rank all 4 slots or only the slots they care about.
- Any unranked slot belongs to a lower-priority `unranked` bucket.

Examples:
- `1 > 3 > 4` means slot `2` is unranked.
- `1 > 3` means slots `2` and `4` are unranked.
- `[]` means the team has no slot ranking.

### 2. Pending fulfillment priority
- The allocator should meet the team's pending FTE whenever any legal path exists.
- Ranked-slot failure must not by itself justify leaving pending unmet.
- The allocator may progress from ranked to unranked to duplicate to gym-last-resort in order to meet pending.

### 3. Ranked slots over preferred PCA
- Ranked slot order is more important than preferred PCA.
- Preferred PCA remains a secondary preference inside slot fulfillment, not the primary objective.
- The allocator must not skip a higher-ranked slot just because a preferred PCA can satisfy a lower-ranked slot.

### 4. Continuity policy
- Same PCA covering multiple different useful slots is preferred.
- Continuity is beneficial only inside the ranked-slot-first decision ladder.
- Continuity must never cause the allocator to skip a higher-ranked slot.

### 5. Duplicate-slot policy
- Duplicate floating coverage onto the same team slot is allowed only after all useful unused slots have been exhausted.
- Once duplication becomes unavoidable, the allocator should return to ranked order and duplicate ranked slots first.
- Non-gym duplicates are preferred before gym duplicates.

### 6. Gym policy
- If `avoid gym` is enabled, the allocator should avoid the gym slot during ranked, unranked, and duplicate fallback whenever another legal path exists.
- Gym may be used only when it is truly the final remaining legal path to satisfy pending FTE.

## Recommended Architecture

### Recommended approach: Option A
Keep Step 3.2 as a light optional/manual assist and make Step 3.4 the authoritative ranked-slot fulfillment engine.

Rationale:
- Step 3.2 is currently modeled around `preferred PCA + one preferred slot`, so expanding it into the main ranked-slot engine would require a much larger UI and reservation rewrite.
- The real distribution, concentration, and fallback logic belongs in Step 3.4 because Step 3.4 already sees pending FTE, existing allocations, floor matching, and fallback states.
- This approach keeps the mental model simple:
  - Step 3.2 helps when a clean early match exists.
  - Step 3.4 decides final fulfillment.

## Component Responsibilities

### Dashboard PCA Preferences
File area: `components/dashboard/PCAPreferencePanel.tsx`

Changes:
- Replace `Preferred Slot (1 only)` with ranked slot ordering.
- Let teams rank only the slots they care about.
- Keep preferred PCA ordering as-is.
- Keep gym slot declaration separate.
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
- It should help secure a clean preferred-PCA match for the highest currently feasible ranked slot.
- It should not become the source of truth for the full ranked-slot engine.

Intended behavior:
- If the team's top-ranked slot can be reserved through preferred PCA, Step 3.2 can surface that.
- If not, Step 3.2 should not overcomplicate the UI by trying to solve the full ranked-slot problem.
- Step 3.4 remains authoritative.

### Step 3.4
File area: `lib/algorithms/pcaAllocationFloating.ts`

Revised role:
- Slot-first ranked fulfillment engine.
- Authoritative allocator for ranked, unranked, duplicate, and gym-last-resort fallback.

## Step 3.4 Decision Ladder
For each team, the allocator should apply the following ladder:

1. Meet the team's pending FTE if any legal path exists.
2. Try unused ranked non-gym slots in exact ranked order.
3. If pending remains, try unused unranked non-gym slots.
4. If pending still remains and no useful unused non-gym slot remains, allow duplicate non-gym slots, again using ranked order first.
5. If pending still remains and no non-gym path exists, allow gym only as true last resort.

This ladder is team-first and slot-first.

## PCA Selection Ladder Inside Each Slot Step
Once the allocator is trying to satisfy the current highest-priority slot target, PCA selection should follow this cascade:

1. Prefer a PCA that can satisfy the current slot and also continue into the next still-needed higher-priority slot.
2. Within that group, prefer preferred PCA if one is available.
3. If no preferred PCA works, prefer floor PCA.
4. If no floor PCA works, use non-floor PCA.

Important constraint:
- Continuity helps only after the current highest-priority slot is respected.
- A PCA that can cover rank `#2` and `#3` must not outrank the PCA needed to satisfy rank `#1`.

## Distribution Rules

### Good outcomes
- Same PCA covers multiple different useful slots.
- Different PCAs cover different useful slots.

### Outcome to avoid
- Multiple different floating PCAs stack on the same slot while another useful unused slot remains available.

Example:
- Team needs `0.5` FTE (`2` floating slots).
- Useful slots available are `2` and `3`.

Preferred order:
1. Same PCA covers `2 + 3`.
2. PCA A covers `2`, PCA B covers `3`.
3. Avoid PCA A and PCA B both stacking on `2` while `3` is still free.

## Partial Ranking Semantics
- Ranked slots are a strict ordered list.
- Unranked slots form a lower-priority bucket.
- The allocator must exhaust ranked-unused and then unranked-unused before allowing duplicate floating coverage.
- Once duplication becomes necessary, ranked order becomes active again.

This means unranked slots are permitted, but only after ranked-unused opportunities have been evaluated.

## Slot-First Lookahead Model
The most stable Step 3.4 structure for this design is a slot-target loop with lookahead continuity.

Recommended internal flow:
1. Determine the next slot target for the team from the slot ladder.
2. Build candidate PCAs who can satisfy that slot.
3. Score or order those candidates by:
   - can continue into the next still-needed higher-priority slot
   - preferred PCA
   - floor PCA
   - non-floor PCA
4. Assign one slot, or one PCA across multiple different useful slots when that continues to respect rank order.
5. Repeat until pending is met or no legal path remains.

This should replace the existing mental model of a single `preferredSlot` plus PCA-centric continuation.

## Diagnostics Design

### Team-level summary
The hover summary should answer:
- Was pending met?
- What was the highest ranked slot fulfilled?
- Did the allocator use an unranked slot?
- Did the allocator use duplicate floating coverage?
- Did it use gym as last resort?
- Was preferred PCA used?

Suggested summary fields:
- `Pending met: Yes / No`
- `Highest ranked slot fulfilled: #1 / #2 / None`
- `Used unranked slot: Yes / No`
- `Used duplicate floating slot: Yes / No`
- `Gym used: No / Last resort`
- `Preferred PCA used: Yes / No`

Suggested summary copy:
- `Pending met. Highest ranked fulfilled: #2.`
- `Pending met using unranked non-gym slot.`
- `Pending met with ranked duplicate after unused slots exhausted.`
- `Pending met with gym as last resort.`
- `Pending not fully met; no legal slot path remained.`

### Per-assignment explanation
Each assignment line should communicate:
- the slot and, if applicable, its fulfilled rank
- whether it came from ranked-unused, unranked-unused, ranked-duplicate, or gym-last-resort fallback
- which PCA tier was used
- whether continuity was used

Suggested assignment copy:
- `slot 1 (rank #1, preferred PCA)`
- `slot 3 (rank #2, same-PCA continuity)`
- `slot 2 (unranked, floor PCA fallback)`
- `slot 1 (rank #1 duplicate, non-gym fallback)`
- `slot 4 (gym last resort to meet pending)`

### Recommended tracker additions
The hover can remain literal and easy to read if the tracker records explicit reasons.

Recommended new assignment/tracker fields:
- `fulfilledSlotRank?: number | null`
- `slotSelectionPhase?: 'ranked-unused' | 'unranked-unused' | 'ranked-duplicate' | 'gym-last-resort'`
- `pcaSelectionTier?: 'preferred' | 'floor' | 'non-floor'`
- `usedContinuity?: boolean`
- `duplicateSlot?: boolean`

## Scenario Table

| Scenario | Team input | Expected result | Why |
| --- | --- | --- | --- |
| 1. Simple preferred hit | Need `0.25`; ranked `1 > 3`; preferred PCA available on `1` | Assign preferred PCA to `1` | Highest ranked slot first; preferred PCA can satisfy it directly |
| 2. Same PCA continuity across ranked slots | Need `0.5`; ranked `2 > 3`; same PCA available on both `2` and `3` | Same PCA gets `2 + 3` | Ranked slots first, and continuity across different useful slots is best outcome |
| 3. Rank #1 forces non-preferred PCA | Need `0.5`; ranked `1 > 3`; preferred PCAs cannot cover `1`; floor PCA can cover `1 + 3` | Floor PCA gets `1 + 3` | Rank #1 outranks preferred-PCA wish; continuity then helps finish rank #2 |
| 4. Rank #1 first, preferred PCA second | Need `0.5`; ranked `1 > 3`; floor PCA can cover only `1`; preferred PCA available on `3` | Floor PCA gets `1`, preferred PCA gets `3` | Must solve rank #1 first; then preferred PCA helps on next ranked slot |
| 5. Ranked exhausted, use unranked | Need `0.5`; ranked only `1`; `1` is assigned, `3` is free, no other ranked slot exists | Use `1`, then unused unranked non-gym `3` | Pending must be met; unused unranked slot beats duplication |
| 6. Avoid duplicate while unused slot exists | Need `0.5`; ranked `2 > 3`; PCA A can do `2`, PCA B can do `2` and `3` | End state should cover `2` and `3`, not `2 + 2` | Multiple PCAs must spread across useful unused slots before stacking |
| 7. Duplicate becomes unavoidable | Need `0.5`; ranked `1 > 3 > 2`; all useful unused non-gym slots exhausted except already-covered ranked slots | Duplicate non-gym starts at `1`, then `3`, then `2` if needed | Once duplication is unavoidable, return to ranked order exactly |
| 8. Gym only as final rescue | Need `0.25`; ranked `1 > 3`; all non-gym paths impossible; gym slot `4` exists and `avoid gym` is on | Use `4` only if it is the only remaining path to meet pending | Gym remains blocked until true last resort |
| 9. Partial ranking only | Need `0.5`; ranked `1 > 3`; slots `2` and `4` unranked | Try `1`, then `3`, then unused unranked non-gym before any duplicate | Unranked slots are a lower-priority bucket, not forbidden |
| 10. No ranked slots configured | Need `0.5`; no ranked slots; gym avoided | Use unused non-gym slots with continuity and PCA cascade | Normal fallback behavior without slot preference |

## Error Handling and Edge Cases
- If no ranked slots are configured, Step 3.4 should behave like a no-slot-preference team and still honor gym avoidance and floor/PCA cascades.
- If a ranked slot is the gym slot and `avoid gym` is enabled, the slot remains visible in the user's ranking but is treated as blocked until last resort.
- If pending cannot be fully met after ranked-unused, unranked-unused, duplicate non-gym, and gym-last-resort checks, diagnostics should explicitly say no legal path remained.
- Step 3.2 must not consume more team pending than remains after earlier selections.
- Step 3.4 must not allow duplicate-slot stacking before unused useful slots are exhausted.

## Testing Guidance
This design should be implemented with focused regression coverage around:
- partial ranked-slot inputs
- rank-first over preferred-PCA conflicts
- same-PCA continuity across different slots
- different-PCAs across different slots
- duplicate-slot prevention while unused slots exist
- duplicate ranked-order fallback once duplicates become necessary
- gym-last-resort rescue behavior
- hover/tracker reason fields for ranked, unranked, duplicate, and gym cases

Recommended test layers:
- unit tests for slot-bucket construction and candidate ordering
- regression tests for the scenario table above
- one focused UI test for ranked-slot preference entry and hover wording

## Primary Files / Areas
- `components/dashboard/PCAPreferencePanel.tsx`
- `lib/utils/reservationLogic.ts`
- `lib/utils/floatingPCAHelpers.ts`
- `lib/algorithms/pcaAllocationFloating.ts`
- `components/allocation/PCABlock.tsx`
- relevant Step 3 tests in `tests/regression`

## Implementation Notes
- This document is design-only and does not prescribe a DB migration.
- The preferred path is to reuse `preferred_slots: number[]` and change its semantics.
- The implementation should favor explicit tracker metadata over reconstructing hover reasons from allocator side effects.
- The implementation should favor a slot-target loop with lookahead continuity over continuing to expand the single-`preferredSlot` condition model.
