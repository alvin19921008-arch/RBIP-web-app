# Schedule UI / lib separation refactor plan (hybrid architecture)

> **Purpose**: Shrink the god-file `app/(dashboard)/schedule/page.tsx`, adopt **two-layer hybrid layout** — **`features/schedule/` = UI** (including **indexable step/substep** folders) and **`lib/` + `lib/features/schedule/` = logic / orchestration** — without stuffing all `.tsx` under one `lib/features` umbrella.  
> **Audience**: Future agents and humans executing this work in **small, verifiable slices**.  
> **Rule**: Update the **Progress tracker** and phase checkboxes as work completes.  
> **Implementation & verification** (commands, regression matrix, per-phase exit criteria): [`2026-04-11-schedule-ui-lib-separation-implementation-plan.md`](./2026-04-11-schedule-ui-lib-separation-implementation-plan.md).

**Phases 3–6 — token work is part of the phase (where UI moves):** structural change first → **review + mandatory gate + smoke + manual** → **then** token-alignment commit(s) on touched schedule UI → gate again — or log **token N/A (no UI diff)**. See **§ Deferred: UI color / design tokens**.

**Solo workflow (this repo)**: Work ships as **commits on your branch**, not pull requests. Verification = **lint + build + Playwright smoke + targeted regression** where the implementation plan lists them, plus **manual schedule passes** on paths automation does not cover. Where the companion doc says “after PR” / “before merge”, read that as **after a coherent commit (slice)** / **before you mark the phase done** — there is **no** “stabilize N days on main” gate unless you choose one.

---

## Summary table (living status)

| ID | Problem | Priority | Status |
|----|---------|----------|--------|
| P0 | Schedule **body** still large (~13k in `SchedulePageClient`); route `page.tsx` is thin — shrink body via Phases 2–2e | P0 | `in_progress` |
| P1 | UI vs logic mixed; unclear grep boundaries | P0 | `in_progress` |
| P2 | No stable **step/substep** home for schedule UI (indexability) | P1 | `in_progress` (Floating PCA config wizard + step34 VM under `ui/steps/step3-floating/`; `SchedulePageClient` still large) |
| P3 | `useScheduleController` ~4k lines; second “god” surface | P2 | `done` (types + domain modules landed; further hook splits optional) |
| P4 | Legacy hooks / duplicate mental models (`hooks/useScheduleState`, etc.) | P2 | `done` |
| P5 | New `features/` tree must participate in **Tailwind v4 `@source`** | P0 | `done` |
| P6 | **`components/allocation/` peel** + Step 3.4 **substep path parity** (`substeps/step34-preview/`) | P1 | `todo` |

**Status values**: `todo` · `in_progress` · `blocked` · `done`

---

## Progress tracker (agents: keep this current)

| Phase | Name | Status | Owner / notes | Last verified (tests) |
|-------|------|--------|---------------|------------------------|
| 0 | Conventions + tooling gates | `todo` | `AGENTS.md` (plans + `@/*`), `ARCHITECTURE_ESSENTIALS` schedule map + naming + barrels; `tsconfig.json` has `@/*`. Remaining: **Done when** team sign-off; Tailwind `@source features/` at Phase 1 | |
| 1 | Thin route + `SchedulePageClient` shell | `done` | Default export client; `./actions` → `@/app/(dashboard)/schedule/actions`; `eslint` ignores `.worktrees/**` | `lint+build OK; f47 OK; smoke OK 2026-04-16` |
| 2a | Extract Dev Leave Sim bridge | `done` | `ScheduleDevLeaveSimBridge.tsx`; `DevLeaveSimPanelProps` export | `lint+build+smoke OK 2026-04-16` |
| 2b | Extract step indicator + navigation strip | `done` | `ScheduleWorkflowStepShell`; export `StepIndicatorProps` | `lint+build+smoke+f47 OK 2026-04-16` |
| 2c | Extract DnD + main board shell | `done` | `ScheduleDndContextShell.tsx`, `ScheduleMainBoardChrome.tsx` | `lint+build+smoke OK 2026-04-16` |
| 2d | Extract header / overlays / save strip | `done` | `SchedulePageHeaderRightActions.tsx`, `SchedulePageSplitMainPaneHeader.tsx` (Overlays/DialogsLayer still inline — optional thin shell) | `lint+build+smoke+f47 OK 2026-04-16` |
| 2e | **Step / substep UI scaffold** (hybrid indexability) | `done` | `ui/steps/README.md`; pilot `step30-entry-flow/FloatingPCAEntryDialog.tsx`; allocation path = shim | `lint+build+smoke+f66+f47 OK 2026-04-16` |
| 2f | **Design tokens + Tailwind** alignment for moved UI | `done` | `features/schedule/ui/README.md`; semantic tooltips in `SchedulePageHeaderRightActions`. **Broad** token sweep on `SchedulePageClient` **deferred** — see **§ Deferred: UI color / design tokens** below + companion **§ Deferred** in implementation plan. | `lint+build+smoke+f66+f47 OK 2026-04-16` |
| 3 | Split `useScheduleController` (facade) | `done` | `scheduleControllerTypes.ts`, `scheduleDomainState.ts`; gym/f124 `c2b11ea`. Token N/A. | `lint+build+smoke OK; full regression tsx OK; manual Step2/3/4+save OK 2026-04-16` |
| 4 | Legacy hook cleanup + `components/schedule` migration | `done` | 4a migrate+shims+hooks; 4b tokens `8274d20`+`535d163`. README allocation inventory. | `lint+build+smoke; full regression tsx; grep clean 2026-04-16` |
| 5 | **Deep step parity** (optional): migrate remaining Step 3 UI into `ui/steps/` | `done` | 5a `c5709a9` wizard+viewModel; 5b `42d3d21` light-first tokens (no dark-mode scope). Manual wizard: solo sign-off. | `lint+build+smoke; full regression tsx OK 2026-04-16` |
| 6 | **Step 3.4 substep path** + **`components/allocation/` peel** | `todo` | Canonical `step34` under `substeps/step34-preview/`; incremental allocation → `features/schedule/ui/` per README inventory. See **§ Phase 6** below. | |

