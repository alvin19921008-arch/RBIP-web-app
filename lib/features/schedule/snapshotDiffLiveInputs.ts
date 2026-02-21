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
const TEAM_SETTINGS_SELECT_FIELDS =
  'team,display_name,merged_into,merge_label_override,merged_pca_preferences_override'
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
    const teamSettingsQueryPromise = includeTeamSettings
      ? params.supabase.from('team_settings').select(TEAM_SETTINGS_SELECT_FIELDS)
      : Promise.resolve({ data: [], error: null } as QueryResult)

    const [staffRes, teamSettingsRes, wardsRes, prefsRes, programsRes, sptRes] = await Promise.all([
      params.supabase.from('staff').select(STAFF_SNAPSHOT_DIFF_SELECT_FIELDS),
      teamSettingsQueryPromise,
      params.supabase.from('wards').select(WARDS_SNAPSHOT_DIFF_SELECT_FIELDS),
      params.supabase.from('pca_preferences').select(PCA_PREFS_SNAPSHOT_DIFF_SELECT_FIELDS),
      params.supabase.from('special_programs').select(SPECIAL_PROGRAM_SNAPSHOT_DIFF_SELECT_FIELDS),
      params.supabase.from('spt_allocations').select(SPT_ALLOC_SNAPSHOT_DIFF_SELECT_FIELDS),
    ])

    let effectiveTeamSettingsRes: QueryResult = teamSettingsRes
    // Team settings diff is additive; keep main diff working even if this optional category fails.
    if ((effectiveTeamSettingsRes as any)?.error) {
      effectiveTeamSettingsRes = { data: [], error: null }
    }

    const firstError =
      (staffRes as any).error ||
      (wardsRes as any).error ||
      (prefsRes as any).error ||
      (programsRes as any).error ||
      (sptRes as any).error
    if (firstError) throw firstError

    return {
      staff: (staffRes as any).data || [],
      teamSettings: includeTeamSettings ? (effectiveTeamSettingsRes as any).data || [] : [],
      wards: (wardsRes as any).data || [],
      pcaPreferences: (prefsRes as any).data || [],
      specialPrograms: (programsRes as any).data || [],
      sptAllocations: (sptRes as any).data || [],
    }
  })

  if (scopedKey && ttlMs > 0) {
    snapshotDiffLiveInputsCache.set(scopedKey, { value, expiresAt: Date.now() + ttlMs })
  }

  return value
}
