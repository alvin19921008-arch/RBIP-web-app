import { getSlotLabel } from '@/lib/utils/slotHelpers'
import { SpecialProgram } from '@/types/allocation'
import { Staff, SpecialProgram as StaffSpecialProgram, Weekday } from '@/types/staff'
import { SPTAllocation } from '@/types/allocation'
import { getSpecialProgramStaffWeekdayConfig } from '@/lib/utils/specialProgramConfigRows'

export type SpecialProgramWeekdayConfig = {
  enabled: boolean
  slots: number[]
  fteSubtraction: number
}

export type SpecialProgramDraftConfig = Record<Weekday, SpecialProgramWeekdayConfig>

export type SpecialProgramDraftMap = Partial<Record<StaffSpecialProgram, SpecialProgramDraftConfig>>

export type SpecialProgramOverlaySummary = {
  exists: boolean
  enabledDays: Weekday[]
  displayText: string
}

type SpecialProgramWeekdaySummarySource = Partial<
  Record<
    Weekday,
    {
      enabled?: boolean
      slots?: number[]
      fteSubtraction?: number
      fte_subtraction?: number
    }
  >
>

export type StaffEditDialogSavePayload = {
  staffId?: string | null
  staff: Partial<Staff>
  sptAllocation?: Partial<SPTAllocation> | null
  specialProgramConfigs?: SpecialProgramDraftMap
}

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
}

export function createEmptySpecialProgramConfig(): SpecialProgramDraftConfig {
  return {
    mon: { enabled: false, slots: [], fteSubtraction: 0 },
    tue: { enabled: false, slots: [], fteSubtraction: 0 },
    wed: { enabled: false, slots: [], fteSubtraction: 0 },
    thu: { enabled: false, slots: [], fteSubtraction: 0 },
    fri: { enabled: false, slots: [], fteSubtraction: 0 },
  }
}

export function normalizeSpecialProgramConfig(
  config: SpecialProgramDraftConfig | null | undefined
): SpecialProgramDraftConfig {
  const base = createEmptySpecialProgramConfig()
  if (!config) return base

  WEEKDAYS.forEach((day) => {
    const current = config[day]
    if (!current) return
    base[day] = {
      enabled: !!current.enabled,
      slots: Array.isArray(current.slots)
        ? current.slots.filter((slot) => [1, 2, 3, 4].includes(slot)).slice().sort((a, b) => a - b)
        : [],
      fteSubtraction: Number.isFinite(current.fteSubtraction) ? Number(current.fteSubtraction) : 0,
    }
  })

  return base
}

export function areSpecialProgramConfigsEqual(
  left: SpecialProgramDraftConfig | null | undefined,
  right: SpecialProgramDraftConfig | null | undefined
): boolean {
  return JSON.stringify(normalizeSpecialProgramConfig(left)) === JSON.stringify(normalizeSpecialProgramConfig(right))
}

export function buildSpecialProgramSummaryFromConfig(
  config: SpecialProgramDraftConfig,
  programName: StaffSpecialProgram
): SpecialProgramOverlaySummary {
  const enabledDays = WEEKDAYS.filter((day) => {
    const current = config[day]
    if (!current.enabled) return false
    if (current.slots.length > 0) return true
    if (programName === 'CRP') return current.fteSubtraction >= 0
    return current.fteSubtraction > 0
  })

  if (enabledDays.length === 0) {
    return { exists: false, enabledDays: [], displayText: '' }
  }

  const groups = new Map<string, Weekday[]>()
  for (const day of enabledDays) {
    const current = config[day]
    const key = `${[...current.slots].sort((a, b) => a - b).join(',')}|${current.fteSubtraction}`
    const existing = groups.get(key) ?? []
    existing.push(day)
    groups.set(key, existing)
  }

  const lineParts: string[] = []
  for (const [, days] of groups) {
    const dayLabel = days.length === WEEKDAYS.length ? 'All weekdays' : days.map((day) => WEEKDAY_LABELS[day]).join(', ')
    const sample = config[days[0]]
    const slotLabel = sample.slots.length
      ? sample.slots
          .slice()
          .sort((a, b) => a - b)
          .map((slot) => getSlotLabel(slot))
          .join(', ')
      : null

    const pieces = [`FTE = ${sample.fteSubtraction.toFixed(2)}`]
    if (slotLabel) pieces.push(`slot = ${slotLabel}`)
    lineParts.push(`${dayLabel}: ${pieces.join(', ')}`)
  }

  return {
    exists: true,
    enabledDays,
    displayText: lineParts.join('\n'),
  }
}

