import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils/dateHelpers'
import { BaselineSnapshot } from '@/types/schedule'
import { Team } from '@/types/staff'

type CopyMode = 'full' | 'hybrid'

interface CopyScheduleRequest {
  fromDate: string
  toDate: string
  mode: CopyMode
  includeBufferStaff: boolean
}

async function buildBaselineSnapshot(supabase: any): Promise<BaselineSnapshot> {
  const [
    staffRes,
    specialProgramsRes,
    sptAllocationsRes,
    wardsRes,
    pcaPreferencesRes,
    teamSettingsRes,
  ] = await Promise.all([
    supabase.from('staff').select('*'),
    supabase.from('special_programs').select('*'),
    supabase.from('spt_allocations').select('*'),
    supabase.from('wards').select('*'),
    supabase.from('pca_preferences').select('*'),
    supabase.from('team_settings').select('*'),
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

  let teamDisplayNames: Record<Team, string> | undefined = undefined
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
    specialPrograms: (specialProgramsRes.data || []) as any,
    sptAllocations: (sptAllocationsRes.data || []) as any,
    wards: (wardsRes.data || []) as any,
    pcaPreferences: (pcaPreferencesRes.data || []) as any,
    teamDisplayNames,
  }
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as any).length > 0
}

async function getReferencedStaffIdsForSchedule(
  supabase: any,
  scheduleId: string,
  staffOverrides: unknown
): Promise<Set<string>> {
  const referencedIds = new Set<string>()

  const [{ data: therapist }, { data: pca }] = await Promise.all([
    supabase
      .from('schedule_therapist_allocations')
      .select('staff_id')
      .eq('schedule_id', scheduleId),
    supabase
      .from('schedule_pca_allocations')
      .select('staff_id')
      .eq('schedule_id', scheduleId),
  ])

  ;(therapist || []).forEach((a: any) => a?.staff_id && referencedIds.add(a.staff_id))
  ;(pca || []).forEach((a: any) => a?.staff_id && referencedIds.add(a.staff_id))

  if (isNonEmptyObject(staffOverrides)) {
    Object.keys(staffOverrides).forEach(id => referencedIds.add(id))
  }

  return referencedIds
}

