# Floating PCA Ranked Slot Step 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved ranked-slot floating PCA redesign across dashboard preferences, Step 3.2 assist flow, Step 3.4 final review, and hover diagnostics without changing the stored database shape.

**Architecture:** Keep `preferred_slots: number[]` as the persisted field, but reinterpret it as an ordered ranked list. Move the authoritative ranked-slot logic into `allocateFloatingPCA_v2()` using a slot-first ladder (`ranked-unused -> unranked-unused -> ranked-duplicate -> gym-last-resort`), while Step 3.2 becomes a narrow exception-preview step and the Step 3.4 UI becomes the human-readable final review surface before save.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Radix UI, dnd-kit, Node `assert` regression tests, Playwright smoke tests

---

## Handoff: start here in a new chat

You do **not** need the previous conversation. Treat the two specs below plus this plan as the source of truth.

### Authoritative specs (read order)

1. **Allocator / policy:** `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`  
   Ranked slots, pending-first, continuity, duplicate rules, gym last resort, diagnostics fields, scenario table.

2. **UI / copy:** `docs/superpowers/specs/2026-04-06-floating-pca-step3-ui-design.md`  
   **Dashboard** ranked-slot entry in PCA preferences, Step 3 family shell, Step 3.1 scarcity preview, Step 3.2 exception-first flow, Step 3.4 connected detail block, plain language (`1st choice`, `Other`, `Gym`).

3. **Optional visual reference (static HTML mock, not production):**  
   `.superpowers/brainstorm/96515-1775525468/content/step3-family-preview-v2.html`  
   Open in a browser for layout/spacing intent only; implement in React using existing RBIP components and `design-elements-commonality` rules.

### Problem this work solves (product)

- Colleagues care **more about getting coverage on ranked time slots** than about which named PCA fills them; the old allocator could favor preferred PCA in ways that skipped the top-ranked slot.
- Dashboard allowed only **one** “preferred slot”; product wants an **ordered list** of slots the team cares about (partial ranking allowed).
- Multiple **different** floating PCAs were stacking on the **same** team slot while another non-gym slot was still unused; that should be avoided until unused useful slots are exhausted.

### Approved policy summary (allocator)

- **Pending FTE** for the team is still the top priority: if any legal path exists, pending must be met.
- **Slot targets** are tried in this order:  
  **ranked unused (non-gym)** → **unranked unused (non-gym)** → **duplicate** (prefer ranked order for *which* slot duplicates, non-gym before gym) → **gym** only as **true last resort** when `avoid gym` is on.
- **Within** a chosen slot, PCA choice is roughly: continuity that respects rank order, then **preferred PCA** if available, else **floor** PCA, else **non-floor** PCA. Continuity must **not** skip a higher-ranked slot.
- **Step 3.2** is **assist / exception preview only** (e.g. when top feasible rank cannot use preferred PCA). **Step 3.4** (`allocateFloatingPCA_v2`) remains **authoritative** for final placement.

### Current codebase vs target (so you search the right places)

| Area | Today (typical) | Target |
| --- | --- | --- |
| **Dashboard → PCA preferences** (`components/dashboard/PCAPreferencePanel.tsx`, `PCAPreferenceForm`) | Section **“Preferred slot (1 only)”**; `handleSubmit` rejects `preferredSlots.length > 1` | **“Ranked slots”**: user can rank **only the slots they care about** (1–4, partial lists OK), **reorder** (drag-and-drop or up/down—match spec + existing dnd patterns). Gym slot + “avoid gym” stay as today. Persist via same `preferred_slots` array **in priority order**. |
| `PCAPreference.preferred_slots` | Array in DB, UI enforces max 1 | Same field, **ordered** ranked list; no new column |
| `getTeamPreferenceInfo()` in `lib/utils/floatingPCAHelpers.ts` | Effectively `preferred_slots[0]` | Full ranked + unranked buckets + duplicate order |
| `computeReservations()` in `lib/utils/reservationLogic.ts` | Uses first preferred slot + preferred PCA | Exception-oriented preview aligned with ranked slots |
| `allocateFloatingPCA_v2()` in `lib/algorithms/pcaAllocationFloating.ts` | Cycles + conditions A–D, PCA-centric patterns | Slot-first ladder + new tracker metadata |
| `FloatingPCAConfigDialog.tsx` | `MiniStep` includes `'3.4'` but **no** `renderStep34()`; “Step 3.4” allocation mode UI lives **inside 3.1**; standard flow ends with **3.3** “Complete” running the allocator | **Dedicated 3.4 review** step, **remove** user-facing Standard vs Balanced chooser from 3.1; scarcity **preview** only |
| `PCABlock.tsx` tooltips | Cycle / condition / ★Slot | Plain-language lines from new `AllocationTracker` fields |

### Wizard naming vs tracker naming

- **Mini-steps 3.1–3.3** are the dialog wizard screens.
- **`assignedIn: 'step34'`** in `SlotAssignmentLog` means the **floating PCA allocation algorithm** (final run), not necessarily a visible “screen 3.4” today. After this work, **both** a final algorithm pass **and** a **Step 3.4 review screen** should align with the same tracker output.

### Repo rules that must stay true

Read `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc` for the full list. For this project specifically:

- **`staffOverrides`** is the single source of truth for staff-side edits; algorithms consume it.
- After slot assignment helpers run, **do not** manually fix `pendingFTE` in parallel; use **`assignOneSlotAndUpdatePending`** / **`assignUpToPendingAndUpdatePending`** from `floatingPCAHelpers.ts` as today.
- Use **`roundToNearestQuarterWithMidpoint()`** for pending comparisons where the codebase already does.
- **`totalPCAOnDuty`** vs **`totalPCAFromAllocations`**: keep using **`totalPCAOnDuty`** for requirement math (unchanged by this feature, but do not “fix” allocations into requirement logic).

### Tests and commands

- **Regression:** `tests/regression/*.test.ts` — run with `npx tsx tests/regression/<file>.ts` (see existing files such as `f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts` for the `emptyTeamRecord` pattern).
- **Lint:** `npm run lint` or `npx eslint <paths>`.
- **Smoke:** `npm run test:smoke` or `npx playwright test … --grep @smoke` (new spec path is named in Task 5 below).

### Implementation order

Follow **Task 1 → Task 6** in this file. Task 1 establishes types/helpers so later tasks compile; Task 2 is the largest behavioral change; Tasks 3–5 wire tracker + UI; Task 6 is verification.

### Deliverables checklist (nothing is “schedule-only”)

- **Dashboard PCA preferences — ranked slots:** implemented in **Task 5**, **Step 3**, file `components/dashboard/PCAPreferencePanel.tsx` (form inside that module: `PCAPreferenceForm`). This is the **primary place** teams define rank order; Step 3 wizard **reads** that saved order.
- **Step 3 dialog:** Task 5 (and parts of Tasks 4–5) update `FloatingPCAConfigDialog.tsx` and related cards; not a substitute for editing ranks on the dashboard.

### Small plan-vs-code notes for implementers

- **Task 1** sample regression asserts `info.preferredSlot === null`. The current `TeamPreferenceInfo` shape still has `preferredSlot` and `condition` (`A`–`D`). Either remove `preferredSlot` in favor of `rankedSlots` only, or keep **`preferredSlot` as a deprecated alias** for `rankedSlots[0] ?? null` and **adjust the test** to match the chosen contract.
- **`PCAPreference` in `types/allocation.ts`** still comments “Max 1” for `preferred_slots`; update the comment (and any Zod/validation elsewhere) when the dashboard allows multiple.
- Some **tests** build `PCAPreference` literals with extra fields (e.g. `strict_preferred_pca`) that are **not** on the core interface; follow the **existing test file** style when adding new regressions.

---

## Guardrails

