import type { TeamAllocationLog } from '@/types/schedule'
import type { Team } from '@/types/staff'

type AllocationAssignment = TeamAllocationLog['assignments'][number]

export interface V1PcaTrackerBufferAssignment {
  pcaId: string
  pcaName: string
  slots: number[]
}

interface V1PcaTrackerTooltipProps {
  team: Team
  hasAllocationAssignments: boolean
  hasBufferAssignments: boolean
  allocationLog?: TeamAllocationLog
  allocationOrderCycle1?: number
  allocationOrderCycle2?: number
  allocationOrderCycle3?: number
  totalActualSlots: number
  bufferFloatingSlots: number[]
  bufferFloatingAssignments: V1PcaTrackerBufferAssignment[]
  groupedByPCA: Map<string, Array<{ slot: number; assignment: AllocationAssignment }>>
  fulfilledByBufferOnly: boolean
  pendingPcaFte?: number
  floatingPoolRemainingFte?: number
}

function ordinalInQueue(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function getConditionDescription(condition?: 'A' | 'B' | 'C' | 'D'): string {
  switch (condition) {
    case 'A':
      return 'Preferred PCA + Preferred slot'
    case 'B':
      return 'Preferred slot only'
    case 'C':
      return 'Preferred PCA only'
    case 'D':
      return 'No preferences'
    default:
      return ''
  }
}

function describeAssignmentLineV1(assignment: AllocationAssignment): string {
  const cycleOrStep =
    assignment.assignedIn === 'step34'
      ? `C${assignment.cycle}${assignment.condition ? `-${getConditionDescription(assignment.condition)}` : ''}`
      : assignment.assignedIn === 'step32'
        ? 'From step 3.2'
        : assignment.assignedIn === 'step33'
          ? 'From step 3.3'
          : assignment.assignedIn === 'step30'
            ? 'From step 3.0'
            : assignment.assignedIn

  const stars =
    assignment.wasPreferredPCA && assignment.wasPreferredSlot
      ? ', ★PCA, ★Slot'
      : assignment.wasPreferredSlot
        ? ', ★Slot'
        : assignment.wasPreferredPCA
          ? ', ★PCA'
          : ''

  const floorTier =
    assignment.wasFloorPCA !== undefined ? (assignment.wasFloorPCA ? ', Floor' : ', Non-floor') : ''

  return `${cycleOrStep}${stars}${assignment.assignmentTag === 'remaining' ? ', remaining' : ''}${floorTier}${
    assignment.wasExcludedInCycle1 ? ', C2-unlocked' : ''
  }`
}

export function V1PcaTrackerTooltip({
  team,
  hasAllocationAssignments,
  hasBufferAssignments,
  allocationLog,
  allocationOrderCycle1,
  allocationOrderCycle2,
  allocationOrderCycle3,
  totalActualSlots,
  bufferFloatingSlots,
  bufferFloatingAssignments,
  groupedByPCA,
  fulfilledByBufferOnly,
  pendingPcaFte,
  floatingPoolRemainingFte,
}: V1PcaTrackerTooltipProps) {
  if (!hasAllocationAssignments && !hasBufferAssignments) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="font-semibold border-b border-gray-700 pb-1">Allocation Tracking - {team}</div>

      {hasAllocationAssignments && allocationLog?.summary?.allocationMode ? (
        <div className="text-[10px] text-gray-300">
          Mode: {allocationLog.summary.allocationMode === 'balanced' ? 'Balanced (take turns)' : 'Standard'}
        </div>
      ) : null}

      {allocationOrderCycle1 !== undefined ? (
        <div className="text-[10px] text-gray-300 space-y-0.5">
          {allocationOrderCycle3 !== undefined ? <div>{ordinalInQueue(allocationOrderCycle3)} in cycle 3</div> : null}
          {allocationOrderCycle2 !== undefined ? <div>{ordinalInQueue(allocationOrderCycle2)} in cycle 2</div> : null}
          <div>{ordinalInQueue(allocationOrderCycle1)} in cycle 1</div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-1 text-[10px] border-t border-gray-700 pt-1">
        <div>Total slots: {totalActualSlots}</div>
        {hasBufferAssignments ? <div>From 3.0: {bufferFloatingSlots.length}</div> : null}
        {hasAllocationAssignments ? (
          <>
            <div>From 3.2: {allocationLog?.summary.fromStep32 ?? 0}</div>
            <div>From 3.3: {allocationLog?.summary.fromStep33 ?? 0}</div>
            <div>
              From 3.4:{' '}
              {(allocationLog?.summary.fromStep34Cycle1 ?? 0) +
                (allocationLog?.summary.fromStep34Cycle2 ?? 0) +
                (allocationLog?.summary.fromStep34Cycle3 ?? 0)}
            </div>
          </>
        ) : null}
      </div>

      {!hasAllocationAssignments ? (
        <div className="text-[10px] border-t border-gray-700 pt-1 text-gray-300 space-y-1">
          <div>Pending (current): {typeof pendingPcaFte === 'number' ? pendingPcaFte.toFixed(2) : '—'}</div>
          {typeof pendingPcaFte === 'number' && pendingPcaFte <= 0.001 ? (
            <div>No floating PCA assignment needed (pending ≈ 0).</div>
          ) : (
            <div>
              No Step 3 assignments recorded for this team.
              {typeof floatingPoolRemainingFte === 'number' && floatingPoolRemainingFte <= 0.001
                ? ' Floating pool appears exhausted.'
                : typeof floatingPoolRemainingFte === 'number'
                  ? ' Floating pool still has capacity; constraints/preferences may have blocked assignment.'
                  : ''}
            </div>
          )}
        </div>
      ) : null}

      {fulfilledByBufferOnly ? (
        <div className="text-[10px] text-yellow-400 border-t border-gray-700 pt-1">
          Team pending requirement wholly fulfilled by manual buffer floating PCA assignment (Step 3.0)
        </div>
      ) : null}

      <div className="space-y-1 border-t border-gray-700 pt-1 max-h-48 overflow-y-auto">
        {bufferFloatingAssignments.map((bufferAssign, idx) => (
          <div key={`buffer-${idx}`} className="text-[10px]">
            <div className="font-medium">{bufferAssign.pcaName}:</div>
            {bufferAssign.slots.map((slot) => (
              <div key={slot} className="text-[10px] pl-4">
                slot {slot} (From step 3.0)
              </div>
            ))}
          </div>
        ))}

        {Array.from(groupedByPCA.entries()).map(([pcaName, slotAssignments]) => (
          <div key={pcaName} className="text-[10px]">
            <div className="font-medium">{pcaName}:</div>
            {slotAssignments.map(({ slot, assignment }) => (
              <div key={`${pcaName}-${slot}`} className="text-[10px] pl-4">
                slot {slot} ({describeAssignmentLineV1(assignment)})
              </div>
            ))}
          </div>
        ))}
      </div>

      {hasAllocationAssignments ? (
        <div className="text-[10px] border-t border-gray-700 pt-1 text-gray-400">
          AM/PM: {allocationLog?.summary.amPmBalanced ? '✓ Balanced' : '○ Not balanced'}
          {' | '}
          Gym: {allocationLog?.summary.gymSlotUsed ? '⚠ Used' : '✓ Avoided'}
        </div>
      ) : null}
    </div>
  )
}
