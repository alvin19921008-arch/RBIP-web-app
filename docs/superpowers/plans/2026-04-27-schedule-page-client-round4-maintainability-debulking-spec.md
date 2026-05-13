# SchedulePageClient decomposition — Round 4 maintainability spec

**Status:** Draft for owner review  
**Last updated:** 2026-04-27  
**Scope:** Fourth-wave maintainability debulking of `features/schedule/ui/SchedulePageClient.tsx` after Round 3 R3-30. Round 4 should reduce the remaining ~5k-line client orchestrator by extracting clear UI state / view-model clusters, while preserving behavior. Round 5 performance work is prepared, not implemented, by the final phase.

**Round 4 baseline:** `SchedulePageClient.tsx` is **5009** lines as of 2026-04-27.

---

## 1. Context

Rounds 1-3 changed `SchedulePageClient.tsx` from a very large mixed UI/business file into a clearer client orchestrator. Round 3 ended with `SchedulePageGridInteractionOverlays`, `SchedulePageToolbar`, several orchestration hooks, grouped dialog props, and the removal of a duplicate Step 2 substitution detector.

The remaining problem is **orchestrator gravity**: the file still attracts transient UI state, view-model assembly, diagnostics, dev harness wiring, and cross-cutting prop assembly because those blocks need many values from the main client. This is primarily a maintainability problem. Moving code into imported hooks/components will not by itself reduce the initial client bundle if the same client entry imports those modules.

Round 4 therefore prioritizes **readability, grepability, safer AI edits, and smaller review surfaces**. The final phase records Round 5 performance candidates so the next round can focus on measured bundle/loading gains.

---

## 2. Authoritative References

| Document | Role |
|----------|------|
| `docs/schedule-architecture-core.md` | Schedule UI tree, route shell, props-only shell, split view constraints. |
| `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc` | Allocation, Step 3 projection, `staffOverrides`, pending FTE, bed relieving, DnD invariants. |
| `docs/superpowers/plans/2026-04-24-schedule-page-client-round3-decomposition-spec.md` | Round 3 goals, do-not-merge hook guidance, R3-30 overlay extraction. |
| `docs/superpowers/plans/2026-04-24-schedule-page-client-round3-decomposition-implementation-plan.md` | Executed Round 3 phases and current file map. |
| `docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md` | Original business preservation invariants. |

---

## 3. Goals

1. Make `SchedulePageClient.tsx` read more like a true orchestrator: controller setup, named hooks, composed children, and short grouped prop wiring.
2. Reduce the main file by another meaningful LOC slice before starting performance work. A realistic target is **800-1600 lines removed** from `SchedulePageClient.tsx`, with total repo LOC allowed to stay flat or increase slightly.
3. Improve grep/debug paths for future AI and human work: grid interaction state, loading/calendar chrome, display projections, step clear actions, and dev harness should each have a named home.
4. Keep allocation and workflow behavior unchanged.
5. End with a Round 5 handoff that lists performance-boundary opportunities and baseline measurements to gather.

---

## 4. Non-goals

- No controller redesign.
- No merge of primary and split-reference controllers.
- No schedule-wide React context for decomposition convenience.
- No `lib/**` importing `features/**`.
- No new schedule screen `*.tsx` under `lib/features/schedule/`.
- No re-encoding allocation rules in UI.
- No Step 3 projection rewrite.
- No bundle-splitting or dynamic-import behavior changes in Round 4, except documenting candidates for Round 5.
- No broad type-tightening pass unrelated to touched files.

---

## 5. Current Extraction Map

Line numbers are approximate and must be refreshed at implementation time.

