import type { FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import { getTeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '@/types/allocation'
import type { SlotAssignmentLog, TeamAllocationLog } from '@/types/schedule'
import type { Team } from '@/types/staff'

export interface Step34SlotCardViewModel {
  slot: 1 | 2 | 3 | 4
  timeRange: string
  label: string
  category: 'ranked' | 'other' | 'gym'
  resultLabel: string
  detailLabel: string
  assignment: SlotAssignmentLog | null
}

export interface Step34SummaryPillViewModel {
  label: string
  tone?: 'default' | 'muted'
}

export interface Step34TeamDetailViewModel {
  team: Team
  summaryPills: Step34SummaryPillViewModel[]
  slotCards: Step34SlotCardViewModel[]
  reasons: string[]
}

function getTimeRange(slot: 1 | 2 | 3 | 4): string {
  if (slot === 1) return '0900-1030'
  if (slot === 2) return '1030-1200'
  if (slot === 3) return '1330-1500'
  return '1500-1630'
}

function getOrdinalLabel(rank: number): string {
  if (rank === 1) return '1st choice'
  if (rank === 2) return '2nd choice'
  if (rank === 3) return '3rd choice'
  return `${rank}th choice`
}

function getOrdinalShortLabel(rank: number): string {
  if (rank === 1) return '1st'
  if (rank === 2) return '2nd'
  if (rank === 3) return '3rd'
  return `${rank}th`
}

function buildSlotLabel(args: {
  slot: 1 | 2 | 3 | 4
  rankedSlots: number[]
  gymSlot: number | null
}): { label: string; category: 'ranked' | 'other' | 'gym' } {
  const { slot, rankedSlots, gymSlot } = args
  const rankedIndex = rankedSlots.indexOf(slot)
  if (rankedIndex >= 0) {
    return { label: getOrdinalLabel(rankedIndex + 1), category: 'ranked' }
  }
  if (gymSlot === slot) {
    return { label: 'Gym', category: 'gym' }
  }
  return { label: 'Other', category: 'other' }
}

function buildAssignmentResultLabel(assignment: SlotAssignmentLog): string {
  if (assignment.slotSelectionPhase === 'gym-last-resort') {
    return 'Gym last resort'
  }
  if (assignment.pcaSelectionTier === 'preferred') {
    return `Preferred PCA ${assignment.pcaName}`
  }
  if (assignment.pcaSelectionTier === 'floor') {
    return 'Floor PCA fallback'
  }
  if (assignment.slotSelectionPhase === 'unranked-unused') {
    return 'Other slot used'
  }
  if (assignment.slotSelectionPhase === 'ranked-duplicate') {
    return 'Duplicate fallback'
  }
  return `Available PCA ${assignment.pcaName}`
}

function buildAssignmentDetailLabel(assignment: SlotAssignmentLog): string {
  if (assignment.slotSelectionPhase === 'gym-last-resort') {
    return 'Gym used only as last resort'
  }
  if (assignment.slotSelectionPhase === 'ranked-duplicate' || assignment.duplicateSlot) {
    return 'Duplicate floating coverage became necessary'
  }
  if (assignment.slotSelectionPhase === 'unranked-unused') {
    return 'Used an unranked slot before duplicating another slot'
  }
  if (assignment.pcaSelectionTier === 'preferred') {
    return 'Preferred PCA used'
  }
  if (assignment.pcaSelectionTier === 'floor') {
    return assignment.usedContinuity ? 'Floor PCA fallback with continuity' : 'Floor PCA fallback'
  }
  if (assignment.usedContinuity) {
    return 'Continued with the same PCA across useful slots'
  }
  return 'Unused ranked path was available'
}

function buildReasons(args: {
  teamLog: TeamAllocationLog
  slotCards: Step34SlotCardViewModel[]
  rankedSlots: number[]
  gymSlot: number | null
}): string[] {
  const { teamLog, slotCards, rankedSlots, gymSlot } = args
  const reasons: string[] = []

  const topRankCard = slotCards.find((card) => card.assignment?.fulfilledSlotRank === 1)
  if (topRankCard?.assignment) {
    const actor =
      topRankCard.assignment.pcaSelectionTier === 'preferred'
        ? `preferred PCA ${topRankCard.assignment.pcaName}`
        : topRankCard.assignment.pcaSelectionTier === 'floor'
          ? `floor PCA ${topRankCard.assignment.pcaName}`
          : topRankCard.assignment.pcaName
    reasons.push(`${topRankCard.label} ${topRankCard.timeRange} was handled first by ${actor}.`)
  } else if (rankedSlots.length > 0) {
    reasons.push(`${getOrdinalLabel(1)} stayed unfilled in the final review path.`)
  }

  const laterRankCard = slotCards.find(
    (card) => card.assignment && typeof card.assignment.fulfilledSlotRank === 'number' && card.assignment.fulfilledSlotRank > 1
  )
  if (laterRankCard?.assignment) {
    reasons.push(
      `${laterRankCard.label} ${laterRankCard.timeRange} was filled later by ${laterRankCard.assignment.pcaName}.`
    )
  }

  if (teamLog.summary.usedUnrankedSlot) {
    reasons.push('System used another useful slot before duplicating a slot.')
  }

  if (teamLog.summary.usedDuplicateFloatingSlot) {
    reasons.push('Duplicate floating coverage was used only after useful unused slots were exhausted.')
  }

  if (teamLog.summary.gymUsedAsLastResort) {
    reasons.push('Gym was used only because no non-gym path remained.')
  } else if (gymSlot != null) {
    reasons.push('Gym was avoided because a non-gym path remained.')
  }

  if (teamLog.summary.preferredPCAUsed) {
    reasons.push('Preferred PCA stayed helpful, but only after the higher-priority slot path was respected.')
  }

  const continuityUsed = slotCards.some((card) => card.assignment?.usedContinuity)
  if (continuityUsed) {
    reasons.push('Continuity was used only when it supported the next useful slot.')
  }

  if (!teamLog.summary.pendingMet) {
    reasons.push('Pending was not fully met because no further legal slot path remained.')
  }

  return Array.from(new Set(reasons))
}

export function buildStep34TeamDetailViewModel(args: {
  team: Team
  result: FloatingPCAAllocationResultV2
  pcaPreferences: PCAPreference[]
}): Step34TeamDetailViewModel {
  const { team, result, pcaPreferences } = args
  const teamLog = result.tracker[team]
  const pref = getTeamPreferenceInfo(team, pcaPreferences)

  const slotCards: Step34SlotCardViewModel[] = ([1, 2, 3, 4] as const).map((slot) => {
    const meta = buildSlotLabel({
      slot,
      rankedSlots: pref.rankedSlots,
      gymSlot: pref.gymSlot,
    })
    const assignment = teamLog.assignments.find((entry) => entry.slot === slot) ?? null

    if (!assignment) {
      return {
        slot,
        timeRange: getTimeRange(slot),
        label: meta.label,
        category: meta.category,
        resultLabel: meta.category === 'gym' ? 'Not used' : 'Unused',
        detailLabel: meta.category === 'gym' ? 'Gym avoided' : 'No final assignment',
        assignment: null,
      }
    }

    return {
      slot,
      timeRange: getTimeRange(slot),
      label: meta.label,
      category: meta.category,
      resultLabel: buildAssignmentResultLabel(assignment),
      detailLabel: buildAssignmentDetailLabel(assignment),
      assignment,
    }
  })

  const summaryPills: Step34SummaryPillViewModel[] = [
    {
      label: teamLog.summary.pendingMet ? 'Pending met' : 'Pending not fully met',
      tone: teamLog.summary.pendingMet ? 'default' : 'muted',
    },
    {
      label:
        typeof teamLog.summary.highestRankedSlotFulfilled === 'number'
          ? `Highest choice fulfilled: ${getOrdinalShortLabel(teamLog.summary.highestRankedSlotFulfilled)}`
          : 'Highest choice fulfilled: none',
    },
    {
      label: teamLog.summary.preferredPCAUsed ? 'Preferred PCA used' : 'Preferred PCA not used',
      tone: teamLog.summary.preferredPCAUsed ? 'default' : 'muted',
    },
    {
      label: teamLog.summary.gymUsedAsLastResort ? 'Gym used only as last resort' : 'Gym avoided',
      tone: teamLog.summary.gymUsedAsLastResort ? 'muted' : 'default',
    },
  ]

  return {
    team,
    summaryPills,
    slotCards,
    reasons: buildReasons({
      teamLog,
      slotCards,
      rankedSlots: pref.rankedSlots,
      gymSlot: pref.gymSlot,
    }),
  }
}
