# Floating PCA V2 — A1 global duplicate repair (swap-first, bounded peel) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loosen A1 duplicate-reduction defect detection so teams with *some* clean true Step 3 floating coverage but *material remaining* floating pending can still trigger relief from duplicate-heavy donors; keep F1 as an inviolable floor; prefer **swap** resolutions over **single-sided peel** when both improve the same lexicographic score; allow bounded peel only when the recipient is **eligible** (still short on floating pending) and the move does not **increase** the number of teams that are materially short.

**Architecture:** Keep the existing pipeline in `allocateFloatingPCA_v2RankedSlotImpl` (draft → bounded repair loop → gym avoidance → optional promotion → follow-up passes). Change **audit predicates** in `repairAudit.ts` (when A1 is raised), **candidate generation** in `repairMoves.ts` (who may receive a peeled slot; add swap-shaped moves where feasible), and optionally **lexicographic tie-break** in `allocator.ts` / `scoreSchedule.ts` so swap beats peel at equal score. Extract small, testable pure helpers (new module under `lib/algorithms/floatingPcaV2/`) so meticulous behavior is covered by unit tests before integration fixtures.

**Tech stack:** TypeScript, Node test runner (`node --test` as used in `tests/regression/f*.test.ts`), existing `allocateFloatingPCA_v2RankedSlot` from `lib/algorithms/pcaAllocation.ts`.

---

## 0. Requirements traceability (spec → work)

| Requirement | Where it lands |
|-------------|----------------|
| A1 must not be suppressed solely because `otherTeam` has *any* true Step 3 non-duplicate row if that team still has **material remaining** floating pending | `hasDuplicateVersusUsefulSlotDefect` in `lib/algorithms/floatingPcaV2/repairAudit.ts` |
| F1 remains the floor; no repair accepts a candidate that leaves new F1 violations worse than fixable | Existing `compareScores` tier 3 + `detectRankedV2RepairDefects`; regression tests assert F1 count never worsens when a better F1-preserving path exists |
| Swap-first: if a **swap** candidate exists with lexicographic score **strictly better** than current, prefer it over a peel that only ties higher tiers | `generateA1Candidates` (and/or allocator loop tie-break) in `lib/algorithms/floatingPcaV2/repairMoves.ts`, `lib/algorithms/floatingPcaV2/allocator.ts` |
| Peel only to **eligible** recipients (still materially short on **current** pending after draft/repair state) | Filter in `generateA1Candidates` using `pendingFTE` from `GenerateRepairCandidatesContext` |
| No peel that **increases** count of materially short teams | Post-filter each peel candidate: compare `countMaterialShortTeams(pendingBefore)` vs `countMaterialShortTeams(pendingAfter)`; reject if increased |
| Internal tests prove ordering swap > peel and eligibility | New regression + unit tests under `tests/regression/` and optional `tests/unit/floatingPcaV2/` |

---

## 1. File map

| File | Responsibility |
|------|------------------|
| `lib/algorithms/floatingPcaV2/duplicateRepairPolicy.ts` (**create**) | Pure helpers: `teamHasMaterialRemainingFloatingPending`, `countTeamsMaterialShort`, `a1OtherTeamStillNeedsDuplicateRelief`, swap-vs-peel tie token |
| `lib/algorithms/floatingPcaV2/repairAudit.ts` | Widen `hasDuplicateVersusUsefulSlotDefect`; re-export or import helpers to keep audit readable |
| `lib/algorithms/floatingPcaV2/repairMoves.ts` | `generateA1Candidates`: recipient eligibility; optional **A1 swap** candidates; peel short-team monotonicity check |
| `lib/algorithms/floatingPcaV2/allocator.ts` | If needed: when `compareScores === 0`, prefer lower `repairMoveKindRank` (swap < peel) |
| `lib/algorithms/floatingPcaV2/scoreSchedule.ts` | Only if you add an explicit numeric tier for move-kind; prefer allocator tie-break to avoid reshuffling all scores |
| `tests/regression/f133-step34-v2-a1-duplicate-relief-when-recipient-has-clean-slot-but-pending.test.ts` (**create**) | Integration: NSM-like team has clean Step 3 row + remaining pending; DRO-like duplicate stack; repair reduces dup **and** does not worsen short-team count |
| `tests/regression/f134-step34-v2-a1-swap-prefer-over-peel-tiebreak.test.ts` (**create**) | Controlled fixture where swap and peel tie on `compareScores` through duplicate tier; assert swap chosen |
| `tests/unit/floatingPcaV2/duplicateRepairPolicy.test.ts` (**create**) | Unit tests for pure predicates (thresholds, edge at 0.25 pending) |

