import type { FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import { getQualifyingDuplicateFloatingAssignmentsForSlot } from '@/lib/features/schedule/duplicateFloatingSemantics'
import { getTeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '@/types/allocation'
import type { GymUsageStatus, SlotAssignmentLog, TeamAllocationLog } from '@/types/schedule'
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

export type Step34ReasonTone = 'default' | 'extra-after-needs'

export interface Step34ReasonLine {
  text: string
  tone?: Step34ReasonTone
  /** With `tone: 'extra-after-needs'`, row count for violet emphasis in the dialog. */
  extraAfterNeedsCount?: number
}

export interface Step34TeamDetailViewModel {
  team: Team
  summaryPills: Step34SummaryPillViewModel[]
  slotCards: Step34SlotCardViewModel[]
  reasons: Step34ReasonLine[]
}

function resolveFinalGymUsageStatus(summary: TeamAllocationLog['summary']): GymUsageStatus {
  return summary.gymUsageStatus ?? (summary.gymUsedAsLastResort ? 'used-last-resort' : 'avoided')
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
  return `${getOrdinalShortLabel(rank)} ranked slot`
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

const DUPLICATE_FLOATING_REASON_SUFFIX =
  'only after every other usable slot was tried but without available floating PCA'

function buildDuplicateFloatingReasonLines(args: {
  team: Team
  teamLog: TeamAllocationLog
  rankedSlots: number[]
  gymSlot: number | null
  staffOverrides?: Record<string, any>
}): string[] {
  const { team, teamLog, rankedSlots, gymSlot, staffOverrides } = args
  const lines: string[] = []
  for (const slot of [1, 2, 3, 4] as const) {
    const logsForSlot = teamLog.assignments.filter((a) => a.slot === slot)
    const qualifying = getQualifyingDuplicateFloatingAssignmentsForSlot({
      team,
      slot,
      logsForSlot,
      staffOverrides,
    })
    if (qualifying.length < 2) continue
    const meta = buildSlotLabel({ slot, rankedSlots, gymSlot })
    lines.push(
      `${qualifying.length} floating PCAs were assigned to ${meta.label} (${getTimeRange(slot)}), ${DUPLICATE_FLOATING_REASON_SUFFIX}.`
    )
  }
  return lines
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
  return `Available PCA ${who}`
}

function buildAssignmentResultLabelForSlot(
  primary: SlotAssignmentLog,
  allForSlot: SlotAssignmentLog[],
  team: Team,
  staffOverrides?: Record<string, any>
): string {
  const slot = primary.slot as 1 | 2 | 3 | 4
  const qualifying = getQualifyingDuplicateFloatingAssignmentsForSlot({
    team,
    slot,
    logsForSlot: allForSlot,
    staffOverrides,
  })
  if (qualifying.length >= 2) {
    return `Duplicate floating coverage · ${qualifying.map(displayPcaName).join(' · ')}`
  }
  if (primary.slotSelectionPhase === 'ranked-duplicate' || primary.duplicateSlot === true) {
    return displayPcaName(primary)
  }
  return buildAssignmentResultLabel(primary)
}

function buildAssignmentDetailLabel(
  assignment: SlotAssignmentLog,
  allForSlot: SlotAssignmentLog[],
  team: Team,
  staffOverrides?: Record<string, any>
): string {
  const who = displayPcaName(assignment)
  const slot = assignment.slot as 1 | 2 | 3 | 4
  const qualifying = getQualifyingDuplicateFloatingAssignmentsForSlot({
    team,
    slot,
    logsForSlot: allForSlot,
    staffOverrides,
  })

  if (assignment.slotSelectionPhase === 'gym-last-resort') {
    return `Gym used only as last resort (${who})`
  }

  const algorithmSaysStacked =
    assignment.slotSelectionPhase === 'ranked-duplicate' ||
    assignment.duplicateSlot === true

  if (qualifying.length >= 2) {
    return `${qualifying.length} floating PCAs were assigned to this slot.`
  }

  if (algorithmSaysStacked) {
    return 'To fulfill pending FTE.'
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

function dedupeReasonLines(lines: Step34ReasonLine[]): Step34ReasonLine[] {
  const byText = new Map<string, Step34ReasonLine>()
  for (const line of lines) {
    const prev = byText.get(line.text)
    if (!prev) {
      byText.set(line.text, line)
      continue
    }
    if (prev.tone !== 'extra-after-needs' && line.tone === 'extra-after-needs') {
      byText.set(line.text, line)
    }
  }
  return [...byText.values()]
}

function buildReasons(args: {
  team: Team
  teamLog: TeamAllocationLog
  slotCards: Step34SlotCardViewModel[]
  rankedSlots: number[]
  gymSlot: number | null
  avoidGym: boolean
  staffOverrides?: Record<string, any>
}): Step34ReasonLine[] {
  const { team, teamLog, slotCards, rankedSlots, gymSlot, avoidGym, staffOverrides } = args
  const reasons: Step34ReasonLine[] = []

  const topRankCard = slotCards.find((card) => card.assignment?.fulfilledSlotRank === 1)
  if (topRankCard?.assignment) {
    const actor =
      topRankCard.assignment.pcaSelectionTier === 'preferred'
        ? `preferred PCA ${topRankCard.assignment.pcaName}`
        : topRankCard.assignment.pcaSelectionTier === 'floor'
          ? `floor PCA ${topRankCard.assignment.pcaName}`
          : topRankCard.assignment.pcaName
    reasons.push({ text: `${topRankCard.label} ${topRankCard.timeRange} was handled first by ${actor}.` })
  } else if (rankedSlots.length > 0) {
    const first = rankedSlots[0]
    if (first === 1 || first === 2 || first === 3 || first === 4) {
      reasons.push({
        text: `${getRankedSlotTileLabel(1)} (${getTimeRange(first)}) stayed unfilled in the final review path.`,
      })
    } else {
      reasons.push({ text: `${getRankedSlotTileLabel(1)} stayed unfilled in the final review path.` })
    }
  }

  const laterRankCard = slotCards.find(
    (card) => card.assignment && typeof card.assignment.fulfilledSlotRank === 'number' && card.assignment.fulfilledSlotRank > 1
  )
  if (laterRankCard?.assignment) {
    reasons.push({
      text: `${laterRankCard.label} ${laterRankCard.timeRange} was filled later by ${laterRankCard.assignment.pcaName}.`,
    })
  }

  if (teamLog.summary.usedUnrankedSlot) {
    reasons.push({ text: 'System used another useful slot before duplicating a slot.' })
  }

  for (const line of buildDuplicateFloatingReasonLines({
    team,
    teamLog,
    rankedSlots,
    gymSlot,
    staffOverrides,
  })) {
    reasons.push({ text: line })
  }

  if (avoidGym) {
    if (resolveFinalGymUsageStatus(teamLog.summary) === 'used-last-resort') {
      reasons.push({ text: 'Gym was used only because no non-gym path remained.' })
    } else if (gymSlot === 1 || gymSlot === 2 || gymSlot === 3 || gymSlot === 4) {
      reasons.push({
        text: `Gym slot (${getTimeRange(gymSlot)}) was not used because pending could still be covered using other slots first.`,
      })
    }
  }

  if (teamLog.summary.preferredPCAUsed) {
    reasons.push({
      text: 'Preferred PCA stayed helpful, but only after the higher-priority slot path was respected.',
    })
  }

  const extraCoverageRows = teamLog.assignments.filter(
    (a) => a.assignedIn === 'step34' && a.allocationStage === 'extra-coverage'
  )
  if (extraCoverageRows.length > 0) {
    const n = extraCoverageRows.length
    reasons.push({
      text: `This team has ${n} Step 3.4 ${n === 1 ? 'row' : 'rows'} from Extra after needs (required floating need was already satisfied).`,
      tone: 'extra-after-needs',
      extraAfterNeedsCount: n,
    })
  }

  const continuityUsed = slotCards.some((card) => card.assignment?.usedContinuity)
  if (continuityUsed) {
    reasons.push({ text: 'Continuity was used only when it supported the next useful slot.' })
  }

  if (!teamLog.summary.pendingMet) {
    reasons.push({ text: 'Pending was not fully met because no further legal slot path remained.' })
  }

  return dedupeReasonLines(reasons)
}

export function buildStep34TeamDetailViewModel(args: {
  team: Team
  result: FloatingPCAAllocationResultV2
  pcaPreferences: PCAPreference[]
  staffOverrides?: Record<string, any>
}): Step34TeamDetailViewModel {
  const { team, result, pcaPreferences, staffOverrides } = args
  const teamLog = result.tracker[team]
  const pref = getTeamPreferenceInfo(team, pcaPreferences)

  const slotCards: Step34SlotCardViewModel[] = ([1, 2, 3, 4] as const).map((slot) => {
    const meta = buildSlotLabel({
      slot,
      rankedSlots: pref.rankedSlots,
      gymSlot: pref.gymSlot,
    })
    const logsForSlot = teamLog.assignments.filter((entry) => entry.slot === slot)
    const step34ForSlot = logsForSlot.filter((e) => e.assignedIn === 'step34')
    const primary =
      [...step34ForSlot].reverse().find((e) => e.slotSelectionPhase === 'ranked-duplicate' || e.duplicateSlot) ??
      step34ForSlot[step34ForSlot.length - 1] ??
      logsForSlot[logsForSlot.length - 1] ??
      null

    if (!primary) {
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
      resultLabel: buildAssignmentResultLabelForSlot(primary, logsForSlot, team, staffOverrides),
      detailLabel: buildAssignmentDetailLabel(primary, logsForSlot, team, staffOverrides),
      assignment: primary,
    }
  })

  const highestRankedSlotFulfilledLabel = (() => {
    if (pref.rankedSlots.length === 0) return null
    const fulfilledRank = teamLog.summary.highestRankedSlotFulfilled
    if (typeof fulfilledRank !== 'number' || !Number.isFinite(fulfilledRank) || fulfilledRank < 1) {
      return 'Highest ranked slot fulfilled: none'
    }
    const slot = pref.rankedSlots[fulfilledRank - 1]
    if (slot !== 1 && slot !== 2 && slot !== 3 && slot !== 4) {
      return 'Highest ranked slot fulfilled: none'
    }
    return `Highest ranked slot fulfilled: ${getTimeRange(slot)}`
  })()

  const summaryPills: Step34SummaryPillViewModel[] = [
    ...(highestRankedSlotFulfilledLabel
      ? [{ label: highestRankedSlotFulfilledLabel, tone: 'default' as const }]
      : []),
  ]

  const reasons = buildReasons({
    team,
    teamLog,
    slotCards,
    rankedSlots: pref.rankedSlots,
    gymSlot: pref.gymSlot,
    avoidGym: pref.avoidGym,
    staffOverrides,
  })

  return {
    team,
    summaryPills,
    slotCards,
    reasons,
  }
}
