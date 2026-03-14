# WIP — PCA Runtime / Display State Hardening Review

**Last Updated**: 2026-03-14
**Status**: Round 1 bug-chain containment is fixed and regression-guarded. The underlying architecture is still fragile because allocation facts, override intent, and display-derived state are interpreted in multiple places. This file tracks the next hardening rounds so a new agent can continue from here.

---

## Why this exists

This file captures the PCA runtime / display bug chain that was just debugged across:

- **Step 2 substitution flow**: which floating PCA is covering which non-floating PCA
- **Step 2 special-program allocation**: which PCA is running the special program, on which slots, for which team
- **Step 3 bootstrap / pending math**: which assigned slots should be excluded from general floating pending
- **Schedule-page display surfaces**: PCA cards, dedicated PCA table, badges, green borders, and "Extra" tags
- **Save / reload**: which parts of runtime state are durable schedule intent vs transient UI/runtime output

The main goal is to preserve:

1. **What failed**
2. **Why each failure became a wrong calculation, not just a wrong UI**
3. **What was already fixed in the last bug-fix round**
4. **What is still structurally fragile and should be hardened / refactored**
5. **What round the next agent should pick up next**

This file is both:

- a **review note** for the runtime / display interpretation problem
- a **status tracker** for each hardening round
- a **handoff document** for the next agent session

---

## Observed Failure Chain

The bugs from the last chat were not independent defects. They were a **single interpretation-chain failure**:

1. Step 2 produced or updated allocation / override state
2. one helper interpreted that state as "special-program"
3. another helper interpreted it as "substitution"
4. another helper interpreted it as "ordinary floating coverage"
5. save / reload then preserved or rehydrated only part of that meaning
6. later steps reused the partially-correct state as if it were authoritative

That is why the symptom kept shifting:

- first the green border was wrong
- then the green border became transiently correct but disappeared after Step 2.2
- then the special-program 4-slot allocation displayed as only 2 slots
- then "Extra" tags leaked early
- then cleared schedules reloaded with floating PCA parked in `FO`

This is the core architectural lesson: **the system currently has more than one definition of what a PCA slot "means"**.

Until one shared runtime interpretation is reused end-to-end, a bug that looks like display drift can still corrupt:

- assigned PCA/team
- pending PCA/team
- Step 3 starting capacity
- save / reload state

---

## Main Risk Theme

The biggest remaining risk is that the codebase still mixes three different kinds of facts:

- **Allocation facts**: what slot/team/program was actually assigned in allocation rows
- **Intent facts**: what `staffOverrides` says the user meant (substitution, special-program override, leave/FTE edits)
- **Display-derived facts**: what the page infers later (`extraCoverageBySlot`, green border, special-program card split, etc.)

When those three are not separated cleanly, the system can enter a state where:

- Step 2 allocates with one interpretation
- Step 3 pending math excludes slots with another interpretation
- cards and tables render a third interpretation
- save / reload preserves only part of the chain

That is how a "fragile display bug" becomes a **wrong calculation bug**.

---

## Finding Index

