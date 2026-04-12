# Step 3.2 / Step 3.4 Preferred, Gym, and Repair Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the approved Step 3.2 preferred-review UX drift, enforce a single final "gym only if true last resort after audit" contract across allocator and UI, and close the Step 3.4 repair blind spots that currently miss surplus-slot rescues and skip post-extra re-audit.

**Architecture:** Treat this as one Step 3 behavior package with three linked layers. First, lock the Step 3.2 explanation contract in regression tests and reshape the preview model so the UI answers the user's real questions instead of rendering a multi-path PCA possibility map. Second, introduce one canonical final gym status in tracker summary and drive chip / slot-card / tooltip text from that shared source of truth while tightening allocator scoring so gym is never accepted when a non-gym repaired schedule exists. Third, expand the bounded-repair engine so it can reclaim surplus floating slots from already-satisfied teams and rerun repair after extra-coverage assignments before freezing the final schedule.

**Tech Stack:** TypeScript, React/Next.js dialog UI, V2 ranked-slot allocator in `lib/algorithms/floatingPcaV2/`, Step 3 feature-layer files in `lib/features/schedule/`, tracker types in `types/schedule.ts`, Node-based regression tests via `npx tsx`, IDE lints for touched TS/TSX files.

---

## File Structure

### Specs / references
- Reference only: `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`
- Reference only: `docs/superpowers/specs/2026-04-12-v2-step32-visual-hierarchy-refinement-design.md`
- Reference only: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`

### Step 3.2 preview and copy
- Modify: `lib/features/schedule/step32V2/step32PreferredReviewModel.ts`
  - Add per-preferred-PCA availability statuses and explicit scenario summaries that answer "rank #1 protected?", "preferred assignable?", and "where?".
- Modify: `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`
  - Add user-facing labels for preferred-PCA availability states and scenario summary wording.

### Step 3.2 UI
- Modify: `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx`
  - Replace the confusing multi-path PCA explanation with a system-summarized scenario surface and status-tagged preferred-PCA list.
- Modify if needed: `components/allocation/FloatingPCAConfigDialogV2.tsx`
  - Pass any new Step 3.2 scenario/status fields through to the detail panel without changing V1 dialog behavior.

### Shared tracker / gym status contract
- Modify: `types/schedule.ts`
  - Add a canonical final gym status field on `TeamAllocationLog.summary`.
- Modify: `lib/algorithms/floatingPcaV2/trackerSummaryDerivations.ts`
  - Derive the canonical gym status after final tracker assembly.
- Modify: `components/allocation/step34/step34ViewModel.ts`
  - Drive chip and slot-card labels from canonical gym status.
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
  - Drive tooltip summary/status copy from canonical gym status instead of mixed legacy booleans.
- Modify if needed: `lib/features/schedule/pcaTrackerTooltip.ts`
  - Keep row-level phase labels aligned with the same gym contract.

### Repair / scoring / finalization
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
  - Detect surplus-slot rescue opportunities and keep gym rescue as a true final last-resort path.
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
  - Generate bounded candidates that can transfer a surplus Step 3 floating slot from an already-satisfied team without forcing a fake fallback replacement.
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
  - Add an explicit gym-usage penalty/objective so non-gym repaired schedules always outrank gym schedules when other higher-priority objectives tie.
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
  - Re-run audit/repair after extra coverage, preserve accepted repair provenance, and keep extra-coverage allocations from freezing a repairable global picture.

### Regression tests
- Create: `tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts`
- Create: `tests/regression/f94-step32-scenario-summary-contract.test.ts`
- Create: `tests/regression/f95-step34-gym-source-of-truth-contract.test.ts`
- Create: `tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts`
- Create: `tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts`
- Create: `tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts`
- Create: `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts`

### Files that must stay untouched
- Do not modify: `components/allocation/FloatingPCAConfigDialog.tsx`
- Do not modify: `lib/algorithms/floatingPcaLegacy/allocator.ts`
- Do not move Step 3.2 review-state policy into `lib/utils/floatingPCAHelpers.ts`

## Implementation Constraints

### Constraint 1: Step 3.2 must answer scheduler questions, not expose an allocator possibility map
The user-approved contract for Step 3.2 is:

- can rank #1 be filled?
- can any preferred PCA be assigned?
- if yes, is that on rank #1, a later ranked slot, or an unranked slot?
- if not, what is the system fallback?

Disallowed:

- presenting one PCA repeated across all feasible paths as though that is what saving will reserve
- forcing users to click through every slot path to learn basic availability facts
- implying that floor-PCA fallback in Step 3.2 is a manual "replacement" decision when the real purpose is to explain the scenario

### Constraint 2: Preferred-PCA list must expose per-name availability state
When a team lists preferred PCA names, the UI must show a status per preferred PCA, not a plain joined string.

Required statuses:

- `Available on rank #1`
- `Available on later rank`
- `Available on unranked slot`
- `Unavailable`

Mixed availability must be supported when a team declares more than one preferred PCA.

### Constraint 3: Gym has one final-state meaning
For teams with `avoid gym` enabled, the final allocator / tracker contract must collapse to one canonical meaning:

- `avoided`
- `used-last-resort`

There is no acceptable final state where a gym slot is used "normally" or "used but not last resort".

Compatibility note:

- legacy booleans may remain for compatibility, but UI must read the canonical final state
- tracker derivation must treat any gym use that survives final repair as `used-last-resort`

### Constraint 4: Non-gym repaired schedules must always outrank gym schedules
The ranked-slot design already says gym is allowed only as final rescue. That must become a hard allocator preference, not merely a draft ordering convention.

Required:

- if two schedules tie on ranked coverage, fairness, and fulfilled pending, the non-gym schedule wins
- gym rescue remains allowed only when no bounded non-gym repaired schedule exists

### Constraint 5: Repair must support bounded donor donation, not only fallback-or-swap rescue
Current V2 repair logic only recognizes these rescue shapes:

- target slot already open
- donor team can move to another slot
- teams can swap slots

That is too narrow for the approved audit behavior.

Required:

- bounded repair may directly transfer a true Step 3 floating slot from a donor team to a requester team without forcing a fabricated fallback slot or swap
- this donation path is allowed only when donor remains within acceptable harm bounds after losing the slot
- baseline / upstream non-floating allocations must stay protected
- donor harm must be evaluated using true Step 3 floating ownership, not raw total occupancy

Blocked donation cases:

- donor would lose its own stronger ranked-slot result
- donor would lose its first meaningful true Step 3 floating coverage / fairness-floor protection
- donor would fall into an unacceptably worse post-repair state relative to requester

Allowed donation cases:

- donor is in true Step 3 surplus
- or donor remains acceptably covered after donation and does not cross the blocked-donation boundaries above

### Constraint 6: Extra coverage must not freeze the schedule before re-audit
`applyExtraCoverageRoundRobin()` currently runs after the repair loop and never rechecks defects.

Required:

- after extra coverage changes allocations, the allocator must re-run audit/repair before finalizing
- extra coverage must not cause final tracker repair counts to stay at zero when a bounded rescue became available only after extra assignments

### Constraint 7: Focused verification only
Repo-wide `tsc --noEmit` is currently noisy. Use focused `npx tsx` regressions plus lints on touched files.

---

### Task 1: Lock Step 3.2 explanation regressions first

**Files:**
- Create: `tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts`
- Create: `tests/regression/f94-step32-scenario-summary-contract.test.ts`
- Test: `lib/features/schedule/step32V2/step32PreferredReviewModel.ts`
- Test: `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`

- [ ] **Step 1: Write the failing per-preferred availability-status test**

Create `tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts` with a direct preview-model assertion shape like:

```ts
import assert from 'node:assert/strict'
import { computeStep3V2ReservationPreview } from '../../lib/features/schedule/step3V2ReservationPreview'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return { FO: value, SMM: value, SFM: value, CPPC: value, MC: value, GMC: value, NSM: value, DRO: value }
}

const preferences: PCAPreference[] = [{
  id: 'pref-cppc',
  team: 'CPPC',
  preferred_pca_ids: ['pref-a', 'pref-b'],
  preferred_slots: [4, 1],
  gym_schedule: 3,
  avoid_gym_schedule: true,
  floor_pca_selection: 'upper',
}]

const preview = computeStep3V2ReservationPreview({
  pcaPreferences: preferences,
  adjustedPendingFTE: { ...emptyTeamRecord(0), CPPC: 0.25 },
  floatingPCAs: [
    { id: 'pref-a', name: '光劭', floating: true, fte_pca: 1, leave_type: null, availableSlots: [], floor_pca: ['upper'] },
    { id: 'pref-b', name: '阿明', floating: true, fte_pca: 1, leave_type: null, availableSlots: [4], floor_pca: ['upper'] },
    { id: 'floor-z', name: '樓層', floating: true, fte_pca: 1, leave_type: null, availableSlots: [1, 4], floor_pca: ['upper'] },
  ] as any,
  existingAllocations: [],
})

const cppc = preview.teamReviews.CPPC
assert.deepEqual(
  cppc.preferredPcaStatuses?.map((row) => [row.name, row.availability]),
  [['光劭', 'unavailable'], ['阿明', 'later-ranked']]
)
```

