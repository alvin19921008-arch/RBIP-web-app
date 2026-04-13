import assert from 'node:assert/strict'

import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'
import type { TeamAllocationLog } from '../../types/schedule'

function main() {
  const allocationLog: TeamAllocationLog = {
    team: 'SMM',
    assignments: [
      {
        slot: 1,
        pcaId: 'smm-a',
        pcaName: '淑貞',
        assignedIn: 'step34',
        allocationStage: 'draft',
        cycle: 3,
        step3OwnershipKind: 'step3-floating',
        upstreamCoverageKind: 'special-program',
        fulfilledSlotRank: 1,
        slotSelectionPhase: 'ranked-unused',
        pcaSelectionTier: 'non-floor',
        usedContinuity: false,
        duplicateSlot: true,
      },
      {
        slot: 3,
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
        usedContinuity: true,
        duplicateSlot: true,
      },
    ],
    summary: {
      totalSlotsAssigned: 2,
      fromStep30: 0,
      fromStep32: 0,
      fromStep33: 0,
      fromStep34Cycle1: 0,
      fromStep34Cycle2: 0,
      fromStep34Cycle3: 2,
      preferredSlotFilled: true,
      preferredPCAsUsed: 0,
      floorPCAsUsed: 0,
      nonFloorPCAsUsed: 2,
      amPmBalanced: true,
      gymSlotUsed: false,
      gymUsageStatus: 'avoided',
      pendingMet: true,
      highestRankedSlotFulfilled: 1,
      usedUnrankedSlot: true,
      usedDuplicateFloatingSlot: false,
      gymUsedAsLastResort: false,
      preferredPCAUsed: false,
      fulfilledByBuffer: false,
      allocationMode: 'standard',
      repairAuditDefects: ['A2'],
      preStep34RoundedPendingFte: 0.5,
    },
  }

  const model = buildV2PcaTrackerTooltipModel({
    team: 'SMM',
    allocationLog,
  })

  assert.ok(model, 'Tooltip model should build for a team with Step 3.4 assignments.')
  assert.equal(
    model?.repairIssuePills.includes('Duplicate pressure'),
    false,
    'A2 alone should not render a Duplicate pressure pill when true duplicate-floating semantics are false.'
  )
  assert.equal(
    model?.rows[0]?.details.find((detail) => detail.label === 'Slot path')?.value,
    'Ranked unassigned slot',
    'Tracker tooltip should use the specific ranked-slot path label instead of generic pending text.'
  )
  assert.equal(
    model?.rows[1]?.details.find((detail) => detail.label === 'Slot path')?.value,
    'Unranked non-gym unassigned slot',
    'Tracker tooltip should use the specific unranked-slot path label instead of generic pending text.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
