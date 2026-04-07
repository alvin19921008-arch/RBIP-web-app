# Step 3 Messy V2 Snapshot Handoff

Status: backup snapshot handoff

Date: 2026-04-07

## Purpose
This document is a handoff note for continuing the Step 3 Floating PCA recovery from another computer.

The current branch is intentionally a backup snapshot of a messy V2 attempt. It is not the branch to continue implementation on directly.

## Current Snapshot Branch
- Branch name: `backup/step3-ranked-slot-v2-snapshot`
- Source: former dirty worktree branch `feature/step3-ranked-slot-v2`
- Intent: preserve the current mixed V1/V2 attempt as a reference checkpoint before recovery

## What This Snapshot Contains
- A partially implemented V2 ranked-slot attempt
- A mixed `allocationEngine` / legacy-mode setup inside the Step 3 wizard
- A Step 3.4 review UI that drifted away from the approved preview
- New regression tests related to ranked-slot V2
- Local documentation for the recovery plan

## Why This Snapshot Should Not Be Continued Directly
The current V2 attempt drifted because V2 was blended into the existing Step 3 wizard instead of being isolated as its own flow.

Main problems:
- `components/allocation/FloatingPCAConfigDialog.tsx` mixes V1 and V2 logic
- Step `3.1 -> 3.3` can skip `3.2`, but `3.3` still offers `Back to 3.2`
- the Step 3.4 review UI does not match the approved preview
- `app/(dashboard)/schedule/page.tsx` contains duplicated Step 3 orchestration
- save/runtime behavior risks cross-contaminating V1 and V2 assumptions

## Approved source documents (read order and purpose)

Use this order so policy, UI intent, implementation tasks, and recovery architecture stay separate. **Do not** paste all files into context at once; open the one that matches the current task.

### 1. Recovery architecture (start here for “what to build first”)

**File:** `docs/superpowers/plans/2026-04-07-step3-v1-v2-recovery.md`

**What it is:** High-level recovery plan: freeze V1 from `main`, put V1/V2 choice before Step 3.1, split wizards, rebuild V2 Step 3.4 to match preview.

**When to read:** Before writing code on a clean branch from `main`.

**Not for:** Allocator math details or pixel-perfect UI copy (use specs below).

---

### 2. Original implementation task list (after recovery direction is clear)

**File:** `docs/superpowers/plans/2026-04-06-floating-pca-ranked-slot-step3.md`

**What it is:** Step-by-step implementation plan (Tasks 1–6): which files to touch, regression test names, guardrails, file map.

**When to read:** When executing ranked-slot features on the recovery branch; use it as a checklist, but **reconcile** with the recovery plan if they conflict (recovery wins on V1/V2 split and launcher placement).

**Not for:** Replacing the recovery plan’s “clean main + split flows” sequence.

---

### 3. Allocator and tracker policy (behavioral source of truth)

**File:** `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`

**What it is:** Slot-first ladder, pending-first rules, duplicate/gym last resort, tracker/diagnostic fields, scenario table.

**When to read:** When changing `allocateFloatingPCA_v2`, helpers, or `types/schedule.ts` tracker fields.

**Not for:** React layout or dashboard form labels.

---

### 4. Step 3 and dashboard UI intent (copy and flow)

**File:** `docs/superpowers/specs/2026-04-06-floating-pca-step3-ui-design.md`

**What it is:** Approved UI direction: Step 3.2 exception-first flow, Step 3.4 plain-language review, ranked-slot dashboard entry, tone and structure.

**When to read:** When building or refactoring `FloatingPCAConfigDialog*`, `TeamReservationCard`, `PCAPreferencePanel`, Step 3.4 review components.

**Not for:** Implementing HTML from the brainstorm file literally in production.

---

### 5. Visual reference only (layout mock, not production)

**File:** `.superpowers/brainstorm/96515-1775525468/content/step3-family-preview-v2.html`

**What it is:** Static HTML mock for spacing, strip layout, connected detail block, and “why this happened” panel—**reference only**.

**When to read:** When matching React/Tailwind to the agreed look; implement with existing RBIP components, not by copying raw HTML into the app.

**Not for:** Treating as executable spec or as the only wording authority (use the UI spec for copy).

---

### For AI agents

- **One task, one primary doc:** e.g. allocator change → allocation design spec; Step 3.4 UI → UI spec + HTML mock glance.
- **This handoff** = situation + branch safety + read order.
- **Recovery md** = execution phases for the split V1/V2 rebuild.
- **2026-04-06 plan** = granular file/test checklist once you are on a clean recovery branch.

## Recommended Next Workflow
Do this on the next laptop:

1. Fetch the backup snapshot branch and keep it untouched as a reference branch.
2. Create a fresh recovery branch from `main`.
3. Create a fresh worktree from that clean recovery branch.
4. Rebuild from the clean baseline using the recovery plan, not by editing this backup branch in place.

Suggested git flow:

```bash
git fetch origin
git switch main
git pull
git switch -c fix/step3-v1-v2-recovery
git worktree add "../RBIP-duty-list-step3-recovery" fix/step3-v1-v2-recovery
```

## Recovery Direction
- Freeze clean V1 from `main`
- move V1/V2 choice to before Step 3.1
- split into standalone V1 and V2 flows
- rebuild V2 Step 3.1 to 3.4 to match the approved design
- keep only pure shared helpers between V1 and V2

## Important Safety Notes
- Do not merge `backup/step3-ranked-slot-v2-snapshot` into `main`
- Do not treat the backup snapshot as the implementation base
- Do not commit `.env.local`
- Keep the backup branch available for reference and diff comparison

## Short Brief For The Next Agent
The current Step 3 V2 attempt is preserved as a backup snapshot because V1 and V2 became entangled inside the same wizard. The next task is not to polish the snapshot, but to restart from clean `main`, freeze legacy V1, and rebuild V2 as a separate standalone flow according to `docs/superpowers/plans/2026-04-07-step3-v1-v2-recovery.md`.
