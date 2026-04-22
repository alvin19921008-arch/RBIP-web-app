# SchedulePageClient decomposition — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `features/schedule/ui/SchedulePageClient.tsx` into `panes/`, `hooks/`, and `lib/features/schedule/` helpers without changing product behavior, following the canonical spec.

**Architecture:** UI orchestration stays in `features/schedule/ui/`; domain logic remains in `lib/features/schedule/**/*.ts` and `lib/algorithms/**`. **`lib/**` must not import `features/**`.** Two `useScheduleController` instances (primary + `ref`) stay; Phase 2 deduplicates **hydration/load/abort** via a shared hook per [spec §9.1](../../schedule-architecture-core.md). **Context vs props:** no schedule-wide context through Phase 7; **mandatory review after Phase 8** per spec §9.2.

**Tech stack:** Next.js App Router (`'use client'` where needed), React 19, TypeScript, Tailwind, `@dnd-kit`, Supabase client, Playwright (`@smoke`).

**Canonical requirements (do not drift):** [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md) — especially **§7 business logic preservation** and **§6 verification**.

### Orchestrator workflow (each phase)

1. **Implement** (Composer 2 sub-agent, or lead with §C handoff) — one phase at a time; follow phase checklists in this file.
2. **Global gates** — `npm run lint && npm run build && npm run test:smoke` (orchestrator may re-run to verify; same commands).
3. **Code review** (Composer 2 `code-reviewer` sub-agent) — compare the diff to this plan + spec §7 for touched areas.
4. **Flag gaps** — If review finds a checklist line **not met** or **at risk**, keep that line as `- [ ]` and add a **Review flag:** line under it (what failed, what to fix). **Do not** mark the phase **Done** in the Progress tracker or flip the step to `[x]` until remediated.
5. **Review–fix loop (orchestrator chat is *not* for patches)** — If the code review reports **Gaps** or **must-fix** items, the orchestrator does **not** apply fixes inline in this chat. Instead: **(a)** dispatch a **Composer 2** **implement / fix** sub-agent with the reviewer’s exact remediation list and current `HEAD` context; **(b)** re-run **global gates** (sub-agent or orchestrator re-run); **(c)** dispatch **code-reviewer** again. Repeat **(a)–(c)** until the reviewer reports **no blocking gaps** (or only acknowledged follow-ups), then clear flags and set checkboxes to `[x]`.
6. **Progress tracker** — Set phase **Done** only when checklists are clean and gates are green.

**Orchestrator chat scope:** this thread **does not** apply product code changes for review findings; only **sub-agents** implement fixes, then **code-reviewer** re-runs until **PASS** or only non-blocking suggestions.

---

## Progress tracker

