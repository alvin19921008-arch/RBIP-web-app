# Floating PCA V2 — Bounded donor relief after B1 strip (2nd-layer rebalance) implementation plan

> **For agentic workers:** Pair with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. **Prerequisite:** A1 global duplicate repair work in `2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md` (policy, `generateA1Candidates`, monotonicity) should be in place or implemented in the same branch so relief logic reuses the same hooks.

**Goal:** After a **single-sided** ranked repair (notably plain **`b1:donate`**) that **removes a true Step 3 floating cell** from a **donor** team to satisfy another team’s B1, introduce a **bounded, second-layer** mechanism so the allocator **preferentially** considers **A1-style** (duplicate / “emitter”) relief that **backfills the donor** or otherwise **mitigates** that loss—**without** blocking the first B1 (sacrifice-for-gain is intentional: e.g. NSM → CPPC to improve ranked slot and/or lift CPPC from **zero** floating assignments). The total floating PCA **resource is fixed** (basket analogy: only **reallocation**); on difficult days (e.g. 2026-03-16) **some** team may still end short; this plan **does not** guarantee full coverage for everyone—it **reduces** unnecessary donor pain when **another** team can **emit** a slot the system was going to fix anyway (duplicates, and optionally other “emit” families in a later iteration).

**Architecture:** Extend `runRepairLoop` in `lib/algorithms/floatingPcaV2/allocator.ts` to record **donor loss events** from accepted B1 **donate** moves. For a **limited** number of subsequent candidate evaluations (see **Bounds**), apply a **narrow scoring or tie-break preference** so **A1** candidates that **peel to the deprived donor** (or reduce duplicate on a donor-targeted path—exact predicate in tasks) **compete fairly or win ties** against moves that would ignore the donor. **Do not** add global “block donor” rules in `generateB1Candidates` (that was a debug-era dead end). Prefer **allocator-local** state + existing `compareScores` / `shouldPreferFirstRepairOnScoreTie` over a hard two-phase “all B1 then all A1” pass, to avoid large interaction surface with A2/F1/caps and to reduce “round 2 undoes round 1” risk (mitigated by scoping the boost to **A1 family** and **one shot** or **one accept** per trigger—see **Risks**).

**Tech stack:** TypeScript, existing v2 repair pipeline, `node --test` / `npx tsx` regression style under `tests/regression/`.

---

## 0. Product narrative (lock intent for reviewers)

1. **Fixed pie:** Floating PCA minutes/slots are a **dead-fixed** total; repair only **moves** assignments between teams (baskets).
2. **Intended sacrifice:** A **strip** (donate / single-sided move) **removes** the donor’s hold on that cell. That can be **worth it**: e.g. give CPPC a **highest-ranked** slot and/or rescue CPPC from **0** floating rows.
3. **Second layer:** If we then **peel** from a **different** team that has **duplicate (or similar “emit”)** pressure, we **rebalance** the donor at **low marginal cost** (we often “needed” to clean that duplicate anyway).
4. **Honesty:** On some days, **at least one** team may remain short; **bounded** relief prevents infinite peel loops and must respect existing `MAX_REPAIR_ITERATIONS`.

---

## 1. Requirements traceability (spec → work)

| Requirement | Where it lands |
|---------------|----------------|
| Do **not** prevent B1 `b1:donate` when `teamCanDonateBoundedly` and score say yes | **No** new blocks in `generateB1Candidates` for donor identity |
| After an accepted **single-sided B1 donation**, remember **fromTeam** (donor) and optionally **slot/pca** | `allocator.ts`: inspect `bestCandidate` `repairAssignments` + `sortKey` / `reason` |
| Next repair steps **favor** A1 relief that **helps the deprived donor** when it ties or is close on `compareScores` | `allocator.ts` tie-break and/or `repairMoveSelection.ts`; **optional** small duplicate-tier nuance in `scoreSchedule.ts` only if tie-break is insufficient |
| **Bounded:** clear relief state after **one** accepted A1 (or after **one** full inner loop over defects), and **no more than N** boosted iterations (recommend `N = 1` for v1) | `allocator.ts` counter / flag |
| **No** worse material-short count for peel (reuse A1 monotonicity) | Existing `generateA1Candidates` + `countTeamsMaterialShort` (see A1 plan) |
| Swaps and **`b1:move`** are **not** triggers; only **`b1:donate`**. (`b1:move` can behave like a partial re-home / swap; avoids paradox / oscillation with relief) | **§2**; no trigger on `b1:move` |
| Queue at most **3** donate-donors; **priority** among them (1st: worse **remaining ranked** true Step-3; 2nd: **material** short; 3rd: stable order) | `allocator` + audit-derived donor priority key; see **§2 Donor stack** |

