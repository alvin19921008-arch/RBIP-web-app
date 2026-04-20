# Surplus & extra-after-need revamp — editor intent handoff

**Status:** Draft for discussion — not implemented.  
**Audience:** Next agent / engineer settling technical design for revamping surplus-adjusted targets and Step 3.4 “extra after needs.”  
**Context:** Long design thread; product owner rejects treating **per-team `ceil(raw_gap / 0.25)` summed** as authoritative “discrete need” for surplus slack, and prefers an **aggregate slack (continuous)** story with **pool cross-check** and **owe-first** recipient selection. A **parallel product goal** is **anticipation**: editors should be able to **foresee** likely **extra post-need** placement **before** finishing Step 3, not only discover it after returning to the schedule.

---

## 1. Purpose of this document

### 1.1 Why this revamp exists (requirement scoop)

**Primary UX pain:** **Extra after needs** (Step 3.4 optional slots) often feels **unanticipated**. Editors run Step 3.0–3.4, then return to the **schedule page** and only then see “**oh — team X / team Y picked up extra post-need slots**.” During Step 3.0–3.4 there is **little or no signal** that those extras were coming. The requirement is to make that outcome **more predictable and visible earlier** in the flow — without pretending the allocator is deterministic in every edge case.

**Strategic intent:**

- **Anticipation / foresight** — Surface enough **slack FTE**, **pool executable slots**, and **aggregate qualification** (per the agreed rules in this doc) so an editor can **glance** and reason: *“we are / are not likely to place optional extras after basic need is met,”* and *which teams might be first in line* (owe-first vs tie).
- **Earlier surface (candidate):** **Step 3.1** — When editors review **rounding**, **raw Avg**, **raw floating** / operational targets, and pool story, that screen is a natural place to **preview** “headroom for optional extras” in **plain language + numbers**, aligned with the same **two mothers** (supply vs demand) vocabulary — not a second hidden pipeline.

**Relationship to today’s implementation:** The codebase currently uses **two pathways** that together produce “more coverage than the naive discrete need”:

1. **Surplus-adjusted targets** (Step 2→3 / bootstrap) — raises floating **targets** when executable slack allows.
2. **Post-need extra** (Step 3.4 allocator pass) — places optional slots **after** `allSatisfied`.

This revamp treats **both** as in scope for **fine-tuning** (especially surplus-adjusted, per thread) **and** for **unifying the editor mental model** so anticipation is not split across two opaque mechanisms.

### 1.2 What this document does

Capture **editor-facing rules** and **open technical questions** so implementation can be aligned with **how human editors reason about duty assignment**, not only with legacy formulas in code. The current codebase behavior is **reference material**, not the product authority, for this revamp.

---

## 2. Shared vocabulary (same dimension, phase matters)

### 2.1 “Belongs to a team”

Any slot assigned to a team — whether staffed by non-floating PCA, floating PCA, special-program–attributed rows, or floating covering non-floating — **counts on that team’s sheet** in FTE (`slots × 0.25`) when we talk about **what is already placed**.

### 2.2 `existingTeamPCAAssigned` (name stays; meaning is phase-specific)

The **same counting idea** applies at different snapshots:

| Phase | Intent |
|--------|--------|
| **Step 2 → Step 3 juncture** | Slots already on the team’s duty grid after Step 2 (non-floating, program-attributed slots as defined by product, substitutions, etc. per rules). |
| **End of Step 3.4** | All slots on the team after floating allocation completes — auditor uses this to reconcile **total** FTE on team. |

**Cross-check — metadata already in the codebase (partial):**

- **Step 2 → Step 3 handoff:** `computeStep3NonFloatingFteBreakdownByTeamFromAllocations` (`lib/features/schedule/step3Bootstrap.ts`) classifies **non-floating–side** coverage per team into **`Step3NonFloatingCoverageKind`**: `designated_non_floating_pca`, `substitution_for_non_floating`, `special_program_pca_slot`, `unclassified`. That answers “what is already on the sheet **before** Step 3 floating work” in **slices**, not only one scalar.
- **Step 3.4 tracker rows:** `SlotAssignmentLog` (`types/schedule.ts`) carries **`assignedIn`** (`'step30' | 'step32' | 'step33' | 'step34'`), **`isBufferAssignment`** (Step 3.0 buffer), **`upstreamCoverageKind`**, **`step3OwnershipKind`**, etc., so **which step** produced a slot and **what sat underneath** can be surfaced for tooltips / audit.
- **Staff row:** `Staff.floating` plus allocation rows still distinguish **which PCA row** is a floater vs designated non-floating when rolling up **FTE to a team**.

