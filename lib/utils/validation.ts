export function validateFTE(fte: number): boolean {
  return fte >= 0 && fte <= 1 && Number.isFinite(fte)
}

export function validateFTESum(allocations: { fte: number }[]): boolean {
  const sum = allocations.reduce((acc, curr) => acc + curr.fte, 0)
  return sum <= 1 && sum >= 0
}

export function validateSlot(slot: number): boolean {
  return slot >= 1 && slot <= 4 && Number.isInteger(slot)
}

export function validateTeam(team: string): boolean {
  const validTeams = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  return validTeams.includes(team)
}