- Reuse `preferred_slots`; do not add a DB migration.
- Keep Step 3.2 assist-only and Step 3.4 authoritative.
- Preserve `assignOneSlotAndUpdatePending()` / `assignUpToPendingAndUpdatePending()` wrappers; do not manually subtract `pendingFTE` after wrapper calls.
- Do not bring back a user-facing “Balanced vs Standard” Step 3 branch in the new flow. Step 3.1 should show scarcity preview, not a second allocation philosophy.
- Extend tracker metadata explicitly in `types/schedule.ts`; do not try to reconstruct ranked/unranked/gym reasons inside `PCABlock.tsx`.
- Ignore unrelated dirty worktree files, especially `components/allocation/Step1LeaveSetupDialog.tsx`.

## File Map

- `types/allocation.ts`
  - Keep `PCAPreference.preferred_slots` but document it as an ordered ranked list rather than a single slot.
- `types/schedule.ts`
  - Expand `SlotAssignmentLog` and `TeamAllocationLog.summary` so Step 3.4 can explain rank fulfillment, unranked fallback, duplicate fallback, gym last resort, and continuity.
- `lib/utils/floatingPCAHelpers.ts`
  - Replace the single-slot preference helpers with ranked-slot helpers and shared candidate/slot-bucket utilities.
- `lib/algorithms/pcaAllocationFloating.ts`
  - Replace the current Condition A/B/C/D-first standard-mode logic with the approved slot-first ranked ladder while keeping the public `allocateFloatingPCA_v2()` entry point stable.
- `lib/utils/reservationLogic.ts`
  - Rework Step 3.2 preview output so it surfaces the highest feasible ranked slot and whether preferred PCA can be entertained there.
- `components/dashboard/PCAPreferencePanel.tsx`
  - Change the preference editor from “1 preferred slot only” to a ranked-slot ordering UI.
- `components/allocation/FloatingPCAConfigDialog.tsx`
  - Update Step 3.1, 3.2, 3.3, and add the new Step 3.4 review screen / footer flow.
- `components/allocation/TeamReservationCard.tsx`
  - Redesign Step 3.2 cards around exception review instead of a single checkbox-only reservation strip.
- `components/allocation/TeamAdjacentSlotCard.tsx`
  - Align Step 3.3 styling and shell with the approved Step 3 family direction.
- `components/allocation/PCABlock.tsx`
  - Replace tooltip/debug phrasing with plain-language Step 3.4 diagnostics based on the new tracker fields.
- `tests/regression/f62-ranked-slot-preference-contracts.test.ts`
  - Lock ranked-slot helper semantics.
- `tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts`
  - Lock the Step 3.4 decision ladder.
- `tests/regression/f64-step34-tracker-reasons.test.ts`
  - Lock tracker fields and tooltip-facing summary reasons.
- `tests/regression/f65-step32-ranked-slot-exception-preview.test.ts`
  - Lock Step 3.2 exception detection and recommendation output.
- `tests/smoke/schedule-phase3-ranked-slot-flow.smoke.spec.ts`
  - Verify the end-to-end user flow from ranked-slot entry to Step 3 review.

### Task 1: Lock ranked-slot contracts and helper scaffolding

**Files:**
- Modify: `types/allocation.ts`
- Modify: `types/schedule.ts`
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Test: `tests/regression/f62-ranked-slot-preference-contracts.test.ts`

- [ ] **Step 1: Write the failing regression**

