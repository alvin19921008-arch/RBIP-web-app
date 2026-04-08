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

function getOrdinalShortLabel(rank: number): string {
  if (rank === 1) return '1st'
  if (rank === 2) return '2nd'
  if (rank === 3) return '3rd'
  return `${rank}th`
}

function getRankedSlotTileLabel(rank: number): string {
  return `Ranked slot ${getOrdinalShortLabel(rank)}`
}

function buildSlotLabel(args: {
  slot: 1 | 2 | 3 | 4
  rankedSlots: number[]
  gymSlot: number | null
}): { label: string; category: 'ranked' | 'other' | 'gym' } {
  const { slot, rankedSlots, gymSlot } = args
  const rankedIndex = rankedSlots.indexOf(slot)
  if (rankedIndex >= 0) {
    return { label: getRankedSlotTileLabel(rankedIndex + 1), category: 'ranked' }
  }
  if (gymSlot === slot) {
    return { label: 'Gym slot', category: 'gym' }
  }
  return { label: 'Unranked slot', category: 'other' }
}

function displayPcaName(assignment: SlotAssignmentLog): string {
  const name = assignment.pcaName?.trim()
  return name && name.length > 0 ? name : 'PCA'
}

function buildAssignmentResultLabel(assignment: SlotAssignmentLog): string {
  const who = displayPcaName(assignment)
  if (assignment.slotSelectionPhase === 'gym-last-resort') {
    return `Gym last resort · ${who}`
  }
  if (assignment.pcaSelectionTier === 'preferred') {
    return `Preferred PCA ${who}`
  }
  if (assignment.pcaSelectionTier === 'floor') {
    return `Floor PCA · ${who}`
  }
  if (assignment.slotSelectionPhase === 'unranked-unused') {
    return `Unranked slot · ${who}`
  }
  if (assignment.slotSelectionPhase === 'ranked-duplicate') {
    return `Duplicate coverage · ${who}`
  }
  return `Available PCA ${who}`
}

function buildAssignmentDetailLabel(assignment: SlotAssignmentLog): string {
  const who = displayPcaName(assignment)
  if (assignment.slotSelectionPhase === 'gym-last-resort') {
    return `Gym used only as last resort (${who})`
  }
  if (assignment.slotSelectionPhase === 'ranked-duplicate' || assignment.duplicateSlot) {
    return `Duplicate floating coverage became necessary (${who})`
  }
  if (assignment.slotSelectionPhase === 'unranked-unused') {
    return `Used an unranked slot with ${who} before duplicating another slot`
  }
  if (assignment.pcaSelectionTier === 'preferred') {
    return `Preferred PCA ${who} used`
  }
  if (assignment.pcaSelectionTier === 'floor') {
    return assignment.usedContinuity
      ? `Floor PCA ${who} with continuity`
      : `Floor PCA ${who}`
  }
  if (assignment.usedContinuity) {
    return `Continued with ${who} across useful slots`
  }
  return `Unused ranked path was available (${who})`
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
    reasons.push(`${getRankedSlotTileLabel(1)} stayed unfilled in the final review path.`)
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
          ? `Highest ranked slot fulfilled: ${getOrdinalShortLabel(teamLog.summary.highestRankedSlotFulfilled)}`
          : 'Highest ranked slot fulfilled: none',
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
