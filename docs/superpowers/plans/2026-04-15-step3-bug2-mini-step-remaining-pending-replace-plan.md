# Plan: Step 3.2 / 3.3 — remaining pending, cap, and replace semantics (Bug 2)

**Date:** 2026-04-15  
**Scope:** Step 3 V2 wizard (`FloatingPCAConfigDialogV2` + `computeAdjacentSlotReservations` / `computeStep3V2ReservationPreview` + save path `runStep3V2CommittedSelections` + `executeSlotAssignments`).  
**Out of scope for this doc:** Bug 1 root-cause fix (see appendix — may need runtime traces).

## Problem (user-confirmed)

1. **Mini-steps should consume a dynamic “remaining pending”** after prior commits in the same wizard, not only the Step 3.1 strip (`adjustedFTE`).
2. When **assigned floating from 3.2+3.3 already equals** the Step 3.1 obligation (or remaining pending is 0), the user must not get an **additive** story (“another slot of assigned floating on top”). They need either:
   - **no further assign** for that team in 3.3, or  
   - **replace**: a new 3.3 adjacent choice **supersedes** the prior 3.2 commit for that team (still **one slot** against the cap — 0.25 FTE engine equivalence).
3. **UI** must reflect cap + replace: labels, badges, and primary actions (“Assign adjacent slot” vs “Replace Step 3.2 assignment …”).

**Non-bug (clarified):** Step 3.3 adjacent options list only the **special-program PCA** for that program slot; preferred PCA order does not apply there.

## Current behavior (baseline for the plan)

- `adjacentPreview` calls `computeAdjacentSlotReservations(adjustedFTE, existingAllocations, …)` — **Step 3.1 pending** + **Step 2 allocations only**; it does **not** merge in-dialog Step 3.2 commits (`step32CommittedAssignmentsByTeam`).
- Step 3.3 lane copy shows `Pending floating` from **`adjustedFTE[team]`** (same issue).
- Final save applies caps in `executeSlotAssignments` (skips rows when pending &lt; 0.25), but the **UI can still imply** an extra adjacent assign “on top” of 3.2.

## Target behavior

### Definitions

- **`pendingFixed`** — Step 3.1 rounded obligation for the team (`adjustedFTE[team]`); unchanged until user returns to 3.1.
- **`committedSlots32`** — 0 or 1 **slot** row from Step 3.2 for the team (0.25 FTE each; product: at most one row per team for current UI).
- **`committedSlots33`** — 0 or 1 **slot** row from Step 3.3 for the team.
- **`remainingAfter32`** = `round(pendingFixed - 0.25 * |committedSlots32|)` (clamped ≥ 0).
- **`remainingAfter3233`** = `round(pendingFixed - 0.25 * (|committedSlots32| + |committedSlots33|))` (clamped ≥ 0).

### Rules

1. **Eligibility:** `computeAdjacentSlotReservations` (and any Step 3.2 preview that cares about pending) should use:
   - **pending input:** remaining pending after **simulated** application of prior mini-step commits (at minimum: merge Step 3.2 slot picks into a **scratch allocation list** before adjacent), **or** an explicit `remainingPendingFTE` record derived in the dialog and passed in.
   - **allocations input:** scratch list = clone `existingAllocations` + apply `executeSlotAssignments(step32Only, …)` in memory for preview (no persist), so adjacent availability reflects the Step 3.2 slot already on the scratch board (e.g. 淑貞 on slot 4).

2. **Cap:** If `remainingAfter32 < 0.25`, **do not** offer adjacent assign as “add”. UI options:
   - **Default:** hide or disable “Assign adjacent slot” **unless** replace mode applies.
   - **Replace mode:** if **any** adjacent option exists (from `AdjacentSlotInfo` — always the **special-program PCA** on that day), allow **one** control: UI primary **“Replace Step 3.2 with adjacent slot”** with detail copy in **time bands** (see house rules) — net still **one slot** (0.25 FTE). **Cross-PCA replace is allowed** (e.g. Step 3.2 preferred **淑貞** on slot 4; CPR runs slot 2 by **君** → user may replace with **君** on the adjacent slot 1). When the adjacent row’s `pcaId` ≠ Step 3.2 commit’s `pcaId`, the UI **must** surface that the user is **giving up the Step 3.2 preferred PCA choice** for that slot (copy: “sacrifice” / “no longer using … from Step 3.2” — exact wording UX review). When PCAs match, subtext can stay lighter (“only the time window changes”).

3. **Save payload (`step32AssignmentsForSave` / `step33AssignmentsForSave`):** When user confirms a **replace**, the arrays sent to `runStep3V2CommittedSelections` must encode **at most one slot row** (0.25 FTE) for that team from {3.2, 3.3} combined, e.g.:
   - omit Step 3.2 row for that team and include Step 3.3 row only, **or**
   - clear Step 3.2 state when Step 3.3 “replace assign” is chosen and only emit 3.3.

   Order in `runStep3V2CommittedSelections` (32 then 33) stays valid; **replace** means the **union** must not exceed remaining slots.

4. **Multi-slot example (0.75 pending floating):** Step 3.2 places one slot, Step 3.3 adjacent places one slot, Step 3.4 places one more — still valid; **replace** semantics apply only when **remaining pending** is **0** and the user would otherwise be **adding** assigned floating on top of Step 3.2.

---

## House rules — copy & density

- **Do not say “quarter” or “quarter slot”** in user-visible copy. Say **slot** (or **assigned floating** / **pending floating** per glossary). Engineers may still think in 0.25 FTE internally.
- **Lane cards (horizontal strip):** prefer **time bands** for Step 3.2 commitment when horizontal space allows (e.g. card `min-width` breakpoint `min-w-[140px]` or `@container` so at least one line can show `君 · 1500-1630` under the team name). **Fallback when narrow:** show `Step 3.2: Slot 4` (or `君 · Slot 4`) so the strip never clips unreadable text. Same `getSlotTime` + `formatTimeRange` as the detail panel.
- **Main detail panel (primary reading area):** always show **time bands**, not slot index alone, for human scanability. Reuse the same notion as elsewhere in the app: `getSlotTime` + `formatTimeRange` from `@/lib/utils/slotHelpers` (already used by `PCABlock` / allocation UI). Example shape (numbers illustrative):
  - Step 3.2 line: `君 · 1500-1630`
  - Adjacent option: `CPR · 君 · adjacent slot 0900-1030 (next to CPR 1030-1200)` — program label, PCA, adjacent **time**, parenthetical anchor for the program block **time**.
- **Layout: flatter, fewer boxes.** Avoid stacking “one bordered card for status” + “another bordered card for list” + “another for actions.” Prefer:
  - one outer container (existing step panel border is enough),
  - **vertical rhythm** (`space-y-*`), **hairline dividers** (`border-t border-emerald-200/50`) between sections,
  - **at most one** soft emphasis for “met” (e.g. `border-l-2 border-emerald-500 pl-3` on a **text block**, not a full tinted card),
  - adjacent options as **rows** with subtle hover/selected border — not nested `Card` components.
- **RBIP commonality (`.cursor/rules/design-elements-commonality.mdc`):** Step 3.3 stays **emerald-only** for this step’s semantic accent (no violet here — that hue is reserved for **Extra after needs** elsewhere). Use **lucide-react** `Info` for the helper row (no emoji). Respect **max nesting / grouping**: `divide-y` or `border-t` between sections, not card-in-card; keep **control + label clusters left-aligned** (`flex gap-3`, avoid `justify-between` for a button and its explanation on wide screens).

---

## Step 3.3 UI specification (design lock)

This section locks **layout, copy, and states** so implementation does not drift. Copy should follow **`docs/glossary/step3-floating-nonfloating.md`** (especially **Pending floating**, **Assigned floating**, **Remaining pending**). Visual intent follows **interface-design** principles: one clear job per screen (“confirm **where** assigned floating sits for this slot”), **hierarchy** (metrics → status → evidence → actions), **calm** density (no competing reds; reserve red for impossible saves only). Obey **§ House rules — copy & density** above.

### Color / theme

- **Stay in the existing Step 3.3 green world:** emerald borders, soft emerald surfaces, emerald ring on selected lane card (`border-emerald-*`, `bg-emerald-50/80`, `ring-emerald-500`, dark-mode emerald-950 tints) — same as current `renderStep33`.
- **Align the step helper strip** with the step: change the top `Info` cue from violet to **emerald** (`text-emerald-600` / dark emerald) so Step 3.3 does not read like a different product area.
- **Semantic accents:** success / “met” → emerald; neutral explainers → `text-muted-foreground`; do **not** introduce a second strong accent (e.g. blue primary buttons) inside this step.

### Information hierarchy (per selected team — detail panel, flat)

Order **top → bottom** in **one column**. Separate major sections with **spacing + divider**, not nested boxes.

1. **Glossary metrics row (always when team selected)**  
   Inline **badges** or one line with tabular numbers:
   - **Pending floating** — fixed Step 3.1 target for this team (label must match glossary).
   - **Assigned floating** — from **Steps 3.2–3.3 only** on this step (see *Assigned chip scope*).
   - **Remaining pending** — max(0, pending floating − assigned floating from 3.2–3.3). Drives additive vs replace-only.

2. **Status + Step 3.2 evidence (conditional — Remaining pending = 0 and Step 3.2 has a commit)**  
   Flat text block; optional **left accent** only (`border-l-2 border-emerald-500 pl-3`):
   - Line 1: “Floating need met for this team.”
   - Line 2: “Step 3.2 already placed assigned floating:”
   - Line 3 (primary readable line, **time band**): `君 · 1500-1630` (from `formatTimeRange(getSlotTime(slot))` + PCA display name).

3. **Rule explainer (muted, max two short lines)**  
   - “You can’t add more **assigned floating** here without going back to Step 3.1 to change **pending floating**.”  
   - If replace is available: “You can **switch** this assignment to the adjacent special-program **slot** instead.” (If that slot uses a **different PCA** than Step 3.2, add a third line or inline warning: Step 3.2’s **preferred PCA** choice for that slot will **not** apply after replace — see action-row subtext below.)

4. **`border-t` divider**

5. **Adjacent options (Step 3.3)**  
   - Section title (text only): **Adjacent to special program**  
   - Rows: each row is one **tappable row** (subtle border or `bg-muted/20`), selected = emerald ring/border. Copy pattern:  
     `CPR · 君 · adjacent slot 0900-1030 (next to CPR 1030-1200)`  
     Implement by composing: program name from `AdjacentSlotInfo`, PCA name, `formatTimeRange(getSlotTime(adjacentSlot))`, and parenthetical for program slot time on the special-program row.

6. **`border-t` divider**

7. **Actions (buttons only — no action “card”)**  
   Use **outline** for non-primary, **default** (filled emerald) for the single primary.

   | State | Primary button | Secondary | Notes |
   |-------|----------------|-----------|--------|
   | **Remaining pending ≥ 0.25** | **Assign adjacent slot** | **Skip adjacent slot** | Optional muted hint: “Uses one slot of remaining pending.” (Never say “quarter”.) |
   | **Remaining pending = 0** + **at least one adjacent row** (replace path) | **Replace Step 3.2 with adjacent slot** | **Keep Step 3.2, skip adjacent** | Subtext (muted): always “Still **one slot** of assigned floating.” If selected adjacent **pcaId** = Step 3.2 commit **pcaId**: add “Only the **time window** changes.” If **different PCA**: add explicit line that Step 3.2’s **preferred PCA** (name) **will no longer be used** for this team’s assigned floating — user accepts **sacrificing** that Step 3.2 choice. |
   | **Remaining pending = 0** + **no adjacent rows** | **Keep Step 3.2, skip adjacent** | — | Muted: “No adjacent special-program slot to switch to.” (Not a PCA-mismatch block.) |

   **“Revert to Step 3.2 only”:** same control as **Keep Step 3.2, skip adjacent**; optional aria/helper: “Reverts to your Step 3.2 choice only.”

### Lane cards (horizontal team strip)

- Line 1: order + team.
- Line 2: **Pending floating** (glossary) + numeric.
- Line 3: **Assigned floating** (glossary) + numeric (3.2+3.3 only — *Assigned chip scope*).
- Line 4: **Remaining pending** (glossary) + numeric.
- Line 5 (**responsive**): when width allows, **Step 3.2 preview line** — `君 · 1500-1630` (time band from `formatTimeRange(getSlotTime(slot))` + PCA name from commit). When narrow, collapse to `Step 3.2: Slot 4` or `君 · Slot 4` on one line.
- Line 6: compact chip — `Need met` · `1 slot left` · `Adjacent: switch` (optional: `may change PCA`) · `No adjacent` (never “1 quarter left”).