| # | Severity | Area | Trigger Condition | Downstream Wrong-Calculation Impact | Status |
|---|---|---|---|---|---|
| F1 | **CRITICAL** | Step 3 pending math vs display runtime | Allocator special-program occupancy still uses raw weekday slots while UI/runtime uses override-aware runtime model | Team assigned / pending can disagree with display, so Step 3 can start from the wrong baseline | **COMPLETE** |
| F2 | **CRITICAL** | Fallback save path atomicity | Allocation rows write successfully but `daily_schedules` metadata write fails later | Reload can combine new rows with old overrides/workflow and produce false substitution / special / extra semantics | **COMPLETE** |
| F3 | **CRITICAL** | Baseline snapshot repair cache | Load repairs the snapshot for live state, but cache stores the raw un-repaired snapshot | Later cache-based hydration can revive stale staff references or old snapshot semantics | **COMPLETE** |
| F4 | **HIGH** | Step state / extra visibility inference | Cold load infers Step 3 from PCA-row presence instead of explicit persisted workflow/init state | Step 3-only semantics like "Extra" visibility can reappear even when the schedule was not truly in Step 3 | **COMPLETE** |
| F5 | **HIGH** | Substitution selection write path duplication | Page-level dialog handler and controller both write substitution intent | Later writes can overwrite Step 2.0 / Step 2.2 changes or leave stale substitution meaning | **COMPLETE** |
| F6 | **HIGH** | Auto-detected substitution ownership | Auto-detection matches overlapping missing slots without consuming ownership | One floating slot can be implicitly claimed by multiple non-floating targets; persisted display intent can drift from actual allocation | **COMPLETE** |
| F7 | **HIGH** | Card/table display parity | `PCABlock` and `PCADedicatedScheduleTable` still classify substitution / special / extra using different read paths | User can see different semantics in different schedule surfaces for the same runtime state | **COMPLETE** |
| F8 | **MEDIUM** | Page-local Step 3 runtime builders | `page.tsx` still rebuilds PCA runtime facts separately from controller/runtime helpers | Fixes can land in one path but not another, reintroducing stale fallback logic | **COMPLETE** |
| F9 | **MEDIUM** | `extraCoverageBySlot` stored inside `staffOverrides` | Derived display/runtime state is mixed into durable override state | Save/load and state merge logic must keep scrubbing UI-derived fields, which is error-prone and expensive | **COMPLETE** |

---

## Regression Results Convention

This WIP uses the following convention:

- **Each `F(N)` regression is cumulative at the time it is added**
- **The newest higher-numbered regression is the authoritative latest confidence point for that bug chain**
- Earlier tests remain useful as narrow guards, but the latest relevant test is the best snapshot of current behavior

For this runtime/display hardening chain, the known regression set from the last bug-fix round is:

- `f36` — Step 3 handoff summary and delta
- `f37` — extra coverage hidden before Step 3
- `f38` — PCA substitution display classification
- `f39` — Step 2 substitution display overrides
- `f40` — Step 2 substitution auto-detect follows slot teams
- `f41` — Step 3 runtime excludes special-program reservation slots
- `f42` — Step 2.2 preserves Step 2.1 overrides
- `f43` — Robotic shared allocation preserves slot-team routing
- `f44` — save cleared Step 2 does not persist baseline-view allocations
- `f45` — save RPC replaces stale PCA rows
- `f54` — card/table share one slot-classification helper for substitution/special parity

These regressions prove the recent bug chain is contained, but they do **not** yet prove the architecture is unified.

---

## Latest Regression Snapshot

**Last verified in the previous bug-fix round (before this WIP was created):**

- `tests/regression/f36-step3-handoff-summary-and-delta.test.ts` — intended guard for Step 2.2 -> Step 3 handoff summary
- `tests/regression/f37-extra-coverage-hidden-before-step3.test.ts` — **PASS**
- `tests/regression/f38-pca-substitution-display-classification.test.ts` — intended guard for substitution UI classification
- `tests/regression/f39-step2-substitution-display-overrides.test.ts` — **PASS**
- `tests/regression/f40-step2-substitution-auto-detect-slot-teams.test.ts` — **PASS**
- `tests/regression/f41-step3-runtime-excludes-special-program-reservation-slots.test.ts` — **PASS**
- `tests/regression/f42-step22-preserves-step21-overrides.test.ts` — **PASS**
- `tests/regression/f43-step2-robotic-shared-allocation-preserves-slot-team-routing.test.ts` — **PASS**
- `tests/regression/f44-save-cleared-step2-does-not-persist-baseline-view-allocations.test.ts` — **PASS**
- `tests/regression/f45-save-rpc-replaces-stale-pca-rows.test.ts` — **PASS**
- `tests/regression/f54-card-table-share-slot-classification-model.test.ts` — **PASS**

**Current authoritative latest result**: `F54 PASS`

Interpretation:

- the last bug-fix round closed the visible bug chain
- the remaining work is **structural hardening**, not symptom triage

---

## Round Tracker

### Round 1 — Bug-Chain Containment

**Goal**:

- fix the visible Step 2 / Step 3 handoff, substitution, Robotic slot-routing, extra-tag leak, and save/reload FO resurrection bugs

