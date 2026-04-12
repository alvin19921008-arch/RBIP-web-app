# Floating PCA Ranked Slot Allocation Design

Status: approved design for planning, revised after 2026-04-09 investigation

Date: 2026-04-06

Revised: 2026-04-11

Allocator refinement: 2026-04-12 — bounded **donor donation** repair shape, **gym-aware** lexicographic scoring, **second repair pass** after extra coverage, canonical **`gymUsageStatus`** on tracker summary (see **§ Step 3.4 Stage 2 → Orchestration: repair → extra coverage → repair again** and **§ V2 allocation engine refinement → Extra coverage: V2 handling and interpretation** below, plus **§9 Gym policy** for UI source of truth).

Semantics addendum: 2026-04-10 (duplicate-floating narrowing and floating-eligible terminology)

Engine refinement: upstream provenance, Step 3 ownership, Step 3.4 preview ↔ V2 tooltip alignment, duplicate-floating tracking (see **V2 allocation engine refinement** below)

Implementation notes: 2026-04-10 (wizard preview/save path + `executeSlotAssignments` executed list)

V2 wizard handoff (Step 3.2 / 3.3 → Step 3.4): 2026-04-12 — executed reservations + `committedStep3Assignments` + `preferenceSelectionMode: 'legacy'`; see **V2 business logic log (consolidated)** below. Step 3.2 product/UI spec (review surface, not allocator authority): `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`.

Code layout (V1 / V2 extraction): 2026-04-10 — ranked V2 vs legacy V1 vs shared helpers are split into explicit module paths; see **Code layout: V1 vs V2 extraction** below. Extraction spec/plan: `docs/superpowers/specs/2026-04-10-floating-pca-v1-v2-extraction-design.md`, `docs/superpowers/plans/2026-04-10-floating-pca-v1-v2-extraction-plan.md`.

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

**Implementation (2026-04-12):** The repair pass’s concrete lexicographic score (`buildRankedSlotAllocationScore` / `compareScores` in `lib/algorithms/floatingPcaV2/scoreSchedule.ts`) inserts **`gymLastResortCount`** after fulfilled-pending components and **before** duplicate reduction: prefer schedules with **fewer** uses of the team’s configured gym clock slot when `avoid gym` is on (penalize gym occupancy in the score snapshot, aligned with “gym only as last resort” product pressure). Tie-breaking on duplicates and splits follows as before.

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
- **V2 wizard path (`runStep3V2CommittedSelections` → Step 3.4):** after Step 3.2 / 3.3 assignments are executed into allocations and pending, the ranked V2 allocator is called with **`preferenceSelectionMode: 'legacy'`** and the executed picks passed separately as **`committedStep3Assignments`** on `FloatingPCAAllocationContextV2`. The engine uses **full base `pcaPreferences`** (including the full `preferred_pca_ids` list and `preferred_slots` rank order). Step 3.2 / 3.3 commits are **stateful reservations and provenance**, not a replacement of the team's remaining preferred-PCA identity for the rest of Step 3.4.
- **Explicit selection path:** callers that intentionally want manual PCA ids to drive effective preferences may still use **`preferenceSelectionMode: 'selected_only'`** with **`selectedPreferenceAssignments`**; `buildEffectiveRankedPreferences` may then replace effective `preferred_pca_ids` per team **without** clearing `preferred_slots` (rank order preserved). This path is **distinct** from the V2 wizard Step 3.2 / 3.3 handoff above.
- In all cases, manual selection plumbing must **not** erase the base **`preferred_slots`** ranking.

This fixes the earlier failure mode where the wizard path used `selected_only` in a way that dropped ranked intent or collapsed preferred identity inappropriately.

### 9. Gym policy
- If `avoid gym` is enabled, the allocator should avoid the gym slot during ranked, unranked, and duplicate fallback whenever another legal path exists.
- Gym may be used only when it is truly the final remaining legal path to satisfy pending FTE.

**UI and tracker source of truth (2026-04-12):** Final ranked V2 tracker rows carry `slotSelectionPhase: 'gym-last-resort'` only when the gym path was the true last-resort assignment. **`TeamAllocationLog.summary`** exposes a canonical **`gymUsageStatus?: 'avoided' | 'used-last-resort'`** (`types/schedule.ts`), derived in **`applyRankedSlotStep34TrackerSummaryFields`** (`trackerSummaryDerivations.ts`) from whether **any** assignment has `slotSelectionPhase === 'gym-last-resort'`, with legacy **`gymSlotUsed`** / **`gymUsedAsLastResort`** kept aligned to that final meaning. Step 3.4 preview pills and the V2 PCA tracker tooltip **Status** line must prefer **`gymUsageStatus`** over legacy booleans alone so chip, cards, and tooltip cannot disagree on “gym avoided” vs “gym used only as last resort.”

### 10. Extra coverage policy
`extraCoverageMode` is not part of the core ranked-slot fulfillment quality model for A-C.

Approved interpretation:
- core Step 3 V2 fulfillment should be evaluated with `extraCoverageMode: 'none'`
- if any extra-coverage mode is retained for diagnostics or experiments, it must be treated as a separate post-core augmentation
- extra coverage must not be allowed to hide or redefine the quality metrics for A-C

**V2 refinement (product + diagnostics):** see **§ V2 allocation engine refinement → “Extra coverage: V2 handling and interpretation”** for when the pass runs, tracker labeling, and how extra slots relate to ownership / “assigned vs avg” interpretation.

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
File area: `lib/utils/reservationLogic.ts` (execution); preview / wizard wiring in `lib/features/schedule/` and V2 dialog.

Revised role (business logic only):
- Step 3.2 remains a **non-authoritative** manual aid relative to Step 3.4 ranked V2.
- Committed Step 3.2 floating assignments are **executed** before Step 3.4 (same `executeSlotAssignments` family as other reservations) so pending FTE and slot occupancy match what the allocator sees.
- Executed picks are recorded for tracker / provenance; the Step 3.4 engine must still run ranked draft + bounded repair as the allocator of record.
- **Preference identity:** the V2 wizard must **not** treat Step 3.2 (or 3.3) commits as “the only preferred PCAs left” for that team. Remaining unmet pending in Step 3.4 may still use **other** preferred PCAs from the base preference list when legal. Technical expression: wizard calls ranked V2 with **`preferenceSelectionMode: 'legacy'`** and passes **`committedStep3Assignments`** for provenance / coverage classification, not `selected_only` overloading (see §8 and **V2 business logic log**).

### Step 3 V2 wizard (preview / save)
File areas: `components/allocation/FloatingPCAConfigDialogV2.tsx`, `lib/features/schedule/step3V2CommittedSelections.ts`

When the user commits Step 3.2 and/or Step 3.3 choices, those selections are **executed** into pending FTE and floating PCA allocations (same mechanism as `executeSlotAssignments` elsewhere) **before** Step 3.4 ranked V2 runs. Step 3.4 then sees real slot occupancy and pending, not only PCA-bias metadata. Tracker rows for executed Step 3.2/3.3 assignments use `assignedIn: 'step32' | 'step33'` so the Step 3.4 review UI and saved `allocationTracker` stay consistent with persisted `result.allocations`.

`executeSlotAssignments` reports **`executedAssignments`** so callers only log tracker rows for assignments that actually applied (e.g. pending exhausted or slot unavailable).

**Ranked V2 call contract (wizard):** `allocateFloatingPCA_v2RankedSlot` is invoked with **`preferenceSelectionMode: 'legacy'`** and **`committedStep3Assignments`** set from the executed Step 3.2 / 3.3 rows. The allocator feeds **`committedStep3Assignments`** into **`buildUpstreamCoverageKindByTeamSlot`** as **`excludeStep3OwnedSelections`** so Step 3–owned coverage on a team+slot is classified correctly for **narrow duplicate-floating** and related audit inputs—without rebuilding effective preferences from those commits alone.

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
5. **bounded donor donation (2026-04-12):** transfer **one** true Step 3–owned floating slot on a PCA from a **donor** team to a **requesting** team **without** requiring a fabricated “fallback” assignment on the donor and **without** a two-team swap, when donor-protection rules pass (see below).

The repair pass must not perform unconstrained whole-schedule rewrites.

**Donor donation — intent:** Some ranked-gap (`B1`) or fairness-floor (`F1`) rescues are only feasible if a team that already has **surplus** true Step 3 floating coverage **gives up** a slot on a shared PCA so the requester can take that clock slot. Earlier implementations only considered “open slot,” “move with fallback,” or “swap,” which could miss this shape.

**Donor donation — eligibility and blocking (implementation in `lib/algorithms/floatingPcaV2/repairAudit.ts`):**

- **True Step 3 ownership:** the donor must actually hold the slot as Step 3–added floating (not baseline/upstream-only occupancy); helpers include `donorHasTrueStep3Ownership`, `buildRankedV2RepairAuditState`.
- **Bounded donation gate:** `teamCanDonateBoundedly` requires that the donation does not violate **`donationWouldBreakDonorFairnessFloor`** (donor with meaningful initial pending must keep fairness-floor coverage; donor without meaningful pending must not drop to **zero** true Step 3 floating slots) or **`donationWouldBreakDonorRankCoverage`** (donor with meaningful pending must not lose all true Step 3 presence on non-gym **ranked** preference slots).
- **Duplicate-stack guard:** do not treat “unstacking” a **duplicate** true Step 3 stack on the same clock slot as a donation rescue (multiple Step 3 rows on same team+slot); donation is rejected when true Step 3 slot count on that slot for the donor is **> 1**.

Candidate generation (`lib/algorithms/floatingPcaV2/repairMoves.ts`) emits donation-shaped updates for **`B1`** and **`F1`** alongside existing move/fallback/swap paths; **`canRescueSlotForTeam`** in repair audit treats a safe donation as a valid rescue when ranking whether a missing ranked slot is “recoverable.”

### Repair acceptance rule
Each candidate repair should be scored lexicographically. A repair is accepted only if it is strictly better on the approved priority order:

1. ranked-slot coverage
2. fairness floor
3. fulfilled pending
4. **gym last resort (2026-04-12):** fewer gym-clock-slot uses for `avoid gym` teams (`gymLastResortCount` in the score vector — lower is better)
5. duplicate reduction
6. split reduction

Implementation note:
- The implementation uses a concrete score vector in `scoreSchedule.ts` (`RankedSlotAllocationScore`).
- The repair pass must remain deterministic.
- The repair pass must be bounded by explicit limits on move size and iteration count.

### Orchestration: repair → extra coverage → repair again (2026-04-12)

**Problem:** If optional **extra coverage** runs after the first repair loop and adds Step 3.4 rows, defects detectable on the **final** allocation snapshot can change; freezing the tracker’s `repairAuditDefects` from the pre–extra-coverage audit alone is stale.

**Approved behavior (implemented in `lib/algorithms/floatingPcaV2/allocator.ts`):**

1. Run **`runRepairLoop`** after the **draft** (same bounded defect scan + candidate generation + lexicographic acceptance as today).
2. Run **`applyExtraCoverageRoundRobin`** only when `extraCoverageMode` allows it and every team’s **rounded** pending is already satisfied (unchanged from §10 / extra-coverage section).
3. Run **`runRepairLoop` again** on the post–extra-coverage allocations so audit/repair and **tracker `summary.repairAuditDefects`** reflect the **frozen** schedule before final tracker assembly.

**Note on gating extra coverage vs open `B1`/`F1`:** A blanket “skip all extra coverage while any `B1`/`F1` remains” can prevent extra coverage from running when pending is already met but residual ranked-gap semantics still flag `B1`; the **second repair pass** is the contract that reconciles post-extra mutations. If product later requires stricter ordering, specify a narrower guard (e.g. only when pending not satisfied).

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
- Did it use gym as last resort? (ranked V2: prefer **`summary.gymUsageStatus`** — `'avoided'` vs `'used-last-resort'` — over legacy booleans; see **§9**)
- Was preferred PCA used?
- Did audit/repair change the first draft?

Suggested summary fields:
- `Pending met: Yes / No`
- `Highest ranked slot fulfilled: #1 / #2 / None`
- `Used unranked slot: Yes / No`
- `Used duplicate floating slot: Yes / No`
- `Gym: Avoided / Used only as last resort` (backed by `gymUsageStatus` when present)
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

## V2 allocation engine refinement

This section refines the ranked V2 engine design beyond the original 2026-04-09 scope: **upstream provenance**, **Step 3 ownership**, **alignment between Step 3.4 final preview and the V2-specific tracker tooltip**, a **narrow duplicate-floating** definition for engine, audit, and diagnostics, **extra-coverage handling** (post-core augmentation, labeling, and fulfillment semantics), and **zero-slot-assigned optimization** (noise reduction after allocation).

**Authoritative semantic contract (duplicate-floating, floating-eligible wording, acceptance criteria):**  
`docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`

**Implementation sequencing and guardrails (V2-only provenance at Step 2 → Step 3 handoff; do not change Step 2 business logic or V1 behavior):**  
`docs/superpowers/plans/2026-04-10-v2-duplicate-floating-semantics-alignment-plan.md`

### 1. Upstream metadata provenance

Ranked V2’s `FloatingPCAAllocationContextV2` passes `existingAllocations: PCAAllocation[]` from Step 2 plus committed Step 3.2 / 3.3 work. **Raw slot ownership alone does not encode** whether a team+slot is covered by:

- Step 2 non-floating baseline
- Step 2 special-program assignment
- Step 2 floating substitution-for-non-floating
- Step 3-owned floating (buffer / 3.2 / 3.3 / 3.4)

**Refinement:** introduce a **V2-only provenance layer at or just after the Step 2 → Step 3 handoff** (preferred: `lib/features/schedule/step3V2CommittedSelections.ts` and adjacent V2 helpers) so the draft allocator and repair audit do not infer “duplicate” from generic occupancy. Reconstructing provenance from existing fields (`special_program_ids`, `staffOverrides.substitutionFor*`, floating vs non-floating staff) is allowed where sufficient; **changing Step 2 allocation business rules** to make provenance easier is out of scope for this refinement track.

### 2. Step 3 ownership

**Step 3-owned floating** includes any floating fulfillment that belongs to the Step 3 wizard path:

- Step 3.0 buffer / manual floating assignments
- Committed Step 3.2 and Step 3.3 floating assignments (executed before Step 3.4)
- Step 3.4 draft, repair, and (if enabled) extra-coverage rows

