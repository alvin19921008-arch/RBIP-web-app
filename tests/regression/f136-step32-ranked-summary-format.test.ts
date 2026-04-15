import assert from 'node:assert/strict'

import {
  buildStep32RankedMetaFromDashboardSlots,
  formatStep32DashboardRankOrdinal,
  formatStep32OrdinalSuffix,
  formatStep32RankedSlotsSummaryLine,
  formatStep32SlotLabelWithInterval,
  getStep32DashboardRankOrdinalForSlot,
} from '../../lib/features/schedule/step32V2/step32RankedSummaryFormat'

async function main() {
  assert.equal(formatStep32OrdinalSuffix(1), '1st')
  assert.equal(formatStep32OrdinalSuffix(2), '2nd')
  assert.equal(formatStep32OrdinalSuffix(3), '3rd')
  assert.equal(formatStep32OrdinalSuffix(4), '4th')
  assert.equal(formatStep32OrdinalSuffix(11), '11th')

  assert.equal(formatStep32DashboardRankOrdinal(1), '1st rank')
  assert.equal(formatStep32DashboardRankOrdinal(2), '2nd rank')

  assert.equal(
    formatStep32RankedSlotsSummaryLine([
      { slot: 2, rank: 1 },
      { slot: 1, rank: 2 },
    ]),
    '1st rank: 1030-1200 · 2nd rank: 0900-1030'
  )

  assert.equal(
    formatStep32RankedSlotsSummaryLine(buildStep32RankedMetaFromDashboardSlots([2, 1])),
    '1st rank: 1030-1200 · 2nd rank: 0900-1030'
  )

  assert.equal(
    formatStep32RankedSlotsSummaryLine(buildStep32RankedMetaFromDashboardSlots([1, 2, 3, 4])),
    '1st rank: 0900-1030 · 2nd rank: 1030-1200 · 3rd rank: 1330-1500 · 4th rank: 1500-1630'
  )

  assert.equal(formatStep32RankedSlotsSummaryLine([{ slot: 3, rank: 1 }]), '1st rank: 1330-1500')

  assert.equal(formatStep32SlotLabelWithInterval(2, '1030-1200'), 'Slot 2 (1030-1200)')
  assert.equal(getStep32DashboardRankOrdinalForSlot([4, 1], 4), '1st rank')
  assert.equal(getStep32DashboardRankOrdinalForSlot([4, 1], 1), '2nd rank')
  assert.equal(getStep32DashboardRankOrdinalForSlot([4, 1], 2), null)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