**Status**:

- **IN PROGRESS**

**What landed**:

- Step 2.2 -> Step 3 handoff summary / toast delta
- extra-coverage visibility gating before Step 3
- substitution display helper extraction
- Step 2.2 merge helper to avoid stale closure overwriting Step 2.1 state
- Step 3 runtime exclusion of Step 2 reserved special-program slots
- Robotic multi-weekday slot-team routing fix
- save normalization to keep therapist data but not floating PCA data before Step 3
- stale PCA-row replacement on save / reload

**Main regressions**:

- `f37`, `f39`, `f40`, `f41`, `f42`, `f43`, `f44`, `f45`

**What this round did not solve**:

- allocator/runtime/display are still not driven by one shared PCA slot-meaning model
- save/load architecture is still split between stronger and weaker branches

---

### Round 2 — Special-Program Occupancy Parity

**Goal**:

- make allocator pending math, bootstrap math, and display all read special-program slot ownership from the same runtime model

**Status**:

- **IN PROGRESS**

**Primary finding(s)**:

- `F1`

**What landed**:

- extracted shared runtime occupancy helper in `scheduleReservationRuntime`
- routed allocator pending subtraction through the shared override-aware occupancy model
- routed Step 3 bootstrap special-program subtraction through the same helper path
- threaded `staffOverrides` into allocator context so pending math can use runtime overrides

**Main regressions**:

- `f18`, `f46`

**Likely file cluster**:

- `lib/algorithms/pcaAllocation.ts`
- `lib/utils/scheduleReservationRuntime.ts`
- `lib/utils/specialProgramRuntimeModel.ts`
- `lib/features/schedule/step3Bootstrap.ts`
- `lib/utils/specialProgramDisplay.ts`

**Success condition**:

- no code path that decides "is this slot special-program occupancy?" should bypass the shared runtime resolver

---

### Round 3 — Substitution Ownership Unification

**Goal**:

- make substitution ownership authoritative at slot level, with one write path and one read model

**Status**:

- **COMPLETE**

**Primary finding(s)**:

- `F5`
- `F6`
- `F7`

**What landed**:

- removed page-side substitution intent persistence from Step 2.1 dialog confirm path
- controller now applies substitution intent through a single authoritative write path after Step 2 allocation result
- introduced explicit substitution write-authority helper for Step 2 persistence
- auto-detected substitution now consumes slot ownership per floating PCA during matching to prevent overlapping missing-slot claims
- introduced shared `pcaDisplayClassification` slot-meaning helper and routed both `PCABlock` and `PCADedicatedScheduleTable` through it for substitution/special-program parity

**Main regressions**:

- `f52`, `f53`, `f54`

**Likely file cluster**:

- `app/(dashboard)/schedule/page.tsx`
- `lib/features/schedule/substitutionDisplayPersistence.ts`
- `lib/features/schedule/pcaSubstitutionDisplay.ts`
- `lib/features/schedule/pcaDisplayClassification.ts`
- `components/allocation/PCABlock.tsx`
- `components/allocation/PCADedicatedScheduleTable.tsx`

**Success condition**:

- the same PCA slot cannot be ambiguously classified as general / substitute depending on surface
- card view and dedicated table produce identical substitution semantics for the same input

---

### Round 4 — Save / Load Authority and Transactionality

**Goal**:

- make persisted schedule state authoritative, atomic, and workflow-state-driven

**Status**:

- **COMPLETE**

**Primary finding(s)**:

- `F2`
- `F3`
- `F4`

**What landed**:

- fallback save now runs through rollback-backed atomic orchestration instead of separate row writes + later metadata write
- fallback metadata failure now triggers restoration of pre-save row and metadata snapshot to prevent mixed-generation persistence
- cache snapshot projection now prefers validated/repaired baseline snapshot data instead of raw DB baseline envelope data
- snapshot-derived calculations fallback now reads from the same validated baseline snapshot projection used for cache/return payloads
- load-time step/initialized projection now gives explicit persisted workflow state precedence over row-presence heuristics
- legacy fallback step gating no longer infers `floating-pca` initialization/completion from PCA row presence alone

**Main regressions**:

