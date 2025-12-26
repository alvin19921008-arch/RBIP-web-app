// Simple connection test script
// Run with: node scripts/test-connection.js

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  console.error('   Make sure .env.local exists with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

console.log('🔍 Testing Supabase connection...\n')
console.log(`   URL: ${supabaseUrl}\n`)

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  const results = {
    connection: false,
    tables: {},
    userProfiles: null,
    errors: []
  }

  // Test 1: Basic connection
  console.log('1. Testing basic connection...')
  try {
    const { data, error } = await supabase.from('staff').select('count').limit(0)
    if (error && error.code === '42P01') {
      console.log('   ✅ Connected to Supabase')
      console.log('   ⚠️  Tables not found - schema needs to be run')
      results.connection = true
      results.errors.push('Schema not applied')
    } else if (error) {
      console.log(`   ❌ Connection error: ${error.message}`)
      results.errors.push(error.message)
    } else {
      console.log('   ✅ Connected and tables exist!')
      results.connection = true
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`)
    results.errors.push(err.message)
  }

  // Test 2: Check required tables
  console.log('\n2. Checking required tables...')
  const requiredTables = [
    'staff', 'staff_preferences', 'special_programs', 'spt_allocations',
    'team_head_substitutions', 'pca_preferences', 'wards', 'daily_schedules',
    'schedule_therapist_allocations', 'schedule_pca_allocations',
    'schedule_bed_allocations', 'schedule_calculations', 'user_profiles'
  ]

  let tablesFound = 0
  for (const table of requiredTables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(0)
      if (error && error.code === '42P01') {
        console.log(`   ❌ ${table}`)
        results.tables[table] = false
      } else if (error) {
        console.log(`   ⚠️  ${table} - ${error.message}`)
        results.tables[table] = false
      } else {
        console.log(`   ✅ ${table}`)
        results.tables[table] = true
        tablesFound++
      }
    } catch (err) {
      console.log(`   ❌ ${table} - ${err.message}`)
      results.tables[table] = false
    }
  }

  // Test 3: Check user_profiles
  console.log('\n3. Checking user_profiles...')
  try {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('*')

    if (error) {
      if (error.code === '42P01') {
        console.log('   ❌ user_profiles table not found')
      } else {
        console.log(`   ⚠️  Error: ${error.message}`)
      }
      results.userProfiles = { error: error.message }
    } else {
      console.log(`   ✅ user_profiles table exists`)
      console.log(`   📊 Found ${profiles?.length || 0} user(s)`)
      const admins = profiles?.filter(p => p.role === 'admin') || []
      if (admins.length > 0) {
        console.log(`   ✅ Found ${admins.length} admin user(s)`)
        results.userProfiles = {
          count: profiles.length,
          admins: admins.length,
          users: profiles
        }
      } else {
        console.log(`   ⚠️  No admin users found`)
        results.userProfiles = {
          count: profiles?.length || 0,
          admins: 0,
          users: profiles || []
        }
      }
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`)
    results.userProfiles = { error: err.message }
  }

  // Summary
  console.log('\n📊 Summary:')
  console.log(`   Connection: ${results.connection ? '✅' : '❌'}`)
  console.log(`   Tables: ${tablesFound}/${requiredTables.length}`)
  console.log(`   Schema Complete: ${tablesFound === requiredTables.length ? '✅' : '❌'}`)
  if (results.userProfiles && !results.userProfiles.error) {
    console.log(`   Admin Users: ${results.userProfiles.admins > 0 ? '✅' : '⚠️'}`)
  }

  if (tablesFound === requiredTables.length && results.userProfiles?.admins > 0) {
    console.log('\n✅ All checks passed! Your database is ready to use.')
  } else if (tablesFound === requiredTables.length) {
    console.log('\n⚠️  Schema is complete, but no admin users found.')
    console.log('   Run this SQL to set a user as admin:')
    console.log('   INSERT INTO user_profiles (id, role) VALUES (\'<user-id>\', \'admin\');')
  } else {
    console.log('\n⚠️  Schema is incomplete. Please run schema.sql in Supabase SQL Editor.')
  }

  return results
}

testConnection()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })

