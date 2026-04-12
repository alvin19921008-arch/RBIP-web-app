# V2 Step 3.2 Visual Hierarchy Refinement Design

Status: approved for implementation planning

Date: 2026-04-12

Owner: chat-approved with user

References:
- Base Step 3.2 behavior spec: `docs/superpowers/specs/2026-04-11-v2-step32-preferred-review-design.md`
- Approved visual companion exploration: `/.superpowers/brainstorm/4890-1775968438/content/step32-option-a-refined-v2.html`

## Summary
This addendum locks the final approved visual hierarchy for the V2 Step 3.2 "Preferred review" dialog.

The earlier Step 3.2 redesign correctly broadened the review model, but the first implementation pass still felt visually ambiguous:

- users could not tell whether to read the left side or right side first
- overview surfaces duplicated lane information
- outcome summary surfaces duplicated each other
- the team lane did not clearly feel like the anchor for the detail panel
- button / section wording drifted toward technical English (`commit`, `fallback`)

The approved direction keeps the Step 3.2 logic and the single lane concept, but tightens the presentation into one clear top-to-bottom decision flow:

1. merged top lane control block
2. selected-team-linked Step 1 outcome panel
3. optional PCA override
4. save decision actions

This spec exists specifically to prevent implementation drift away from the approved mockup.

## Intent

### Who
Schedulers in the Hong Kong Hospital Authority setting who need to make quick allocation decisions inside a dense scheduling workflow.

### Task
Scan the ordered team lane, identify teams that need attention, review the selected team's preferred-PCA outcome choices, optionally change the PCA, and save the decision.

### Feel
Calm, precise, and guided. The interface should feel like an operator console, not like an exploratory dashboard.

### Signature
One single team-order lane stays at the top as the control spine for the whole step. The selected team visually points into Step 1 through a single beak attached to the detail panel.

## Scope

### In scope
- Step 3.2 presentation hierarchy in `components/allocation/FloatingPCAConfigDialogV2.tsx`
- Step 3.2 lane header / lane block structure
- Step 3.2 detail-panel section order and copy
- Step 3.2 wording refinements for titles and actions
- explicit anti-drift implementation constraints

### Out of scope
- Step 3.2 preview model logic changes beyond any copy/shape needs already captured in the base spec
- Step 3.3 redesign
- Step 3.4 redesign
- V1 dialog changes

## Approved Layout

### 1. Top lane control block is a single surface
The Step 3.2 top area must be one merged surface, not two stacked boxes.

Approved contents of this one block:

- Step title: `Step 3.2 Preferred review`
- one short guidance sentence
- `Needs attention: Y`
- compact status summary chips
- one help affordance for status meanings
- the single ordered team lane

Disallowed:

- one separate command/summary box above the lane
- one separate lane box below it
- duplicated summary surfaces that force the eye to re-parse the same status information twice

Rationale:

- users should read the top area as one control strip
- multiple stacked summary boxes create cognitive overload
- the lane is the anchor and should own the nearby context

### 2. Remove the `8 teams` chip
Do not show a chip for total team count.

Reason:

- the total number of teams is already common knowledge in this workflow
- it adds visual noise without helping decision-making

### 3. Summary chips stay compact and secondary
Approved examples:

- `Matched 1`
- `Unavailable 1`
- `Gym risk: CPPC`

These chips belong inside the merged top lane control block, above or beside the lane, not in a separate overview card.

### 4. Replace `Legend` wording
Do not use `Legend` as the visible affordance label.

Approved wording direction:

- `How to read statuses`

Reason:

- `Legend` is less natural in this product context
- the replacement should read as plain guidance, not as dashboard jargon

Implementation note:

- this remains a tooltip/popover/help affordance, not a read-only summary chip

### 5. One beak only
The final implementation must render only one beak relationship.

Approved rule:

- keep the beak attached to the Step 1 outcome panel
- position it so the panel clearly belongs to the selected team chip above
- do not render a second decorative beak from the lane block or selected chip itself

The desired relationship is:

- selected team above
- Step 1 panel below

and nothing else competing with that signal.

### 6. Step 1 panel is the primary decision surface
The first panel below the lane is the main decision surface.

Approved Step 1 order:

1. section label: `1. CHOOSE OUTCOME`
2. team-specific explanation
3. compact team preference context
4. outcome options

