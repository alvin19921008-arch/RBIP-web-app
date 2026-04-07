import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import type { PCAAllocation } from '@/types/schedule'
import type { PCAPreference } from '@/types/allocation'
import type { Team } from '@/types/staff'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { findAvailablePCAs, type StaffOverrideWithSubstitution } from '@/lib/utils/floatingPCAHelpers'

export interface Step3V2TeamReservation {
  slot: number
  pcaIds: string[]
  pcaNames: Record<string, string>
  rankedChoices?: Array<{ slot: number; rank: number; label: string }>
  otherSlots?: number[]
  gymSlot?: number | null
  attentionReason?: 'preferred-pca-misses-highest-feasible-rank'
  recommendedPcaId?: string
  recommendedPcaName?: string
  preferredPcaMayStillHelpLater?: boolean
}

export type Step3V2TeamReservations = Record<Team, Step3V2TeamReservation | null>

export interface Step3V2ReservationPreview {
  teamReservations: Step3V2TeamReservations
  hasAnyReservations: boolean
  summary: {
    teamsChecked: number
    needsAttentionTeams: Team[]
    autoContinueTeams: Team[]
    gymRiskTeams: Team[]
  }
}

export function computeStep3V2ReservationPreview(params: {
  pcaPreferences: PCAPreference[]
  adjustedPendingFTE: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, StaffOverrideWithSubstitution>
}): Step3V2ReservationPreview {
  const { pcaPreferences, adjustedPendingFTE, floatingPCAs, existingAllocations, staffOverrides } = params

  const teamReservations: Step3V2TeamReservations = {
    FO: null,
    SMM: null,
    SFM: null,
    CPPC: null,
    MC: null,
    GMC: null,
    NSM: null,
    DRO: null,
  }

  const summary = {
    teamsChecked: 0,
    needsAttentionTeams: [] as Team[],
    autoContinueTeams: [] as Team[],
    gymRiskTeams: [] as Team[],
  }

  const floatingPcaById = new Map<string, PCAData>()
  floatingPCAs.forEach((pca) => {
    if (!floatingPcaById.has(pca.id)) {
      floatingPcaById.set(pca.id, pca)
    }
  })

  for (const pref of pcaPreferences) {
    const team = pref.team
    if (!pref.preferred_slots || pref.preferred_slots.length === 0) continue

    const pendingFTE = roundToNearestQuarterWithMidpoint(adjustedPendingFTE[team] || 0)
    if (pendingFTE <= 0) continue

    summary.teamsChecked += 1

    const rankedSlots = Array.from(
      new Set((pref.preferred_slots ?? []).filter((slot): slot is 1 | 2 | 3 | 4 => slot >= 1 && slot <= 4))
    )
    const rankedChoices = rankedSlots.map((slot, index) => ({
      slot,
      rank: index + 1,
      label: `${index + 1}${index + 1 === 1 ? 'st' : index + 1 === 2 ? 'nd' : index + 1 === 3 ? 'rd' : 'th'} choice`,
    }))
    const gymSlot = pref.gym_schedule ?? null
    const avoidGym = pref.avoid_gym_schedule ?? false
    const otherSlots = ([1, 2, 3, 4] as const).filter(
      (slot) => !rankedSlots.includes(slot) && (!avoidGym || slot !== gymSlot)
    )

    let selectedSlot: number | null = null
    let feasibleCandidatesForSelectedSlot: PCAData[] = []
    for (const rankedSlot of rankedSlots) {
      if (avoidGym && gymSlot === rankedSlot) continue
      const candidates = findAvailablePCAs({
        pcaPool: floatingPCAs,
        team,
        teamFloor: null,
        floorMatch: 'any',
        excludePreferredOfOtherTeams: false,
        preferredPCAIdsOfOtherTeams: new Map(),
        pendingFTEPerTeam: adjustedPendingFTE,
        requiredSlot: rankedSlot,
        existingAllocations,
        gymSlot: null,
        avoidGym: false,
        staffOverrides,
      })
      if (candidates.length > 0) {
        selectedSlot = rankedSlot
        feasibleCandidatesForSelectedSlot = candidates
        break
      }
    }

    if (selectedSlot == null) {
      summary.autoContinueTeams.push(team)
      continue
    }

    const preferredIds = pref.preferred_pca_ids ?? []
    const preferredCandidateIds = feasibleCandidatesForSelectedSlot
      .map((candidate) => candidate.id)
      .filter((id) => preferredIds.includes(id))

    const pcaNames: Record<string, string> = {}
    feasibleCandidatesForSelectedSlot.forEach((candidate) => {
      pcaNames[candidate.id] = candidate.name
    })

    const needsAttention = preferredCandidateIds.length === 0 && preferredIds.length > 0
    const recommendedCandidate = (() => {
      if (!needsAttention) return null
      const sameFloor = feasibleCandidatesForSelectedSlot.find((candidate) => {
        if (!pref.floor_pca_selection) return false
        const floors = (candidate as any).floor_pca as Array<'upper' | 'lower'> | undefined
        return Array.isArray(floors) && floors.includes(pref.floor_pca_selection)
      })
      return sameFloor ?? feasibleCandidatesForSelectedSlot[0] ?? null
    })()

    const preferredPcaMayStillHelpLater = preferredIds.some((preferredId) => {
      const pca = floatingPcaById.get(preferredId)
      if (!pca || !Array.isArray(pca.availableSlots)) return false
      return rankedSlots.some((slot) => slot !== selectedSlot && pca.availableSlots!.includes(slot))
    })

    const reservationPcaIds =
      preferredCandidateIds.length > 0
        ? preferredCandidateIds
        : recommendedCandidate
          ? [recommendedCandidate.id]
          : feasibleCandidatesForSelectedSlot.map((candidate) => candidate.id)

    if (needsAttention) {
      summary.needsAttentionTeams.push(team)
    } else {
      summary.autoContinueTeams.push(team)
    }

    if (avoidGym && gymSlot != null && selectedSlot === gymSlot) {
      summary.gymRiskTeams.push(team)
    }

    teamReservations[team] = {
      slot: selectedSlot,
      pcaIds: reservationPcaIds,
      pcaNames,
      rankedChoices,
      otherSlots,
      gymSlot,
      attentionReason: needsAttention ? 'preferred-pca-misses-highest-feasible-rank' : undefined,
      recommendedPcaId: recommendedCandidate?.id,
      recommendedPcaName: recommendedCandidate?.name,
      preferredPcaMayStillHelpLater: needsAttention ? preferredPcaMayStillHelpLater : undefined,
    }
  }

  return {
    teamReservations,
    hasAnyReservations: summary.needsAttentionTeams.length > 0,
    summary,
  }
}