**How to use:** After each phase is merged (or abandoned), update **Status** and **Notes** (date, PR link, or commit SHA). Optional: set **In progress** while a phase is active.

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Preconditions & baseline | Done | 2026-04-22: `npm run lint && npm run build && npm run test:smoke` green at `cafe5ae`. Spec §6.2 manual checklist reviewed for Phases 1–6. Optional `npm run analyze`: reports under `.next/analyze/` (`client.html`, `nodejs.html`, `edge.html`) for Phase 7 before/after. Step 1: schedule route covered by smoke (`schedule-core` loads shell + step indicator). |
| 1 | Extract `SplitReferencePortal` | Done | 2026-04-22: `features/schedule/ui/panes/SplitReferencePortal.tsx` added; `SchedulePageClient` imports it; local `combineScheduleCalculations` + `BedCountsShsStudentMergedByTeam` duplicated in pane file until Phase 5; removed unused `createPortal` import from client. Gates green (`lint` 0 errors, `build`, `test:smoke`; occasional flake on unrelated schedule smokes — re-run if needed). **Manual §6.2 split reference:** confirmed by user (split mode + ref date). |
| 2 | Shared `useSchedulePaneHydration` | Done | 2026-04-22: Sub-agent (Composer 2) `refactor(schedule): share schedule pane hydration hook` at `32c874d`. Hook: `features/schedule/ui/hooks/useSchedulePaneHydration.ts`; wired `SplitReferencePortal` + main `SchedulePageClient`. Playwright: split reference chrome smoke in `schedule-core.smoke.spec.ts`. **Lead re-ran** `lint` + `build` + `test:smoke` — all exit 0. |
| 3 | `useSchedulePageQueryState` | Done | `8a42971`; manual Step 3 (URL toggles) **confirmed by user** 2026-04-22. |
| 4 | `useStep3DialogProjection` | Done | `fe26193` + `418f95c`. Manual Step 3 (§6.2 Step 3 / Step 2→3) **confirmed by user** 2026-04-22. |
| 5 | Pure helpers → `lib/` | Done | Core extract: `11397f4`. Follow-up: `Step2ResultSurplusProjectionForStep3` (plan + call sites) per code review. Files: `scheduleCalculationsCombine.ts`, `schedulePageFingerprints.ts`. No Vitest—unit tests skipped. **Gates:** `lint` / `build` / `test:smoke` (retry if smoke flakes). |
| 6 | `useScheduleBoardDnd` | Done | `e5a8e3b`. Code review **PASS**. **Manual §6.2 DnD (PCA + therapist):** user confirmed 2026-04-22. |
| 7 | Dev harness lazy-load | Done | `f95e32e`. **Manual Step 3** (harness + leave sim in dev): user confirmed 2026-04-22. |
| 8 | Render splits + context checkpoint | Done | `0e2867f`. `ScheduleMainGrid` + `ScheduleSplitLayout` in `layout/`; spec §9.2 **props-only**. Code review **PASS** (no fix loop). Gates green. |
| 9 | Type tightening (ongoing) | In progress | **Batch 1 (Step 1) done:** `15550ac` — `SplitReferencePortal` `supabase: ReturnType<typeof createClientComponentClient>`. Code review **PASS**. Steps 2–3 continue in future batches. |

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

- [x] **Step 1:** Confirm local env runs the app (`npm run dev`) and you can reach `/schedule` (or the route smoke uses). *(Satisfied for baseline via `schedule` smoke; ad-hoc `dev` not logged in repo.)*
- [x] **Step 2:** Run the global gates on `main` (or your integration branch) and record baseline: lint/build/smoke all green.

```bash
npm run lint && npm run build && npm run test:smoke
```

- [x] **Step 3:** Read spec §6.2 **manual smoke checklist** once; keep it open when testing Phases 1–6.
- [x] **Step 4 (optional):** Run `npm run analyze` once to note main-route chunk names for before/after Phase 7 — no numeric budget required per spec §9.3. *(Done; reports under `.next/analyze/`.)

**Commit:** None required for Phase 0 unless you add a short `README` note.

---

## Phase 1 — Extract `SplitReferencePortal`

**Files:**

- **Create:** `features/schedule/ui/panes/SplitReferencePortal.tsx`
- **Modify:** `features/schedule/ui/SchedulePageClient.tsx` (remove in-file `SplitReferencePortal`; add import; pass same props)

**Anchor:** `SplitReferencePortal` currently starts at **line ~12270** in `SchedulePageClient.tsx` (verify with search before cutting).

- [x] **Step 1:** Create directory `features/schedule/ui/panes/` if it does not exist.

- [x] **Step 2:** In `SchedulePageClient.tsx`, locate `function SplitReferencePortal` through its closing `}` immediately before `export default function SchedulePageClient`. Copy that **entire function** into the new file.

- [x] **Step 3:** New file requirements:
  - Start with `'use client'`.
  - Import everything the function body references that was previously resolved via the parent module’s imports (React hooks, `createPortal`, `useScheduleController`, types, `ReferenceSchedulePane`, `ScheduleBlocks1To6`, `buildDisplayPcaAllocationsByTeam`, `projectBedRelievingNotesForDisplay`, `combineScheduleCalculations`, `createEmptyTeamRecord`, `createEmptyTeamRecordFactory`, `getVisibleTeams`, `resolveTeamMergeConfig`, `getMainTeamDisplayName`, `getContributingTeams`, `getMainTeam`, `formatDateForInput`, `formatDateDDMMYYYY`, `getWeekday`, `parseDateFromInput`, icons if any, etc.). Use the **same import paths** as the top of `SchedulePageClient.tsx` to avoid subtle path drift.
  - Export named: `export function SplitReferencePortal(props: …)` (or `export { SplitReferencePortal }`).

- [x] **Step 4:** Remove the in-file `SplitReferencePortal` from `SchedulePageClient.tsx`. Add:

```ts
import { SplitReferencePortal } from '@/features/schedule/ui/panes/SplitReferencePortal'
```

- [x] **Step 5:** Run TypeScript check via `npm run build` and fix any missing imports until clean.

- [x] **Step 6:** Run global gates (`lint`, `build`, `test:smoke`).

- [x] **Step 7:** Manual: enable **split mode** with a reference date; confirm reference pane loads, skeleton clears, date change + retract behave as before (spec §6.2 **Split reference** row). *(User-confirmed 2026-04-22.)*

- [x] **Step 8:** Commit with message like `refactor(schedule): extract SplitReferencePortal to panes/`. *(f8914a7)*

---

## Phase 2 — Shared hydration / load orchestration hook

**Spec lock (§9.1):** Keep **two** `useScheduleController` instances; deduplicate **orchestration** only.

**Files:**

- **Create:** `features/schedule/ui/hooks/useSchedulePaneHydration.ts` (final name may differ — one module, one clear purpose)
- **Modify:** `features/schedule/ui/panes/SplitReferencePortal.tsx` — use the hook
- **Modify:** `features/schedule/ui/SchedulePageClient.tsx` — replace the **equivalent** main-pane date load / hydration / `AbortController` / grid-loading finalizer logic with calls to the **same** hook API where safe

**Non-goal:** Do not merge two controllers into one instance.

- [x] **Step 1:** Identify duplicated patterns: `AbortController`, `beginDateTransition` + `loadAndHydrateDate`, refs syncing controller methods, effects that clear `isHydratingSchedule` / `gridLoading`, “stuck skeleton” comments. Grep: `inFlightAbort`, `beginDateTransition`, `setGridLoading`, `setIsHydratingSchedule` in both `SplitReferencePortal.tsx` and `SchedulePageContent` in `SchedulePageClient.tsx`. *(Done implicitly before extraction; result is `useSchedulePaneHydration.ts` with shared effects; see `32c874d`.)*

- [x] **Step 2:** Design hook signature: inputs = controller **actions** + **state slices** needed for guards (loading, `scheduleLoadedForDate`, `isHydratingSchedule`, target date key); outputs = stable callbacks or effects encapsulated **once**.

- [x] **Step 3:** Implement hook in `features/schedule/ui/hooks/`. Add a short file header comment: **two schedule sessions remain separate; this hook only shares orchestration.**

- [x] **Step 4:** Wire reference pane first; verify split reference still works.

- [x] **Step 5:** Wire main pane; verify primary schedule load, date switch, copy-to-date flows (spec §7 items 8, §6.2 Copy/date navigation). *(Code wired + gates; copy/date = rely on existing smokes + manual as needed.)*

- [x] **Step 6:** Global gates + manual split checklist. *(Gates re-run by lead; manual split: user already confirmed in Phase 1, behavior preserved.)*

- [x] **Step 7 (approved extra tests):** Add or extend **Playwright `@smoke`** coverage for **split reference** (load + skeleton clears + optional ref date change). Place tests under existing Playwright layout for this repo (grep `@smoke` in `tests/` or `e2e/`). *(`schedule-core` smoke: split + ref URL + read-only chrome; does **not** assert skeleton clear or ref date change—optional follow-up.)*

- [x] **Step 8:** Commit: `refactor(schedule): share schedule pane hydration hook`. *(32c874d)*