**Gap for the revamp UI/audit:** A single dashboard number **“floating PCA FTE assigned to this team today”** may still need an **explicit rollup** (sum over slots where `staff.floating === true` and slot points at team, excluding product rules for buffer / substitution) — the pieces exist; **product naming** should align with **slack FTE** vs **floating-only FTE** (see §3.3).

### 2.3 Quick mental shorthand (communication, not a code shortcut)

**`avg PCA/team − 1.0 FTE`** as “**roughly the floating-shaped portion**” works when the invariant holds: each team has **~1.0 FTE** of **non-floating *function*** on the sheet (including **floating PCA covering missing non-floating slots** — same **function**, different row). It is **not** a substitute for **literal slot counting** when the sheet has buffers, half-day, leave, or manual Step 3.0 buffer rules — those still resolve to **the same dimension**: demand vs supply on **slots × 0.25**.

**Explicit exclusions:** Product rules may exclude certain rows (e.g. buffer PCA assigned in Step 3.0) from “non-floating baseline” — specify in implementation.

---

## 3. Two mothers (supply vs demand) — editor model

### 3.1 Supply (pool)

- Built from **available floating PCA resource** after prior steps: continuous FTE → **executable quarter slots** (e.g. pool offers **N** slots at 0.25 FTE each).
- Rounding the **pool** to discrete slots MAY leave **continuous FTE dust** that does **not** form another 0.25 slot — that is acceptable; **this calculation does not require each team’s Avg** to sum the pool.

### 3.2 Demand (floating need per team)

- From each team’s **continuous** Avg PCA/team (or agreed operational target), derive **projected floating slots needed per team** after Step 2 (product rule: how to split total vs non-floating / program / “tag along” — **must be specified precisely** in implementation).
- Sum across teams → e.g. **5 slots** total floating demand vs **5 slots** pool → **balanced** in the simple case.

### 3.3 Slack FTE (prefer this name over “raw excess”)

**Why not “raw excess”:** the word **excess** biases toward “too much supply.” Here we want **demand minus supply** on the **same continuous FTE line** as Avg — i.e. **signed gap**, not “surplus” in the accounting sense.

**Recommended convention (total PCA on team vs continuous target):**

\[
\textbf{slackFTE}_{team} = \texttt{average\_pca\_per\_team} - \texttt{finalAssignedFTE}_{team}
\]

| Sign | Meaning (editor) |
|------|-------------------|
| **&gt; 0** | We still **owe** this team PCA vs the continuous target (**short**). |
| **&lt; 0** | We **over-assigned** vs the continuous target (**long**). |
| **= 0** | On target in continuous space (before any optional extra). |

**Worked examples (same numbers as discussion; signs corrected to this convention):**

| Team | Avg PCA/team (continuous) | Final assigned FTE (sheet) | Slack FTE | Meaning |
|------|---------------------------|----------------------------|-----------|---------|
| FO | 1.73 | 1.75 | **−0.02** | **Over-assigned** by 0.02 vs continuous target. |
| DRO | 1.77 | 1.75 | **+0.02** | We **owe** 0.02 FTE vs continuous target. |

**Note:** If you sketch **slack = assigned − target**, the signs flip; pick **one** convention in the product and keep UI, spec, and code aligned.

**Important:** Slack in **continuous** FTE is **not** automatically “one quarter slot of need” or “one quarter of spare”; avoid a **second** rounding (`ceil`/`nearest`) on top of this for **authoritative** discrete slot counts unless the revamp explicitly adopts that tier.

### 3.4 Supply chain — ground for discussion (pool narrative)

Use this ladder when aligning **continuous pool FTE** with **executable slots** (numbers are illustrative; implementation may differ):

1. **Total PCA FTE (continuous)** — roster / formula view of how much PCA **could** exist on the day (pre-grid).
2. **After Step 2 — available total PCA FTE (continuous)** — what remains assignable to teams / pool after Step 2 placement rules (non-floating, specials, substitutions, etc.).
3. **Convert to per-0.25 grid** — e.g. `roundDownToQuarter` / agreed rule so FTE snaps to the same grid as slots.
4. **After Step 2 — total available PCA slots** — e.g. sum of `min(FTE-in-quarters, remaining physical slots per PCA row)` → **N executable slots** for Step 3 floating work.

Steps **3–4** can leave **continuous dust** that does not become another **0.25** slot; that is **supply-side slack**, separate from **team slack FTE** in §3.3. This chain **does not require** each team’s Avg to build the pool total; it is the **supply mother** in isolation.

---

## 4. Rejected approach (product stance)

### 4.1 Per-team `ceil(raw_team / 0.25)` summed as “discrete needed slots”

**Rejected as authoritative** for surplus / headroom:

- A gap of **0.23 FTE** means “we are **0.23 FTE short** of target,” **not** “we **need 1 full slot**” in the editor’s sense.
- Applying **`ceil` per team** and **summing** introduces a **second layer of rounding** on top of Avg → slot projection and is read as **over-estimating true need** and inflating “demand” in `available − demand` slack math.

