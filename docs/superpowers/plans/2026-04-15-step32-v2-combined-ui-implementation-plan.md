# Step 3.2 (V2) — Combined outcome + PCA UI — implementation plan

**Status:** Planning  
**Date:** 2026-04-15  
**Design spec:** [`../specs/2026-04-15-step32-v2-combined-outcome-pca-ui-design.md`](../specs/2026-04-15-step32-v2-combined-outcome-pca-ui-design.md)  
**Visual mockup:** [`../mockups/2026-04-15-step32-v2-visual-draft.html`](../mockups/2026-04-15-step32-v2-visual-draft.html)

This plan covers the **revamped Step 3.2 detail UX** (combined Outcome + PCA, reservation-only preview, copy). **Production code is not modified until this plan is executed in a separate pass.**

### Strategy: targeted edits, not a rewrite

The locked design is **visually and structurally close** to the current V2 Step 3.2 (same wizard step, same lane + detail split, same outcomes + PCA + save semantics). **Do not rewrite every line.**

| Approach | Use |
|----------|-----|
| **Prefer** | **Edit / remove** markup and styles in existing components; **add** small pure helpers (formatters) and optional view-model fields; **adjust** copy keys. |
| **Avoid** | Replacing `FloatingPCAConfigDialogV2` Step 3.2 wiring, throwing away `Step32PreferredReviewLane`, or reimplementing reservation/commit logic unless a bug forces it. |

**Mostly unchanged (expect light touch only):**

- `FloatingPCAConfigDialogV2.tsx` — props and step routing into Step 3.2; only pass new bits if the panel needs them (often **no** change).
- `Step32PreferredReviewLane.tsx` — lane behavior and chips; unchanged unless copy/icons align with §0.5.
- `step3V2CommittedSelections` / scratch preview integration — **same contracts**; verify after UI churn.

**Primary change surface (~most lines touched):**

- `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx` — layout (combined grid), outcome button innards (no four-slot grid), commit block order, `aria-describedby` on Save.
- `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts` — new strings, parameterized save hint, title/section labels.
- `lib/features/schedule/step32V2/step32PreferredReviewModel.ts` (+ builders that fill `review`) — **extend** shapes so the panel can render **reserved line + interval** without parsing `outcome.rows`; deprecate/remove **UI-only** use of full row grid where the spec forbids it.

**Add (new small modules if helpful, not mandatory):**

- e.g. `step32RankedSummaryFormat.ts` or colocated formatters — ordinal ranked line, save-hint interpolation (tested).

**Remove / stop using in UI:**

- Full four-slot `outcome.rows` grid inside each outcome card; duplicate ranked summary inside cards; generic “row under Reserved” save copy — **replace** with §0.4–§0.6 patterns.

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

- **Do not** repeat the dashboard **ranked summary** inside each outcome card — it already appears once in the context block above. Outcome cards contain **title**, **optional Suggested badge**, **one reservation preview row**, and the **3.3–3.4** disclaimer line only.
- **Reservation preview (flat row):** match **Step 3.3** list coherence — e.g. `rounded-md border border-border` with a **single** text row (middot-separated), **no** nested tinted “card inside card” and **no** extra status icon inside that row. Example shape: `Reserved for Step 3.4 · {interval} · {PCA name}` (interval is the human-facing window for the reserved slot; align with §0.2 ordinals in surrounding copy where needed).

### 0.5 Preferred PCA availability (context row)

- **Single integrated line** next to the preferred name (not a separate pill plus a second sentence): **status icon + short text**.
  - **Available on 1st rank:** green check-style icon (e.g. `CircleCheck` / success semantic color) + **“Available on 1st rank”** (subsumes old “feasible on your 1st rank” wording).
  - **Not on 1st rank** (e.g. only 2nd): warning icon (e.g. `AlertTriangle` / caution semantic) + **“Available on 2nd rank only”** (exact wording can ship with copy review).
- Align with §0 ordinals (**1st rank**, **2nd rank**), not `#1` / `#2`.

### 0.6 Section numbering and outcome chrome

