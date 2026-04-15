# V2 Step 3 Surplus-Aware Targets and Ranked Swap Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the new V2-only Step 3 target pipeline so surplus-aware rounded pending is projected consistently from Step 2 into Step 3.1, then add a separate optional ranked-promotion phase that allows bounded no-net-loss swap optimization without harmful donation, with **promotion scoring** that prefers **ranked-slot uplift** first and **preferred PCA** satisfaction second, then **AM/PM session balance** as a **soft** tie-break (**Task Group D**, **Constraint 6d**). **Immutable** user commits from **Step 3.2** (preferred PCA on a slot) and **Step 3.3** (adjacent slot) apply to repair, promotion, Part III gym repair, and AM/PM tie logic (**Constraint 6c**). **Task Group C (Part III)** adds gym-avoidable `G1` audit + bounded repair + shared Step 3.4 / tooltip copy — see design spec **Part III** and [Task Group C](#task-group-c-part-iii-gym-avoidable-defect-post-draft-repair) below. **Task Group D** ships **AM/PM session balance** per design spec **AM / PM session balance (approved — Task Group D)** and [Task Group D](#task-group-d-am--pm-session-balance) below.

**Architecture:** Treat the work as **four** engineering task groups (A–D). Task Group A introduces a shared `Step3TargetProjection`-style surplus-aware target calculation that keeps raw therapist-weighted demand separate from realized quarter-slot output while making Step 2 deltas and Step 3.1 initialization consume the same projection. Task Group B implements **Part II** optional ranked promotion (bounded pass, distinct from `B1`). Task Group C implements **Part III** gym avoidance (`G1`, **`MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS = 6`**); **Constraint 6e** forbids changing Part II promotion **eligibility** contracts to satisfy gym goals. **Task Group D** implements **AM/PM session balance**: new metrics + `compareScores` / optional-promotion tie extension + optional **draft**-level soft preference — **no** new mandatory repair loop and **no** change to **`R → G → P`** allocator phase order (**Constraint 6d**). **Repo task order (A → B → C → D) is not allocator order.** **Locked allocator orchestration** after draft + required repair remains **`R → G → P`**: **R**equired repair → **G**ym pass (**Part III**, `G1`) → **P**romotion (**Part II**) → residual extra coverage → final audit. **Spec Roman numerals II vs III are chapter titles only — `allocator.ts` must run Part III before Part II.** Promotion compares candidates with **rank-first** then **preferred-PCA** tie metrics, then **session-balance** when **Task Group D** wiring enables that tier (**Constraint 6d**). **Step 3.2** and **Step 3.3** user commits stay **frozen** for repair, promotion, gym repair, and AM/PM resolution. Tiny provenance text for surplus/promotion/gym stories feeds **both** Step 3.4 and tracker tooltips from one module (`v2PcaTrackerTooltipModel.ts` or a thin re-export consumed by `step34ViewModel.ts`).

**Tech Stack:** TypeScript, React/Next.js, V2 ranked-slot allocator in `lib/algorithms/floatingPcaV2/`, Step 3 feature logic in `lib/features/schedule/`, shared rounding helpers, focused Node/`tsx` regression tests, IDE lints for touched TS/TSX files.

---

## Scope and Boundaries

### V2-only rule
- All behavior changes in this plan are V2-only unless a task explicitly says otherwise.
- Do not modify `lib/algorithms/floatingPcaLegacy/`.
- Do not add new ranked-slot policy to `lib/utils/floatingPCAHelpers.ts`.
- Do not reintroduce substantive behavior into `lib/algorithms/pcaAllocationFloating.ts`.

### Shared-surface discipline
- Shared files may be touched only when they carry version-agnostic types or projection metadata required by V2 consumers.
- Any shared-file task must preserve V1 behavior and include a focused regression or characterization check.

### Existing debug instrumentation
- This repo currently contains active investigation instrumentation in some touched files.
- Do not remove or refactor unrelated instrumentation as part of this plan unless the user explicitly expands scope.
- Keep new logic easy to trace so a later cleanup task can remove instrumentation safely.

## File Structure

### Task Group A: Surplus-aware target pipeline
- Add: `app/(dashboard)/help/avg-and-slots/page.tsx`
  - Plain-language guide: continuous FTE vs slots; scarcity/slack; raised target (shared spare) vs extra after needs (per Part I spec copy deck).
- Add: `components/help/avgPcaFormulaSteps.tsx`, `components/help/AvgPcaFormulaPopoverContent.tsx`
  - Shared formula copy + popover body (formula, sanity check slot, teaser + link to full guide).
- Modify: `components/help/HelpCenterContent.tsx`
  - “Guides” card linking to `/help/avg-and-slots`.
- Modify: `components/schedule/ScheduleBlocks1To6.tsx`, `app/(dashboard)/schedule/page.tsx`
  - Replace duplicated Avg PCA popover markup with `AvgPcaFormulaPopoverContent` (schedule page keeps live sanity-check footer).
- Modify: `lib/features/schedule/step3Bootstrap.ts`
  - Expand bootstrap summary into a surplus-aware target projection model while preserving current callers during migration.
- Modify: `lib/features/schedule/controller/useScheduleController.ts`
  - Compute and store the Step 2-end projection; feed the same projection semantics into Step 3 entry.
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`
  - Initialize Step 3.1 from surplus-aware rounded pending rather than frozen pre-surplus pending.
- Modify if needed: shared Step 2 page/controller consumers that render the Step 3 delta toast/state comparison
  - Make the visible delta reflect the final surplus-aware rounded target change.
- Modify if needed: `types/schedule.ts` or nearby shared contracts
  - Carry tiny V2-only target/provenance metadata needed by tooltip consumers.
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
  - Add tooltip/provenance wording for raised target (shared spare) outcomes without adding visible new badges.

### Task Group B: Optional ranked promotion via bounded swap optimization
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
  - Introduce a distinct optional-promotion opportunity concept without overloading required ranked-gap defects.
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
  - Generate bounded swap/safe-move/same-PCA-sway candidates for optional ranked promotion; **exclude** any candidate that would move **Step 3.2** or **Step 3.3** user-commit anchors (**Constraint 6c**).
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
  - Score optional promotion outcomes separately from required ranked-gap satisfaction; **Task Group D** adds AM/PM session-balance metrics and `compareScores` ordering per **Constraint 6d** (do **not** reorder objectives ahead of promotion rank / preferred PCA).
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
  - Insert the optional promotion phase **after** the Part III gym pass (**`R → G → P`** — see **Task Group C** and design **Locked allocator order**).
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
  - Surface tiny provenance text for ranked-promotion outcomes when a repair/promotion row should explain itself.

### Task Group C (Part III): Gym avoidable defect (post-draft repair)
**Status in this worktree:** **Not started** — design + plan are authoritative; implement in a dedicated session.

- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
  - Add **`G1`** to `RankedV2RepairDefect`; implement `detectRankedV2GymAvoidableDefects` (or equivalent) per design spec **Feasible non-gym reshuffle**; **`G1` must not** be mixed into `detectOptionalRankedPromotionOpportunities` or `B1` repair defect sorting unless product explicitly merges them later.
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
  - Reuse or fork bounded candidate generation for **gym-only objective** moves (swap / safe donation / sway); exclude Step 3.2 / 3.3 anchors (**Constraint 6c**).
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts` (if needed)
  - Auxiliary scoring or tie-break for gym-avoidance pass only — **do not** reuse Part II `includeOptionalPromotionTieBreak` for `G1` repair.
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
  - Insert **Part III** pass at **locked order** (design spec **Locked allocator order**): **after** required repair, **before** Part II optional promotion, **before** `applyExtraCoverageRoundRobin`; constant **`MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS = 6`**.
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts` and **`components/allocation/step34/step34ViewModel.ts`** (and/or `FloatingPCAConfigDialogV2.tsx`)
  - **Single source** for user-visible gym-avoidance / gym-last-resort / unavoidable strings so Step 3.4 and tracker tooltips stay aligned.

### Task Group D: AM / PM session balance (soft lexicographic layer)
**Status:** **Ship in this plan** — design contract: `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` → **AM / PM session balance (approved — Task Group D)**.

- Add (recommended): `lib/algorithms/floatingPcaV2/amPmSessionBalance.ts` (or equivalent)
  - **Single source** for default **session bands** (slots **1–2** vs **3–4**), Step-3–owned floating slot counts per team per band, and a deterministic **session balance score** per **Constraint 6d** / design: **neutral** for 1, 4, or **≥5** quarters pending; **2** quarters → **1+1**; **3** quarters → AM/PM sub-tier **2+1** vs **3+0** only (0.75 **narrative** tier 2/3 lives in **duplicate**/**split** first).
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
  - Extend `RankedSlotAllocationScore` with session-balance fields; extend `compareScores` with an option such as `includeAmPmSessionBalanceTieBreak` that runs **only after** existing tiers through **split penalty** and **after** `includeOptionalPromotionTieBreak` rank + preferred PCA comparisons when both schedules are tied there.
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
  - Thread the new `compareScores` option anywhere promotion (and, if applicable, repair move acceptance) compares **tied** candidate schedules — **never** accept a worse required-repair / `G1` outcome for session balance (**Constraint 6c**, **Constraint 6f**).
- Modify: `lib/algorithms/floatingPcaV2/draftAllocation.ts` (optional but recommended)
  - When the draft stage chooses among **ties** at the pre-existing score resolution, prefer better session balance **without** violating ranked preference, anchors, or donor rules.
- Modify (optional): `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
  - Only if product wants a visible “why” line; otherwise allocator-only.

