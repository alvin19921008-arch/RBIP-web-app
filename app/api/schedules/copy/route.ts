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

type CopyMode = 'full' | 'hybrid'

interface CopyScheduleRequest {
  fromDate: string
  toDate: string
  mode: CopyMode
  includeBufferStaff: boolean
}

async function buildBaselineSnapshot(supabase: any): Promise<BaselineSnapshot> {
  const safeSelect = async (table: string, columns: string) => {
    const res = await supabase.from(table).select(columns)
    if (res.error && (res.error.message?.includes('column') || (res.error as any)?.code === '42703')) {
      return await supabase.from(table).select('*')
    }
    return res
  }

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
        'id,staff_id,specialty,teams,weekdays,slots,slot_modes,fte_addon,substitute_team_head,is_rbip_supervisor,active'
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

function inferCopiedUpToStep(
  therapistAllocs: any[] | null | undefined,
  pcaAllocs: any[] | null | undefined,
  bedAllocs: any[] | null | undefined
): string {
  if (bedAllocs && bedAllocs.length > 0) return 'bed-relieving'
  if (pcaAllocs && pcaAllocs.length > 0) return 'floating-pca'
  if (therapistAllocs && therapistAllocs.length > 0) return 'therapist-pca'
  return 'leave-fte'
}

export async function POST(request: NextRequest) {
  try {
    const timer = createTimingCollector({ now: () => Date.now() })
    await requireAuth()
    const supabase = await createServerComponentClient()
    const globalHeadAtCreation = await fetchGlobalHeadAtCreation(supabase)
    const body: CopyScheduleRequest = await request.json()

    const { fromDate, toDate, mode, includeBufferStaff } = body

    if (!fromDate || !toDate || (mode !== 'full' && mode !== 'hybrid')) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const fromDateStr = formatDate(fromDate)
    const toDateStr = formatDate(toDate)

    // Load source schedule
    const { data: fromSchedule, error: fromError } = await supabase
      .from('daily_schedules')
      .select('*')
      .eq('date', fromDateStr)
      .single()

    if (fromError || !fromSchedule) {
      return NextResponse.json({ error: 'Source schedule not found' }, { status: 404 })
    }
    timer.stage('loadSourceSchedule')

    // Load or create target schedule
    let { data: toSchedule, error: toError } = await supabase
      .from('daily_schedules')
      .select('*')
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
        .select('*')
        .single()

      if (createError || !created) {
        return NextResponse.json({ error: 'Failed to create target schedule' }, { status: 500 })
      }
      toSchedule = created
    }
    timer.stage('ensureTargetSchedule')

    const fromScheduleId = fromSchedule.id
    const toScheduleId = toSchedule.id

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
    if (!hasExistingBaseline) {
      sourceBaselineData = await buildBaselineSnapshot(supabase)
      // Persist baseline snapshot back to source schedule for future consistency
      await supabase
        .from('daily_schedules')
        .update({
          baseline_snapshot: buildBaselineSnapshotEnvelope({ data: sourceBaselineData, source: 'copy', globalHeadAtCreation }) as any,
        })
        .eq('id', fromScheduleId)
    } else {
      const { data, wasWrapped } = unwrapBaselineSnapshotStored(sourceStored as BaselineSnapshotStored)
      sourceBaselineData = data
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
      }
    }
    timer.stage('resolveSourceBaseline')

    const sourceOverridesRaw = (fromSchedule as any).staff_overrides || {}
    const sourceOverrides = stripNonCopyableScheduleOverrides(sourceOverridesRaw)
    const sourceWorkflowState = (fromSchedule as any).workflow_state || null

    // Load allocations to clone
    const [
      { data: therapistAllocations },
      { data: pcaAllocations },
      { data: bedAllocations },
      { data: calculations },
    ] = await Promise.all([
      supabase.from('schedule_therapist_allocations').select('*').eq('schedule_id', fromScheduleId),
      supabase.from('schedule_pca_allocations').select('*').eq('schedule_id', fromScheduleId),
      supabase.from('schedule_bed_allocations').select('*').eq('schedule_id', fromScheduleId),
      supabase.from('schedule_calculations').select('*').eq('schedule_id', fromScheduleId),
    ])
    timer.stage('loadSourceAllocations')

    const copiedUpToStep = inferCopiedUpToStep(therapistAllocations, pcaAllocations, bedAllocations)

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
    let targetWorkflowState: any = sourceWorkflowState
    if (mode === 'hybrid') {
      const completed: string[] = []
      if (Object.keys(sourceOverrides || {}).length > 0) completed.push('leave-fte')
      if ((therapistAllocations || []).length > 0) completed.push('therapist-pca')
      targetWorkflowState = {
        currentStep: 'floating-pca',
        completedSteps: completed,
      }
    }

    // Fast path: SQL-based clone (RPC) if available. Falls back to JS copy if function isn't installed.
    const rpcAttempt = await supabase.rpc('copy_schedule_v1', {
      from_schedule_id: fromScheduleId,
      to_schedule_id: toScheduleId,
      mode,
      include_buffer_staff: includeBufferStaff,
      baseline_snapshot: targetBaselineEnvelope as any,
      staff_overrides: targetOverrides,
      workflow_state: targetWorkflowState,
      tie_break_decisions: (fromSchedule as any).tie_break_decisions || {},
      buffer_staff_ids: Array.from(bufferStaffIds),
    })

    if (!rpcAttempt.error) {
      return NextResponse.json({
        success: true,
        mode,
        fromDate: fromDateStr,
        toDate: toDateStr,
        copiedUpToStep,
        timings: timer.finalize({ rpcUsed: true, baselineBytes, specialProgramsBytes }),
      })
    }
    timer.stage('rpcCopyFallback')

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

    // Prepare therapist & PCA allocations to insert depending on mode
    let therapistToInsert = (therapistAllocations || []).filter(
      a => includeBufferStaff || !bufferStaffIds.has(a.staff_id)
    )

    let pcaToInsert: any[] = []
    if (mode === 'full') {
      pcaToInsert = (pcaAllocations || []).filter(
        a => includeBufferStaff || !bufferStaffIds.has(a.staff_id)
      )
    } else {
      // hybrid mode: non-floating + special-program + substitution PCAs
      const allStaff: any[] = snapshotStaff
      const nonFloatingPCAIds = new Set<string>(
        allStaff.filter(s => s.rank === 'PCA' && !s.floating).map(s => s.id)
      )
      const substitutionStaffIds = new Set<string>()
      Object.entries(sourceOverrides || {}).forEach(([staffId, override]: [string, any]) => {
        if (override && (override as any).substitutionFor) {
          substitutionStaffIds.add(staffId)
        }
      })

      pcaToInsert = (pcaAllocations || []).filter(alloc => {
        const isNonFloating = nonFloatingPCAIds.has(alloc.staff_id)
        const hasSpecialProgram =
          Array.isArray(alloc.special_program_ids) && alloc.special_program_ids.length > 0
        const isSubstitute = substitutionStaffIds.has(alloc.staff_id)
        const passesModeFilter = isNonFloating || hasSpecialProgram || isSubstitute
        if (!passesModeFilter) return false
        if (!includeBufferStaff && bufferStaffIds.has(alloc.staff_id)) return false
        return true
      })
    }

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

    if (mode === 'full') {
      if (bedAllocations && bedAllocations.length > 0) {
        const bedClones = bedAllocations.map((a: any) => {
          const { id: _id, ...rest } = a
          return {
            ...rest,
            schedule_id: toScheduleId,
          }
        })
        const ins = await supabase.from('schedule_bed_allocations').insert(bedClones)
        if (ins.error) {
          return NextResponse.json({ error: `Failed to copy bed allocations: ${ins.error.message}` }, { status: 500 })
        }
      }
      if (calculations && calculations.length > 0) {
        const calcClones = calculations.map((c: any) => {
          const { id: _id, ...rest } = c
          return {
            ...rest,
            schedule_id: toScheduleId,
          }
        })
        const ins = await supabase.from('schedule_calculations').insert(calcClones)
        if (ins.error) {
          return NextResponse.json({ error: `Failed to copy schedule calculations: ${ins.error.message}` }, { status: 500 })
        }
      }
    }

    // Update daily_schedules metadata for target
    const { error: updateError } = await supabase
      .from('daily_schedules')
      .update({
        is_tentative: true,
        baseline_snapshot: targetBaselineEnvelope as any,
        staff_overrides: targetOverrides,
        workflow_state: targetWorkflowState,
        tie_break_decisions: (fromSchedule as any).tie_break_decisions || {},
      })
      .eq('id', toScheduleId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update schedule metadata' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      mode,
      fromDate: fromDateStr,
      toDate: toDateStr,
      copiedUpToStep,
      timings: timer.finalize({ rpcUsed: false, baselineBytes, specialProgramsBytes }),
    })
  } catch (error) {
    console.error('Error copying schedule:', error)
    return NextResponse.json({ error: 'Failed to copy schedule' }, { status: 500 })
  }
}

