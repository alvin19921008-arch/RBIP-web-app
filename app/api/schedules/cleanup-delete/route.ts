import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { getRequesterContext } from '@/app/api/accounts/_utils'

type WorkflowStateLike = {
  currentStep?: string | null
  completedSteps?: unknown
}

function isStep1OrLess(workflowState: any): boolean {
  const ws = (workflowState || {}) as WorkflowStateLike
  const completed = Array.isArray(ws.completedSteps) ? (ws.completedSteps as any[]) : []
  // If any higher step is completed, not eligible.
  const hasBeyondStep1 = completed.some(
    (s) => s === 'therapist-pca' || s === 'floating-pca' || s === 'bed-relieving' || s === 'review'
  )
  if (hasBeyondStep1) return false
  // Accept empty/unknown states as <= step1 (common for test dates).
  return true
}

export async function POST(req: Request) {
  try {
    await requireAuth()
    const { requesterRole } = await getRequesterContext()
    if (requesterRole !== 'admin' && requesterRole !== 'developer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown }
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'No schedule ids provided' }, { status: 400 })
    }

    const supabase = await createServerComponentClient()

    const { data: schedules, error: schedErr } = await supabase
      .from('daily_schedules')
      .select('id, date, workflow_state')
      .in('id', ids)

    if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 })

    const rows = (schedules || []) as Array<{ id: string; date: string; workflow_state: any }>
    const eligibleByMetadata = rows.filter((r) => {
      if (!isStep1OrLess(r.workflow_state)) return false
      return true
    })

    const eligibleIds = eligibleByMetadata.map((r) => r.id)
    if (eligibleIds.length === 0) {
      return NextResponse.json({ deletedIds: [], skippedIds: ids, reason: 'No eligible schedules found' })
    }

    // Allocation presence check (must be empty across all allocation tables)
    const [tRes, pRes, bRes] = await Promise.all([
      supabase.from('schedule_therapist_allocations').select('schedule_id').in('schedule_id', eligibleIds),
      supabase.from('schedule_pca_allocations').select('schedule_id').in('schedule_id', eligibleIds),
      supabase.from('schedule_bed_allocations').select('schedule_id').in('schedule_id', eligibleIds),
    ])

    const hasAnyAllocation = new Set<string>()
    ;(tRes.data || []).forEach((r: any) => r?.schedule_id && hasAnyAllocation.add(String(r.schedule_id)))
    ;(pRes.data || []).forEach((r: any) => r?.schedule_id && hasAnyAllocation.add(String(r.schedule_id)))
    ;(bRes.data || []).forEach((r: any) => r?.schedule_id && hasAnyAllocation.add(String(r.schedule_id)))

    const finalEligible = eligibleIds.filter((id) => !hasAnyAllocation.has(id))
    const skippedDueToAlloc = eligibleIds.filter((id) => hasAnyAllocation.has(id))
    const skippedUnknown = ids.filter((id) => !eligibleIds.includes(id))

    if (finalEligible.length === 0) {
      return NextResponse.json({
        deletedIds: [],
        skippedIds: Array.from(new Set([...skippedUnknown, ...skippedDueToAlloc])),
        reason: 'All candidates had allocations or were ineligible',
      })
    }

    const { data: deleted, error: delErr } = await supabase
      .from('daily_schedules')
      .delete()
      .in('id', finalEligible)
      .select('id')

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    const deletedIds = (deleted || []).map((r: any) => String(r.id)).filter(Boolean)
    const skippedIds = Array.from(new Set([...ids.filter((id) => !deletedIds.includes(id)), ...skippedDueToAlloc, ...skippedUnknown]))

    return NextResponse.json({ deletedIds, skippedIds })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\\s*/, '') }, { status })
  }
}

