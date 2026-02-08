/**
 * In-memory cache for schedule data to speed up navigation.
 * Caches schedule data by date string (YYYY-MM-DD format).
 */

interface CachedScheduleData {
  scheduleId: string
  overrides: Record<string, any>
  /**
   * Step-wise workflow: which steps have been initialized for this date.
   * Stored as an array for cache/persistence; hydrated into Set by controller.
   */
  initializedSteps?: string[]
  // Schedule-level metadata extracted from staff_overrides (NOT staff UUID keyed)
  bedCountsOverridesByTeam?: Record<string, any>
  bedRelievingNotesByToTeam?: Record<string, any>
  allocationNotesDoc?: any
  tieBreakDecisions?: Record<string, any>
  therapistAllocs: any[]
  pcaAllocs: any[]
  bedAllocs: any[]
  baselineSnapshot: any
  workflowState: any
  calculations: Record<string, any> | null
  cachedAt: number // timestamp
  /**
   * Optional diagnostics about where the cache entry came from.
   * - 'db': loaded from database/RPC then cached
   * - 'writeThrough': in-memory unsaved state written on date switch (Option A)
   */
  __source?: 'db' | 'writeThrough' | string
  /** Populated when a cache entry was rehydrated from sessionStorage. */
  __cacheLayer?: 'memory' | 'sessionStorage'
}

// In-memory cache (survives navigation but not page refresh)
const scheduleCache = new Map<string, CachedScheduleData>()

// Cache TTL: 5 minutes (300000 ms)
const CACHE_TTL = 5 * 60 * 1000

// Optional sessionStorage persistence to survive browser refresh.
const PERSIST_PREFIX = 'rbip:scheduleCache:'
const PERSIST_INDEX_KEY = `${PERSIST_PREFIX}__index`
const PERSIST_MAX_ENTRIES = 8
const PERSIST_MAX_BYTES = 1_500_000 // ~1.5MB per entry (avoid storage quota issues)

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function persistKey(dateStr: string): string {
  return `${PERSIST_PREFIX}${dateStr}`
}

function readPersistIndex(): string[] {
  if (!canUseSessionStorage()) return []
  try {
    const raw = window.sessionStorage.getItem(PERSIST_INDEX_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr.filter((x) => typeof x === 'string') as string[]) : []
  } catch {
    return []
  }
}

function writePersistIndex(ids: string[]): void {
  if (!canUseSessionStorage()) return
  try {
    window.sessionStorage.setItem(PERSIST_INDEX_KEY, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

function persistSchedule(dateStr: string, data: CachedScheduleData): void {
  if (!canUseSessionStorage()) return
  try {
    // Never persist write-through (unsaved) cache across refresh.
    // These entries are meant to be in-memory only and can become stale or cross-date polluted.
    if ((data as any)?.__source === 'writeThrough') return
    const json = JSON.stringify(data)
    if (json.length > PERSIST_MAX_BYTES) return
    window.sessionStorage.setItem(persistKey(dateStr), json)

    // Maintain LRU-ish index (most recent at end)
    const idx = readPersistIndex().filter((d) => d !== dateStr)
    idx.push(dateStr)
    while (idx.length > PERSIST_MAX_ENTRIES) {
      const evict = idx.shift()
      if (evict) window.sessionStorage.removeItem(persistKey(evict))
    }
    writePersistIndex(idx)
  } catch {
    // ignore (quota / serialization issues)
  }
}

function readPersistedSchedule(dateStr: string): CachedScheduleData | null {
  if (!canUseSessionStorage()) return null
  try {
    const raw = window.sessionStorage.getItem(persistKey(dateStr))
    if (!raw) return null
    const parsed = JSON.parse(raw) as any
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.scheduleId !== 'string') return null
    if (typeof parsed.cachedAt !== 'number') return null
    // If a legacy/buggy client persisted a write-through cache entry, treat it as invalid.
    if (parsed.__source === 'writeThrough') {
      window.sessionStorage.removeItem(persistKey(dateStr))
      return null
    }
    // validate TTL
    const age = Date.now() - parsed.cachedAt
    if (age > CACHE_TTL) {
      window.sessionStorage.removeItem(persistKey(dateStr))
      return null
    }
    return parsed as CachedScheduleData
  } catch {
    return null
  }
}

/**
 * Get cached schedule data for a date
 */
export function getCachedSchedule(dateStr: string): CachedScheduleData | null {
  const cached = scheduleCache.get(dateStr)
  if (!cached) {
    // Fallback: sessionStorage persistence (survives refresh).
    const persisted = readPersistedSchedule(dateStr)
    if (!persisted) return null
    // Rehydrate into memory cache for faster subsequent hits.
    const rehydrated = { ...(persisted as any), __cacheLayer: 'sessionStorage' as const }
    scheduleCache.set(dateStr, rehydrated as any)
    return rehydrated as any
  }

  // Check if cache is still valid
  const age = Date.now() - cached.cachedAt
  if (age > CACHE_TTL) {
    scheduleCache.delete(dateStr)
    if (canUseSessionStorage()) {
      try {
        window.sessionStorage.removeItem(persistKey(dateStr))
      } catch {
        // ignore
      }
    }
    return null
  }

  return { ...(cached as any), __cacheLayer: 'memory' as const } as any
}

/**
 * Cache schedule data for a date
 */
export function cacheSchedule(
  dateStr: string,
  data: CachedScheduleData,
  opts?: { persist?: boolean; source?: CachedScheduleData['__source'] }
): void {
  const stored = {
    ...data,
    cachedAt: Date.now(),
    __source: opts?.source ?? (data as any).__source,
    __cacheLayer: 'memory' as const,
  }
  scheduleCache.set(dateStr, stored)
  const shouldPersist = opts?.persist !== false && (stored as any).__source !== 'writeThrough'
  if (shouldPersist) persistSchedule(dateStr, stored as any)
}

/**
 * Clear cache for a specific date (e.g., after save)
 */
export function clearCachedSchedule(dateStr: string): void {
  scheduleCache.delete(dateStr)
  if (!canUseSessionStorage()) return
  try {
    window.sessionStorage.removeItem(persistKey(dateStr))
    const idx = readPersistIndex().filter((d) => d !== dateStr)
    writePersistIndex(idx)
  } catch {
    // ignore
  }
}

/**
 * Clear all cached schedules
 */
export function clearAllCachedSchedules(): void {
  scheduleCache.clear()
  if (!canUseSessionStorage()) return
  try {
    const idx = readPersistIndex()
    idx.forEach((d) => window.sessionStorage.removeItem(persistKey(d)))
    window.sessionStorage.removeItem(PERSIST_INDEX_KEY)
  } catch {
    // ignore
  }
}

/**
 * Get cache size (for debugging)
 */
export function getCacheSize(): number {
  return scheduleCache.size
}