```ts
import assert from 'node:assert/strict'

import { getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'

async function main() {
  const pref: PCAPreference = {
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: ['pca-a', 'pca-b'],
    preferred_slots: [1, 3],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }

  const info = getTeamPreferenceInfo('FO', [pref])

  assert.deepEqual(info.rankedSlots, [1, 3])
  assert.deepEqual(info.unrankedNonGymSlots, [2])
  assert.deepEqual(info.duplicateRankOrder, [1, 3, 2])
  assert.equal(info.gymSlot, 4)
  assert.equal(info.avoidGym, true)
  assert.equal(info.preferredSlot, null)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run the regression and confirm it fails**

Run: `npx tsx tests/regression/f62-ranked-slot-preference-contracts.test.ts`

Expected: failure because `getTeamPreferenceInfo()` still returns a single `preferredSlot` contract instead of ranked-slot buckets.

- [ ] **Step 3: Add the ranked-slot helper contract**

Update the helper/type layer to expose explicit ranked-slot data:

```ts
export interface TeamPreferenceInfo {
  team: Team
  preferredPCAIds: string[]
  rankedSlots: number[]
  unrankedNonGymSlots: number[]
  duplicateRankOrder: number[]
  teamFloor: 'upper' | 'lower' | null
  gymSlot: number | null
  avoidGym: boolean
}

export type SlotSelectionPhase =
  | 'ranked-unused'
  | 'unranked-unused'
  | 'ranked-duplicate'
  | 'gym-last-resort'

export interface SlotAssignmentLog {
  fulfilledSlotRank?: number | null
  slotSelectionPhase?: SlotSelectionPhase
  pcaSelectionTier?: 'preferred' | 'floor' | 'non-floor'
  usedContinuity?: boolean
  duplicateSlot?: boolean
}
```

In `getTeamPreferenceInfo()`:

```ts
const rankedSlots = Array.from(new Set(pref?.preferred_slots ?? []))
const gymSlot = pref?.gym_schedule ?? null
const avoidGym = pref?.avoid_gym_schedule ?? false

const unrankedNonGymSlots = [1, 2, 3, 4].filter(
  (slot) => !rankedSlots.includes(slot) && (!avoidGym || slot !== gymSlot)
)

const duplicateRankOrder = [
  ...rankedSlots.filter((slot) => !avoidGym || slot !== gymSlot),
  ...unrankedNonGymSlots,
]
```

- [ ] **Step 4: Re-run the regression and lint the touched helper/type files**

Run: `npx tsx tests/regression/f62-ranked-slot-preference-contracts.test.ts`

Expected: PASS

Run: `npx eslint types/allocation.ts types/schedule.ts lib/utils/floatingPCAHelpers.ts`

Expected: no new lint errors

### Task 2: Rebuild Step 3.4 as the ranked-slot decision ladder

**Files:**
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Test: `tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts`

- [ ] **Step 1: Write the failing Step 3.4 regression scenarios**

Cover at least these approved scenarios in one regression file:
- rank `#1` beats preferred PCA
- unused unranked non-gym slot beats duplication
- duplicate fallback returns to ranked order
- gym is used only as true last resort

Start with concrete assertions like:

```ts
const result = await allocateFloatingPCA_v2({
  teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
  currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
  existingAllocations: [],
  pcaPool: [
    makePca('floor-1', [1, 3], 'upper'),
    makePca('preferred-a', [3], 'upper'),
    makePca('other-1', [2], 'lower'),
  ],
  pcaPreferences: [makePreference('FO', [1, 3], ['preferred-a'], 4, true, 'upper')],
  specialPrograms: [],
})

assert.equal(slotOwner(result.allocations, 'floor-1', 1), 'FO')
assert.equal(slotOwner(result.allocations, 'floor-1', 3), 'FO')
assert.equal(result.pendingPCAFTEPerTeam.FO, 0)
assert.equal(result.tracker.FO.assignments[0]?.fulfilledSlotRank, 1)
```

- [ ] **Step 2: Run the regression and confirm it fails**

Run: `npx tsx tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts`

Expected: failure showing the current allocator still follows the old single-slot / PCA-centric continuation logic.

- [ ] **Step 3: Replace the standard-mode Step 3.4 loop with a slot-first ladder**

Refactor `allocateFloatingPCA_v2()` so standard mode iterates team-by-team and picks the next slot target from the approved ladder:

```ts
for (const team of teamOrder) {
  while ((pendingFTE[team] ?? 0) >= 0.25) {
    const pref = getTeamPreferenceInfo(team, effectivePreferences)
    const teamExistingSlots = getTeamExistingSlots(team, allocations)
    const target = getNextRankedSlotTarget(pref, teamExistingSlots, pendingFTE[team])
    if (!target) break

    const candidates = findCandidatesForSlotTarget({
      team,
      target,
      allocations,
      pendingFTE,
      pcaPool,
      pref,
      protectedPCAs,
    })

    const winner = rankCandidatesForSlotTarget(candidates, pref, target)
    if (!winner) break

    assignOneSlotAndUpdatePending({
      team,
      slot: winner.slot,
      pca: winner.pca,
      allocations,
      pendingFTE,
    })

    recordAssignmentWithOrder(team, winner.log)
  }
}
```

Implementation requirements for this step:
- ranked-unused first
- unranked-unused second
- ranked-duplicate next
- gym-last-resort last
- same-PCA continuity only helps after the current highest-priority slot target is respected
- different PCAs must spread across different useful unused slots before stacking onto the same slot

- [ ] **Step 4: Re-run the Step 3.4 regression**

Run: `npx tsx tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts`

Expected: PASS

- [ ] **Step 5: Re-run nearby Step 3 regressions that this refactor could break**

Run: `npx tsx tests/regression/f3-step33-overfill-pending-cap.test.ts`

Run: `npx tsx tests/regression/f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts`

Run: `npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts`

Expected: PASS on all three

### Task 3: Add tracker reasons and plain-language Step 3.4 diagnostics

**Files:**
- Modify: `types/schedule.ts`
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Modify: `components/allocation/PCABlock.tsx`
- Test: `tests/regression/f64-step34-tracker-reasons.test.ts`

- [ ] **Step 1: Write the failing tracker regression**

Lock both assignment-level and summary-level signals:

```ts
assert.equal(result.tracker.FO.summary.pendingMet, true)
assert.equal(result.tracker.FO.summary.highestRankedSlotFulfilled, 2)
assert.equal(result.tracker.FO.summary.usedUnrankedSlot, false)
assert.equal(result.tracker.FO.summary.usedDuplicateFloatingSlot, false)
assert.equal(result.tracker.FO.summary.gymUsedAsLastResort, false)

const rankTwoAssignment = result.tracker.FO.assignments.find(
  (assignment) => assignment.slot === 3
)

assert.equal(rankTwoAssignment?.fulfilledSlotRank, 2)
assert.equal(rankTwoAssignment?.slotSelectionPhase, 'ranked-unused')
assert.equal(rankTwoAssignment?.pcaSelectionTier, 'preferred')
assert.equal(rankTwoAssignment?.usedContinuity, false)
```

- [ ] **Step 2: Run the regression and confirm it fails**

Run: `npx tsx tests/regression/f64-step34-tracker-reasons.test.ts`

Expected: failure because the tracker still exposes Cycle / Condition-era metadata instead of the new ranked-slot reasons.

- [ ] **Step 3: Populate new tracker fields at assignment time and finalize summary fields**

Add explicit summary fields in `types/schedule.ts` and populate them during `recordAssignment()` / `finalizeTrackerSummary()`:

```ts
summary: {
  pendingMet: boolean
  highestRankedSlotFulfilled: number | null
  usedUnrankedSlot: boolean
  usedDuplicateFloatingSlot: boolean
  gymUsedAsLastResort: boolean
  preferredPCAUsed: boolean
}
```

Then map those fields in `PCABlock.tsx` to plain-language tooltip lines:

```ts
const summaryLines = [
  allocationLog.summary.pendingMet ? 'Pending met' : 'Pending not fully met',
  allocationLog.summary.highestRankedSlotFulfilled
    ? `Highest choice fulfilled: ${allocationLog.summary.highestRankedSlotFulfilled}${getOrdinalSuffix(allocationLog.summary.highestRankedSlotFulfilled)}`
    : 'Highest choice fulfilled: none',
  allocationLog.summary.usedUnrankedSlot ? 'Used other slot' : 'No other slot used',
  allocationLog.summary.usedDuplicateFloatingSlot ? 'Used duplicate floating slot' : 'No duplicate floating slot',
  allocationLog.summary.gymUsedAsLastResort ? 'Gym used as last resort' : 'Gym avoided',
]
```

- [ ] **Step 4: Re-run the tracker regression and lint the tooltip file**

Run: `npx tsx tests/regression/f64-step34-tracker-reasons.test.ts`

Expected: PASS

Run: `npx eslint components/allocation/PCABlock.tsx types/schedule.ts lib/utils/floatingPCAHelpers.ts`

Expected: no new lint errors

### Task 4: Rework Step 3.2 into ranked-slot exception preview

**Files:**
- Modify: `lib/utils/reservationLogic.ts`
- Modify: `components/allocation/FloatingPCAConfigDialog.tsx`
- Modify: `components/allocation/TeamReservationCard.tsx`
- Test: `tests/regression/f65-step32-ranked-slot-exception-preview.test.ts`

- [ ] **Step 1: Write the failing Step 3.2 regression**

Lock the approved exception rule: only flag teams when the highest-ranked currently feasible slot cannot entertain preferred PCA.

```ts
const preview = computeReservations(
  [makePreference('FO', [1, 3], ['pca-a'], 4, true, 'upper')],
  { ...emptyTeamRecord(0), FO: 0.5 },
  [makePca('pca-a', [3]), makePca('floor-m', [1, 3])],
  []
)

assert.equal(preview.summary.teamsChecked, 1)
assert.deepEqual(preview.summary.needsAttentionTeams, ['FO'])
assert.equal(preview.teamReservations.FO?.slot, 1)
assert.equal(preview.teamReservations.FO?.attentionReason, 'preferred-pca-misses-highest-feasible-rank')
assert.equal(preview.teamReservations.FO?.recommendedPcaId, 'floor-m')
```

- [ ] **Step 2: Run the regression and confirm it fails**

Run: `npx tsx tests/regression/f65-step32-ranked-slot-exception-preview.test.ts`

Expected: failure because Step 3.2 still assumes one preferred slot and does not expose attention summary / recommendation metadata.

- [ ] **Step 3: Extend reservation output to carry exception-preview data**

Replace the old one-slot-only reservation result with a richer preview shape:

```ts
export interface TeamReservation {
  slot: number
  pcaIds: string[]
  pcaNames: Record<string, string>
  rankedChoices: Array<{ slot: number; rank: number; label: string }>
  otherSlots: number[]
  gymSlot: number | null
  attentionReason?: 'preferred-pca-misses-highest-feasible-rank'
  recommendedPcaId?: string
  recommendedPcaName?: string
  preferredPcaMayStillHelpLater?: boolean
}
```

Also add top-line Step 3.2 summary data:

```ts
summary: {
  teamsChecked: number
  needsAttentionTeams: Team[]
  autoContinueTeams: Team[]
  gymRiskTeams: Team[]
}
```

- [ ] **Step 4: Wire the Step 3.2 screen to the new preview model**

In `FloatingPCAConfigDialog.tsx` and `TeamReservationCard.tsx`:
- replace the old “Reserve preferred PCA/slot pairs” copy
- add the compact summary bar
- show the horizontal team strip with flagged teams highlighted
- show the selected flagged team’s explanation card below the strip
- keep only one primary CTA emphasis: `Use system plan`

Use copy like:

```tsx
<div className="text-sm font-semibold text-foreground">What the system plans now</div>
<ul className="mt-2 space-y-1 text-sm text-foreground">
  <li>No preferred PCA is available for 1st choice 0900-1030.</li>
  <li>System plans to use floor PCA M for 0900-1030 first.</li>
  <li>Preferred PCA A may still be used for 2nd choice 1330-1500.</li>
</ul>
```

