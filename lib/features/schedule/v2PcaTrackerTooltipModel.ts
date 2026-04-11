import { getQualifyingDuplicateFloatingAssignmentsForSlot } from '@/lib/features/schedule/duplicateFloatingSemantics'
import {
  formatV2RepairAuditDefectLabel,
  formatV2RepairReasonLabel,
  formatV2SlotSelectionPhaseLabel,
} from '@/lib/features/schedule/pcaTrackerTooltip'
import {
  formatStep3FulfillmentSemanticsCompactLine,
  type Step3FloatingFulfillmentSemantics,
} from '@/lib/features/schedule/step3FloatingFulfillmentSemantics'
import type { TeamAllocationLog } from '@/types/schedule'
import type { Team } from '@/types/staff'

type AllocationAssignment = TeamAllocationLog['assignments'][number]

export interface V2PcaTrackerTooltipBufferAssignment {
  pcaId: string
  pcaName: string
  slots: number[]
}

export interface V2PcaTrackerSummaryCell {
  label: 'Total' | '3.4 Mix' | 'Best ranked slot' | 'Status'
  value: string
  subvalue?: string
}

export interface V2PcaTrackerDetailCell {
  label: string
  value: string
}

export interface V2PcaTrackerRowModel {
  id: string
  name: string
  slotLabel: string
  tags: string[]
  details: V2PcaTrackerDetailCell[]
}

export interface V2PcaTrackerTooltipModel {
  title: string
  metaLine: string
  reviewBadge: string | null
  summaryCells: V2PcaTrackerSummaryCell[]
  repairIssuePills: string[]
  rows: V2PcaTrackerRowModel[]
}