---

## 2. Definitions (lock semantics in code comments + tests)

**Material remaining floating pending** for a team `T`:

- Use the same quarter granularity as the rest of Step 3.4: `round((pendingFTE[T] + 1e-9) / 0.25) >= 1`.
- Source of truth during repair: **`pendingFTE` passed into `detectRankedV2RepairDefects`** / `buildRankedV2RepairAuditState` (i.e. **current** remaining pending after baseline + Step 3 work), not `initialPendingFTE` alone.

**A1 “other team” gate (revised):**

- Today: `if (teamHasUsefulNonDuplicateSlot(state, otherTeam)) continue`.
- Revised: skip `otherTeam` only when they **both** have a useful non-duplicate true Step 3 row **and** do **not** have material remaining pending:

```ts
if (
  teamHasUsefulNonDuplicateSlot(state, otherTeam) &&
  !teamHasMaterialRemainingFloatingPending(state.pendingFTE, otherTeam)
) {
  continue
}
```

Implement `teamHasMaterialRemainingFloatingPending` in `duplicateRepairPolicy.ts` using `roundToNearestQuarterWithMidpoint` from `@/lib/utils/rounding` for consistency with `repairAudit.ts`.

**Peel recipient eligibility:** `rescueTeam` must satisfy `teamHasMaterialRemainingFloatingPending(pendingFTE, rescueTeam)` at **pre-move** state (and optionally post-move still ≥ 0 fulfilled target—YAGNI: pre-move short is enough for v1).

**No net new short teams:** Let `S(allocations, pendingFTE) = countTeamsMaterialShort(pendingFTE)`. For candidate `c`, compute `pendingAfter = computePendingFromAllocations(...)`. Reject peel if `S(after) > S(before)`. Swaps must satisfy the same predicate unless the plan documents an exception (default: **same rule for all A1 moves**).

---

## 3. Tasks

### Task 1: Pure policy helpers + unit tests

**Files:**

- Create: `lib/algorithms/floatingPcaV2/duplicateRepairPolicy.ts`
- Create: `tests/unit/floatingPcaV2/duplicateRepairPolicy.test.ts`

- [x] **Step 1.1:** Add `duplicateRepairPolicy.ts` with:

```typescript
import type { Team } from '@/types/staff'
import { TEAMS } from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'

export function teamHasMaterialRemainingFloatingPending(
  pendingFTE: Record<Team, number>,
  team: Team
): boolean {
  return roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) >= 0.25
}

export function countTeamsMaterialShort(pendingFTE: Record<Team, number>): number {
  let n = 0
  for (const team of TEAMS) {
    if (teamHasMaterialRemainingFloatingPending(pendingFTE, team)) n += 1
  }
  return n
}
```

Export a named constant `A1_DUPLICATE_RELIEF_POLICY_VERSION = 1` for future fixture gating if needed.

- [x] **Step 1.2:** Add `tests/unit/floatingPcaV2/duplicateRepairPolicy.test.ts` with `node:test` asserting:

  - `0` / sub-quarter (e.g. `0.1`, `0.12`) → false; `0.25` and values that **midpoint-round** to ≥ `0.25` (e.g. `0.24` → `0.25`) → true.
  - `countTeamsMaterialShort` counts only teams ≥ 0.25.

- [x] **Step 1.3:** Run (this repo: TypeScript + `@/` paths; use the npm script or `npx tsx` if plain `node --test` cannot resolve the module graph):

```bash
cd "/Users/alvin/Desktop/RBIP duty list web app" && node --test tests/unit/floatingPcaV2/duplicateRepairPolicy.test.ts
# or, when the above does not load `.ts` / path aliases:
npm run test:unit-floatingPcaV2-duplicatePolicy
```

Expected: all pass.

- [x] **Step 1.4:** Commit message example: `test(floating-pca-v2): add duplicate repair policy helpers`.

---

### Task 2: Widen A1 defect predicate (`repairAudit.ts`)

**Files:**

- Modify: `lib/algorithms/floatingPcaV2/repairAudit.ts` (`hasDuplicateVersusUsefulSlotDefect`, imports at top)

- [x] **Step 2.1:** Import `teamHasMaterialRemainingFloatingPending` from `./duplicateRepairPolicy`.

- [x] **Step 2.2:** Replace the single guard:

```typescript
if (teamHasUsefulNonDuplicateSlot(state, otherTeam)) continue
```

with:

```typescript
if (
  teamHasUsefulNonDuplicateSlot(state, otherTeam) &&
  !teamHasMaterialRemainingFloatingPending(state.pendingFTE, otherTeam)
) {
  continue
}
```

- [x] **Step 2.3:** Add a short comment above referencing this plan file and the NSM/DRO scenario (“clean row but still ≥ 0.25 pending → do not skip”).

- [x] **Step 2.4:** Run full regression slice for Step 3.4 repair:

```bash
cd "/Users/alvin/Desktop/RBIP duty list web app" && node --test tests/regression/f70-step34-v2-core-duplicate-characterization.test.ts tests/regression/f81-step34-v2-true-duplicate-floating-engine-contract.test.ts tests/regression/f100-step34-ranked-gap-ignores-baseline-nonfloating-coverage.test.ts
```

Expected: all pass. If any fail, adjust predicate only if test expectation was encoding the **old** overly strict behavior—update test **only** when product intent clearly changes (document in commit body).

- [x] **Step 2.5:** Commit: `fix(floating-pca-v2): loosen A1 when recipient still has material pending`.

---

### Task 3: A1 candidates — peel recipient filter + short-team monotonicity

**Files:**

- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts` (`generateA1Candidates`)
- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts` — ensure `GenerateRepairCandidatesContext` already carries `pendingFTE` (it does per `allocator.ts` call site)

- [x] **Step 3.1:** Import `countTeamsMaterialShort`, `teamHasMaterialRemainingFloatingPending` from `./duplicateRepairPolicy`.

- [x] **Step 3.2:** At start of `generateA1Candidates`, capture:

```typescript
const shortBefore = countTeamsMaterialShort(context.pendingFTE)
```

(Implementation: `pendingForRepairGates = context.pendingFTE ?? context.initialPendingFTE` so short count matches current repair state when `pendingFTE` is omitted; see follow-up commit.)

- [x] **Step 3.3:** Inside the triple loop (`slot` / `allocation` / `rescueTeam`), **before** `buildCandidate`:

  - If `!teamHasMaterialRemainingFloatingPending(context.pendingFTE, rescueTeam)) continue`
  - After building a candidate allocation array, compute `candidatePendingFTE` with the existing in-file helper `computePendingFromAllocationsSnapshot(context.initialPendingFTE, baselineAssignedSlots, candidate.allocations)` — **note:** `generateA1Candidates` today has no `baselineAssignedSlots`; thread it through `GenerateRepairCandidatesContext` from `allocator.ts` (same source as `baselineAssignedSlots` already used when calling `computePendingFromAllocations` in the repair loop). If adding a field is too invasive, compute baseline counts once inside `generateRepairCandidates` and pass down—mirror `allocator.ts` lines 82–96 and the `baselineAssignedSlots` variable at call site.

- [x] **Step 3.4:** Reject candidate if `countTeamsMaterialShort(candidatePendingFTE) > shortBefore`.

- [x] **Step 3.5:** Add regression test `tests/regression/f133-step34-v2-a1-duplicate-relief-when-recipient-has-clean-slot-but-pending.test.ts` that builds:

  - Minimal `teamOrder`, `pcaPool`, `pcaPreferences`, `existingAllocations` / `initialPendingFTE` such that **without** the new gate A1 would not fire (simulate “has clean slot” + “still pending”)—assert `detectRankedV2RepairDefects` includes `{ kind: 'A1', team: '<duplicateTeam>' }` after draft or after a controlled pre-state.

  - Assert no candidate increases `countTeamsMaterialShort` when compared to pre-repair pending (invoke allocator or run repair candidate generator in isolation if easier).

  Use patterns from `tests/regression/f70-step34-v2-core-duplicate-characterization.test.ts` (`makePca`, `emptyTeamRecord`, preferences).

- [x] **Step 3.6:** Run:

```bash
node --test tests/regression/f133-step34-v2-a1-duplicate-relief-when-recipient-has-clean-slot-but-pending.test.ts
# or: npx tsx --test … (same as other Step 3.4 regression files)
```

- [x] **Step 3.7:** Commit: `fix(floating-pca-v2): gate A1 peels on recipient pending and short-team monotonicity` (+ `fix(floating-pca-v2): use same pending snapshot for A1 rescue filters` after review).

---

### Task 4: Swap-first — generate swap-shaped A1 candidates + tie-break

**Files:**

- Modify: `lib/algorithms/floatingPcaV2/repairMoves.ts`
- Modify: `lib/algorithms/floatingPcaV2/allocator.ts` (optional tie-break only)

**Design:** A **swap** means two `SlotOwnerUpdate` operations in one `buildCandidate` call (same pattern as `applyOneSlotSwap`): duplicate team gives slot `S` on PCA `X` to `rescueTeam`, and `rescueTeam` gives slot `T` on PCA `Y` back to `duplicateTeam`, preserving both teams’ total slot counts and often avoiding “shred” of aggregate coverage.

- [x] **Step 4.1:** In `generateA1Candidates`, after collecting single-move peels, add nested search:

  - For each duplicated `slot` on `duplicateTeam`, for each pair of distinct floating PCAs `(pDonor, pRecipient)` where `pDonor` holds `slot` for `duplicateTeam`, `pRecipient` holds `slotOther` for `rescueTeam`, `slotOther` useful for `duplicateTeam`, `slot` useful+open for `rescueTeam` per existing helpers (`isUsefulOpenSlotForTeam`, `isUsefulReplacementSlotForTeam`).

  - Build `buildCandidate('A1', sortKey, ..., [{ pDonor, slot, duplicateTeam→rescueTeam }, { pRecipient, slotOther, rescueTeam→duplicateTeam }], anchors)`.

  - Prefix `sortKey` with `a1:swap:` vs existing `a1:` peel prefix `a1:peel:` (rename existing for clarity).

- [x] **Step 4.2:** Apply same `shortBefore` / short-after monotonicity filter to swaps.

- [x] **Step 4.3:** In `allocator.ts` repair loop, extend the tie branch when `candidateVsBest === 0`:

  - Prefer `sortKey.startsWith('a1:swap:')` over `a1:peel:` (and over legacy `a1:` without prefix if any remain).

- [x] **Step 4.4:** Add `tests/regression/f134-step34-v2-a1-swap-prefer-over-peel-tiebreak.test.ts`:

  - Construct a tiny allocation set where **two** A1 candidates exist: one swap, one peel, **identical** `buildRankedSlotAllocationScore` outputs (force equality by symmetric pending/duplicate counts).

  - Call the same selection logic used by allocator (extract `pickBetterRepairCandidate(a,b)` to `repairMoveSelection.ts` **if** duplicating tie logic in tests is too brittle—optional).

  - Assert the accepted repair assignment list matches the swap.

- [x] **Step 4.5:** Run both new tests + f70:

```bash
node --test tests/regression/f133-step34-v2-a1-duplicate-relief-when-recipient-has-clean-slot-but-pending.test.ts tests/regression/f134-step34-v2-a1-swap-prefer-over-peel-tiebreak.test.ts tests/regression/f70-step34-v2-core-duplicate-characterization.test.ts
# or: npx tsx --test …
```

- [x] **Step 4.6:** Commit: `feat(floating-pca-v2): add A1 swap candidates and prefer swap on score ties` (follow-up: `fix(floating-pca-v2): order A1 repair candidates swap-before-peel for cap` — A1 `generateRepairCandidates` sort + bounded slice must not prefer lex order that drops swaps).

---

### Task 5: F1 regression guard + full Step 3.4 sweep

**Files:**

- Modify: pick one existing F1 test file (e.g. `tests/regression/f84-step34-v2-fairness-floor-prevents-zero-floating-when-bounded-rescue-exists.test.ts`) — add **one** assertion block OR add `tests/regression/f135-step34-v2-a1-relief-never-regresses-f1.test.ts` if cleaner

- [x] **Step 5.1:** Add test that runs allocator with a fixture where F1 is initially satisfiable; assert final `detectRankedV2RepairDefects` has **no** `F1` for teams that had meaningful initial pending. (`tests/regression/f135-step34-v2-a1-relief-never-regresses-f1.test.ts` — f133-style pool + full `allocateFloatingPCA_v2RankedSlot`, then F1 check per team with initial pending ≥ 0.25 after quarter round.)

- [x] **Step 5.2:** Run broader Step 3.4 regression glob:

```bash
node --test tests/regression/f7*-step34*.test.ts tests/regression/f8*-step34*.test.ts tests/regression/f10*-step34*.test.ts tests/regression/f11*-step34*.test.ts tests/regression/f12*-step34*.test.ts tests/regression/f13*-step34*.test.ts
```

Adjust glob if shell rejects; alternatively:

```bash
node --test tests/regression/f1*-step34-v2*.test.ts
```

- [x] **Step 5.3:** Commit: `test(floating-pca-v2): assert F1 floor under A1 relief`.

---

### Task 6: Manual / schedule-day verification (16/3)

**Files:** none (operational)

- [ ] **Step 6.1:** In UI or seed JSON used for integration, open schedule **2026-03-16** (user “16/3” test day).

- [ ] **Step 6.2:** Re-run Step 3.4; capture before/after: DRO duplicate depth on worst slot, NSM remaining pending (if surfaced in dev overlay), tracker pills.

- [ ] **Step 6.3:** Record outcome in `CHANGELOG_2.md` **only if** the repo already uses it for user-visible allocator changes (optional; skip if no user-facing release note requested).

---

## 4. Internal testing matrix (meticulous)

| Layer | What it proves | How |
|-------|----------------|-----|
| Unit | Pending thresholds, short-team counter | `duplicateRepairPolicy.test.ts` |
| Unit | Revised A1 gate in isolation | Export `hasDuplicateVersusUsefulSlotDefect` already exported? If not, test via `detectRankedV2RepairDefects` only |
| Regression | A1 fires with clean-slot + pending recipient | f133 |
| Regression | Swap beats peel on tie | f134 |
| Regression | Core duplicate + engine contracts unchanged | f70, f81 |
| Regression | F1 never worse when rescue exists | f84 / f135 |
| Manual | Real schedule day stress | Task 6 |

---

## 5. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Swaps invalid under `committedStep3Anchors` | Reuse `buildCandidate` / `committedAnchorsStillHold`; same as today’s A1 |
| Infinite oscillation between swap/peel | Bounded `MAX_REPAIR_ITERATIONS` unchanged; scores must strictly improve each accept |
| Over-aggressive peeling hurts duplicate team’s rank coverage | `donationWouldBreakDonorRankCoverage` already guards donations; peels from duplicate team must still be scored—**lexicographic** improvement ensures B1/F1 not regressed |
| Pending snapshot for filters | Reuse `computePendingFromAllocationsSnapshot` in `repairMoves.ts`; extend context with `baselineAssignedSlots` if missing from `GenerateRepairCandidatesContext` |

---

## 6. Self-review (writing-plans checklist)

**Spec coverage:** A1 loosening → Task 2. F1 preserved → Task 5. Swap-first → Task 4. Peel eligibility + no new short teams → Tasks 3–4. Score vector / sequencing → Tasks 3–4 + existing `compareScores`. Global testing → Section 4 + Task 6.

**Placeholder scan:** No TBD sections in task bodies above.

**Type consistency:** `Record<Team, number>` for pending matches `allocator` / `repairAudit` context.

---

## 7. Execution handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md`.

**Two execution options:**

1. **Subagent-driven (recommended)** — Fresh subagent per task, review between tasks; required skill: `superpowers:subagent-driven-development`.

2. **Inline execution** — Run tasks in one session with checkpoints; required skill: `superpowers:executing-plans`.

**Which approach?** (Reply in chat when you start implementation.)
