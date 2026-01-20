import type { BaselineSnapshot } from '@/types/schedule'
import type { Team, StaffRank } from '@/types/staff'
import { TEAMS } from '@/lib/utils/types'

type StaffLite = {
  id: string
  name: string
  rank: StaffRank
  team: Team | null
  floating: boolean
  status?: 'active' | 'inactive' | 'buffer'
  buffer_fte?: number | null
  floor_pca?: string[] | null
  special_program?: string[] | null
}

type WardLite = {
  name: string
  total_beds: number
  team_assignments: Record<string, number>
  team_assignment_portions?: Record<string, string> | null | undefined
}

type PCAPreferenceLite = {
  team: Team
  floor_pca_selection?: 'upper' | 'lower' | null
  gym_schedule?: number | null
  avoid_gym_schedule?: boolean | null
  preferred_slots?: number[] | null
  preferred_pca_ids?: string[] | null
}

type SpecialProgramLite = {
  id: string
  name: string
  weekdays?: string[] | null
  staff_ids?: string[] | null
  slots?: unknown
}

type SptAllocationLite = {
  id: string
  staff_id: string
  weekdays?: string[] | null
  fte_addon?: number | null
  slots?: unknown
}

type FieldChange = { field: string; from: string; to: string }

export type SnapshotDiffResult = {
  staff: {
    added: StaffLite[]
    removed: StaffLite[]
    changed: Array<{ id: string; name: string; changes: FieldChange[] }>
  }
  teamSettings: {
    changed: Array<{ team: Team; changes: FieldChange[] }>
  }
  wards: {
    added: WardLite[]
    removed: WardLite[]
    changed: Array<{ name: string; changes: FieldChange[] }>
  }
  pcaPreferences: {
    changed: Array<{ team: Team; changes: FieldChange[] }>
  }
  specialPrograms: {
    added: SpecialProgramLite[]
    removed: SpecialProgramLite[]
    changed: Array<{ id: string; name: string; changes: FieldChange[] }>
  }
  sptAllocations: {
    added: SptAllocationLite[]
    removed: SptAllocationLite[]
    changed: Array<{ id: string; staff_id: string; changes: FieldChange[] }>
  }
}