**Upstream-covered** slots remain eligible Step 3 floating targets until a **true Step 3-owned floating** assignment occupies that team+slot. Stacking one Step 3 floating on a slot that only has Step 2 (or substitution-like) coverage is **not** duplicate-floating.

Tracker rows should record enough ownership/provenance (additive fields or equivalent) so summary flags and UI copy are not driven solely by broad `getTeamExistingSlots`-style occupancy.

### 3. Aligning Step 3.4 preview with V2 tracker tooltip

**Refinement:** treat the **final Step 3.4 preview** (`components/allocation/step34/step34ViewModel.ts` and related view-model helpers) as the **canonical user-facing interpretation** for:

- when to show **duplicate-floating** wording vs neutral wording (e.g. `To fulfill pending FTE`)
- exclusion of substitution-like Step 3.4 rows where applicable

The **V2-specific tracker tooltip** must reuse the **same** duplicate interpretation helper or contract as the preview so the two surfaces cannot drift. The tooltip must not invent a second definition of duplicate-floating based only on legacy tracker field names such as `ranked-duplicate` or `duplicateSlot` if those labels still reflect broader internal phases.

### 4. Duplicate-floating: refined definition and tracking

**Refined product meaning:**

- **Duplicate-floating** exists only when the **same team** already has **one true Step 3-owned floating** assignment on a slot and **another** true Step 3-owned floating is placed on that **same team + slot**.
- It is **not** duplicate-floating when the only prior coverage on that slot is upstream Step 2 non-floating, special-program, or substitution-like coverage, and Step 3 adds a single floating assignment there.

**Tracking implications:**

- Repair defects **`A1` / duplicate branch of `A2` / fairness `F1`** should key off this narrow duplicate-floating notion, not raw multi-owner slot counts that mix Step 2 and Step 3.
- Summary fields such as `usedDuplicateFloatingSlot` and per-row flags like `duplicateSlot` / `slotSelectionPhase: 'ranked-duplicate'` should either be **narrowed in meaning** to match the refined definition or **renamed** with migration notes in code/comments—**without** silently keeping the old broad meaning.
- Regression coverage should prove **end-to-end alignment**: ranked V2 allocator result → Step 3.4 preview copy → V2 tooltip model, for both non-duplicate stacked cases and true duplicate-floating cases.

### 5. Extra coverage: V2 handling and interpretation

**Purpose:** After core ranked V2 work is done (draft + bounded repair), optionally add **additional** floating slots when the global pool still allows it and every team’s **rounded** pending is already satisfied. This matches a “sheet looks good, add a little more coverage” editor habit, but it must not be confused with core fulfillment or with Step 2 reserved capacity.

**When it runs (engine contract):**

- Extra coverage is a **separate pass** after core allocation **and** after the **first** bounded repair loop (draft → repair → then extra coverage → **second repair**; see **Step 3.4 Stage 2 → Orchestration: repair → extra coverage → repair again**).
- It must run **only if** `extraCoverageMode` is not `'none'` (e.g. production UI may use `'round-robin-team-order'`).
- It must run **only if** every team has **no remaining rounded pending** (same quarter threshold as core pending checks: effectively “pending met” for all teams before augmentation).
- If any team still has meaningful rounded pending, **do not** run extra coverage; core repair and fulfillment take precedence.

**Post–extra-coverage audit:** After extra coverage mutates allocations, the engine **re-runs** the same bounded repair loop so `repairAuditDefects` on the final tracker matches a fresh `detectRankedV2RepairDefects` pass on the frozen snapshot (regression: `f99`; implementation: `allocator.ts`).

**Tracker and diagnostics (mandatory labeling):**

- Every assignment created in this pass must be identifiable in the tracker as post-core augmentation, e.g.:
  - `allocationStage: 'extra-coverage'`
  - `assignmentTag: 'extra'` where the tracker schema already uses this field
- Product-facing copy, scarcity preview, and “balance vs avg” explanations must be able to **separate**:
  - **core Step 3 floating fulfillment** (meeting rounded pending from the Step 3.4 baseline)
  - **extra-coverage slots** (optional, after all teams satisfied)

**Ownership / fulfillment semantics (Problem E alignment):**

- Extra slots are **true Step 3-owned floating** additions (same notion as other Step 3.4 rows), not Step 2 special-program or substitution buckets.
- Comparing **raw total occupied PCA slots** on the sheet to **`sum(average_pca_per_team)`** without subtracting Step 2 reserved special-program coverage (and without separating extra-coverage rows) will **overstate** apparent “surplus”; UI and diagnostics should use the same ownership split as legacy pending semantics (special-program slots do not reduce Step 3 pending; see `stepReset` / reservation runtime patterns).
- Core quality evaluation (ranked coverage, fairness floor, duplicate reduction, split reduction) remains defined with **`extraCoverageMode: 'none'`** per §10; extra coverage must not change those definitions.

**Algorithm shape (bounded, deterministic):**

- Prefer a **round-robin over `teamOrder`** (or equivalent stable order) adding at most one quarter-slot per team per sweep, repeating only while progress is made and PCAs still have legal capacity and slots.
- Must respect the same **per-PCA capacity**, **availability**, **invalid slot**, and **gym** rules as core assignment unless the product explicitly documents an exception (default: no exception).
- Stop when no team can receive another legal slot in that mode; do not unconstrained-fill the sheet.

**Product defaults (guidance):**

- Step 3.4 **review / harness / regression** that grades core fulfillment should use `extraCoverageMode: 'none'` unless the test explicitly targets extra behavior.
- Wizard production paths may keep extra mode on for operational convenience; if so, UI should label or footnote when totals include optional extra slots so editors are not misled vs Excel-era “rarely more than rounding above avg” expectations.

### 6. Zero-slot-assigned optimization

**Problem:** After Step 3.4 (including repair and optional extra coverage), some **floating** PCA allocation rows may exist with **no team assigned on any of slots 1–4** (and effectively **zero** `slot_assigned` / no meaningful contribution to any team). Those rows add noise to the PCA block UI, payloads, and mental model (“why is this PCA listed with no slots?”).

**Approved refinement:**

- **Normalize the allocator output** (or a single documented boundary immediately after V2 returns) so that **purely empty floating PCA shells** are not retained unless the product explicitly requires a placeholder.
- A row is a candidate for removal or coalescing when **all** of the following hold:
  - the staff member is a **floating** PCA in the active Step 3 pool context;
  - **no** `slot1`..`slot4` is set to any team (all null / empty);
  - the row is **not** required to preserve Step 2 / Step 3.0 semantics (e.g. buffer manual assignment, substitution carrier, or non-floating baseline—**do not** strip non-floating or special-program rows from this rule).
- If removal would break **tracker completeness** for an audit trail, prefer **omitting the row from persisted `pcaAllocations`** while keeping tracker logs internally consistent, or mark such rows as non-displaying—pick one strategy per implementation but keep behavior **deterministic**.

**Non-goals:**

- Do not use this pass to “fix” unmet pending; zero-slot cleanup is **after** fulfillment.
- Do not delete rows that still carry **invalid_slot** display pairing or other fields that the save path requires for round-trip integrity unless a separate migration spec says otherwise.

**Testing:**

- Add or extend regression coverage: V2 result after a scenario that previously left a floating PCA with zero slots should either have no such row or a single explicit documented placeholder policy.

## V2 business logic log (consolidated)

This section is an **implementation-aligned** summary of V2 **business logic** (not Step 3.2 UI). Use it as a single place to see how the ranked engine, wizard prelude, provenance, and preference contracts fit together.

### A. Authority and stages

| Stage | Role |
| --- | --- |
| Step 3.2 / 3.3 (V2 wizard) | Optional **manual reservations**: execute committed floating slot+PCA choices into **pending** and **`existingAllocations`** before Step 3.4. **Not** the ranked-slot allocator of record. |
| Step 3.4 ranked V2 | **Allocator of record** for ranked fulfillment: continuity-friendly **draft** + **bounded audit/repair** + optional **extra coverage** + **second bounded repair** (then final tracker / provenance), exposed as `allocateFloatingPCA_v2RankedSlot`. |

### B. Execution before Step 3.4

- Committed Step 3.2 / 3.3 assignments use the same **`executeSlotAssignments`** execution path as other reservation flows.
- Only **`executedAssignments`** (actually applied rows) should drive tracker logging and downstream state—pending may be exhausted or a slot may be unavailable.
- After execution, Step 3.4 ranked V2 runs against the **updated** allocations and pending, not against hypothetical “preview only” occupancy.

### C. Wizard handoff: `legacy` + `committedStep3Assignments`

For the V2 wizard pipeline (`runStep3V2CommittedSelections` and equivalent):

1. Call ranked V2 with **`preferenceSelectionMode: 'legacy'`** so **`pcaPreferences`** are used as the full base preference record (ranked slots + full preferred PCA list).
2. Pass executed Step 3.2 / 3.3 rows as **`committedStep3Assignments`** on **`FloatingPCAAllocationContextV2`** (team, slot, pcaId, optional source `step32` | `step33`).
3. Inside **`allocateFloatingPCA_v2RankedSlotImpl`**, those rows are supplied to **`buildUpstreamCoverageKindByTeamSlot`** as **`excludeStep3OwnedSelections`** so **narrow duplicate-floating** and upstream vs Step 3–owned classification stay correct when Step 3.4 adds floating rows on top of executed wizard work.

**Intent:** Step 3.2 / 3.3 commits are **hard reservations and provenance**, not a signal to **replace** the team’s remaining **`preferred_pca_ids`** with only the committed PCA for the rest of Step 3.4.

### D. When `selected_only` still applies

- **`preferenceSelectionMode: 'selected_only'`** with **`selectedPreferenceAssignments`** remains a **separate, explicit** contract: **`buildEffectiveRankedPreferences`** may replace effective **`preferred_pca_ids`** per team while **preserving `preferred_slots`**.
- The V2 **wizard** Step 3.2 / 3.3 handoff described in §C should **not** use this mode for the “preserve remaining preferred set” product rule; use it only when a caller deliberately wants selection-driven effective preferences.

### E. Rank order vs continuity vs Step 3.2 review

- **Ranked-slot protection** (earlier ranks before later) remains **above** preferred-PCA wish in the engine objective stack (see **Approved Objective Order** and Scenario 3 in the scenario table).
- **Continuity** (same PCA across slots when helpful) is a strong **draft** instinct and a **repair** quality signal; it is **not** guaranteed when the user deliberately chooses a different outcome in Step 3.2 review—any such choice is a **continuity / staffing-shape trade-off**, not permission to drop rank #1 protection.
- Step 3.2 **preview / review** surfaces (outcome options, trade-off labels) are **transparency** on top of the same contracts; they do not change the ranked V2 engine’s final authority.

### F. Pointer to duplicate-floating and tooltip alignment

- Narrow **duplicate-floating**, **floating-eligible** wording, and preview ↔ tooltip alignment remain defined in **`docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`** and the **V2 allocation engine refinement** section above. The wizard handoff in §C exists so executed Step 3 rows participate in that classification correctly.

## Code layout: V1 vs V2 extraction (2026-04-10)

This section is for **later agents**: where ranked-slot V2 actually lives after the V1/V2 extraction, so edits land in the right boundary and grep results are not misleading.

### Why this exists

Historically, **legacy standard floating** and **ranked V2** lived in one large `pcaAllocationFloating.ts`, and **`allocatePCA()`** still had a separate inline floating phase. That made it easy to “fix V2” while accidentally changing V1 or shared mechanics. The extraction keeps **behavior the same** but makes **ownership obvious from paths**.

### Stable public entrypoints (do not rename)

Consumers should keep using:

- **`allocateFloatingPCA_v1LegacyPreference`** — legacy-facing Step 3.4 standard/balanced allocator (historically confused with internal `allocateFloatingPCA_v2`).
- **`allocateFloatingPCA_v2RankedSlot`** — ranked-slot Step 3.4 engine (draft + bounded repair + final tracker assembly).

Both are re-exported from **`lib/algorithms/pcaAllocation.ts`**. Do **not** reintroduce ambiguous exports such as `allocateFloatingPCA_v2` on the canonical module surface.

### Where to edit (by concern)

| Concern | Primary location | Notes |
| --- | --- | --- |
| Ranked V2 orchestration (draft, repair loop, final tracker logs) | `lib/algorithms/floatingPcaV2/allocator.ts` | Canonical implementation behind `allocateFloatingPCA_v2RankedSlot`. |
| Ranked V2 draft pass | `lib/algorithms/floatingPcaV2/draftAllocation.ts` | Continuity-friendly first pass. |
| Ranked V2 repair / scoring | `lib/algorithms/floatingPcaV2/repairAudit.ts`, `repairMoves.ts`, `scoreSchedule.ts` | Bounded deterministic repair. |
| Ranked effective preferences (`selected_only`, etc.) | `lib/algorithms/floatingPcaV2/effectivePreferences.ts` | `buildEffectiveRankedPreferences`: used when **`preferenceSelectionMode === 'selected_only'`**; preserves **`preferred_slots`**. V2 wizard Step 3.2/3.3 handoff uses **`legacy`** + **`committedStep3Assignments`** instead (see **V2 business logic log**). |
| V2 wizard: Step 3.2/3.3 execute then Step 3.4 | `lib/features/schedule/step3V2CommittedSelections.ts` | Executes reservations, then calls ranked V2 with **`preferenceSelectionMode: 'legacy'`** and **`committedStep3Assignments`**; appends executed rows to tracker with ranked metadata. |
| V2 upstream / Step-3 selection provenance for coverage | `lib/algorithms/floatingPcaV2/provenance.ts` | e.g. `buildUpstreamCoverageKindByTeamSlot` — **not** generic shared helpers. |
| V2-only **derived** tracker summary fields | `lib/algorithms/floatingPcaV2/trackerSummaryDerivations.ts` | e.g. `highestRankedSlotFulfilled`, `usedUnrankedSlot`, **`gymUsageStatus`** (canonical `'avoided' \| 'used-last-resort'` from `gym-last-resort` phase rows), **`gymUsedAsLastResort`** / **`gymSlotUsed`** (kept aligned with canonical gym for ranked V2 finalization), `pcaSelectionTier` bump for `preferredPCAUsed`. Call **`finalizeRankedSlotFloatingTracker`** after building a full ranked V2 tracker (runs shared `finalizeTrackerSummary` first, then V2 derivations). |
| Legacy standard / balanced floating | `lib/algorithms/floatingPcaLegacy/allocator.ts` | Behind `allocateFloatingPCA_v1LegacyPreference`. |
| Legacy **`allocatePCA()`** floating phase (highest-pending-first inline path) | `lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts` | **Still not** the same as `pcaAllocationFloating.ts`. Agents must not assume “floating = only `pcaAllocationFloating`.” |
| Shared floating **contracts** (context/result types) | `lib/algorithms/floatingPcaShared/contracts.ts` | `FloatingPCAAllocationContextV2`, `FloatingPCAAllocationResultV2`, etc. |
| Shared display-only invalid-slot pairing | `lib/algorithms/floatingPcaShared/applyInvalidSlotPairingForDisplay.ts` | Used by both legacy and V2 allocators. |
| Shared slot/pending/assignment **mechanics** | `lib/utils/floatingPCAHelpers.ts` | `TEAMS`, `recordAssignment`, `finalizeTrackerSummary` (shared slice only), availability helpers, etc. **Avoid** stuffing new V2-ranked **policy** here; prefer `floatingPcaV2/`. |
| Transitional façade | `lib/algorithms/pcaAllocationFloating.ts` | **Thin re-exports only** — no substantive allocator logic. Prefer importing from `floatingPcaLegacy/`, `floatingPcaV2/`, or `floatingPcaShared/` directly in new code. |

### Tracker summary split (important)

- **`finalizeTrackerSummary`** in `floatingPCAHelpers.ts` finalizes **version-agnostic** flags: AM/PM balance from slots, **true** duplicate-floating via the shared semantics helper (not raw `ranked-duplicate` alone), and base `preferredPCAUsed` from legacy counters / `wasPreferredPCA`.
- **Ranked V2** assignment metadata (`fulfilledSlotRank`, `slotSelectionPhase`, `pcaSelectionTier`) is folded into summary by **`applyRankedSlotStep34TrackerSummaryFields`** / **`finalizeRankedSlotFloatingTracker`** in `trackerSummaryDerivations.ts`, including canonical **`gymUsageStatus`** for UI/tooltip (see §9 gym policy).

### Regression anchors

When touching this boundary, run the focused regressions listed in `docs/superpowers/plans/2026-04-10-floating-pca-v1-v2-extraction-plan.md` (export contract, V1/V2 continuity, inline `allocatePCA` floating characterization, ranked repair/tooltip contracts). **`tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts`** locks the non-wizard floating path.

## Scenario Table

| Scenario | Team input | Expected result | Why |
| --- | --- | --- | --- |
| 1. Simple preferred hit | Need `0.25`; ranked `1 > 3`; preferred PCA available on `1` | Assign preferred PCA to `1` | Highest ranked slot first; preferred PCA can satisfy it directly |
| 2. Same PCA continuity across ranked slots | Need `0.5`; ranked `2 > 3`; same PCA available on both `2` and `3` | Same PCA gets `2 + 3` in the draft pass | Ranked slots first, and continuity across different floating-eligible slots is best human-like outcome |
| 3. Rank #1 forces non-preferred PCA | Need `0.5`; ranked `1 > 3`; preferred PCAs cannot cover `1` but are available for `3`; floor PCA can cover `1 + 3` | Floor PCA gets `1 + 3` | Rank #1 outranks preferred-PCA wish; system prefers continuity and uses the same floor PCA to finish rank #2. A later UI review surface may still show the preferred PCA on `3` as an allowed override, but that is a continuity trade-off, not a ranked-slot-protection violation. |
| 4. Rank #1 first, preferred PCA second | Need `0.5`; ranked `1 > 3`; floor PCA can cover only `1`; preferred PCA available on `3` | Floor PCA gets `1`, preferred PCA gets `3` | Must solve rank #1 first; then preferred PCA helps on next ranked slot |
| 5. Ranked exhausted, use unranked | Need `0.5`; ranked only `1`; `1` is assigned, `3` is free, no other ranked slot exists | Use `1`, then unused unranked non-gym `3` | Pending must be met; unused unranked slot beats duplication |
| 6. Local continuity before global repair | Team A can immediately continue with the same PCA; Team B still has a floating-eligible slot available | First pass may let Team A continue | Human editors draft this way; global correction belongs in audit |
| 7. Audit repairs duplicate concentration | Team A draft ended with true duplicate-floating while Team B has no non-duplicate floating-eligible slot | Audit reassigns if a bounded repair exists | Duplicate is fallback only, not automatically final |
| 8. Audit rescues missing higher-ranked slot | Draft meets pending but misses another team's higher-ranked slot | Audit may reassign one slot if the schedule score improves | Ranked coverage has highest global priority |
| 9. Audit reduces over-splitting | Draft uses multiple PCAs for one team even though one PCA could safely cover more of it | Audit collapses to fewer PCAs when schedule quality does not worsen | Continuity is a desired global quality signal |
| 10. Gym only as final rescue | Need `0.25`; ranked `1 > 3`; all non-gym paths impossible; gym slot `4` exists and `avoid gym` is on | Use `4` only if it is the only remaining path to meet pending | Gym remains blocked until true last resort |
| 11. Partial ranking only | Need `0.5`; ranked `1 > 3`; slots `2` and `4` unranked | Try `1`, then `3`, then unused unranked non-gym before any duplicate | Unranked slots are a lower-priority bucket, not forbidden |
| 12. No ranked slots configured | Need `0.5`; no ranked slots; gym avoided | Use unused non-gym slots with continuity and PCA cascade | Normal fallback behavior without slot preference |
| 13. Bounded donor donation | Requester missing rank `#1`; another team holds rank `#1` on a PCA with true Step 3 floating **and** keeps another true Step 3 slot; donation passes donor-protection | Repair may move that clock slot to the requester **without** swap/fallback | Ranked rescue exists only when audit recognizes donation-only path and candidates include single-transfer donation; harmful donations (donor stripped of all true Step 3 floating, fairness floor, or ranked coverage) stay blocked |

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
- V2 wizard handoff: executed Step 3.2/3.3 + **`preferenceSelectionMode: 'legacy'`** + **`committedStep3Assignments`** preserves **full base `preferred_pca_ids`** for remaining Step 3.4 work (regressions such as `f91` / related contracts)
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
- extra coverage: only after all teams’ rounded pending is met; tracker labels `extra-coverage`; core metrics still evaluated with `extraCoverageMode: 'none'` in focused tests; **after** extra coverage in round-robin mode, **second repair** run and tracker **`repairAuditDefects`** consistent with fresh audit (`f99`)
- canonical gym summary: **`gymUsageStatus`** vs legacy flags; tooltip + Step 3.4 pills (`f95`, `f96`)
- bounded donor donation: safe vs harmful repair shapes (`f97`, `f98`); existing repair rescues (`f72`, `f84`, `f85`) remain green
- zero-slot-assigned: floating PCA rows with no team on any slot are normalized away (or one explicit placeholder policy) without breaking non-floating / buffer / substitution carriers

