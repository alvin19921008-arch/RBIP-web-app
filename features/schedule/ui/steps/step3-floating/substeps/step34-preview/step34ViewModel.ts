import type { FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import { formatB1DonationStep34Line } from '@/lib/features/schedule/b1DonationProvenanceUi'
import { formatGymBlockedDuplicateReliefUserMessage } from '@/lib/features/schedule/gymBlockedDuplicateReliefUi'
import { getQualifyingDuplicateFloatingAssignmentsForSlot } from '@/lib/features/schedule/duplicateFloatingSemantics'
import {
  V2_GYM_UI_AVOIDANCE_REPAIR_APPLIED,
  V2_GYM_UI_UNAVOIDABLE_GYM_LONG,
  v2GymLastResortResultLineWithActor,
  v2GymUnavoidableDetailWithActor,
} from '@/lib/features/schedule/v2GymUiStrings'
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
  /**
   * When true, render as an indented sub-point (e.g. gym-blocked duplicate under the parent duplicate
   * line, or under the “pending not cleared” line for the recipient).
   */
  indentSubpoint?: boolean
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

function buildDuplicateFloatingReasonLines(args: {
  team: Team
  teamLog: TeamAllocationLog
  rankedSlots: number[]
  gymSlot: number | null
  staffOverrides?: Record<string, any>
}): Step34ReasonLine[] {
  const { team, teamLog, staffOverrides } = args
  const lines: Step34ReasonLine[] = []
  const gymBlocks = teamLog.summary.gymBlockedDuplicateRelief ?? []
  for (const slot of [1, 2, 3, 4] as const) {
    const logsForSlot = teamLog.assignments.filter((a) => a.slot === slot)
    const qualifying = getQualifyingDuplicateFloatingAssignmentsForSlot({
      team,
      slot,
      logsForSlot,
      staffOverrides,
    })
    if (qualifying.length < 2) continue
    const timeRange = getTimeRange(slot)
    lines.push({
      text: `${timeRange} — ${qualifying.length} floating PCAs, only after other usable slots were tried.`,
    })
    for (const e of gymBlocks) {
      if (e.duplicateTeam === team && e.slot === slot) {
        lines.push({ text: formatGymBlockedDuplicateReliefUserMessage(e), indentSubpoint: true })
      }
    }
  }
  return lines
}

function buildAssignmentResultLabel(assignment: SlotAssignmentLog): string {
  const who = displayPcaName(assignment)
  if (assignment.allocationStage === 'repair' && assignment.repairReason === 'gym-avoidance') {
    return `${V2_GYM_UI_AVOIDANCE_REPAIR_APPLIED} · ${who}`
  }
  if (assignment.slotSelectionPhase === 'gym-last-resort') {
    return v2GymLastResortResultLineWithActor(who)
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
    return v2GymUnavoidableDetailWithActor(who)
  }

  if (assignment.allocationStage === 'repair' && assignment.repairReason === 'gym-avoidance') {
    return V2_GYM_UI_AVOIDANCE_REPAIR_APPLIED
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
    return `Unranked slot used with ${who}`
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
    return `Continued with ${who} across slots`
  }
  return `Unused ranked path was available (${who})`
}

function buildPreferredPcaReasonText(teamLog: TeamAllocationLog, rankedSlots: number[]): string | null {
  const rows = teamLog.assignments.filter((a) => a.pcaSelectionTier === 'preferred')
  if (rows.length === 0) return null
  const lowerOrUnranked = rows.find((a) => {
    const rank = a.fulfilledSlotRank
    if (typeof rank === 'number' && rank > 1) return true
    if (a.slotSelectionPhase === 'unranked-unused') return true
    const slot = a.slot as 1 | 2 | 3 | 4
    if (rankedSlots.length > 0 && !rankedSlots.includes(slot)) return true
    return false
  })
  const subject = lowerOrUnranked ?? rows[0]
  const name = displayPcaName(subject)
  if (lowerOrUnranked) {
    return `Preferred PCA ${name} on a lower-ranked or unranked slot — higher-ranked slots were still filled first.`
  }
  return `Preferred PCA ${name} on the ranked path.`
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

  const duplicateFloatingReasonLines = buildDuplicateFloatingReasonLines({
    team,
    teamLog,
    rankedSlots,
    gymSlot,
    staffOverrides,
  })

  if (teamLog.summary.usedUnrankedSlot && duplicateFloatingReasonLines.length === 0) {
    reasons.push({ text: 'An unranked slot was used.' })
  }

  for (const line of duplicateFloatingReasonLines) {
    reasons.push(line)
  }

  for (const d of teamLog.summary.b1DonationOutcomes ?? []) {
    reasons.push({ text: formatB1DonationStep34Line(d) })
  }

  if (avoidGym) {
    if (resolveFinalGymUsageStatus(teamLog.summary) === 'used-last-resort') {
      reasons.push({ text: V2_GYM_UI_UNAVOIDABLE_GYM_LONG })
    }
  }

  if (teamLog.summary.preferredPCAUsed) {
    reasons.push({
      text:
        buildPreferredPcaReasonText(teamLog, rankedSlots) ??
        'Preferred PCA contributed to floating cover after higher-ranked slots were covered.',
    })
  }

  const extraCoverageRows = teamLog.assignments.filter(
    (a) => a.assignedIn === 'step34' && a.allocationStage === 'extra-coverage'
  )
  if (extraCoverageRows.length > 0) {
    const n = extraCoverageRows.length
    reasons.push({
      text: `Extra after needs: ${n} slot(s) added — every team's required floating was already satisfied.`,
      tone: 'extra-after-needs',
      extraAfterNeedsCount: n,
    })
  }

  const continuityUsed = slotCards.some((card) => card.assignment?.usedContinuity)
  if (continuityUsed) {
    reasons.push({ text: 'Same floating PCA continued across slots, where rules allowed.' })
  }

  if (!teamLog.summary.pendingMet) {
    reasons.push({ text: 'Pending floating not fully cleared — no eligible floating PCA left.' })
    for (const e of teamLog.summary.gymBlockedDuplicateRelief ?? []) {
      if (e.recipientTeam === team && e.duplicateTeam !== team) {
        reasons.push({ text: formatGymBlockedDuplicateReliefUserMessage(e), indentSubpoint: true })
      }
    }
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
