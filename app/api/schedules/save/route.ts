import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

type SaveScheduleRequest = {
  scheduleId: string
  therapistRows: unknown[]
  pcaRows: unknown[]
  bedRows: unknown[]
  calcRows: unknown[]
  tieBreakDecisions: Record<string, unknown>
  staffOverridesPayloadForDb: Record<string, unknown>
  workflowStateToSave: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth()
    const supabase = await createServerComponentClient()
    const body = (await request.json()) as SaveScheduleRequest

    if (!body?.scheduleId) {
      return NextResponse.json({ error: 'Missing scheduleId' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('save_schedule_v1', {
      p_schedule_id: body.scheduleId,
      therapist_allocations: body.therapistRows ?? [],
      pca_allocations: body.pcaRows ?? [],
      bed_allocations: body.bedRows ?? [],
      calculations: body.calcRows ?? [],
      tie_break_decisions: body.tieBreakDecisions ?? {},
      staff_overrides: body.staffOverridesPayloadForDb ?? {},
      workflow_state: body.workflowStateToSave ?? {},
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'RPC save failed', code: (error as any)?.code ?? null },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[POST /api/schedules/save]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save schedule' },
      { status: 500 }
    )
  }
}

