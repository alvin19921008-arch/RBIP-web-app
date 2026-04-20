# Budgeted Extra-after-needs + remove Raised target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the new Step 3.4 **budgeted Extra after needs** behavior (bounded + under-assigned-first) and Step 3.1 anticipation UX (progressive disclosure), then fully remove the legacy V2 “Raised target (shared spare)” surplus-grant pathway.

**Architecture:** Add a small, pure “extra budget” math module under `lib/features/schedule/` that computes (1) pool spare slots, (2) “after rounded needs” balances (`Assigned − Avg`), (3) extra budget, and (4) a deterministic fairness tie-break. Use the same module for Step 3.1 UI preview and for Step 3.4 allocator inputs. Phase 2 deletes the surplus-grant fields and UI, converging to one mental model.

**Tech Stack:** TypeScript, Next.js/React UI under `features/schedule/ui/`, allocator under `lib/algorithms/floatingPcaV2/`, regression tests run via `npx tsx tests/regression/*.test.ts`.

### Regression test strategy (prefer rewrite, avoid bloat)

Do **not** add new numbered `f###` files for this feature unless you hit a truly orthogonal invariant.

- **Step 3.1 preview + pure budget math + `seededShuffle`:** extend **`tests/regression/f61-step31-projected-extra-slots-preview.test.ts`** (add sections / `main()` blocks for deterministic shuffle, two-gate budget, silent preview when `extraBudgetSlots === 0`).
- **Step 3.4 budgeted extra-after-needs + allocator:** extend **`tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts`** (and/or **`tests/regression/f69-step34-extra-coverage-duplicate-characterization.test.ts`** if extra-coverage placement is the focus)—replace obsolete assertions that assumed unbounded round-robin with budget + under-assigned-first expectations.
- **Surplus / raised-target (Phase 2):** **rewrite** existing surplus regressions (e.g. `f106`–`f108`, `f111`, and any bootstrap summary tests that assert `redistributableSlackSlots` / grants) instead of adding parallel files.

When a test file’s name no longer matches its behavior, **rename the file in the same PR** only if grep shows few imports; otherwise update the file header comment to reflect the new story.

---

## Scope check (decomposition)

This plan has **two phases** that can be implemented as separate PRs:

- **Phase 1** (must ship first): budgeted Extra after needs + Step 3.1 anticipation UX + copy harmonization (Over/Under-assigned).
- **Phase 2** (end-state): remove “Raised target (shared spare)” surplus-grant pathway and related UI/copy/tests.

Phase 2 is larger and will touch more Step 3 projection code; do not start it until Phase 1 is green and stakeholders accept the new extras behavior.

---

## File structure (new + touched)

### Phase 1 (budgeted extras + Step 3.1 anticipation)

**Create**
- `lib/utils/seededRandom.ts` — deterministic RNG + shuffle from a string seed (no dependencies).
- `lib/features/schedule/step3ExtraAfterNeedsBudget.ts` — pure math: balances, sums, pool spare slots, extra budget, recipient preview order.

**Modify**
- `lib/algorithms/floatingPcaShared/contracts.ts` — extend context to carry a new `extraAfterNeedsPolicy` payload.
- `lib/algorithms/floatingPcaV2/allocator.ts` — replace unbounded round-robin extra pass with budgeted under-assigned-first pass.
- `lib/features/schedule/step3V2CommittedSelections.ts` — compute and pass `extraAfterNeedsPolicy` into allocator; remove/ignore legacy `extraCoverageMode` in V2 path.
- `features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV2.tsx` — Step 3.1 preview line + progressive disclosure blocks (Supply/Demand/Recipient preview).
- `lib/features/schedule/step31ProjectedExtraSlots.ts` — update tooltip helpers to match the new numbers-first preview (or deprecate in favor of new module).
- `tests/regression/f61-step31-projected-extra-slots-preview.test.ts` — **extend** with seeded-shuffle + `computeStep31ExtraAfterNeedsBudget` cases (no new `f###` file).
- `features/schedule/ui/SchedulePageClient.tsx` — rename sanity-check line labels to “Over-assigned / Under-assigned / Net”.
- `components/help/avgPcaFormulaSteps.tsx` — update static “sanity check” copy to match Over/Under-assigned wording.
- `components/help/AvgPcaContinuousVsSlotsExplain.tsx` — update Extra-after-needs paragraph to mention “budgeted” (bounded).

