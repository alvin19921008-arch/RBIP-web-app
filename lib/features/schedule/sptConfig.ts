import type { SPTAllocation } from '@/types/allocation'
import type { Weekday } from '@/types/staff'

export type SptSlotDisplay = 'AM' | 'PM' | 'AM+PM' | null

export type SptWeekdayComputed = {
  staffId: string
  weekday: Weekday
  enabled: boolean
  contributesFte: boolean
  slots: number[]
  slotModes: { am: 'AND' | 'OR'; pm: 'AND' | 'OR' }
  displayText: string | null

  hasAM: boolean
  hasPM: boolean
  slotDisplay: SptSlotDisplay

  effectiveSlots: { am: number; pm: number; total: number }
  baseFte: number
}

const DEFAULT_SLOT_MODES: { am: 'AND' | 'OR'; pm: 'AND' | 'OR' } = { am: 'AND', pm: 'AND' }

function normalizeSlotModes(m: any): { am: 'AND' | 'OR'; pm: 'AND' | 'OR' } {
  const am = m?.am === 'OR' ? 'OR' : 'AND'
  const pm = m?.pm === 'OR' ? 'OR' : 'AND'
  return { am, pm }
}

function computeEffectiveSlotCountForHalfDay(slots: number[], mode: 'AND' | 'OR'): number {
  if (slots.length === 0) return 0
  if (mode === 'OR' && slots.length > 1) return 1
  return slots.length
}

export function deriveSlotDisplayFromSlots(slots: number[]): { hasAM: boolean; hasPM: boolean; slotDisplay: SptSlotDisplay } {
  const hasAM = slots.some((s) => s === 1 || s === 2)
  const hasPM = slots.some((s) => s === 3 || s === 4)
  const slotDisplay: SptSlotDisplay = hasAM && hasPM ? 'AM+PM' : hasAM ? 'AM' : hasPM ? 'PM' : null
  return { hasAM, hasPM, slotDisplay }
}

function pickCanonicalSptRow(rows: SPTAllocation[]): SPTAllocation | null {
  if (rows.length === 0) return null
  // Prefer active rows; if multiple, prefer the most recently updated.
  const sorted = [...rows].sort((a, b) => {
    const aActive = a.active !== false
    const bActive = b.active !== false
    if (aActive !== bActive) return aActive ? -1 : 1
    const aUpdated = a.updated_at ? Date.parse(a.updated_at) : NaN
    const bUpdated = b.updated_at ? Date.parse(b.updated_at) : NaN
    const aT = Number.isFinite(aUpdated) ? aUpdated : 0
    const bT = Number.isFinite(bUpdated) ? bUpdated : 0
    return bT - aT
  })
  return sorted[0] ?? null
}

/**
 * Get the computed SPT weekday config for a staff member.
 *
 * Defaulting rules (critical):
 * - If there is no config for that weekday, return baseFte=0 and enabled=false.
 * - If contributes_fte=false, baseFte=0 (but enabled may be true, and slots may still exist for display).
 */
export function getSptWeekdayConfig(args: {
  staffId: string
  weekday: Weekday
  sptAllocations: SPTAllocation[]
}): SptWeekdayComputed {
  const { staffId, weekday, sptAllocations } = args

  const rows = (Array.isArray(sptAllocations) ? sptAllocations : []).filter((a) => a?.staff_id === staffId)
  const row = pickCanonicalSptRow(rows)
  if (row && row.active === false) {
    return {
      staffId,
      weekday,
      enabled: false,
      contributesFte: false,
      slots: [],
      slotModes: DEFAULT_SLOT_MODES,
      displayText: null,
      hasAM: false,
      hasPM: false,
      slotDisplay: null,
      effectiveSlots: { am: 0, pm: 0, total: 0 },
      baseFte: 0,
    }
  }

  const cfg = row?.config_by_weekday?.[weekday]
  const legacyEnabled = !!row?.weekdays?.includes(weekday)

  const enabled = cfg?.enabled === false ? false : cfg ? true : legacyEnabled
  const contributesFte = cfg ? cfg.contributes_fte !== false : (row?.fte_addon ?? 0) > 0

  const slots: number[] = Array.isArray(cfg?.slots)
    ? (cfg!.slots as number[]).filter((n) => [1, 2, 3, 4].includes(n))
    : Array.isArray(row?.slots?.[weekday])
      ? (row!.slots![weekday] as number[]).filter((n) => [1, 2, 3, 4].includes(n))
      : []

  const slotModes = cfg?.slot_modes ? normalizeSlotModes(cfg.slot_modes) : normalizeSlotModes(row?.slot_modes?.[weekday] ?? DEFAULT_SLOT_MODES)

  const displayTextRaw = cfg?.display_text
  const displayText = typeof displayTextRaw === 'string' && displayTextRaw.trim() !== '' ? displayTextRaw.trim() : null

  const { hasAM, hasPM, slotDisplay } = deriveSlotDisplayFromSlots(slots)

  const amSlots = slots.filter((s) => s === 1 || s === 2)
  const pmSlots = slots.filter((s) => s === 3 || s === 4)
  const effectiveAM = computeEffectiveSlotCountForHalfDay(amSlots, slotModes.am)
  const effectivePM = computeEffectiveSlotCountForHalfDay(pmSlots, slotModes.pm)
  const effectiveTotal = effectiveAM + effectivePM

  const baseFte = enabled && contributesFte ? effectiveTotal * 0.25 : 0

  return {
    staffId,
    weekday,
    enabled,
    contributesFte,
    slots,
    slotModes,
    displayText,
    hasAM,
    hasPM,
    slotDisplay,
    effectiveSlots: { am: effectiveAM, pm: effectivePM, total: effectiveTotal },
    baseFte,
  }
}

export function getSptWeekdayConfigMap(args: {
  weekday: Weekday
  sptAllocations: SPTAllocation[]
}): Record<string, SptWeekdayComputed> {
  const { weekday, sptAllocations } = args
  const out: Record<string, SptWeekdayComputed> = {}
  for (const a of Array.isArray(sptAllocations) ? sptAllocations : []) {
    const staffId = a?.staff_id
    if (!staffId) continue
    // only compute once per staffId
    if (out[staffId]) continue
    out[staffId] = getSptWeekdayConfig({ staffId, weekday, sptAllocations })
  }
  return out
}