Approved team preference context inside Step 1:

- `Preferred PCA list: ...`
- `Ranked slots: ...`

This context should not live in a separate recap card below.

### 7. Remove the separate recap card
Do not render a standalone "Current decision recap" card if it repeats content already visible in the selected outcome card.

Reason:

- the selected outcome card already communicates the current choice
- a second summary card duplicates information and creates cognitive overload

Approved replacement:

- keep the selected outcome card as the decision summary
- move static team preference context into the Step 1 header area

### 8. Step 2 stays secondary and optional
The PCA override section remains the second step and is visually quieter than Step 1.

Approved intent:

- the system suggestion is the default
- "change PCA" is optional
- other candidates stay hidden until requested

This section should not visually compete with Step 1.

### 9. Step 3 wording uses `Save`, not `Commit`
The final wording must avoid technical language.

Approved section title:

- `3. SAVE DECISION`

Approved button copy:

- primary: `Save selected outcome`
- secondary: `Leave open for Step 3.4`

Avoid:

- `Commit`
- `Finalize`
- `Apply`

Reason:

- `Save` is clearer and more natural in the target environment
- the action is saving a reviewed decision, not performing a developer-style commit

### 10. Outcome title wording avoids `fallback`
Do not use `fallback` in the visible outcome title.

Approved wording rule:

- use `Preferred on later rank` when the later option is still a ranked choice
- use `Preferred on later slot` when the later option is a more general later-path case

Examples:

- `Recommended · Continuity`
- `Preferred on later rank`
- `Preferred on later slot`

Avoid:

- `Preferred later / fallback`

## Anti-Drift Rules

These rules are mandatory. If an implementation diverges from them, it is not following the approved design.

### A. Do not restore the split overview structure
Do not bring back:

- a separate summary strip above the lane
- a separate category-summary card competing with the lane
- duplicated top-level surfaces that restate lane states

### B. Do not restore duplicated outcome summaries
Do not keep both:

- a selected outcome summary card
- and a recap card saying the same thing again

The selected outcome card is sufficient.

### C. Do not introduce a second beak
The implementation must render only the Step 1 panel beak.

### D. Do not drift back to technical copy
Avoid technical or developer-flavored words in visible UI:

- `commit`
- `fallback`
- `finalize`

Prefer the approved wording in this document.

### E. Do not let Step 2 overpower Step 1
If the PCA override area becomes as visually heavy as the outcome chooser, the hierarchy has drifted.

Step 1 is the main decision.
Step 2 is optional adjustment.
Step 3 is save action.

## Component-Level Guidance

### `FloatingPCAConfigDialogV2.tsx`
- Step 3.2 should render one top lane control block
- the block should include title, guidance, `Needs attention: Y`, status chips, help affordance, and lane
- the detail flow below should read as Steps 1 -> 2 -> 3 in a single vertical sequence

### `Step32PreferredReviewLane.tsx`
- own the merged top lane control block, not just the lane itself
- support compact summary chips within the same surface
- expose a help affordance labeled `How to read statuses`
- keep the lane compact enough to remain one-glance at the approved dialog width
- do not render a decorative beak from the lane block

### `Step32PreferredReviewDetailPanel.tsx`
- Step 1 panel owns the beak
- Step 1 includes the preferred PCA list and ranked slot context above the outcome cards
- remove any separate recap surface that duplicates the selected outcome
- rename later-option copy away from `fallback`
- rename the final action section to `Save decision`

## Acceptance Criteria

The implementation is acceptable only if all of the following are true:

- the top area reads as one merged lane control block
- no `8 teams` chip is shown
- the help affordance is not labeled `Legend`
- only one beak is rendered, attached to Step 1
- the selected outcome is not summarized again in a separate recap card
- the preferred PCA list and ranked slots appear inside Step 1 context
- the final section title uses `SAVE DECISION`
- the primary button uses `Save selected outcome`
- later-option titles do not use `fallback`

## Test / Review Guidance

Implementation review should explicitly compare the final Step 3.2 UI against the approved mockup and this spec, not just against functional correctness.

The review question is not only "does it work?"

It is also:

- does the eye go top to down?
- does the lane clearly anchor the detail panel?
- is there only one beak?
- are duplicated summary surfaces gone?
- does the copy match the approved wording?

If any of those answers is no, the implementation has drifted and should be corrected before being considered complete.