### Phase 2 (remove Raised target pathway)

**Modify (expected)**
- `lib/features/schedule/step3Bootstrap.ts` — remove surplus-grant fields and computation (`redistributableSlackSlots`, `realizedSurplusSlotGrantsByTeam`, `roundedAdjustedTeamTargets`, etc.).
- `lib/features/schedule/controller/useScheduleController.ts` — remove projection plumbing for surplus-grant provenance.
- `features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV2.tsx` — remove “Raised target (shared spare)” line + expander and any related help popover variant.
- `components/help/WizardAvgSlotsHelpInlinePopover.tsx` — remove `variant="raised-target"` path.
- `docs/glossary/step3-floating-nonfloating.md` and `/help/avg-and-slots` copy surfaces — align to single-model story.
- Multiple regression tests that currently assert surplus-grant behavior.

---

## Phase 1 — Task 1: Add deterministic seeded shuffle utility

**Files:**
- Create: `lib/utils/seededRandom.ts`
- Test: extend `tests/regression/f61-step31-projected-extra-slots-preview.test.ts` (add a small `seededShuffle` block at the top or bottom of `main()`; do **not** create a new `f###` file)

- [x] **Step 1: Write failing regression for deterministic shuffle**

In `tests/regression/f61-step31-projected-extra-slots-preview.test.ts`, add assertions for `seededShuffle` (initial skeleton):

```ts
import assert from 'node:assert/strict'
import { seededShuffle } from '../../lib/utils/seededRandom'

async function main() {
  const input = ['FO', 'SMM', 'DRO', 'NSM']
  const a = seededShuffle(input, '2026-04-20|example')
  const b = seededShuffle(input, '2026-04-20|example')
  assert.deepEqual(a, b, 'Expected seededShuffle to be deterministic for the same seed')
  assert.deepEqual(
    input,
    ['FO', 'SMM', 'DRO', 'NSM'],
    'Expected seededShuffle to not mutate input'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [x] **Step 2: Run it to verify it fails**

Run:

```bash
npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts
```

Expected: FAIL with “Cannot find module … seededRandom”.

- [x] **Step 3: Implement `seededShuffle`**

Create `lib/utils/seededRandom.ts`:

```ts
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rng = mulberry32(fnv1a32(seed))
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]!
    next[j] = tmp!
  }
  return next
}
```

- [x] **Step 4: Run regression and confirm pass**

```bash
npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts
```

Expected: PASS (no output, exit code 0).

- [x] **Step 5: Commit**

```bash
git add lib/utils/seededRandom.ts tests/regression/f61-step31-projected-extra-slots-preview.test.ts
git commit -m "feat(step3): add deterministic seeded shuffle helper"
```

---

## Phase 1 — Task 2: Implement extra-after-needs budget math module

**Files:**
- Create: `lib/features/schedule/step3ExtraAfterNeedsBudget.ts`
- Expand test: same file — `tests/regression/f61-step31-projected-extra-slots-preview.test.ts` (two-gate budget assertions live next to the shuffle tests)

### Public API (locked by this plan)

Add these exports:

```ts
import type { Team } from '@/types/staff'

export type TeamBalanceSummary = {
  overAssignedSum: number
  underAssignedSum: number
  net: number
  perTeamText: string
  balanceByTeam: Record<Team, number>
}

export type Step31ExtraAfterNeedsBudget = {
  neededSlots: number
  poolSpareSlots: number
  qualifyingExtraSlotsFromAggregate: number
  extraBudgetSlots: number
  balanceAfterRoundedNeedsByTeam: Record<Team, number>
  balanceSummary: TeamBalanceSummary
  /** Top recipients preview (max 3), with after-slot balance flip shown. */
  recipientsPreview: Array<{ team: Team; before: number; after: number }>
}