**Plan / changelog cross-reference:** `docs/superpowers/plans/2026-04-12-step32-step34-preferred-gym-and-repair-fixes-implementation-plan.md`, `CHANGELOG_2.md` (2026-04-12 preferred / gym / repair).

Recommended test layers:
- unit tests for effective preference construction, target ordering, and repair scoring
- regression tests for the scenario table above
- one focused caller-path test for the ranked Step 3 wizard contract (committed Step 3.2/3.3 → allocations + tracker; see `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts`)

## Primary Files / Areas
- `components/dashboard/PCAPreferencePanel.tsx`
- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `lib/features/schedule/step3V2CommittedSelections.ts`
- `lib/features/schedule/step3Harness/runStep3V2Harness.ts` (V2 harness; uses ranked tracker finalization)
- `lib/utils/reservationLogic.ts`
- `lib/utils/floatingPCAHelpers.ts` (shared mechanics + shared tracker finalization slice)
- `lib/algorithms/pcaAllocation.ts` (exports + legacy `allocatePCA` orchestration)
- `lib/algorithms/pcaAllocationFloating.ts` (**façade only** after extraction)
- `lib/algorithms/floatingPcaShared/contracts.ts`
- `lib/algorithms/floatingPcaLegacy/` (`allocator.ts`, `allocatePcaFloatingPhase.ts`)
- `lib/algorithms/floatingPcaV2/` (`allocator.ts`, `draftAllocation.ts`, repair/score modules, `provenance.ts`, `trackerSummaryDerivations.ts`, `effectivePreferences.ts`)
- `types/schedule.ts` (`GymUsageStatus`, `TeamAllocationLog.summary.gymUsageStatus` for ranked V2 UI alignment)
- `components/allocation/step34/step34ViewModel.ts`, `lib/features/schedule/v2PcaTrackerTooltipModel.ts` (canonical gym labels; not allocator core but contract consumers)
- `lib/algorithms/floatingPcaV1LegacyPreference.ts` / `floatingPcaV2RankedSlot.ts` (stable behavior-named wrappers)
- relevant Step 3 tests in `tests/regression` (including `f83-*` inline floating characterization)

## Implementation Notes
- This document is design-only and does not prescribe a DB migration.
- The preferred path is to reuse `preferred_slots: number[]` and change its semantics.
- The implementation should favor explicit tracker metadata over reconstructing hover reasons from allocator side effects.
- The implementation should favor a continuity-friendly first pass plus bounded repair over a purely greedy one-slot loop.
- The implementation should preserve the canonical code-facing name `allocateFloatingPCA_v2RankedSlot` (implementation: `allocateFloatingPCA_v2RankedSlotImpl` in `floatingPcaV2/allocator.ts`, re-exported through the stable wrapper module).
- The narrower duplicate-floating contract is defined in `docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`.
