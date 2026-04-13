# V2 Step 3 Surplus-Aware Targets and Ranked Swap Optimization Design

Status: approved for implementation planning

Date: 2026-04-13

Owner: chat-approved with user

## Summary
This spec adds two linked but separable refinements to the V2 Step 3 floating PCA engine.

Part I introduces a surplus-aware Step 3 target pipeline so the floating pending shown after Step 2 and at Step 3.1 comes from one shared projection that absorbs executable global slack before final quarter-rounding. The main product goal is to make the displayed rounded floating target feel more human and less like a late extra-coverage patch, while keeping the internal model debuggable by separating raw therapist-weighted demand from surplus-adjusted operational targets.

Part II adds a bounded ranked-slot promotion layer after required coverage has already been satisfied. This allows a team that already has enough floating coverage to improve from a lower-ranked slot to a higher-ranked slot only through no-net-loss swap or safe move behavior, never through harmful donation. The goal is to preserve the user's approved idea that ranked promotion remains possible, but only when it does not create a worse outcome for the donor team.

Both parts are explicitly V2-only. This spec also adds a hard V1/V2 boundary contract so future agents do not chaotically edit both engines together.

## Relationship To Existing Specs
- Base ranked V2 allocator design: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- V2 Step 3.2 review surface: `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`
- V1/V2 extraction boundary: `docs/superpowers/specs/2026-04-10-floating-pca-v1-v2-extraction-design.md`
- Duplicate-floating semantics alignment: `docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`

## Scope

### In scope
- V2 Step 3 target recalculation after Step 2 settles therapist distribution, special-program reservation, and floating coverage for non-floating PCA
- one shared surplus-aware projection used by the Step 2 delta/toast path and Step 3.1 initial pending target state
- therapist-weighted redistribution of executable global slack before final quarter-rounding
- explicit target/provenance fields so Step 3.4 tooltip text can explain surplus-adjusted assignments in a tiny, debug-friendly way
- a separate optional ranked-promotion layer in the V2 repair/orchestration path that permits bounded swap-only or safe-move upgrades after required coverage is already met
- regression and harness coverage for both layers
- a V2-only editing contract so future work stays out of V1 unless explicitly approved

### Out of scope
- changing the V1 allocator's behavior
- folding surplus-adjusted targets back into `rawAveragePCAPerTeam` as the developer-facing source of truth
- redesigning the visible Step 3.1 or Step 3.4 UI beyond tiny tooltip/provenance hints
- replacing the existing V2 draft-pass philosophy
- turning optional ranked promotion into a full unconstrained optimizer
- exposing a large new front-facing "surplus" feature concept to users

## Problem Statement
The current system has two related gaps.

First, Step 2 can already change the real floating landscape by changing therapist counts, special-program reservations, and Step 2 floating usage, but the most meaningful "surplus-aware" interpretation of those changes does not exist until Step 3.1 preview. This creates a mismatch between:

- the user's mental model that Step 2 already settled the demand picture
- the notification that says Step 3 targets changed
- the actual Step 3.1 numbers the user later sees
- the later extra-coverage behavior that may create "surplus" slots after draft and repair have already run

Second, the recent ranked-gap cap fixed one class of over-requesting, but it also removed a class of desirable ranked improvement opportunities. A team that already met its required pending may still reasonably want to improve from a lower-ranked slot to a higher-ranked slot. That should remain possible, but only when the improvement can be achieved through a bounded no-net-loss swap or donor-safe move. Harmful donation is not acceptable for this phase.

## Goals
- Keep `rawAveragePCAPerTeam` as the developer-facing therapist-weighted base demand.
- Make Step 2 and Step 3.1 use one shared surplus-aware Step 3 projection.
- Absorb executable slack into targets before final Step 3 rounding instead of relying on late extra-coverage alone to reveal that slack.
- Use raw/base values as the redistribution input so the system does not create an underlying advantage by rounding first and then adding surplus.
- Preserve the allocator's operational `0.25` slot basis as the final executable layer.
- Allow optional ranked promotion only when the donor team does not suffer unacceptable harm.
- Keep final explanations debuggable through tracker/provenance text.
- Preserve the V1/V2 extraction boundary and keep new ranked policy in V2-owned modules.

