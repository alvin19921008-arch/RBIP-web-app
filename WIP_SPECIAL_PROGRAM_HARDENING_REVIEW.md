# WIP — Special Program Flow Hardening Review

**Last Updated**: 2026-03-09  
**Status**: Bug chain fixed through schedule-page display. `F1`, `F2`, `F3`, and `F4` are fixed and regression-tested. `F5` to `F9` are open hardening / refactor findings.

---

## Why this exists

This file captures the special-program bug chain that was just debugged across:

- **Step 1** special-program availability semantics
- **Step 2.0** special-program override dialog seeding / runner selection
- **Step 2 allocation** therapist selection, PCA routing, and target-team derivation
- **Step 3 / pending math** special-program slot exclusion from general PCA capacity
- **Schedule-page display** special-program card styling, red-name treatment, and assigned-FTE counting

The main goal is to preserve:

1. **What failed**
2. **How each failure propagated downstream into wrong calculations**
3. **What has already been fixed**
4. **What still looks structurally fragile and should be refactored / hardened**

This file is both:

- a **review note** for future refactor work
- a **status tracker** for the current special-program hardening effort

---

## Observed Failure Chain

The bug that surfaced around Aggie / CRP was not one isolated defect. It was a **pipeline failure** where each stage trusted the output of the previous stage:

1. **Step 1 / availability semantics** could incorrectly hide or suppress the intended CRP runner
2. **Step 2.0 seeding** could revive stale `staffOverrides` fragments and pick the wrong runner anyway
3. **Step 2 allocation** could then route CRP PCA coverage to the wrong target team
4. **Step 3 / pending math** could count special-program slots inconsistently against general PCA capacity
5. **Schedule-page display** could still render the wrong slot/team as “special” because a different helper path still believed old CRP assumptions

That is why the user-visible symptom changed over time:

- first the runner was wrong
- then the runner became correct but the PCA target team was wrong
- then the target team became correct but the schedule card / assigned math was still wrong

This is the core architectural lesson: **special-program state is not safe unless the same effective program decision is reused all the way down the pipeline**.

---

## Main Risk Theme

The biggest remaining architectural risk is that the codebase still has **multiple definitions of “effective special-program state”**:

- raw dashboard `specialPrograms`
- normalized weekday config rows
- Step 2.0 override fragments in `staffOverrides`
- Step 2 runtime-adapted `modifiedSpecialPrograms`
- Step 3 slot-exclusion helpers
- schedule-page display helpers
- export-only mapping logic

When those paths drift, the system can enter a state where:

- Step 2 allocates using one slot/team interpretation
- Step 3 excludes capacity using another interpretation
- the schedule page renders a third interpretation

That is how a “UI bug” can become a **wrong PCA calculation bug**.

---

## Finding Index

| # | Severity | Area | Trigger Condition | Downstream Wrong-Calculation Impact | Status |
|---|---|---|---|---|---|
| F1 | **CRITICAL** | Step 1 / Step 2 runner availability semantics | A therapist is the canonical special-program runner, but legacy `specialProgramAvailable` or zero-FTE semantics suppress them | Wrong runner enters Step 2, so all downstream therapist/PCA/team decisions can start from the wrong source | **FIXED** |
| F2 | **CRITICAL** | Step 2.0 existing override seeding | `staffOverrides` contains stale special-program fragments from a previous runner | Step 2.0 loads the wrong therapist even though canonical weekday config says otherwise | **FIXED** |
| F3 | **CRITICAL** | Step 2 special-program PCA routing | Step 2 chooses the correct therapist runner, but PCA target team is still inferred from stale / non-explicit therapist tagging | Special-program PCA coverage is routed to the wrong team, reducing pending for the wrong team | **FIXED** |
| F4 | **HIGH** | Schedule-page display + assigned math | Allocation is correct, but display/count helpers still use hardcoded CRP slot/team assumptions | Special-program slot is counted as floating/general coverage, inflating `assigned` and rendering wrong card styling | **FIXED** |
| F5 | **CRITICAL** | Step 2.0 “Not running today” toggle | User disables a program in the dialog, but confirm emits no explicit “disabled” runtime state | Step 2/3 can still treat the program as active, reserving PCA capacity and distorting pending | **OPEN** |
| F6 | **HIGH** | Step 3 bootstrap slot exclusion | Step 3 rebuilds special-program slot sets from raw fields / stale fallback logic instead of canonical effective runtime state | Special-program coverage can be miscounted as ordinary team coverage, skewing pending before floating allocation starts | **OPEN** |
| F7 | **HIGH** | Display/read-side slot helpers | Display/count helpers read canonical weekday slots only, while capacity math reads Step 2 overrides too | Page rendering, drag protection, and capacity math can disagree on what slot is “special” | **OPEN** |
| F8 | **MEDIUM** | Step 3 reset / re-entry preservation | Re-entry occurs without a fresh explicit override fragment, especially for multi-team or non-primary-team preservation cases | Legitimate special-program slots can be stripped on reset, inflating later pending | **OPEN** |
| F9 | **MEDIUM** | Export / secondary display surfaces | Export/table code still carries old CRP/Robotic hardcoded slot-team assumptions | Exported schedule can diverge from live schedule and misrepresent special-program coverage | **OPEN** |

