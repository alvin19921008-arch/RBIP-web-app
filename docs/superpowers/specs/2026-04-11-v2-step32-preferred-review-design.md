# V2 Step 3.2 Preferred Review Design

Status: approved for implementation planning

Date: 2026-04-11

Owner: chat-approved with user

## Summary
This spec redesigns the V2-specific Step 3.2 dialog from a narrow "first feasible ranked slot exception review" into a broader preferred-PCA review surface.

The approved direction keeps the V2 ranked-slot allocator intact as the final authority for Step 3.4, but changes Step 3.2 so users can see and optionally reserve preferred-PCA outcomes with much better transparency.

The current V2 Step 3.2 is too narrow for the product intent because it:

- only evaluates teams that declare ranked slots
- only reasons about one selected ranked slot
- only highlights failure states
- hides successful or alternative-path preferred outcomes behind "No manual review needed"
- treats a committed Step 3.2 PCA as replacing the team's effective preferred PCA list in Step 3.4

The approved redesign keeps one single ordered team lane, simplifies the lane cards, expands the preview model, introduces explicit slot-path review in the detail panel, and changes Step 3.4 semantics so Step 3.2 commits behave like hard reservations without erasing the team's remaining preferred PCA set.

## Scope

### In scope
- V2 Step 3.2 lane and detail-panel redesign in `components/allocation/FloatingPCAConfigDialogV2.tsx`
- expansion of the Step 3.2 preview model in `lib/features/schedule/step3V2ReservationPreview.ts`
- Step 3.2 copy changes and state labels
- Step 3.2 reservation semantics for Step 3.4 handoff
- preserving visibility of all teams in a single ordered lane, including gray non-applicable teams
- optional use of upstream Step 2 provenance metadata as supporting detail in the Step 3.2 preview
- regression coverage for the new Step 3.2 preview and Step 3.4 preference-hand-off behavior

### Out of scope
- V1 Step 3.2 redesign
- Step 3.3 redesign beyond any copy or state alignment needed to keep the wizard coherent
- reworking the core ranked-slot Step 3.4 allocation order itself
- changing Step 2 business logic
- broad tooltip redesign unrelated to Step 3.2 preview data

## Problem Statement
The existing V2 Step 3.2 preview is currently shaped around a single concept: identify teams where the first ranked slot that has any feasible floating PCA does not have a preferred PCA candidate.

That is only one slice of the user story.

The actual product need is broader:

- users want to review preferred PCA outcomes even when the team ultimately does not need intervention
- users want to understand whether preferred PCA can still cover a later ranked slot or another usable slot
- users want teams with no Step 3.2 relevance to remain visible in order, but quiet
- users want interactive transparency similar to the legacy V1 reservation style rather than a fixed three-button decision with vague labels
- users do not want a Step 3.2 reservation to erase the rest of the team's preferred PCA options in Step 3.4

## Goals
- keep a single ordered lane across Step 3.2
- show every team in lane order, even when Step 3.2 is not applicable
- make lane cards low-density, status-first, and easy to scan
- move detailed reasoning and choices into the lower review panel
- broaden Step 3.2 to cover both success and failure preferred-PCA review paths
- support teams with preferred PCA but no ranked slots
- preserve the final ranked-slot Step 3.4 engine as the allocator of record
- treat Step 3.2 commits as stateful reservations, not as a rewrite of team preference identity

## Non-Goals
- do not turn Step 3.2 into a full alternative allocator separate from Step 3.4
- do not show the entire final Step 3.4 decision tree inside the lane cards
- do not introduce stacked or grouped lanes that hide the original Step 3.1 order spine
- do not make upstream Step 2 provenance the primary source of Step 3.2 state labels

## Locked Product Decisions

### 1. One single ordered lane
Step 3.2 keeps one horizontal team lane in Step 3.1 order.

- do not split into separate vertical lanes by status
- do not hide non-applicable teams
- keep the lane as the dialog's order spine

Rationale:

- Step 3.1 order remains the anchor for later review
- one lane is easier to scan in a modal than multiple stacked groups
- a single lane supports progressive disclosure: summary above, detail below

### 2. Non-applicable teams stay visible but gray
The following teams stay on the Step 3.2 lane but render as gray / non-applicable:

- no ranked slot and no preferred PCA
- ranked slot only and no preferred PCA

These teams are not hidden and are not treated as errors.

Approved label direction:

- use a compact neutral label such as `N/A`
- do not use a red error state for these teams
- do not show dense explanatory copy on the lane card itself

### 3. Step 3.2 is "Preferred PCA review", not "ranked-slot failure review"
Step 3.2 should review preferred-PCA outcomes across four team conditions:

- condition D: no preferred PCA, no preferred slot -> gray / non-applicable
- condition B: preferred slot(s) only, no preferred PCA -> gray / non-applicable
- condition C: preferred PCA(s) only, no preferred slot -> review applies
- condition A: preferred PCA(s) plus preferred slot(s) -> review applies

This uses the same high-level condition framing already present in `getTeamPreferenceInfo()`.

### 4. Lane is status-first, not explanation-first
Lane cards must remain low-density.

Approved lane contents:

- order label
- team name
- one icon
- one short status label

Do not keep the current dense combination of:

- pending
- assigned
- interval chip
- long state text

all on the lane card by default.

Those details belong in the lower review panel.

### 5. Approved Step 3.2 lane states
For teams where preferred review applies, the lane uses three semantic states:

- `Matched`
  - at least one preferred PCA can be matched on the system's current best path for that team
- `Alt slot`
  - no preferred PCA can cover the earliest feasible path, but a preferred PCA is still available on a later ranked slot or another usable slot
- `Unavailable`
  - no preferred PCA is currently available for the team

For teams where preferred review does not apply:

- `N/A`

### 6. Reuse the Step 3.4 icon grammar
The Step 3.2 lane should reuse the same visual language family already used in the V2 Step 3.4 lane.

Approved icon mapping:

- green `CheckCircle2` -> `Matched`
- amber `AlertCircle` -> `Alt slot`
- red `XCircle` -> `Unavailable`
- muted neutral dot / circle / no-accent icon -> `N/A`

Do not invent a custom half-check icon if a standard Lucide alert-style state communicates the meaning clearly enough.

### 7. Add a compact legend above the lane
Step 3.2 should include a small legend above the lane explaining the icon states.

Approved legend direction:

- green check = preferred matched
- amber alert = preferred available on another path
- red x = no preferred PCA available
- gray neutral = no preferred review needed

The legend should be compact and secondary. It exists to reduce first-read ambiguity, not to become a banner.

### 8. The lane should not carry the main interval chip
The lane must not carry long interval chips or long slot-path explanations by default.

Reason:

- the lane already contains order and state
- stuffing interval metadata into every card increases cognitive load quickly
- interval and slot-path detail should appear in the lower review panel for the selected team

If future UI needs a lane-side chip, it must be optional and only used when it meaningfully disambiguates state without crowding the card.

### 9. Lower detail panel becomes the primary explanation surface
The lower Step 3.2 panel is where:

- pending and assigned numbers appear
- preferred PCA list appears
- ranked / unranked / gym path options appear
- system suggestion appears
- reservation actions appear

This follows the dashboard principle of progressive disclosure:

- summary first in lane
- details on interaction

### 10. Slot cards in the detail panel become real interactions
The current ranked-slot grid is informational only. The redesign makes slot-path items real interaction targets.

Approved direction:

- each ranked or usable slot path is a selectable card / row
- selecting a slot-path reveals candidate PCA choices for that path
- the user may choose a preferred PCA if available or accept a system suggestion

This is intentionally closer to the legacy V1 reservation pattern than the current fixed three-button V2 flow.

Clarification:

- "closer to legacy V1 reservation style" applies to the interaction shape only
- it does not authorize reusing legacy V1 components or pushing V2 policy into shared helpers
- V2 Step 3.2 must remain implemented in V2-specific UI and preview layers

### 11. Preferred-only teams must participate in Step 3.2 review
Teams with preferred PCA(s) but no ranked slots must be reviewable in Step 3.2.

The review question for these teams is:

- can any preferred PCA cover any usable slot for this team before Step 3.4?

Approved rule:

- success is OR-based, not AND-based
- if any preferred PCA can cover a usable slot, the team can be treated as matched or alternative-path reviewable
- Step 3.2 must not try to reserve every preferred PCA for the same team

### 12. Step 3.2 commit semantics become "hard reservation, soft preference preservation"
When the user commits a Step 3.2 match:

- that team / slot / PCA assignment is reserved before Step 3.4
- pending reduces accordingly
- that PCA's remaining capacity reduces accordingly
- the tracker records the committed assignment as Step 3.2 ownership

But:

- the team's original preferred PCA list must remain available to Step 3.4 for remaining unmet pending
- committing PCA `A` does not rewrite the team's effective preferred PCA list to only `[A]`

This is the most important semantic change in this spec.

### 13. Step 3.4 must keep reasoning over remaining preferred PCA ids
If a team originally has preferred PCAs `[A, B]` and Step 3.2 commits `A` to one slot:

- Step 3.4 may continue using `A` again if legal and capacity remains
- Step 3.4 may also use `B`
- Step 3.4 must not collapse the team's preferred set to only the manually selected PCA

Approved rule:

- reservation state mutates assignment state
- reservation state does not redefine preference identity

### 14. V2 rank protection outranks preferred-PCA preference
The V2 Step 3.2 redesign must not weaken the ranked-slot-first principle already locked by the ranked-slot allocator design.

Approved rule:

- protecting the earliest satisfiable ranked slot remains higher priority than satisfying a preferred PCA wish
- Step 3.2 may expose preferred-PCA opportunities on later ranked or unranked slots
- those opportunities are subordinate to ranked-slot protection

This means Step 3.2 is allowed to show user-facing alternatives, but it must describe when those alternatives are merely transparent, recommended, or allowed only with a trade-off.

### 15. Showable vs committable vs committable-with-trade-off
The Step 3.2 preview must distinguish between paths that are:

- `showable`
  - visible for transparency in the review UI
- `committable`
  - valid to reserve without undercutting higher-priority ranked-slot protection or other approved V2 rules
- `committable_with_tradeoff`
  - valid to reserve while preserving ranked-slot protection, but doing so degrades a lower-priority quality signal such as continuity

This distinction is required so the UI does not imply that every visible later-slot preferred path is equally desirable.

### 16. Continuity is a lower-priority trade-off, not a prohibition
The approved Step 3.2 interaction model allows a user to choose a path that still protects the earliest satisfiable ranked slot, even if doing so reduces continuity.

Example:

- ranked `1 > 3`
- preferred PCA cannot cover `1` but can cover `3`
- floor PCA can cover `1 + 3`

System suggestion:

- floor PCA gets `1 + 3`

Why:

- rank #1 is still protected
- continuity is preserved

User override that remains allowed:

- floor PCA gets `1`
- preferred PCA gets `3`

Why this is allowed:

- rank #1 remains protected
- pending can still be met

Trade-off:

- continuity is reduced because the team now uses two PCAs instead of one

Approved UI requirement:

- Step 3.2 must surface this as an allowed override with explicit trade-off wording
- it must not present this path as equal to the system suggestion
- it must not describe this override as violating ranked-slot protection

## Approved UX Structure

### Step 3.2 top helper text
The header copy should describe Step 3.2 as preferred review, not only exception handling.

Approved copy direction:

- title area continues to use `Step 3.2 · Preferred`
- summary line should mention:
  - how many teams are under preferred review
  - how many are matched / alternative / unavailable
  - optionally how many are N/A

Avoid the current framing of:

- `checked`
- `need attention`
- `continue automatically`

because that language hides successful preferred outcomes.

### Step 3.2 lane card shape
Approved lane card shape:

- order row
- team name
- icon + short label row

Optional:

- small focus ring when selected
- gray cards remain visible but quiet

Do not show:

- pending
- assigned
- slot time chip
- long explanation sentence

on the lane card itself.

### Step 3.2 detail panel shape
Approved panel structure:

1. metadata strip
- team
- order in queue
- pending
- assigned
- preferred review state badge

2. preference summary
- preferred PCA list
- ranked slots list
- unranked usable slots list
- gym rule if relevant

3. slot-path chooser
- one card/row per ranked slot in order
- one compact "other usable slots" group if needed
- gym path only if it is relevant to the team's path

4. candidate chooser for selected path
- preferred PCA candidates first
- floor PCA candidates next
- non-floor candidates after
- system suggestion highlighted
- trade-off note shown when the selected path is valid but reduces continuity or another lower-priority quality signal

5. reservation actions
- `Commit selected match`
- `Leave open for Step 3.4`
- optional `Clear commit` when a reservation already exists

### Step 3.2 copy direction
Approved lane labels:

- `N/A`
- `Matched`
- `Alt slot`
- `Unavailable`

Approved detail-panel explanation direction:

- for `Matched`: `A preferred PCA can cover this team in the current path.`
- for `Alt slot`: `No preferred PCA covers the earliest feasible path, but a preferred PCA is still available on another usable slot.`
- for `Unavailable`: `No preferred PCA is currently available for this team. Step 3.4 may still use floor or non-floor PCA.`
- for preferred-only teams: `This team has preferred PCA choices but no ranked slots. Review whether a preferred PCA should be reserved before final allocation.`
- for trade-off paths: explain the specific cost, e.g. `Rank #1 stays protected, but continuity is reduced because the team would use 2 PCAs instead of 1.`

Retire the current button copy:

- `Use system plan`
- `Try to keep preferred PCA`
- `Skip manual change`

Those labels are too abstract relative to the new semantics.

## Preview Model Redesign

### Current limitation
The current preview model is too small:

- one `slot`
- one `pcaIds` list
- one `recommendedPcaId`
- one boolean for `preferredPcaMayStillHelpLater`

That shape cannot support:

- preferred-only teams
- multiple slot-path choices
- lane success states
- per-slot candidate lists
- explicit commit-vs-leave-open review

### Approved new preview responsibilities
The Step 3.2 preview model must answer, per team:

1. does preferred review apply?
2. what is the overall preferred-review state?
3. what ranked and unranked slot paths are usable?
4. which preferred PCA(s), floor PCA(s), and non-floor PCA(s) are feasible on each path?
5. what is the system-suggested path and system-suggested PCA for the team?
6. what reservation, if any, is already committed in Step 3.2?

### Approved preview shape (conceptual)
The exact type names may differ, but the data model should contain the following concepts.

- preview summary
  - reviewable team count
  - matched team count
  - alternative-path team count
  - unavailable team count
  - non-applicable team count

- per-team review
  - `reviewApplies: boolean`
  - `reviewState: 'not_applicable' | 'matched' | 'alternative' | 'unavailable'`
  - `preferenceCondition: 'A' | 'B' | 'C' | 'D'`
  - `pending`
  - `assignedSoFar`
  - `preferredPcaIds`
  - `preferredPcaNames`
  - `rankedChoices`
  - `unrankedChoices`
  - `gymChoice` if applicable
  - `systemSuggestedPathKey`
  - `systemSuggestedPcaId`
  - `systemSuggestedPcaName`
  - `selectedReservation` if a Step 3.2 reservation is currently chosen
  - `pathOptions`

