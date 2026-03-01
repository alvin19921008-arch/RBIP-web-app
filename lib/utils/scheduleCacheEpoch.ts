const SCHEDULE_CACHE_EPOCH_KEY = 'rbip_schedule_cache_epoch'

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function parseEpoch(raw: string | null): number {
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Returns the current cache epoch from sessionStorage.
 *
 * Degraded-mode behaviour when sessionStorage is unavailable (private browsing,
 * iOS WebView, storage quota blocked):
 * - Always returns 0.
 * - Any entry written with __epoch > 0 (from a tab that had storage) will never
 *   match and will be perpetually evicted on read — this is safe but noisy.
 * - Any entry written while storage was unavailable (__epoch = 0) will always
 *   match epoch 0 and can never be invalidated by bumpScheduleCacheEpoch — epoch
 *   protection is silently bypassed. Callers that require guaranteed invalidation
 *   should check canUseSessionStorage() directly.
 */
export function getScheduleCacheEpoch(): number {
  if (!canUseSessionStorage()) return 0
  try {
    return parseEpoch(window.sessionStorage.getItem(SCHEDULE_CACHE_EPOCH_KEY))
  } catch {
    return 0
  }
}

/**
 * Increments the cache epoch in sessionStorage, invalidating all existing cache
 * and draft entries on their next read.
 *
 * Degraded-mode behaviour when sessionStorage is unavailable:
 * - Returns 0 without writing anything — the bump is a silent no-op.
 * - Existing in-memory entries with __epoch = 0 will continue to match epoch 0
 *   and will NOT be invalidated. If a guaranteed bulk-invalidation is needed in
 *   storage-blocked environments, callers must clear the in-memory caches directly
 *   (e.g. clearAllCachedSchedules() + clearAllDraftSchedules()).
 *
 * Prefer bumpEpochAndGetEvictedDraftDates() when you also need to warn the user
 * about discarded unsaved draft work.
 */
export function bumpScheduleCacheEpoch(): number {
  if (!canUseSessionStorage()) return 0
  try {
    const next = getScheduleCacheEpoch() + 1
    window.sessionStorage.setItem(SCHEDULE_CACHE_EPOCH_KEY, String(next))
    return next
  } catch {
    return 0
  }
}

/**
 * Bumps the cache epoch and returns the date strings of any live draft entries
 * that were invalidated by the bump, so the caller can warn the user.
 *
 * Usage:
 *   const evicted = bumpEpochAndGetEvictedDraftDates()
 *   if (evicted.length > 0) toast.warning(`Unsaved edits on ${evicted.join(', ')} were discarded.`)
 *
 * NOTE: this import is lazy to avoid a circular dependency between scheduleCacheEpoch
 * (no deps) and scheduleDraftCache (imports scheduleCacheEpoch). The getActiveDraftDateStrings
 * call happens client-side only, so the dynamic require is safe.
 */
export function bumpEpochAndGetEvictedDraftDates(): string[] {
  // Snapshot live drafts BEFORE bumping so we know which ones get killed.
  let evictedDates: string[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getActiveDraftDateStrings } = require('@/lib/utils/scheduleDraftCache') as {
      getActiveDraftDateStrings: () => string[]
    }
    evictedDates = getActiveDraftDateStrings()
  } catch {
    // If the import fails (e.g. SSR or bundle split), proceed without warning list.
  }
  bumpScheduleCacheEpoch()
  return evictedDates
}