### Regression tests

#### Task Group A tests
- Create: `tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts`
- Create: `tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts`
- Create: `tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts`
- Create: `tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts`
- Create: `tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts`

#### Task Group B tests
- Create: `tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- Create: `tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- Create: `tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`
- Create: `tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`
- Create: `tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts` (filename illustrative — **pick next free `f11x`** per repository note; asserts optional promotion + repair never relocate **Step 3.2** preferred PCA+slot or **Step 3.3** adjacent-slot commits)

**Repository note:** The original sketch used `f111`–`f115`; this repo already used those numbers for other contracts, so Task Group B tests are **`f116`–`f120`** (see bullets above and **Implementation status** under Task Group B).

#### Task Group C tests (Part III — reserved filenames)
Create when executing Task Group C (names are **locked**; do not reuse for unrelated contracts):

- Create: `tests/regression/f121-step34-v2-g1-detected-when-avoid-gym-and-feasible-non-gym-reshuffle-exists.test.ts`
- Create: `tests/regression/f122-step34-v2-g1-not-raised-when-gym-is-true-last-resort-only.test.ts`
- Create: `tests/regression/f123-step34-v2-gym-avoidance-repair-moves-off-gym-without-reintroducing-required-repair-defects.test.ts`
- Create: `tests/regression/f124-step34-v2-gym-avoidance-repair-respects-step32-step33-commit-immutability.test.ts`
- Create: `tests/regression/f125-step34-v2-part-ii-optional-promotion-defect-gates-unchanged-by-part-iii.test.ts` (assert optional promotion still requires **zero** required-repair defects for its pass; Part III does not relax `isValidPromotionOutcome` / allocator promotion `break` conditions)

**Repository note (Task Group C):** **`f121`–`f125`** are reserved for Part III.

#### Task Group D tests (AM / PM — reserved filenames)
Create when executing **Task Group D** (names **locked** for this contract):

- Create: `tests/regression/f126-step34-v2-am-pm-session-balance-prefers-spread-for-half-fte-two-slots.test.ts` (fixture: **0.5 FTE** pending → two slots; among otherwise tied placements, outcome spreads across **1–2** vs **3–4** bands when feasible)
- Create: `tests/regression/f127-step34-v2-am-pm-session-balance-neutral-for-quarter-fte.test.ts` (**0.25 FTE** — session metric must not force artificial preference)
- Create: `tests/regression/f128-step34-v2-am-pm-session-balance-does-not-override-step32-step33-anchors.test.ts` (anchors from **Constraint 6c**; session balance may not justify moving committed 3.2 / 3.3 rows)

#### 0.75 FTE — locked regression matrix (tiers **1 → 2 → 3**)

These files exist so **lexicographic behavior is provable**, not only described in **Constraint 6d**. Each test constructs **two** (or three) schedules with **controlled** `RankedSlotAllocationScore` fields (via `buildRankedSlotAllocationScore` / real minimal allocations — whichever is already used in sibling regressions). **Tier names** match the design spec **0.75 pending: product outcome ladder**. **Duplicate discipline:** **tier 1** and **tier 2** are both **no-duplicate**; **only tier 3** worsens **`duplicateFloatingCount`** relative to them.

| File | Tiers compared | What must be **identical** (match on these first) | What must **differ** (the discriminant) | Assertion |
|------|----------------|-----------------------------------------------------|------------------------------------------|------------|
| **f129** | **1 vs 2** | **`duplicateFloatingCount` (tier 7) identical** — **tier 1** and **tier 2** are both **no-duplicate** outcomes (conventionally both **0** duplicate pressure for the focal slice; assert equality explicitly in the test). All objectives **through tier 7** match. | **`splitPenalty`** (tier 8): **tier 1** = one PCA holds all **three** quarter slots (non-split triple); **tier 2** = **PCA A** holds **0.5** in one band **(slots 1&2 *or* 3&4)** and **PCA B** holds **0.25** in the **other** band (split across PCAs). | `compareScores(tier1, tier2, opts) < 0` — **tier 1 wins on split alone**; **do not** pass `includeAmPmSessionBalanceTieBreak` unless promotion flags are required for equality above tier 8. |
| **f130** | **2 vs 3** | Through **`splitPenalty`** inclusive: **split** matches; every objective **strictly before** tier 7 matches. **Tier 2** remains **no-duplicate** (same as tier 1 on duplicate policy). | **`duplicateFloatingCount`** (tier 7): **tier 2** strictly **lower** (better) than **tier 3** — **only tier 3** carries the relaxed / worse duplicate pattern per ranked V2. | `compareScores(tier2, tier3, opts) < 0` — **tier 2 wins on duplicate** before AM/PM runs. |
| **f131** | **AM/PM sub-tier only** | **`duplicateFloatingCount`**, **`splitPenalty`**, and all objectives **above** tier 8 match; optional promotion tie fields match if used in the call site under test. | **Band histogram only:** **2+1** (both bands used) vs **3+0** (all three slots in one band) for the same team’s Step-3–owned floating. | With `includeAmPmSessionBalanceTieBreak: true` (final flag name per implementation), `compareScores(twoPlusOne, threePlusZero, fullOpts) < 0`. |
| **f132** | **1 vs 3** (integration) | N/A — end-to-end ordering on constructed pair. | Composite: **tier 1** must lexicographically beat **tier 3** without relying on AM/PM (duplicate and/or split already differ). | `compareScores(tier1, tier3, opts) < 0`; document in test which **first differing tier** is (expect **7 or 8** for chosen fixtures). |

**Fixture discipline (all of f129–f132):**
- Focal team pending floating = **0.75 FTE** (**three** quarter slots) for the scenario under test.
- Document in each file: **which PCA ids** occupy **which slots** for tier 1 / 2 / 3; keep all **non-focal** teams/slots **identical** between compared schedules so diffs are only the tier story.
- Prefer **real minimal allocations** from the same harness style as **f116**–**f120**; use **synthetic score objects** only if an existing regression already does and code owners agree — if synthetic, add a one-line comment that allocator integration is covered separately.

**Additional locked filenames (0.75 tier contract):**

- Create: `tests/regression/f129-step34-v2-am-pm-075-tier1-non-split-beats-tier2-split-when-duplicate-tied.test.ts` (matrix row **f129** — filename means **`duplicateFloatingCount` tied** — **tier 1** & **tier 2** both **no duplicate**, typically **0**)
- Create: `tests/regression/f130-step34-v2-am-pm-075-tier2-no-dup-beats-tier3-dup-when-split-tied.test.ts` (row **f130**)
- Create: `tests/regression/f131-step34-v2-am-pm-075-am-pm-two-plus-one-beats-three-plus-zero-when-dup-split-tied.test.ts` (row **f131**)
- Create: `tests/regression/f132-step34-v2-am-pm-075-tier1-beats-tier3-lexicographic-order.test.ts` (row **f132**)

**1.0 / >1.0 chunk (recommended next; lock filenames when added):** AM/PM neutral on band-only permutations; **`splitPenalty`** distinguishes **chunky** vs **four×0.25** when duplicate tied — reserve **`f133+`** for those until promoted to locked names beside **`f126`–`f132`**.

**Repository note (Task Group D):** **`f126`–`f132`** are reserved for AM/PM (including **0.75** tier matrix); pick **`f133+`** for **≥1.0** chunk tests or unrelated regressions.

### Files that must stay untouched
- Do not modify: `lib/algorithms/floatingPcaLegacy/allocator.ts`
- Do not modify: `lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts`
- Do not modify: `lib/algorithms/pcaAllocationFloating.ts` except for type-only wiring if explicitly required and proven behavior-neutral

## Implementation Constraints

