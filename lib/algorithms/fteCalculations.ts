import { Team } from '@/types/staff'
import { roundToNearestQuarter, roundToNearestInteger } from '@/lib/utils/rounding'

export interface FTECalculationInput {
  totalBeds: number
  totalPTOnDuty: number
  bedsPerTeam: Record<Team, number>
  ptPerTeam: Record<Team, number>
}

export interface FTECalculationResult {
  bedsPerPT: number
  bedsForRelieving: Record<Team, number>
}

export function calculateFTE(input: FTECalculationInput): FTECalculationResult {
  const bedsPerPT = input.totalBeds / input.totalPTOnDuty
  
  const bedsForRelieving: Record<Team, number> = {} as Record<Team, number>
  
  Object.keys(input.bedsPerTeam).forEach((team) => {
    const teamKey = team as Team
    const calculatedBeds = (input.totalBeds / input.totalPTOnDuty) * input.ptPerTeam[teamKey]
    bedsForRelieving[teamKey] = roundToNearestInteger(calculatedBeds - input.bedsPerTeam[teamKey])
  })
  
  return {
    bedsPerPT,
    bedsForRelieving,
  }
}

export function calculatePCAFTE(
  totalBeds: number,
  totalPCAOnDuty: number,
  ptPerTeam: Record<Team, number>,
  bedsPerPT: number
): Record<Team, number> {
  const totalPTPerPCA = totalBeds / totalPCAOnDuty
  const averagePCAPerTeam: Record<Team, number> = {} as Record<Team, number>
  
  Object.keys(ptPerTeam).forEach((team) => {
    const teamKey = team as Team
    const totalPTPerTeam = bedsPerPT * ptPerTeam[teamKey]
    const avgPCA = totalPTPerTeam / totalPTPerPCA
    averagePCAPerTeam[teamKey] = roundToNearestQuarter(avgPCA)
  })
  
  return averagePCAPerTeam
}

