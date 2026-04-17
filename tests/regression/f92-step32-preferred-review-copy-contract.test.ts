import assert from 'node:assert/strict'

import {
  getOutcomeSummaryLines,
  getStep32CategoryHeading,
  getStep32CombinedReservationGroupHeading,
  getStep32LaneLabel,
  getStep32LaterOutcomeTitle,
  getStep32LegendItems,
  getStep32LeaveOpenFor34ChoiceLabel,
  getStep32OutcomePlainTitle,
  getStep32OutcomeSectionHeading,
  getStep32PcaChangeStepHelper,
  getStep32PcaFillSectionHeading,
  getStep32PcaSelectAllocatorGroupLabel,
  getStep32PcaSelectAriaLabel,
  getStep32PcaSelectLabel,
  getStep32PcaSelectPlaceholder,
  getStep32PreferredAvailabilityLabel,
  getStep32PreferredPcaUnavailableDetail,
  getStep32RankedSlotsContextLabel,
  getStep32RecommendedContinuityOutcomeTitle,
  getStep32ReservedFor34RowPrefix,
  getStep32ReservedOtherSlotsDisclaimer,
  getStep32SaveDecisionHelperSavedReservation,
  getStep32SaveDecisionHelperStaleCommit,
  getStep32SaveDecisionHelperUnsetNoCommit,
  getStep32SaveDecisionSectionHeading,
  getStep32SaveDecisionTitle,
  getStep32SaveHintPlaceholder,
  getStep32SaveIfYouPressSaveReservationHintFor34,
  getStep32SaveLeaveOpenStep34Explainer,
  getStep32SaveReservesOnlyHintFor34,
  getStep32SaveSelectedOutcomeLabel,
  getStep32StatusHelpLabel,
  getStep32ContinuityTradeoffBannerMessage,
  getStep32SuggestedOutcomeBadgeLabel,
  getTradeoffMessage,
  STEP32_CONTINUITY_TRADEOFF_PATH_NOTE,
} from '../../lib/features/schedule/step32V2/step32PreferredReviewCopy'