| Area | Current anchor | Round 4 direction |
|------|----------------|-------------------|
| Grid interaction state | `staffContextMenu`, `pcaPoolAssignAction`, `pcaContextAction`, warning popovers, popover drag state | Extract a focused grid interaction state / view-model hook. |
| Overlay prop assembly | `SchedulePageGridInteractionOverlays` call | Move overlay prop shaping out of the main client, while keeping existing DnD/context-menu hooks separate. |
| Calendar/loading/prefetch chrome | `loadDatesWithData`, top loading bar helpers, holiday loading, nav timing, adjacent prefetch | Extract loading bar and calendar/prefetch hooks. |
| Display projections | `therapistAllocationsForDisplay`, `pcaAllocationsForDisplay`, override slices, `pcaBalanceSanity` | Extract display-only projections into one hook. |
| Step clear actions | `showClearForCurrentStep`, `clearStepOnly`, `clearFromStep`, `handleClearStep` | Extract a step clear action hook if cleanup boundaries are coherent. |
| Dev harness | `ScheduleDevLeaveSimBridgeDynamic` callback block | Move dev-only wiring into a dev hook/container; reuse production helpers. |
| Performance candidates | dynamic imports, client island boundaries, bundle/loading baselines | Record for Round 5 only. |

---

## 6. Target Architecture

Round 4 should add or reshape modules under `features/schedule/ui/` only unless a helper is truly React-free and belongs under `lib/features/schedule/`.

| Path | Responsibility |
|------|----------------|
| `features/schedule/ui/hooks/useScheduleGridInteractionState.ts` | Transient overlay/menu/pool/popover state, close/reset helpers, popover drag effects, and overlay prop view-model assembly. |
| `features/schedule/ui/hooks/useScheduleTopLoadingBar.ts` | Thin top loading bar state machine and cleanup. |
| `features/schedule/ui/hooks/useScheduleCalendarData.ts` | Calendar dots, holidays, lazy calendar/copy menu loading. |
| `features/schedule/ui/hooks/useScheduleAdjacentSchedulePrefetch.ts` | Idle prefetch of previous/next working day cache, if separable from load diagnostics. |
| `features/schedule/ui/hooks/useScheduleDisplayProjections.ts` | Display-only merged-team allocations, calculation projections, override slices, bed display, extra coverage display, PCA balance sanity. |
| `features/schedule/ui/hooks/useScheduleStepClearActions.ts` | Step clear visibility and clear handlers, preserving dialog/step cleanup order. |
| `features/schedule/ui/dev/` or `features/schedule/ui/hooks/` | Dev harness wiring that is not product UI. |

The exact names may change during implementation if the boundary becomes clearer, but each extracted unit must have a single clear responsibility.

---

## 7. Phased Plan

### R4-40 — Baseline and Current Map

**Objective:** Establish the Round 4 baseline and refresh extraction anchors.

**Actions:**

1. Record `wc -l features/schedule/ui/SchedulePageClient.tsx`.
2. Grep anchors for grid interaction state, loading/calendar, display projections, step clear actions, and dev harness.
3. Re-read `ARCHITECTURE_ESSENTIALS.mdc` and `docs/schedule-architecture-core.md`.
4. Confirm current gates before production-affecting extraction begins.

**Exit:** Baseline recorded, gates green, no code behavior changed.

### R4-41 — Grid Interaction State and Overlay View-model

**Objective:** Reduce the largest remaining UI-state cluster after R3-30.

**Extract:**

- Staff grid and staff pool context menu state.
- PCA pool assign, SPT pool assign, buffer convert confirmation, PCA context action, therapist context action, color context action.
- Warning popover state when it belongs to the overlay layer.
- Click-outside close effects for non-modal contextual popovers.
- Popover drag hover / mouse tracking effects.
- Overlay prop object assembly for `SchedulePageGridInteractionOverlays`.

**Keep separate:**

- `useScheduleAllocationContextMenus`.
- `useScheduleBoardDndWiring`.
- `performSlotTransfer` / `performSlotDiscard` implementation path.

**Exit:** `SchedulePageClient` passes a concise grouped object returned by the new hook into `SchedulePageGridInteractionOverlays`.

### R4-42 — Loading, Calendar, and Prefetch Chrome

**Objective:** Move UI/data-loading chrome out of the main orchestrator without touching schedule hydration or allocation sync.

**Extract candidates:**

- Top loading bar state machine: `startTopLoading`, `bumpTopLoadingTo`, `startSoftAdvance`, `stopSoftAdvance`, `finishTopLoading`, cleanup.
- Calendar dots loader: `loadDatesWithData`, in-flight guard, one-minute cache.
- Lazy holiday loading when calendar/copy UI opens.
- Adjacent previous/next working day prefetch, if it can be isolated without obscuring load diagnostics.
- Navigation timing diagnostics that are tied to grid-ready state.

**Do not move:**

- `useMainPaneLoadAndHydrateDateEffect`.
- `useSchedulePaneHydrationEndForRecalcCluster`.
- `useScheduleAllocationRecalcAndSync`.

**Exit:** Loading/calendar hooks expose explicit actions and state; hydration and allocation sync ordering remains unchanged.

### R4-43 — Display Projections

**Objective:** Create one named home for display-only projections that feed the grid.

**Extract:**

- `therapistAllocationsForDisplay`.
- `pcaDisplayAllocationsByTeam`.
- `pcaAllocationsForDisplay`.
- `calculationsForDisplay`.
- `bedCountsOverridesByTeamForDisplay`.
- `bedRelievingNotesByToTeamForDisplay`.
- `bedAllocationsForDisplay`.
- `allPCAAllocationsFlat`.
- `step3OrderPositionByTeam`.
- `floatingPoolRemainingFte`.
- therapist/PCA override slices.
- `extraCoverageByStaffIdForDisplay`.
- `staffOverridesForPcaDisplay`.
- `pcaBalanceSanity`.

**Rules:**

- This hook is display/view-model only.
- It must not compute a second Step 3 projection.
- It must not replace `displayTargetByTeam` semantics.
- It must not use `totalPCAFromAllocations` for requirement math.

**Exit:** Grid display props are sourced from a named projection result object.

### R4-44 — Step Clear Actions

**Objective:** Move step clear visibility and clear handlers into a named hook if the boundary is coherent.

**Extract candidates:**

- `showClearForCurrentStep`.
- `clearStepOnly`.
- `clearFromStep`.
- `handleClearStep`.
- Related dialog cleanup and toast handling.

**Rules:**

- Preserve Step 2 downstream invalidation.
- Preserve Step 3/4 rerun semantics after earlier-step changes.
- Keep dialog cleanup atomic with the clear action.

**Exit:** `ScheduleWorkflowStepShell` receives clear props from a dedicated hook result.

### R4-45 — Dev Harness Containment

**Objective:** Remove dev-only callback bulk from the main client and reduce drift risk.

**Extract:**

- `ScheduleDevLeaveSimBridgeDynamic` prop assembly.
- `runStep2Auto` and `runStep3V2Auto` callback wiring where safe.
- Dev-only bridge state and close/open handlers if they are not used elsewhere.

**Rules:**

- Production Step 2/3 helpers remain canonical.
- Dev harness automation may call production helpers but must not fork allocation semantics.
- Keep dynamic import behavior unchanged unless a Round 5 performance phase explicitly changes it.

**Exit:** Dev harness is still available for developer/admin workflows, but its wiring no longer dominates the main return area.

### R4-46 — Round 5 Performance Prep

**Objective:** Prepare a measured Round 5 performance-boundary plan without implementing performance changes.

**Collect:**

- Current `SchedulePageClient.tsx` line count after R4-41 through R4-45.
- Current build output summary from `npm run build`.
- Any available bundle analyzer output if the repo already has a script for it.
- List of components already dynamically imported.
- Candidate dynamic imports, such as dev harness, heavy dialogs, export/PNG tooling, optional overlay groups, and below-fold panels.
- Candidate smaller client islands where server/client boundaries might be realistic.
- Loading timing observations from existing diagnostics, if easy to capture.

**Do not:**

- Add bundle analyzer dependencies unless the owner approves.
- Change dynamic import boundaries.
- Move interactive schedule core to Server Components.

**Exit:** Add a Round 5 handoff section to the implementation notes or a dedicated Round 5 draft plan.

---

## 8. Business Preservation Rules

Round 4 does not relax any previous invariant:

1. `staffOverrides` remains the single source of truth for staff-side edits.
2. Step 3 projection stays single-path; `displayTargetByTeam` remains the display source for Avg PCA/team.
3. Pending FTE updates use approved wrappers only.
4. Step 3.3 adjacent placement uses special-program slots only.
5. Step 2 target changes after Step 3/4 invalidate downstream steps.
6. Bed relieving uses `totalBedsEffectiveAllTeams`.
7. DnD keeps one transfer/discard implementation path.
8. Split reference stays two controllers, with shared orchestration only.
9. UI does not duplicate allocation engine semantics.

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Extracted grid interaction hook becomes a mega-hook | Keep DnD wiring and context menu item factories separate; hook owns transient state and view-model assembly only. |
| Stale closures in close/reset handlers | Use explicit dependency arrays, stable callbacks, or refs where the existing behavior already relies on latest mutable state. |
| Overlay prop grouping hides too much | Return named groups that mirror the existing `SchedulePageGridInteractionOverlaysProps` groups. |
| Loading extraction changes hydration timing | Keep hydration end and allocation sync hooks in place; only move loading chrome around them. |
| Display projection extraction changes Step 3 numbers | Treat projection hook as display-only; do not rebuild Step 3 bootstrap. |
| Dev harness drifts from production Step 2 | Reuse production helpers and document any dev-only selection heuristics. |
| Round 4 becomes performance work by accident | Put measurement and candidate listing in R4-46; defer behavior changes to Round 5. |

---

## 10. Verification Strategy

After each production-affecting phase:

```bash
npm run lint && npm run build && npm run test:smoke
```

Manual checks should match touched areas:

- R4-41: overlays, slot popover, pool assign, both staff context menus, color menu, warning popovers, drag overlay, DnD transfer/discard.
- R4-42: cold schedule load, cached schedule load, calendar open, copy menu open, date navigation, top loading bar, adjacent date cache behavior.
- R4-43: merged-team display, therapist/PCA cards, extra coverage, bed display, PCA balance diagnostics, Step 3 display target labels.
- R4-44: clear current step, clear from Step 2/3/4, downstream invalidation, dialogs closing cleanly.
- R4-45: dev harness open/run/close in development, production build sanity.
- R4-46: build output and candidate list recorded; no behavior change expected.

---

## 11. Expected Outcome

Round 4 should leave `SchedulePageClient.tsx` smaller and easier to navigate, while still clearly acting as the schedule page orchestrator. The most valuable result is not only a lower line count, but better boundaries for future AI/human debugging:

- Grid interactions have a named home.
- Loading/calendar chrome has a named home.
- Display projections have a named home.
- Step clear actions have a named home.
- Dev harness no longer obscures production orchestration.
- Round 5 starts with measured candidates instead of vague performance guesses.

---

## 12. Round 5 Handoff Seed

Round 5 should focus on **performance boundaries and measured loading/bundle improvements**, not further maintainability-only LOC movement.

Likely Round 5 questions:

1. Which schedule UI pieces are not needed for the first useful paint?
2. Which heavy components are already dynamic imports, and which should become dynamic imports?
3. Can any below-fold or modal-only sections be split into smaller client chunks?
4. Is the current route shell/data boundary optimal, or are there server-side preload opportunities that do not break interactivity?
5. What measurable target should Round 5 use: bundle size, first load JS, route transition time, grid-ready timing, or all of the above?

Likely Round 5 candidate areas:

- Dev harness and developer-only tools.
- Export/PNG tooling.
- Heavy dialogs that are not opened on initial load.
- Calendar/copy wizard UI.
- Split reference pane.
- Optional diagnostics and performance tooltip code.
- Overlay groups that are not needed until interaction.

Round 5 should start by gathering measurements, then choose a small number of safe performance boundaries. It should not mix broad debulking with dynamic import behavior changes in the same phase.

---

## Document History

| Date | Change |
|------|--------|
| 2026-04-27 | Initial Round 4 maintainability debulking spec after owner selected maintainability plus Round 5 performance prep scope. |
