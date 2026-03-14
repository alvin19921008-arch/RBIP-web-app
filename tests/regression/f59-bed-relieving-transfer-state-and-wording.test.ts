import assert from 'node:assert/strict'

import {
  formatBedCountLabel,
  getTransferDisplayMode,
  isBedRelievingTransferDone,
  normalizeBedRelievingTransferEntry,
} from '../../lib/features/schedule/bedRelievingTransferState'

async function main() {
  assert.equal(formatBedCountLabel(1), '1 bed', 'Expected singular bed label for 1')
  assert.equal(formatBedCountLabel(2), '2 beds', 'Expected plural bed label for counts above 1')

  const legacyTaken = normalizeBedRelievingTransferEntry([
    { ward: 'R9C', bedNumbersText: '5' },
  ])
  assert.equal(legacyTaken.resolution, 'taken', 'Expected legacy bed rows to normalize as taken')
  assert.deepEqual(
    legacyTaken.rows,
    [{ ward: 'R9C', bedNumbersText: '5' }],
    'Expected legacy rows to be preserved during normalization'
  )
  assert.equal(
    getTransferDisplayMode(legacyTaken, 1),
    'shown',
    'Expected taken transfers with bed rows to remain visible in display mode'
  )

  const hiddenNotReleased = normalizeBedRelievingTransferEntry({
    resolution: 'not-released',
    rows: [],
  })
  assert.equal(
    hiddenNotReleased.resolution,
    'not-released',
    'Expected not-released resolution to survive normalization'
  )
  assert.equal(
    getTransferDisplayMode(hiddenNotReleased, 1),
    'hidden',
    'Expected single-bed not-released transfers to stay hidden in read mode while remaining saved'
  )
  assert.equal(
    isBedRelievingTransferDone(hiddenNotReleased, 1),
    true,
    'Expected single-bed not-released transfers to count as resolved on the release side'
  )
  assert.equal(
    getTransferDisplayMode(hiddenNotReleased, 2),
    'shown',
    'Expected merged/multi-bed transfers not to hide the whole transfer when only one contributor was not released'
  )
  assert.equal(
    isBedRelievingTransferDone(hiddenNotReleased, 2),
    false,
    'Expected merged/multi-bed not-released entries not to resolve the whole aggregated transfer'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
