import assert from 'node:assert/strict'

import { buildStep34TeamDetailViewModel } from '../../features/schedule/ui/steps/step3-floating/step34/step34ViewModel'
import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'
import { createEmptyTracker } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { TeamAllocationLog } from '../../types/schedule'

function makeEmptyLog(): TeamAllocationLog {
  return {
    team: 'FO',
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
      preStep34RoundedPendingFte: 0.25,
    },
  }
}

function makeResult(allocationLog: TeamAllocationLog) {
  const tracker = createEmptyTracker()
  tracker.FO = allocationLog
  return {
    allocations: [],
    totalPCAOnDuty: 0,
    pendingPCAFTEPerTeam: {
      FO: 0,
      SMM: 0,
      SFM: 0,
      CPPC: 0,
      MC: 0,
      GMC: 0,
      NSM: 0,
      DRO: 0,
    },
    tracker,
  } as any
}

const pcaPreferences: PCAPreference[] = [
  {
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: ['float-a', 'float-b'],
    preferred_slots: [2],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  },
]

async function main() {
  const upstreamStackedLog = makeEmptyLog()
  upstreamStackedLog.assignments.push({
    slot: 2,
    pcaId: 'float-a',
    pcaName: 'Float A',
    assignedIn: 'step34',
    allocationStage: 'draft',
    fulfilledSlotRank: 1,
    slotSelectionPhase: 'ranked-duplicate',
    pcaSelectionTier: 'preferred',
    usedContinuity: false,
    duplicateSlot: true,
    ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: 'non-floating' } as any),
  })
  upstreamStackedLog.summary.totalSlotsAssigned = 1
  upstreamStackedLog.summary.fromStep34Cycle1 = 1
  upstreamStackedLog.summary.usedDuplicateFloatingSlot = true
  upstreamStackedLog.summary.highestRankedSlotFulfilled = 1
  upstreamStackedLog.summary.preferredPCAUsed = true

  const upstreamPreview = buildStep34TeamDetailViewModel({
    team: 'FO',
    result: makeResult(upstreamStackedLog),
    pcaPreferences,
  })
  const upstreamTooltip = buildV2PcaTrackerTooltipModel({
    team: 'FO',
    allocationLog: upstreamStackedLog,
  })

  const upstreamPreviewSlot = upstreamPreview.slotCards.find((card) => card.slot === 2)
  const upstreamTooltipRow = upstreamTooltip?.rows.find((row) => row.slotLabel === 'slot 2')
  const upstreamTooltipSlotPath = upstreamTooltipRow?.details.find((detail) => detail.label === 'Slot path')

  assert.equal(
    upstreamPreviewSlot?.detailLabel,
    'To fulfill pending FTE.',
    'Preview should use neutral wording when upstream Step 2 coverage plus one Step 3 floating lands on the same slot.'
  )
  assert.equal(
    upstreamTooltipSlotPath?.value,
    'To fulfill pending FTE',
    'Tooltip should match the preview for upstream-covered stacked cases instead of leaking duplicate wording.'
  )

  const trueDuplicateLog = makeEmptyLog()
  trueDuplicateLog.assignments.push(
    {
      slot: 2,
      pcaId: 'float-a',
      pcaName: 'Float A',
      assignedIn: 'step34',
      allocationStage: 'draft',
      fulfilledSlotRank: 1,
      slotSelectionPhase: 'ranked-duplicate',
      pcaSelectionTier: 'preferred',
      usedContinuity: false,
      duplicateSlot: true,
      ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: null } as any),
    },
    {
      slot: 2,
      pcaId: 'float-b',
      pcaName: 'Float B',
      assignedIn: 'step34',
      allocationStage: 'repair',
      repairReason: 'duplicate-reduction',
      fulfilledSlotRank: 1,
      slotSelectionPhase: 'ranked-duplicate',
      pcaSelectionTier: 'non-floor',
      usedContinuity: false,
      duplicateSlot: true,
      ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: null } as any),
    }
  )
  trueDuplicateLog.summary.totalSlotsAssigned = 2
  trueDuplicateLog.summary.fromStep34Cycle1 = 1
  trueDuplicateLog.summary.fromStep34Cycle2 = 1
  trueDuplicateLog.summary.usedDuplicateFloatingSlot = true
  trueDuplicateLog.summary.highestRankedSlotFulfilled = 1

  const trueDuplicatePreview = buildStep34TeamDetailViewModel({
    team: 'FO',
    result: makeResult(trueDuplicateLog),
    pcaPreferences,
  })
  const trueDuplicateTooltip = buildV2PcaTrackerTooltipModel({
    team: 'FO',
    allocationLog: trueDuplicateLog,
  })

  const trueDuplicatePreviewSlot = trueDuplicatePreview.slotCards.find((card) => card.slot === 2)
  const trueDuplicateTooltipRow = trueDuplicateTooltip?.rows.find((row) => row.slotLabel === 'slot 2')
  const trueDuplicateTooltipSlotPath = trueDuplicateTooltipRow?.details.find(
    (detail) => detail.label === 'Slot path'
  )

  assert.equal(
    trueDuplicatePreviewSlot?.resultLabel.includes('Duplicate floating coverage'),
    true,
    'Preview should keep duplicate wording when two true Step 3 floating rows stack on the same slot.'
  )
  assert.equal(
    trueDuplicateTooltipSlotPath?.value,
    'Duplicate floating coverage',
    'Tooltip should keep duplicate wording when the slot truly has Step 3 floating-on-floating coverage.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
