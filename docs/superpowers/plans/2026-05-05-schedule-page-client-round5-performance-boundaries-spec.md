# SchedulePageClient Round 5 Performance Boundaries Spec

**Status:** Draft for owner review  
**Last updated:** 2026-05-05  
**Scope:** Measured performance-boundary work after Round 4 maintainability debulking of `features/schedule/ui/SchedulePageClient.tsx`.

---

## 1. Context

Rounds 1-4 reduced `features/schedule/ui/SchedulePageClient.tsx` from roughly 13k lines to roughly 3.6k lines. Round 4 intentionally avoided runtime bundle-splitting changes and ended by recording Round 5 candidates.

Round 5 should now optimize loading boundaries, not continue broad maintainability-only extraction. The goal is to remove clearly unnecessary initial-route work while preserving schedule behavior and avoiding visible loading waterfalls for the primary grid.

The measured pre-plan baseline from 2026-05-05:

| Measurement | Result |
|-------------|--------|
| `npm run build` | Passed; `/schedule` is dynamic. Current Next/Turbopack output did not print first-load JS sizes. |
| `npm run analyze` | Passed; generated `.next/analyze/client.html`, `.next/analyze/nodejs.html`, `.next/analyze/edge.html`. |
| Production route timing | Blocked by auth: `next start` redirected to `/login`; local auto-login unavailable; Playwright login env vars unset. |
| Dev route timing on `localhost:3000` | DOM ready `2198ms`, shell ready `3773ms`, network idle `6351ms`, session grid-ready mark around `4825ms`. |
| Dev lazy surface first open | Calendar `291ms`, copy menu `208ms`, split reference `376ms`. |

---

## 2. Authoritative References

| Document | Role |
|----------|------|
| `docs/schedule-architecture-core.md` | Schedule UI tree, route shell, split-view constraints, refactor gate. |
| `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc` | Allocation, Step 3 projection, `staffOverrides`, DnD, split-reference invariants. |
| `.cursor/rules/lib-import-layering.mdc` | `lib/**` must not import `features/**`. |
| `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-spec.md` | Round 4 scope and Round 5 handoff seed. |
| `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-implementation-plan.md` | Completed R4-46 measurement/candidate notes. |

---

## 3. Goals

1. Remove unnecessary initial `/schedule` client work from features that are not needed for first useful schedule paint.
2. Keep the primary schedule grid, workflow step shell, DnD shell, and current-step allocation UI immediately usable.
3. Use measurements before and after each optimization so Round 5 can prove impact.
4. Preserve all allocation, Step 3 projection, `staffOverrides`, split-reference, and DnD behavior.
5. Leave behind repeatable measurement commands for future performance rounds.

---

## 4. Non-goals

- No further broad LOC debulking of `SchedulePageClient.tsx` for its own sake.
- No controller redesign.
- No merge of primary and split-reference controllers.
- No schedule-wide React context for optimization convenience.
- No movement of schedule React UI into `lib/**`.
- No `lib/**` imports from `features/**`.
- No rewrite of Step 3 projection or floating PCA engines.
- No broad dynamic import of the primary schedule grid path unless later measurements prove it is worth the user-visible loading risk.
- No new bundle analyzer dependency; the repo already has `@next/bundle-analyzer`.

---

## 5. Target Architecture

Round 5 keeps `SchedulePageClient` as the schedule orchestrator, but adjusts import boundaries for feature areas that do not need to execute during the first useful paint.

| Boundary | Direction |
|----------|-----------|
| Export/PNG tooling | Load `lib/utils/exportPng` only inside the export action, so `html-to-image` does not ride the initial schedule hook import path. |
| Dev harness runtime | Keep developer/admin tooling isolated behind runtime and dynamic boundaries. Do not duplicate Step 2/3 allocation logic. |
| Split reference | Keep as a measured later candidate. Preserve the two-controller model if any additional boundary is added. |
| Dialog/calendar/copy surfaces | Mostly defer because current first-open timings are acceptable and most components are already dynamic. |
| Grid/DnD/overlay core | Defer unless measurements show a major initial-load cost; these are close to primary interactivity. |

---

## 6. Prioritized Phases

### R5-50 — Measurement Baseline

**Objective:** Capture a reusable baseline before changing runtime imports.

**Required captures:**

