# Floating PCA V1/V2 Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the mixed floating PCA implementation into explicit legacy-facing, ranked-V2, and shared boundaries while preserving current V1, V2, and inline `allocatePCA()` floating behavior.

**Architecture:** Extract the ranked V2 allocator out of `lib/algorithms/pcaAllocationFloating.ts` first, then extract the legacy-facing standard allocator, then remove the hidden inline floating path from `lib/algorithms/pcaAllocation.ts`. Keep public behavior-named wrappers stable, move only version-specific policy out of shared helpers, and prove the refactor with characterization tests for V1, V2, and the inline `allocatePCA()` floating path.

**Tech Stack:** TypeScript, Node `npx tsx` regression tests, existing Step 3 allocator modules under `lib/algorithms/`, shared tracker/types under `types/` and `lib/utils/`.

---

## File Structure

### New files to create
- `lib/algorithms/floatingPcaShared/contracts.ts`
  - Shared floating allocator public contracts currently defined in `pcaAllocationFloating.ts`
- `lib/algorithms/floatingPcaLegacy/allocator.ts`
  - Standard / legacy-facing floating allocator implementation currently exported as `allocateFloatingPCA_v1LegacyPreference`
- `lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts`
  - Extracted helper for the inline floating branch currently embedded in `allocatePCA()`
- `lib/algorithms/floatingPcaV2/allocator.ts`
  - Ranked V2 allocator orchestration currently living in `pcaAllocationFloating.ts`
- `lib/algorithms/floatingPcaV2/provenance.ts`
  - V2-only provenance helpers currently mixed into `lib/utils/floatingPCAHelpers.ts`
- `tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts`
  - Characterization test for the extracted `allocatePCA()` floating path

### Existing files to modify
- `lib/algorithms/pcaAllocationFloating.ts`
  - Reduce to transitional façade only; no substantive mixed implementation at the end
- `lib/algorithms/pcaAllocation.ts`
  - Import explicit homes, extract inline floating branch, preserve public exports
- `lib/algorithms/floatingPcaV1LegacyPreference.ts`
  - Point wrapper at new legacy implementation file and add explicit warning comment
- `lib/algorithms/floatingPcaV2RankedSlot.ts`
  - Point wrapper at new V2 implementation file and add explicit warning comment
- `lib/utils/floatingPCAHelpers.ts`
  - Keep shared mechanics; remove or isolate V2-only provenance helpers; add file-level guardrails
- `tests/regression/f65-floating-pca-engine-export-contract.test.ts`
  - Keep canonical export surface checks stable after file moves
- `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`
  - Preserve cross-version continuity behavior during extraction
- `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
  - Preserve ranked-V2 selected-only contract during extraction

### Existing tests to run as characterization / regression gates
- `tests/regression/f65-floating-pca-engine-export-contract.test.ts`
- `tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts`
- `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`
- `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
- `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`
- `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts`
- `tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts`
- `tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts`
- `tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts`
- `tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts`
- `tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts`

---

### Task 1: Lock current behavior with characterization tests

**Files:**
- Modify: `tests/regression/f65-floating-pca-engine-export-contract.test.ts`
- Modify: `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`
- Create: `tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts`

- [ ] **Step 1: Extend the export-surface contract to pin wrapper names**

Keep the existing export contract and add one assertion that the behavior-named wrappers remain functions even after moving the implementations to new modules.

```ts
import assert from 'node:assert/strict'

async function main() {
  const pcaModule = await import('../../lib/algorithms/pcaAllocation')

  assert.equal(typeof pcaModule.allocateFloatingPCA_v1LegacyPreference, 'function')
  assert.equal(typeof pcaModule.allocateFloatingPCA_v2RankedSlot, 'function')
  assert.equal('allocateFloatingPCA_v2' in pcaModule, false)
  assert.equal('allocateFloatingPCA_rankedV2' in pcaModule, false)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 2: Add an inline `allocatePCA()` floating characterization test**

Create `tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts` with one direct `phase: 'floating'` call and one `phase: 'all'` call over the same deterministic fixture.

```ts
import assert from 'node:assert/strict'

