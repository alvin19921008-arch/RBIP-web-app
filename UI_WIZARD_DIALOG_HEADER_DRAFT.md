# Wizard Dialog Header – Visual Draft (Step 2 + Step 3)

This doc is a **visual/copy draft** for making Step dialogs feel like one cohesive wizard, while **preserving existing step numbering**:

- Step 2: **2.0 → 2.1 → 2.2**
- Step 3: **3.0 → 3.1 → 3.2 → 3.3 → 3.4**

It focuses on improving **scanability**, **consistency across dialog widths**, and reducing title length (especially Step 2.1), using common 2026 UX patterns:
- short action titles
- secondary “meta row” for step + context (team, weekday, progress)
- lightweight stepper chips that **wrap** on narrow widths

---

## Goals (what should feel better)

- **Single glance** tells the user: “Where am I?”, “What is this step for?”, “What’s next?”
- Step 2 and Step 3 dialogs share the **same header rhythm** even if their content widths differ.
- Titles do **not** become sentences (avoid “dash soup” like `... – Step 2.1 – GMC Team`).

---

## Proposed standard header template (applies to all wizard dialogs)

### Header anatomy

1. **Title**: 2–5 words, action-focused
2. **Meta row**: small muted line: `Step X.Y · Context · Progress`
3. **Stepper chips** (optional): shows mini-wizard stages; **wraps** on narrow widths
4. **Description**: 1 line; longer help goes into a collapsible `<details>`

### Visual layout (ASCII wireframe)

```text
┌───────────────────────────────────────────────────────────────┐
│ Title (short, task-focused)                                   │
│ Step 2.1 · Team GMC · 2 / 5                                   │
│ [2.0 Programs]  [2.1 Substitute]  [2.2 SPT]                   │  ← wraps if needed
│ One-line instruction / summary                                │
└───────────────────────────────────────────────────────────────┘
```

---

## Step 2 header draft

### Stepper labels (short + consistent)

- `2.0 Programs`
- `2.1 Substitute`
- `2.2 SPT`

These are short enough to render in **any dialog width**, and can `flex-wrap`.

---

### Step 2.0 – Special programs

**Current component**: `components/allocation/SpecialProgramOverrideDialog.tsx`  
**Current title**: `Special Program Overrides – Step 2.0`

#### Draft (Option A: shorter title + meta row)

```text
Special program overrides
Step 2.0 · Before allocation
[2.0 Programs]  2.1 Substitute  2.2 SPT
Pick therapist/PCA for each active special program.
```

Notes:
- “Before allocation” sets expectation without extra paragraphs.
- If no Step 2 wizard stepper is added yet, you can still adopt **title + meta** first.

---

### Step 2.1 – Substitution (wizard)

**Current component**: `components/allocation/NonFloatingSubstitutionDialog.tsx`  
**Current title**: `Non-Floating PCA Substitution – Step 2.1 – {Team} Team`

#### Problems today
- Title is a **full sentence** with multiple separators.
- Team context appears twice (title + wizard nav).

#### Draft (recommended)

```text
Choose substitutes
Step 2.1 · Team GMC · 2 / 5
2.0 Programs  [2.1 Substitute]  2.2 SPT
Cover missing non-floating slots using floating PCAs.
```

If *not* in wizard mode, drop the `2 / 5`:

```text
Choose substitutes
Step 2.1 · Team GMC
2.0 Programs  [2.1 Substitute]  2.2 SPT
Cover missing non-floating slots using floating PCAs.
```

Copy variants for the 1-line description (pick one):
- “Cover missing non-floating slots using floating PCAs.”
- “Assign floating PCAs to cover missing slots.”

---

### Step 2.2 – SPT day overrides

**Current component**: `components/allocation/SptFinalEditDialog.tsx`  
**Current title**: `SPT Final Edit – Step 2.2`

#### Draft

```text
SPT day overrides
Step 2.2 · Tue · Per-day only
2.0 Programs  2.1 Substitute  [2.2 SPT]
Review and override SPT slots/FTE for this day.
```

Notes:
- Keep the “per-day override” message, but put it into the meta row if possible.
- The weekday badge stays useful; consider standardizing it as `Step 2.2 · Tue`.

---

## Step 3 header draft

### Keep stepper; shorten title

**Current component**: `components/allocation/FloatingPCAConfigDialog.tsx`  
**Current title**: `Configure Floating PCA Allocation – Step {currentMiniStep}`  
**Current stepper**: `3.1 Adjust → 3.2 Preferred → 3.3 Adjacent`

#### Draft (recommended)

```text
Floating PCA allocation
Step 3.1 · Adjust
[3.1 Adjust]  3.2 Preferred  3.3 Adjacent
Set team order and pending FTE adjustments.
```

For Step 3.2:

```text
Floating PCA allocation
Step 3.2 · Preferred
3.1 Adjust  [3.2 Preferred]  3.3 Adjacent
Reserve preferred PCA/slot pairs before the final run.
```

For Step 3.3:

```text
Floating PCA allocation
Step 3.3 · Adjacent
3.1 Adjust  3.2 Preferred  [3.3 Adjacent]
Assign adjacent slots derived from special programs.
```

---

## Responsive behavior (important for Step 2 width mismatch)

### Stepper chips should wrap

When dialogs get narrow (e.g., smaller laptops, split view), stepper chips should wrap:

```text
[2.0 Programs]  [2.1 Substitute]
[2.2 SPT]
```

### Meta row should truncate safely

Meta row can truncate with ellipsis if needed:

```text
Step 2.1 · Team GMC · 2 / 12…
```

But avoid truncating the **team badge** itself; truncate trailing parts first.

---

## Recommended copy rules (consistency)

- **Title**: task/action (no step numbers, no “Team” word)
- **Meta row**: carries step number + team/weekday/progress
- Avoid repeated nouns: don’t say “Team” after a team badge.
- Avoid “dash soup”: prefer `·` separators in meta row.

---

## Implementation checklist (when you’re ready to code)

- [ ] Create a shared `WizardDialogHeader` component (optional but ideal).
- [ ] Step 2: add stepper chips (`2.0 / 2.1 / 2.2`) under header for all Step 2 dialogs.
- [ ] Step 2.1: shorten title; move team badge and wizard progress to meta row.
- [ ] Step 3: shorten title; keep the existing stepper; show step number in meta row.
- [ ] Ensure steppers use `flex flex-wrap gap-2` and chips use consistent styles.

