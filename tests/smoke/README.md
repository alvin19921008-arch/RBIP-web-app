# Playwright Smoke Tests (RBIP)

Fast, behavior-preserving smoke checks for refactor gates.

## Scope

- Keep this suite small and stable (`@smoke` tests only).
- Prefer functional assertions over screenshot/snapshot comparison.
- Use this after each refactor sub-phase before moving to the next one.

## Commands

```bash
# Headless smoke run
npm run test:smoke

# Interactive run (local debugging)
npm run test:smoke:headed

# Step-through debugging
npm run test:smoke:debug

# List discovered smoke tests
npm run test:smoke -- --list
```

## Auth Run Matrix

| Environment | Auth Method | Setup | Notes |
|---|---|---|---|
| Localhost dev | `/api/dev/auto-login` | none | Fastest path; used by default in smoke tests |
| Shared dev/staging | Login credentials | `PW_LOGIN_IDENTIFIER`, `PW_LOGIN_PASSWORD` | Used if auto-login is unavailable |
| CI | Login credentials | CI secrets for `PW_LOGIN_IDENTIFIER`, `PW_LOGIN_PASSWORD` | Keep secrets in CI vault; never commit |

## Example Runs

```bash
# Localhost (auto-login path)
npm run test:smoke

# Remote/base URL + credential fallback
PLAYWRIGHT_BASE_URL="https://your-dev-host" \
PW_LOGIN_IDENTIFIER="your-user" \
PW_LOGIN_PASSWORD="your-pass" \
PW_NO_WEBSERVER=1 \
npm run test:smoke
```

## Refactor Gate Checklist (Step-wise)

Run after each refactor sub-phase:

1. `npm run lint`
2. `npm run build`
3. `npm run test:smoke`

Only proceed to the next sub-phase when all pass.

## Failure Triage (Fast Path)

1. Re-run single test in headed mode:
   - `npx playwright test tests/smoke/schedule-core.smoke.spec.ts --headed`
2. If auth-related:
   - verify localhost and `/api/dev/auto-login` availability, or
   - verify `PW_LOGIN_IDENTIFIER` / `PW_LOGIN_PASSWORD`
3. If selector-related:
   - confirm UI text/labels changed intentionally
   - update locator to role/name-based selector where possible

## Design Rules For New Smoke Tests

- Tag every smoke test with `@smoke`.
- Keep each test focused on one user-critical behavior.
- Avoid brittle timing waits; rely on `expect(...)` and URL/role/text state.
- Keep tests read-mostly and minimally invasive.

