# V2 Step 3.2 Visual Hierarchy Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the current V2 Step 3.2 UI into exact alignment with the approved visual hierarchy mockup and wording, without changing the underlying Step 3.2 / Step 3.4 allocation semantics.

**Architecture:** Keep the existing V2-only preview/reservation model and focus this pass on presentation hierarchy, copy, and selected-team-to-detail linkage. Implement the approved design by centralizing final visible copy in the Step 3.2 copy helper, collapsing the lane header and lane into one merged control surface, moving team preference context into Step 1, removing the duplicate recap surface, and adding a single Step-1-owned beak that visually links the selected team to the primary decision panel.

**Tech Stack:** TypeScript, React/Next.js dialog UI, Lucide icons, existing V2 Step 3.2 UI components in `components/allocation/step32V2/`, copy helpers in `lib/features/schedule/step32V2/`, focused Node regression tests via `npx tsx`, repo lint/build commands via npm.

---

## File Structure

### Source-of-truth references
- Reference only: `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`
- Reference only: `docs/superpowers/specs/2026-04-12-v2-step32-visual-hierarchy-refinement-design.md`
- Reference only: `/.superpowers/brainstorm/4890-1775968438/content/step32-option-a-refined-v2.html`

### Files to modify
- Modify: `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`
  - Add the approved visible-copy helpers so the final wording is testable and not buried inline.
- Modify: `components/allocation/step32V2/Step32PreferredReviewLane.tsx`
  - Convert from "summary card + separate lane" into one merged lane control block.
