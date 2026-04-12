import assert from 'node:assert/strict'

import {
  getOutcomeSummaryLines,
  getStep32CategoryHeading,
  getStep32LaneLabel,
  getStep32LaterOutcomeTitle,
  getStep32LegendItems,
  getStep32RecommendedContinuityOutcomeTitle,
  getStep32SaveDecisionTitle,
  getStep32SaveSelectedOutcomeLabel,
  getStep32StatusHelpLabel,
  getTradeoffMessage,
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
  assert.equal(getStep32SaveSelectedOutcomeLabel(), 'Save selected outcome')
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: true }), 'Preferred on later rank')
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: false }), 'Preferred on later slot')
  assert.equal(getStep32RecommendedContinuityOutcomeTitle(), 'Recommended · Continuity')

  assert.equal(getStep32StatusHelpLabel().includes('Legend'), false)
  assert.equal(getStep32SaveDecisionTitle().toLowerCase().includes('commit'), false)
  assert.equal(getStep32SaveSelectedOutcomeLabel().toLowerCase().includes('commit'), false)
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: false }).toLowerCase().includes('fallback'), false)
  assert.equal(getStep32LaterOutcomeTitle({ isRanked: true }).toLowerCase().includes('fallback'), false)

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

  assert.equal(
    getTradeoffMessage('continuity'),
    'Rank #1 stays protected, but continuity is reduced because the team would use 2 PCAs instead of 1.'
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
