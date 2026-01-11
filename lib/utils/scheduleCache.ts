/**
 * In-memory cache for schedule data to speed up navigation.
 * Caches schedule data by date string (YYYY-MM-DD format).
 */

interface CachedScheduleData {
  scheduleId: string
  overrides: Record<string, any>
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
}

// In-memory cache (survives navigation but not page refresh)
const scheduleCache = new Map<string, CachedScheduleData>()

// Cache TTL: 5 minutes (300000 ms)
const CACHE_TTL = 5 * 60 * 1000

/**
 * Get cached schedule data for a date
 */
export function getCachedSchedule(dateStr: string): CachedScheduleData | null {
  const cached = scheduleCache.get(dateStr)
  if (!cached) return null

  // Check if cache is still valid
  const age = Date.now() - cached.cachedAt
  if (age > CACHE_TTL) {
    scheduleCache.delete(dateStr)
    return null
  }

  return cached
}

/**
 * Cache schedule data for a date
 */
export function cacheSchedule(dateStr: string, data: CachedScheduleData): void {
  scheduleCache.set(dateStr, {
    ...data,
    cachedAt: Date.now(),
  })
}

/**
 * Clear cache for a specific date (e.g., after save)
 */
export function clearCachedSchedule(dateStr: string): void {
  scheduleCache.delete(dateStr)
}

/**
 * Clear all cached schedules
 */
export function clearAllCachedSchedules(): void {
  scheduleCache.clear()
}

/**
 * Get cache size (for debugging)
 */
export function getCacheSize(): number {
  return scheduleCache.size
}