**Legacy emoji column** (optional): ⬜ = `todo`, 🟡 = `in_progress`, ✅ = `done`, ⏸️ = `blocked`

---

## Hybrid architecture (decision record)

### Two layers (preferred over one mega `lib/features/<feature>` umbrella)

| Layer | Location | Owns |
|--------|-----------|------|
| **Routing** | `app/(dashboard)/schedule/` | Thin `page.tsx`, `loading.tsx` / `error.tsx` if present — **no business logic** |
| **Schedule UI** | **`features/schedule/ui/`** | React components, local UI state, **step/substep** folders for discoverability |
| **Schedule logic** | **`lib/features/schedule/`** | `.ts` modules: projections, bootstrap, dialog-flow, save/snapshot, step3 harness, **no new schedule `.tsx`** |
| **Orchestration** | **`lib/features/schedule/controller/`** | `useScheduleController` (eventually **facade** over smaller modules) |
| **Algorithms** | **`lib/algorithms/`**, engines | Pure / worker-backed allocation code |
| **Shared primitives** | **`components/ui/`** | shadcn-style building blocks (unchanged role) |

**Rationale (short)**:

- **One umbrella** under `lib/features/schedule` mixing hundreds of `.tsx` and `.ts` blurs “logic vs UI,” fights common `lib` = non-UI intuition, and makes **path-based grepping** noisier.
- **Two layers** give agents and humans a **binary search**: UI bug → `features/schedule/`; wrong pending / save / harness → `lib/features/schedule/`.

### Borrowed from the alternate AI proposal (without adopting its `lib` placement)

- **Indexable step tree** lives under **`features/schedule/ui/steps/`**, not under `lib/`.
- **Folder naming is fixed repo-wide** (not a menu of styles): see **Step folder naming (mandatory)** below and the same rule in `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`.

**Example target (illustrative — grow incrementally)**:

```text
features/schedule/ui/
  SchedulePageClient.tsx       # wires sections + steps + dialogs; stays thin over time
  sections/                    # workflow shell only — see table below (not an alternate to steps/)
  steps/                         # in-step / wizard modules (macro-steps 1–5, Step 3 substeps)
    step1-leave/
    step2-fixed-allocation/
    step3-floating/
      FloatingPCAStep.tsx
      substeps/
        step31-teams-order/
        step32-preferred/
        step33-adjacent/
        step34-preview/
      components/                # shared only within Step 3 wizard UI
    step4-bed/
    step5-review/
  dialogs/
  dev/
```

### Step folder naming (mandatory)

All **directory** names under **`features/schedule/ui/steps/`** use **lowercase kebab-case** only (ASCII letters, digits, hyphens). **Do not** use PascalCase folders, **do not** put `.` in folder names (e.g. no `Step3.1/`).

| Pattern | Example | Maps to product |
|---------|---------|-----------------|
| Macro step | `step1-leave/`, `step2-fixed-allocation/`, `step3-floating/`, `step4-bed/`, `step5-review/` | Steps 1–5 |
| Substep (Step 3 mini-steps) | `substeps/step31-teams-order/`, `substeps/step32-preferred/`, … | 3.1, 3.2, … — `step` + **two digits** (major+minor) + `-` + slug, always under `substeps/` |

**Files** inside those folders may use normal React/TS conventions (e.g. `FloatingPCAStep.tsx`, `useFloatingPCAStep.ts`).

### Barrel exports (`features/schedule/index.ts`)

An optional **`features/schedule/index.ts`** may re-export **`SchedulePageClient`** (or the single public entry consumers need). Keep it **thin**. For everything else, prefer **direct imports** to the implementing file under `ui/steps/...` or `ui/sections/...` so **grep** and **go to definition** land on the real module.

### `sections/` vs `steps/` (do not conflate)

| Folder | What belongs here | What does **not** belong here |
|--------|---------------------|-------------------------------|
| **`ui/sections/`** | **Allocation workflow shell**: `StepIndicator` (the five macro-steps: Leave & FTE → Therapist & PCA → Floating PCA → Bed relieving → Review), **Next step / Previous step** controls, split-layout / “always on” schedule header chrome. These read **`currentStep` / `stepStatus`** from the controller and **only navigate** macro-steps. | **Not** the Step 2 therapist grid body, **not** Step 3.1–3.4 wizard panels (those are **in-step** surfaces). |
| **`ui/steps/`** | **In-step product UI**: e.g. Step 2 surfaces if extracted, Step 3 floating **wizard** (`substeps/step32-preferred`, …), step-local hooks and small components. | **Not** the global step strip — that stays **`sections/`** so “who owns Next?” has one answer. |