---

## Regression Results Convention

This WIP uses the following convention:

- **Each `F(N)` regression is cumulative at the time it is added**
- **When `F(N+1)` covers a later stage of the same bug chain, it becomes the authoritative latest result**
- Earlier `F` tests still remain useful as narrow guards, but the **latest higher-numbered test owns the newest truth** for overlapping behavior

Example:

- `F13` proved Step 2.0 seeding preferred the canonical therapist
- `F14` then proved downstream target-team routing respected that explicit therapist override
- `F15` and `F16` then became the latest confidence point for schedule-page slot/display correctness

So in the status sections below, the “Latest Result” line always points to the newest relevant `F` test, not the oldest one.

---

## Latest Regression Snapshot

**Ran on 2026-03-09**

- `tests/regression/f9-special-program-zero-fte-spt-runner.test.ts` — **PASS**
- `tests/regression/f10-crp-pca-target-follows-canonical-team.test.ts` — **PASS**
- `tests/regression/f11-special-program-capacity-uses-canonical-slots.test.ts` — **PASS**
- `tests/regression/f12-step1-special-program-availability-semantics.test.ts` — **PASS**
- `tests/regression/f13-crp-existing-override-prefers-canonical-therapist.test.ts` — **PASS**
- `tests/regression/f14-special-program-target-team-prefers-explicit-therapist-override.test.ts` — **PASS**
- `tests/regression/f15-special-program-display-slots-use-actual-program-slots.test.ts` — **PASS**
- `tests/regression/f16-special-program-slot-map-uses-actual-weekday-slots.test.ts` — **PASS**

**Current authoritative latest result**: `F16 PASS`  
This is the newest narrow regression in the current bug chain and should be read as the latest confidence point for special-program slot resolution used by display/count helper paths.

---

## Refactor / Streamline Direction

Before the detailed findings, the clearest refactor target is:

### 1. One effective runtime special-program resolver

Introduce one shared runtime resolver that returns, per program and weekday:

- `enabled`
- `effectiveSlots`
- `effectiveTherapistId`
- `effectiveTherapistFteSubtraction`
- `effectivePrimaryPcaId`
- `effectiveManualPcaCovers`
- `effectiveTargetTeam`
- `reservedPcaFte`

Every read/write consumer should reuse this same runtime shape instead of re-deriving from:

- raw `specialPrograms`
- raw `program.slots`
- raw `special_program_ids`
- ad hoc `CRP` / `Robotic` branches

### 2. Explicit negative state, not “absence means disabled”

If a program is “not running today”, that should be persisted as explicit runtime state, not implied by “no override emitted”.

### 3. Remove remaining UI-only hardcoded mappings

Anything still saying:

- `CRP -> slot 2 -> CPPC`
- `Robotic -> slots 1/2 SMM, 3/4 SFM`

outside the canonical runtime resolver should be treated as a drift risk until proven otherwise.

---

## Detailed Findings

---

### F1 — CRITICAL: Runner availability semantics can suppress the canonical special-program runner

**Area**:

- Step 1 leave semantics
- Step 2.0 therapist availability filtering

**Trigger / how it can happen**:

- a therapist is the canonical weekday runner
- their `fte_subtraction` is `0` or their special-program participation is represented through normalized config rather than older assumptions
- legacy UI semantics or a sticky `specialProgramAvailable: false` interpret them as unavailable

**Wrong-processing chain**:

1. Step 1 / override semantics treat the runner as unavailable
2. Step 2.0 therapist pool excludes the runner
3. Step 2.0 auto-seeding picks a secondary therapist
4. therapist team assignment shifts
5. special-program PCA target team derives from the wrong therapist
6. Step 3 / schedule page inherit the wrong base state