- `npm run build`
- `npm run analyze`
- dynamic/lazy import inventory
- browser timing probe for schedule ready and first-open latency of calendar, copy menu, and split reference

**Exit:** Baseline numbers are recorded in the implementation plan notes before code changes.

### R5-51 — Export/PNG Lazy Utility Boundary

**Objective:** Move the `html-to-image` path out of initial schedule hook evaluation.

**Primary files:**

- `features/schedule/ui/hooks/useScheduleExportActions.tsx`
- `lib/utils/exportPng.ts` only if a type-only helper is needed; do not add imports from `features/**`.

**Expected code direction:**

- Remove the static import:

```ts
import { downloadBlobAsFile, renderElementToImageBlob } from '@/lib/utils/exportPng'
```

- Load the utility only inside `exportAllocationImage`:

```ts
const { downloadBlobAsFile, renderElementToImageBlob } = await import('@/lib/utils/exportPng')
```

**Behavior to preserve:**

- Export overlay opens before capture.
- The export root ref is reset before rendering.
- Two animation frames still pass before capture.
- Desktop PNG export downloads with the same filename pattern.
- Mobile JPEG preview still opens, revokes object URLs, and supports “Open in new tab” / “Download copy”.
- Toast progress and error messages remain equivalent.

**Exit:** Build/lint/smoke pass and analyzer no longer shows the export utility path in an initial schedule chunk, or the notes explain why the bundler still groups it.

### R5-52 — Export Interaction Verification

**Objective:** Prove the lazy import does not regress export behavior.

**Required checks:**

- Browser open `/schedule`.
- Click Export on desktop viewport and confirm a download is created.
- If mobile emulation is used, click Export → Save as image and confirm preview opens.
- Record first export click-to-download or click-to-preview latency.

**Exit:** Export behavior is preserved and first-click latency is acceptable.

### R5-53 — Dev Harness Boundary Review

**Objective:** Decide whether the outer dev bridge needs a stronger dynamic/runtime boundary.

**Primary files if implemented:**

- `features/schedule/ui/SchedulePageClient.tsx`
- `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx`

**Decision rule:**

- Implement only if analyzer or production-equivalent chunks show dev harness code in the normal `/schedule` initial route for non-developer users, or if dev chunks are loaded before the user opens the harness.
- Skip if the only observed dev harness loading is development-only HMR/prefetch behavior.

**Behavior to preserve:**

- Developer/admin access behavior.
- The dev harness calls production Step 2/3/4 helpers.
- No forked allocation semantics.
- No changed Step 3 projection path.

**Exit:** Either a small dynamic-boundary change is verified, or the phase is explicitly marked skipped with evidence.

### R5-54 — Deferred Candidate Register

**Objective:** Record what not to optimize yet.

**Defer by default:**

- Broad dynamic splitting of `ScheduleBlocks1To6`, `TherapistBlock`, `PCABlock`, `ScheduleDndContextShell`, and core DnD overlays.
- Step 3 dialog internals, unless first-open latency becomes a real issue.
- Split reference controller boundary, unless production-equivalent measurements show it affects normal first load.
- Calendar/copy wizard changes beyond existing prefetch behavior, unless first-open latency crosses an owner-approved threshold.

**Exit:** Future candidates have measured evidence or a clear reason to defer.

---

## 7. Verification Strategy

After each runtime-affecting phase:

```bash
npm run lint && npm run build && npm run test:smoke
```

Performance checks:

```bash
npm run analyze
```

Use browser probes to capture:

- route DOM ready
- schedule shell ready
- grid-ready session marks
- network idle
- first-open latency for lazy surfaces touched by the phase

Manual checks should match touched areas:

- R5-51/R5-52: desktop export download, mobile save-image preview, toast progress, object URL cleanup path.
- R5-53: dev harness open/run/close under developer/admin access; production user route does not load harness-only UI.

---

## 8. Expected Outcome

Round 5 should produce a small number of measured performance boundary changes, starting with the export/PNG utility boundary. The ideal result is not another large LOC reduction; it is a clearer initial-route bundle boundary with proof that the primary schedule workflow still loads and behaves correctly.

---

## Document History

| Date | Change |
|------|--------|
| 2026-05-05 | Initial Round 5 performance-boundaries spec drafted from R4-46 handoff and 2026-05-05 measurements. |