function toStr(v: unknown): string {
  if (v == null) return '∅'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
type WeekdayKey = (typeof WEEKDAYS)[number]

function normStrArray(v: unknown): string {
  if (!Array.isArray(v)) return '∅'
  return v
    .filter((x) => typeof x === 'string')
    .slice()
    .sort()
    .join(', ')
}

function normNumArray(v: unknown): string {
  if (!Array.isArray(v)) return '∅'
  return v
    .filter((x) => typeof x === 'number')
    .slice()
    .sort((a, b) => a - b)
    .join(', ')
}

function normIdArray(v: unknown): string {
  if (!Array.isArray(v)) return '∅'
  return v
    .filter((x) => typeof x === 'string')
    .slice()
    .sort()
    .join(', ')
}

function normNameArrayFromIds(ids: unknown, idToName: Map<string, string>): string {
  if (!Array.isArray(ids)) return '∅'
  const names = ids
    .filter((x) => typeof x === 'string')
    .map((id) => idToName.get(id as string) ?? (id as string))
    .slice()
    .sort((a, b) => a.localeCompare(b))
  return names.length > 0 ? names.join(', ') : '∅'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function summarizeWeekdaySlotsMap(value: unknown): string {
  if (!isPlainObject(value)) return '∅'
  const parts: string[] = []
  for (const d of WEEKDAYS) {
    const raw = (value as any)[d]
    if (!Array.isArray(raw)) continue
    const slots = raw.filter((x: any) => typeof x === 'number').slice().sort((a: number, b: number) => a - b)
    if (slots.length === 0) continue
    parts.push(`${d}:[${slots.join(',')}]`)
  }
  return parts.length > 0 ? parts.join(' ') : '∅'
}

function summarizeSpecialProgramSlots(value: unknown, idToName: Map<string, string>): string {
  if (value == null) return '∅'
  if (!isPlainObject(value)) return toStr(value)

  // Weekday-keyed: { mon: [1,2], ... }
  const hasAnyWeekdayKey = WEEKDAYS.some((d) => Object.prototype.hasOwnProperty.call(value, d))
  if (hasAnyWeekdayKey) {
    return summarizeWeekdaySlotsMap(value)
  }

  // Staff-keyed: { [staffId]: { mon: [1,2], ... }, ... }
  const entries: Array<{ label: string; summary: string }> = []
  for (const [staffId, map] of Object.entries(value)) {
    if (!isPlainObject(map)) continue
    const summary = summarizeWeekdaySlotsMap(map)
    if (summary === '∅') continue
    const label = idToName.get(staffId) ?? staffId
    entries.push({ label, summary })
  }

  entries.sort((a, b) => a.label.localeCompare(b.label))
  const shown = entries.slice(0, 5)
  const rest = Math.max(0, entries.length - shown.length)
  const rendered = shown.map((e) => `${e.label} ${e.summary}`).join('; ')
  return rest > 0 ? `${rendered}; …and ${rest} more` : rendered || '∅'
}

function shallowDiff(fields: Array<{ key: string; label: string; a: unknown; b: unknown }>): FieldChange[] {
  const out: FieldChange[] = []
  for (const f of fields) {
    const as = toStr(f.a)
    const bs = toStr(f.b)
    if (as !== bs) out.push({ field: f.label, from: as, to: bs })
  }
  return out
}

export function diffBaselineSnapshot(params: {
  snapshot: BaselineSnapshot
  live: {
    staff: any[]
    teamSettings?: any[]
    wards: any[]
    pcaPreferences: any[]
    specialPrograms: any[]
    sptAllocations: any[]
  }
}): SnapshotDiffResult {
  const snapshotStaff: StaffLite[] = (params.snapshot.staff || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    rank: s.rank,
    team: (s.team ?? null) as Team | null,
    floating: !!s.floating,
    status: s.status,
    buffer_fte: (s as any).buffer_fte ?? null,
    floor_pca: (s as any).floor_pca ?? null,
    special_program: (s as any).special_program ?? null,
  }))
  const liveStaff: StaffLite[] = (params.live.staff || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    rank: s.rank,
    team: (s.team ?? null) as Team | null,
    floating: !!s.floating,
    status: s.status,
    buffer_fte: (s as any).buffer_fte ?? null,
    floor_pca: (s as any).floor_pca ?? null,
    special_program: (s as any).special_program ?? null,
  }))

  const byIdSnap = new Map(snapshotStaff.map((s) => [s.id, s] as const))
  const byIdLive = new Map(liveStaff.map((s) => [s.id, s] as const))
  const idToName = new Map<string, string>()
  snapshotStaff.forEach((s) => idToName.set(s.id, s.name))
  liveStaff.forEach((s) => idToName.set(s.id, s.name))

  const staffAdded: StaffLite[] = []
  const staffRemoved: StaffLite[] = []
  const staffChanged: Array<{ id: string; name: string; changes: FieldChange[] }> = []

  byIdLive.forEach((s, id) => {
    if (!byIdSnap.has(id)) staffAdded.push(s)
  })
  byIdSnap.forEach((s, id) => {
    if (!byIdLive.has(id)) staffRemoved.push(s)
  })
  byIdSnap.forEach((snap, id) => {
    const live = byIdLive.get(id)
    if (!live) return
    const changes = [
      ...shallowDiff([
        { key: 'name', label: 'name', a: snap.name, b: live.name },
        { key: 'rank', label: 'rank', a: snap.rank, b: live.rank },
        { key: 'team', label: 'team', a: snap.team, b: live.team },
        { key: 'floating', label: 'floating', a: snap.floating, b: live.floating },
        { key: 'status', label: 'status', a: snap.status ?? 'active', b: live.status ?? 'active' },
        { key: 'buffer_fte', label: 'buffer_fte', a: snap.buffer_fte ?? null, b: live.buffer_fte ?? null },
      ]),
    ]
    const floorA = normStrArray(snap.floor_pca)
    const floorB = normStrArray(live.floor_pca)
    if (floorA !== floorB) changes.push({ field: 'floor_pca', from: floorA, to: floorB })
    const spA = normStrArray(snap.special_program)
    const spB = normStrArray(live.special_program)
    if (spA !== spB) changes.push({ field: 'special_program', from: spA, to: spB })

    if (changes.length > 0) staffChanged.push({ id, name: live.name || snap.name || id, changes })
  })

  staffAdded.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  staffRemoved.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  staffChanged.sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Team settings (snapshot.teamDisplayNames vs live team_settings.display_name)
  const snapTeamDisplayNames = ((params.snapshot as any)?.teamDisplayNames || {}) as Record<string, unknown>
  const liveTeamSettings = (params.live.teamSettings || []) as any[]
  const liveTeamNameByTeam = new Map<string, string>()
  liveTeamSettings.forEach((r) => {
    const t = r?.team
    const n = r?.display_name
    if (typeof t === 'string' && typeof n === 'string') {
      liveTeamNameByTeam.set(t, n)
    }
  })

  const teamKeys = new Set<string>([
    ...Object.keys(snapTeamDisplayNames || {}),
    ...Array.from(liveTeamNameByTeam.keys()),
  ])
  const teamSettingsChanged: Array<{ team: Team; changes: FieldChange[] }> = []
  teamKeys.forEach((team) => {
    if (!(TEAMS as readonly string[]).includes(team)) return
    const snapNameRaw = (snapTeamDisplayNames as any)?.[team]
    const snapName = typeof snapNameRaw === 'string' && snapNameRaw.trim() ? snapNameRaw : team
    const liveName = liveTeamNameByTeam.get(team) ?? team
    const changes = shallowDiff([{ key: 'display_name', label: 'display_name', a: snapName, b: liveName }])
    if (changes.length > 0) teamSettingsChanged.push({ team: team as Team, changes })
  })
  teamSettingsChanged.sort((a, b) => a.team.localeCompare(b.team))

  // Wards (key by name)
  const snapWards: WardLite[] = (params.snapshot.wards || []).map((w: any) => ({
    name: w.name,
    total_beds: w.total_beds,
    team_assignments: w.team_assignments || {},
    team_assignment_portions: w.team_assignment_portions ?? null,
  }))
  const liveWards: WardLite[] = (params.live.wards || []).map((w: any) => ({
    name: w.name,
    total_beds: w.total_beds,
    team_assignments: w.team_assignments || {},
    // Only compare portions when the live schema actually has this field.
    team_assignment_portions: Object.prototype.hasOwnProperty.call(w, 'team_assignment_portions')
      ? (w.team_assignment_portions ?? null)
      : undefined,
  }))
  const wardSnapByName = new Map(snapWards.map((w) => [w.name, w] as const))
  const wardLiveByName = new Map(liveWards.map((w) => [w.name, w] as const))

  const wardsAdded: WardLite[] = []
  const wardsRemoved: WardLite[] = []
  const wardsChanged: Array<{ name: string; changes: FieldChange[] }> = []

  wardLiveByName.forEach((w, name) => {
    if (!wardSnapByName.has(name)) wardsAdded.push(w)
  })
  wardSnapByName.forEach((w, name) => {
    if (!wardLiveByName.has(name)) wardsRemoved.push(w)
  })
  wardSnapByName.forEach((snap, name) => {
    const live = wardLiveByName.get(name)
    if (!live) return
    const changes = shallowDiff([
      { key: 'total_beds', label: 'total_beds', a: snap.total_beds, b: live.total_beds },
      { key: 'team_assignments', label: 'team_assignments', a: snap.team_assignments, b: live.team_assignments },
    ])
    if (live.team_assignment_portions !== undefined && snap.team_assignment_portions !== null) {
      const a = snap.team_assignment_portions ?? {}
      const b = live.team_assignment_portions ?? {}
      const as = toStr(a)
      const bs = toStr(b)
      if (as !== bs) changes.push({ field: 'team_assignment_portions', from: as, to: bs })
    }
    if (changes.length > 0) wardsChanged.push({ name, changes })
  })

  wardsAdded.sort((a, b) => a.name.localeCompare(b.name))
  wardsRemoved.sort((a, b) => a.name.localeCompare(b.name))
  wardsChanged.sort((a, b) => a.name.localeCompare(b.name))

  // PCA preferences (key by team)
  const snapPrefs: PCAPreferenceLite[] = (params.snapshot.pcaPreferences || []).map((p: any) => ({
    team: p.team,
    floor_pca_selection: p.floor_pca_selection ?? null,
    gym_schedule: p.gym_schedule ?? null,
    avoid_gym_schedule: p.avoid_gym_schedule ?? null,
    preferred_slots: p.preferred_slots ?? null,
    preferred_pca_ids: p.preferred_pca_ids ?? null,
  }))
  const livePrefs: PCAPreferenceLite[] = (params.live.pcaPreferences || []).map((p: any) => ({
    team: p.team,
    floor_pca_selection: p.floor_pca_selection ?? null,
    gym_schedule: p.gym_schedule ?? null,
    avoid_gym_schedule: p.avoid_gym_schedule ?? null,
    preferred_slots: p.preferred_slots ?? null,
    preferred_pca_ids: p.preferred_pca_ids ?? null,
  }))
  const snapPrefByTeam = new Map(snapPrefs.map((p) => [p.team, p] as const))
  const livePrefByTeam = new Map(livePrefs.map((p) => [p.team, p] as const))

  const pcaPrefsChanged: Array<{ team: Team; changes: FieldChange[] }> = []
  const allTeams = new Set<Team>([...snapPrefByTeam.keys(), ...livePrefByTeam.keys()])
  allTeams.forEach((team) => {
    const snap = snapPrefByTeam.get(team)
    const live = livePrefByTeam.get(team)
    const changes: FieldChange[] = []
    changes.push(
      ...shallowDiff([
        { key: 'floor', label: 'floor_pca_selection', a: snap?.floor_pca_selection ?? null, b: live?.floor_pca_selection ?? null },
        { key: 'gym', label: 'gym_schedule', a: snap?.gym_schedule ?? null, b: live?.gym_schedule ?? null },
        { key: 'avoid', label: 'avoid_gym_schedule', a: snap?.avoid_gym_schedule ?? null, b: live?.avoid_gym_schedule ?? null },
      ])
    )
    const slotsA = normNumArray(snap?.preferred_slots ?? null)
    const slotsB = normNumArray(live?.preferred_slots ?? null)
    if (slotsA !== slotsB) changes.push({ field: 'preferred_slots', from: slotsA, to: slotsB })
    const idsAList = Array.isArray(snap?.preferred_pca_ids) ? (snap?.preferred_pca_ids as string[]) : []
    const idsBList = Array.isArray(live?.preferred_pca_ids) ? (live?.preferred_pca_ids as string[]) : []
    const namesA = idsAList
      .slice()
      .sort()
      .map((id) => idToName.get(id) ?? id)
      .join(', ') || '∅'
    const namesB = idsBList
      .slice()
      .sort()
      .map((id) => idToName.get(id) ?? id)
      .join(', ') || '∅'
    if (namesA !== namesB) changes.push({ field: 'preferred_pca_ids', from: namesA, to: namesB })
    if (changes.length > 0) pcaPrefsChanged.push({ team, changes })
  })
  pcaPrefsChanged.sort((a, b) => a.team.localeCompare(b.team))

  // Special programs (summary diff)
  const snapPrograms: SpecialProgramLite[] = (params.snapshot.specialPrograms || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    weekdays: p.weekdays ?? null,
    staff_ids: p.staff_ids ?? null,
    slots: p.slots ?? null,
  }))
  const livePrograms: SpecialProgramLite[] = (params.live.specialPrograms || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    weekdays: p.weekdays ?? null,
    staff_ids: p.staff_ids ?? null,
    slots: p.slots ?? null,
  }))
  const snapProgById = new Map(snapPrograms.map((p) => [p.id, p] as const))
  const liveProgById = new Map(livePrograms.map((p) => [p.id, p] as const))
  const programsAdded: SpecialProgramLite[] = []
  const programsRemoved: SpecialProgramLite[] = []
  const programsChanged: Array<{ id: string; name: string; changes: FieldChange[] }> = []
  liveProgById.forEach((p, id) => {
    if (!snapProgById.has(id)) programsAdded.push(p)
  })
  snapProgById.forEach((p, id) => {
    if (!liveProgById.has(id)) programsRemoved.push(p)
  })
  snapProgById.forEach((snap, id) => {
    const live = liveProgById.get(id)
    if (!live) return
    const changes: FieldChange[] = []
    const wA = normStrArray(snap.weekdays)
    const wB = normStrArray(live.weekdays)
    if (wA !== wB) changes.push({ field: 'weekdays', from: wA, to: wB })
    const sA = normNameArrayFromIds(snap.staff_ids, idToName)
    const sB = normNameArrayFromIds(live.staff_ids, idToName)
    if (sA !== sB) changes.push({ field: 'staff_ids', from: sA, to: sB })
    const slotsA = summarizeSpecialProgramSlots(snap.slots, idToName)
    const slotsB = summarizeSpecialProgramSlots(live.slots, idToName)
    if (slotsA !== slotsB) changes.push({ field: 'slots', from: slotsA, to: slotsB })
    if (changes.length > 0) programsChanged.push({ id, name: live.name || snap.name || id, changes })
  })
  programsAdded.sort((a, b) => a.name.localeCompare(b.name))
  programsRemoved.sort((a, b) => a.name.localeCompare(b.name))
  programsChanged.sort((a, b) => a.name.localeCompare(b.name))

  // SPT allocations (summary diff)
  const snapSpt: SptAllocationLite[] = (params.snapshot.sptAllocations || []).map((a: any) => ({
    id: a.id,
    staff_id: a.staff_id,
    weekdays: a.weekdays ?? null,
    fte_addon: a.fte_addon ?? null,
    slots: a.slots ?? null,
  }))
  const liveSpt: SptAllocationLite[] = (params.live.sptAllocations || []).map((a: any) => ({
    id: a.id,
    staff_id: a.staff_id,
    weekdays: a.weekdays ?? null,
    fte_addon: a.fte_addon ?? null,
    slots: a.slots ?? null,
  }))
  const snapSptById = new Map(snapSpt.map((a) => [a.id, a] as const))
  const liveSptById = new Map(liveSpt.map((a) => [a.id, a] as const))
  const sptAdded: SptAllocationLite[] = []
  const sptRemoved: SptAllocationLite[] = []
  const sptChanged: Array<{ id: string; staff_id: string; changes: FieldChange[] }> = []
  liveSptById.forEach((a, id) => {
    if (!snapSptById.has(id)) sptAdded.push(a)
  })
  snapSptById.forEach((a, id) => {
    if (!liveSptById.has(id)) sptRemoved.push(a)
  })
  snapSptById.forEach((snap, id) => {
    const live = liveSptById.get(id)
    if (!live) return
    const changes: FieldChange[] = []
    const wA = normStrArray(snap.weekdays)
    const wB = normStrArray(live.weekdays)
    if (wA !== wB) changes.push({ field: 'weekdays', from: wA, to: wB })
    const fA = toStr(snap.fte_addon ?? null)
    const fB = toStr(live.fte_addon ?? null)
    if (fA !== fB) changes.push({ field: 'fte_addon', from: fA, to: fB })
    const slotsA = toStr(snap.slots)
    const slotsB = toStr(live.slots)
    if (slotsA !== slotsB) changes.push({ field: 'slots', from: 'changed', to: 'changed' })
    if (changes.length > 0) sptChanged.push({ id, staff_id: live.staff_id || snap.staff_id, changes })
  })

  return {
    staff: { added: staffAdded, removed: staffRemoved, changed: staffChanged },
    teamSettings: { changed: teamSettingsChanged },
    wards: { added: wardsAdded, removed: wardsRemoved, changed: wardsChanged },
    pcaPreferences: { changed: pcaPrefsChanged },
    specialPrograms: { added: programsAdded, removed: programsRemoved, changed: programsChanged },
    sptAllocations: { added: sptAdded, removed: sptRemoved, changed: sptChanged },
  }
}

