/**
 * Script to apply the avoid_gym_schedule column migration
 * Run with: npx ts-node scripts/apply-avoid-gym-migration.ts
 * Or compile and run: npx tsx scripts/apply-avoid-gym-migration.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
  process.exit(1)
}

async function applyMigration() {
  console.log('Connecting to Supabase...')
  const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  // Read the migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/add_avoid_gym_schedule_column.sql')
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

  console.log('Applying migration: add_avoid_gym_schedule_column.sql')
  console.log('SQL:', migrationSQL)

  try {
    // Execute the migration using RPC or direct SQL execution
    // Note: Supabase JS client doesn't have direct SQL execution for arbitrary SQL
    // We'll use the REST API directly or check if the column exists first
    
    // Check if column already exists
    const { data: existingColumns, error: checkError } = await (supabase
      .rpc('exec_sql', { query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'pca_preferences' 
        AND column_name = 'avoid_gym_schedule'
      ` }) as any)
      .catch(async () => {
        // RPC might not exist, try alternative approach
        // Use a test query to see if column exists
        const { error: testError } = await supabase
          .from('pca_preferences')
          .select('avoid_gym_schedule')
          .limit(1)
        
        if (!testError) {
          console.log('✓ Column avoid_gym_schedule already exists')
          return { data: [{ column_name: 'avoid_gym_schedule' }], error: null }
        }
        
        // Column doesn't exist, need to create it
        // Since we can't execute arbitrary SQL via JS client easily,
        // we'll need to use the Supabase dashboard SQL editor or CLI
        console.log('\n❌ Cannot execute DDL via Supabase JS client')
        console.log('\nPlease run this SQL in your Supabase dashboard SQL editor:')
        console.log('\n' + migrationSQL)
        console.log('\nOr use Supabase CLI:')
        console.log('  supabase db push')
        return { data: null, error: new Error('Need to run via SQL editor or CLI') }
      })

    if (existingColumns && existingColumns.length > 0) {
      console.log('✓ Column avoid_gym_schedule already exists in pca_preferences table')
      return
    }

    // If we get here, we need to apply the migration
    // Since Supabase JS client can't execute DDL directly, provide instructions
    console.log('\n⚠️  Direct SQL execution via JS client is not available')
    console.log('\nTo apply this migration, please use one of these methods:\n')
    console.log('Method 1: Supabase Dashboard SQL Editor')
    console.log('  1. Go to your Supabase dashboard')
    console.log('  2. Navigate to SQL Editor')
    console.log('  3. Run this SQL:\n')
    console.log(migrationSQL)
    console.log('\nMethod 2: Supabase CLI')
    console.log('  supabase migration up')
    console.log('  or')
    console.log('  supabase db push\n')

  } catch (error: any) {
    console.error('Error applying migration:', error.message)
    console.log('\nPlease run this SQL manually in your Supabase dashboard SQL editor:')
    console.log('\n' + migrationSQL)
    process.exit(1)
  }
}

applyMigration().then(() => {
  console.log('\nMigration check complete!')
  process.exit(0)
}).catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

