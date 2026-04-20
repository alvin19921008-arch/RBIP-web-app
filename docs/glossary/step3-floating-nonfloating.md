# Glossary: Step 3 floating vs non-floating

> **Purpose:** Single reference for **product language** and **data fields** used on the dashboard and Step 3 (especially **3.1**). Aligns projection types, UI labels, and tests. Vocabulary is **floating** vs **non-floating** only — avoid mixing in “operational” unless a document explicitly bridges to legacy code names.

> **Where this lives:** `docs/glossary/step3-floating-nonfloating.md` — long-form team + engineer reference. The Cursor rule [ARCHITECTURE_ESSENTIALS.mdc](../../.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc) links here for agents (short “Step 3 projection” summary stays in that rule).

**Related documentation**

- Part 1 projection work — [Step 3 contract reset (projection) plan](../superpowers/plans/2026-04-13-step3-contract-reset-part1-projection-unification-implementation-plan.md)
- Surplus mechanics — [V2 Step 3 surplus / ranked swap design](../superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md)
- **In-app** staff guide: route `/help/avg-and-slots` (Help Center → Guides)

**Staff-facing UI (English):** Use **Extra after needs** (budgeted optional slots in Step 3.4). The legacy **Raised target (shared spare)** surplus-grant pathway has been **removed**; do not introduce new copy for it.

---

## Core terms (field table)

| Field | Definition | Example | Produced by / consumed by | Editable in which steps |
|-------|------------|---------|---------------------------|-------------------------|
| **Avg** | Canonical **raw** average PCA per team for **display** and as the **base** for deriving **raw floating** (`Avg – non-floating`). One number reused across Step 1 / 2 / 3 surfaces that show “Avg PCA/team”. **Not** the surplus-inflated operational floating target. | `1.35` | **Produced:** Step 1 / Step 2 workflow (`calculations` / merged team targets). **Consumed:** dashboard, Step 3.1 card, projection `displayTargetByTeam`. | **Step 1–2** only for changes to this scalar. Step 3.1 edits **pending floating** / fairness floor; **do not** rewrite **Avg** to absorb V2 surplus grants (those live on operational projection fields). |
| **Non-floating FTE** | FTE on the team from **Step 2** assignments that count as non-floating coverage (slots filled by designated non-floating PCAs per product rules). Used only as **FTE sum** for the gap formula until richer typing lands. | `1.00` | **Produced:** Step 2 allocations + reconciliation rules (substitution, special program, invalid slots). **Consumed:** Step 3.1 breakdown row “Non-floating”; input to **raw floating**. | **Step 2 only** for assignment changes. **Read-only** on Step 3.1 (display). |
| **Raw floating** | **Avg – non-floating PCA** in continuous space, **before** quarter rounding. Conceptually `max(0, …)` when the UI must not show negative need. | `0.35` (= 1.35 − 1.00) | **Derived** whenever Avg or non-floating changes. **Consumed:** Step 3.1 “Raw floating” row; input to **rounded floating**. | **Never** edited directly. |
| **Rounded floating** | Round **raw floating** to the nearest **0.25** FTE (`roundToNearestQuarterWithMidpoint`, same class as pending checks per architecture essentials). Explains e.g. 0.35 → 0.25. **Editable in Step 3.1** only indirectly: ± on **pending floating** moves this by the same quarter step; **fixed from Step 3.2 onward** until the user returns to Step 3.1. | `0.25` | **Derived** from projection/bootstrap at open; updated with pending in 3.1. **Consumed:** Step 3.1 “Rounded floating” row; seed for **pending floating** when the dialog opens. | **Not** typed as its own control; moves with **pending floating** ± in 3.1. |
| **Pending floating** | The **fixed** quarter floating need for this team **after** Step 3.1 (order + ±). This is what Steps **3.2–3.4** treat as the target floating obligation for the team unless the user returns to 3.1. | `0.25` (may differ from rounded floating after ±) | **Produced:** Step 3.1 state (`adjustedFTE` / saved handoff). **Consumed:** allocator `currentPendingFTE`, tracker, scarcity previews. | **Step 3.1 only** (± and tie reorder). **Locked** from Step 3.2 through 3.4 unless user navigates back to 3.1. |
| **Assigned floating** | Sum of **floating** PCA FTE actually placed on the team in Step **3.2–3.4** (committed slots). | `0.00` → `0.25` per slot | **Produced:** Step 3.2 / 3.3 / 3.4 commits. **Consumed:** UI “Assigned floating” copy, tracker rows. | **Dynamic**; not typed in 3.1 as a separate control. |
| **Remaining pending** | **Pending floating − assigned floating** (quarter FTE, clamp at ≥ 0). Tracks what the pool still owes the team for **floating** coverage this run. | `0.25` → `0.00` | **Derived** during 3.2–3.4 from pending + assignments. **Consumed:** tracker, Step 3.4 panels, validation. | **Dynamic** only; resets if user returns to 3.1 and changes **pending floating**. |

