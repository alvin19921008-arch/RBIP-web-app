# Floating PCA Step 3 UI Design

Status: approved UI direction for planning

Date: 2026-04-06

Depends on: `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`

## Summary
This document defines the UI direction for the revamped floating PCA flow in Step 3, with focus on Step 3.2 and Step 3.4.

The key decision is that the revamped UI must remain close to the current mostly automatic Step 3 experience. The interface should not require the user to manually walk team-by-team through allocator internals. Instead:
- Step 3.2 becomes an auto-generated preview plus exception handling step.
- Step 3.4 remains the final allocation run and the clearest reasoning surface.
- The UI stays step-wise, not merged into one crowded screen.

## Intent Summary

### Who
Charge nurses, schedule admins, and operations users reviewing floating PCA decisions under time pressure.

### Task
Quickly confirm whether the system should keep or relax preferred PCA when the top-ranked feasible slot cannot honor it, then understand the final allocation result without reverse-engineering the algorithm.

### Feel
Calm, precise, and operational. Dense enough for serious scheduling work, but reader-friendly for non-native English users and users who do not want to think like the allocator.

### Signature
A visible, plain-language slot ladder that explains the allocator in human terms:
- `1st choice`
- `2nd choice`
- `Other slots`
- `Gym`

The interface should communicate this ladder without forcing the user to manually operate it for every team.

## Domain Exploration

### Domain concepts
- shift coverage
- team order
- pending manpower
- ranked slot preference
- preferred PCA
- floor match
- exception handling
- final allocation reasoning

### Color world
The visual world should come from calm clinical operations rather than consumer SaaS:
- slate and blue-gray surfaces
- muted blue emphasis for selected or recommended decisions
- restrained amber for warnings or gym-risk states
- soft green only for confirmed or safe outcomes
- subtle purple for duplicate or extra-logic fallback

### Defaults to reject
1. Generic dashboard cards with equal visual weight everywhere.
 - Replace with step-wise surfaces where one thing is primary and everything else is subordinate.
2. Full manual wizard logic where the user repeatedly acts on each team.
 - Replace with auto-preview plus flagged exceptions.
3. Technical condition-heavy copy.
 - Replace with plain-language operational wording.

## Design Constraints
This UI should follow the existing RBIP component and layout rules:
- use `lucide-react` icons only
- use Radix `Select` components, never native `<select>`
- active selection buttons use `bg-blue-600 text-white`
- keep related metadata close to the control it belongs to
- avoid `justify-between` when it separates a control from its explanation
- use `border-border`, subtle shadows, and a single depth strategy
- keep dialogs at `max-w-2xl` only where justified

## Approved Interaction Principle
Step 3 should remain mostly automatic.

The UI must not turn Step 3.2 into a manual mini-solver that the user repeats for 8 teams.

Instead, the system should:
1. auto-read ranked slots, preferred PCA, gym avoid, and floor preference from dashboard inputs
2. auto-preview how it intends to handle those preferences
3. only ask the user for input on flagged exceptions

## Approved Attention Rule for Step 3.2
By default, only show teams that need attention when:
- the highest-ranked currently feasible slot cannot entertain preferred PCA

This rule was chosen because it stays closest to the user's intent and minimizes cognitive load.

Do not expand Step 3.2 to ask for decisions about every rank, continuity tradeoff, or duplicate fallback. Those remain allocator responsibilities unless the preferred-PCA question needs confirmation.

## Overall Wizard Structure

### Keep the step-wise flow
The revamped design should still feel like:
- Step 3.1: adjust
- Step 3.2: review exceptions
- Step 3.3: adjacent logic if needed
- Step 3.4: final result

It should not feel like one giant consolidated screen with all logic visible at once.

### Shared Step 3 shell
The four mini-steps should feel like one family, but not identical clones.

Shared shell elements:
- top-left title remains `Floating PCA allocation`
- top-right mini-step stepper remains visible on every mini-step
- current mini-step is highlighted with a soft filled treatment
- inactive mini-steps stay as plain text with separators, close to the current UI language
- body uses the same spacing, card radius, border softness, and text tone

