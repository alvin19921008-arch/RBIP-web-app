# Orchestrator handoff — Floating PCA V2 bounded donor relief (rebalance) — Composer 2 only

**Purpose:** Paste into a **new** Cursor chat whose role is **Orchestrator** — use **`superpowers:subagent-driven-development`**: **Implementer (Composer 2) → code gates → Code reviewer (Composer 2) → Fixer (Composer 2)** until the plan is shippable. The orchestrator **does not** write production code inline (no inline patches); delegate work to sub-agents.

**One plan is enough:** `2026-04-25-floating-pca-v2-bounded-donor-relief-rebalance-plan.md` is the **single** implementation spec (Tasks 1–5, §0–2, §5–7). You do **not** need a separate “implementation plan” file unless the team wants a one-page duplicate—this handoff is for **execution** only.

**Prerequisite:** A1 global duplicate repair (`2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md`) should be **landed** or the same branch must include those changes (`duplicateRepairPolicy`, widened A1, `generateA1Candidates` filters, `f133` / `f134` / `f135` as applicable). If not merged, the implementer **states** the dependency in the return packet.

**Hard rule:** **Composer 2** (`composer-2`) for **orchestrator** and **every** sub-agent (implementer, code reviewer, fixer). **No** other model. If a model is unavailable, **stop** and tell the human; do not substitute.

**Skills:** `superpowers:subagent-driven-development`, `superpowers:verification-before-completion` before closing the run. Read `AGENTS.md` and `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc` for `lib/**` import bounds.

**Authoritative code areas:** `lib/algorithms/floatingPcaV2/allocator.ts`, `repairMoveSelection.ts`, `repairMoves.ts` (A1), optional new `donorReliefPolicy.ts`, `repairAudit.ts` for donor **priority** (remaining true Step-3 ranked coverage, material tie).

---

## A. Human pre-flight (before every sub-agent)

1. Set chat / sub-agent model to **Composer 2** explicitly. Sub-agents **do not** always inherit the parent model—**verify** each time.
2. Read **§2** and **§7** of the donor relief plan: trigger **`b1:donate` only**, **capped-3** donor **queue** + **priority** (1st: remaining ranked quality; 2nd: material short; 3rd: stable order), **per-iteration** boost. Implementation **must** follow **§1–2**, not only the short Task 4 one-liners if they drifted.

---

## B. Orchestrator prompt — paste into a **new** Composer 2 lead chat

```text
You are the ORCHESTRATOR for **Floating PCA V2 — bounded donor relief (rebalance)**. Model: **Composer 2 only** for you and all sub-agents. Do not switch.

YOUR ROLE (strict):
- **Coordinate only.** Do NOT write or apply production `lib/**` or `features/**` code in this chat. All implementation and fixes = **sub-agents** (Composer 2). If you have read-only file access, use it only to route work; do not type patches.
- **One workflow:** `superpowers:subagent-driven-development` — (1) IMPLEMENTER completes Tasks 1–5 in the plan in order, (2) you run or delegate **GATES** from repo root, (3) CODE REVIEWER on the whole change, (4) if FAIL, FIXER with numbered blockers, re-run GATES, new REVIEW; repeat until PASS and gates green.
- **Single source of truth:** `docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-rebalance-plan.md` — re-read **§0–2, §4 Tasks, §5, §6, §7** before dispatching. Cross-read `2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md` for A1 prerequisites.
- **Handoff file for paste blocks (Sections C–E):** `docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-orchestrator-handoff-prompt.md`

GATES (after implementer or fixer reports done; you may delegate a **Composer 2** shell sub-agent to run the same):
```
npm run lint
npm run build
npm run test:smoke
npx tsx --test tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts
npx tsx --test tests/regression/f101-step34-v2-b1-allows-same-pca-sway-before-donation.test.ts
npx tsx --test tests/regression/f134-step34-b1-suppressed-with-anchors-when-pending-satisfied.test.ts
```
Add when created: `donorReliefPolicy` unit test path, `f136` (or as named in plan) regression. Run `npx tsx --test` on new tests.

You MAY update the plan `docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-rebalance-plan.md` with **- [x]** for Tasks 1–5 and a **Notes** line in §8 (date, commit, gates, reviewer) when the loop is clean—if your workflow allows. Do not invent manual sign-offs.

**Start:** Dispatch **Section C** (IMPLEMENTER) from the handoff file, full Tasks 1–5.
End of orchestrator prompt.
```

---

## C. Sub-agent — IMPLEMENTER (full plan, Composer 2)

New sub-agent, **Composer 2**. Paste the block below.

```text
MODEL LOCK: **Composer 2** only. If this chat is not Composer 2, output only: "Wrong model: switch to Composer 2, then resend." Do not write code.

You are the IMPLEMENTER for **Bounded donor relief after b1:donate** (Floating PCA V2).

Single source of truth: `docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-rebalance-plan.md` — **Tasks 1 through 5** in order. Authoritative product rules: **§0–2** and **§7** (trigger `b1:donate` only, **not** `b1:move`; cap-3 donor **queue** + **priority**; **per-iteration** boost; tie-break on `compareScores === 0` only).

Prerequisite: A1 work from `2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md` available in the branch (or say **BLOCKED** in return if missing).

Rules: `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc` / `AGENTS.md`; do not break `lib/**` layering. No new “block B1 donation” from donor team identity—reverted policy; this feature is **relief** + **ties**, not blocking B1.

Work: Implement every **Task 1–5** checklist. Add **regression** and **unit** files as the plan says (e.g. `f136`, `donorReliefPolicy.test.ts`).

Gates (from repo root, report pass/fail + key error lines):
```
npm run lint && npm run build && npm run test:smoke
npx tsx --test tests/regression/f98-step34-v2-bounded-repair-blocks-harmful-donor-donation.test.ts
npx tsx --test tests/regression/f101-step34-v2-b1-allows-same-pca-sway-before-donation.test.ts
npx tsx --test tests/regression/f134-step34-b1-suppressed-with-anchors-when-pending-satisfied.test.ts
```
Plus any new test paths you add.

Return to orchestrator: files created/changed; gate results; ambiguities; any deviation from plan with reason.

End of implementer prompt.
```

---

## D. Sub-agent — CODE REVIEWER (after green gates, Composer 2)

New sub-agent, **Composer 2**.

```text
MODEL LOCK: **Composer 2** only. If not Composer 2, output: "Wrong model: switch to Composer 2, then resend." Do not review in wrong model.

You are a CODE REVIEWER for **bounded donor relief (Floating PCA V2)**.

Read the **diff** / touched files and the plan:
- `2026-04-25-floating-pca-v2-bounded-donor-relief-rebalance-plan.md` (§1–2, §4, §5, §6, §7)

Check:
- Trigger is **`b1:donate` only**; **`b1:move` does not** fill the donor queue.
- Donor **queue** cap **3**, **priority** per **§2** (ranked-remaining, then material), **per-iteration** boost, tie-break only when `compareScores === 0` (no override of strict improvement).
- No reintroduction of “block B1 from donating by donor defect list” debug behavior.
- `MAX_REPAIR_ITERATIONS` respected; no infinite donor-only loop.
- Tests: new unit + f136 (or as named) + f98/f101/f134 still meaningful.

Output:
1) **Verdict:** PASS | PASS with non-blocking notes | FAIL (blocking)
2) **Blocking** list (numbered) or "None"
3) Non-blocking suggestions
4) Confirm import/layering per AGENTS/ARCHITECTURE

Do not apply fixes; use Section E (FIXER) for blocks.

End of reviewer prompt.
```

---

## E. Sub-agent — FIXER (blocking review, Composer 2)

New sub-agent, **Composer 2**. Replace `[BLOCKERS]` with the reviewer's **numbered** blocking list.

```text
MODEL LOCK: **Composer 2** only. If not Composer 2, output: "Wrong model: switch to Composer 2, then resend." Do not write in wrong model.

You are a FIXER for **bounded donor relief (Floating PCA V2)**. Remediate every blocking item below. Same plan and §2/§7 constraints as implementer.

[BLOCKERS]

Then from repo root:
`npm run lint && npm run build && npm run test:smoke`
and the `npx tsx` regression list from the implementer prompt, plus new tests.

Return: files changed; gate results; one line per blocker: fixed / not applicable + how.

End of fixer prompt.
```

---

## F. File quick reference

| What | Path |
|------|------|
| **Plan (single implementation doc)** | `docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-rebalance-plan.md` |
| A1 prerequisite (reference) | `docs/superpowers/plans/2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md` |
| **This handoff (paste B–E)** | `docs/superpowers/plans/2026-04-25-floating-pca-v2-bounded-donor-relief-orchestrator-handoff-prompt.md` |

---

## G. Document history

| Date | Change |
|------|--------|
| 2026-04-25 | Initial handoff: Composer 2 only; subagent-driven (implementer → gates → reviewer → fixer); single plan doc; A1 prerequisite. |