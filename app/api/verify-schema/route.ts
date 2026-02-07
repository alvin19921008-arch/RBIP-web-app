import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const results: any = {
    connection: false,
    tables: {},
    enums: {},
    userProfiles: null,
    rlsEnabled: false,
    errors: [],
  }

  try {
    const supabase = await createServerComponentClient()

    // Test 1: Basic connection
    try {
      const { error } = await supabase.from('staff').select('count').limit(0)
      if (error && error.code === '42P01') {
        results.connection = true
        results.errors.push('Tables not found - schema needs to be run')
      } else if (error) {
        results.errors.push(`Connection error: ${error.message}`)
      } else {
        results.connection = true
      }
    } catch (err: any) {
      results.errors.push(`Connection exception: ${err.message}`)
    }

    // Test 2: Check required tables
    const requiredTables = [
      'staff',
      'staff_preferences',
      'special_programs',
      'spt_allocations',
      'team_head_substitutions',
      'pca_preferences',
      'wards',
      'daily_schedules',
      'schedule_therapist_allocations',
      'schedule_pca_allocations',
      'schedule_bed_allocations',
      'schedule_calculations',
      'user_profiles',
    ]

    for (const table of requiredTables) {
      try {
        const { error } = await supabase.from(table).select('*').limit(0)
        if (error && error.code === '42P01') {
          results.tables[table] = { exists: false, error: 'Table not found' }
        } else if (error) {
          results.tables[table] = { exists: false, error: error.message }
        } else {
          results.tables[table] = { exists: true }
        }
      } catch (err: any) {
        results.tables[table] = { exists: false, error: err.message }
      }
    }

    // Test 3: Check user_profiles
    try {
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')

      if (error) {
        results.userProfiles = { error: error.message }
      } else {
        results.userProfiles = {
          count: profiles?.length || 0,
          admins: profiles?.filter((p: any) => p.role === 'admin').length || 0,
          users: profiles || [],
        }
      }
    } catch (err: any) {
      results.userProfiles = { error: err.message }
    }

    // Test 4: Check RLS (try to query without auth)
    try {
      const { data, error } = await supabase.from('staff').select('*').limit(1)
      if (error) {
        if (error.message.includes('permission denied') || error.message.includes('RLS')) {
          results.rlsEnabled = true
        }
      }
    } catch (err: any) {
      // RLS check
    }

    // Calculate summary
    const tablesFound = Object.values(results.tables).filter(
      (t: any) => t.exists === true
    ).length
    const tablesTotal = requiredTables.length

    return NextResponse.json({
      ...results,
      summary: {
        connection: results.connection,
        tablesFound,
        tablesTotal,
        schemaComplete: tablesFound === tablesTotal,
        hasAdmin: results.userProfiles?.admins > 0,
        rlsEnabled: results.rlsEnabled,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        ...results,
        errors: [...results.errors, error.message],
      },
      { status: 500 }
    )
  }
}

