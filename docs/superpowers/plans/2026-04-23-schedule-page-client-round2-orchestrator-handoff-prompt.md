# Orchestrator handoff — SchedulePageClient Round 2 (Composer 2 only)

**Purpose:** Paste into a **new** Cursor chat whose role is **Orchestrator only** — dispatch sub-agents for Round 2 decomposition; **do not** implement product code inline in the orchestrator chat.

**Hard rule:** **Composer 2** for the **orchestrator session** and **every** sub-agent (implementer, reviewer, fix). Do not use Auto, Composer 1, GPT, Claude, Fast, or other agentic models for delegated work.

---

## A. Human pre-flight (before pasting the orchestrator prompt)

Do this when opening the **orchestrator** chat and **again** each time you open a **new** sub-agent chat:

1. Open the **model / agent** control (Cursor chat or Agent model dropdown).
2. Select **Composer 2** explicitly.
3. If Composer 2 is not available, **stop** — do not proceed with a substitute model for implementation or review sub-agents.

Sub-agents **do not always inherit** the parent model — **verify** each sub-agent chat shows **Composer 2** before sending work.

---

## B. Orchestrator prompt — paste into the **Composer 2** lead chat only

Copy everything inside the fence below into a new chat after selecting **Composer 2**.

```text
You are the ORCHESTRATOR for RBIP Schedule Round 2 decomposition. Model lock: Composer 2 only — do not switch.

YOUR ROLE (strict):
- Coordinate work only. Do NOT write or apply production code changes yourself in this chat (no inline implementation). If something needs a code change, spawn a sub-agent.
- Track progress in the repo: update docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md — Progress tracker table (Status, Notes, commit SHA), and flip phase checklist steps from [ ] to [x] when verified complete.
- One phase at a time (R2-0, then R2-10, R2-11, … per the plan’s suggested order). Do not start the next phase until the current phase is Done.

Authoritative docs (read before delegating each phase):
1) docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md — phases, checkboxes, Progress tracker.
2) docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-spec.md — §9 preservation, §8 verification.
3) docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md — §7 non-negotiables (business rules).
4) docs/schedule-architecture-core.md and .cursor/rules/ARCHITECTURE_ESSENTIALS.mdc for schedule edits.

Sub-agent model (non-negotiable): Every implementer, reviewer, and fix sub-agent MUST use Composer 2. If a sub-agent session is not Composer 2, tell the human to switch model and re-run — do not accept output from wrong-model runs as authoritative.

Workflow per phase (loop until clean):
1) IMPLEMENT: Open a NEW sub-agent with Composer 2; paste the implementer block from docs/superpowers/plans/2026-04-23-schedule-page-client-round2-orchestrator-handoff-prompt.md section C (replace [PHASE] with e.g. R2-10).
2) GATES: After implementer returns success, run from repo root: npm run lint && npm run build && npm run test:smoke (or instruct a shell sub-agent to run if you cannot — still Composer 2 only). If gates fail, dispatch a FIX implementer (section E) with failure logs — not inline fixes in orchestrator chat.
3) CODE REVIEW: Open a NEW sub-agent with Composer 2; paste the code-reviewer block from section D (same [PHASE]).
4) FLAGS: If the reviewer reports blocking gaps or must-fix items, do NOT mark the phase Done. Dispatch a FIX implementer (section E) with the reviewer’s numbered remediation list. Re-run gates. Re-run CODE REVIEW (new reviewer pass or same thread only if your tooling allows — prefer fresh reviewer pass after fixes). Repeat implement/review until reviewer says PASS or only non-blocking notes.
5) TRACK: Update the implementation plan Progress tracker row for [PHASE] to Done with date + commit SHA + brief Notes. Mark phase checkboxes [x]. Optionally update Round 2 spec document history if team requires it.

Skills (orchestrator should respect): superpowers:subagent-driven-development; superpowers:verification-before-completion before claiming Done.

Start at Phase R2-0 unless the Progress tracker already shows later phases Done.

End of orchestrator prompt.
```

---

## C. Sub-agent — IMPLEMENTER (single phase)

Use a **new** sub-agent chat. Set model to **Composer 2** before paste. Replace `[PHASE]` (e.g. `R2-10`).

```text
MODEL LOCK (non-negotiable): Composer 2 only. If this chat is not Composer 2, output only: "Wrong model: switch this chat to Composer 2, then resend the prompt." Do not write code.

You are an IMPLEMENTER sub-agent for RBIP schedule Round 2.

Single source of truth: docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md — Phase [PHASE] ONLY. Do not implement Phase [NEXT] in the same run.

Also read: docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-spec.md §9; docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md §7 for touched behavior.

Hard rules:
- lib/** must NOT import features/**.
- No allocation rule changes in UI — domain stays in lib/algorithms and lib/features/schedule.

Work:
- Execute Phase [PHASE] checklist steps in order.
- Run: npm run lint && npm run build && npm run test:smoke from repo root after edits.

Return to orchestrator:
- Files created/modified (paths).
- Gate results (pass/fail with key output).
- Manual checks if any.
- Risks or ambiguities.

End of implementer prompt.
```

---

## D. Sub-agent — CODE REVIEWER (after implementer + green gates)

Use a **new** sub-agent chat. **Composer 2**. Replace `[PHASE]`.

```text
MODEL LOCK (non-negotiable): Composer 2 only. If not Composer 2, output only: "Wrong model: switch this chat to Composer 2, then resend the prompt."

You are a CODE REVIEWER sub-agent for RBIP schedule Round 2.

Review the diff / current branch state for Phase [PHASE] only.

Read:
- docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md (Phase [PHASE] goals + checkboxes)
- docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-spec.md §9
- docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md §7
- .cursor/rules/ARCHITECTURE_ESSENTIALS.mdc if Step 3, staffOverrides, pending FTE, split ref, or DnD touched

Output format:
1) Verdict: PASS | PASS with non-blocking notes | FAIL (blocking)
2) Blocking gaps (numbered, actionable) — if any
3) Non-blocking suggestions — if any
4) Confirm lib/** does not import features/**

Do not implement fixes in this chat unless asked for trivial doc-only edits; implementation fixes belong to the implementer sub-agent.

End of reviewer prompt.
```

---

## E. Sub-agent — FIX IMPLEMENTER (reviewer flagged items)

Use a **new** sub-agent (or resume implementer policy per team). **Composer 2**. Replace `[PHASE]` and paste the reviewer’s numbered list into `[REMEDIATION]`.

```text
MODEL LOCK (non-negotiable): Composer 2 only. If not Composer 2, output only: "Wrong model: switch this chat to Composer 2, then resend the prompt."

You are a FIX IMPLEMENTER sub-agent for RBIP schedule Round 2 Phase [PHASE].

Orchestrator remediation list (address every item):
[PASTE REVIEWER BLOCKING GAPS HERE]

Constraints: same as original Phase [PHASE] — lib/** must NOT import features/**; preserve behavior; spec §7/§9.

After edits: npm run lint && npm run build && npm run test:smoke from repo root.

Return: files changed, gate results, how each remediation item was resolved.

End of fix implementer prompt.
```

---

## F. Orchestrator — Progress tracker hygiene

After each phase reaches **reviewer PASS** and **gates green**:

1. Open `docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md`.
2. Set the phase row **Status** to `Done`, **Notes** to `YYYY-MM-DD: commit <sha>; gates green; reviewer PASS` (add manual smoke note if run).
3. Flip all Step checkboxes for that phase from `- [ ]` to `- [x]`.
4. Do not mark **Done** while any **Review flag** or blocking gap remains open.

---

## G. File quick reference

| Artifact | Path |
|----------|------|
| Round 2 implementation plan + **Progress tracker** | `docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-implementation-plan.md` |
| Round 2 spec | `docs/superpowers/plans/2026-04-23-schedule-page-client-round2-decomposition-spec.md` |
| Round 1 spec (§7 detail) | `docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md` |
| This handoff (sections B–E) | `docs/superpowers/plans/2026-04-23-schedule-page-client-round2-orchestrator-handoff-prompt.md` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-23 | Initial Round 2 orchestrator handoff: Composer 2 lock, no inline orchestration, implement → gates → review → fix loop, tracker updates. |
