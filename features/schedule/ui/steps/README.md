# Schedule step UI (`features/schedule/ui/steps/`)

React UI for in-step and wizard bodies (macro steps and product substeps). Route shells stay in `app/(dashboard)/schedule/`; orchestration and domain logic stay under `lib/features/schedule/` (or other `lib/` modules). This folder is **presentation and wiring** only.

## Directory naming (mandatory)

- Use **lowercase kebab-case** for every directory under `steps/` (no PascalCase folder names, no `.` in folder names).

## Substep layout

Substep UI lives under a macro step slug, then `substeps/`, then a two-digit major+minor prefix plus kebab slug:

`steps/<step-slug>/substeps/<stepNN-kebab-slug>/`

Example: `steps/step3-floating/substeps/step30-entry-flow/`.

## Imports

Prefer **direct imports** to real files under `steps/` so search and go-to-definition resolve cleanly. Avoid new barrel files unless the project already uses that pattern for the same surface.

## References

- Phase **2e** and broader schedule UI plan: [docs/superpowers/plans/2026-04-11-schedule-ui-lib-separation-plan.md](../../../../docs/superpowers/plans/2026-04-11-schedule-ui-lib-separation-plan.md)
- Schedule UI vs lib map and gotchas: [.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc](../../../../.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc)