**Why this becomes a wrong calculation, not just wrong UI**:

The therapist runner is part of the allocation input model.  
If the wrong runner is selected, the wrong team receives special-program PCA routing, so team assigned-FTE and pending-FTE become wrong downstream.

**Regression coverage**:

- `F9` — zero-subtraction CRP/SPT runner semantics
- `F12` — Step 1 special-program availability semantics

**Latest Result**:

- `F12 PASS`

**Implementation status**:

- Added / refined Step 1 availability semantics helpers
- Moved toward `undefined = no explicit override` instead of sticky false semantics
- Adjusted availability behavior so zero-FTE SPT runner cases like Aggie still surface correctly when the leave state is ambiguous rather than truly full-day absent

**Code-quality / streamline suggestion**:

- keep Step 1 and Step 2.0 reading the **same availability helper** instead of each embedding slightly different “can this therapist still run the slot?” logic

---

### F2 — CRITICAL: Existing override seeding can revive stale `staffOverrides` fragments and override the canonical runner

**Area**:

- Step 2.0 initialization / existing override seed construction

**Trigger / how it can happen**:

- a previous run or stale persisted state leaves `specialProgramOverrides` fragments on a different therapist or PCA
- Step 2.0 reconstructs the override state by scanning `staffOverrides`
- the seed path trusts that stale fragment over current canonical weekday config

**Wrong-processing chain**:

1. stale override fragment is found first
2. Step 2.0 initializes with the wrong therapist
3. user sees the wrong runner preloaded
4. if accepted, Step 2 allocation follows the wrong therapist/team
5. pending/capacity and schedule display drift from the actual intended weekday config

**Why this becomes a wrong calculation**:

This corrupts the **seed state** for the allocation flow.  
The wrong runner then becomes the authoritative source for downstream team routing.

**Regression coverage**:

- `F13` — CRP existing override prefers canonical therapist

**Latest Result**:

- `F13 PASS`

**Implementation status**:

- Added `lib/utils/specialProgramOverrideSeed.ts`
- Introduced canonicalization while seeding existing program overrides
- Special-cased CRP to prefer the current canonical weekday therapist when available

**Code-quality / streamline suggestion**:

- keep all “existing override seed” logic in one helper and avoid duplicating CRP-specific preference rules in UI components

---

### F3 — CRITICAL: Step 2 special-program PCA routing can ignore the explicit therapist decision and route coverage to the wrong team

**Area**:

- Step 2 PCA allocation target-team derivation

**Trigger / how it can happen**:

- Step 2.0 correctly chooses the therapist
- but target-team derivation still reads stale therapist tagging or fallback team logic
- PCA allocator routes the special-program PCA to a different team from the chosen therapist

**Wrong-processing chain**:

1. Step 2.0 therapist decision is correct
2. target-team derivation ignores or under-prioritizes that decision
3. PCA allocation assigns special-program slot(s) to the wrong team
4. wrong team’s assigned PCA FTE increases
5. wrong team’s pending PCA FTE decreases
6. later Step 3 runs from a distorted base state

**Why this becomes a wrong calculation**:

This is a direct team-accounting error:

- one team is credited with PCA coverage it should not own
- another team remains under-covered but hidden by routing drift

**Regression coverage**:

- `F10` — CRP PCA target follows canonical team
- `F14` — explicit therapist override drives target team

**Latest Result**:

- `F14 PASS`

**Implementation status**:

- Added `lib/utils/specialProgramTargetTeam.ts`
- Updated Step 2 routing to prioritize the explicit therapist override from Step 2.0 when deriving target team

**Code-quality / streamline suggestion**:

- any consumer needing “program target team” should read one shared helper instead of inferring from raw therapist allocations ad hoc

---

### F4 — HIGH: schedule display and assigned-FTE math can drift from the actual allocated special-program slots

**Area**:

- schedule-page card styling
- schedule-page assigned-PCA counting

**Trigger / how it can happen**:

- allocation is already correct
- but display/count code still uses older hardcoded CRP assumptions or raw slot fields
- the page treats a special-program slot as ordinary floating/general team coverage

**Wrong-processing chain**:

1. Step 2 allocation writes correct special-program slot/team
2. display helper still thinks CRP special slot is somewhere else
3. page fails to render special-program card styling
4. page counts that slot inside ordinary `assigned`
5. user sees inflated general PCA assignment and incorrect card semantics

**Why this becomes a wrong calculation**:

At this stage the bug is no longer just cosmetic.  
The page-level assigned summary is part of how users judge whether the schedule is balanced; if special-program slots are counted as general slots, the summary is mathematically misleading.