- [ ] **Step 2: Run the new Step 3.2 status test and verify RED**

Run:

```bash
npx tsx tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts
```

Expected: FAIL because `preferredPcaStatuses` does not exist yet and/or availability labels do not match.

- [ ] **Step 3: Write the failing scenario-summary regression**

Create `tests/regression/f94-step32-scenario-summary-contract.test.ts` to lock the user-approved continuity dilemma:

```ts
import assert from 'node:assert/strict'
import { computeStep3V2ReservationPreview } from '../../lib/features/schedule/step3V2ReservationPreview'

const preview = computeStep3V2ReservationPreview({
  pcaPreferences: [{
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: ['pref-only'],
    preferred_slots: [1, 3],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }],
  adjustedPendingFTE: { FO: 0.5, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 },
  floatingPCAs: [
    { id: 'pref-only', name: 'Preferred', floating: true, fte_pca: 1, leave_type: null, availableSlots: [3], floor_pca: ['upper'] },
    { id: 'floor-a', name: 'Floor', floating: true, fte_pca: 1, leave_type: null, availableSlots: [1, 3], floor_pca: ['upper'] },
  ] as any,
  existingAllocations: [],
})

const fo = preview.teamReviews.FO
assert.equal(fo.reviewState, 'alternative')
assert.equal(fo.primaryScenario?.recommendedLabel, 'Floor fills rank #1 and continues to rank #2')
assert.equal(fo.primaryScenario?.preferredOutcomeLabel, 'Preferred can still take a later ranked slot')
assert.equal(fo.primaryScenario?.tradeoff, 'continuity')
assert.equal(fo.primaryScenario?.saveEffect, 'Reserving saves one slot only (+0.25).')
```

- [ ] **Step 4: Run the scenario-summary test and verify RED**

Run:

```bash
npx tsx tests/regression/f94-step32-scenario-summary-contract.test.ts
```

Expected: FAIL because the preview model currently exposes outcome rows, not summary-first scenario text.

- [ ] **Step 5: Commit the red tests**

```bash
git add tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts tests/regression/f94-step32-scenario-summary-contract.test.ts
git commit -m "test: lock step32 preferred availability and scenario summaries"
```

### Task 2: Implement Step 3.2 preferred-status and scenario model

**Files:**
- Modify: `lib/features/schedule/step32V2/step32PreferredReviewModel.ts`
- Modify: `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`
- Test: `tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts`
- Test: `tests/regression/f94-step32-scenario-summary-contract.test.ts`

- [ ] **Step 1: Add explicit Step 3.2 preferred-status types**

In `lib/features/schedule/step32V2/step32PreferredReviewModel.ts`, add focused model fields like:

```ts
export type Step32PreferredAvailability =
  | 'rank-1'
  | 'later-ranked'
  | 'unranked'
  | 'unavailable'

export interface Step32PreferredPcaStatus {
  id: string
  name: string
  availability: Step32PreferredAvailability
  detail: string
}

export interface Step32ScenarioSummary {
  recommendedLabel: string
  preferredOutcomeLabel: string | null
  rankProtectionLabel: string
  fallbackLabel: string | null
  tradeoff: Step32TradeoffKind | null
  saveEffect: string
}
```

- [ ] **Step 2: Derive preferred availability from path data, not from selected outcome rows**

Implement a pure helper that scans ranked, unranked, and gym-eligible paths per preferred PCA:

```ts
function getPreferredAvailabilityForPca(args: {
  preferredPcaId: string
  rankedSlots: Array<{ slot: 1 | 2 | 3 | 4; rank: number }>
  pathData: Array<{ option: Step32PathOption; candidateLookup: Map<string, { id: string; name: string; bucket: 'preferred' | 'floor' | 'non_floor' }> }>
}): Step32PreferredPcaStatus {
  // first ranked slot if preferred covers earliest ranked path
  // later-ranked if preferred misses rank #1 but appears on another ranked path
  // unranked if preferred appears only on unranked usable slot
  // unavailable otherwise
}
```

- [ ] **Step 3: Build one summary-first scenario object for the approved dilemma**

Replace "PCA across all paths" as the explanation surface by deriving concise labels:

```ts
function buildScenarioSummary(args: {
  reviewState: Step32ReviewState
  earliestPath: Step32PathOption | null
  laterPreferred: Step32PathOption | null
  systemSuggestedPcaName: string | null
  laterPreferredPcaName: string | null
}): Step32ScenarioSummary {
  return {
    recommendedLabel: 'Floor fills rank #1 and continues to rank #2',
    preferredOutcomeLabel: 'Preferred can still take a later ranked slot',
    rankProtectionLabel: 'Rank #1 stays protected',
    fallbackLabel: 'If no preferred PCA is available, Step 3.4 keeps the system fallback path.',
    tradeoff: laterPreferred ? 'continuity' : null,
    saveEffect: 'Reserving saves one slot only (+0.25).',
  }
}
```

