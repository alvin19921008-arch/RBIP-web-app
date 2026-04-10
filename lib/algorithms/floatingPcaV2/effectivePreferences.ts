import type { PCAPreference } from '@/types/allocation'
import type { Team } from '@/types/staff'
import { TEAMS } from '@/lib/utils/floatingPCAHelpers'

/**
 * Ranked Step 3.4 `allocateFloatingPCA_v2RankedSlot` + `selected_only`: merge Step 3.2 and Step 3.3
 * manual PCA picks into [preferred_pca_ids] without clearing base [preferred_slots] rank order.
 * When any manual PCA ids exist for a team, they replace effective [preferred_pca_ids]; otherwise
 * base [preferred_pca_ids] from DB apply.
 */
export function buildEffectiveRankedPreferences(
  basePreferences: PCAPreference[],
  selectedAssignments: Array<{ team: Team; pcaId: string }>
): PCAPreference[] {
  const baseByTeam = new Map<Team, PCAPreference>()
  for (const pref of basePreferences) {
    if (!baseByTeam.has(pref.team)) {
      baseByTeam.set(pref.team, pref)
    }
  }

  const selectedPcaByTeam = new Map<Team, Set<string>>()
  for (const assignment of selectedAssignments) {
    const existing = selectedPcaByTeam.get(assignment.team) ?? new Set<string>()
    existing.add(assignment.pcaId)
    selectedPcaByTeam.set(assignment.team, existing)
  }

  return TEAMS.map((team) => {
    const base = baseByTeam.get(team)
    const selectedPcaIds = Array.from(selectedPcaByTeam.get(team) ?? new Set<string>())
    const preferred_pca_ids =
      selectedPcaIds.length > 0 ? selectedPcaIds : [...(base?.preferred_pca_ids ?? [])]
    const preferred_slots = base?.preferred_slots?.length ? [...base.preferred_slots] : []

    return {
      ...(base ?? {
        id: `__effective_pref_${team}`,
        team,
      }),
      team,
      preferred_pca_ids,
      preferred_slots,
    }
  })
}
