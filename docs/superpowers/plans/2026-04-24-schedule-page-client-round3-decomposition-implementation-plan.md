# SchedulePageClient decomposition — Round 3 implementation plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Further decompose `features/schedule/ui/SchedulePageClient.tsx` into `hooks/`, `layout/` / `sections/` / `overlays/`, and optional `lib/features/schedule/` pure helpers — **without** changing product behavior — following [`2026-04-24-schedule-page-client-round3-decomposition-spec.md`](./2026-04-24-schedule-page-client-round3-decomposition-spec.md).

**Architecture:** UI orchestration stays in `features/schedule/ui/`. **`lib/**` must not import `features/**`.** Two-controller split + **props-only** shell (Round 1 §9.1–9.2). **No** schedule-wide context for convenience.

**Tech stack:** Next.js App Router, React 19, TypeScript, Tailwind, `@dnd-kit`, Supabase client, Playwright (`@smoke`).

**Canonical requirements:** Round 3 spec **§7 / §9** (business preservation) and **§8** (verification) — mirror Round 1 [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md) §7 where Round 3 points to them.

**Orchestrator handoff (use this for Round 3):** [`2026-04-24-schedule-page-client-round3-orchestrator-handoff-prompt.md`](./2026-04-24-schedule-page-client-round3-orchestrator-handoff-prompt.md) — Composer 2 only; implement → gates → review → fix loop; do **not** mark `Manual (owner):` checkboxes. Older style reference: [`2026-04-23-schedule-page-client-round2-orchestrator-handoff-prompt.md`](./2026-04-23-schedule-page-client-round2-orchestrator-handoff-prompt.md).

---

## Progress tracker

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| R3-20 | Pre-baseline & order | Done | 2026-04-24: `wc -l` **8159**; gates at **ba080b2** (pre-commit); orchestrator re-ran gates green on **38d787e**; smoke 13 passed, 3 skipped. Anchors: `useAllocationSync` → `SchedulePageClient.tsx:3578`; `handleInitializeAlgorithm` → `:4139`; `beginDateTransition` → `:5066`; `flushSync` → `:1168`. R1 §7 re-read. Doc commit **38d787e** (`chore(docs): round 3 baseline`). Reviewer **PASS** (non-blocking: untracked sibling plan/handoff `.md` files may be committed separately). |
| R3-21 | Initial date + date/URL | Done | 2026-04-24: commit **20184a7**; gates + reviewer **PASS**. Owner **confirmed** manual Step 4 (URL/calendar/cold load). Hooks: `useScheduleInitialDateResolution.ts`, `useScheduleDateTransition.ts`. |
| R3-22 | Recalc + `useAllocationSync` + beds | Done | 2026-04-24: commit **c07c63c**; gates + reviewer **PASS**. Owner **confirmed** manual Step 4 (overrides / bed / double recalc). `useScheduleAllocationRecalcAndSync.ts`. |
| R3-23 | Step 2 dependency + buffered Step 2 toast | Done | 2026-04-24: commit **9b57bd3**; gates + reviewer **PASS**. Owner **confirmed** manual Step 4 (toast + Step 3 bootstrap / badges). `useScheduleStep2DependencyAndToast.ts`. |
| R3-24 | Substitution wizard | Done | 2026-04-24: commit **19ec57a**; gates + reviewer **PASS**. Owner **confirmed** manual Step 4 (wizard cancel + confirm). `useScheduleSubstitutionWizard.ts`. |
| R3-25 | `handleInitializeAlgorithm` + step 2/3 run pipeline | In progress | Single hook `useScheduleAlgorithmEntry.ts` (no 25a/25b split). Implementer: gates green **899e81a**; Step 4 manual unchecked. |
| R3-26 | DnD bridge wiring | Not started | |
| R3-27 | Toolbar + interaction layer | Not started | |
| R3-28 | Grouped dialog/board props (optional) | Not started | |
| R3-29 | Dev/perf + pure helper peel (optional) | Not started | |

**Status values:** `Not started` · `In progress` · `Done` · `Skipped`

**Suggested order:** R3-20 → **R3-21** → **R3-22** → R3-23 → R3-24 → R3-25 → R3-26 → R3-27 → (R3-28) → (R3-29).

**Companion spec:** [`2026-04-24-schedule-page-client-round3-decomposition-spec.md`](./2026-04-24-schedule-page-client-round3-decomposition-spec.md)

---

## File map (Round 3 target — incremental)

| Path (indicative) | Phase | Role |
|-------------------|-------|------|
| `features/schedule/ui/hooks/useScheduleInitialDateResolution.ts` (name may differ) | R3-21 | `initialDateResolved`, `useScheduleDateParam`, last-open persistence, early-return gate |
| `features/schedule/ui/hooks/useScheduleDateTransition.ts` | R3-21 | `beginDateTransition`, `queueDateTransition`, URL `date=` sync with `replaceScheduleQuery` / `urlDateKey` |
| `features/schedule/ui/hooks/useScheduleAllocationRecalcAndSync.ts` (name may differ) | R3-22 | `recalculateScheduleCalculations` + dependent effects + `useAllocationSync` + bed async recompute **only if** order is preserved |
| `features/schedule/ui/hooks/useScheduleStep2DependencyAndToast.ts` (or two files) | R3-23 | Fingerprint / finalize + buffered Step 2 success toast + flush `useEffect` |
| `features/schedule/ui/hooks/useScheduleSubstitutionWizard.ts` | R3-24 | Wizard state, resolver, `handleSubstitutionWizard*` |
| `features/schedule/ui/hooks/useScheduleAlgorithmEntry.ts` (or split) | R3-25 | `handleInitializeAlgorithm`, `generateStep2*`, `generateStep3*`, SPT / shared therapist flows **as much as** safely movable |
| `features/schedule/ui/hooks/useScheduleBoardDndWiring.ts` (optional thin wrapper) | R3-26 | Local fns + compose `useSchedulePcaSlotTransfer` + `useScheduleBoardDnd` |
| `features/schedule/ui/sections/SchedulePageToolbar.tsx` (or `layout/`) | R3-27 | `displayToolsInlineNode` |
| `features/schedule/ui/overlays/SchedulePageGridInteractionOverlays.tsx` (name indicative) | R3-27 | `ScheduleOverlays` + pool assign + context menu children wiring **if** props are stable |
| `lib/features/schedule/detectNonFloatingSubstitutions.ts` (optional) | R3-29 | Pure only — **no** `features/` imports |

**Existing hooks (typically extend or call; do not merge into one file):** see Round 3 spec **§2.1** and code-reviewer list (`useScheduleBoardDnd`, `useSchedulePcaSlotTransfer`, `useScheduleAllocationContextMenus`, `useStep3DialogProjection`, …).

---

## Global gates (after every production-affecting phase)

```bash
npm run lint && npm run build && npm run test:smoke
```

Do not merge on failure unless environmental and documented.

---

## Phase R3-20 — Preconditions and baseline

**Objective:** Record baseline size and ensure gates green before R3-21.

**Files:** None required beyond tracker.

- [x] **Step 1:** `wc -l features/schedule/ui/SchedulePageClient.tsx` — paste into **Notes** + spec narrative if needed. (**8159** lines as of 2026-04-24.)
- [x] **Step 2:** `npm run lint && npm run build && npm run test:smoke` — record commit SHA in **Notes**. (Gates at **ba080b2**; all three exited 0.)
- [x] **Step 3:** Grep one anchor per high-risk area (`useAllocationSync`, `handleInitializeAlgorithm`, `beginDateTransition`, `flushSync`) to refresh line map if files moved since spec draft.
  - `useAllocationSync` — `features/schedule/ui/SchedulePageClient.tsx:3578` (call site; import at `:177`; implementation `lib/hooks/useAllocationSync.ts`)
  - `handleInitializeAlgorithm` — `features/schedule/ui/SchedulePageClient.tsx:4139`
  - `beginDateTransition` — `features/schedule/ui/SchedulePageClient.tsx:5066` (wrapper; controller at `lib/features/schedule/controller/useScheduleController.ts:1594`; split ref at `features/schedule/ui/panes/SplitReferencePortal.tsx:66`)
  - `flushSync` — `features/schedule/ui/SchedulePageClient.tsx:1168` (import `:4`)
