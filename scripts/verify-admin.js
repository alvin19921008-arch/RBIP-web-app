// Verify admin user setup
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

const userId = '36cf36fd-3793-4118-8ec9-8b9d8b9c1996'

async function verifyAdmin() {
  console.log('🔍 Verifying admin user setup...\n')
  console.log(`   User ID: ${userId}\n`)

  try {
    // Check if user exists in user_profiles
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        console.log('   ❌ User profile not found in user_profiles table')
        console.log('\n   Run this SQL in Supabase SQL Editor:')
        console.log(`   INSERT INTO user_profiles (id, role) VALUES ('${userId}', 'admin');`)
      } else {
        console.log(`   ❌ Error: ${profileError.message}`)
      }
    } else {
      console.log('   ✅ User profile found!')
      console.log(`   📧 Email: alvin19921008@gmail.com`)
      console.log(`   👤 Role: ${profile.role}`)
      
      if (profile.role === 'admin') {
        console.log('\n   ✅ Admin user is properly configured!')
        console.log('   You can now log in to the application.')
      } else {
        console.log(`\n   ⚠️  User role is '${profile.role}', not 'admin'`)
        console.log('   Run this SQL to update:')
        console.log(`   UPDATE user_profiles SET role = 'admin' WHERE id = '${userId}';`)
      }
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`)
  }
}

verifyAdmin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })

