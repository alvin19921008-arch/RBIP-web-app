import type {
  Step32PreferredAvailability,
  Step32ReviewState,
  Step32TradeoffKind,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewModel'

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
  return 'Save reservation'
}

/** Step 3 “leave open” choice — same label whether or not a reservation exists. */
export function getStep32LeaveOpenFor34ChoiceLabel(): string {
  return 'Leave open for Step 3.4'
}

export function getStep32SaveDecisionHelperLeaveOpenNoSave(): string {
  return 'Leaving this team open for Step 3.4 (no reservation saved).'
}

export function getStep32SaveDecisionHelperSavedReservation(args: {
  pcaName: string
  slot: number
  team: string
}): string {
  return `Saved ${args.pcaName} to slot ${args.slot} for ${args.team} for Step 3.4.`
}

export function getStep32SaveDecisionHelperStaleCommit(): string {
  return 'Reservation on file no longer matches this preview. Save again to update, or leave open for Step 3.4.'
}

/** Helper under the PCA select in Step 3.2 detail (Step 2). */
export function getStep32PcaChangeStepHelper(): string {
  return 'Changing PCA updates the reservation preview above.'
}

/** Visible label above the PCA select. */
export function getStep32PcaSelectLabel(): string {
  return 'PCA for the reserved slot'
}

export function getStep32PcaSelectPlaceholder(): string {
  return 'Choose PCA…'
}

export function getStep32PcaSelectAriaLabel(): string {
  return 'Who fills the reserved slot'
}

/** Select group heading for the allocator’s suggested PCA row. */
export function getStep32PcaSelectAllocatorGroupLabel(): string {
  return 'Suggested'
}

export function getStep32LaterOutcomeTitle(args: { isRanked: boolean }): string {
  return args.isRanked ? 'Preferred on later rank' : 'Preferred on later slot'
}

export function getStep32RecommendedContinuityOutcomeTitle(): string {
  return 'Recommended · Continuity'
}

/** Plain-text outcome title for model `title` / debugging (UI uses structured highlight + location). */
export function getStep32OutcomePlainTitle(args: {
  highlight: 'preferred_pca' | 'floor_pca'
  locationPhrase: string
}): string {
  const lead = args.highlight === 'preferred_pca' ? 'Preferred PCA' : 'Floor PCA'
  return `${lead} on ${args.locationPhrase}`
}

export function getStep32CombinedReservationGroupHeading(): string {
  return 'Build your reservation'
}

export function getStep32OutcomeSectionHeading(): string {
  return '1. Outcome'
}

export function getStep32PcaFillSectionHeading(): string {
  return '2. Who fills the reserved slot?'
}

export function getStep32SaveDecisionSectionHeading(): string {
  return '3. Save decision'
}

export function getStep32RankedSlotsContextLabel(): string {
  return 'Ranked slots'
}

export function getStep32PreferredPcaContextLabel(): string {
  return 'Preferred PCA'
}

export function getStep32ReservedFor34RowPrefix(): string {
  return 'Reserved for Step 3.4'
}

export function getStep32ReservedOtherSlotsDisclaimer(): string {
  return 'Other slots: filled in Steps 3.3–3.4 (not fixed here).'
}

export function getStep32SuggestedOutcomeBadgeLabel(): string {
  return 'Suggested'
}

/** Parameterized save helper (plan §0.6) — values must be safe text from roster/state. */
export function getStep32SaveReservesOnlyHintFor34(args: { pcaName: string; interval: string }): string {
  return `Save reserves only ${args.pcaName} · ${args.interval} for Step 3.4`
}

export function getStep32SaveHintPlaceholder(): string {
  return 'Choose an outcome and PCA to see what Save will reserve for Step 3.4.'
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

export function getStep32PreferredAvailabilityLabel(kind: Step32PreferredAvailability): string {
  if (kind === 'rank-1') return 'Available on 1st rank'
  if (kind === 'later-ranked') return 'Available on a lower rank only'
  if (kind === 'unranked') return 'Available on an unranked slot only'
  return 'Unavailable for ranked paths'
}

/** Wording for reservation scope in Step 3.2 scenario summaries (one quarter-slot). */
export function getStep32SaveEffectLabel(): string {
  return 'Reserving saves one slot only (+0.25).'
}

/** Near the Step 3.2 save buttons: clarifies that only the chosen slot is reserved for Step 3.4. */
export function getStep32SaveSlotOnlyNearActionLabel(): string {
  return 'Saving reserves only the selected slot for Step 3.4. It does not assign the whole PCA path shown above.'
}
