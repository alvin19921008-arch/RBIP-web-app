import type {
  Step32PreferredAvailability,
  Step32PreferredUnavailableReason,
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

/** Shown under §3 when save intent is unset and outcome/PCA preview is not complete yet. */
export function getStep32SaveDecisionHelperUnsetNoCommit(): string {
  return 'Nothing from Step 3.2 is saved for Step 3.4 until you press Save reservation. Next without choosing also leaves no Step 3.2 reservation.'
}

export function getStep32SaveLeaveOpenStep34Explainer(): string {
  return "Step 3.4 will assign floating PCAs without this Step 3.2 reservation; it won't follow the preview above."
}

/** Shown under §3 heading when preview is complete but save intent is still unset. */
export function getStep32SaveIfYouPressSaveReservationHintFor34(args: { pcaName: string; interval: string }): string {
  return `If you press Save reservation, only ${args.pcaName} · ${args.interval} is held for Step 3.4. Leave open, or Next without choosing, leaves no Step 3.2 reservation.`
}

export type Step32SaveDecisionUi = 'unset' | 'leave_open' | 'committed'

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

/**
 * Short note on the later-slot path row (debug / diagnostics). The user-facing banner uses
 * {@link getStep32ContinuityTradeoffBannerMessage}.
 */
export const STEP32_CONTINUITY_TRADEOFF_PATH_NOTE =
  "Preferred PCA on a later slot; this team's floatings split across more PCAs."

export function getStep32ContinuityTradeoffBannerMessage(args: {
  firstRankedIntervalDisplay: string
  preferredPcaName: string
}): string {
  return `Your 1st ranked slot (${args.firstRankedIntervalDisplay}) would still be filled. But placing preferred PCA ${args.preferredPcaName} on the other slot means this team's floatings would be split across more PCAs.`
}

export function getTradeoffMessage(kind: Step32TradeoffKind): string {
  if (kind === 'continuity') {
    return STEP32_CONTINUITY_TRADEOFF_PATH_NOTE
  }
  return 'This path is allowed, but it trades off a lower-priority quality signal.'
}

/** Plain sentence for Step 3.2 when a preferred PCA is on no showable path (see `classifyStep32PreferredPcaUnavailableReason`). */
export function getStep32PreferredPcaUnavailableDetail(reason: Step32PreferredUnavailableReason): string {
  if (reason === 'not_on_floating_list') return 'Not on the floating list for this step.'
  if (reason === 'unavailable_today') return 'Unavailable today'
  if (reason === 'no_floating_slot_left') return 'No floating slot left to assign today.'
  if (reason === 'slot_availability_mismatch')
    return "Available floating slots don't match with this team today."
  return "Can't be placed on any of the options we're showing today."
}

export function getStep32PreferredAvailabilityLabel(kind: Step32PreferredAvailability): string {
  if (kind === 'rank-1') return 'Available on 1st rank'
  if (kind === 'later-ranked') return 'Available on a lower rank only'
  if (kind === 'unranked') return 'Available on an unranked slot only'
  return 'Not available here'
}

/** Wording for reservation scope in Step 3.2 scenario summaries (one quarter-slot). */
export function getStep32SaveEffectLabel(): string {
  return 'Reserving saves one slot only (+0.25).'
}

/** Near the Step 3.2 save buttons: clarifies that only the chosen slot is reserved for Step 3.4. */
export function getStep32SaveSlotOnlyNearActionLabel(): string {
  return 'Saving reserves only the selected slot for Step 3.4. It does not assign the whole PCA path shown above.'
}
