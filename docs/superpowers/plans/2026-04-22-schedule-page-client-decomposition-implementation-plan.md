# SchedulePageClient decomposition — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `features/schedule/ui/SchedulePageClient.tsx` into `panes/`, `hooks/`, and `lib/features/schedule/` helpers without changing product behavior, following the canonical spec.

**Architecture:** UI orchestration stays in `features/schedule/ui/`; domain logic remains in `lib/features/schedule/**/*.ts` and `lib/algorithms/**`. **`lib/**` must not import `features/**`.** Two `useScheduleController` instances (primary + `ref`) stay; Phase 2 deduplicates **hydration/load/abort** via a shared hook per [spec §9.1](../../schedule-architecture-core.md). **Context vs props:** no schedule-wide context through Phase 7; **mandatory review after Phase 8** per spec §9.2.

**Tech stack:** Next.js App Router (`'use client'` where needed), React 19, TypeScript, Tailwind, `@dnd-kit`, Supabase client, Playwright (`@smoke`).

**Canonical requirements (do not drift):** [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md) — especially **§7 business logic preservation** and **§6 verification**.

---

## Progress tracker

**How to use:** After each phase is merged (or abandoned), update **Status** and **Notes** (date, PR link, or commit SHA). Optional: set **In progress** while a phase is active.

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Preconditions & baseline | Done | 2026-04-22: `npm run lint && npm run build && npm run test:smoke` green at `cafe5ae`. Spec §6.2 manual checklist reviewed for Phases 1–6. Optional `npm run analyze`: reports under `.next/analyze/` (`client.html`, `nodejs.html`, `edge.html`) for Phase 7 before/after. Step 1: schedule route covered by smoke (`schedule-core` loads shell + step indicator). |
| 1 | Extract `SplitReferencePortal` | Not started | |
| 2 | Shared `useSchedulePaneHydration` | Not started | |
| 3 | `useSchedulePageQueryState` | Not started | |
| 4 | `useStep3DialogProjection` | Not started | |
| 5 | Pure helpers → `lib/` | Not started | |
| 6 | `useScheduleBoardDnd` | Not started | |
| 7 | Dev harness lazy-load | Not started | |
| 8 | Render splits + context checkpoint | Not started | |
| 9 | Type tightening (ongoing) | Not started | |

**Status values:** `Not started` · `In progress` · `Done`

**Handoff prompt (Composer 2 + subagents):** [`2026-04-22-schedule-page-client-decomposition-handoff-prompt.md`](./2026-04-22-schedule-page-client-decomposition-handoff-prompt.md)

---

## Why this document exists

| Document | Role |
|----------|------|
| **Decomposition spec** | What, why, phases, risks, team decisions, non-negotiables |
| **This implementation plan** | How: file map, ordered tasks, commands, merge checkpoints |

---

## File map (target end state — incremental)

| Path | Role |
|------|------|
| `features/schedule/ui/SchedulePageClient.tsx` | Thin orchestrator: primary controller, composition, Suspense default export |
| `features/schedule/ui/panes/SplitReferencePortal.tsx` | Split reference portal + ref controller wiring (Phase 1+) |
| `features/schedule/ui/hooks/useSchedulePaneHydration.ts` | Shared load/abort/hydration for main + ref (Phase 2; name may vary) |
| `features/schedule/ui/hooks/useSchedulePageQueryState.ts` | URL/searchParams + replace helpers (Phase 3) |
| `features/schedule/ui/hooks/useStep3DialogProjection.ts` | Step 3 dialog / fingerprint / bootstrap orchestration (Phase 4) |
| `features/schedule/ui/hooks/useScheduleBoardDnd.ts` | DnD sensors + handlers + optimistic PCA glue (Phase 6) |
| `lib/features/schedule/*` | Pure helpers moved from client (Phase 5) — **no `.tsx`, no React** |
| `features/schedule/ui/sections/*`, `steps/*` | Existing; use when a slice clearly belongs to macro chrome vs wizard |

---

## Global gates (after every phase that changes production code)

Run from repo root:

```bash
npm run lint
npm run build
npm run test:smoke
```

**Expected:** All exit 0. Refactor gate order matches [`.cursor/skills/playwright-smoke/SKILL.md`](../../../.cursor/skills/playwright-smoke/SKILL.md).

**Do not merge** a phase if any gate fails unless the failure is clearly environmental and documented.

---

## Phase 0 — Preconditions and safety baseline

**Files:** None required; optional note in team docs.

