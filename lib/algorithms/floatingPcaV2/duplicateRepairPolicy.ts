/**
 * A1 duplicate relief — shared predicates for "material" floating pending and short-team counts.
 *
 * **Material remaining (floating pending):** `roundToNearestQuarterWithMidpoint(pending[team]) >= 0.25`
 * in FTE, matching quarter granularity elsewhere in Step 3.4 (`repairAudit.ts` uses the same
 * rounder). Note: e.g. `0.24` is **not** in [0, 0.25) after midpoint quarter rounding (it becomes
 * `0.25`), so it still counts as material; use `0.1` or `0.12` for "clearly not material" tests.
 */
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
