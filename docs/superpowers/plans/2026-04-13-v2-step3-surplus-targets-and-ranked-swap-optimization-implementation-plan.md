# V2 Step 3 Surplus-Aware Targets and Ranked Swap Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the new V2-only Step 3 target pipeline so surplus-aware rounded pending is projected consistently from Step 2 into Step 3.1, then add a separate optional ranked-promotion phase that allows bounded no-net-loss swap optimization without harmful donation, with **promotion scoring** that prefers **ranked-slot uplift** first and **preferred PCA** satisfaction second (AM/PM deferred), and **immutable** user commits from **Step 3.2** (preferred PCA on a slot) and **Step 3.3** (adjacent slot) for repair and promotion (**Constraint 6c**). See design spec **Forward-looking: AM / PM balance** for deferred session-balance work.

**Architecture:** Treat the work as two separable task groups. Task Group A introduces a shared `Step3TargetProjection`-style surplus-aware target calculation that keeps raw therapist-weighted demand separate from realized quarter-slot output while making Step 2 deltas and Step 3.1 initialization consume the same projection. Task Group B adds a V2-only optional ranked-promotion phase after required repair, encoded as a distinct audit/scoring concept rather than as a fake ranked-gap defect; promotion compares candidates with **rank-first** then **preferred-PCA** tie metrics (AM/PM out of scope for this plan—**Forthgoing: AM / PM balance**); **Step 3.2** and **Step 3.3** user commits stay **frozen** for repair and promotion; tiny provenance text goes to the Step 3.4 tooltip only.

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
  - Score optional promotion outcomes separately from required ranked-gap satisfaction.
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
  - Insert the optional promotion phase at the approved point in orchestration.
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
  - Surface tiny provenance text for ranked-promotion outcomes when a repair/promotion row should explain itself.

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

### Constraint 6c: Step 3.2 and Step 3.3 user commits are immutable for repair and optional promotion
End users commit concrete placements **before** Step 3.4. Those choices must not be undone later by audit, required repair, bounded donation, optional ranked promotion, swap, or sway.

**Frozen anchors (both equally protected):**

1. **Step 3.2:** **preferred PCA** on a **specific clock slot** (preferred review).
2. **Step 3.3:** **adjacent slot** assignment the user committed in the adjacent-slot step.

**Rules:**
- Candidate repair/promotion moves must **not** remove, retarget, replace, or “donate away” any row identified as either of the above.
- **Implementation:** thread explicit provenance on `FloatingPCAAllocationContextV2` / `committedStep3Assignments` (or adjacent handoff) with a `source` (or equivalent), e.g. `step32-preferred` vs `step33-adjacent` (names illustrative). If the payload today mixes sub-steps without flags, **add** fields so **both** classes are filterable from destructive candidates.
- **Required repair** (`B1` / `F1` / duplicate paths) must respect the same immutability: never “fix” the schedule by tearing out a Step 3.2 or Step 3.3 user commit.

**Regression:** add a dedicated test (see Task Group B tests — `f115` placeholder name; pick next free `f11x` per repository note) that fails if optional promotion or repair moves **either** a Step 3.2 preferred anchor **or** a Step 3.3 adjacent anchor.

### Constraint 6d: AM / PM session balance is out of scope for Task Group B scoring
Do **not** add AM/PM balance terms to optional-promotion or `compareScores` work in this plan. Defer to **Forthgoing: AM / PM balance** below and a future approved plan.

### Forthgoing: AM / PM balance in allocation (introduction only)
**Not implemented in this plan.** Capture intent so a later agent does not re-litigate basics.

- **Problem:** For multi-slot pending (e.g. **0.5 FTE** → two quarter slots), schedules may want **AM vs PM** spread (e.g. slots 1–2 vs 3–4) as a **soft** quality goal after rank, preferred PCA, continuity, and gym-last-resort rules.
- **Scope later:** New `compareScores` / draft heuristics tier, product-approved ordering vs existing duplicate/split/gym stack; dedicated regressions. **0.25 FTE** has no meaningful AM/PM split; **0.75** / **≥1.0** may need different patterns before AM/PM tuning.
- **Tracker:** V2 surfaces may already show session-oriented hints; allocator scoring change is **not** required for parity on day one.
- **Design mirror:** `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` Part II **Forward-looking: AM / PM balance** stays the product-facing stub; keep both documents aligned when AM/PM ships.

### Forthgoing: Gym avoidable defect (post-draft repair)
**Not implemented in this plan.** Spec stub **next to Part II** in the paired design doc: **Gym avoidable defect (post-draft repair)** — audit + bounded repair when avoid-gym is on but a non-gym reshuffle exists; **do not** fold into Part II optional promotion. Align both documents when this ships.

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
{ label: 'Repair reason', value: 'Ranked promotion via bounded swap' }
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

### Existing regression anchors to rerun after both groups
- `tests/regression/f95-step34-gym-source-of-truth-contract.test.ts`
- `tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts`
- `tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts`
- `tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts`
- `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts`
- `tests/regression/f105-step34-multi-ranked-team-does-not-require-all-ranked-slots-when-target-is-one.test.ts`

## Plan Self-Review

### Spec coverage
- Part I is covered by Task Group A through bootstrap math, Step 2/Step 3.1 contract, and tooltip provenance.
- Part II is covered by Task Group B through separate audit concept, candidate generation, orchestration, scoring (rank-first promotion block, then preferred-PCA tie layer; AM/PM **Constraint 6d** + **Forthgoing: AM / PM balance**), **Constraint 6c** Step **3.2** + **3.3** commit immutability, and tooltip wording. Design spec Part II should stay aligned (paired doc).
- V1/V2 boundary discipline is explicitly called out in scope, constraints, and untouched-file lists.

### Placeholder scan
- Every task includes exact files and concrete commands.
- New regression filenames are specified for both groups.
- No "TBD" or "implement later" placeholders remain, except **AM/PM balance scoring**, intentionally deferred per **Constraint 6d** and the **Forthgoing: AM / PM balance** section (design spec stub cross-linked).

### Type consistency
- Task Group A consistently uses `rawSurplusFte`, `idealWeightedSurplusShareByTeam`, `redistributableSlackSlots`, and `realizedSurplusSlotGrantsByTeam`.
- Task Group B consistently treats optional ranked promotion as a concept distinct from `B1`.

## Execution Handoff
Plan complete and saved to `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md`. **Product/design contract (read together):** `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` — especially Part II (immutability, promotion scoring summary, AM/PM forward-looking). Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
