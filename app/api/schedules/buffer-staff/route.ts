import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { formatDate } from '@/lib/utils/dateHelpers'
import { Staff } from '@/types/staff'

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

    const { data: schedule, error: scheduleError } = await supabase
      .from('daily_schedules')
      .select('id, baseline_snapshot, staff_overrides')
      .eq('date', dateStr)
      .maybeSingle()

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

    const baselineSnapshot = (schedule as any).baseline_snapshot
    const snapshotStaff: any[] =
      baselineSnapshot && typeof baselineSnapshot === 'object'
        ? ((baselineSnapshot as any).staff || [])
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
      const { data: liveStaff } = await supabase
        .from('staff')
        .select('*')
        .in('id', missingIds)
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

