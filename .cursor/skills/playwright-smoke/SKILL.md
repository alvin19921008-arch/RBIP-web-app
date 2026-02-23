---
name: playwright-smoke
description: Run fast Playwright smoke tests as refactor gates. Use when the user asks to verify behavior preservation, smoke test after changes, or validate the schedule/allocation workflow.
---

# Playwright Smoke Testing

## Purpose
Fast, token-efficient validation that refactors preserve behavior. Step-wise gate before proceeding to next phases.

## Activation Triggers
- User says: "smoke test", "run smoke tests", "verify behavior preserved"
- After refactor sub-phases (per REFACTOR_PLAN.md)
- Before finalizing schedule/allocation changes

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run test:smoke` | Standard headless run |
| `npm run test:smoke:headed` | Interactive troubleshooting |
| `npm run test:smoke:debug` | Step-through debugging |

## Refactor Gate Checklist
Run after each sub-phase:
1. `npm run lint`
2. `npm run build`
3. `npm run test:smoke`

Only proceed if all pass.

## Test Writing Guidelines
- Use `@smoke` tag for fast workflow tests
- Prefer functional assertions (URL, button state, dialog visibility)
- Avoid snapshot/visual diff assertions
- Chromium-only, single worker for determinism
- Trace/screenshot only on failure

## Auth Strategy
1. Prefer localhost dev auto-login (`/api/dev/auto-login`)
2. Fallback: `PW_LOGIN_IDENTIFIER` + `PW_LOGIN_PASSWORD` env vars
3. If neither: skip with clear message (not noisy failure)

## Scope Guard
- Keep tests read-mostly and minimally invasive
- Do not introduce broad E2E suites here
- Expand coverage only when failure patterns show gaps