---

## 2. Definitions (lock in code + tests)

**Single-sided B1 loss (v1 trigger):** The accepted repair is B1 and the **primary** move is **`b1:donate:…`** (sortKey prefix `b1:donate:`), *or* equivalent unambiguous single-sided strip if the code introduces another sortKey pattern—**v1: `b1:donate` only**.

**Trigger scope (v1, locked product choice):** Only **`b1:donate`** counts as a donor-loss event. Do **not** use **`b1:move`** as a trigger: moves often resemble **re-home** the donor onto another empty slot and are closer to **swap-like** two-sided rebalancing; treating them as “deprived” risks **oscillation / paradox** with the relief pass. **`b1:swap`** is already out of scope (two-sided).

**Deprived donor (single event):** The `fromTeam` on the donate edge (e.g. NSM). When several donates happen before relief fires, use a **bounded multi-donor list** (see **Donor stack**), not a single `deprivedDonor` overwrite—unless the implementation is explicitly single-donor v0.

**Donor “defect” (term clarification):** This is **not** the same as `B1` / `A1` from `detectRankedV2RepairDefects` (though a donor *may* also have those). For **priority among donors**, use a **deprivation / remaining-coverage** audit **after** the loss: e.g. which **ranked preference** slots the donor still covers with **true** Step 3 rows. That drives **who needs relief more urgently**.

**Donor stack (multi-donate, recommended):**

- **Cap:** At most **`DONOR_RELIEF_MAX_QUEUED_DONORS = 3`**. Pushing a fourth donor **evicts in FIFO** (drop oldest) *or* **re-sorts the whole set** (see **Priority**); **recommend v1: re-sort the capped list** after every `b1:donate` accept so the **next** A1 relief tie always targets the **highest-priority** donor, not time order alone.
- **Why cap:** Prevents an **ever-growing donor–repair** tail and matches “we cannot engage in a forever donor-repair loop” (together with `MAX_REPAIR_ITERATIONS` and monotonicity).

**Priority among queued donors (when an A1 peel can only help one `rescueTeam` on tie / relief choice):**

1. **1st tier — remaining ranked quality (worse first):** Prefer relieving the donor whose **current** (post-donate) true Step-3 **remaining** profile is **worse**—align with product intent, e.g. if **NSM** is left with coverage only in **unranked / non-preferred** slots and **FO** still holds a **highest ranked** true slot, **NSM is higher priority** for “peel **to** this donor” than FO. **Implementation** should reuse **ranked / audit helpers** (same family as `repairAudit`: true Step-3 on ranked set, `teamPrefs.rankedSlots`, etc.) to compute a **scalar or tuple key** (document exact key in code: e.g. `missingRankedCount`, then `best remaining ranked index`).
2. **2nd tier — if still tied:** e.g. **material shortness** (`roundToNearestQuarterWithMidpoint` pending) **higher** need first, using the same quarter semantics as A1 / `duplicateRepairPolicy` (higher **remaining** pending = more need).
3. **3rd — deterministic tie:** stable team name order (localeCompare) so tests are stable.

**Relief candidate (v1):** An A1 **peel** (or A1 **swap** if it exists and scores equal—reuse swap-first) where the **recipient** of the peeled true slot is one of the **queued** deprived donors, **prefer the highest-priority** donor per **Priority** when multiple `a1:peel:...->DonorX` are otherwise tied on `compareScores` (`rescueTeam === that donor` in `a1:peel` sortKey convention).

**Boosted evaluation window:** While `donorReliefContext` is active, on **exact** `compareScores` **equality** (and only then—**never** override a strictly better score), **prefer** (in order) A1 relief **to the best-ranked donor in the queue** over A1 to a lower-priority donor, over other A1, over unrelated work. Exact ordering must be **deterministic** and **unit-testable**.

**Bounds (recommended defaults):**

- **Boost window (locked):** **Per-iteration.** While evaluating candidates in **one** outer `runRepairLoop` iteration (one full pass over `sortDefects` and candidate sets), the donor-relief tie-break is **in effect** for that **single** choice of `bestCandidate`. After the iteration applies that repair (or exits with `!bestCandidate`), the **next** iteration is a **fresh** scoring pass; whether relief applies again depends on the **still-queued** donors and any new `b1:donate`. This matches **today’s** allocator shape: **at most one** accept per iteration, so the relief bias applies to the **entire** comparison for **that** pick—not to arbitrary future moves in the same iteration. **Do not** use “clear the instant any repair accepts” as a *separate* rule; **per-iteration** subsumes it for this loop.
- `DONOR_RELIEF_MAX_QUEUED_DONORS = 3` (see **Donor stack**).
- Clear or pop donors when: an A1 (or defined relief) **successfully** targets a donor (implementation choice: remove that donor only vs clear entire queue on any accept—**recommend:** remove only the **served** donor, keep the rest of the cap-3 list).

