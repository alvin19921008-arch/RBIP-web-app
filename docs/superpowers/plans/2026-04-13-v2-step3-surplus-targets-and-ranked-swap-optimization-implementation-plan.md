# V2 Step 3 Surplus-Aware Targets and Ranked Swap Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the new V2-only Step 3 target pipeline so surplus-aware rounded pending is projected consistently from Step 2 into Step 3.1, then add a separate optional ranked-promotion phase that allows bounded no-net-loss swap optimization without harmful donation.

**Architecture:** Treat the work as two separable task groups. Task Group A introduces a shared `Step3TargetProjection`-style surplus-aware target calculation that keeps raw therapist-weighted demand separate from realized quarter-slot output while making Step 2 deltas and Step 3.1 initialization consume the same projection. Task Group B adds a V2-only optional ranked-promotion phase after required repair, encoded as a distinct audit/scoring concept rather than as a fake ranked-gap defect, and threads tiny provenance text into the Step 3.4 tooltip only.

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
  - Plain-language guide: continuous vs quarter slots; scarcity/slack; surplus-adjusted vs post-need extra (per Part I spec).
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
  - Add tooltip/provenance wording for surplus-adjusted target outcomes without adding visible new badges.

### Task Group B: Optional ranked promotion via bounded swap optimization
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
  - Introduce a distinct optional-promotion opportunity concept without overloading required ranked-gap defects.
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
  - Generate bounded swap/safe-move/same-PCA-sway candidates for optional ranked promotion.
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
- Create: `tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- Create: `tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- Create: `tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`
- Create: `tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`

**Repository note:** The `f111`–`f114` filenames above were the original Task Group B sketch. The worktree may already use those numbers for **other** contracts (e.g. rounded-slack fallback, tracker provenance, dashboard Avg). Before implementing Task Group B, **list `tests/regression/f11*.test.ts`**, pick the next free `f11x` sequence for optional-ranked-promotion tests, and update this plan (or rename files) so **identifiers stay unique**—do not overwrite unrelated regressions.

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
- same-PCA sway

Task Group B must reject:
- harmful donation
- donor rank loss
- donor fairness-floor loss
- donor loss of all meaningful true Step 3 floating protection

### Constraint 7: Preserve V1 behavior
Any shared contract/type change must be proven behavior-neutral for V1.

### Constraint 8: Focused verification only
Use focused regression commands and file-scoped lints. Do not rely on repo-wide `tsc --noEmit` as the success signal.

---

## Task Group A: Part 1 Only

### Task A0: User literacy — Help page + Avg PCA popover (Part I)

**Goal:** Reduce confusion between **display Avg** (continuous/raw), **surplus-adjusted floating targets** (Step 2→3 projection), and **post-need extra** (optional Step 3.4 placement). Align copy with `2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` Part I and `2026-04-13-step3-floating-nonfloating-contract-table.md`.

**Files:**
- Add: `app/(dashboard)/help/avg-and-slots/page.tsx`
- Add: `components/help/avgPcaFormulaSteps.tsx`, `components/help/AvgPcaFormulaPopoverContent.tsx`
- Modify: `components/help/HelpCenterContent.tsx`, `components/schedule/ScheduleBlocks1To6.tsx`, `app/(dashboard)/schedule/page.tsx`

- [ ] **Step 1:** Add the Help article route and shared formula fragments; wire Help Center “Guides” card.
- [ ] **Step 2:** Refactor both Avg PCA popovers to use `AvgPcaFormulaPopoverContent`; preserve schedule page **live** sanity-check numbers via `sanityCheckFooter`.
- [ ] **Step 3:** Manually verify `/help/avg-and-slots`, popover scroll on small viewports, and Link from dashboard + schedule PCA Calculations block.

### Task A0b: Planned micro-lines — Step 3.1 / Step 3.4 (deferred)

**Status:** Spec-only unless explicitly picked up. **Do not implement** until Task Group A projection semantics and Help/popover literacy are stable.