- [ ] **Step 1:** Confirm local env runs the app (`npm run dev`) and you can reach `/schedule` (or the route smoke uses).
- [ ] **Step 2:** Run the global gates on `main` (or your integration branch) and record baseline: lint/build/smoke all green.

```bash
npm run lint && npm run build && npm run test:smoke
```

- [ ] **Step 3:** Read spec §6.2 **manual smoke checklist** once; keep it open when testing Phases 1–6.
- [ ] **Step 4 (optional):** Run `npm run analyze` once to note main-route chunk names for before/after Phase 7 — no numeric budget required per spec §9.3.

**Commit:** None required for Phase 0 unless you add a short `README` note.

---

## Phase 1 — Extract `SplitReferencePortal`

**Files:**

- **Create:** `features/schedule/ui/panes/SplitReferencePortal.tsx`
- **Modify:** `features/schedule/ui/SchedulePageClient.tsx` (remove in-file `SplitReferencePortal`; add import; pass same props)

**Anchor:** `SplitReferencePortal` currently starts at **line ~12270** in `SchedulePageClient.tsx` (verify with search before cutting).

- [ ] **Step 1:** Create directory `features/schedule/ui/panes/` if it does not exist.

- [ ] **Step 2:** In `SchedulePageClient.tsx`, locate `function SplitReferencePortal` through its closing `}` immediately before `export default function SchedulePageClient`. Copy that **entire function** into the new file.

- [ ] **Step 3:** New file requirements:
  - Start with `'use client'`.
  - Import everything the function body references that was previously resolved via the parent module’s imports (React hooks, `createPortal`, `useScheduleController`, types, `ReferenceSchedulePane`, `ScheduleBlocks1To6`, `buildDisplayPcaAllocationsByTeam`, `projectBedRelievingNotesForDisplay`, `combineScheduleCalculations`, `createEmptyTeamRecord`, `createEmptyTeamRecordFactory`, `getVisibleTeams`, `resolveTeamMergeConfig`, `getMainTeamDisplayName`, `getContributingTeams`, `getMainTeam`, `formatDateForInput`, `formatDateDDMMYYYY`, `getWeekday`, `parseDateFromInput`, icons if any, etc.). Use the **same import paths** as the top of `SchedulePageClient.tsx` to avoid subtle path drift.
  - Export named: `export function SplitReferencePortal(props: …)` (or `export { SplitReferencePortal }`).

- [ ] **Step 4:** Remove the in-file `SplitReferencePortal` from `SchedulePageClient.tsx`. Add:

```ts
import { SplitReferencePortal } from '@/features/schedule/ui/panes/SplitReferencePortal'
```

- [ ] **Step 5:** Run TypeScript check via `npm run build` and fix any missing imports until clean.

- [ ] **Step 6:** Run global gates (`lint`, `build`, `test:smoke`).

- [ ] **Step 7:** Manual: enable **split mode** with a reference date; confirm reference pane loads, skeleton clears, date change + retract behave as before (spec §6.2 **Split reference** row).

- [ ] **Step 8:** Commit with message like `refactor(schedule): extract SplitReferencePortal to panes/`.

---

## Phase 2 — Shared hydration / load orchestration hook

**Spec lock (§9.1):** Keep **two** `useScheduleController` instances; deduplicate **orchestration** only.

**Files:**

- **Create:** `features/schedule/ui/hooks/useSchedulePaneHydration.ts` (final name may differ — one module, one clear purpose)
- **Modify:** `features/schedule/ui/panes/SplitReferencePortal.tsx` — use the hook
- **Modify:** `features/schedule/ui/SchedulePageClient.tsx` — replace the **equivalent** main-pane date load / hydration / `AbortController` / grid-loading finalizer logic with calls to the **same** hook API where safe

**Non-goal:** Do not merge two controllers into one instance.

- [ ] **Step 1:** Identify duplicated patterns: `AbortController`, `beginDateTransition` + `loadAndHydrateDate`, refs syncing controller methods, effects that clear `isHydratingSchedule` / `gridLoading`, “stuck skeleton” comments. Grep: `inFlightAbort`, `beginDateTransition`, `setGridLoading`, `setIsHydratingSchedule` in both `SplitReferencePortal.tsx` and `SchedulePageContent` in `SchedulePageClient.tsx`.

- [ ] **Step 2:** Design hook signature: inputs = controller **actions** + **state slices** needed for guards (loading, `scheduleLoadedForDate`, `isHydratingSchedule`, target date key); outputs = stable callbacks or effects encapsulated **once**.