## Non-Goals
- Do not make surplus redistribution depend on a blind round-robin team order.
- Do not treat theoretical continuous surplus as allocator authority when no executable quarter-slot exists.
- Do not create a new visible badge or card for surplus on the Step 3.4 front-facing UI.
- Do not let optional ranked promotion redefine required ranked coverage.
- Do not let optional ranked promotion use harmful donation.
- Do not move V2-only policy into shared helpers unless the logic is truly version-agnostic.

## Locked Product Decisions

### 1. User-facing simplicity, developer-facing separation
For users, the important outputs remain:

- the average PCA/team they conceptually reason from
- the rounded floating pending target they act on

For implementation and debugging, the system must keep separate layers:

- raw therapist-weighted demand
- surplus-adjusted target math
- final quarter-rounded operational pending

This separation is mandatory even if the front-facing experience hides most of it.

### 2. Surplus hint stays tooltip-only
If a final Step 3.4 outcome exists because the team's target was uplifted by surplus adjustment, that should be explained only in Step 3.4 tracker tooltip/provenance text.

Allowed:
- a short provenance line such as `Surplus-adjusted target`
- a tiny explanatory sentence such as `This team received 1 extra quarter-slot from therapist-weighted global surplus adjustment.`

Disallowed:
- new visible badges on Step 3.4 summary cards
- a new standalone UI control for surplus debugging

### 3. Raw/base values must absorb surplus before rounding
The approved order is:

1. compute raw/base team targets
2. compute raw continuous surplus
3. distribute that raw surplus by therapist-weighted share onto raw/base targets to get an ideal uplift
4. compute executable slack in quarter-slot units as the realizability cap
5. materialize the ideal uplift into quarter-slot grants subject to the executable slack cap
6. round only after uplift/grants are applied
7. preserve the global slack-slot sum after rounding with a balancing pass
8. derive final pending from the adjusted targets and existing assigned coverage

Disallowed:
- `rounded pending + surplus`
- `rounded raw floating + surplus`
- round-robin post-rounding bonus slots as the primary surplus mechanism

### 4. Raw surplus drives the ideal distribution; executable slack caps realization
The allocator ultimately operates on executable `0.25` slot units, but the most mathematically appropriate weighting input is the raw continuous surplus before slot discretization.

Therefore the design must distinguish three related values:

- `rawSurplusFte`: the continuous surplus at the raw mathematical layer
- `idealWeightedSurplusShareByTeam`: each team's therapist-weighted ideal share of that raw surplus
- `redistributableSlackSlots`: the real executable quarter-slot capacity that Step 3 can actually materialize

This preserves the approved mental model:

- inlet: raw values
- processor: redistribution and recalculation
- outlet: quarter-based operational targets

Design rule:
- weighting should use `rawSurplusFte`
- realization should be capped by `redistributableSlackSlots`
- final allocator authority remains the quarter-based operational output, not the continuous ideal

### 5. Optional ranked promotion is distinct from required ranked coverage
The system must separate:

- required ranked coverage: the ranked-slot deficit logic needed to satisfy actual target demand
- optional ranked promotion: a later quality-improvement phase for teams already sufficiently covered

This prevents future agents from reintroducing the bug where "all configured ranked slots" are implicitly treated as required whenever a team lists more than one rank.

### 6. Optional ranked promotion is no-net-loss only
The optional promotion phase may use:

- bounded swap
- donor-safe move with acceptable replacement
- same-PCA sway when donor remains whole

It may not use:

- harmful donation
- donor net loss that drops the donor below fairness protection
- donor loss of a stronger ranked result

## V1 / V2 Boundary Contract
This section is mandatory because future-agent confusion around the Step 3 engines has already caused incorrect mixed edits.

### Stable public entrypoints
Consumers must continue to use:

- `allocateFloatingPCA_v1LegacyPreference`
- `allocateFloatingPCA_v2RankedSlot`

Do not reintroduce ambiguous public names such as `allocateFloatingPCA_v2`.

### Ownership rules
Part I and Part II in this spec are V2-ranked behavior only unless a later approved spec explicitly expands scope.