function ordinalInQueue(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function formatModeLabel(mode: TeamAllocationLog['summary']['allocationMode']): string | null {
  if (!mode) return null
  return mode === 'balanced' ? 'Balanced (take turns)' : 'Standard'
}

function buildMetaLine(args: {
  allocationLog?: TeamAllocationLog
  step3OrderPosition?: number
  pendingPcaFte?: number
}): string {
  const parts: string[] = []
  const modeLabel = formatModeLabel(args.allocationLog?.summary.allocationMode)
  if (modeLabel) parts.push(`Mode: ${modeLabel}`)
  if (typeof args.step3OrderPosition === 'number') {
    parts.push(`${ordinalInQueue(args.step3OrderPosition)} in queue`)
  }

  const roundedPending =
    typeof args.allocationLog?.summary.preStep34RoundedPendingFte === 'number'
      ? args.allocationLog.summary.preStep34RoundedPendingFte
      : args.pendingPcaFte
  if (typeof roundedPending === 'number') {
    parts.push(`Rounded pending: ${roundedPending.toFixed(2)}`)
  }

  return parts.join(' · ')
}

function buildTotalSubvalue(args: {
  allocationLog?: TeamAllocationLog
  bufferAssignments: V2PcaTrackerTooltipBufferAssignment[]
}): string | undefined {
  const parts: string[] = []
  const bufferCount = args.bufferAssignments.reduce((sum, assignment) => sum + assignment.slots.length, 0)
  if (bufferCount > 0) parts.push(`${bufferCount} from 3.0`)
  if (args.allocationLog?.summary.fromStep32) parts.push(`${args.allocationLog.summary.fromStep32} from 3.2`)
  if (args.allocationLog?.summary.fromStep33) parts.push(`${args.allocationLog.summary.fromStep33} from 3.3`)

  if (args.allocationLog) {
    const fromStep34 =
      args.allocationLog.summary.fromStep34Cycle1 +
      args.allocationLog.summary.fromStep34Cycle2 +
      args.allocationLog.summary.fromStep34Cycle3
    if (fromStep34 > 0) parts.push(`${fromStep34} from 3.4`)
  }

  return parts.length > 0 ? parts.join(', ') : undefined
}

function buildStatusCell(allocationLog?: TeamAllocationLog): Pick<V2PcaTrackerSummaryCell, 'value' | 'subvalue'> {
  if (!allocationLog) {
    return {
      value: 'No tracker data',
      subvalue: 'Hover details will appear after Step 3 runs.',
    }
  }

  const value = allocationLog.summary.pendingMet ? 'Met' : 'Still short'
  const amPmLabel = allocationLog.summary.amPmBalanced ? 'AM/PM balanced' : 'AM/PM mixed'
  const gymLabel = allocationLog.summary.gymSlotUsed ? 'Gym used' : 'Gym avoided'
  return {
    value,
    subvalue: `${amPmLabel} · ${gymLabel}`,
  }
}

function buildSummaryCells(args: {
  allocationLog?: TeamAllocationLog
  bufferAssignments: V2PcaTrackerTooltipBufferAssignment[]
  ownershipSemantics?: Step3FloatingFulfillmentSemantics
}): V2PcaTrackerSummaryCell[] {
  const totalSlots =
    (args.allocationLog?.summary.totalSlotsAssigned ?? 0) +
    args.bufferAssignments.reduce((sum, assignment) => sum + assignment.slots.length, 0)
  const step34Assignments = args.allocationLog?.assignments.filter((assignment) => assignment.assignedIn === 'step34') ?? []
  const draftCount = step34Assignments.filter((assignment) => assignment.allocationStage === 'draft').length
  const repairCount = step34Assignments.filter((assignment) => assignment.allocationStage === 'repair').length
  const extraCount = step34Assignments.filter((assignment) => assignment.allocationStage === 'extra-coverage').length
  const bestRank = args.allocationLog?.summary.highestRankedSlotFulfilled
  const status = buildStatusCell(args.allocationLog)

  return [
    {
      label: 'Total',
      value: `${totalSlots} slots`,
      subvalue: buildTotalSubvalue(args),
    },
    {
      label: '3.4 Mix',
      value: `draft ${draftCount} · repair ${repairCount} · extra ${extraCount}`,
      subvalue: args.ownershipSemantics
        ? formatStep3FulfillmentSemanticsCompactLine(args.ownershipSemantics)
        : undefined,
    },
    {
      label: 'Best ranked slot',
      value: typeof bestRank === 'number' ? `#${bestRank} met` : 'None met',
    },
    {
      label: 'Status',
      value: status.value,
      subvalue: status.subvalue,
    },
  ]
}

function getTierTag(assignment: AllocationAssignment): string | null {
  if (assignment.pcaSelectionTier === 'preferred') return 'Preferred PCA'
  if (assignment.pcaSelectionTier === 'floor') return 'Floor'
  if (assignment.pcaSelectionTier === 'non-floor') return 'Non-floor'
  return null
}

function getSourceTag(assignment: AllocationAssignment): string | null {
  if (assignment.assignedIn === 'step32') return 'Assigned in 3.2'
  if (assignment.assignedIn === 'step33') return 'Assigned in 3.3'
  if (assignment.assignedIn === 'step34') {
    if (assignment.allocationStage === 'draft') return 'Draft'
    if (assignment.allocationStage === 'repair') return 'Repair'
    if (assignment.allocationStage === 'extra-coverage') return 'Extra coverage'
  }
  return null
}

function getPcaMatchLabel(assignment: AllocationAssignment): string {
  if (assignment.pcaSelectionTier === 'preferred') return 'Preferred PCA'
  if (assignment.pcaSelectionTier === 'floor') return 'Floor-matched PCA'
  if (assignment.pcaSelectionTier === 'non-floor') return 'Non-floor PCA'
  return 'Available PCA'
}

function getSlotPathLabel(args: {
  team: Team
  assignment: AllocationAssignment
  allAssignments: AllocationAssignment[]
  staffOverrides?: Record<string, any>
}): string {
  const qualifyingDuplicates = getQualifyingDuplicateFloatingAssignmentsForSlot({
    team: args.team,
    slot: args.assignment.slot as 1 | 2 | 3 | 4,
    logsForSlot: args.allAssignments.filter((entry) => entry.slot === args.assignment.slot),
    staffOverrides: args.staffOverrides,
  })

  if (qualifyingDuplicates.length >= 2) {
    return 'Duplicate floating coverage'
  }

  if (args.assignment.slotSelectionPhase === 'ranked-duplicate' || args.assignment.duplicateSlot === true) {
    return 'To fulfill pending FTE'
  }

  const slotPath = formatV2SlotSelectionPhaseLabel(args.assignment.slotSelectionPhase)
  if (slotPath) return slotPath

  return 'Assigned during final allocation'
}

function buildStep34Details(args: {
  team: Team
  assignment: AllocationAssignment
  allAssignments: AllocationAssignment[]
  staffOverrides?: Record<string, any>
}): V2PcaTrackerDetailCell[] {
  const slotPath = getSlotPathLabel(args)
  if (args.assignment.allocationStage === 'repair') {
    return [
      {
        label: 'Repair reason',
        value: formatV2RepairReasonLabel(args.assignment.repairReason) ?? 'Review adjustment',
      },
      {
        label: 'Slot path',
        value: slotPath,
      },
      {
        label: 'Continuity',
        value: args.assignment.usedContinuity ? 'Yes' : 'No',
      },
    ]
  }

  return [
    {
      label: 'Slot rank',
      value:
        typeof args.assignment.fulfilledSlotRank === 'number' && args.assignment.fulfilledSlotRank > 0
          ? `Ranked slot #${args.assignment.fulfilledSlotRank}`
          : 'Not ranked',
    },
    {
      label: 'Slot path',
      value: slotPath,
    },
    {
      label: 'PCA match',
      value: getPcaMatchLabel(args.assignment),
    },
  ]
}

function buildCommittedDetails(assignment: AllocationAssignment): V2PcaTrackerDetailCell[] {
  return [
    {
      label: 'Source',
      value: 'Assigned before final allocation',
    },
    {
      label: 'Why kept',
      value: assignment.assignedIn === 'step33' ? 'Adjacent helper assignment' : 'Preferred slot assignment',
    },
    {
      label: 'Slot note',
      value: formatV2SlotSelectionPhaseLabel(assignment.slotSelectionPhase) ?? 'Committed slot',
    },
  ]
}

function buildBufferRows(
  bufferAssignments: V2PcaTrackerTooltipBufferAssignment[]
): V2PcaTrackerRowModel[] {
  return bufferAssignments.flatMap((assignment) =>
    assignment.slots.map((slot) => ({
      id: `buffer-${assignment.pcaId}-${slot}`,
      name: assignment.pcaName,
      slotLabel: `slot ${slot}`,
      tags: ['Assigned in 3.0'],
      details: [
        { label: 'Source', value: 'Manual buffer assignment' },
        { label: 'Why kept', value: 'Assigned before final allocation' },
        { label: 'Slot note', value: 'Committed slot' },
      ],
    }))
  )
}

function buildAssignmentRows(args: {
  team: Team
  allocationLog?: TeamAllocationLog
  bufferAssignments: V2PcaTrackerTooltipBufferAssignment[]
  staffOverrides?: Record<string, any>
}): V2PcaTrackerRowModel[] {
  const bufferRows = buildBufferRows(args.bufferAssignments)
  if (!args.allocationLog) return bufferRows

  const assignmentRows = args.allocationLog.assignments.map((assignment, index) => {
    const sourceTag = getSourceTag(assignment)
    const tierTag = getTierTag(assignment)
    const tags = [sourceTag, tierTag].filter((tag): tag is string => Boolean(tag))
    const details =
      assignment.assignedIn === 'step34'
        ? buildStep34Details({
            team: args.team,
            assignment,
            allAssignments: args.allocationLog?.assignments ?? [],
            staffOverrides: args.staffOverrides,
          })
        : assignment.assignedIn === 'step32' || assignment.assignedIn === 'step33'
          ? buildCommittedDetails(assignment)
          : [
              { label: 'Source', value: 'Assigned before final allocation' },
              { label: 'Why kept', value: 'Manual buffer assignment' },
              { label: 'Slot note', value: 'Committed slot' },
            ]

    return {
      id: `${assignment.pcaId}-${assignment.slot}-${index}`,
      name: assignment.pcaName || 'PCA',
      slotLabel: `slot ${assignment.slot}`,
      tags,
      details,
    }
  })

  return [...bufferRows, ...assignmentRows]
}

export function buildV2PcaTrackerTooltipModel(args: {
  team: Team
  allocationLog?: TeamAllocationLog
  bufferAssignments?: V2PcaTrackerTooltipBufferAssignment[]
  step3OrderPosition?: number
  pendingPcaFte?: number
  staffOverrides?: Record<string, any>
  ownershipSemantics?: Step3FloatingFulfillmentSemantics
}): V2PcaTrackerTooltipModel | null {
  const bufferAssignments = args.bufferAssignments ?? []
  const hasAllocationRows = (args.allocationLog?.assignments.length ?? 0) > 0
  const hasBufferRows = bufferAssignments.some((assignment) => assignment.slots.length > 0)

  if (!hasAllocationRows && !hasBufferRows) return null

  return {
    title: `Allocation Tracking - ${args.team}`,
    metaLine: buildMetaLine({
      allocationLog: args.allocationLog,
      step3OrderPosition: args.step3OrderPosition,
      pendingPcaFte: args.pendingPcaFte,
    }),
    reviewBadge: 'Review',
    summaryCells: buildSummaryCells({
      allocationLog: args.allocationLog,
      bufferAssignments,
      ownershipSemantics: args.ownershipSemantics,
    }),
    repairIssuePills:
      args.allocationLog?.summary.repairAuditDefects?.map((defect) => formatV2RepairAuditDefectLabel(defect)) ?? [],
    rows: buildAssignmentRows({
      team: args.team,
      allocationLog: args.allocationLog,
      bufferAssignments,
      staffOverrides: args.staffOverrides,
    }),
  }
}
