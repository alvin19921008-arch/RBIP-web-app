# Schedule UI / lib separation refactor plan

> **Purpose**: Shrink the god-file `app/(dashboard)/schedule/page.tsx`, adopt **feature-based UI** under `features/schedule/`, keep **`lib/` = logic**, and separate **orchestration** from **rendering**.  
> **Audience**: Future agents and humans executing this work in slices.  
> **Rule**: Update the **Progress tracker** and phase checkboxes as work completes.

---

## Progress tracker (agents: keep this current)

| Phase | Name | Status | Owner / notes | Last verified (tests) |
|-------|------|--------|---------------|------------------------|
| 0 | Conventions locked | ⬜ Not started / 🟡 In progress / ✅ Done | | |
| 1 | Thin route + `SchedulePageClient` shell | ⬜ | | |
| 2a | Extract Dev Leave Sim bridge | ⬜ | | |
| 2b | Extract step indicator + navigation strip | ⬜ | | |
| 2c | Extract DnD + main board shell | ⬜ | | |
| 2d | Extract header / overlays / save strip | ⬜ | | |
| 3 | Split `useScheduleController` (facade) | ⬜ | Optional parallel track | |
| 4 | Legacy hook cleanup + `components/schedule` migration | ⬜ | | |

**Status emoji legend**: ⬜ not started · 🟡 in progress · ✅ done · ⏸️ blocked

**Line-count targets (rough)** — update after Phase 1+:

| File / area | Baseline (Apr 2026) | Target |
|-------------|---------------------|--------|
| `app/(dashboard)/schedule/page.tsx` | ~13.5k | &lt; 100 lines |
| Main schedule UI entry | N/A (inside page) | `features/schedule/ui/SchedulePageClient.tsx` &lt; ~800–1200 after slices; keep slicing until sections are small |
| `lib/.../useScheduleController.ts` | ~4.1k | Split internally in Phase 3; facade stays stable for UI |

---

## Principles (non-negotiable)

1. **`lib/` = logic**  
   TypeScript domain code: projections, bootstrap, dialog-flow helpers, save/snapshot, algorithms glue, workers, and **`lib/features/schedule/controller/`** (orchestration).  
   **Do not** add new schedule **UI** (`.tsx` screens) under `lib/features/schedule/`.

2. **`features/schedule/` = schedule UI**  
   React components, local UI state, composition of sections/dialogs.  
   Imports orchestration via **`useScheduleController`** (or thin wrappers), not by duplicating Supabase or allocation calls inside leaf components.

3. **`app/(dashboard)/schedule/` = routing shell only**  
   After Phase 1: `page.tsx` should mount the client feature entry and avoid owning thousands of lines of JSX.

4. **Behavior-first refactors**  
   Phases 1–2 are **move/extract** with **no intentional behavior change**. Favor mechanical moves, then small follow-ups if types need adjustment.

5. **Verification before marking done**  
   Run project regression/smoke tests the repo already uses for schedule (e.g. Playwright smoke, `tests/regression/*` as applicable). Record command + outcome in the tracker table or a short note under the phase.

---

## Directory layout (target)

```text
app/(dashboard)/schedule/
  page.tsx                    # thin: re-export or render SchedulePageClient

features/schedule/
  ui/
    SchedulePageClient.tsx    # main client composer (shrinks over Phase 2)
    sections/                 # step strip, board, side panels, etc.
    dialogs/                  # schedule-specific dialog composition (if not colocated)
    dev/                      # Dev Leave Sim wiring / bridge components (optional)
  index.ts                    # optional: public exports for the route only

lib/features/schedule/
  (existing .ts modules + controller/)
  controller/
    useScheduleController.ts  # Phase 3: may become facade over smaller modules

components/schedule/          # Phase 4: migrate into features/schedule/ui; then remove or re-export
components/ui/                # shared design system (unchanged role)
```

**Import convention (recommended)**:

- `app/*` imports from `@/features/schedule/ui/...` (or `@/features/schedule` barrel only).
- `features/schedule/ui/*` imports logic from `@/lib/features/schedule/...` and `@/lib/...` as needed.
- Avoid `features/*` importing `@/lib/algorithms/*` directly unless the team explicitly allows it for a isolated leaf; prefer **controller** or **pcaAllocationEngine** boundaries.

---

## Phase 0 — Conventions locked

**Tasks**

- [ ] Confirm path alias `@/*` remains repo root (no change required unless you adopt `src/`).
- [ ] Add this plan file path to team memory / `AGENTS.md` one line: “Schedule mega-page refactor: follow `docs/superpowers/plans/2026-04-11-schedule-ui-lib-separation-plan.md`.”

**Done when**

