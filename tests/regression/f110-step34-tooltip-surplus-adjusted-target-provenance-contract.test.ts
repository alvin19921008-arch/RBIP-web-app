import assert from 'node:assert/strict'

import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'
import type { TeamAllocationLog } from '../../types/schedule'

function main() {
  const allocationLog: TeamAllocationLog = {
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
    allocationLog,
  })

  assert.ok(model, 'Tooltip model should build when Step 3.4 rows exist.')
  const step34Row = model?.rows.find((row) => row.tags.includes('Draft'))
  assert.ok(step34Row, 'Expected a Step 3.4 draft row in tooltip rows.')
  assert.equal(
    step34Row?.details.some((detail) => detail.label === 'Target provenance'),
    false,
    'Raised-target surplus provenance line removed; extras use budgeted Extra after needs only.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
