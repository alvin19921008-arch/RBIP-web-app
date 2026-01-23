---
name: dev-leave-sim-harness
overview: Add a developer-only simulation/test harness on the Schedule page header to generate reproducible planned/sick/urgent leave scenarios (including PCA half-day slot availability), apply them safely via existing step-reset logic, auto-run Steps 1–4, validate invariants, and export/import a replayable debug bundle.
todos:
  - id: dev-ui-entrypoint
    content: Add developer-only harness entrypoint in Schedule header rightActions and wire it to schedule controller state/actions.
    status: pending
  - id: seeded-generator
    content: Implement deterministic RNG + leave scenario generator with mutually exclusive selection, quotas, rank weighting modes, and special-program targeting modes.
    status: pending
  - id: pca-halfday-slots
    content: Ensure PCA 0.5 leave generation sets `availableSlots` (AM/PM selectable) consistent with `fteRemaining` semantics used by algorithms.
    status: pending
  - id: apply-reset-modes
    content: Implement Apply(clean), Apply(merge), Reset(generated-only), Reset(all) using controller `clearDomainFromStep` pathways and stored originals.
    status: pending
  - id: run-steps-controls
    content: Add auto-run Steps 1–4 plus manual per-step run controls; optionally clear/reuse tie-break decisions for deterministic replay.
    status: pending
  - id: invariant-runner
    content: Add invariant/property check runner and surface failures in the harness UI.
    status: pending
  - id: debug-bundle
    content: Implement debug bundle export/import (clipboard + download; paste import with validation) for fast scenario replay.
    status: pending
  - id: tooltips
    content: Add tooltips for all toggles/inputs explaining what they affect and common pitfalls (esp. PCA half-day availableSlots).
    status: completed
isProject: false
---

# Developer leave simulation harness plan

## Goals

- Provide a **developer-only** UI in the **Schedule page header** to generate realistic leave scenarios across ranks.
- Ensure **reproducibility** via **seeded deterministic RNG** and always-visible seed logging.
- Ensure leave categories are **mutually exclusive per staff**.
- Ensure **PCA half-day (0.5) leave** also sets **`availableSlots`** so Step 2+ correctly treats the PCA as still available for assignment.
- Support both:
- **Apply on clean base** (uses the same production step reset/clear logic)
- **Reset generated-only** (remove/rollback just the harness-injected overrides)
- Default to **auto-run Steps 1–4**, but allow **manual per-step runs**.
- Add **invariant/property checks** and surface failures.
- Add **debug bundle export/import** for quick replay.

## Where it hooks in

- **Header integration point**: `rightActions` slot in [`/Users/alvin/Desktop/RBIP web app/components/schedule/ScheduleHeaderBar.tsx`](/Users/alvin/Desktop/RBIP web app/components/schedule/ScheduleHeaderBar.tsx)(/Users/alvin/Desktop/RBIP web app/components/schedule/ScheduleHeaderBar.tsx)().
- This is already where copy/save/etc. render.
- **Use real reset logic**: `clearDomainFromStep()` and `resetStep3ForReentry()` in [`/Users/alvin/Desktop/RBIP web app/lib/features/schedule/controller/useScheduleController.ts`](/Users/alvin/Desktop/RBIP web app/lib/features/schedule/controller/useScheduleController.ts)(/Users/alvin/Desktop/RBIP web app/lib/features/schedule/controller/useScheduleController.ts)().
- **Half-day PCA availability model**: match the semantics used by `StaffEditDialog` where `availableSlots` must align with `fteRemaining` (rounded) (see [`/Users/alvin/Desktop/RBIP web app/components/allocation/StaffEditDialog.tsx`](/Users/alvin/Desktop/RBIP web app/components/allocation/StaffEditDialog.tsx)(/Users/alvin/Desktop/RBIP web app/components/allocation/StaffEditDialog.tsx)()).

## Data model for the harness (kept OUT of `staffOverrides`)

Create a harness-only state object (in-memory + localStorage) keyed by date:

- `seed` (number/string), RNG config
- quotas: planned (therapist-except-SPT, PCA as FTE budget 1.5), sick count N, urgent count Y
- selection policy:
- rank weights mode: `pool_proportional` | `custom`
- special-program targeting: `only_special_program` | `exclude_special_program` | `weighted_random` | `pure_random`
- leave-type distribution knobs (editable)
- half-day slot distribution (AM vs PM) (editable)
- `draftPatchByStaffId`: the editable proposed patch
- `appliedSnapshot`: originals for touched staff (to enable reset-generated-only)
- `runReport`: invariant results + step summaries

This avoids persisting `__devSim` into DB via `staff_overrides`.

## Core generator logic