**Goal:** One **discreet** line each: **surplus-adjusted** context in **Step 3.1**, **post-need extra** context in **Step 3.4** (distinct wording), per `2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` Locked decision 2.

**Files (expected when implemented):**
- `components/allocation/FloatingPCAConfigDialogV2.tsx` (e.g. per-team or footer line when surplus-adjusted seed applies — flag from projection / `realizedSurplusSlotGrantsByTeam` or equivalent)
- Step 3.4 preview / tracker shell (exact component TBD — line when post-need / extra-coverage preview applies)

- [ ] **Step 1:** Add non-intrusive line in 3.1 when surplus-adjusted seed applies; optional “?” link to `/help/avg-and-slots`.
- [ ] **Step 2:** Add non-intrusive line in 3.4 when post-need / extra-coverage preview applies; must **not** reuse surplus-adjusted wording.
- [ ] **Step 3:** Manual check on a fixture date with and without grants / extra coverage.

**Docs / naming:** Maintain the **engineering field glossary** in the contract table + surplus spec; **no mass rename** of projection fields for this task.

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

### Task B1: Lock optional ranked-promotion semantics before implementation

**Files:**
- Create: `tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- Create: `tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- Create: `tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`
- Create: `tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`
- Test: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Test: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Test: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`

- [ ] **Step 1: Write the failing bounded-swap promotion regression**

Create `tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts` to lock:

```ts
import assert from 'node:assert/strict'

// Fixture idea:
// - requester already met required pending and required ranked coverage
// - requester holds a lower-ranked slot
// - donor can swap safely with no net loss
// Assert final allocator prefers the higher-ranked outcome.
```

- [ ] **Step 2: Run the bounded-swap regression and verify RED**

Run:

```bash
npx tsx tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts
```

Expected: FAIL because no distinct optional-promotion phase exists yet.

- [ ] **Step 3: Write the failing same-PCA sway promotion regression**

Create `tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts` to lock a case where:
- the same PCA can be reoriented
- donor remains acceptably covered
- requester improves from lower-ranked to higher-ranked coverage

- [ ] **Step 4: Run the same-PCA sway regression and verify RED**

Run:

```bash
npx tsx tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts
```

Expected: FAIL because promotion is not modeled separately yet.

- [ ] **Step 5: Write the failing harmful-donation blocker regression**

Create `tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts` to assert that optional promotion stays blocked when donor would:
- lose stronger ranked coverage
- lose fairness floor
- or incur a net harmful loss

- [ ] **Step 6: Run the harmful-donation regression and verify RED**

Run:

```bash
npx tsx tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts
```

Expected: FAIL because the current logic either does not attempt promotion or risks conflating it with ordinary donation logic.

- [ ] **Step 7: Write the failing "not a B1 defect" regression**

Create `tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts` to assert:

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

- [ ] **Step 8: Run the B1-separation regression and verify RED**

Run:

```bash
npx tsx tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts
```

Expected: FAIL because the new optional-promotion concept does not exist yet.

- [ ] **Step 9: Commit**

```bash
git add tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts
git commit -m "test: lock optional ranked promotion regressions"
```

### Task B2: Add a distinct optional-promotion audit concept in V2 repair

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Test: `tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`

- [ ] **Step 1: Extend the V2 audit model with a distinct optional-promotion concept**

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

- [ ] **Step 2: Generate promotion candidates from the new concept**

In `lib/algorithms/floatingPcaV2/repairMoves.ts`, add candidate generation for:
- bounded swap
- donor-safe move
- same-PCA sway

Do not generate harmful donation candidates for `P1`.

- [ ] **Step 3: Run the B1-separation regression and make it GREEN**

Run:

```bash
npx tsx tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/floatingPcaV2/repairMoves.ts tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts
git commit -m "feat: separate optional ranked promotion from b1 repair"
```

### Task B3: Score and orchestrate optional ranked promotion

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
- Test: `tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- Test: `tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- Test: `tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`

- [ ] **Step 1: Extend score-building so optional promotion can improve quality without redefining required coverage**

In `lib/algorithms/floatingPcaV2/scoreSchedule.ts`, add a distinct quality signal for optional promotion outcomes, for example:

```ts
export type RankedSlotAllocationScore = {
  highestRankCoverage: number
  rankedCoverageSatisfied: number
  fairnessSatisfied: number
  totalFulfilledPendingQuarterSlots: number
  gymLastResortCount: number
  rankedPromotionQuality: number
  rankedSlotMatchCount: number
  duplicateFloatingCount: number
  splitPenalty: number
}
```

Place it after required-coverage metrics and before lower-priority cosmetic tie-breakers.

- [ ] **Step 2: Insert the optional promotion phase into V2 orchestration**

In `lib/algorithms/floatingPcaV2/allocator.ts`, add the optional promotion pass after required repair succeeds and before final schedule freeze.

Requirements:
- required repair still runs first
- optional promotion must not be silently suppressed by the capped-ranked-gap fix
- harmful donation stays blocked

- [ ] **Step 3: Run the three optional-promotion regressions and make them GREEN**

Run:

```bash
npx tsx tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts
npx tsx tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts
npx tsx tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/algorithms/floatingPcaV2/scoreSchedule.ts lib/algorithms/floatingPcaV2/allocator.ts tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts
git commit -m "feat: add optional ranked promotion to v2 repair"
```

### Task B4: Add tiny tooltip/provenance wording for ranked-promotion outcomes

**Files:**
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- Test if needed: one of `f111`-`f113` or a dedicated follow-up regression

- [ ] **Step 1: Add tiny provenance wording for promotion-origin repair rows**

Modify tooltip detail generation so promotion-origin repair rows can say something like:

```ts
{ label: 'Repair reason', value: 'Ranked promotion via bounded swap' }
```

Only do this when the final repair/provenance metadata proves that the row came from the optional-promotion phase.

- [ ] **Step 2: Run the relevant promotion regression(s) and verify no behavior drift**

Run at least:

```bash
npx tsx tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts
npx tsx tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused lints for Task Group B files**

