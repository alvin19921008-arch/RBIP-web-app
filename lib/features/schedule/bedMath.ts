import type { Team } from '@/types/staff'

export type WardForScheduleBedMath = {
  name: string
  total_beds: number
  team_assignments: Record<Team, number>
  team_assignment_portions?: Partial<Record<Team, string>>
}

export type BedCountsOverridesByTeam = Partial<
  Record<
    Team,
    {
      wardBedCounts?: Record<string, number | null> | undefined
      shsBedCounts?: number | null | undefined
      studentPlacementBedCounts?: number | null | undefined
    }
  >
>

export function formatWardLabel(ward: WardForScheduleBedMath, team: Team): string {
  // Prefer stored portion text if available
  const storedPortion = ward.team_assignment_portions?.[team]
  if (storedPortion) {
    return `${storedPortion} ${ward.name}`
  }

  // Fallback to computed fraction from numeric values
  const teamBeds = ward.team_assignments[team] || 0
  const totalBeds = ward.total_beds
  if (teamBeds === totalBeds) return ward.name

  const fraction = totalBeds > 0 ? teamBeds / totalBeds : 0
  const validFractions = [
    { num: 1, den: 2, value: 0.5 },
    { num: 1, den: 3, value: 1 / 3 },
    { num: 2, den: 3, value: 2 / 3 },
    { num: 3, den: 4, value: 0.75 },
  ]
  for (const f of validFractions) {
    if (Math.abs(fraction - f.value) < 0.01) {
      return `${f.num}/${f.den} ${ward.name}`
    }
  }
  return ward.name
}

export function computeBedsDesignatedByTeam(args: {
  teams: Team[]
  wards: WardForScheduleBedMath[]
  bedCountsOverridesByTeam?: BedCountsOverridesByTeam | null | undefined
}): { bedsDesignatedByTeam: Record<Team, number>; totalBedsEffectiveAllTeams: number } {
  const { teams, wards, bedCountsOverridesByTeam } = args

  const bedsDesignatedByTeam = {} as Record<Team, number>
  for (const t of teams) bedsDesignatedByTeam[t] = 0

  for (const team of teams) {
    const teamWards = wards.filter((w) => (w.team_assignments[team] || 0) > 0)
    const bedOverride = bedCountsOverridesByTeam?.[team]

    const calculatedBaseBeds = teamWards.reduce((sum, w) => {
      const overrideVal = bedOverride?.wardBedCounts?.[w.name]
      const effective =
        typeof overrideVal === 'number'
          ? Math.min(overrideVal, w.total_beds)
          : (w.team_assignments[team] || 0)
      return sum + effective
    }, 0)

    const shs = typeof bedOverride?.shsBedCounts === 'number' ? bedOverride.shsBedCounts : 0
    const students =
      typeof bedOverride?.studentPlacementBedCounts === 'number' ? bedOverride.studentPlacementBedCounts : 0
    const safeDeductions = Math.min(calculatedBaseBeds, shs + students)
    const totalBedsDesignated = Math.max(0, calculatedBaseBeds - safeDeductions)
    bedsDesignatedByTeam[team] = totalBedsDesignated
  }

  const totalBedsEffectiveAllTeams = teams.reduce((sum, t) => sum + (bedsDesignatedByTeam[t] || 0), 0)
  return { bedsDesignatedByTeam, totalBedsEffectiveAllTeams }
}

export function computeBedsForRelieving(args: {
  teams: Team[]
  bedsDesignatedByTeam: Record<Team, number>
  totalBedsEffectiveAllTeams: number
  totalPTByTeam: Record<Team, number>
}): { bedsForRelieving: Record<Team, number>; totalPTOnDutyAllTeams: number; overallBedsPerPT: number } {
  const { teams, bedsDesignatedByTeam, totalBedsEffectiveAllTeams, totalPTByTeam } = args

  const bedsForRelieving = {} as Record<Team, number>
  for (const t of teams) bedsForRelieving[t] = 0

  const totalPTOnDutyAllTeams = teams.reduce((sum, t) => sum + (totalPTByTeam[t] || 0), 0)
  const overallBedsPerPT = totalPTOnDutyAllTeams > 0 ? totalBedsEffectiveAllTeams / totalPTOnDutyAllTeams : 0

  for (const team of teams) {
    const expectedBeds = overallBedsPerPT * (totalPTByTeam[team] || 0)
    bedsForRelieving[team] = expectedBeds - (bedsDesignatedByTeam[team] || 0)
  }

  return { bedsForRelieving, totalPTOnDutyAllTeams, overallBedsPerPT }
}