The approved stepper style is closer to the current implementation than badge-heavy redesigns:
- active step in a soft pill
- other steps in plain text
- every step includes its short label, for example:
 - `3.1 Adjust`
 - `3.2 Preferred`
 - `3.3 Adjacent`
 - `3.4 Final`

### Shared visual principle
Preserve the current Step 3 "one-glance" behavior wherever possible.

That means:
- avoid large dashboard-like summary panels when a strip or inline line can convey the same thing faster
- prefer team strips and direct state on the team cards
- let users understand queue order and team status immediately without opening detail sections
- do not introduce heavy chrome that competes with the main task

### Visual hierarchy
Each step should answer these questions in order:

Step 3.2:
1. Do I need to do anything?
2. Which teams need my attention?
3. What is the recommended action?

Step 3.4:
1. Was pending met?
2. Which choices were fulfilled?
3. Why did the system choose this path?

## Step 3.2 Design

### Step 3.2 role
Step 3.2 becomes:
- auto-preview first
- exception handling second

It is not a place where the user manually simulates the allocator team by team.

### Top summary bar
At the top of Step 3.2, show a compact system-generated summary such as:
- `8 teams checked`
- `2 teams need attention`
- `6 teams will continue automatically`

Optional secondary lines:
- `1 team cannot match preferred PCA at 1st choice`
- `0 gym-risk cases`

The point of this bar is to answer immediately whether the user needs to do work.

Latest approved refinement:
- names only need to appear when they help the next action
- `8 teams checked` does not need the full team list
- `2 need attention` should include names
- `6 auto-continue` can be abbreviated, for example `SMM, SFM +4`
- `0 gym risk now` only needs `None`

### Default content
Only flagged teams should be expanded by default.

Non-flagged teams should not occupy major vertical space. They can be summarized in a collapsed line such as:
- `6 teams have no manual action needed`
- `Show all teams`

### Flagged team card structure
Each flagged team should use one self-contained card with this structure:

1. Header
- team name
- order position
- pending FTE
- short status badge such as `Needs decision`

2. Ranked slots lane
- plain-language mini-cards in order
- title uses ordinal wording, not technical shorthand

Recommended card titles:
- `1st choice`
- `2nd choice`
- `3rd choice`
- `4th choice`

Card content:
- slot label and time
- whether it is preferred, other, or gym

Example:
- `1st choice`
 - `Slot 1 · 0900-1030`
- `2nd choice`
 - `Slot 3 · 1330-1500`

Separate lower-priority lane:
- `Other slots`
- `Gym`

This is more readable than `Rank 1 Slot 1` or `#1 1`.

3. System recommendation panel
This panel should lead with plain language, for example:
- `No preferred PCA is available for 1st choice Slot 1.`
- `System plans to use floor PCA M for Slot 1 first.`
- `Preferred PCA A can still help at 2nd choice Slot 3 if needed.`

This panel must be written in short sentences. Avoid long conditional English.

4. User action row
Only one primary action should be emphasized.

Recommended controls:
- primary: `Use system plan`
- secondary: `Try to keep preferred PCA`
- tertiary: `Skip manual change`

5. Alternatives section
Alternatives should be collapsed by default behind a control such as:
- `Show alternatives`

Do not show a full list of candidate plans upfront unless the user asks for detail.

### Visual language for Step 3.2
The latest approved direction is to stay closer to the current Step 3.2 card strip layout.

Use:
- a horizontal team strip ordered by team priority
- direct highlight on team cards that need attention
- compact exception cards without the tall `3.1` control-card height
- direct time-range chips on the team card
- one explanation card below the strip for the selected flagged team

Avoid:
- large dashboard summary tiles dominating the screen
- forcing the user to learn a brand-new layout language in Step 3.2

### Team strip behavior in Step 3.2
- flagged teams should be visibly highlighted in the strip
- non-flagged teams can be dimmed or collapsed in meaning, but should still preserve queue context
- the strip should continue to communicate order at a glance
- the selected flagged team should drive the explanation card below

