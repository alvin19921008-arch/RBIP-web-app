# Step 3.2 (V2) — Combined outcome + PCA UI — implementation plan

**Status:** Planning  
**Date:** 2026-04-15  
**Design spec:** [`../specs/2026-04-15-step32-v2-combined-outcome-pca-ui-design.md`](../specs/2026-04-15-step32-v2-combined-outcome-pca-ui-design.md)  
**Visual mockup:** [`../mockups/2026-04-15-step32-v2-visual-draft.html`](../mockups/2026-04-15-step32-v2-visual-draft.html)

This plan covers the **revamped Step 3.2 detail UX** (combined Outcome + PCA, reservation-only preview, copy). **Production code is not modified until this plan is executed in a separate pass.**

---

## 0. Ranked slot & rank display rules (copy — locked)

These rules apply **everywhere** on the Step 3.2 **detail panel** where dashboard rank order is shown next to day-slot timing.

### 0.1 Prefer ordinals for **rank position**, not `#n`

- Use **1st rank**, **2nd rank**, **3rd rank**, **4th rank** in user-visible strings.
- Avoid **`#1` / `#2`** paired with **`slot 1`–`slot 4`** in the same breath (e.g. `#1 slot 2 · #2 slot 1`) — it is hard to scan and mixes two numbering schemes.

### 0.2 One-line summary for “your ranked slots”

- **Good:** `1st rank: 1030–1200 · 2nd rank: 0900–1030`
- **Avoid:** `Ranked slots: #1 1030–1200 (slot 2) · #2 0900–1030 (slot 1)` (redundant rank + slot index + interval).
- **Avoid:** `1st rank slot: slot 2 1030–1200` (clunky ordering).

Section label can stay short (e.g. **“Ranked slots”** or **“Your dashboard”**) with the line body in the **good** pattern.

### 0.3 When internal **slot index** (1–4) must appear

If the UI must name the engine slot index **for support or alignment with elsewhere in the app**, write the **interval immediately** with that slot, e.g. **`Slot 2 (1030–1200)`**, not `slot 2` alone and not `#1 slot 2`.

Reserve **ordinal rank + interval** for coordinator-facing lines; use **slot + interval** only where the product explicitly needs engine slot id.

### 0.4 Outcome cards and “Reserved for Step 3.4”

- Reuse the **same** rank/time pattern as context: e.g. `1st rank: 1030–1200` in the reserved row, plus PCA name — **do not** repeat a second redundant “ranked context” line that reintroduces `#n` / `slot n` clutter unless wording differs materially.
- Align chips and helper lines with ordinals where they refer to rank (e.g. **“Available on 1st rank”** instead of **“Available on rank #1”**).

### 0.5 Implementation helper

Centralize formatting in one place (e.g. `formatStep32RankedSlotsSummary(rankedChoices)` or extend existing slot helpers) so **lane**, **detail context**, **outcome bodies**, and **save helper** stay consistent.

---

## 1. Goals (from design spec)

| ID | Deliverable |
|----|-------------|
| G1 | **No** full four-slot path in outcome cards; show ranked context + **one** “Reserved for Step 3.4” row + one line about 3.3–3.4. |
| G2 | **Combined** Outcome + **“Who fills the reserved slot?”** in **one** bordered region with vertical divider (stack on narrow). |
| G3 | **Save** / **Leave open** directly under combined block; reservation scope copy **next to** Save. |
| G4 | **Suggested** badge primarily when **two** outcomes; neutral titling for **one** outcome. |
| G5 | **Coupled preview** `f(outcome, pca)`; invalid PCA ↔ outcome behavior finalized per spec §7. |
| G6 | **Rank display** follows **§0** everywhere on the detail panel. |

---

## 2. Workstreams

### 2.1 Model & view-model

- Extend or replace `outcome.rows` presentation with structured fields: `reservedFor34`, `rankedSummaryLine`, optional `rankedDetailLines[]` without four generic grid rows.
- Builders in `step32PreferredReviewModel` (or adjacent modules) produce **ordinal + interval** strings per §0.

### 2.2 `Step32PreferredReviewDetailPanel.tsx`

- Restructure layout: context → **combined** (outcome | PCA) → commit row.
- Remove nested card-in-card where possible; single outer border on combined block per dashboard flat-hierarchy guidance.
- Wire PCA `Select` to the same preview state as selected outcome.

### 2.3 Copy (`step32PreferredReviewCopy.ts`)

- New/updated strings: combined region headers, save hint placement, ordinal rank labels, **§0** compliance audit of all user-visible rank/slot lines.
- Remove or gate **“Recommended · Continuity”** per G4; human-first outcome titles.

### 2.4 Tests

- Unit tests for **§0** formatter(s) (ordinals, separators, edge cases: single rank, four ranks).
- Regression / component tests: detail panel renders reserved row only, combined layout smoke (if test stack supports it).

### 2.5 Mockup & docs

- Keep [`2026-04-15-step32-v2-visual-draft.html`](../mockups/2026-04-15-step32-v2-visual-draft.html) aligned with **§0** for stakeholder review.
- Keep design spec **§4** aligned with **§0** (this plan references both).

---

## 3. Suggested implementation order

1. **§0 formatters** + tests (no UI yet) — reduces churn in copy.  
2. Model / builder fields consumed by panel.  
3. Panel layout + combined block + commit row.  
4. Copy pass + chip / title ordinals.  
5. Manual QA against mockup + floating dialog on a schedule with ranked + two outcomes.

---

## 4. Out of scope for this plan file

- Step 3.4 allocator scoring changes.
- Changing reservation **semantics** in the engine (only presentation + coupling unless a bug is found).

---

## 5. Rollout note

Execute this plan in an **Agent** session with the design spec open; do not merge UI-only changes without updating or adding tests for formatters.
