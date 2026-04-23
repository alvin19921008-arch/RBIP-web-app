# SchedulePageClient decomposition — Round 2 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Further decompose `features/schedule/ui/SchedulePageClient.tsx` (`SchedulePageContent`) into `hooks/`, `layout/` (and optionally `board/`), `overlays/`, and `lib/features/schedule/` pure helpers — **without** changing product behavior — following [`2026-04-23-schedule-page-client-round2-decomposition-spec.md`](./2026-04-23-schedule-page-client-round2-decomposition-spec.md).

**Architecture:** UI orchestration stays in `features/schedule/ui/`. **`lib/**` must not import `features/**`.** Two `useScheduleController` instances (primary + ref) unchanged ([Round 1 spec §9.1](./2026-04-22-schedule-page-client-decomposition-spec.md)). **Props-only** schedule shell ([§9.2](./2026-04-22-schedule-page-client-decomposition-spec.md)); no schedule-wide React context for convenience. Main board body belongs in **`layout/`** or **`board/`**, **not** `sections/` (workflow chrome only) and **not** `panes/` (split reference / pane-level UI).

**Tech stack:** Next.js App Router (`'use client'` where needed), React 19, TypeScript, Tailwind, `@dnd-kit`, Supabase client, Playwright (`@smoke`).

**Canonical requirements:** Round 2 spec — **§9 business logic preservation** (mirrors Round 1 §7) and **§8 verification**. Round 1 spec [**§7**](./2026-04-22-schedule-page-client-decomposition-spec.md#7-business-logic-preservation-preservation-non-negotiables) remains the detailed non-negotiables list.

**Orchestrator paste prompt (Composer 2, sub-agents only, review loop):** [`2026-04-23-schedule-page-client-round2-orchestrator-handoff-prompt.md`](./2026-04-23-schedule-page-client-round2-orchestrator-handoff-prompt.md)

### Orchestrator workflow (each phase)

1. **Implement** — one phase at a time; follow phase checklists below.
2. **Global gates** — `npm run lint && npm run build && npm run test:smoke`.
3. **Code review** — compare the diff to this plan + Round 2 spec §9 / Round 1 §7 for touched areas.
4. **Flag gaps** — If review finds a checklist line **not met**, keep `- [ ]` and add **Review flag:** until fixed.
5. **Review–fix loop** — Implement fixes (sub-agent or dedicated session), re-run gates, re-review until **PASS** or only non-blocking notes.
6. **Progress tracker** — Set phase **Done** only when checklists are clean and gates are green.

---

## Progress tracker

**How to use:** Update **Status** and **Notes** after each merged phase.

**Manual steps (UI / product spot-checks):** Only the **human owner** checks off steps labeled **Manual** in each phase. The orchestrator may run automated gates and mark implementation steps; it must **not** mark manual checkboxes `[x]`—remind the owner to sign off when a phase is otherwise complete.

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| R2-0 | Preconditions & baseline | Done | 2026-04-23: commit `9812012`; lint + build + smoke green; reviewer PASS. `wc -l` SchedulePageClient = 10845. First smoke attempt failed: port 3000 in use (HTTP 500); cleared — re-ran green. |
| R2-10 | Snapshot / saved-setup / diff | Done | 2026-04-23: commit `66d8aa6`; manual step 5 signed by owner. |
| R2-11 | Export / PNG / mobile preview | Done | 2026-04-23: commit `f670567`; manual step 4 signed by owner. |
| R2-12 | Copy wizard & copy-arrival UX | Done | 2026-04-23: commit `2b3aad0`; manual step 4 signed by owner (§7.8). |
| R2-13 | Step chrome navigation | Done | 2026-04-23: commit `1cc206a`; manual step 4 signed by owner. |
| R2-14 | Context menus & pool menus | Done | 2026-04-23: commit `b4299e5`; manual step 4 signed by owner. |
| R2-15 | Summary column component | Done | 2026-04-23: commit `82829b5`; manual step 5 signed by owner. |
| R2-16 | Staff pool / team columns | Done | 2026-04-23: commit `b5f5966`; manual step 4 signed by owner. |
| R2-17 | Dialog slot factory (optional) | Done | 2026-04-23: commit `dce112d`; `SchedulePageDialogNodes.tsx`; gates + review PASS. |
| R2-18 | PCA transfer hook (optional) | Done | 2026-04-23: commit `fa07afa`; manual step 4 signed by owner. |

**Status values:** `Not started` · `In progress` · `Done` · `Skipped`

**Suggested execution order:** **R2-0 → R2-10 → R2-11 → R2-12 → R2-13 → R2-14 → R2-15 → R2-16 → (R2-17) → (R2-18)**. Optional phases may be **Skipped** with Notes explaining deferral.

**Companion spec:** [`2026-04-23-schedule-page-client-round2-decomposition-spec.md`](./2026-04-23-schedule-page-client-round2-decomposition-spec.md)

---

## Why this document exists

| Document | Role |
|----------|------|
| **Round 2 spec** | Goals, risks, phased objectives, verification |
| **This plan** | File paths, ordered tasks, gates, merge checkpoints |

---

## File map (Round 2 target — incremental)

| Path | Role |
|------|------|
| `features/schedule/ui/SchedulePageClient.tsx` | Orchestrator only: shrinks as slices land; still owns primary controller + composition |
| `features/schedule/ui/hooks/useScheduleSnapshotDiff.ts` (name indicative) | R2-10: snapshot diff popover state + async diff + helpers wired from client |
| `features/schedule/ui/hooks/useScheduleExportActions.ts` or `sections/`-adjacent export module | R2-11: export PNG, mobile preview state, `renderExportAction` |
| `features/schedule/ui/hooks/useScheduleCopyWorkflow.ts` | R2-12: copy confirm, arrival highlight, loading integration |
| `features/schedule/ui/hooks/useScheduleStepChromeNavigation.ts` | R2-13: step next/prev/click/guards + signals for shell |
| `features/schedule/ui/hooks/useScheduleAllocationContextMenus.tsx` | R2-14: grid + pool context menu builders (`.tsx` for item icons) |
| `features/schedule/ui/layout/ScheduleSummaryColumn.tsx` | R2-15: summary column JSX + props interface |
| `features/schedule/ui/layout/ScheduleBoardLeftColumn.tsx`, `.../ScheduleBoardRightColumn.tsx` | R2-16: left (summary + staff pool) and right (main board stack) |
| `features/schedule/ui/overlays/SchedulePageDialogNodes.tsx` | R2-17: `ScheduleDialogsLayer` slot tree; refs owned by `SchedulePageClient` |
| `features/schedule/ui/hooks/useSchedulePcaSlotTransfer.ts` | R2-18: PCA `performSlotTransfer` / `performSlotDiscard` / pool assign; DnD still gets same refs |
| `lib/features/schedule/*.ts` | Pure helpers peeled from summary/IIFE metrics (R2-15/R2-16) — **no React** |

---

## Global gates (after every phase that changes production code)

Run from repo root:

```bash
npm run lint
npm run build
npm run test:smoke
```

**Expected:** All exit 0. Refactor gate order matches [`.cursor/skills/playwright-smoke/SKILL.md`](../../../.cursor/skills/playwright-smoke/SKILL.md).

**Do not merge** if gates fail unless the failure is environmental and documented.

---

## Phase R2-0 — Preconditions and safety baseline

**Objective:** Confirm integration branch is green and reviewers have Round 2 spec §6.2 / Round 1 §6.2 manual rows available.

**Files:** None required.

- [x] **Step 1:** On your branch (or `main` before branching), run global gates; record passing commit SHA in Progress tracker **Notes**.

```bash
npm run lint && npm run build && npm run test:smoke
```

- [x] **Step 2:** Read Round 2 spec **§9** + Round 1 spec **§7** once; keep open when testing R2-10–R2-16.
- [x] **Step 3:** Optional: `wc -l features/schedule/ui/SchedulePageClient.tsx` baseline for before/after narrative.

**Commit:** None required.

---

## Phase R2-10 — Snapshot / saved-setup / diff cluster

**Objective:** Extract snapshot diff popover state, loading/error, `hasAnySnapshotDiff`, `computeSnapshotDiffFromDbSnapshot`, and related refs from `SchedulePageContent` into a dedicated hook (or small hook + pure helpers in `lib/`).

**Canonical:** Preserve baseline snapshot semantics; no extra Supabase chatter unless intentionally documented.

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleSnapshotDiff.ts` (final name may differ)
- **Modify:** `features/schedule/ui/SchedulePageClient.tsx` — replace inlined block with hook return values + thin wiring
- **Optional create:** `lib/features/schedule/snapshotDiffPure.ts` — only if helpers are **pure** and React-free

- [x] **Step 1:** Grep `SchedulePageContent` for `snapshotDiff`, `savedSetupPopover`, `computeSnapshotDiff`, `BaselineSnapshot`, `unwrapBaselineSnapshotStored`; mark contiguous regions to move.
- [x] **Step 2:** Implement hook: accept **dependencies** (`supabase`, `selectedDate`, `currentScheduleId`, etc.) explicitly — avoid implicit closure over half the component.
- [x] **Step 3:** Wire popover JSX to hook outputs; behavior parity only.
- [x] **Step 4:** Global gates.
- [x] **Step 5:** **Manual (owner):** open Saved setup popover; run diff if applicable; confirm no new errors. *(2026-04-23, owner)*
- [x] **Step 6:** Commit: `refactor(schedule): extract snapshot diff hook (round 2)`.

---

## Phase R2-11 — Export / PNG / mobile preview

**Objective:** Isolate export pipeline: `exportAllocationImage`, `exportingPng`, `mobilePreviewOpen`, `mobilePreviewUrl`, `renderExportAction`, mobile preview `Dialog`, and related helpers.

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleExportActions.ts` (or split `useScheduleExportActions.tsx` if a tiny presentational helper is needed — prefer hooks + separate small component file)
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Grep for `exportAllocationImage`, `renderExportAction`, `mobilePreview`, `Export`, `ImageDown`.
- [x] **Step 2:** Move logic into hook returning `{ renderExportAction, mobilePreviewDialog, ... }` or equivalent composition-friendly API **without** changing UX strings or toast behavior.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** desktop export download; mobile or narrow viewport: preview + download + Done (if environment allows). *(2026-04-23, owner)*
- [x] **Step 5:** Commit: `refactor(schedule): extract schedule export actions (round 2)`.

---

## Phase R2-12 — Copy wizard & copy-arrival UX

**Objective:** Extract `handleConfirmCopy`, copy progress toasts, `copyTargetDateKey` effect (highlight + `goToStep('leave-fte')` + pulse), preserving **copy/date navigation** invariants (Round 1 §7 item 8).

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleCopyWorkflow.ts`
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Locate `handleConfirmCopy`, `copyTargetDateKey`, `COPY_ARRIVAL_ANIMATION_MS`, `setCopyTargetDateKey`, top loading hooks interaction.
- [x] **Step 2:** Implement hook so **all** side effects remain ordered identically (same dependency semantics).
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** run copy wizard to a target date; confirm arrival highlight + step behavior + URL unchanged relative to baseline. *(2026-04-23, owner)*
- [x] **Step 5:** Commit: `refactor(schedule): extract copy workflow hook (round 2)`.

---

## Phase R2-13 — Step chrome navigation

**Objective:** Extract step navigation: `handleNextStep`, `handlePreviousStep`, `handleStepClick`, `canNavigateToStep` logic, `allocationStepNavSignals`, prefetch hooks (`prefetchStep2Algorithms`, etc.), and wire **narrow props** to `ScheduleWorkflowStepShell`.

**Canonical:** Step 2 → Step 3 invalidation UX and downstream impact remain correct; do not weaken guards.

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleStepChromeNavigation.ts`
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Grep `handleNextStep`, `handlePreviousStep`, `handleStepClick`, `allocationStepNavSignals`, `ALLOCATION_STEPS`.
- [x] **Step 2:** Hook returns stable callbacks + data for shell; avoid inline mega-lambdas in JSX.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** step strip forward/back, blocked steps, attention badges for outdated Step 3/4 per §6.2. *(2026-04-23, owner)*
- [x] **Step 5:** Commit: `refactor(schedule): extract step chrome navigation hook (round 2)`.

---

## Phase R2-14 — Context menus & pool menus

**Objective:** Extract heavy `useMemo` trees for grid/pool context menus into `useScheduleAllocationContextMenus` (or `useScheduleGridContextMenu` + `useSchedulePoolContextMenu` if separation is clearer).

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleAllocationContextMenus.tsx` (or `.ts` if no JSX in the hook file)
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Grep `ContextMenu`, `gridStaffContextMenu`, `staffPoolContextMenu`, `StaffContextMenu`.
- [x] **Step 2:** Preserve menu item IDs, disabled rules, and handler references — **no** behavior change.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** open context menus from grid + pool; execute one safe action each (per environment). *(2026-04-23, owner)*
- [x] **Step 5:** Commit: `refactor(schedule): extract allocation context menu hooks (round 2)`.

---

## Phase R2-15 — Summary column component

**Objective:** Replace the **inner IIFE** that builds the Summary block under `ScheduleMainGrid` `leftColumn` with a named component (e.g. `ScheduleSummaryColumn`) colocated under `features/schedule/ui/layout/` or `board/`.

**Canonical:** If adding **`board/`**, add **one row** to the UI table in [`docs/schedule-architecture-core.md`](../../schedule-architecture-core.md) in the **same PR**.

**Files:**

- **Create:** `features/schedule/ui/layout/ScheduleSummaryColumn.tsx` (pathAdjust if using `board/`)
- **Optional create:** `lib/features/schedule/scheduleSummaryMetrics.ts` — pure metric prep only
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Locate `ScheduleMainGrid` `leftColumn` and the summary `(() => {` block (grep `SummaryColumn` / `totalBedsAfterDeductions`).
- [x] **Step 2:** Define an explicit **props interface**; pass **only** what the column needs (grouped prop allowed).
- [x] **Step 3:** Optional: extract pure computations to `lib/`; keep display policy in UI.
- [x] **Step 4:** Global gates.
- [x] **Step 5:** **Manual (owner):** summary numbers match prior run; toggle split mode — layout unchanged. *(2026-04-23, owner)*
- [x] **Step 6:** Commit: `refactor(schedule): extract ScheduleSummaryColumn (round 2)`.

---

## Phase R2-16 — Staff pool / team columns

**Objective:** Split remaining **`leftColumn`** / **`rightColumn`** subtrees (below summary / team grid / pool / notes) into named components with grouped props.

**Risk:** Highest merge-conflict zone — preserve **`performSlotTransfer`** / **`performSlotDiscard`** injection into DnD; **do not** duplicate.

**Files:**

- **Create:** one or more of `ScheduleBoardLeftStack.tsx`, `ScheduleBoardRightStack.tsx`, `ScheduleTeamGridSection.tsx`, etc. (names chosen during implementation)
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Map JSX regions inside outer `{(() => { const mainLayout = (` … `ScheduleMainGrid` … `})()}`; extract **bottom-up** (pool → teams → wrappers) or **column-first** — document choice in PR. *(column-first: left + right layout components)*
- [x] **Step 2:** Ensure **split mode** and **display mode** branches still resolve correctly.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** §6.2 **DnD** (PCA + therapist), **pending FTE** sanity, grid + pool interactions. *(2026-04-23, owner)*
- [x] **Step 5:** Commit: `refactor(schedule): extract board column components (round 2)`.

---

## Phase R2-17 — Dialog slot factory (optional)

**Objective:** Consolidate construction of `ReactNode`s passed to `ScheduleDialogsLayer` into `SchedulePageDialogNodes.tsx` (or similar) **only if** refs and resolvers move **atomically** with their dialog JSX.

**Skip** this phase if extraction would split resolver refs from open/drain logic.

**Files:**

- **Create:** `features/schedule/ui/overlays/SchedulePageDialogNodes.tsx` (indicative)
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Inventory `ScheduleDialogsLayer` props and resolver refs (`*ResolverRef`).
- [x] **Step 2:** Move **one dialog cluster** end-to-end as pilot; gates + manual Step 2 dialog flow. *(Full layer moved atomically; owner confirmed Step 2 flows 2026-04-23.)*
- [x] **Step 3:** Repeat or stop — do not half-move resolver pattern. *(All slots in `SchedulePageDialogNodes`.)*
- [x] **Step 4:** Commit per pilot or single commit if low risk.

---

## Phase R2-18 — PCA transfer hook (optional)

**Objective:** Encapsulate `performSlotTransfer`, `performSlotDiscard`, and closely related helpers into `useSchedulePcaSlotTransfer` **while** `useScheduleBoardDnd` still receives **the same** injected functions (identical signatures and behavior).

**Files:**

- **Create:** `features/schedule/ui/hooks/useSchedulePcaSlotTransfer.ts`
- **Modify:** `SchedulePageClient.tsx`, possibly `useScheduleBoardDnd.ts` call site only

- [x] **Step 1:** Verify single implementation — grep `performSlotTransfer` definitions (must remain one).
- [x] **Step 2:** Extract to hook factory; wire return values into DnD params.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** §6.2 **DnD** exhaustive for PCA moves + discard. *(2026-04-23, owner)*
- [x] **Step 5:** Commit: `refactor(schedule): extract PCA slot transfer hook (round 2)`.

---

## Spec coverage self-review

| Round 2 spec section | Plan location |
|---------------------|---------------|
| §3 Goals / non-goals | Architecture + optional skip |
| §5 Target architecture | File map |
| §6 Phases R2-10–R2-18 | Phases below |
| §7 Risks | Mitigations in phase notes + R2-16 injection warning |
| §8 Verification | Global gates + manual rows per phase |
| §9 Business preservation | Canonical calls in R2-10–R2-13, R2-16, R2-18 |

**Gaps:** None intentional; optional phases documented as **Skipped** if deferred.

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-23 | Initial Round 2 implementation plan. |
| 2026-04-23 | R2-0 complete: Progress tracker + phase checkboxes; baseline SHA `9812012`, gates + reviewer PASS. |
| 2026-04-23 | R2-10 complete: `useScheduleSnapshotDiff` extracted; commit `66d8aa6`; gates + reviewer PASS. |
| 2026-04-23 | R2-11 complete: `useScheduleExportActions` extracted; commit `f670567`; gates + reviewer PASS. |
| 2026-04-23 | R2-12 complete: `useScheduleCopyWorkflow` extracted; commit `2b3aad0`. Manual step 4 left to owner. |
| 2026-04-23 | Manual spot-checks: only owner ticks **Manual (owner)** steps; orchestrator does not. |
| 2026-04-23 | R2-13: `useScheduleStepChromeNavigation`; commit `1cc206a`. Manual step 4 pending owner. |
| 2026-04-23 | Owner confirmed R2-10/11/12 manual steps; checkboxes + tracker updated. |
| 2026-04-23 | R2-14: `useScheduleAllocationContextMenus`; commit `b4299e5`. Manual step 4 pending owner. |
| 2026-04-23 | Owner confirmed R2-13 manual; tracker updated. |
| 2026-04-23 | R2-15: `ScheduleSummaryColumn`; commit `82829b5`. Manual step 5 pending owner. |
| 2026-04-23 | Owner confirmed R2-14 manual; manual checkboxes + tracker. |
| 2026-04-23 | Owner confirmed R2-15 manual; R2-15 complete. |
| 2026-04-23 | R2-16: `ScheduleBoardLeftColumn` / `ScheduleBoardRightColumn`; commit `b5f5966`; owner confirmed manual. |
| 2026-04-23 | R2-17: `SchedulePageDialogNodes`; commit `dce112d`. |
| 2026-04-23 | R2-18: `useSchedulePcaSlotTransfer`; commit `fa07afa`; owner confirmed manual. |
| 2026-04-23 | Owner confirmed R2-17 Step 2 in app. |