- [ ] **Step 4: Add copy helpers for availability badges and save-effect wording**

In `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`, add pure helpers like:

```ts
export function getStep32PreferredAvailabilityLabel(kind: Step32PreferredAvailability): string {
  if (kind === 'rank-1') return 'Available on rank #1'
  if (kind === 'later-ranked') return 'Available on later rank'
  if (kind === 'unranked') return 'Available on unranked slot'
  return 'Unavailable'
}

export function getStep32SaveEffectLabel(): string {
  return 'Saving reserves one slot only (+0.25).'
}
```

- [ ] **Step 5: Run the focused Step 3.2 tests and verify GREEN**

Run:

```bash
npx tsx tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts
npx tsx tests/regression/f94-step32-scenario-summary-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the model/copy change**

```bash
git add lib/features/schedule/step32V2/step32PreferredReviewModel.ts lib/features/schedule/step32V2/step32PreferredReviewCopy.ts tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts tests/regression/f94-step32-scenario-summary-contract.test.ts
git commit -m "feat: clarify step32 preferred availability summaries"
```

### Task 3: Update the Step 3.2 detail panel to match the approved explanation flow

**Files:**
- Modify: `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx`
- Modify if needed: `components/allocation/FloatingPCAConfigDialogV2.tsx`
- Test: `tests/regression/f92-step32-preferred-review-copy-contract.test.ts`

- [ ] **Step 1: Replace the plain preferred-name string with status-tagged rows**

Refactor the "Preferred PCA list" section to render one row per preferred PCA:

```tsx
<div className="space-y-1">
  <div className="text-xs font-medium text-foreground">Preferred PCA</div>
  {review.preferredPcaStatuses?.length ? (
    review.preferredPcaStatuses.map((entry) => (
      <div key={entry.id} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{entry.name}</span>
        <span className="rounded-full border px-2 py-0.5 text-[11px]">
          {getStep32PreferredAvailabilityLabel(entry.availability)}
        </span>
        <span className="text-[11px]">{entry.detail}</span>
      </div>
    ))
  ) : (
    <div className="text-sm text-muted-foreground">None</div>
  )}
</div>
```

- [ ] **Step 2: Add a summary-first scenario block above the outcome chooser**

Render the new scenario summary so users learn the meaning before they choose anything:

```tsx
{review.primaryScenario ? (
  <div className="rounded-lg border border-sky-200/70 bg-sky-50/60 px-3 py-3 text-sm">
    <div className="font-medium text-foreground">{review.primaryScenario.rankProtectionLabel}</div>
    <div className="mt-1 text-muted-foreground">{review.primaryScenario.recommendedLabel}</div>
    {review.primaryScenario.preferredOutcomeLabel ? (
      <div className="mt-1 text-muted-foreground">{review.primaryScenario.preferredOutcomeLabel}</div>
    ) : null}
    <div className="mt-2 text-[11px] text-muted-foreground">{review.primaryScenario.saveEffect}</div>
  </div>
) : null}
```

- [ ] **Step 3: Make the save action explicit about slot-only reservation**

Update action copy in the panel to keep the reservation effect concrete:

```tsx
<div className="mt-3 text-xs text-muted-foreground">
  Saving reserves only the selected slot for Step 3.4. It does not assign the whole PCA path shown above.
</div>
```

Also update the saved helper string if needed so it stays aligned with this contract.

- [ ] **Step 4: Run focused Step 3.2 regressions and lints**

Run:

```bash
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
```

Then run lints on touched files with IDE diagnostics / `ReadLints`.

Expected: Step 3.2 regressions stay green and no new lint errors appear in touched files.

- [ ] **Step 5: Commit the Step 3.2 UI update**

```bash
git add components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx components/allocation/FloatingPCAConfigDialogV2.tsx lib/features/schedule/step32V2/step32PreferredReviewCopy.ts
git commit -m "feat: make step32 preferred review scenario-first"
```

### Task 4: Lock the gym invariant and shared-source-of-truth regressions

**Files:**
- Create: `tests/regression/f95-step34-gym-source-of-truth-contract.test.ts`
- Create: `tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts`
- Test: `types/schedule.ts`
- Test: `components/allocation/step34/step34ViewModel.ts`
- Test: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- Test: `lib/algorithms/floatingPcaV2/allocator.ts`

- [ ] **Step 1: Write the failing canonical gym-status contract test**

Create `tests/regression/f95-step34-gym-source-of-truth-contract.test.ts` with assertions like:

```ts
import assert from 'node:assert/strict'
import { buildStep34TeamDetailViewModel } from '../../components/allocation/step34/step34ViewModel'
import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'

