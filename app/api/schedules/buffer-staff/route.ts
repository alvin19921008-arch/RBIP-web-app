import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils/dateHelpers'
import { Staff } from '@/types/staff'
import type { BaselineSnapshotStored } from '@/types/schedule'
import { unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as any).length > 0
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const supabase = await createServerComponentClient()

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    if (!dateParam) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    }

    const dateStr = formatDate(dateParam)

    // Try to load schedule with snapshot/overrides columns; fall back for legacy DB schemas
    let { data: schedule, error: scheduleError } = await supabase
      .from('daily_schedules')
      .select('id, baseline_snapshot, staff_overrides')
      .eq('date', dateStr)
      .maybeSingle()

    // If DB is missing the new columns (baseline_snapshot/staff_overrides), retry with minimal selection.
    // This keeps the copy wizard functional even before migrations are applied.
    if (scheduleError && (scheduleError as any)?.code === '42703') {
      const fallback = await supabase
        .from('daily_schedules')
        .select('id')
        .eq('date', dateStr)
        .maybeSingle()
      schedule = fallback.data as any
      scheduleError = fallback.error as any
    }

    if (scheduleError) {
      return NextResponse.json({ error: 'Failed to load schedule' }, { status: 500 })
    }
    if (!schedule) {
      return NextResponse.json({ bufferStaff: [] })
    }

    const scheduleId = schedule.id

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

    const referencedIds = new Set<string>()
    ;(therapist || []).forEach((a: any) => a?.staff_id && referencedIds.add(a.staff_id))
    ;(pca || []).forEach((a: any) => a?.staff_id && referencedIds.add(a.staff_id))

    const staffOverrides = (schedule as any).staff_overrides
    if (isNonEmptyObject(staffOverrides)) {
      Object.keys(staffOverrides).forEach(id => referencedIds.add(id))
    }

    const baselineStored = ((schedule as any).baseline_snapshot ?? null) as BaselineSnapshotStored | null
    const snapshotStaff: any[] = baselineStored
      ? unwrapBaselineSnapshotStored(baselineStored).data.staff
      : []

    const snapshotStaffById = new Map<string, any>()
    snapshotStaff.forEach(s => {
      if (s?.id) snapshotStaffById.set(s.id, s)
    })

    const missingIds: string[] = []
    referencedIds.forEach(id => {
      if (!snapshotStaffById.has(id)) missingIds.push(id)
    })

    const liveStaffById = new Map<string, any>()
    if (missingIds.length > 0) {
      const attempt = await supabase
        .from('staff')
        .select('id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program')
        .in('id', missingIds)
      const liveStaff =
        attempt.error && (attempt.error.message?.includes('column') || (attempt.error as any)?.code === '42703')
          ? (await supabase.from('staff').select('*').in('id', missingIds)).data
          : attempt.data
      ;(liveStaff || []).forEach((s: any) => {
        if (s?.id) liveStaffById.set(s.id, s)
      })
    }

    const bufferStaff: Staff[] = []
    referencedIds.forEach(id => {
      const s = snapshotStaffById.get(id) ?? liveStaffById.get(id)
      if (s && s.status === 'buffer') {
        bufferStaff.push(s as Staff)
      }
    })

    // Sort: therapists first, then PCAs, then by name
    const rankOrder: Record<string, number> = { SPT: 1, APPT: 2, RPT: 3, PCA: 4, workman: 5 }
    bufferStaff.sort((a, b) => {
      const ra = rankOrder[a.rank] ?? 99
      const rb = rankOrder[b.rank] ?? 99
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name, 'zh-HK')
    })

    return NextResponse.json({ bufferStaff })
  } catch (e) {
    console.error('Error getting buffer staff:', e)
    return NextResponse.json({ error: 'Failed to get buffer staff' }, { status: 500 })
  }
}

