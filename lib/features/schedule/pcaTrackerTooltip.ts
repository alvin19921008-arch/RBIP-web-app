import type { TeamAllocationLog } from '../../../types/schedule'
import type { Step3FlowChoice } from './step3DialogFlow'
import { V2_GYM_UI_AVOIDANCE_REPAIR_APPLIED, V2_GYM_UI_LAST_RESORT_SLOT_PATH } from './v2GymUiStrings'

export type PcaTrackerTooltipVariant = 'v1' | 'v2'

type SlotAssignmentLogRow = TeamAllocationLog['assignments'][number]

export function formatV2SlotSelectionPhaseLabel(
  phase: SlotAssignmentLogRow['slotSelectionPhase'] | undefined
): string | null {
  if (!phase) return null
  if (phase === 'ranked-unused') return 'Ranked unassigned slot'
  if (phase === 'unranked-unused') return 'Unranked non-gym unassigned slot'
  if (phase === 'ranked-duplicate') return 'Ranked duplicate assignment'
  if (phase === 'gym-last-resort') return V2_GYM_UI_LAST_RESORT_SLOT_PATH
  return null
}

export function formatV2RepairReasonLabel(
  reason: SlotAssignmentLogRow['repairReason'] | undefined | null
): string | null {
  if (!reason) return null
  if (reason === 'ranked-coverage') return 'Ranked coverage'
  if (reason === 'fairness-floor') return 'Fairness'
  if (reason === 'duplicate-reduction') return 'Duplicate reduction'
  if (reason === 'continuity-reduction') return 'Continuity'
  if (reason === 'ranked-promotion') return 'Ranked promotion via bounded swap'
  if (reason === 'gym-avoidance') return V2_GYM_UI_AVOIDANCE_REPAIR_APPLIED
  return null
}

export function formatV2RepairAuditDefectLabel(kind: 'B1' | 'A1' | 'A2' | 'C1' | 'F1' | 'G1'): string {
  switch (kind) {
    case 'B1':
      return 'Ranked coverage gap'
    case 'A1':
    case 'A2':
      return 'Duplicate pressure'
    case 'C1':
      return 'Continuity'
    case 'F1':
      return 'Fairness floor'
    case 'G1':
      return 'Avoidable gym (bounded off-gym reshuffle exists)'
    default:
      return kind
  }
}

function hasV2TrackerMetadata(allocationLog?: TeamAllocationLog): boolean {
  if (!allocationLog) return false
  if ((allocationLog.summary.repairAuditDefects?.length ?? 0) > 0) return true
  if (allocationLog.summary.highestRankedSlotFulfilled != null) return true

  return allocationLog.assignments.some((assignment) => {
    return (
      assignment.allocationStage != null ||
      assignment.repairReason != null ||
      assignment.fulfilledSlotRank != null ||
      assignment.slotSelectionPhase != null ||
      assignment.pcaSelectionTier != null ||
      assignment.usedContinuity != null ||
      assignment.duplicateSlot != null
    )
  })
}

export function selectPcaTrackerTooltipVariant(args: {
  explicitFlowSurface?: Step3FlowChoice | null
  allocationLog?: TeamAllocationLog
}): PcaTrackerTooltipVariant {
  if (args.explicitFlowSurface === 'v1-legacy') return 'v1'
  if (args.explicitFlowSurface === 'v2-ranked') return 'v2'
  return hasV2TrackerMetadata(args.allocationLog) ? 'v2' : 'v1'
}
