# SchedulePageClient Round 5 Performance Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `/schedule` loading by adding measured dynamic/lazy boundaries for non-initial UI work, starting with export/PNG tooling.

**Architecture:** `SchedulePageClient` remains the schedule orchestrator. Round 5 changes only import/runtime boundaries for features that are not required for first useful schedule paint, while preserving schedule allocation invariants, the single Step 3 projection path, and the two-controller split-reference model.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `next/dynamic`, Playwright, `@next/bundle-analyzer`, Supabase client.

---

## Source Spec

Primary spec: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-spec.md`

Authoritative references:

- `docs/schedule-architecture-core.md`
- `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`
- `.cursor/rules/lib-import-layering.mdc`
- `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-spec.md`
- `docs/superpowers/plans/2026-04-27-schedule-page-client-round4-maintainability-debulking-implementation-plan.md`

---

## Progress Tracker

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| R5-50 | Measurement baseline | Done | Build/analyze passed; `/schedule` dynamic; analyzer found `exportPng` and dev harness in the schedule page asset; dev route 2190/4228/6477ms; lazy calendar/copy/split 215/365/445ms. |
| R5-51 | Export/PNG lazy utility boundary | Done | `useScheduleExportActions.tsx` now lazy-loads `lib/utils/exportPng` after the export root ref is ready; gates and analyzer passed; export utility code moved to lazy chunk `1357.6a4d76f778e52abe.js` while the schedule page chunk keeps only the dynamic import loader reference. |
| R5-52 | Export interaction verification | Done | Desktop export and mobile preview probes passed after lazy import; owner manual check remains pending. |
| R5-53 | Dev harness boundary review | Done | Outer dev harness bridge is dynamic and only mounted when runtime access is allowed and Leave Sim is open; gates/analyzer passed; resource probe saw no dev harness scripts before opening. |
| R5-54 | Deferred candidate register | Done | Deferred remaining broad split candidates with measured reasons; calendar/copy/split first-open timings were acceptable, and grid/DnD/Step 3 paths stay protected. |

**Status values:** `Not started` · `In progress` · `Done` · `Skipped`

---

## Global Rules

- Keep `lib/**` free of `features/**` imports.
- Keep schedule screen `*.tsx` files out of `lib/features/schedule/`.
- Do not add schedule-wide React context for optimization convenience.
- Do not merge primary and split-reference controllers.
- Do not duplicate allocation logic in UI.
- Do not compute a second Step 3 projection.
- Do not duplicate `performSlotTransfer` / `performSlotDiscard`.
- Do not dynamically split the primary grid path unless a later approved measurement phase proves the benefit.
- Do not commit unless the owner explicitly requests commits.

---

## Global Gates

Run after every runtime-affecting phase:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`. If a command fails, keep the phase `In progress`, fix the issue, and rerun the full gate.

Run after every performance-boundary phase:

```bash
npm run analyze
```

Expected: command exits `0` and writes:

- `.next/analyze/client.html`
- `.next/analyze/nodejs.html`
- `.next/analyze/edge.html`

---

## File Map

| Path | Phase | Responsibility |
|------|-------|----------------|
| `features/schedule/ui/hooks/useScheduleExportActions.tsx` | R5-51, R5-52 | Export button state, hidden export layer trigger, mobile preview dialog, lazy export utility import. |
| `lib/utils/exportPng.ts` | R5-51, R5-52 | Export image utility. Must remain React-free and must not import `features/**`. |
| `features/schedule/ui/SchedulePageClient.tsx` | R5-53 only if needed | Current orchestrator import of dev harness bridge. |
| `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx` | R5-53 only if needed | Developer/admin harness bridge; calls production Step 2/3/4 helpers. |
| `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md` | All phases | Progress tracker and measurement notes. |

---

## Measurement Commands

Use these exact commands for R5 measurement notes.

### Build Baseline

```bash
npm run build
```

Record:

- exit code
- Next.js compiler mode
- whether `/schedule` appears as dynamic (`ƒ`)
- whether first-load JS sizes are printed

### Bundle Analyzer

```bash
npm run analyze
```

Record:

- exit code
- analyzer file paths
- any obvious schedule initial chunk containing export/dev/split candidates

### Dev Route Timing Probe

Use this only when production auth credentials are unavailable. It measures the already-running dev server at `http://localhost:3000`.

```bash
node - <<'NODE'
const { chromium } = require('@playwright/test');
const baseURL = 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(`${baseURL}/api/dev/auto-login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!page.url().includes('/schedule')) {
    await page.goto(`${baseURL}/schedule`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await page.waitForURL(/\/schedule/, { timeout: 45000 });
  const domReadyMs = Date.now() - t0;
  const loading = page.getByText('Loading schedule...');
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }
  await page.getByRole('button', { name: 'Previous step' }).waitFor({ state: 'visible', timeout: 45000 });
  const shellReadyMs = Date.now() - t0;
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const networkIdleMs = Date.now() - t0;
  const perf = await page.evaluate(() => {
    const ss = window.sessionStorage;
    return {
      mounted: ss.getItem('rbip_nav_schedule_mounted_ms'),
      gridReady: ss.getItem('rbip_nav_schedule_grid_ready_ms'),
    };
  });
  console.log(JSON.stringify({ domReadyMs, shellReadyMs, networkIdleMs, perf }, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
```

Expected: prints JSON with `domReadyMs`, `shellReadyMs`, `networkIdleMs`, and session marks.

### Lazy Surface Probe

```bash
node - <<'NODE'
const { chromium } = require('@playwright/test');
const baseURL = 'http://localhost:3000';
async function prepare(context) {
  const page = await context.newPage();
  await page.goto(`${baseURL}/api/dev/auto-login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!page.url().includes('/schedule')) await page.goto(`${baseURL}/schedule`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForURL(/\/schedule/, { timeout: 45000 });
  const loading = page.getByText('Loading schedule...');
  if (await loading.isVisible().catch(() => false)) await loading.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.getByRole('button', { name: 'Previous step' }).waitFor({ state: 'visible', timeout: 45000 });
  return page;
}
async function measure(context, label, fn) {
  const page = await prepare(context);
  const scripts = [];
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'script') return;
    const url = response.url();
    if (url.includes('/_next/static/chunks/')) scripts.push(url.replace(baseURL, ''));
  });
  const start = Date.now();
  const result = await fn(page);
  const ms = Date.now() - start;
  await page.close();
  return {
    label,
    ms,
    result,
    interestingScripts: scripts.filter((s) =>
      /ScheduleCalendarPopover|ScheduleCopyWizard|ReferenceSchedulePane|DevLeaveSim|StaffEditDialog|PCADedicatedScheduleTable|snapshotDiff/.test(s)
    ),
  };
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const measurements = [];
  measurements.push(await measure(context, 'calendar first open', async (page) => {
    await page.getByRole('button', { name: 'Open date picker' }).click();
    await page.locator('text=/^(January|February|March|April|May|June|July|August|September|October|November|December) \\d{4}$/').first().waitFor({ state: 'visible', timeout: 10000 });
    return 'month grid visible';
  }));
  measurements.push(await measure(context, 'copy menu first open', async (page) => {
    await page.getByRole('button', { name: /^Copy$/ }).click({ force: true });
    await page.locator('text=/Loading schedule dates|working day|Specific/i').first().waitFor({ state: 'visible', timeout: 10000 });
    return 'copy menu visible';
  }));
  measurements.push(await measure(context, 'split reference first open', async (page) => {
    await page.getByRole('button', { name: /^Split$/ }).click({ force: true });
    await page.getByText('Reference (Read-only)').waitFor({ state: 'visible', timeout: 30000 });
    return 'reference pane visible';
  }));
  console.log(JSON.stringify({ baseURL, measurements }, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
```

Expected: prints timing for calendar, copy menu, and split reference.

---

## Phase R5-50 — Measurement Baseline

**Objective:** Record fresh baseline measurements before runtime changes.

**Files:**

- Modify: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md`
- Read: `features/schedule/ui/hooks/useScheduleExportActions.tsx`
- Read: `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx`
- Read: `features/schedule/ui/SchedulePageClient.tsx`

- [x] **Step 1: Mark R5-50 In progress**

Update the tracker row:

```markdown
| R5-50 | Measurement baseline | In progress | Capturing fresh build/analyze and browser timing baseline before runtime changes. |
```

- [x] **Step 2: Run production build baseline**

Run:

```bash
npm run build
```

Expected: exit `0`; `/schedule` appears in the route list. If first-load JS sizes are absent, record that explicitly.

- [x] **Step 3: Run bundle analyzer**

Run:

```bash
npm run analyze
```

Expected: exit `0`; analyzer reports are written under `.next/analyze/`.

- [x] **Step 4: Refresh dynamic import inventory**

Run:

```bash
rg -n "dynamic\\(|import\\(" "features/schedule/ui" "components/allocation" "app/(dashboard)/schedule" "lib/utils/exportPng.ts"
```

Expected: output includes existing dialog/calendar/split/dev dynamic sites plus the static `exportPng` path through `useScheduleExportActions.tsx`.

- [x] **Step 5: Run browser timing probes**

Run the `Dev Route Timing Probe` and `Lazy Surface Probe` from the Measurement Commands section.

Expected: both scripts exit `0` and print JSON timing output.

- [x] **Step 6: Record baseline notes**

Append a concise R5-50 note under this phase:

```markdown
R5-50 execution notes (YYYY-MM-DD):

- `npm run build`: [exit/status and `/schedule` output summary].
- `npm run analyze`: [exit/status and analyzer output paths].
- Production auth timing: [available / blocked with reason].
- Dev route timing: [domReadyMs, shellReadyMs, networkIdleMs, grid-ready mark].
- Lazy surface timing: [calendar, copy menu, split reference].
- Initial candidate priority after measurement: export/PNG first; dev harness only if analyzer shows production impact; split/calendar/copy deferred unless first-open latency regresses or analyzer shows unexpected initial-route cost.
```

Replace bracketed text with measured values before marking the phase done.

- [x] **Step 7: Mark R5-50 Done**

Update the tracker row with measured values.

R5-50 execution notes (2026-05-05):

- `npm run build`: exit `0`; Next.js `16.2.2` Turbopack production build passed; `/schedule` appears as dynamic (`ƒ /schedule`); first-load JS sizes were absent from the route output.
- `npm run analyze`: exit `0`; webpack analyzer build passed and wrote `.next/analyze/nodejs.html`, `.next/analyze/edge.html`, and `.next/analyze/client.html`. Client analyzer observations: `features/schedule/ui/hooks/useScheduleExportActions.tsx`, `lib/utils/exportPng.ts`, and `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx` appear under `static/chunks/app/(dashboard)/schedule/page-50c33e9c3a128b6f.js`; `html-to-image` appears in `static/chunks/8634-efc1ac8af56bf0f4.js`; `ScheduleCopyWizard` appears in `static/chunks/9351.c2f7da60c57ac09f.js`; `ScheduleCalendarPopover` and `ReferenceSchedulePane` appear in lazy chunks including `static/chunks/9892.ef6f635cb41e3d1d.js`.
- Dynamic import inventory: exact shell command exited `127` because `rg` is not available on the shell `PATH`; Cursor ripgrep captured dynamic sites in `SchedulePageClient.tsx` prefetches and `ScheduleBlocks1To6`, `SchedulePageDialogNodes.tsx` dialogs/calendar, `ScheduleDevHarnessBridge.tsx` dev imports, `SplitReferencePortal.tsx` / `ScheduleSplitLayout.tsx` reference panes, `ScheduleBoardRightColumn.tsx` PCA table, and overlay/editor dynamic imports. `features/schedule/ui/hooks/useScheduleExportActions.tsx` still has the static `import { downloadBlobAsFile, renderElementToImageBlob } from '@/lib/utils/exportPng'`.
- Production auth timing: blocked / not captured; no production auth credentials were provided for the observed `next start` process, so R5-50 used the plan's dev auto-login probe at `http://localhost:3000`.
- Dev route timing: `domReadyMs` `2190`, `shellReadyMs` `4228`, `networkIdleMs` `6477`, session marks `mounted=2367`, `gridReady=4961.599999904633`.
- Lazy surface timing: calendar first open `215ms` (`ScheduleCalendarPopover` chunk), copy menu first open `365ms` (`ScheduleCopyWizard` chunk), split reference first open `445ms` (`ReferenceSchedulePane` chunk).
- Initial candidate priority after measurement: export/PNG first; dev harness only if analyzer shows production impact; split/calendar/copy deferred unless first-open latency regresses or analyzer shows unexpected initial-route cost.

---

## Phase R5-51 — Export/PNG Lazy Utility Boundary

**Objective:** Move `html-to-image` out of initial schedule hook evaluation by lazy-loading `lib/utils/exportPng` only during export.

**Files:**

- Modify: `features/schedule/ui/hooks/useScheduleExportActions.tsx`
- Read: `lib/utils/exportPng.ts`

- [x] **Step 1: Mark R5-51 In progress**

Update the tracker row:

```markdown
| R5-51 | Export/PNG lazy utility boundary | In progress | Moving `lib/utils/exportPng` behind the export click path. |
```

- [x] **Step 2: Remove the static export utility import**

In `features/schedule/ui/hooks/useScheduleExportActions.tsx`, remove:

```ts
import { downloadBlobAsFile, renderElementToImageBlob } from '@/lib/utils/exportPng'
```

Expected: no static import from `@/lib/utils/exportPng` remains in this hook.

- [x] **Step 3: Add the dynamic utility import inside export execution**

Inside `exportAllocationImage`, add this line after `const el = exportPngRootRef.current` has been checked and before calling `renderElementToImageBlob`:

```ts
        const { downloadBlobAsFile, renderElementToImageBlob } = await import('@/lib/utils/exportPng')
```

The edited block should read:

```ts
        const el = exportPngRootRef.current
        if (!el) throw new Error('Export view not ready')

        const { downloadBlobAsFile, renderElementToImageBlob } = await import('@/lib/utils/exportPng')

        await nextPaint()

        const bg = window.getComputedStyle(el).backgroundColor
        const blob = await renderElementToImageBlob(el, {
          format,
          quality: useJpeg ? 0.82 : undefined,
          pixelRatio: useJpeg ? 1.1 : 2,
          backgroundColor: bg,
        })
```

Expected: the utility chunk is requested only after the export layer has rendered enough to provide `exportPngRootRef.current`.

- [x] **Step 4: Verify import inventory**

Run:

```bash
rg -n "exportPng|renderElementToImageBlob|downloadBlobAsFile" "features/schedule/ui/hooks/useScheduleExportActions.tsx" "lib/utils/exportPng.ts"
```

Expected:

- `useScheduleExportActions.tsx` contains `await import('@/lib/utils/exportPng')`.
- `useScheduleExportActions.tsx` has no static `import { ... } from '@/lib/utils/exportPng'`.
- `lib/utils/exportPng.ts` still imports `html-to-image`.

- [x] **Step 5: Run global gates**

Run:

```bash
npm run lint && npm run build && npm run test:smoke
```

Expected: all commands exit `0`.

- [x] **Step 6: Run analyzer**

Run:

```bash
npm run analyze
```

Expected: exits `0`. Record whether export/PNG code appears outside the initial schedule chunk.

- [x] **Step 7: Mark R5-51 Done**

Update the tracker Notes with files changed, gate result, analyzer result, and any line/chunk observations.

R5-51 execution notes (2026-05-05):

- Files changed: `features/schedule/ui/hooks/useScheduleExportActions.tsx` and this implementation plan.
- Import inventory: shell `rg -n "exportPng|renderElementToImageBlob|downloadBlobAsFile" "features/schedule/ui/hooks/useScheduleExportActions.tsx" "lib/utils/exportPng.ts"` exited `127` because `rg` is still unavailable on the shell `PATH`; Cursor ripgrep confirmed `useScheduleExportActions.tsx` contains `await import('@/lib/utils/exportPng')`, has no static `@/lib/utils/exportPng` import, and `lib/utils/exportPng.ts` still imports `html-to-image`.
- `npm run lint && npm run build && npm run test:smoke`: exit `0`. Lint emitted existing repository warnings; build passed with `/schedule` dynamic (`ƒ`); smoke tests passed.
- `npm run analyze`: exit `0`; analyzer wrote `.next/analyze/nodejs.html`, `.next/analyze/edge.html`, and `.next/analyze/client.html`.
- Analyzer/build output observation: `lib/utils/exportPng` implementation exports and `html-to-image` `toBlob` usage are in lazy chunk `.next/static/chunks/1357.6a4d76f778e52abe.js`; `.next/static/chunks/app/(dashboard)/schedule/page-fdf475dd23c63803.js` retains only the dynamic import loader reference `await a.e(1357).then(a.bind(a,16119))` and the destructured names needed by the export click path.

---

## Phase R5-52 — Export Interaction Verification

**Objective:** Prove lazy-loading the export utility preserves export behavior and has acceptable first-click latency.

**Files:**

- Modify: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md`
- Read: `features/schedule/ui/hooks/useScheduleExportActions.tsx`

- [x] **Step 1: Mark R5-52 In progress**

Update the tracker row:

```markdown
| R5-52 | Export interaction verification | In progress | Verifying desktop download and mobile preview behavior after lazy import. |
```

- [x] **Step 2: Run desktop export probe**

Run this against the dev server:

```bash
node - <<'NODE'
const { chromium } = require('@playwright/test');
const baseURL = 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(`${baseURL}/api/dev/auto-login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!page.url().includes('/schedule')) await page.goto(`${baseURL}/schedule`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForURL(/\/schedule/, { timeout: 45000 });
  const loading = page.getByText('Loading schedule...');
  if (await loading.isVisible().catch(() => false)) await loading.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.getByRole('button', { name: 'Previous step' }).waitFor({ state: 'visible', timeout: 45000 });
  const start = Date.now();
  const downloadPromise = page.waitForEvent('download', { timeout: 45000 });
  await page.getByRole('button', { name: /^Export$/ }).click({ force: true });
  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  console.log(JSON.stringify({ exportMs: Date.now() - start, suggestedFilename }, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
```

Expected: script exits `0` and prints a filename matching `RBIP-allocation-YYYY-MM-DD.png` or `.jpg` if device detection chooses JPEG.

- [x] **Step 3: Run mobile preview probe**

Run:

```bash
node - <<'NODE'
const { chromium, devices } = require('@playwright/test');
const baseURL = 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(`${baseURL}/api/dev/auto-login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!page.url().includes('/schedule')) await page.goto(`${baseURL}/schedule`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForURL(/\/schedule/, { timeout: 45000 });
  const loading = page.getByText('Loading schedule...');
  if (await loading.isVisible().catch(() => false)) await loading.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.getByRole('button', { name: 'Previous step' }).waitFor({ state: 'visible', timeout: 45000 });
  const start = Date.now();
  await page.getByRole('button', { name: /^Export$/ }).click({ force: true });
  await page.getByRole('button', { name: 'Save as image' }).click({ force: true });
  await page.getByRole('heading', { name: 'Save as image' }).waitFor({ state: 'visible', timeout: 45000 });
  await page.getByAltText('Export preview').waitFor({ state: 'visible', timeout: 45000 });
  console.log(JSON.stringify({ mobilePreviewMs: Date.now() - start }, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
```

Expected: script exits `0` and prints `mobilePreviewMs`.

- [x] **Step 4: Record export verification notes**

Append a concise note:

```markdown
R5-52 execution notes (YYYY-MM-DD):

- Desktop export probe: [exportMs and filename].
- Mobile preview probe: [mobilePreviewMs and preview status].
- Manual owner check: [pending / confirmed by owner].
```

- [x] **Step 5: Mark R5-52 Done**

Update the tracker row after automated probes pass. Do not mark manual owner check confirmed unless the owner explicitly confirms it.

R5-52 execution notes (2026-05-05):

- Desktop export probe: exit `0`; `exportMs` 1549; suggested filename `RBIP-allocation-2026-04-29.png`.
- Mobile preview probe: exit `0`; `mobilePreviewMs` 2199; `Save as image` dialog and `Export preview` image became visible.
- Manual owner check: pending.

---

## Phase R5-53 — Dev Harness Boundary Review

**Objective:** Decide whether to add an outer dynamic boundary around dev harness wiring.

**Files:**

- Modify if implemented: `features/schedule/ui/SchedulePageClient.tsx`
- Modify if implemented: `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx`
- Modify: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md`

- [x] **Step 1: Mark R5-53 In progress**

Update the tracker row:

```markdown
| R5-53 | Dev harness boundary review | In progress | Checking whether dev harness code affects production initial route. |
```

- [x] **Step 2: Inspect analyzer and chunk loading evidence**

Use `.next/analyze/client.html` and browser resource output from R5-50/R5-51.

Decision:

- If dev harness code appears in normal production initial `/schedule` chunks for non-developer users, implement Step 3.
- If dev harness code only appears in development HMR/resource loading or after the harness is opened, skip Step 3 and go to Step 6.

- [x] **Step 3: If needed, move the outer bridge to a dynamic import**

In `features/schedule/ui/SchedulePageClient.tsx`, replace the static import:

```ts
import { ScheduleDevHarnessBridge } from '@/features/schedule/ui/dev/ScheduleDevHarnessBridge'
```

with:

```ts
const ScheduleDevHarnessBridge = dynamic(
  () =>
    import('@/features/schedule/ui/dev/ScheduleDevHarnessBridge').then(
      (m) => m.ScheduleDevHarnessBridge
    ),
  { ssr: false }
)
```

Keep this declaration near the existing dynamic declarations, after `import dynamic from 'next/dynamic'`.

Expected: `SchedulePageClient` no longer statically imports `ScheduleDevHarnessBridge`.

- [x] **Step 4: Preserve dev harness runtime gating**

Confirm `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx` still returns `null` when runtime access is not allowed:

```ts
  if (!allowRuntime) return null
```

Expected: developer/admin behavior is unchanged and production users do not see harness UI.

- [x] **Step 5: Run gates if Step 3 was implemented**

Run:

```bash
npm run lint && npm run build && npm run test:smoke && npm run analyze
```

Expected: all commands exit `0`.

- [x] **Step 6: Record decision and mark Done or Skipped**

If implemented, update the tracker with gate/analyzer results.

If skipped, use this tracker note:

```markdown
R5-53 skipped: analyzer/resource evidence did not show dev harness code affecting normal production initial route; current runtime gating and inner dynamic import are sufficient for this round.
```

R5-53 execution notes (2026-05-05):

- Decision: implemented the outer dynamic boundary because R5-50 analyzer evidence showed `ScheduleDevHarnessBridge.tsx` in the normal schedule page asset.
- Files changed: `features/schedule/ui/SchedulePageClient.tsx` and this implementation plan.
- Implementation: removed the static `ScheduleDevHarnessBridge` import and declared `ScheduleDevHarnessBridge = dynamic(() => import('@/features/schedule/ui/dev/ScheduleDevHarnessBridge').then((m) => m.ScheduleDevHarnessBridge), { ssr: false })` near the existing dynamic declarations. After review, the dynamic bridge is mounted only when `allowScheduleDevHarnessRuntime && devLeaveSimOpen` so the bridge chunk is not requested before the harness is opened.
- Runtime gating: `features/schedule/ui/dev/ScheduleDevHarnessBridge.tsx` still returns `null` when `allowRuntime` is false.
- Verification: first `npm run lint && npm run build && npm run test:smoke && npm run analyze` attempt exited `1` during `npm run test:smoke`; the failing `leave edit persists after save + reload` smoke case did not reproduce when rerun directly and skipped because the current schedule state had no eligible editable staff-card path. The full gate chain was rerun after the initial boundary and exited `0`; after the review fix, `npm run lint && npm run build && npm run test:smoke && npm run analyze` was rerun and exited `0`.
- Browser resource probe: on `http://localhost:3000`, no `ScheduleDevHarnessBridge` / `ScheduleDevLeaveSimBridge` / `DevLeaveSimPanel` scripts were loaded after schedule shell ready and before opening Leave Sim; opening Leave Sim loaded the expected dev harness chunks and showed the Developer Leave Simulation dialog.
- Analyzer result: `.next/analyze/client.html` now shows `ScheduleDevHarnessBridge.tsx` in lazy chunk `static/chunks/7690.0c47ad5ba0594924.js`; `ScheduleDevLeaveSimBridge.tsx` remains in lazy chunk `static/chunks/5290.832644b1421a6d14.js`.
- Reviewer result: approved after parent-side conditional mounting and browser resource evidence were added.

---

## Phase R5-54 — Deferred Candidate Register

**Objective:** Record remaining candidates with measured defer reasons so Round 5 does not expand into risky broad splitting.

**Files:**

- Modify: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md`

- [x] **Step 1: Mark R5-54 In progress**

Update the tracker row:

```markdown
| R5-54 | Deferred candidate register | In progress | Recording measured defer decisions for future rounds. |
```

- [x] **Step 2: Add deferred candidates section**

Append this section near the end of this document and update measured values if they changed during execution:

```markdown
## Round 5 Deferred Candidates

| Candidate | Decision | Reason |
|-----------|----------|--------|
| Calendar popover | Defer | Already dynamic; first-open timing was acceptable in R5 baseline unless later probe regresses. |
| Copy wizard/menu | Defer | Wizard is already dynamic/prefetched; menu first-open timing was acceptable in R5 baseline. |
| Split reference pane | Defer unless measured production initial-route impact appears | `ReferenceSchedulePane` is already dynamic; `SplitReferencePortal` is architecturally sensitive because it owns the second controller. |
| Step 3 dialog internals | Defer | V1/V2 dialogs are already dynamic; changing internals risks the single Step 3 projection path. |
| Primary grid blocks (`ScheduleBlocks1To6`, `TherapistBlock`, `PCABlock`) | Defer | These are on the first useful schedule paint; splitting them risks visible waterfalls. |
| DnD and interaction overlays | Defer | Close to primary interactivity and single transfer/discard path; optimize only with strong measurement evidence. |
```

- [x] **Step 3: Run final documentation sanity check**

Run:

```bash
rg -n "TB[D]|TO[D]O|f[i]ll in|implement late[r]|\\[placeholde[r]\\]" "docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-spec.md" "docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md"
```

Expected: no matches.

- [x] **Step 4: Mark R5-54 Done**

Update the tracker row with the defer summary.

R5-54 execution notes (2026-05-05):

- Files changed: this implementation plan only.
- Documentation sanity check: exact shell `rg` command exited `127` because `rg` is not available on the shell `PATH`; Cursor ripgrep equivalent against the spec and implementation plan returned no matches.
- Completion checklist updates: marked R5-50 through R5-54 complete from recorded phase evidence; marked final runtime gate and analyzer complete from the post-R5-53 full rerun; marked architecture invariants complete because Round 5 changed only the export utility boundary and dev harness import/mount boundary, with no new `lib/**` to `features/**` import, no Step 3 projection duplication, and no duplicate transfer/discard path introduced.

## Round 5 Deferred Candidates

| Candidate | Decision | Reason |
|-----------|----------|--------|
| Calendar popover | Defer | Already dynamic; first-open timing was acceptable in R5 baseline unless later probe regresses. |
| Copy wizard/menu | Defer | Wizard is already dynamic/prefetched; menu first-open timing was acceptable in R5 baseline. |
| Split reference pane | Defer unless measured production initial-route impact appears | `ReferenceSchedulePane` is already dynamic; `SplitReferencePortal` is architecturally sensitive because it owns the second controller. |
| Step 3 dialog internals | Defer | V1/V2 dialogs are already dynamic; changing internals risks the single Step 3 projection path. |
| Primary grid blocks (`ScheduleBlocks1To6`, `TherapistBlock`, `PCABlock`) | Defer | These are on the first useful schedule paint; splitting them risks visible waterfalls. |
| DnD and interaction overlays | Defer | Close to primary interactivity and single transfer/discard path; optimize only with strong measurement evidence. |

---

## Completion Checklist

- [x] R5-50 baseline measurements recorded.
- [x] R5-51 export/PNG lazy import implemented or explicitly blocked with evidence.
- [x] R5-52 export behavior verified on desktop and mobile preview paths.
- [x] R5-53 dev harness boundary implemented or skipped with evidence.
- [x] R5-54 deferred candidates recorded.
- [x] No `lib/**` imports `features/**`.
- [x] No duplicate Step 3 projection path introduced.
- [x] No duplicate DnD transfer/discard implementation introduced.
- [x] Final runtime-affecting gate passes: `npm run lint && npm run build && npm run test:smoke`.
- [x] Final analyzer run passes: `npm run analyze`.

---

## Suggested Commit Messages

Use one commit per completed runtime phase when the owner asks for commits:

```bash
docs(schedule): plan round 5 performance boundaries
refactor(schedule): lazy load export image tooling
test(schedule): record export lazy-load verification
refactor(schedule): gate dev harness boundary
docs(schedule): record deferred performance candidates
```

Do not commit unless the owner explicitly requests commits.

---

## Plan Self-Review Notes

This plan covers the Round 5 spec goals with measured phases and narrow runtime changes. It avoids primary-grid lazy splitting, preserves the split-reference two-controller model, keeps `lib/**` import layering intact, and treats dev harness changes as evidence-based rather than automatic.

---

## Document History

| Date | Change |
|------|--------|
| 2026-05-05 | Initial Round 5 implementation plan drafted from measured analysis and Round 5 performance-boundaries spec. |
