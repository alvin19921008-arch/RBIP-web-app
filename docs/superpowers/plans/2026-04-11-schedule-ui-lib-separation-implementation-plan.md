# Schedule UI / lib separation — implementation & verification plan

> **Companion to**: [`2026-04-11-schedule-ui-lib-separation-plan.md`](./2026-04-11-schedule-ui-lib-separation-plan.md) (architecture, hybrid layout, optimal tree).  
> **Purpose**: Define **how** to execute each phase, **what** to run to prove behavior is preserved, and **objective exit criteria** so agents can mark phases `done` without guesswork.

**Solo / pre-launch**: There is no PR queue. Treat **each coherent commit** (or end-of-session slice) like a “merge candidate”: run the gate, update the architecture plan **Last verified** column, and do **manual** passes where listed.

---

## How to use this document (agents)

1. Before starting a phase: set that row to `in_progress` in the **architecture plan** progress tracker.  
2. After each **meaningful commit** that touches schedule: run **§ Mandatory gate** + the **phase-specific** tests below; paste commands + outcome into the tracker **Last verified** (or your journal).  
3. Mark phase `done` only when **all** exit criteria for that phase are satisfied.  
4. For **Phases 3–5**, follow **§ Deferred → Required two-slice workflow**: land **structural** work first → **review + gate + smoke + manual** → then **token-alignment** commit(s) on touched UI → re-run gate — or log **token N/A (no UI diff)** explicitly; do not skip token silently.

---

## Mandatory gate (every phase / every schedule-touching commit)

Run from repo root (`rbip-duty-list`):

| Step | Command | Pass criterion |
|------|---------|------------------|
| 1 | `npm run lint` | Exit 0 |
| 2 | `npm run build` | Exit 0 |
| 3 | `npm run test:smoke` | Exit 0 (Playwright `@smoke`; starts dev server per `playwright.config.ts` unless `PW_NO_WEBSERVER=1`) |

**Reference**: `.cursor/skills/playwright-smoke/SKILL.md` — same three-step gate (lint → build → smoke).

**Optional (local speed)**: If dev server already running on default URL, you may set `PW_NO_WEBSERVER=1` when consistent with your workflow; note in **Last verified** or commit body if that affects reproducibility.

---

## Smoke gate — flakes and unrelated failures (solo)

- **Expected**: `npm run test:smoke` is **green** before marking a phase `done` when your slice touched schedule flows covered by smoke.  
- **If red on an unrelated spec** (e.g. Step 1 leave while you only moved Step 3 UI): **retry once** with a clean dev server / no stale `PW_NO_WEBSERVER`. If still red, **do not silently ignore**: either fix the flake in a small follow-up commit, **or** log the failure + spec name in **Last verified** and run an **extra manual** pass on the flow that spec covers — then only mark `done` if you accept that tradeoff for pre-launch solo work.  
- **If red on a flow you changed**: fix before `done` (regression or intentional contract change + test update in the same slice).

---

## Regression tests (`tests/regression/*.test.ts`)

These files are **standalone Node** scripts: `import` + `async function main()` + `main().catch(...)`. They are **not** wired in `package.json` today.

**Runner (verified)**:

```bash
npx tsx tests/regression/<file>.test.ts
```

**Run a curated list** (bash):

```bash
for f in \
  tests/regression/f47-page-step3-runtime-uses-shared-builders.test.ts \
  tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts \
  tests/regression/f63-step34-ranked-slot-decision-ladder.test.ts \
  tests/regression/f64-step34-tracker-reasons.test.ts
do
  echo "==> $f"
  npx tsx "$f" || exit 1
done
```

**Full regression suite** (slower; run before a **milestone** you care about — e.g. large controller split, or periodic hygiene):

```bash
find tests/regression -name '*.test.ts' -print0 | while IFS= read -r -d '' f; do
  echo "==> $f"
  npx tsx "$f" || exit 1
done
```

**Note**: Consider adding `npm run test:regression` / `test:regression:schedule` scripts in a small follow-up commit to avoid documenting `npx tsx` only here.

---

## Playwright smoke scope (`tests/smoke/*.smoke.spec.ts`)

`playwright.config.ts` sets `testDir: './tests/smoke'`. Schedule-adjacent smokes include:

| Spec | Relevance to this refactor |
|------|----------------------------|
| `schedule-core.smoke.spec.ts` | Core schedule workflow |
| `schedule-phase3-1-dnd-metrics.smoke.spec.ts` | Step 3 DnD / metrics |
| `schedule-phase3-4-algo-metrics.smoke.spec.ts` | Phase 3–4 algo / Leave Sim paths |
| `step2-downstream-impact.smoke.spec.ts` | Step 2 → downstream gating |
| `dashboard-staff-edit-special-program-overlay.smoke.spec.ts` | Staff / SP overlay (shared infra) |

`npm run test:smoke` runs tests tagged `@smoke` only — ensure touched flows remain covered by smoke or add targeted regression above.

### Step 3 Playwright path: **V2 ranked** (smoke default)

Step 3 opens **`FloatingPCAEntryDialog`** first (canonical: `features/schedule/ui/steps/step3-floating/substeps/step30-entry-flow/FloatingPCAEntryDialog.tsx`; `components/allocation/FloatingPCAEntryDialog.tsx` remains a **client re-export** shim): users choose **“V1 legacy”** or **“V2 ranked”**. Ranked-slot **V2** is the long-term primary engine, so smokes that open the Step 3 wizard after **Initialize / Re-run** should:

1. Call **`chooseFloatingPcaV2RankedFromEntryDialog(page)`** — `tests/smoke/helpers/floatingPcaStep3V2.ts`
2. Assert V2 config chrome, e.g. **`expectFloatingPcaV2ConfigDialogFromStep31(page)`** — footer uses **“Continue to 3.2 Preferred”** (etc.), which **differs** from V1’s **“Continue to 3.2”** (no `Preferred`).

**Implemented**: `tests/smoke/schedule-phase3-4-algo-metrics.smoke.spec.ts` — “saved step 3 can re-open…” now selects V2 and asserts V2 step 3.1 footer.

**Not in scope here**: Rewriting the entire **`tests/regression`** suite to V2 (large effort). Curated regression (`f66`, `f63`, …) already exercises V2 contracts where needed; `allocatePCA` floating-phase tests remain valid until production removes that path.

---

## Phase → verification matrix (minimum bar)

| Phase | Mandatory gate | Plus (phase-specific) | When to run “full” regression |
|-------|----------------|------------------------|-------------------------------|
| **0** | Optional `npm run lint` | N/A | No |
| **1** | Yes | Curated regression **+** `f47` (page step3 runtime builders) | When `pageStep3Runtime` / schedule page import graph moves materially |
| **2a** | Yes | Smokes touching **Leave Sim** / dev (`schedule-phase3-4-algo-metrics` if applicable) | If bridge changes step runners |
| **2b** | Yes | `schedule-core` / step nav assumptions | Full regression optional |
| **2c** | Yes | **`schedule-phase3-1-dnd-metrics`** + DnD-related regression if any | Full regression if DnD types change |
| **2d** | Yes | `schedule-core`, save/header flows | Full regression optional |
| **2e** | Yes | `f66` (step3 harness) + `f47` if step3 paths touched | Full regression if new step folder imports shuffle module graph |
| **2f** | Yes | Visual spot-check Step 3.2 / 3.3; confirm **no** missing Tailwind classes after `@source` | No full regression unless CSS class names tied to logic; **broad** token sweep on `SchedulePageClient` **deferred** — see **§ Deferred: UI color / design tokens** |
| **3** | Yes | **Full regression** recommended (controller touches allocation/save) + **token slice** after verify (see **§ Deferred**) | **Yes** before marking Phase 3 `done` |
| **4** | Yes | Full regression + grep for removed hooks + **allocation** UI inventory + **token slice** after each migration verify | **Yes** before Phase 4 `done` |
| **5** | Yes | Full regression + extended smoke if new wizard surfaces + **token slice** after each substep verify | **Yes** before Phase 5 `done` |

---

## Exit criteria by phase (definition of done)

### Phase 0 — Conventions + tooling gates

- [x] `@/*` → repo root documented (`tsconfig.json` + **`AGENTS.md`**).
- [x] **`AGENTS.md`** links the schedule refactor plans + **`.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`** (schedule **§B-style** grep map, naming, barrels, `lib`↔`features` rule).
- [x] Agents know: UI → `features/schedule/`, logic → `lib/features/schedule/` — duplicated at top of **`ARCHITECTURE_ESSENTIALS.mdc`** (“Schedule UI / lib layout”).

**Done when**: Checklist above complete; no production code required.

---

### Phase 1 — Thin route + `SchedulePageClient` shell

**Technical**