- `f49`, `f50`, `f51`

**Likely file cluster**:

- `lib/features/schedule/controller/useScheduleController.ts`
- `lib/features/schedule/saveNormalization.ts`
- `lib/features/schedule/saveReconciliation.ts`
- `supabase/migrations/20260313_update_save_schedule_v1_replace_pca_rows.sql`

**Success condition**:

- load never infers Step 3 from row presence when explicit workflow state exists
- cache stores repaired baseline state, not raw broken state
- fallback save cannot leave allocation rows and metadata out of sync

---

### Round 5 — Delete Shadow Runtime Builders

**Goal**:

- remove page-local runtime reconstruction and force the schedule page to consume shared runtime/controller outputs

**Status**:

- **COMPLETE**

**Primary finding(s)**:

- `F8`
- `F9`

**What landed**:

- extracted shared page Step 3 runtime prep helper in `pageStep3Runtime`
- deleted page-local `recalculateFromCurrentState()` / `buildPCADataFromCurrentState()` shadow builders
- rewired page Step 3 dialog prep and preview flow to consume the shared runtime/helper path
- moved extra coverage into a derived runtime/display layer instead of persisting it in `staffOverrides`
- save normalization now strips extra-coverage markers unconditionally

**Main regressions**:

- `f47`, `f48`

**Likely file cluster**:

- `app/(dashboard)/schedule/page.tsx`
- `lib/utils/staffRuntimeProjection.ts`
- `lib/utils/scheduleRuntimeProjection.ts`
- `lib/features/schedule/controller/useScheduleController.ts`

**Success condition**:

- the page stops rebuilding Step 3 runtime facts locally
- derived display/runtime state is no longer hidden inside `staffOverrides`

---

## Refactor / Streamline Direction

Before the detailed findings, the clearest refactor target is:

### 1. One shared `PcaInterpretation` runtime model

Introduce one shared read model per PCA allocation / slot that answers:

- which team owns this slot
- whether the slot is special-program occupancy
- which program owns it
- whether the slot is substitution coverage
- which non-floating PCA is being covered
- whether the slot is extra coverage
- whether the meaning is **authoritative** or **heuristically inferred**

Every consumer should read this model:

- Step 3 bootstrap
- allocator pending exclusion
- `PCABlock`
- `PCADedicatedScheduleTable`
- export / print surfaces
- save normalization

### 2. One authoritative substitution write path

Dialogs should return user choices, but only one controller/helper path should write:

- `substitutionForBySlot`
- related display state
- any auto-detected fallbacks

Do not let `page.tsx` and controller both mutate substitution meaning.

### 3. Derived runtime state must not live in the same bag as durable staff intent

`extraCoverageBySlot` is the clearest example.  
If it must exist, it should live in a dedicated derived runtime shape or serialization boundary, not in the same `staffOverrides` object as leave / FTE / substitution intent.

### 4. Save/load should trust explicit workflow state, not data-shape heuristics

If a schedule is Step 2-complete but not Step 3-complete, the load path should know that because it was explicitly saved as such, not because PCA rows happen to exist or not exist.

### 5. Delete duplicated page-local runtime reconstruction

Anything that rebuilds Step 3 runtime facts separately inside the page should be treated as drift risk until removed or delegated.

---

## Detailed Findings

---

### F1 — CRITICAL: allocator special-program occupancy still uses a different meaning from display/runtime occupancy

**Area**:

- Step 3 pending math
- allocator special-program subtraction

**Trigger / how it can happen**:

- special-program runtime meaning is changed by weekday-aware or override-aware logic
- UI/runtime helpers read the effective runtime model
- allocator still uses raw weekday slot helpers for occupancy subtraction

**Wrong-processing chain**:

1. Step 2 writes a special-program allocation with effective slot-team meaning
2. display/runtime helpers classify those slots using the runtime model
3. allocator subtracts special occupancy using a different slot set
4. team assigned-for-cap differs from what the page/runtime believes
5. Step 3 pending starts from the wrong value

**Why this becomes a wrong calculation**:

This is not cosmetic.  
The subtraction directly affects `pendingPCAFTEPerTeam`, which changes how much floating PCA Step 3 thinks each team still needs.

