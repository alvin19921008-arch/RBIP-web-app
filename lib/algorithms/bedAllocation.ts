import { Team } from '@/types/staff'
import { BedAllocation } from '@/types/schedule'
import { roundToNearestInteger } from '@/lib/utils/rounding'

export interface BedAllocationContext {
  bedsForRelieving: Record<Team, number>
  wards: { name: string; team_assignments: Record<Team, number> }[]
}

export interface BedAllocationResult {
  allocations: BedAllocation[]
  optimizationScore: number
}

export function allocateBeds(context: BedAllocationContext): BedAllocationResult {
  const allocations: BedAllocation[] = []
  
  // Separate teams into releasing and taking beds
  const releasingTeams: { team: Team; beds: number }[] = []
  const takingTeams: { team: Team; beds: number }[] = []

  Object.entries(context.bedsForRelieving).forEach(([team, beds]) => {
    const teamKey = team as Team
    const roundedBeds = roundToNearestInteger(beds)
    
    if (roundedBeds < 0) {
      releasingTeams.push({ team: teamKey, beds: Math.abs(roundedBeds) })
    } else if (roundedBeds > 0) {
      takingTeams.push({ team: teamKey, beds: roundedBeds })
    }
  })

  // Generate allocation combinations
  const combinations = generateCombinations(releasingTeams, takingTeams, context.wards)
  
  // Select best combination based on priorities
  const bestCombination = selectBestCombination(combinations)
  
  return {
    allocations: bestCombination.allocations,
    optimizationScore: bestCombination.score,
  }
}

interface Combination {
  allocations: BedAllocation[]
  score: number
  wardsPerTeam: Record<Team, number>
}

function generateCombinations(
  releasing: { team: Team; beds: number }[],
  taking: { team: Team; beds: number }[],
  wards: { name: string; team_assignments: Record<Team, number> }[]
): Combination[] {
  const combinations: Combination[] = []
  
  // Simple greedy approach: try to minimize wards per team
  const allocations: BedAllocation[] = []
  const remainingReleasing = [...releasing]
  const remainingTaking = [...taking]
  const wardsPerTeam: Record<Team, number> = {
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
  }

  taking.forEach((takingTeam) => {
    let bedsNeeded = takingTeam.beds
    
    // Try to get beds from teams with most beds to release
    remainingReleasing
      .sort((a, b) => b.beds - a.beds)
      .forEach((releasingTeam) => {
        if (bedsNeeded <= 0) return
        
        // Find wards that the releasing team handles
        const availableWards = wards.filter(ward => 
          ward.team_assignments[releasingTeam.team] > 0
        )
        
        availableWards.forEach((ward) => {
          if (bedsNeeded <= 0) return
          
          const bedsFromWard = Math.min(
            bedsNeeded,
            releasingTeam.beds,
            ward.team_assignments[releasingTeam.team]
          )
          
          if (bedsFromWard > 0) {
            const allocation: BedAllocation = {
              id: crypto.randomUUID(),
              schedule_id: '',
              from_team: releasingTeam.team,
              to_team: takingTeam.team,
              ward: ward.name,
              num_beds: bedsFromWard,
              slot: null,
            }
            allocations.push(allocation)
            
            // Track wards per team
            if (!wardsPerTeam[takingTeam.team]) {
              wardsPerTeam[takingTeam.team] = 0
            }
            if (allocations.filter(a => a.to_team === takingTeam.team && a.ward === ward.name).length === 1) {
              wardsPerTeam[takingTeam.team]++
            }
            
            bedsNeeded -= bedsFromWard
            releasingTeam.beds -= bedsFromWard
          }
        })
      })
  })

  // Calculate score
  const maxWards = Math.max(...Object.values(wardsPerTeam), 0)
  const minWards = Math.min(...Object.values(wardsPerTeam).filter(v => v > 0), 0)
  const discrepancy = maxWards - minWards
  const totalWards = Object.values(wardsPerTeam).reduce((sum, val) => sum + val, 0)
  
  // Lower score is better
  // Priority 1: Minimize total wards (intra-team)
  // Priority 2: Minimize discrepancy (inter-team)
  const score = totalWards * 1000 + discrepancy * 100

  combinations.push({
    allocations,
    score,
    wardsPerTeam,
  })

  return combinations
}

function selectBestCombination(combinations: Combination[]): Combination {
  if (combinations.length === 0) {
    return { allocations: [], score: Infinity, wardsPerTeam: {} as Record<Team, number> }
  }

  // Sort by score (lower is better)
  return combinations.sort((a, b) => a.score - b.score)[0]
}