export function buildTeamBalanceSummary(args: {
  teams: Team[]
  balanceByTeam: Record<Team, number>
}): TeamBalanceSummary

export function computeStep31ExtraAfterNeedsBudget(args: {
  teams: Team[]
  avgByTeam: Record<Team, number>
  existingAssignedFteByTeam: Record<Team, number>
  pendingFloatingFteByTeam: Record<Team, number>
  availableFloatingSlots: number
  tieBreakSeed: string
  previewLimit?: number
}): Step31ExtraAfterNeedsBudget
```

- [x] **Step 1: Extend the regression test to cover the two-gate model**

In `tests/regression/f61-step31-projected-extra-slots-preview.test.ts`, add (or replace obsolete preview assertions with) coverage for `computeStep31ExtraAfterNeedsBudget`, for example:

```ts
import { computeStep31ExtraAfterNeedsBudget } from '../../lib/features/schedule/step3ExtraAfterNeedsBudget'

// ...
  const teams = ['FO', 'SMM', 'DRO', 'NSM'] as const
  const avg = { FO: 1.13, SMM: 1.13, DRO: 1.13, NSM: 1.13 }
  const existing = { FO: 1.0, SMM: 1.0, DRO: 1.0, NSM: 1.0 }
  const pending = { FO: 0.0, SMM: 0.0, DRO: 0.25, NSM: 0.25 }

  const noSpare = computeStep31ExtraAfterNeedsBudget({
    teams: [...teams],
    avgByTeam: avg as any,
    existingAssignedFteByTeam: existing as any,
    pendingFloatingFteByTeam: pending as any,
    availableFloatingSlots: 2,
    tieBreakSeed: '2026-04-20',
  })
  assert.equal(noSpare.poolSpareSlots, 0)
  assert.equal(noSpare.extraBudgetSlots, 0, 'Expected no extras when pool spare is zero')

  const withSpare = computeStep31ExtraAfterNeedsBudget({
    teams: [...teams],
    avgByTeam: avg as any,
    existingAssignedFteByTeam: existing as any,
    pendingFloatingFteByTeam: pending as any,
    availableFloatingSlots: 3,
    tieBreakSeed: '2026-04-20',
  })
  assert.equal(withSpare.poolSpareSlots, 1)
  assert.equal(withSpare.extraBudgetSlots, 1, 'Expected one extra when aggregate qualifies and pool spare is one')
  assert.ok(withSpare.recipientsPreview.length > 0)
```

- [x] **Step 2: Run test to confirm it fails (module missing)**

```bash
npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts
```

- [x] **Step 3: Implement `step3ExtraAfterNeedsBudget.ts`**

Create `lib/features/schedule/step3ExtraAfterNeedsBudget.ts`:

```ts
import { seededShuffle } from '@/lib/utils/seededRandom'
import { createEmptyTeamRecord } from '@/lib/utils/types'
import type { Team } from '@/types/staff'

const Q = 0.25

export type TeamBalanceSummary = {
  overAssignedSum: number
  underAssignedSum: number
  net: number
  perTeamText: string
  balanceByTeam: Record<Team, number>
}

export type Step31ExtraAfterNeedsBudget = {
  neededSlots: number
  poolSpareSlots: number
  qualifyingExtraSlotsFromAggregate: number
  extraBudgetSlots: number
  balanceAfterRoundedNeedsByTeam: Record<Team, number>
  balanceSummary: TeamBalanceSummary
  recipientsPreview: Array<{ team: Team; before: number; after: number }>
}

export function buildTeamBalanceSummary(args: {
  teams: Team[]
  balanceByTeam: Record<Team, number>
}): TeamBalanceSummary {
  let overAssignedSum = 0
  let underAssignedSum = 0
  for (const team of args.teams) {
    const bal = args.balanceByTeam[team] ?? 0
    if (bal > 0) overAssignedSum += bal
    if (bal < 0) underAssignedSum += Math.abs(bal)
  }
  const perTeamText = args.teams
    .map((team) => {
      const v = args.balanceByTeam[team] ?? 0
      return `${team} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`
    })
    .join(' | ')

  return {
    overAssignedSum,
    underAssignedSum,
    net: overAssignedSum - underAssignedSum,
    perTeamText,
    balanceByTeam: { ...args.balanceByTeam },
  }
}

function buildRecipientsPreview(args: {
  teams: Team[]
  balanceByTeam: Record<Team, number>
  extraBudgetSlots: number
  tieBreakSeed: string
  previewLimit: number
}): Array<{ team: Team; before: number; after: number }> {
  const preview: Array<{ team: Team; before: number; after: number }> = []
  const remainingUnder = createEmptyTeamRecord<number>(0)
  for (const team of args.teams) {
    const bal = args.balanceByTeam[team] ?? 0
    remainingUnder[team] = Math.max(0, -bal)
  }

  let tieCursor = 0
  for (let i = 0; i < Math.min(args.extraBudgetSlots, args.previewLimit); i += 1) {
    let maxUnder = 0
    for (const team of args.teams) {
      maxUnder = Math.max(maxUnder, remainingUnder[team] ?? 0)
    }
    if (maxUnder <= 1e-12) break

    const tied = args.teams.filter((t) => Math.abs((remainingUnder[t] ?? 0) - maxUnder) < 1e-9)
    const tieOrder = seededShuffle(tied, `${args.tieBreakSeed}|tie:${i}`)
    const winner = tieOrder[tieCursor % tieOrder.length]!
    tieCursor += 1

    const before = args.balanceByTeam[winner] ?? 0
    const after = before + Q
    preview.push({ team: winner, before, after })
    remainingUnder[winner] = Math.max(0, (remainingUnder[winner] ?? 0) - Q)
  }
  return preview
}

export function computeStep31ExtraAfterNeedsBudget(args: {
  teams: Team[]
  avgByTeam: Record<Team, number>
  existingAssignedFteByTeam: Record<Team, number>
  pendingFloatingFteByTeam: Record<Team, number>
  availableFloatingSlots: number
  tieBreakSeed: string
  previewLimit?: number
}): Step31ExtraAfterNeedsBudget {
  const balanceByTeam = createEmptyTeamRecord<number>(0)
  let neededSlots = 0

  for (const team of args.teams) {
    const avg = args.avgByTeam[team] ?? 0
    const existing = args.existingAssignedFteByTeam[team] ?? 0
    const pending = args.pendingFloatingFteByTeam[team] ?? 0
    neededSlots += Math.round((pending + 1e-9) / Q)
    const assignedAfterRoundedNeeds = existing + pending
    balanceByTeam[team] = assignedAfterRoundedNeeds - avg
  }

  const poolSpareSlots = Math.max(0, args.availableFloatingSlots - neededSlots)
  const balanceSummary = buildTeamBalanceSummary({ teams: args.teams, balanceByTeam })
  const qualifyingExtraSlotsFromAggregate = Math.floor(balanceSummary.underAssignedSum / Q + 1e-9)
  const extraBudgetSlots = Math.min(poolSpareSlots, qualifyingExtraSlotsFromAggregate)

  const recipientsPreview = buildRecipientsPreview({
    teams: args.teams,
    balanceByTeam,
    extraBudgetSlots,
    tieBreakSeed: args.tieBreakSeed,
    previewLimit: args.previewLimit ?? 3,
  })

  return {
    neededSlots,
    poolSpareSlots,
    qualifyingExtraSlotsFromAggregate,
    extraBudgetSlots,
    balanceAfterRoundedNeedsByTeam: balanceByTeam,
    balanceSummary,
    recipientsPreview,
  }
}
```

- [x] **Step 4: Run regression tests**

```bash
npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts
```

- [x] **Step 5: Commit**

```bash
git add lib/features/schedule/step3ExtraAfterNeedsBudget.ts tests/regression/f61-step31-projected-extra-slots-preview.test.ts
git commit -m "feat(step3): compute budgeted extra-after-needs preview"
```

---

## Phase 1 — Task 3: Extend allocator contracts for budgeted extras

**Files:**
- Modify: `lib/algorithms/floatingPcaShared/contracts.ts`
- Modify: `lib/features/schedule/step3V2CommittedSelections.ts`
- Tests: keep `f61` green; adjust Step 3.4 regressions in Task 4 (`f99` / `f69`)

- [x] **Step 1: Update contracts**

Edit `lib/algorithms/floatingPcaShared/contracts.ts` to add:

```ts
export type ExtraAfterNeedsPolicy =
  | { mode: 'none' }
  | {
      mode: 'budgeted-under-assigned-first'
      budgetSlots: number
      /** balance = Assigned(after rounded needs) − Avg; negative means under-assigned */
      balanceAfterRoundedNeedsByTeam: Record<Team, number>
      tieBreakSeed: string
    }
```

And add to `FloatingPCAAllocationContextV2`:

```ts
extraAfterNeedsPolicy?: ExtraAfterNeedsPolicy
```

- [x] **Step 2: Ensure current callers compile (temporary default)**

In the same edit, ensure `extraAfterNeedsPolicy` defaults to `{ mode: 'none' }` inside V2 allocator entry if missing.

- [x] **Step 3: Commit**

```bash
git add lib/algorithms/floatingPcaShared/contracts.ts
git commit -m "feat(step3): add budgeted extra-after-needs policy contract"
```

---

## Phase 1 — Task 4: Implement budgeted extra-after-needs pass in V2 allocator

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
- Tests: **extend** `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts` (and split assertions into clearly labeled sections inside the file). Optionally fold overlapping expectations from `tests/regression/f69-step34-extra-coverage-duplicate-characterization.test.ts` if both files duplicate the same extra-coverage harness.

- [x] **Step 1: Write failing regression**

In `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts`, add a new section (or replace obsolete “unbounded round-robin” expectations) with a minimal harness that:

- Builds a V2 allocation context with `extraAfterNeedsPolicy` set to:
  - `mode: 'budgeted-under-assigned-first'`
  - `budgetSlots: 1`
  - `balanceAfterRoundedNeedsByTeam` with one clearly most-under team
  - `tieBreakSeed: '2026-04-20'`
- Asserts the resulting `extraCoverageByStaffId` (or tracker assignments tagged `assignmentTag: 'extra'`) count is **≤ 1** and is attributed to the expected team.

Use existing Step 3 harness patterns from:
- `lib/features/schedule/step3Harness/runStep3V2Harness.ts`
- existing extra-coverage regressions (e.g. `tests/regression/f99-*.test.ts`)

- [x] **Step 2: Run it to confirm failure**

```bash
npx tsx tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
```

- [x] **Step 3: Implement new pass**

In `lib/algorithms/floatingPcaV2/allocator.ts`, replace `applyExtraCoverageRoundRobin()` with:

```ts
const applyExtraAfterNeedsBudgeted = () => {
  const policy = context.extraAfterNeedsPolicy ?? { mode: 'none' as const }
  if (policy.mode !== 'budgeted-under-assigned-first') return
  if (policy.budgetSlots <= 0) return

  const allSatisfied = TEAMS.every(
    (team) => roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25
  )
  if (!allSatisfied) return

  // Under amounts: max(0, -balance)
  const remainingUnder = createEmptyPendingFTE()
  for (const team of TEAMS) {
    const bal = policy.balanceAfterRoundedNeedsByTeam[team] ?? 0
    remainingUnder[team] = Math.max(0, -bal)
  }

  let extrasPlaced = 0
  let tieCursor = 0
  while (extrasPlaced < policy.budgetSlots) {
    const maxUnder = Math.max(...TEAMS.map((t) => remainingUnder[t] ?? 0))
    if (maxUnder <= 1e-12) break

    const tied = TEAMS.filter((t) => Math.abs((remainingUnder[t] ?? 0) - maxUnder) < 1e-9)
    const tieOrder = seededShuffle(tied, `${policy.tieBreakSeed}|allocator:${extrasPlaced}`)
    const team = tieOrder[tieCursor % tieOrder.length]!
    tieCursor += 1

    // Attempt to assign one extra slot (0.25) to `team` using existing `findAvailablePCAs` logic.
    // If not feasible, set remainingUnder[team] = 0 for this loop iteration and continue.
    // If feasible, record assignments with allocationStage 'extra-coverage' and assignmentTag 'extra'.
    // On success: remainingUnder[team] = max(0, remainingUnder[team] - 0.25); extrasPlaced += 1.
  }
}
```

Notes:
- Use the same candidate selection logic already present in the current round-robin extra pass.
- Bound the loop by `budgetSlots`; also add a safety attempt cap (e.g. `budgetSlots * TEAMS.length`) to avoid pathological loops if feasibility is sparse.

- [x] **Step 4: Run regressions**

```bash
npx tsx tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
```

- [x] **Step 5: Commit**

```bash
git add lib/algorithms/floatingPcaV2/allocator.ts tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
git commit -m "feat(step34): budget extra-after-needs and pick under-assigned first"
```

---

## Phase 1 — Task 5: Wire Step 3.1 UI preview + progressive disclosure

**Files:**
- Modify: `features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV2.tsx`
- Modify: `lib/features/schedule/step31ProjectedExtraSlots.ts` (or remove its usage)
- Modify: `tests/regression/f61-step31-projected-extra-slots-preview.test.ts`

- [ ] **Step 1: Update Step 3.1 preview to use new module**

In `FloatingPCAConfigDialogV2.tsx`, compute:

- `availableFloatingSlots` from the Step 3 bootstrap summary
- `avgByTeam` from projection display targets
- `existingAssignedFteByTeam` from projection
- `pendingFloatingFteByTeam` from current Step 3.1 pending state (`adjustedFTE`)
- `tieBreakSeed` from schedule date + projection version (e.g. `${selectedDate}|${projectionVersionNow}`)

Then call:

```ts
const budget = computeStep31ExtraAfterNeedsBudget({ ... })
```

Render:
- preview line only when `budget.extraBudgetSlots > 0` (silent otherwise)
- chevron expander with:
  - Supply lines (`available`, `needed`, `spare`)
  - Demand mono line (`Over-assigned / Under-assigned / Net`) + per-team text + legend
  - Recipient preview (top 2–3 `before → after`)

- [ ] **Step 2: Update Step 3.4 preview call to pass policy**

When calling `runStep3V2CommittedSelections(...)`, pass:

```ts
extraAfterNeedsPolicy: {
  mode: 'budgeted-under-assigned-first',
  budgetSlots: budget.extraBudgetSlots,
  balanceAfterRoundedNeedsByTeam: budget.balanceAfterRoundedNeedsByTeam,
  tieBreakSeed,
}
```

Remove `extraCoverageMode: 'round-robin-team-order'` from the V2 path.

- [ ] **Step 3: Reconcile `f61` with Tasks 1–2 (avoid duplicate blocks)**

If Tasks 1–2 already added `seededShuffle` + `computeStep31ExtraAfterNeedsBudget` assertions to `f61`, **only** remove obsolete imports/expectations (e.g. `buildStep31PreviewExtraCoverageOptions` / round-robin-only preview) and add any **UI-specific** checks still missing. Do not duplicate the same budget math in two places inside `f61`.

- [ ] **Step 4: Run regressions**

```bash
npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV2.tsx lib/features/schedule/step31ProjectedExtraSlots.ts tests/regression/f61-step31-projected-extra-slots-preview.test.ts
git commit -m "feat(step31): show budgeted likely extras with progressive disclosure"
```

---

## Phase 1 — Task 6: Harmonize labels to Over/Under-assigned on schedule sanity check

**Files:**
- Modify: `features/schedule/ui/SchedulePageClient.tsx`
- Modify: `components/help/avgPcaFormulaSteps.tsx`

- [ ] **Step 1: Update schedule popover labels**

In `SchedulePageClient.tsx` sanity footer, change:

```tsx
+ve sum: ...
-ve abs sum: ...
```

to:

```tsx
Over-assigned: {positiveSum.toFixed(2)} | Under-assigned: {negativeAbsSum.toFixed(2)} | Net: {netDiff.toFixed(2)}
```

- [ ] **Step 2: Update static sanity-check copy**

In `AvgPcaSanityCheckStaticDescription`, update text to:

- define `balance = Assigned − Avg`
- explain that “Over-assigned sum” roughly matches “Under-assigned sum” (drift from rounding + display)

- [ ] **Step 3: Commit**

```bash
git add features/schedule/ui/SchedulePageClient.tsx components/help/avgPcaFormulaSteps.tsx
git commit -m "chore(copy): standardize over/under-assigned balance wording"
```

---

## Phase 2 — Task 7: Remove Raised target (shared spare) surplus-grant pathway (end-state)

**Hard gate:** Do not start Phase 2 until Phase 1 has shipped/been accepted.

**Files (expected):**
- `lib/features/schedule/step3Bootstrap.ts`
- `lib/features/schedule/controller/useScheduleController.ts`
- `features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV2.tsx`
- `components/help/WizardAvgSlotsHelpInlinePopover.tsx`
- `components/help/AvgPcaContinuousVsSlotsExplain.tsx`
- Many regression tests under `tests/regression/` that assert surplus behavior

- [ ] **Step 1: Write characterization test for current Step 3.1 required pending without surplus grants**

Add a regression that asserts Step 3.1 pending seeding equals:

`pending = roundToNearestQuarter( max(0, Avg − existingAssigned) )`

for representative teams, with no surplus-grant uplift.

- [ ] **Step 2: Remove surplus fields from `Step3BootstrapSummary` and `Step3ProjectionV2`**

In `lib/features/schedule/step3Bootstrap.ts`, delete:
- `redistributableSlackSlots`
- `realizedSurplusSlotGrantsByTeam`
- `roundedAdjustedTeamTargets`
- `surplusAdjustmentDeltaByTeam`
- and related V2 metadata fields, along with their computation branches.

Update any consumers to stop rendering “Raised target (shared spare)” UI.

- [ ] **Step 3: Remove raised-target UI + inline popover variant**

In `FloatingPCAConfigDialogV2.tsx`, remove the entire “Raised target (shared spare)” section and its expander.

In `WizardAvgSlotsHelpInlinePopover.tsx`:
- remove `variant: 'raised-target'`
- keep only the “Extra after needs” help body (updated to say “budgeted”).

- [ ] **Step 4: Update/regenerate affected regressions**

**Rewrite in place** (do not add parallel surplus tests): update `f106`–`f108`, `f111`, and any other files that assert `redistributableSlackSlots`, `realizedSurplusSlotGrantsByTeam`, or raised-target UI. Delete redundant assertions once the new story is covered.

Run impacted regressions (start with Step 3 bootstrap/projection tests) and update them to the new end-state semantics.

- [ ] **Step 5: Commit Phase 2 as a dedicated PR-sized series**

Prefer several smaller commits:
- remove types + fields
- update UI surfaces
- update help copy
- update tests

---

## Verification checklist (before calling Phase 1 “done”)

- [ ] Run lint: `npm run lint`
- [ ] Run key regressions:

```bash
npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts
npx tsx tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
```

- [ ] Manually verify Step 3.1:
  - Preview line is **silent** when budget is 0
  - Expander shows Supply/Demand/Recipient preview and uses Over/Under-assigned labels
- [ ] Manually verify Step 3.4:
  - Extras never exceed budget
  - When ties exist, recipients vary by day (seed) but remain stable within a day

