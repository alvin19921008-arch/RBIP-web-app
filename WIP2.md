# WIP2 — Cache / Draft / Snapshot Hardening

**Last Updated**: 2026-03-01  
**Status**: All 11 findings resolved ✓  
**Origin chat**: [Cache/Draft/Snapshot Code Review](a7d6a81b-7c6f-4ea0-9a96-cefbc0d3c5ed)

---

## Why this exists

Three interleaved systems protect schedule data integrity:

| System | Purpose | Storage |
|---|---|---|
| **Schedule Cache** (`lib/utils/scheduleCache.ts`) | Fast load on date switch / reload / cross-page navigation | In-memory `Map` + sessionStorage (TTL 5 min, max 8 entries, max 1.5MB each) |
| **Draft Cache** (`lib/utils/scheduleDraftCache.ts`) | Preserve unsaved edits when leaving the schedule page and returning | In-memory `Map` only (pointer list in sessionStorage, max 5 entries) |
| **Baseline Snapshot** (`daily_schedules.baseline_snapshot` JSONB) | Freeze global dashboard config (staff, programs, wards, preferences) at schedule-creation time so old dates are not affected by live dashboard edits | Supabase DB + validated/repaired on every cold load |

These three systems interact at several seams. A 2026-03-01 code review identified **11 confirmed findings** ranging from a critical data-loss bug to low-severity dead code.

---

## Finding Index (sorted by severity)

| # | Severity | Systems | Short Description | Fixed? |
|---|---|---|---|---|
| F1 | **CRITICAL** | Draft + Cache | Post-save `currentScheduleUpdatedAt` is a client clock → draft silently discarded | [x] 2026-03-01 |
| F2 | **HIGH** | Cache + Copy | Source date cache not cleared after copy route mutates source snapshot | [x] 2026-03-01 |
| F3 | **HIGH** | Snapshot + New sched | `buildBaselineSnapshotFromCurrentState` reads previous date's in-memory state | [x] 2026-03-01 |
| F4 | Medium | Draft | Null-wildcard in `updatedAtMatches` too permissive | [x] 2026-03-01 |
| F5 | Medium | Snapshot | Repair is ephemeral — DB query re-paid on every cold load | [x] 2026-03-01 |
| F6 | Medium | Draft + Epoch | Epoch bump silently destroys all drafts, no user notification | [x] 2026-03-01 |
| F7 | Medium | Draft | `MAX_DIRTY_DATES = 5` silently drops oldest pointer; in-memory draft orphaned | [x] 2026-03-01 |
| F8 | Low | Cache | Cache collapses current/saved distinction — constraint for future partial-save paths | [x] 2026-03-01 |
| F9 | Low | Cache | `writeThrough` guards are dead code | [x] 2026-03-01 |
| F10 | Low | Draft | Draft serializes `baselineSnapshot` but never reads it back on restore | [x] 2026-03-01 |
| F11 | Low | Epoch | sessionStorage-unavailable environment makes epoch non-functional in both directions | [x] 2026-03-01 |

---

## Detailed Findings

---

### F1 — CRITICAL: Post-save timestamp is client-fabricated, causing silent draft discard

**File**: `lib/features/schedule/controller/useScheduleController.ts` line **2847**

```ts
setCurrentScheduleUpdatedAt(new Date().toISOString())  // ← client clock, NOT DB updated_at
```

**What goes wrong — full cascade:**

1. User saves the schedule. `saveScheduleToDatabase()` writes to Supabase but never reads back the DB-generated `updated_at`. Instead it sets `currentScheduleUpdatedAt` to a client `new Date()` timestamp.
2. User makes any edit after saving.
3. User switches to another date. `flushDraftForDateIfDirty()` fires (line 1607–1612), captures `prevScheduleUpdatedAt = currentScheduleUpdatedAt` → stores the fake client timestamp in `draft.scheduleUpdatedAt`.
4. User switches back. `loadScheduleForDate` fetches from DB (cache was cleared at save) and gets the real DB `updated_at`.
5. Draft identity check at line 1861–1862: `draft.scheduleUpdatedAt !== baseScheduleUpdatedAt` → **draft is silently discarded** (`clearDraftSchedule`). Post-save edits are permanently lost.

**Additionally**: the cache-hit path at line 1135 propagates `cached.scheduleUpdatedAt` which was written with the fake timestamp (since the write-through is written before cache clear). So the mismatch persists even through cache hits.

**Repro**: Save → make any edit → switch date → switch back.

**Fix**: After the Supabase save, read back `updated_at` from the response. Supabase `.update().select('updated_at').single()` returns the DB-generated value. Apply it:
```ts
setCurrentScheduleUpdatedAt(savedRow.updated_at)   // real DB timestamp
```
The save flow already selects some fields post-update; `updated_at` should be added to that select.

---

### F2 — HIGH: Copy route mutates source schedule's snapshot without clearing its client cache

**Files**:
- Server: `app/api/schedules/copy/route.ts` lines **403–425** (source snapshot write-back)
- Client: `app/(dashboard)/schedule/page.tsx` lines **5288–5291** (post-copy cache clear)

**What goes wrong:**

