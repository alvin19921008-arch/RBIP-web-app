import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRequesterContext } from '@/app/api/accounts/_utils'

// POST /api/feedback/mark-read — mark submitter has seen the dev reply
export async function POST(request: NextRequest) {
  try {
    const { requesterId } = await getRequesterContext()
    const supabase = createSupabaseAdminClient()
    const { report_id } = await request.json()

    if (!report_id) {
      return NextResponse.json({ error: 'Missing report_id' }, { status: 400 })
    }

    // Only allow marking as read for own reports
    const { error } = await supabase
      .from('feedback_reports')
      .update({ reply_read: true })
      .eq('id', report_id)
      .eq('submitter_id', requesterId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/feedback/mark-read]', error)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