### Step 3.2 copy guidance
Prefer:
- `What the system plans now`
- `No preferred PCA is available for 1st choice Slot 1.`
- `System will use floor PCA M for Slot 1 first.`
- `Preferred PCA A may still be used for 2nd choice Slot 3.`

Avoid:
- `Current question`
- `can still continue into Rank 2 Slot 3 later if needed`
- technical condition jargon

### Step 3.2 information architecture
Lead the user through one obvious reading order:
1. summary bar
2. flagged team card
3. plain-language ranked slot lane
4. system recommendation
5. primary action

No other element should compete with the primary action area.

## Step 3.4 Design

### Step 3.4 role
Step 3.4 remains the best place to show:
- final team outcome
- slot-by-slot handling from slot 1 to 4
- why ranked, unranked, duplicate, or gym fallback happened

The user explicitly preferred this reasoning surface once it was separated from the crowded earlier mockup.

### Step 3.4 structure

1. Team summary header
For the active or hovered team, show:
- `Pending met`
- `Highest choice fulfilled: 2nd choice`
- `Preferred PCA used: Yes / No`
- `Gym used: No / Last resort`

2. Slot 1 to 4 board
Show the four slots clearly and literally.

This answers the user's direct question:
- yes, Step 3.4 is where the user should understand how slots 1 to 4 ended up being handled

Each slot tile should show:
- slot label and time
- category:
 - ranked choice
 - other slot
 - gym
- result line such as:
 - `Assigned by floor PCA fallback`
 - `Assigned by preferred PCA A`
 - `Unused`
 - `Blocked unless last resort`

3. Why-this-happened panel
A short reasoning panel in plain language, for example:
- `1st choice Slot 1 had to be solved before preferred PCA could be considered.`
- `System used floor PCA for Slot 1, then preferred PCA A for 2nd choice Slot 3.`
- `Gym was not used because a non-gym path remained.`

### Latest approved Step 3.4 shell
The latest approved direction is to make Step 3.4 feel like:
- selected team strip at top, in assignment order
- selected team's summary and slot outcomes grouped together visually
- reasons shown in bullet points

The summary pills and slot outcome strip should not look detached from the selected team.

Approved treatment:
- selected team stays highlighted in the team strip
- the detail block below visually reads as belonging to that selected team
- a small popover-like beak/tip may connect the detail block back to the selected team card

### Step 3.4 team strip
- teams remain ordered by assignment order, matching the earlier mini-steps
- this keeps the "one-glance" rhythm of the current UI
- the selected team can be switched from the same strip instead of introducing a different picker language

### Step 3.4 detail block
The selected team's detail area should include:
- one small header identifying the selected team
- summary pills such as `Highest choice fulfilled: 2nd`, `Preferred PCA used`, `Gym avoided`
- a slot-result strip for `1st choice`, `Other`, `2nd choice`, `Gym`
- bullet-point reasons below

This should read as one connected block for the selected team.

### Step 3.4 diagnostics style
The reasoning should feel operational, not algorithmic.

Prefer:
- `1st choice`
- `2nd choice`
- `Other slot`
- `Gym used only as last resort`

Avoid:
- Condition A/B/C language
- overly dense symbolic tags

## Copy System

### Ranked wording
Use plain ordinal language everywhere the user reads slot priority:
- `1st choice`
- `2nd choice`
- `3rd choice`
- `4th choice`

Reserve technical rank indexing for internal data only.

### Visibility / contrast rule
Important labels such as:
- `1st choice`
- `2nd choice`
- `Other`
- `Gym`
- `Floor PCA fallback`
- `Preferred PCA A`
- `Unused`

must remain readable at one glance. They should not be rendered so faint that they disappear into the card background.

### Status labels
Recommended labels:
- `Needs attention`
- `No action needed`
- `Using system plan`
- `Preferred PCA cannot be entertained here`
- `Preferred PCA still possible later`
- `Gym blocked unless last resort`

### CTA labels
Recommended action copy:
- `Use system plan`
- `Try to keep preferred PCA`
- `Show alternatives`
- `Continue to final allocation`

## Proposed Component Patterns

### Flagged team card
One card per flagged team in Step 3.2.