const teamLog = {
  team: 'DRO',
  assignments: [{
    slot: 3,
    pcaId: 'float-a',
    pcaName: '少華',
    assignedIn: 'step34',
    allocationStage: 'repair',
    slotSelectionPhase: 'gym-last-resort',
  }],
  summary: {
    totalSlotsAssigned: 1,
    gymUsageStatus: 'used-last-resort',
    gymSlotUsed: true,
    gymUsedAsLastResort: true,
    pendingMet: true,
    amPmBalanced: false,
    highestRankedSlotFulfilled: null,
    usedUnrankedSlot: false,
    preferredPCAUsed: false,
    repairAuditDefects: [],
  },
} as any

const tooltip = buildV2PcaTrackerTooltipModel({ team: 'DRO', allocationLog: teamLog, bufferAssignments: [] })
assert.equal(tooltip?.summaryCells.find((cell) => cell.label === 'Status')?.subvalue?.includes('Gym used only as last resort'), true)
```

- [ ] **Step 2: Run the canonical gym-status test and verify RED**

Run:

```bash
npx tsx tests/regression/f95-step34-gym-source-of-truth-contract.test.ts
```

Expected: FAIL because tooltip summary still reads `gymSlotUsed`.

- [ ] **Step 3: Write the failing "gym blocked until final last resort" regression**

Create `tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts` to compare two candidate schedules indirectly through allocator output:

```ts
import assert from 'node:assert/strict'
import { allocateFloatingPCA_v2RankedSlot } from '../../lib/algorithms/pcaAllocation'

const result = await allocateFloatingPCA_v2RankedSlot({
  teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
  currentPendingFTE: { FO: 0, SMM: 0.25, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 },
  existingAllocations: [],
  pcaPool: [
    { id: 'non-gym', name: 'Non Gym', floating: true, fte_pca: 1, leave_type: null, availableSlots: [2] },
    { id: 'gym-only', name: 'Gym', floating: true, fte_pca: 1, leave_type: null, availableSlots: [4] },
  ] as any,
  pcaPreferences: [{
    id: 'pref-smm',
    team: 'SMM',
    preferred_pca_ids: [],
    preferred_slots: [2],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }],
  specialPrograms: [],
  mode: 'standard',
  extraCoverageMode: 'none',
  preferenceSelectionMode: 'legacy',
  selectedPreferenceAssignments: [],
})

assert.equal(result.tracker.SMM.summary.gymUsageStatus, 'avoided')
```

- [ ] **Step 4: Run the second gym test and verify RED**

Run:

```bash
npx tsx tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts
```

Expected: FAIL once assertions reference the new canonical field and/or stronger invariant.

- [ ] **Step 5: Commit the gym red tests**

```bash
git add tests/regression/f95-step34-gym-source-of-truth-contract.test.ts tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts
git commit -m "test: lock canonical gym last-resort contract"
```

### Task 5: Implement canonical final gym status across tracker and UI

**Files:**
- Modify: `types/schedule.ts`
- Modify: `lib/algorithms/floatingPcaV2/trackerSummaryDerivations.ts`
- Modify: `components/allocation/step34/step34ViewModel.ts`
- Modify: `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- Modify if needed: `lib/features/schedule/pcaTrackerTooltip.ts`
- Test: `tests/regression/f95-step34-gym-source-of-truth-contract.test.ts`
- Test: `tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts`

- [ ] **Step 1: Add the canonical gym summary field to tracker types**

In `types/schedule.ts`, add:

```ts
export type GymUsageStatus = 'avoided' | 'used-last-resort'

summary: {
  // existing fields...
  gymUsageStatus?: GymUsageStatus
}
```

Keep `gymSlotUsed` and `gymUsedAsLastResort` for compatibility if other code still reads them.

- [ ] **Step 2: Derive the canonical status once in ranked V2 summary finalization**

In `lib/algorithms/floatingPcaV2/trackerSummaryDerivations.ts`, set:

```ts
const gymUsed = teamLog.assignments.some((assignment) => assignment.slotSelectionPhase === 'gym-last-resort')
teamLog.summary.gymUsageStatus = gymUsed ? 'used-last-resort' : 'avoided'
teamLog.summary.gymUsedAsLastResort = gymUsed
teamLog.summary.gymSlotUsed = gymUsed
```

