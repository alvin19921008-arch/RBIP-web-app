# Handoff prompt — SchedulePageClient decomposition (Composer 2 only)

**Hard rule:** **Composer 2** for the **parent session** and **every sub-agent**. Do not rely on “default” or Auto model selection — past runs have slipped to non–Composer 2 unless explicitly locked.

---

## A. Human pre-flight (before you paste anything)

Do this **once** when opening the lead chat, and **again** each time you open a **new sub-agent** chat:

1. Open the **model / agent** control for that conversation (Cursor chat or Agent model dropdown).
2. Select **Composer 2** explicitly. **Do not** leave **Auto**, **Composer 1**, **GPT**, **Claude**, or **Fast** variants unless you intentionally override this project policy.
3. If the UI does not show Composer 2, stop and fix the model selection before delegating work.

Sub-agents **do not inherit** your model choice in all setups — **verify the sub-agent’s chat** shows Composer 2 before sending the sub-agent prompt.

---

## B. Parent session — prompt body (copy into **Composer 2** lead chat only)

Paste the block below into a chat where **Composer 2** is already selected.

```text
You are the lead implementer. Model for THIS session: Composer 2 only — do not switch.

Execute the SchedulePageClient decomposition using subagent-driven development and superpowers skills.

Docs (read first):
1) docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-implementation-plan.md — tasks, gates, Progress tracker (update when phase status changes).
2) docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md — §6 verification, §7 non-negotiables, §9 decisions.
3) docs/schedule-architecture-core.md and .cursor/rules/ARCHITECTURE_ESSENTIALS.mdc on schedule edits.

Skills:
- superpowers:subagent-driven-development — one fresh subagent per phase; two-stage review (spec §7, then code / layering: lib must not import features).
- superpowers:executing-plans — load plan, track todos, no skipped verification.
- superpowers:verification-before-completion before marking any phase Done.

After code changes: npm run lint && npm run build && npm run test:smoke (see .cursor/skills/playwright-smoke/SKILL.md).

Rules:
- One phase at a time; merge Phase N before Phase N+1.
- Update the Progress tracker table in the implementation plan (Status + Notes).
- When you dispatch a sub-agent, you MUST paste the block from section C of docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-handoff-prompt.md and set that sub-agent chat to Composer 2 before sending.

Start Phase 0, then Phase 1, etc., per the implementation plan.
```

---

## C. Sub-agent session — prompt body (copy into **every** sub-agent chat)

**Steps:**

1. Create/open a **new** sub-agent / delegated chat.
2. Set its model to **Composer 2** (same pre-flight as §A).
3. Paste **only** the block below (replace `[N]` with the phase number).

```text
MODEL LOCK (non-negotiable): You MUST run as Composer 2. If your session is not Composer 2, do not write code — output only: "Wrong model: switch this chat to Composer 2, then resend the prompt."

You are a sub-agent implementing a single phase of the RBIP schedule decomposition.

Single source of truth: docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-implementation-plan.md — Phase [N] ONLY. Do not start Phase [N+1].

Also read: docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md §7 (business rules) for anything you touch.

Hard rules:
- lib/** must NOT import features/**.
- Preserve behavior; no allocation rule changes in UI — domain stays in lib/algorithms and lib/features/schedule.

Work:
- Follow Phase [N] checkbox steps in order in the implementation plan.
- Run: npm run lint && npm run build && npm run test:smoke from repo root after edits.

Return to the parent:
- Files created/modified (paths).
- Gate command results (pass/fail).
- Manual checks you ran (if any).
- Anything risky or ambiguous for the lead to verify.

End of sub-agent prompt.
```

---

## D. Parent checklist when spawning each sub-agent

- [ ] Sub-agent chat model = **Composer 2** (verified in UI).
- [ ] Prompt used = **§C** block with correct `[N]`.
- [ ] After sub-agent returns: lead (Composer 2) reviews diff, runs gates again if needed, updates **Progress tracker**, then spawns next sub-agent.

---

## E. If a sub-agent still used the wrong model

- Discard or ignore code from that run unless independently verified.
- Re-open a sub-agent with **Composer 2** selected **before** paste, resend **§C** only.

---

## F. File locations (quick reference)

| Artifact | Path |
|----------|------|
| Implementation plan + **Progress tracker** | `docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-implementation-plan.md` |
| Decomposition spec | `docs/superpowers/plans/2026-04-22-schedule-page-client-decomposition-spec.md` |
| Monolith (until shrunk) | `features/schedule/ui/SchedulePageClient.tsx` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-04-22 | Initial handoff prompt for Composer 2 + subagent-driven + executing-plans + verification. |
| 2026-04-22 | Strict Composer 2 lock for parent + sub-agents; §A/C/D/E; sub-agent refuses if wrong model. |
