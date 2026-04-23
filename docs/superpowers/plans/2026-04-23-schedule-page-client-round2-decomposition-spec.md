# SchedulePageClient decomposition — Round 2 specification

**Status:** Draft — implementation plan added 2026-04-23 (team may mark Approved when execution starts)  
**Last updated:** 2026-04-23  
**Scope:** Second-wave decomposition of `features/schedule/ui/SchedulePageClient.tsx` after Round 1 (Phases 0–9 complete per [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md)).

**Authoritative references (must stay aligned):**

| Document | Role |
|----------|------|
| [`docs/schedule-architecture-core.md`](../../schedule-architecture-core.md) | UI tree: `sections/` vs `steps/` vs `layout/` vs `panes/`; **`lib/**` must NOT import `features/**`**. |
| [`.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`](../../../.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc) | Step 3 projection, `staffOverrides`, pending FTE wrappers, fingerprints, beds, rounding. |
| Round 1 spec | [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md) — §7 non-negotiables, §9.1–9.2 **two controllers + props-only shell** (locked). |

**Implementation plan (how to execute):** [`2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md`](./2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md) — phase checkboxes, gates, Progress tracker (mirrors Round 1’s [`2026-04-22-schedule-page-client-decomposition-implementation-plan.md`](./2026-04-22-schedule-page-client-decomposition-implementation-plan.md)).

**Subagent inputs for this draft:** brainstorming (explore) + **code-reviewer** (PASS with gaps); synthesized below.

---

## 1. Context — after Round 1

Round 1 delivered: `SplitReferencePortal`, `useSchedulePaneHydration`, `useSchedulePageQueryState`, `useStep3DialogProjection`, `useScheduleBoardDnd`, pure helpers in `lib/features/schedule/`, lazy dev harness, `ScheduleMainGrid` / `ScheduleSplitLayout`, incremental typing.

**Remaining problem:** `SchedulePageContent` is still effectively a **single mega-function** (~10k+ lines): a large **pre-return** block (hooks, effects, handlers, memos) and a large **JSX** block (`<ScheduleDndContextShell>` …). Merge-conflict surface, reviewability, and regression risk remain concentrated.

Round 2 targets **vertical slices** inside that orchestrator — **not** a rewrite of allocation math or `useScheduleController`.

---

## 2. External practice — single-route / “page orchestrator” UI

Common guidance for large React surfaces (presentational vs container separation, **custom hooks for orchestration**, feature-folder decomposition, strict import hierarchy, avoiding **new component types created inside render**) aligns with this project’s existing direction:

- **Separate orchestration from presentation:** keep **`SchedulePageContent`** as the **composition root** that wires `useScheduleController` and passes **stable, grouped props** into child modules — same spirit as container/presentational splits and “headless” logic in hooks ([React structure at scale — decomposition & layers](https://www.developerway.com/posts/react-project-structure)).
- **Custom hooks as the primary seam** for effects and derived state clusters — already used in Round 1; Round 2 extends into **copy/snapshot/export**, **step chrome navigation**, **context menus**, and optional **PCA transfer** encapsulation.
- **Feature-local folders** (`hooks/`, `layout/`, optional new `board/`) with **one clear responsibility per file** — matches “nanoservice” feature boundaries in large frontends.
- **Props-first composition** before context — matches the team’s **locked §9.2** decision (Round 1 spec): use **narrow or grouped** props; context only if future criteria explicitly justify it.

Use this section as **orientation**, not as a mandate to introduce Redux, Zustand, or schedule-wide context.

---

## 3. Goals and non-goals

### 3.1 Goals

- **Shrink cognitive load** in `SchedulePageClient.tsx` by extracting **named hooks** and **named UI modules** with explicit interfaces.
- **Preserve behavior** for all Round 1 §7 non-negotiables (Step 3 single projection path, `displayTargetByTeam`, fingerprints / commit ordering where applicable, pending FTE wrappers, split-ref hydration parity, DnD injection seams).
- **Reduce merge conflicts** by moving the largest **inline render IIFEs** (especially around `ScheduleMainGrid` `leftColumn` / `rightColumn`) into **stable child components**.
- **Keep verification disciplined:** `npm run lint && npm run build && npm run test:smoke` per mergeable slice; extend Playwright only when a slice introduces a **new regression class** (same threshold as Round 1 §6.1).

### 3.2 Non-goals

- **No** merging primary + reference into **one** `useScheduleController` without a controller redesign (§9.1 Round 1).
- **No** `lib/**` importing `features/**`; **no** new schedule screen **`*.tsx`** under `lib/features/schedule/`.
- **No** placing Step 2 grid body or Step 3.1–3.4 wizard panels under **`sections/`** (workflow chrome only).
- **No** schedule-wide **React context** for decomposition convenience (§9.2 locked) — optional **grouped prop objects** (e.g. `mainBoardProps`) are allowed.
- **No** re-encoding allocation rules in UI — orchestration only.
- **No** “typing-only mega-PR” disguised as refactor (Round 1 Phase 9 risk R3) — tighten types **in touched files** as follow-up hygiene.

---

## 4. Subagent synthesis

### 4.1 Brainstorming (recommended hybrid: A → B → C per slice)

| Priority | Strategy | Content |
|----------|----------|---------|
| **P0 — hook-first** | Invariant-heavy clusters | Step 2 finalize / downstream impact / fingerprint UX; pending FTE + slot pipeline audit; `staffOverrides` merge boundaries; residual hydration parity audit vs `useSchedulePaneHydration`. |
| **P1 — component-first** | Large JSX | Split **`ScheduleMainGrid`** column builders into **`layout/`** or **`board/`** components with explicit props; dialog **slot builders** grouped for `ScheduleDialogsLayer`. |
| **P2 — domain-first** | Pure only | Additional pure helpers → `lib/features/schedule/*.ts` where React-free (Phase 5 rules). |

**Recommendation:** **Hybrid** — stabilize **P0** hooks and handler seams **before** largest JSX extractions to avoid stale closures and prop churn.

### 4.2 Code review — verdict **PASS with gaps**

**Non-blocking but merge-critical mitigations:**

1. **Render IIFEs** around `ScheduleMainGrid` — extract with an explicit **prop model**; avoid splitting without tracking **split-mode** and **derived metrics** dependencies.
2. **`performSlotTransfer` / `performSlotDiscard`** — keep **single implementation** injected into `useScheduleBoardDnd`; do not fork.
3. **Dialog `*ResolverRef` clusters** — move **refs + openers + draining logic + `flushSync` ordering** as **atomic units**, not JSX-only peels.
4. **Effect dependencies** — extractions are a natural point to stabilize **`useCallback`** boundaries or co-locate related state.

**Taxonomy — `board/` vs `panes/` vs `layout/`:**

- **`panes/`** — pane-level surfaces (e.g. split reference); **do not** park the main board body here — misaligned with [`schedule-architecture-core.md`](../../schedule-architecture-core.md).
- **`layout/`** — already holds main grid / split layout; **prefer** `layout/ScheduleBoardLeftColumn.tsx` (example name) if avoiding new top-level folders.
- **`board/`** (optional) — if introduced for staff pool + team grid body, add **one row** to the UI table in `schedule-architecture-core.md` in the same PR (documentation checkpoint, not optional forever).

**Testing:** Playwright smoke remains the **primary gate**. **Vitest is not assumed** — pure `lib/` helpers may use **`node:test` + `tsx`** or await a future runner; RTL tests for hooks require adding a test stack — treat as **optional**, not blocking Round 2.

---

## 5. Target architecture (Round 2)

| Area | Path | Responsibility |
|------|------|----------------|
| Hooks | `features/schedule/ui/hooks/` | New composed hooks: e.g. copy/snapshot/export, step chrome navigation, context menus, optional `useSchedulePcaSlotTransfer` (name indicative). |
| Board / grid body | `features/schedule/ui/layout/` **and/or** `features/schedule/ui/board/` | Presentational columns and regions built from explicit props — **not** macro `sections/` chrome. |
| Dialog assembly | `features/schedule/ui/overlays/` or colocated `SchedulePageDialogs.tsx` | Build `ReactNode`s passed to `ScheduleDialogsLayer` — optional module to shrink resolver wiring noise in the orchestrator. |
| Domain | `lib/features/schedule/` | Pure helpers only — **no React**, no `features/` imports. |

**What stays in `SchedulePageContent` (minimum until a future redesign):**

- Primary **`useScheduleController`** wiring.
- **`performSlotTransfer` / `performSlotDiscard`** (or one hook that **owns** them) with optimistic PCA queue, undo, `staffOverrides`, `pendingPCAFTEPerTeam` — unless explicitly redesigned.
- Step 2 dialog **resolver refs** and assignments — unless moved **atomically** with openers/effects.
- **`useSchedulePaneHydration`** integration for main pane + copy/date navigation invariants.
- **`ScheduleDndContextShell`** + **`useScheduleBoardDnd`** wiring consistent with injected handlers.

---

## 6. Phased plan (Round 2 — indicative phases)

Phases are **mergeable slices**; numbering starts after Round 1’s Phase 9 (e.g. **R2-10 …**). Exact names belong in the implementation plan.

| Phase | Name | Objectives | Exit criteria |
|-------|------|------------|----------------|
| **R2-10** | Snapshot / saved-setup / diff cluster | Extract hook/module for snapshot diff popover state, fetch, and helpers; preserve §7 saved snapshot semantics. | Gates green; manual **Saved setup / snapshot** row if applicable; no extra Supabase round-trips without intent. |
| **R2-11** | Export / PNG / mobile preview | Isolate export handlers + `renderExportAction` + mobile preview dialog. | Gates green; manual export/download/preview once. |
| **R2-12** | Copy wizard & copy-arrival UX | Isolate `handleConfirmCopy`, copy-target highlight effect, loading toasts — **preserve copy/date §7.8**. | Gates green; manual copy + arrival animation; URL/date unchanged vs baseline. |
| **R2-13** | Step chrome navigation | Extract `handleNextStep` / `handlePreviousStep` / `handleStepClick` / `canNavigateToStep` + signals into a hook; thin props to `ScheduleWorkflowStepShell`. | Gates green; manual step strip + guards + Step 2→3 invalidation UX. |
| **R2-14** | Context menus & pool menus | Extract heavy `useMemo` menu builders to `useScheduleAllocationContextMenus` (or split). | Gates green; manual grid + pool context menus. |
| **R2-15** | Summary column component | Replace inner IIFE with **`ScheduleSummaryColumn`** (or similar) under `layout/` or `board/`; optional pure metric helpers → `lib/`. | Gates green; visual parity summary column; split mode unaffected. |
| **R2-16** | Staff pool / team columns | Split remaining `leftColumn` / `rightColumn` subtrees into named components; grouped props. | Gates green; DnD + pool assign manual smoke. |
| **R2-17** | Dialog slot factory (optional) | Single module producing nodes for `ScheduleDialogsLayer`; **atomic** resolver moves only if reviewed. | Gates green; Step 2 wizard dialogs flow (substitution, shared therapist, SPT, tie-break). |
| **R2-18** | PCA transfer hook (optional) | `useSchedulePcaSlotTransfer`-style encapsulation **behind same external behavior**; keep DnD injection. | Gates green; manual DnD §6.2. |

**Ordering note:** Code review recommends **summary column first** among JSX splits (lower coupling to resolver refs); hook-first **P0** items may run **before** R2-15 if they reduce closure risk for later extractions.

---

## 7. Risk register (Round 2)

| ID | Risk | Mitigation |
|----|------|------------|
| R2-1 | Stale closures when splitting IIFEs | Explicit prop interfaces; stabilize callbacks; extract **atomic** effect bundles. |
| R2-2 | Step 3 / fingerprint / `flushSync` ordering | Move effects **with** their refs; document ordering in hook headers (Round 1 R1). |
| R2-3 | Duplicate Step 3 bootstrap paths | Grep for `computeStep3BootstrapSummary`; single contract with `useStep3DialogProjection`. |
| R2-4 | Manual `pendingFTE` mutation | Grep `pendingFTE` / `setPendingPCAFTEPerTeam`; only approved wrappers post-transfer. |
| R2-5 | Split ref vs main hydration drift | Re-verify shared hook coverage; extend smoke if ref date change / abort class missing. |
| R2-6 | Prop list explosion | Use **grouped** props objects; avoid context (§9.2). |

---

## 8. Verification strategy

- **Every slice:** `npm run lint && npm run build && npm run test:smoke` (see [`.cursor/skills/playwright-smoke/SKILL.md`](../../../.cursor/skills/playwright-smoke/SKILL.md)).
- **Manual:** map each phase to Round 1 spec **§6.2** rows (Step 3, `staffOverrides`, Step 2→3, fingerprints, pending FTE, split ref, DnD, copy/date) — run the **minimal** set touching that phase.
- **Playwright:** add or extend **`@smoke`** only when a new regression class appears (same as Round 1 §6.1).

---

## 9. Business logic preservation

All contractual items from Round 1 spec **§7** remain in force. Round 2 **does not** relax:

1. Step 3 projection — **single path**; **`displayTargetByTeam`** for Avg PCA/team.  
2. **`staffOverrides`** SSOT.  
3. Step 2 downstream invalidation — fingerprints and rerun UX.  
4. Fingerprint refs + **`useLayoutEffect` / `flushSync`** ordering.  
5. Pending FTE — **`assignOneSlotAndUpdatePending`** / **`assignUpToPendingAndUpdatePending`** only.  
6. Split reference — **AbortController**, hydration, stuck-skeleton finalizers.  
7. DnD — optimistic sync with controller; **preserved injection** for slot transfer.  
8. Copy / date navigation effects.  
9. No allocation re-encoding in UI.

---

## 10. Rollback strategy

Same as Round 1 spec **§8**: prefer **incremental PRs** with revert-by-merge; short-lived flags only if a slice is experimentally risky.

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-23 | Initial Round 2 draft from lead analysis + brainstorming subagent + code-reviewer subagent + external practice notes. |
| 2026-04-23 | Linked [`2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md`](./2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md). |