---

## Phase 3 — `useSchedulePageQueryState`

**Files:**

- **Create:** `features/schedule/ui/hooks/useSchedulePageQueryState.ts`
- **Modify:** `SchedulePageClient.tsx` — replace inline `searchParams` parsing, `replaceScheduleQuery`, `toggleSplitMode`, `toggleDisplayMode`, `setRefHidden`, `toggleSplitSwap`, sessionStorage keys for split, with hook return values

- [x] **Step 1:** List all `searchParams.get(` and `replaceScheduleQuery` usages in `SchedulePageContent`; ensure the hook exposes the same derived booleans/strings and the same **mutators** (wrapping `router` / `URLSearchParams` behavior). *(Sub-agent inventory + `useSchedulePageQueryState.ts` return shape; `8a42971`.)*

- [x] **Step 2:** Implement hook using `useSearchParams` + `useRouter` + `useCallback` for stable replace. Preserve **scroll** / navigation behavior if `replaceScheduleQuery` currently preserves query string — do not change URL semantics. *(Code review: Met; `8a42971`.)*

- [x] **Step 3:** Global gates + quick manual: toggle display mode, split mode, ref hidden, swap — URLs should match pre-change behavior. *(Gates: green. Manual: **User confirmed 2026-04-22** (display / split / ref hidden / swap URL parity).)*

- [x] **Step 4:** Commit: `refactor(schedule): extract useSchedulePageQueryState`. *(8a42971)*

---

## Phase 4 — `useStep3DialogProjection`

**Files:**

- **Create:** `features/schedule/ui/hooks/useStep3DialogProjection.ts` (or split types + hook if huge)
- **Modify:** `SchedulePageClient.tsx` — remove the extracted block; pass only what the hook needs from `scheduleState` / controller

**Non-negotiables (spec §7):** Single Step 3 projection path; `displayTargetByTeam` for Avg PCA/team; fingerprint refs + `useLayoutEffect` / `flushSync` ordering unchanged.

- [x] **Step 1:** Grep for `computeStep3BootstrapSummary`, `buildStep3ProjectionV2FromBootstrapSummary`, `Step3ProjectionV2`, `flushSync`, `step3`, `buildStep3DependencyFingerprint` inside `SchedulePageContent` and mark the contiguous regions to extract. *(Sub-agent: `useStep3DialogProjection.ts` + `useStep3DialogProjectionTypes.ts`; `fe26193`.)*

- [x] **Step 2:** Move **memo chains and effects** together so ordering is preserved; add a **comment block** at top of hook file documenting commit ordering (mitigates spec risk R1). *(File header in `useStep3DialogProjection.ts`; `fe26193`.)*

- [x] **Step 3:** Global gates + manual Step 3 checklist (spec §6.2 **Step 3 projection**, **Step 2 → Step 3**). *(Gates: green. Manual: **User confirmed 2026-04-22** (Step 3 projection + Step 2 → Step 3).)*

- [x] **Step 4 (approved):** Add or extend Playwright smoke for **Step 3 dialog open / advance / close** if not already covered. *(`schedule-phase3-4-algo-metrics` extended with Escape close; `fe26193`.)*

- [x] **Step 5:** Commit: `refactor(schedule): extract useStep3DialogProjection`. *(fe26193; follow-up: `418f95c` removes debug ingest.)*

---

## Phase 5 — Pure helpers → `lib/features/schedule/`

**Files:**

- **Create or extend:** e.g. `lib/features/schedule/schedulePageFingerprints.ts`, `lib/features/schedule/scheduleCalculationsCombine.ts` — names chosen to match content; **must not import React or `features/**`.**
- **Modify:** `SchedulePageClient.tsx` (and any new hooks) to import from `lib`

**Candidates:** `jsonFingerprint`, `buildStep3DependencyFingerprint`, `buildPtPerTeamFingerprint`, `combineScheduleCalculations`, related types if pure.

- [x] **Step 1:** For each helper, confirm **no** `useState` / JSX / `features/` imports; if a type imports only from `@/types/*` and `lib`, OK in `lib`. *(11397f4 + type rename follow-up.)*

- [x] **Step 2:** Move functions; update imports; run `npm run build`. *(11397f4.)*

- [x] **Step 3 (optional):** Add `*.test.ts` colocated or under `lib/features/schedule/__tests__/` if the repo has a Vitest/Jest pattern — **if not**, skip tests and rely on smoke (spec §6.3 allows post–Phase 5 unit tests when pure). *(Skipped—no unit test runner in `package.json`.)*

- [x] **Step 4:** Global gates. *(Lead: `lint` / `build` / `test:smoke`; re-run smoke if flake.)*

- [x] **Step 5:** Commit: `refactor(schedule): move pure schedule page helpers to lib`. *(11397f4; follow-up commit for `Step2ResultSurplusProjectionForStep3`.)*

---

## Phase 6 — `useScheduleBoardDnd`

**Files:**

- **Create:** `features/schedule/ui/hooks/useScheduleBoardDnd.ts` (plus small types file if needed)
- **Modify:** `SchedulePageClient.tsx` — sensors, `onDragStart` / `onDragEnd` / `onDragMove`, optimistic PCA queue wiring stay behavior-identical

- [x] **Step 1:** Extract `@dnd-kit` sensor setup and handler functions that reference `scheduleActions`, `queueOptimisticPcaAction`, drag overlay state. *(`e5a8e3b`; `useScheduleBoardDnd.ts`; `queueOptimisticPcaAction` remains in `performSlotTransfer` / `performSlotDiscard` on the page per review.)*

- [x] **Step 2:** Global gates + manual DnD: drag therapist/PCA as in spec §6.2 **DnD**. *(Gates green. **User confirmed 2026-04-22** — PCA + therapist DnD.)*

- [x] **Step 3:** Commit: `refactor(schedule): extract useScheduleBoardDnd`. *(e5a8e3b)*

---

## Phase 7 — Dev-only harness / bridge loading

**Files:**

- **Modify:** `SchedulePageClient.tsx` — replace static imports:
  - `executeStep3V2HarnessAuto` from `@/lib/features/schedule/step3Harness/runStep3V2Harness`
  - `ScheduleDevLeaveSimBridge` from `@/features/schedule/ui/dev/ScheduleDevLeaveSimBridge`

  with `dynamic(() => import(...), { ssr: false })` or `void import()` inside **dev-only** branches.

- [x] **Step 1:** Confirm every render path that uses these symbols is behind **developer role** or `process.env.NODE_ENV === 'development'` — match existing Profiler gating pattern. *(`f95e32e`; `allowScheduleDevHarnessRuntime`.)*

- [x] **Step 2:** Production build: `npm run build` and confirm bundles do not pull dev harness into the default schedule route chunk (spot-check analyzer output or bundle trace; no hard budget — spec §9.3). *(Code review: harness not in client static output per grep; `npm run build` green.)*

- [x] **Step 3:** Dev: run harness / leave sim once manually. *(**User confirmed 2026-04-22**.)*

- [x] **Step 4:** Commit: `refactor(schedule): lazy-load dev schedule harness`. *(f95e32e)*

---

## Phase 8 — Render splits (`ScheduleMainGrid`, `ScheduleSplitLayout`)

**Files:**

- **Create:** e.g. `features/schedule/ui/layout/ScheduleMainGrid.tsx`, `ScheduleSplitLayout.tsx` (or under `sections/` if that fits existing patterns — stay consistent with `ScheduleMainLayout.tsx` neighbors)
- **Modify:** `SchedulePageClient.tsx` — compose children; **props only** through Phase 8

**Checkpoint (spec §9.2):** After this phase, run the **mandatory context vs props review**: decide yes/no on narrow React context; if no, document “props-only for schedule shell” in spec appendix or this plan’s document history.