### Constraint 1: Raw surplus and executable slack must stay distinct
Task Group A must preserve the conceptual distinction from the spec:
- `rawSurplusFte` is the continuous weighting input
- `idealWeightedSurplusShareByTeam` is the fair ideal distribution
- `redistributableSlackSlots` is the executable quarter-slot cap

Disallowed:
- treating `redistributableSlackSlots` as the only surplus concept in the math layer
- treating `rawSurplusFte` as direct allocator authority without executable-slot capping

### Constraint 2: Never round before applying the ideal uplift
The new target projection must not perform:
- `rounded pending + surplus`
- `rounded raw floating + surplus`

Required order:
1. raw/base targets
2. raw surplus
3. ideal weighted share
4. executable slack cap
5. realized quarter-slot grants
6. final quarter rounding
7. sum-preserving reconciliation

### Constraint 3: Step 2 and Step 3.1 must speak the same target language
If Task Group A changes the target model, the same surplus-aware rounded result must be used by:
- Step 2 delta/toast messaging
- Step 3.1 initial pending values
- any Step 3 stale/out-of-date comparison that depends on bootstrap targets

### Constraint 4: Tooltip hint tiny; literacy via Help + popover (no new surplus badges)
Surplus-adjustment explanation is **first** tooltip/provenance on the Step 3.4 tracker. **Additionally**, Part I allows the `/help/avg-and-slots` article and the extended Avg PCA/team **popover** (link + short teaser) per the spec—plain language, no new Step 3.4 summary badges.

Disallowed:
- new summary-card badges for surplus
- new lane chips
- broad UI redesign for surplus

### Constraint 5: Optional promotion is not a B1 defect
Task Group B must add a distinct concept for optional ranked promotion. It must not:
- re-expand `B1` so multiple listed ranked slots become required again
- encode optional ranked promotion as a fake required defect

### Constraint 6: Optional promotion is no-net-loss only
Task Group B may use:
- bounded swap
- donor-safe move
- same-PCA sway (single-PCA coordinated reshuffle; see design spec **Allowed promotion shapes** for definition and example)

Task Group B must reject:
- harmful donation
- donor loss of best **ranked preference** outcome unless the **same** bounded move restores an equally good ranked outcome for the donor (see design spec **Donor protection**)
- donor fairness-floor loss
- donor net loss that the requester does not symmetrically accept in the same move

Donor checks must use **Step-3–owned floating** semantics (not raw slot occupancy), consistent with bounded donation and duplicate-floating specs—without treating that as a separate free-standing rule beyond fairness + net loss + ranked outcome.

### Constraint 6b: Optional promotion phase must terminate deterministically
- Run optional promotion as a **single bounded pass** (finite candidate set, deterministic ordering, explicit cap on accepted moves per freeze), then **close** the phase and proceed to residual extra coverage and final audit per the design spec **Phase termination (anti-churn)**.
- Do **not** implement `while (promotionOpportunity) { … }` without a hard cap; do **not** block extra-after-needs placement on “promotion might still exist” at a deeper search depth.
- `P1` (or equivalent) is an opportunity signal for **one** bounded pass, not a persistent required-defect queue.

### Constraint 6c: Step 3.2 and Step 3.3 user commits are immutable for repair, optional promotion, and Part III gym repair
End users commit concrete placements **before** Step 3.4. Those choices must not be undone later by audit, required repair, bounded donation, optional ranked promotion, **Part III gym-avoidance repair**, swap, or sway.

**Frozen anchors (both equally protected):**

1. **Step 3.2:** **preferred PCA** on a **specific clock slot** (preferred review).
2. **Step 3.3:** **adjacent slot** assignment the user committed in the adjacent-slot step.

**Rules:**
- Candidate repair/promotion moves must **not** remove, retarget, replace, or “donate away” any row identified as either of the above.
- **Implementation:** thread explicit provenance on `FloatingPCAAllocationContextV2` / `committedStep3Assignments` (or adjacent handoff) with a `source` (or equivalent), e.g. `step32-preferred` vs `step33-adjacent` (names illustrative). If the payload today mixes sub-steps without flags, **add** fields so **both** classes are filterable from destructive candidates.
- **Required repair** (`B1` / `F1` / duplicate paths) must respect the same immutability: never “fix” the schedule by tearing out a Step 3.2 or Step 3.3 user commit.

**Regression:** add a dedicated test (see Task Group B tests — `f115` placeholder name; pick next free `f11x` per repository note) that fails if optional promotion or repair moves **either** a Step 3.2 preferred anchor **or** a Step 3.3 adjacent anchor.

### Constraint 6d: AM / PM session balance (Task Group D — locked lexicographic order)
**Ship:** **Task Group D** implements AM/PM as a **soft** preference only. **Product mirror:** design spec **AM / PM session balance (approved — Task Group D)** (FTE tier table, **0.75 PCA/band narrative + lexicographic mapping**, **≥1.0 chunk vs fragment**).

**Ordering (non-negotiable):** Session balance compares **only after** all of the following are already equal between two candidate schedules:
1. Every existing `compareScores` objective through **`splitPenalty`** (ranked coverage, ranked-gap satisfaction, fairness, fulfilled pending, gym last resort, ranked-slot match, **tier 7** `duplicateFloatingCount`, **tier 8** `splitPenalty` — same stack as today).
2. When optional promotion tie-break is in play, **after** `promotionTrueStep3RankScore` **and** `promotionTrueStep3PreferredPcaHits` are equal.

**0.75 pending — product narrative vs code (implementers must not conflate):**
- **Tier 1 vs tier 2 — both no duplicate:** **Most optimal** and **2nd tier** both satisfy **no duplicate-floating pressure** (`duplicateFloatingCount` tied, typically **0**). The quality gap between them is **`splitPenalty`** only (non-split single PCA vs split A+B).
- **Most optimal (tier 1):** **2+1** bands + **one PCA** non-split triple + **no duplicate** (design examples: slots **1–2–3**, **1–2–4** when feasible).
- **2nd tier:** **2+1** bands + **no duplicate** (same duplicate tier as tier 1), **split** across PCAs (e.g. PCA A **(1&2)** or **(3&4)** for 0.5, PCA B other band for 0.25).
- **3rd tier:** **duplicate** allowed for pending only when tier 2 infeasible — **strictly worse** `duplicateFloatingCount` than tier 1/2; AM/PM does **not** implement this trade-off.
- **Draft heuristic:** try **most optimal → 2nd → 3rd** when generating candidates; **`compareScores` wins** if the search misses a better schedule.

**FTE tier → metric (implement exactly):**
- **1 quarter (0.25 FTE):** session-balance component **neutral** for that team.
- **2 quarters (0.5 FTE):** primary spread — prefer **1+1** across bands when feasible at this tier (regression **f126**).
- **3 quarters (0.75 FTE):** **AM/PM sub-tier only** among schedules **already tied** on duplicate + split + …: (a) prefer **2+1** over **3+0**; (b) among **2+1**, deterministic tie-break (document in code). **Never** rank **3+0** above **2+1** at this sub-tier. **Do not** use AM/PM to bypass better duplicate/split outcomes from tier 2 vs 3.
- **4 quarters (1.0 FTE):** session-balance component **neutral** — prefer **chunky** staffing (**one PCA 1.0**, or **0.75+0.25**, etc.) via **`splitPenalty`** / **`duplicateFloatingCount`**, **not** by mandating “one PCA owns all four slots.”
- **≥ 5 quarters (> 1.0 FTE):** session-balance component **neutral** — same **chunk vs four×0.25** story via **duplicate** + **split** + continuity **above** AM/PM.

**Rules:**
- **Bands:** default slots **1–2** vs **3–4** (see design spec **AM / PM session balance**); centralize constants/helpers so draft + promotion + tests cannot drift.
- **Safety:** AM/PM must **never** override required repair validity, **Constraint 6c** user commits, **Constraint 6f** / `G1` post-promotion guard, or harmful-donation / donor-protection rules. If anchors or higher objectives force **3+0** for 0.75, **accept** it.
- **Task Group B scope:** Do **not** interleave AM/PM **before** promotion rank + preferred PCA inside `includeOptionalPromotionTieBreak`; add a **separate** `compareScores` flag or tier **after** that block (see **Task Group D**).

### Constraint 6e: Part III must not change Part II optional promotion contracts
Task Group C (**gym avoidance**, `G1`) must **not**:

- relax `detectOptionalRankedPromotionOpportunities`, `isValidPromotionOutcome`, or allocator branches so optional promotion runs while **any** required-repair defect remains (including **A2-only** residual lists);
- encode gym improvement as a **P1** / `B1` hybrid or reuse Part II `compareScores(..., { includeOptionalPromotionTieBreak: true })` for `G1` move selection unless product opens a new approved spec.

Gym-only repair uses its **own** bounded loop, cap, and scoring slice per design spec **Part III**.