- Modify: `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx`
  - Make Step 1 the primary panel, move team context into Step 1, remove duplicate recap, rename actions to `Save`.
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`
  - Remove the Step 3.2 wrapper layout that implies a separate overview area, compute / pass the Step 1 beak position, and keep the decision flow top-to-down.
- Modify: `tests/regression/f92-step32-preferred-review-copy-contract.test.ts`
  - Extend the existing copy contract coverage to the final approved wording.

### Files that must stay behaviorally unchanged in this pass
- Do not modify allocation semantics in `lib/features/schedule/step3V2CommittedSelections.ts`
- Do not modify allocator behavior in `lib/algorithms/floatingPcaV2/*`
- Do not change Step 3.3 or Step 3.4 UI beyond any small shared helper reuse already in `FloatingPCAConfigDialogV2.tsx`

---

## Implementation Constraints

### Constraint 1: Follow the approved mockup hierarchy, not the earlier UI draft
The approved UI is the refined Option A mockup plus the wording decisions made after it.

This pass must preserve:
- one merged top lane control block
- one single lane
- one single Step 1 beak
- one top-to-down sequence: Step 1 -> Step 2 -> Step 3

This pass must remove:
- separate top overview box
- `8 teams` chip
- `Legend` label
- duplicate recap card
- `commit` wording
- `fallback` wording

### Constraint 2: The top block is one surface
`Step32PreferredReviewLane.tsx` must own the whole merged top surface:
- title
- one guidance sentence
- `Needs attention: Y`
- compact summary chips
- help affordance
- lane

Do not leave any extra Step 3.2 summary row in `FloatingPCAConfigDialogV2.tsx`.

### Constraint 3: One beak only
Only the Step 1 panel may render a beak.

Disallowed:
- a decorative beak on the lane block
- a second beak on the selected lane chip
- a second pointer elsewhere in the Step 3.2 flow

### Constraint 4: Step 1 owns the team context
`Preferred PCA list` and `Ranked slots` belong inside the Step 1 panel above the outcome cards.

Do not keep a separate recap surface just to repeat those values.

### Constraint 5: Final visible wording must be centralized and testable
At minimum, the following visible strings must come from pure helper functions in `step32PreferredReviewCopy.ts`:
- `How to read statuses`
- `Save decision`
- `Save selected outcome`
- `Preferred on later rank`
- `Preferred on later slot`

Avoid inline copies of these strings in TSX.

---

### Task 1: Lock the final visible wording and anti-drift copy contracts

**Files:**
- Modify: `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`
- Modify: `tests/regression/f92-step32-preferred-review-copy-contract.test.ts`

- [ ] **Step 1: Extend the copy contract test with the final approved wording**

Update `tests/regression/f92-step32-preferred-review-copy-contract.test.ts` to fail until the final visible wording is exposed through pure helper functions.

Use assertions like:

```ts
assert.equal(getStep32StatusHelpLabel(), 'How to read statuses')
assert.equal(getStep32SaveDecisionTitle(), 'Save decision')
assert.equal(getStep32SaveSelectedOutcomeLabel(), 'Save selected outcome')
assert.equal(getStep32LaterOutcomeTitle({ isRanked: true }), 'Preferred on later rank')
assert.equal(getStep32LaterOutcomeTitle({ isRanked: false }), 'Preferred on later slot')
```

Also add explicit anti-drift checks:

```ts
assert.equal(getStep32StatusHelpLabel().includes('Legend'), false)
assert.equal(getStep32SaveDecisionTitle().toLowerCase().includes('commit'), false)
assert.equal(getStep32LaterOutcomeTitle({ isRanked: false }).toLowerCase().includes('fallback'), false)
```

- [ ] **Step 2: Run the copy contract test and verify it fails**

Run:

```bash
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
```

Expected:
- FAIL because one or more of `getStep32StatusHelpLabel`, `getStep32SaveDecisionTitle`, `getStep32SaveSelectedOutcomeLabel`, or `getStep32LaterOutcomeTitle` does not exist yet

- [ ] **Step 3: Add the pure copy helpers in `step32PreferredReviewCopy.ts`**

Add helpers shaped like:

```ts
export function getStep32StatusHelpLabel(): string {
  return 'How to read statuses'
}

export function getStep32SaveDecisionTitle(): string {
  return 'Save decision'
}

export function getStep32SaveSelectedOutcomeLabel(): string {
  return 'Save selected outcome'
}

export function getStep32LaterOutcomeTitle(args: { isRanked: boolean }): string {
  return args.isRanked ? 'Preferred on later rank' : 'Preferred on later slot'
}
```

Then update any existing outcome-title helper logic to call `getStep32LaterOutcomeTitle()` instead of returning `Preferred later / fallback`.

- [ ] **Step 4: Re-run the copy contract test and verify it passes**

Run:

```bash
npx tsx tests/regression/f92-step32-preferred-review-copy-contract.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit the copy-contract slice**

```bash
git add lib/features/schedule/step32V2/step32PreferredReviewCopy.ts tests/regression/f92-step32-preferred-review-copy-contract.test.ts
git commit -m "test: lock step32 refined copy contract"
```

---

### Task 2: Refactor the lane into one merged top control block

**Files:**
- Modify: `components/allocation/step32V2/Step32PreferredReviewLane.tsx`
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`

- [ ] **Step 1: Remove the old separate Step 3.2 summary row from the dialog shell**

In `components/allocation/FloatingPCAConfigDialogV2.tsx`, make sure `renderStep32()` no longer renders any standalone Step 3.2 info row above the lane component.

The target shape is:

```tsx
<div className="min-w-0">
  <Step32PreferredReviewLane
    gymRiskTeams={reservationPreview.summary.gymRiskTeams}
    teamOrder={teamOrder}
    teamReviews={reservationPreview.teamReviews}
    selectedTeam={selectedStep32Team}
    onSelectTeam={setSelectedStep32Team}
  />
</div>
```

There should be no separate summary wrapper before `Step32PreferredReviewLane`.

- [ ] **Step 2: Make the lane component own the entire merged top surface**

Reshape `Step32PreferredReviewLane.tsx` so the outer surface contains:
- title: `Step 3.2 Preferred review`
- one sentence of guidance
- `Needs attention: Y`
- summary chips
- help affordance
- lane

Use a JSX structure like:

```tsx
<div className="rounded-xl border border-border bg-background px-4 py-3">
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <div className="text-sm font-semibold text-foreground">Step 3.2 Preferred review</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Scan the lane, pick the highlighted team, then work downward through the numbered actions.
      </div>
    </div>
    <Badge variant="outline">{`Needs attention: ${needsAttentionCount}`}</Badge>
  </div>
  {/* summary chips + help affordance */}
  {/* lane */}