**Why it feels ambiguous**: When `currentStep === 'floating-pca'`, the same **StepIndicator** highlights Floating PCA — but that strip is still **global chrome**, not part of the Step 3 dialog’s internal mini-stepper. Mini-step labels (3.1 Adjust / 3.2 Preferred) live under **`steps/step3-floating/`**.

**Rules**: **`steps/*`**: presentation + local hooks; call **`useScheduleController`** (or props from `SchedulePageClient`); **no** new Supabase / `allocatePCA` in leaves unless documented. **`sections/*`**: navigation + shell only; **no** allocation algorithms.

---

## Final optimal architecture (for later agents)

Two diagrams: **§A** = external vocabulary (do **not** copy `lib/**/*.tsx` UI paths). **§B** = **canonical file placement** — implement §B. If anything conflicts, **§B wins** (see also **“Which tree should agents follow?”** at end of §B).

### A) Appendix — External reference proposal (quoted — preserve ideas, not `lib` placement for `.tsx`)

> **Source**: Prior architecture thread (stakeholder-approved example, Apr 2026). **Use it for**: thin `app/`, per-step folders, sub-steps under Step 3, per-step hooks/types/validators, `lib/algorithms` purity, gradual deprecation of flat `components/`. **Do not copy literally**: that proposal placed **React** (`ScheduleOrchestrator.tsx`, `SchedulePageContainer.tsx`, step `.tsx`) under **`lib/features/schedule/`**. In RBIP we **do not** adopt that — all schedule **UI** lives under **`features/schedule/ui/`** (see §B).

**Reference tree (schedule spine — abbreviated; paths are NOT RBIP implementation targets):**

```text
app/(dashboard)/schedule/
  page.tsx                         # thin orchestrator (<~15 lines target)

lib/features/schedule/             # ← REFERENCE ONLY: UI + logic co-located under lib (do NOT copy in RBIP)
  ScheduleOrchestrator.tsx         # main entry (reference)
  SchedulePageContainer.tsx          # page wrapper / state (reference)
  ScheduleController.ts            # main state hook (reference)
  steps/
    Step1LeaveEdit/                # LeaveEditStep.tsx, useLeaveEdit.ts, types, validators
    Step2FixedAllocation/
    Step3FloatingPCA/
      FloatingPCAStep.tsx
      useFloatingPCA.ts
      substeps/
        Step3.1TeamsOrder/         # TeamsOrderStep.tsx, components/, …
        Step3.2PreferredPCA/
        Step3.3AdjacentSlot/
        Step3.4Preview/
      components/                  # Step3Navigation, Step3Header, …
      lib/                         # step-local snapshot/validation helpers (reference)
    Step4BedAllocation/
    Step5Review/
  components/                      # ScheduleStepper, ScheduleHeader, …
  hooks/                           # useScheduleState, useScheduleSnapshot, …
  lib/                             # schedule-wide snapshot, validation, serialization
  types.ts, constants.ts
```

**Reference — key architectural decisions (verbatim intent):**

| Decision (reference) | Rationale |
|----------------------|-----------|
| `/app` stays thin | Only routing, no business logic |
| Self-contained feature modules | Easier to find and modify |
| Step components colocated | Easy to find & modify step logic |
| Sub-steps within Step 3 | Reflects actual UI (3.1, 3.2, 3.3, 3.4) |
| `types.ts` per feature / step | Single source of truth per slice |
| Hooks per step/panel | Easier to test, reuse, parallelize |
| `lib/algorithms` pure functions | No side effects, easy to test |
| Gradual deprecation | Do not break everything overnight |

---

### B) Canonical RBIP target (optimal — **agents: implement this tree**)

> **Single source of truth for paths**: Every **commit/slice** that moves schedule code should match **this §B tree** (plus the `sections/` vs `steps/` rules above). If §A and §B disagree, **§B wins**.

**Mapping from reference names → RBIP paths:**

| Reference name | RBIP canonical location |
|----------------|-------------------------|
| `ScheduleOrchestrator.tsx` | `features/schedule/ui/SchedulePageClient.tsx` (or `ScheduleScreen.tsx`) — **top composer only** |
| `SchedulePageContainer.tsx` | **Merged into** `SchedulePageClient` + thin providers, **or** `features/schedule/ui/SchedulePageContainer.tsx` if you split container vs shell |
| `ScheduleController.ts` | **`lib/features/schedule/controller/useScheduleController.ts`** (+ Phase 3 submodules); **hook** naming stays `use*` |
| `steps/**.tsx`, `substeps/**` | **`features/schedule/ui/steps/**`** — **mandatory** lowercase kebab-case dirs: `step3-floating/substeps/step31-teams-order/` (see **Step folder naming (mandatory)**) |
| Step-level `types.ts`, `validators.ts` | **UI-adjacent** types/validators → `features/schedule/ui/steps/.../` when only UI concerns; **domain** types stay in `types/schedule.ts` / `lib/db/types` as today |
| `steps/.../lib/` (reference) | **Domain** helpers → `lib/features/schedule/` (e.g. `step3Bootstrap.ts`); **UI-only** helpers stay next to the step component |
| `lib/features/schedule/hooks/` (reference) | Prefer **`features/schedule/ui/hooks/`** for UI hooks; **`lib/features/schedule/`** only for non-React schedule hooks if truly needed |
| `lib/features/schedule/components/` (reference) | **`features/schedule/ui/sections/`** (workflow shell, e.g. step indicator, next/prev) **or** **`features/schedule/ui/steps/.../components/`** (widgets **inside** that macro-step / wizard only) — see **Hybrid architecture → `sections/` vs `steps/`** |

