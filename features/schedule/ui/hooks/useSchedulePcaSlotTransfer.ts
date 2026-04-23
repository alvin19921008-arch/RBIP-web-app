'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { Team, Staff } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { StaffOverrideState } from '@/lib/features/schedule/controller/scheduleControllerTypes'
import { createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { TEAMS } from '@/lib/features/schedule/constants'
import type { PcaDragState, PcaOptimisticAction } from '@/lib/features/schedule/dnd/dragState'
import { stripExtraCoverageOverrides as stripExtraCoverageOverridesRef } from '@/lib/features/schedule/extraCoverageVisibility'

type PcaAllocationWithStaff = PCAAllocation & { staff: Staff }

export type UseSchedulePcaSlotTransferParams = {
  pcaAllocations: Record<Team, PcaAllocationWithStaff[]>
  setPcaAllocations: Dispatch<SetStateAction<Record<Team, PcaAllocationWithStaff[]>>>
  staff: Staff[]
  bufferStaff: Staff[]
  staffOverrides: Record<string, StaffOverrideState>
  pcaDragState: PcaDragState
  currentScheduleId: string | null
  queueOptimisticPcaAction: (action: PcaOptimisticAction) => void
  captureUndoCheckpoint: (label: string) => void
  setPendingPCAFTEPerTeam: Dispatch<SetStateAction<Record<Team, number>>>
  setStaffOverrides: Dispatch<SetStateAction<Record<string, StaffOverrideState>>>
  stripExtraCoverageOverrides: typeof stripExtraCoverageOverridesRef
  handleCloseSlotSelection: () => void
}

export function useSchedulePcaSlotTransfer(params: UseSchedulePcaSlotTransferParams) {
  const {
    pcaAllocations,
    setPcaAllocations,
    staff,
    bufferStaff,
    staffOverrides,
    pcaDragState,
    currentScheduleId,
    queueOptimisticPcaAction,
    captureUndoCheckpoint,
    setPendingPCAFTEPerTeam,
    setStaffOverrides,
    stripExtraCoverageOverrides,
    handleCloseSlotSelection,
  } = params

  const rebuildPcaAllocationsForStaff = useCallback(
    (base: Record<Team, PcaAllocationWithStaff[]>, staffId: string, updatedAllocation: PcaAllocationWithStaff | null) => {
      const next = createEmptyTeamRecordFactory<PcaAllocationWithStaff[]>(() => [])
      TEAMS.forEach((team) => {
        next[team] = (base[team] || []).filter((a) => a.staff_id !== staffId)
      })

      if (!updatedAllocation) return next

      const teamsWithSlots = new Set<Team>()
      if (updatedAllocation.slot1) teamsWithSlots.add(updatedAllocation.slot1)
      if (updatedAllocation.slot2) teamsWithSlots.add(updatedAllocation.slot2)
      if (updatedAllocation.slot3) teamsWithSlots.add(updatedAllocation.slot3)
      if (updatedAllocation.slot4) teamsWithSlots.add(updatedAllocation.slot4)

      for (const team of teamsWithSlots) {
        next[team] = [...(next[team] || []), { ...updatedAllocation, team }]
      }
      return next
    },
    []
  )

  const performSlotDiscard = useCallback(
    (staffId: string, sourceTeam: Team, slotsToDiscard: number[]) => {
      if (slotsToDiscard.length === 0) return

      const currentAllocation = Object.values(pcaAllocations).flat().find((a) => a.staff_id === staffId)

      if (!currentAllocation) return
      captureUndoCheckpoint('PCA slot discard')
      queueOptimisticPcaAction({
        type: 'discard',
        staffId,
        slotsToDiscard,
      })

      const staffMember = staff.find((s) => s.id === staffId)
      const isBufferStaff = staffMember?.status === 'buffer'
      const bufferFTE = staffMember?.buffer_fte

      const fteDiscarded = slotsToDiscard.length * 0.25

      const updatedAllocation = { ...currentAllocation }
      for (const slot of slotsToDiscard) {
        if (slot === 1) updatedAllocation.slot1 = null
        if (slot === 2) updatedAllocation.slot2 = null
        if (slot === 3) updatedAllocation.slot3 = null
        if (slot === 4) updatedAllocation.slot4 = null
      }
      const remainingSlots = [
        updatedAllocation.slot1,
        updatedAllocation.slot2,
        updatedAllocation.slot3,
        updatedAllocation.slot4,
      ].filter((s) => s !== null).length
      updatedAllocation.slot_assigned = remainingSlots * 0.25
      const nextPcaAllocations = rebuildPcaAllocationsForStaff(pcaAllocations, staffId, updatedAllocation as PcaAllocationWithStaff)
      setPcaAllocations(nextPcaAllocations)

      const effectiveFTE = isBufferStaff && bufferFTE !== undefined ? bufferFTE : fteDiscarded
      setPendingPCAFTEPerTeam((prev) => ({
        ...prev,
        [sourceTeam]: (prev[sourceTeam] || 0) + effectiveFTE,
      }))

      setStaffOverrides((prev) => {
        const current = prev[staffId] || {}
        const slotOverrides = current.slotOverrides || {}

        const currentSlot1 = currentAllocation.slot1
        const currentSlot2 = currentAllocation.slot2
        const currentSlot3 = currentAllocation.slot3
        const currentSlot4 = currentAllocation.slot4

        const updatedSlotOverrides = {
          slot1: slotsToDiscard.includes(1) ? null : (slotOverrides.slot1 ?? currentSlot1),
          slot2: slotsToDiscard.includes(2) ? null : (slotOverrides.slot2 ?? currentSlot2),
          slot3: slotsToDiscard.includes(3) ? null : (slotOverrides.slot3 ?? currentSlot3),
          slot4: slotsToDiscard.includes(4) ? null : (slotOverrides.slot4 ?? currentSlot4),
        }

        const manual = (current as any).bufferManualSlotOverrides || {}
        const updatedManualSlotOverrides = isBufferStaff
          ? {
              slot1: slotsToDiscard.includes(1) ? null : (manual.slot1 ?? updatedSlotOverrides.slot1 ?? null),
              slot2: slotsToDiscard.includes(2) ? null : (manual.slot2 ?? updatedSlotOverrides.slot2 ?? null),
              slot3: slotsToDiscard.includes(3) ? null : (manual.slot3 ?? updatedSlotOverrides.slot3 ?? null),
              slot4: slotsToDiscard.includes(4) ? null : (manual.slot4 ?? updatedSlotOverrides.slot4 ?? null),
            }
          : undefined

        const rawNextOverrides = {
          ...prev,
          [staffId]: {
            ...current,
            slotOverrides: updatedSlotOverrides,
            ...(isBufferStaff ? { bufferManualSlotOverrides: updatedManualSlotOverrides } : {}),
          },
        }
        return stripExtraCoverageOverrides(rawNextOverrides as any)
      })
    },
    [
      pcaAllocations,
      staff,
      queueOptimisticPcaAction,
      captureUndoCheckpoint,
      rebuildPcaAllocationsForStaff,
      setPcaAllocations,
      setPendingPCAFTEPerTeam,
      setStaffOverrides,
      stripExtraCoverageOverrides,
    ]
  )

  const performSlotTransfer = useCallback(
    (
      targetTeam: Team,
      options?: { staffId: string; sourceTeam: Team | null; selectedSlots: number[]; closeSlotPopover?: boolean }
    ) => {
      const closeIfNeeded = () => {
        if (options?.closeSlotPopover === false) return
        handleCloseSlotSelection()
      }

      const staffId = options?.staffId ?? pcaDragState.staffId
      const sourceTeam = options?.sourceTeam ?? pcaDragState.sourceTeam
      const selectedSlots = options?.selectedSlots ?? pcaDragState.selectedSlots

      if (!staffId || selectedSlots.length === 0) {
        closeIfNeeded()
        return
      }

      const currentAllocation = Object.values(pcaAllocations).flat().find((a) => a.staff_id === staffId)

      const staffMember = staff.find((s) => s.id === staffId)
      const isBufferStaff = staffMember?.status === 'buffer'
      const bufferFTE = staffMember?.buffer_fte

      if (!currentAllocation && isBufferStaff && bufferFTE !== undefined) {
        captureUndoCheckpoint('PCA slot transfer')
        const newAllocation: PcaAllocationWithStaff = {
          id: `temp-${staffId}-${Date.now()}`,
          schedule_id: currentScheduleId || '',
          staff_id: staffId,
          team: targetTeam,
          fte_pca: bufferFTE,
          fte_remaining: bufferFTE,
          slot_assigned: selectedSlots.length * 0.25,
          slot_whole: null,
          slot1: selectedSlots.includes(1) ? targetTeam : null,
          slot2: selectedSlots.includes(2) ? targetTeam : null,
          slot3: selectedSlots.includes(3) ? targetTeam : null,
          slot4: selectedSlots.includes(4) ? targetTeam : null,
          leave_type: null,
          special_program_ids: null,
          invalid_slot: undefined,
          fte_subtraction: 0,
          staff: staffMember,
        }

        const nextPcaAllocations = rebuildPcaAllocationsForStaff(pcaAllocations, staffId, newAllocation)
        setPcaAllocations(nextPcaAllocations)

        setStaffOverrides((prev) => {
          const rawNextOverrides = {
            ...prev,
            [staffId]: {
              ...prev[staffId],
              slotOverrides: {
                slot1: selectedSlots.includes(1) ? targetTeam : null,
                slot2: selectedSlots.includes(2) ? targetTeam : null,
                slot3: selectedSlots.includes(3) ? targetTeam : null,
                slot4: selectedSlots.includes(4) ? targetTeam : null,
              },
              bufferManualSlotOverrides: {
                slot1: selectedSlots.includes(1) ? targetTeam : null,
                slot2: selectedSlots.includes(2) ? targetTeam : null,
                slot3: selectedSlots.includes(3) ? targetTeam : null,
                slot4: selectedSlots.includes(4) ? targetTeam : null,
              },
              fteRemaining: bufferFTE,
            },
          }
          return stripExtraCoverageOverrides(rawNextOverrides as any)
        })

        const fteTransferred = bufferFTE
        setPendingPCAFTEPerTeam((prev) => ({
          ...prev,
          [targetTeam]: Math.max(0, (prev[targetTeam] || 0) - fteTransferred),
        }))

        closeIfNeeded()
        return
      }

      if (!currentAllocation) {
        closeIfNeeded()
        return
      }
      captureUndoCheckpoint('PCA slot transfer')
      queueOptimisticPcaAction({
        type: 'transfer',
        staffId,
        selectedSlots,
        targetTeam,
      })

      const effectiveSourceTeam = sourceTeam || currentAllocation.team

      const updatedAllocation = { ...currentAllocation }
      for (const slot of selectedSlots) {
        if (slot === 1) updatedAllocation.slot1 = targetTeam
        if (slot === 2) updatedAllocation.slot2 = targetTeam
        if (slot === 3) updatedAllocation.slot3 = targetTeam
        if (slot === 4) updatedAllocation.slot4 = targetTeam
      }
      let slotCount = 0
      if (updatedAllocation.slot1) slotCount++
      if (updatedAllocation.slot2) slotCount++
      if (updatedAllocation.slot3) slotCount++
      if (updatedAllocation.slot4) slotCount++
      updatedAllocation.slot_assigned = slotCount * 0.25
      const nextPcaAllocations = rebuildPcaAllocationsForStaff(pcaAllocations, staffId, updatedAllocation as PcaAllocationWithStaff)
      setPcaAllocations(nextPcaAllocations)

      setStaffOverrides((prev) => {
        const currentOverride = prev[staffId] || {}
        const existingAlloc = currentAllocation

        const newSlot1 = selectedSlots.includes(1) ? targetTeam : existingAlloc?.slot1
        const newSlot2 = selectedSlots.includes(2) ? targetTeam : existingAlloc?.slot2
        const newSlot3 = selectedSlots.includes(3) ? targetTeam : existingAlloc?.slot3
        const newSlot4 = selectedSlots.includes(4) ? targetTeam : existingAlloc?.slot4

        const rawNextOverrides = {
          ...prev,
          [staffId]: {
            ...currentOverride,
            slotOverrides: {
              slot1: newSlot1,
              slot2: newSlot2,
              slot3: newSlot3,
              slot4: newSlot4,
            },
            ...(isBufferStaff
              ? {
                  bufferManualSlotOverrides: {
                    ...(currentOverride as any).bufferManualSlotOverrides,
                    slot1: selectedSlots.includes(1)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot1 ?? existingAlloc?.slot1 ?? null,
                    slot2: selectedSlots.includes(2)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot2 ?? existingAlloc?.slot2 ?? null,
                    slot3: selectedSlots.includes(3)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot3 ?? existingAlloc?.slot3 ?? null,
                    slot4: selectedSlots.includes(4)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot4 ?? existingAlloc?.slot4 ?? null,
                  },
                }
              : {}),
            fteRemaining: currentOverride.fteRemaining ?? existingAlloc?.fte_pca ?? 1.0,
            leaveType: currentOverride.leaveType ?? existingAlloc?.leave_type ?? null,
          },
        }
        return stripExtraCoverageOverrides(rawNextOverrides as any)
      })

      const fteTransferred = selectedSlots.length * 0.25
      const effectiveFTE = isBufferStaff && bufferFTE !== undefined ? bufferFTE : fteTransferred
      setPendingPCAFTEPerTeam((prev) => ({
        ...prev,
        [effectiveSourceTeam]: Math.max(0, (prev[effectiveSourceTeam] || 0) + effectiveFTE),
        [targetTeam]: Math.max(0, (prev[targetTeam] || 0) - effectiveFTE),
      }))

      closeIfNeeded()
    },
    [
      pcaAllocations,
      staff,
      pcaDragState.staffId,
      pcaDragState.sourceTeam,
      pcaDragState.selectedSlots,
      currentScheduleId,
      queueOptimisticPcaAction,
      captureUndoCheckpoint,
      rebuildPcaAllocationsForStaff,
      setPcaAllocations,
      setStaffOverrides,
      stripExtraCoverageOverrides,
      setPendingPCAFTEPerTeam,
      handleCloseSlotSelection,
    ]
  )

  const performPcaSlotAssignFromPool = useCallback(
    (targetTeam: Team, options: { staffId: string; selectedSlots: number[] }) => {
      const staffId = options.staffId
      const selectedSlots = options.selectedSlots
      if (!staffId || selectedSlots.length === 0) return

      const staffMember = staff.find((s) => s.id === staffId) || bufferStaff.find((s) => s.id === staffId)
      if (!staffMember) return
      if (staffMember.rank !== 'PCA' || !staffMember.floating) return
      captureUndoCheckpoint('PCA slot assignment')

      const currentAllocation = Object.values(pcaAllocations).flat().find((a) => a.staff_id === staffId)

      const override = staffOverrides[staffId]
      const bufferFTEraw = (staffMember as any).buffer_fte
      const bufferFTE =
        typeof bufferFTEraw === 'number' ? bufferFTEraw : bufferFTEraw != null ? parseFloat(String(bufferFTEraw)) : NaN
      const capacityFTE =
        typeof override?.fteRemaining === 'number'
          ? override.fteRemaining
          : staffMember.status === 'buffer' && Number.isFinite(bufferFTE)
            ? bufferFTE
            : 1.0

      const baseAlloc = currentAllocation
        ? { ...currentAllocation }
        : ({
            id: `temp-assign-${staffId}-${Date.now()}`,
            schedule_id: currentScheduleId || '',
            staff_id: staffId,
            team: targetTeam,
            fte_pca: capacityFTE,
            fte_remaining: capacityFTE,
            slot_assigned: 0,
            slot_whole: null,
            slot1: null,
            slot2: null,
            slot3: null,
            slot4: null,
            leave_type: null,
            special_program_ids: null,
            invalid_slot: undefined,
            fte_subtraction: 0,
            staff: staffMember,
          } as any)

      const updatedAllocation: any = { ...baseAlloc }
      for (const slot of selectedSlots) {
        if (slot === 1) updatedAllocation.slot1 = targetTeam
        if (slot === 2) updatedAllocation.slot2 = targetTeam
        if (slot === 3) updatedAllocation.slot3 = targetTeam
        if (slot === 4) updatedAllocation.slot4 = targetTeam
      }

      let slotCount = 0
      if (updatedAllocation.slot1) slotCount++
      if (updatedAllocation.slot2) slotCount++
      if (updatedAllocation.slot3) slotCount++
      if (updatedAllocation.slot4) slotCount++
      updatedAllocation.slot_assigned = slotCount * 0.25

      const nextPcaAllocations = rebuildPcaAllocationsForStaff(pcaAllocations, staffId, updatedAllocation as PcaAllocationWithStaff)
      setPcaAllocations(nextPcaAllocations)

      setStaffOverrides((prev) => {
        const currentOverride = prev[staffId] || {}
        const existingAlloc = baseAlloc
        const newSlot1 = selectedSlots.includes(1) ? targetTeam : existingAlloc?.slot1 ?? null
        const newSlot2 = selectedSlots.includes(2) ? targetTeam : existingAlloc?.slot2 ?? null
        const newSlot3 = selectedSlots.includes(3) ? targetTeam : existingAlloc?.slot3 ?? null
        const newSlot4 = selectedSlots.includes(4) ? targetTeam : existingAlloc?.slot4 ?? null
        const rawNextOverrides = {
          ...prev,
          [staffId]: {
            ...currentOverride,
            slotOverrides: {
              slot1: newSlot1,
              slot2: newSlot2,
              slot3: newSlot3,
              slot4: newSlot4,
            },
            ...(staffMember.status === 'buffer'
              ? {
                  bufferManualSlotOverrides: {
                    ...(currentOverride as any).bufferManualSlotOverrides,
                    slot1: newSlot1,
                    slot2: newSlot2,
                    slot3: newSlot3,
                    slot4: newSlot4,
                  },
                }
              : {}),
            fteRemaining: currentOverride.fteRemaining ?? capacityFTE,
            leaveType: currentOverride.leaveType ?? existingAlloc?.leave_type ?? null,
          },
        }
        return stripExtraCoverageOverrides(rawNextOverrides as any)
      })

      const delta = selectedSlots.length * 0.25
      setPendingPCAFTEPerTeam((prev) => ({
        ...prev,
        [targetTeam]: Math.max(0, (prev[targetTeam] || 0) - delta),
      }))
    },
    [
      pcaAllocations,
      staff,
      bufferStaff,
      staffOverrides,
      currentScheduleId,
      captureUndoCheckpoint,
      rebuildPcaAllocationsForStaff,
      setPcaAllocations,
      setStaffOverrides,
      stripExtraCoverageOverrides,
      setPendingPCAFTEPerTeam,
    ]
  )

  return {
    performSlotTransfer,
    performSlotDiscard,
    performPcaSlotAssignFromPool,
    rebuildPcaAllocationsForStaff,
  }
}