---

## 3. File map (anticipated)

| File | Responsibility |
|------|-----------------|
| `lib/algorithms/floatingPcaV2/allocator.ts` | Set/clear `donorReliefContext` from `b1:donate` accepts; plumb into candidate comparison |
| `lib/algorithms/floatingPcaV2/repairMoveSelection.ts` | Extend `shouldPreferFirstRepairOnScoreTie` (or new helper) with `donorReliefTieBreak(sortKey, deprivedDonor, defectKinds)` |
| `lib/algorithms/floatingPcaV2/repairMoves.ts` | *Optional:* tag or prefix sortKey for A1 “to donor” (if not inferable) — only if existing `a1:peel:...` is insufficient |
| `lib/algorithms/floatingPcaV2/donorReliefPolicy.ts` (**create, optional**) | Pure: parse `b1:donate` / `a1:peel` sortKeys, `isReliefToDeprivedDonor(...)` for tests |
| `tests/regression/f137-step34-v2-bounded-donor-relief-a1-peel-tie.test.ts` (**create**) | Tie-break unit path: A1 peel to priority donor wins vs other peel at score tie (f136 id taken elsewhere) |
| `tests/unit/floatingPcaV2/donorReliefPolicy.test.ts` (**create, optional**) | String predicate tests |

---

## 4. Tasks

### Task 1: Pure helpers for detection + unit tests (optional but recommended)

- [x] **Step 1.1:** Add `donorReliefPolicy.ts` (or local helpers in `repairMoveSelection.ts` if tiny) with:

  - `isB1DonateSortKey(sortKey: string): boolean` (`sortKey.startsWith` match for `b1:donate:`)
  - `parseB1DonateFromTeam(sortKey: string): Team | null` (parse `…:{from}->{to}` segment—match `generateB1Candidates` format exactly)
  - `isA1PeelToTeam(sortKey: string, team: Team): boolean` (match `a1:peel:` convention)

- [x] **Step 1.2:** Unit tests: valid/invalid strings; **must** stay in sync with `repairMoves.ts` sortKey templates.

- [x] **Step 1.3:** `npm` / `npx tsx` run unit tests; all pass.

---

### Task 2: Allocator state machine

(See **§2 Donor stack** and **§7**: **capped queue** of at most 3 donate-donors, **re-sorted** by **priority** after each `b1:donate`—not only a single `deprivedDonorTeam` unless you ship a deliberate v0.)

- [x] **Step 2.1:** In `runRepairLoop`, on **apply** of a B1 `b1:donate` (inspect `sortKey` / `repairAssignments`):
  - Parse `fromTeam`; push into a **queue** (cap 3, evict or re-sort per **§2**), **recompute** each queued donor’s **deprivation** key (remaining ranked true Step-3, then **§2** 2nd tier material) for ordering.

- [x] **Step 2.2:** **Per-iteration boost** (see **§2 Bounds**): while evaluating the **current** outer iteration’s candidates, if the queue is non-empty, set `donorReliefActive` (or equivalent) so tie-break runs; **end of iteration** (after one `bestCandidate` applied, or `!bestCandidate` → break) treat as one **pass**; next iteration starts from **new** defects/state (queue may still hold donors not yet relieved).

- [x] **Step 2.3:** If parse of donor fails, skip push (fail-safe). On successful A1 relief to a **queued** donor, **pop** that donor (per **§2** recommendation).

---

### Task 3: Tie-break / preference integration

- [x] **Step 3.1:** When `donorRelief` is **active** (queue non-empty) and `compareScores` returns `0`, use **extended** tie order:
  1. A1 peel **to** the **highest-priority** team in the donor **queue** (per **§2** priority) among ties—`isA1PeelToTeam` + `sortKey` / reason
  2. Then other A1 peels / existing `shouldPreferFirstRepairOnScoreTie` for the rest
  3. Document the full order in a code comment

- [x] **Step 3.2:** If `compareScores` is **not** 0, **do not** override a strictly better score (preserves monotonicity of the global repair loop).

- [x] **Step 3.3:** Consider whether **slightly worse** duplicate tier is allowed—**default v1: no** (only tie-break).

---

### Task 4: Regression + manual

- [x] **Step 4.1:** Add `f136` (or next free id) fixture with minimal PCAs/teams: force `b1:donate` then a situation where two candidates **tie** on score; assert A1 to donor is picked when boost active.