### 4.2 `redistributableSlackSlots = max(0, availableFloatingSlots − discreteNeededSlots)` with that `discreteNeededSlots`

If `discreteNeededSlots` is defined as in §4.1, this slack metric is **not accepted** as the editor-facing definition of **redistributable** slack.  
**Editor definition (intent):** redistributable slack should align with **aggregate slack qualification** (§5) and **pool truth**, not per-team ceiling sum.

---

## 5. Proposed aggregate rule for “one extra executable slot” (intent)

1. Compute **aggregate slack** — typically **sum of per-team slack FTE** under §3.3 (or sum of **positive** shortfalls only — **product choice**). Sign convention must match §3.3.
2. **If aggregate &lt; 0.25 FTE:** the bundle **does not qualify** for treating **one additional** 0.25 slot as “released” from this mechanism; **continue** with the existing demand portfolio (e.g. **5 slots** vs **5 slots** pool) — **no** extra-from-aggregate.
3. **If aggregate ≥ 0.25 FTE** (example **0.27**): the bundle **may** qualify for **one** extra quarter slot **if and only if** the **pool** still has **at least one** executable slot available after supply-side rounding (§3.4).
4. **If pool cannot** supply that slot: **not** a shortfall against meeting **team targets** under the agreed rules — targets are still met; the **extra** simply cannot be placed.

**Note:** This is **editor intent**; exact algebra (sum of which rows, whether negatives net against positives, floor vs sum-first) must be specified and tested against edge cases (many small positives, negatives, ties).

---

## 6. Who receives the extra slot (intent)

- **Default:** Not plain **round-robin** only.
- **Primary:** Among teams, assign to the team we **owe the most** under **current floating allocation** — operationalized as **maximum slack FTE** when slack is **positive** (shortfall), or an agreed **owe** metric aligned with §3.3.
- **Tie-break:** Round-robin or stable ordering **after** max-slack tie.
- **UX:** Surface **slack FTE** (or owe rank) to the **editor** so that when teams **tie**, the **user can choose** which team receives the extra slot (or confirm system tie-break).

---

## 7. Relationship to “extra after needs” (Step 3.4)

- **Extra after needs** should mean: **basic floating need satisfied**, then **optional** placement — aligned with **aggregate + pool** qualification in §5 when that is the chosen product rule.
- **Surplus-adjusted target** (raised target before / at Step 3 boundary) may need to be **re-derived** or **replaced** so it does not depend on **§4.1**-style discrete need — **technical design TBD**.

---

## 8. Open technical considerations (for the next agent)

1. **Formal definition** of per-team **slack FTE** vs `teamTargets` / `average_pca_per_team` and `existingTeamPCAAssigned` at **Step 2→3** vs **post–3.4** — including NSM-style cases (Avg &lt; 1.0 with 1.0 non-floating placed).
2. **Whether aggregate &lt; 0.25** blocks only “bonus” slot promotion or also affects surplus grants — **single vs two mechanisms**.
3. **Pool definition:** keep per-PCA `min(FTE quarters, slot geometry)` vs global pool FTE round — **must match** editor story in §3.1.
4. **Interaction with** therapist-weighted surplus distribution in existing V2 — **replace, gate, or reconcile**.
5. **Allocator changes:** extra pass recipient order (max owe), optional **editor override UI**, tests for ties.
6. **Migration / parity:** schedule editors who relied on old scarcity numbers — **communication and feature flag**.
7. **Help copy** (`help/avg-and-slots` and tooltips) — rewrite after spec locks.
8. **Step 3.1 anticipation UX:** What to show while editors **glance** at **raw Avg**, **rounding**, **raw / rounded floating**, and pool summary — so **likely post-need extra** vs **surplus-adjusted** story is **legible before** Step 3.2–3.4 (copy, thresholds, optional “preview” line tied to §3.3–§5).

---

## 9. Non-goals in this handoff

- Defending the current implementation as correct for editors.
- Implementing code in this document.

---

## 10. Reference (implementation archaeology only)

- `lib/features/schedule/step3Bootstrap.ts` — `Step3NonFloatingCoverageKind`, `computeStep3NonFloatingFteBreakdownByTeamFromAllocations`, current `discreteNeededSlots`, `redistributableSlackSlots`, surplus grants.
- `types/schedule.ts` — `SlotAssignmentLog`, `TeamAllocationLog`.
- `lib/algorithms/floatingPcaV2/allocator.ts` — extra coverage round-robin after `allSatisfied`.

These files describe **today’s behavior**; revamp should **re-read** them when writing the new spec and migration plan.

---

*Drafted from product/editor thread — 2026-04-18.*
