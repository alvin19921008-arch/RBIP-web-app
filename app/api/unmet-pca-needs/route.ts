import { createServerComponentClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerComponentClient()
    
    // Get today's date (local timezone)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD format
    
    // Query for past 5 working days (excluding weekends)
    // Get last 7 calendar days to ensure we have 5 working days
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - 7)
    const startDateStr = startDate.toISOString().split('T')[0]
    
    // Query unmet needs for dates <= today and >= startDate
    const { data, error } = await supabase
      .from('pca_unmet_needs_tracking')
      .select('date, team, pending_pca_fte')
      .lte('date', todayStr)
      .gte('date', startDateStr)
      .order('date', { ascending: false })
    
    if (error) {
      console.error('Error fetching unmet PCA needs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Aggregate by team, count distinct dates
    const teamCounts: Record<string, number> = {}
    const teamLastDates: Record<string, string> = {}
    const seenDates: Set<string> = new Set()
    
    data?.forEach((record) => {
      const team = record.team
      const dateKey = `${team}-${record.date}`
      
      // Count distinct dates per team
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey)
        teamCounts[team] = (teamCounts[team] || 0) + 1
      }
      
      // Update last date if this is more recent
      if (!teamLastDates[team] || record.date > teamLastDates[team]) {
        teamLastDates[team] = record.date
      }
    })
    
    return NextResponse.json({ 
      teamCounts,
      teamLastDates 
    })
  } catch (error) {
    console.error('Error in unmet-pca-needs API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
