# V2 Step 3 Surplus-Aware Targets and Ranked Swap Optimization Design

Status: approved for implementation planning

Date: 2026-04-13

Owner: chat-approved with user

## Summary
This spec adds **three** linked spec chapters (Part I–III) plus a **fourth shippable allocator quality track**: **AM/PM session balance** (implementation plan **Task Group D**), all V2 Step 3 floating PCA work.

Part I introduces a surplus-aware Step 3 target pipeline so the floating pending shown after Step 2 and at Step 3.1 comes from one shared projection that absorbs executable global slack before final quarter-rounding. The main product goal is to make the displayed rounded floating target feel more human and less like a late extra-coverage patch, while keeping the internal model debuggable by separating raw therapist-weighted demand from surplus-adjusted operational targets.

Part II adds a bounded ranked-slot promotion layer after required coverage has already been satisfied **and after the Part III gym-avoidance pass** (when implemented) clears avoidable gym first where applicable. This allows a team that already has enough floating coverage to improve from a lower-ranked slot to a higher-ranked slot only through no-net-loss swap or safe move behavior, never through harmful donation. The goal is to preserve the user's approved idea that ranked promotion remains possible, but only when it does not create a worse outcome for the donor team. Optional promotion scoring prefers **ranked-slot uplift** first, then **preferred PCA** among ties; **Step 3.2** and **Step 3.3** user commits are **immutable** for repair, promotion, and Part III gym repair (**Constraint 6c** in the paired plan). **AM/PM session balance** is a **soft** lexicographic layer **after** those promotion tie metrics (and after all higher `compareScores` objectives); see **AM / PM session balance (approved — Task Group D)**.

Part III defines a **gym avoidable defect** path: after **draft** and **required repair**, and **before** optional ranked promotion (Part II), detect when **avoid-gym** is on but the team still occupies its **gym slot** while a **feasible non-gym reshuffle** exists, then run a **separate bounded repair** pass; surface the same explanation in **Step 3.4** UI and **tracker tooltips** (single copy source). **Sequencing:** Part III runs **before** Part II so a **contested donor** prefers **clearing avoidable gym** over marginal rank uplift. Part III is **not** optional ranked promotion; it does not relax Part II gates (**Constraint 6e** in the paired plan). Part II must include a **guard** so promotion does not **reintroduce** avoidable gym occupancy after Part III (**Optional promotion guard** / **Constraint 6f**). Execution lives in the paired plan **Task Group C** (`f121`–`f125`).

Parts I–III and the AM/PM track are explicitly V2-only. This spec also adds a hard V1/V2 boundary contract so future agents do not chaotically edit both engines together.

## Relationship To Existing Specs
- **Floating / non-floating glossary and Avg PCA unification (read first for vocabulary):** `docs/glossary/step3-floating-nonfloating.md`
- **Step 3 projection boundary (Part 1 — single handoff object):** `docs/superpowers/plans/2026-04-13-step3-contract-reset-part1-projection-unification-implementation-plan.md`
- Base ranked V2 allocator design: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- V2 Step 3.2 review surface: `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`
- V1/V2 extraction boundary: `docs/superpowers/specs/2026-04-10-floating-pca-v1-v2-extraction-design.md`
- Duplicate-floating semantics alignment: `docs/superpowers/specs/2026-04-10-v2-duplicate-floating-semantics-alignment-design.md`
- **Paired implementation plan (Part I + II + III + AM/PM tasks, constraints, regressions):** `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md` (Task Groups A/B shipped in this workstream; **Task Group C** = Part III gym avoidance; **Task Group D** = AM/PM session balance — follow those sections when implementing)

## Scope

### In scope
- V2 Step 3 target recalculation after Step 2 settles therapist distribution, special-program reservation, and floating coverage for non-floating PCA
- one shared surplus-aware projection used by the Step 2 delta/toast path and Step 3.1 initial pending target state
- therapist-weighted redistribution of executable global slack before final quarter-rounding
- explicit target/provenance fields so Step 3.4 tooltip text can explain surplus-adjusted assignments in a tiny, debug-friendly way
- optional **user-facing literacy** copy: Help Center guide `/help/avg-and-slots` plus a short “continuous FTE vs slots” section in the existing Avg PCA/team formula popover (no new dashboard badges)
- a separate optional ranked-promotion layer in the V2 repair/orchestration path that permits bounded swap-only or safe-move upgrades after required coverage is already met **and after Part III gym-avoidance repair when applicable**
- a **Part III** bounded gym-avoidable defect (`G1`) audit + repair pass **after** required repair and **before** optional promotion (see **Locked allocator order**), with promotion **Constraint 6f** so Part II does not undo avoidable-gym clearance
- **AM/PM session balance** as a **soft** lexicographic tie-break after promotion rank + preferred PCA (**Task Group D**, **`f126`–`f132`** in the paired plan), including **0.75** narrative: **tier 1** & **tier 2** both **no duplicate**; **`splitPenalty`** separates tier 1 vs 2; **`duplicateFloatingCount`** separates tier 2 vs 3 (dup last resort); AM/PM sub-tier for **2+1** vs **3+0** when dup+split tied; **≥1.0** **chunk vs four×0.25** via **split + duplicate** (not “one PCA must own four slots”)
- regression and harness coverage for Part I and Part II layers; **Part III** regressions **`f121`–`f125`** and **Task Group D** regressions **`f126`–`f132`** (including **0.75** tier matrix **f129**–**f132**) defined in the paired plan when those groups execute
- a V2-only editing contract so future work stays out of V1 unless explicitly approved

### Out of scope
- changing the V1 allocator's behavior
- folding surplus-adjusted targets back into `rawAveragePCAPerTeam` as the developer-facing source of truth
- redesigning the visible Step 3.1 or Step 3.4 UI beyond tiny tooltip/provenance hints (allowed: dedicated Help article + popover educational text as above)
- replacing the existing V2 draft-pass philosophy
- turning optional ranked promotion into a full unconstrained optimizer
- unbounded or lingering optional-promotion passes that delay residual extra coverage or final freeze (bounded pass only; see Part II **Phase termination**)
- exposing a large new front-facing "surplus" feature concept to users

