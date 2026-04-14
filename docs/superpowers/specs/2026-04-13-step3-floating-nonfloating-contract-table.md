# Step 3 floating / non-floating contract (common ground)

> **Purpose:** Single glossary for product language and data fields used on the dashboard and Step 3 (especially **3.1**). Aligns specs, projection types, and UI labels. Vocabulary is **floating** vs **non-floating** only — avoid mixing in “operational” unless a doc explicitly bridges to legacy code names.

**Related:** Part 1 projection work — [2026-04-13-step3-contract-reset-part1-projection-unification-implementation-plan.md](../plans/2026-04-13-step3-contract-reset-part1-projection-unification-implementation-plan.md). Surplus mechanics — [2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md](./2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md). **In-app** plain-language guide for staff: route `/help/avg-and-slots` (Help Center → Guides).

**Staff-facing UI (English):** Use **Raised target** / **Raised target (shared spare)** and **Extra after needs** in toasts, Help, popovers, and tracker labels. Engineering prose may still say *surplus-adjusted* / *post-need extra*; map to the approved deck in the surplus spec **Locked decision 2**.

---

## Contract table

| Field | Definition | Example | Produced by / consumed by | Editable in which steps |
|-------|------------|---------|---------------------------|-------------------------|
| **Avg** | Canonical **raw** average PCA per team for **display** and as the **base** for deriving **raw floating** (`Avg − non-floating`). One number reused across Step 1 / 2 / 3 surfaces that show “Avg PCA/team”. **Not** the surplus-inflated operational floating target. | `1.35` | **Produced:** Step 1 / Step 2 workflow (`calculations` / merged team targets). **Consumed:** dashboard, Step 3.1 card, projection `displayTargetByTeam`. | **Step 1–2** only for changes to this scalar. Step 3.1 edits **pending floating** / fairness floor; **do not** rewrite **Avg** to absorb V2 surplus grants (those live on operational projection fields). |
| **Non-floating FTE** | FTE on the team from **Step 2** assignments that count as non-floating coverage (slots filled by designated non-floating PCAs per product rules). Used only as **FTE sum** for the gap formula until richer typing lands. | `1.00` | **Produced:** Step 2 allocations + reconciliation rules (substitution, special program, invalid slots). **Consumed:** Step 3.1 breakdown row “Non-floating”; input to **raw floating**. | **Step 2 only** for assignment changes. **Read-only** on Step 3.1 (display). |
| **Raw floating** | Continuous gap: **Avg − non-floating FTE**, before any quarter rounding. Conceptually `max(0, …)` when the UI must not show negative need. | `0.35` (= 1.35 − 1.00) | **Derived** whenever Avg or non-floating changes. **Consumed:** Step 3.1 “Raw floating” row; input to **rounded floating**. | **Never** edited directly. |
| **Rounded floating** | Quarter rounding of **raw floating only**, using `roundToNearestQuarterWithMidpoint` (same class as pending checks per architecture essentials). Explains e.g. 0.35 → 0.25. | `0.25` | **Derived** from raw floating. **Consumed:** Step 3.1 label **“Rounded floating”** (bridge row); initial seed for **pending floating** when dialog opens. | **Never** edited directly; user edits **pending floating** with ±. |
| **Pending floating** | The **fixed** quarter floating need for this team **after** Step 3.1 (order + ±). This is what Steps **3.2–3.4** treat as the target floating obligation for the team unless the user returns to 3.1. | `0.25` (may differ from rounded floating after ±) | **Produced:** Step 3.1 state (`adjustedFTE` / saved handoff). **Consumed:** allocator `currentPendingFTE`, tracker, scarcity previews. | **Step 3.1 only** (± and tie reorder). **Locked** from Step 3.2 through 3.4 unless user navigates back to 3.1. |
| **Assigned floating** | Sum of **floating** PCA FTE actually placed on the team in Step **3.2–3.4** (committed slots). | `0.00` → `0.25` per slot | **Produced:** Step 3.2 / 3.3 / 3.4 commits. **Consumed:** UI “Assigned floating” copy, tracker rows. | **Dynamic**; not typed in 3.1 as a separate control. |
| **Remaining pending** | **Pending floating − assigned floating** (quarter FTE, clamp at ≥ 0). Tracks what the pool still owes the team for **floating** coverage this run. | `0.25` → `0.00` | **Derived** during 3.2–3.4 from pending + assignments. **Consumed:** tracker, Step 3.4 panels, validation. | **Dynamic** only; resets if user returns to 3.1 and changes **pending floating**. |

