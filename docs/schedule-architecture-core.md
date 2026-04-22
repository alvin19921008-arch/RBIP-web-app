# Schedule architecture — core (for agents)

Stable **where things go** summary. Allocation workflow, Step 3 projection, and **gotchas** live in **`.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`** (globs: schedule + `lib/algorithms`); **`@`-mention** it on long threads. **`lib/**` must not import `features/**`** — see **`.cursor/rules/lib-import-layering.mdc`** on any `lib/` edit.

## UI vs logic (tree to implement)

| Layer | Path | Role |
|--------|------|------|
| Route | `app/(dashboard)/schedule/` | Thin shell: mounts client only; no business logic. |
| Schedule React UI | `features/schedule/ui/` | `SchedulePageClient`, `sections/` (macro step strip / next-prev), `steps/` (wizards), `allocation/` (peeled dialogs), `overlays/`, `panes/`, `dev/`. |
| **Sections** | `features/schedule/ui/sections/` | Global workflow chrome **only** — not Step 2 grid body, not Step 3.1–3.4 wizard panels. |
| **Steps** | `features/schedule/ui/steps/` | In-step product UI (e.g. `step3-floating/` + `substeps/`). |
| Domain + orchestration | `lib/features/schedule/` | **`.ts` only**; no new schedule screen **`.tsx`**. Controller: `lib/features/schedule/controller/`. |
| Adapter | `lib/features/schedule/pcaAllocationEngine.ts` | Build context → call algorithms / worker. |
| Pure math | `lib/algorithms/` | Allocation algorithms; **no React**. |

## `steps/` folder naming (mandatory)

- Directory names: **lowercase kebab-case** only (no PascalCase folders, no `.` in folder names).
- Macro steps: `step1-leave/`, `step2-fixed-allocation/`, `step3-floating/`, `step4-bed/`, `step5-review/`.
- Substeps (product 3.x): under `substeps/` as `step31-teams-order/`, `step32-preferred/`, `step33-adjacent/`, `step34-preview/` (two digits = major+minor, then kebab slug).
- **`.tsx` files** inside may stay PascalCase.

## Imports

- **UI → `lib` / types:** allowed. **`lib/**` → `features/**`:** forbidden (see `lib-import-layering.mdc`).

## Heavier / living docs

- **Tailwind `@source`**, tokens, peel inventory, Phase notes:** [`features/schedule/ui/README.md`](../features/schedule/ui/README.md)
- **Step 3 floating vs non-floating (glossary):** [`glossary/step3-floating-nonfloating.md`](glossary/step3-floating-nonfloating.md)
- **Schedule page decomposition (phased checklist, gates, tracker):** [`superpowers/plans/2026-04-22-schedule-page-client-decomposition-implementation-plan.md`](superpowers/plans/2026-04-22-schedule-page-client-decomposition-implementation-plan.md) (spec: [`2026-04-22-schedule-page-client-decomposition-spec.md`](superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md)).

Other long-form plans under `docs/superpowers/plans/` are **optional** for day-to-day layout — use **this file** + **`ARCHITECTURE_ESSENTIALS.mdc`** first.
