# SchedulePageClient decomposition — Round 3 specification

**Status:** Round 3 phases **R3-20–R3-29** executed per implementation plan; **P1 — composition / JSX** gap remains (long `return` tail). **Next:** phase **R3-30** in the implementation plan — extract `SchedulePageGridInteractionOverlays` (see **§11**).  
**Last updated:** 2026-04-24  
**Scope:** Third-wave decomposition of `features/schedule/ui/SchedulePageClient.tsx` after Round 2 (R2-10–R2-18 complete per [`2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md`](./2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md)).

**Baseline (post Round 2):** `SchedulePageClient.tsx` ≈ **8,150 lines**; roughly **5,900 lines** of hooks / effects / handlers before the main `return`, **~2,000 lines** of JSX, **~200 lines** of imports — orchestration is still concentrated in a single `SchedulePageContent` function.

**Current line count (after R3-29 close, for sub-agents — re-`wc -l` at task start):** `SchedulePageClient.tsx` ≈ **6,213 lines** (~**−1,946** vs Round 3 entry). Remaining **JSX-heavy** block under `ScheduleDndContextShell`: `ScheduleOverlays`, pool-assign popovers, **both** `StaffContextMenu` trees, `DragOverlay` — **not** yet a named child component (**R3-30**).

**Authoritative references (must stay aligned):**

| Document | Role |
|----------|------|
| [`docs/schedule-architecture-core.md`](../../schedule-architecture-core.md) | UI tree: `sections/` vs `steps/` vs `layout/` vs `panes/`; **`lib/**` must NOT import `features/**`**. |
| [`.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`](../../../.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc) | Step 3 projection, `staffOverrides`, pending FTE wrappers, fingerprints, beds, rounding. |
| Round 1 spec | [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md) — §7 non-negotiables, §9.1–9.2 **two controllers + props-only shell** (locked). |
| Round 2 spec | [`2026-04-23-schedule-page-client-round2-decomposition-spec.md`](./2026-04-23-schedule-page-client-round2-decomposition-spec.md) — business preservation §9 / Round 1 §7 unchanged. |

**Implementation plan (how to execute):** [`2026-04-24-schedule-page-client-round3-decomposition-implementation-plan.md`](./2026-04-24-schedule-page-client-round3-decomposition-implementation-plan.md) — phase checkboxes, gates, Progress tracker.

**Orchestrator (sub-agent dispatch, Composer 2 only):** [`2026-04-24-schedule-page-client-round3-orchestrator-handoff-prompt.md`](./2026-04-24-schedule-page-client-round3-orchestrator-handoff-prompt.md)

**Inputs for this draft:** lead analysis (2026-04-23) + **code-reviewer** pass (line-bounded map of `SchedulePageClient.tsx`, merge vs. separate hooks, atomic units) + Round 2 architecture rules.

---

## 1. Context — after Round 2

Round 2 delivered: `useScheduleSnapshotDiff`, `useScheduleExportActions`, `useScheduleCopyWorkflow`, `useScheduleStepChromeNavigation`, `useScheduleAllocationContextMenus`, `layout/ScheduleSummaryColumn` + `ScheduleBoardLeftColumn` / `ScheduleBoardRightColumn`, `overlays/SchedulePageDialogNodes`, `useSchedulePcaSlotTransfer`, and related layout peels — tracked in the Round 2 plan.

**Remaining problem:** `SchedulePageContent` is still a **very large composition root**: most **pre-`return` logic** (Step 2 fingerprints and finalize, step-wise `handleInitializeAlgorithm`, allocation recalc + `useAllocationSync` + bed recompute, date/URL bootstrap, substitution wizard, buffered Step 2 toasts, local DnD bridge functions) and a **long JSX tail** (overlays, pool assign, inline dialogs/warnings, `ScheduleMainGrid`, split mode) still live in **one** file. Merge conflict risk and review cost remain high.

Round 3 targets **vertical hook seams** and **targeted view modules** so the default export file reads as **orchestration + composition**, not a monolith — still **not** a rewrite of allocation math or `useScheduleController`.

---

## 2. Expectations (architecture + size)

### 2.1 Architecture

- **Orchestrator pattern:** `SchedulePageContent` should become primarily: `useScheduleController` + a **small** set of **named** hooks and **named** child components, then a **short** JSX tree. Logic moves to `features/schedule/ui/hooks/*.ts(x)` and `layout/` / `sections/` / `overlays/` as appropriate.
- **Custom hooks are the main seam** for effect clusters and handler bundles (same as Round 1/2 and external “large client page” practice).
- **Props-first, grouped objects** where prop lists are noisy (especially `SchedulePageDialogNodes` and main board props) — **no** schedule-wide React context for decomposition convenience (Round 1 §9.2).
- **Existing hooks (do not merge blindly):** `useScheduleBoardDnd`, `useSchedulePcaSlotTransfer`, `useScheduleAllocationContextMenus`, `useStep3DialogProjection`, `useSchedulePageQueryState`, `useSchedulePaneHydration` end effects, `useScheduleCopyWorkflow`, `useScheduleExportActions`, `useScheduleSnapshotDiff`, and `useScheduleStepChromeNavigation` remain **separate concerns**; new hooks **compose** them rather than creating a mega-hook (see code-reviewer: merging DnD + context menus would re-create a new monolith).

### 2.2 Size (orchestrator file, not global repo LOC)

- **Target:** remove roughly **1,500–3,500 lines** from `SchedulePageClient.tsx` in a full Round 3, bringing the file toward **~4.5k–6.5k lines** depending on how aggressively the Step 2 / `handleInitializeAlgorithm` block is split.
- **Reality check:** new modules **add** lines elsewhere; **net** repo size may be flat or up slightly. Success is **lower cognitive load** and **clearer boundaries**, not a fantasy “total LOC” drop.
- **Floor:** without controller redesign, the page will likely stay **several thousand lines** — a large `useScheduleController` surface and non-negotiable wiring remain in the feature.

---

## 3. Code-reviewer — extraction map (concrete boundaries)

*Line numbers refer to `features/schedule/ui/SchedulePageClient.tsx` at Round 3 planning time; re-grep at execution in case of drift.*

| Area | Approx. lines | Notes |
|------|---------------|--------|
| `displayToolsInlineNode` (Display / Split / Undo / Redo) | 293–422 | Candidate **`SchedulePageToolbar`** (or `sections/`) — presentational, props for modes and actions. |
| Step 2 downstream + fingerprint / finalize + refs | 531–671, 565–574, related | Candidate **`useScheduleStep2DependencyFinalize`** (name indicative) — keep with `markDependentStepsOutOfDate` + baseline capture. |
| Buffered Step 2 success toast, bootstrap baselines, flush `useEffect` | 1178–1208, 5177–5217+ | Candidate **`useBufferedStep2CompletionToast`**. |
| Inactive → buffer / Step 2 continuation (uses finalize) | ~1395–1521 | Must stay **coherent** with fingerprint finalize or share one module. |
| Resolver refs (tie-break, SPT, shared therapist, substitution, special program, etc.) | 1156+, 1381–1547 | **Atomic** with openers, `SchedulePageDialogNodes` props, and `flushSync` + `finalizeStep2DependencyChanges` pairings. |
| `showStep2Point2` / SPT, `showStep2Point3` / shared therapist (`flushSync` blocks) | 3909–4134 | Move only with their **finalize** call sites. |
| `handleInitializeAlgorithm` | 4139–4524+ | **Largest** orchestration block; depends on `generateStep2*`, wizards, `scheduleActions`. |
| Step 2 non-floating substitution **projection** (canonical) | `lib/features/schedule/step2SubstitutionProjection.ts` (`willNeedStep21Substitution`, etc.) + live allocation path `lib/algorithms/pcaAllocation.ts` | **Do not** reintroduce duplicate detectors; inline duplicate file was removed post-R3-29. |
| `step3RuntimeState` / `floatingPCAsForStep3` | 3692–3712 | Often stays next to `useStep3DialogProjection` inputs. |
| `useAllocationSync` + bed recompute + recalc effects | 3334–3592+ | Tightly ordered with `useSchedulePaneHydration` end effect (~2260–2274) — **do not** split effects without preserving comments/order. |
| `beginDateTransition` / `queueDateTransition` | 5066–5097 | Pairs with `useScheduleCopyWorkflow` consumer; must preserve URL **vs** `controllerBeginDateTransition` **once** contract. |
| `initialDateResolved` gate + `useScheduleDateParam` / resolver | 681–682, 750–933+ | Candidate **`useScheduleInitialDateResolution`**. |
| DnD: local fns + `useSchedulePcaSlotTransfer` + `useScheduleBoardDnd` | 5996–6117+ | Optional thin **`useScheduleBoardDndController`** that **only** wires callbacks; keep core hooks in separate files. |
| `ScheduleOverlays`, `StaffContextMenu` ×2, pool assign popovers, `DragOverlay` sibling cluster | Re-grep under `ScheduleDndContextShell` in `SchedulePageClient.tsx` | **`SchedulePageGridInteractionOverlays`** — **Phase R3-30** (deferred from R3-27; toolbar-only shipped in R3-27). |
| `ScheduleMainBoardChrome` + `ScheduleMainGrid` + split | 7485–8050+ | Optional **`SchedulePageMainWorkspace`** or split **shell** component. |

**Atomic / do-not-split carelessly (reviewer):**

- Resolver ref + `flushSync` + `finalizeStep2DependencyChanges` sequences.
- Fingerprint refs + `useStep3DialogProjection` + Step 2 completion toast / bootstrap baselines.
- `useSchedulePaneHydration` end effect ↔ `useAllocationSync` ↔ recalc/bed effect ordering.
- `performSlotTransfer` / `performSlotDiscard` — **single** implementation; `useScheduleBoardDnd` stays on injected functions (Round 2).

**Risk called out in review:** dev harness / `runStep2Auto` paths can **drift** from production `handleInitializeAlgorithm` if extracted in separate PRs without shared helpers.

---

## 4. Goals and non-goals

### 4.1 Goals

- **Make `SchedulePageClient.tsx` read as an orchestrator** — a sequence of well-named hooks and a composed JSX tree.
- **Preserve** all Round 1 §7 and Round 2/Round 1 §9 business preservation items (see §7 below).
- **Reduce** merge and review cost by moving **stable vertical slices** into `hooks/` and a few **presentational** modules.
- **Optional:** pure helpers → `lib/features/schedule/*.ts` where React-free (same layering as Round 2 P2).
- **Verification:** `npm run lint && npm run build && npm run test:smoke` per phase; Playwright only when a **new** regression class appears.

### 4.2 Non-goals

- **No** merging primary + reference into a single `useScheduleController` (§9.1).
- **No** `lib/**` importing `features/**`; no new `*.tsx` under `lib/features/schedule/`.
- **No** step grid body or Step 3.1–3.4 wizards under `sections/` (workflow chrome only) — same as Round 2.
- **No** schedule-wide **context** for convenience; grouped props or hook return objects only.
- **No** re-encoding allocation business rules in UI; controller + `lib` remain the sources of truth.
- **No** “typings-only mega-PR” (Round 1 Phase 9 risk) — type tightening only in touched files.

---

## 5. Target architecture (Round 3)

| Area | Path | Responsibility |
|------|------|----------------|
| New hooks | `features/schedule/ui/hooks/` | e.g. initial date resolution, date/URL transition, recalc+bed+allocation sync cluster, Step 2 dependency + buffered toast, substitution wizard surface, DnD wiring (thin). |
| Presentational | `features/schedule/ui/sections/`, `layout/`, or `overlays/` | Toolbar, grid interaction layer (overlays + pool assign + context menu wiring if helpful). |
| Pure | `lib/features/schedule/*.ts` | Step 2 projection / allocation helpers already live in `step2SubstitutionProjection.ts`, `pcaAllocation.ts`, etc.; **no** duplicate “detector-only” modules. |

**What may remain in `SchedulePageContent` until a later round:**

- Primary `useScheduleController` destructuring and the **widest** cross-cutting `scheduleActions` calls.
- A **thin** DnD composition if hooks stay separate (reviewer: avoid mega-merge).
- Any effect that must stay **syntactically** after a specific ref update (document if kept inline).

---

## 6. Phased plan (Round 3 — indicative)

Phases are **mergeable slices**; numbering **continues after** Round 2’s R2-18: **R3-20, R3-21, …** (see implementation plan for exact tasks).

| Phase | Name | Objectives (indicative) | Exit criteria |
|-------|------|-------------------------|---------------|
| **R3-20** | Pre-baseline + ordering | Baseline `wc -l`, re-read Round 1 §7, confirm execution order. | Gates green; tracker row. |
| **R3-21** | Initial date + date/URL | Extract `initialDateResolved` + `useScheduleDateParam` wiring + `beginDateTransition` / `queueDateTransition` into one or two hooks. | Gates green; **§7.8** copy/date rows; no URL snap-back. |
| **R3-22** | Recalc + allocation sync + beds | Extract `recalculateScheduleCalculations` + effects + `useAllocationSync` in an order-safe hook; preserve hydration note. | Gates green; no double recalcs. |
| **R3-23** | Step 2 dependency + buffered Step 2 toast | Extract fingerprint / finalize + buffered toast flush with explicit deps. | Gates green; Step 2 → Step 3 fingerprint / toast pairing. |
| **R3-24** | Substitution wizard | Extract state + resolver + confirm/skip; keep atomic with Step 2 pipeline consumers. | Gates green; Step 2.1 wizard flow. |
| **R3-25** | `handleInitializeAlgorithm` + `generateStep2` / `generateStep3` + related | Largest slice; may split 25a/25b if needed. | Gates green; `Initialize` on step strip. |
| **R3-26** | DnD bridge | Thin module for local helpers + `useSchedulePcaSlotTransfer` + `useScheduleBoardDnd` **wiring** only. | Gates green; DnD + PCA transfer §6.2. |
| **R3-27** | Presentational: toolbar + interaction layer | **`SchedulePageToolbar`** shipped; **`SchedulePageGridInteractionOverlays`** **deferred** to **R3-30** (props surface + risk). | Gates green; toolbar parity. |
| **R3-28** | Grouped dialog / board props (optional) | Reduce `SchedulePageDialogNodes` and/or board prop noise via typed groups. | Gates green; no behavior change. |
| **R3-29** | Dev/perf + pure peel (optional) | `useSchedulePageDevPerf`; duplicate detector file removed; canonical paths documented. Owner manual Step 3 **signed off** 2026-04-24. | Gates green; owner confirmation. |
| **R3-30** | Grid interaction overlays (composition) | Extract **`SchedulePageGridInteractionOverlays`** — props-only; **do not** merge `useScheduleAllocationContextMenus` into it. | Gates green; **§11** manual rows; shorter JSX tree in client. |

**Ordering (recommended):** **R3-21 → R3-22** before large Step 2 moves (stabilize date + sync). **R3-25** is the heaviest: schedule dedicated review; consider 25a (generate + wizards) / 25b (initialize + switch) if a single PR is too large. **After R3-29:** run **R3-30** to close the **P1 composition / JSX** gap (details **§11**).

---

## 7. Risk register (Round 3)

| ID | Risk | Mitigation |
|----|------|------------|
| R3-1 | Stale closures in `beginDateTransition` (today partially non-`useCallback`) | When extracting, use `useCallback` with explicit dep lists or a ref for latest URL key — preserve **single** controller update path. |
| R3-2 | Effect order: pane hydration end vs `useAllocationSync` vs recalc | Move in **one** PR or document `useEffect` order in hook; re-run **§7** manual rows. |
| R3-3 | `flushSync` + finalize + resolver drift | Move **atomic** blocks per reviewer; grep `finalizeStep2DependencyChanges` at extraction time. |
| R3-4 | Dev `runStep2Auto` drifts from production | Share helpers or one internal module for both entry paths. |
| R3-5 | `pendingPCAFTEPerTeam` / Step 3 projection / floating dialogs | Single-writer discipline; co-review with `useStep3DialogProjection` inputs. |
| R3-6 | Prop explosion on extractions | Prefer **grouped** props objects; avoid context. |