- [x] `app/(dashboard)/schedule/page.tsx` is **only** route shell (mount + optional providers); **target** ≪ 100 lines.
- [x] `features/schedule/ui/SchedulePageClient.tsx` exists and contains moved client tree.
- [x] `app/globals.css` includes `@source "../features/**/*.{ts,tsx}"` so Tailwind scans new files.

**Verification**

- [x] Mandatory gate passes.
- [x] `npx tsx tests/regression/f47-page-step3-runtime-uses-shared-builders.test.ts` passes (schedule page **wiring** / step3 runtime builders).
- [x] Manual: open `/schedule` — **covered by** `schedule-core` smoke (shell + leave flow); spot-check in browser if you change auth/env.

**Done when**: All boxes checked; tracker “Last verified” lists commands + pass.

---

### Phase 2a — Dev Leave Sim bridge

**Technical**

- [x] **Bridge** under `features/schedule/ui/dev/` (`ScheduleDevLeaveSimBridge` + dynamic `DevLeaveSimPanel`); `DevLeaveSimPanelProps` exported from `components/schedule/DevLeaveSimPanel.tsx`. Harness **callbacks** remain composed in `SchedulePageClient` (same as pre-slice); further extraction is optional follow-up.

**Verification**

- [x] Mandatory gate passes.
- [x] `schedule-phase3-4-algo-metrics` smoke paths green when run; user confirmed manual Leave Sim earlier in session.

**Done when**: No regression in dev-only flows; smoke green.

---

### Phase 2b — Step indicator + navigation strip

**Technical**

- [x] Extract **workflow shell** only: **`ScheduleWorkflowStepShell`** wraps collapsible chrome + **`StepIndicator`** (Next/Previous + step pills + legend). Path: **`features/schedule/ui/sections/`** (not `ui/steps/`).
- [x] **`StepIndicatorProps`** exported from `components/allocation/StepIndicator.tsx` for the shell typing contract.

**Verification**

- [x] Mandatory gate passes.
- [x] Smoke: `schedule-core` (shell, legend, leave flow, step 2 when enabled); `f47` regression for page wiring.

**Done when**: Manual checklist + smoke green; no step-indicator code under `ui/steps/`.

---

### Phase 2c — DnD + main board shell

**Technical**

- [x] DnD + main layout composition extracted; props/callbacks explicit.

**Verification**

- [x] Mandatory gate passes.
- [x] Playwright: `schedule-phase3-1-dnd-metrics` scenarios still pass as part of `npm run test:smoke` if tagged `@smoke`, **or** run file directly:  
  `npx playwright test tests/smoke/schedule-phase3-1-dnd-metrics.smoke.spec.ts`  
  (uses same `playwright.config.ts` / webServer rules).

**Done when**: DnD smoke path green + manual spot-check drag one allocation.

---

### Phase 2d — Header / overlays / save strip

**Technical**

- [x] Header right cluster + save controls + split main-pane header strip extracted (`SchedulePageHeaderRightActions`, `SchedulePageSplitMainPaneHeader`). `ScheduleOverlays` / `ScheduleDialogsLayer` remain single call sites in `SchedulePageClient` (optional later thin shell).

**Verification**

- [x] Mandatory gate passes.
- [x] Manual spot-check deferred to user: save / date / viewing / overlays; automated: `npm run lint`, `npm run build`, `npm run test:smoke`, `npx tsx tests/regression/f47-page-step3-runtime-uses-shared-builders.test.ts`.

**Done when**: Manual checklist + smoke green.

---

### Phase 2e — Step / substep UI scaffold + pilot

**Technical**

- [x] `features/schedule/ui/steps/` exists with README (mandatory **lowercase kebab-case** dirs + `substeps/stepNN-slug/`; logic in `lib/`; **barrels**: prefer direct imports) + one **pilot** migration.
- [x] Pilot route renders; no duplicate mount of providers.

**Verification**

- [x] Mandatory gate passes.
- [x] `npx tsx tests/regression/f66-step3-v2-harness-uses-ranked-slot-engine.test.ts` passes (harness unchanged).
- [x] `f47` passes if step3 import graph touched.

**Done when**: Pilot works + curated regression green.

---

### Phase 2f — Design tokens + Tailwind

**Technical**

- [x] New UI uses `styles/rbip-design-tokens.css` / documented utilities per `.cursor/rules/design-elements-commonality.mdc` (semantic popover surfaces in migrated header actions; see `features/schedule/ui/README.md`).
- [x] `@source` includes `features/` (if not already from Phase 1).

**Verification**

