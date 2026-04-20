import type { BaselineSnapshot } from '@/types/schedule'

/**
 * Baseline snapshots may omit `config_by_weekday` (e.g. pull_global_to_snapshot_v1 omitted the column).
 * Merge per-staff weekday config (including display_text) from live `spt_allocations` rows.
 */
export function mergeSptAllocationsWithLiveGlobalConfig(snapshotRows: any[], liveRows: any[]): any[] {
  const liveByStaff = new Map<string, any>()
  for (const r of liveRows || []) {
    if (r?.staff_id) liveByStaff.set(r.staff_id, r)
  }
  return snapshotRows.map((row) => {
    if (!row?.staff_id) return row
    const live = liveByStaff.get(row.staff_id)
    if (!live?.config_by_weekday || typeof live.config_by_weekday !== 'object') return row
    const snapCfg = row.config_by_weekday
    const snapKeys = snapCfg && typeof snapCfg === 'object' ? Object.keys(snapCfg) : []
    if (snapKeys.length === 0) {
      return { ...row, config_by_weekday: live.config_by_weekday }
    }
    let changed = false
    const outCfg: Record<string, unknown> = { ...(snapCfg as Record<string, unknown>) }
    for (const [day, liveDay] of Object.entries(live.config_by_weekday)) {
      const ld = liveDay as any
      if (!ld || typeof ld !== 'object') continue
      const sd = (snapCfg as any)[day]
      const snapDt = typeof sd?.display_text === 'string' ? sd.display_text.trim() : ''
      const liveDt = typeof ld?.display_text === 'string' ? ld.display_text.trim() : ''
      if (!snapDt && liveDt) {
        outCfg[day] = { ...(sd && typeof sd === 'object' ? sd : {}), ...ld }
        changed = true
      }
    }
    return changed ? { ...row, config_by_weekday: outCfg } : row
  })
}

export async function hydrateBaselineSptAllocationsFromLiveDb(
  supabase: any,
  baseline: BaselineSnapshot
): Promise<BaselineSnapshot> {
  const snapSpt = baseline.sptAllocations as any
  if (!Array.isArray(snapSpt) || snapSpt.length === 0) return baseline
  try {
    const liveRes = await supabase
      .from('spt_allocations')
      .select(
        'id,staff_id,specialty,teams,weekdays,slots,slot_modes,fte_addon,config_by_weekday,substitute_team_head,is_rbip_supervisor,active,created_at,updated_at'
      )
    if (liveRes.error || !Array.isArray(liveRes.data) || liveRes.data.length === 0) return baseline
    const merged = mergeSptAllocationsWithLiveGlobalConfig(snapSpt, liveRes.data as any[])
    return { ...baseline, sptAllocations: merged as any }
  } catch {
    return baseline
  }
}
