# SchedulePageClient Round 4 Maintainability Debulking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the remaining ~5k-line `features/schedule/ui/SchedulePageClient.tsx` by extracting cohesive maintainability boundaries before Round 5 performance work.

**Architecture:** `SchedulePageClient` remains the client orchestrator. Round 4 extracts UI state, view-model, loading/calendar chrome, display projections, step-clear actions, and dev harness wiring into focused modules under `features/schedule/ui/`, while preserving all schedule allocation invariants from `ARCHITECTURE_ESSENTIALS`. Round 4 does not implement bundle splitting or dynamic-import behavior changes; it only prepares Round 5 performance candidates.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind, `@dnd-kit`, Supabase client, Playwright smoke tests.

---

## Source Spec

Primary spec: `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-spec.md`

Authoritative references:

- `docs/schedule-architecture-core.md`
- `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`
- `docs/superpowers/plans/2026-04-24-schedule-page-client-round3-decomposition-spec.md`
- `docs/superpowers/plans/2026-04-24-schedule-page-client-round3-decomposition-implementation-plan.md`
- `docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md`

---

## Progress Tracker

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| R4-40 | Baseline and current map | Done | 2026-04-28: `wc -l` `5009`; anchors refreshed via workspace `rg` tool because shell `rg` was unavailable; architecture invariants re-read; gates green on rerun (`npm run lint` pass with warnings, `npm run build` pass, `npm run test:smoke` pass with skipped smoke cases only). |
| R4-41 | Grid interaction state and overlay view-model | Done | 2026-04-28: extracted transient grid interaction state + overlay grouped prop assembly into `features/schedule/ui/hooks/useScheduleGridInteractionState.ts`, rewired `features/schedule/ui/SchedulePageClient.tsx`; line delta `5009 -> 4435` (`-574`); targeted smoke gate stabilization in `tests/smoke/schedule-phase3-4-algo-metrics.smoke.spec.ts` for toast-intercept and post-reload Step 3 reopen timing (no production behavior change); gates green (`npm run lint` warnings only, `npm run build` pass, `npm run test:smoke` pass with `14 passed / 2 skipped`); reviewer verdict `PASS with non-blocking notes`; Manual (owner) Step 8 confirmed by owner. |
| R4-42 | Loading, calendar, and prefetch chrome | Done | 2026-04-28: extracted top loading bar to `features/schedule/ui/hooks/useScheduleTopLoadingBar.ts` and calendar/holiday data loading to `features/schedule/ui/hooks/useScheduleCalendarData.ts`; rewired `features/schedule/ui/SchedulePageClient.tsx`; adjacent prefetch intentionally left inline because it remains coupled to main-pane load diagnostics/cache timing state (revisit in R4-46 notes); line delta `4435 -> 4262` (`-173`); gates green (`npm run lint` pass with warnings, `npm run build` pass, `npm run test:smoke` pass with `13 passed / 3 skipped`); reviewer verdict `PASS with non-blocking notes`; Manual (owner) Step 7 confirmed by owner. |
| R4-43 | Display projections | Done | 2026-04-28: extracted display-only projection/view-model memo cluster into `features/schedule/ui/hooks/useScheduleDisplayProjections.ts`, rewired `features/schedule/ui/SchedulePageClient.tsx` consumers; Step 3 invariants preserved (no new `computeStep3BootstrapSummary` path, `useStep3DialogProjection` remains canonical, no requirement-math switch to `totalPCAFromAllocations`); line delta `4262 -> 3927` (`-335`); gates green (`npm run lint` pass with warnings, `npm run build` pass, `npm run test:smoke` pass with `12 passed / 4 skipped` on latest rerun); reviewer verdict `PASS with non-blocking notes`; Manual (owner) Step 6 confirmed by owner. |
| R4-44 | Step clear actions | Done | 2026-04-28: extracted clear-step visibility/handler boundary into `features/schedule/ui/hooks/useScheduleStepClearActions.ts` and rewired `features/schedule/ui/SchedulePageClient.tsx`; preserved clear ordering (UI/dialog cleanup before domain clear) and downstream invalidation path via existing `clearDomainFromStep`; line delta `3927 -> 3773` (`-154`); gates green (`npm run lint` pass with warnings, `npm run build` pass, `npm run test:smoke` pass with `12 passed / 4 skipped`); reviewer verdict `PASS with non-blocking notes`; Manual (owner) Step 6 confirmed by owner. |
| R4-45 | Dev harness containment | Done | 2026-04-28: extracted dev harness prop/callback assembly to `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx` and rewired `features/schedule/ui/SchedulePageClient.tsx`; preserved dynamic import behavior by keeping `ScheduleDevLeaveSimBridge` dynamic-loaded (code-organization move only, no new performance boundary); moved `runStep2Auto` and `runStep3V2Auto` wiring as-is with production helpers still canonical; line delta `3773 -> 3599` (`-174`); gates green (`npm run lint` warnings only, `npm run build` pass, `npm run test:smoke` pass with `13 passed / 3 skipped`); reviewer verdict `PASS with non-blocking notes`; Manual (owner) Step 6 confirmed by owner. |
| R4-46 | Round 5 performance prep | Done | 2026-04-28: recorded final `wc -l` as `3599` with net line delta `5009 -> 3599` (`-1410`) versus R4-40 baseline; `npm run build` exited `0` and printed `/schedule` route as dynamic (`ƒ`) but did not print first-load JS / bundle byte table in current Next.js output; inventoried existing lazy boundaries (`dynamic(...)`, prefetch `import(...)`, `await import(...)`) across `features/schedule/ui` and `components/allocation` (none in `app/(dashboard)/schedule`), with active sites covering dev harness/tools, split reference + schedule panes, dialog/calendar overlays, allocation notes editor, and on-demand utility loaders; Round 5 candidates documented per spec (dev tools, export/PNG, heavy dialogs, calendar/copy wizard, split reference pane, optional diagnostics/perf tooltip, interaction-only overlays); no runtime performance boundary changes implemented in this phase (docs-only update). |

**Status values:** `Not started` · `In progress` · `Done` · `Skipped`

---

## Global Rules

- Keep `lib/**` free of `features/**` imports.
- Keep schedule screen `*.tsx` files out of `lib/features/schedule/`.
- Do not add schedule-wide React context for decomposition convenience.
- Do not merge primary and split-reference controllers.
- Do not re-encode allocation rules in UI.
- Do not compute a second Step 3 projection.
- Do not duplicate `performSlotTransfer` / `performSlotDiscard`.
- Do not change dynamic import boundaries in Round 4, except documenting candidates in R4-46.
- Do not mark `Manual (owner):` checklist rows as complete unless the owner explicitly confirms them.

---

## Global Gates

Run after every production-affecting phase:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`. If a command fails, keep the phase `In progress`, fix the issue, and rerun the full gate.

Recommended review after every production-affecting phase:

1. Dispatch a readonly code-reviewer pass for the phase.
2. Ask it to compare the diff against the Round 4 spec, `ARCHITECTURE_ESSENTIALS`, and the phase rules below.
3. Fix blocking findings before starting the next phase.

---

## File Map

| Path | Phase | Responsibility |
|------|-------|----------------|
| `features/schedule/ui/SchedulePageClient.tsx` | All | Main orchestrator; should shrink and mostly wire named hooks/components. |
| `features/schedule/ui/hooks/useScheduleGridInteractionState.ts` | R4-41 | Transient grid overlay/menu/pool/popover state and overlay grouped props. |
| `features/schedule/ui/hooks/useScheduleTopLoadingBar.ts` | R4-42 | Top loading bar state machine and timer cleanup. |
| `features/schedule/ui/hooks/useScheduleCalendarData.ts` | R4-42 | Calendar dots, holidays, lazy calendar/copy menu loading. |
| `features/schedule/ui/hooks/useScheduleAdjacentSchedulePrefetch.ts` | R4-42 | Idle previous/next working day schedule prefetch, if separable. |
| `features/schedule/ui/hooks/useScheduleDisplayProjections.ts` | R4-43 | Display-only merged-team, override, bed, extra coverage, and PCA balance projections. |
| `features/schedule/ui/hooks/useScheduleStepClearActions.ts` | R4-44 | Clear-step visibility and clear handlers. |
| `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx` or `features/schedule/ui/hooks/useScheduleDevHarnessBridge.tsx` | R4-45 | Dev harness prop assembly and callback wiring. |
| `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-implementation-plan.md` | All | Progress tracker and implementation notes. |
| Optional Round 5 draft under `docs/superpowers/plans/` | R4-46 | Performance-boundary handoff, if useful. |

Names may change if an implementer finds a sharper boundary, but the phase notes must document the final path and reason.

---

## Phase R4-40 — Baseline and Current Map

**Objective:** Establish a verified baseline before production-affecting refactors.

**Files:**

- Modify: `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-implementation-plan.md`
- Read: `features/schedule/ui/SchedulePageClient.tsx`
- Read: `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`
- Read: `docs/schedule-architecture-core.md`

- [x] **Step 1: Record the current line count**

Run:

```bash
wc -l "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: approximately `5009` lines at Round 4 entry. Paste the exact output into the R4-40 tracker Notes.

