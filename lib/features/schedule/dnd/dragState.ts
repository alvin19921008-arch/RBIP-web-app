import { TEAMS } from '@/lib/features/schedule/constants'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'

export type TherapistDragState = {
  isActive: boolean
  staffId: string | null
  sourceTeam: Team | null
}

export type PcaDragState = {
  isActive: boolean
  isDraggingFromPopover: boolean
  staffId: string | null
  staffName: string | null
  sourceTeam: Team | null
  availableSlots: number[]
  selectedSlots: number[]
  showSlotSelection: boolean
  popoverPosition: { x: number; y: number } | null
  inferredTargetTeam: Team | null
  isDiscardMode: boolean
  isBufferStaff: boolean
}

export function createIdleTherapistDragState(): TherapistDragState {
  return {
    isActive: false,
    staffId: null,
    sourceTeam: null,
  }
}

export function createActiveTherapistDragState(args: {
  staffId: string
  sourceTeam: Team | null
}): TherapistDragState {
  return {
    isActive: true,
    staffId: args.staffId,
    sourceTeam: args.sourceTeam,
  }
}

export function createIdlePcaDragState(): PcaDragState {
  return {
    isActive: false,
    isDraggingFromPopover: false,
    staffId: null,
    staffName: null,
    sourceTeam: null,
    availableSlots: [],
    selectedSlots: [],
    showSlotSelection: false,
    popoverPosition: null,
    inferredTargetTeam: null,
    isDiscardMode: false,
    isBufferStaff: false,
  }
}

export function createActivePcaDragState(args: {
  staffId: string
  staffName: string | null
  sourceTeam: Team | null
  availableSlots: number[]
  selectedSlots: number[]
  popoverPosition: { x: number; y: number } | null
  isBufferStaff?: boolean
  inferredTargetTeam?: Team | null
}): PcaDragState {
  return {
    ...createIdlePcaDragState(),
    isActive: true,
    staffId: args.staffId,
    staffName: args.staffName,
    sourceTeam: args.sourceTeam,
    availableSlots: args.availableSlots,
    selectedSlots: args.selectedSlots,
    popoverPosition: args.popoverPosition,
    isBufferStaff: args.isBufferStaff ?? false,
    inferredTargetTeam: args.inferredTargetTeam ?? null,
  }
}

type PcaAllocationWithStaff = PCAAllocation & { staff: Staff }
export type PcaAllocationsByTeam = Record<Team, PcaAllocationWithStaff[]>

export type PcaOptimisticAction =
  | {
      type: 'transfer'
      staffId: string
      selectedSlots: number[]
      targetTeam: Team
    }
  | {
      type: 'discard'
      staffId: string
      slotsToDiscard: number[]
    }

function findPcaAllocationByStaffId(
  allocationsByTeam: PcaAllocationsByTeam,
  staffId: string
): PcaAllocationWithStaff | null {
  for (const team of TEAMS) {
    const teamAllocations = allocationsByTeam[team] || []
    const found = teamAllocations.find((allocation) => allocation.staff_id === staffId)
    if (found) return found
  }
  return null
}

function recalculateSlotAssigned(allocation: PcaAllocationWithStaff): PcaAllocationWithStaff {
  let slotCount = 0
  if (allocation.slot1) slotCount += 1
  if (allocation.slot2) slotCount += 1
  if (allocation.slot3) slotCount += 1
  if (allocation.slot4) slotCount += 1
  return {
    ...allocation,
    slot_assigned: slotCount * 0.25,
  }
}

function rebuildAllocationsByTeam(
  allocationsByTeam: PcaAllocationsByTeam,
  staffId: string,
  nextAllocation: PcaAllocationWithStaff
): PcaAllocationsByTeam {
  const nextByTeam = { ...allocationsByTeam } as PcaAllocationsByTeam

  for (const team of TEAMS) {
    nextByTeam[team] = (nextByTeam[team] || []).filter((allocation) => allocation.staff_id !== staffId)
  }

  const teamsWithSlots = new Set<Team>()
  if (nextAllocation.slot1) teamsWithSlots.add(nextAllocation.slot1)
  if (nextAllocation.slot2) teamsWithSlots.add(nextAllocation.slot2)
  if (nextAllocation.slot3) teamsWithSlots.add(nextAllocation.slot3)
  if (nextAllocation.slot4) teamsWithSlots.add(nextAllocation.slot4)

  for (const team of teamsWithSlots) {
    const allocationForTeam: PcaAllocationWithStaff = {
      ...nextAllocation,
      team,
    }
    nextByTeam[team] = [...(nextByTeam[team] || []), allocationForTeam]
  }

  return nextByTeam
}

export function applyPcaOptimisticAction(
  currentAllocations: PcaAllocationsByTeam,
  action: PcaOptimisticAction
): PcaAllocationsByTeam {
  const currentAllocation = findPcaAllocationByStaffId(currentAllocations, action.staffId)
  if (!currentAllocation) return currentAllocations

  if (action.type === 'transfer') {
    if (action.selectedSlots.length === 0) return currentAllocations

    const updatedAllocation = recalculateSlotAssigned({
      ...currentAllocation,
      slot1: action.selectedSlots.includes(1) ? action.targetTeam : currentAllocation.slot1,
      slot2: action.selectedSlots.includes(2) ? action.targetTeam : currentAllocation.slot2,
      slot3: action.selectedSlots.includes(3) ? action.targetTeam : currentAllocation.slot3,
      slot4: action.selectedSlots.includes(4) ? action.targetTeam : currentAllocation.slot4,
    })

    return rebuildAllocationsByTeam(currentAllocations, action.staffId, updatedAllocation)
  }

  if (action.slotsToDiscard.length === 0) return currentAllocations

  const updatedAllocation = recalculateSlotAssigned({
    ...currentAllocation,
    slot1: action.slotsToDiscard.includes(1) ? null : currentAllocation.slot1,
    slot2: action.slotsToDiscard.includes(2) ? null : currentAllocation.slot2,
    slot3: action.slotsToDiscard.includes(3) ? null : currentAllocation.slot3,
    slot4: action.slotsToDiscard.includes(4) ? null : currentAllocation.slot4,
  })

  return rebuildAllocationsByTeam(currentAllocations, action.staffId, updatedAllocation)
}
