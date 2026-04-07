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

## Approved Source Of Truth
Use these files as the authority for the recovery:
- `docs/superpowers/plans/2026-04-06-floating-pca-ranked-slot-step3.md`
- `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- `docs/superpowers/specs/2026-04-06-floating-pca-step3-ui-design.md`
- `.superpowers/brainstorm/96515-1775525468/content/step3-family-preview-v2.html`
- `docs/superpowers/plans/2026-04-07-step3-v1-v2-recovery.md`

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