## Problem Statement
The current system has two related gaps.

First, Step 2 can already change the real floating landscape by changing therapist counts, special-program reservations, and Step 2 floating usage, but the most meaningful "surplus-aware" interpretation of those changes does not exist until Step 3.1 preview. This creates a mismatch between:

- the user's mental model that Step 2 already settled the demand picture
- the notification that says Step 3 targets changed
- the actual Step 3.1 numbers the user later sees
- the later extra-coverage behavior that may create "surplus" slots after draft and repair have already run

Second, the recent ranked-gap cap fixed one class of over-requesting, but it also removed a class of desirable ranked improvement opportunities. A team that already met its required pending may still reasonably want to improve from a lower-ranked slot to a higher-ranked slot. That should remain possible, but only when the improvement can be achieved through a bounded no-net-loss swap or donor-safe move. Harmful donation is not acceptable for this phase.

## Part I — Mental model: Why “surplus” exists after Step 2 (not a Step 2 omission by default)

This section addresses **Group A / Part I** confusion: *Step 2 already settled therapists, special programs, and non-floating coverage, and `average_pca_per_team` was updated — so why does “surplus” show up later (e.g. after Step 3.4 tooltips)? Shouldn’t those extra slots have been “in” the post–Step 2 Avg PCA/team?*

### Two different objects (see glossary)

Use the glossary in `docs/glossary/step3-floating-nonfloating.md`:

- **Avg** (display / therapist-weighted **raw** team requirement) answers *bed-weighted demand per team*. It is **not** defined as “total floating FTE divided by teams,” and **Part 1 + product contract** keep **dashboard / Step 3.1 “Avg”** aligned to that **raw** scalar (`displayTargetByTeam`), **not** to surplus-inflated operational totals (regression: `f113-step3-dashboard-avg-pca-uses-raw-bootstrap-target`).
- **Surplus-aware operational targets** (rounded floating / pending seeds after grants) answer *how many **executable quarter-slots** the floating pool must place*, after **global** realizability and **sum-preserving** reconciliation. That layer **may** be **higher** than `round(Avg − non-floating)` for some teams when **redistributable slack** exists — without changing the **display Avg** number the user reasons about at a glance.

So: **0.5 FTE “extra” in the pool** is **not** required to appear as +0.5 on every team’s **Avg** row. It is materialized as **at most** `redistributableSlackSlots` quarter-slot **grants** on the **operational floating target** path, weighted by raw demand share, then explained in **tooltip/provenance** where relevant.

### Where slack actually comes from (upstream vs engine)

- **Legitimate Part I “surplus” (slack redistribution):** After Step 2, the schedule has a **fixed** set of floating PCAs and slot topology. **Local** rounding of each team’s **raw floating** gap can **under-use** the **global** count of placeable quarter-slots. The **difference** (executable slack) is **not** an error in Step 2’s Avg formula — it is a **discretization + global capacity** phenomenon. Part I **folds that slack into operational targets** (before / as part of the single Step 3 projection handoff), not by silently rewriting **display Avg**.
- **Upstream bug (different diagnosis):** If **non-floating FTE** or **typed coverage** is wrong (e.g. naive headcount, substitution misclassified), then **raw floating** and every downstream number are wrong. That is **not** “surplus after 3.4” — it is **wrong gap math**; fix **Step 2 attribution / bootstrap inputs** per the glossary’s “Non-floating display vs typing” section.

### After Step 3.4

Tooltips that explain a **raised target (shared spare)** row refer to **operational** provenance (grants on the floating obligation), not a claim that **Avg** was retroactively wrong at Step 2. Optional **extra after needs** after allocation is **separate** from Part I shared-spare metadata; do not treat `Extra` as proof of Part I grants.

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

### 2. Literacy + hints: Help, popover, toast, tracker (minimal on-screen chrome)
If a final Step 3.4 outcome exists because the team’s **operational floating target** was raised by **shared spare from rounding** (engine: surplus-aware grants), that should be explainable in **tiny** tracker tooltip text and in **Help / formula popover**. **Do not** imply the dashboard **Avg PCA/team** row was wrong at Step 2.

**Approved user-facing names (English, HK clinical audience — no bilingual requirement for now):**

| Engineering / internal | User-facing label |
|------------------------|-------------------|
| Surplus-adjusted target / grant | **Raised target** (short chip) — full phrase **Raised target (shared spare)** where space allows |
| Post-need extra coverage | **Extra after needs** |

**Never show “shared spare” alone without context** in a one-off string; pair with Step 2, **rounding**, or **floating pool** (see copy deck below).

#### Approved copy deck (implement exactly unless UX review changes this spec)

**Step 2 completion toast — context line** (when a floating handoff delta exists; precedes per-team slot lines):

`Floating targets updated after Step 2 + shared spare from rounding the floating pool.`

**Optional alternate one-liner** (e.g. marketing / release notes; same meaning):

`Floating targets updated after Step 2 — includes shared spare from rounding the floating pool`

Implementation: `describeStep3BootstrapDelta` returns this as **`main`**; schedule toast body must show **`main` then team `details`** (not `details` only). Per-team lines stay scannable, e.g. `MC +1 PCA slot`.

**Step 3.1 — collapsed line** (when this team’s seed includes shared spare / grant from projection):

`Floating target includes a small raise from shared spare (rounding).`

Trailing link: **`What does this mean?`** → `/help/avg-and-slots`.

**Step 3.1 — “Show details” expander** (bullets; prefer numeric lines **quoted from** `Step3BootstrapSummary` / `Step3ProjectionV2` when available):

1. The floating pool had spare placeable slot(s) after each team’s need was rounded to slots.
2. Those spare slot(s) were shared using each team’s Avg PCA/team weighting (not an equal split).
3. This team’s floating target includes that share.
4. This is not the same as **Extra after needs** in Step 3.4.

Closing line: **Avg PCA/team** here was not increased — it stays the Step 2 average.

**Post-need — default one line** (Step 3.4 context or preview; not the same as raised target):

`After every team’s basic floating need was met, rounding still left spare slot(s), so the system could place extra slot(s).`

