# Surplus & “Extra after needs” revamp — budgeted extras + Step 3.1 anticipation (Design)

> **Status:** Proposed design (not implemented)  
> **Source of product intent:** `docs/superpowers/specs/2026-04-18-surplus-extra-revamp-editor-intent-handoff.md` (treat as intent, not code truth)  
> **Decision log:** This design reflects stakeholder decisions made in-thread during this chat; still requires engineer + product review before implementation.

## Goal

Make Step 3.4 “Extra after needs” **predictable and explainable** *before* an editor finishes Step 3, by:

- Showing a Step 3.1 preview line (**Likely extras: up to N slots**) with progressive disclosure for the math.
- Replacing unbounded round-robin “extras” with a **budgeted** extra pass that is **owe-first**.
- Rejecting “sum of per-team `ceil(raw/0.25)`” as the editor-facing definition of slack eligibility.

This doc also harmonizes the app’s sign convention and language for the “continuous vs slots” mismatch story.

## Non-goals

- Rewriting the entire V2 surplus / “Raised target (shared spare)” mechanism in one go. This design is **phased** (Approach B).
- Claiming the Step 3 allocator is deterministic. Step 3.1 is **anticipation**, not a guarantee.

---

## Glossary & sign convention (locked)

### Balance (one convention across the app)

We standardize on the same convention already used in the schedule page “sanity check”:

\[
\textbf{balance} = \texttt{Assigned} - \texttt{Avg}
\]

- **balance > 0** ⇒ **Over-assigned** (assigned more than Avg)
- **balance < 0** ⇒ **Under-assigned** (assigned less than Avg)

Mapping to the handoff doc’s “slackFTE” convention:

- `slackFTE = Avg − Assigned = −balance`

### Assigned (what counts)

For balance math, **Assigned** is “what is on the team’s sheet,” counted as quarter slots (`slots × 0.25`), excluding invalid slots.

- Include: non-floating PCA coverage, floating PCA coverage, special-program-attributed slots, substitutions, duplicate floating coverage (if multiple PCAs stacked on a slot, each counts 0.25).
- This matches the handoff doc’s intent that “any slot assigned to a team counts on that team’s sheet.”

### Step 3.1 “after rounded needs” snapshot (preview-only)

Step 3.1 needs a **predictive** snapshot to explain “likely extras” without running a full allocator.

Define:

- `Avg[team]`: the Step 2 therapist-weighted continuous average (display target). (Do not rewrite this when surplus exists; see Step 3 glossary.)
- `existingAssignedFTE[team]`: reconciled non-floating-ish assigned before Step 3 (already computed for Step 3 entry).
- `pendingFloatingFTE[team]`: the Step 3.1 pending floating after editor adjustments (quarter grid).

Then the Step 3.1 preview snapshot uses:

\[
\texttt{AssignedAfterRoundedNeeds}[team] = \texttt{existingAssignedFTE}[team] + \texttt{pendingFloatingFTE}[team]
\]
\[
\texttt{balanceAfterRoundedNeeds}[team] = \texttt{AssignedAfterRoundedNeeds}[team] - \texttt{Avg}[team]
\]

Interpretation:

- `balanceAfterRoundedNeeds < 0`: team is still **under-assigned** vs Avg even after covering the rounded “required” pending.
- `balanceAfterRoundedNeeds > 0`: team becomes **over-assigned** due to quarter rounding (or other grid effects).

---

## Problem statement (why revamp)

### Current UX pain

Editors frequently experience Step 3.4 “Extra after needs” as a **surprise**—they only notice it after returning to the schedule page.

### Current technical mismatch

Today’s code paths create “more than discrete need” via two mechanisms:

1. **Raised target (shared spare)**: surplus-adjusted floating targets at Step 2→3 handoff (V2).
2. **Extra after needs**: Step 3.4 extra coverage pass (currently round-robin and unbounded).

These are not explained together and the current slack cap for surplus uses the rejected notion:

- `discreteNeededSlots = Σ ceil(rawPending/0.25)` (rejected as editor-facing authority)

---

## Proposed approach: Approach B (phased)

We lean to **Approach B**:

- **Phase 1 (primary value)**: Revamp Step 3.4 extra-after-needs into a **budgeted** pass with **owe-first** selection + Step 3.1 anticipation UI.
- **Phase 2 (follow-up)**: Revisit how V2 “Raised target (shared spare)” computes and exposes slack (replace editor-facing “discrete need” story; potentially replace executable cap math).

This yields predictable Step 3.4 behavior quickly without forcing a full surplus redesign in the same change set.

