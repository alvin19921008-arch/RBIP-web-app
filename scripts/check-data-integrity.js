// Check data integrity for staff and wards
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDataIntegrity() {
  console.log('🔍 Checking data integrity...\n')

  // Check staff data
  console.log('1. Checking staff data...')
  try {
    const { data: staff, error } = await supabase
      .from('staff')
      .select('*')
      .order('rank', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      console.log(`   ❌ Error: ${error.message}`)
    } else {
      console.log(`   ✅ Found ${staff?.length || 0} staff members`)
      
      // Group by rank
      const byRank = {
        SPT: staff?.filter(s => s.rank === 'SPT').length || 0,
        APPT: staff?.filter(s => s.rank === 'APPT').length || 0,
        RPT: staff?.filter(s => s.rank === 'RPT').length || 0,
        PCA: staff?.filter(s => s.rank === 'PCA').length || 0,
      }
      
      console.log(`   📊 Breakdown:`)
      console.log(`      SPT: ${byRank.SPT}`)
      console.log(`      APPT: ${byRank.APPT}`)
      console.log(`      RPT: ${byRank.RPT}`)
      console.log(`      PCA: ${byRank.PCA}`)
      
      // Check for required staff
      const requiredSPT = ['Eric Tse', 'Aggie', 'Harry Lee', 'Katie']
      const foundSPT = staff?.filter(s => s.rank === 'SPT').map(s => s.name) || []
      const missingSPT = requiredSPT.filter(name => !foundSPT.includes(name))
      if (missingSPT.length > 0) {
        console.log(`   ⚠️  Missing SPT: ${missingSPT.join(', ')}`)
      }
      
      // Check floating PCA
      const floatingPCA = staff?.filter(s => s.rank === 'PCA' && s.floating === true).length || 0
      const nonFloatingPCA = staff?.filter(s => s.rank === 'PCA' && s.floating === false).length || 0
      console.log(`   📊 PCA: ${floatingPCA} floating, ${nonFloatingPCA} non-floating`)
      
      // Check teams
      const teams = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
      console.log(`   📊 Team assignments:`)
      teams.forEach(team => {
        const count = staff?.filter(s => s.team === team).length || 0
        if (count > 0) {
          console.log(`      ${team}: ${count} staff`)
        }
      })
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`)
  }

  // Check wards data
  console.log('\n2. Checking wards data...')
  try {
    const { data: wards, error } = await supabase
      .from('wards')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.log(`   ❌ Error: ${error.message}`)
    } else {
      console.log(`   ✅ Found ${wards?.length || 0} wards`)
      
      // Check each ward
      const requiredWards = ['R7B', 'R7C', 'R8A', 'R8B', 'R8C', 'R9A', 'R9C', 'R10A', 'R10B', 'R10C', 'R11A', 'R11B', 'R11C']
      const foundWards = wards?.map(w => w.name) || []
      const missingWards = requiredWards.filter(name => !foundWards.includes(name))
      
      if (missingWards.length > 0) {
        console.log(`   ⚠️  Missing wards: ${missingWards.join(', ')}`)
      }
      
      // Verify bed assignments
      let totalBeds = 0
      let issues = []
      
      wards?.forEach(ward => {
        const total = ward.total_beds
        const assignments = ward.team_assignments || {}
        
        // Calculate sum of assigned beds
        const assignedSum = Object.values(assignments).reduce((sum, val) => {
          return sum + (typeof val === 'number' ? val : parseInt(val) || 0)
        }, 0)
        
        totalBeds += total
        
        if (assignedSum !== total) {
          issues.push(`${ward.name}: total_beds (${total}) ≠ assigned beds (${assignedSum})`)
        }
      })
      
      console.log(`   📊 Total beds across all wards: ${totalBeds}`)
      
      if (issues.length > 0) {
        console.log(`   ⚠️  Bed assignment issues:`)
        issues.forEach(issue => console.log(`      ${issue}`))
      } else {
        console.log(`   ✅ All ward bed assignments are correct`)
      }
      
      // Show ward breakdown
      console.log(`   📊 Ward breakdown:`)
      wards?.forEach(ward => {
        const teams = Object.keys(ward.team_assignments || {})
        console.log(`      ${ward.name}: ${ward.total_beds} beds - ${teams.join(', ')}`)
      })
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`)
  }

  // Summary
  console.log('\n📊 Summary:')
  console.log('   Data integrity check complete!')
  console.log('\n✅ If no errors shown above, your data is ready!')
}

checkDataIntegrity()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })

