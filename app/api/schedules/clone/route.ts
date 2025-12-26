import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { getNextWorkingDay, formatDate } from '@/lib/utils/dateHelpers'

export async function POST(request: NextRequest) {
  try {
    await requireAuth()
    const supabase = await createServerComponentClient()
    const body = await request.json()
    const { fromDate } = body

    const fromDateObj = fromDate ? new Date(fromDate) : new Date()
    const toDate = getNextWorkingDay(fromDateObj)

    // Load today's schedule
    const { data: fromSchedule, error: fromError } = await supabase
      .from('daily_schedules')
      .select('*')
      .eq('date', formatDate(fromDateObj))
      .single()

    if (fromError || !fromSchedule) {
      return NextResponse.json(
        { error: 'Source schedule not found' },
        { status: 404 }
      )
    }

    // Create tomorrow's tentative schedule
    const { data: toSchedule, error: toError } = await supabase
      .from('daily_schedules')
      .insert({
        date: formatDate(toDate),
        is_tentative: true,
      })
      .select()
      .single()

    if (toError) {
      return NextResponse.json(
        { error: 'Failed to create schedule' },
        { status: 500 }
      )
    }

    // Clone allocations
    const { data: therapistAllocations } = await supabase
      .from('schedule_therapist_allocations')
      .select('*')
      .eq('schedule_id', fromSchedule.id)

    if (therapistAllocations && therapistAllocations.length > 0) {
      const clonedTherapist = therapistAllocations.map(a => ({
        ...a,
        id: undefined,
        schedule_id: toSchedule.id,
        is_manual_override: false, // Reset manual overrides
      }))
      await supabase
        .from('schedule_therapist_allocations')
        .insert(clonedTherapist)
    }

    const { data: pcaAllocations } = await supabase
      .from('schedule_pca_allocations')
      .select('*')
      .eq('schedule_id', fromSchedule.id)

    if (pcaAllocations && pcaAllocations.length > 0) {
      const clonedPCA = pcaAllocations.map(a => ({
        ...a,
        id: undefined,
        schedule_id: toSchedule.id,
      }))
      await supabase
        .from('schedule_pca_allocations')
        .insert(clonedPCA)
    }

    const { data: bedAllocations } = await supabase
      .from('schedule_bed_allocations')
      .select('*')
      .eq('schedule_id', fromSchedule.id)

    if (bedAllocations && bedAllocations.length > 0) {
      const clonedBeds = bedAllocations.map(a => ({
        ...a,
        id: undefined,
        schedule_id: toSchedule.id,
      }))
      await supabase
        .from('schedule_bed_allocations')
        .insert(clonedBeds)
    }

    return NextResponse.json({ success: true, schedule: toSchedule })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clone schedule' },
      { status: 500 }
    )
  }
}