- [ ] **Step 5: Re-run the Step 3.2 regression**

Run: `npx tsx tests/regression/f65-step32-ranked-slot-exception-preview.test.ts`

Expected: PASS

### Task 5: Dashboard PCA preferences (ranked slots) + Step 3 family UI

**Files:**
- Modify: `components/dashboard/PCAPreferencePanel.tsx`
- Modify: `components/allocation/FloatingPCAConfigDialog.tsx`
- Modify: `components/allocation/TeamReservationCard.tsx`
- Modify: `components/allocation/TeamAdjacentSlotCard.tsx`
- Create: `tests/smoke/schedule-phase3-ranked-slot-flow.smoke.spec.ts`

- [ ] **Step 1: Write the end-to-end smoke test**

Cover the full user story:
- open PCA preferences for one team
- rank two slots instead of selecting only one
- save
- open floating PCA Step 3
- verify Step 3.1 shows scarcity preview
- verify Step 3.2 highlights only teams needing attention
- continue to the new Step 3.4 review
- verify Step 3.4 shows one selected-team detail block with readable choice labels

Start with concrete Playwright assertions like:

```ts
test('@smoke ranked-slot Step 3 flow', async ({ page }) => {
  await page.getByRole('button', { name: /PCA preference/i }).click()
  await page.getByRole('button', { name: '0900-1030' }).click()
  await page.getByRole('button', { name: '1330-1500' }).click()
  await page.getByRole('button', { name: /save/i }).click()

  await page.getByRole('button', { name: /floating pca allocation/i }).click()
  await expect(page.getByText(/Teams with 0 floating PCA \(if run now\)/i)).toBeVisible()
  await expect(page.getByText(/need attention/i)).toBeVisible()
  await expect(page.getByText(/Highest choice fulfilled/i)).toBeVisible()
  await expect(page.getByText(/1st choice/i)).toBeVisible()
})
```

- [ ] **Step 2: Run the smoke test and confirm it fails**

Run: `npx playwright test tests/smoke/schedule-phase3-ranked-slot-flow.smoke.spec.ts --grep @smoke`

Expected: failure because the dashboard still enforces one preferred slot and the Step 3 dialog does not yet expose the new review flow.

- [ ] **Step 3: Update the dashboard preference editor to ranked-slot ordering**

In `PCAPreferencePanel.tsx`:
- remove the `preferredSlots.length > 1` validation block
- replace the single-toggle handler with ordered add/remove/reorder behavior
- keep the gym slot visible even when gym avoidance is on
- change section copy from `Preferred Slot (1 only)` to `Ranked Slots`

The form state should work like:

```ts
const toggleRankedSlot = (slot: number) => {
  setPreferredSlots((prev) =>
    prev.includes(slot) ? prev.filter((value) => value !== slot) : [...prev, slot]
  )
}

const moveRankedSlot = (slot: number, direction: 'up' | 'down') => {
  const index = preferredSlots.indexOf(slot)
  if (index < 0) return
  const next = [...preferredSlots]
  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= next.length) return
  ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  setPreferredSlots(next)
}
```

- [ ] **Step 4: Refresh the Step 3 family UI to match the approved shell**

In `FloatingPCAConfigDialog.tsx`, `TeamReservationCard.tsx`, and `TeamAdjacentSlotCard.tsx`:
- keep the shared top-right stepper style
- keep Step 3.1 close to the existing strip UI
- remove the big Step 3.1 balanced-mode chooser
- show scarcity preview inline in Step 3.1
- keep Step 3.2 and 3.3 cards shorter than Step 3.1 cards
- add the new Step 3.4 mini-step / review state before final save
- make the Step 3.4 detail block visually belong to the selected team, including the small beak/tip treatment
- keep labels readable but toned down: `1st choice`, `2nd choice`, `Other`, `Gym`

The new Step 3.4 review should render from the tracker / allocation result, for example:

```tsx
<div className="result-detail">
  <div className="mini-title">FO details</div>
  <div className="compact-state">Pending met</div>
  <div className="summary-pill-row">
    <span>Highest choice fulfilled: 2nd</span>
    <span>Preferred PCA used</span>
    <span>Gym avoided</span>
  </div>
  <div className="result-box-grid">
    <ResultBox label="1st choice" time="0900-1030" note="Floor PCA fallback" />
    <ResultBox label="Other" time="1030-1200" note="Unused" />
    <ResultBox label="2nd choice" time="1330-1500" note="Preferred PCA A" />
    <ResultBox label="Gym" time="1500-1630" note="Blocked unless last resort" />
  </div>
</div>
```

- [ ] **Step 5: Re-run the smoke test**

Run: `npx playwright test tests/smoke/schedule-phase3-ranked-slot-flow.smoke.spec.ts --grep @smoke`

Expected: PASS

### Task 6: Final verification and cleanup

**Files:**
- Test: `tests/regression/f62-ranked-slot-preference-contracts.test.ts`
- Test: `tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts`
- Test: `tests/regression/f64-step34-tracker-reasons.test.ts`
- Test: `tests/regression/f65-step32-ranked-slot-exception-preview.test.ts`
- Test: `tests/regression/f3-step33-overfill-pending-cap.test.ts`
- Test: `tests/regression/f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts`
- Test: `tests/regression/f61-step31-projected-extra-slots-preview.test.ts`
- Test: `tests/smoke/schedule-phase3-ranked-slot-flow.smoke.spec.ts`

- [ ] **Step 1: Run the targeted regression suite**

Run:

```bash
npx tsx tests/regression/f62-ranked-slot-preference-contracts.test.ts
npx tsx tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts
npx tsx tests/regression/f64-step34-tracker-reasons.test.ts
npx tsx tests/regression/f65-step32-ranked-slot-exception-preview.test.ts
npx tsx tests/regression/f3-step33-overfill-pending-cap.test.ts
npx tsx tests/regression/f8-step32-33-reservations-use-canonical-slot-eligibility.test.ts
npx tsx tests/regression/f61-step31-projected-extra-slots-preview.test.ts
```

Expected: PASS on every command

- [ ] **Step 2: Lint all touched source files**

Run:

```bash
npx eslint \
  components/dashboard/PCAPreferencePanel.tsx \
  components/allocation/FloatingPCAConfigDialog.tsx \
  components/allocation/TeamReservationCard.tsx \
  components/allocation/TeamAdjacentSlotCard.tsx \
  components/allocation/PCABlock.tsx \
  lib/utils/floatingPCAHelpers.ts \
  lib/utils/reservationLogic.ts \
  lib/algorithms/pcaAllocationFloating.ts \
  types/allocation.ts \
  types/schedule.ts
```

Expected: no new lint errors

- [ ] **Step 3: Run the end-to-end smoke test**

Run: `npx playwright test tests/smoke/schedule-phase3-ranked-slot-flow.smoke.spec.ts --grep @smoke`

Expected: PASS

- [ ] **Step 4: Manual verification checklist**

Check these exact behaviors in the running app:
- ranking `1 > 3` persists when the preference form is reopened
- Step 3.1 shows scarcity preview without showing the old balanced-mode choice card
- Step 3.2 only flags teams whose highest feasible ranked slot cannot use preferred PCA
- Step 3.4 shows the selected-team detail block as one connected visual group
- hovering final allocations shows `Highest choice fulfilled`, `Other slot`, `Gym avoided/last resort`, and preferred-PCA status in plain language

- [ ] **Step 5: Record follow-up risks if anything remains**

Document only concrete follow-up items, for example:
- any leftover unreachable `balanced` code paths that should be deleted after rollout
- any Step 3.4 performance hotspots from repeated candidate rescoring
- any remaining ambiguity in tooltip wording after real-user review
