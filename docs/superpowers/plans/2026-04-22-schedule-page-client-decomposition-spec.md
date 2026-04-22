# SchedulePageClient decomposition — implementation specification

**Status:** Draft  
**Last updated:** 2026-04-22  
**Scope:** Major refactor of `features/schedule/ui/SchedulePageClient.tsx` (~12,600 lines) in a Next.js App Router + TypeScript codebase.

**Authoritative references (must stay aligned):**

| Document | Role |
|----------|------|
| [`docs/schedule-architecture-core.md`](../../schedule-architecture-core.md) | UI vs `lib` tree; `features/schedule/ui/sections/` vs `steps/`; `lib/features/schedule/` for domain **`.ts` only**; **`lib/**` must NOT import `features/**`**. |
| [`.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`](../../../.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc) | Step 3 projection invariants, `staffOverrides` SSOT, pending FTE wrappers, Step 2/3 invalidation, beds, rounding, etc. |

This is a **major refactor** requiring **careful sequencing**, small vertical slices, and **verification after each phase**. The goal is to reduce coupling and cognitive load **without** changing product behavior or violating domain invariants.

**Companion (how to execute):** [`2026-04-22-schedule-page-client-decomposition-implementation-plan.md`](./2026-04-22-schedule-page-client-decomposition-implementation-plan.md) — task-level file paths, gates, and commits.

---

## 1. Goals and non-goals

### 1.1 Goals

- **Decompose** `SchedulePageClient.tsx` into focused modules: **`panes/`**, **`hooks/`**, thin orchestration in the page client, and **pure helpers** in `lib/features/schedule/` where appropriate.
- **Eliminate divergence risk** between the main grid and **Split reference** by consolidating duplicated `useScheduleController` orchestration (load / abort / hydration) or documenting a single shared abstraction.
- **Preserve** all documented **business invariants** (Step 3 projection, `staffOverrides`, fingerprints, DnD, copy/date navigation, split reference lifecycle) — see §7 and §8.
- **Improve maintainability:** fewer `useEffect` / memo chains in one file; narrower props; clearer ownership boundaries.
- **Strengthen verification:** Playwright smoke after each phase; manual checklist for critical flows; targeted unit tests for extracted pure logic.
- **Address type-safety erosion** incrementally (`as any`, `supabase: any`) without destabilizing the schedule path.

### 1.2 Non-goals

- **No** re-implementation of allocation rules, Step 3 math, or controller semantics in UI — logic stays in **`lib/algorithms`** and **`lib/features/schedule`** per architecture.
- **No** new schedule screen **`.tsx`** under `lib/features/schedule/` (domain remains **`.ts` only**).
- **No** `lib/**` imports from `features/**` (see `lib-import-layering.mdc`).
- **No** big-bang rewrite: prefer **incremental PRs** with green CI and smoke tests.
- **Optional:** feature flags — only if a phase cannot ship safely without toggles; default is **incremental merge + revert by PR**.

---

## 2. Current state summary

`SchedulePageClient` **matches its documented shell role**: it delegates domain work to **`useScheduleController`** and **`lib/features/schedule`**, and **import layering is sound** (UI → lib; no lib→features violation from this file). **Code-splitting** is in good shape for dialogs, reference surfaces, and calendar via `next/dynamic`; the **primary grid path remains statically imported**, which drives **main bundle cost**. The main strain is **scale and coupling** in a single module: **50+ `useEffect`**, **~100 `useMemo` / `useCallback`**, **~100 `as any`**, large **`useMemo` chains**, **`flushSync` / commit ordering**, and a **second `useScheduleController`** in **`SplitReferencePortal`** that **duplicates orchestration** (load, abort, hydration) and creates **divergence risk** vs the main grid. The **default export** is appropriately thin (e.g. Suspense → inner content). **No dedicated unit tests** cover this file; regression protection relies on discipline and smoke paths. **Dev harness** code (`ScheduleDevLeaveSimBridge`, `executeStep3V2HarnessAuto`) lives in the same module and must remain **dev-only** for bundle and review burden.

---

## 3. Target architecture