import { allocatePCA, type PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return {
    FO: value,
    SMM: value,
    SFM: value,
    CPPC: value,
    MC: value,
    GMC: value,
    NSM: value,
    DRO: value,
  }
}

function makePca(id: string, slots: number[]): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots: slots,
    floor_pca: ['upper'],
  } as PCAData
}

const preference: PCAPreference = {
  id: 'pref-fo',
  team: 'FO',
  preferred_pca_ids: [],
  preferred_slots: [1, 3],
  gym_schedule: 4,
  avoid_gym_schedule: true,
  floor_pca_selection: 'upper',
}

async function main() {
  const base = {
    date: new Date('2026-04-10T08:00:00.000Z'),
    totalPCAAvailable: 1,
    pcaPool: [makePca('float-a', [1, 3])],
    averagePCAPerTeam: { ...emptyTeamRecord(0), FO: 0.5 },
    specialPrograms: [],
    pcaPreferences: [preference],
    staffOverrides: {},
  }

  const floatingOnly = await allocatePCA({
    ...base,
    phase: 'floating',
    existingAllocations: [],
    existingTeamPCAAssigned: emptyTeamRecord(0),
  })

  const floatingRow = floatingOnly.allocations.find((allocation) => allocation.staff_id === 'float-a')
  assert.equal(floatingRow?.slot1, 'FO')
  assert.equal(floatingRow?.slot3, 'FO')
  assert.equal(floatingOnly.pendingPCAFTEPerTeam.FO, 0)

  const allPhase = await allocatePCA({
    ...base,
    phase: 'all',
  })

  const allPhaseRow = allPhase.allocations.find((allocation) => allocation.staff_id === 'float-a')
  assert.equal(allPhaseRow?.slot1, 'FO')
  assert.equal(allPhaseRow?.slot3, 'FO')
  assert.equal(allPhase.pendingPCAFTEPerTeam.FO, 0)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 3: Keep the V1/V2 continuity characterization stable**

Do not weaken `f68`. It is the cross-version behavior lock that proves both:

- V1 legacy-facing path still runs
- V2 ranked path still runs

Keep this core assertion structure intact:

```ts
const v1 = await allocateFloatingPCA_v1LegacyPreference({ /* existing fixture */ })
const v2 = await allocateFloatingPCA_v2RankedSlot({ /* existing fixture */ })

assert.equal(countTeamPcasUsed(v1, 'FO'), 1)
assert.equal(countTeamPcasUsed(v2, 'FO'), 1)
assert.equal(v1Row?.slot1, 'FO')
assert.equal(v1Row?.slot2, 'FO')
assert.equal(v2First?.slot, 1)
assert.equal(v2Second?.usedContinuity, true)
```

- [ ] **Step 4: Run characterization tests before moving code**

Run:

```bash
npx tsx tests/regression/f65-floating-pca-engine-export-contract.test.ts
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts
npx tsx tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts
```

Expected:
- all PASS
- these tests now define the “do not change behavior” baseline for the extraction

- [ ] **Step 5: Commit**

```bash
git add tests/regression/f65-floating-pca-engine-export-contract.test.ts tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts
git commit -m "test: lock floating allocator extraction characterization"
```

---

### Task 2: Extract shared floating contracts out of `pcaAllocationFloating.ts`

**Files:**
- Create: `lib/algorithms/floatingPcaShared/contracts.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Modify: `lib/algorithms/pcaAllocation.ts`

- [ ] **Step 1: Create the shared contracts file**

Create `lib/algorithms/floatingPcaShared/contracts.ts` with the public floating allocator contracts currently defined at the top of `pcaAllocationFloating.ts`.

```ts
import type { Team } from '@/types/staff'
import type { AllocationTracker, PCAAllocation } from '@/types/schedule'
import type { PCAPreference, SpecialProgram } from '@/types/allocation'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'

export type FloatingPCAAllocationMode = 'standard' | 'balanced'

export interface FloatingPCAAllocationContextV2 {
  teamOrder: Team[]
  currentPendingFTE: Record<Team, number>
  existingAllocations: PCAAllocation[]
  pcaPool: PCAData[]
  pcaPreferences: PCAPreference[]
  specialPrograms: SpecialProgram[]
  mode?: FloatingPCAAllocationMode
  extraCoverageMode?: 'none' | 'round-robin-team-order'
  preferenceSelectionMode?: 'legacy' | 'selected_only'
  preferenceProtectionMode?: 'exclusive' | 'share'
  selectedPreferenceAssignments?: Array<{
    team: Team
    slot: number
    pcaId: string
    source?: 'step32' | 'step33'
  }>
}

export interface FloatingPCAAllocationResultV2 {
  allocations: PCAAllocation[]
  pendingPCAFTEPerTeam: Record<Team, number>
  tracker: AllocationTracker
  extraCoverageByStaffId?: Record<string, Array<1 | 2 | 3 | 4>>
  errors?: {
    preferredSlotUnassigned?: string[]
  }
}
```

- [ ] **Step 2: Update `pcaAllocationFloating.ts` to import contracts instead of defining them**

Replace the local type/interface declarations with imports from the new contracts file.

```ts
import type {
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationMode,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/floatingPcaShared/contracts'
```

Delete the old in-file declarations once the import compiles.

- [ ] **Step 3: Update the canonical export surface in `pcaAllocation.ts`**

Change the end-of-file type re-export to come from the contracts module rather than `pcaAllocationFloating.ts`.

```ts
export type {
  FloatingPCAAllocationMode,
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationResultV2,
} from './floatingPcaShared/contracts'
export { allocateFloatingPCA_v1LegacyPreference } from './floatingPcaV1LegacyPreference'
export { allocateFloatingPCA_v2RankedSlot } from './floatingPcaV2RankedSlot'
```

- [ ] **Step 4: Run the export and characterization tests**

Run:

```bash
npx tsx tests/regression/f65-floating-pca-engine-export-contract.test.ts
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts
npx tsx tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts
```

Expected:
- all PASS
- types are now decoupled from the mixed implementation file

- [ ] **Step 5: Commit**

```bash
git add lib/algorithms/floatingPcaShared/contracts.ts lib/algorithms/pcaAllocationFloating.ts lib/algorithms/pcaAllocation.ts
git commit -m "refactor: extract shared floating allocator contracts"
```

---

### Task 3: Move ranked V2 orchestration into `floatingPcaV2/allocator.ts`

**Files:**
- Create: `lib/algorithms/floatingPcaV2/allocator.ts`
- Modify: `lib/algorithms/floatingPcaV2RankedSlot.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Modify if needed: `lib/algorithms/pcaAllocation.ts`
- Test: `tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts`
- Test: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- Test: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
- Test: `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`
- Test: `tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts`
- Test: `tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts`

- [ ] **Step 1: Create the ranked V2 allocator module**

Create `lib/algorithms/floatingPcaV2/allocator.ts` and move the full `allocateFloatingPCA_rankedV2` implementation plus ranked-only local helpers into it.

At minimum, the new file should begin like this:

```ts
import type { SlotAssignmentLog } from '@/types/schedule'
import type {
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/floatingPcaShared/contracts'
import { TEAMS, createEmptyTracker, recordAssignment, getTeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { buildEffectiveRankedPreferences } from '@/lib/algorithms/floatingPcaV2/effectivePreferences'
import { runRankedV2DraftAllocation } from '@/lib/algorithms/floatingPcaV2/draftAllocation'
import { detectRankedV2RepairDefects, type RankedV2RepairDefect } from '@/lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '@/lib/algorithms/floatingPcaV2/repairMoves'
import { buildRankedSlotAllocationScore, compareScores } from '@/lib/algorithms/floatingPcaV2/scoreSchedule'

export async function allocateFloatingPCA_v2RankedSlotImpl(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  // moved body of allocateFloatingPCA_rankedV2
}
```

Move these ranked-only helpers with it:

```ts
const MAX_REPAIR_ITERATIONS = 8
const MAX_CANDIDATES_PER_DEFECT = 24

function createEmptyPendingFTE(): Record<Team, number> { /* moved exactly */ }
function countAssignedSlotsByTeam(allocations: PCAAllocation[]): Record<Team, number> { /* moved exactly */ }
function computePendingFromAllocations(...) { /* moved exactly */ }
function getRepairReason(...) { /* moved exactly */ }
```

- [ ] **Step 2: Point the V2 wrapper at the new implementation**

Update `lib/algorithms/floatingPcaV2RankedSlot.ts` to import from the new ranked module and add a warning comment.

```ts
/**
 * Canonical ranked V2 Step 3.4 entrypoint.
 * Do not point V2 feature work back at pcaAllocationFloating.ts.
 */
export { allocateFloatingPCA_v2RankedSlotImpl as allocateFloatingPCA_v2RankedSlot } from './floatingPcaV2/allocator'
```

- [ ] **Step 3: Leave a temporary façade export in `pcaAllocationFloating.ts`**

Until legacy extraction is complete, keep a thin re-export only:

```ts
export { allocateFloatingPCA_v2RankedSlotImpl as allocateFloatingPCA_rankedV2 } from '@/lib/algorithms/floatingPcaV2/allocator'
```

Do not leave ranked V2 orchestration logic in `pcaAllocationFloating.ts` after this task.

- [ ] **Step 4: Run ranked V2 regression coverage**

Run:

```bash
npx tsx tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
npx tsx tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
```

Expected:
- all PASS
- ranked V2 callers now run through `lib/algorithms/floatingPcaV2/allocator.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/algorithms/floatingPcaV2/allocator.ts lib/algorithms/floatingPcaV2RankedSlot.ts lib/algorithms/pcaAllocationFloating.ts
git commit -m "refactor: extract ranked v2 floating allocator"
```

---

### Task 4: Move the legacy-facing standard allocator into `floatingPcaLegacy/allocator.ts`

**Files:**
- Create: `lib/algorithms/floatingPcaLegacy/allocator.ts`
- Modify: `lib/algorithms/floatingPcaV1LegacyPreference.ts`
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Test: `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`

- [ ] **Step 1: Create the legacy allocator module**

Create `lib/algorithms/floatingPcaLegacy/allocator.ts` and move the full `allocateFloatingPCA_v2` implementation into it without behavioral changes.

The new file should start like this:

```ts
import type {
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/floatingPcaShared/contracts'
import {
  TEAMS,
  createEmptyTracker,
  recordAssignment,
  finalizeTrackerSummary,
  buildPreferredPCAMap,
  getTeamPreferenceInfo,
  findAvailablePCAs,
  getOrCreateAllocation,
  getTeamExistingSlots,
  assignOneSlotAndUpdatePending,
  assignUpToPendingAndUpdatePending,
  assignSlotsToTeam,
  getAvailableSlotsForTeam,
  assignSlotIfValid,
  isFloorPCAForTeam,
  type TeamPreferenceInfo,
} from '@/lib/utils/floatingPCAHelpers'

export async function allocateFloatingPCA_v1LegacyPreferenceImpl(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  // moved body of allocateFloatingPCA_v2
}
```

Also move the standard-only helper:

```ts
function buildSelectionDrivenPreferences(
  basePreferences: PCAPreference[],
  selectedAssignments: Array<{ team: Team; pcaId: string }>
): PCAPreference[] {
  // moved exactly
}
```

- [ ] **Step 2: Point the V1 wrapper at the new legacy implementation**

Update `lib/algorithms/floatingPcaV1LegacyPreference.ts`:

```ts
/**
 * Canonical legacy-facing Step 3.4 entrypoint.
 * This wrapper must remain stable even if the underlying implementation moves.
 */
export { allocateFloatingPCA_v1LegacyPreferenceImpl as allocateFloatingPCA_v1LegacyPreference } from './floatingPcaLegacy/allocator'
```

- [ ] **Step 3: Reduce `pcaAllocationFloating.ts` to façade exports only**

After Task 3 and Task 4, `pcaAllocationFloating.ts` should contain only transitional exports and no mixed logic.

```ts
export type {
  FloatingPCAAllocationMode,
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/floatingPcaShared/contracts'
export { allocateFloatingPCA_v1LegacyPreferenceImpl as allocateFloatingPCA_v2 } from '@/lib/algorithms/floatingPcaLegacy/allocator'
export { allocateFloatingPCA_v2RankedSlotImpl as allocateFloatingPCA_rankedV2 } from '@/lib/algorithms/floatingPcaV2/allocator'
```

This temporary façade exists only to avoid breaking imports during the migration.

- [ ] **Step 4: Run cross-version continuity characterization**

Run:

```bash
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts
npx tsx tests/regression/f65-floating-pca-engine-export-contract.test.ts
```

Expected:
- both PASS
- V1 and V2 wrappers still expose working behavior after the split

- [ ] **Step 5: Commit**

```bash
git add lib/algorithms/floatingPcaLegacy/allocator.ts lib/algorithms/floatingPcaV1LegacyPreference.ts lib/algorithms/pcaAllocationFloating.ts
git commit -m "refactor: extract legacy floating allocator"
```

---

### Task 5: Extract the inline floating branch from `allocatePCA()`

**Files:**
- Create: `lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts`
- Modify: `lib/algorithms/pcaAllocation.ts`
- Test: `tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts`

- [ ] **Step 1: Create a helper module for the inline floating phase**

Create `lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts` and move the body of the `if (shouldDoFloating)` block out of `allocatePCA()`.

Use a helper shaped like:

```ts
import type { PCAAllocationContext, PCAAllocationResult } from '@/lib/algorithms/pcaAllocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Team } from '@/types/staff'

export async function runLegacyAllocatePcaFloatingPhase(args: {
  context: PCAAllocationContext
  allocations: PCAAllocation[]
  teamPCAAssigned: Record<Team, number>
  errors: Record<string, string>
}): Promise<{
  allocations: PCAAllocation[]
  teamPCAAssigned: Record<Team, number>
  pendingPCAFTEPerTeam: Record<Team, number>
}> {
  // moved body of the floating-phase block from allocatePCA()
}
```

Move the current inline logic exactly before simplifying anything.

- [ ] **Step 2: Replace the inline block in `allocatePCA()` with a delegate call**

In `lib/algorithms/pcaAllocation.ts`, replace the large inline floating block with a small call.

```ts
if (shouldDoFloating) {
  const floatingPhaseResult = await runLegacyAllocatePcaFloatingPhase({
    context,
    allocations,
    teamPCAAssigned,
    errors,
  })
  allocations = floatingPhaseResult.allocations
  teamPCAAssigned = floatingPhaseResult.teamPCAAssigned
  pendingPCAFTEPerTeam = floatingPhaseResult.pendingPCAFTEPerTeam
}
```

If the existing local variables are `const`, convert them to `let` before this replacement so the delegate result can be assigned back cleanly.

- [ ] **Step 3: Add a warning comment in `pcaAllocation.ts`**

Add a short banner above the floating delegate import/use so future agents do not miss that legacy floating behavior still exists here.

```ts
// Legacy allocatePCA() floating path is intentionally extracted to its own module.
// Do not assume all floating behavior lives in pcaAllocationFloating.ts.
```

- [ ] **Step 4: Run the inline characterization test**

Run:

```bash
npx tsx tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts
```

Expected:
- PASS
- extracted inline phase preserves both `phase: 'floating'` and `phase: 'all'` behavior for the locked fixture

- [ ] **Step 5: Commit**

```bash
git add lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts lib/algorithms/pcaAllocation.ts tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts
git commit -m "refactor: extract allocatePCA floating phase"
```

---

### Task 6: Reduce helper contamination and add explicit guardrails

**Files:**
- Create: `lib/algorithms/floatingPcaV2/provenance.ts`
- Modify: `lib/utils/floatingPCAHelpers.ts`
- Modify: `lib/algorithms/floatingPcaV1LegacyPreference.ts`
- Modify: `lib/algorithms/floatingPcaV2RankedSlot.ts`
- Modify: `lib/algorithms/pcaAllocation.ts`
- Test: `tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts`
- Test: `tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts`
- Test: `tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts`

- [ ] **Step 1: Move V2 provenance helpers out of `floatingPCAHelpers.ts`**

Create `lib/algorithms/floatingPcaV2/provenance.ts`:

```ts
import type { PCAAllocation, SlotAssignmentLog } from '@/types/schedule'
import type { Team } from '@/types/staff'
import { getSlotTeam } from '@/lib/utils/floatingPCAHelpers'

export type Step3FloatingSelectionSeed = {
  team: Team
  slot: number
  pcaId: string
}

export function buildStep3FloatingSelectionKey(selection: Step3FloatingSelectionSeed): string {
  return `${selection.team}:${selection.slot}:${selection.pcaId}`
}

export function buildUpstreamCoverageKindByTeamSlot(args: {
  existingAllocations: PCAAllocation[]
  floatingPcaIds?: Set<string>
  excludeStep3OwnedSelections?: Step3FloatingSelectionSeed[]
}): Map<string, NonNullable<SlotAssignmentLog['upstreamCoverageKind']>> {
  // move current implementation exactly
}
```

Update imports in V2 callers to use this file instead of `lib/utils/floatingPCAHelpers.ts`.

- [ ] **Step 2: Keep pure mechanics in `floatingPCAHelpers.ts` and add a file banner**

At the top of `lib/utils/floatingPCAHelpers.ts`, add a short warning:

```ts
/**
 * Shared floating PCA mechanics only.
 * Keep slot/pending/allocation mechanics here.
 * Move ranked-V2 provenance or tracker policy to version-scoped modules.
 */
```

Do not move broad shared mechanics in this task.

- [ ] **Step 3: Add explicit warning comments to behavior wrappers**

Update `lib/algorithms/floatingPcaV1LegacyPreference.ts`:

```ts
/**
 * Behavior-named legacy-facing wrapper.
 * Keep this stable for callers; do not repoint feature work at mixed files.
 */
export { allocateFloatingPCA_v1LegacyPreferenceImpl as allocateFloatingPCA_v1LegacyPreference } from './floatingPcaLegacy/allocator'
```

Update `lib/algorithms/floatingPcaV2RankedSlot.ts`:

```ts
/**
 * Behavior-named ranked V2 wrapper.
 * Keep V2 work pointed at the explicit floatingPcaV2 implementation.
 */
export { allocateFloatingPCA_v2RankedSlotImpl as allocateFloatingPCA_v2RankedSlot } from './floatingPcaV2/allocator'
```

- [ ] **Step 4: Run provenance and tracker guardrail tests**

Run:

```bash
npx tsx tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts
npx tsx tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts
npx tsx tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts
```

Expected:
- all PASS
- helper moves did not change duplicate/tracker semantics

- [ ] **Step 5: Commit**

```bash
git add lib/algorithms/floatingPcaV2/provenance.ts lib/utils/floatingPCAHelpers.ts lib/algorithms/floatingPcaV1LegacyPreference.ts lib/algorithms/floatingPcaV2RankedSlot.ts lib/algorithms/pcaAllocation.ts
git commit -m "refactor: isolate floating allocator version boundaries"
```

---

### Task 7: Remove the mixed implementation façade and run the full verification sweep

**Files:**
- Modify: `lib/algorithms/pcaAllocationFloating.ts`
- Test: `tests/regression/f65-floating-pca-engine-export-contract.test.ts`
- Test: `tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts`
- Test: `tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts`
- Test: `tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts`
- Test: `tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts`
- Test: `tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts`
- Test: `tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts`
- Test: `tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts`
- Test: `tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts`
- Test: `tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts`
- Test: `tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts`
- Test: `tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts`

- [ ] **Step 1: Reduce `pcaAllocationFloating.ts` to the final allowed state**

After all callers are updated, keep only one of these end states:

```ts
// Option A: delete file entirely after imports are updated
```

or

```ts
// Option B: tiny transitional façade only
export type {
  FloatingPCAAllocationMode,
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/floatingPcaShared/contracts'
export { allocateFloatingPCA_v1LegacyPreferenceImpl as allocateFloatingPCA_v2 } from '@/lib/algorithms/floatingPcaLegacy/allocator'
export { allocateFloatingPCA_v2RankedSlotImpl as allocateFloatingPCA_rankedV2 } from '@/lib/algorithms/floatingPcaV2/allocator'
```

Do not leave substantive allocator logic in this file.

- [ ] **Step 2: Run the full focused regression sweep**

Run:

```bash
npx tsx tests/regression/f65-floating-pca-engine-export-contract.test.ts
npx tsx tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts
npx tsx tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts
npx tsx tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts
npx tsx tests/regression/f73-step34-v2-bounded-repair-reduces-duplicate-coverage.test.ts
npx tsx tests/regression/f74-step34-v2-bounded-repair-reduces-over-splitting.test.ts
npx tsx tests/regression/f75-step3-v2-committed-manual-selections-preview.test.ts
npx tsx tests/regression/f76-pca-tooltip-variant-and-copy-contract.test.ts
npx tsx tests/regression/f78-step34-duplicate-floating-semantics-contract.test.ts
npx tsx tests/regression/f80-step34-v2-duplicate-floating-provenance-contract.test.ts
npx tsx tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts
npx tsx tests/regression/f82-v2-tracker-tooltip-preview-duplicate-alignment.test.ts
```

Expected:
- all PASS
- V1 and V2 public wrappers still run correctly
- inline `allocatePCA()` floating behavior remains characterized and stable

- [ ] **Step 3: Run lints on touched files**

Run:

```bash
npx eslint lib/algorithms/pcaAllocation.ts lib/algorithms/pcaAllocationFloating.ts lib/algorithms/floatingPcaV1LegacyPreference.ts lib/algorithms/floatingPcaV2RankedSlot.ts lib/algorithms/floatingPcaLegacy/allocator.ts lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts lib/algorithms/floatingPcaV2/allocator.ts lib/algorithms/floatingPcaV2/provenance.ts lib/algorithms/floatingPcaShared/contracts.ts lib/utils/floatingPCAHelpers.ts
```

Expected:
- no new lint errors

- [ ] **Step 4: Final review against the extraction spec**

Review checklist:
- `pcaAllocationFloating.ts` is no longer a mixed implementation file
- `allocatePCA()` no longer hides the floating allocator inside the monolith
- V1 and V2 wrappers still exist with stable names
- V1 behavior characterization still passes
- V2 behavior characterization and ranked regressions still pass
- helper contamination was reduced rather than spread into new mixed files
- future agents can infer ownership from file paths without reading deep internals

- [ ] **Step 5: Commit**

```bash
git add lib/algorithms/pcaAllocationFloating.ts lib/algorithms/pcaAllocation.ts lib/algorithms/floatingPcaV1LegacyPreference.ts lib/algorithms/floatingPcaV2RankedSlot.ts lib/algorithms/floatingPcaLegacy/allocator.ts lib/algorithms/floatingPcaLegacy/allocatePcaFloatingPhase.ts lib/algorithms/floatingPcaV2/allocator.ts lib/algorithms/floatingPcaV2/provenance.ts lib/algorithms/floatingPcaShared/contracts.ts lib/utils/floatingPCAHelpers.ts tests/regression/f65-floating-pca-engine-export-contract.test.ts tests/regression/f68-step34-v1-v2-continuity-characterization.test.ts tests/regression/f71-step34-v2-preserves-ranked-slots-with-manual-selections.test.ts tests/regression/f83-allocate-pca-inline-floating-characterization.test.ts
git commit -m "refactor: split floating PCA legacy and ranked V2 engines"
```

---

## Self-Review

### 1. Spec coverage
- Mixed `pcaAllocationFloating.ts` split: covered by Tasks 2-4 and 7
- Inline `pcaAllocation.ts` floating path extraction: covered by Task 5
- `floatingPCAHelpers.ts` contamination reduction: covered by Task 6
- Stable public wrappers: covered by Tasks 2, 3, 4, and 7
- V1 and V2 behavior preservation: covered by Tasks 1 and 7
- Guardrails for future AI edits: covered by Task 6 and final review

### 2. Placeholder scan
- No `TODO` / `TBD` placeholders remain
- New test file and new module names are explicit
- Commands and expected outputs are specified for each verification step

### 3. Type consistency
- Public floating allocator types move to `lib/algorithms/floatingPcaShared/contracts.ts`
- Ranked implementation target name is `allocateFloatingPCA_v2RankedSlotImpl`
- Legacy implementation target name is `allocateFloatingPCA_v1LegacyPreferenceImpl`
- Public wrapper names remain unchanged

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-10-floating-pca-v1-v2-extraction-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