Preferred edit locations:
- V2 orchestration and target handoff: `lib/algorithms/floatingPcaV2/`, `lib/features/schedule/step3Bootstrap.ts`, Step 2/Step 3 controller wiring
- V2 repair/scoring/promotion: `lib/algorithms/floatingPcaV2/repairAudit.ts`, `repairMoves.ts`, `scoreSchedule.ts`, `allocator.ts`
- V2 tooltip/provenance consumers: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`, Step 3.4 view-model consumers if needed

Protected boundaries:
- `lib/algorithms/floatingPcaLegacy/` must not be changed unless a task explicitly says V1 behavior should change
- `lib/utils/floatingPCAHelpers.ts` remains shared mechanics only; do not put new V2-ranked policy there
- `lib/algorithms/pcaAllocationFloating.ts` remains a facade/re-export surface, not a home for new behavior

### Shared-surface discipline
If a task touches a shared file, the implementation plan must explicitly classify the change as one of:
- V2-only metadata consumed through a shared type
- truly version-agnostic shared mechanics
- accidental scope creep that should be rejected

### Regression discipline
Any shared-surface change must include a focused check that V1 behavior was not unintentionally changed.

## Recommended Architecture

### Part I. Surplus-Aware Step 3 Target Architecture

#### Intent
Step 2 is where the user settles the real upstream inputs that determine Step 3 floating pressure. Therefore Step 2 should produce the first authoritative Step 3 target projection, while Step 3.1 should recompute the same projection from live state for correctness. The two surfaces must share one calculation model.

#### New conceptual model
Introduce an explicit `Step3TargetProjection` concept with three layers:

1. raw demand layer
2. redistributed target layer
3. operational pending layer

Suggested fields:
- `rawAveragePCAPerTeam`
- `rawFloatingTargetByTeam`
- `existingAssignedByTeam`
- `rawSurplusFte`
- `idealWeightedSurplusShareByTeam`
- `availableFloatingSlots`
- `neededFloatingSlotsBeforeRedistribution`
- `redistributableSlackSlots`
- `realizedSurplusSlotGrantsByTeam`
- `surplusAdjustedTeamTargets`
- `roundedAdjustedTeamTargets`
- `roundedPendingByTeam`
- `surplusAdjustmentDeltaByTeam`

Field naming may differ in implementation, but the layered meaning must remain explicit.

#### Redistribution order
The redistribution order is locked:

1. compute raw/base team targets from Step 2 output
2. compute `rawSurplusFte` at the continuous mathematical layer
3. compute `idealWeightedSurplusShareByTeam` from that raw surplus using therapist-weighted demand share
4. compute `redistributableSlackSlots` as the actual spare quarter-slots that can still be placed
5. convert the ideal weighted uplift into realized quarter-slot grants subject to the executable slack cap
6. add those realized grants back onto raw/base targets
7. quarter-round after the uplift/grants
8. reconcile rounding drift so the final rounded uplift equals the intended redistributable slack
9. subtract existing assigned coverage to derive final pending

This is the authoritative explanation for future agents and for debugging.

#### Why raw surplus and executable slack both exist
The design intentionally uses a two-layer surplus model.

- `rawSurplusFte` is the mathematically fairer input for weighting because it avoids a first-tier rounding distortion before the surplus is split.
- `redistributableSlackSlots` is the operational cap because Step 3 can only spend real executable quarter-slots.

This keeps the design mathematically cleaner than "weighted executable slack only" while still staying operationally honest.

#### Weighted redistribution basis
Slack redistribution must be based on therapist-weighted demand share, not on round-robin team order.

Rationale:
- therapist distribution is already the basis for average PCA/team
- therapist distribution also aligns with downstream bed responsibility logic
- a blind round-robin surplus bonus would ignore the core workload model the app already uses

#### Rounding reconciliation
Because uplift is fractional before final rounding, the spec requires a deterministic sum-preserving reconciliation pass after rounding.

Acceptable strategies include:
- largest remainder against the weighted uplift residue
- closest-to-next-quarter residue with deterministic team-order tiebreak

The implementation plan may choose one strategy, but it must preserve:
- the global redistributable slack-slot count
- determinism
- traceability in logs/tests

#### Tiny worked example
This tiny example is normative only for terminology and order of operations; it is not a claim about the exact current production formula.

Assume:
- raw average PCA/team:
  - `MC = 1.64`
  - `NSM = 1.49`
- existing assigned coverage already settled upstream:
  - `MC = 1.00`
  - `NSM = 1.00`
- raw floating targets before surplus:
  - `MC = 0.64`
  - `NSM = 0.49`
- therapist-weighted demand share between the two teams:
  - `MC = 56%`
  - `NSM = 44%`
- raw continuous surplus across the schedule:
  - `rawSurplusFte = 0.43`
- executable slack at the outlet:
  - `redistributableSlackSlots = 1` slot = `0.25 FTE`

Step order:
1. compute ideal weighted uplift from raw surplus:
   - `MC idealWeightedSurplusShareByTeam = 0.43 * 0.56 = 0.2408`
   - `NSM idealWeightedSurplusShareByTeam = 0.43 * 0.44 = 0.1892`
2. map that ideal uplift onto the executable cap of 1 slot total:
   - `MC realizedSurplusSlotGrantsByTeam = 0.25`
   - `NSM realizedSurplusSlotGrantsByTeam = 0.00`
3. add realized grants back to raw/base targets:
   - `MC surplusAdjustedTeamTarget = 0.64 + 0.25 = 0.89`
   - `NSM surplusAdjustedTeamTarget = 0.49 + 0.00 = 0.49`
4. round to the allocator's quarter basis:
   - `MC roundedAdjustedTeamTarget = 1.00`
   - `NSM roundedAdjustedTeamTarget = 0.50`

The key point is what did **not** happen:
- the system did **not** do `0.64 -> 0.75`, then `+0.25`
- the system did **not** split already-rounded surplus slots before considering raw surplus fairness

Instead it:
- used raw/base targets plus raw surplus to determine the ideal distribution
- used executable slack only to cap what could actually be realized
- still ended at the required quarter-based operational output

#### Shared Step 2 / Step 3.1 contract
The Step 2 completion path should calculate this projection and use it for delta/toast messaging.

Step 3.1 should:
- recompute the same projection from live state
- initialize its pending values from the same rounded adjusted target layer
- remain correct even if state changed after Step 2

This means Step 2 becomes the first authoritative projection point, while Step 3.1 remains the runtime verification point.

#### Step 2 delta semantics
The existing "Step 3 target updated" delta path should describe the final surplus-aware rounded target change, not only the pre-surplus raw target change.

Example tone:
- `FO +1 PCA slot`
- `DRO -1 PCA slot`

The message should reflect the projection the user will actually see at Step 3.1.

#### Tooltip/provenance integration
If a Step 3.4 assignment exists because a team's target was increased by surplus redistribution, final tracker/provenance data may expose that reason in tiny form.

Approved scope:
- tooltip/provenance text only
- no new major visual concept

The provenance should be derived from target adjustment metadata, not reconstructed heuristically from final allocations alone.

### Part II. Optional Ranked Promotion Via Bounded Swap Optimization

#### Intent
After required pending and required ranked coverage are satisfied, the V2 engine may still improve schedule quality by promoting a team from a lower-ranked slot to a higher-ranked slot. This should remain possible, but only through bounded no-net-loss reshaping.

This is not the same as B1 ranked-defect repair.

#### New conceptual phase
Add a distinct post-required-coverage phase:
- after required ranked coverage/fairness floor are satisfied
- before final schedule freeze
- after Part I target projection is already in effect

This phase evaluates whether a requester team with adequate coverage can improve ranked quality without making the donor acceptably worse.

#### Allowed promotion shapes
Allowed:
- bounded slot swap
- donor-safe move with acceptable replacement
- same-PCA sway when the donor remains whole and final coverage is not harmed

Disallowed:
- pure donation that causes donor net loss
- promotion that strips the donor's stronger ranked result
- promotion that removes donor fairness-floor protection
- promotion that trades one bug for another surplus/fairness regression

#### Requester eligibility
A requester team is eligible for optional promotion only if:
- it already satisfies its required pending target after Part I target logic
- it already satisfies required ranked coverage as defined by actual target demand
- it holds a lower-ranked or less desirable slot while a higher-ranked upgrade is still potentially reachable

This preserves the user's approved intent: a team that already got a lower-ranked slot does not lose the possibility of promotion, but that promotion is no longer allowed to harm another team through donation.

#### Donor protection
The donor-side contract must remain explicit.

The donor may participate only if the final state does not cause unacceptable harm, including:
- losing its stronger ranked outcome
- losing meaningful first true Step 3 floating coverage
- falling below fairness protection
- suffering a net loss that the requester is not also accepting

This phase should reason using true Step 3 floating ownership semantics, not raw occupancy.

#### Score and audit separation
The implementation should avoid encoding optional promotion as a fake "missing ranked defect."

Instead, this phase should have its own auditable concept, for example:
- optional promotion opportunity
- ranked-upgrade opportunity

The exact name may vary, but the behavior must remain distinct from required ranked-gap repair.

#### Placement relative to extra coverage
Part II should run in a place where it is not hidden by accidental surplus behavior. The preferred order is:

1. draft allocation
2. required repair
3. Part I-adjusted target interpretation already in effect
4. optional ranked promotion via bounded swap optimization
5. residual extra coverage only if still applicable
6. final audit/repair as needed before freeze

The implementation plan may refine the exact ordering, but optional ranked promotion must not be silently disabled by the earlier cap fix nor reintroduced as harmful donation.

## Scenario Guidance

### Scenario A: Surplus absorbed before Step 3.1
If Step 2 settles therapist distribution such that executable global slack exists, the system should redistribute that slack onto raw/base team targets before final rounding. Step 3.1 should open with those adjusted rounded values rather than with frozen pre-surplus pending.

### Scenario B: Rounding must not create first-tier advantage
If a team's raw floating target would already round up favorably, the system must not first grant that rounding advantage and then add a surplus bonus on top. Surplus must be applied to raw/base values before quarter-rounding.

### Scenario C: Continuous surplus is diagnostic; executable slack is real
If raw continuous surplus exists but executable slot capacity cannot realize an extra quarter-slot, the ideal weighted distribution may still be computed for traceability, but final redistribution must follow executable slack, not the continuous number alone.

### Scenario D: Lower-ranked slot may still promote upward
If a team already has enough floating coverage and holds a lower-ranked slot, it may still pursue a higher-ranked slot later, but only via bounded no-net-loss reshaping.

### Scenario E: Harmful donation stays blocked
If a higher-ranked promotion would require the donor team to give up its own meaningful protection or suffer net loss, the promotion must stay blocked even if the requester's rank would improve.

## Error Handling and Edge Cases
- If executable slack is zero or negative, Part I should produce zero surplus uplift and behave like the ordinary target path.
- If a therapist-weighted share produces fractional uplift that rounds away, the reconciliation step must still preserve the global slack-slot sum.
- If all candidate recipients are already near thresholds, the reconciliation pass must remain deterministic.
- If Step 2 data changes after the user sees the toast, Step 3.1 must recompute and use live state rather than trusting stale projection state.
- If a team's target is uplifted by surplus but no final Step 3.4 allocation results from that uplift, tooltip/provenance should stay silent rather than implying a surplus-driven slot existed.
- If optional ranked promotion has no bounded no-net-loss path, the final result should remain at the required-coverage state without manufacturing a promotion.

## Testing Guidance
This design should be implemented with focused regressions around:

- Step 2-end surplus-aware target projection uses the same model as Step 3.1 initialization
- raw/base target plus weighted surplus is rounded once at the end, not rounded first and then uplifted
- raw continuous surplus is the weighting input for the ideal distribution
- executable slack is the realizability cap for quarter-slot grants
- the global redistributed slack-slot sum is preserved after rounding reconciliation
- therapist-weighted redistribution favors teams according to demand share rather than round-robin order
- Step 3.4 tooltip/provenance can explain a surplus-adjusted final slot without adding a visible badge
- optional ranked promotion remains possible after required coverage is satisfied
- optional ranked promotion succeeds for bounded swap/safe-move cases
- optional ranked promotion rejects harmful donation cases
- required ranked-gap repair remains distinct from optional ranked promotion
- V1 behavior stays unchanged when only V2-owned files are touched

## Primary Files / Areas
- `lib/features/schedule/step3Bootstrap.ts`
- Step 2 / Step 3 controller wiring where target deltas and Step 3 entry state are built
- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `lib/algorithms/floatingPcaV2/allocator.ts`
- `lib/algorithms/floatingPcaV2/repairAudit.ts`
- `lib/algorithms/floatingPcaV2/repairMoves.ts`
- `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- shared contracts/types only where needed to carry metadata safely across consumers

## Implementation Notes
- This is a V2-only design unless a later approved spec explicitly expands scope.
- `rawAveragePCAPerTeam` stays the base developer-facing value and must not be overwritten by surplus-adjusted targets.
- The target pipeline should be explainable as raw input -> weighted redistribution -> quarter-based operational output.
- The tooltip/provenance hint is intentionally tiny and should not become a new major UI concept.
- Part I is foundational and may be implemented first on its own.
- Part II should remain separable so a later session can implement ranked swap optimization without having to rediscover the design context from scratch.