</div>
```

- [ ] **Step 3: Remove the `8 teams` chip and keep only decision-relevant chips**

Keep only chips like:

```tsx
<Badge variant="outline">{`Matched ${matchedCount}`}</Badge>
<Badge variant="outline">{`Unavailable ${unavailableCount}`}</Badge>
{gymRiskTeams.length > 0 ? <Badge variant="outline">{`Gym risk: ${gymRiskTeams.join(' · ')}`}</Badge> : null}
```

Do not render a total-team-count chip.

- [ ] **Step 4: Replace the `Legend` affordance with `How to read statuses`**

Change the tooltip trigger label to:

```tsx
<button type="button" className="text-[11px] text-muted-foreground underline underline-offset-2">
  {getStep32StatusHelpLabel()}
</button>
```

If the current tooltip helper requires a non-button wrapper, keep the trigger accessible but make the visible text exactly `How to read statuses`.

- [ ] **Step 5: Remove category summary blocks from the top surface**

Delete the summary-grid/card section that restates:
- `Matched`
- `Alt path`
- `Unavailable`
- `No review`

Do not replace it with another overview block. The chips plus lane are sufficient.

- [ ] **Step 6: Run lint/build after the merged lane refactor**

Run:

```bash
npm run lint
npm run build
```

Expected:
- PASS

- [ ] **Step 7: Commit the merged-lane refactor**

```bash
git add components/allocation/FloatingPCAConfigDialogV2.tsx components/allocation/step32V2/Step32PreferredReviewLane.tsx
git commit -m "feat: merge step32 lane control block"
```

---

### Task 3: Reshape the detail panel into Step 1 -> Step 2 -> Step 3

**Files:**
- Modify: `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx`
- Modify: `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`

- [ ] **Step 1: Move team preference context into Step 1 and delete the duplicate recap card**

Inside `Step32PreferredReviewDetailPanel.tsx`, remove the separate recap surface that repeats:
- preferred PCA list
- ranked slots
- current decision summary lines

Instead, place the static team context directly under the Step 1 title:

```tsx
<div className="space-y-1 border-t border-sky-200/70 pt-3 text-sm text-muted-foreground">
  <div>{`Preferred PCA list: ${preferredNames}`}</div>
  {rankedChoicesSummary ? <div>{`Ranked slots: ${rankedChoicesSummary}`}</div> : null}
</div>
```

Delete the now-redundant recap block entirely.

- [ ] **Step 2: Update outcome titles to use the approved non-technical wording**

Any later-option outcome title logic must call the helper from Task 1:

```ts
title: getStep32LaterOutcomeTitle({ isRanked: laterPath.kind === 'ranked' })
```

Expected visible titles:
- `Recommended · Continuity`
- `Preferred on later rank`
- `Preferred on later slot`

- [ ] **Step 3: Rename the final action section to `Save decision`**

Replace any `Commit actions` title with:

```tsx
<div className="text-xs font-semibold uppercase tracking-wide text-sky-900/80 dark:text-sky-100/80">
  {getStep32SaveDecisionTitle()}
</div>
```

Replace the primary button label with:

```tsx
<Button type="button" onClick={onCommit}>
  {getStep32SaveSelectedOutcomeLabel()}
</Button>
```

- [ ] **Step 4: Keep Step 2 visually quieter than Step 1**

Ensure the PCA override area stays visually secondary by using a calmer surface and fewer competing labels.

The target shape is:

```tsx
<div className="rounded-xl border border-sky-200/80 bg-white/80 p-3">
  <div className="text-xs font-semibold uppercase tracking-wide text-sky-900/80">
    2. Change PCA only if needed
  </div>
  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
    <div>
      <div>{`Suggested PCA: ${selectedPcaName ?? 'None'}`}</div>
      <div className="text-xs text-muted-foreground">Other candidates stay hidden until requested.</div>
    </div>
    <Button type="button" variant="ghost" size="sm">Show other candidates</Button>
  </div>