---

## Surplus (raw coherence)

- **Raw floating** is always **Avg − non-floating** in **continuous** space, **before** quarter rounding.
- When **surplus** exists (V2 bootstrap / grants), treat surplus as **raw FTE in the same class as Avg**: fold surplus into the **canonical raw requirement** first (e.g. adjust the scalar that acts as **Avg** for derivation), **then** recompute **raw floating** and **rounded floating**. Avoid combining raw gap with a pre-rounded “pie” — keep **apple + apple** in raw space, then apply quarter rules to **floating** only for **rounded floating** / **pending floating**.
- **Display vs engine:** The **dashboard / Step 3.1 “Avg” row** stays the **raw** therapist-weighted **display** target (unified projection `displayTargetByTeam`); regression `f113` locks this. **Surplus grants** apply on the **operational floating-target** layer inside the projection (e.g. rounded surplus-adjusted targets / pending seeds), **not** by silently rewriting that visible **Avg** number. See **“Why surplus after Step 2”** in `2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md`.

---

## Non-floating display vs typing (substitution / absence)

- **Product default:** Step 3.1 often still **displays** `1.00` non-floating when the team is staffed as a full non-floating complement.
- **Reality:** Non-floating may be **missing** on a slot; **floating** or substitution-like coverage can backfill. A **naïve headcount** can hide bugs (wrong gap, wrong raw floating).
- **Spec direction:** Persist or compute **non-floating FTE** from **typed** sources (e.g. which allocations count as non-floating vs substitution vs special-program for this card), not only “number of PCAs”. Implementation can phase: **display** stays friendly; **engine** uses explicit classification aligned with Step 2 algorithms and `staffOverrides`.

---

## Code / projection alignment (migration note)

Until types are renamed, legacy names may not match this glossary:

| This doc | Typical legacy / code smell |
|----------|-----------------------------|
| **Avg** | `displayTargetByTeam`, `teamTargets` in bootstrap, `calculations[].average_pca_per_team` when unified |
| **Rounded floating** | Must **not** be the same as `round(Avg)` **team total** if that differs from `round(raw floating)`; today some fields mixed “team quarter target” with “floating” in the name |
| **Pending floating** | Bootstrap `pendingByTeam` at open; dialog `adjustedFTE` after 3.1 edits |
| **Non-floating FTE** | `existingAssignedByTeam` for the Step 3.1 scalar; attributed slices in `nonFloatingFteBreakdownByTeam` (`Step3NonFloatingCoverageKind`) from `computeStep3NonFloatingFteBreakdownByTeamFromAllocations` / `computeStep3BootstrapState` (sums should match the scalar per team when inputs align). |

Agents should treat **this table** as the **product source of truth** when updating Step 3.1 copy, projection builders, and tests.

---

## V2 surplus / projection field glossary (code names)

Stable **TypeScript / bootstrap** names stay as implemented unless a focused refactor is explicitly approved; use this table when writing UI copy or cross-linking specs. See the worked example and **Continuous surplus vs discrete grants** in `2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md`.

| Code / spec field | Meaning |
|-------------------|--------|
| `rawSurplusFte` | Continuous surplus for **weighting** ideal shares (not slot output by itself). |
| `idealWeightedSurplusShareByTeam` | Fair share of `rawSurplusFte` per team before the slot cap. |
| `redistributableSlackSlots` | **Integer** max quarter-slots that can be **realized** in this pass; **not** “round(`rawSurplusFte` / 0.25)” as the policy definition. |
| `realizedSurplusSlotGrantsByTeam` | Per-team **0.25** FTE grants after cap + reconciliation. |
| `surplusAdjustedTeamTargets` | Continuous targets after grants, before final quarter rounding. |
| `roundedAdjustedTeamTargets` | Quarter-grid **operational** team targets after surplus + rounding + reconciliation. |

---

## Step 3.1 UI label mapping (target)

| Row label (UI) | Contract field |
|----------------|----------------|
| Avg | **Avg** |
| Raw floating | **Raw floating** |
| Rounded floating | **Rounded floating** (not “Rounded” alone) |
| Non-floating | **Non-floating FTE** |
| Pending floating (hero) | **Pending floating** |
| Assigned floating (later steps / legend) | **Assigned floating** |
| Remaining pending (dynamic) | **Remaining pending** |
