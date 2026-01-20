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

    const baselineStored = ((schedule as any).baseline_snapshot ?? null) as BaselineSnapshotStored | null
    const snapshotStaff: any[] = baselineStored
      ? unwrapBaselineSnapshotStored(baselineStored).data.staff
      : []

    const snapshotStaffById = new Map<string, any>()
    snapshotStaff.forEach(s => {
      if (s?.id) snapshotStaffById.set(s.id, s)
    })

    const staffOverrides = (schedule as any).staff_overrides
    const statusOverrides = (staffOverrides as any)?.__staffStatusOverrides

    const bufferStaff: Staff[] = []

    // Schedule-local buffer overrides (primary)
    if (statusOverrides && typeof statusOverrides === 'object' && !Array.isArray(statusOverrides)) {
      Object.entries(statusOverrides as any).forEach(([staffId, entry]) => {
        if (!staffId) return
        if ((entry as any)?.status !== 'buffer') return
        const snap = snapshotStaffById.get(staffId)
        if (snap) {
          bufferStaff.push({
            ...(snap as any),
            status: 'buffer',
            buffer_fte: typeof (entry as any)?.buffer_fte === 'number' ? (entry as any).buffer_fte : (snap as any).buffer_fte,
          } as Staff)
          return
        }

        // Minimal placeholder if staff row is missing from snapshot roster
        bufferStaff.push({
          id: staffId,
          name: ((entry as any)?.nameAtTime as string) || '(Missing staff in snapshot)',
          rank: ((entry as any)?.rankAtTime as any) || 'PCA',
          special_program: null,
          team: null,
          floating: false,
          floor_pca: null,
          status: 'buffer',
          buffer_fte: typeof (entry as any)?.buffer_fte === 'number' ? (entry as any).buffer_fte : undefined,
        } as Staff)
      })
    }

    // Legacy: snapshot rows that still have status='buffer'
    snapshotStaff.forEach((s: any) => {
      if (!s?.id) return
      if (s.status !== 'buffer') return
      if (bufferStaff.some((x) => x.id === s.id)) return
      bufferStaff.push(s as Staff)
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

