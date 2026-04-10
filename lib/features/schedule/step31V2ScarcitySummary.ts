import type { Team } from '../../../types/staff'

export type Step31V2ScarcitySummaryInput =
  | {
      status: 'ready'
      standardZeroTeams: Team[]
      balancedShortTeams: Team[]
      standardProjectedExtraSlots: number
    }
  | {
      status: 'idle' | 'loading' | 'error'
      standardZeroTeams?: Team[]
      balancedShortTeams?: Team[]
      standardProjectedExtraSlots?: number
    }

export type Step31V2ScarcitySummary = {
  zeroTeams: Team[]
  shortTeams: Team[]
  zeroCount: number
  shortCount: number
  projectedExtraSlots: number
  showProjectedExtraSlots: boolean
}

export function buildV2Step31ScarcitySummary(
  input: Step31V2ScarcitySummaryInput
): Step31V2ScarcitySummary | null {
  if (input.status !== 'ready') return null

  const zeroTeams = input.standardZeroTeams
  const shortTeams = input.balancedShortTeams
  const projectedExtraSlots = input.standardProjectedExtraSlots

  if (zeroTeams.length === 0 && shortTeams.length === 0) return null

  return {
    zeroTeams,
    shortTeams,
    zeroCount: zeroTeams.length,
    shortCount: shortTeams.length,
    projectedExtraSlots,
    showProjectedExtraSlots: projectedExtraSlots > 0,
  }
}