**Full target tree (optimal layout — aspirational; reach via Phases 1–5):**

```text
app/(dashboard)/schedule/
  page.tsx                         # Route shell only: import + render SchedulePageClient (+ providers if any)
  loading.tsx | error.tsx          # Optional; Next.js route conventions

features/schedule/
  index.ts                         # Optional **thin** barrel: SchedulePageClient (or one public entry) only — see § Barrel exports

  ui/
    SchedulePageClient.tsx         # Composer: mounts sections + route-level dialogs + step modules; no algorithms

    sections/                      # Workflow shell ONLY (see table above):
                                   # - StepIndicator (5 macro-steps), Next/Previous step
                                   # - Schedule shell / split pane / “always on” header row
                                   # NOT Step 2 grid body, NOT Step 3.1–3.4 wizard content

    dialogs/                       # Dialogs that are not tied to one wizard file (e.g. copy wizard host)
                                   # Step 3 Floating entry/config may stay colocated under steps/ until split

    dev/                           # Dev Leave Sim panel bridge (developer role)

    hooks/                         # Schedule-only React hooks (DnD locals, layout); no direct Supabase — persist via controller actions / props callbacks

    steps/                         # In-step / wizard modules per macro-step (1–5):
      step1-leave/
        LeaveStep.tsx              # Leave & FTE editing surface (if extracted from page)
        useLeaveStep.ts            # Optional; calls controller actions for save/patch
        components/                # Cards/rows used only by leave step
        types.ts                   # UI-local types only; domain types stay in types/ + lib/db
      step2-fixed-allocation/       # Therapist & non-floating PCA wizard surfaces (when extracted)
        ...
      step3-floating/               # Floating PCA wizard (V2 dialog composition, substeps)
        FloatingPCAStep.tsx
        useFloatingPCAStep.ts
        substeps/
          step31-teams-order/      # Maps to product “3.1”; folder name filesystem-safe
          step32-preferred/
          step33-adjacent/
          step34-preview/
        components/                # e.g. mini-stepper **inside** Step 3 dialog, not the global StepIndicator
      step4-bed/
      step5-review/

lib/features/schedule/            # TypeScript domain + orchestration helpers (no new schedule .tsx)
  *.ts                             # e.g. step3Bootstrap, pageStep3Runtime, saveNormalization, projections
  controller/
    useScheduleController.ts       # Public facade: load/save, workflow, step runners, undo; Phase 3 may split
    persistence.ts                 # Illustrative Phase-3 split names — align to real seams when splitting
    workflow.ts                    # (illustrative)
    stepRunners.ts                 # (illustrative)
  pcaAllocationEngine.ts           # Worker / sync adapter to lib/algorithms entrypoints
  step3Harness/                    # Dev/automation harness (executeStep3V2HarnessAuto, …)

lib/algorithms/                     # Pure (or worker-isolated) allocation math; no React
  *.ts                             # pcaAllocation, therapistAllocation, bedAllocation, floatingPcaV2, …

lib/db/, lib/supabase/              # DB types, mutations, Supabase clients — unchanged responsibility

components/ui/                      # App-wide shadcn-style primitives (Button, Dialog, …)
  button.tsx, card.tsx, …          # Consumed by features/schedule/ui and components/*; do not move into lib/

styles/
  rbip-design-tokens.css           # CSS variables + RBIP step themes; imported from app/globals.css

app/globals.css
  @import "../styles/rbip-design-tokens.css";
  @source "../features/**/*.{ts,tsx}";   # Required once features/ exists (Tailwind v4 scan)
```

**Data flow (clarification):** Steps 1–3 **UI** and **`useScheduleController`** hold what the user does (`staffOverrides`, allocations, prefs); **`pcaAllocationEngine.ts`** is **not** that UI — it **invokes** **`lib/algorithms/`** when the controller passes a ready **context** snapshot for PCA math.

#### Which tree should agents follow? (read once)

| Question | Answer |
|------------|--------|
| **Where do I put new files?** | **§B only** — `features/schedule/ui/...` for UI, `lib/features/schedule/...` + `lib/algorithms/...` for logic. |
| **What is §A for?** | **Ideas**: macro-step naming, substeps, “hooks per step,” decision table. **Never** use §A’s `lib/features/schedule/*.tsx` paths. |
| **Step indicator / Next / Previous?** | Always **`features/schedule/ui/sections/`** — workflow shell, not `ui/steps/`. |
| **Step 3.2 Preferred panel?** | **`features/schedule/ui/steps/step3-floating/substeps/step32-preferred/`**, not `sections/`. |

> **Agents: implement §B + Hybrid `sections/` vs `steps/` rules.** Use §A only for naming and depth inspiration.

**Optimal invariants (checklist for agents):**

- [ ] `app/(dashboard)/schedule/page.tsx` is **thin** (mount + providers only).
- [ ] **Every** new schedule screen / step / sub-step file lives under **`features/schedule/ui/`** with a **predictable path** (`steps/step3-floating/substeps/step32-preferred/...`).
- [ ] **No** new `*.tsx` under **`lib/features/schedule/`** for schedule screens.
- [ ] **Orchestration** (load/save, step runners, tie-break) stays in **`useScheduleController`** (or its Phase-3 submodules), called from UI — not reimplemented in leaf components.
- [ ] **Algorithms** remain in **`lib/algorithms/`** (and related engines), not copied into UI folders.
- [ ] **Tokens**: Step-themed surfaces use **`styles/rbip-design-tokens.css`** (+ commonality rule), not one-off hex in new code.

