const SCHEDULE_CACHE_EPOCH_KEY = 'rbip_schedule_cache_epoch'

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function parseEpoch(raw: string | null): number {
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function getScheduleCacheEpoch(): number {
  if (!canUseSessionStorage()) return 0
  try {
    return parseEpoch(window.sessionStorage.getItem(SCHEDULE_CACHE_EPOCH_KEY))
  } catch {
    return 0
  }
}

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

