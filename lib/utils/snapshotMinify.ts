import type { SpecialProgram } from '@/types/allocation'
import type { Team, Weekday } from '@/types/staff'

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

function isWeekdayKeyedSlots(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return WEEKDAYS.some(d => Array.isArray((value as any)[d]))
}

function compactWeekdayNumberMap(
  map: unknown,
  activeWeekdays: Set<Weekday>,
  keepZeroWhenHasSlotsForDay?: (day: Weekday) => boolean
): Record<Weekday, number> {
  const out: Partial<Record<Weekday, number>> = {}
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out as Record<Weekday, number>

  for (const d of WEEKDAYS) {
    if (!activeWeekdays.has(d)) continue
    const raw = (map as any)[d]
    if (typeof raw !== 'number') continue
    if (raw > 0) {
      out[d] = raw
    } else if (raw === 0 && keepZeroWhenHasSlotsForDay?.(d)) {
      // Preserve explicit 0 when program has slots for that weekday (some UIs infer "enabled").
      out[d] = 0
    }
  }
  return out as Record<Weekday, number>
}

function compactWeekdaySlotsMap(map: unknown, activeWeekdays: Set<Weekday>): Record<Weekday, number[]> {
  const out: Partial<Record<Weekday, number[]>> = {}
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out as Record<Weekday, number[]>

  for (const d of WEEKDAYS) {
    if (!activeWeekdays.has(d)) continue
    const raw = (map as any)[d]
    if (!Array.isArray(raw)) continue
    const slots = (raw as any[]).filter(s => typeof s === 'number') as number[]
    if (slots.length > 0) out[d] = slots
  }
  return out as Record<Weekday, number[]>
}

/**
 * Reduce snapshot size while keeping behavior identical:
 * - Keep only fields used by schedule UI/algorithms.
 * - Make JSON sparse: drop empty weekday keys, drop staff keys not in staff_ids,
 *   drop empty preference arrays, drop preference IDs not in staff_ids.
 */
export function minifySpecialProgramsForSnapshot(programs: unknown): SpecialProgram[] {
  const arr = Array.isArray(programs) ? (programs as any[]) : []
  return arr
    .filter(p => p && typeof p === 'object')
    .map((p: any) => {
      const activeWeekdays = new Set<Weekday>(
        Array.isArray(p.weekdays) ? (p.weekdays.filter((d: any) => WEEKDAYS.includes(d)) as Weekday[]) : []
      )

      const staffIds: string[] = Array.isArray(p.staff_ids)
        ? (p.staff_ids.filter((id: any) => typeof id === 'string') as string[])
        : []
      const staffIdSet = new Set(staffIds)

      // Slots can be weekday-keyed OR staffId-keyed. Keep shape, just sparsify.
      let slots: any = undefined
      if (isWeekdayKeyedSlots(p.slots)) {
        slots = compactWeekdaySlotsMap(p.slots, activeWeekdays)
      } else if (p.slots && typeof p.slots === 'object' && !Array.isArray(p.slots)) {
        const out: Record<string, Record<Weekday, number[]>> = {}
        for (const [staffId, staffMap] of Object.entries(p.slots as Record<string, unknown>)) {
          if (!staffIdSet.has(staffId)) continue
          const compacted = compactWeekdaySlotsMap(staffMap, activeWeekdays)
          if (Object.keys(compacted).length > 0) out[staffId] = compacted
        }
        slots = out
      } else {
        slots = {}
      }

      // fte_subtraction is typically staffId-keyed -> weekday-keyed number map.
      const fteSubtractionRaw = p.fte_subtraction
      const hasSlotsForDay = (day: Weekday) => {
        if (isWeekdayKeyedSlots(slots)) {
          return Array.isArray((slots as any)[day]) && (slots as any)[day].length > 0
        }
        // staffId-keyed: any staff has slots that day
        if (slots && typeof slots === 'object' && !Array.isArray(slots)) {
          return Object.values(slots).some((m: any) => Array.isArray(m?.[day]) && m[day].length > 0)
        }
        return false
      }

      let fte_subtraction: any = {}
      if (fteSubtractionRaw && typeof fteSubtractionRaw === 'object' && !Array.isArray(fteSubtractionRaw)) {
        const out: Record<string, Record<Weekday, number>> = {}
        for (const [staffId, staffMap] of Object.entries(fteSubtractionRaw as Record<string, unknown>)) {
          if (!staffIdSet.has(staffId)) continue
          const compacted = compactWeekdayNumberMap(staffMap, activeWeekdays, hasSlotsForDay)
          if (Object.keys(compacted).length > 0) out[staffId] = compacted
        }
        fte_subtraction = out
      }

      // therapist_preference_order: drop empty teams and ids not in staff_ids
      let therapist_preference_order: any = undefined
      if (p.therapist_preference_order && typeof p.therapist_preference_order === 'object' && !Array.isArray(p.therapist_preference_order)) {
        const out: Partial<Record<Team, string[]>> = {}
        for (const team of TEAMS) {
          const rawList = (p.therapist_preference_order as any)[team]
          if (!Array.isArray(rawList)) continue
          const filtered = (rawList as any[]).filter((id) => typeof id === 'string' && staffIdSet.has(id)) as string[]
          if (filtered.length > 0) out[team] = filtered
        }
        therapist_preference_order = out
      }

      // pca_preference_order: keep only ids in staff_ids
      const pca_preference_order = Array.isArray(p.pca_preference_order)
        ? (p.pca_preference_order.filter((id: any) => typeof id === 'string' && staffIdSet.has(id)) as string[])
        : undefined

      const result: SpecialProgram = {
        id: String(p.id ?? ''),
        name: String(p.name ?? ''),
        staff_ids: staffIds,
        weekdays: Array.from(activeWeekdays),
        // Types say weekday-keyed; runtime supports both shapes throughout schedule UI.
        slots: slots as any,
        fte_subtraction: fte_subtraction as any,
        pca_required: (typeof p.pca_required === 'number' ? p.pca_required : null) as any,
        therapist_preference_order: therapist_preference_order as any,
        pca_preference_order: (pca_preference_order && pca_preference_order.length > 0 ? pca_preference_order : undefined) as any,
      }

      return result
    })
}