- [ ] **Step 3:** Implement hook in `features/schedule/ui/hooks/`. Add a short file header comment: **two schedule sessions remain separate; this hook only shares orchestration.**

- [ ] **Step 4:** Wire reference pane first; verify split reference still works.

- [ ] **Step 5:** Wire main pane; verify primary schedule load, date switch, copy-to-date flows (spec §7 items 8, §6.2 Copy/date navigation).

- [ ] **Step 6:** Global gates + manual split checklist.

- [ ] **Step 7 (approved extra tests):** Add or extend **Playwright `@smoke`** coverage for **split reference** (load + skeleton clears + optional ref date change). Place tests under existing Playwright layout for this repo (grep `@smoke` in `tests/` or `e2e/`).

- [ ] **Step 8:** Commit: `refactor(schedule): share schedule pane hydration hook`.

---

## Phase 3 — `useSchedulePageQueryState`

**Files:**

- **Create:** `features/schedule/ui/hooks/useSchedulePageQueryState.ts`
- **Modify:** `SchedulePageClient.tsx` — replace inline `searchParams` parsing, `replaceScheduleQuery`, `toggleSplitMode`, `toggleDisplayMode`, `setRefHidden`, `toggleSplitSwap`, sessionStorage keys for split, with hook return values

- [ ] **Step 1:** List all `searchParams.get(` and `replaceScheduleQuery` usages in `SchedulePageContent`; ensure the hook exposes the same derived booleans/strings and the same **mutators** (wrapping `router` / `URLSearchParams` behavior).

- [ ] **Step 2:** Implement hook using `useSearchParams` + `useRouter` + `useCallback` for stable replace. Preserve **scroll** / navigation behavior if `replaceScheduleQuery` currently preserves query string — do not change URL semantics.

- [ ] **Step 3:** Global gates + quick manual: toggle display mode, split mode, ref hidden, swap — URLs should match pre-change behavior.

- [ ] **Step 4:** Commit: `refactor(schedule): extract useSchedulePageQueryState`.

---

## Phase 4 — `useStep3DialogProjection`

**Files:**

- **Create:** `features/schedule/ui/hooks/useStep3DialogProjection.ts` (or split types + hook if huge)
- **Modify:** `SchedulePageClient.tsx` — remove the extracted block; pass only what the hook needs from `scheduleState` / controller

**Non-negotiables (spec §7):** Single Step 3 projection path; `displayTargetByTeam` for Avg PCA/team; fingerprint refs + `useLayoutEffect` / `flushSync` ordering unchanged.

- [ ] **Step 1:** Grep for `computeStep3BootstrapSummary`, `buildStep3ProjectionV2FromBootstrapSummary`, `Step3ProjectionV2`, `flushSync`, `step3`, `buildStep3DependencyFingerprint` inside `SchedulePageContent` and mark the contiguous regions to extract.

- [ ] **Step 2:** Move **memo chains and effects** together so ordering is preserved; add a **comment block** at top of hook file documenting commit ordering (mitigates spec risk R1).

- [ ] **Step 3:** Global gates + manual Step 3 checklist (spec §6.2 **Step 3 projection**, **Step 2 → Step 3**).

- [ ] **Step 4 (approved):** Add or extend Playwright smoke for **Step 3 dialog open / advance / close** if not already covered.

- [ ] **Step 5:** Commit: `refactor(schedule): extract useStep3DialogProjection`.

---

## Phase 5 — Pure helpers → `lib/features/schedule/`

**Files:**

- **Create or extend:** e.g. `lib/features/schedule/schedulePageFingerprints.ts`, `lib/features/schedule/scheduleCalculationsCombine.ts` — names chosen to match content; **must not import React or `features/**`.**
- **Modify:** `SchedulePageClient.tsx` (and any new hooks) to import from `lib`

**Candidates:** `jsonFingerprint`, `buildStep3DependencyFingerprint`, `buildPtPerTeamFingerprint`, `combineScheduleCalculations`, related types if pure.

- [ ] **Step 1:** For each helper, confirm **no** `useState` / JSX / `features/` imports; if a type imports only from `@/types/*` and `lib`, OK in `lib`.

- [ ] **Step 2:** Move functions; update imports; run `npm run build`.

- [ ] **Step 3 (optional):** Add `*.test.ts` colocated or under `lib/features/schedule/__tests__/` if the repo has a Vitest/Jest pattern — **if not**, skip tests and rely on smoke (spec §6.3 allows post–Phase 5 unit tests when pure).

- [ ] **Step 4:** Global gates.

