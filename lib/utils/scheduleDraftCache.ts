import { getScheduleCacheEpoch } from '@/lib/utils/scheduleCacheEpoch'

export type DirtyScheduleDatePointer = {
  dateStr: string
  scheduleId: string
  scheduleUpdatedAt: string | null
  dirtyAt: number
}

export interface DraftScheduleData {
  scheduleId: string
  scheduleUpdatedAt?: string | null

  currentOverrides: Record<string, any>
  savedOverrides: Record<string, any>
  currentBedCountsOverridesByTeam?: Record<string, any>
  savedBedCountsOverridesByTeam?: Record<string, any>
  currentBedRelievingNotesByToTeam?: Record<string, any>
  savedBedRelievingNotesByToTeam?: Record<string, any>
  currentAllocationNotesDoc?: any
  savedAllocationNotesDoc?: any

  staffOverridesVersion: number
  savedOverridesVersion: number
  bedCountsOverridesVersion: number
  savedBedCountsOverridesVersion: number
  bedRelievingNotesVersion: number
  savedBedRelievingNotesVersion: number

  therapistAllocationsByTeam: Record<string, any[]>
  pcaAllocationsByTeam: Record<string, any[]>
  bedAllocs: any[]
  calculations: Record<string, any> | null
  tieBreakDecisions?: Record<string, any>
  baselineSnapshot?: any
  workflowState?: any
  currentStep?: string
  stepStatus?: Record<string, any>
  initializedSteps?: string[]
  pendingPCAFTEPerTeam?: Record<string, number>
  hasSavedAllocations?: boolean
  persistedWorkflowState?: any

  dirtyReasons?: string[]
  cachedAt: number
  __epoch?: number
}

const draftCache = new Map<string, DraftScheduleData>()

const DIRTY_DATE_LIST_KEY = 'rbip_dirty_schedule_dates_v1'
const MAX_DIRTY_DATES = 5

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function readDirtyDatePointers(): DirtyScheduleDatePointer[] {
  if (!canUseSessionStorage()) return []
  try {
    const raw = window.sessionStorage.getItem(DIRTY_DATE_LIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => {
      return (
        item &&
        typeof item === 'object' &&
        typeof item.dateStr === 'string' &&
        item.dateStr.length > 0 &&
        typeof item.scheduleId === 'string' &&
        item.scheduleId.length > 0 &&
        (typeof item.scheduleUpdatedAt === 'string' || item.scheduleUpdatedAt == null) &&
        typeof item.dirtyAt === 'number'
      )
    }) as DirtyScheduleDatePointer[]
  } catch {
    return []
  }
}

function writeDirtyDatePointers(items: DirtyScheduleDatePointer[]): void {
  if (!canUseSessionStorage()) return
  try {
    window.sessionStorage.setItem(DIRTY_DATE_LIST_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

function isEpochCurrent(entry: DraftScheduleData | undefined): boolean {
  if (!entry) return false
  const entryEpoch = typeof entry.__epoch === 'number' ? entry.__epoch : 0
  return entryEpoch === getScheduleCacheEpoch()
}

function hasLiveDraftSchedule(dateStr: string): boolean {
  const entry = draftCache.get(dateStr)
  if (!entry) return false
  if (!isEpochCurrent(entry)) {
    draftCache.delete(dateStr)
    return false
  }
  return true
}

export function markDirtyScheduleDate(pointer: Omit<DirtyScheduleDatePointer, 'dirtyAt'> & { dirtyAt?: number }): void {
  const dirtyAt = typeof pointer.dirtyAt === 'number' ? pointer.dirtyAt : Date.now()
  const nextItem: DirtyScheduleDatePointer = {
    dateStr: pointer.dateStr,
    scheduleId: pointer.scheduleId,
    scheduleUpdatedAt: pointer.scheduleUpdatedAt ?? null,
    dirtyAt,
  }
  const next = readDirtyDatePointers().filter((it) => it.dateStr !== pointer.dateStr)
  next.push(nextItem)
  while (next.length > MAX_DIRTY_DATES) next.shift()
  writeDirtyDatePointers(next)
}

export function removeDirtyScheduleDate(dateStr: string): void {
  const next = readDirtyDatePointers().filter((it) => it.dateStr !== dateStr)
  writeDirtyDatePointers(next)
}

export function cacheDraftSchedule(dateStr: string, data: DraftScheduleData): void {
  const stored: DraftScheduleData = {
    ...data,
    cachedAt: Date.now(),
    __epoch: getScheduleCacheEpoch(),
  }
  draftCache.set(dateStr, stored)
  markDirtyScheduleDate({
    dateStr,
    scheduleId: stored.scheduleId,
    scheduleUpdatedAt: stored.scheduleUpdatedAt ?? null,
    dirtyAt: stored.cachedAt,
  })
}

export function getDraftSchedule(dateStr: string): DraftScheduleData | null {
  if (!hasLiveDraftSchedule(dateStr)) {
    removeDirtyScheduleDate(dateStr)
    return null
  }
  const entry = draftCache.get(dateStr)
  if (!entry) return null
  return entry
}

export function hasDraftSchedule(dateStr: string): boolean {
  return hasLiveDraftSchedule(dateStr)
}

export function clearDraftSchedule(dateStr: string): void {
  draftCache.delete(dateStr)
  removeDirtyScheduleDate(dateStr)
}

export function clearAllDraftSchedules(): void {
  draftCache.clear()
  if (!canUseSessionStorage()) return
  try {
    window.sessionStorage.removeItem(DIRTY_DATE_LIST_KEY)
  } catch {
    // ignore
  }
}

export function getMostRecentDirtyScheduleDate(): DirtyScheduleDatePointer | null {
  const pointers = readDirtyDatePointers()
  if (pointers.length === 0) return null

  const live = pointers.filter((pointer) => hasLiveDraftSchedule(pointer.dateStr))
  if (live.length !== pointers.length) {
    writeDirtyDatePointers(live)
  }
  if (live.length === 0) return null
  return live[live.length - 1] ?? null
}

export function getDraftCacheSize(): number {
  return draftCache.size
}