Run IDE lints on:
- `lib/algorithms/floatingPcaV2/repairAudit.ts`
- `lib/algorithms/floatingPcaV2/repairMoves.ts`
- `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- `lib/algorithms/floatingPcaV2/allocator.ts`
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`

Expected: no new lint errors introduced by Task Group B.

- [ ] **Step 4: Commit**

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
- `npx tsx tests/regression/f111-step34-v2-optional-ranked-promotion-allows-bounded-swap-after-required-coverage.test.ts`
- `npx tsx tests/regression/f112-step34-v2-optional-ranked-promotion-allows-same-pca-sway-when-donor-remains-whole.test.ts`
- `npx tsx tests/regression/f113-step34-v2-optional-ranked-promotion-blocks-harmful-donation.test.ts`
- `npx tsx tests/regression/f114-step34-v2-optional-ranked-promotion-is-not-modeled-as-b1-defect.test.ts`
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
- Part II is covered by Task Group B through separate audit concept, candidate generation, orchestration, scoring, and tooltip wording.
- V1/V2 boundary discipline is explicitly called out in scope, constraints, and untouched-file lists.

### Placeholder scan
- Every task includes exact files and concrete commands.
- New regression filenames are specified for both groups.
- No "TBD" or "implement later" placeholders remain.

### Type consistency
- Task Group A consistently uses `rawSurplusFte`, `idealWeightedSurplusShareByTeam`, `redistributableSlackSlots`, and `realizedSurplusSlotGrantsByTeam`.
- Task Group B consistently treats optional ranked promotion as a concept distinct from `B1`.

## Execution Handoff
Plan complete and saved to `docs/superpowers/plans/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
