import assert from 'node:assert/strict'

import type { TeamAllocationLog } from '../../types/schedule'
import {
  formatV2RepairAuditDefectLabel,
  formatV2SlotSelectionPhaseLabel,
  selectPcaTrackerTooltipVariant,
} from '../../lib/features/schedule/pcaTrackerTooltip'
import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'

function makeEmptyLog(): TeamAllocationLog {
  return {
    team: 'SMM',
    assignments: [],
    summary: {
      totalSlotsAssigned: 0,
      fromStep30: 0,
      fromStep32: 0,
      fromStep33: 0,
      fromStep34Cycle1: 0,
      fromStep34Cycle2: 0,
      fromStep34Cycle3: 0,
      preferredSlotFilled: false,
      preferredPCAsUsed: 0,
      floorPCAsUsed: 0,
      nonFloorPCAsUsed: 0,
      amPmBalanced: false,
      gymSlotUsed: false,
      pendingMet: false,
      highestRankedSlotFulfilled: null,
      usedUnrankedSlot: false,
      usedDuplicateFloatingSlot: false,
      gymUsedAsLastResort: false,
      preferredPCAUsed: false,
      fulfilledByBuffer: false,
      allocationMode: 'standard',
      repairAuditDefects: [],
      preStep34RoundedPendingFte: undefined,
    },
  }
}

async function main() {
  assert.equal(
    formatV2SlotSelectionPhaseLabel('ranked-unused'),
    'Ranked unassigned slot',
    'Expected ranked-unused slot copy to use the approved "unassigned" wording.'
  )

  assert.equal(
    formatV2SlotSelectionPhaseLabel('unranked-unused'),
    'Unranked non-gym unassigned slot',
    'Expected unranked-unused slot copy to use the approved "unassigned" wording.'
  )

  assert.equal(
    formatV2RepairAuditDefectLabel('F1'),
    'Fairness floor',
    'Expected F1 defect chip copy to remain "Fairness floor".'
  )

  const v2Log = makeEmptyLog()
  v2Log.assignments.push({
    slot: 1,
    pcaId: 'p1',
    pcaName: 'P1',
    assignedIn: 'step34',
    allocationStage: 'draft',
  })

  assert.equal(
    selectPcaTrackerTooltipVariant({
      explicitFlowSurface: 'v1-legacy',
      allocationLog: v2Log,
    }),
    'v1',
    'Expected explicit V1 flow selection to win even if tracker metadata looks like V2.'
  )

  assert.equal(
    selectPcaTrackerTooltipVariant({
      explicitFlowSurface: 'v2-ranked',
      allocationLog: makeEmptyLog(),
    }),
    'v2',
    'Expected explicit V2 flow selection to force the V2 tooltip renderer.'
  )

  assert.equal(
    selectPcaTrackerTooltipVariant({
      allocationLog: v2Log,
    }),
    'v2',
    'Expected V2 tracker metadata to select the V2 tooltip as fallback when explicit flow state is unavailable.'
  )

  assert.equal(
    selectPcaTrackerTooltipVariant({
      allocationLog: makeEmptyLog(),
    }),
    'v1',
    'Expected the legacy tooltip to remain the fallback when no explicit flow state or V2 metadata is present.'
  )

  const tooltipModelLog = makeEmptyLog()
  tooltipModelLog.team = 'CPPC'
  tooltipModelLog.summary.totalSlotsAssigned = 3
  tooltipModelLog.summary.fromStep33 = 1
  tooltipModelLog.summary.fromStep34Cycle1 = 2
  tooltipModelLog.summary.pendingMet = false
  tooltipModelLog.summary.highestRankedSlotFulfilled = 1
  tooltipModelLog.summary.repairAuditDefects = ['B1', 'A2']
  tooltipModelLog.summary.preStep34RoundedPendingFte = 0.25
  tooltipModelLog.assignments.push(
    {
      slot: 4,
      pcaId: 'draft-floor',
      pcaName: 'Shu Zhen',
      assignedIn: 'step34',
      allocationStage: 'draft',
      repairReason: null,
      fulfilledSlotRank: 1,
      slotSelectionPhase: 'ranked-unused',
      pcaSelectionTier: 'floor',
      usedContinuity: false,
      duplicateSlot: false,
    },
    {
      slot: 2,
      pcaId: 'step33-preferred',
      pcaName: 'Jun',
      assignedIn: 'step33',
      fulfilledSlotRank: null,
      slotSelectionPhase: 'unranked-unused',
      pcaSelectionTier: 'preferred',
      usedContinuity: false,
      duplicateSlot: false,
    },
    {
      slot: 1,
      pcaId: 'repair-non-floor',
      pcaName: 'Hui Jun',
      assignedIn: 'step34',
      allocationStage: 'repair',
      repairReason: 'duplicate-reduction',
      fulfilledSlotRank: null,
      slotSelectionPhase: 'ranked-duplicate',
      pcaSelectionTier: 'non-floor',
      usedContinuity: false,
      duplicateSlot: true,
    }
  )

  const model = buildV2PcaTrackerTooltipModel({
    team: 'CPPC',
    allocationLog: tooltipModelLog,
    step3OrderPosition: 4,
  })
  assert.ok(model, 'Expected the V2 tooltip model builder to produce a model when tracker rows exist.')

  assert.equal(
    model.metaLine.includes('Rounded pending: 0.25'),
    true,
    'Expected the V2 tooltip header metadata to prefer the pre-Step-3.4 rounded pending value.'
  )

  assert.deepEqual(
    model.summaryCells.map((cell) => cell.label),
    ['Total', '3.4 Mix', 'Best ranked slot', 'Status'],
    'Expected the V2 tooltip model to preserve the approved mock reading pattern for the summary grid.'
  )

  assert.equal(
    model.repairIssuePills.includes('Ranked coverage gap') && model.repairIssuePills.includes('Duplicate pressure'),
    true,
    'Expected the V2 tooltip model to expose repair issues as strip pills using the approved chip copy.'
  )

  assert.equal(
    model.rows.some((row) =>
      row.details.some((detail) => detail.value === 'Ranked unassigned slot')
    ),
    true,
    'Expected V2 rows to use the approved ranked-slot wording rather than legacy slot phrasing.'
  )

  assert.equal(
    model.rows.some((row) =>
      row.details.some((detail) => detail.value === 'Unranked non-gym unassigned slot')
    ),
    true,
    'Expected V2 rows to use the approved unranked-slot wording rather than legacy slot phrasing.'
  )

  assert.equal(
    model.rows.some((row) =>
      row.tags.some((tag) => tag.includes('★')) ||
      row.details.some((detail) => detail.value.includes('★'))
    ),
    false,
    'Expected the standalone V2 tooltip model to stay free of legacy star-marker signals.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