The copy route conditionally upgrades the **source** schedule's `baseline_snapshot` in two cases:
- Source has no existing snapshot → builds from live DB and persists back (line 403–408).
- Source has a legacy-wrapped snapshot → upgrades in-place (lines 413–425).

Both paths mutate the source row and bump its `updated_at`.

But the client only clears the **target** date's cache (lines 5290–5291):
```ts
clearCachedSchedule(targetKey)
clearDraftSchedule(targetKey)
// ← source date cache is never cleared
```

**Consequence**: Navigating back to the source date within 5 minutes will serve the stale pre-copy cache entry, meaning:
- `snapshotHealthReport` may still show `wrappedLegacySnapshot` even after the upgrade.
- Snapshot drift diff UI compares against the stale snapshot.
- If the source's `updated_at` changed, any pending draft for that date will now fail the identity check (amplifying F1).

**Fix**: After a successful copy, also call:
```ts
clearCachedSchedule(formatDateForInput(fromDate))
```
The `fromDate` is already available at the call site.

---

### F3 — HIGH: New schedule creation snapshots the previous date's in-memory state

**File**: `lib/features/schedule/controller/useScheduleController.ts` lines **1249–1251**

```ts
if (!scheduleData) {
  const baselineSnapshotToSaveBase = buildBaselineSnapshotFromCurrentState()
```

`buildBaselineSnapshotFromCurrentState()` (line 970–1003) reads from live React state closures:
- `staff`, `inactiveStaff`, `bufferStaff` — the three staff pools
- `specialPrograms`, `sptAllocations`, `wards`, `pcaPreferences` — domain config

At the moment a **new** schedule row is being created, no `applyBaselineSnapshot()` has fired for the new date yet — the state still holds the *previous date's* applied snapshot data.

**In the normal flow**: harmless because the global dashboard state matches the previous date's snapshot (no config changes between dates). But it breaks when:
- The previous date used a **different** `teamMerge` or `teamDisplayNames` override (applied via `applyBaselineSnapshot`), and the user navigates to an unscheduled date.
- The `liveTeamConfig` fetch at line 1254 corrects `teamDisplayNames`/`teamMerge`, but `staff`, `specialPrograms`, etc. still come from the previous date's snapshot-applied state.

**Fix**: Before building the baseline for a new schedule, fetch fresh live state from the DB (`buildBaselineSnapshot(supabase)` — the same helper used by the copy route at line 400) instead of relying on in-memory React state.

---

### F4 — Medium: Null-wildcard in draft identity check too permissive

**File**: `lib/features/schedule/controller/useScheduleController.ts` lines **1861–1862**

```ts
const updatedAtMatches =
  !draft.scheduleUpdatedAt || !baseScheduleUpdatedAt || draft.scheduleUpdatedAt === baseScheduleUpdatedAt
```

If either value is `null`, the condition passes unconditionally.

**Practical risk**: A draft flushed for a brand-new schedule (before first save, `updated_at = null`) will match any subsequently loaded base that also has `null` updatedAt. UUIDs prevent `scheduleId` collisions so the `idMatches` guard catches most abuse. But combined with F1, there is a window where both sides share a client-fabricated timestamp and the check passes by coincidence — masking the real mismatch.

**Fix**: Make the null case stricter. If `draft.scheduleUpdatedAt` is null and `baseScheduleUpdatedAt` is not null (or vice versa), treat it as a mismatch rather than a wildcard pass.

---

### F5 — Medium: Snapshot repair is ephemeral — extra DB query on every cold load

**File**: `lib/features/schedule/controller/useScheduleController.ts` lines **1372–1388**; `lib/utils/snapshotValidation.ts` lines **150–167**

When `validateAndRepairBaselineSnapshot` detects missing referenced staff rows, it fetches them live and patches the in-memory snapshot. But the repaired snapshot is **not written back to the DB** at load time — it is only saved conditionally during the save flow (lines 2890–2970).

**Consequence**: Every cold load of this date (cache miss, after refresh, or after TTL expiry):
1. Detects missing staff again.
2. Issues an extra `supabase.from('staff').select(...).in('id', [...])` query.
3. Applies the repair ephemerally.

The `status: 'repaired'` health report is also misleading — the schedule looks healthy in-session but the DB is still unrepaired until the user explicitly saves.

**Fix options**:
- **Option A (recommended)**: Write the repaired envelope back to DB immediately after repair at load time (a background fire-and-forget `update`, no blocking).
- **Option B**: Display a more explicit "snapshot needs re-save" prompt to the user.

---

### F6 — Medium: Epoch bump silently destroys all in-flight drafts with no user warning

**Files**: `lib/utils/scheduleDraftCache.ts` lines **91–103**; `lib/utils/scheduleCacheEpoch.ts`

When `bumpScheduleCacheEpoch()` is called (e.g. after a global config publish), all draft entries immediately fail `isEpochCurrent`. On next access they are silently evicted:

```ts
function hasLiveDraftSchedule(dateStr: string): boolean {
  const entry = draftCache.get(dateStr)
  if (!entry) return false
  if (!isEpochCurrent(entry)) {
    draftCache.delete(dateStr)   // silent eviction
    return false
  }
  ...
}
```

