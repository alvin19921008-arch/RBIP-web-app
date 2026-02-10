type QueryResult = { data?: any[] | null; error?: any }

export type SnapshotDiffLiveInputs = {
  staff: any[]
  teamSettings: any[]
  wards: any[]
  pcaPreferences: any[]
  specialPrograms: any[]
  sptAllocations: any[]
}

type FetchSnapshotDiffLiveInputsParams = {
  supabase: any
  includeTeamSettings?: boolean
  cacheKey?: string
  ttlMs?: number
}

export const SNAPSHOT_DIFF_LIVE_INPUTS_DEFAULT_TTL_MS = 20_000

const STAFF_SNAPSHOT_DIFF_SELECT_FIELDS =
  'id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program'
const TEAM_SETTINGS_SELECT_FIELDS = 'team,display_name'
const WARDS_SNAPSHOT_DIFF_SELECT_FIELDS =
  'id,name,total_beds,team_assignments,team_assignment_portions'
const PCA_PREFS_SNAPSHOT_DIFF_SELECT_FIELDS =
  'id,team,preferred_pca_ids,preferred_slots,avoid_gym_schedule,gym_schedule,floor_pca_selection'
const SPECIAL_PROGRAM_SNAPSHOT_DIFF_SELECT_FIELDS =
  'id,name,staff_ids,weekdays,slots,fte_subtraction,pca_required,therapist_preference_order,pca_preference_order'
const SPT_ALLOC_SNAPSHOT_DIFF_SELECT_FIELDS =
  'id,staff_id,specialty,teams,weekdays,slots,slot_modes,fte_addon,config_by_weekday,substitute_team_head,is_rbip_supervisor,active'

const snapshotDiffLiveInputsCache = new Map<string, { expiresAt: number; value: SnapshotDiffLiveInputs }>()
const snapshotDiffLiveInputsInFlight = new Map<string, Promise<SnapshotDiffLiveInputs>>()

function isMissingColumnError(error: any): boolean {
  return !!error && (String(error?.message || '').includes('column') || String(error?.code || '') === '42703')
}

function isMissingTeamAssignmentPortionsError(error: any): boolean {
  return !!error && String(error?.message || '').includes('team_assignment_portions')
}

async function withInFlight<T>(key: string | null, make: () => Promise<T>): Promise<T> {
  if (!key) return make()
  const existing = snapshotDiffLiveInputsInFlight.get(key)
  if (existing) return (existing as Promise<T>)
  const promise = make().finally(() => {
    snapshotDiffLiveInputsInFlight.delete(key)
  })
  snapshotDiffLiveInputsInFlight.set(key, promise as Promise<SnapshotDiffLiveInputs>)
  return promise
}

export async function fetchSnapshotDiffLiveInputs(
  params: FetchSnapshotDiffLiveInputsParams
): Promise<SnapshotDiffLiveInputs> {
  const includeTeamSettings = !!params.includeTeamSettings
  const ttlMs = Math.max(0, Number(params.ttlMs ?? SNAPSHOT_DIFF_LIVE_INPUTS_DEFAULT_TTL_MS))
  const scopedKey = params.cacheKey
    ? `${params.cacheKey}|includeTeamSettings:${includeTeamSettings ? '1' : '0'}`
    : null

  if (scopedKey && ttlMs > 0) {
    const hit = snapshotDiffLiveInputsCache.get(scopedKey)
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value
    }
    if (hit && hit.expiresAt <= Date.now()) {
      snapshotDiffLiveInputsCache.delete(scopedKey)
    }
  }

  const value = await withInFlight(scopedKey, async () => {
    const teamSettingsAttemptPromise = includeTeamSettings
      ? params.supabase.from('team_settings').select(TEAM_SETTINGS_SELECT_FIELDS)
      : Promise.resolve({ data: [], error: null } as QueryResult)

    const [staffRes, teamSettingsAttempt, wardsRes, prefsRes, programsRes, sptRes] = await Promise.all([
      params.supabase.from('staff').select(STAFF_SNAPSHOT_DIFF_SELECT_FIELDS),
      teamSettingsAttemptPromise,
      params.supabase.from('wards').select(WARDS_SNAPSHOT_DIFF_SELECT_FIELDS),
      params.supabase.from('pca_preferences').select(PCA_PREFS_SNAPSHOT_DIFF_SELECT_FIELDS),
      params.supabase.from('special_programs').select(SPECIAL_PROGRAM_SNAPSHOT_DIFF_SELECT_FIELDS),
      params.supabase.from('spt_allocations').select(SPT_ALLOC_SNAPSHOT_DIFF_SELECT_FIELDS),
    ])

    let effectiveWardsRes: QueryResult = wardsRes
    if (isMissingTeamAssignmentPortionsError((wardsRes as any)?.error)) {
      effectiveWardsRes = await params.supabase.from('wards').select('id,name,total_beds,team_assignments')
    } else if (isMissingColumnError((wardsRes as any)?.error)) {
      effectiveWardsRes = await params.supabase.from('wards').select('*')
    }

    let effectivePrefsRes: QueryResult = prefsRes
    if (isMissingColumnError((prefsRes as any)?.error)) {
      effectivePrefsRes = await params.supabase.from('pca_preferences').select('*')
    }

    let effectiveProgramsRes: QueryResult = programsRes
    if (isMissingColumnError((programsRes as any)?.error)) {
      effectiveProgramsRes = await params.supabase.from('special_programs').select('*')
    }

    let effectiveSptRes: QueryResult = sptRes
    if (isMissingColumnError((sptRes as any)?.error)) {
      effectiveSptRes = await params.supabase.from('spt_allocations').select('*')
    }

    let effectiveTeamSettingsRes: QueryResult = teamSettingsAttempt
    if (includeTeamSettings && isMissingColumnError((teamSettingsAttempt as any)?.error)) {
      effectiveTeamSettingsRes = await params.supabase.from('team_settings').select('*')
    }
    // Team settings diff is additive; keep main diff working even if this optional category fails.
    if ((effectiveTeamSettingsRes as any)?.error) {
      effectiveTeamSettingsRes = { data: [], error: null }
    }

    const firstError =
      (staffRes as any).error ||
      (effectiveWardsRes as any).error ||
      (effectivePrefsRes as any).error ||
      (effectiveProgramsRes as any).error ||
      (effectiveSptRes as any).error
    if (firstError) throw firstError

    return {
      staff: (staffRes as any).data || [],
      teamSettings: includeTeamSettings ? (effectiveTeamSettingsRes as any).data || [] : [],
      wards: (effectiveWardsRes as any).data || [],
      pcaPreferences: (effectivePrefsRes as any).data || [],
      specialPrograms: (effectiveProgramsRes as any).data || [],
      sptAllocations: (effectiveSptRes as any).data || [],
    }
  })

  if (scopedKey && ttlMs > 0) {
    snapshotDiffLiveInputsCache.set(scopedKey, { value, expiresAt: Date.now() + ttlMs })
  }

  return value
}
