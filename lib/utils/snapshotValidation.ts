import type { Team } from '@/types/staff'
import type {
  BaselineSnapshot,
  BaselineSnapshotEnvelope,
  BaselineSnapshotSource,
  SnapshotHealthReport,
} from '@/types/schedule'
import { buildBaselineSnapshotEnvelope, unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as any).length > 0
}

function isValidTeam(value: unknown): value is Team | null {
  if (value === null) return true
  return typeof value === 'string' && (TEAMS as readonly string[]).includes(value)
}

function isValidStatus(value: unknown): value is 'active' | 'inactive' | 'buffer' {
  return value === 'active' || value === 'inactive' || value === 'buffer'
}

function isValidRank(value: unknown): boolean {
  return value === 'SPT' || value === 'APPT' || value === 'RPT' || value === 'PCA' || value === 'workman'
}

export function extractReferencedStaffIds(params: {
  therapistAllocs: Array<{ staff_id?: string | null }> | null | undefined
  pcaAllocs: Array<{ staff_id?: string | null }> | null | undefined
  staffOverrides: unknown
}): Set<string> {
  const ids = new Set<string>()
  ;(params.therapistAllocs || []).forEach(a => a?.staff_id && ids.add(a.staff_id))
  ;(params.pcaAllocs || []).forEach(a => a?.staff_id && ids.add(a.staff_id))
  if (isNonEmptyObject(params.staffOverrides)) {
    Object.keys(params.staffOverrides).forEach(id => ids.add(id))
  }
  return ids
}

export async function validateAndRepairBaselineSnapshot(params: {
  storedSnapshot: unknown
  referencedStaffIds: Set<string>
  /**
   * Fetch live staff rows for specific ids (used only when snapshot is missing required staff rows).
   * Should return full staff records (at least id/status/rank/team/floating/etc.).
   */
  fetchLiveStaffByIds: (ids: string[]) => Promise<any[]>
  /**
   * Used when snapshot is missing/invalid: caller-provided baseline generator.
   * This is still date-local (will be saved to the schedule).
   */
  buildFallbackBaseline: () => BaselineSnapshot
  sourceForNewEnvelope: BaselineSnapshotSource
}): Promise<{ envelope: BaselineSnapshotEnvelope; data: BaselineSnapshot; report: SnapshotHealthReport }> {
  const issues: string[] = []
  const referencedStaffCount = params.referencedStaffIds.size

  // Step 1: unwrap stored value (envelope or legacy raw). If totally invalid, fallback.
  let envelope: BaselineSnapshotEnvelope
  let data: BaselineSnapshot
  let wrappedLegacy = false
  try {
    const unwrapped = unwrapBaselineSnapshotStored(params.storedSnapshot as any)
    envelope = unwrapped.envelope
    data = unwrapped.data
    wrappedLegacy = unwrapped.wasWrapped
    if (wrappedLegacy) issues.push('wrappedLegacySnapshot')
  } catch {
    issues.push('invalidSnapshotValue')
    data = params.buildFallbackBaseline()
    envelope = buildBaselineSnapshotEnvelope({ data, source: params.sourceForNewEnvelope })
    return {
      envelope,
      data,
      report: {
        status: 'fallback',
        issues,
        referencedStaffCount,
        snapshotStaffCount: Array.isArray(data.staff) ? data.staff.length : 0,
        missingReferencedStaffCount: referencedStaffCount,
        schemaVersion: envelope.schemaVersion,
        source: envelope.source,
        createdAt: envelope.createdAt,
      },
    }
  }

  // Step 2: validate minimal structure
  if (!data || typeof data !== 'object') {
    issues.push('missingDataObject')
    data = params.buildFallbackBaseline()
    envelope = buildBaselineSnapshotEnvelope({ data, source: params.sourceForNewEnvelope })
    return {
      envelope,
      data,
      report: {
        status: 'fallback',
        issues,
        referencedStaffCount,
        snapshotStaffCount: Array.isArray(data.staff) ? data.staff.length : 0,
        missingReferencedStaffCount: referencedStaffCount,
        schemaVersion: envelope.schemaVersion,
        source: envelope.source,
        createdAt: envelope.createdAt,
      },
    }
  }

  const staffArray = Array.isArray((data as any).staff) ? ((data as any).staff as any[]) : []
  if (!Array.isArray((data as any).staff)) issues.push('staffNotArray')

  // Step 3: normalize + dedupe staff
  const byId = new Map<string, any>()
  for (const raw of staffArray) {
    const id = raw?.id
    if (!id || typeof id !== 'string') {
      issues.push('staffMissingId')
      continue
    }
    const rank = raw?.rank
    if (!isValidRank(rank)) {
      issues.push('staffInvalidRank')
      continue
    }
    const status = isValidStatus(raw?.status) ? raw.status : 'active'
    const team = isValidTeam(raw?.team) ? raw.team : null
    const normalized = { ...raw, status, team }
    byId.set(id, { ...(byId.get(id) || {}), ...normalized })
  }

  const normalizedStaff = Array.from(byId.values())
  if (staffArray.length === 0) issues.push('emptyStaffArray')
  if (normalizedStaff.length !== staffArray.length) issues.push('dedupedOrFilteredStaff')

  // Step 4: ensure referenced staff exist (repair by merging from live)
  const missingReferencedIds: string[] = []
  for (const id of params.referencedStaffIds) {
    if (!byId.has(id)) missingReferencedIds.push(id)
  }

  let repaired = false
  if (missingReferencedIds.length > 0) {
    issues.push('missingReferencedStaffRows')
    const liveRows = await params.fetchLiveStaffByIds(missingReferencedIds)
    for (const s of liveRows || []) {
      const id = s?.id
      if (!id || typeof id !== 'string') continue
      // If live row has missing status, default active
      const status = isValidStatus(s?.status) ? s.status : 'active'
      const team = isValidTeam(s?.team) ? s.team : null
      byId.set(id, { ...s, status, team })
    }
    repaired = true
  }

  const mergedStaff = Array.from(byId.values())
  const repairedData: BaselineSnapshot = { ...(data as any), staff: mergedStaff } as any
  const repairedEnvelope = repaired
    ? buildBaselineSnapshotEnvelope({ data: repairedData, source: params.sourceForNewEnvelope })
    : envelope

  const status: SnapshotHealthReport['status'] = repaired ? 'repaired' : 'ok'
  return {
    envelope: repairedEnvelope,
    data: repairedData,
    report: {
      status,
      issues,
      referencedStaffCount,
      snapshotStaffCount: mergedStaff.length,
      missingReferencedStaffCount: missingReferencedIds.length,
      schemaVersion: repairedEnvelope.schemaVersion,
      source: repairedEnvelope.source,
      createdAt: repairedEnvelope.createdAt,
    },
  }
}