### Assigned chip scope (anti-chaos)

- On **Step 3.3**, `getStep3FloatingAssignedFteForTeam` currently includes **Step 3.4** when `step34PreviewResult` exists — that is wrong for this mini-step’s mental model. **Plan:** while `currentStep === '3.3'`, compute assigned floating for the strip from **`step32AssignmentsForSave` + `step33AssignmentsForSave` only** (or equivalent committed state), **ignoring** `step34PreviewResult`. Step 3.4 can keep the broader definition including 3.4.

### Empty / edge states

- **No adjacent options** after scratch recompute: keep gray “No adjacent special-program slot…” but add one line if **Remaining pending = 0** and Step 3.2 exists: “Nothing to do here unless you go back to Step 3.1.”
- **Step 3.3 visible but no teams** in `adjacentTeams`: short explainer at top of step (muted) — avoid empty wizard panic.

### Copy checklist (glossary)

| UI string | Must map to |
|-----------|-------------|
| Pending floating | Glossary **Pending floating** |
| Assigned floating | Glossary **Assigned floating** (scope as above) |
| Remaining pending | Glossary **Remaining pending** |
| “Replace / switch” | Product verb for keeping **one slot** of assigned floating but moving it to the adjacent **slot** (time window); may change **PCA** — when it does, disclose loss of Step 3.2 **preferred PCA** for that slot |
| “Keep Step 3.2, skip adjacent” | User-facing name for “revert to 3.2 only” |

### Visual draft (redraft — flat, responsive lane, RBIP-aligned)

**Conventions:** `border-t` = full-width divider inside the step. **Icons:** lucide `Info` only (no emoji). **Clusters:** badges + buttons **left-aligned** with `gap-*`, not `justify-between`. **No** nested `Card` for status, list, or actions.

---

#### A) Helper row (full width)

```text
  [Info]  Gray: no adjacent special-program slot. Green: adjacent slot available for review.
          icon + text in emerald-600; text wraps (no nowrap on body)
```

---

#### B) Lane strip — **wide** cards (prefer time band on card)

```text
  ┌──────────────────────────┐   ┌──────────────────────────┐
  │ ①  CPPC                  │   │ ②  SMM                   │
  │ Pending floating    0.25 │   │ … gray lane …            │
  │ Assigned floating   0.25 │   └──────────────────────────┘
  │ Remaining pending   0.00 │
  │ 君 · 1500-1630           │   <- Step 3.2 commit preview (time band)
  │ [ Adjacent: switch ]     │   <- chip (optional “may change PCA” when 3.2 PCA ≠ program PCA)
  └──────────────────────────┘
       ^ selected: ring-emerald-500
```

---

#### C) Lane strip — **narrow** cards (fallback; same metrics)

```text
  ┌────────────────┐
  │ ① CPPC         │
  │ Pending   0.25 │
  │ Assigned  0.25 │
  │ Remaining 0.00 │
  │ 君 · Slot 4    │   <- compact: PCA + slot index (time band hidden)
  │ [ switch only ]│
  └────────────────┘
```

---

#### D) Detail panel — **Remaining pending > 0** (additive path)

```text
  CPPC
  [ Pending floating 0.50 ] [ Assigned floating 0.25 ] [ Remaining pending 0.25 ]
        <- badges in a single flex row, gap-2, left-aligned

  ────────────────────────────────────────────────────────

  Adjacent to special program

  ( )  CPR · 君 · adjacent slot 0900-1030 (next to CPR 1030-1200)
  (x)  second option …                                 <- selected row: emerald border

  ────────────────────────────────────────────────────────

  [ Assign adjacent slot ]   [ Skip adjacent slot ]
        primary                     outline
  Uses one slot of remaining pending.     <- muted helper, directly under buttons, same cluster
```

---

#### E) Detail panel — **Remaining pending = 0** + Step 3.2 commit + **replace** path

**E1 — Same PCA as Step 3.2 (time-only change)**

```text
  CPPC
  [ Pending floating 0.25 ] [ Assigned floating 0.25 ] [ Remaining pending 0.00 ]

  |  Floating need met for this team.
  |  Step 3.2 already placed assigned floating:
  |  君 · 1500-1630
       <- border-l-2 border-emerald-500 pl-3 only; no filled “banner card”

  You can’t add more assigned floating here without going back to Step 3.1
  to change pending floating. You can switch this assignment to the adjacent
  special-program slot instead.

  ────────────────────────────────────────────────────────

  Adjacent to special program

  ( )  CPR · 君 · adjacent slot 0900-1030 (next to CPR 1030-1200)

  ────────────────────────────────────────────────────────

  [ Replace Step 3.2 with adjacent slot ]   [ Keep Step 3.2, skip adjacent ]
              primary                              outline

  Still one slot of assigned floating — only the time window changes.
```

**E2 — Cross-PCA replace (preferred Step 3.2 PCA ≠ adjacent program PCA)**

Example: Step 3.2 placed **淑貞** on slot 4; adjacent row is **CPR · 君** on slot 1. Primary action stays **Replace Step 3.2 with adjacent slot**; add **muted warning** under the buttons (or above primary) so the sacrifice is explicit:

```text
  |  Step 3.2 already placed assigned floating:
  |  淑貞 · 1500-1630

  … adjacent row: CPR · 君 · adjacent slot 0900-1030 (next to CPR 1030-1200)

  [ Replace Step 3.2 with adjacent slot ]   [ Keep Step 3.2, skip adjacent ]

  Still one slot of assigned floating. Replacing removes 淑貞 from this
  assignment and uses 君 on the adjacent slot instead (Step 3.2 preferred PCA
  choice no longer applies).
```

Legend for list rows: `( )` = unselected row, `(x)` = selected (implement as radio + row styling, not literal characters in UI).

---

#### F) Detail panel — **Remaining pending = 0**, **no** adjacent rows (replace unavailable)

```text
  … badges: Remaining pending 0.00 …

  |  Floating need met…
  |  Step 3.2 already placed assigned floating:
  |  淑貞 · 1500-1630

  No adjacent special-program slot is available to switch to.

  ────────────────────────────────────────────────────────

  [ Keep Step 3.2, skip adjacent ]     <- sole action
```

**Note:** Cross-PCA mismatch is **not** a block — use **E2** disclosure instead.

---

## Implementation tasks (ordered)

### A — Shared “scratch” state in the dialog (frontend)

- Add a `useMemo` (or small helper module) that returns:
  - `scratchAllocations` — `existingAllocations` cloned + `executeSlotAssignments(step32AssignmentsForSave, adjustedFTE, …)` (or incremental apply only 3.2).
  - `pendingAfter32` — pending after that execute (or derive: `adjustedFTE` minus 0.25 per team with a 3.2 row).
- Feed **`pendingAfter32`** and **`scratchAllocations`** into `computeAdjacentSlotReservations` instead of `adjustedFTE` / `existingAllocations`.
- Recompute **`adjacentTeams` / `hasAnyAdjacentReservations`** from that result so Step 3.3 can disappear when nothing applies under true remaining pending.

**Files:** `components/allocation/FloatingPCAConfigDialogV2.tsx`, optionally extract helpers to `lib/features/schedule/step3V2ScratchPreview.ts` for testability.

### B — Step 3.3 UI (implement the locked spec)

- Implement **§ Step 3.3 UI specification (design lock)** above in `FloatingPCAConfigDialogV2` (`renderStep33` + lane strip): glossary row, flat status block, explainer, adjacent rows, action table, **Assigned chip scope** on 3.3 (ignore `step34PreviewResult` while on 3.3).
- **Lane strip:** add optional Step 3.2 time line using `getSlotTime` / `formatTimeRange` with **responsive** fallback to slot index when card width is below threshold (see house rules).
- Wire metrics to real data: **Pending floating** = `adjustedFTE[team]`; **Assigned floating** (3.3 view) = FTE from committed 3.2+3.3 slot rows only (0.25 per slot); **Remaining pending** = max(0, pending − assigned).
- Wire buttons to **C** (replace vs skip state machine).

**Files:** `components/allocation/FloatingPCAConfigDialogV2.tsx` (+ tiny presentational helpers if the component grows).

### C — Replace state machine

