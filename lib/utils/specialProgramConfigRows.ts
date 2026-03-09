import type {
  SpecialProgram,
  SpecialProgramStaffConfig,
  SpecialProgramStaffWeekdayConfig,
} from '@/types/allocation'
import type { Staff, Team, Weekday } from '@/types/staff'

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const THERAPIST_RANKS = new Set(['SPT', 'APPT', 'RPT'])
type StaffLookup = Pick<Staff, 'id' | 'rank' | 'team'>
type ConfiguredProgramStaffCandidate = {
  staffId: string
  fte_subtraction: number | undefined
  slots: number[]
  isPrimary: boolean
}

function normalizeSlots(slots: unknown): number[] {
  if (!Array.isArray(slots)) return []
  return slots
    .filter((slot): slot is number => typeof slot === 'number' && [1, 2, 3, 4].includes(slot))
    .slice()
    .sort((a, b) => a - b)
}

function normalizeWeekdayConfig(config: unknown): SpecialProgramStaffWeekdayConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {}
  }
  const raw = config as Record<string, unknown>
  const fte =
    typeof raw.fte_subtraction === 'number' && Number.isFinite(raw.fte_subtraction)
      ? Number(raw.fte_subtraction)
      : undefined
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    slots: normalizeSlots(raw.slots),
    fte_subtraction: fte,
    is_primary: typeof raw.is_primary === 'boolean' ? raw.is_primary : undefined,
  }
}

export function normalizeSpecialProgramStaffConfigs(rows: any[]): SpecialProgramStaffConfig[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const configByWeekday: Partial<Record<Weekday, SpecialProgramStaffWeekdayConfig>> = {}
      const rawConfig = row.config_by_weekday
      if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
        WEEKDAYS.forEach((day) => {
          const current = normalizeWeekdayConfig((rawConfig as any)[day])
          const hasMeaningfulData =
            current.enabled === true ||
            (current.slots?.length ?? 0) > 0 ||
            typeof current.fte_subtraction === 'number' ||
            current.is_primary === true
          if (hasMeaningfulData) {
            configByWeekday[day] = current
          }
        })
      }
      return {
        id: String(row.id ?? ''),
        program_id: String(row.program_id ?? ''),
        staff_id: String(row.staff_id ?? ''),
        config_by_weekday: configByWeekday,
        created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
      }
    })
    .filter((row) => row.program_id && row.staff_id)
}

function getLegacyStaffSlots(program: Partial<SpecialProgram> | null | undefined, staffId: string, day: Weekday): number[] {
  const legacySlots = ((program?.slots as any) ?? {})?.[staffId]?.[day]
  return normalizeSlots(legacySlots)
}

function getLegacyStaffFte(program: Partial<SpecialProgram> | null | undefined, staffId: string, day: Weekday): number | undefined {
  const raw = ((program?.fte_subtraction as any) ?? {})?.[staffId]?.[day]
  return typeof raw === 'number' && Number.isFinite(raw) ? Number(raw) : undefined
}

export function getSpecialProgramStaffWeekdayConfig(args: {
  program: Partial<SpecialProgram> | null | undefined
  staffId: string
  day: Weekday
}): SpecialProgramStaffWeekdayConfig | null {
  const { program, staffId, day } = args
  const row = program?.staff_configs?.find((entry) => entry.staff_id === staffId)
  if (row) {
    const current = normalizeWeekdayConfig(row.config_by_weekday?.[day])
    const hasMeaningfulData =
      current.enabled === true ||
      (current.slots?.length ?? 0) > 0 ||
      typeof current.fte_subtraction === 'number' ||
      current.is_primary === true
    if (hasMeaningfulData) return current
  }

  const legacySlots = getLegacyStaffSlots(program, staffId, day)
  const legacyFte = getLegacyStaffFte(program, staffId, day)
  if (legacySlots.length === 0 && legacyFte === undefined) return null
  return {
    enabled: true,
    slots: legacySlots,
    fte_subtraction: legacyFte,
  }
}

export function getSpecialProgramFallbackSlots(program: Pick<SpecialProgram, 'name'>): number[] {
  if (program.name === 'Robotic') return [1, 2, 3, 4]
  if (program.name === 'CRP') return [2]
  return [1, 2, 3, 4]
}

function getConfiguredProgramStaffCandidates(args: {
  program: SpecialProgram
  day: Weekday
}): ConfiguredProgramStaffCandidate[] {
  const { program, day } = args

  return (program.staff_ids || [])
    .map((staffId) => {
      const current = getSpecialProgramStaffWeekdayConfig({ program, staffId, day })
      if (!current) return null
      const slots = normalizeSlots(current.slots)
      const fte = current.fte_subtraction
      const enabled = current.enabled === true || slots.length > 0 || typeof fte === 'number'
      if (!enabled) return null
      return {
        staffId,
        fte_subtraction: fte,
        slots,
        isPrimary: current.is_primary === true,
      }
    })
    .filter((entry): entry is ConfiguredProgramStaffCandidate => !!entry)
}

