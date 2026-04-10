# Floating PCA V1/V2 Extraction Design

Status: proposed for implementation planning

Date: 2026-04-10

Owner: chat-approved with user

## Summary
This design separates the mixed V1/V2 floating PCA implementation so future AI-written changes can target the correct version boundary without accidentally editing shared behavior.

The current codebase still has multiple contamination surfaces:

- `lib/algorithms/pcaAllocationFloating.ts` contains both the standard/legacy-facing floating allocator path and the ranked V2 allocator path
- `lib/algorithms/pcaAllocation.ts` still contains an inline floating allocator path inside the main allocation flow
- `lib/utils/floatingPCAHelpers.ts` mixes truly shared slot/pending helpers with V2-ranked provenance and tracker policy

This extraction is intentionally robust rather than minimal. The goal is not just to move files; it is to make future edits safer by creating explicit version ownership, preserving behavior with characterization tests, and reducing places where agents can misread shared code as V2-only.

## Scope

### In scope
- separate the mixed V1/V2 implementations currently tied through `lib/algorithms/pcaAllocationFloating.ts`
- extract the inline floating allocator path inside `lib/algorithms/pcaAllocation.ts`
- define explicit homes for legacy-facing, V2-ranked, and truly shared floating PCA logic
- reduce high-risk helper contamination in `lib/utils/floatingPCAHelpers.ts`
- preserve current public allocator entrypoint names used by callers
- add characterization tests and guardrails that make future AI edits safer

### Out of scope
- changing Step 2 business logic
- redesigning V2 ranked-slot behavior
- renaming stable public entrypoints such as `allocateFloatingPCA_v1LegacyPreference` or `allocateFloatingPCA_v2RankedSlot`
- broad type cleanup outside the floating allocator boundary
- UI redesign unrelated to allocator extraction

## Problem Statement
The current floating allocator architecture is difficult for humans and agents to read safely.

Three specific contamination risks exist today:

### 1. Mixed engine file
`lib/algorithms/pcaAllocationFloating.ts` still contains both:

- the standard floating allocator used behind the V1/legacy-facing surface
- the ranked-slot V2 allocator and its orchestration glue

That makes it easy to edit a shared helper or interface there while intending to change only one flow.

### 2. Hidden second floating path
`lib/algorithms/pcaAllocation.ts` still contains an inline floating allocator path within the main `allocatePCA()` flow.

This is a separate source of confusion because an agent can inspect `pcaAllocationFloating.ts`, believe it has found the whole floating implementation, and still miss floating logic embedded inside `allocatePCA()`.

### 3. Shared helper contamination
`lib/utils/floatingPCAHelpers.ts` contains a mix of:

- pure shared mechanics
- legacy compatibility aliases
- V2-ranked provenance and tracker policy

This makes the file especially dangerous for later maintenance because the name suggests generic floating helpers while some functions now encode V2-only semantics.

## Goals
- make V1 and V2 ownership obvious from file structure alone
- preserve existing runtime behavior during the extraction
- preserve existing public entrypoint names for callers
- isolate high-risk V2 policy helpers from shared slot/pending mechanics
- prevent future agents from making cross-version edits accidentally
- keep future V2 engine tweaks possible without reopening V1 files

## Non-Goals
- do not merge V1 and V2 into one “cleaner” shared engine
- do not use this extraction to change allocator behavior
- do not broadly reorganize unrelated schedule or tooltip modules
- do not solve every type-sharing concern in one pass

## Locked Product / Architecture Decisions

### 1. Public entrypoint names stay stable
The external behavior-facing entrypoints remain:

- `allocateFloatingPCA_v1LegacyPreference`
- `allocateFloatingPCA_v2RankedSlot`

Even if the implementation files move, callers should not need a semantic rename in this refactor.

### 2. Version ownership must be readable from paths
The target structure must make it obvious which code belongs to:

- V1 / legacy-facing standard floating behavior
- V2 ranked-slot behavior
- truly shared mechanics

The codebase should not require an agent to infer this from comments alone.

### 3. Shared means “mechanics only”
The shared floating layer should only contain logic that is genuinely version-agnostic, such as:

- slot read/write helpers
- availability filtering
- allocation creation
- pending FTE update wrappers
- other pure mechanics that do not encode ranked-slot or duplicate semantics

Version-specific policy must not remain in the shared layer just because both flows happen to use it today.