---

## Step 3.4 “Extra after needs” — budgeted, owe-first

### High-level behavior (locked)

1. Extra-after-needs runs **only after required floating need is satisfied** (same concept as today).
2. Extra-after-needs is **bounded** by a budget (`extraBudgetSlots`).
3. Extra-after-needs assigns extras **owe-first**, not purely round-robin.

### Eligibility & budget (two-gate model)

We intentionally separate “demand qualification” from “supply executability”:

#### Gate 1: demand qualification (owed-only aggregate, continuous)

\[
\texttt{aggregateUnderAssignedFTE} = \sum_{team} \max(0, -\texttt{balanceAfterRoundedNeeds}[team])
\]

Then:

\[
\texttt{qualifyingExtraSlotsFromAggregate} = \left\lfloor \frac{\texttt{aggregateUnderAssignedFTE}}{0.25} \right\rfloor
\]

#### Gate 2: pool cross-check (discrete)

Let:

- `availableFloatingSlots`: executable pool slots (0.25 slots) after Step 2 and geometry constraints.
- `neededSlots`: required pending slots after Step 3.1 adjustments:
  - `neededSlots = Σ (pendingFloatingFTE[team] / 0.25)` (pending is already quarter-grid in Step 3.1).

Then:

\[
\texttt{poolSpareSlots} = \max(0, \texttt{availableFloatingSlots} - \texttt{neededSlots})
\]

#### Final budget

\[
\texttt{extraBudgetSlots} = \min(\texttt{poolSpareSlots}, \texttt{qualifyingExtraSlotsFromAggregate})
\]

**Why this resolves the “long consumes dust” concern:** over-assigned teams “spend” pool slots via `neededSlots` / supply constraints, so even if aggregate under-assigned qualifies, `poolSpareSlots = 0` blocks extras.

### Recipient selection (owe-first)

At the start of extra-after-needs placement, compute an owe metric. For determinism and alignment with editor intuition, use the same “after rounded needs” balance:

- Under-assigned magnitude: `under[team] = max(0, -balanceAfterRoundedNeeds[team])`

Then repeatedly, for up to `extraBudgetSlots` times:

- Pick the team with the **largest** `under[team]`.
- Tie-break: stable ordering (or “team order” if a single stable list exists across Step 3).
- Assign one extra 0.25 slot to that team (subject to feasibility).
- Update `under[team] = max(0, under[team] - 0.25)` for the preview ordering / multi-slot distribution.

**Important nuance (must be explained in Step 3.1 numbers):** since eligibility is aggregate, it is normal that:

- no single team has `under ≥ 0.25`, but aggregate under-assigned qualifies; assigning one extra 0.25 can flip the recipient from under-assigned to over-assigned.

### Feasibility constraints & “up to”

`extraBudgetSlots` is an **upper bound**. The actual number of extras placed can be lower if:

- no eligible floating PCA can be assigned under gym avoidance / slot geometry / availability constraints.

Implementation must treat Step 3.1 preview as “up to N” and Step 3.4 as “attempt up to N.”

---

## Step 3.1 anticipation UX (progressive disclosure)

### Default line (always visible)

If the computed budget is non-zero:

- **Preview:** “Likely extras: up to **N** optional slot(s) in Step 3.4 after needs are met (**Extra after needs**).”

If it’s zero:

- No preview line (or show a muted “Likely extras: none” only if stakeholders want explicit negative feedback).

### Progressive disclosure (click to expand)

Under the preview line, add a chevron “Show how we estimate this” that reveals three stacked blocks (flat layout; no nested cards):

1. **Supply (pool)**
   - “Available floating slots: X”
   - “Needed slots (pending): Y”
   - “Pool spare slots: X − Y = S”

2. **Demand (after rounded needs)**
   - One mono summary line using the harmonized language:
     - “Over-assigned: P.PP | Under-assigned: U.UU | Net: (P − U).”
   - One line of per-team balances:
     - “Team balances (after rounded needs): FO -0.11 | …”
   - A small sign legend:
     - “(+ = over-assigned, − = under-assigned)”

3. **Owe-first preview (top 2–3 only)**
   - Show the first recipient(s) in a compact, numeric way:
     - “1) FO: -0.11 → +0.14 after 1 extra slot”
     - “2) SMM: -0.09 → +0.16 after 1 extra slot”
   - Cap at 2–3 rows to avoid noise.

### Where to embed “aggregate owed” in existing context

The “Demand (after rounded needs)” block should reuse the same *visual language* as the existing schedule popover sanity-check lines (mono summary + per-team line), but with:

- **Different snapshot:** “after rounded needs” instead of “today’s assigned”
- **Same convention:** `balance = Assigned − Avg`
- **New labels:** “Over-assigned / Under-assigned / Net” (avoid “abs”, avoid “long”)

This is explicitly designed to fit into the `AvgPcaFormulaPopoverContent`/sanity-check style context without introducing a new mental model.

---

## Relationship to “Raised target (shared spare)” (V2 surplus)

Phase 1 does not remove raised targets. Instead:

- Keep existing raised-target behavior (V2 surplus grants) as allocator authority for required pending.
- Ensure Step 3.1 copy and math make it clear:
  - **Raised target (shared spare)** is about a slightly higher required floating target (hand-off uplift).
  - **Extra after needs** is a separate, optional, post-need placement bounded by the new budget.

Phase 2 will revisit the “slack cap” math so editor-facing slack is not defined by per-team ceil sums.

---

## Interaction with NSM-style targets < 1.0

If `Avg < existingAssignedFTE` for a team (common when Avg is < 1.0 but the sheet baseline is ~1.0):

- `balanceAfterRoundedNeeds` is positive (over-assigned), contributing to the Over-assigned sum.
- Under-assigned for that team is zero, so it is never selected as an owe-first recipient.

This matches the intent: teams that are already above their Avg should not receive extra-after-needs slots.

---

## Implementation sketch (for feasibility review; not a plan)

### Domain helpers (recommended extraction)

Introduce a reusable helper that formats and aggregates team balances for display:

- Input: `Record<Team, number> balanceByTeam`
- Output:
  - `overAssignedSum = Σ max(0, balance)`
  - `underAssignedSum = Σ max(0, -balance)`
  - `net = overAssignedSum − underAssignedSum`
  - `perTeamText = "FO -0.11 | ..."`

This should be used for:

- Existing schedule page sanity-check footer (today’s assigned vs avg)
- Step 3.1 “after rounded needs” disclosure block (assignedAfterRoundedNeeds vs avg)

### Allocator contract

Extend V2 allocator’s “extra coverage” mode from a binary `round-robin` switch to a structured payload:

- `extraBudgetSlots: number`
- `extraRecipientOrder: Team[]` (or provide `underByTeam` and let allocator pick)

And ensure the allocator:

- never places more than `extraBudgetSlots` extras
- tags them consistently (`allocationStage: 'extra-coverage'`, existing UI chips still work)
- does not loop forever: progress must be bounded by budget and/or attempt caps

---

## Tests (must exist before rollout)

### Unit tests (pure math)

For a helper that computes:

- `balanceAfterRoundedNeedsByTeam`
- `aggregateUnderAssignedFTE`
- `qualifyingExtraSlotsFromAggregate`
- `poolSpareSlots`
- `extraBudgetSlots`
- owe-first preview recipients (deterministic ordering)

Include:

- many small under-assigned values that sum to < 0.25 ⇒ 0 extras
- aggregate under-assigned ≥ 0.25 but `poolSpareSlots = 0` ⇒ 0 extras
- NSM-like `Avg < 1.0` with baseline 1.0 ⇒ over-assigned; never recipient
- tie-breaking determinism

### Allocator regression

- extra-after-needs never exceeds budget
- owe-first ordering is respected when multiple extras exist
- tracker tagging remains stable so Step 3.4 UI continues to show “Extra after needs” chips/reason bullets

### UI regression

- Step 3.1 preview line + expander renders the three blocks and uses “Over-assigned / Under-assigned / Net” labels

---

## Help copy / migration notes

### Copy alignment

Replace “+ve / -ve abs” phrasing in any surfaced UI with:

- **Over-assigned / Under-assigned / Net**

Avoid “long/short” (HK interpretation risk) and avoid “abs” (math-y).

### Help Center & tooltips

- Update `/help/avg-and-slots` and Step 3.1 inline popovers so the “continuous vs slots” mismatch explanation aligns with:
  - “grid mismatch can create spare slots or tight pool”
  - “extras are optional and budgeted”
  - “owe-first recipients may flip to over-assigned when a 0.25 slot is placed”

---

## Open questions (for stakeholder validation)

1. **Negative preview line**: do we want “Likely extras: none” explicitly, or silence when budget = 0?
2. **Tie-break policy**: stable alphabetical vs canonical team order vs editor override UI (future).
3. **Phase 2**: whether to refactor/replace V2 raised-target slack cap (`redistributableSlackSlots`) to align with the new aggregate + pool story.