**Current status**:

- visible Robotic bug fixed in the last round
- shared runtime occupancy helper now classifies special-program slot-team ownership for both bootstrap and allocator pending subtraction
- override-aware parity is regression-guarded by `f46`
- this finding is closed unless another path bypasses the shared occupancy helper again

**Hardening direction**:

- route allocator occupancy checks through the same runtime occupancy helpers used by display/bootstrap

---

### F2 — CRITICAL: fallback save path can persist rows and metadata out of sync

**Area**:

- non-RPC save branch

**Trigger / how it can happen**:

- allocation tables are deleted / inserted successfully
- later `daily_schedules` update fails or partially diverges

**Wrong-processing chain**:

1. new PCA / therapist rows are written
2. old `staff_overrides` or `workflow_state` remain
3. reload hydrates allocations from one generation and metadata from another generation
4. display helpers infer substitution / special / extra semantics from stale metadata

**Why this becomes a wrong calculation**:

The schedule no longer has one coherent source of truth.  
Assigned rows and override/workflow semantics describe different schedules, so downstream pending and display logic can be mathematically wrong even if each source is internally valid.

**Current status**:

- fallback row + metadata writes now run under rollback-backed all-or-nothing orchestration
- metadata write failure in fallback now restores pre-save rows/metadata, guarded by `f49`
- this finding is closed unless another fallback path bypasses the rollback-aware save helper

**Hardening direction**:

- move all schedule persistence to one canonical transactional RPC, or make fallback match the same all-or-nothing semantics

---

### F3 — CRITICAL: repaired baseline snapshot can be discarded in favor of cached raw snapshot later

**Area**:

- load-time repair
- schedule cache

**Trigger / how it can happen**:

- load repairs a broken or legacy snapshot
- live state uses repaired snapshot
- cache stores the raw unwrapped DB snapshot instead of the repaired snapshot

**Wrong-processing chain**:

1. cold load looks correct
2. later navigation or cache hit restores older raw snapshot semantics
3. snapshot-backed helper paths reintroduce stale staff/team/program facts
4. downstream interpretation drifts without any new user action

**Why this becomes a wrong calculation**:

The same date can hydrate into two different runtime states depending on whether the source is cold DB load or cache.  
That makes pending / display behavior non-deterministic.

**Current status**:

- load now projects baseline snapshot for cache/return from validated data when repair succeeds, with raw fallback only when no validated projection is available
- snapshot-based calculations fallback now reads from that same projected baseline snapshot source
- regression `f50` guards repaired-vs-raw cache projection precedence
- this finding is closed unless another cache write path bypasses the validated snapshot projection

**Hardening direction**:

- cache validated/repaired snapshot data, never the raw pre-repair snapshot

---

### F4 — HIGH: Step 3 visibility and semantics are still partly inferred from row presence

**Area**:

- load-time step status
- extra-coverage visibility

**Trigger / how it can happen**:

- PCA rows exist for reasons other than true Step 3 completion
- load heuristics mark `floating-pca` as initialized/completed

**Wrong-processing chain**:

1. load sees PCA rows
2. schedule is treated as if Step 3 had progressed
3. Step 3-only display/runtime semantics are enabled
4. hidden or derived state becomes visible too early

**Why this becomes a wrong calculation**:

When step gating is wrong, the page can treat reserved / substitution / extra facts as fully materialized schedule truth before the workflow actually reached that state.  
That changes what the user sees as assigned vs pending and can mislead manual balancing decisions.

**Current status**:

- load step/initialized projection now prioritizes explicit persisted workflow state over row-presence inference
- load fallback no longer auto-initializes or auto-completes `floating-pca` from PCA rows alone
- regression `f51` guards workflow-precedence and no-floating-inference behavior
- this finding is closed unless another load path bypasses the workflow-first projection

**Hardening direction**:

- use explicit persisted workflow/init state as the authority on load

---

### F5 — HIGH: substitution intent still has more than one writer

**Area**:

- substitution dialog confirm
- controller Step 2 resume path

**Trigger / how it can happen**:

- dialog confirms selections
- page mutates `staffOverrides`
- controller later also writes substitution display state after algorithm resume

**Wrong-processing chain**:

1. user confirms substitution choices
2. one branch writes selection meaning based on render-time state
3. later branch writes merged/runtime meaning based on a different snapshot
4. stale or unrelated override fields can be lost or rewritten

**Why this becomes a wrong calculation**:

Substitution ownership determines which floating slots are interpreted as already committed Step 2 coverage.  
If that ownership drifts, Step 3 availability and pending can start from the wrong baseline.

**Current status**:

- substitution wizard confirm in page now relays selections only; it no longer mutates `staffOverrides`
- controller now owns substitution intent persistence through one authoritative Step 2 write helper
- regression `f52` guards that explicit Step 2 substitution writes replace stale same-team mappings while preserving unrelated override fields
- this finding is closed unless another non-controller write path mutates substitution intent again

**Hardening direction**:

- keep dialog result collection in the page, but move all mutation of substitution meaning into controller-only helpers

---

### F6 — HIGH: auto-detected substitution can assign ambiguous ownership to the same floating slots

**Area**:

- auto-detected substitution display fallback

**Trigger / how it can happen**:

- multiple non-floating PCA targets have overlapping missing slots
- auto-detection matches a floating allocation to the first compatible target
- matched slots are not consumed as owned

**Wrong-processing chain**:

1. one floating PCA covers a set of slots
2. auto-detection heuristically matches those slots to a target
3. another target can still conceptually claim the same slots
4. persisted `substitutionForBySlot` becomes last-write-wins rather than authoritative

**Why this becomes a wrong calculation**:

Even if the raw allocation rows are unchanged, the system can misclassify which slots are already committed to substitution coverage.  
That can distort later availability interpretation and manual reasoning about whether a slot is still free for floating allocation.

**Current status**:

- auto-detected substitution now consumes slot ownership per floating PCA during matching, preventing same-slot reassignment to later non-floating targets
- regression `f53` guards against last-write-wins overwrite when missing slots overlap across non-floating targets
- this finding is closed unless another auto-detection path bypasses slot-consumption semantics

**Hardening direction**:

- slot-level consumed ownership should be tracked during auto-detection, or auto-detection should be demoted to non-authoritative fallback only

---

### F7 — HIGH: the schedule card and the dedicated PCA table still do not share one classification model

**Area**:

- `PCABlock`
- `PCADedicatedScheduleTable`

**Trigger / how it can happen**:

- same allocation has mixed meaning across slots
- or override state is partially stale / partially explicit
- each surface reads different helper paths

**Wrong-processing chain**:

1. cards classify a slot one way
2. table classifies the same slot another way
3. user sees contradictory semantics in the same schedule
4. manual adjustment decisions become inconsistent

**Why this becomes a wrong calculation**:

The UI is part of the operational calculation loop.  
If two primary surfaces disagree about what coverage already exists, users will make balancing decisions from a mathematically misleading view of the schedule.

**Current status**:

- card/table slot classification now shares one helper (`derivePcaDisplayFlagsBySlot`) for substitution + special-program labeling semantics
- table no longer independently classifies substitution from raw override slot maps when card-side heuristics/runtime interpretation differs
- regression `f54` guards parity for inferred substitution and special-program slot styling suppression
- this finding is closed unless a surface bypasses the shared slot-classification helper

**Hardening direction**:

- both surfaces must render from one shared `PcaInterpretation` model

---

### F8 — MEDIUM: `page.tsx` still contains shadow runtime builders for Step 3

**Area**:

- page-local Step 3 preparation

**Trigger / how it can happen**:

- controller/runtime helper behavior changes
- page-local builders are not updated identically

**Wrong-processing chain**:

1. one bug fix lands in controller/runtime projection
2. page-local `recalculateFromCurrentState()` or `buildPCADataFromCurrentState()` keeps old fallback semantics
3. dialogs or handoff summary run on different logic from the controller

**Why this becomes a wrong calculation**:

Step 3 starts from whichever path happened to prepare the data.  
If page-local prep disagrees with controller/runtime prep, pending and available slots can differ before allocation even runs.

