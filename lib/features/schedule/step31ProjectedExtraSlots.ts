export function countProjectedExtraSlots(
  extraCoverageByStaffId?: Record<string, Array<1 | 2 | 3 | 4>>
): number {
  return Object.values(extraCoverageByStaffId || {}).reduce((sum, slots) => sum + (slots?.length || 0), 0)
}

export function buildProjectedExtraSlotsTooltipLines(args: {
  neededSlots: number
  availableSlots: number
}): [string, string] {
  return [
    `Floating slots still needed after Step 2: ${args.neededSlots}`,
    `Floating PCA available slots pool: ${args.availableSlots}`,
  ]
}

export function buildStep31PreviewExtraCoverageOptions<T extends object>(
  args: T
): T & { extraCoverageMode: 'round-robin-team-order' } {
  return {
    ...args,
    extraCoverageMode: 'round-robin-team-order' as const,
  } as T & { extraCoverageMode: 'round-robin-team-order' }
}