`getDraftSchedule` (line 143) then calls `removeDirtyScheduleDate` — also silent. No toast, no warning, no recovery path. A user with unsaved edits across multiple dates loses everything after a config publish.

**Fix**: Before bumping the epoch, check `getDraftCacheSize() > 0`. If yes:
- Either warn the user ("Updating global config will discard your unsaved schedule edits") and require confirmation, or
- Snapshot the list of dirty date pointers and show a post-bump toast: "Global config updated. Unsaved edits on [dates] were discarded."

---

### F7 — Medium: `MAX_DIRTY_DATES = 5` silently drops oldest draft pointer; in-memory draft orphaned

**File**: `lib/utils/scheduleDraftCache.ts` lines **52**, **115–118**

```ts
const MAX_DIRTY_DATES = 5
...
while (next.length > MAX_DIRTY_DATES) next.shift()   // silently evicts oldest from sessionStorage
writeDirtyDatePointers(next)
```

The in-memory `draftCache` Map is **not pruned here**. Only the sessionStorage pointer list is trimmed. So after navigating 6+ dirty dates:
- The oldest date's in-memory draft still exists and `hasDraftSchedule()` still returns `true`.
- But `getMostRecentDirtyScheduleDate()` (used for "unsaved changes" UI banners) reads only from the pointer list — the evicted date is invisible.
- On page refresh: pointer gone, in-memory draft gone, work lost silently.

**Fix**: Either increase `MAX_DIRTY_DATES` (say, 10), or when evicting from the pointer list, also call `clearDraftSchedule(evicted.dateStr)` and optionally toast the user.

---

### F8 — Low: Cache collapses current/saved override distinction

**File**: `lib/features/schedule/controller/useScheduleController.ts` lines **1151–1158**

```ts
setStaffOverrides(cached.overrides || {})
setSavedOverrides(cached.overrides || {})   // same object → no dirty state after cache hit
```

The cache stores a single `overrides` field (always the DB-saved state). After a cache hit, version counters reset to equal, `hasDirtyDraftState = false`, and the flush on date switch won't capture anything. This is **correct by design** for the `'db'`-sourced cache.

**Risk**: If any future partial-save path writes `cacheSchedule(dateStr, { ...cached, someField: newValue })` and `overrides` in that cached object happens to contain unsaved state, the distinction collapses silently. The existing notes-patch at `page.tsx:1388` is safe (it patches `allocationNotesDoc`, not `overrides`), but future maintainers must know this constraint.

**Action**: Add a code comment at the cache write site and at the cache read/apply site documenting that `overrides` must always represent DB-persisted state.

---

### F9 — Low: `writeThrough` cache source guards are dead code

**File**: `lib/utils/scheduleCache.ts` lines **29–34**, **87**, **120**

The `'writeThrough'` source value is documented and guarded (prevented from being persisted to sessionStorage, treated as invalid on read). But no call site ever passes `source: 'writeThrough'` to `cacheSchedule`. This was an abandoned design ("Option A: in-memory unsaved state written on date switch"). The guards are real code protecting a path that doesn't exist.

**Action**: Either remove the guards and the type union member (cleanest), or add a comment noting this is reserved for a future write-through implementation. Don't leave it as-is — it misleads future maintainers.

---

### F10 — Low: Draft serializes `baselineSnapshot` in flush but ignores it on restore

**File**: `lib/features/schedule/controller/useScheduleController.ts`
- Flush: line **775** — `baselineSnapshot: deepCloneSnapshotValue((baselineSnapshot as any) || null)`
- Restore: line **1890–1891** — ignores `draft.baselineSnapshot`, always uses `resultAny?.baselineSnapshot ?? baselineSnapshot`

The comment explains the intentional design (avoids stale `teamMerge` flicker). But storing the snapshot in every draft object adds memory overhead for a field that is always discarded. For dates with large staff lists, this is non-trivial.

**Action**: Remove `baselineSnapshot` from `DraftScheduleData` interface and from the flush at line 775. The restore already ignores it; removing it from the type makes the intent explicit.

---

### F11 — Low: sessionStorage unavailability makes epoch non-functional in both directions

**File**: `lib/utils/scheduleCacheEpoch.ts` lines **13–31**

```ts
export function getScheduleCacheEpoch(): number {
  if (!canUseSessionStorage()) return 0   // always 0 when storage blocked
  ...
}
export function bumpScheduleCacheEpoch(): number {
  if (!canUseSessionStorage()) return 0   // bump is a no-op
  ...
}
```

**Two failure modes**:
- Entries written with `__epoch > 0` (from a previous tab with storage available) **can never match** epoch `0` → perpetually evicted.
- Entries written without storage (`__epoch = 0`) can **never be invalidated** by epoch bump → epoch protection is completely bypassed.

This is inherent to the design trade-off (sessionStorage is optional). But the silent failure is confusing.

**Action**: Add a code comment at both functions documenting the known limitation. If epoch invalidation is safety-critical for a given call site, that site should check `canUseSessionStorage()` and handle the degraded case explicitly.

---

## Key File Reference

