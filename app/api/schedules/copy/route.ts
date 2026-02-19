import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils/dateHelpers'
import { BaselineSnapshot, BaselineSnapshotStored } from '@/types/schedule'
import { Team } from '@/types/staff'
import { buildBaselineSnapshotEnvelope, unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import { minifySpecialProgramsForSnapshot } from '@/lib/utils/snapshotMinify'
import { createTimingCollector } from '@/lib/utils/timing'
import { fetchGlobalHeadAtCreation } from '@/lib/features/config/globalHead'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { hasAnySubstitution } from '@/lib/utils/substitutionFor'
import type { GlobalHeadAtCreation } from '@/types/schedule'

type CopyMode = 'hybrid'

interface CopyScheduleRequest {
  fromDate: string
  toDate: string
  // Legacy: used to support 'full' | 'hybrid'. Full copy has been removed; we treat all copies as 'hybrid'.
  mode?: string
  includeBufferStaff: boolean
}

async function buildBaselineSnapshot(supabase: any): Promise<BaselineSnapshot> {
  const safeSelect = async (table: string, columns: string) => supabase.from(table).select(columns)

  const staffPromise = safeSelect(
    'staff',
    'id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program'
  )

  const [staffRes, specialProgramsRes, sptAllocationsRes, wardsRes, pcaPreferencesRes, teamSettingsRes] =
    await Promise.all([
      staffPromise,
      safeSelect(
        'special_programs',
        'id,name,staff_ids,weekdays,slots,fte_subtraction,pca_required,therapist_preference_order,pca_preference_order'
      ),
      safeSelect(
        'spt_allocations',
        'id,staff_id,specialty,teams,weekdays,slots,slot_modes,fte_addon,config_by_weekday,substitute_team_head,is_rbip_supervisor,active,created_at,updated_at'
      ),
      safeSelect('wards', 'id,name,total_beds,team_assignments,team_assignment_portions'),
      safeSelect(
        'pca_preferences',
        'id,team,preferred_pca_ids,preferred_slots,avoid_gym_schedule,gym_schedule,floor_pca_selection'
      ),
      safeSelect('team_settings', 'team,display_name'),
    ])

  if (staffRes.error) {
    throw new Error(`Failed to load staff for baseline snapshot: ${staffRes.error.message}`)
  }
  if (specialProgramsRes.error) {
    throw new Error(`Failed to load special programs for baseline snapshot: ${specialProgramsRes.error.message}`)
  }
  if (sptAllocationsRes.error) {
    throw new Error(`Failed to load SPT allocations for baseline snapshot: ${sptAllocationsRes.error.message}`)
  }
  if (wardsRes.error) {
    throw new Error(`Failed to load wards for baseline snapshot: ${wardsRes.error.message}`)
  }
  if (pcaPreferencesRes.error) {
    throw new Error(`Failed to load PCA preferences for baseline snapshot: ${pcaPreferencesRes.error.message}`)
  }

  let teamDisplayNames: Partial<Record<Team, string>> | undefined = undefined
  if (!teamSettingsRes.error && teamSettingsRes.data) {
    teamDisplayNames = {}
    for (const row of teamSettingsRes.data as any[]) {
      if (row.team && row.display_name) {
        teamDisplayNames[row.team as Team] = row.display_name as string
      }
    }
  }

  return {
    staff: (staffRes.data || []) as any,
    specialPrograms: minifySpecialProgramsForSnapshot(specialProgramsRes.data || []) as any,
    sptAllocations: (sptAllocationsRes.data || []) as any,
    wards: (wardsRes.data || []) as any,
    pcaPreferences: (pcaPreferencesRes.data || []) as any,
    teamDisplayNames,
  }
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as any).length > 0
}

function stripNonCopyableScheduleOverrides(overrides: any): any {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return overrides
  const next = { ...(overrides as any) }
  // Bed relieving notes are within-day only; never copy across dates.
  delete next.__bedRelieving
  return next
}