---

## Design tokens (existing asset — align refactors to it)

**Source of truth (CSS variables + utilities)**:

- `styles/rbip-design-tokens.css` — RBIP tokens (e.g. Step 3.2 amber family, Step 3.3 teal, shared utilities). Documented in-file; aligns with `.cursor/rules/design-elements-commonality.mdc`.

**Global entry**:

- `app/globals.css` already imports: `@import "../styles/rbip-design-tokens.css";`

**Optional TS bridge** (if/when added):

- Comments in `rbip-design-tokens.css` reference `lib/design/rbipDesignTokens.ts` for class-name constants — **create or use that module** when extracting UI so components do not hardcode magic strings. If the file does not exist yet, add it as part of **Phase 2f** when the first migrated component needs typed token class names.

**Phase 2f tasks (condensed)**:

- [ ] New schedule UI under `features/schedule/ui/**` uses **tokens / utilities** from `rbip-design-tokens.css` (or TS constants) per commonality rule — avoid ad-hoc hex in new code.
- [ ] After `features/` exists: ensure **Tailwind v4** scans it — add `@source "../features/**/*.{ts,tsx}"` to `app/globals.css` (alongside existing `@source` lines). Without this, utility classes used only under `features/` may **purge**.

---

## Principles (non-negotiable)

1. **`lib/` = logic** — TypeScript domain code, projections, persistence helpers, workers, **`lib/features/schedule/`** (`.ts` only for new schedule domain code). **Do not** add schedule **screens** (`.tsx`) under `lib/features/schedule/`.

2. **`features/schedule/ui/` = schedule UI** — React, **`sections/`** (workflow shell: step indicator, next/prev) vs **`steps/`** (in-step / wizard modules); dialogs, dev bridges. See **Hybrid architecture → `sections/` vs `steps/`**.

3. **`app/(dashboard)/schedule/` = routing shell** — After Phase 1, `page.tsx` only mounts `SchedulePageClient` (or equivalent).

4. **Behavior-first refactors** — Phases 1–2: **move/extract** first; **no intentional behavior change**. Record any accidental fix separately.

5. **Verify before marking done** — Smoke / regression used elsewhere in repo; paste command + result into tracker or phase notes.

6. **Cross-feature imports** — Prefer **`lib/`** shared modules or explicit public APIs; avoid `features/dashboard` importing `features/schedule/ui` internals (team rule; tighten over time).

---

## Suggested iteration order (dependencies)

```text
Phase 0 ──► Phase 1 ──► Phase 2a → 2b → 2c → 2d
                │              │
                │              └──► Phase 2e (scaffold + pilot substep) ──► Phase 2f (tokens + @source)
                │                                    │
                └────────────────────────────────────┴──► Phase 3 (optional parallel — see note)
Phase 4 ──► after 2a–2d + 2e/f materially reduce page client OR when agreed “strangler complete”
Phase 5 ──► optional depth migration; do not block Phase 4
Phase 6 ──► after Phase 5 (or in parallel if files do not overlap): substep folder parity + allocation peel per README inventory
```

- **Phase 2f** can start **in parallel** with late Phase 2 slices once `features/` exists (same commit/slice as Phase 1 tail is OK if small).
- **Phase 3** (split controller): prefer **after** Phase 1–2 are stable in your tree, or only when **files do not overlap** with an active Phase 2 slice — solo merges are just rebases; overlapping edits in `useScheduleController` + `SchedulePageClient` still hurt. **No “wait N days” rule** unless you impose one on yourself.

---

## Phase 0 — Conventions + tooling gates

**Current problem / loophole**: Agents default-import from old paths; Tailwind may ignore new folders.

**Tasks**

- [x] Confirm `@/*` → repo root in `tsconfig.json` (supports `@/features/schedule/...`) — **noted in `AGENTS.md`**; paths block present in `tsconfig.json`.
- [x] **`AGENTS.md`** (repo root) points to this plan + **`ARCHITECTURE_ESSENTIALS.mdc`** schedule layout.
- [x] **`ARCHITECTURE_ESSENTIALS.mdc`** includes the short **§B-style path table**, **mandatory step folder naming**, **`lib`↔`features` import rule**, and **barrel** guidance (see § “Schedule UI / lib layout”).

**Done when**: Team agrees strangler + hybrid; tracker row Phase 0 = `done`.

**Verify**: N/A (process).

---

## Phase 1 — Thin route + `SchedulePageClient` shell

**Goal**: Move `page.tsx` body → `features/schedule/ui/SchedulePageClient.tsx`; leave `page.tsx` thin.

**Tasks**

- [x] Create `features/schedule/ui/SchedulePageClient.tsx`.
- [x] Move client body from `app/(dashboard)/schedule/page.tsx` with **minimal** edits.
- [x] Replace `page.tsx` with import + render.
- [x] Fix imports; add **`@source "../features/**/*.{ts,tsx}"`** to `app/globals.css` so Tailwind sees new files.

**Done when**: Build passes; schedule loads; `page.tsx` line count trivial.

**Verify**: Smoke / regression (record in tracker).

**Primary files**: `app/(dashboard)/schedule/page.tsx`, `app/globals.css`, `features/schedule/ui/SchedulePageClient.tsx`

---

## Phase 2a–2d — Vertical slices (same as v1 plan)

Each subphase shrinks `SchedulePageClient` and adds files under `features/schedule/ui/sections/`, `dialogs/`, or `dev/`.