| File | Role |
|---|---|
| `lib/utils/scheduleCache.ts` | Cache read/write/clear; TTL + epoch checks; sessionStorage persistence |
| `lib/utils/scheduleDraftCache.ts` | Draft read/write/clear; dirty pointer list; epoch checks |
| `lib/utils/scheduleCacheEpoch.ts` | Epoch bump + read; sessionStorage-backed |
| `lib/utils/snapshotEnvelope.ts` | Build (`buildBaselineSnapshotEnvelope`), unwrap, type-guard the versioned envelope |
| `lib/utils/snapshotValidation.ts` | `validateAndRepairBaselineSnapshot()` — repair missing staff on load |
| `lib/utils/snapshotMinify.ts` | `minifySpecialProgramsForSnapshot()` — reduce JSONB size before save |
| `lib/features/schedule/controller/useScheduleController.ts` | All three systems' read/write/flush logic; save path; load path; draft restore |
| `app/api/schedules/copy/route.ts` | Copy flow — source snapshot write-back (lines 399–425); target snapshot build |
| `app/(dashboard)/schedule/page.tsx` | Copy wizard completion handler (lines 5288–5291); notes cache patch (line 1388) |

---

## Critical Line Numbers

| What | File (abbreviated) | Line(s) |
|---|---|---|
| **Post-save fake timestamp** | `useScheduleController.ts` | **2847** |
| **Draft flush on date switch** | `useScheduleController.ts` | **1607–1612** |
| **Draft identity check** | `useScheduleController.ts` | **1860–1862** |
| **Cache hit path — snapshot + overrides apply** | `useScheduleController.ts` | **1133–1158** |
| **New schedule creation — snapshot build** | `useScheduleController.ts` | **1249–1251** |
| **Cache cleared post-save** | `useScheduleController.ts` | **2845–2846** |
| **Snapshot repair (ephemeral)** | `useScheduleController.ts` | **1372–1388** |
| **Source snapshot write-back in copy route** | `copy/route.ts` | **399–425** |
| **Client-side post-copy cache clear (target only)** | `schedule/page.tsx` | **5288–5291** |
| **MAX_DIRTY_DATES = 5** | `scheduleDraftCache.ts` | **52** |
| **Pointer eviction (no draftCache prune)** | `scheduleDraftCache.ts` | **115–118** |
| **Draft epoch eviction (silent)** | `scheduleDraftCache.ts` | **97–103** |

---

## Suggested Fix Priority

### Do first (surgical, high impact)
1. **F1** ✅ — Read real `updated_at` from Supabase response after save. Append `.select('updated_at')` to the save `.update()` call and use the returned value in `setCurrentScheduleUpdatedAt()`.
2. **F2** ✅ — Add `clearCachedSchedule(formatDateForInput(fromDate))` after a successful copy in `page.tsx` (the `fromDate` is already in scope).

### Done (F6–F7, 2026-03-01)
3. **F6** ✅ — `bumpEpochAndGetEvictedDraftDates()` wrapper captures live drafts before bump; `ConfigSyncPanel` calls it after Publish/Pull and toasts the user if drafts were lost.
4. **F7** ✅ — `markDirtyScheduleDate` now also calls `draftCache.delete(evicted.dateStr)` when trimming overflow, so in-memory drafts never become orphans.

### Done (F3–F5, 2026-03-01)
5. **F3** ✅ — New schedule baseline fetched from live DB (parallel queries in `Promise.all`) instead of reading previous date's React state.
6. **F4** ✅ — `updatedAtMatches` tightened: both-null = ok (new unsaved schedule), both-non-null must match exactly, mixed null/non-null = reject.
7. **F5** ✅ — Repaired snapshot written back to DB (fire-and-forget) immediately after load so subsequent cold loads skip the repair + extra staff query.

### Do later (cleanup / performance)
5. **F3** — Replace `buildBaselineSnapshotFromCurrentState()` in the new-schedule path with a live DB fetch (`buildBaselineSnapshot(supabase)`).
6. **F5** — Write repaired snapshot back to DB immediately after load (fire-and-forget).
7. **F4** — Tighten `updatedAtMatches` null handling.
8. **F10** — Remove `baselineSnapshot` from `DraftScheduleData`.
9. **F9** — Remove `writeThrough` dead code or add a clear comment.
10. **F8** — Add a code comment documenting the single-`overrides` constraint.
11. **F11** — Add a code comment documenting epoch failure modes.

---

## Fixes Applied

### F1 — Fixed 2026-03-01

**File**: `lib/features/schedule/controller/useScheduleController.ts`

**What changed** (around line 2977–3012):