**Step 3.4 — header row chips** (minimal text only):

- Shared-spare path: pill label **`Raised target`** only (essential info on chip).
- Post-need path: pill label **`Extra after needs`**.

**Micro-caption** (one line, **full width** of the detail header row — spans the same horizontal band as **Pending floating** / **Assigned floating** badges and any other summary pills, so occasional readers see context once):

`“Raised target” is from Step 2→3 rounding in the floating pool. “Extra after needs” is from Step 3.4 after needs were met.`

**PCA block / tracker tooltip — ultra-short provenance value** (when grant + row flag apply):

`Raised floating target (shared spare).`

Allowed surfaces:
- **Help Center** `/help/avg-and-slots` and **Avg PCA/team formula popover** (dashboard + schedule): use the **approved names** above; link **What does this mean?** to the guide where appropriate.
- **Planned (A0b):** Step 3.1 collapsed + expander as above; Step 3.4 chips + micro-caption as above. **Do not** add a second hero control or engineer-only debug panel.

Disallowed:
- large new **hero** badge rows or summary-card **surplus** marketing strips
- a new standalone control whose primary purpose is engineer-only surplus debugging
- user-facing strings that use internal-only names (`rawSurplusFte`, `redistributableSlackSlots`, `provenance`, `bootstrap`) without mapping to this copy deck

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
- realization should be capped by `redistributableSlackSlots` (an **integer count of quarter slots**, not “use up every FTE of continuous surplus”)
- final allocator authority remains the quarter-based operational output, not the continuous ideal

**Continuous surplus vs discrete grants:** `rawSurplusFte` is in **continuous** FTE. **Materialized** grants are in steps of **0.25 FTE** per slot. If `redistributableSlackSlots = 1`, **at most one** slot (`0.25` FTE) can be granted globally in that reconciliation pass—even when `rawSurplusFte` is larger (e.g. `0.43`). The leftover continuous story (`0.43 − 0.25 = 0.18` in that example) is **not** “lost” by a separate bug; it is **not realizable as another quarter slot** while the **executable slack cap** is one slot. A second slot would require **`redistributableSlackSlots ≥ 2`** (and the usual fair split / reconciliation rules), not merely `rawSurplusFte ≥ 0.5`.

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
Part I, Part II, and Part III in this spec are V2-ranked behavior only unless a later approved spec explicitly expands scope.

