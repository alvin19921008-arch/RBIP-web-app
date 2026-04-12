import type { Step32ReviewState, Step32TradeoffKind } from '@/lib/features/schedule/step32V2/step32PreferredReviewModel'

export function getStep32LaneLabel(state: Step32ReviewState): string {
  if (state === 'not_applicable') return 'N/A'
  if (state === 'matched') return 'Matched'
  if (state === 'alternative') return 'Alt slot'
  return 'Unavailable'
}

export function getStep32CategoryHeading(state: Step32ReviewState): string {
  if (state === 'matched') return 'Matched'
  if (state === 'alternative') return 'Alt path'
  if (state === 'unavailable') return 'Unavailable'
  return 'No review'
}

export function getStep32LegendItems() {
  return [
    { key: 'matched', label: 'Preferred matched' },
    { key: 'alternative', label: 'Preferred available on another path' },
    { key: 'unavailable', label: 'No preferred PCA available' },
    { key: 'not_applicable', label: 'No preferred review needed' },
  ] as const
}

export function getStep32StatusHelpLabel(): string {
  return 'How to read statuses'
}

export function getStep32SaveDecisionTitle(): string {
  return 'Save decision'
}

export function getStep32SaveSelectedOutcomeLabel(): string {
  return 'Save selected outcome'
}

export function getStep32LaterOutcomeTitle(args: { isRanked: boolean }): string {
  return args.isRanked ? 'Preferred on later rank' : 'Preferred on later slot'
}

export function getStep32RecommendedContinuityOutcomeTitle(): string {
  return 'Recommended · Continuity'
}

export function getOutcomeSummaryLines(args: {
  variant: 'recommended_continuity' | 'preferred_ranked' | 'preferred_later'
  protectedRankLabel: string
  preferredRankLabel?: string
}): string[] {
  if (args.variant === 'recommended_continuity') {
    return [`Protects ${args.protectedRankLabel}`, 'Continuous one-PCA path', 'Recommended by allocator']
  }
  if (args.variant === 'preferred_ranked') {
    const preferenceLine = args.preferredRankLabel
      ? `Keeps preferred on ${args.preferredRankLabel}`
      : getStep32LaterOutcomeTitle({ isRanked: true })
    return [`Protects ${args.protectedRankLabel}`, preferenceLine, 'Uses 2 PCAs']
  }
  return [
    `Protects ${args.protectedRankLabel}`,
    getStep32LaterOutcomeTitle({ isRanked: false }),
    'Unranked path',
  ]
}

export function getTradeoffMessage(kind: Step32TradeoffKind): string {
  if (kind === 'continuity') {
    return 'Rank #1 stays protected, but continuity is reduced because the team would use 2 PCAs instead of 1.'
  }
  return 'This path is allowed, but it trades off a lower-priority quality signal.'
}