- [x] **Step 2: Refresh anchors**

Run:

```bash
rg -n "staffContextMenu|pcaPoolAssignAction|pcaContextAction|loadDatesWithData|startTopLoading|pcaBalanceSanity|showClearForCurrentStep|handleClearStep|ScheduleDevLeaveSimBridgeDynamic|SchedulePageGridInteractionOverlays" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: output includes anchors for all R4-41 through R4-45 areas. Paste a concise anchor summary into the R4-40 Notes.

- [x] **Step 3: Re-read architecture constraints**

Read:

- `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`
- `docs/schedule-architecture-core.md`
- Round 4 spec section `8. Business Preservation Rules`

Expected: implementation notes mention that Step 3 projection, `staffOverrides`, DnD single-transfer path, split-reference two-controller model, and `lib/**` layering are unchanged.

- [x] **Step 4: Run global gates**

Run:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`. Record the result in R4-40 Notes.

- [x] **Step 5: Mark R4-40 Done (only after global gates are green)**

Update the Progress Tracker row:

```markdown
| R4-40 | Baseline and current map | Done | 2026-04-28: `wc -l` 5009; anchors refreshed (workspace `rg` fallback); gates rerun and green (`lint`/`build` pass, `test:smoke` pass with expected skips). |
```

R4-40 execution notes (2026-04-28):

- Line count capture: `5009 features/schedule/ui/SchedulePageClient.tsx`.
- Anchor refresh: shell `rg` was unavailable in the prior attempt; used workspace `rg` tooling equivalent and confirmed anchors for R4-41..R4-45 (`staffContextMenu`/`pcaPoolAssignAction`/`pcaContextAction`, `loadDatesWithData`/`startTopLoading`, `pcaBalanceSanity`, `showClearForCurrentStep`/`handleClearStep`, `ScheduleDevLeaveSimBridgeDynamic`, `SchedulePageGridInteractionOverlays`).
- Architecture constraints note: preserved Round 4 invariants and re-validated that Step 3 projection remains single-path, `staffOverrides` stays source-of-truth, DnD keeps single transfer/discard path, split-reference remains two controllers, and `lib/**` layering (`no features/** import`) is unchanged.
- Gates:
  - Initial run recorded one smoke failure in `tests/smoke/schedule-phase3-4-algo-metrics.smoke.spec.ts` (`saved step 3 can re-open after reload without forcing step 2 rerun`).
  - Follow-up stabilization updated the smoke test flow to handle transient notification overlays and post-reload Step 3 hydrate timing; full gate rerun is green (`npm run lint` pass with warnings, `npm run build` pass, `npm run test:smoke` pass with 13 passed / 3 skipped).

---

## Phase R4-41 — Grid Interaction State and Overlay View-model

**Objective:** Extract transient grid interaction state and overlay prop assembly while keeping DnD and context menu item factories separate.

**Files:**

- Create: `features/schedule/ui/hooks/useScheduleGridInteractionState.ts`
- Modify: `features/schedule/ui/SchedulePageClient.tsx`
- Read: `features/schedule/ui/overlays/SchedulePageGridInteractionOverlays.tsx`
- Read: `features/schedule/ui/overlays/schedulePageGridInteractionOverlaysProps.ts`
- Read: `features/schedule/ui/hooks/useScheduleBoardDndWiring.ts`
- Read: `features/schedule/ui/hooks/useScheduleAllocationContextMenus.ts`

- [x] **Step 1: Locate the full state and prop assembly slice**

Run:

```bash
rg -n "staffContextMenu|staffPoolContextMenu|pcaPoolAssignAction|sptPoolAssignAction|bufferStaffConvertConfirm|pcaContextAction|therapistContextAction|colorContextAction|bedRelievingEditWarningPopover|pcaDragState|popoverDragHoverTeam|SchedulePageGridInteractionOverlays" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: anchors cover state declarations, close/reset helpers, click-outside effects, popover drag effects, DnD hook inputs, context-menu hook inputs, and the `SchedulePageGridInteractionOverlays` call.

- [x] **Step 2: Design the hook return shape**

Create `useScheduleGridInteractionState.ts` with exported types that reuse the existing overlay group types from `features/schedule/ui/overlays/schedulePageGridInteractionOverlaysProps.ts`:

```ts
import type {
  ScheduleGridContextMenusGroup,
  ScheduleGridOverlaysGroup,
  ScheduleGridPoolAndBufferGroup,
  ScheduleGridSharedGroup,
  ScheduleGridSlotsColorWarningsDragGroup,
} from '@/features/schedule/ui/overlays/schedulePageGridInteractionOverlaysProps'

export type ScheduleGridInteractionStateResult = {
  overlayGroups: {
    overlays: ScheduleGridOverlaysGroup
    contextMenus: ScheduleGridContextMenusGroup
    sharedGrid: ScheduleGridSharedGroup
    poolAndBuffer: ScheduleGridPoolAndBufferGroup
    slotsColorWarningsDrag: ScheduleGridSlotsColorWarningsDragGroup
  }
}
```

Keep the hook return shape explicit and named. Do not introduce a catch-all `Record<string, unknown>` prop bag.

- [x] **Step 3: Move transient state declarations into the hook**

Move the state for:

- `staffContextMenu`
- `staffPoolContextMenu`
- `pcaPoolAssignAction`
- `sptPoolAssignAction`
- `bufferStaffConvertConfirm`
- `pcaContextAction`
- `therapistContextAction`
- `colorContextAction`
- warning popovers that render through the grid interaction layer
- popover drag hover / mouse tracking state if it is only used by overlays

Expected: `SchedulePageClient.tsx` no longer directly declares most overlay/pool/context action `useState` calls.

- [x] **Step 4: Move close/reset helpers and click-outside effects**

Move helpers such as close menu/action functions and the non-modal click-outside effect into the hook. Preserve existing initial state objects exactly.

Expected: all close/reset functions still have stable names returned from the hook so existing call sites remain readable.

- [x] **Step 5: Move overlay prop assembly**

Move the object assembly currently passed to `SchedulePageGridInteractionOverlays` into the hook, but keep the hook inputs explicit. The call in `SchedulePageClient.tsx` should become close to:

```tsx
<SchedulePageGridInteractionOverlays {...gridInteraction.overlayGroups} />
```

If spreading hides too much during review, use explicit grouped props:

```tsx
<SchedulePageGridInteractionOverlays
  overlays={gridInteraction.overlayGroups.overlays}
  contextMenus={gridInteraction.overlayGroups.contextMenus}
  sharedGrid={gridInteraction.overlayGroups.sharedGrid}
  poolAndBuffer={gridInteraction.overlayGroups.poolAndBuffer}
  slotsColorWarningsDrag={gridInteraction.overlayGroups.slotsColorWarningsDrag}
/>
```

- [x] **Step 6: Preserve separate DnD and context-menu hooks**

Verify `useScheduleBoardDndWiring` and `useScheduleAllocationContextMenus` remain separate imports/calls and are not merged into `useScheduleGridInteractionState`.

Run:

```bash
rg -n "useScheduleBoardDndWiring|useScheduleAllocationContextMenus|performSlotTransfer|performSlotDiscard" "features/schedule/ui/SchedulePageClient.tsx" "features/schedule/ui/hooks/useScheduleGridInteractionState.ts"
```

Expected: the new hook does not define a second transfer/discard implementation and does not contain context menu item factory logic.

- [x] **Step 7: Run global gates**

Run:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`.

- [x] **Step 8: Manual (owner): grid interactions**

Owner should verify overlays, slot popover, pool assign, both staff context menus, color menu, warning popovers, drag overlay, DnD transfer/discard.

- [x] **Step 9: Mark R4-41 Done**

Update the tracker Notes with files changed, line delta, gates result, reviewer result, and manual status.

---

## Phase R4-42 — Loading, Calendar, and Prefetch Chrome

**Objective:** Extract loading/calendar chrome without touching schedule hydration or allocation sync ordering.

**Files:**

- Create: `features/schedule/ui/hooks/useScheduleTopLoadingBar.ts`
- Create: `features/schedule/ui/hooks/useScheduleCalendarData.ts`
- Create, if separable: `features/schedule/ui/hooks/useScheduleAdjacentSchedulePrefetch.ts`
- Modify: `features/schedule/ui/SchedulePageClient.tsx`
- Do not modify unless required: `features/schedule/ui/hooks/useScheduleAllocationRecalcAndSync.ts`

- [x] **Step 1: Locate loading/calendar anchors**

Run:

```bash
rg -n "gridLoading|navToScheduleTiming|loadDatesWithData|datesWithData|holidays|adjacentSchedulePrefetch|startTopLoading|bumpTopLoadingTo|startSoftAdvance|stopSoftAdvance|finishTopLoading|useMainPaneLoadAndHydrateDateEffect|useSchedulePaneHydrationEndForRecalcCluster" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: anchors distinguish UI chrome from hydration/allocation sync.

- [x] **Step 2: Extract top loading bar**

Create `useScheduleTopLoadingBar.ts` to own:

- `topLoadingVisible`
- `topLoadingProgress`
- loading bar interval ref
- loading bar hide timeout ref
- `startTopLoading`
- `bumpTopLoadingTo`
- `startSoftAdvance`
- `stopSoftAdvance`
- `finishTopLoading`
- timer cleanup effect

Expected hook return:

```ts
export type ScheduleTopLoadingBarResult = {
  topLoadingVisible: boolean
  topLoadingProgress: number
  startTopLoading: (initialProgress?: number) => void
  bumpTopLoadingTo: (target: number) => void
  startSoftAdvance: (cap?: number) => void
  stopSoftAdvance: () => void
  finishTopLoading: () => void
}
```

- [x] **Step 3: Extract calendar data**

Create `useScheduleCalendarData.ts` to own:

- date dots loading state
- `datesWithData`
- `loadDatesWithData`
- in-flight and loaded-at refs
- holiday map
- lazy holiday loading when calendar/copy UI opens

Inputs should include `supabase`, `calendarOpen`, `copyWizardOpen`, `copyMenuOpen`, and `selectedDate`.

Expected: `SchedulePageClient.tsx` still passes `datesWithData`, `datesWithDataLoading`, `holidays`, and `loadDatesWithData` to existing consumers.

- [x] **Step 4: Extract adjacent schedule prefetch only if clean**

If the adjacent prefetch depends only on selected date, `scheduleLoadedForDate`, cache helpers, `supabase`, `loadScheduleForDate`, and `setLastLoadTiming`, create `useScheduleAdjacentSchedulePrefetch.ts`.

If extraction would tangle with hydration or allocation sync, keep it inline and add a R4-42 tracker note:

```markdown
Adjacent prefetch left inline because it shares load diagnostics state with the main pane; revisit in Round 5 performance prep.
```

- [x] **Step 5: Keep hydration and allocation sync untouched**

Run:

```bash
rg -n "useMainPaneLoadAndHydrateDateEffect|useSchedulePaneHydrationEndForRecalcCluster|useScheduleAllocationRecalcAndSync" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: these calls still exist in the main client or their established Round 3 hook locations. Their ordering must not be changed as part of this phase.

- [x] **Step 6: Run global gates**

Run:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`.

- [x] **Step 7: Manual (owner): loading/calendar**

Owner should verify cold schedule load, cached schedule load, calendar open, copy menu open, date navigation, top loading bar, adjacent date cache behavior.

- [x] **Step 8: Mark R4-42 Done**

Update tracker Notes with extraction paths, any intentionally inline pieces, line delta, gates result, reviewer result, and manual status.

---

## Phase R4-43 — Display Projections

**Objective:** Move display-only projection and view-model calculations into a named hook.

**Files:**

- Create: `features/schedule/ui/hooks/useScheduleDisplayProjections.ts`
- Modify: `features/schedule/ui/SchedulePageClient.tsx`
- Read: `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`

- [x] **Step 1: Locate display projection anchors**

Run:

```bash
rg -n "therapistAllocationsForDisplay|pcaDisplayAllocationsByTeam|pcaAllocationsForDisplay|calculationsForDisplay|bedCountsOverridesByTeamForDisplay|bedRelievingNotesByToTeamForDisplay|bedAllocationsForDisplay|allPCAAllocationsFlat|step3OrderPositionByTeam|floatingPoolRemainingFte|overridesSliceCacheRef|extraCoverageByStaffIdForDisplay|staffOverridesForPcaDisplay|pcaOverridesByTeam|pcaBalanceSanity" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: anchors cover the display-only block and downstream uses.

- [x] **Step 2: Create the hook result type**

Create `useScheduleDisplayProjections.ts` with a result type containing every existing value the client still needs. Start from the concrete types already imported by `SchedulePageClient.tsx`; if an exact local type is not already named, define a narrow exported alias in the hook file based on the existing value shape.

```ts
import type { Team, Staff } from '@/types/staff'
import type { BedAllocation, PCAAllocation, ScheduleCalculations, TherapistAllocation } from '@/types/schedule'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import type { BedCountsShsStudentMergedByTeam } from '@/features/schedule/ui/hooks/useScheduleAllocationRecalcAndSync'

type TeamRecord<T> = Record<Team, T>
type StaffOverrideSliceByTeam = TeamRecord<Record<string, StaffOverrides[string]>>
type Step3OrderPositionByTeam = Record<Team, number | undefined>
type PcaBalanceSanity = {
  teamBalances: Array<{ team: Team; assigned: number; target: number; balance: number }>
  positiveSum: number
  negativeAbsSum: number
  netDiff: number
  perTeamText: string
}

export type ScheduleDisplayProjectionsResult = {
  therapistAllocationsForDisplay: TeamRecord<Array<TherapistAllocation & { staff?: Staff }>>
  pcaDisplayAllocationsByTeam: TeamRecord<Array<PCAAllocation & { staff?: Staff }>>
  pcaAllocationsForDisplay: TeamRecord<Array<PCAAllocation & { staff?: Staff }>>
  calculationsForDisplay: TeamRecord<ScheduleCalculations | null>
  bedCountsOverridesByTeamForDisplay: BedCountsShsStudentMergedByTeam
  bedRelievingNotesByToTeamForDisplay: Record<string, string>
  bedAllocationsForDisplay: BedAllocation[]
  allPCAAllocationsFlat: Array<PCAAllocation & { staff?: Staff }>
  step3OrderPositionByTeam: Step3OrderPositionByTeam
  floatingPoolRemainingFte: number
  therapistOverridesByTeam: StaffOverrideSliceByTeam
  extraCoverageByStaffIdForDisplay: Record<string, number>
  staffOverridesForPcaDisplay: StaffOverrides
  pcaOverridesByTeam: StaffOverrideSliceByTeam
  pcaBalanceSanity: PcaBalanceSanity
}
```

The exact imported type names may differ from this sketch; use the existing repo types rather than broadening to `any`. Keep this hook display-only.

- [x] **Step 3: Move display-only memo blocks**

Move the `useMemo` blocks listed in Step 1 into the hook. Preserve dependency arrays unless there is a clear compile-time reason to adjust them.

Expected: calculations, allocations, bed display, override slices, extra coverage display, and PCA sanity values are returned from `useScheduleDisplayProjections`.

- [x] **Step 4: Verify Step 3 projection invariants**

Run:

```bash
rg -n "computeStep3BootstrapSummary|displayTargetByTeam|Step3ProjectionV2|useStep3DialogProjection|totalPCAFromAllocations|totalPCAOnDuty" "features/schedule/ui/hooks/useScheduleDisplayProjections.ts" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected:

- The new display projection hook does not call `computeStep3BootstrapSummary`.
- Existing `useStep3DialogProjection` remains the Step 3 projection path.
- Requirement math does not switch to `totalPCAFromAllocations`.

- [x] **Step 5: Run global gates**

Run:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`.

- [x] **Step 6: Manual (owner): display projections**

Owner should verify merged-team display, therapist/PCA cards, extra coverage, bed display, PCA balance diagnostics, and Step 3 display target labels.

- [x] **Step 7: Mark R4-43 Done**

Update tracker Notes with extraction path, line delta, gates result, reviewer result, and manual status.

---

## Phase R4-44 — Step Clear Actions

**Objective:** Extract clear-step visibility and handlers if the cleanup boundary is coherent.

**Files:**

- Create, if coherent: `features/schedule/ui/hooks/useScheduleStepClearActions.ts`
- Modify: `features/schedule/ui/SchedulePageClient.tsx`
- Read: `features/schedule/ui/sections/ScheduleWorkflowStepShell.tsx`

- [x] **Step 1: Locate clear action anchors**

Run:

```bash
rg -n "showClearForCurrentStep|clearStepOnly|clearFromStep|handleClearStep|onClearStep|clearDomainFromStep|setStepStatus|setInitializedSteps|setCurrentStep|showActionToast" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: anchors reveal visibility logic, clear helpers, shell props, and related cleanup.

- [x] **Step 2: Decide extract or leave inline**

Extract only if the hook can own clear visibility and handlers without pulling unrelated controller setup into a mega-hook.

If not coherent, keep inline and update R4-44 tracker Notes:

```markdown
R4-44 skipped: clear-step logic remains inline because extraction would capture too much controller state; revisit only after controller API narrows.
```

- [x] **Step 3: Create `useScheduleStepClearActions.ts` if extracting**

Expected hook result:

```ts
export type ScheduleStepClearActionsResult = {
  showClearForCurrentStep: boolean
  handleClearStep: (stepIdRaw: string) => void
}
```

Keep helper functions internal unless other modules already use them.

- [x] **Step 4: Preserve downstream invalidation and dialog cleanup**

Verify clear behavior still:

- Clears only the intended step or downstream range.
- Invalidates Step 3/4 after earlier-step target changes.
- Closes related dialogs/popovers in the same order as before.
- Keeps `staffOverrides` as the source of truth.

- [x] **Step 5: Run global gates**

Run:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`.

- [x] **Step 6: Manual (owner): step clear**

Owner should verify clear current step, clear from Step 2/3/4, downstream invalidation, and dialogs closing cleanly.

- [x] **Step 7: Mark R4-44 Done or Skipped**

Update tracker Notes with extraction path or skip reason, line delta if any, gates result, reviewer result, and manual status.

---

## Phase R4-45 — Dev Harness Containment

**Objective:** Move dev-only harness prop assembly and callback wiring out of the main client without changing production Step 2/3 paths.

**Files:**

- Create: `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx` or `features/schedule/ui/hooks/useScheduleDevHarnessBridge.tsx`
- Modify: `features/schedule/ui/SchedulePageClient.tsx`
- Read: current dynamic import for `ScheduleDevLeaveSimBridgeDynamic`

- [x] **Step 1: Locate dev harness anchors**

Run:

```bash
rg -n "ScheduleDevLeaveSimBridgeDynamic|allowScheduleDevHarnessRuntime|devLeaveSimOpen|runStep2Auto|runStep3V2Auto|executeStep3V2HarnessAuto|openStep3Wizard|runStep4" "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: anchors cover the dynamic component, dev-only open state, and callback block.

- [x] **Step 2: Choose component or hook**

Prefer a component if most work is prop assembly around `ScheduleDevLeaveSimBridgeDynamic`:

```tsx
<ScheduleDevHarnessBridge
  open={devLeaveSimOpen}
  onOpenChange={setDevLeaveSimOpen}
  runtime={devHarnessRuntime}
  stepActions={devHarnessStepActions}
  scheduleData={devHarnessScheduleData}
/>
```

Prefer a hook only if the bridge must return multiple callbacks consumed outside the dev harness.

- [x] **Step 3: Preserve dynamic import behavior**

Do not change whether the dev harness is dynamically imported in this phase. If moving the dynamic import into a bridge component, document that this is a code organization move and not a new performance boundary.

- [x] **Step 4: Move `runStep2Auto` and `runStep3V2Auto` wiring carefully**

Move callback wiring as-is. Do not duplicate Step 2 substitution or Step 3 floating allocation semantics. Dev-only auto-selection heuristics may remain dev-only, but production helpers remain canonical.

- [x] **Step 5: Run global gates**

Run:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`.

- [x] **Step 6: Manual (owner): dev harness**

Owner should verify dev harness open/run/close in development and basic production build sanity.

- [x] **Step 7: Mark R4-45 Done**

Update tracker Notes with extraction path, line delta, gates result, reviewer result, and manual status.

---

## Phase R4-46 — Round 5 Performance Prep

**Objective:** Record measurements and candidate boundaries for Round 5 without changing runtime behavior.

**Files:**

- Modify: `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-implementation-plan.md`
- Optional create: `docs/superpowers/plans/2026-04-28-schedule-page-client-round5-performance-boundaries-seed.md`
- Read: `features/schedule/ui/SchedulePageClient.tsx`
- Read: dynamic imports under `features/schedule/ui/`

- [x] **Step 1: Record final Round 4 line count**

Run:

```bash
wc -l "features/schedule/ui/SchedulePageClient.tsx"
```

Expected: line count lower than R4-40 baseline unless phases were skipped. Record exact output and delta in R4-46 Notes.

- [x] **Step 2: Record build output summary**

Run:

```bash
npm run build
```

Expected: build exits `0`. Paste the schedule route and first-load JS summary if Next.js prints it. If output does not include bundle details, note that explicitly.

- [x] **Step 3: List existing dynamic imports**

Run:

```bash
rg -n "dynamic\\(|import\\(" "features/schedule/ui" "components/allocation" "app/(dashboard)/schedule"
```

Expected: output lists existing dynamic imports and lazy import sites. Summarize candidates in R4-46 Notes.

- [x] **Step 4: List Round 5 candidates**

Record candidate areas from the spec:

- Dev harness and developer-only tools.
- Export/PNG tooling.
- Heavy dialogs that are not opened on initial load.
- Calendar/copy wizard UI.
- Split reference pane.
- Optional diagnostics and performance tooltip code.
- Overlay groups that are not needed until interaction.

- [x] **Step 5: Do not implement performance changes**

Verify no runtime files were changed in R4-46 except documentation.

Run:

```bash
git diff --name-only
```

Expected: R4-46 changes are docs-only unless an earlier phase is still uncommitted.

- [x] **Step 6: Mark R4-46 Done**

Update tracker Notes with final line count, build result, dynamic import candidate summary, and link to optional Round 5 seed if created.

---

## Completion Checklist

- [x] R4-40 baseline line count recorded.
- [x] R4-41 through R4-45 either Done or explicitly Skipped with reason.
- [x] R4-46 performance prep completed without runtime performance changes.
- [x] No `lib/**` imports `features/**`.
- [x] No duplicate Step 3 projection path introduced.
- [x] No duplicate DnD transfer/discard implementation introduced.
- [x] Global gates pass after the final production-affecting phase.
- [x] Final `SchedulePageClient.tsx` line delta recorded.
- [x] Round 5 handoff candidates recorded.

---

## Suggested Commit Messages

Use one commit per phase when possible:

```bash
refactor(schedule): map round 4 debulking baseline
refactor(schedule): extract grid interaction state
refactor(schedule): extract schedule loading and calendar chrome
refactor(schedule): extract schedule display projections
refactor(schedule): extract schedule step clear actions
refactor(schedule): contain schedule dev harness wiring
docs(schedule): prepare round 5 performance boundary handoff
```

Do not commit unless the owner explicitly requests commits.

---

## Plan Self-Review Notes

This plan covers all Round 4 spec phases R4-40 through R4-46. It intentionally keeps Round 4 focused on maintainability and LOC reduction, with performance work limited to measurement and candidate documentation. It preserves the architecture rules around `lib/**`, Step 3 projection, `staffOverrides`, DnD transfer/discard, allocation sync ordering, and split-reference controllers.

---

## Document History

| Date | Change |
|------|--------|
| 2026-04-28 | Initial Round 4 implementation plan drafted from approved maintainability spec. |