This intentionally collapses final V2 meaning to one invariant.

- [ ] **Step 3: Update Step 3.4 chip and tooltip summary to read the canonical field**

In `components/allocation/step34/step34ViewModel.ts` and `lib/features/schedule/v2PcaTrackerTooltipModel.ts`, replace direct boolean wording with:

```ts
const gymStatus = allocationLog.summary.gymUsageStatus ?? 'avoided'
const gymLabel =
  gymStatus === 'used-last-resort'
    ? 'Gym used only as last resort'
    : 'Gym avoided'
```

Tooltip status subvalue should become:

```ts
subvalue: `${amPmLabel} · ${gymLabel}`
```

- [ ] **Step 4: Run focused gym regressions and verify GREEN**

Run:

```bash
npx tsx tests/regression/f95-step34-gym-source-of-truth-contract.test.ts
npx tsx tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the canonical gym-status implementation**

```bash
git add types/schedule.ts lib/algorithms/floatingPcaV2/trackerSummaryDerivations.ts components/allocation/step34/step34ViewModel.ts lib/features/schedule/v2PcaTrackerTooltipModel.ts lib/features/schedule/pcaTrackerTooltip.ts
git commit -m "feat: unify final gym last-resort status"
```

### Task 6: Lock the bounded-donation and post-extra repair regressions

**Files:**
- Create: `tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts`
- Create: `tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts`
- Create: `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts`
- Test: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Test: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Test: `lib/algorithms/floatingPcaV2/allocator.ts`

- [ ] **Step 1: Write the failing safe-donor donation regression**

Create `tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts`.

Goal:

- prove the current engine misses a GMC/DRO-style rescue because it lacks a direct donor-donation repair shape
- lock the desired behavior that a donor team may give up a true Step 3 floating slot when donor remains acceptably covered

Core assertions:

- `detectRankedV2RepairDefects()` raises a repairable defect for the requester team
- `generateRepairCandidates()` includes a direct donation candidate
- final allocator accepts the repair and records `allocationStage === 'repair'`

Fixture shape:

- requester team rank #1 is missing
- donor team owns that slot through true Step 3 floating
- donor also keeps another true Step 3 floating slot after donation
- no fallback slot and no swap are required

Suggested skeleton:

```ts
import assert from 'node:assert/strict'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { allocateFloatingPCA_v2RankedSlot } from '../../lib/algorithms/pcaAllocation'

assert.equal(
  defects.some((defect) => defect.kind === 'B1' && defect.team === 'GMC'),
  true
)
assert.equal(
  candidates.some((candidate) => slotOwner(candidate.allocations, 'shaohua', 1) === 'GMC'),
  true
)
assert.equal(
  result.tracker.GMC.assignments.some((assignment) => assignment.allocationStage === 'repair'),
  true
)
```

The exact fixture can be adjusted during implementation, but the failing behavior must prove the missing direct-donation rescue shape.

- [ ] **Step 2: Run the safe-donor donation test and verify RED**

Run:

```bash
npx tsx tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts
```

Expected: FAIL because current repair logic only supports open-slot, move-with-fallback, or swap rescue shapes.

- [ ] **Step 3: Write the failing harmful-donor donation regression**

Create `tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts`.

Goal:

- prove the repair engine must not steal a donor's only meaningful true Step 3 floating slot just to rescue another team

Core assertions:

- either no repair defect is raised as repairable, or
- no generated repair candidate donates the donor slot to the requester

Fixture shape:

- requester team is missing a ranked slot
- donor team owns that slot through true Step 3 floating
- donor would drop from one meaningful true Step 3 floating slot to zero if donation happened

Suggested skeleton:

```ts
import assert from 'node:assert/strict'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'

