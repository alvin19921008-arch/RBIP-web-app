# Step 3.2 (V2) — Combined outcome + PCA UI design

**Status:** Draft for review  
**Date:** 2026-04-15  
**Visual draft (static HTML):** [`../mockups/2026-04-15-step32-v2-visual-draft.html`](../mockups/2026-04-15-step32-v2-visual-draft.html) — open in a browser.  
**Implementation plan:** [`../plans/2026-04-15-step32-v2-combined-ui-implementation-plan.md`](../plans/2026-04-15-step32-v2-combined-ui-implementation-plan.md)  
**Scope:** Floating PCA wizard — Step 3.2 preferred + ranked slot reservation UX (`Step32PreferredReviewLane`, `Step32PreferredReviewDetailPanel`, related copy/model).

---

## 1. Problem statement

Users must **reserve at most one ranked slot** for Step 3.4 (preferred PCA path), or **leave open**. The current detail panel shows a **full multi-slot path** (four rows × PCA names), which reads like **confirming an entire day assignment**. In reality, **Save only commits the reservation for the highest-priority slot** implied by the chosen outcome; other slots are **not** fixed until Steps 3.3–3.4.

Additionally, **“1. Choose outcome”** and **“2. Change PCA”** are laid out as **independent columns**, so changing PCA feels like a **separate state machine** from the outcome. In the product model, **outcome and PCA are coupled**: choosing a different PCA can change which outcome is valid or which slot is reserved; they should read as **one composed choice** feeding a single preview, then **Save / Leave open**.

---

## 2. Design goals

| Goal | Meaning |
|------|--------|
| **One-sight truth** | At a glance: ranked context, **exactly what Save reserves**, and that **non-reserved coverage is not fixed** in 3.2. |
| **No false breadth** | Do **not** show all four slots per outcome card. Do **not** add an extra “allocator flavor” line explaining continuity vs rank (user explicitly removed this). |
| **Coupled controls** | Outcome selection and PCA selection sit at the **same hierarchy** (one visual “block”), like a **single segmented control** (reference: combined size + quantity bar above one primary button). |
| **“Recommended” discipline** | Use **Recommended / Suggested** badge **primarily when two outcomes** are shown for side-by-side comparison. For **a single** outcome path, avoid wording that nudges “click Save to get this whole story.” |
| **Lane unchanged** | Keep the **horizontal team lane** as the **queue / status at a glance** (icons + short labels); no requirement to move that into progressive disclosure. |

---

## 3. Non-goals

- Replacing Step 3.4 allocator logic or scoring.
- Teaching full surplus / continuity theory in copy.
- Showing **why** the allocator prefers one outcome (no optional second explanatory line per user decision).

---

## 4. Information architecture

### 4.1 Lane (`Step32PreferredReviewLane`)

**Unchanged intent:** order, team code, compact review state (e.g. Matched / N/A / Alt), selection affordance.

### 4.2 Detail panel — vertical flow

1. **Header strip (existing):** team, queue position, pending vs assigned floating, high-level pill (Matched / Alt / Unavailable).
2. **Context (read-only, flat):**
   - **Ranked slots** from dashboard: use **ordinal rank + interval only**, e.g. `1st rank: 1030–1200 · 2nd rank: 0900–1030`. Do **not** mix `#1` / `#2` with `slot 1`–`slot 4` in one line (confusing). If internal slot index must appear, use **`Slot n (interval)`** — never bare `slot n` without the interval. (See implementation plan §0.)
   - **Preferred PCA(s):** per-person row **only when statuses diverge**; otherwise one merged line (see §6).
3. **Primary block — “Reservation” (combined Action 1 + Action 2):**
   - **Same-level subheaders** (not nested cards inside cards): e.g. **Outcome** | **Who fills the reserved slot?** inside **one** rounded container with a **vertical divider** (desktop) or **stacked** sections with a single outer border (narrow).
   - **Outcome:** segmented control, radio group, or two equal cards **only** when there are two outcomes; each option shows:
     - Short title (neutral for single outcome; optional **Suggested** badge when `n === 2`).
     - **Ranked rows** that matter for *this team’s dashboard ranks* (not all four day slots).
     - **One explicit “Reserved for Step 3.4” row:** slot label + time + **PCA name** (the PCA that fills the reservation after Action 2).
     - **One line:** “Other slots: filled in Steps 3.3–3.4 (not fixed here).”
   - **PCA:** labeled **“Who fills the reserved slot?”** — `Select` or equivalent bound to **the same preview** as the outcome. Changing PCA **updates** the reserved-row preview (and may disable or switch outcome if incompatible — behavior defined in §7).
4. **Commit (existing step 3 semantics):**
   - **Leave open for Step 3.4** | **Save reservation** (or current exact labels if product prefers).
   - Helper text **adjacent to Save**, not only at bottom: **Saving reserves only the slot shown in “Reserved for Step 3.4” — not the whole day.**