- [x] **Step 4:** Re-read Round 1 spec **§7**; keep open for R3-25 / R3-22. (Business logic preservation non-negotiables — Step 3 single path, `staffOverrides` SSOT, fingerprints / rerun UX, `flushSync` ordering, pending FTE APIs only, split ref lifecycle, DnD, copy/date nav, no UI-encoded allocation rules.)

**Commit:** Optional: `chore(docs): round 3 baseline` if only docs/tracker update.

---

## Phase R3-21 — Initial date resolution + date/URL transition

**Objective:** Move `initialDateResolved` (and its async resolver + `useScheduleDateParam` + last-open key) and `beginDateTransition` / `queueDateTransition` into **one or two** dedicated hooks. Preserve **no double `controllerBeginDateTransition`** on URL path (comments near `beginDateTransition` in `SchedulePageClient`).

**Files:**

- **Create:** hook(s) under `features/schedule/ui/hooks/`
- **Modify:** `SchedulePageClient.tsx` — wire hook outputs; keep early return for `!initialDateResolved`

- [x] **Step 1:** Grep `initialDateResolved`, `useScheduleDateParam`, `beginDateTransition`, `replaceScheduleQuery`, `LAST_OPEN_SCHEDULE_DATE_KEY`.
- [x] **Step 2:** Extract with **explicit** parameters (no implicit closure over half the component). Stabilize `queueDateTransition` + `useScheduleCopyWorkflow` interop.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** URL date change, calendar picker, no snap-back; cold load (no “today → fallback” flicker). (Owner confirmed OK 2026-04-24.)
- [x] **Step 5:** Commit: `refactor(schedule): extract date bootstrap + date transition (round 3)`.

---

## Phase R3-22 — Recalc + `useAllocationSync` + bed recompute

**Objective:** Group `recalculateScheduleCalculations` and its effect cluster with **`useSchedulePaneHydration` end effect** and **`useAllocationSync`** in a way that **preserves ordering** (read comments in `SchedulePageClient` and matching rules in `ARCHITECTURE_ESSENTIALS`).

**Files:**

- **Create:** `useScheduleAllocationRecalcAndSync.ts` (or split *only* if order is documented in spec comments)
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Grep `useAllocationSync`, `useMainPaneLoadAndHydrateDateEffect` / `useSchedulePaneHydrationEndEffect`, `recalculateScheduleCalculations`, `allocateBeds`, `setBedAllocations`.
- [x] **Step 2:** Move in **one** slice or document `useEffect` order at top of new hook file. Do **not** change dependency arrays without justification.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** load date, change overrides, step through bed step if applicable; watch for double network/recalc. (Owner confirmed OK 2026-04-24.)
- [x] **Step 5:** Commit: `refactor(schedule): extract allocation recalc and sync (round 3)`.

---

## Phase R3-23 — Step 2 dependency + buffered Step 2 completion toast

**Objective:** Extract fingerprint refs, `markDependentStepsOutOfDate`, `finalizeStep2DependencyChanges` / `scheduleFinalizeStep2DependencyChanges`, and the **buffered Step 2** toast + `useEffect` flush that pairs with `describeStep3BootstrapDelta` / bootstrap baselines.

**Files:**

- **Create:** e.g. `useScheduleStep2DependencyAndToast.ts` (or **two** hooks if separation is clearer)
- **Modify:** `SchedulePageClient.tsx`

- [x] **Step 1:** Grep `step2FingerprintBaselineRef`, `bufferedStep2`, `captureStep2DependencyBaseline`, `finalizeStep2DependencyChanges`, `useStep3DialogProjection` (call site only for deps).
- [x] **Step 2:** Keep **all** `flushSync` + finalize pairings in the same module or explicitly imported from one place.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** run Step 2, verify toast + Step 3 bootstrap / outdated badges. (Owner confirmed OK 2026-04-24.)
- [x] **Step 5:** Commit: `refactor(schedule): extract step2 dependency and buffered toast (round 3)`.

---

## Phase R3-24 — Substitution wizard

**Objective:** Move substitution wizard `useState` / `useRef` resolver, `setSubstitutionWizardOpen`, `handleSubstitutionWizardConfirm|Cancel|Skip`, and `substitutionWizardDataForDisplay` into `useScheduleSubstitutionWizard` (or similar).

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleSubstitutionWizard.ts`
- **Modify:** `SchedulePageClient.tsx`, possibly `SchedulePageDialogNodes` props (thin)

- [x] **Step 1:** Grep `substitutionWizard`, `onNonFloatingSubstitutionWizard`.
- [x] **Step 2:** `generateStep2` must still **await** the same Promise contract — **no** change to `scheduleActions.runStep2TherapistAndNonFloatingPCA` behavior.
- [x] **Step 3:** Global gates.
- [x] **Step 4:** **Manual (owner):** Step 2 path that opens substitution wizard; cancel + confirm. (Owner confirmed OK 2026-04-24.)
- [x] **Step 5:** Commit: `refactor(schedule): extract substitution wizard hook (round 3)`.

---

## Phase R3-25 — `handleInitializeAlgorithm` + `generateStep2` / `generateStep3` + SPT / shared therapist entry

**Objective:** Shrink the largest pre-`return` block. Prefer **one** `useScheduleAlgorithmEntry` (name indicative) that returns `handleInitializeAlgorithm` and the internal `async` helpers **or** split **25a** (generators + point 2/3) / **25b** (`handleInitializeAlgorithm` + switch) if the diff is unreviewable.

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleAlgorithmEntry.ts` (and optional helpers file colocated)
- **Modify:** `SchedulePageClient.tsx`
- **Optional create:** `lib/` pure peel only when React-free (see R3-29)

- [x] **Step 1:** Grep `handleInitializeAlgorithm`, `generateStep2`, `generateStep3`, `showStep2Point2`, `showStep2Point3`, resolver refs, `useScheduleController` actions.
- [x] **Step 2:** Extract **with** the same `scheduleActions` and toast/invalidate calls; do not fork dev harness `runStep2Auto` without shared subroutines.
- [x] **Step 3:** Global gates.
- [ ] **Step 4:** **Manual (owner):** run **Initialize** from step strip for each major step; Step 2.1 / 2.2 / 2.3 dialogs; Step 3 entry.
- [x] **Step 5:** Commit: `refactor(schedule): extract algorithm entry hook (round 3)`.

---

## Phase R3-26 — DnD bridge (thin composition)

**Objective:** Optionally collapse local helpers (`resetPcaDragState`, `removeTherapistAllocationFromTeam`, `performTherapistSlotDiscard`, …) plus wiring for `useSchedulePcaSlotTransfer` and `useScheduleBoardDnd` into **`useScheduleBoardDndWiring`**. **Do not** merge `useScheduleBoardDnd` and `useScheduleAllocationContextMenus` into one file.

**Files:**

- **Create:** `useScheduleBoardDndWiring.ts` (optional)
- **Modify:** `SchedulePageClient.tsx`

- [ ] **Step 1:** Grep `useSchedulePcaSlotTransfer`, `useScheduleBoardDnd`, `handleDragStart`, `performSlotTransfer`, `gridStaffContextMenuItems` (wiring only).
- [ ] **Step 2:** Keep **single** `performSlotTransfer` / `performSlotDiscard` source (Round 2 invariants).
- [ ] **Step 3:** Global gates.
- [ ] **Step 4:** **Manual (owner):** DnD PCA, slot popover, discard, therapist drag if applicable.
- [ ] **Step 5:** Commit: `refactor(schedule): extract dnd bridge wiring (round 3)`.

---

## Phase R3-27 — `SchedulePageToolbar` + `SchedulePageGridInteractionOverlays`

**Objective:** Extract `displayToolsInlineNode` to **`SchedulePageToolbar`**. Optionally extract the block from **`ScheduleOverlays` through pool assign** (and `StaffContextMenu` siblings) to **`SchedulePageGridInteractionOverlays`** if prop interfaces are stable; otherwise **toolbar only**.

**Files:**

- **Create:** `SchedulePageToolbar.tsx` under `features/schedule/ui/sections/` (or `layout/`)
- **Create (optional):** `SchedulePageGridInteractionOverlays.tsx` under `overlays/`
- **Modify:** `SchedulePageClient.tsx`

- [ ] **Step 1:** Measure JSX start (`ScheduleDndContextShell` return) to avoid orphan fragments.
- [ ] **Step 2:** **No** behavior change; preserve `aria-` and `Tooltip` content.
- [ ] **Step 3:** Global gates.
- [ ] **Step 4:** **Manual (owner):** Display / Split / Undo / Redo; overlay slot popover; pool assign.
- [ ] **Step 5:** Commit: `refactor(schedule): extract schedule toolbar and overlays (round 3)`.

---

## Phase R3-28 — Grouped `SchedulePageDialogNodes` / main board props (optional)

**Objective:** Replace long flat prop lists with **typed grouped objects** (`step2Dialogs`, `step3Dialogs`, `calendarAndSnapshot`, …) **without** behavior change. May touch `SchedulePageDialogNodes` signature.

**Files:**

- **Modify:** `SchedulePageDialogNodes.tsx`, `SchedulePageClient.tsx`, types colocated

- [ ] **Step 1:** Grep `SchedulePageDialogNodes` and count props; design 3–6 groups.
- [ ] **Step 2:** Refactor pass with **no** logic edits.
- [ ] **Step 3:** Global gates.
- [ ] **Step 4:** **Manual (owner):** open each dialog class once (Step 1 bulk, copy wizard, Step 2 wizards, Step 3, calendar).
- [ ] **Step 5:** Commit: `refactor(schedule): group dialog node props (round 3)`.

---

## Phase R3-29 — Dev perf + pure `detectNonFloatingSubstitutions` (optional)

**Objective:** Move Profiler / timing-only state behind `useSchedulePageDevPerf` or `NODE_ENV` gates. If `detectNonFloatingSubstitutions` is pure, move to `lib/features/schedule/*.ts` and add unit test when runner exists.

**Files:**

- **Create (optional):** `useSchedulePageDevPerf.ts`, `lib/.../detectNonFloatingSubstitutions.ts`
- **Modify:** `SchedulePageClient.tsx`

- [ ] **Step 1:** Grep `Profiler`, `onPerfRender`, `perfStatsRef`, `runStep2Auto` (for isolation only).
- [ ] **Step 2:** Global gates; ensure production bundle has no new dev-only imports path errors.
- [ ] **Step 3:** **Manual (owner):** one schedule load in dev; optional prod build check.

---

## Code review / completion checklist

- [ ] Each phase has **one** primary reviewer comparing diff to **Round 3 spec §6–7** and Round 1 **§7**.
- [ ] No new `lib/**` → `features/**` imports.
- [ ] Resolver + `flushSync` blocks reviewed atomically.
- [ ] `performSlotTransfer` not duplicated.
- [ ] Re-run `wc -l` on `SchedulePageClient.tsx` and record **~delta** in Progress tracker when Round 3 completes.

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-24 | Initial Round 3 plan: phases R3-20–R3-29, file map, gates, reviewer checklist. |