assert.equal(
  candidates.some((candidate) => slotOwner(candidate.allocations, 'shaohua', 1) === 'GMC'),
  false,
  'Repair candidates must not steal the donor team\\'s only meaningful true Step 3 floating slot.'
)
```

- [ ] **Step 4: Run the harmful-donor donation test and verify RED**

Run:

```bash
npx tsx tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts
```

Expected: FAIL until donor-protection logic exists explicitly in repair audit / candidate generation.

- [ ] **Step 5: Rewrite the post-extra re-audit regression as `f99`**

Create `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts` to keep the already identified post-extra bug locked.

Goal:

- preserve the bug where extra-coverage assignments are added after repair and never re-audited

Core assertion:

- if extra coverage creates a newly bounded rescue opportunity, the allocator must re-enter audit/repair before final tracker freeze

- [ ] **Step 6: Run the post-extra re-audit test and verify RED**

Run:

```bash
npx tsx tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
```

Expected: FAIL because `applyExtraCoverageRoundRobin()` currently runs after the repair loop and never re-enters audit.

- [ ] **Step 7: Commit the repair red tests**

```bash
git add tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
git commit -m "test: lock bounded donation and post-extra repair contracts"
```

### Task 7: Implement bounded donor donation, donor-protection gates, gym-aware scoring, and post-extra re-audit

**Files:**
- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts`
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Modify: `lib/algorithms/floatingPcaV2/scoreSchedule.ts`
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts`
- Test: `tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts`
- Test: `tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts`
- Test: `tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts`
- Test: `tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts`
- Test: `tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts`
- Test: `tests/regression/f85-step34-v2-fairness-floor-detects-gym-last-resort-bounded-rescue.test.ts`

- [ ] **Step 1: Teach audit and candidate generation about bounded donor donation**

In `repairAudit.ts`, add helpers that distinguish:

- true Step 3 donor ownership
- acceptable donor donation
- blocked donor donation

Target helper shape:

```ts
function donorHasTrueStep3Ownership(state: AuditState, donorTeam: Team, donorPcaId: string, slot: Slot): boolean
function teamCanDonateBoundedly(state: AuditState, donorTeam: Team, slot: Slot): boolean
function donationWouldBreakDonorRankCoverage(state: AuditState, donorTeam: Team, slot: Slot): boolean
function donationWouldBreakDonorFairnessFloor(state: AuditState, donorTeam: Team, slot: Slot): boolean
```

Required behavior:

- safe donor donation must count as a rescue shape for ranked-gap / fairness-floor repair
- harmful donor donation must be blocked before candidate generation

- [ ] **Step 2: Add a direct donor-donation repair candidate**

In `repairMoves.ts`, add a repair candidate that directly transfers one true Step 3 floating slot from donor to requester without forcing fallback or swap:

```ts
function applyBoundedDonation(args: {
  defectKind: RankedV2RepairDefect['kind']
  sortKey: string
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  donorPcaId: string
  slot: Slot
  donorTeam: Team
  requestingTeam: Team
}): RepairCandidate | null {
  return buildCandidate(args.defectKind, args.sortKey, args.allocations, args.pcaPool, [
    {
      pcaId: args.donorPcaId,
      slot: args.slot,
      fromTeam: args.donorTeam,
      toTeam: args.requestingTeam,
    },
  ])
}
```

Required:

- use this candidate only after donor-protection checks pass
- preserve the old fallback and swap candidates as additional repair shapes

- [ ] **Step 3: Make defect detection recognize donation-only rescue paths**

Update `canRescueSlotForTeam()` and related fairness helpers in `repairAudit.ts` so rescue is recognized when:

- the donor currently owns the slot
- the requester can use the slot
- the donor can donate it boundedly
- no fallback slot and no swap are required

This fixes the primary pre-score audit bug.

- [ ] **Step 4: Add a gym-usage objective to the schedule score**

In `scoreSchedule.ts`, extend the score shape:

```ts
export type RankedSlotAllocationScore = {
  highestRankCoverage: number
  fairnessSatisfied: number
  totalFulfilledPendingQuarterSlots: number
  gymLastResortCount: number
  duplicateFloatingCount: number
  splitPenalty: number
}
```

And compare it before duplicates:

```ts
if (a.gymLastResortCount !== b.gymLastResortCount) {
  return a.gymLastResortCount - b.gymLastResortCount
}
```

Build `gymLastResortCount` by counting teams/slots that end in the canonical gym-last-resort phase.

- [ ] **Step 5: Re-run audit/repair after extra coverage before final tracker freeze**

In `allocator.ts`, extract the repair loop into a reusable function and call it twice:

```ts
function runRepairLoop(/* current allocations, pending, tracker inputs */) {
  // existing defect detection + candidate scoring loop
}

