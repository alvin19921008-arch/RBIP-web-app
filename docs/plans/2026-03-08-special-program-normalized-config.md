# Special Program Normalized Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace ambiguous JSONB-only special program staff config with normalized row storage while preserving Step 1-4 behavior, including zero-add / zero-subtraction SPT runners such as Aggie.

**Architecture:** Introduce a normalized `special_program_staff_configs` source of truth, then add adapters that project normalized rows back into the current `SpecialProgram` runtime shape so the Step 1-4 pipeline can be migrated incrementally. Lock the current business rule with a regression test against `allocateTherapists()` before changing storage and readers.

**Tech Stack:** Next.js, TypeScript, Supabase Postgres, SQL migrations, Node-based regression tests

---

### Task 1: Lock the zero-add / zero-subtraction business rule

**Files:**
- Create: `tests/regression/f9-special-program-zero-fte-spt-runner.test.ts`
- Modify: `lib/algorithms/therapistAllocation.ts`

**Step 1: Write the failing test**
- Build a Wednesday scenario with:
- One SPT (`Aggie`) whose Step 1 / SPT weekday config contributes `0` team FTE.
- One CRP special program entry that still configures Aggie as the therapist for Wednesday with `fte_subtraction = 0`.
- Assert that therapist allocation still emits Aggie as the CRP runner and tags the allocation with `special_program_ids = ['crp']`.
- Assert that `ptPerTeam` does not increase from Aggie and does not decrease for CRP.

**Step 2: Run test to verify it fails**
- Run: `npx tsx tests/regression/f9-special-program-zero-fte-spt-runner.test.ts`
- Expected: failure showing the CRP tag / runner business rule is not preserved.

**Step 3: Implement minimal logic to pass**
- Fix the canonical special-program therapist resolution so a configured zero-subtraction therapist still counts as the runner when explicitly configured for the weekday.

**Step 4: Run test to verify it passes**
- Run: `npx tsx tests/regression/f9-special-program-zero-fte-spt-runner.test.ts`

### Task 2: Add normalized special-program staff config storage

**Files:**
- Create: `supabase/migrations/20260308_add_special_program_staff_configs.sql`
- Modify: `supabase/schema.sql`

**Step 1: Add schema**
- Create `special_program_staff_configs` with one row per `program_id + staff_id`.
- Store weekday config in a typed/structured way that can represent:
- enabled
- role
- slots
- therapist subtraction
- PCA subtraction/requirement as needed
- primary-runner semantics

**Step 2: Backfill**
- Migrate existing `special_programs.staff_ids`, `slots`, and `fte_subtraction` JSONB content into normalized rows.

**Step 3: Keep compatibility**
- Preserve `special_programs` program-level identity/preference fields so runtime adapters can continue returning `SpecialProgram[]` during migration.

### Task 3: Add runtime adapters and fetch/save integration

**Files:**
- Modify: `lib/features/schedule/controller/dataGateway.ts`
- Modify: `lib/features/schedule/controller/useScheduleController.ts`
- Modify: `lib/features/schedule/snapshotDiffLiveInputs.ts`
- Modify: `lib/utils/snapshotMinify.ts`
- Modify: `lib/utils/staffEditDrafts.ts`
- Modify: `app/api/staff/save/route.ts`
- Create: `supabase/migrations/20260308_save_staff_edit_dialog_v2.sql`

**Step 1: Read path**
- Fetch normalized rows with special programs and build a canonical runtime model.

**Step 2: Save path**
- Create `save_staff_edit_dialog_v2` so normalized row writes happen inside the same SQL transaction as the staff/SPT/program save.
- Move the route from `v1` to `v2` after the new RPC is verified.

**Step 3: Snapshot path**
- Decide whether snapshots store:
- normalized rows directly, or
- projected legacy-compatible `SpecialProgram` objects plus enough metadata to round-trip safely.

### Task 4: Migrate Step 1-4 readers to canonical special-program config

**Files:**
- Modify: `components/dashboard/SpecialProgramPanel.tsx`
- Modify: `components/allocation/Step1LeaveSetupDialog.tsx`
- Modify: `components/allocation/SpecialProgramOverrideDialog.tsx`
- Modify: `lib/algorithms/therapistAllocation.ts`
- Modify: `lib/algorithms/pcaAllocation.ts`

**Step 1: Dashboard/editor readers**
- Replace direct JSON shape inference with canonical helpers.

**Step 2: Step 1 availability**
- Ensure therapist availability and special-program detection read the normalized weekday config consistently.

**Step 3: Step 2.0 dialog**
- Remove heuristic “runner inference” from raw `fte_subtraction` / `slots` whenever explicit normalized runner data exists.

**Step 4: Step 2 algorithm**
- Ensure zero-subtraction configured therapists are still tagged as program runners.

**Step 5: Step 3/4 PCA consumers**
- Add a failing regression for CRP PCA team targeting.
- Ensure CRP/Robotic slot and team targeting use the canonical special-program weekday resolver.
- Prefer target-team data derived from the canonical therapist/team result rather than the hard-coded `CPPC` fallback.

### Task 5: Verify and harden

**Files:**
- Test: `tests/regression/f9-special-program-zero-fte-spt-runner.test.ts`
- Test: existing `tests/regression/*.test.ts`

**Step 1: Run targeted regression suite**
- Run the new regression plus existing Step 2/3 regressions.

**Step 2: Lint changed files**
- Run lint or IDE diagnostics on touched files.

**Step 3: Summarize risks**
- Call out any remaining compatibility gaps in snapshots, dashboard diff, or staff-edit save.