function scrubSptFromStaffOverrides(args: {
  overrides: any
  sptStaffIds: Set<string>
}): any {
  const { overrides, sptStaffIds } = args
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return overrides

  const isPlainObject = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
  const stripSptTherapistFromSpecialProgramOverrides = (obj: any) => {
    if (!isPlainObject(obj)) return obj
    const list = (obj as any).specialProgramOverrides
    if (!Array.isArray(list)) return obj

    const nextList = list
      .map((entry: any) => {
        if (!isPlainObject(entry)) return entry
        const therapistId = entry.therapistId
        if (therapistId && sptStaffIds.has(String(therapistId))) {
          // Keep PCA overrides / other metadata, but remove therapist choice for SPT.
          const { therapistId: _t, therapistFTESubtraction: _fte, ...rest } = entry
          return rest
        }
        return entry
      })
      .filter((entry: any) => {
        if (!isPlainObject(entry)) return true
        const keys = Object.keys(entry)
        // Drop no-op shells like { programId }.
        return keys.some((k) => k !== 'programId')
      })

    const next = { ...obj }
    if (nextList.length > 0) {
      next.specialProgramOverrides = nextList
    } else {
      delete next.specialProgramOverrides
    }
    return next
  }

  const cleaned: Record<string, any> = {}
  Object.entries(overrides as any).forEach(([key, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      cleaned[key] = raw
      return
    }

    // Strip "special program therapist = SPT" selections wherever they live.
    const base = stripSptTherapistFromSpecialProgramOverrides(raw as any)

    // For SPT staff rows: do not carry over team/FTE/SPT day config.
    // Preserve leaveType only when explicitly set (non-null), since it is a deliberate per-day edit.
    if (sptStaffIds.has(key)) {
      const leaveType = (base as any)?.leaveType ?? null
      if (leaveType == null) {
        return
      }
      const fteRemaining = typeof (base as any)?.fteRemaining === 'number' ? (base as any).fteRemaining : 0
      cleaned[key] = { leaveType, fteRemaining }
      return
    }

    cleaned[key] = base
  })

  return cleaned
}

function getBufferStaffIdsFromScheduleLocalOverrides(overrides: any): Set<string> {
  const ids = new Set<string>()
  const map = overrides?.__staffStatusOverrides
  if (!map || typeof map !== 'object' || Array.isArray(map)) return ids
  Object.entries(map as any).forEach(([staffId, entry]) => {
    if (!staffId) return
    const status = (entry as any)?.status
    if (status === 'buffer') ids.add(staffId)
  })
  return ids
}

function inferCopiedUpToStepFromCounts(args: {
  therapistCount: number
  pcaCount: number
  bedCount: number
}): string {
  if (args.bedCount > 0) return 'bed-relieving'
  if (args.pcaCount > 0) return 'floating-pca'
  if (args.therapistCount > 0) return 'therapist-pca'
  return 'leave-fte'
}

function toRpcErrorMeta(error: any): { code?: string; message: string } {
  return {
    code: typeof error?.code === 'string' ? error.code : undefined,
    message: String(error?.message || 'Unknown RPC error'),
  }
}

function isMissingFunctionError(error: any, fnName: string): boolean {
  const msg = String(error?.message || '')
  const code = String(error?.code || '')
  return (
    code === 'PGRST202' ||
    (msg.includes(fnName) &&
      (msg.includes('schema cache') || msg.includes('Could not find') || msg.includes('not found')))
  )
}

function doesSnapshotHeadMatchLiveGlobal(args: {
  sourceHead: GlobalHeadAtCreation | null
  liveHead: GlobalHeadAtCreation | null
}): boolean {
  const { sourceHead, liveHead } = args
  if (!sourceHead || !liveHead) return false

  const sourceCat = sourceHead.category_versions
  const liveCat = liveHead.category_versions
  const liveEntries = Object.entries(liveCat || {}).filter(([, v]) => typeof v === 'number')
  if (liveEntries.length > 0) {
    const allMatch = liveEntries.every(([k, v]) => {
      const sourceValue = (sourceCat as any)?.[k]
      return typeof sourceValue === 'number' && Number(sourceValue) === Number(v)
    })
    if (allMatch) return true
  }

  if (typeof sourceHead.global_version === 'number' && typeof liveHead.global_version === 'number') {
    return Number(sourceHead.global_version) === Number(liveHead.global_version)
  }

  return false
}