Preferred edit locations:
- V2 orchestration and target handoff: `lib/algorithms/floatingPcaV2/`, `lib/features/schedule/step3Bootstrap.ts`, Step 2/Step 3 controller wiring
- V2 repair/scoring/promotion/**Part III `G1`**: `lib/algorithms/floatingPcaV2/repairAudit.ts`, `repairMoves.ts`, `scoreSchedule.ts`, `allocator.ts`
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
Step 2 is where the user settles the real upstream inputs that determine Step 3 floating pressure (**Avg**, non-floating coverage, floating staff availability). **After Part 1 projection unification**, the **Step 2 → Step 3 boundary** produces **one shared projection object** (single calculation model + consistent inputs). Step 3.1 **consumes** that projection for display seeds and fixed rounded floating targets; it **recomputes** only when **live state** diverges from what Step 2 last finalized (same rules, fresher inputs — not a second ad-hoc math branch). Step 2 delta / toast messaging should describe the **same** surplus-aware **operational** target change the user will see at Step 3.1, while **Avg** display stays the **raw** contract per the floating/non-floating table.

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

**Read the numbers together:** Here `rawSurplusFte = 0.43` but `redistributableSlackSlots = 1` ⇒ only **one** quarter grant (`0.25` FTE) exists at the outlet. The **ideal** weighted shares still used `0.43` for **fairness of who gets** that single slot; the **remaining** `0.18` FTE of continuous “surplus story” does **not** auto-create a second slot. That is what **capped by executable slack** means—not that `0.18` is thrown away arbitrarily, but that **slot count** is bounded before discretization.

#### Shared Step 2 / Step 3.1 contract
The Step 2 completion path should calculate this projection and use it for delta/toast messaging.

Step 3.1 should:
- **consume** the same projection object built at the Step 2→3 boundary (Part 1 unification); **recompute with the same model** only when **live state** has diverged (fresher inputs), not a parallel ad-hoc target branch
- initialize its pending values from the same rounded adjusted target layer
- remain correct even if state changed after Step 2

Step 2 remains the first **authoritative** projection point; Step 3.1 is the **live** consumer (and re-validator when inputs change).

#### User-facing literacy (Part I, non-blocking)
Staff confusion often mixes **display Avg** (continuous, raw therapist-weighted), **raised target (shared spare)** at Step 2→3, and **extra after needs** in Step 3.4. Part I keeps **tracker tooltips** ultra-short; **product education** lives in `/help/avg-and-slots` and the **Avg PCA/team formula popover**, using the **Approved copy deck** under **Locked decision 2**. **A0b** adds Step 3.1 / Step 3.4 micro-lines and chips per that deck.

#### Engineering field glossary (stable names; map to product language)
Do **not** mass-rename bootstrap/projection identifiers solely for naming aesthetics; churn breaks tests and reviews. Instead keep **this spec +** `docs/glossary/step3-floating-nonfloating.md` as the shared glossary.

| Typical code / spec field | Role in one sentence | Nearest product glossary (`docs/glossary/step3-floating-nonfloating.md`) |
|---------------------------|----------------------|-------------------------------------------|
| `rawSurplusFte` | Continuous surplus used as **weighting input** for fair shares | Not a row on the card; informs **shared slack** math |
| `idealWeightedSurplusShareByTeam` | Each team’s **fair share** of `rawSurplusFte` before slot cap | Same — internal |
| `redistributableSlackSlots` | **Max count** of quarter slots that may be **materialized** in this pass | Bridges to “how many slots the pool can still place” vs sum of needs |
| `realizedSurplusSlotGrantsByTeam` (or equivalent) | Actual **0.25** grants applied per team after cap + reconciliation | Feeds **operational** floating target / pending seed; user copy **Raised target** / **shared spare** — not **display Avg** |
| `surplusAdjustedTeamTargets` | Continuous-layer targets after grants, pre-final quarter snap | Between **raw floating** story and **rounded** operational |
| `roundedAdjustedTeamTargets` / `roundedPendingByTeam` | Quarter-grid **operational** outputs consumed by Step 3.1 / allocator | Align with **Pending floating** / operational obligation (after surplus), not necessarily the **Rounded floating** row if that row is **pre-surplus** `round(raw floating)` only |

Full code-name definitions also live in `docs/glossary/step3-floating-nonfloating.md` § **V2 surplus / projection field glossary (code names)**.

#### Step 2 delta semantics
The Step 2 completion toast must surface **both** the **context line** (`describeStep3BootstrapDelta.main` — see **Locked decision 2** copy deck) **and** per-team slot deltas (`details`), so readers see *why* before *who*. Deltas use **operational** rounded targets (surplus-aware when V2 metadata exists), not pre-surplus raw targets only.

Example `details` tone:
- `FO +1 PCA slot`
- `DRO -1 PCA slot`

The message should reflect the projection the user will actually see at Step 3.1.

#### Tooltip/provenance integration
If a Step 3.4 assignment exists because a team’s target was raised by **shared spare** grants, tracker provenance uses the **ultra-short** string in **Locked decision 2** (`Raised floating target (shared spare).`), derived from grant / row metadata — not reconstructed heuristically from allocations alone.

Approved scope:
- tooltip/provenance text on the tracker (PCA block)
- Help article + popover literacy per **Locked decision 2**; minimal **Raised target** / **Extra after needs** chips in Step 3.4 detail plus **full-width micro-caption** under the header badge row (A0b)

### Locked decision — V2 PCA tracker repair reason strings

**For future agents:** **Part I / II / III** are **spec chapter titles** (document outline order). They are **not** the allocator’s runtime sequence. The **locked post–draft allocator mnemonic** is **`R → G → P`**: **R**equired repair → **G**ym avoidable (`G1`, spec **Part III**) → optional **P**romotion (spec **Part II**). **Chapter Part III runs before chapter Part II** in code; do not reorder because Roman numerals place “II” before “III” in the table of contents.

| Key | User-facing string | SSOT |
|-----|-------------------|------|
| `repairReason` **`continuity-reduction`** (Repair reason row) | **Continuity (fewer PCA handoffs)** | `formatV2RepairReasonLabel` in `lib/features/schedule/pcaTrackerTooltip.ts` |
| `repairReason` **`ranked-promotion`** | **Ranked promotion** | same |
| Audit defect pill **`C1`** (continuity gap) | **Continuity (fewer PCA handoffs)** | `formatV2RepairAuditDefectLabel` in the same module |

Keep the paired implementation plan **copy deck** rows for these strings in sync.

### Part II. Optional Ranked Promotion Via Bounded Swap Optimization

**Paired implementation doc:** Engineering tasks, **Constraints 6–6f** (including **6c**: Step **3.2** + **3.3**; **6e**/**6f**: Part III vs Part II promotion), regression filenames, and `compareScores` ordering for Part II live in `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md` (Task Group B). **Read both** this spec and that plan—this file is the product/design contract; the plan is the execution checklist.

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
- **bounded slot swap:** two (or more) teams exchange placements so each side’s Step-3–owned coverage and ranked outcomes stay within the donor rules after the move.
- **donor-safe move with acceptable replacement:** the donor releases a slot only when the same move gives an acceptable replacement (coverage and ranked outcome rules still pass).
- **same-PCA sway:** a small coordinated reshuffle that changes **only which team and/or clock slot** one **named floating PCA** occupies—no new PCA enters the picture. The requester’s **ranked** placement improves; the donor stays **whole** (still satisfies required pending, fairness floor, and must not drop to a worse **preference rank** unless the same move restores an equally good ranked outcome, e.g. via a linked swap leg).

  Example: donor team *D* holds PCA *Alex* on slot 3 (*D*’s **#1** preference) and *Alex* again on slot 4. Requester *R* wants *Alex* on slot 3 for *R*’s **#1**. A valid **sway** might move *Alex* from *D*@3 to *D*@5 and place *Alex* on *R*@3 **only if** *D* still satisfies the donor rules (including keeping *D*’s **#1** ranked outcome—often this shape instead requires a **bounded swap**, not a one-way sway). A one-way sway that would strip *D*’s **#1** for *R*’s gain remains **disallowed**.

Disallowed:
- pure donation that causes donor net loss
- promotion that strips the donor’s **best satisfied ranked preference** (preference-order **#1** vs **#2**, not a higher numeric schedule score) unless the same bounded move restores an equally good ranked outcome for the donor
- promotion that removes donor fairness-floor protection
- promotion that trades one bug for another surplus/fairness regression
- any repair or promotion move that **removes, retargets, or replaces** a **Step 3.2** or **Step 3.3** user commit (see **User commit immutability**)

#### Requester eligibility
A requester team is eligible for optional promotion only if:
- it already satisfies its required pending target after Part I target logic
- it already satisfies required ranked coverage as defined by actual target demand
- it holds a lower-ranked or less desirable slot while a higher-ranked upgrade is still potentially reachable

This preserves the user's approved intent: a team that already got a lower-ranked slot does not lose the possibility of promotion, but that promotion is no longer allowed to harm another team through donation.

#### Donor protection
The donor-side contract must remain explicit. All donor harm checks in this phase use **Step-3–owned floating** assignments (same notion as *true Step-3-owned floating* in ranked V2 duplicate-floating and bounded-donation documentation), **not** raw slot occupancy: Step-2-only coverage on a clock slot does not count as the donor “still having” Step 3 fulfillment there.

The donor may participate only if the final state does not cause unacceptable harm:

- **Ranked preference:** the donor must not end with a worse **satisfied ranked preference** than before (e.g. it already had **#1** on a slot; giving that slot away so another team upgrades from **#2** to **#1** is blocked unless the **same** bounded move restores the donor to an equally good **#1** outcome).
- **Fairness floor:** the donor must not fall below fairness protection.
- **Net loss:** the donor must not suffer a net loss that the requester does not symmetrically accept in the same move (e.g. uncompensated one-way donation).

There is no separate bullet for “meaningful true Step 3 floating”: minimum Step-3–owned presence is already enforced by the fairness-floor and net-loss rules above when those checks are implemented on **Step-3–owned** rows, not on total bodies per slot.

#### Score and audit separation
The implementation should avoid encoding optional promotion as a fake "missing ranked defect."

Instead, this phase should have its own auditable concept, for example:
- optional promotion opportunity
- ranked-upgrade opportunity

The exact name may vary, but the behavior must remain distinct from required ranked-gap repair.

#### Placement relative to extra coverage
Part II should run in a place where it is not hidden by accidental surplus behavior. The **locked full V2 Step 3.4 orchestration order** (including **Part III**) is authoritative in **Part III — Locked allocator order** below; this subsection remains the Part II slice of that pipeline.

**Full Step 3.4 pipeline slice** (same numbering as **Locked allocator order**). **Allocator shorthand (post–draft core):** **R → G → P** = **R**equired repair → **G**ym avoidable (`G1`, spec **Part III**) → optional **P**romotion (spec **Part II**). *Roman numerals are spec **chapter** titles only; they are **not** runtime order — **chapter Part III runs before chapter Part II** in the allocator.*

1. draft allocation  
2. required repair loop (existing) **(R)**  
3. Part I–adjusted targets already in effect upstream of allocator inputs  
4. **Part III** gym-avoidable bounded repair **(G)** (see **Part III**)  
5. **Part II** optional ranked promotion **(P)** (bounded pass; then **close**); candidates must pass **Optional promotion guard**  
6. residual extra coverage (e.g. round-robin) **only if** still applicable  
7. second repair / final audit before freeze (existing **f99**-style re-audit discipline)

Optional ranked promotion must not be silently disabled by the earlier cap fix nor reintroduced as harmful donation. **Part III** runs **before** optional promotion so **avoidable gym** is addressed **first** when a bounded move could remove it; Part II then runs with **Constraint 6f** so promotion does not undo that outcome without product justification.

#### Phase termination (anti-churn)
Optional ranked promotion must **not** run as an open-ended “until every theoretical upgrade is exhausted” loop that could delay **residual extra coverage** (extra after needs) or thrash the schedule.

Requirements:
- Run optional promotion as a **single bounded pass**: enumerate a **finite** candidate set (swap / safe-move / same-PCA sway), apply **zero or more** acceptable moves under a **deterministic** ordering and an explicit **cap** on moves per freeze (e.g. one improvement pass, or at most *K* accepted moves with fixed tie-breaks), then **close** the phase.
- Do **not** leave a lingering internal state that blocks **residual extra coverage** (pipeline step **6**) or final freeze because “an upgrade might still exist” under a deeper search.
- An audit flag such as `P1` (“optional promotion opportunity”) means **“worth running the bounded pass once”**, not a persistent defect queue analogous to required repair.

#### User commit immutability (Step 3.2 and Step 3.3)
Assignments the user **explicitly commits** before Step 3.4 must not be undone by the backend allocator, audit, required repair, bounded donation, optional ranked promotion, **Part III gym-avoidance repair**, **AM/PM session-balance tie resolution**, swap, or sway—otherwise Step 3.2 / 3.3 lose meaning.

**Frozen anchors (V2 handoff metadata, e.g. `committedStep3Assignments` + explicit `source` / phase):**

1. **Step 3.2:** a **preferred PCA** bound to a **specific clock slot** (user’s preferred review choice).
2. **Step 3.3:** an **adjacent slot** assignment the user committed in the adjacent-slot step (same immutability: the engine must not “take that away” to satisfy promotion or repair elsewhere).

Implementation must distinguish these sources from draft-only Step 3.4 rows. If metadata does not yet split sub-steps, extend the handoff so **both** 3.2 and 3.3 commits are identifiable and filtered from destructive candidates.

#### Promotion scoring (Part II summary)
Among schedules that already satisfy **required** ranked coverage, fairness, and pending, optional promotion compares candidates using a **bounded pass** only (see **Phase termination**). **Lexicographic intent:** improve **first fulfilled ranked preference** (rank uplift) **before** optimizing **preferred PCA** hits on Step-3–owned rows; then retain existing tail goals (e.g. fewer gym last-resort uses, duplicate/split penalties) per the ranked V2 design. **Preferred PCA** must not be traded away at the cost of **rank** when rank can still improve without that trade. **AM/PM session balance** applies **only after** rank + preferred-PCA promotion ties are exhausted — see **AM / PM session balance (approved — Task Group D)** and implementation plan **Constraint 6d**.

#### Optional promotion guard (post–Part III; **Constraint 6f** in implementation plan)
After **Part III** has run, optional ranked promotion **must not accept** any candidate whose **post-move** schedule would **trigger `G1` for any team** (same **`G1`** definition and **Feasible non-gym reshuffle** feasibility test as Part III). Intuition: do not “swap back” onto **avoidable** gym occupancy for **avoid-gym** teams for the sake of rank polish when a **bounded off-gym** alternative still exists—matching manual practice (users edit gym away unless truly last resort). **True last resort** remains allowed: if the **only** feasible placements for required pending require the gym slot for an avoid-gym team, **`G1` does not fire** and promotion may still place there when overall lexicographic rules accept it.

#### AM / PM session balance (approved — Task Group D)
**Status:** **In scope** to ship in V2 via the paired implementation plan **Task Group D** (regressions **`f126`–`f128`** reserved there). This is **not** a new mandatory repair phase and **not** a new ranked-gap defect; it is a **soft** lexicographic preference **after** all existing `compareScores` objectives through **split penalty**, and **after** optional promotion’s **rank uplift** and **preferred PCA** tie metrics when those options are enabled.

**Session bands (default):** treat clock slots **1–2** as one session band and **3–4** as the other (HK-style day halves). Centralize in one module (e.g. helper next to `scoreSchedule.ts` or a small `amPmSessionBalance.ts`) so draft, promotion, and tests share the same mapping; a later spec may add configuration without changing call order.

**FTE tier → AM/PM role (locked):** All tiers use **pending floating** in **quarter-slot** count after the same rounding rules as the rest of Step 3. “Step-3–owned floating” for counting bands is the same notion as elsewhere in ranked V2 (not raw bodies on a slot).

| Pending floating (quarters) | Typical FTE | AM/PM session-balance tier |
|-----------------------------|-------------|----------------------------|
| **1** | **0.25** | **Neutral** — no band spread to optimize; do not emit a preference. |
| **2** | **0.5** | **Primary spread case** — among ties at higher objectives, prefer **1 slot per band** (**1+1**) when feasible (see **f126** in plan). |
| **3** | **0.75** | **Band + PCA trade ladder** — see **0.75 pending: product outcome ladder** and **Lexicographic mapping** below. |
| **4** | **1.0** | **Neutral at AM/PM tier** — four slots; **chunkiness** via **`duplicateFloatingCount`** then **`splitPenalty`** (see **≥1.0 FTE — chunk vs fragment**). |
| **≥ 5** | **> 1.0** | **Neutral at AM/PM tier** — duplicate pressure dominates; **chunk vs fragment** via **duplicate** + **split** + continuity above AM/PM. |

**0.75 pending: product outcome ladder (what clinicians want — narrative)**  
Pending **0.75 FTE** is **three** quarter slots. **Optimal AM/PM** means **0.5 FTE in one session band + 0.25 FTE in the other** (both bands used — **2+1** band histogram, not **3+0** all in one half-day).

- **Duplicate discipline:** **Tier 1** and **tier 2** are both **no-duplicate** outcomes (same **`duplicateFloatingCount`** policy — conventionally **0** duplicate pressure for the focal 0.75 slice). **Only tier 3** relaxes that and worsens **`duplicateFloatingCount`**.
- **Most optimal (tier 1, seldom):** that **2+1** band split **and** **non-split** for the team’s floating — ideally **one PCA** carries all three quarter assignments (e.g. footprints like slots **1–2–3** or **1–2–4** when rank / gym / global feasibility allow), **still no duplicate** (same duplicate tier as tier 2).
- **2nd tier (common good):** **AM/PM-correct** (**2+1** bands), **no duplicate** (same as tier 1 on duplicate), but **sacrifice non-split**: e.g. **PCA A** holds **0.5** as a **pair in one band** — slots **(1&2)** *or* **(3&4)** — and **PCA B** holds the **0.25** in the **other** band.
- **3rd tier (last resort):** may introduce **duplicate** patterns on PCA A’s slots **only** when **no** feasible layout meets pending while staying at tier 2 (or anchors / global supply force it). Lexicographically those layouts are **already worse** on **`duplicateFloatingCount`** than tier 1/2 — they lose whenever a tier-1 or tier-2 schedule exists.

**Lexicographic mapping (`compareScores` — how the narrative attaches to code)**  
`scoreSchedule.ts` orders **`duplicateFloatingCount`** (tier 7, lower better) **then** **`splitPenalty`** (tier 8, lower better) **then** optional promotion ties **then** Task Group D AM/PM. Therefore:

- **Tier 1 vs tier 2** is decided at **`splitPenalty`** (tier 8) — **`duplicateFloatingCount`** (tier 7) is **tied** because both tiers are **no-duplicate**.
- **Tier 2 vs tier 3** is decided **at duplicate** (tier 7) — tier 2 **no duplicate**, tier 3 worse duplicate — **not** inside the AM/PM helper.
- **Single-PCA “non-split” vs split across PCAs** (tier 1 vs 2) is **`splitPenalty`** / shape, still **before** AM/PM.
- For **0.75**, the **AM/PM metric** runs only among schedules **tied** through **`splitPenalty`** (and promotion when enabled): prefer **2+1** over **3+0**, then a **single deterministic** tie among remaining **2+1** patterns (document in code).

**Draft / candidate generation (recommended)**  
Enumerate / try **most optimal → 2nd → 3rd** when building candidates so tier 3 is rare; **`compareScores` remains authoritative** if a search path misses a better schedule.

**≥1.0 FTE — chunk vs fragment (not “one PCA must own all four slots”)**  
Users expect **chunky** coverage — e.g. **one PCA for a full 1.0 day**, or **0.75 + 0.25 on two PCAs** — **not** a habit of **four×0.25** from **four** different PCAs when **`splitPenalty`** and **`duplicateFloatingCount`** can still prefer fewer, larger fragments.

- **Not hard-coded:** do **not** require “all four quarters from one PCA.” **`splitPenalty`** (tier 8) and **`duplicateFloatingCount`** (tier 7) encode **fewer splits / saner fragments**; some valid days still use **2+** PCAs when rank, gym, fairness, or anchors require it.
- **AM/PM** stays **neutral** at the session-balance tier for **1.0** and **`> 1.0`** so band cosmetics never override chunk/split/duplicate.

**Anchors:** If Step **3.2** / **3.3** commits force **3+0** or a particular PCA/band pattern as the only feasible shape, **accept** it — AM/PM never overrides **Constraint 6c**.

**Continuity / duplicate / gym (global):** Session balance is **strictly weaker** than required repair invariants, ranked coverage, fairness floor, fulfilled pending, gym last-resort minimization, ranked-slot preservation, **duplicate** / **split** penalties, and promotion rank + preferred PCA — it only breaks ties among outcomes already tied at those layers. For **0.75**: **tier 1 vs tier 2** = **`splitPenalty`** only (**both no duplicate**); **tier 2 vs tier 3** = **`duplicateFloatingCount`** (**no duplicate** vs duplicate); AM/PM band helper only refines **2+1** vs **3+0** when those are tied.

**Engineering contract:** implement metrics + `compareScores` extension (and optional draft-level tie preference) per **Task Group D** in `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md`. **Constraint 6d** in that plan mirrors this section (FTE tiers, **0.75 PCA/band ladder + lexicographic mapping**, **≥1.0 chunk vs fragment** without mandating a single PCA for all four slots).

### Part III. Gym avoidable defect (post-draft repair)

**Paired implementation doc:** `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md` → **Task Group C** (regressions **`f121`–`f125`**). **Constraint 6e** in that plan: Part III must **not** change Part II optional-promotion **eligibility** rules (`G1` stays **out** of the defect list Part II reads). **Constraint 6f**: Part II must enforce **Optional promotion guard** (above).

#### Product model
- **Avoid gym** is a **preference**, not an absolute ban: when pending still forces coverage, a team may occupy the gym slot as **true last resort** — in that case **no `G1` defect** (see **Feasible non-gym reshuffle**).
- Part III answers **quality only**: “this team is on the gym while avoid-gym is on **and** a bounded reshuffle could move that coverage off the gym without breaking required repair invariants.” It does **not** answer Part II’s question (“rank uplift when coverage already satisfied”).

#### New required-repair–adjacent audit defect kind: `G1`
Add a first-class `RankedV2RepairDefect` variant:

- **`G1`:** `{ kind: 'G1'; team: Team }` — team **`T`** has **`avoidGym === true`**, a configured **`gymSlot`**, **`T`** occupies **`gymSlot`** with Step-3–owned floating (same notion as other ranked V2 audits), **and** a **feasible non-gym reshuffle** exists for **`T`** (definition below).

`G1` is **not** `B1`, **not** `P1`, and must **not** be folded into optional promotion **opportunity** detection. Required repair (`B1` / `F1` / …) continues to use existing rules; **`G1`** is detected and repaired only in the **Part III phase** (**before** Part II runs) so the **defect array that gates optional promotion** (`detectRankedV2RepairDefects` for Part II) **never includes `G1`** (**Constraint 6e**).

#### Feasible non-gym reshuffle (definition)
For team **`T`**, a reshuffle is **feasible** iff there exists **at least one** candidate move drawn from the **same bounded family** as required repair (**swap**, **bounded safe donation**, **sway** — **never harmful donation**), such that **all** of the following hold:

1. **Anchors:** Step **3.2** and **3.3** user commits remain unchanged (same bar as **Constraint 6c**).
2. **Required repair closure:** After the move, `detectRankedV2RepairDefects` reports **no** `B1`, `F1`, `A1`, `C1`, or `A2` defects (same zero-defect bar used today for “repair-valid” outcomes in the repair pass — adjust only if a later spec explicitly narrows `G1` repair’s defect check; default is **full required repair clear**).
3. **Gym:** Team **`T`** no longer places Step-3–owned floating coverage on **`gymSlot`**, **or** global **gym-last-resort** usage strictly decreases while **`T`** still meets pending (product-preference: prefer leaving **`T`** entirely off **`gymSlot`** when tied).
4. **No new harmful donor patterns:** Same donor-protection spirit as ranked repair (no uncompensated net loss, no fairness-floor breach).

If no candidate satisfies (1)–(4), the gym placement is **not** avoidable; **do not** emit `G1`.

#### Locked allocator order (full V2 Step 3.4 pipeline)
**Chapter vs runtime:** Spec **Part I / II / III** are **document section** names. In code, **chapter Part III (gym, `G1`) runs before chapter Part II (optional promotion)** — do not assume Roman numerals match call order.

**Post–draft core (memorize):** **R → G → P** — **R**equired repair → **G**ym pass (Part III) → **P**romotion (Part II).

Implementers must match this order in `lib/algorithms/floatingPcaV2/allocator.ts` (or documented successor):

1. Draft allocation  
2. Required repair loop (existing) **(R)**  
3. Part I–adjusted targets already in effect upstream of allocator inputs  
4. **Part III** gym-avoidable bounded repair **(G):** detect `G1` per eligible team; run repair candidates that improve gym story **only** for `G1` targets; then **close** this phase (**do not** re-enter Part III from Part II)  
5. **Part II** optional ranked promotion **(P)** (bounded pass; then **close**); candidates must pass **Optional promotion guard**  
6. Residual extra coverage (e.g. round-robin) **only if** still applicable  
7. Second repair / final audit before freeze (existing **f99**-style re-audit discipline)

**Part II** optional promotion **must not start** until **step 4** (Part III) has **completed** (even if zero `G1` repairs were applied). **Part II** must not accept moves that **reintroduce** **`G1`** (see **Optional promotion guard**).

#### Phase termination and cap (Part III)
- **Cap:** `MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS` — use **`6`** unless a later perf review changes it; must be **≤** `MAX_REPAIR_ITERATIONS` for the main repair loop and documented beside it.
- **Single bounded pass family:** Like Part II, no open-ended “search until perfect” loop. After the cap, proceed to step **6** even if a theoretical deeper reshuffle could exist.
- **Scoring objective:** Moves are scored **only** for gym-avoidance / gym-last-resort reduction subject to (1)–(4) in **Feasible non-gym reshuffle** — **not** for rank uplift (Part II owns rank-first lexicographic promotion).

#### UI and tooltip (single source of truth)
- **In scope:** When a row is attributable to **gym last resort** vs **gym avoidance repair** vs **“gym unavoidable given pending”**, Step **3.4** in-dialog copy and the **PCA tracker tooltip** must show the **same** user-facing strings (no drift). Centralize short labels + optional long line in **`lib/features/schedule/v2GymUiStrings.ts`** (or a sibling module imported by both Step 3.4 view model and tooltip builder).
- **Step 3.4** should reuse the same provenance keys/strings as the tooltip for **gym avoidance** outcomes (chips, captions, or assignment footnotes — whichever Step 3.4 already uses for surplus/promotion provenance).
- **V2 tracker repair reason / audit pill copy** (continuity vs optional promotion, etc.) is locked in **Locked decision — V2 PCA tracker repair reason strings** above; implement in `lib/features/schedule/pcaTrackerTooltip.ts` and keep the paired implementation plan copy deck aligned.

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
If a higher-ranked promotion would require the donor team to give up its **best satisfied ranked preference**, fall below the **fairness floor**, or suffer an **uncompensated net loss**, the promotion must stay blocked even if the requester's rank would improve.

## Error Handling and Edge Cases
- If executable slack is zero or negative, Part I should produce zero surplus uplift and behave like the ordinary target path.
- If a therapist-weighted share produces fractional uplift that rounds away, the reconciliation step must still preserve the global slack-slot sum.
- If all candidate recipients are already near thresholds, the reconciliation pass must remain deterministic.
- If Step 2 data changes after the user sees the toast, Step 3.1 must recompute and use live state rather than trusting stale projection state.
- If a team's target is uplifted by surplus but no final Step 3.4 allocation results from that uplift, tooltip/provenance should stay silent rather than implying a surplus-driven slot existed.
- If optional ranked promotion has no bounded no-net-loss path, the final result should remain at the required-coverage state without manufacturing a promotion.
- If optional ranked promotion applies some moves then exhausts its bounded pass, orchestration must still proceed to residual extra coverage and final audit; it must not loop until `P1` can no longer be detected at any search depth.
- If **Part III** exhausts `MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS`, proceed to extra coverage; do not block freeze while “a better gym swap might exist” at unbounded depth.
- If a team is on the gym with avoid-gym but **no** candidate satisfies **Feasible non-gym reshuffle**, do not emit `G1`; tooltips may still label **true last resort** gym usage.
- If **0.75 FTE** pending and anchors (or higher objectives) force **3+0** as the only feasible Step-3–owned pattern, AM/PM must **not** block or “repair away” that outcome at the session-balance tier.
- If tier-3 (**duplicate-allowed**) is the **only** way to satisfy pending / slot availability while respecting anchors, accept it — lexicography already ranks it below tier-2 when alternatives exist.

## Testing Guidance
This design should be implemented with focused regressions around:

- AM/PM session balance (**Task Group D**, **`f126`–`f132`**): **0.5** → **1+1** when higher objectives tied; **0.75** → **f129**–**f132** prove **tier 1** & **tier 2** both **no duplicate**, **`splitPenalty`** for **1 vs 2**, **`duplicateFloatingCount`** for **2 vs 3**, AM/PM for **2+1** vs **3+0** when dup+split tied; **1.0** / **`> 1.0`** → **neutral** AM/PM, **chunk vs four×0.25** via **`splitPenalty`**/**duplicate**; **0.25** neutral; no override of Step **3.2** / **3.3** anchors
- Step 2-end surplus-aware target projection uses the same model as Step 3.1 initialization
- raw/base target plus weighted surplus is rounded once at the end, not rounded first and then uplifted
- raw continuous surplus is the weighting input for the ideal distribution
- executable slack is the realizability cap for quarter-slot grants
- the global redistributed slack-slot sum is preserved after rounding reconciliation
- therapist-weighted redistribution favors teams according to demand share rather than round-robin order
- Step 3.4 tooltip/provenance can explain a **raised target (shared spare)** final slot without adding a large new badge; minimal chips per **Locked decision 2**
- optional ranked promotion remains possible after required coverage is satisfied
- optional ranked promotion succeeds for bounded swap/safe-move cases
- optional ranked promotion rejects harmful donation cases
- optional ranked promotion runs in a **single bounded pass** and always yields to residual extra coverage + final audit (no unbounded `P1` loop)
- Step 3.2 preferred PCA+slot and Step 3.3 adjacent-slot commits stay immutable under repair, optional promotion, and **Part III** gym-avoidance repair
- **Part III (`G1`, gym-avoidance repair) + Part II guard:** implement **`f121`–`f125`** in the paired plan (Task Group C / **Constraint 6f**); **AM/PM:** **`f126`–`f132`** (Task Group D, including **0.75** tiers **f129**–**f132**)
- required ranked-gap repair remains distinct from optional ranked promotion
- V1 behavior stays unchanged when only V2-owned files are touched

## Primary Files / Areas
- `lib/features/schedule/step3Bootstrap.ts`
- Step 2 / Step 3 controller wiring where target deltas and Step 3 entry state are built
- `app/(dashboard)/help/avg-and-slots/page.tsx` (Part I user literacy)
- `components/help/avgPcaFormulaSteps.tsx`, `components/help/AvgPcaFormulaPopoverContent.tsx`, `components/help/HelpCenterContent.tsx` (popover + Help Center entry)
- `components/schedule/ScheduleBlocks1To6.tsx`, `app/(dashboard)/schedule/page.tsx` (Avg formula popover hosts)
- `components/allocation/FloatingPCAConfigDialogV2.tsx`, `components/allocation/step34/step34ViewModel.ts` (Part III: **shared** gym-avoidance copy with tooltip)
- `lib/algorithms/floatingPcaV2/allocator.ts`
- `lib/algorithms/floatingPcaV2/repairAudit.ts`
- `lib/algorithms/floatingPcaV2/repairMoves.ts`
- `lib/algorithms/floatingPcaV2/scoreSchedule.ts` (Part II promotion tie-breaks; **Task Group D** AM/PM session-balance metrics + `compareScores` extension)
- `lib/algorithms/floatingPcaV2/draftAllocation.ts` (optional draft-level ties per **Task Group D**)
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`, `lib/features/schedule/v2GymUiStrings.ts` (Part III: **shared** gym-avoidance copy with tooltip)
- shared contracts/types only where needed to carry metadata safely across consumers

## Implementation Notes
- **Execution checklist:** `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md` (Task Groups A/B/C/**D**, constraints, regressions). Implementers should follow **this spec + that plan** together; **Part III** = Task Group C; **AM/PM** = Task Group D. **Allocator mnemonic:** **R → G → P** (see **Locked allocator order** — **chapter Part III before chapter Part II** in code). AM/PM does **not** change that order; it layers into **scoring / ties** only (**Constraint 6d** in the plan).
- This is a V2-only design unless a later approved spec explicitly expands scope.
- `rawAveragePCAPerTeam` stays the base developer-facing value and must not be overwritten by surplus-adjusted targets.
- The target pipeline should be explainable as raw input -> weighted redistribution -> quarter-based operational output.
- The tooltip/provenance hint is intentionally tiny and should not become a new major UI concept.
- Part I is foundational and may be implemented first on its own.
- Part II should remain separable from Part III: implement **Task Group C** without changing optional-promotion **eligibility** contracts (**Constraint 6e** in the plan) and with **Constraint 6f** guard on promotion candidates.
- AM / PM session balance is **approved** — see **AM / PM session balance (approved — Task Group D)** and implementation plan **Task Group D** / **Constraint 6d**.
