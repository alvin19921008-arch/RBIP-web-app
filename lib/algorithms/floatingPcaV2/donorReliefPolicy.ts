import { TEAMS } from '@/lib/utils/floatingPCAHelpers'
import type { Team } from '@/types/staff'

/** Max donate-donors remembered for per-iteration A1 tie relief (see bounded donor-relief plan). */
export const DONOR_RELIEF_MAX_QUEUED_DONORS = 3

const B1_DONATE_PREFIX = 'b1:donate:' as const

/** Matches `generateB1Candidates` sortKey: `b1:donate:${pcaId}:${slot}:${fromTeam}->${requestingTeam}`. */
export function isB1DonateSortKey(sortKey: string): boolean {
  return sortKey.startsWith(B1_DONATE_PREFIX)
}

/**
 * Parse donor (`fromTeam`) from a B1 donate sortKey.
 * Template: `b1:donate:${targetPca.id}:${targetSlot}:${targetOwner}->${requestingTeam}` (`repairMoves.ts`).
 */
export function parseB1DonateFromTeam(sortKey: string): Team | null {
  if (!isB1DonateSortKey(sortKey)) return null
  const arrow = sortKey.indexOf('->')
  if (arrow < 0) return null
  const left = sortKey.slice(0, arrow)
  const lastColon = left.lastIndexOf(':')
  if (lastColon <= 0) return null
  const from = left.slice(lastColon + 1) as Team
  return TEAMS.includes(from) ? from : null
}

/**
 * Parse `rescueTeam` from `a1:peel:${pcaId}:${slot}:${duplicateTeam}->${rescueTeam}` (`repairMoves.ts`).
 */
export function parseA1PeelRescueTeam(sortKey: string): Team | null {
  if (!sortKey.startsWith('a1:peel:')) return null
  const arrow = sortKey.indexOf('->')
  if (arrow < 0) return null
  const rescue = sortKey.slice(arrow + 2) as Team
  return TEAMS.includes(rescue) ? rescue : null
}

export function isA1PeelToTeam(sortKey: string, team: Team): boolean {
  return parseA1PeelRescueTeam(sortKey) === team
}