Aligned with [`docs/schedule-architecture-core.md`](../../schedule-architecture-core.md) and [`ARCHITECTURE_ESSENTIALS.mdc`](../../../.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc).

### 3.1 Folder additions / usage

| Area | Path | Responsibility |
|------|------|----------------|
| **Panes** | `features/schedule/ui/panes/` | Split reference portal, split layout chrome, and other **pane-level** UI extracted from the monolith (e.g. `SplitReferencePortal.tsx` + colocated ref/effect wiring that belongs with the pane). |
| **Hooks** | `features/schedule/ui/hooks/` | Composed React hooks: URL/query state (`useSchedulePageQueryState`), Step 3 dialog / fingerprint / bootstrap (`useStep3DialogProjection`), DnD (`useScheduleBoardDnd`), and other **UI orchestration** that is not domain `.ts`. |
| **Sections / steps** | Existing `sections/`, `steps/` | Unchanged rules: **sections** = macro workflow chrome only; **steps** = in-step wizard UI — do not move Step 2 grid body or 3.1–3.4 panels into `sections/` incorrectly. |
| **Domain** | `lib/features/schedule/` | **Pure helpers**, types, and non-React utilities moved out of the client **only** if they have **no React imports**; keep **`*.tsx` out of lib**. |

### 3.2 What stays in `SchedulePageClient.tsx`

After decomposition, the file should remain a **thin orchestrator**:

- Wiring **`useScheduleController`** (single primary instance at page level unless a deliberate shared hook owns both consumers).
- Composition of **sections**, **panes**, **dialogs**, and **dynamic** imports.
- **Minimal** glue state that truly is page-specific; prefer pushing logic into named hooks.
- **Suspense** boundary and default export pattern **preserved** (already a positive).

**Context API** for deep trees is **optional** and only justified if prop drilling becomes unmanageable; prefer **narrow props** and **colocated hooks** first.

---

## 4. Phased plan (0–n)

Each phase should be **mergeable on its own**, with **exit criteria** and **verification** (§6–7).

### Phase 0 — Preconditions and safety baseline

| Item | Detail |
|------|--------|
| **Objectives** | Establish baseline behavior; ensure smoke commands documented; optionally capture bundle/main-route notes for before/after. |
| **Files** | No production behavior change; may add checklist entries to team runbook only if needed. |
| **Exit criteria** | Team agrees on **Playwright smoke** commands (see §6); critical **manual smoke** list acknowledged; branch green. |

### Phase 1 — Extract `SplitReferencePortal` (P0)

| Item | Detail |
|------|--------|
| **Objectives** | Move **`SplitReferencePortal`** (+ ref effects that belong with the pane) to **`features/schedule/ui/panes/SplitReferencePortal.tsx`**. Reduce monolith size; clarify ownership of split-pane lifecycle. |
| **Risks** | Ref ordering, **AbortController**, hydration, **stuck-skeleton finalizers** — must behave identically (see §6.2 and §7). |
| **Exit criteria** | Visual and behavioral parity for split reference; no new duplicate controller patterns **introduced**; if a second `useScheduleController` remains, it is **explicitly documented** and targeted for Phase 2 consolidation. |

### Phase 2 — Consolidate split reference orchestration (P0 / critical)

| Item | Detail |
|------|--------|
| **Objectives** | Remove **divergence risk** from the **second `useScheduleController`** in split reference: either **one shared hook** (e.g. `useSplitReferenceScheduleSession`) that both main and portal use, or **lifted state** with a single controller — decision in §9. **Do not** silently diverge load/abort/hydration paths. |
| **Files** | New hook under `features/schedule/ui/hooks/` or pane-local module **in features only**; **no** forbidden lib→features imports. |
| **Exit criteria** | Reference bugs **cannot** diverge from main grid due to copy-pasted orchestration; **AbortController**, hydration, and skeleton finalizers still correct. |

### Phase 3 — URL / query state hook (P0)

| Item | Detail |
|------|--------|
| **Objectives** | Extract URL/query helpers to **`useSchedulePageQueryState`** in `features/schedule/ui/hooks/`. |
| **Exit criteria** | All date/copy/navigation effects that depend on query state **unchanged** in behavior; easier unit testing of pure URL builders if lifted to `lib` later. |

### Phase 4 — Step 3 dialog / fingerprint / bootstrap hook (P1)

| Item | Detail |
|------|--------|
| **Objectives** | Extract **Step 3 dialog, fingerprint, bootstrap** orchestration to **`useStep3DialogProjection`** (or similarly named) in `features/schedule/ui/hooks/`. |
| **Non-negotiables** | **Single Step 3 projection path**; **`displayTargetByTeam`** for **Avg PCA/team**; **fingerprint refs** + **`useLayoutEffect` / `flushSync` ordering** preserved; no second competing `computeStep3BootstrapSummary` for the same display numbers (per ARCHITECTURE_ESSENTIALS). |
| **Exit criteria** | Step 2 downstream **invalidation fingerprints** / **rerun UX** unchanged; no double computation or stale refs from extraction. |

### Phase 5 — Pure helpers → `lib/features/schedule/` (P1)

| Item | Detail |
|------|--------|
| **Objectives** | Move **pure** helpers (no React, no `features/` imports) to **`lib/features/schedule/`** appropriate modules. |
| **Exit criteria** | `lib/**` does not import `features/**`; call sites updated; optional small unit tests for pure functions. |

### Phase 6 — DnD extraction (P1)

| Item | Detail |
|------|--------|
| **Objectives** | Extract drag-and-drop to **`useScheduleBoardDnd`** (or split file + hook) with **optimistic sync with controller** unchanged. |
| **Exit criteria** | DnD flows match pre-extraction; controller remains source of truth after optimistic updates. |

### Phase 7 — Dev-only bridge / harness (P2)

| Item | Detail |
|------|--------|
| **Objectives** | **`dynamic` import** dev-only pieces (**`ScheduleDevLeaveSimBridge`**, **`executeStep3V2HarnessAuto`**) so production bundle excludes them; verify **dev-only gating** (existing Profiler dev-gating pattern is OK). |
| **Exit criteria** | Production build excludes dev harness from main chunk(s); dev workflows still work. |

### Phase 8 — Render splits (P2)

| Item | Detail |
|------|--------|
| **Objectives** | Extract **`ScheduleMainGrid`**, **`ScheduleSplitLayout`** (names indicative) with **narrow props**; introduce context **only if justified**. |
| **Exit criteria** | No behavior change; props are typed and stable; merge conflict surface reduced. |

### Phase 9 — Type tightening (P3)

| Item | Detail |
|------|--------|
| **Objectives** | Incrementally replace **`as any`** and **`supabase: any`** with **narrow types**; avoid masking bugs during refactors. |
| **Exit criteria** | Stricter types in touched modules; no unexplained new `any`; critical paths still smoke-clean. |

**Prioritized refactor candidates from review (mapped):** P0 → Phases 1–3; P1 → Phases 4–6; P2 → Phases 7–8; P3 → Phase 9.

---

## 5. Risk register and mitigations

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| R1 | **Step 3** large `useMemo` chains, **`flushSync`**, commit ordering broken by move | Wrong Avg PCA/team, double work, stale UI | Extract in **Phase 4** only with **parity tests** + **manual Step 3 checklist**; keep **one projection builder** reference; document ordering in hook file header. |
| R2 | **SplitReferencePortal** second controller diverges from main | Reference grid bugs not seen in main | **Phase 2** consolidation; shared hook or single controller ownership. |
| R3 | **Type-safety** changes hide real bugs | Silent logic errors | Phase 9 incremental; pair with smoke; avoid “cleanup” typings in same PR as large moves. |
| R4 | **Merge conflicts** on hotspot file | Lost changes, subtle regressions | Small PRs; **Phase 8** reduces future conflict surface; communicate ownership. |
| R5 | **Dev harness** leaks to prod bundle | Bundle size / attack surface | Phase 7 dynamic split + build-time verification. |
| R6 | **Hook cardinality** explosion | Harder to trace | Name hooks by **workflow**; keep `SchedulePageClient` as readable composition layer. |

---

## 6. Verification strategy

### 6.1 Playwright smoke (after each phase)

Run the project’s **Playwright smoke** suite as defined in [`.cursor/rules/playwright-smoke.mdc`](../../../.cursor/rules/playwright-smoke.mdc) and the repo’s **`package.json`** scripts. Minimum expectations:

- **Schedule load** and navigation to the schedule route used in smoke tests.
- **Allocation workflow** paths covered by existing smoke (schedule / allocation — align with project skill **`.cursor/skills/playwright-smoke/SKILL.md`** when in doubt).
- After **Phase 2 / 4 / 6**: add or extend smoke if a **new regression class** was identified (split reference parity, Step 3 dialog, DnD).

**Rule:** Do not claim a phase complete without **green smoke** on the branch.

### 6.2 Manual smoke checklist (critical flows)

Use after each phase that touches the relevant subsystem:

| Area | Checklist |
|------|-----------|
| **Step 3 projection** | Single path; **Avg PCA/team** from **`displayTargetByTeam`** only; 3.1–3.4 progression coherent with glossary. |
| **`staffOverrides`** | Edits flow through SSOT; algorithms see consistent state. |
| **Step 2 → Step 3** | **Invalidation fingerprints** and **rerun UX** when targets change after Step 3/4 completion. |
| **Fingerprints / layout** | Ref + **`useLayoutEffect`** / **`flushSync`** ordering — no flicker or wrong commit. |
| **Pending FTE** | Only **`assignOneSlotAndUpdatePending`** / **`assignUpToPendingAndUpdatePending`**; no manual `pendingFTE` patches. |
| **Split reference** | **AbortController** on teardown/navigation; hydration; **stuck-skeleton finalizers**; parity with main grid expectations. |
| **DnD** | Optimistic UI syncs with controller; rollback on failure matches prior behavior. |
| **Copy / date navigation** | Effects for copy/date **unchanged** (no extra fetches, no stuck loading). |

### 6.3 Unit tests — when to add

| When | What |
|------|------|
| After **Phase 5** | Unit tests for **pure** functions moved to `lib/features/schedule/`. |
| After **Phase 3** | If URL/query parsing is pure-extracted, test **pure** parsers/builders in `lib` (no React). |
| Hooks (**Phases 2, 4, 6**) | Prefer integration coverage via Playwright until hooks stabilize; add **RTL** tests only if a hook exposes testable pure logic or a stable seam. |

---

## 7. Business logic preservation (non-negotiables)

The following must be treated as **contractual** during every phase:

1. **Step 3 projection — single path**; **`displayTargetByTeam`** for **Avg PCA/team** (not ad-hoc mixing of `calculations` vs `step2Result` for that label).  
2. **`staffOverrides`** = **SSOT** for staff-side edits; algorithms consume it.  
3. **Step 2 downstream invalidation** — **fingerprints** and **rerun UX** when Step 2 changes invalidate Step 3/4.  
4. **Fingerprint refs** + **`useLayoutEffect` / `flushSync`** ordering — no careless reordering.  
5. **Pending FTE** — only via **`assignOneSlotAndUpdatePending`** / **`assignUpToPendingAndUpdatePending`**.  
6. **Split reference** — **AbortController**, **hydration**, **stuck-skeleton finalizers**.  
7. **DnD** — optimistic sync with **controller** as today.  
8. **Copy / date navigation** effects — preserved.  
9. **Do not re-encode allocation rules in UI** — **`lib/algorithms`** + **`lib/features/schedule`** only.

---

## 8. Rollback / feature-flag strategy

| Preference | Detail |
|------------|--------|
| **Default** | **Incremental PRs** with revert-by-merge; **no feature flag** unless a phase is experimentally risky. |
| **If needed** | Short-lived flag only around **new hook vs old inline** implementation, default **off** until validated; remove flag in follow-up PR. |
| **Avoid** | Long-lived dual implementations that drift. |

---

## 9. Team decisions (resolved) + rationale for Q1–Q2

### 9.1 Split reference controller (Q1) — **recommended default**

**Context:** Split view shows **two different dates** (live schedule + reference date). That almost always means **two `useScheduleController` instances** (`primary` vs `ref`) are correct — a **single** controller cannot hold both snapshots without a redesign of the controller itself.

**Decision:** Do **not** aim for “one parent-owned `useScheduleController` for both panes” unless the controller is explicitly extended to support dual dates (out of scope for this decomposition).