- Extend state: e.g. `step33ModeByTeam: 'skip' | 'add' | 'replace'` or derive from decisions + cap.
- On “Replace …”: clear `step32CommittedAssignmentsByTeam[team]` **or** mark a flag so `step32AssignmentsForSave` omits that team while `step33Decisions[team] === 'use'`.

**Invariant:** For each team, `count(step32 rows) + count(step33 rows) ≤ round(pendingFixed / 0.25)` when building save arrays.

### D — Backend / save path sanity

- `runStep3V2CommittedSelections` + `executeSlotAssignments` already enforce per-row pending; add a **dev assert** or **unit test** that for fixture “0.25 pending + replace” the **saved** slot rows for that team total **one** (omit 3.2 row when 3.3 replace wins). Cover **same-PCA** (time-only) and **cross-PCA** (e.g. 3.2 **淑貞** slot 4 → 3.3 **君** adjacent slot 1); cross-PCA acceptance in UI must show the **sacrifice** disclosure string.
- Optional: defensive merge in `runStep3V2CommittedSelections` that drops impossible 3.3 rows if 3.2 already consumed full pending (prefer **UI never emits** invalid pairs).

**Files:** `lib/features/schedule/step3V2CommittedSelections.ts` (tests only or light guard), `lib/utils/reservationLogic.ts` (tests for preview inputs).

### E — Tests

- **Unit:** `computeAdjacentSlotReservations` with `pendingAfter32 === 0` and scratch allocations showing 3.2 slot → expect **no additive** adjacent row; replace path depends only on whether a program-adjacent row exists, **not** on PCA equality with Step 3.2.
- **Unit / integration:** dialog helper: 0.25 pending, 3.2 commit slot 4, then adjacent preview → remaining 0, assign disabled or replace only.
- **Harness:** extend `runStep3V2Auto` or existing Step 3 harness if present for regression.

## Risks / edge cases

- **Cross-PCA replace:** allowed at cap when an adjacent row exists; **must** show sacrifice-of–Step-3.2-preferred-PCA copy when `step32.pcaId !== selectedAdjacent.pcaId`. Engine save: emit **only** the 3.3 row for that team (omit 3.2) so net remains one slot.
- **Performance:** re-running `executeSlotAssignments` in `useMemo` on each render — memoize on stable keys (assignments serialized, allocations ref).
- **Step visibility:** `includeStep33` currently keys off raw `computeAdjacentSlotReservations(adjustedFTE, …)`; switching to scratch inputs may **hide** Step 3.3 when nothing applies — confirm with product that this is desired.

## Rollout

1. Land **A + B** behind no flag (behavior fix).  
2. Land **C + D** with tests.  
3. UX copy review for “Replace” vs “Swap” wording.

---

## Appendix: Bug 1 — follow-up (no fix locked here)

**User observation:** Tracker shows **one** Step 3.4 assignment **not** tagged `allocationStage: 'extra-coverage'` (i.e. not the post-need round-robin extra path).

**Implication:** That slot likely came from **draft** (`allocationStage: 'draft'`), **repair** (`repair` + `repairReason`), or **optional promotion** (`ranked-promotion`), not from `applyExtraCoverageRoundRobin`.

**Suggested instrumentation (next debug pass):**

1. Log at end of `allocateFloatingPCA_v2RankedSlotImpl` (or single wrapper): per CPPC assignment: `{ slot, assignedIn, allocationStage, repairReason, fulfilledSlotRank }`.
2. Log **immediately before** `allocateFloatingPCA_v2RankedSlot`: `pendingFTE` after 3.2/3.3 `executeSlotAssignments`, and the committed anchor list.
3. Log `preStep34RoundedPendingFte` already stamped in `runStep3V2CommittedSelections` for CPPC.

If `preStep34RoundedPendingFte > 0` but user believed need was 0, the bug is **still in 3.2/3.3 execute or save arrays**; if `preStep34RoundedPendingFte === 0` but a **draft** row exists for ranked slot, trace **draftAllocation** / **repair** / **promotion** in `lib/algorithms/floatingPcaV2/allocator.ts`.

No extra runtime logging is **required** to start Bug 2 work; Bug 1 benefits from the above three checkpoints once Bug 2 preview uses scratch pending so 3.3 does not confuse the scenario.