- Build candidate pools from current schedule state (`staff`, `specialPrograms`, weekday context).
- Enforce **mutual exclusivity** by tracking a `selectedStaffIds` set.
- Planned leave quotas:
- Therapist (APPT+RPT, exclude SPT): max **3 full-day** planned leaves.
- PCA planned leave budget: **1.5 FTE** with chunks {1.0, 0.5}.
- Sick leave:
- configurable **N = 0..6**, mixed ranks.
- Urgent leave:
- configurable **Y = 0..2**, mixed ranks; includes `medical follow-up`.
- Special-program targeting:
- implement modes plus weighted mixing.
- Leave type assignment:
- choose from existing `LeaveType` options (`types/staff.ts`).
- half-day types produce `fteRemaining = 0.5`.
- **PCA half-day correctness**:
- when `fteRemaining = 0.5`, set `availableSlots` to exactly two slots.
- choose AM vs PM based on harness knob:
- AM => `[1,2]`
- PM => `[3,4]`
- keep `fteRemaining` aligned with slot-FTE (2 * 0.25) to satisfy the same constraint enforced by `StaffEditDialog`.

## UI/UX (developer-only)

Add a compact popover/panel in the header with:

- Inputs (all with tooltips):
- seed (editable), “regenerate” button
- planned leave quotas (therapist, PCA budget)
- sick N, urgent Y
- rank weights mode + per-rank sliders when custom
- leave-type distribution knobs
- special-program targeting mode
- half-day slot mode weighting (AM/PM)
- Actions:
- **Generate** (creates draft patch)
- **Apply (clean base)**: calls controller `clearDomainFromStep('leave-fte')`, then applies patch
- **Apply (merge into current)**: merges patch into existing `staffOverrides`
- **Reset generated-only**: restores originals for touched staff
- **Reset all**: `clearDomainFromStep('leave-fte')`
- **Run Steps 1–4** (default) + per-step run buttons
- **Export debug bundle** / **Import debug bundle**
- A clear status badge while active (e.g. “DEV SIM ACTIVE”) to reduce accidental persistence.

## Running steps

- After Apply, default path:
- rely on existing Step 1 recalculation mechanisms that are triggered by `staffOverrides` change.
- then call controller actions in order:
- `runStep2TherapistAndNonFloatingPCA`
- `runStep3FloatingPCA`
- `runStep4BedRelieving`
- Provide manual controls to run each step independently.
- Add a toggle to clear/ignore `tieBreakDecisions` for deterministic replay when desired.

## Invariant/property checks

Implement a small invariant runner that reads current domain state and validates:

- no over-allocation beyond capacity
- no duplicate PCA slot across teams
- pending FTE monotonicity rules (where applicable)
- `average_pca_per_team` unchanged after Step 1
- DB-safe conversions readiness (UUID arrays, leave enum mapping, normalized FTE) as a “pre-save warning” check
- PCA half-day consistency: `roundToNearestQuarter(fteRemaining) == 0.25*availableSlots.length` for staff touched by harness

Show failures in the panel with a short summary and a “copy failure bundle” action.

## Debug bundle export/import

Provide JSON export including:

- date, seed, config knobs
- base mode used (clean vs merge)
- `draftPatchByStaffId`
- `appliedSnapshot` (optional)
- invariant report + step summaries
- optional: whether tie-break decisions were cleared

Export targets:

- copy to clipboard
- download `.json`

Import:

- paste JSON, validate schema, load into draft, allow review, then Apply.

## Minimal files likely touched

- [`/Users/alvin/Desktop/RBIP web app/app/(dashboard)/schedule/page.tsx`](/Users/alvin/Desktop/RBIP web app/app/\(dashboard\)/schedule/page.tsx)(/Users/alvin/Desktop/RBIP web app/app/\(dashboard\)/schedule/page.tsx)(): render header button + wire schedule controller state/actions into the harness component.
- [`/Users/alvin/Desktop/RBIP web app/components/schedule/ScheduleHeaderBar.tsx`](/Users/alvin/Desktop/RBIP web app/components/schedule/ScheduleHeaderBar.tsx)(/Users/alvin/Desktop/RBIP web app/components/schedule/ScheduleHeaderBar.tsx)(): no structural changes expected beyond passing/rendering the new rightActions content.
- New developer-only components/modules (suggested locations):
- `components/schedule/DevLeaveSimPanel.tsx`
- `lib/dev/leaveSim/*` (rng, generator, invariants, bundle schema)

## Test plan (dev)

- Generate with fixed seed, export bundle, clear, import, re-run: confirm identical results.
- Verify PCA half-day leaves correctly restrict availability to 2 slots and Step 2/3 still allocate them into allowed slots.
- Run 100–1000 seeded simulations (batch mode later) and ensure invariant failures produce replayable bundles.