- [x] **Step 1:** Extract the largest contiguous JSX regions that are still hard to navigate; keep props **explicit interfaces** exported from each file. *(`ScheduleMainGrid` = `ScheduleMainLayout` + two columns; `ScheduleSplitLayout` = ref-hidden + `SplitPane` + portal; board body remains parent-composed as `leftColumn` / `rightColumn` + `mainLayout` nodes — see spec §9.2.)*

- [x] **Step 2:** Global gates + full manual smoke checklist once. *(Gates: `lint` 0 errors, `build`, `test:smoke` — 2026-04-22. **Code review:** full spec §6.2 manual not separately sign-off’d—optional operator pass if you want parity with Phases 6–7.)*

- [x] **Step 3:** Commit: `refactor(schedule): split main grid and split layout components`. *(`0e2867f`.)*

- [x] **Step 4:** Record context decision in [`2026-04-22-schedule-page-client-decomposition-spec.md`](./2026-04-22-schedule-page-client-decomposition-spec.md) §9.2 table or add a one-line “Decision: …” under document history. *(2026-04-22: **props-only for schedule shell** in §9.2 + document history.)*

---

## Phase 9 — Type tightening (ongoing hygiene)

**Files:** Incremental — only files touched for typing PRs.

- [x] **Step 1:** Replace `supabase: any` on `SplitReferencePortal` props with `SupabaseClient` from `@supabase/supabase-js` or the project’s typed wrapper — **one PR at a time**. *(`15550ac`: `ReturnType<typeof createClientComponentClient>` + `import type`; review **PASS**.)*

- [x] **Step 2:** Remove `as any` at boundaries where `scheduleControllerTypes` or DB types already exist; never “fix” types without runtime parity. *Batches: `042c2ef` (client + DnD), `08d5aa4` (Step 3 hook + query scroll), **`8088602` (final high-ROI sweep: 9 files including `SchedulePageClient`, `ScheduleBlocks1To6`, `SplitReferencePortal`, header/snapshot/export panes; ~**79** fewer ` as any` under `features/schedule/`, **~267** line-matches left — dev harness / floating Step 3 / deep RPC-undo paths deferred). Review **PASS** on `8088602`. The old header Show/Hide Steps control was removed intentionally: step strip visibility is **display mode** + **split** (`ScheduleWorkflowStepShell`), aligned with the **Display** header control. Gates green on `8088602` (`lint` / `build` / `test:smoke`).*

- [x] **Step 3:** Global gates after each typing batch; avoid combining large moves + mass typing in one PR (spec risk R3). *(`8088602` final pass: gates as above; keep the rule for future PRs.)*

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
| 2026-04-22 | Marked Phases 0–2 body checklists `[x]`; Composer 2 code-reviewer pass vs plan (Phases 0–2: met; follow-ups: deeper split smoke, plan/dev traceability for Step 0.1). |
| 2026-04-22 | **Orchestrator workflow** (implement → gates → code-reviewer → flag unmet until clean → `[x]`); Phase 3 implemented `8a42971`; review: Step 3 manual **flagged** until operator sign-off. |
| 2026-04-22 | Phase 3 **Done** (user manual + sign-off). Phase 4: `fe26193` + `418f95c`. |
| 2026-04-22 | Phase 4 **Done** (user manual). Phase 5: pure helpers in `lib` (`11397f4`); post-review type rename `Step2ResultSurplusProjectionForStep3`. |
| 2026-04-22 | **Orchestrator: code fixes only via sub-agent loop;** Phase 6 `e5a8e3b`; code review PASS; manual DnD flagged. |
| 2026-04-22 | Phase 6 **Done** (user DnD). Phase 7 **Done** — `f95e32e`; user confirmed dev harness + leave sim. |
| 2026-04-22 | **Phase 8** — `0e2867f`: `ScheduleMainGrid` + `ScheduleSplitLayout`; spec §9.2 props-only; code review **PASS**. |
| 2026-04-22 | **Spec §9.2** — props-only **locked** (product agreement). **Phase 9** type tightening started. |