Contains:
- header metadata
- ranked slot lane
- lower-priority lane
- recommendation panel
- one primary action row

Approved refinement:
- Step 3.2 and Step 3.3 team cards are shorter than Step 3.1 cards because they do not need `+`, `-`, or drag controls

### Ranked slot mini-card
Pattern borrowed conceptually from Step 3.1 mini-cards:
- title = ordinal label
- content = actual slot and time
- optional note = preferred / other / gym

### Outcome slot tile
Used in Step 3.4 to show slot 1 to 4.

Should support states:
- ranked fulfilled
- other slot used
- duplicate fallback
- gym last resort
- unused

### Summary pills
Used only for high-level status in Step 3.4.
Must not replace the actual slot explanation board.

### Step 3.1 adjust strip
Step 3.1 should remain closest to the current UI.

Approved characteristics:
- one-glance team order strip
- direct pending controls on each team card
- optional non-floating/buffer assignment status line above
- no heavy active-team detail panel

The adjustment happens directly on the strip, not through a separate active-team card.

### Step 3.1 scarcity preview
The latest approved direction also keeps a lightweight scarcity preview in Step 3.1, but not as a heavy mode-comparison card.

Preferred wording:
- `Teams with 0 floating PCA (if run now): X`
- `Teams still short after allocation (if run now): Y`
- followed by the affected team names when needed

This preserves the useful preview behavior without keeping the older balanced-mode presentation.

### Step 3.3 adjacent shell
Step 3.3 should follow the same exception-first philosophy as Step 3.2, but use the existing adjacent-slot strip language.

Approved characteristics:
- only teams with adjacent opportunities need emphasis
- adjacent opportunity is signaled directly on the team card
- explanation card below tells the user what adjacent help is available
- same shell and stepper as the other mini-steps

## Trend Synthesis
Recent healthcare/admin and data-dense references reinforce these patterns:
- calm neutral surfaces with blue emphasis instead of loud color blocking
- compact cards with soft borders rather than harsh table grids
- workflow screens that show recommended actions first and secondary reasoning second
- compare/decision drawers used only when needed, not always expanded

These trends support the design, but do not replace the product-specific signature.

## Rejected UI Directions

### Rejected: full manual team-by-team review
Reason:
- too much cognitive load
- too far from the current automatic Step 3 behavior
- makes the user spend time acting like the allocator

### Rejected: all logic on one screen
Reason:
- too hard to know where to look first
- too many simultaneous concepts
- weak first-action clarity

### Rejected: heavy technical copy
Reason:
- difficult for non-native English readers
- increases comprehension time
- makes the interface feel like debugging output

## Example Step 3.2 Exception
Example flagged case:
- Team FO
- pending `0.5`
- `1st choice = Slot 1`
- `2nd choice = Slot 3`
- preferred PCA cannot cover Slot 1

UI should show:
- `1st choice` mini-card: `Slot 1 · 0900-1030`
- `2nd choice` mini-card: `Slot 3 · 1330-1500`
- recommendation panel:
 - `No preferred PCA is available for 1st choice Slot 1.`
 - `System plans to use floor PCA M for Slot 1 first.`
 - `Preferred PCA A may still be used for 2nd choice Slot 3.`
- actions:
 - `Use system plan`
 - `Try to keep preferred PCA`

## Accessibility and Readability Notes
- keep sentences short
- avoid idiomatic phrasing
- keep related data physically grouped
- do not hide slot identity behind symbolic shorthand
- do not make the user read a right-side drawer just to know what the recommended action is

## Primary Files / Areas
- `components/allocation/FloatingPCAConfigDialog.tsx`
- `components/allocation/TeamReservationCard.tsx`
- `components/allocation/PCABlock.tsx`
- `components/dashboard/PCAPreferencePanel.tsx`
- relevant Step 3 regression and UI tests

## Implementation Notes
- This UI spec is intentionally narrower than the allocator design spec.
- It does not change the approved allocator ladder.
- It changes how much of that ladder the user must actively comprehend.
- The preferred implementation should keep Step 3.2 narrow and exception-driven.
- Step 3.4 should remain the main place where the system explains final slot outcomes.