**Regression coverage**:

- `F15` — display slots use actual program slots
- `F16` — shared slot map preserves actual weekday slots

**Latest Result**:

- `F16 PASS`

**Implementation status**:

- Added `lib/utils/specialProgramDisplay.ts`
- Added `lib/utils/specialProgramSlotMap.ts`
- Removed stale CRP hardcoding from schedule-page helper paths that were part of this bug chain

**Code-quality / streamline suggestion**:

- do not allow any display surface to classify special-program slots from local hardcoded mappings; require one shared slot-map helper or runtime resolver

---

### F5 — CRITICAL: Step 2.0 “Not running today” can be UI-only and fail to mutate runtime allocation state

**Area**:

- Step 2.0 dialog disable flow
- runtime override application

**Trigger / how it can happen**:

- user disables a special program in the Step 2.0 dialog
- dialog clears local override state and skips emitting overrides
- runtime model interprets “no override” as “use original dashboard program as-is”

**Wrong-processing chain**:

1. user sees staff/slots visually released in the dialog
2. confirm emits no explicit disabled marker
3. allocation runtime still keeps the program active
4. Step 2 can still allocate for it
5. Step 3 capacity can still reserve PCA FTE for it
6. pending math becomes lower than it should be for general PCA coverage

**Why this becomes a wrong calculation**:

Special-program reserved capacity is subtracted from the general PCA pool.  
If a disabled program still reserves capacity, average/pending PCA calculations become systematically wrong.

**Regression coverage**:

- No dedicated regression found yet

**Implementation status**:

- **OPEN**

**Recommended hardening**:

- introduce explicit `enabled: false` runtime state for a program/day instead of encoding disablement as “no override fragment”

---

### F6 — HIGH: Step 3 bootstrap still has a separate stale slot-exclusion path

**Area**:

- Step 3 bootstrap / `existingTeamPCAAssigned` seed construction

**Trigger / how it can happen**:

- Step 2 already changed the effective slots through canonical runtime logic or overrides
- Step 3 rebuilds special-slot sets from raw `program.slots[weekday]` and local fallback rules

**Wrong-processing chain**:

1. Step 2 uses one effective slot set
2. Step 3 bootstrap excludes a different slot set from general coverage
3. `existingTeamPCAAssigned` is wrong before Step 3 allocation even begins
4. pending FTE is under- or over-estimated
5. floating PCA distribution starts from a distorted base

**Why this becomes a wrong calculation**:

This is a pure pending-math bug: special-program coverage can be credited to the ordinary team pool when it should remain reserved.

**Regression coverage**:

- current regression suite partially covers canonical slot semantics (`F11`, `F15`, `F16`)
- no dedicated end-to-end Step 3 bootstrap regression located yet

**Implementation status**:

- **OPEN**

**Recommended hardening**:

- Step 3 bootstrap should consume the same effective runtime special-program model used by Step 2 and the schedule page

---

### F7 — HIGH: read-side helpers are override-blind while capacity math is override-aware

**Area**:

- schedule-page read helpers
- drag protection
- balance sanity checks
- capacity math

**Trigger / how it can happen**:

- Step 2.0 emits `requiredSlots` / PCA slot override decisions
- capacity math reads those overrides
- display helpers only read canonical weekday program slots

**Wrong-processing chain**:

1. one helper says a slot is reserved special-program capacity
2. another helper says the same slot is ordinary coverage
3. page-level assigned/balance/interaction logic drift apart

**Why this becomes a wrong calculation**:

The app can simultaneously:

- subtract reserved capacity correctly
- but still display or protect the wrong slot set

That is calculation / model drift even when the final numbers look close.

**Regression coverage**:

- partial helper-level coverage exists (`F11`, `F15`, `F16`)
- no integrated override-aware read-path regression located yet

**Implementation status**:

- **OPEN**

**Recommended hardening**:

- unify all read-side helpers behind one resolver that accepts `specialPrograms + weekday + staffOverrides`

---

### F8 — MEDIUM: Step 3 reset / re-entry can strip legitimate special-program slots

**Area**:

- Step 3 cleanup / reset / re-entry preservation

**Trigger / how it can happen**:

- re-entry occurs after Step 2 allocations already exist
- no explicit fresh `specialProgramOverrides` fragment is available for reconstruction
- fallback preservation trusts only the allocation’s primary team view

**Wrong-processing chain**:

1. a legitimate special-program slot is not preserved
2. Step 3 reset removes it from preserved allocations
3. pending is recomputed as if that coverage vanished
4. later Step 3 stages may over-allocate to compensate

**Why this becomes a wrong calculation**:

Reset/re-entry is supposed to preserve authoritative Step 2 state.  
If preserved coverage is dropped, pending FTE is inflated and floating PCA allocation becomes too aggressive.

**Regression coverage**:

- No dedicated reset/re-entry regression found yet for this case

**Implementation status**:

- **OPEN**

**Recommended hardening**:

- reset/re-entry should recover preserved special-program slots from the same effective runtime program model, not just local allocation shape

---

### F9 — MEDIUM: export / secondary display surfaces can still lag behind live schedule logic

**Area**:

- export tables
- secondary schedule views

**Trigger / how it can happen**:

- schedule page has already been fixed
- export helper still uses older CRP / Robotic hardcoded slot-team assumptions

**Wrong-processing chain**:

1. live schedule displays the correct special-program slot/team
2. export table classifies the same slot using old assumptions
3. exported artifact disagrees with live schedule

**Why this matters for calculation confidence**:

Even if export is not feeding allocation math back into the algorithm, it is still a **derived representation of assignment state**.  
If export disagrees with the live schedule, users lose confidence in the underlying numbers and may manually compensate for a bug that only exists in one surface.

**Regression coverage**:

- No export-specific regression found yet

**Implementation status**:

- **OPEN**

**Recommended hardening**:

- make export surfaces consume the same shared special-program slot/classification helper as the live schedule page

---

## Implementation Status Summary

| Finding | Status | What has been done |
|---|---|---|
| F1 | **FIXED** | Availability semantics refined so zero-subtraction / zero-FTE SPT runner cases are not wrongly suppressed; Step 1 and Step 2 runner availability behavior hardened |
| F2 | **FIXED** | Existing override seeding now canonicalizes stale fragments toward the current weekday runner via shared seed helper |
| F3 | **FIXED** | Step 2 PCA routing now prefers explicit therapist override to derive special-program target team |
| F4 | **FIXED** | Schedule display/count helpers moved off stale CRP hardcoding onto shared actual-slot helpers |
| F5 | **OPEN** | No explicit runtime disabled-program representation yet |
| F6 | **OPEN** | Step 3 bootstrap still has a separate slot-exclusion path to unify |
| F7 | **OPEN** | Override-aware effective slot reading is still not centralized for all display/read consumers |
| F8 | **OPEN** | Reset/re-entry preservation still relies on fallback logic that may be too weak |
| F9 | **OPEN** | Export / secondary display surfaces still need alignment with canonical slot helpers |

---

## Suggested Refactor Order

### P0 — correctness / drift removal

1. Fix `F5`: explicit disabled-program runtime state
2. Fix `F6`: Step 3 bootstrap must use canonical effective runtime slot state
3. Fix `F7`: unify override-aware read/display helpers

### P1 — state-preservation safety

4. Fix `F8`: reset/re-entry preservation from the same runtime resolver

### P2 — secondary surface alignment

5. Fix `F9`: export / dedicated schedule surfaces

### P3 — cleanup / maintainability

6. Collapse remaining `CRP` / `Robotic` ad hoc branches into shared runtime utilities
7. Replace “derive again from raw program object” code paths with a single effective runtime special-program model

---

## Future Test Additions

These are the highest-value missing regressions:

1. **Disabled program end-to-end**
   - Step 2.0 marks program not running
   - Step 2 allocation skips it
   - reserved PCA capacity excludes it
   - schedule page shows no special-program coverage for it

2. **Override-aware read path**
   - Step 2.0 `requiredSlots` override changes effective slot set
   - Step 3 bootstrap, schedule page, drag protection, and assigned math all agree on the same slot set

3. **Reset / re-entry preservation**
   - Step 2 special-program allocation exists
   - Step 3 reset/re-entry occurs
   - preserved special-program slots remain intact

4. **Export parity**
   - live schedule and export table classify the same special-program slot identically

---

## Bottom Line

The special-program bug chain is now fixed at the concrete failure points that affected Aggie / CRP:

- canonical runner selection
- stale override seeding
- target-team routing
- schedule-page special-program display / assigned math

But the review strongly suggests the app still needs one more round of hardening:

- **not just more bug fixes**
- but a **single shared effective special-program runtime model**

Without that refactor, the next bug is likely to be another version of the same problem:  
one layer will be “correct”, but another layer will still be reading a different definition of the same special-program state.
