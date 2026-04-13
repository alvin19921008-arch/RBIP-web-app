import assert from 'node:assert/strict'

import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'
import type { TeamAllocationLog } from '../../types/schedule'

function main() {
  const allocationLogWithProvenance: TeamAllocationLog = {
    team: 'SMM',
    assignments: [
      {
        slot: 4,
        pcaId: 'smm-a',
        pcaName: '淑貞',
        assignedIn: 'step34',
        allocationStage: 'draft',
        cycle: 3,
        step3OwnershipKind: 'step3-floating',
        upstreamCoverageKind: 'non-floating',
        fulfilledSlotRank: null,
        slotSelectionPhase: 'unranked-unused',
        pcaSelectionTier: 'non-floor',
        usedContinuity: false,
        v2EnabledBySurplusAdjustedTarget: true,
      },
    ],
    summary: {
      totalSlotsAssigned: 1,
      fromStep30: 0,
      fromStep32: 0,
      fromStep33: 0,
      fromStep34Cycle1: 0,
      fromStep34Cycle2: 0,
      fromStep34Cycle3: 1,
      preferredSlotFilled: false,
      preferredPCAsUsed: 0,
      floorPCAsUsed: 0,
      nonFloorPCAsUsed: 1,
      amPmBalanced: true,
      gymSlotUsed: false,
      gymUsageStatus: 'avoided',
      pendingMet: true,
      highestRankedSlotFulfilled: null,
      usedUnrankedSlot: true,
      usedDuplicateFloatingSlot: false,
      gymUsedAsLastResort: false,
      preferredPCAUsed: false,
      fulfilledByBuffer: false,
      allocationMode: 'standard',
      repairAuditDefects: [],
      preStep34RoundedPendingFte: 0.5,
      v2RealizedSurplusSlotGrant: 1,
    },
  }

  const model = buildV2PcaTrackerTooltipModel({
    team: 'SMM',
    allocationLog: allocationLogWithProvenance,
  })

  assert.ok(model, 'Tooltip model should build when Step 3.4 rows exist.')
  const step34Row = model?.rows.find((row) => row.tags.includes('Draft'))
  assert.ok(step34Row, 'Expected a Step 3.4 draft row in tooltip rows.')
  const provenance = step34Row?.details.find((detail) => detail.label === 'Target provenance')
  assert.equal(
    provenance?.value,
    'Surplus-adjusted rounded target enabled this slot.',
    'When surplus grant exists and a Step 3.4 row is flagged, tooltip details should explain surplus-adjusted target provenance.'
  )

  const noGrantLog: TeamAllocationLog = {
    ...allocationLogWithProvenance,
    summary: {
      ...allocationLogWithProvenance.summary,
      v2RealizedSurplusSlotGrant: 0,
    },
  }
  const modelNoGrant = buildV2PcaTrackerTooltipModel({ team: 'SMM', allocationLog: noGrantLog })
  const rowNoGrant = modelNoGrant?.rows.find((row) => row.tags.includes('Draft'))
  assert.equal(
    rowNoGrant?.details.some((detail) => detail.label === 'Target provenance'),
    false,
    'Without a realized surplus grant, do not show surplus target provenance even if a row is flagged.'
  )

  const noFlagLog: TeamAllocationLog = {
    ...allocationLogWithProvenance,
    assignments: allocationLogWithProvenance.assignments.map((assignment) => ({
      ...assignment,
      v2EnabledBySurplusAdjustedTarget: false,
    })),
  }
  const modelNoFlag = buildV2PcaTrackerTooltipModel({ team: 'SMM', allocationLog: noFlagLog })
  const rowNoFlag = modelNoFlag?.rows.find((row) => row.tags.includes('Draft'))
  assert.equal(
    rowNoFlag?.details.some((detail) => detail.label === 'Target provenance'),
    false,
    'Without a per-row surplus uplift flag, do not show provenance even when a grant exists.'
  )

  assert.equal(
    model?.summaryCells.some((cell) => cell.label === 'Surplus target' || (cell.subvalue ?? '').includes('Surplus')),
    false,
    'Surplus explanation must stay in row details only (no new summary badge/chip lane).'
  )

  const withProjectionTrace: TeamAllocationLog = {
    ...allocationLogWithProvenance,
    summary: {
      ...allocationLogWithProvenance.summary,
      v2SurplusProvenanceGrantReadSource: 'step3_projection_v2',
      v2SurplusProvenanceProjectionVersion: '{"teams":["SMM"],"mode":"v2"}',
    },
  }
  const modelTrace = buildV2PcaTrackerTooltipModel({ team: 'SMM', allocationLog: withProjectionTrace })
  const step34RowTrace = modelTrace?.rows.find((row) => row.tags.includes('Draft'))
  const handoffTrace = step34RowTrace?.details.find((detail) => detail.label === 'Handoff trace')
  assert.ok(
    handoffTrace?.value.includes('Frozen Step 3 projection fingerprint'),
    'When surplus stamping records a projection fingerprint, row details should include a handoff trace line.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