export async function POST(request: NextRequest) {
  try {
    const timer = createTimingCollector({ now: () => Date.now() })
    await requireAuth()
    timer.stage('auth')
    const supabase = await createServerComponentClient()
    const globalHeadAtCreation = await fetchGlobalHeadAtCreation(supabase)
    timer.stage('loadGlobalHead')
    const body: CopyScheduleRequest = await request.json()
    timer.stage('parseRequest')

    const { fromDate, toDate, includeBufferStaff } = body
    const mode: CopyMode = 'hybrid'

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const fromDateStr = formatDate(fromDate)
    const toDateStr = formatDate(toDate)

    // Load source schedule
    const { data: fromSchedule, error: fromError } = await supabase
      .from('daily_schedules')
      .select('id, baseline_snapshot, staff_overrides')
      .eq('date', fromDateStr)
      .single()

    if (fromError || !fromSchedule) {
      return NextResponse.json({ error: 'Source schedule not found' }, { status: 404 })
    }
    timer.stage('loadSourceSchedule')

    // Load or create target schedule
    let { data: toSchedule, error: toError } = await supabase
      .from('daily_schedules')
      .select('id')
      .eq('date', toDateStr)
      .maybeSingle()

    if (toError) {
      return NextResponse.json({ error: 'Failed to load target schedule' }, { status: 500 })
    }
    timer.stage('loadTargetSchedule')

    if (!toSchedule) {
      const { data: created, error: createError } = await supabase
        .from('daily_schedules')
        .insert({ date: toDateStr, is_tentative: true })
        .select('id')
        .single()

      if (createError || !created) {
        return NextResponse.json({ error: 'Failed to create target schedule' }, { status: 500 })
      }
      toSchedule = created
    }
    timer.stage('ensureTargetSchedule')

    const fromScheduleId = fromSchedule.id
    const toScheduleId = toSchedule.id
    const rebaseCategories = ['staffProfile', 'teamConfig', 'wardConfig', 'specialPrograms', 'sptAllocations', 'pcaPreferences']
    let rebaseWarning: string | null = null
    let rpcErrorMeta: { code?: string; message: string } | null = null

    const tryCreateAdmin = () => {
      try {
        return createSupabaseAdminClient()
      } catch {
        return null
      }
    }

    const applyBufferStaffDowngradeIfNeeded = (snapshot: BaselineSnapshot): BaselineSnapshot => {
      if (includeBufferStaff) return snapshot
      const staff = Array.isArray((snapshot as any)?.staff) ? ((snapshot as any).staff as any[]) : []
      const nextStaff = staff.map((s: any) => {
        if (!s || typeof s !== 'object') return s
        if (s.status !== 'buffer') return s
        // Downgrade buffer staff to inactive when excluding buffer staff in copy baseline.
        return { ...s, status: 'inactive', buffer_fte: null }
      })
      return { ...(snapshot as any), staff: nextStaff } as any
    }

    const adminClient = tryCreateAdmin()

    const rebaseTargetBaselineToCurrentGlobal = async (): Promise<'rpc' | 'js'> => {
      // Preferred: single DB-side RPC to rebuild snapshot slices in one transaction.
      // This avoids propagating legacy baseline payloads when users copy schedules forward/backward.
      if (adminClient) {
        // Use current RPC signature with include-buffer flag.
        const attemptWithFlag = await adminClient.rpc('pull_global_to_snapshot_v1', {
          p_date: toDateStr,
          p_categories: rebaseCategories,
          p_note: `Auto-rebase baseline after copy from ${fromDateStr}`,
          p_include_buffer_staff: includeBufferStaff,
        } as any)
        if (!attemptWithFlag.error) return 'rpc'

        const msg = (attemptWithFlag.error as any)?.message || ''
        const code = (attemptWithFlag.error as any)?.code
        const isMissingFn =
          code === 'PGRST202' ||
          (msg.includes('pull_global_to_snapshot_v1') &&
            (msg.includes('schema cache') || msg.includes('Could not find') || msg.includes('not found')))
        if (!isMissingFn) {
          // Non-missing error (e.g. not_authorized before migration): fall through to JS fallback.
        }
      }

      // Fallback: rebuild baseline snapshot in JS and write to target schedule.
      // Not transactional across tables, but better than leaving inherited legacy payloads.
      const clientForReadWrite = adminClient ?? supabase
      const fresh = await buildBaselineSnapshot(clientForReadWrite)
      const adjusted = applyBufferStaffDowngradeIfNeeded(fresh)
      const envelope = buildBaselineSnapshotEnvelope({
        data: adjusted as any,
        source: 'copy',
        globalHeadAtCreation,
      })
      const { error } = await clientForReadWrite
        .from('daily_schedules')
        .update({ baseline_snapshot: envelope as any })
        .eq('id', toScheduleId)
      if (error) throw error
      return 'js'
    }

    // Ensure target schedule is tentative BEFORE cloning allocations.
    // RLS policies for allocation tables may depend on daily_schedules.is_tentative = true.
    const { error: tentativeError } = await supabase
      .from('daily_schedules')
      .update({ is_tentative: true })
      .eq('id', toScheduleId)
    if (tentativeError) {
      return NextResponse.json({ error: 'Failed to mark target schedule tentative' }, { status: 500 })
    }

    // Build or reuse baseline snapshot (supports legacy raw and v1 envelope)
    const sourceStored = ((fromSchedule as any).baseline_snapshot ?? null) as BaselineSnapshotStored | null
    const hasExistingBaseline =
      sourceStored && typeof sourceStored === 'object' && Object.keys(sourceStored as any).length > 0

    let sourceBaselineData: BaselineSnapshot
    let sourceSnapshotHead: GlobalHeadAtCreation | null = null
    if (!hasExistingBaseline) {
      sourceBaselineData = await buildBaselineSnapshot(supabase)
      sourceSnapshotHead = globalHeadAtCreation
      // Persist baseline snapshot back to source schedule for future consistency
      await supabase
        .from('daily_schedules')
        .update({
          baseline_snapshot: buildBaselineSnapshotEnvelope({ data: sourceBaselineData, source: 'copy', globalHeadAtCreation }) as any,
        })
        .eq('id', fromScheduleId)
    } else {
      const { data, envelope, wasWrapped } = unwrapBaselineSnapshotStored(sourceStored as BaselineSnapshotStored)
      sourceBaselineData = data
      sourceSnapshotHead = ((envelope as any)?.globalHeadAtCreation ?? null) as GlobalHeadAtCreation | null
      // If the source schedule still stores the legacy raw shape, upgrade it opportunistically.
      if (wasWrapped) {
        const upgraded: BaselineSnapshot = {
          ...(sourceBaselineData as any),
          specialPrograms: minifySpecialProgramsForSnapshot((sourceBaselineData as any).specialPrograms || []),
        } as any
        await supabase
          .from('daily_schedules')
          .update({ baseline_snapshot: buildBaselineSnapshotEnvelope({ data: upgraded, source: 'copy', globalHeadAtCreation }) as any })
          .eq('id', fromScheduleId)
        sourceBaselineData = upgraded
        sourceSnapshotHead = globalHeadAtCreation
      }
    }
    timer.stage('resolveSourceBaseline')

    const shouldRebaseToCurrentGlobal = globalHeadAtCreation
      ? !doesSnapshotHeadMatchLiveGlobal({
          sourceHead: sourceSnapshotHead,
          liveHead: globalHeadAtCreation,
        })
      : true

    const sourceOverridesRaw = (fromSchedule as any).staff_overrides || {}
    const sourceOverrides = stripNonCopyableScheduleOverrides(sourceOverridesRaw)

    // Lightweight probes for UX metadata (avoid loading full allocation payloads on fast RPC path).
    const [therapistProbeRes, pcaProbeRes, bedProbeRes] = await Promise.all([
      supabase
        .from('schedule_therapist_allocations')
        .select('id')
        .eq('schedule_id', fromScheduleId)
        .limit(1),
      supabase
        .from('schedule_pca_allocations')
        .select('id')
        .eq('schedule_id', fromScheduleId)
        .limit(1),
      supabase
        .from('schedule_bed_allocations')
        .select('id')
        .eq('schedule_id', fromScheduleId)
        .limit(1),
    ])
    timer.stage('probeSourceStepDepth')

    const copiedUpToStep = inferCopiedUpToStepFromCounts({
      therapistCount: Array.isArray(therapistProbeRes.data) && therapistProbeRes.data.length > 0 ? 1 : 0,
      pcaCount: Array.isArray(pcaProbeRes.data) && pcaProbeRes.data.length > 0 ? 1 : 0,
      bedCount: Array.isArray(bedProbeRes.data) && bedProbeRes.data.length > 0 ? 1 : 0,
    })

    // Buffer staff ids (snapshot-local):
    // - primary: staff_overrides.__staffStatusOverrides where status='buffer'
    // - legacy: snapshot staff rows that still have status='buffer'
    const scheduleLocalBufferIds = getBufferStaffIdsFromScheduleLocalOverrides(sourceOverrides)
    const snapshotStaff: any[] = (sourceBaselineData as any).staff || []
    const legacySnapshotBufferIds = new Set<string>()
    snapshotStaff.forEach((s: any) => {
      if (s?.id && s.status === 'buffer') legacySnapshotBufferIds.add(s.id)
    })
    const bufferStaffIds = new Set<string>([...Array.from(scheduleLocalBufferIds), ...Array.from(legacySnapshotBufferIds)])
    timer.stage('resolveBufferStaff')

    // When excluding buffer staff, also strip schedule-local buffer overrides from copied staff_overrides.
    let targetOverrides = sourceOverrides
    if (!includeBufferStaff && isNonEmptyObject(sourceOverrides)) {
      const next = { ...(sourceOverrides as any) }
      const map = (next as any).__staffStatusOverrides
      if (map && typeof map === 'object' && !Array.isArray(map)) {
        const cleaned: Record<string, any> = { ...(map as any) }
        Object.entries(cleaned).forEach(([id, entry]) => {
          if ((entry as any)?.status === 'buffer') delete cleaned[id]
        })
        ;(next as any).__staffStatusOverrides = cleaned
      }
      targetOverrides = next
    }

    // SPT reset rules for copy:
    // - Drop SPT day-specific overrides (fte/team/sptOnDayOverride etc) by removing the SPT override entry entirely,
    //   unless leaveType is explicitly set (then we preserve leaveType + numeric fteRemaining only).
    // - Drop any "special program therapist = SPT" selections from specialProgramOverrides.
    const snapshotStaffForRank: any[] = (sourceBaselineData as any).staff || []
    const sptStaffIds = new Set<string>(
      snapshotStaffForRank.filter((s: any) => s?.id && s?.rank === 'SPT').map((s: any) => String(s.id))
    )
    targetOverrides = scrubSptFromStaffOverrides({ overrides: targetOverrides, sptStaffIds })

    // Build target baseline (legacy-only adjustment):
    // If old snapshots contain status='buffer' rows, downgrade them to inactive when excluding.
    let targetBaselineData: BaselineSnapshot = sourceBaselineData
    if (!includeBufferStaff && snapshotStaff.length > 0 && legacySnapshotBufferIds.size > 0) {
      const updatedStaff = snapshotStaff.map((s: any) =>
        legacySnapshotBufferIds.has(s.id) ? { ...s, status: 'inactive' } : s
      )
      targetBaselineData = { ...(sourceBaselineData as any), staff: updatedStaff }
    }
    // Always minify special programs when writing target baseline snapshot to reduce JSONB payload size.
    targetBaselineData = {
      ...(targetBaselineData as any),
      specialPrograms: minifySpecialProgramsForSnapshot((targetBaselineData as any).specialPrograms || []),
    } as any
    const targetBaselineEnvelope = buildBaselineSnapshotEnvelope({ data: targetBaselineData, source: 'copy', globalHeadAtCreation })
    timer.stage('buildTargetBaseline')

    // Approx snapshot size diagnostics (useful for performance analysis)
    let baselineBytes: number | null = null
    let specialProgramsBytes: number | null = null
    try {
      specialProgramsBytes = JSON.stringify((targetBaselineData as any).specialPrograms || []).length
      baselineBytes = JSON.stringify(targetBaselineEnvelope as any).length
    } catch {
      // ignore
    }

    // Prepare workflow_state for target
    const completed: string[] = []
    if (Object.keys(targetOverrides || {}).length > 0) completed.push('leave-fte')
    const targetWorkflowState = {
      currentStep: 'leave-fte',
      completedSteps: completed,
    }

    // Fast path: SQL-based clone (RPC) if available. Falls back to JS copy if function isn't installed.
    const rpcClient = adminClient ?? supabase
    if (shouldRebaseToCurrentGlobal) {
      // Long-term path: single transaction copy + rebase in DB.
      const atomicAttempt = await rpcClient.rpc('copy_schedule_with_rebase_v1', {
        p_from_schedule_id: fromScheduleId,
        p_to_schedule_id: toScheduleId,
        p_to_date: toDateStr,
        p_mode: mode,
        p_include_buffer_staff: includeBufferStaff,
        p_baseline_snapshot: targetBaselineEnvelope as any,
        p_staff_overrides: targetOverrides,
        p_workflow_state: targetWorkflowState,
        p_tie_break_decisions: {},
        p_buffer_staff_ids: Array.from(bufferStaffIds),
        p_rebase_categories: rebaseCategories,
        p_rebase_note: `Auto-rebase baseline after copy from ${fromDateStr}`,
      } as any)
      timer.stage('rpcCopyAndRebaseAttempt')
      if (!atomicAttempt.error) {
        return NextResponse.json({
          success: true,
          mode,
          fromDate: fromDateStr,
          toDate: toDateStr,
          copiedUpToStep,
          timings: timer.finalize({
            rpcUsed: true,
            rpcAtomicUsed: true,
            baselineBytes,
            specialProgramsBytes,
            rebaseSkipped: false,
          }),
        })
      }

      const atomicMissing = isMissingFunctionError(atomicAttempt.error, 'copy_schedule_with_rebase_v1')
      if (!atomicMissing) {
        rpcErrorMeta = toRpcErrorMeta(atomicAttempt.error)
      }
      timer.stage('rpcCopyAndRebaseFallback')
    }

    const rpcAttempt = await rpcClient.rpc('copy_schedule_v1', {
      from_schedule_id: fromScheduleId,
      to_schedule_id: toScheduleId,
      mode,
      include_buffer_staff: includeBufferStaff,
      baseline_snapshot: targetBaselineEnvelope as any,
      staff_overrides: targetOverrides,
      workflow_state: targetWorkflowState,
      // Reset tie-break decisions (Step 3+) after copy.
      tie_break_decisions: {},
      buffer_staff_ids: Array.from(bufferStaffIds),
    })
    timer.stage('rpcCopyAttempt')

    if (!rpcAttempt.error) {
      // Defensive cleanup: older deployed RPC versions may still copy SPT therapist allocations.
      // Remove them here so the app behavior is correct even before the DB function is updated.
      if (sptStaffIds.size > 0) {
        const del = await supabase
          .from('schedule_therapist_allocations')
          .delete()
          .eq('schedule_id', toScheduleId)
          .in('staff_id', Array.from(sptStaffIds))
        if (del.error) {
          return NextResponse.json({ error: `Failed to drop SPT allocations after copy: ${del.error.message}` }, { status: 500 })
        }
      }
      timer.stage('rpcPostCopyCleanup')
      if (shouldRebaseToCurrentGlobal) {
        try {
          const rebasePath = await rebaseTargetBaselineToCurrentGlobal()
          timer.stage(rebasePath === 'rpc' ? 'rebaseBaselineToGlobalRpc' : 'rebaseBaselineToGlobalJs')
        } catch (e: any) {
          // Non-fatal: copy succeeded; baseline rebase failure should not block schedule work.
          rebaseWarning = String(e?.message || 'Failed to rebase target baseline to current Global config.')
        }
      } else {
        timer.stage('rebaseSkipped')
      }
      return NextResponse.json({
        success: true,
        mode,
        fromDate: fromDateStr,
        toDate: toDateStr,
        copiedUpToStep,
        warnings: rebaseWarning ? { rebase: rebaseWarning } : undefined,
        timings: timer.finalize({
          rpcUsed: true,
          rpcAtomicUsed: false,
          baselineBytes,
          specialProgramsBytes,
          rebaseSkipped: !shouldRebaseToCurrentGlobal,
          rebaseSkipReason: !shouldRebaseToCurrentGlobal ? 'source-head-matches-global' : undefined,
          rpcError: rpcErrorMeta ?? undefined,
        }),
      })
    }
    rpcErrorMeta = toRpcErrorMeta(rpcAttempt.error)
    timer.stage('rpcCopyFallback')

    // Fallback path needs full allocation payloads for JS copy.
    const [{ data: therapistAllocations }, { data: pcaAllocations }] = await Promise.all([
      supabase.from('schedule_therapist_allocations').select('*').eq('schedule_id', fromScheduleId),
      supabase.from('schedule_pca_allocations').select('*').eq('schedule_id', fromScheduleId),
    ])
    timer.stage('loadSourceAllocations')

    // Clear target allocations and calculations
    const deleteResults = await Promise.all([
      supabase.from('schedule_therapist_allocations').delete().eq('schedule_id', toScheduleId),
      supabase.from('schedule_pca_allocations').delete().eq('schedule_id', toScheduleId),
      supabase.from('schedule_bed_allocations').delete().eq('schedule_id', toScheduleId),
      supabase.from('schedule_calculations').delete().eq('schedule_id', toScheduleId),
    ])
    const deleteErr = deleteResults.find(r => (r as any)?.error)?.error
    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to clear target schedule data: ${deleteErr.message || 'Unknown error'}` },
        { status: 500 }
      )
    }
    timer.stage('clearTargetAllocations')

    // Legacy-safe: unmet-needs tracking table may not exist in some deployments.
    const unmetDelete = await supabase
      .from('pca_unmet_needs_tracking')
      .delete()
      .eq('schedule_id', toScheduleId)
    if (unmetDelete.error) {
      const msg = unmetDelete.error.message || ''
      const code = (unmetDelete.error as any)?.code
      const isMissingTable =
        msg.includes('pca_unmet_needs_tracking') &&
        (msg.includes('Could not find the table') || msg.includes('schema cache') || code === 'PGRST202')
      if (!isMissingTable) {
        return NextResponse.json(
          { error: `Failed to clear unmet-needs tracking: ${unmetDelete.error.message || 'Unknown error'}` },
          { status: 500 }
        )
      }
    }
    timer.stage('clearTargetUnmetNeeds')

    // Prepare therapist & PCA allocations to insert depending on mode
    let therapistToInsert = (therapistAllocations || []).filter(
      a => includeBufferStaff || !bufferStaffIds.has(a.staff_id)
    )
    // Drop SPT therapist allocations on copy (weekday-specific; must be reconfigured on the target date).
    therapistToInsert = therapistToInsert.filter((a: any) => !sptStaffIds.has(String(a.staff_id)))

    // Setup-only copy: non-floating + special-program + substitution PCAs (Step 2 outputs).
    const allStaff: any[] = snapshotStaff
    const nonFloatingPCAIds = new Set<string>(
      allStaff.filter(s => s.rank === 'PCA' && !s.floating).map(s => s.id)
    )
    const substitutionStaffIds = new Set<string>()
    Object.entries(targetOverrides || {}).forEach(([staffId, override]: [string, any]) => {
      if (hasAnySubstitution(override as any)) {
        substitutionStaffIds.add(staffId)
      }
    })

    const pcaToInsert = (pcaAllocations || []).filter((alloc: any) => {
      const isNonFloating = nonFloatingPCAIds.has(alloc.staff_id)
      const hasSpecialProgram =
        Array.isArray(alloc.special_program_ids) && alloc.special_program_ids.length > 0
      const isSubstitute = substitutionStaffIds.has(alloc.staff_id)
      const passesModeFilter = isNonFloating || hasSpecialProgram || isSubstitute
      if (!passesModeFilter) return false
      if (!includeBufferStaff && bufferStaffIds.has(alloc.staff_id)) return false
      return true
    })

    // Insert cloned allocations for target
    if (therapistToInsert.length > 0) {
      const therapistClones = therapistToInsert.map((a: any) => {
        // IMPORTANT: do not send `id: null/undefined` (can violate NOT NULL).
        // Omit `id` entirely so DB can use defaults.
        const { id: _id, ...rest } = a
        return {
          ...rest,
          schedule_id: toScheduleId,
        }
      })
      const ins = await supabase.from('schedule_therapist_allocations').insert(therapistClones)
      if (ins.error) {
        return NextResponse.json({ error: `Failed to copy therapist allocations: ${ins.error.message}` }, { status: 500 })
      }
    }
    timer.stage('insertTherapistAllocations')

    if (pcaToInsert.length > 0) {
      const pcaClones = pcaToInsert.map((a: any) => {
        const { id: _id, ...rest } = a
        return {
          ...rest,
          schedule_id: toScheduleId,
        }
      })
      const ins = await supabase.from('schedule_pca_allocations').insert(pcaClones)
      if (ins.error) {
        return NextResponse.json({ error: `Failed to copy PCA allocations: ${ins.error.message}` }, { status: 500 })
      }
    }
    timer.stage('insertPcaAllocations')

    // NOTE: We intentionally do NOT copy bed allocations or calculations.
    // They are derived from Step 2+ outputs and must be regenerated after SPT reset.

    // Update daily_schedules metadata for target
    const { error: updateError } = await supabase
      .from('daily_schedules')
      .update({
        is_tentative: true,
        baseline_snapshot: targetBaselineEnvelope as any,
        staff_overrides: targetOverrides,
        workflow_state: targetWorkflowState,
        // Reset tie-break decisions (Step 3+) after copy.
        tie_break_decisions: {},
      })
      .eq('id', toScheduleId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update schedule metadata' }, { status: 500 })
    }
    timer.stage('updateTargetScheduleMeta')

    if (shouldRebaseToCurrentGlobal) {
      try {
        const rebasePath = await rebaseTargetBaselineToCurrentGlobal()
        timer.stage(rebasePath === 'rpc' ? 'rebaseBaselineToGlobalRpc' : 'rebaseBaselineToGlobalJs')
      } catch (e: any) {
        // Non-fatal: copy succeeded; baseline rebase failure should not block schedule work.
        rebaseWarning = String(e?.message || 'Failed to rebase target baseline to current Global config.')
      }
    } else {
      timer.stage('rebaseSkipped')
    }

    return NextResponse.json({
      success: true,
      mode,
      fromDate: fromDateStr,
      toDate: toDateStr,
      copiedUpToStep,
      warnings: rebaseWarning ? { rebase: rebaseWarning } : undefined,
      timings: timer.finalize({
        rpcUsed: false,
        baselineBytes,
        specialProgramsBytes,
        rebaseSkipped: !shouldRebaseToCurrentGlobal,
        rebaseSkipReason: !shouldRebaseToCurrentGlobal ? 'source-head-matches-global' : undefined,
        rpcError: rpcErrorMeta ?? undefined,
      }),
    })
  } catch (error) {
    console.error('Error copying schedule:', error)
    return NextResponse.json({ error: 'Failed to copy schedule' }, { status: 500 })
  }
}