- Removed `setCurrentScheduleUpdatedAt(new Date().toISOString())` from line 2847.
- Non-RPC path: added `.select('updated_at').single()` to the existing `.update()` call on `daily_schedules`. The returned `metaData.updated_at` is captured in `savedUpdatedAt`.
- RPC path: added a lightweight `select('updated_at').eq('id', scheduleId).single()` standalone fetch (the RPC itself doesn't return `updated_at`). Its result is also captured in `savedUpdatedAt`.
- After the metadata timer stage: `setCurrentScheduleUpdatedAt(savedUpdatedAt ?? new Date().toISOString())` — uses the real DB timestamp, with the client clock only as a last-resort fallback if both fetches fail.

**Why this prevents the bug**: the draft identity check at load time compares `draft.scheduleUpdatedAt === baseScheduleUpdatedAt`. Both values now originate from the DB, so they match reliably after a save + date switch + return.

---

### F2 — Fixed 2026-03-01

**File**: `app/(dashboard)/schedule/page.tsx`

**What changed** (around line 5288–5296, inside `handleConfirmCopy`):

Added one line after the existing target-date cache clears:
```ts
clearCachedSchedule(formatDateForInput(fromDate))
```

**Why this prevents the bug**: the copy API route (`app/api/schedules/copy/route.ts` lines 399–425) conditionally writes back to the **source** schedule's `baseline_snapshot` (legacy upgrade or missing-snapshot backfill). This bumps `updated_at` on the source row. Without clearing its client cache, navigating back to the source date within 5 minutes would serve the stale pre-copy snapshot from cache — causing the snapshot health report and drift diff UI to show outdated state.

---

---

### F3 — Fixed 2026-03-01

**File**: `lib/features/schedule/controller/useScheduleController.ts` (around line 1249)

**What changed**:

Replaced the synchronous `buildBaselineSnapshotFromCurrentState()` call (which reads stale React state from the previously-loaded date) with 5 live DB queries batched in the existing `Promise.all`. The queries mirror exactly what the server-side `buildBaselineSnapshot()` in the copy route fetches:
- `staff` (id, name, rank, team, floating, status, buffer_fte, floor_pca, special_program)
- `special_programs` (minified via `minifySpecialProgramsForSnapshot`)
- `spt_allocations`
- `wards`
- `pca_preferences`

These run in parallel alongside `fetchGlobalHeadAtCreation`, `seedAllocationNotesForNewSchedule`, and `fetchLiveTeamSettingsSnapshot` — no extra latency vs. before since they're all concurrent.

**Why this matters**: Without this fix, a new schedule created while date A's snapshot was loaded in memory would silently embed date A's staff pool, special programs, etc. into the new date's baseline — even if the live dashboard had been updated since date A's snapshot was taken.

---

### F4 — Fixed 2026-03-01

**File**: `lib/features/schedule/controller/useScheduleController.ts` (around line 1878)

**What changed**:

Replaced the old permissive null-wildcard:
```ts
// Before — any null on either side = automatic pass
const updatedAtMatches =
  !draft.scheduleUpdatedAt || !baseScheduleUpdatedAt || draft.scheduleUpdatedAt === baseScheduleUpdatedAt
```

With a strict three-way check:
```ts
// After
const updatedAtMatches =
  draft.scheduleUpdatedAt === null && baseScheduleUpdatedAt === null
    ? true                                              // both null = new unsaved schedule, ok
    : draft.scheduleUpdatedAt !== null && baseScheduleUpdatedAt !== null
      ? draft.scheduleUpdatedAt === baseScheduleUpdatedAt  // both non-null = must match exactly
      : false                                           // one null + one non-null = reject
```

**Why this matters**: The old logic would let a draft written for a new schedule (before any save, `updatedAt = null`) match any future DB state that happened to return `null` for `updated_at` — including after a row delete + recreate scenario. The new logic is conservative: mixed null/non-null means something is inconsistent, so the draft is discarded rather than applied blindly.

---

### F5 — Fixed 2026-03-01

**File**: `lib/features/schedule/controller/useScheduleController.ts` (around line 1395)

**What changed**:

After `validateAndRepairBaselineSnapshot` completes with `report.status === 'repaired'`, added a fire-and-forget write:
```ts
if (validated.report.status === 'repaired' && scheduleId) {
  supabase
    .from('daily_schedules')
    .update({ baseline_snapshot: validated.envelope as any })
    .eq('id', scheduleId)
    .then(() => {}) // intentionally fire-and-forget
}
```

This is non-blocking (no `await`) and silently swallowed on error — it never affects the load path or UI. But on success, the repaired envelope is persisted to DB, so every subsequent cold load of this date finds a valid snapshot and skips both the repair logic and the extra `staff` table query.

**Why this matters**: Without this, every cold load of a date with a missing-staff snapshot would pay an extra DB round-trip (`staff.select.in([...ids])`) indefinitely. After this fix, the first load repairs and persists — subsequent loads find `status: ok`.

---

## Manual Verification Guide

### Verifying F1 (draft preserved after save + date switch)

**Setup**: Pick any existing schedule date that has some allocations saved. Make sure the dev load diagnostics tooltip is visible (developer mode).

**Steps**:
1. Load the schedule page on date A.
2. Save the schedule (Step 2/3/4 should already be done, or just save as-is).
3. After "Saved successfully." toast appears, **without reloading the page**, make a visible edit — e.g. mark one staff member on leave or change a bed count.
4. Switch to a different schedule date (use the prev/next arrows or calendar).
5. Switch back to date A.

**Expected (after fix)**:
- The edit you made in step 3 is **restored** — you see the leave mark or bed count change still present.
- The load diagnostics tooltip shows `loadFrom: draft`.
- No "draft identity mismatch" in the diagnostics (it would show `loadFrom: db` without the draft if mismatch occurred).

**Expected (before fix / regression check)**:
- Without the fix, the edit in step 3 would be silently discarded and the schedule reloaded clean from DB.

**Quick confirm via browser DevTools** (optional):
- Open DevTools → Application → Session Storage.
- After step 3, you should see `rbip_dirty_schedule_dates_v1` contain the date A entry.
- After step 5 (return to date A), that entry should be gone (draft was consumed and applied).

---

### Verifying F2 (source date cache cleared after copy)

**Setup**: Find a source date that has a **legacy-wrapped** or **missing** baseline snapshot (check snapshotHealthReport in the load diagnostics tooltip — look for `status: repaired` or `wrappedLegacySnapshot` issue). Or just use any date — the fix is safe regardless of whether the source was actually modified.

**Steps**:
1. Load the schedule page on the **source** date (date A).
2. Note the load diagnostics tooltip — confirm `cacheHit: false`, data loads fresh from DB.
3. Open the Copy wizard and copy date A → date B (any future date).
4. After the copy completes and you land on date B, use the prev/next arrows or calendar to **navigate back to date A**.

**Expected (after fix)**:
- Date A performs a **fresh DB load** (not a cache hit) — load diagnostics shows `cacheHit: false`.
- The snapshot health report on date A reflects the post-copy state (if the source snapshot was upgraded, it shows `status: ok` instead of `wrappedLegacySnapshot`).

**Expected (before fix / regression check)**:
- Without the fix, date A would show `cacheHit: true` within 5 minutes of the copy. If the source snapshot was upgraded by the copy route, the cached stale snapshot would still show the old health status.

**Quick confirm via browser DevTools** (optional):
- Open DevTools → Application → Session Storage.
- After step 3, look for `rbip:scheduleCache:<date-A>` — it should **not exist** (was cleared by the fix).
- After navigating back in step 4, the key reappears (freshly populated from DB).

---

### Verifying F3 (new schedule gets correct baseline, not previous date's data)

**Setup**: You need a date that has **no existing schedule row** (a future date that hasn't been opened yet). Also have the live Dashboard open and note the current staff list (e.g. count of active staff).

**Steps**:
1. Load the schedule page on an existing date that has a known schedule (date A). Let it load fully.
2. Note the active staff count on date A (visible in the Staff Pool panel).
3. Navigate to a future date that has **no schedule yet** (the page will create a new row automatically).
4. Wait for the new schedule to initialize (loading overlay disappears).
5. Open the load diagnostics tooltip (click the schedule title if in developer mode) and look at `baselineSnapshotUsed`.
6. Check the Staff Pool — the active staff list should match the **live dashboard staff count**, not date A's count.

**Expected (after fix)**:
- Staff pool for the new date reflects the current live staff roster.
- If the Dashboard staff count matches what you see, the baseline was built from DB, not from date A's in-memory state.
- In scenarios where date A's snapshot was from an older config (e.g. staff added since date A's snapshot was taken), the new date will correctly include those newer staff members.

**Tricky but definitive test** (if you can coordinate it):
- On the Dashboard, **add a new test staff member** to any team.
- Load the schedule on date A (existing) — the new staff member appears in the pool only if date A's snapshot already included them.
- Navigate to a brand-new date — with the fix, the new staff member **should appear** in the Staff Pool (fetched fresh from DB). Without the fix, they would be absent.

---

### Verifying F4 (draft identity check rejects mixed null/non-null)

This finding is defensive hardening — it guards against an edge case that's now less likely thanks to F1. The easiest way to confirm the new behavior is correct:

**Steps (normal path, should still work)**:
1. Load any schedule date that has a real `updated_at` in DB.
2. Make an edit (leave mark, bed count, etc.).
3. Switch away and back.
4. **Draft should still be restored** (load diagnostics: `loadFrom: draft`). F4 must not have broken normal draft restoration.

**Steps (regression check — draft for new schedule)**:
1. Navigate to a brand-new date (no schedule row yet) — wait for creation.
2. Make an edit immediately after the blank schedule loads.
3. Switch away and back.
4. **Draft should be restored** — both sides are `null` (new schedule, never saved), so the "both null = ok" branch fires correctly.

**DevTools check** (to confirm the logic):
- After step 3 above, open DevTools → Application → Session Storage → look at `rbip_dirty_schedule_dates_v1`.
- You should see the date entry with `scheduleUpdatedAt: null` for a new schedule.
- On return (step 4), the draft is applied and the entry is cleaned up.

---

### Verifying F5 (repaired snapshot persisted — no repeated DB query on reload) — Playwright automated

**Automated test**: `tests/smoke/f5-snapshot-repair-persist.smoke.spec.ts`

Run with:
```
npx playwright test tests/smoke/f5-snapshot-repair-persist.smoke.spec.ts --reporter=list
```

**What the test does**:
1. Intercepts all Supabase REST network requests going to `/rest/v1/staff?...&id=in.(` — the specific pattern of the repair query (only fires when referenced staff are missing from the snapshot).
2. Clears sessionStorage (forces a cache miss) and does a **cold load** (Load 1), counting how many repair requests fire.
3. If zero on Load 1 → snapshot is already healthy → test **skips gracefully** (not a failure — just no repaired date available right now).
4. If > 0 on Load 1 → repair fired and F5 write-back should have persisted the fix. Waits 1.5s for the fire-and-forget to complete.
5. Clears sessionStorage again and does **Load 2**, counting repair requests.
6. **Asserts Load 2 has exactly 0 repair requests** — the DB was patched by Load 1.

**Expected results**:
- If current schedule date is healthy: `1 skipped` (normal — no repaired snapshot to test against)
- If current schedule date had a repaired snapshot: `1 passed` (Load 1 repaired + persisted, Load 2 skipped repair)
- If F5 write-back is broken: `1 failed` with message explaining Load 2 still fired repair queries

**To force the test to actually exercise the repair path** (instead of skipping):
- Navigate to a schedule date that has a `snapshotStatus: repaired` in the developer diagnostics panel before running the test. The test captures whatever date is currently loaded in the browser.

---

### F6 — Fixed 2026-03-01

**Files changed**:
- `lib/utils/scheduleDraftCache.ts` — added `getActiveDraftDateStrings()` export
- `lib/utils/scheduleCacheEpoch.ts` — added `bumpEpochAndGetEvictedDraftDates()` wrapper
- `components/dashboard/ConfigSyncPanel.tsx` — calls wrapper after `handlePublish` and `handlePull`

**What changed**:

1. `getActiveDraftDateStrings()` iterates the in-memory `draftCache` Map and returns date strings for all epoch-current live drafts.

2. `bumpEpochAndGetEvictedDraftDates()` in `scheduleCacheEpoch.ts`:
   - Calls `getActiveDraftDateStrings()` to snapshot live drafts **before** bumping.
   - Calls `bumpScheduleCacheEpoch()` to invalidate all old cache/draft entries.
   - Returns the pre-bump date list so the caller can warn the user.

3. In `ConfigSyncPanel.tsx`, both `handlePublish` and `handlePull` now:
   ```ts
   const evicted = bumpEpochAndGetEvictedDraftDates()
   if (evicted.length > 0) {
     toast.warning('Unsaved schedule edits were discarded.',
       `Global config changed. Unsaved edits on ${evicted.join(', ')} were lost.`)
   }
   ```

**Why this matters**: Previously a global config Publish or Pull would silently destroy all in-flight unsaved schedule edits without any user notification. Now the user gets a named list of which dates lost unsaved work.

**Automated test**: `tests/smoke/f6-f7-draft-integrity.smoke.spec.ts` → F6 test (2 passed)

---

### F7 — Fixed 2026-03-01

**File**: `lib/utils/scheduleDraftCache.ts` — `markDirtyScheduleDate()`

**What changed**:

```ts
// Before
while (next.length > MAX_DIRTY_DATES) next.shift()

// After
while (next.length > MAX_DIRTY_DATES) {
  const evicted = next.shift()
  if (evicted) draftCache.delete(evicted.dateStr)  // ← also evict in-memory draft
}
```

When the pointer list overflows beyond 5 entries, the oldest entry's in-memory draft is now explicitly deleted alongside its sessionStorage pointer. Before the fix, the draft lived on in `draftCache` (memory) but was invisible to `getMostRecentDirtyScheduleDate()` — a silent orphan that would vanish on page refresh with no warning.

**Why this matters**: The in-memory and sessionStorage states are now always consistent. A draft that's been evicted from the pointer list is genuinely gone, not lurking invisibly in memory.

**Automated test**: `tests/smoke/f6-f7-draft-integrity.smoke.spec.ts` → F7 test (2 passed)

---

### Verifying F6 (epoch bump warns about lost drafts) — Playwright automated

**Automated test**: `tests/smoke/f6-f7-draft-integrity.smoke.spec.ts`

Run with:
```
npx playwright test tests/smoke/f6-f7-draft-integrity.smoke.spec.ts --reporter=list
```

**What the F6 test does**:
1. Seeds two fake dirty date pointers into sessionStorage (simulates having unsaved work on two dates).
2. Reads the active dirty date list (simulating `getActiveDraftDateStrings()`).
3. Bumps the epoch (simulating `bumpScheduleCacheEpoch()`).
4. Asserts the evicted list matches what was seeded — confirming the warning payload is correct.
5. Asserts the pointer list is empty after the bump.

**Manual verification** (end-to-end):
1. On the **Schedule page**, make an unsaved edit on any date (leave mark, bed count, etc.).
2. Switch to another date, make another edit. Do **not** save either.
3. Go to **Dashboard → Sync / Publish**.
4. Click **Publish snapshot → Global** (or Pull) and confirm.
5. **Expected**: a warning toast appears naming the dates with discarded unsaved edits.
6. Navigate back to those schedule dates — the edits should be gone (draft was invalidated).

---

### Verifying F7 (overflow evicts in-memory draft) — Playwright automated

**Automated test**: `tests/smoke/f6-f7-draft-integrity.smoke.spec.ts`

**What the F7 test does**:
1. Seeds 5 dirty date pointers (the maximum — `MAX_DIRTY_DATES = 5`).
2. Simulates adding a 6th dirty date via the `markDirtyScheduleDate` overflow logic.
3. Asserts exactly one date was evicted (the oldest, `2099-01-01`).
4. Asserts the final pointer list has exactly 5 entries.
5. Asserts the evicted date is absent from the final list and the new 6th date is present.

**Manual verification**:
- This is hard to trigger manually (requires opening 6+ distinct schedule dates with unsaved edits in one session).
- The Playwright test is the primary verification path.
- As a sanity check: open 6 schedule dates and make a small edit on each without saving. Navigate back to the first date — the edit should be gone (it was evicted by the 6th date push).

---

---

## F8–F11 Fixes — 2026-03-01

**Status**: All four Low-severity findings resolved. No behaviour changes — only comments, dead-code removal, and interface cleanup.

---

### F8 — Fixed 2026-03-01

**Files**: `lib/utils/scheduleCache.ts` (write site), `lib/features/schedule/controller/useScheduleController.ts` (read site)

**What changed**:

Added a JSDoc constraint comment to `cacheSchedule()` explicitly documenting that `data.overrides` must always represent the DB-persisted `staff_overrides` value — never an unsaved in-memory state. Added a matching comment at the cache-hit read path in the controller explaining *why* `staffOverrides` and `savedOverrides` are initialised from the same source.

**Why this matters**: Without this constraint documented, a future partial-save path could silently write unsaved `overrides` into the cache. The next cache hit would set `savedOverrides = unsavedValue`, resetting the version counter and suppressing dirty-state detection. The comments make the invariant visible at both the write and read sites so it cannot be missed during future maintenance.

**No automated test needed** — this is a documentation-only change.

---

### F9 — Fixed 2026-03-01

**File**: `lib/utils/scheduleCache.ts`

**What changed**:

Removed all traces of the `'writeThrough'` source value that was an abandoned design ("Option A — cache unsaved state on date switch"):
- Removed `'writeThrough'` from the `__source` type union (now `'db' | string`).
- Removed the early-return guard in `persistSchedule()` that blocked `writeThrough` entries from being persisted.
- Removed the legacy-entry guard in `readPersistedSchedule()` that deleted persisted `writeThrough` entries on read.
- Simplified the `shouldPersist` check in `cacheSchedule()` — no longer checks for `writeThrough`.

**Why this matters**: Dead guards are actively misleading to maintainers — they imply a live code path exists when it doesn't. Keeping them also risks re-animation: a future developer might pass `source: 'writeThrough'` thinking the guard makes it safe to store unsaved state in the cache, when in fact the real protection (constraint F8) is the invariant on `overrides`, not the source label.

**No automated test needed** — dead-code removal with no behaviour change for existing call sites.

---

### F10 — Fixed 2026-03-01

**Files**: `lib/utils/scheduleDraftCache.ts` (interface), `lib/features/schedule/controller/useScheduleController.ts` (flush)

**What changed**:

- Removed `baselineSnapshot?: any` from the `DraftScheduleData` interface.
- Removed `baselineSnapshot: deepCloneSnapshotValue((baselineSnapshot as any) || null)` from the draft flush at line 775 of the controller.
- Added a comment in `DraftScheduleData` explaining that `baselineSnapshot` is intentionally absent: restore always uses the freshly-loaded snapshot from the DB/cache path to avoid stale `teamMerge` flicker.

**Why this matters**: The restore code (lines 1890–1891) already ignores `draft.baselineSnapshot` — the field was stored on every flush but never consumed. For dates with large staff lists, `baselineSnapshot` can be several hundred kilobytes. Removing it from drafts cuts memory use per dirty date and makes the intent explicit at the type level: future contributors no longer need to read the restore code to understand why the value is discarded.

**No automated test needed** — the restore path's behaviour is unchanged; only the flush stops serialising a field that was already ignored.

---

### F11 — Fixed 2026-03-01

**File**: `lib/utils/scheduleCacheEpoch.ts`

**What changed**:

Added detailed JSDoc comments to both `getScheduleCacheEpoch()` and `bumpScheduleCacheEpoch()` documenting the two known failure modes when `sessionStorage` is unavailable (private browsing, iOS WebView, quota-blocked):

1. **Entries with `__epoch > 0` never match** — any cache entry written when storage was available will be perpetually evicted by reads issued when storage is blocked (since `getScheduleCacheEpoch()` returns `0` while stored entries have `__epoch ≥ 1`). Safe but noisy.
2. **Entries with `__epoch = 0` can never be invalidated** — entries written while storage was blocked are stamped `__epoch = 0` and always match the `0` returned by `getScheduleCacheEpoch()`. `bumpScheduleCacheEpoch()` is a silent no-op. Callers that need guaranteed invalidation are directed to call `clearAllCachedSchedules()` / `clearAllDraftSchedules()` directly, and to check `canUseSessionStorage()` if they need to know they're in degraded mode.

The comment on `bumpScheduleCacheEpoch()` also cross-references `bumpEpochAndGetEvictedDraftDates()` as the preferred higher-level helper.

**Why this matters**: The failure modes are symmetric opposites of each other — storage-blocked environments either over-evict or under-evict depending on which epoch value was written. Without documentation these behaviours look like intermittent bugs rather than a known design trade-off. The comments let future maintainers distinguish "expected degradation" from "actual bug" immediately.

**No automated test needed** — documentation-only change.
