# SchedulePageClient Round 5 Orchestrator Handoff Prompt

Use this prompt in a fresh chat to execute Round 5 with subagent-driven development.

---

## Prompt

You are the **Round 5 orchestrator** for the RBIP duty list web app.

Your job is to execute the approved Round 5 performance-boundaries plan using **subagent-driven development**:

1. Implementer subagent performs one phase.
2. Code reviewer subagent reviews the phase against the spec, plan, and architecture rules.
3. Fixer subagent fixes every blocking reviewer finding.
4. Reviewer re-checks until the phase is approved or explicitly blocked.
5. The orchestrator updates the implementation plan tracker and phase notes with what was achieved.

Do not execute the whole plan inline yourself unless subagents are unavailable. You are primarily coordinating, reviewing, updating the plan, and deciding when to stop.

---

## Required Skills and Rules

Before doing implementation work, use these skills as applicable:

- `superpowers:subagent-driven-development`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging` if any command/test/build/browser probe fails unexpectedly
- `superpowers:receiving-code-review` before applying reviewer feedback if the feedback is ambiguous or questionable
- `superpowers:requesting-code-review` when dispatching review passes if useful

Follow project rules:

- Read `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`.
- Read `.cursor/rules/lib-import-layering.mdc` before any `lib/**` edit.
- Preserve `lib/**` → no `features/**` imports.
- Preserve the single Step 3 projection path.
- Preserve `staffOverrides` as the source of truth.
- Preserve the single DnD transfer/discard path.
- Preserve the split-reference two-controller model.
- Do not commit unless the owner explicitly asks.
- Do not mark owner/manual checks complete unless the owner explicitly confirms them.

---

## Required Source Docs

Read these before dispatching subagents:

- `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-spec.md`
- `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md`
- `docs/schedule-architecture-core.md`
- `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`
- `.cursor/rules/lib-import-layering.mdc` if touching `lib/utils/exportPng.ts`

The approved implementation plan phases are:

- R5-50 — Measurement baseline
- R5-51 — Export/PNG lazy utility boundary
- R5-52 — Export interaction verification
- R5-53 — Dev harness boundary review
- R5-54 — Deferred candidate register

---

## Orchestrator Workflow

### 1. Initial Setup

1. Read the spec and implementation plan.
2. Create a TodoWrite list with one todo per phase.
3. Check current git status before edits.
4. Confirm the currently running dev server if browser probes are needed.
5. Start with R5-50 unless the implementation plan tracker already shows it done.

Do not start R5-51 until R5-50 baseline notes are written into the implementation plan.

### 2. Per-Phase Loop

For each phase:

1. Mark the phase row in the implementation plan tracker as `In progress`.
2. Dispatch an **implementer subagent** with:
   - the exact phase text copied from the implementation plan,
   - the relevant spec sections,
   - the relevant file paths,
   - the architecture constraints,
   - explicit instruction to run the phase’s required verification commands,
   - explicit instruction to report status as `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.
3. When the implementer returns:
   - If `NEEDS_CONTEXT`, provide the missing context and re-dispatch.
   - If `BLOCKED`, diagnose whether the blocker is plan, environment, or implementation related. Ask the owner if the plan needs a scope decision.
   - If `DONE_WITH_CONCERNS`, read the concerns and decide whether review can proceed.
   - If `DONE`, proceed to review.
4. Dispatch a **code reviewer subagent** with:
   - the phase goal,
   - spec and implementation plan references,
   - exact files changed,
   - verification command outputs from the implementer,
   - instruction to find only real blocking or important issues.
5. If reviewer finds blocking or important issues:
   - Dispatch a **fixer subagent** with the reviewer findings and changed files.
   - The fixer must make only targeted fixes and rerun relevant verification.
   - Re-dispatch reviewer with the fix summary.
   - Repeat until approved or blocked.
6. After approval:
   - Run or confirm the required verification evidence yourself before making any success claim.
   - Update the implementation plan tracker row to `Done` or `Skipped`.
   - Add a phase execution note describing what changed, what was measured, what commands passed, what was skipped, and what remains for owner/manual verification.
   - Mark the TodoWrite item complete.

### 3. Phase Notes Requirement

After every phase, update the implementation plan with a concrete note. Do not leave generic text.

Use this format:

```markdown
R5-XX execution notes (YYYY-MM-DD):

- Implemented / measured: <specific result>.
- Files changed: `<path>`, `<path>`.
- Verification: `<command>` exited `<code>`; key output was `<short summary>`.
- Analyzer/timing result: <numbers or explicit reason unavailable>.
- Reviewer result: <approved / approved after fixes / blocked>.
- Fixes after review: <none or concise list>.
- Manual owner check: <pending / confirmed by owner>.
```

If a phase is skipped, use:

```markdown
R5-XX skipped (YYYY-MM-DD):

- Reason: <measured evidence or architectural reason>.
- Verification / evidence: <commands, analyzer output, or reviewer finding>.
- Follow-up: <when to revisit>.
```

Also update the `Progress Tracker` table row Notes column with the same high-level achievement.

---

## Implementer Subagent Template

Use a fresh implementation subagent per phase. Do not make the implementer discover the whole plan. Give it the phase text directly.

```text
You are implementing Round 5 phase <R5-XX: name> in the RBIP duty list web app.

Context:
- Primary spec: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-spec.md`
- Implementation plan: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md`
- Architecture: `docs/schedule-architecture-core.md`
- Schedule invariants: `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`
- Lib layering: `.cursor/rules/lib-import-layering.mdc` if touching `lib/**`

Phase text:
<paste the full R5-XX phase from the implementation plan>

Rules:
- Make only changes required by this phase.
- Preserve schedule behavior and all architecture invariants.
- Do not commit.
- Update the implementation plan phase row and execution notes only if the phase text asks for it.
- Run the verification commands required by this phase.
- If blocked, stop and report the blocker instead of guessing.

Return:
- Status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- Files changed
- Commands run and exit results
- Measurement results, if any
- Concerns, if any
```

---

## Code Reviewer Subagent Template

Use the `code-reviewer` subagent after each implementation/fix pass.

```text
Review Round 5 phase <R5-XX: name> for correctness and plan compliance.

Context:
- Primary spec: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-spec.md`
- Implementation plan: `docs/superpowers/plans/2026-05-05-schedule-page-client-round5-performance-boundaries-implementation-plan.md`
- Architecture: `docs/schedule-architecture-core.md`
- Invariants: `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc`
- Lib layering: `.cursor/rules/lib-import-layering.mdc` if `lib/**` changed

Phase goal:
<paste phase objective and expected exit criteria>

Changed files:
<list files changed by implementer/fixer>

Verification evidence:
<paste command results and measurement results>

Review focus:
- Does the implementation satisfy this phase and avoid expanding scope?
- Are import boundaries correct?
- Did it preserve schedule allocation invariants?
- Did it preserve export/dev/split behavior relevant to this phase?
- Are verification notes honest and specific?
- Are there missing tests/build/analyzer/browser checks required by the plan?

Return findings first, ordered by severity. If no blocking or important findings, say approved clearly. Include any non-blocking notes separately.
```

---

## Fixer Subagent Template

Use a fresh fixer subagent when reviewer findings need code/doc changes. Keep the fix scoped to the findings.

```text
You are fixing reviewer findings for Round 5 phase <R5-XX: name>.

Reviewer findings:
<paste exact findings>

Changed files from prior implementation:
<list files>

Relevant plan/spec context:
<paste only the phase objective, rules, and exit criteria>

Instructions:
- Fix only the listed reviewer findings.
- Do not introduce unrelated refactors.
- Preserve all schedule architecture invariants.
- Rerun the relevant verification commands.
- Update implementation plan notes if the fix changes what the phase achieved.
- Do not commit.

Return:
- Status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- Fix summary
- Files changed
- Commands run and exit results
- Remaining concerns, if any
```

---

## Phase-Specific Orchestrator Notes

### R5-50

This is measurement-only. The implementer should update docs, not runtime files. If production timing is blocked by auth, record that explicitly and proceed with dev timing unless the owner asks for a production-auth task.

### R5-51

This is the first runtime change. The implementer should only move `@/lib/utils/exportPng` from a static import to an `await import(...)` inside `exportAllocationImage`.

Do not change export UI, file naming, object URL cleanup, toast behavior, or hidden export layer timing.

### R5-52

This is verification-heavy. It may only update docs unless the export probes reveal a bug caused by R5-51. If a bug appears, dispatch a fixer subagent before marking the phase done.

### R5-53

This phase may be skipped. Only implement the outer dev harness dynamic boundary if analyzer/resource evidence shows production initial-route impact. Otherwise mark it `Skipped` with evidence.

### R5-54

This is documentation-only. It should close the round by recording deferred candidates and updating the completion checklist.

---

## Final Completion

After R5-54:

1. Run the final required gates if any runtime phase changed code:

```bash
npm run lint && npm run build && npm run test:smoke
npm run analyze
```

2. Dispatch one final `code-reviewer` subagent for the whole Round 5 diff.
3. Fix any blocking findings with a fixer subagent.
4. Update the completion checklist in the implementation plan.
5. Report final status to the owner with:
   - phases completed/skipped,
   - files changed,
   - verification evidence,
   - measured performance outcome,
   - manual checks still pending.

Do not claim completion without fresh verification evidence.
