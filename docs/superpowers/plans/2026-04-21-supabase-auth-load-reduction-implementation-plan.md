# Supabase auth and API load reduction — implementation plan

> **For agentic workers:** Execute phases in order unless a later phase is explicitly scoped alone. Use checkbox (`- [ ]`) syntax for tracking.

---

## 1. Goal and context

The organization’s Supabase project sits under shared quota and throttling. In local development, logs show slow handling in `proxy.ts`, slow `GET /api/feedback`, duplicate auth work on navigation, and overall pressure on Supabase auth APIs. The objective is to **reduce redundant Supabase `getUser` / session traffic and heavy badge queries** without changing the security posture of production.

**Production note:** In production, `proxy.ts` **skips `getUser()`** (middleware stays lighter than dev). Much of the pain and risk of change concentrates in **development** (broad matcher + per-request auth) and in **duplicate server-side auth** on nested layouts and API utilities.

---

## 2. Non-goals

- Do **not** weaken production authentication or authorization checks.
- Do **not** use `getSession()` alone as the trusted server identity source (cookies can be forged without server verification; keep `getUser()` or equivalent verified identity where trust is required).

---

## 3. Findings summary

Condensed from code review:

- **`proxy.ts`:** In development, `getUser()` runs on nearly every request the matcher covers; the matcher is broad, so auth work amplifies quickly.
- **`lib/auth.ts`:** `getCurrentUser()` is **not** wrapped in `React.cache()`, so identical work may repeat within a single request tree.
- **Nested layouts:** `app/(dashboard)/layout.tsx` and `app/(dashboard)/dashboard/layout.tsx` both call `requireAuth` and `getAccessSettings`, which stacks duplicate `getUser` / access resolution for `/dashboard/*` routes.
- **`components/layout/Navbar.tsx`:** `createClientComponentClient()` may be **recreated per render** (unstable reference), encouraging extra client-side churn. The feedback badge hits `GET /api/feedback` immediately and on a **60s poll**, without idle deferral or SWR-style deduplication (though `showFeedbackReview` already gates whether the fetch runs).
- **`app/api/feedback` (GET):** Badge-oriented reads are relatively heavy (admin client, broad `select *`-style payload for listing).
- **`getRequesterContext` in `app/api/accounts/_utils.ts`:** Stacks with layout + middleware auth, multiplying server-side Supabase calls on account-related API routes.

---

## 4. Phased work

### Phase A — Quick wins (dedupe and cache per request)

**Tasks**

- [ ] Wrap `getCurrentUser()` (and any thin wrappers that always mirror it) in `React.cache()` so a single RSC/request tree reuses one Supabase `getUser` result where appropriate.
- [ ] Consolidate dashboard auth: ensure **one** of the nested layouts owns `requireAuth` + `getAccessSettings`, or lift shared access settings to the parent layout only, so `/dashboard/*` does not pay twice.
- [ ] Stabilize the browser Supabase client in `Navbar.tsx` (e.g. `useMemo` / module singleton pattern consistent with the rest of the app) so renders do not churn clients unnecessarily.

**Files to touch (expected)**

- `lib/auth.ts`
- `app/(dashboard)/layout.tsx`
- `app/(dashboard)/dashboard/layout.tsx`
- `components/layout/Navbar.tsx`

**Risk notes**

- `React.cache()` must only wrap **pure** request-scoped reads; avoid caching across users or mutating cached objects.
- Layout refactors can change **when** redirects run; verify unauthenticated and partial-access users still land correctly.

---

### Phase B — Middleware / `proxy.ts` dev throttling

**Tasks**

- [ ] Narrow the middleware matcher where safe so static assets and health checks skip auth.
- [ ] Add a **development-only** path that reduces `getUser()` frequency (e.g. trust short-lived in-memory flag, debounce per cookie session, or skip repeat verification within a tight TTL **only in dev**), while keeping production behavior unchanged (including production’s existing skip of `getUser()` in `proxy.ts`).
- [ ] Document the dev vs prod behavior in code comments so future edits do not “fix” dev by reintroducing load in prod.

**Files to touch (expected)**

- `proxy.ts` (or project’s middleware entry if renamed)
- Possibly `middleware.ts` if split from proxy

**Risk notes**

- Any TTL or debounce in dev must **never** relax production verification.
- Matcher changes can accidentally expose routes; pair with explicit route audits.

---

### Phase C — Navbar feedback badge: defer, SWR, lighter API

**Tasks**

- [ ] Defer the first `/api/feedback` fetch until idle (`requestIdleCallback` / `setTimeout(0)` with fallback) or after first paint when `showFeedbackReview` is true.
- [ ] Introduce **SWR** (or existing data-fetch helper) for the badge: dedupe in-flight requests, configurable **`refreshInterval`** and **`dedupingInterval`**, and respect visibility/focus if the app already uses those patterns elsewhere.
- [ ] Add a **dedicated lightweight badge endpoint** or query parameters on `GET /api/feedback` that returns only counts / minimal fields for admins (avoid `select *` for badge-only use).

**Files to touch (expected)**

- `components/layout/Navbar.tsx`
- `app/api/feedback/route.ts` (or handler)
- Possible small `lib/` helper for SWR key and types

**Risk notes**

- Stale badge data is acceptable only within agreed windows; align `refreshInterval` with product expectations.
- New API shapes need TypeScript updates and any consumers of the full list endpoint unchanged.

---

### Phase D — Optional larger refactors

**Tasks**

- [ ] Audit `getRequesterContext` callers; collapse redundant `getUser` with layout-level context or pass verified user id from a single server entry point per request.
- [ ] Consider **route segment config** or shared layout data loaders to fetch access settings once per segment tree (patterns already idiomatic in App Router).
- [ ] Broader Supabase client lifecycle audit (server vs browser) for other hot components.

**Files to touch (expected)**

- `app/api/accounts/_utils.ts`
- Call sites under `app/api/accounts/`
- Related auth utilities in `lib/auth.ts` / server client factories

**Risk notes**

- API refactors touch security boundaries; prefer incremental PRs with parity tests.

---

## 5. Acceptance criteria

- **Fewer redundant `getUser` calls per navigation** on `/dashboard/*` (verify in dev logs or Supabase dashboard): nested layout duplicate eliminated or reduced to a single verified fetch per request where layouts compose.
- **`getCurrentUser` memoized per request** via `React.cache()`: repeated calls in the same RSC tree do not each trigger a new Supabase round-trip (measurable via instrumentation or logging in dev).
- **Feedback badge:** initial fetch **deferred** from critical path; SWR (or equivalent) **dedupes** overlapping requests; `refreshInterval` / stale window documented in code (e.g. ≥60s behavior preserved or intentionally changed with team agreement).
- **`GET /api/feedback` for badge:** response payload **smaller** (fewer columns / dedicated badge response) for the Navbar path, with p95 latency improved in dev.
- **Production:** no regression in auth strictness; `proxy.ts` continues to **skip `getUser()`** in production as today.

---

## 6. Testing and verification

- **Dev server:** Load `/dashboard` and child routes; watch terminal timings for `proxy.ts` and layout duration; confirm fewer duplicate auth lines after Phase A.
- **Network tab:** Navbar should not spam `/api/feedback` on every navigation; polling should show SWR/deduping behavior where implemented.
- **Supabase dashboard (optional):** Auth API request count during a fixed click script lower than baseline.
- **Regression areas:** sign-in and sign-out flows; role-gated dashboard sections; **feedback review** for users with `showFeedbackReview`; admin badge accuracy; **accounts** API routes that use `getRequesterContext`.
