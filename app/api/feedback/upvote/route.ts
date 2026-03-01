import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRequesterContext } from '@/app/api/accounts/_utils'

// POST /api/feedback/upvote — toggle upvote on a report
export async function POST(request: NextRequest) {
  try {
    const { requesterId } = await getRequesterContext()
    const supabase = createSupabaseAdminClient()
    const { report_id } = await request.json()

    if (!report_id) {
      return NextResponse.json({ error: 'Missing report_id' }, { status: 400 })
    }

    // Check if already upvoted
    const { data: existing } = await supabase
      .from('feedback_upvotes')
      .select('id')
      .eq('report_id', report_id)
      .eq('user_id', requesterId)
      .maybeSingle()

    if (existing) {
      // Toggle off — remove upvote
      await supabase
        .from('feedback_upvotes')
        .delete()
        .eq('report_id', report_id)
        .eq('user_id', requesterId)
      return NextResponse.json({ upvoted: false })
    } else {
      // Toggle on — add upvote
      await supabase
        .from('feedback_upvotes')
        .insert({ report_id, user_id: requesterId })
      return NextResponse.json({ upvoted: true })
    }
  } catch (error) {
    console.error('[POST /api/feedback/upvote]', error)
    return NextResponse.json({ error: 'Failed to toggle upvote' }, { status: 500 })
  }
}

// GET /api/feedback/upvote — get user's upvoted report ids
export async function GET() {
  try {
    const { requesterId } = await getRequesterContext()
    const supabase = createSupabaseAdminClient()

    const { data, error } = await supabase
      .from('feedback_upvotes')
      .select('report_id')
      .eq('user_id', requesterId)

    if (error) throw error

    return NextResponse.json({ upvotedIds: (data ?? []).map((r: { report_id: string }) => r.report_id) })
  } catch (error) {
    console.error('[GET /api/feedback/upvote]', error)
    return NextResponse.json({ error: 'Failed to load upvotes' }, { status: 500 })
  }
}