**Instead (first-time / low-risk path):**

1. **Phase 1:** Extract `SplitReferencePortal` **with behavior unchanged** — still a second controller with `controllerRole: 'ref'`.
2. **Phase 2:** **Deduplicate orchestration**, not instances: extract a small shared hook (e.g. `useSchedulePaneHydration` or similar) that both main and reference code paths call with **their** controller actions + date key, so **load / `AbortController` / hydration / stuck-skeleton** logic lives in **one place** while **state stays separate**.

That gives you clarity without merging incompatible state into one hook by mistake.

**Status:** **Locked** — implement Phases 1–2 per above (two controllers; shared hydration/orchestration hook).

### 9.2 Context vs props (Q2) — **locked: props-only**

**Through Phase 7 (inclusive):** **No separate decision required.** Use **props + colocated hooks** only. Do **not** add schedule-page-wide React context for decomposition convenience.

**Checkpoint (after Phase 8) — record the decision, then treat it as stable**

| When | What to decide |
|------|----------------|
| **End of Phase 8** (`ScheduleMainGrid` / `ScheduleSplitLayout` and related layout splits are in) | **Yes / no / partial:** introduce **narrow** React context (e.g. chrome-only) **if** prop lists are still unmaintainable after extraction. If **no**, document “props-only for schedule shell” and close the topic. |
| **2026-04-22 (post Phase 8 review)** | **Decision: props-only for schedule shell** — `ScheduleMainGrid` and `ScheduleSplitLayout` use **explicit prop interfaces** only; split chrome composes pre-built `ReactNode`s (`mainLayout`, `splitHeaderBar`, portal layer). **No** schedule-wide or narrow layout React context. The main board / grid **body** (summary column, team grid, notes) remains composed in `SchedulePageClient` and is passed as `leftColumn` / `rightColumn` to `ScheduleMainGrid` to avoid a very large single-module prop surface; that partial boundary is an intentional trade-off, not a case for context. |
| **Product agreement (2026-04-22)** | The **props-only** approach above is **accepted and locked** for the schedule page shell. **Do not** re-open this choice for “convenience” refactors. Revisit **only** if a **future** change makes prop lists **genuinely unmaintainable** and the bar in **“Criteria to revisit”** below is met. |

**Optional early trigger (any phase):** If a **single** extraction makes prop drilling **obviously** worse than a small context, the team may decide sooner — but this is **exceptional**, not the default plan.

**Criteria to revisit (only if both are true):** (a) the same small set of values crosses **many** layers, and (b) threading props is **clearly** worse than a **narrow**, well-named provider (never the full controller in context).

**Status (Q2):** **Locked — props-only** for the schedule shell unless the criteria to revisit are met in a **later** design discussion.

### 9.3 Other items (product owner input)

| # | Topic | Decision |
|---|--------|----------|
| 3 | **Extra Playwright** for split reference + Step 3 (Phase 2 / 4) | **Approved.** |
| 4 | **Bundle budget** | **No hard % or KB target.** Smaller main chunk is welcome when cheap; this is a **mega-refactor** — **ship in phases**, do not require “one shot” completion. |
| 5 | **`as any` / typing (Phase 9)** | **Ongoing hygiene** — fix when touching an area; optional occasional tidy-up PRs. No mandatory time-box unless the team wants one later. |

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-22 | Initial draft from code review + architecture docs. |
| 2026-04-22 | §9: Resolved open questions — Q1–Q2 recommendations, Q3–5 decisions. |
| 2026-04-22 | §9: Q1 locked; Q2 explicit checkpoint — decide context **after Phase 8** (optional earlier if drilling pain). |
| 2026-04-22 | Linked implementation plan: `2026-04-22-schedule-page-client-decomposition-implementation-plan.md`. |
| 2026-04-22 | §9.2 Q2: **Decision — props-only for schedule shell** after Phase 8 (`ScheduleMainGrid` / `ScheduleSplitLayout`); no new schedule-wide or narrow layout context. |
| 2026-04-22 | §9.2: **Props-only locked** (product agreement); reworded checkpoint as stable decision, not TBD. |