- [ ] **Step 4.2:** Manual: 2026-03-16 (or export) — B1 donates, subsequent iteration tends toward DRO → NSM peel if ties occur (qualitative; log optional **off** in prod).

---

### Task 5: Self-review and handoff

- [x] **Step 5.1:** Confirm `MAX_REPAIR_ITERATIONS` still prevents infinite loop; relief does not add new iterations by itself.

- [x] **Step 5.2:** `CHANGELOG_2.md` or internal changelog entry one line (if project practice).

---

## 5. Testing matrix

| Layer | Proves | How |
|-------|--------|-----|
| Unit | sortKey parse / relief predicate | `donorReliefPolicy.test.ts` |
| Regression | Tie: A1 to deprived donor **wins** when boost on | `f137-step34-v2-bounded-donor-relief-a1-peel-tie.test.ts` (f136 id taken) |
| Regression | B1 donate **not** blocked | Re-run f98, f101; no regression |
| Manual | 16/3 | Eyeball: donor gets follow-up A1 when eligible |

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| “Un-repair” 1st move | Only **tie** break or **next**-iteration preference; **never** accept worse global score; scope to A1 + deprived donor |
| Over-prefer A1, hurt B1 for others | **Per-iteration** boost; queue cap 3; never override strictly better `compareScores` |
| `sortKey` drift | Centralize parse in one module; unit tests on template strings |
| Gym / G1 overlap | v1: **A1 only**; document G1 as future if needed |
| **Some team always short** on bad days | Document as **acknowledged** product limit; this plan **mitigates**, not eliminates |

---

## 7. Resolved product choices (stakeholder, 2026-04-25)

| Topic | Decision | Notes |
|------|------------|--------|
| **`b1:move` as trigger?** | **No. Only `b1:donate`**. | Move paths can look like **re-home** / **swap-like** two-sided rebalancing; wiring “deprived donor” on move risks **opposing** the relief pass and a **paradoxical loop** (sacrifice for gain vs. “we owe you a peel”). |
| **Several donors in a row (e.g. NSM then FO)** | **Yes: capped queue of donors**, not “only last wins.” | Each donor is tagged by a **deprivation** metric (see **§2 “Donor defect”**): not the same as global repair `B1`/`A1` defects, but teams may have those too. **Priority 1st tier:** who is **worse off after losing** a slot by **remaining true Step-3 ranked coverage** (e.g. NSM left with only **unranked** remaining slot vs FO still holding a **1st ranked** true slot → **NSM** is higher priority for the next A1 “peel to donor” tie). **2nd tier:** e.g. **material shortness** (quarter-pending) if still tied. **Cap:** max **3** donors in the queue; **re-sort** after each donate so the **highest-need** donor is always the relief tie target (or FIFO-evict-oldest on overflow—recommend re-sort, see **§2**). |
| **“Forever donor–repair”** | Rejected as a goal. | **Cap-3** + `MAX_REPAIR_ITERATIONS` + A1 monotonicity + (typically) **pop** one donor from the queue when they receive relief—prevents an open-ended donor tail. |
| **0 rows for requester (e.g. CPPC)** | Stays in **B1** / existing score. | This plan does **not** add a new “0-row tier”; re-check only if a gap is found in implementation. **Open:** optional audit later. |
| **Boost window** | **Per-iteration** (see **§2 Bounds**). | Ties the relief tie-break to **one** `bestCandidate` search pass; next iteration re-evaluates. Aligns with current one-accept-per-iteration repair loop. |

---

## 8. Execution handoff

**Plan location:** `docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-rebalance-plan.md`.

**Primary execution path:** `superpowers:subagent-driven-development` — use **`docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-orchestrator-handoff-prompt.md`** (Composer 2 only: implementer → gates → code reviewer → fixer).

**Alternative (single stream):** `superpowers:executing-plans` is fine if the human runs Tasks 1–5 in one session without the orchestration loop.

**Reference:** A1 global plan — `docs/superpowers/plans/2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md`.

**Locked:** per-iteration boost (see **§2**, **§7**). **`b1:move` trigger:** **No** (locked; **§2**, **§7**).

**Notes (orchestration, 2026-04-25):** IMPLEMENTER (Composer 2) shipped `donorReliefPolicy.ts`, allocator queue + `repairAudit` / `repairMoveSelection` wiring, `f137` regression, unit tests, `CHANGELOG_2.md`. Gates on orchestrator host: `npm run lint` / `npm run build` exit 0; `npm run test:smoke` 12 passed / 4 skipped; `npx tsx --test` for f98, f101, f134, f137, `donorReliefPolicy.test.ts` all pass. CODE REVIEWER: **PASS with non-blocking notes** (no FIXER cycle). Step **4.2** manual spot-check remains open.
