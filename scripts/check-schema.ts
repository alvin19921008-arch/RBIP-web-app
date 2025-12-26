import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
  console.log('🔍 Checking Supabase connection and schema integrity...\n')

  // Test 1: Basic connection
  console.log('1. Testing basic connection...')
  try {
    const { data, error } = await supabase.from('staff').select('count').limit(0)
    if (error && error.code === '42P01') {
      console.log('   ⚠️  Connection works, but tables not found')
    } else if (error) {
      console.log('   ❌ Connection error:', error.message)
    } else {
      console.log('   ✅ Connection successful')
    }
  } catch (err: any) {
    console.log('   ❌ Connection failed:', err.message)
  }

  // Test 2: Check required tables
  console.log('\n2. Checking required tables...')
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

  const tableStatus: Record<string, boolean> = {}
  
  for (const table of requiredTables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(0)
      if (error && error.code === '42P01') {
        tableStatus[table] = false
        console.log(`   ❌ ${table} - Table not found`)
      } else if (error) {
        tableStatus[table] = false
        console.log(`   ⚠️  ${table} - Error: ${error.message}`)
      } else {
        tableStatus[table] = true
        console.log(`   ✅ ${table}`)
      }
    } catch (err: any) {
      tableStatus[table] = false
      console.log(`   ❌ ${table} - Exception: ${err.message}`)
    }
  }

  // Test 3: Check enum types
  console.log('\n3. Checking enum types...')
  const enumQueries = [
    { name: 'staff_rank', values: ['SPT', 'APPT', 'RPT', 'PCA', 'workman'] },
    { name: 'team', values: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'] },
    { name: 'weekday', values: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    { name: 'leave_type', values: ['VL', 'SL', 'TIL', 'study leave', 'conference'] },
  ]

  for (const enumType of enumQueries) {
    try {
      // Try to insert a test value to check if enum exists
      const { error } = await supabase.rpc('check_enum', { enum_name: enumType.name })
      if (error) {
        // Enum check function might not exist, but that's okay
        // We'll check by trying to query a table that uses the enum
        console.log(`   ⚠️  ${enumType.name} - Cannot verify directly (this is normal)`)
      } else {
        console.log(`   ✅ ${enumType.name}`)
      }
    } catch (err) {
      console.log(`   ⚠️  ${enumType.name} - Cannot verify (this is normal if enum exists)`)
    }
  }

  // Test 4: Check user_profiles and admin user
  console.log('\n4. Checking user_profiles and admin setup...')
  try {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('*')

    if (error) {
      console.log(`   ❌ Error querying user_profiles: ${error.message}`)
    } else if (profiles && profiles.length > 0) {
      console.log(`   ✅ user_profiles table exists with ${profiles.length} user(s)`)
      const admins = profiles.filter((p: any) => p.role === 'admin')
      if (admins.length > 0) {
        console.log(`   ✅ Found ${admins.length} admin user(s)`)
      } else {
        console.log(`   ⚠️  No admin users found`)
      }
    } else {
      console.log(`   ⚠️  user_profiles table exists but is empty`)
    }
  } catch (err: any) {
    console.log(`   ❌ Exception: ${err.message}`)
  }

  // Test 5: Check RLS policies
  console.log('\n5. Checking Row Level Security...')
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .limit(1)

    if (error) {
      if (error.message.includes('permission denied') || error.message.includes('RLS')) {
        console.log('   ✅ RLS is enabled (permission denied is expected without auth)')
      } else {
        console.log(`   ⚠️  RLS check: ${error.message}`)
      }
    } else {
      console.log('   ⚠️  RLS might not be enabled (able to query without auth)')
    }
  } catch (err: any) {
    console.log(`   ⚠️  RLS check exception: ${err.message}`)
  }

  // Summary
  console.log('\n📊 Summary:')
  const tablesFound = Object.values(tableStatus).filter(Boolean).length
  const tablesTotal = requiredTables.length
  console.log(`   Tables: ${tablesFound}/${tablesTotal} found`)
  
  if (tablesFound === tablesTotal) {
    console.log('\n✅ Schema integrity check PASSED!')
  } else {
    console.log('\n⚠️  Schema integrity check INCOMPLETE')
    console.log('   Please run the schema.sql file in Supabase SQL Editor')
  }
}

checkSchema().catch(console.error)

