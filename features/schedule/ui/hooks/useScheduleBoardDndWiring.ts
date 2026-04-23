'use client'

import { createIdlePcaDragState } from '@/lib/features/schedule/dnd/dragState'
import { useScheduleBoardDnd, type ScheduleBoardDndParams } from '@/features/schedule/ui/hooks/useScheduleBoardDnd'
import {
  useSchedulePcaSlotTransfer,
  type UseSchedulePcaSlotTransferParams,
} from '@/features/schedule/ui/hooks/useSchedulePcaSlotTransfer'
import type { Team, Staff } from '@/types/staff'
import type { TherapistAllocation } from '@/types/schedule'
import type { Dispatch, SetStateAction } from 'react'

type TherapistAllocationsState = Record<Team, Array<TherapistAllocation & { staff: Staff }>>

/** Explicit composition of PCA slot transfer + board DnD; keeps a single `performSlotTransfer` / discard implementation from `useSchedulePcaSlotTransfer`. */
export type UseScheduleBoardDndWiringParams = Omit<
  ScheduleBoardDndParams,
  | 'performSlotTransfer'
  | 'performSlotDiscard'
  | 'performTherapistSlotDiscard'
  | 'resetPcaDragState'
  | 'removeTherapistAllocationFromTeam'
> &
  Omit<UseSchedulePcaSlotTransferParams, 'handleCloseSlotSelection'> & {
    setTherapistAllocations: Dispatch<SetStateAction<TherapistAllocationsState>>
  }

export function useScheduleBoardDndWiring(params: UseScheduleBoardDndWiringParams) {
  const resetPcaDragState = () => {
    params.setPcaDragState(createIdlePcaDragState())
  }

  const removeTherapistAllocationFromTeam = (
    staffId: string,
    sourceTeam: Team,
    options?: { skipUndoCheckpoint?: boolean; undoLabel?: string }
  ) => {
    if (!options?.skipUndoCheckpoint) {
      params.captureUndoCheckpoint(options?.undoLabel ?? 'Therapist slot discard')
    }
    params.setTherapistAllocations((prev) => ({
      ...prev,
      [sourceTeam]: prev[sourceTeam].filter((a) => a.staff_id !== staffId),
    }))

    params.setStaffOverrides((prev) => {
      const updated = { ...prev }
      if (updated[staffId]) {
        const { team, ...rest } = updated[staffId]
        if (Object.keys(rest).length === 0) {
          delete updated[staffId]
        } else {
          updated[staffId] = rest
        }
      }
      return updated
    })
  }

  const performTherapistSlotDiscard = (staffId: string, sourceTeam: Team, slotsToDiscard: number[]) => {
    if (slotsToDiscard.length === 0) return

    const currentAllocation = Object.values(params.therapistAllocations)
      .flat()
      .find((a) => a.staff_id === staffId && a.team === sourceTeam)

    if (!currentAllocation) return

    const staffMember = params.staff.find((s) => s.id === staffId)
    if (!staffMember || staffMember.rank !== 'SPT') return

    params.captureUndoCheckpoint('Therapist slot discard')
    removeTherapistAllocationFromTeam(staffId, sourceTeam, { skipUndoCheckpoint: true })
  }

  const { performSlotTransfer, performSlotDiscard, performPcaSlotAssignFromPool } = useSchedulePcaSlotTransfer({
    pcaAllocations: params.pcaAllocations,
    setPcaAllocations: params.setPcaAllocations,
    staff: params.staff,
    bufferStaff: params.bufferStaff,
    staffOverrides: params.staffOverrides,
    pcaDragState: params.pcaDragState,
    currentScheduleId: params.currentScheduleId,
    queueOptimisticPcaAction: params.queueOptimisticPcaAction,
    captureUndoCheckpoint: params.captureUndoCheckpoint,
    setPendingPCAFTEPerTeam: params.setPendingPCAFTEPerTeam,
    setStaffOverrides: params.setStaffOverrides,
    stripExtraCoverageOverrides: params.stripExtraCoverageOverrides,
    handleCloseSlotSelection: resetPcaDragState,
  })

  const { sensors, handleDragStart, handleDragMove, handleDragEnd } = useScheduleBoardDnd({
    closeStaffContextMenu: params.closeStaffContextMenu,
    closeStaffPoolContextMenu: params.closeStaffPoolContextMenu,
    staff: params.staff,
    setActiveDragStaffForOverlay: params.setActiveDragStaffForOverlay,
    therapistAllocationBlockRef: params.therapistAllocationBlockRef,
    pcaAllocationBlockRef: params.pcaAllocationBlockRef,
    currentStep: params.currentStep,
    therapistAllocations: params.therapistAllocations,
    staffOverrides: params.staffOverrides,
    setTherapistDragState: params.setTherapistDragState,
    pcaAllocations: params.pcaAllocations,
    pcaDragState: params.pcaDragState,
    setPcaDragState: params.setPcaDragState,
    therapistDragState: params.therapistDragState,
    triggerHaptic: params.triggerHaptic,
    staffContextMenu: params.staffContextMenu,
    staffPoolContextMenu: params.staffPoolContextMenu,
    calculatePopoverPosition: params.calculatePopoverPosition,
    getSlotsForTeam: params.getSlotsForTeam,
    getSpecialProgramSlotsForTeam: params.getSpecialProgramSlotsForTeam,
    captureUndoCheckpoint: params.captureUndoCheckpoint,
    setStaffOverrides: params.setStaffOverrides,
    performSlotTransfer,
    performSlotDiscard,
    performTherapistSlotDiscard,
    resetPcaDragState,
    removeTherapistAllocationFromTeam,
    setBufferStaff: params.setBufferStaff,
  })

  const handleStartDragFromPopover = () => {
    if (params.pcaDragState.selectedSlots.length === 0) return

    if (params.pcaDragState.isDiscardMode && params.pcaDragState.sourceTeam && params.pcaDragState.staffId) {
      const staffMember = params.staff.find((s) => s.id === params.pcaDragState.staffId)
      if (staffMember?.rank === 'SPT') {
        performTherapistSlotDiscard(
          params.pcaDragState.staffId,
          params.pcaDragState.sourceTeam,
          params.pcaDragState.selectedSlots
        )
      } else {
        performSlotDiscard(
          params.pcaDragState.staffId,
          params.pcaDragState.sourceTeam,
          params.pcaDragState.selectedSlots
        )
      }
      resetPcaDragState()
      return
    }

    params.setPcaDragState((prev) => ({
      ...prev,
      isActive: true,
      isDraggingFromPopover: true,
      showSlotSelection: false,
    }))
  }

  return {
    resetPcaDragState,
    removeTherapistAllocationFromTeam,
    performTherapistSlotDiscard,
    performSlotTransfer,
    performSlotDiscard,
    performPcaSlotAssignFromPool,
    handleStartDragFromPopover,
    sensors,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  }
}
