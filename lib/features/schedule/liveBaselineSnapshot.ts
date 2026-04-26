import type { Team } from '@/types/staff'
import type { BaselineSnapshot, BaselineSnapshotEnvelope } from '@/types/schedule'
import { fetchGlobalHeadAtCreation } from '@/lib/features/config/globalHead'
import { buildBaselineSnapshotEnvelope } from '@/lib/utils/snapshotEnvelope'
import { minifySpecialProgramsForSnapshot } from '@/lib/utils/snapshotMinify'
import { buildSpecialProgramsFromRows } from '@/lib/utils/specialProgramConfigRows'
import { buildTeamMergeSnapshotFromTeamSettings } from '@/lib/utils/teamMerge'

export async function fetchLiveTeamSettingsSnapshot(supabase: any): Promise<{
  teamDisplayNames: Partial<Record<Team, string>>
  teamMerge: ReturnType<typeof buildTeamMergeSnapshotFromTeamSettings>
}> {
  const result = await supabase
    .from('team_settings')
    .select('team,display_name,merged_into,merge_label_override,merged_pca_preferences_override')
    .order('team')
  if (result.error) throw result.error

  const rows = (result.data || []) as any[]
  const teamDisplayNames: Partial<Record<Team, string>> = {}
  rows.forEach((row) => {
    const team = row?.team as Team | undefined
    if (!team) return
    const raw = typeof row?.display_name === 'string' ? row.display_name.trim() : ''
    if (raw) teamDisplayNames[team] = raw
  })

  return {
    teamDisplayNames,
    teamMerge: buildTeamMergeSnapshotFromTeamSettings(rows as any),
  }
}

export async function fetchLiveBaselineSnapshotEnvelope(args: {
  supabase: any
  source: 'save' | 'migration' | 'copy'
}): Promise<{ snapshot: BaselineSnapshot; envelope: BaselineSnapshotEnvelope }> {
  const { supabase, source } = args

  const [
    globalHeadAtCreation,
    liveTeamConfig,
    liveStaffRes,
    liveSpecialProgramsRes,
    liveSpecialProgramConfigsRes,
    liveSptRes,
    liveWardsRes,
    livePcaPrefRes,
  ] = await Promise.all([
    fetchGlobalHeadAtCreation(supabase),
    fetchLiveTeamSettingsSnapshot(supabase).catch(() => null),
    supabase.from('staff').select('id,name,rank,team,shared_therapist_mode,floating,status,buffer_fte,floor_pca,special_program'),
    supabase.from('special_programs').select('id,name,staff_ids,weekdays,slots,fte_subtraction,pca_required,therapist_preference_order,pca_preference_order'),
    supabase.from('special_program_staff_configs').select('id,program_id,staff_id,config_by_weekday,created_at,updated_at'),
    supabase.from('spt_allocations').select('id,staff_id,specialty,teams,weekdays,slots,slot_modes,fte_addon,config_by_weekday,substitute_team_head,is_rbip_supervisor,active,created_at,updated_at'),
    supabase.from('wards').select('id,name,total_beds,team_assignments,team_assignment_portions'),
    supabase.from('pca_preferences').select('id,team,preferred_pca_ids,preferred_slots,avoid_gym_schedule,gym_schedule,floor_pca_selection'),
  ])

  if (liveStaffRes.error) throw liveStaffRes.error
  if (liveSpecialProgramsRes.error) throw liveSpecialProgramsRes.error
  if (liveSpecialProgramConfigsRes.error) throw liveSpecialProgramConfigsRes.error
  if (liveSptRes.error) throw liveSptRes.error
  if (liveWardsRes.error) throw liveWardsRes.error
  if (livePcaPrefRes.error) throw livePcaPrefRes.error

  const liveSpecialPrograms = buildSpecialProgramsFromRows({
    programRows: (liveSpecialProgramsRes.data || []) as any[],
    staffConfigRows: (liveSpecialProgramConfigsRes.data || []) as any[],
  })

  const snapshot: BaselineSnapshot = {
    staff: (liveStaffRes.data || []) as any,
    specialPrograms: minifySpecialProgramsForSnapshot(liveSpecialPrograms as any) as any,
    sptAllocations: (liveSptRes.data || []) as any,
    wards: (liveWardsRes.data || []) as any,
    pcaPreferences: (livePcaPrefRes.data || []) as any,
    teamDisplayNames: (liveTeamConfig as any)?.teamDisplayNames,
    teamMerge: (liveTeamConfig as any)?.teamMerge,
  }

  return {
    snapshot,
    envelope: buildBaselineSnapshotEnvelope({
      data: snapshot,
      source,
      globalHeadAtCreation,
    }),
  }
}