</div>
```

- [ ] **Step 5: Run lint/build after the detail-panel hierarchy refactor**

Run:

```bash
npm run lint
npm run build
```

Expected:
- PASS

- [ ] **Step 6: Commit the detail-panel hierarchy refactor**

```bash
git add components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx lib/features/schedule/step32V2/step32PreferredReviewCopy.ts
git commit -m "feat: refine step32 detail hierarchy"
```

---

### Task 4: Add the single Step 1 beak and verify against the approved mockup

**Files:**
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`
- Modify: `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx`

- [ ] **Step 1: Add Step 3.2 selected-team button refs and beak measurement in the dialog**

Mirror the Step 3.4 measurement pattern, but for Step 3.2 only.

Add state and refs like:

```tsx
const step32DetailPanelRef = useRef<HTMLDivElement | null>(null)
const step32TeamButtonRefs = useRef<Map<Team, HTMLButtonElement>>(new Map())
const [step32DetailBeakCenterX, setStep32DetailBeakCenterX] = useState<number | null>(null)
```

Then add a `useLayoutEffect()` that:
- runs only for `currentStep === '3.2'`
- measures the selected team button against the Step 1 panel
- stores the clamped center X for the beak

- [ ] **Step 2: Pass ref/position props into the Step 3.2 detail panel**

Update the Step 3.2 detail-panel call site to pass:

```tsx
<Step32PreferredReviewDetailPanel
  detailPanelRef={step32DetailPanelRef}
  beakCenterX={step32DetailBeakCenterX}
  // existing props...
/>
```

Extend the detail-panel prop type accordingly.

- [ ] **Step 3: Render only one beak, attached to Step 1**

Inside `Step32PreferredReviewDetailPanel.tsx`, attach the beak to the Step 1 panel root only:

```tsx
<div ref={detailPanelRef} className="relative rounded-2xl border border-sky-200 bg-sky-50/40 p-4 shadow-sm">
  <div
    className="pointer-events-none absolute -top-1 z-10 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-sky-200 bg-sky-50/80"
    style={{ left: beakCenterX ?? 32 }}
    aria-hidden
  />
  {/* Step 1 content */}
</div>
```

If there is any other Step 3.2 beak/pointer element elsewhere, delete it.

- [ ] **Step 4: Verify the finished UI against the approved mockup and spec**

Manual review checklist:
- top area is one merged lane control block
- no `8 teams` chip
- help affordance says `How to read statuses`
- only one beak is visible
- beak belongs to Step 1
- no separate recap card exists
- Step 1 contains `Preferred PCA list` and `Ranked slots`
- Step 3 title says `Save decision`
- primary button says `Save selected outcome`
- no visible `fallback` or `commit` wording remains

Use the approved mockup file as the visual reference:

```text
/.superpowers/brainstorm/4890-1775968438/content/step32-option-a-refined-v2.html
```

- [ ] **Step 5: Run final verification**

Run:

```bash
npm run lint
npm run build
```

Expected:
- PASS

- [ ] **Step 6: Commit the beak/linkage slice**

```bash
git add components/allocation/FloatingPCAConfigDialogV2.tsx components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx
git commit -m "feat: anchor step32 detail panel to selected lane team"
```

---

## Self-Review

### Spec coverage
This plan covers the approved refinement spec requirements:
- one merged top lane block
- `Needs attention: Y`
- no `8 teams` chip
- `How to read statuses`
- one beak only
- no recap duplication
- team context inside Step 1
- `Save decision` / `Save selected outcome`
- no `fallback`

### Placeholder scan
No `TODO`, `TBD`, or "implement later" placeholders are allowed during execution. If the current component structure resists the exact hierarchy, refactor the component layout until the spec is satisfied instead of approximating it.

### Type consistency
This plan assumes the current V2 file paths:
- `components/allocation/step32V2/Step32PreferredReviewLane.tsx`
- `components/allocation/step32V2/Step32PreferredReviewDetailPanel.tsx`
- `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`

Do not accidentally implement against the older non-`V2` paths referenced in the earlier April 11 plan.