| Subphase | Goal | Target folder | Primary verify |
|----------|------|-----------------|----------------|
| **2a** | Dev Leave Sim bridge | `ui/dev/` | Developer + Leave Sim |
| **2b** | **Workflow shell**: step indicator + **Next/Previous step** (macro-step navigation only) | **`ui/sections/` only** — not `ui/steps/` (see Hybrid **§ `sections/` vs `steps/`**) | Step gating, outdated hints |
| **2c** | DnD + main board shell | `ui/sections/` (layout + board chrome) | DnD |
| **2d** | Header row, overlays, save control | `ui/sections/` (or small `ui/dialogs/` if a surface is dialog-only) | Save / date / overlays |

**Phase 2b note**: The strip that shows “Floating PCA · Current step 3 of 5” is **global** schedule UI; it is **not** part of `steps/step3-floating/` even though it highlights Step 3. Step 2 / Step 3 **wizard bodies** (when extracted) belong under **`ui/steps/step2-fixed-allocation/`** and **`ui/steps/step3-floating/`** respectively.

---

## Phase 2e — Step / substep UI scaffold (hybrid indexability)

**Goal**: Establish **`features/schedule/ui/steps/`** with a **pilot** migration (one sub-step or one dialog surface) so future work has a **template** (folder layout, naming, imports from controller).

**Tasks**

- [x] Add `features/schedule/ui/steps/README.md` (short: mandatory **lowercase kebab-case** dirs + `substeps/stepNN-slug/` pattern; **logic stays in `lib/features/schedule/`**; **barrels**: prefer direct imports; link to architecture plan § Step folder naming).
- [x] Create minimal folder tree under `steps/step3-floating/substeps/` (empty `index.ts` or one pilot component).
- [x] Migrate **one** pilot UI chunk from `SchedulePageClient` or `components/schedule` into the scaffold (prefer a self-contained dialog or panel). **Pilot:** `FloatingPCAEntryDialog` → `step3-floating/substeps/step30-entry-flow/`; `components/allocation/FloatingPCAEntryDialog.tsx` re-exports for compatibility.
- [x] Update imports; no behavior change.

**Done when**: Pilot renders; grep `features/schedule/ui/steps` finds the pilot.

**Verify**: Targeted manual test for pilot + smoke if applicable.

---

## Phase 2f — Design tokens + Tailwind alignment

**Goal**: Moved UI **consumes** `styles/rbip-design-tokens.css` variables / `.rbip-*` utilities per **design-elements-commonality**; no regression in Step 3 visual contracts.

**Tasks**

- [x] Audit first migrated `features/schedule/ui/**` components: replace inline one-off colors with tokens where the rule applies. **Slice:** `SchedulePageHeaderRightActions` dev tooltip panels → `bg-popover` / `border-border` / muted + amber semantic text.
- [x] Add `lib/design/rbipDesignTokens.ts` (or equivalent) **if** TS constants are needed — **skipped**; module-local `SCHEDULE_HEADER_DEV_TOOLTIP_PANEL_CLASS` used instead.
- [x] Confirm `globals.css` `@source` includes `features/` (if not done in Phase 1). **Confirmed**; documented in `features/schedule/ui/README.md`.

**Done when**: New UI paths compile; token usage noted in **commit message** or architecture **Progress tracker**.

**Verify**: Visual spot-check Step 3.2 / 3.3 surfaces touched by refactor; smoke optional.

**Primary files**: `styles/rbip-design-tokens.css`, `app/globals.css`, `.cursor/rules/design-elements-commonality.mdc`, `features/schedule/ui/**`

---

## Deferred: UI color / design tokens (`SchedulePageClient` and beyond)

**Why:** Phase **2f** closed with **extracted** schedule UI tokenized first (e.g. header dev tooltips) and `features/` documented for Tailwind — **not** a repo-wide recolor of **`SchedulePageClient.tsx`**, which remains large (“god file”). Sweeping that file only for cosmetics would be high churn, hard review, and weak modularity gain.

**Product:** Schedule UX is **light-first**; **dark mode** is **not** a driver for token work unless requirements change.

**Required workflow for Phases 3–6 (agents must not skip token silently)**

1. **Structural slice** — main phase work (controller split, migration, step move).  
2. **Verify** — code review + **mandatory gate** + smoke + **manual** on that slice; all green before tokens.  
3. **Token slice** — align touched `features/schedule/ui/**` (and any `SchedulePageClient` regions changed in step 1) with semantic / `.rbip-*` tokens per `rbip-design-tokens.css` + `design-elements-commonality.mdc`; prefer **separate commit(s)** after behavior is frozen. Re-run gate after token work.  
4. **Mark phase `done`** only after steps 1–3, **or** log **token N/A — no UI diff** if step 1 changed no JSX (explicit skip, not omission).

**Smaller extractions:** If a move from `SchedulePageClient` is tiny, structural + token may be **one** commit only when the combined diff stays easy to review.

**Avoid:** A standalone “repaint the whole `SchedulePageClient`” milestone with no structural extraction.

**Detail (commands, matrix, exit criteria):** [`2026-04-11-schedule-ui-lib-separation-implementation-plan.md`](./2026-04-11-schedule-ui-lib-separation-implementation-plan.md) — **§ Deferred: UI color / design tokens on `SchedulePageClient` (post-2f policy)** and **§ Required two-slice workflow**.

---

## Phase 3 — Split `useScheduleController` (facade)