### Constraint 6f: Optional promotion must not reintroduce avoidable gym (`G1`)
**Allocator order reminder:** Part III (**G**) runs **before** Part II optional promotion (**P**) — **`R → G → P`**.

After the **Part III** pass has **completed**, Part II **must reject** any promotion candidate whose **post-move** schedule would **trigger `G1`** for any team (same **`G1`** definition and **Feasible non-gym reshuffle** test as the design spec **Optional promotion guard**). Intuition: do not trade rank polish for **avoidable** gym occupancy when Part III already established the guardrail.

### Part III handoff (gym avoidable defect)
**Not implemented in Task Groups A/B.** Full product contract: design spec **`### Part III. Gym avoidable defect (post-draft repair)`**. Full execution checklist, locked allocator order (**`R → G → P`** — gym **before** optional promotion; spec **Part I/II/III** = chapters, not call order), `G1` definition, **`MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS = 6`**, UI/tooltip single-source rule, and reserved regressions **`f121`–`f125`**: **[Task Group C](#task-group-c-part-iii-gym-avoidable-defect-post-draft-repair)** (below Task Group B). **Constraint 6e** applies.

### Constraint 7: Preserve V1 behavior
Any shared contract/type change must be proven behavior-neutral for V1.

### Constraint 8: Focused verification only
Use focused regression commands and file-scoped lints. Do not rely on repo-wide `tsc --noEmit` as the success signal.

---

## Task Group A: Part 1 Only

### Task A0: User literacy — Help page + Avg PCA popover (Part I)

**Goal:** Reduce confusion between **display Avg** (continuous/raw), **raised target (shared spare)** (Step 2→3 projection), and **extra after needs** (optional Step 3.4 placement). All user-facing English strings follow the **Approved copy deck** in `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` **Locked decision 2** (HK clinical audience; FTE and “slot” wording allowed). Engineering identifiers in code and regression names stay unchanged per `docs/glossary/step3-floating-nonfloating.md`.

**Files:**
- Add: `app/(dashboard)/help/avg-and-slots/page.tsx`
- Add: `components/help/avgPcaFormulaSteps.tsx`, `components/help/AvgPcaFormulaPopoverContent.tsx`
- Modify: `components/help/HelpCenterContent.tsx`, `components/schedule/ScheduleBlocks1To6.tsx`, `app/(dashboard)/schedule/page.tsx`
- Modify: `lib/features/schedule/step3Bootstrap.ts` (`describeStep3BootstrapDelta.main` + exported constant per copy deck); same PR touch `app/(dashboard)/schedule/page.tsx` so Step 2 success toast shows `handoffDelta.main` **and** `handoffDelta.details` when a handoff exists
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts` (provenance value: ultra-short deck string)
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx` (Step 3.1 scarcity / post-need preview line — align terms with deck)
- Optional polish: `components/allocation/PCABlock.tsx` (titles for extra coverage — align with **Extra after needs**)

**Copy deck (authoritative — duplicate of spec; keep in sync):**

| Surface | String |
|---------|--------|
| Step 2 toast `main` | `Floating targets updated after Step 2 + shared spare from rounding the floating pool.` |
| Step 2 toast `details` | Unchanged pattern: `TEAM ±N PCA slot(s)` comma-separated |
| Popover collapsed subsection | Use names **Raised target (shared spare)** and **Extra after needs**; explain Avg unchanged |
| Popover link | `What does this mean?` → `/help/avg-and-slots` |
| Help `/help/avg-and-slots` | Section headings and body use approved names; still teach continuous FTE vs **slots** (0.25 FTE each) |
| Tracker tooltip value | `Raised floating target (shared spare).` |
| Tracker **Repair reason** (`repairReason` **`continuity-reduction`**) | `Continuity (fewer PCA handoffs).` (SSOT: `formatV2RepairReasonLabel` in `lib/features/schedule/pcaTrackerTooltip.ts`) |
| Tracker **Repair reason** (`repairReason` **`ranked-promotion`**) | `Ranked promotion.` (SSOT: `formatV2RepairReasonLabel` in same file) |
| Tracker audit pill **`C1`** | `Continuity (fewer PCA handoffs).` (SSOT: `formatV2RepairAuditDefectLabel` in same file) |

- [x] **Step 1:** Add the Help article route and shared formula fragments; wire Help Center “Guides” card; align guide + popover wording with copy deck.
- [x] **Step 2:** Refactor both Avg PCA popovers to use `AvgPcaFormulaPopoverContent`; preserve schedule page **live** sanity-check numbers via `sanityCheckFooter`; popover link text **What does this mean?** where applicable.
- [x] **Step 3:** Wire Step 2 toast body to include `describeStep3BootstrapDelta().main` before team details; update `v2PcaTrackerTooltipModel` provenance string; align Step 3.1 projected post-need line with **Extra after needs** vs raised target.
- [ ] **Step 4:** Manually verify `/help/avg-and-slots`, popover scroll on small viewports, Link from dashboard + schedule PCA Calculations block, and Step 2 toast shows context line + team deltas. *(A0b implementation session: not re-run here; rely on earlier A0 verification or next QA pass.)*
- [x] **Step 5:** Run `npx tsx tests/regression/f36-step3-handoff-summary-and-delta.test.ts` and `npx tsx tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts` (and any other touched regression snippets).

### Task A0b: Planned micro-lines — Step 3.1 / Step 3.4 (deferred)

**Status:** **Done** (2026-04-14): Step 3.1 shared-spare line + expander; Step 3.4 chips + micro-caption + post-need line; optional `step34ViewModel` Extra-after-needs bullet; regression `f114-step34-view-model-extra-after-needs-reason-bullet.test.ts`.

**Goal:** Step 3.1 **collapsed + optional expander** (bullets may quote bootstrap/projection numbers). Step 3.4 **minimal chips**: pill **`Raised target`** only for shared-spare path; pill **`Extra after needs`** for post-need; **one full-width micro-caption** under the entire header badge row (Pending floating / Assigned floating / other pills) so occasional readers see: `“Raised target” is from Step 2→3 rounding in the floating pool. “Extra after needs” is from Step 3.4 after needs were met.` Post-need **default one line** (when relevant): `After every team’s basic floating need was met, rounding still left spare slot(s), so the system could place extra slot(s).` Step 3.1 **collapsed** line: `Floating target includes a small raise from shared spare (rounding).` + link **What does this mean?** → `/help/avg-and-slots`.

**Files (expected when implemented):**
- `components/allocation/FloatingPCAConfigDialogV2.tsx` (3.1 line + expander; 3.4 chips + full-width caption under header row)
- `components/allocation/step34/step34ViewModel.ts` or sibling (optional **Why this happened** bullet sourced from extra-coverage metadata — keep distinct from raised-target copy)

- [x] **Step 1:** Add 3.1 collapsed line + expander when `realizedSurplusSlotGrantsByTeam` / projection indicates shared spare for that team.
- [x] **Step 2:** Add 3.4 chips + full-width micro-caption; post-need default line when preview shows extra coverage — wording must **not** reuse raised-target phrasing.
- [ ] **Step 3:** Manual check on a fixture date with and without grants / extra coverage. *(Not run in agent session; optional follow-up.)*

**Docs / naming:** Maintain the **engineering field glossary** in `docs/glossary/step3-floating-nonfloating.md` + surplus spec; **no mass rename** of projection fields for this task.

### Task A1: Lock surplus-projection semantics in regression tests first

**Files:**
- Create: `tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts`
- Create: `tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts`
- Create: `tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts`
- Test: `lib/features/schedule/step3Bootstrap.ts`

- [x] **Step 1: Write the failing raw-surplus-before-rounding regression**

Create `tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts` with an assertion shape like:

```ts
import assert from 'node:assert/strict'
import { computeStep3BootstrapSummary } from '../../lib/features/schedule/step3Bootstrap'

// Minimal fixture idea:
// - two teams with raw targets 0.64 and 0.49
// - one executable slack slot
// - raw continuous surplus > 0.25
// Assert the projection metadata reflects:
// - rawSurplusFte present
// - idealWeightedSurplusShareByTeam computed from raw surplus
// - no evidence of "round first then add"
// - realized slot grant goes to the team with stronger ideal share
```

- [x] **Step 2: Run the new regression and verify RED**

Run:

```bash
npx tsx tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts
```

Expected: FAIL because the bootstrap summary does not yet expose or implement raw-surplus-first projection semantics.

- [x] **Step 3: Write the failing executable-slack-cap regression**

Create `tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts` to lock:

```ts
import assert from 'node:assert/strict'
import { computeStep3BootstrapSummary } from '../../lib/features/schedule/step3Bootstrap'

// Fixture idea:
// - rawSurplusFte > 0.25
// - executable slack == 0
// Assert:
// - idealWeightedSurplusShareByTeam may still be non-zero
// - realizedSurplusSlotGrantsByTeam is all zero
// - rounded pending remains unchanged
```

- [x] **Step 4: Run the executable-slack-cap regression and verify RED**

Run:

```bash
npx tsx tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts
```

Expected: FAIL because the summary does not yet model ideal-vs-realized surplus separately.

- [x] **Step 5: Write the failing slot-sum-preservation regression**

Create `tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts` to assert that after rounding reconciliation:

```ts
import assert from 'node:assert/strict'
import { computeStep3BootstrapSummary } from '../../lib/features/schedule/step3Bootstrap'

// Fixture idea:
// - several teams share fractional ideal uplift
// - redistributableSlackSlots == 2
// Assert:
// - sum(realizedSurplusSlotGrantsByTeam) === 0.5
// - rounded adjusted targets consume exactly two extra quarter-slots globally
```

- [x] **Step 6: Run the slot-sum-preservation regression and verify RED**

Run:

```bash
npx tsx tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts
```

Expected: FAIL because no deterministic reconciliation logic exists yet.

- [x] **Step 7: Implement the minimal projection expansion in `step3Bootstrap.ts`**

Modify `lib/features/schedule/step3Bootstrap.ts` so `Step3BootstrapSummary` grows into a richer projection contract. Preserve current fields during migration, but add V2-safe metadata such as:

```ts
export type Step3BootstrapSummary = {
  teamTargets: Record<Team, number>
  existingAssignedByTeam: Record<Team, number>
  pendingByTeam: Record<Team, number>
  reservedSpecialProgramPcaFte: number
  availableFloatingSlots: number
  neededFloatingSlots: number
  slackFloatingSlots: number
  rawSurplusFte?: number
  idealWeightedSurplusShareByTeam?: Record<Team, number>
  redistributableSlackSlots?: number
  realizedSurplusSlotGrantsByTeam?: Record<Team, number>
  roundedAdjustedTeamTargets?: Record<Team, number>
  surplusAdjustmentDeltaByTeam?: Record<Team, number>
}
```

Implementation requirements:
- compute raw/base targets before quarter rounding
- compute `rawSurplusFte` at the continuous layer
- compute `idealWeightedSurplusShareByTeam`
- compute `redistributableSlackSlots` from executable capacity
- convert ideal uplift into realized quarter-slot grants
- reconcile rounding drift deterministically
- derive `pendingByTeam` from the adjusted/rounded targets, not the old frozen targets

- [x] **Step 8: Run the three new regressions and make them GREEN**

Run:

```bash
npx tsx tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts
npx tsx tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts
npx tsx tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/features/schedule/step3Bootstrap.ts tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts
git commit -m "feat: add surplus-aware step 3 bootstrap projection"
```

### Task A2: Wire Step 2 and Step 3.1 to the same surplus-aware projection

**Files:**
- Modify: `lib/features/schedule/controller/useScheduleController.ts`
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`
- Test: `lib/features/schedule/controller/useScheduleController.ts`
- Test: `components/allocation/FloatingPCAConfigDialogV2.tsx`
- Create: `tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts`

- [x] **Step 1: Write the failing Step 2 / Step 3.1 contract regression**

Create `tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts` with a characterization shape like:

```ts
import assert from 'node:assert/strict'

// Build a fixture where surplus-aware adjustment changes at least one team by +0.25.
// Assert:
// - Step 2-end bootstrap delta reflects the adjusted rounded target
// - Step 3.1 initialPendingFTE / roundedInitial derive from the same adjusted rounded target
```

- [x] **Step 2: Run the contract regression and verify RED**

Run:

```bash
npx tsx tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts
```

Expected: FAIL because Step 3.1 still initializes from `initialPendingFTE` before surplus-aware adjustment.

- [x] **Step 3: Update Step 2 controller wiring to calculate/store the projection**

In `lib/features/schedule/controller/useScheduleController.ts`, thread the new projection through the Step 2 completion path so the stored Step 2 result includes enough data for:
- the Step 2 delta/toast
- Step 3 stale/out-of-date logic
- Step 3.1 initialization

Keep `rawAveragePCAPerTeam` separate from the new projection fields.

- [x] **Step 4: Update `FloatingPCAConfigDialogV2.tsx` to initialize from surplus-aware rounded targets**

Replace the current `roundedInitial` seed logic that directly rounds `initialPendingFTE`:

```ts
activeTeams.forEach((team) => {
  roundedInitial[team] = roundToNearestQuarterWithMidpoint(initialPendingFTE[team] || 0)
})
```

with logic that prefers the shared surplus-aware rounded pending/target values from the new projection contract.

- [x] **Step 5: Run the Step 2 / Step 3.1 contract regression and make it GREEN**

Run:

```bash
npx tsx tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/features/schedule/controller/useScheduleController.ts components/allocation/FloatingPCAConfigDialogV2.tsx tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts
git commit -m "feat: share surplus-aware targets between step 2 and step 3"
```

### Task A3: Add tooltip/provenance support for surplus-adjusted final slots

**Files:**
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- Modify if needed: shared types carrying tracker/provenance metadata
- Create: `tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts`

- [x] **Step 1: Write the failing tooltip provenance regression**

Create `tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts` to assert:

```ts
import assert from 'node:assert/strict'
import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'

// Fixture idea:
// - summary/provenance indicates the team received one realized surplus slot grant
// - a final Step 3.4 row exists for that team
// Assert:
// - tooltip details include a small surplus-adjusted target explanation
// - no new visible badge/chip field is required
```

- [x] **Step 2: Run the tooltip provenance regression and verify RED**

Run:

```bash
npx tsx tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts
```

Expected: FAIL because the tooltip model does not yet know about surplus-adjusted target provenance.

- [x] **Step 3: Add tiny provenance plumbing and tooltip wording**

Modify `lib/features/schedule/v2PcaTrackerTooltipModel.ts` so the tooltip can surface a tiny explanation only when:
- the team's target was uplifted by realized surplus grants
- the final assignment actually exists because of that uplift/projection

Keep the text tiny and tooltip-only.

- [x] **Step 4: Run the tooltip provenance regression and make it GREEN**

Run:

```bash
npx tsx tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts
```

Expected: PASS.

- [x] **Step 5: Run focused lints for Task Group A files**

Run IDE lints on:
- `lib/features/schedule/step3Bootstrap.ts`
- `lib/features/schedule/controller/useScheduleController.ts`
- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`

Expected: no new lint errors introduced by Task Group A.

- [ ] **Step 6: Commit**

```bash
git add lib/features/schedule/v2PcaTrackerTooltipModel.ts tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts
git commit -m "feat: show surplus-adjusted target provenance in tracker tooltip"
```

---

## Task Group B: Part 2 Only

> **Implementation status (this worktree):** Task Group B is **complete** in code and regressions. Filenames below use **`f116`–`f120`** where the original sketch said `f111`–`f115` (those IDs were already used elsewhere; see **Repository note** under [Regression tests](#regression-tests)). Optional promotion uses `RankedV2OptionalPromotionOpportunity` + `detectOptionalRankedPromotionOpportunities` (Constraint 5 — not folded into `B1`). `compareScores(..., { includeOptionalPromotionTieBreak: true })` is covered in `tests/regression/f62-ranked-slot-preference-contracts.test.ts`. Checkbox steps are marked done; **git commit** lines remain for your own commit hygiene.

### Task B1: Lock optional ranked-promotion semantics before implementation

**Note:** This heading’s **Task B1** is a work-package label only. It is unrelated to the repair defect kind **`B1`** (ranked-gap repair) in `repairAudit.ts`.

**Files:**
- Create: `tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- Create: `tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- Create: `tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`
- Create: `tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`
- Create: `tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts` (or next free `f11x`; see **Constraint 6c**)
- Test: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Test: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Test: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`

- [x] **Step 1: Write the failing bounded-swap promotion regression**

Create `tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts` to lock:

```ts
import assert from 'node:assert/strict'

// Fixture idea:
// - requester already met required pending and required ranked coverage
// - requester holds a lower-ranked slot
// - donor can swap safely with no net loss
// Assert final allocator prefers the higher-ranked outcome.
```

- [x] **Step 2: Run the bounded-swap regression and verify RED**

Run:

```bash
npx tsx tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts
```

Expected: FAIL because no distinct optional-promotion phase exists yet.

- [x] **Step 3: Write the failing same-PCA sway promotion regression**

Create `tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts` to lock a case where:
- the same PCA can be reoriented
- donor remains acceptably covered
- requester improves from lower-ranked to higher-ranked coverage

- [x] **Step 4: Run the same-PCA sway regression and verify RED**

Run:

```bash
npx tsx tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts
```

Expected: FAIL because promotion is not modeled separately yet.

- [x] **Step 5: Write the failing harmful-donation blocker regression**

Create `tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts` to assert that optional promotion stays blocked when donor would:
- lose best satisfied **ranked preference** without the same move restoring it
- lose fairness floor
- incur net loss the requester does not symmetrically accept

- [x] **Step 6: Run the harmful-donation regression and verify RED**

Run:

```bash
npx tsx tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts
```

Expected: FAIL because the current logic either does not attempt promotion or risks conflating it with ordinary donation logic.

- [x] **Step 7: Write the failing "not a B1 defect" regression**

Create `tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts` to assert:

```ts
import assert from 'node:assert/strict'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'

// Fixture idea:
// - requester already satisfied required ranked coverage
// - higher-ranked upgrade remains possible
// Assert:
// - no B1 defect is emitted
// - promotion must be discovered through a separate concept/path
```

- [x] **Step 8: Run the B1-separation regression and verify RED**

Run:

```bash
npx tsx tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts
```

Expected: FAIL because the new optional-promotion concept does not exist yet.

- [x] **Step 8b: Write the failing Step 3.2 / Step 3.3 commit immutability regression**

Create `tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts` (or the next free `f11x` name) to assert that **optional promotion** and **repair** never move or clear (**a**) a **Step 3.2** row binding **preferred PCA** to a **specific slot**, or (**b**) a **Step 3.3** **adjacent-slot** user commit (`Constraint 6c`). Fixture sketch: metadata marks `step32-preferred` / `step33-adjacent`; allocator must leave both classes untouched even if a swap would improve another team’s rank.

- [x] **Step 8c: Run the immutability regression and verify RED**

```bash
npx tsx tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts
```

Expected: FAIL until `repairMoves` / promotion phase filter frozen anchors.

- [x] **Step 9: Commit**

```bash
git add tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts
git commit -m "test: lock optional ranked promotion regressions"
```

### Task B2: Add a distinct optional-promotion audit concept in V2 repair

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Test: `tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`
- Test: `tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts` (or chosen free `f11x`)

- [x] **Step 1: Extend the V2 audit model with a distinct optional-promotion concept**

In `lib/algorithms/floatingPcaV2/repairAudit.ts`, add a new auditable concept separate from `B1`, for example:

```ts
type RankedV2RepairDefect =
  | { kind: 'B1'; team: Team }
  | { kind: 'P1'; team: Team; currentRank: number; desiredRank: number }
  | { kind: 'A1'; team: Team }
  | ...
```

Requirements:
- emit `P1` only when required pending and required ranked coverage are already satisfied
- never emit `P1` by simply re-expanding `B1`
- treat `P1` as input to **one** bounded promotion pass (Constraint **6b**), not as a defect that must be cleared by arbitrary iteration

- [x] **Step 2: Generate promotion candidates from the new concept**

In `lib/algorithms/floatingPcaV2/repairMoves.ts`, add candidate generation for:
- bounded swap
- donor-safe move
- same-PCA sway

Do not generate harmful donation candidates for `P1`.

**Constraint 6c (repeat):** no generated candidate may alter a **Step 3.2** preferred PCA+slot anchor or a **Step 3.3** adjacent-slot anchor; the same filter applies to **required** repair paths that might otherwise retarget those cells.

- [x] **Step 3: Run the B1-separation regression and make it GREEN**

Run:

```bash
npx tsx tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/floatingPcaV2/repairMoves.ts tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts
git commit -m "feat: separate optional ranked promotion from b1 repair"
```

### Task B3: Score and orchestrate optional ranked promotion

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
- Test: `tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- Test: `tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- Test: `tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`
- Test: `tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts` (or chosen free `f11x`)

- [x] **Step 1: Extend score-building so optional promotion can improve quality without redefining required coverage**

In `lib/algorithms/floatingPcaV2/scoreSchedule.ts`, extend scoring so **optional promotion** (bounded pass only) can compare candidate schedules **after** the existing required lexicographic tuple is unchanged (no redefinition of `B1` / `F1` satisfaction). Align with base ranked design `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`: **ranked-slot outcomes stay ahead of preferred-PCA “wish”** in the global objective stack for **required** repair; for **optional** promotion, add explicit sub-metrics so trades like the CPPC/GMC example are scoreable.

**Promotion / tie-break layer (implement as one composite `rankedPromotionQuality` or as separate fields compared in fixed order):**

1. **Ranked slot uplift (tier 1 for promotion):** prefer schedules where more teams satisfy a **better** (numerically lower) **first fulfilled ranked slot index** in `preferred_slots` / `rankedSlots`, consistent with existing `highestRankCoverage` spirit. Optional promotion exists to lift e.g. GMC from holding only **#2** to also satisfying **#1** when donor rules allow.
2. **Preferred PCA satisfaction (tier 2 for promotion):** among promotion-equal rank outcomes, prefer more **true Step-3–owned** floating assignments whose `staff_id` is in the team’s effective **`preferred_pca_ids`** (from `teamPrefs` / `buildEffectiveRankedPreferences`). This encodes “CPPC would rather keep 淑貞” **only when** tier-1 rank is tied and **Constraint 6c** does not forbid the move (never trade away a **Step 3.2** committed preferred bind or a **Step 3.3** adjacent commit to gain rank elsewhere).
3. **Defer AM/PM balance** in this task (**Constraint 6d**): do not add session-balance fields here.
4. **Existing tail (keep order after promotion block):** continue to use lower-priority signals already in `compareScores` — e.g. **gym last resort** (fewer is better), **`rankedSlotMatchCount`**, **duplicate-floating**, **`splitPenalty`** — so gym avoidance and continuity/split behavior stay aligned with current V2 repair.

Illustrative **product fixture** (names illustrative; regression may use stable fixture IDs):

- **CPPC:** `preferred_pca_ids` includes 淑貞; ranked order has **#1 = slot 4**.  
- **GMC:** no preferred PCA; ranked **#1 = slot 1**, **#2 = slot 3**.  
- **Bad draft:** GMC gets 友好 on **slot 4**; CPPC gets 淑貞 on **slot 1** (each misses own **#1**).  
- **Good optional bounded swap (when 6c allows):** reshuffle so **GMC** gets **#1** (slot 1) and **CPPC** gets **#1** (slot 4), even if CPPC **loses preferred PCA** on that slot to another PCA — tier 1 (both **#1**) beats the draft; tier 2 only breaks ties among such swaps. If **CPPC** had **Step 3.2–committed** 淑貞@slot1 **or** a **Step 3.3–committed** adjacent placement the user chose, that anchor is **frozen**; the swap that “gives 淑貞 to GMC” (or tears out the adjacent commit) must **not** be generated (**Constraint 6c**).

Optional type sketch (field names may vary; keep required tuple stable):

```ts
export type RankedSlotAllocationScore = {
  highestRankCoverage: number
  rankedCoverageSatisfied: number
  fairnessSatisfied: number
  totalFulfilledPendingQuarterSlots: number
  gymLastResortCount: number
  rankedPromotionQuality: number // or split into promotionRankScore + promotionPreferredPcaScore
  rankedSlotMatchCount: number
  duplicateFloatingCount: number
  splitPenalty: number
}
```

**`compareScores` insertion rule:** compare the existing required keys **first** unchanged; only when candidates are tied on all required-repair-relevant fields (or when comparing **only** within the optional-promotion candidate set that already satisfies required defects), compare **`rankedPromotionQuality`** / decomposed promotion fields, then fall through to gym / `rankedSlotMatchCount` / duplicate / split as today. Document the exact ordering in a short comment beside `compareScores` when implementing.

- [x] **Step 2: Insert the optional promotion phase into V2 orchestration**

In `lib/algorithms/floatingPcaV2/allocator.ts`, add the optional promotion pass after required repair succeeds and **before** residual extra coverage and final schedule freeze (align with design spec ordering: optional promotion **then** extra after needs).

Requirements:
- required repair still runs first
- optional promotion must not be silently suppressed by the capped-ranked-gap fix
- harmful donation stays blocked
- optional promotion obeys **Constraint 6b**: single bounded pass (finite candidates, deterministic cap), then proceed to residual extra coverage even if a notional upgrade could still exist under a longer search
- optional promotion and required repair respect **Constraint 6c** (Step **3.2** + **3.3** user-commit anchors)

- [x] **Step 3: Run the optional-promotion regressions (including Step 3.2 / 3.3 immutability) and make them GREEN**

Run:

```bash
npx tsx tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts
npx tsx tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts
npx tsx tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts
npx tsx tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add lib/algorithms/floatingPcaV2/scoreSchedule.ts lib/algorithms/floatingPcaV2/allocator.ts tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts
git commit -m "feat: add optional ranked promotion to v2 repair"
```

### Task B4: Add tiny tooltip/provenance wording for ranked-promotion outcomes

**Files:**
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- Test if needed: `f62` (score tie-break) and/or `f116`–`f118` promotion regressions

- [x] **Step 1: Add tiny provenance wording for promotion-origin repair rows**

Modify tooltip detail generation so promotion-origin repair rows can say something like:

```ts
{ label: 'Repair reason', value: 'Ranked promotion' }
```

Only do this when the final repair/provenance metadata proves that the row came from the optional-promotion phase.

- [x] **Step 2: Run the relevant promotion regression(s) and verify no behavior drift**

Run at least:

```bash
npx tsx tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts
npx tsx tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts
npx tsx tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts
```

Expected: PASS.

- [x] **Step 3: Run focused lints for Task Group B files**

Run IDE lints on:
- `lib/algorithms/floatingPcaV2/repairAudit.ts`
- `lib/algorithms/floatingPcaV2/repairMoves.ts`
- `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- `lib/algorithms/floatingPcaV2/allocator.ts`
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`

Expected: no new lint errors introduced by Task Group B.

- [x] **Step 4: Commit**

```bash
git add lib/features/schedule/v2PcaTrackerTooltipModel.ts
git commit -m "feat: explain ranked promotion in v2 tracker tooltip"
```

---

## Task Group C (Part III): Gym avoidable defect (post-draft repair)

> **Status:** **Not started** in this worktree. **Do not** implement opportunistically while touching Task Group B files — follow **Constraint 6e** and the design spec **Part III** as a unit.

**Goal:** After **required repair** has cleared and **Part I** targets are in effect, run **Part III** gym-avoidable detection and a **separate bounded repair** pass (`G1`, gym-only objective) **before** **Part II** optional ranked promotion **begins**. Then run Part II’s bounded promotion pass (with **Optional promotion guard** / **Constraint 6f**), then residual extra coverage and final audit per design **Locked allocator order**. **Task Group C** is the engineering checklist for Part III; **allocator call order is `R → G → P`**, not Roman-numeral document order.

**Authoritative references (read in order):**
1. Design spec `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` → **`### Part III. Gym avoidable defect (post-draft repair)`** (includes **`G1`**, **Feasible non-gym reshuffle**, **Locked allocator order**, **UI and tooltip**, cap **`6`**).
2. This plan → **Constraint 6e**, **Task Group C** file list above, regression filenames **`f121`–`f125`** below.

### Locked orchestration (allocator checklist)
Implement exactly this relative ordering inside `allocateFloatingPCA_v2RankedSlotImpl` / `allocator.ts` (or successor). **Mnemonic:** **`R → G → P`** — spec **Part I/II/III** are **chapters**; **G (Part III) runs before P (Part II)** in code.

1. Draft allocation  
2. Required repair loop (existing) **(R)**  
3. **Part III:** compute `G1` defects → run gym-avoidance repair loop with **`MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS = 6`** **(G)** — **must complete** before step 4  
4. **Part II** optional ranked promotion — existing bounded pass **(P)**; candidates must pass **Optional promotion guard** (no post-move `G1` for any team)  
5. `applyExtraCoverageRoundRobin` (or equivalent residual extra coverage)  
6. Second repair / finalize path already used for **f99** discipline  

### Task C1: `G1` audit (`repairAudit.ts`)
- [ ] Extend `RankedV2RepairDefect` with `{ kind: 'G1'; team: Team }`.
- [ ] Implement detection per design **Feasible non-gym reshuffle** (prove feasibility by search over bounded candidates — may reuse `generateRepairCandidates` machinery with a filtered objective or a dedicated enumerator; **no harmful donation**).
- [ ] Ensure `G1` is **not** returned from the same function that powers optional promotion opportunity detection.

### Task C2: Gym-avoidance candidates + repair loop (`repairMoves.ts`, possibly `allocator.ts`)
- [ ] Add candidate generation and/or a small `runGymAvoidanceRepairLoop` helper that only accepts moves improving the gym story while preserving **zero** required-repair defects after each accept (per design default: full `detectRankedV2RepairDefects` clear — align with spec if implementation discovers a narrower invariant).
- [ ] Respect **Constraint 6c** (Step 3.2 / 3.3 anchors) identically to required repair / Part II.

### Task C3: Orchestration (`allocator.ts`)
- [ ] Call Part III pass **after** required repair and **before** `runOptionalRankedPromotionPass` / equivalent; then run optional promotion, then extra coverage.
- [ ] Wire **`MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS = 6`** as a named constant beside `MAX_REPAIR_ITERATIONS`.

### Task C4: UI + tooltip parity (`v2PcaTrackerTooltipModel.ts`, `step34ViewModel.ts`, `FloatingPCAConfigDialogV2.tsx` as needed)
- [ ] Centralize user-visible strings for: gym last resort, gym avoidance repair applied, gym unavoidable (true last resort with avoid-gym on).
- [ ] Consume the same strings from **both** tracker tooltips and Step 3.4 detail surfaces (no duplicated English literals).

### Task C5: Regressions + verification commands
Run after implementation:

```bash
npx tsx tests/regression/f121-step34-v2-g1-detected-when-avoid-gym-and-feasible-non-gym-reshuffle-exists.test.ts
npx tsx tests/regression/f122-step34-v2-g1-not-raised-when-gym-is-true-last-resort-only.test.ts
npx tsx tests/regression/f123-step34-v2-gym-avoidance-repair-moves-off-gym-without-reintroducing-required-repair-defects.test.ts
npx tsx tests/regression/f124-step34-v2-gym-avoidance-repair-respects-step32-step33-commit-immutability.test.ts
npx tsx tests/regression/f125-step34-v2-part-ii-optional-promotion-defect-gates-unchanged-by-part-iii.test.ts
```

Also rerun **f95–f99**, **f116–f120**, and IDE lints on all touched V2 files.

- [ ] **Step 1:** Land `G1` + detection + allocator order with **f121** / **f122** / **f125** (minimal) first.  
- [ ] **Step 2:** Land repair + **f123** / **f124**.  
- [ ] **Step 3:** Land UI parity (**f121**–**f125** green) + manual Step 3.4 vs tracker string compare.

---

## Task Group D: AM / PM session balance

> **Status:** **Shipped** in this worktree (scoring + repair/promotion `compareScores` wiring + **f126**–**f132**). Optional **draft** AM/PM tie (**D3** below) **not** implemented — product decision: keep AM/PM for later passes only. Must **not** change **`R → G → P`** phase order.

**Goal:** Match design **AM / PM session balance**: **0.5** → **1+1** when tied above; **0.75** → **`splitPenalty`** distinguishes **tier 1 vs tier 2** (both **no duplicate**); **`duplicateFloatingCount`** distinguishes **tier 2 vs tier 3** (**no duplicate** vs duplicate); AM/PM then prefers **2+1** over **3+0** among remaining ties; **1.0** / **`>1.0`** → **neutral** AM/PM with **chunk vs four×0.25** via **`splitPenalty`** / **`duplicateFloatingCount`**. See **Constraint 6d** above.

**Authoritative references (read in order):**
1. Design spec → **AM / PM session balance (approved — Task Group D)** (product rules, band defaults, eligibility).
2. This plan → **Constraint 6d**, **File structure → Task Group D**, regressions **`f126`–`f132`** below (including **0.75** tier matrix **f129**–**f132**).

### Task D1: Session-band model + metrics
- [x] Add `lib/algorithms/floatingPcaV2/amPmSessionBalance.ts` (or keep helpers colocated in `scoreSchedule.ts` if truly tiny — prefer **one import site** for bands).
- [x] Implement deterministic per-schedule metrics consumed by `buildRankedSlotAllocationScore` (or equivalent), **per team** from **pending floating quarter count**: **1 or 4 or ≥5** → **neutral** AM/PM contribution; **2** → prefer **1+1**; **3** → **only** the **2+1** vs **3+0** + deterministic **2+1** tie-break at the AM/PM sub-tier (after duplicate+split+… ties). **Do not** fold **single-PCA non-split** vs **A+B split** into AM/PM — those are **`splitPenalty`** / duplicate semantics per design narrative.

### Task D2: `compareScores` extension (`scoreSchedule.ts`)
- [x] Extend `RankedSlotAllocationScore` with numeric session-balance fields (document invariants: higher = better spread per **Constraint 6d**).
- [x] Extend `compareScores` with `includeAmPmSessionBalanceTieBreak?: boolean` (exact name up to implementer) that runs **only after** `includeOptionalPromotionTieBreak` branch has exhausted **or** when both `includeOptionalPromotionTieBreak` scores are equal — **never** before promotion rank / preferred PCA when promotion tie-break is enabled.
- [x] Update file header comments to reference **Constraint 6d** (remove any stale “no AM/PM here” wording that contradicted shipped scope).

### Task D3: Wire allocator + promotion (`allocator.ts`, optional `draftAllocation.ts`)
- [x] Pass the new tie flag when **optional promotion** compares candidate schedules that are tied today.
- [ ] Optionally use the same metric at **draft** placement when multiple placements are otherwise equivalent — **must not** override ranked-slot choice, user anchors, or gym last-resort ordering encoded above session balance in `compareScores`. *(Not implemented — product decision: AM/PM only in repair/promotion `compareScores`, not draft.)*
- [ ] When enumerating **0.75** placements, **prefer trying** design narrative order (**most optimal → 2nd tier → 3rd tier**) so duplicate-heavy tier 3 is rare; lexicographic `compareScores` remains authoritative.

### Task D4: Regressions + verification commands
Run after implementation:

```bash
npx tsx tests/regression/f126-step34-v2-am-pm-session-balance-prefers-spread-for-half-fte-two-slots.test.ts
npx tsx tests/regression/f127-step34-v2-am-pm-session-balance-neutral-for-quarter-fte.test.ts
npx tsx tests/regression/f128-step34-v2-am-pm-session-balance-does-not-override-step32-step33-anchors.test.ts
npx tsx tests/regression/f129-step34-v2-am-pm-075-tier1-non-split-beats-tier2-split-when-duplicate-tied.test.ts
npx tsx tests/regression/f130-step34-v2-am-pm-075-tier2-no-dup-beats-tier3-dup-when-split-tied.test.ts
npx tsx tests/regression/f131-step34-v2-am-pm-075-am-pm-two-plus-one-beats-three-plus-zero-when-dup-split-tied.test.ts
npx tsx tests/regression/f132-step34-v2-am-pm-075-tier1-beats-tier3-lexicographic-order.test.ts
```

Also rerun **f116–f120**, **f95–f99**, and (when Part III exists in branch) **f121–f125**; IDE lints on touched V2 files.

- [x] **Step 1:** Land metrics + `compareScores` + **f127** (neutral case) first.  
- [x] **Step 2:** Land **f126** + promotion wiring.  
- [x] **Step 3:** Land **f128** + optional draft tie. *(**f128** shipped; optional draft tie skipped — same product decision as **D3** draft bullet.)*  
- [x] **Step 4:** Land **0.75** tier matrix **f129**–**f132** (in **f129**, assert **tier 1** and **tier 2** both **no duplicate** — `duplicateFloatingCount` equal, typically **0**).  
- [x] **Step 5:** Full regression block above — all **f126**–**f132** green.

---

## Verification Checklist

### Task Group A minimum verification
- `npx tsx tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts`
- `npx tsx tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts`
- `npx tsx tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts`
- `npx tsx tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts`
- `npx tsx tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts`
- IDE lints on Task Group A files

### Task Group B minimum verification
- `npx tsx tests/regression/f116-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- `npx tsx tests/regression/f117-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- `npx tsx tests/regression/f118-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`
- `npx tsx tests/regression/f119-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`
- `npx tsx tests/regression/f120-step34-v2-optional-promotion-and-repair-respect-step32-step33-commit-immutability.test.ts`
- run the existing nearby V2 regressions that protect current ranked/gym/repair behavior
- IDE lints on Task Group B files

### Task Group C minimum verification (when Part III ships)
- `npx tsx tests/regression/f121-step34-v2-g1-detected-when-avoid-gym-and-feasible-non-gym-reshuffle-exists.test.ts`
- `npx tsx tests/regression/f122-step34-v2-g1-not-raised-when-gym-is-true-last-resort-only.test.ts`
- `npx tsx tests/regression/f123-step34-v2-gym-avoidance-repair-moves-off-gym-without-reintroducing-required-repair-defects.test.ts`
- `npx tsx tests/regression/f124-step34-v2-gym-avoidance-repair-respects-step32-step33-commit-immutability.test.ts`
- `npx tsx tests/regression/f125-step34-v2-part-ii-optional-promotion-defect-gates-unchanged-by-part-iii.test.ts`
- rerun **f116–f120** and **f95–f99** to guard regressions
- IDE lints on Task Group C files

### Task Group D minimum verification (AM / PM session balance)
- `npx tsx tests/regression/f126-step34-v2-am-pm-session-balance-prefers-spread-for-half-fte-two-slots.test.ts`
- `npx tsx tests/regression/f127-step34-v2-am-pm-session-balance-neutral-for-quarter-fte.test.ts`
- `npx tsx tests/regression/f128-step34-v2-am-pm-session-balance-does-not-override-step32-step33-anchors.test.ts`
- `npx tsx tests/regression/f129-step34-v2-am-pm-075-tier1-non-split-beats-tier2-split-when-duplicate-tied.test.ts` (**tier 1** & **tier 2** both **no duplicate**; split discriminates)
- `npx tsx tests/regression/f130-step34-v2-am-pm-075-tier2-no-dup-beats-tier3-dup-when-split-tied.test.ts`
- `npx tsx tests/regression/f131-step34-v2-am-pm-075-am-pm-two-plus-one-beats-three-plus-zero-when-dup-split-tied.test.ts`
- `npx tsx tests/regression/f132-step34-v2-am-pm-075-tier1-beats-tier3-lexicographic-order.test.ts`
- rerun **f116–f120** and **f95–f99** (and **f121–f125** when Part III is present on the branch)
- IDE lints on Task Group D files (`scoreSchedule.ts`, `allocator.ts`, `draftAllocation.ts` if touched, new helper module)

### Existing regression anchors to rerun after Task Groups A/B (and again after C when Part III ships)
- `tests/regression/f95-step34-gym-source-of-truth-contract.test.ts`
- `tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts`
- `tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts`
- `tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts`
- `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts`
- `tests/regression/f105-step34-multi-ranked-team-does-not-require-all-ranked-slots-when-target-is-one.test.ts`

## Plan Self-Review

### Spec coverage
- Part I is covered by Task Group A through bootstrap math, Step 2/Step 3.1 contract, and tooltip provenance.
- Part II is covered by Task Group B through separate audit concept, candidate generation, orchestration, scoring (rank-first promotion block, then preferred-PCA tie layer), **Constraint 6c** Step **3.2** + **3.3** commit immutability, and tooltip wording. Design spec Part II should stay aligned (paired doc).
- Part III is specified in the design spec and **Task Group C** in this plan (`G1`, locked orchestration **`R → G → P`** — gym **before** promotion, cap **`6`**, UI parity, **`f121`–`f125`**, **Constraint 6e**, **Constraint 6f**). Implementation is **out of scope** for the completed A/B tranche until Task Group C is executed.
- **AM/PM session balance** is specified in the design spec **AM / PM session balance (approved — Task Group D)** and **Task Group D** / **Constraint 6d** in this plan (**`f126`–`f132`**, including **0.75** tier matrix **f129**–**f132**).
- V1/V2 boundary discipline is explicitly called out in scope, constraints, and untouched-file lists.

### Placeholder scan
- Every task includes exact files and concrete commands.
- New regression filenames are specified for Task Groups A, B, C, and D (**`f121`–`f125`** Part III; **`f126`–`f132`** AM/PM including **0.75** tiers **f129**–**f132**).
- No "TBD" or "implement later" placeholders remain for AM/PM — **Task Group D** is the execution checklist. Remaining deferral is **Task Group C implementation** only (checklist exists; code **not started** in this worktree until Part III is scheduled).

### Type consistency
- Task Group A consistently uses `rawSurplusFte`, `idealWeightedSurplusShareByTeam`, `redistributableSlackSlots`, and `realizedSurplusSlotGrantsByTeam`.
- Task Group B consistently treats optional ranked promotion as a concept distinct from `B1`.
- Task Group D extends `compareScores` and related wiring without reordering objectives ahead of **Constraint 6d**.

## Execution Handoff
Plan complete and saved to `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md`. **Product/design contract (read together):** `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` — Part I (targets), Part II (optional promotion + immutability), **Part III (`G1` gym avoidance)**, **AM/PM session balance (approved — Task Group D)**. **Roman numerals = spec chapters; allocator after required repair is `R → G → P`.** **Task Group C** is the execution checklist for Part III; **Task Group D** ships AM/PM as **soft** scoring per **Constraint 6d**. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