- [x] Mandatory gate passes.
- [x] Manual visual: Step 3.2 / 3.3 surfaces **unchanged** this slice (only header dev tooltips restyled); smoke + f66 + f47 green.

**Done when**: No missing-class regressions; spot-check documented.

---

### Deferred: UI color / design tokens on `SchedulePageClient` (post-2f policy)

**Context:** Phase **2f** intentionally aligned **extracted** surfaces first (e.g. `sections/SchedulePageHeaderRightActions`) plus `features/schedule/ui/README.md` and `@source` for `features/`. It did **not** sweep every `slate-*` / literal in **`SchedulePageClient.tsx`** (~12k lines) — that would be a huge, hard-to-review diff with weak structural payoff while the file remains a god object.

**Product note:** Schedule UX is **light-first**; there is **no** product requirement to optimize token passes for **dark mode** unless that changes later. Semantic classes (`border-border`, `text-muted-foreground`, `bg-popover`, …) are still useful for **consistency** and shadcn alignment in light UI.

---

#### Required two-slice workflow (Phases **3**, **4**, **5** — do not skip token slice)

Future agents should treat **token / `design-elements-commonality` alignment** as part of the phase, **after** structural work is proven — not as “optional” fluff that can be dropped.

| Step | What | Gate |
|------|------|------|
| **1 — Structural** | Main phase work (e.g. controller split, hook migration, step UI move). | Code review on the structural diff. |
| **2 — Verify structural** | **Mandatory gate** + phase-specific regression/smoke + **manual** pass on touched flows. | All green / accepted before step 3. |
| **3 — Token slice** | Align literals in **`features/schedule/ui/**` and any `SchedulePageClient` regions touched in step 1** with semantic tokens / `.rbip-*` per `styles/rbip-design-tokens.css` + `design-elements-commonality.mdc`. Prefer **separate commit(s)** so review stays small (“style only” after behavior is frozen). | Re-run **mandatory gate** (and phase matrix extras) after token commits. |
| **4 — Mark phase `done`** | Tracker + exit criteria | Only after **steps 1–3** complete for that phase slice. |

**If step 1 touched no schedule UI** (pure `lib/` controller move with zero JSX churn): step 3 is **N/A** — document **“token slice N/A — no UI diff”** in tracker or commit message so the skip is explicit, not silent.

**Still avoid:** A monolithic PR whose **only** goal is recoloring all of `SchedulePageClient` with no extraction — high regression risk. Token work stays **scoped to what the phase changed** until the god file is mostly gone.

---

#### Extraction-first (same idea, smaller phases)

When a subtree moves **out** of `SchedulePageClient` in **any** phase (2x or 3–5), you may still **combine** structural move + token in one slice **if** the diff stays reviewable; otherwise use the **two-slice** table above for that extraction.

---

### Phase 3 — Split `useScheduleController` (facade)

**Technical**

- [ ] New modules under `lib/features/schedule/controller/` (or adjacent); **public** `useScheduleController` API unchanged unless versioned in the **same commit/slice**.

**Token slice (after structural verify)** — see **§ Deferred → Required two-slice workflow**: after structural work + review + gate + smoke + manual are green, complete token alignment for **schedule UI files touched** in that slice (or record **token slice N/A — no UI diff**). Re-run mandatory gate after token commit(s).

**Verification**

- [ ] Mandatory gate passes (after **structural** slice and again after **token** slice when applicable).
- [ ] **Full** regression suite (`find … npx tsx` loop) passes.
- [ ] Manual: Step 2 run, Step 3 run, Step 4 bed relieving, save/load smoke path.

**Done when**: Full regression + mandatory gate + manual triad complete **and** token follow-up satisfied per **§ Deferred** (or explicit N/A logged).

---

### Phase 4 — Legacy hooks + `components/schedule` migration

**Technical**

- [ ] Dead hooks removed or wired; imports updated.
- [ ] `components/schedule` empty or thin re-exports only.
- [ ] **`components/allocation/`** — per architecture plan: inventory schedule-only surfaces; migrate or track in a checklist so Phase 4 is not “done” with allocation UI still orphaned outside `features/schedule/ui/`.

**Token slice (after structural verify)** — **§ Deferred → Required two-slice workflow**: for each **migration slice**, after review + gate + smoke + manual on **that** slice, run token alignment on **moved or edited** `features/schedule/ui/**` (and any `SchedulePageClient` hunks touched). Small migration + token can be one commit **only if** the combined diff stays easy to review; otherwise **two commits** (move → token). Re-run gate after token work.

**Verification**