### 4. Robustness beats minimal diff
This refactor should intentionally add guardrails:

- characterization tests
- file banners or warnings where needed
- clear wrapper names
- version-scoped modules for policy helpers

The goal is to reduce future rework in an all-AI-written codebase, not merely reduce current line count.

## Target Architecture

### 1. Legacy-facing floating allocator
Create a dedicated legacy-facing implementation area, for example:

- `lib/algorithms/floatingPcaLegacy/allocator.ts`

This area owns:

- the implementation currently exported as `allocateFloatingPCA_v1LegacyPreference`
- standard/legacy floating allocator orchestration
- any helpers used only by that path

### 2. Ranked V2 floating allocator
Use the existing V2 folder as the authoritative ranked implementation area:

- `lib/algorithms/floatingPcaV2/`

This area should own:

- the implementation behind `allocateFloatingPCA_v2RankedSlot`
- ranked-slot orchestration glue currently living in `pcaAllocationFloating.ts`
- V2-ranked repair loop orchestration
- V2-ranked provenance and tracker-policy helpers when they are algorithm-facing

### 3. Shared floating mechanics
Create a small shared floating layer, for example:

- `lib/algorithms/floatingPcaShared/`

This area should contain only version-neutral mechanics:

- slot ownership helpers
- generic assignment validators
- pending update wrappers
- availability filtering
- allocation creation

This shared layer must not encode ranked-slot semantics, duplicate-floating semantics, or legacy compatibility policy.

### 4. Explicit extraction of the inline path in `pcaAllocation.ts`
The inline floating path currently embedded in `allocatePCA()` must be extracted into an explicitly named module.

Approved direction:

- `pcaAllocation.ts` becomes orchestration and export surface only
- the extracted helper/module must have a name that makes its version/behavior role obvious
- no floating allocator implementation should remain hidden inside the middle of `allocatePCA()`

### 5. Transitional façade allowed
`lib/algorithms/pcaAllocationFloating.ts` may temporarily become a thin façade during the migration, but it must no longer remain a large mixed implementation file.

Approved end state:

- either delete the file after imports are updated
- or reduce it to a tiny re-export boundary with no substantive logic

## Shared Helper Boundary Rules

### Keep shared in `floatingPCAHelpers.ts` or a new shared core
Safe-to-share mechanics include:

- `TEAMS`, slot constants
- `getSlotTeam`, `setSlotTeam`
- `assignSlotIfValid`
- slot availability helpers
- `findAvailablePCAs`
- `assignSlotsToTeam`
- `assignOneSlotAndUpdatePending`
- `assignUpToPendingAndUpdatePending`
- `buildPreferredPCAMap`
- `getOrCreateAllocation`
- `getTeamExistingSlots`
- basic tracker append helpers such as `createEmptyTracker` and non-derived `recordAssignment`

### Extract or clearly isolate from shared helpers
Higher-risk functions that should move to version-scoped areas or be clearly isolated include:

- `buildUpstreamCoverageKindByTeamSlot`
- `buildStep3FloatingSelectionKey`
- `finalizeTrackerSummary` or at least its ranked-V2-specific derived summary logic
- ranked-slot preference interpretation if it cannot remain safely shared

### Preference helper policy
`getTeamPreferenceInfo()` is a special boundary risk because it currently serves both:

- legacy single-slot preference interpretation
- ranked-slot V2 interpretation

Approved direction:

- either split this into explicit legacy vs ranked preference readers
- or keep one function but add version-scoped wrappers with very explicit callsites and comments

Do not leave this as an ambiguous “generic preference reader” if its behavior continues to evolve for V2.

## Guardrail Strategy

### 1. Characterization tests are required before moving code
Before extraction, capture the current behavior of:

- `allocateFloatingPCA_v1LegacyPreference`
- `allocateFloatingPCA_v2RankedSlot`
- the floating branch currently exercised inside `allocatePCA()`

This extraction is behavior-preserving. The tests should prove that the refactor did not change runtime outcomes.

### 2. Version banners for remaining shared files
Where a file must stay shared after the extraction, add explicit warnings at file or function scope.

Examples of approved warning intent:

- this file contains pure shared mechanics only
- this function is ranked-V2 policy and must not be changed for V1 bugfixes without checking legacy callers
- this wrapper is behavior-named but re-exports a lower-level implementation

### 3. Review checklist for implementing agents
Every extraction task should explicitly review:

- does this change affect both V1 and V2?
- is this helper mechanics or policy?
- should this symbol live under `floatingPcaV2/`, `floatingPcaLegacy/`, or shared?
- does this refactor preserve current public entrypoint names?
- did this task accidentally change allocator behavior instead of only structure?

### 4. Avoid ambiguous file names for new homes
Do not create new mixed-sounding files like:

- `floatingPcaHelpers2.ts`
- `pcaAllocationFloatingNew.ts`
- `rankedShared.ts`

New files should make ownership obvious.

## Recommended File Targets

### Algorithm layer
- `lib/algorithms/floatingPcaLegacy/allocator.ts`
- `lib/algorithms/floatingPcaV2/allocator.ts`
- `lib/algorithms/floatingPcaShared/core.ts`
- extracted helper for the old inline `allocatePCA()` floating branch

### Wrappers / public API
- keep `lib/algorithms/floatingPcaV1LegacyPreference.ts`
- keep `lib/algorithms/floatingPcaV2RankedSlot.ts`
- update `lib/algorithms/pcaAllocation.ts` to import from explicit new homes

### Utility / semantics layer
- keep truly shared mechanics in `lib/utils/floatingPCAHelpers.ts` only if still clearly shared
- otherwise move V2 policy helpers into:
  - `lib/algorithms/floatingPcaV2/` when algorithm-facing
  - or a V2 feature path when UI/tracker-facing

## Execution Order

### Phase 1: lock behavior
- add or confirm characterization tests for legacy, ranked V2, and inline floating path behavior
- confirm current duplicate-floating and tooltip regressions remain green as a safety net

### Phase 2: extract ranked V2 first
- move ranked V2 orchestration out of `pcaAllocationFloating.ts`
- point `floatingPcaV2RankedSlot.ts` at the new ranked implementation home
- keep behavior unchanged

### Phase 3: extract legacy-facing standard allocator
- move the standard/legacy-facing allocator out of `pcaAllocationFloating.ts`
- point `floatingPcaV1LegacyPreference.ts` at the new legacy implementation home
- keep behavior unchanged

### Phase 4: extract the inline floating path from `pcaAllocation.ts`
- move the hidden floating branch into an explicitly named module
- reduce `pcaAllocation.ts` to orchestration/export responsibilities

### Phase 5: reduce helper contamination
- split or relocate V2 provenance/tracker-policy helpers from `floatingPCAHelpers.ts`
- keep pure mechanics shared
- add guardrail comments where full extraction is not yet worth it

### Phase 6: finalize boundaries
- reduce `pcaAllocationFloating.ts` to a tiny façade or remove it entirely
- verify no substantive mixed implementation remains
- run regression and lint verification

## Risks and How the Design Addresses Them

### Risk 1: “Fixing V2” accidentally changes V1
Mitigation:

- version-scoped implementation files
- stable behavior-named wrappers
- characterization tests for both paths

### Risk 2: agents miss the inline allocator in `pcaAllocation.ts`
Mitigation:

- extract it into an explicitly named module
- remove hidden floating implementation from the monolith

### Risk 3: shared helper files slowly drift back into mixed policy
Mitigation:

- shared layer limited to mechanics
- policy helpers extracted or clearly sectioned
- comment guardrails and review checklist

### Risk 4: the refactor becomes too broad and changes behavior
Mitigation:

- phase-based extraction
- move code first, simplify later
- no behavioral cleanup bundled into the extraction

## Acceptance Criteria
- `lib/algorithms/pcaAllocationFloating.ts` no longer contains mixed substantive V1/V2 implementations
- the floating branch hidden inside `lib/algorithms/pcaAllocation.ts` is extracted to an explicit module
- `allocateFloatingPCA_v1LegacyPreference` and `allocateFloatingPCA_v2RankedSlot` still exist and preserve behavior
- high-risk V2 provenance/tracker-policy helpers are no longer mixed into generic helper surfaces without clear ownership
- the shared layer contains mechanics, not version-specific policy
- characterization tests prove the extraction preserved behavior
- guardrails exist so future agents can tell which files are V1-only, V2-only, or truly shared

## Implementation Notes
- This design intentionally prioritizes future maintenance safety over minimal diff size.
- It is acceptable for the extraction to happen in multiple commits as long as each phase stays regression-proven.
- This design is intentionally separate from feature work on the ranked V2 engine so future V2 tweaks can proceed on a cleaner boundary.