runRepairLoop(/* after draft */)
applyExtraCoverageRoundRobin()
runRepairLoop(/* again after extra coverage mutated allocations */)
```

Important: preserve `acceptedRepairReasons` across both passes and append new repair provenance instead of wiping earlier accepted repairs.

- [ ] **Step 6: Keep extra coverage from claiming a repairable slot first**

Before finalizing each extra-coverage assignment, check whether unresolved `B1` / `F1` defects remain or whether the prospective extra slot would create a strictly better bounded rescue elsewhere.

Minimal guard shape:

```ts
if (repairAuditDefects.some((defect) => defect.kind === 'B1' || defect.kind === 'F1')) {
  return
}
```

Then rely on the second repair pass to exploit any new rescue opportunities created by extra slots that are still assigned.

- [ ] **Step 7: Run the focused repair and gym regressions and verify GREEN**

Run:

```bash
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts
npx tsx tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
npx tsx tests/regression/f85-step34-v2-fairness-floor-detects-gym-last-resort-bounded-rescue.test.ts
npx tsx tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts
npx tsx tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts
npx tsx tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
```

Expected: PASS, with at least one accepted `repair` row in the new rescue fixtures.

- [ ] **Step 8: Commit the repair-path fixes**

```bash
git add lib/algorithms/floatingPcaV2/repairAudit.ts lib/algorithms/floatingPcaV2/repairMoves.ts lib/algorithms/floatingPcaV2/scoreSchedule.ts lib/algorithms/floatingPcaV2/allocator.ts tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts tests/regression/f85-step34-v2-fairness-floor-detects-gym-last-resort-bounded-rescue.test.ts tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
git commit -m "fix: repair ranked gaps before freezing extra coverage"
```

### Task 8: Final focused verification and handoff

**Files:**
- Review only: touched files from Tasks 1-7

- [ ] **Step 1: Run the complete focused regression bundle**

Run:

```bash
npx tsx tests/regression/f72-step34-v2-bounded-repair-rescues-ranked-coverage.test.ts
npx tsx tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts
npx tsx tests/regression/f85-step34-v2-fairness-floor-detects-gym-last-resort-bounded-rescue.test.ts
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
npx tsx tests/regression/f93-step32-preferred-pca-availability-status-contract.test.ts
npx tsx tests/regression/f94-step32-scenario-summary-contract.test.ts
npx tsx tests/regression/f95-step34-gym-source-of-truth-contract.test.ts
npx tsx tests/regression/f96-step34-gym-remains-blocked-until-final-last-resort.test.ts
npx tsx tests/regression/f97-step34-v2-bounded-repair-allows-safe-donor-donation.test.ts
npx tsx tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts
npx tsx tests/regression/f99-step34-v2-extra-coverage-pass-reaudits-before-freeze.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Check diagnostics on touched TS/TSX files**

Use IDE diagnostics / `ReadLints` on:

```text
components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx
components/allocation/step34/step34ViewModel.ts
components/allocation/FloatingPCAConfigDialogV2.tsx
lib/features/schedule/step32V2/step32PreferredReviewModel.ts
lib/features/schedule/step32V2/step32PreferredReviewCopy.ts
lib/features/schedule/v2PcaTrackerTooltipModel.ts
lib/algorithms/floatingPcaV2/trackerSummaryDerivations.ts
lib/algorithms/floatingPcaV2/repairAudit.ts
lib/algorithms/floatingPcaV2/repairMoves.ts
lib/algorithms/floatingPcaV2/scoreSchedule.ts
lib/algorithms/floatingPcaV2/allocator.ts
types/schedule.ts
```

Expected: no new lint/type issues in touched files.

- [ ] **Step 3: Review the user-visible outcome against the approved contract**

Manual checklist:

```text
- Preferred PCA names show per-name availability status.
- Step 3.2 explains rank protection and preferred/fallback outcome without implying "save assigns all shown slots".
- Save helper says it reserves one slot only.
- Step 3.4 chip and tooltip agree on gym status.
- Final gym usage appears only as "used only as last resort".
- Safe donor-donation scenarios produce repair candidates and accepted repair rows.
- Harmful donor-donation scenarios stay blocked.
- Repair counts become non-zero when bounded donation or post-extra re-audit succeeds.
```

- [ ] **Step 4: Commit final verification notes if any fixture/test updates were required**

```bash
git add .
git commit -m "test: verify step3 preferred, gym, and repair contracts"
```

---

## Self-Review

### Spec coverage
- Step 3.2 explanation drift: covered by Tasks 1-3.
- Per-preferred-PCA availability badges: covered by Tasks 1-3.
- Single gym source of truth across chip + tooltip: covered by Tasks 4-5.
- Gym blocked until final last resort: covered by Tasks 4-5 and score change in Task 7.
- Repair blind spot / repair count stuck at zero: covered by Tasks 6-7.
- Bounded donor donation vs harmful donor donation boundary: covered by Tasks 6-7.
- Extra coverage must receive audit: covered by Tasks 6-7.

### Placeholder scan
- No `TODO` / `TBD` placeholders remain.
- All new test files, commands, and target code shapes are named explicitly.

### Type consistency
- Canonical gym field is consistently named `gymUsageStatus`.
- Step 3.2 new UI/model field names are consistently `preferredPcaStatuses` and `primaryScenario`.