async function main() {
  assert.equal(getStep32LaneLabel('not_applicable'), 'N/A')
  assert.equal(getStep32LaneLabel('matched'), 'Matched')
  assert.equal(getStep32LaneLabel('alternative'), 'Alt slot')
  assert.equal(getStep32LaneLabel('unavailable'), 'Unavailable')

  assert.equal(getStep32CategoryHeading('matched'), 'Matched')
  assert.equal(getStep32CategoryHeading('alternative'), 'Alt path')
  assert.equal(getStep32CategoryHeading('unavailable'), 'Unavailable')
  assert.equal(getStep32CategoryHeading('not_applicable'), 'No review')

  assert.deepEqual(getStep32LegendItems(), [
    { key: 'matched', label: 'Preferred matched' },
    { key: 'alternative', label: 'Preferred available on another path' },
    { key: 'unavailable', label: 'No preferred PCA available' },
    { key: 'not_applicable', label: 'No preferred review needed' },
  ])

  assert.equal(getStep32StatusHelpLabel(), 'How to read statuses')
  assert.equal(getStep32SaveDecisionTitle(), 'Save decision')
  assert.equal(getStep32SaveSelectedOutcomeLabel(), 'Save reservation')
  assert.equal(getStep32LeaveOpenFor34ChoiceLabel(), 'Leave open for Step 3.4')
  assert.equal(
    getStep32SaveDecisionHelperUnsetNoCommit(),
    'Nothing from Step 3.2 is saved for Step 3.4 until you press Save reservation. Next without choosing also leaves no Step 3.2 reservation.'
  )
  assert.equal(
    getStep32SaveLeaveOpenStep34Explainer(),
    "Step 3.4 will assign floating PCAs without this Step 3.2 reservation; it won't follow the preview above."
  )
  assert.equal(
    getStep32SaveIfYouPressSaveReservationHintFor34({ pcaName: 'Ada', interval: '1030-1200' }),
    'If you press Save reservation, only Ada · 1030-1200 is held for Step 3.4. Leave open, or Next without choosing, leaves no Step 3.2 reservation.'
  )
  assert.equal(
    getStep32SaveDecisionHelperSavedReservation({
      pcaName: 'A',
      slot: 2,
      team: 'FO',
    }),
    'Saved A to slot 2 for FO for Step 3.4.'
  )
  assert.equal(
    getStep32SaveDecisionHelperStaleCommit(),
    'Reservation on file no longer matches this preview. Save again to update, or leave open for Step 3.4.'
  )

  assert.equal(
    getStep32PcaChangeStepHelper(),
    'Changing PCA updates the reservation preview above.'
  )
  assert.equal(getStep32PcaSelectLabel(), 'PCA for the reserved slot')
  assert.equal(getStep32PcaSelectPlaceholder(), 'Choose PCA…')
  assert.equal(getStep32PcaSelectAriaLabel(), 'Who fills the reserved slot')
  assert.equal(getStep32PcaSelectAllocatorGroupLabel(), 'Suggested')
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: true }), 'Preferred on later rank')
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: false }), 'Preferred on later slot')
  assert.equal(getStep32RecommendedContinuityOutcomeTitle(), 'Recommended · Continuity')

  assert.equal(getStep32StatusHelpLabel().includes('Legend'), false)
  assert.equal(getStep32SaveDecisionTitle().toLowerCase().includes('commit'), false)
  assert.equal(getStep32SaveSelectedOutcomeLabel().toLowerCase().includes('commit'), false)
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: false }).toLowerCase().includes('fallback'), false)
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: true }).toLowerCase().includes('fallback'), false)

  assert.equal(getStep32CombinedReservationGroupHeading(), 'Build your reservation')
  assert.equal(getStep32OutcomeSectionHeading(), '1. Outcome')
  assert.equal(getStep32PcaFillSectionHeading(), '2. Who fills the reserved slot?')
  assert.equal(getStep32SaveDecisionSectionHeading(), '3. Save decision')
  assert.equal(getStep32RankedSlotsContextLabel(), 'Ranked slots')
  assert.equal(getStep32ReservedFor34RowPrefix(), 'Reserved for Step 3.4')
  assert.equal(
    getStep32ReservedOtherSlotsDisclaimer(),
    'Other slots: filled in Steps 3.3–3.4 (not fixed here).'
  )
  assert.equal(getStep32SuggestedOutcomeBadgeLabel(), 'Suggested')
  assert.equal(
    getStep32SaveReservesOnlyHintFor34({ pcaName: 'Ada', interval: '1030-1200' }),
    'Save reserves only Ada · 1030-1200 for Step 3.4'
  )
  assert.equal(getStep32SaveHintPlaceholder().length > 0, true)
  assert.equal(
    getStep32OutcomePlainTitle({ highlight: 'preferred_pca', locationPhrase: '1st rank' }),
    'Preferred PCA on 1st rank'
  )
  assert.equal(
    getStep32OutcomePlainTitle({ highlight: 'floor_pca', locationPhrase: '1st rank' }),
    'Floor PCA on 1st rank'
  )

  assert.equal(getStep32PreferredAvailabilityLabel('rank-1'), 'Available on 1st rank')
  assert.equal(getStep32PreferredAvailabilityLabel('later-ranked'), 'Available on a lower rank only')
  assert.equal(getStep32PreferredAvailabilityLabel('unranked'), 'Available on an unranked slot only')
  assert.equal(getStep32PreferredAvailabilityLabel('unavailable'), 'Not available here')
  assert.equal(
    getStep32PreferredPcaUnavailableDetail('not_on_floating_list'),
    'Not on the floating list for this step.'
  )
  assert.equal(getStep32PreferredPcaUnavailableDetail('unavailable_today'), 'Unavailable today')
  assert.equal(
    getStep32PreferredPcaUnavailableDetail('no_floating_slot_left'),
    'No floating slot left to assign today.'
  )
  assert.equal(
    getStep32PreferredPcaUnavailableDetail('slot_availability_mismatch'),
    "Available floating slots don't match with this team today."
  )
  assert.equal(
    getStep32PreferredPcaUnavailableDetail('other'),
    "Can't be placed on any of the options we're showing today."
  )

  assert.deepEqual(
    getOutcomeSummaryLines({
      variant: 'recommended_continuity',
      protectedRankLabel: 'rank #1',
    }),
    ['Protects rank #1', 'Continuous one-PCA path', 'Recommended by allocator']
  )
  assert.deepEqual(
    getOutcomeSummaryLines({
      variant: 'preferred_ranked',
      protectedRankLabel: 'rank #1',
      preferredRankLabel: 'rank #2',
    }),
    ['Protects rank #1', 'Keeps preferred on rank #2', 'Uses 2 PCAs']
  )
  assert.deepEqual(
    getOutcomeSummaryLines({
      variant: 'preferred_ranked',
      protectedRankLabel: 'rank #1',
    }),
    ['Protects rank #1', 'Preferred on later rank', 'Uses 2 PCAs']
  )
  assert.deepEqual(
    getOutcomeSummaryLines({
      variant: 'preferred_later',
      protectedRankLabel: 'rank #1',
    }),
    ['Protects rank #1', 'Preferred on later slot', 'Unranked path']
  )

  assert.equal(getTradeoffMessage('continuity'), STEP32_CONTINUITY_TRADEOFF_PATH_NOTE)
  assert.equal(
    getStep32ContinuityTradeoffBannerMessage({
      firstRankedIntervalDisplay: '10:30-12:00',
      preferredPcaName: 'Ada',
    }),
    "Your 1st ranked slot (10:30-12:00) would still be filled. But placing preferred PCA Ada on the other slot means this team's floatings would be split across more PCAs."
  )
  assert.equal(
    getTradeoffMessage('other'),
    'This path is allowed, but it trades off a lower-priority quality signal.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