---

## 5. Visual pattern: “combined bar” metaphor

Reference pattern (e-commerce): **one** rounded rectangle, **vertical split**, two controls **equal weight**, **one** full-width primary action below whose width **aligns** with the combined bar.

**Mapping:**

| Reference | Step 3.2 |
|-----------|----------|
| Left control (e.g. size) | **Outcome** (which tradeoff / which rank gets preferred vs floor). |
| Right control (e.g. quantity) | **PCA** (who fills the reserved slot; may include floor / non-preferred). |
| Add to cart | **Save reservation** / **Leave open** (unchanged product meaning). |

**Rules:**

- **One border** around Outcome + PCA; **divider** between them; avoid a second full card wrapping each half (dashboard flat-hierarchy spirit).
- **Primary actions** sit **immediately below** this block so the eye reads: *configure pair → commit*.

---

## 6. Preferred PCA copy (no ranked slots branch)

Out of scope for the combined bar’s inner layout detail, but **locked product direction** from prior discussion:

- **No** full slot path preview.
- Short eligibility: **would not** / **may** enter Step 3.4, with reasons (leave, blocking non-floating/special program, etc.).
- **Two preferred PCAs:** **per-person rows only when** availability or best slot **differs**; else one summary line.

*(Implementation can be a separate sub-panel or simplified column when `rankedChoices.length === 0`.)*

---

## 7. Interaction model (coupling)

**Principle:** The UI shows **one derived preview**: `preview = f(outcome, pca)`.

- **Selecting outcome** sets default PCA (existing: system-suggested preferred > floor > non-floor) and updates **Reserved for Step 3.4** row.
- **Selecting PCA:**
  - If still valid for current outcome: update **only** the reserved row’s name (and time/slot unchanged).
  - If invalid: either **snap** to nearest valid outcome (with toast or inline notice) or **clear** outcome selection — **pick one rule** in implementation plan; spec default: **prefer auto-selecting the remaining valid outcome** if exactly one remains, else require user to pick outcome again.

**Step 2 is not independent:** microcopy under PCA select should **not** read like a generic form; use **“Who fills the reserved slot?”** and optional one line: **“Changing PCA updates the reservation preview above.”**

---

## 8. “Recommended · Continuity” and titles

| Situation | UI |
|-----------|-----|
| **Two outcomes** | Mark **one** as **Suggested** (or keep internal allocator label in subtitle **only if** product still wants continuity language). Primary title = **human outcome** using ordinals (e.g. “Preferred on **1st rank**” / “Floor on **1st rank**”), not allocator jargon alone. |
| **One outcome** | **No** “Recommended” chip. Title = neutral description of what Save reserves. |

Do **not** rely on continuity vocabulary alone to imply Save scope.

---

## 9. Accessibility

- Combined region: `role="group"` with `aria-labelledby` pointing to a visible **“Build your reservation”** (or similar) heading, or two `aria-label`s on outcome vs PCA subregions.
- Reserved row: **programmatic association** with the Save button (e.g. description text including slot + name in `aria-describedby` on Save).
- Keyboard: tab order **Outcome → PCA → Leave open → Save** (or Save order per product).

---

## 10. Implementation touchpoints (existing codebase)

| Area | Files (indicative) |
|------|---------------------|
| Detail layout + outcome cards | `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx` |
| Lane | `components/allocation/step32V2/Step32PreferredReviewLane.tsx` |
| Copy | `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts` |
| Outcome rows / model | `lib/features/schedule/step32V2/step32PreferredReviewModel.ts` + builders that fill `outcome.rows` |

**Data change (conceptual):** outcome options should expose **structured fields** for UI: `rankedContextRows[]`, `reservedSlot: { rankLabel, timeRange, slot, pcaLabel }`, `omitFullDayGrid: true`, rather than rendering four generic rows from `outcome.rows`.

---

## 11. Success criteria

- Users can answer **after one read:** “What exactly does Save lock?” without inferring from a four-slot grid.
- Outcome + PCA feel **one unit**; Save sits **directly under** that unit with **one** reservation scope sentence.
- Two-outcome case remains **comparable** without implying multi-slot commit.

---

## 12. Self-review (spec quality)

- [x] No placeholder “TBD” for core layout; coupling rules explicit; non-goals explicit.
- [x] No contradiction with “no optional allocator flavor line.”
- [x] Scope limited to Step 3.2 presentation + coupling; allocator math out of scope.
- [x] Ambiguity: **invalid PCA after outcome change** — §7 gives default preference; implementation plan should nail exact behavior.

---

## Next step

Implementation plan: [`../plans/2026-04-15-step32-v2-combined-ui-implementation-plan.md`](../plans/2026-04-15-step32-v2-combined-ui-implementation-plan.md). After review, execute that plan in an Agent session (or extend it via **writing-plans** if you want more granular tasks).
