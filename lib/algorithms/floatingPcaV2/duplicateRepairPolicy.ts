import type { Team } from '@/types/staff'
import { TEAMS } from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'

export const A1_DUPLICATE_RELIEF_POLICY_VERSION = 1

export function teamHasMaterialRemainingFloatingPending(
  pendingFTE: Record<Team, number>,
  team: Team
): boolean {
  return roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) >= 0.25
}

export function countTeamsMaterialShort(pendingFTE: Record<Team, number>): number {
  let n = 0
  for (const team of TEAMS) {
    if (teamHasMaterialRemainingFloatingPending(pendingFTE, team)) n += 1
  }
  return n
}
