import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import type { PCAAllocation } from '@/types/schedule'
import type { PCAPreference } from '@/types/allocation'
import type { Team } from '@/types/staff'
import { TEAMS, findAvailablePCAs, getTeamPreferenceInfo, isFloorPCAForTeam, type StaffOverrideWithSubstitution } from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import {
  getOutcomeSummaryLines,
  getStep32LaterOutcomeTitle,
  getStep32RecommendedContinuityOutcomeTitle,
  getStep32SaveEffectLabel,
  getTradeoffMessage,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewCopy'

export type Step32PreferredAvailability = 'rank-1' | 'later-ranked' | 'unranked' | 'unavailable'

export interface Step32PreferredPcaStatus {
  id: string
  name: string
  availability: Step32PreferredAvailability
  detail: string
}

export type Step32ReviewState = 'not_applicable' | 'matched' | 'alternative' | 'unavailable'
export type Step32CommitState = 'showable' | 'committable' | 'committable_with_tradeoff' | 'blocked'
export type Step32TradeoffKind = 'continuity' | 'other'

export interface Step32ScenarioSummary {
  recommendedLabel: string
  preferredOutcomeLabel: string | null
  rankProtectionLabel: string
  fallbackLabel: string | null
  tradeoff: Step32TradeoffKind | null
  saveEffect: string
}

export interface Step32PathOption {
  pathKey: string
  kind: 'ranked' | 'unranked' | 'gym'
  slot: 1 | 2 | 3 | 4
  timeRange: string
  rank?: number
  isEarliestFeasiblePath: boolean
  preferredCandidates: Array<{ id: string; name: string }>
  floorCandidates: Array<{ id: string; name: string }>
  nonFloorCandidates: Array<{ id: string; name: string }>
  systemSuggestedPcaId?: string
  systemSuggestedPcaName?: string
  pathState: 'preferred_available' | 'system_only' | 'unavailable'
  commitState: Step32CommitState
  tradeoffKind?: Step32TradeoffKind
  note?: string
}

export interface Step32OutcomeRow {
  slot: 1 | 2 | 3 | 4
  timeRange: string
  pcaLabel: string
  pcaKind: 'preferred' | 'floor' | 'non_floor'
}

export interface Step32OutcomeOption {
  outcomeKey: string
  title: string
  primaryPathKey: string
  rows: Step32OutcomeRow[]
  summaryLines: string[]
  commitState: Step32CommitState
  tradeoffKind?: Step32TradeoffKind
  isSystemRecommended: boolean
}

export interface Step32TeamReview {
  team: Team
  reviewApplies: boolean
  reviewState: Step32ReviewState
  preferenceCondition: 'A' | 'B' | 'C' | 'D'
  pending: number
  assignedSoFar: number
  preferredPcaIds: string[]
  preferredPcaNames: Record<string, string>
  rankedChoices: Array<{ slot: number; rank: number; label: string }>
  unrankedChoices: Array<{ slot: number; label: string }>
  gymChoice: { slot: number; label: string } | null
  systemSuggestedPathKey: string | null
  systemSuggestedPcaId: string | null
  systemSuggestedPcaName: string | null
  pathOptions: Step32PathOption[]
  outcomeOptions: Step32OutcomeOption[]
  slot: number | null
  pcaIds: string[]
  pcaNames: Record<string, string>
  otherSlots: number[]
  gymSlot: number | null
  attentionReason?: 'preferred-pca-misses-highest-feasible-rank'
  recommendedPcaId: string | null
  recommendedPcaName: string | null
  preferredPcaMayStillHelpLater: boolean
  preferredPcaStatuses: Step32PreferredPcaStatus[]
  primaryScenario: Step32ScenarioSummary | null
}

export interface Step32PreferredReviewSummary {
  reviewableTeamCount: number
  matchedTeamCount: number
  alternativeTeamCount: number
  unavailableTeamCount: number
  notApplicableTeamCount: number
  reviewableTeams: Team[]
  matchedTeams: Team[]
  alternativeTeams: Team[]
  unavailableTeams: Team[]
  notApplicableTeams: Team[]
  teamsChecked: number
  needsAttentionTeams: Team[]
  autoContinueTeams: Team[]
  gymRiskTeams: Team[]
}

export interface Step32PreferredReviewPreview {
  teamReviews: Record<Team, Step32TeamReview>
  teamReservations: Record<Team, Step32TeamReview>
  summary: Step32PreferredReviewSummary
  hasAnyReviews: boolean
  hasAnyReservations: boolean
}

export function getStep32PathKey(kind: 'ranked' | 'unranked' | 'gym', slot: 1 | 2 | 3 | 4): string {
  return `${kind}:${slot}`
}

function formatStep32TimeRange(slot: 1 | 2 | 3 | 4): string {
  if (slot === 1) return '0900-1030'
  if (slot === 2) return '1030-1200'
  if (slot === 3) return '1330-1500'
  return '1500-1630'
}

function getOrdinalLabel(position: number): string {
  if (position === 1) return '1st'
  if (position === 2) return '2nd'
  if (position === 3) return '3rd'
  return `${position}th`
}

function getPcaDisplayName(pca: PCAData | undefined, fallbackId: string): string {
  const name = pca?.name?.trim()
  return name && name.length > 0 ? name : fallbackId
}

function createEmptySummary(): Step32PreferredReviewSummary {
  return {
    reviewableTeamCount: 0,
    matchedTeamCount: 0,
    alternativeTeamCount: 0,
    unavailableTeamCount: 0,
    notApplicableTeamCount: 0,
    reviewableTeams: [],
    matchedTeams: [],
    alternativeTeams: [],
    unavailableTeams: [],
    notApplicableTeams: [],
    teamsChecked: 0,
    needsAttentionTeams: [],
    autoContinueTeams: [],
    gymRiskTeams: [],
  }
}

function createPreferredReviewState(
  team: Team,
  reviewState: Step32ReviewState,
  preferenceCondition: 'A' | 'B' | 'C' | 'D',
  pending: number,
  assignedSoFar: number
): Step32TeamReview {
  return {
    team,
    reviewApplies: false,
    reviewState,
    preferenceCondition,
    pending,
    assignedSoFar,
    preferredPcaIds: [],
    preferredPcaNames: {},
    rankedChoices: [],
    unrankedChoices: [],
    gymChoice: null,
    systemSuggestedPathKey: null,
    systemSuggestedPcaId: null,
    systemSuggestedPcaName: null,
    pathOptions: [],
    outcomeOptions: [],
    slot: null,
    pcaIds: [],
    pcaNames: {},
    otherSlots: [],
    gymSlot: null,
    recommendedPcaId: null,
    recommendedPcaName: null,
    preferredPcaMayStillHelpLater: false,
    preferredPcaStatuses: [],
    primaryScenario: null,
  }
}

function createRankLabel(rank: number): string {
  return `${getOrdinalLabel(rank)} choice`
}

function buildPreferredPcaNames(
  preferredPcaIds: string[],
  floatingPcaById: Map<string, PCAData>
): Record<string, string> {
  const names: Record<string, string> = {}
  for (const pcaId of preferredPcaIds) {
    names[pcaId] = getPcaDisplayName(floatingPcaById.get(pcaId), pcaId)
  }
  return names
}

function buildPathDescriptors(pref: ReturnType<typeof getTeamPreferenceInfo>): Array<{
  kind: 'ranked' | 'unranked' | 'gym'
  slot: 1 | 2 | 3 | 4
  rank?: number
}> {
  const descriptors: Array<{ kind: 'ranked' | 'unranked' | 'gym'; slot: 1 | 2 | 3 | 4; rank?: number }> = []

  pref.rankedSlots.forEach((slot, index) => {
    descriptors.push({ kind: 'ranked', slot: slot as 1 | 2 | 3 | 4, rank: index + 1 })
  })

  if (pref.gymSlot != null && !pref.avoidGym && !pref.rankedSlots.includes(pref.gymSlot)) {
    descriptors.push({ kind: 'gym', slot: pref.gymSlot as 1 | 2 | 3 | 4 })
  }

  for (const slot of pref.unrankedNonGymSlots) {
    if (!pref.avoidGym && pref.gymSlot === slot) continue
    descriptors.push({ kind: 'unranked', slot: slot as 1 | 2 | 3 | 4 })
  }

  return descriptors
}

function bucketCandidates(
  candidates: PCAData[],
  preferredPcaIds: string[],
  teamFloor: 'upper' | 'lower' | null
): {
  preferredCandidates: Array<{ id: string; name: string }>
  floorCandidates: Array<{ id: string; name: string }>
  nonFloorCandidates: Array<{ id: string; name: string }>
  candidateLookup: Map<string, { id: string; name: string; bucket: 'preferred' | 'floor' | 'non_floor' }>
} {
  const preferredIdSet = new Set(preferredPcaIds)
  const preferredCandidates: Array<{ id: string; name: string }> = []
  const floorCandidates: Array<{ id: string; name: string }> = []
  const nonFloorCandidates: Array<{ id: string; name: string }> = []
  const candidateLookup = new Map<string, { id: string; name: string; bucket: 'preferred' | 'floor' | 'non_floor' }>()

  const ordered = [...candidates].sort((a, b) => {
    const aName = (a.name ?? a.id).trim()
    const bName = (b.name ?? b.id).trim()
    const nameDiff = aName.localeCompare(bName)
    if (nameDiff !== 0) return nameDiff
    return a.id.localeCompare(b.id)
  })

  for (const pca of ordered) {
    const id = pca.id
    const name = getPcaDisplayName(pca, id)
    if (preferredIdSet.has(id)) {
      preferredCandidates.push({ id, name })
      candidateLookup.set(id, { id, name, bucket: 'preferred' })
      continue
    }

    const isFloor = isFloorPCAForTeam(pca as PCAData & { floor_pca?: ('upper' | 'lower')[] | null }, teamFloor)
    if (isFloor) {
      floorCandidates.push({ id, name })
      candidateLookup.set(id, { id, name, bucket: 'floor' })
      continue
    }

    nonFloorCandidates.push({ id, name })
    candidateLookup.set(id, { id, name, bucket: 'non_floor' })
  }

  return { preferredCandidates, floorCandidates, nonFloorCandidates, candidateLookup }
}

function pickSystemSuggestedCandidate(buckets: {
  preferredCandidates: Array<{ id: string; name: string }>
  floorCandidates: Array<{ id: string; name: string }>
  nonFloorCandidates: Array<{ id: string; name: string }>
}): { id: string; name: string } | null {
  if (buckets.preferredCandidates.length > 0) return buckets.preferredCandidates[0] ?? null
  if (buckets.floorCandidates.length > 0) return buckets.floorCandidates[0] ?? null
  if (buckets.nonFloorCandidates.length > 0) return buckets.nonFloorCandidates[0] ?? null
  return null
}

function buildPathOptionData(args: {
  descriptor: { kind: 'ranked' | 'unranked' | 'gym'; slot: 1 | 2 | 3 | 4; rank?: number }
  pref: ReturnType<typeof getTeamPreferenceInfo>
  adjustedPendingFTE: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, StaffOverrideWithSubstitution>
}): {
  option: Step32PathOption
  candidateLookup: Map<string, { id: string; name: string; bucket: 'preferred' | 'floor' | 'non_floor' }>
} {
  const { descriptor, pref, adjustedPendingFTE, floatingPCAs, existingAllocations, staffOverrides } = args
  const candidates = findAvailablePCAs({
    pcaPool: floatingPCAs,
    team: pref.team,
    teamFloor: pref.teamFloor,
    floorMatch: 'any',
    excludePreferredOfOtherTeams: false,
    preferredPCAIdsOfOtherTeams: new Map(),
    pendingFTEPerTeam: adjustedPendingFTE,
    requiredSlot: descriptor.slot,
    existingAllocations,
    gymSlot: pref.gymSlot ?? null,
    avoidGym: pref.avoidGym,
    staffOverrides,
  })

  const buckets = bucketCandidates(candidates, pref.preferredPCAIds, pref.teamFloor)
  const systemSuggested = pickSystemSuggestedCandidate(buckets)
  const pathState: Step32PathOption['pathState'] =
    buckets.preferredCandidates.length > 0 ? 'preferred_available' : candidates.length > 0 ? 'system_only' : 'unavailable'

  const option: Step32PathOption = {
    pathKey: getStep32PathKey(descriptor.kind, descriptor.slot),
    kind: descriptor.kind,
    slot: descriptor.slot,
    timeRange: formatStep32TimeRange(descriptor.slot),
    rank: descriptor.rank,
    isEarliestFeasiblePath: false,
    preferredCandidates: buckets.preferredCandidates,
    floorCandidates: buckets.floorCandidates,
    nonFloorCandidates: buckets.nonFloorCandidates,
    systemSuggestedPcaId: systemSuggested?.id,
    systemSuggestedPcaName: systemSuggested?.name,
    pathState,
    commitState: pathState === 'unavailable' ? 'blocked' : 'showable',
  }

  return { option, candidateLookup: buckets.candidateLookup }
}

function getPreferredAvailabilityForPca(args: {
  preferredPcaId: string
  pathData: Array<{
    option: Step32PathOption
    candidateLookup: Map<string, { id: string; name: string; bucket: 'preferred' | 'floor' | 'non_floor' }>
  }>
}): Step32PreferredAvailability {
  let onRank1 = false
  let onLaterRank = false
  let onUnranked = false
  let onGym = false

  for (const { option, candidateLookup } of args.pathData) {
    if (option.pathState === 'unavailable') continue
    if (!candidateLookup.has(args.preferredPcaId)) continue
    if (option.kind === 'ranked') {
      const r = option.rank ?? 0
      if (r === 1) onRank1 = true
      else if (r > 1) onLaterRank = true
    } else if (option.kind === 'unranked') {
      onUnranked = true
    } else if (option.kind === 'gym') {
      onGym = true
    }
  }

  if (onRank1) return 'rank-1'
  if (onLaterRank) return 'later-ranked'
  if (onUnranked || onGym) return 'unranked'
  return 'unavailable'
}

function preferredAvailabilityDetail(kind: Step32PreferredAvailability): string {
  if (kind === 'rank-1') return 'Feasible on your 1st ranked slot.'
  if (kind === 'later-ranked') return 'Feasible on a lower ranked slot, not on rank #1.'
  if (kind === 'unranked') return 'Feasible only on an unranked slot.'
  return 'No feasible path lists this PCA.'
}

function buildAlternativePrimaryScenario(args: {
  reviewState: Step32ReviewState
  hasLaterPreferred: boolean
}): Step32ScenarioSummary | null {
  if (args.reviewState !== 'alternative' || !args.hasLaterPreferred) return null
  return {
    recommendedLabel: 'Floor fills rank #1 and continues to rank #2',
    preferredOutcomeLabel: 'Preferred can still take a later ranked slot',
    rankProtectionLabel: 'Rank #1 stays protected',
    fallbackLabel: 'If no preferred PCA is available, Step 3.4 keeps the system fallback path.',
    tradeoff: 'continuity',
    saveEffect: getStep32SaveEffectLabel(),
  }
}

function buildOutcomeRowsForPcaAcrossPaths(args: {
  pathData: Array<{
    option: Step32PathOption
    candidateLookup: Map<string, { id: string; name: string; bucket: 'preferred' | 'floor' | 'non_floor' }>
  }>
  pcaId: string
}): Step32OutcomeRow[] {
  const rows: Step32OutcomeRow[] = []
  for (const entry of args.pathData) {
    const candidate = entry.candidateLookup.get(args.pcaId)
    if (!candidate) continue
    rows.push({
      slot: entry.option.slot,
      timeRange: entry.option.timeRange,
      pcaLabel: candidate.name,
      pcaKind: candidate.bucket,
    })
  }
  return rows
}

function buildRecommendedOutcome(args: {
  pathData: Array<{
    option: Step32PathOption
    candidateLookup: Map<string, { id: string; name: string; bucket: 'preferred' | 'floor' | 'non_floor' }>
  }>
  earliestPath: Step32PathOption
  systemSuggestedPcaId: string
}): Step32OutcomeOption {
  const rows = buildOutcomeRowsForPcaAcrossPaths({
    pathData: args.pathData.filter((entry) => {
      const row = entry.candidateLookup.get(args.systemSuggestedPcaId)
      return Boolean(row)
    }),
    pcaId: args.systemSuggestedPcaId,
  })

  const firstRow = rows[0]
  return {
    outcomeKey: 'recommended-continuity',
    title: getStep32RecommendedContinuityOutcomeTitle(),
    primaryPathKey: args.earliestPath.pathKey,
    rows: rows.length > 0 ? rows : [{
      slot: args.earliestPath.slot,
      timeRange: args.earliestPath.timeRange,
      pcaLabel: args.earliestPath.systemSuggestedPcaName ?? args.systemSuggestedPcaId,
      pcaKind: args.earliestPath.pathState === 'preferred_available' ? 'preferred' : args.earliestPath.floorCandidates.length > 0 ? 'floor' : 'non_floor',
    }],
    summaryLines: getOutcomeSummaryLines({
      variant: 'recommended_continuity',
      protectedRankLabel: 'rank #1',
    }),
    commitState: 'committable',
    isSystemRecommended: true,
    tradeoffKind: undefined,
  }
}

function buildPreferredOutcome(args: {
  earliestPath: Step32PathOption
  laterPath: Step32PathOption
  laterCandidate: { id: string; name: string }
}): Step32OutcomeOption {
  const variant = args.laterPath.kind === 'ranked' ? 'preferred_ranked' : 'preferred_later'
  const rows: Step32OutcomeRow[] = [
    {
      slot: args.earliestPath.slot,
      timeRange: args.earliestPath.timeRange,
      pcaLabel: args.earliestPath.systemSuggestedPcaName ?? args.earliestPath.preferredCandidates[0]?.name ?? args.earliestPath.systemSuggestedPcaId ?? 'Unknown PCA',
      pcaKind: args.earliestPath.pathState === 'preferred_available'
        ? 'preferred'
        : args.earliestPath.floorCandidates.length > 0
          ? 'floor'
          : 'non_floor',
    },
    {
      slot: args.laterPath.slot,
      timeRange: args.laterPath.timeRange,
      pcaLabel: args.laterCandidate.name,
      pcaKind: args.laterPath.preferredCandidates.some((candidate) => candidate.id === args.laterCandidate.id)
        ? 'preferred'
        : args.laterPath.floorCandidates.some((candidate) => candidate.id === args.laterCandidate.id)
          ? 'floor'
          : 'non_floor',
    },
  ]

  return {
    outcomeKey:
      args.laterPath.kind === 'ranked'
        ? `preferred-ranked:${args.laterPath.slot}`
        : `preferred-later:${args.laterPath.slot}`,
    title: getStep32LaterOutcomeTitle({ isRanked: args.laterPath.kind === 'ranked' }),
    primaryPathKey: args.laterPath.pathKey,
    rows,
    summaryLines: getOutcomeSummaryLines({
      variant,
      protectedRankLabel: 'rank #1',
      preferredRankLabel: args.laterPath.kind === 'ranked' ? 'rank #2' : undefined,
    }),
    commitState: 'committable_with_tradeoff',
    tradeoffKind: 'continuity',
    isSystemRecommended: false,
  }
}

function buildNotApplicableReview(team: Team, preferenceCondition: 'A' | 'B' | 'C' | 'D', pending: number, assignedSoFar: number): Step32TeamReview {
  return {
    ...createPreferredReviewState(team, 'not_applicable', preferenceCondition, pending, assignedSoFar),
    reviewApplies: false,
  }
}

function buildReviewableReview(args: {
  team: Team
  pref: ReturnType<typeof getTeamPreferenceInfo>
  adjustedPendingFTE: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, StaffOverrideWithSubstitution>
  floatingPcaById: Map<string, PCAData>
}): Step32TeamReview {
  const { team, pref, adjustedPendingFTE, floatingPCAs, existingAllocations, staffOverrides, floatingPcaById } = args
  const pending = roundToNearestQuarterWithMidpoint(adjustedPendingFTE[team] ?? 0)
  const assignedSoFar = existingAllocations.reduce((total, allocation) => {
    let slots = 0
    if (allocation.slot1 === team) slots += 1
    if (allocation.slot2 === team) slots += 1
    if (allocation.slot3 === team) slots += 1
    if (allocation.slot4 === team) slots += 1
    return total + slots * 0.25
  }, 0)

  if (pending <= 0 || !pref.hasPreferredPCA) {
    return buildNotApplicableReview(team, pref.condition, pending, assignedSoFar)
  }

  const pathDescriptors = buildPathDescriptors(pref)
  const pathData = pathDescriptors.map((descriptor) =>
    buildPathOptionData({
      descriptor,
      pref,
      adjustedPendingFTE,
      floatingPCAs,
      existingAllocations,
      staffOverrides,
    })
  )

  const earliestFeasibleIndex = pathData.findIndex((entry) => entry.option.pathState !== 'unavailable')
  const earliestFeasible = earliestFeasibleIndex >= 0 ? pathData[earliestFeasibleIndex] : null
  const systemSuggestedPca = earliestFeasible?.option.systemSuggestedPcaId
    ? {
        id: earliestFeasible.option.systemSuggestedPcaId,
        name: earliestFeasible.option.systemSuggestedPcaName ?? getPcaDisplayName(floatingPcaById.get(earliestFeasible.option.systemSuggestedPcaId), earliestFeasible.option.systemSuggestedPcaId),
      }
    : null

  const laterPreferredIndex = pathData.findIndex((entry, index) => index > earliestFeasibleIndex && entry.option.preferredCandidates.length > 0)
  const laterPreferred = laterPreferredIndex >= 0 ? pathData[laterPreferredIndex] : null

  const reviewState: Step32ReviewState = !earliestFeasible
    ? 'unavailable'
    : earliestFeasible.option.pathState === 'preferred_available'
      ? 'matched'
      : laterPreferred
        ? 'alternative'
        : 'unavailable'

  const pathOptions = pathData.map((entry, index) => {
    const option = { ...entry.option }
    option.isEarliestFeasiblePath = index === earliestFeasibleIndex

    if (option.pathState === 'unavailable') {
      option.commitState = 'blocked'
      option.note = 'No available PCA on this path.'
      return option
    }

    if (earliestFeasible && index === earliestFeasibleIndex) {
      option.commitState = 'committable'
      option.note = option.pathState === 'preferred_available' ? 'Preferred available on current path.' : 'Recommended by allocator.'
      return option
    }

    if (reviewState === 'alternative' && laterPreferred && index === laterPreferredIndex) {
      option.commitState = 'committable_with_tradeoff'
      option.tradeoffKind = 'continuity'
      option.note = getTradeoffMessage('continuity')
      return option
    }

    option.commitState = option.pathState === 'preferred_available' ? 'showable' : 'showable'
    return option
  })

  const outcomeOptions: Step32OutcomeOption[] = []
  if (earliestFeasible && systemSuggestedPca) {
    outcomeOptions.push(buildRecommendedOutcome({
      pathData,
      earliestPath: pathOptions[earliestFeasibleIndex] ?? earliestFeasible.option,
      systemSuggestedPcaId: systemSuggestedPca.id,
    }))
  }

  if (reviewState === 'alternative' && earliestFeasible && laterPreferred) {
    const laterCandidate =
      laterPreferred.option.preferredCandidates[0] ??
      laterPreferred.option.floorCandidates[0] ??
      laterPreferred.option.nonFloorCandidates[0]

    if (laterCandidate) {
      outcomeOptions.push(
        buildPreferredOutcome({
          earliestPath: pathOptions[earliestFeasibleIndex] ?? earliestFeasible.option,
          laterPath: pathOptions[laterPreferredIndex] ?? laterPreferred.option,
          laterCandidate,
        })
      )
    }
  }

  const preferredPcaNames = buildPreferredPcaNames(pref.preferredPCAIds, floatingPcaById)
  const systemPath = earliestFeasible?.option ?? null
  const systemPcaId = systemPath?.systemSuggestedPcaId ?? null
  const systemPcaName = systemPath?.systemSuggestedPcaName ?? null
  const laterPreferredExists = Boolean(laterPreferred)

  const preferredPcaStatuses: Step32PreferredPcaStatus[] = pref.preferredPCAIds.map((id) => {
    const availability = getPreferredAvailabilityForPca({ preferredPcaId: id, pathData })
    return {
      id,
      name: preferredPcaNames[id] ?? id,
      availability,
      detail: preferredAvailabilityDetail(availability),
    }
  })

  const primaryScenario = buildAlternativePrimaryScenario({
    reviewState,
    hasLaterPreferred: laterPreferredExists,
  })

  const review = {
    team,
    reviewApplies: true,
    reviewState,
    preferenceCondition: pref.condition,
    pending,
    assignedSoFar,
    preferredPcaIds: [...pref.preferredPCAIds],
    preferredPcaNames,
    rankedChoices: pref.rankedSlots.map((slot, index) => ({
      slot: slot as 1 | 2 | 3 | 4,
      rank: index + 1,
      label: createRankLabel(index + 1),
    })),
    unrankedChoices: pref.unrankedNonGymSlots.map((slot) => ({
      slot: slot as 1 | 2 | 3 | 4,
      label: `Slot ${slot} · ${formatStep32TimeRange(slot as 1 | 2 | 3 | 4)}`,
    })),
    gymChoice: pref.gymSlot != null ? { slot: pref.gymSlot as 1 | 2 | 3 | 4, label: `Gym ${formatStep32TimeRange(pref.gymSlot as 1 | 2 | 3 | 4)}` } : null,
    systemSuggestedPathKey: systemPath ? systemPath.pathKey : null,
    systemSuggestedPcaId: systemPcaId,
    systemSuggestedPcaName: systemPcaName,
    pathOptions,
    outcomeOptions,
    slot: systemPath?.slot ?? (pref.rankedSlots[0] as 1 | 2 | 3 | 4 | undefined) ?? (pref.unrankedNonGymSlots[0] as 1 | 2 | 3 | 4 | undefined) ?? null,
    pcaIds: systemPath
      ? [
          ...systemPath.preferredCandidates.map((candidate) => candidate.id),
          ...systemPath.floorCandidates.map((candidate) => candidate.id),
          ...systemPath.nonFloorCandidates.map((candidate) => candidate.id),
        ]
      : [],
    pcaNames: systemPath
      ? Object.fromEntries([
          ...systemPath.preferredCandidates,
          ...systemPath.floorCandidates,
          ...systemPath.nonFloorCandidates,
        ].map((candidate) => [candidate.id, candidate.name]))
      : {},
    otherSlots: pref.unrankedNonGymSlots.filter((slot) => slot !== pref.gymSlot),
    gymSlot: pref.gymSlot ?? null,
    attentionReason:
      reviewState === 'alternative' || reviewState === 'unavailable'
        ? 'preferred-pca-misses-highest-feasible-rank'
        : undefined,
    recommendedPcaId: systemPcaId,
    recommendedPcaName: systemPcaName,
    preferredPcaMayStillHelpLater: laterPreferredExists,
    preferredPcaStatuses,
    primaryScenario,
  } satisfies Step32TeamReview

  return review
}

export function buildStep32PreferredReviewPreview(args: {
  pcaPreferences: PCAPreference[]
  adjustedPendingFTE: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, StaffOverrideWithSubstitution>
}): Step32PreferredReviewPreview {
  const floatingPcaById = new Map<string, PCAData>()
  for (const pca of args.floatingPCAs) {
    if (!floatingPcaById.has(pca.id)) {
      floatingPcaById.set(pca.id, pca)
    }
  }

  const teamPreferenceByTeam = new Map<Team, ReturnType<typeof getTeamPreferenceInfo>>()
  for (const pref of args.pcaPreferences) {
    if (!teamPreferenceByTeam.has(pref.team)) {
      teamPreferenceByTeam.set(pref.team, getTeamPreferenceInfo(pref.team, args.pcaPreferences))
    }
  }

  const teamReviews = {} as Record<Team, Step32TeamReview>
  const summary = createEmptySummary()

  for (const team of TEAMS) {
    const pref = teamPreferenceByTeam.get(team) ?? getTeamPreferenceInfo(team, args.pcaPreferences)
    const pending = roundToNearestQuarterWithMidpoint(args.adjustedPendingFTE[team] ?? 0)
    const assignedSoFar = args.existingAllocations.reduce((total, allocation) => {
      let slots = 0
      if (allocation.slot1 === team) slots += 1
      if (allocation.slot2 === team) slots += 1
      if (allocation.slot3 === team) slots += 1
      if (allocation.slot4 === team) slots += 1
      return total + slots * 0.25
    }, 0)

    if (pending <= 0 || !pref.hasPreferredPCA) {
      const review = buildNotApplicableReview(team, pref.condition, pending, assignedSoFar)
      teamReviews[team] = review
      summary.notApplicableTeams.push(team)
      summary.notApplicableTeamCount += 1
      continue
    }

    const review = buildReviewableReview({
      team,
      pref,
      adjustedPendingFTE: args.adjustedPendingFTE,
      floatingPCAs: args.floatingPCAs,
      existingAllocations: args.existingAllocations,
      staffOverrides: args.staffOverrides,
      floatingPcaById,
    })

    teamReviews[team] = review
    summary.reviewableTeams.push(team)
    summary.reviewableTeamCount += 1
    summary.teamsChecked += 1

    if (review.reviewState === 'matched') {
      summary.matchedTeams.push(team)
      summary.matchedTeamCount += 1
    } else if (review.reviewState === 'alternative') {
      summary.alternativeTeams.push(team)
      summary.alternativeTeamCount += 1
    } else if (review.reviewState === 'unavailable') {
      summary.unavailableTeams.push(team)
      summary.unavailableTeamCount += 1
    } else {
      summary.notApplicableTeams.push(team)
      summary.notApplicableTeamCount += 1
    }

    if (review.reviewState === 'matched') {
      summary.autoContinueTeams.push(team)
    }
    if (review.reviewState === 'alternative' || review.reviewState === 'unavailable') {
      summary.needsAttentionTeams.push(team)
    }
    if (review.gymChoice != null && review.pathOptions.some((path) => path.kind === 'gym' && path.pathState !== 'unavailable')) {
      summary.gymRiskTeams.push(team)
    }
  }

  const teamReservations = teamReviews

  return {
    teamReviews,
    teamReservations,
    summary,
    hasAnyReviews: summary.reviewableTeamCount > 0,
    hasAnyReservations: summary.reviewableTeamCount > 0,
  }
}