function sortConfiguredProgramStaffCandidates(
  program: SpecialProgram,
  candidates: ConfiguredProgramStaffCandidate[]
): ConfiguredProgramStaffCandidate[] {
  const prefIds = program.therapist_preference_order
    ? Object.values(program.therapist_preference_order).flat()
    : []
  const prefIndex = (id: string) => {
    const index = prefIds.indexOf(id)
    return index >= 0 ? index : Number.POSITIVE_INFINITY
  }

  return candidates.slice().sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1

    if (program.name === 'CRP') {
      const aHasSlots = a.slots.length > 0 ? 1 : 0
      const bHasSlots = b.slots.length > 0 ? 1 : 0
      if (bHasSlots !== aHasSlots) return bHasSlots - aHasSlots
      if (b.slots.length !== a.slots.length) return b.slots.length - a.slots.length
      const af = typeof a.fte_subtraction === 'number' ? a.fte_subtraction : Number.POSITIVE_INFINITY
      const bf = typeof b.fte_subtraction === 'number' ? b.fte_subtraction : Number.POSITIVE_INFINITY
      if (af !== bf) return af - bf
    } else {
      const af = typeof a.fte_subtraction === 'number' ? a.fte_subtraction : -1
      const bf = typeof b.fte_subtraction === 'number' ? b.fte_subtraction : -1
      if (bf !== af) return bf - af
    }

    const prefDiff = prefIndex(a.staffId) - prefIndex(b.staffId)
    if (prefDiff !== 0) return prefDiff
    return a.staffId.localeCompare(b.staffId)
  })
}

export function getPrimaryConfiguredProgramStaffForWeekday(args: {
  program: SpecialProgram
  day: Weekday
}): { staffId: string; fte_subtraction: number | undefined; slots: number[] } | null {
  const candidates = sortConfiguredProgramStaffCandidates(
    args.program,
    getConfiguredProgramStaffCandidates(args)
  )
  const primary = candidates[0]
  if (!primary) return null
  return {
    staffId: primary.staffId,
    fte_subtraction: primary.fte_subtraction,
    slots: primary.slots,
  }
}

export function getEffectiveSpecialProgramWeekdaySlots(args: {
  program: SpecialProgram
  day: Weekday
  preferDirectWeekdaySlots?: boolean
}): number[] {
  const { program, day, preferDirectWeekdaySlots = false } = args
  const directWeekdaySlots = normalizeSlots(((program as any)?.slots ?? {})?.[day])

  if (preferDirectWeekdaySlots && directWeekdaySlots.length > 0) {
    return directWeekdaySlots
  }

  const primaryConfigured = getPrimaryConfiguredProgramStaffForWeekday({ program, day })
  if ((primaryConfigured?.slots.length ?? 0) > 0) {
    return primaryConfigured!.slots
  }

  if (directWeekdaySlots.length > 0) {
    return directWeekdaySlots
  }

  return getSpecialProgramFallbackSlots(program)
}

export function buildSpecialProgramsFromRows(args: {
  programRows: any[]
  staffConfigRows: any[]
}): SpecialProgram[] {
  const normalizedRows = normalizeSpecialProgramStaffConfigs(args.staffConfigRows)
  const rowsByProgramId = new Map<string, SpecialProgramStaffConfig[]>()
  normalizedRows.forEach((row) => {
    const list = rowsByProgramId.get(row.program_id) ?? []
    list.push(row)
    rowsByProgramId.set(row.program_id, list)
  })

  return (Array.isArray(args.programRows) ? args.programRows : []).map((programRow: any) => {
    const programId = String(programRow?.id ?? '')
    const relatedConfigs = rowsByProgramId.get(programId) ?? []

    if (relatedConfigs.length === 0) {
      return {
        ...(programRow as SpecialProgram),
        staff_configs: [],
      }
    }

    const staffIds = new Set<string>(
      Array.isArray(programRow?.staff_ids)
        ? (programRow.staff_ids as any[]).filter((id) => typeof id === 'string')
        : []
    )
    const weekdays = new Set<Weekday>()
    const slots: Record<string, Partial<Record<Weekday, number[]>>> = {}
    const fteSubtraction: Record<string, Partial<Record<Weekday, number>>> = {}

    relatedConfigs.forEach((config) => {
      staffIds.add(config.staff_id)
      WEEKDAYS.forEach((day) => {
        const current = normalizeWeekdayConfig(config.config_by_weekday?.[day])
        const hasMeaningfulData =
          current.enabled === true ||
          (current.slots?.length ?? 0) > 0 ||
          typeof current.fte_subtraction === 'number' ||
          current.is_primary === true
        if (!hasMeaningfulData) return

        weekdays.add(day)

        if ((current.slots?.length ?? 0) > 0) {
          slots[config.staff_id] = slots[config.staff_id] ?? {}
          slots[config.staff_id][day] = current.slots
        }

        if (typeof current.fte_subtraction === 'number') {
          fteSubtraction[config.staff_id] = fteSubtraction[config.staff_id] ?? {}
          fteSubtraction[config.staff_id][day] = current.fte_subtraction
        }
      })
    })

    return {
      ...(programRow as SpecialProgram),
      staff_ids: Array.from(staffIds),
      weekdays: Array.from(weekdays),
      slots: slots as any,
      fte_subtraction: fteSubtraction as any,
      staff_configs: relatedConfigs,
    }
  })
}

export function getPrimaryConfiguredTherapistForWeekday(args: {
  program: SpecialProgram
  day: Weekday
  allStaff: StaffLookup[]
}): { staffId: string; fte_subtraction: number | undefined; slots: number[] } | null {
  const { program, day, allStaff } = args
  const therapistIds = new Set(
    allStaff
      .filter((entry) => THERAPIST_RANKS.has(entry.rank))
      .map((entry) => entry.id)
  )
  const candidates = sortConfiguredProgramStaffCandidates(
    program,
    getConfiguredProgramStaffCandidates({ program, day }).filter((entry) => therapistIds.has(entry.staffId))
  )

  if (candidates.length === 0) return null

  return candidates[0] ?? null
}

export function resolveSpecialProgramTeamFromTherapist(args: {
  program: SpecialProgram
  day: Weekday
  allStaff: StaffLookup[]
}): Team | null {
  const primary = getPrimaryConfiguredTherapistForWeekday(args)
  if (!primary) return null
  const staff = args.allStaff.find((entry) => entry.id === primary.staffId)
  return (staff?.team ?? null) as Team | null
}
