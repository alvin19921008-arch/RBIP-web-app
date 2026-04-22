# Agent notes

- **Import layering on any `lib/**` edit:** Cursor should attach `.cursor/rules/lib-import-layering.mdc` under `lib/**/*.ts(x)` — **`lib/**` must not import `features/**`**. Keeps the ban visible even when `ARCHITECTURE_ESSENTIALS` is not in context (e.g. `lib/utils`, `lib/db`).
- **Schedule / allocation / Step 1–5 / Step 3 projection / algorithms:** `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc` applies under `lib/features/schedule/`, `lib/algorithms/`, `features/schedule/`, `components/allocation/`, and `app/(dashboard)/schedule/`. **`@`-mention** it (and `lib-import-layering.mdc` if needed) on long threads so rules are not dropped.
- **Schedule UI vs logic (paths, composition):** [`docs/schedule-architecture-core.md`](docs/schedule-architecture-core.md). Invariants (Step 1–5, Step 3, algorithms): [`.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`](.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc).
- **Path alias:** `@/*` → repository root (`tsconfig.json` `compilerOptions.paths`).