---

## Step 3.1 UI label mapping

| Row label (UI) | Glossary field |
|----------------|----------------|
| Avg | **Avg** |
| Raw floating | **Raw floating** |
| Rounded floating | **Rounded floating** (not “Rounded” alone) |
| Non-floating | **Non-floating FTE** |
| Pending floating (hero) | **Pending floating** |
| Assigned floating (later steps / legend) | **Assigned floating** |
| Remaining pending (dynamic) | **Remaining pending** |

---

## Bootstrap pending (V2)

- **Raw floating** is always **Avg – non-floating** in **continuous** space, **before** quarter rounding.
- **V2** `pendingByTeam` at bootstrap uses **quarter-rounded gap**: `roundToNearestQuarterWithMidpoint(max(0, Avg − existingAssigned))` per team (no surplus grants).
- **Display:** The **dashboard / Step 3.1 “Avg” row** stays the **raw** therapist-weighted target (`displayTargetByTeam` / `teamTargets`); regression `f113` locks this.

---

## Non-floating display vs typing (substitution / absence)

- **Product default:** Step 3.1 often still **displays** `1.00` non-floating when the team is staffed as a full non-floating complement.
- **Reality:** Non-floating may be **missing** on a slot; **floating** or substitution-like coverage can backfill. A **naïve headcount** can hide bugs (wrong gap, wrong raw floating).
- **Direction:** Persist or compute **non-floating FTE** from **typed** sources (e.g. which allocations count as non-floating vs substitution vs special-program for this card), not only “number of PCAs”. Implementation can phase: **display** stays friendly; **engine** uses explicit classification aligned with Step 2 algorithms and `staffOverrides`.

---

## Code / projection alignment (migration note)

Until types are renamed, legacy names may not match this glossary:

| This glossary | Typical legacy / code smell |
|---------------|------------------------------|
| **Avg** | `displayTargetByTeam`, `teamTargets` in bootstrap, `calculations[].average_pca_per_team` when unified |
| **Rounded floating** | Must **not** be the same as `round(Avg)` **team total** if that differs from `round(raw floating)`; today some fields mixed “team quarter target” with “floating” in the name |
| **Pending floating** | Bootstrap `pendingByTeam` at open; dialog `adjustedFTE` after 3.1 edits |
| **Non-floating FTE** | `existingAssignedByTeam` for the Step 3.1 scalar; attributed slices in `nonFloatingFteBreakdownByTeam` (`Step3NonFloatingCoverageKind`) from `computeStep3NonFloatingFteBreakdownByTeamFromAllocations` / `computeStep3BootstrapState` (sums should match the scalar per team when inputs align). |

Agents should treat **this glossary** as the **product source of truth** when updating Step 3.1 copy, projection builders, and tests.

---

## Removed surplus-grant fields (historical)

The following **bootstrap** surplus fields were removed in favor of **budgeted Extra after needs** in Step 3.4 only: `rawSurplusFte`, `idealWeightedSurplusShareByTeam`, `redistributableSlackSlots`, `realizedSurplusSlotGrantsByTeam`, `roundedAdjustedTeamTargets`, `surplusAdjustmentDeltaByTeam`. Optional tracker fields (`v2RealizedSurplusSlotGrant`, etc.) may still appear on **old** saved data but are no longer stamped.
