---
name: playwright-smoke-rbip
description: Runs fast, project-specific Playwright smoke tests for the schedule workflow after refactor steps. Use when the user asks to verify behavior preservation, smoke test refactor changes, or run step-wise regression checks.
---

# Playwright Smoke Testing (RBIP)

## Purpose

Provide a fast, token-efficient way to validate that refactor changes preserve behavior.

## When To Use

- After each refactor sub-phase (step-wise gate)
- Before moving to next phase in `REFRACTOR_PLAN.md`
- Before finalizing any schedule/allocation refactor

## Token-Efficient Rules

- Prefer Playwright Node tests over LLM browser automation for repeated checks.
- Run only `@smoke` tests unless the user asks for broader coverage.
- Avoid snapshot/visual-diff assertions by default.
- Assert functional outcomes (URL, buttons, step text, dialog visibility, persisted behavior).

## Project Commands

```bash
# Standard smoke run (headless)
npm run test:smoke

# Interactive troubleshooting
npm run test:smoke:headed

# Step-through debugging
npm run test:smoke:debug
```

## Auth Strategy

1. Prefer localhost dev auto-login (`/api/dev/auto-login`) for fast local runs.
2. If unavailable, use `PW_LOGIN_IDENTIFIER` and `PW_LOGIN_PASSWORD`.
3. If neither is available, tests should skip with clear message (not fail noisily).

## Refactor Gate Checklist

Run after each sub-phase:

1. `npm run lint`
2. `npm run build`
3. `npm run test:smoke`

Proceed to next phase only if all pass.

## Scope Guard

- Keep smoke tests read-mostly and minimally invasive.
- Do not introduce broad E2E suites here; this skill is for fast safety gates.
- Expand test coverage only when failure patterns show gaps.

