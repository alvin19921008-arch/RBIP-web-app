import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRequesterContext } from '@/app/api/accounts/_utils'

// GET /api/feedback — list reports (developer sees all, others see open reports for +1 panel)
export async function GET(request: NextRequest) {
  try {
    const { requesterRole } = await getRequesterContext()
    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)

    const mode = searchParams.get('mode') // 'review' | 'similar' | null
    const status = searchParams.get('status')
    const category = searchParams.get('category')
    const type = searchParams.get('type')
    const severity = searchParams.get('severity')
    const badge = searchParams.get('badge')

    // Badge-only: mode=review&status=new&badge=1, no other query keys (avoids accidental fast-path).
    // Response: { newReportCount } — head count via `select('id', …)` only (no `select('*')`).
    const badgeParamKeys = new Set(Array.from(searchParams.keys()))
    const isBadgeOnly =
      badgeParamKeys.size === 3 &&
      badgeParamKeys.has('mode') &&
      badgeParamKeys.has('status') &&
      badgeParamKeys.has('badge') &&
      mode === 'review' &&
      status === 'new' &&
      badge === '1' &&
      !category &&
      !type &&
      !severity

    if (isBadgeOnly) {
      if (requesterRole !== 'developer') {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
      }
      const { count, error } = await supabase
        .from('feedback_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
      if (error) throw error
      return NextResponse.json({ newReportCount: count ?? 0 })
    }

    let query = supabase
      .from('feedback_reports')
      .select('*')
      .order('is_priority', { ascending: false })
      .order('created_at', { ascending: false })

    if (mode === 'similar') {
      // For the "similar issues" panel — only open reports
      query = query.in('status', ['new', 'in_review', 'in_progress']).limit(20)
    } else if (mode === 'review') {
      if (requesterRole !== 'developer') {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
      }
      if (status) query = query.eq('status', status)
      if (category) query = query.eq('category', category)
      if (type) query = query.eq('type', type)
      if (severity) query = query.eq('severity', severity)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ reports: data })
  } catch (error) {
    console.error('[GET /api/feedback]', error)
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 })
  }
}

// POST /api/feedback — submit a new report
export async function POST(request: NextRequest) {
  try {
    const { requesterId } = await getRequesterContext()
    const supabase = createSupabaseAdminClient()
    const body = await request.json()

    const { type, severity, category, sub_category, title, description,
      steps_to_reproduce, screenshot_url, auto_context, submitter_name } = body

    if (!type || !category || !title || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('feedback_reports')
      .insert({
        submitter_id: requesterId,
        submitter_name: submitter_name ?? null,
        type,
        severity: severity ?? null,
        category,
        sub_category: sub_category ?? null,
        title,
        description,
        steps_to_reproduce: steps_to_reproduce ?? null,
        screenshot_url: screenshot_url ?? null,
        auto_context: auto_context ?? {},
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ report: data }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/feedback]', error)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }
}

// PATCH /api/feedback — developer updates status/notes/reply
export async function PATCH(request: NextRequest) {
  try {
    const { requesterRole } = await getRequesterContext()
    if (requesterRole !== 'developer') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }

    const supabase = createSupabaseAdminClient()
    const body = await request.json()
    const { id, status, is_priority, dev_notes, dev_reply } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing report id' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (status !== undefined) updates.status = status
    if (is_priority !== undefined) updates.is_priority = is_priority
    if (dev_notes !== undefined) updates.dev_notes = dev_notes
    if (dev_reply !== undefined) {
      updates.dev_reply = dev_reply
      // When developer sets/changes a reply, mark it unread for submitter
      updates.reply_read = false
    }

    const { data, error } = await supabase
      .from('feedback_reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ report: data })
  } catch (error) {
    console.error('[PATCH /api/feedback]', error)
    return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 })
  }
}

// DELETE /api/feedback — developer deletes a report
export async function DELETE(request: NextRequest) {
  try {
    const { requesterRole } = await getRequesterContext()
    if (requesterRole !== 'developer') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }

    const supabase = createSupabaseAdminClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing report id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('feedback_reports')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/feedback]', error)
    return NextResponse.json({ error: 'Failed to delete feedback' }, { status: 500 })
  }
}