- [ ] **Step 5:** Commit: `refactor(schedule): move pure schedule page helpers to lib`.

---

## Phase 6 — `useScheduleBoardDnd`

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleBoardDnd.ts` (plus small types file if needed)
- **Modify:** `SchedulePageClient.tsx` — sensors, `onDragStart` / `onDragEnd` / `onDragMove`, optimistic PCA queue wiring stay behavior-identical

- [ ] **Step 1:** Extract `@dnd-kit` sensor setup and handler functions that reference `scheduleActions`, `queueOptimisticPcaAction`, drag overlay state.

- [ ] **Step 2:** Global gates + manual DnD: drag therapist/PCA as in spec §6.2 **DnD**.

- [ ] **Step 3:** Commit: `refactor(schedule): extract useScheduleBoardDnd`.

---

## Phase 7 — Dev-only harness / bridge loading

**Files:**

- **Modify:** `SchedulePageClient.tsx` — replace static imports:
  - `executeStep3V2HarnessAuto` from `@/lib/features/schedule/step3Harness/runStep3V2Harness`
  - `ScheduleDevLeaveSimBridge` from `@/features/schedule/ui/dev/ScheduleDevLeaveSimBridge`

  with `dynamic(() => import(...), { ssr: false })` or `void import()` inside **dev-only** branches.

- [ ] **Step 1:** Confirm every render path that uses these symbols is behind **developer role** or `process.env.NODE_ENV === 'development'` — match existing Profiler gating pattern.

- [ ] **Step 2:** Production build: `npm run build` and confirm bundles do not pull dev harness into the default schedule route chunk (spot-check analyzer output or bundle trace; no hard budget — spec §9.3).

- [ ] **Step 3:** Dev: run harness / leave sim once manually.

- [ ] **Step 4:** Commit: `refactor(schedule): lazy-load dev schedule harness`.

---

## Phase 8 — Render splits (`ScheduleMainGrid`, `ScheduleSplitLayout`)

**Files:**

- **Create:** e.g. `features/schedule/ui/layout/ScheduleMainGrid.tsx`, `ScheduleSplitLayout.tsx` (or under `sections/` if that fits existing patterns — stay consistent with `ScheduleMainLayout.tsx` neighbors)
- **Modify:** `SchedulePageClient.tsx` — compose children; **props only** through Phase 8

**Checkpoint (spec §9.2):** After this phase, run the **mandatory context vs props review**: decide yes/no on narrow React context; if no, document “props-only for schedule shell” in spec appendix or this plan’s document history.

- [ ] **Step 1:** Extract the largest contiguous JSX regions that are still hard to navigate; keep props **explicit interfaces** exported from each file.

- [ ] **Step 2:** Global gates + full manual smoke checklist once.

- [ ] **Step 3:** Commit: `refactor(schedule): split main grid and split layout components`.

- [ ] **Step 4:** Record context decision in [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md) §9.2 table or add a one-line “Decision: …” under document history.

---

## Phase 9 — Type tightening (ongoing hygiene)

**Files:** Incremental — only files touched for typing PRs.

- [ ] **Step 1:** Replace `supabase: any` on `SplitReferencePortal` props with `SupabaseClient` from `@supabase/supabase-js` or the project’s typed wrapper — **one PR at a time**.

- [ ] **Step 2:** Remove `as any` at boundaries where `scheduleControllerTypes` or DB types already exist; never “fix” types without runtime parity.

- [ ] **Step 3:** Global gates after each typing batch; avoid combining large moves + mass typing in one PR (spec risk R3).

---

## Spec coverage self-review (writing-plans checklist)

| Spec section | Plan location |
|--------------|----------------|
| §1 Goals / non-goals | Architecture paragraph + phases |
| §3 Target folders | File map |
| §4 Phases 0–9 | Phases 0–9 above |
| §5 Risks R1–R6 | Addressed in Phase 2, 4, 7, 8, 9 notes |
| §6 Verification | Global gates + Phase 0/4/7 notes |
| §7 Non-negotiables | Called out in Phases 2, 4, 6 |
| §9.1 Locked two controllers | Phase 2 |
| §9.2 Context after Phase 8 | Phase 8 checkpoint |
| §9.3 Playwright / bundle / typing | Phases 2, 4, 7, 9 |

**Gaps:** None intentional; execution may discover new helpers to move in Phase 5 — add tasks in the same phase, do not scope-creep into algorithm changes.

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-22 | Initial implementation plan from decomposition spec. |
| 2026-04-22 | Added Progress tracker table + handoff prompt link. |