- [ ] Mandatory gate passes after structural slices and after token slices as applicable.
- [ ] Full regression suite passes.
- [ ] `grep -R "@/components/schedule" --include='*.tsx' --include='*.ts'` returns no stale paths (or only allowed shims).

**Done when**: Grep clean + full regression + gate + allocation inventory addressed **and** token follow-up per **§ Deferred** completed for migrated UI (or N/A logged per slice).

---

### Phase 5 — Deep step parity (optional)

**Technical**

- [ ] Remaining wizard UI lives under `features/schedule/ui/steps/**` per architecture **§B**.

**Token slice (after structural verify)** — **§ Deferred → Required two-slice workflow**: for each substep migration, after review + gate + smoke + manual on **that** step’s behavior, apply **step-scoped** tokens (`rbip-step32-*`, `rbip-step33-*`, `rbip-step34-*`, `lib/design/rbipDesignTokens.ts`, `design-elements-commonality.mdc`) in a follow-up commit if not already done in the move. For **leftover** literals in `SchedulePageClient` **only after** the relevant wizard JSX has moved — token pass scoped to **removed / shrunk** regions, not whole-file repaint in one go.

**Verification**

- [ ] Mandatory gate + full regression + extended manual wizard walkthrough (Steps 1–5), **after structural and after token** slices as applicable.

**Done when**: Your acceptance on wizard parity (solo); tests green **and** token follow-up per **§ Deferred** satisfied for UI moved in Phase 5 (or N/A logged per slice).

---

## Behavior preservation policy

- **Default**: Refactor **commits** produce **no intentional behavior change**. Any bugfix discovered during refactor should be a **separate commit** with a clear message.  
- **If a test fails**: fix the regression (preferred) **or** document an intentional contract change + update tests in the **same slice** so the next you is not surprised.  
- **Flakes**: follow **§ Smoke gate — flakes** above; do not mark `done` on a known-red unrelated smoke without a logged decision.

### Layering (hard rule)

- **`lib/**` must not import `features/**`**. UI imports lib; not the reverse. If you need a symbol from UI in lib, the seam is wrong — move shared types/helpers to `lib/` or pass data via props.
- **Barrels:** optional thin `features/schedule/index.ts` for the top client entry only; prefer **direct imports** under `ui/steps/` and `ui/sections/` (same as architecture plan).

---

## Progress linkage

Update the **architecture plan** tracker table after each phase:

- File: `docs/superpowers/plans/2026-04-11-schedule-ui-lib-separation-plan.md`  
- Columns: Status, Owner/notes, **Last verified (tests)** — paste e.g. `lint+build+smoke OK 2026-04-20; f47+f66 tsx OK`.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-16 | Initial implementation plan: mandatory gate, `npx tsx` regression runner, smoke list, phase matrix, per-phase exit criteria, behavior policy. |
| 2026-04-16 | Document **V2-first Step 3 smoke**; add `tests/smoke/helpers/floatingPcaStep3V2.ts`; update `schedule-phase3-4-algo-metrics` reload test to choose V2 + assert V2 footer. **Also:** Phase 0 exit criteria — **`AGENTS.md`** + **`ARCHITECTURE_ESSENTIALS.mdc`** schedule map; Phase 2e README + **Layering** barrel line (naming + barrels). |
| 2026-04-17 | Phase **2b** **`sections/` only** + architecture Hybrid cross-link. **Solo / pre-launch**: commit-based gate + tracker; **smoke flake protocol**; full regression at milestones; Phase 4 **`components/allocation/`**; **`lib` must not import `features`**; Phase 5 → solo acceptance. |
| 2026-04-16 | **Phase 1** in repo (thin route, `SchedulePageClient`, eslint `.worktrees`, smoke hardening). **Phase 2a:** `ScheduleDevLeaveSimBridge`, `DevLeaveSimPanelProps`, `goToLeaveStep` `aria-current` + Previous fallback. **Phase 2b:** `ScheduleWorkflowStepShell`, export `StepIndicatorProps`. |
| 2026-04-16 | **Policy:** **§ Deferred: UI color / design tokens** — light-first product; bundle token cleanup with **Phases 3–5 extractions**; avoid monolithic repaint of `SchedulePageClient`. Cross-links in phase matrix + Phases 3–5 guidance. |
| 2026-04-16 | **§ Deferred tightened:** **Required two-slice workflow** (structural → verify → token → `done` or **token N/A** logged). Phases **3–5** exit criteria + verification bullets updated so token pass is not silently skipped. |