export function buildSpecialProgramSummaryFromWeekdaySource(
  source: SpecialProgramWeekdaySummarySource,
  programName: StaffSpecialProgram
): SpecialProgramOverlaySummary {
  const normalized = createEmptySpecialProgramConfig()

  WEEKDAYS.forEach((day) => {
    const current = source[day]
    if (!current) return

    const slots = Array.isArray(current.slots)
      ? current.slots.filter((slot) => [1, 2, 3, 4].includes(slot)).slice().sort((a, b) => a - b)
      : []
    const rawFte =
      typeof current.fteSubtraction === 'number'
        ? current.fteSubtraction
        : typeof current.fte_subtraction === 'number'
          ? current.fte_subtraction
          : 0
    const hasExplicitEnabledFlag = typeof current.enabled === 'boolean'
    const hasMeaningfulData = hasExplicitEnabledFlag
      ? current.enabled
      : slots.length > 0 || (programName === 'CRP' ? rawFte >= 0 : rawFte > 0)

    if (!hasMeaningfulData) return

    normalized[day] = {
      enabled: true,
      slots,
      fteSubtraction: Number.isFinite(rawFte) ? rawFte : 0,
    }
  })

  return buildSpecialProgramSummaryFromConfig(normalized, programName)
}

export function getSpecialProgramConfigForStaff(
  program: Partial<SpecialProgram> | null,
  staffId: string
): SpecialProgramDraftConfig {
  const next = createEmptySpecialProgramConfig()

  WEEKDAYS.forEach((day) => {
    const current = getSpecialProgramStaffWeekdayConfig({ program, staffId, day })
    if (!current) return
    const slots = Array.isArray(current.slots) ? current.slots : []
    const fte = typeof current.fte_subtraction === 'number' ? Number(current.fte_subtraction) : 0
    next[day] = {
      enabled: current.enabled !== false,
      slots: slots.filter((slot) => [1, 2, 3, 4].includes(slot)),
      fteSubtraction: Number.isFinite(fte) ? fte : 0,
    }
  })

  return next
}

export function buildSpecialProgramSummaryFromProgramRow(
  programRow: Partial<SpecialProgram> | null,
  staffId: string,
  programName: StaffSpecialProgram
): SpecialProgramOverlaySummary {
  return buildSpecialProgramSummaryFromConfig(getSpecialProgramConfigForStaff(programRow, staffId), programName)
}

export function deriveSpecialProgramWeekdaysFromData(
  slots: Record<string, Partial<Record<Weekday, number[]>>>,
  fteSubtraction: Record<string, Partial<Record<Weekday, number>>>
): Weekday[] {
  const days = new Set<Weekday>()

  Object.values(slots).forEach((staffSlots) => {
    WEEKDAYS.forEach((day) => {
      if (Array.isArray(staffSlots?.[day]) && (staffSlots[day]?.length ?? 0) > 0) days.add(day)
    })
  })

  Object.values(fteSubtraction).forEach((staffFte) => {
    WEEKDAYS.forEach((day) => {
      if (typeof staffFte?.[day] === 'number') days.add(day)
    })
  })

  return Array.from(days)
}

export function buildSpecialProgramStaffEntry(
  config: SpecialProgramDraftConfig,
  programName: StaffSpecialProgram
): {
  slots: Partial<Record<Weekday, number[]>>
  fteSubtraction: Partial<Record<Weekday, number>>
} {
  const nextSlots: Partial<Record<Weekday, number[]>> = {}
  const nextFte: Partial<Record<Weekday, number>> = {}

  WEEKDAYS.forEach((day) => {
    const current = config[day]
    if (!current.enabled) return

    if (current.slots.length > 0) nextSlots[day] = current.slots
    if (programName === 'CRP') nextFte[day] = current.fteSubtraction
    else if (current.fteSubtraction > 0) nextFte[day] = current.fteSubtraction
  })

  return { slots: nextSlots, fteSubtraction: nextFte }
}