- per-path option
  - `pathKey`
  - `kind: 'ranked' | 'unranked' | 'gym'`
  - `slot`
  - `timeRange`
  - `rank` when ranked
  - `isEarliestFeasiblePath`
  - `preferredCandidates`
  - `floorCandidates`
  - `nonFloorCandidates`
  - `systemSuggestedPcaId`
  - `systemSuggestedPcaName`
  - `pathState: 'preferred_available' | 'system_only' | 'unavailable'`
  - `commitState: 'showable' | 'committable' | 'committable_with_tradeoff' | 'blocked'`
  - `tradeoffKind?: 'continuity' | 'other'`
  - optional explanatory note

### Provenance / Step 2 ownership metadata
The codebase already has upstream coverage and ownership metadata, especially:

- `buildUpstreamCoverageKindByTeamSlot()` in `lib/algorithms/floatingPcaV2/provenance.ts`
- `step3OwnershipKind`
- `upstreamCoverageKind`

Approved decision:

- provenance metadata is useful as supplemental annotation in the Step 3.2 detail panel and reservation preview
- provenance metadata is not the primary driver of the Step 3.2 lane state

Allowed uses:

- annotating that a slot already has upstream Step 2 coverage
- explaining why a feasible path is already partially occupied
- preventing the preview from implying the slot is "empty" when it is only missing Step 3-owned floating coverage

Not allowed as the primary rule:

- do not derive `Matched / Alt slot / Unavailable / N/A` mainly from upstream provenance labels
- those lane states should remain driven by preferred-PCA feasibility and path review semantics

## Implementation Boundary Guardrails

### V2-only files for this feature
The Step 3.2 redesign ****must stay inside V2-scoped or V2-feature-scoped areas.****

Approved primary edit areas:

- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `lib/features/schedule/step3V2ReservationPreview.ts`
- `lib/features/schedule/step3V2CommittedSelections.ts`
- `lib/algorithms/floatingPcaV2/effectivePreferences.ts`
- `lib/algorithms/floatingPcaV2/provenance.ts` for optional supporting annotations only

### Do not reintroduce V1/V2 contamination
Do not implement this Step 3.2 redesign by:

- editing `components/allocation/FloatingPCAConfigDialog.tsx` for V2 behavior
- reusing `components/allocation/TeamReservationCard.tsx` as a shared V1/V2 component
- moving new V2 review-state policy into `lib/utils/floatingPCAHelpers.ts`
- broadening shared reservation helpers to encode V2-specific preferred-review semantics

Approved intent:

- V1 may inspire the interaction shape
- V2 owns the implementation

### Shared helpers remain mechanics-only
If implementation needs shared mechanics, they may stay in shared helpers.

But:

- new Step 3.2 lane-state derivation
- path classification
- trade-off detection
- commit-state classification

****ust remain in V2-specific preview or allocator-adjacent code, not shared legacy-facing helpers.****

## Step 3.4 Handoff Semantics

### Current behavior to replace
Current V2 `selected_only` behavior effectively replaces the team's preferred PCA ids with selected Step 3.2 PCA ids.

That is not the approved product behavior.

### Approved replacement behavior
Step 3.2 committed matches must influence Step 3.4 in two ways only:

1. mutate allocation state
- add the committed assignment to allocations
- reduce pending
- reduce PCA remaining FTE

2. preserve tracker / provenance
- record committed Step 3.2 ownership in the tracker
- keep provenance metadata accurate for later review surfaces

Step 3.2 commits must not:

- erase other preferred PCA ids for the team
- redefine which PCA counts as "preferred" for all remaining Step 3.4 work

### Effective preference policy after a Step 3.2 commit
Approved direction:

- keep the base preferred PCA list from DB for the team
- layer committed Step 3.2 reservations on top of state, not on top of preference identity

Implementation note:

- `buildEffectiveRankedPreferences()` in `lib/algorithms/floatingPcaV2/effectivePreferences.ts` should no longer replace effective `preferred_pca_ids` solely because a Step 3.2 reservation exists
- if a helper is still needed for selected reservations, it should produce reservation-specific state, not a rewritten preferred-PCA identity list

### Step 3.2 commit model
Approved reservation contract:

- a team may reserve a specific PCA on a specific slot-path in Step 3.2
- that reservation is applied before Step 3.4
- the rest of the team's unmet pending continues into Step 3.4 with the original preferred PCA list intact

## Intended File Areas

- `components/allocation/FloatingPCAConfigDialogV2.tsx`
  - Step 3.2 lane, legend, detail panel, reservation actions
- `lib/features/schedule/step3V2ReservationPreview.ts`
  - expanded Step 3.2 preview model and feasibility analysis
- `lib/features/schedule/step3V2CommittedSelections.ts`
  - reservation handoff semantics into Step 3.4
- `lib/algorithms/floatingPcaV2/effectivePreferences.ts`
  - remove or revise the current selected-only preference replacement behavior
- `lib/algorithms/floatingPcaV2/provenance.ts`
  - optional provenance annotations for preview model if needed
- tests in `tests/regression/`
  - preview-model behavior
  - lane-state classification
  - reservation handoff semantics

## Testing Strategy

### Required regression coverage
Add or update tests for:

1. condition D team
- no ranked slot
- no preferred PCA
- appears as `not_applicable`

2. condition B team
- ranked slots only
- no preferred PCA
- appears as `not_applicable`

3. condition C team matched
- preferred-only team
- at least one preferred PCA can cover a usable slot
- appears as `matched` or `alternative` depending on path policy

4. condition C team unavailable
- preferred-only team
- no preferred PCA can cover any usable slot
- appears as `unavailable`

5. condition A top-ranked match
- preferred PCA available on earliest feasible ranked slot
- appears as `matched`

6. condition A alternative-path case
- no preferred PCA on earliest feasible path
- preferred PCA available on later ranked or unranked path
- appears as `alternative`

7. condition A unavailable case
- no preferred PCA available anywhere
- appears as `unavailable`

8. lane visibility
- all teams remain present in lane order
- non-applicable teams are not hidden

9. reservation semantics
- committing PCA `A` in Step 3.2 does not erase `B` from the team's remaining preferred PCA set in Step 3.4

10. provenance annotation safety
- upstream Step 2 coverage may annotate a path
- but does not incorrectly flip the preferred-review state

11. copy contract
- lane labels remain `N/A`, `Matched`, `Alt slot`, `Unavailable`
- the detail panel uses the approved preferred-review explanation copy direction
- legacy ambiguous button labels do not reappear in the V2 Step 3.2 path

12. trade-off contract
- a later-slot preferred path may be `committable_with_tradeoff` when rank protection remains intact but continuity is reduced
- the UI explicitly communicates the trade-off instead of treating the path as blocked or fully equivalent to the system suggestion

## Open Technical Notes Resolved By This Spec

### 1. Should non-applicable teams be hidden?
No.

They remain on the lane in gray, preserving order context.

### 2. Should the lane show long category text?
No.

Use short labels and icon state only.

### 3. Should the main interval chip stay on the lane?
No.

Put interval and path detail in the lower panel.

### 4. Should upstream Step 2 provenance be reused?
Yes, but only as supporting annotation.

It is useful for explaining a path, not for deciding the primary Step 3.2 review state.

### 5. Should Step 3.2 commits replace the preferred PCA list?
No.

Committed matches must behave like reservations, not preference identity rewrites.

## Implementation Notes
- follow the existing V2-specific dialog boundary; do not back-port this UI to the legacy V1 dialog
- prefer progressive disclosure over packing more metadata into lane cards
- keep the lane visually aligned with the Step 3.4 team-lane family so the wizard feels coherent
- use subtle borders and flat hierarchy; avoid nested border-heavy cards inside the lower review panel