**Goal**: Smaller internal modules under `lib/features/schedule/controller/`; **public** `useScheduleController` API unchanged until intentional version bump.

**Tasks**: (unchanged from prior plan — persistence / workflow / step runners / undo seams)

**Token workflow:** After structural slice is reviewed and verified (gate + smoke + manual), run the **token slice** on touched schedule UI — see **§ Deferred: UI color / design tokens** (required two-slice workflow). Log **token N/A** only if that slice changed **no** schedule UI files.

**Verify**: Regression + manual Step 2/3/4; mandatory gate again after token commits when applicable.

---

## Phase 4 — Legacy hooks + `components/schedule` migration

**Goal**: Remove dead hooks; move **`components/schedule/*`** → `features/schedule/ui/`; delete or thin re-exports. **Also track schedule-heavy UI under `components/allocation/`** (grid, blocks, many dialogs): Phase 4 is **not done** if only `components/schedule` is empty while schedule screens still live only under `components/allocation/`. Maintain a short **migration checklist** (or follow-up Phase 4b) for allocation components that exist **only for the schedule route**.

**Tasks**

- [ ] Grep `useScheduleState` / `useStepwiseAllocation`; delete if unused.
- [ ] Migrate remaining schedule-only components from `components/schedule/`.
- [ ] Grep for stale `@/components/schedule` imports.
- [ ] **Inventory** `components/allocation/**` used exclusively by schedule; plan moves into `features/schedule/ui/` (sections, steps, or dialogs) and execute incrementally.

**Token workflow:** Per migration slice — **structural → verify → token** (see **§ Deferred**). Re-run gate after token commits.

**Verify**: Automated tests you run locally + grep clean + **manual** schedule smoke pass on flows you care about; gate after token slices as applicable.

---

## Phase 5 — Deep step parity (optional)

**Goal**: Bring **remaining** Step 1–5 UI into `features/schedule/ui/steps/**` mirroring product steps — **only after** Phases 2e–4 prove stable.

**Consequence if skipped**: Schedule still works; indexability is partial until Phase 5.

**Tasks**: Incremental **commits/slices** per macro-step; avoid big-bang renames.

**Token workflow:** Per substep — **structural → verify → token** using step-scoped `.rbip-step*` / `rbipDesignTokens` + commonality rules (**§ Deferred**). For **leftover** literals in `SchedulePageClient`, token passes only **after** the relevant JSX has moved — scoped hunks, not whole-file repaint.

---

## Phase 6 — Step 3.4 substep path parity + `components/allocation/` peel

**Goal (two tracks, same phase — ship in small slices):**

1. **Substep path parity:** Move **`step34ViewModel`** (and any Step 3.4-only helpers co-located with it) from `features/schedule/ui/steps/step3-floating/step34/` to the **mandatory** layout **`features/schedule/ui/steps/step3-floating/substeps/step34-preview/`** so the tree matches **`ARCHITECTURE_ESSENTIALS.mdc`** (product Step 3.4 = `step34-preview`). Update all imports (wizard, shims, `tests/regression/*`, docs as needed). **No behavior change** — rename/move only unless a bug is discovered.

2. **Allocation peel:** Incrementally migrate **schedule-primary** React from **`components/allocation/`** into **`features/schedule/ui/`** (`steps/`, `sections/`, `dialogs/`, shared leaf folders) using the living checklist in **`features/schedule/ui/README.md`** (Phase 4 inventory + “still to migrate”). Prefer **one vertical slice per commit** (e.g. one dialog cluster + `SchedulePageClient` import updates + shims). **Shared consumers** called out in the README (`StaffCardColorGuideContent`, `BufferStaffConvertDialog`) must be updated in the **same slice** as their moved target, or keep a documented shim path.

**Layering follow-up:** When a moved dialog forces **`lib`** to type-import from **`components`** (e.g. **`BedCountsOverrideState`** today), hoist the shared type to **`@/types/schedule`** or **`lib/`** in that slice so domain types do not depend on UI paths.

**Token workflow:** Per **§ Deferred** — structural peel → gate + smoke + manual on touched flows → token pass on **touched** `features/schedule/ui/**` only (light-first unless product enables dark mode). Log **token N/A** only if a slice is path-only with no class changes.

**Verify:** Mandatory gate (`lint`, `build`, `test:smoke`); **`f47`** + **`f66`** whenever Step 3 / schedule page import graph moves materially; **full** `tests/regression` loop before marking Phase **6** `done` for a milestone that touches allocation/save; manual Steps **1–5** after slices that change user-visible surfaces. Optionally extend grep: **`@/components/allocation`** from app/features code should trend toward **shims-only** for schedule-only components — document any intentional exceptions in the README.

**Done when:** `step34` canonical path is under **`substeps/step34-preview/`**; README inventory reflects migrated vs remaining allocation components; mandatory gate + full regression + your manual acceptance for the peeled areas; token follow-up per **§ Deferred** satisfied (or **token N/A** logged per slice).

**Consequence if deferred:** Schedule remains correct; **grepability and §B folder conventions stay slightly wrong** for Step 3.4; **`components/allocation/`** remains the main non-`features/` home for schedule grid/wizard leaves, which blurs the “UI bug vs logic bug” search heuristic.

---

## AI / grep conventions (Cursor-friendly)