- Team agrees **Option B (strangler)**: new UI lives under `features/schedule/ui/`; `components/schedule` migrates gradually.

**Verify**

- N/A (process only).

---

## Phase 1 — Thin route + `SchedulePageClient` shell

**Goal**: Move the body of `page.tsx` into `features/schedule/ui/SchedulePageClient.tsx` (or `ScheduleScreen.tsx`). `page.tsx` only wires that component.

**Tasks**

- [ ] Create `features/schedule/ui/SchedulePageClient.tsx`.
- [ ] Move client component body from `page.tsx` with **minimal** edits (same hooks, same JSX tree).
- [ ] Replace `page.tsx` content with import + render of `SchedulePageClient`.
- [ ] Fix any import paths broken by the move.

**Done when**

- Build passes.
- Schedule route loads in dev.
- **Line count** of `page.tsx` is trivially small.

**Verify**

- Run smoke/regression tests used for schedule (document which in tracker).

**Agent notes**

- Prefer **no** logic changes in this PR; if TypeScript complains, fix types/imports only.

---

## Phase 2 — Vertical slices (order matters: leaves / self-contained first)

Each subphase should end with a **smaller** `SchedulePageClient` and **new files** under `features/schedule/ui/sections/` (or `dialogs/`, `dev/`).

### Phase 2a — Dev Leave Sim bridge

**Goal**: Isolate the large `DevLeaveSimPanel` callback block (e.g. `runStep2Auto`, `runStep3V2Auto`, related state) into a dedicated component or hook under `features/schedule/ui/dev/`.

**Tasks**

- [ ] Extract props/callback wiring into `LeaveSimScheduleBridge.tsx` or `useLeaveSimScheduleBridge(...)`.
- [ ] `SchedulePageClient` passes only the minimal props the bridge needs.

**Verify**: Developer role + Leave Sim flows still work; smoke if covered.

### Phase 2b — Step indicator + navigation strip

**Goal**: Extract `StepIndicator` subtree + `handleNextStep` / `handlePreviousStep` wiring into `features/schedule/ui/sections/ScheduleStepStrip.tsx` (name as you prefer).

**Verify**: Step navigation, gating, and “outdated step” hints unchanged.

### Phase 2c — DnD + main board shell

**Goal**: Extract `DndContext` + main grid / `ScheduleMainLayout` composition into `features/schedule/ui/sections/ScheduleBoard.tsx` (or split further if still huge).

**Verify**: Drag-and-drop and allocation editing behave the same.

### Phase 2d — Header / overlays / save strip

**Goal**: Extract `ScheduleHeaderBar`, `ScheduleOverlays`, save controls, and related portal/tooling into section component(s).

**Verify**: Save, date change, overlays, viewing mode unchanged.

---

## Phase 3 — Split `useScheduleController` (facade, parallel track)

**Goal**: Reduce the ~4k-line controller by **internal modules** without forcing the UI to import many hooks.

**Tasks**

- [ ] Identify seams: persistence, workflow/step status, step runners (2/3/4), undo/redo, staff overrides application.
- [ ] Extract to `lib/features/schedule/controller/*.ts` or `useSchedulePersistence.ts`, etc.
- [ ] Keep **`useScheduleController`** as the **single public hook** re-exporting the same API until intentionally versioned.

**Done when**

- No behavior change; tests pass; largest file is noticeably smaller or split into testable units.

**Verify**

- Regression tests + manual spot-check Step 2/3/4.

---

## Phase 4 — Legacy hook cleanup + `components/schedule` migration

**Goal**: Remove confusion and complete the **strangler** migration.

**Tasks**

- [ ] Grep for `useScheduleState` / `useStepwiseAllocation`; confirm unused or migrate callers; **delete dead code** if confirmed.
- [ ] Move remaining `components/schedule/*` into `features/schedule/ui/` (update imports).
- [ ] Remove empty re-exports; update any stale paths in docs.

**Verify**

- Full grep for old paths; CI green.

---

## Anti-patterns (do not do)

- Growing `page.tsx` again with new features — add **sections** under `features/schedule/ui/`.
- Putting JSX widgets under `lib/features/schedule/` — keep `lib` logic-only.
- Copy-pasting orchestration into UI “just for this dialog” — call **controller actions**.
- Skipping tests between slices — update tracker with evidence.

---

## References (starting points)

- `app/(dashboard)/schedule/page.tsx` — current god file.
- `lib/features/schedule/controller/useScheduleController.ts` — orchestration.
- `components/schedule/*` — existing schedule UI to migrate.
- `lib/features/schedule/*.ts` — logic modules (projections, step3 harness, etc.).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-11 | Initial plan authored for agent/human execution and progress tracking. |