async function resolveBufferStaffIdsFromLatestState(
  supabase: any,
  sourceBaseline: BaselineSnapshot,
  referencedIds: Set<string>
): Promise<Set<string>> {
  const snapshotStaff: any[] = (sourceBaseline as any).staff || []
  const snapshotById = new Map<string, any>()
  snapshotStaff.forEach(s => s?.id && snapshotById.set(s.id, s))

  const missingIds: string[] = []
  referencedIds.forEach(id => {
    if (!snapshotById.has(id)) missingIds.push(id)
  })

  const liveById = new Map<string, any>()
  if (missingIds.length > 0) {
    const { data: liveStaff } = await supabase.from('staff').select('id,status').in('id', missingIds)
    ;(liveStaff || []).forEach((s: any) => s?.id && liveById.set(s.id, s))
  }

  const bufferIds = new Set<string>()
  referencedIds.forEach(id => {
    const s = snapshotById.get(id) ?? liveById.get(id)
    if (s && s.status === 'buffer') {
      bufferIds.add(id)
    }
  })

  return bufferIds
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
    await requireAuth()
    const supabase = await createServerComponentClient()
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

    // Load or create target schedule
    let { data: toSchedule, error: toError } = await supabase
      .from('daily_schedules')
      .select('*')
      .eq('date', toDateStr)
      .maybeSingle()

    if (toError) {
      return NextResponse.json({ error: 'Failed to load target schedule' }, { status: 500 })
    }

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

    const fromScheduleId = fromSchedule.id
    const toScheduleId = toSchedule.id

    // Build or reuse baseline snapshot
    let sourceBaseline: BaselineSnapshot | null = (fromSchedule as any).baseline_snapshot ?? null
    const hasExistingBaseline =
      sourceBaseline && typeof sourceBaseline === 'object' && Object.keys(sourceBaseline as any).length > 0

    if (!hasExistingBaseline) {
      sourceBaseline = await buildBaselineSnapshot(supabase)
      // Persist baseline snapshot back to source schedule for future consistency
      await supabase
        .from('daily_schedules')
        .update({ baseline_snapshot: sourceBaseline })
        .eq('id', fromScheduleId)
    }

    const sourceOverrides = (fromSchedule as any).staff_overrides || {}
    const sourceWorkflowState = (fromSchedule as any).workflow_state || null

    // Determine buffer staff based on the latest saved state for this schedule:
    // - staff referenced by allocations and staff_overrides
    // - use baseline_snapshot when it contains the staff row, otherwise fall back to live staff.status
    const referencedIds = await getReferencedStaffIdsForSchedule(supabase, fromScheduleId, sourceOverrides)

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

    const copiedUpToStep = inferCopiedUpToStep(therapistAllocations, pcaAllocations, bedAllocations)

    // Buffer staff sets (based on latest source schedule state)
    const bufferStaffIds = await resolveBufferStaffIdsFromLatestState(
      supabase,
      sourceBaseline as BaselineSnapshot,
      referencedIds
    )

    // Build target baseline (adjusting buffer staff if needed)
    let targetBaseline: BaselineSnapshot = sourceBaseline as BaselineSnapshot
    const snapshotStaff: any[] = (sourceBaseline as any).staff || []
    if (!includeBufferStaff && snapshotStaff.length > 0) {
      const updatedStaff = snapshotStaff.map(s =>
        bufferStaffIds.has(s.id) ? { ...s, status: 'inactive' } : s
      )
      targetBaseline = { ...(sourceBaseline as any), staff: updatedStaff }
    }

    // Clear target allocations and calculations
    await Promise.all([
      supabase.from('schedule_therapist_allocations').delete().eq('schedule_id', toScheduleId),
      supabase.from('schedule_pca_allocations').delete().eq('schedule_id', toScheduleId),
      supabase.from('schedule_bed_allocations').delete().eq('schedule_id', toScheduleId),
      supabase.from('schedule_calculations').delete().eq('schedule_id', toScheduleId),
      supabase.from('pca_unmet_needs_tracking').delete().eq('schedule_id', toScheduleId),
    ])

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
      const therapistClones = therapistToInsert.map((a: any) => ({
        ...a,
        id: undefined,
        schedule_id: toScheduleId,
      }))
      await supabase.from('schedule_therapist_allocations').insert(therapistClones)
    }

    if (pcaToInsert.length > 0) {
      const pcaClones = pcaToInsert.map((a: any) => ({
        ...a,
        id: undefined,
        schedule_id: toScheduleId,
      }))
      await supabase.from('schedule_pca_allocations').insert(pcaClones)
    }

    if (mode === 'full') {
      if (bedAllocations && bedAllocations.length > 0) {
        const bedClones = bedAllocations.map((a: any) => ({
          ...a,
          id: undefined,
          schedule_id: toScheduleId,
        }))
        await supabase.from('schedule_bed_allocations').insert(bedClones)
      }
      if (calculations && calculations.length > 0) {
        const calcClones = calculations.map((c: any) => ({
          ...c,
          id: undefined,
          schedule_id: toScheduleId,
        }))
        await supabase.from('schedule_calculations').insert(calcClones)
      }
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

    // Update daily_schedules metadata for target
    const { error: updateError } = await supabase
      .from('daily_schedules')
      .update({
        is_tentative: true,
        baseline_snapshot: targetBaseline,
        staff_overrides: sourceOverrides,
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
    })
  } catch (error) {
    console.error('Error copying schedule:', error)
    return NextResponse.json({ error: 'Failed to copy schedule' }, { status: 500 })
  }
}