---

## 8. Verification strategy

- **Every phase:** `npm run lint && npm run build && npm run test:smoke` (see [`.cursor/skills/playwright-smoke/SKILL.md`](../../../.cursor/skills/playwright-smoke/SKILL.md)).
- **Manual:** map phases to Round 1 spec **§6.2** rows (Step 3, `staffOverrides`, Step 2→3, fingerprints, pending FTE, split ref, DnD, copy/date).
- **Playwright @smoke:** add only for **new** failure modes (same as Round 1/2).

---

## 9. Business logic preservation (unchanged)

All Round 1 spec **§7** items and Round 2 spec **§9** list remain in force. Round 3 does **not** relax:

1. Step 3 projection — **single path**; **`displayTargetByTeam`**.  
2. **`staffOverrides` SSOT.**  
3. Step 2 downstream invalidation.  
4. Fingerprint refs + `useLayoutEffect` / `flushSync` ordering.  
5. Pending FTE — **approved wrappers only.**  
6. Split reference — **AbortController**, hydration, finalizers.  
7. DnD — **same** injection; no duplicate `performSlotTransfer` implementations.  
8. Copy / date navigation.  
9. No allocation re-encoding in UI.

---

## 10. Rollback strategy

Same as Round 1/2: **incremental PRs**, revert by merge; feature flags only if a slice is experimental.

---

## 11. Round 3 continuation — P1 composition / JSX (phase R3-30)

**Problem statement:** Code-reviewer / goals audit: **`SchedulePageClient.tsx` still has a long main `return`** after R3-27 because the **grid interaction layer** (`ScheduleOverlays`, pool-assign `TeamPickerPopover` / `ConfirmPopover` / related, **both** `StaffContextMenu` instances, warning/inline chrome **only if** co-located with that cluster, **`DragOverlay`**) was intentionally deferred. That deferral keeps merge/review cost higher than necessary and works against **§2.1** (“short JSX tree”).

**Sub-agent / orchestrator — how to close the gap:**

1. **Treat R3-30 as a normal phase** in [`2026-04-24-schedule-page-client-round3-decomposition-implementation-plan.md`](./2026-04-24-schedule-page-client-round3-decomposition-implementation-plan.md): update Progress tracker **In progress** → implement → `npm run lint && npm run build && npm run test:smoke` → code reviewer → owner manual Step 5 (if run) → **Done**.
2. **Create** `features/schedule/ui/overlays/SchedulePageGridInteractionOverlays.tsx` (name fixed). **Slice:** from **`ScheduleOverlays`** through **`DragOverlay`** (or a **narrower** documented slice **if** `ScheduleMainBoardChrome` / grid must stay in the client for hook-order reasons — document in file header).
3. **Props:** **2–5 grouped objects** (same discipline as R3-28); **explicit** types. Pass **menu item arrays / handlers** from parent; **do not** fold **`useScheduleAllocationContextMenus`** into the new file (**§2.1** mega-hook ban).
4. **Invariants:** Preserve sibling order under `ScheduleDndContextShell`, **`aria-*`**, **`Tooltip`** strings, and **zero** allocation-rule edits — **JSX relocation + wiring only**.
5. **Manual (owner) map:** overlays (slot / PCA / warnings), pool assign flow, **both** staff context menus (grid + pool), drag overlay during DnD; split mode if used.
6. **Exit:** `SchedulePageClient` `return` visibly shorter; append **line delta** to R3-30 Notes in the implementation plan when marking **Done**.

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-24 | Initial Round 3 draft: lead + code-reviewer + executable phase table + size expectations. |
| 2026-04-24 | Linked Round 3 orchestrator handoff prompt. |
| 2026-04-24 | Status + baseline after R3-29; §3/§5 canonical substitution paths; R3-27/R3-29/R3-30 table rows; **§11** R3-30 continuation for P1 composition / JSX. |