**Current status**:

- shared page Step 3 runtime prep now delegates to `buildScheduleRuntimeProjection`, `buildPcaAllocatorView`, and `computeStep3BootstrapState`
- `page.tsx` no longer keeps standalone `recalculateFromCurrentState()` / `buildPCADataFromCurrentState()` shadows
- regression `f47` now guards the delegation boundary

**Hardening direction**:

- delete or delegate page-local builders; page should consume shared runtime/controller output only

---

### F9 — MEDIUM: `extraCoverageBySlot` is still stored in `staffOverrides`, where durable intent and derived runtime state are mixed together

**Area**:

- display-derived state
- save normalization
- load/reload semantics

**Trigger / how it can happen**:

- Step 3 creates `extraCoverageBySlot`
- later step clear / save / load must remember to scrub it

**Wrong-processing chain**:

1. derived runtime flag is stored alongside durable override state
2. later save or merge path forgets to strip or isolate it
3. reload treats stale "Extra" meaning as if it were durable truth

**Why this becomes a wrong calculation**:

Extra coverage is derived from surplus floating allocation after pending is satisfied.  
If stale extra flags survive into another workflow state, the page can imply the team has surplus/extra coverage when the underlying pending context is no longer valid.

**Current status**:

- extra coverage is now derived from current PCA allocations/calculations in a dedicated runtime helper
- PCA display overlays merge derived extra markers at render time instead of storing them in durable `staffOverrides`
- save normalization strips extra markers unconditionally, and `f48` guards both the display merge and save boundary

**Hardening direction**:

- move extra coverage into a dedicated derived runtime layer or serialization boundary

---

## Recommended Next Slice

If a new agent picks this up, the safest next slice is:

### Slice A — unify special-program occupancy first

Reason:

- it has the cleanest boundary
- it directly affects pending math
- it reduces the risk that later substitution/display refactors are built on the wrong Step 3 baseline

**Concrete objective**:

- eliminate raw special-program occupancy reconstruction from `lib/algorithms/pcaAllocation.ts`
- make allocator, bootstrap, and display all classify special-program occupancy from the same runtime helper path

**Recommended proof set**:

- keep `f41` and `f43`
- add a new parity regression where:
  - Step 2 override changes effective program slots / slot-team routing
  - Step 3 pending math
  - schedule display slot labeling
  - export/runtime occupancy
  all agree on the same slot ownership

---

## Entry-Point File Map

- `app/(dashboard)/schedule/page.tsx`
  - page-local Step 3 prep
  - substitution dialog write path
  - extra-coverage sanitization for display

- `lib/features/schedule/controller/useScheduleController.ts`
  - save/load authority
  - workflow-state hydration
  - snapshot repair / caching
  - fallback save branch

- `lib/algorithms/pcaAllocation.ts`
  - Step 3 pending subtraction for special-program occupancy

- `lib/features/schedule/substitutionDisplayPersistence.ts`
  - auto-detect substitution ownership
  - override persistence

- `lib/features/schedule/pcaSubstitutionDisplay.ts`
  - green-border / substitution interpretation

- `components/allocation/PCABlock.tsx`
  - card-level interpretation and split allocation handling

- `components/allocation/PCADedicatedScheduleTable.tsx`
  - table-level interpretation and extra/substitution labeling

- `lib/utils/scheduleReservationRuntime.ts`
  - best current shared runtime helper for slot/program occupancy semantics

---

## Definition of Done

This hardening effort should not be considered complete until all of the following are true:

1. There is one shared slot-level PCA interpretation model used by cards, table, bootstrap, and export.
2. Allocator pending math and read-side display agree on special-program occupancy under override-driven routing.
3. Substitution intent has one authoritative writer and one authoritative slot-level representation.
4. Save/load uses explicit workflow state, not row-presence heuristics, to rehydrate Step semantics.
5. Cache stores repaired/validated snapshot state, not raw broken state.
6. Derived display/runtime state is no longer mixed into durable override state without a clear serialization boundary.

Until then, the visible bugs may be fixed, but the architecture is still vulnerable to another "patch one hole, leak appears downstream" cycle.
