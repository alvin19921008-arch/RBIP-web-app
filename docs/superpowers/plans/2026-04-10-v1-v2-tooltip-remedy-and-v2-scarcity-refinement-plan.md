# V1/V2 Tooltip Remedy And V2 Scarcity Refinement Implementation Plan

> **For agentic workers:** Use this as a short execution checklist for the approved spec. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the intact V1 tracker tooltip, give V2 its own dedicated tooltip layout, and refine the V2 Step 3.1 scarcity preview so it stays compact and visually quiet.

**Architecture:** Keep the data model shared, but split presentation at the render layer. `PCABlock.tsx` should branch into a preserved legacy V1 tooltip renderer and a dedicated V2 tooltip renderer; `FloatingPCAConfigDialogV2.tsx` should keep the V2 scarcity block but tighten its side-by-side metrics into a compact content-width cluster.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind classes, existing schedule/allocation tracker data.

---

### Task 1: Restore Legacy V1 Tooltip Path

**Files:**
- Modify: `components/allocation/PCABlock.tsx`

- [ ] Identify the intact legacy V1 tooltip structure from pre-remedy `PCABlock.tsx` history and preserve that grouped-by-PCA rendering as the V1 renderer.
- [ ] Remove V2-specific summary framing from the V1 tooltip path so it again shows legacy concepts such as `C1 / C2 / C3`, legacy cycle order text, and existing AM/PM + gym summary.
- [ ] Keep existing buffer-assignment handling and existing grouped-by-PCA organization in the V1 path.
- [ ] Verify the V1 renderer still compiles cleanly and does not depend on V2-only tracker fields.

### Task 2: Add Dedicated V2 Tooltip Renderer

**Files:**
- Modify: `components/allocation/PCABlock.tsx`

- [ ] Add a distinct V2 tooltip renderer rather than mutating the V1 grouped-line renderer.
- [ ] Use the approved V2 header metadata:
  - team
  - mode
  - queue position if available
  - rounded pending
- [ ] Render compact V2 summary sections for:
  - total slots
  - 3.4 mix (`draft`, `repair`, `extra`)
  - best ranked slot met
  - status
- [ ] Surface repair audit issues at the team-summary level.
- [ ] Use approved wording:
  - `Ranked unassigned slot`
  - `Unranked non-gym unassigned slot`
  - `Assigned before final allocation`
- [ ] Select V1 vs V2 renderer from explicit Step 3 flow/version state if available; only use tracker metadata heuristics as fallback.

### Task 3: Refine V2 Step 3.1 Scarcity Preview

**Files:**
- Modify: `components/allocation/FloatingPCAConfigDialogV2.tsx`

- [ ] Keep the block V2-specific and hidden entirely when no scarcity is detected.
- [ ] Preserve side-by-side scarcity outcomes, but refactor the inner layout so the two outcomes read as one compact cluster rather than stretching across the modal.
- [ ] Keep the dialog surface as the base background and use only very light amber emphasis at the container level.
- [ ] Keep internal divider/lines lighter than the outer container emphasis.
- [ ] Continue hiding extra-coverage metadata when the value is `0`.

### Task 4: Verify In-App Behavior

**Files:**
- Verify: `components/allocation/PCABlock.tsx`
- Verify: `components/allocation/FloatingPCAConfigDialogV2.tsx`

- [ ] Run lint/diagnostic checks on touched files.
- [ ] Run a targeted TypeScript sanity check if feasible without being blocked by unrelated repo errors.
- [ ] Manually inspect:
  - V1 flow tooltip uses intact legacy style
  - V2 flow tooltip uses dedicated compact review style
  - V2 Step 3.1 scarcity block stays hidden when clear
  - V2 Step 3.1 scarcity block shows compact side-by-side metrics when present