- In the combined block and commit area, use visible **step numbers** for scan order: **`1. Outcome`**, **`2. Who fills the reserved slot?`**, **`3. Save decision`** (match existing wizard literacy).
- **Save helper (`save-hint`):** render **above** the Leave open / Save buttons (same parent as `commit-row`, **before** the button row in DOM order). Copy is **parameterized**, not generic: **“Save reserves only {PCA name} · {interval} for Step 3.4”** (values from the current outcome + PCA selection; escape HTML in React).
- **Suggested** badge: when two outcomes exist, show on the allocator-default card only; position **top-right inside** the outcome control so the title row stays clean.
- Outcome **titles**: use **“Preferred PCA on 1st rank”** and **“Floor PCA on 1st rank”** (not “Preferred on 1st rank” alone). Apply a **subtle marker-style highlight** on the words **“Preferred PCA”** and **“Floor PCA”** only (CSS `linear-gradient` / `box-decoration-break` style — see mockup).

### 0.7 Implementation helper

Centralize formatting in one place (e.g. `formatStep32RankedSlotsSummary(rankedChoices)` or extend existing slot helpers) so **lane**, **detail context**, **reserved row**, and **save helper** stay consistent. **Do not** duplicate the ranked summary string inside outcome cards (§0.4).

---

## 1. Goals (from design spec)

| ID | Deliverable |
|----|-------------|
| G1 | **No** full four-slot path in outcome cards; **ranked summary once** in context (§0.2); each outcome shows **one** “Reserved for Step 3.4” row + one line about 3.3–3.4 — **no** repeated ranked line inside the card (§0.4). |
| G2 | **Combined** Outcome + **“Who fills the reserved slot?”** in **one** bordered region with vertical divider (stack on narrow). |
| G3 | **Save** / **Leave open** directly under combined block; **save helper paragraph above** the button row; copy **“Save reserves only {PCA} · {interval} for Step 3.4”** (see §0.6). |
| G4 | **Suggested** badge primarily when **two** outcomes; neutral titling for **one** outcome. |
| G5 | **Coupled preview** `f(outcome, pca)`; invalid PCA ↔ outcome behavior finalized per spec §7. |
| G6 | **Rank display** follows **§0** everywhere on the detail panel. |
| G7 | **Preferred availability** follows **§0.5** (icon + single phrase). |
| G8 | **Numbered headers** `1.` / `2.` / `3.` for Outcome, PCA, Save (§0.6). |
| G9 | **Suggested** badge top-right on the suggested outcome card only when comparing two outcomes (§0.6). |
| G10 | Outcome titles **“Preferred PCA on …”** / **“Floor PCA on …”** with **marker highlight** on the PCA-kind words only (§0.6). |

---

## 2. Workstreams

### 2.1 Model & view-model

- Extend or replace `outcome.rows` presentation with structured fields: `reservedFor34`, `rankedSummaryLine`, optional `rankedDetailLines[]` without four generic grid rows.
- Builders in `step32PreferredReviewModel` (or adjacent modules) produce **ordinal + interval** strings per §0.

### 2.2 `Step32PreferredReviewDetailPanel.tsx`

- Restructure layout: context → **combined** (outcome | PCA) → commit row.
- Remove nested card-in-card where possible; single outer border on combined block per dashboard flat-hierarchy guidance.
- Wire PCA `Select` to the same preview state as selected outcome.
- **Copy / layout:** §0.4 (no ranked repeat; flat **reserved** row per Step 3.3 border/divide pattern), §0.5 (availability row), §0.6 (numbered headers, **save-hint** DOM order above buttons + parameterized sentence, **Suggested** top-right, title strings + `.hl-preferred` / `.hl-floor` spans).

### 2.3 Copy (`step32PreferredReviewCopy.ts`)

- New/updated strings: **§0.6** section titles, **parameterized save hint** (`Save reserves only {pca} · {interval} for Step 3.4`), ordinal rank labels, **§0.5** availability strings, **§0** compliance audit of all user-visible rank/slot lines.
- Remove or gate **“Recommended · Continuity”** per G4; human-first outcome titles (**Preferred PCA on …** / **Floor PCA on …**).

### 2.4 Tests

- Unit tests for **§0** formatter(s) (ordinals, separators, edge cases: single rank, four ranks).
- Regression / component tests: detail panel renders reserved row only, combined layout smoke (if test stack supports it).

### 2.5 Mockup & docs

- Keep [`2026-04-15-step32-v2-visual-draft.html`](../mockups/2026-04-15-step32-v2-visual-draft.html) aligned with **§0–§0.6** (includes mock-only toggles where useful, e.g. 1st-rank vs 2nd-rank-only availability).
- Keep design spec **§4** aligned with **§0** and **§0.4–§0.6** (this plan references both).

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