| Question | Search prefix / path |
|----------|----------------------|
| Schedule **UI** (JSX, local hooks) | `features/schedule/` |
| **Step / substep folders** (directory names) | Lowercase kebab-case only under `ui/steps/` — e.g. `step32-preferred`, not `Step32Preferred` or `Step3.2` |
| Schedule **domain** (no JSX) | `lib/features/schedule/` |
| **Allocation math** (pure / worker-isolated) | `lib/algorithms/` (e.g. `pcaAllocation`, `floatingPcaV2`, …) |
| **PCA run adapter** (build context → call algorithms; worker) | `lib/features/schedule/pcaAllocationEngine.ts` — **not** the same folder as “math only” |
| **Design tokens** | `styles/rbip-design-tokens.css`, `design-elements-commonality.mdc` |
| **This plan** | `docs/superpowers/plans/2026-04-11-schedule-ui-lib-separation-plan.md` |

**Agent discipline**: In **commit messages** (solo), note which layer you touched (`ui` vs `lib`) so future greps stay honest.

## Reviewer notes — hardening (solo / pre-launch)

- **`lib` → `features` ban**: **`lib/**` must not import from `features/**`** (only UI may import lib). Breaks layering and risks circular bundles.
- **Barrels**: thin top-level re-export only; avoid deep barrels that hide implementations from **grep** / go-to-definition (see **Barrel exports** above).
- **Phase 4 / Phase 6 scope**: **`components/allocation/`** schedule-only surfaces — Phase **4** inventoried them; Phase **6** executes the **peel** into `features/schedule/ui/` (see **§ Phase 6** and `features/schedule/ui/README.md`).
- **Smoke flakes**: If `npm run test:smoke` fails on a test **unrelated** to your slice, follow the **implementation plan** flake protocol (retry, then documented skip or fix) — do not block a phase on unrelated red.

---

## Anti-patterns (do not do)

- Growing `page.tsx` again — add `features/schedule/ui/sections/` or `steps/`.
- New schedule `.tsx` under `lib/features/schedule/`.
- **`import` from `features/` inside `lib/`** — breaks the two-layer rule and invites circular dependencies.
- Duplicating orchestration (Supabase, full `allocatePCA` paths) inside deep leaf components.
- Skipping **`@source`** for `features/` after creating the folder.
- **PascalCase or dotted directory names** under `features/schedule/ui/steps/` — use **Step folder naming (mandatory)** only.
- Skipping tests between slices (solo: at least **lint + build + smoke** when you touch schedule; add **manual** pass per implementation plan).

---

## References (starting points)

- [`2026-04-11-schedule-ui-lib-separation-implementation-plan.md`](./2026-04-11-schedule-ui-lib-separation-implementation-plan.md) — **mandatory test gate**, regression runner, **exit criteria per phase**.
- **§ Final optimal architecture** (heading in this doc) — §A reference + §B canonical tree (**implement §B only**).
- `app/(dashboard)/schedule/page.tsx` — current god file.
- `lib/features/schedule/controller/useScheduleController.ts` — orchestration.
- `components/schedule/*` — UI to migrate.
- `lib/features/schedule/*.ts` — logic modules.
- `styles/rbip-design-tokens.css` — RBIP CSS variables + utilities.
- `app/globals.css` — Tailwind `@source` + token import.
- `.cursor/rules/design-elements-commonality.mdc` — token / commonality rules.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-11 | Initial plan (single-layer `features/` + phases 0–4). |
| 2026-04-15 | **Hybrid** + phases **2e/2f/5**, tokens/`@source`, grep conventions. **§ Final optimal architecture**: quoted prior proposal (step indexability); **§B** canonical RBIP tree, name mapping, invariants. |
| 2026-04-16 | Linked **implementation plan**; naming + barrels + **§B** map; **Phase 1** thin route + `SchedulePageClient` + `@source` + eslint `.worktrees` + smoke hardening. **Phase 2a:** `ui/dev/ScheduleDevLeaveSimBridge`, `DevLeaveSimPanelProps`, smoke `goToLeaveStep` `aria-current` + Previous fallback. |
| 2026-04-16 | **Phase 2b:** `features/schedule/ui/sections/ScheduleWorkflowStepShell.tsx`; export **`StepIndicatorProps`** from `StepIndicator`. |
| 2026-04-17 | Hybrid **§ `sections/` vs `steps/`**; §A appendix + “NOT RBIP paths”; **Which tree** callout; Phase 2b table + note; §B polish; **Data flow** line (UI + controller vs `pcaAllocationEngine` vs `lib/algorithms`); **Reviewer hardening**: solo workflow blurb, Phase 4 **`components/allocation/`** scope, grep split (math vs adapter), `lib`↔`features` import ban, smoke-flake note, § hooks wording (no direct Supabase), References anchor fix, Phase 3/5 PR wording → commits. |
| 2026-04-16 | **§ Deferred: UI color / design tokens** — light-first; bundle token cleanup with **extractions** and **Phases 3–5**; no monolithic `SchedulePageClient` repaint. Tracker **2f** note + Phase **3/4/5** guidance bullets; companion **§ Deferred** in implementation plan + matrix row for **2f**. |
| 2026-04-16 | **§ Deferred:** **Required two-slice workflow** for Phases **3–5** — structural → verify (review, gate, smoke, manual) → **token slice** → mark `done` or **token N/A**; replaces “optional” so agents do not skip token work silently. |
| 2026-04-17 | **Phase 6** added (**§ Phase 6**): `substeps/step34-preview/` path parity + **`components/allocation/` peel**; progress tracker row + **P6**; iteration diagram; token workflow wording **Phases 3–6**; reviewer note Phase 4/6 split. |
