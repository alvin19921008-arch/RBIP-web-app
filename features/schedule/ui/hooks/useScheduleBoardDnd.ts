import { useRef } from 'react'
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { Team, Staff } from '@/types/staff'
import type { PCAAllocation, TherapistAllocation, ScheduleStepId } from '@/types/schedule'
import {
  createActivePcaDragState,
  createActiveTherapistDragState,
  createIdlePcaDragState,
  createIdleTherapistDragState,
  type PcaDragState,
  type TherapistDragState,
} from '@/lib/features/schedule/dnd/dragState'
import {
  buildSharedTherapistTeamFteByTeam,
  type SharedTherapistSlotTeams,
} from '@/lib/features/schedule/sharedTherapistStep'
import { updateBufferStaffTeamAction } from '@/app/(dashboard)/schedule/actions'

/** Dependencies for schedule board drag-and-drop (sensors + dnd-kit handlers). */
export type ScheduleBoardDndParams = {
  closeStaffContextMenu: () => void
  closeStaffPoolContextMenu: () => void
  staff: Staff[]
  setActiveDragStaffForOverlay: (staff: Staff | null) => void
  therapistAllocationBlockRef: RefObject<HTMLDivElement | null>
  pcaAllocationBlockRef: RefObject<HTMLDivElement | null>
  currentStep: ScheduleStepId | string
  therapistAllocations: Record<Team, TherapistAllocation[]>
  staffOverrides: Record<string, any>
  setTherapistDragState: Dispatch<SetStateAction<TherapistDragState>>
  pcaAllocations: Record<Team, PCAAllocation[]>
  pcaDragState: PcaDragState
  setPcaDragState: Dispatch<SetStateAction<PcaDragState>>
  therapistDragState: TherapistDragState
  triggerHaptic: (pattern?: number | number[]) => void
  staffContextMenu: { show: boolean }
  staffPoolContextMenu: { show: boolean }
  calculatePopoverPosition: (
    cardRect: { left: number; top: number; width: number; height: number },
    popoverWidth: number
  ) => { x: number; y: number }
  getSlotsForTeam: (allocation: PCAAllocation, team: Team) => number[]
  getSpecialProgramSlotsForTeam: (allocation: PCAAllocation & { staff: Staff }, team: Team) => number[]
  captureUndoCheckpoint: (label: string) => void
  setStaffOverrides: Dispatch<SetStateAction<Record<string, any>>>
  performSlotTransfer: (
    targetTeam: Team,
    options?: { staffId: string; sourceTeam: Team | null; selectedSlots: number[]; closeSlotPopover?: boolean }
  ) => void
  performSlotDiscard: (staffId: string, sourceTeam: Team, slotsToDiscard: number[]) => void
  performTherapistSlotDiscard: (staffId: string, sourceTeam: Team, slotsToDiscard: number[]) => void
  resetPcaDragState: () => void
  removeTherapistAllocationFromTeam: (
    staffId: string,
    sourceTeam: Team,
    options?: { skipUndoCheckpoint?: boolean; undoLabel?: string }
  ) => void
  setBufferStaff: Dispatch<SetStateAction<Staff[]>>
}

export function useScheduleBoardDnd(p: ScheduleBoardDndParams) {
  const lastHapticDropZoneRef = useRef<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 240, tolerance: 10 } })
  )

  const {
    closeStaffContextMenu,
    closeStaffPoolContextMenu,
    staff,
    setActiveDragStaffForOverlay,
    therapistAllocationBlockRef,
    pcaAllocationBlockRef,
    currentStep,
    therapistAllocations,
    staffOverrides,
    setTherapistDragState,
    pcaAllocations,
    pcaDragState,
    setPcaDragState,
    therapistDragState,
    triggerHaptic,
    staffContextMenu,
    staffPoolContextMenu,
    calculatePopoverPosition,
    getSlotsForTeam,
    getSpecialProgramSlotsForTeam,
    captureUndoCheckpoint,
    setStaffOverrides,
    performSlotTransfer,
    performSlotDiscard,
    performTherapistSlotDiscard,
    resetPcaDragState,
    removeTherapistAllocationFromTeam,
    setBufferStaff,
  } = p

  // Handle drag start - detect if it's a PCA being dragged
  const handleDragStart = (event: DragStartEvent) => {
    // Mobile touch path can produce long-press menu and drag back-to-back.
    // Always close context menus once a drag starts so they never stay stuck open.
    closeStaffContextMenu()
    closeStaffPoolContextMenu()
    lastHapticDropZoneRef.current = null

    const { active } = event
    const activeId = active.id as string
    
    // Extract staff ID from composite ID (format: staffId or staffId::team)
    // This allows each team's staff card instance to have a unique draggable ID
    // Use '::' as separator to avoid conflicts with UUIDs (which contain hyphens)
    const staffId = activeId.includes('::') ? activeId.split('::')[0] : activeId
    
    // Find the staff member
    const staffMember = staff.find(s => s.id === staffId)
    if (!staffMember) return
    setActiveDragStaffForOverlay(staffMember)

    // Auto-scroll to the relevant allocation block when dragging in the correct step.
    // - Therapists (SPT/APPT/RPT) in Step 2 → Block 1 (Therapist Allocation)
    // - Floating PCAs in Step 3 → Block 2 (PCA Allocation)
    const activeRank = (active.data.current as any)?.staff?.rank ?? staffMember.rank
    const isTherapistRank = ['RPT', 'SPT', 'APPT'].includes(activeRank)
    const isPcaRank = activeRank === 'PCA'
    if (isTherapistRank && currentStep === 'therapist-pca') {
      therapistAllocationBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (isPcaRank && currentStep === 'floating-pca' && staffMember.floating) {
      pcaAllocationBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    
    // Track therapist drag state for validation (including buffer therapists)
    if (['RPT', 'SPT', 'APPT'].includes(staffMember.rank)) {
      // Find the current team from allocations
      let currentTeam: Team | undefined
      for (const [team, allocs] of Object.entries(therapistAllocations)) {
        if (allocs.some(a => a.staff_id === staffId)) {
          currentTeam = team as Team
          break
        }
      }
      
      // If no current team found, check staffOverrides or staff.team
      if (!currentTeam) {
        currentTeam = staffOverrides[staffId]?.team ?? staffMember.team ?? undefined
      }
      
      // For buffer therapists without a team, allow dragging from StaffPool
      if (!currentTeam && staffMember.status === 'buffer') {
        // Buffer therapist not yet assigned - will be assigned on drop
        setTherapistDragState(createActiveTherapistDragState({ staffId, sourceTeam: null }))
      } else if (currentTeam) {
        setTherapistDragState(createActiveTherapistDragState({ staffId, sourceTeam: currentTeam }))
      }
    }
    
    // Only handle PCA drag here
    if (staffMember.rank !== 'PCA') return
    
    // Check if floating PCA
    if (!staffMember.floating) {
      // Non-floating PCA - will snap back
      return
    }
    
    // Check if this drag is from StaffPool (no team context in ID)
    const isFromStaffPool = !activeId.includes('::')
    
      // Validate slot transfer for floating PCA from StaffPool
      if (isFromStaffPool) {
        const isBufferStaff = staffMember.status === 'buffer'
        // Only allow slot transfer in Step 3 only
        // For buffer PCA: allow in Step 3 (before and after algo)
        // For regular PCA: allow in Step 3 only
        const canTransfer = currentStep === 'floating-pca'
        
        // Store buffer staff flag in drag state for later use
        setPcaDragState(prev => ({ ...prev, isBufferStaff }))
        if (!canTransfer) {
        // Don't show popover (tooltip handles the reminder for both buffer and regular staff)
        // Cancel the drag by not setting pcaDragState
        return
      }
      
      // Find source team from existing allocations for StaffPool drag
      let sourceTeam: Team | null = null
      for (const [team, allocs] of Object.entries(pcaAllocations)) {
        if (allocs.some(a => a.staff_id === staffId)) {
          sourceTeam = team as Team
          break
        }
      }
      
      // For buffer PCA, allow dragging even if not yet allocated (will create new allocation on drop)
      // Reuse isBufferStaff from above
      if (!sourceTeam && !isBufferStaff) {
        // PCA not yet allocated and not buffer staff - can't do slot transfer
        return
      }
      
      // Calculate available slots based on staff type
      let availableSlots: number[] = []
      
      if (isBufferStaff && staffMember.buffer_fte !== undefined) {
        // For buffer floating PCA: calculate remaining unassigned slots
        // Calculate all slots from buffer_fte (e.g., 0.5 FTE = 2 slots)
        const numSlots = Math.round(staffMember.buffer_fte / 0.25)
        const allBufferSlots = [1, 2, 3, 4].slice(0, numSlots)
        
        // Find all already assigned slots across ALL teams
        const assignedSlots = new Set<number>()
        Object.values(pcaAllocations).forEach((teamAllocs) => {
          teamAllocs.forEach((alloc) => {
            if (alloc.staff_id === staffId) {
              // Count all slots assigned to any team
              if (alloc.slot1) assignedSlots.add(1)
              if (alloc.slot2) assignedSlots.add(2)
              if (alloc.slot3) assignedSlots.add(3)
              if (alloc.slot4) assignedSlots.add(4)
            }
          })
        })
        
        // Available slots = all buffer slots minus already assigned slots
        availableSlots = allBufferSlots.filter(slot => !assignedSlots.has(slot))
        
        // If no available slots, can't drag
        if (availableSlots.length === 0) {
          return
        }
        
        // For buffer PCA, sourceTeam can be null (first assignment) or the first team found
        // But we want to allow dragging to assign remaining slots, so keep sourceTeam as found or null
      } else if (sourceTeam) {
        // For regular floating PCA: get slots from the source team's allocation
        const allocsForTeam = pcaAllocations[sourceTeam] || []
        const pcaAllocation = allocsForTeam.find(a => a.staff_id === staffId)
        
        if (!pcaAllocation) return
        
        // Get slots for the source team, EXCLUDING special program slots
        const allSlotsInTeam = getSlotsForTeam(pcaAllocation, sourceTeam)
        const specialProgramSlots = getSpecialProgramSlotsForTeam(
          pcaAllocation as PCAAllocation & { staff: Staff },
          sourceTeam
        )
        availableSlots = allSlotsInTeam.filter(slot => !specialProgramSlots.includes(slot))
        
        // If no available slots (all are special program), snap back
        if (availableSlots.length === 0) {
          return
        }
      } else {
        // Non-buffer PCA without sourceTeam - can't drag
        return
      }
      
      // Get the position of the dragged element for popover positioning
      const activeRect = active.rect.current.initial
      const popoverPosition = activeRect ? calculatePopoverPosition(activeRect, 150) : null
      
      // Set up drag state for StaffPool drag
      setPcaDragState(
        createActivePcaDragState({
          staffId,
          staffName: staffMember.name,
          sourceTeam,
          availableSlots,
          selectedSlots: availableSlots.length === 1 ? availableSlots : [], // Auto-select if only one slot
          popoverPosition,
          isBufferStaff,
        })
      )
      
      return
    }
    
    // Check if this is a re-drag after slot selection (popover is already showing)
    if (pcaDragState.showSlotSelection && pcaDragState.staffId === staffId && pcaDragState.selectedSlots.length > 0) {
      // User is re-dragging with already selected slots - just mark as active
      setPcaDragState(prev => ({
        ...prev,
        isActive: true,
      }))
      return
    }
    
    // Get the source team from the drag data (set by StaffCard via dragTeam prop)
    const dragData = active.data.current as { team?: Team } | undefined
    const sourceTeam = dragData?.team as Team | null
    
    if (!sourceTeam) {
      return
    }
    
    // Find the PCA allocation for this staff
    const allocsForTeam = pcaAllocations[sourceTeam] || []
    const pcaAllocation = allocsForTeam.find(a => a.staff_id === staffId)
    
    if (!pcaAllocation) return
    
    // Get slots for the source team, EXCLUDING special program slots
    const allSlotsInTeam = getSlotsForTeam(pcaAllocation, sourceTeam)
    const specialProgramSlots = getSpecialProgramSlotsForTeam(
      pcaAllocation as PCAAllocation & { staff: Staff },
      sourceTeam
    )
    const availableSlots = allSlotsInTeam.filter(slot => !specialProgramSlots.includes(slot))
    
    // If no available slots (all are special program), snap back
    if (availableSlots.length === 0) {
      return
    }
    
    // Get the position of the dragged element for popover positioning
    const activeRect = active.rect.current.initial
    const popoverPosition = activeRect ? calculatePopoverPosition(activeRect, 150) : null
    
    // Initialize PCA drag state
    const isBufferStaff = staffMember.status === 'buffer'
    setPcaDragState(
      createActivePcaDragState({
        staffId,
        staffName: staffMember.name,
        sourceTeam,
        availableSlots,
        selectedSlots: availableSlots.length === 1 ? availableSlots : [], // Auto-select if single slot
        popoverPosition,
        isBufferStaff,
      })
    )
  }

  // Handle drag move - detect when PCA leaves source team zone
  const handleDragMove = (event: DragMoveEvent) => {
    const { over, active } = event
    if (staffContextMenu.show) closeStaffContextMenu()
    if (staffPoolContextMenu.show) closeStaffPoolContextMenu()
    const overId = over?.id?.toString() || ''
    if ((overId.startsWith('pca-') || overId.startsWith('therapist-')) && overId !== lastHapticDropZoneRef.current) {
      triggerHaptic(8)
      lastHapticDropZoneRef.current = overId
    }
    
    // Validate therapist drag: only allowed in step 2
    // This applies to all therapists (SPT, APPT, RPT) including fixed-team staff
    if (therapistDragState.isActive && therapistDragState.sourceTeam) {
      const isOverDifferentTeam = overId.startsWith('therapist-') && overId !== `therapist-${therapistDragState.sourceTeam}`
      
      // Don't show popover when user drags out of source team after step 2
      // Tooltip handles the reminder for both buffer and regular staff
      // Fixed-team staff (APPT, RPT) will show warning tooltip when dragging
      if (isOverDifferentTeam && currentStep !== 'therapist-pca') {
        // Reset therapist drag state
        setTherapistDragState(createIdleTherapistDragState())
        
        return
      }
    }
    
    // Only process if we have an active PCA drag (not from popover)
    if (!pcaDragState.isActive || !pcaDragState.staffId || pcaDragState.isDraggingFromPopover) return
    
    // Check if we've left the source team zone (over a different drop target)
    const isOverDifferentTeam = overId.startsWith('pca-') && overId !== `pca-${pcaDragState.sourceTeam}`
    
    // Validate: Floating PCA slot transfer is only allowed in step 3
    // Don't show popover (tooltip handles the reminder)
    // Just reset drag state to prevent the transfer
    if (isOverDifferentTeam && currentStep !== 'floating-pca') {
      setPcaDragState(createIdlePcaDragState())
      
      return
    }
    
    // For multi-slot PCAs, we USED to show slot selection when leaving source team (pre-drop).
    // This caused the popover to appear near the origin card, then "jump" to the drop target after drop.
    // New behavior: ONLY show slot selection AFTER drop (handled in handleDragEnd).
    if (pcaDragState.availableSlots.length > 1 && !pcaDragState.showSlotSelection && isOverDifferentTeam) {
    }
  }
  // Handle drag and drop for therapist staff cards (RPT and SPT only) AND PCA slot transfers
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragStaffForOverlay(null)
    lastHapticDropZoneRef.current = null
    const { active, over } = event
    const activeId = active.id as string
    // Extract staff ID from composite ID (format: staffId or staffId::team)
    const staffId = activeId.includes('::') ? activeId.split('::')[0] : activeId
    const staffMember = staff.find(s => s.id === staffId)
    
    // For discard flow: when dropped "elsewhere" (no destination drop zone), anchor the popover
    // near the drag's final position (same viewport-safe positioning helper).
    const dndRectForPopover = (active.rect.current.translated ?? active.rect.current.initial) as
      | { left: number; top: number; width: number; height: number }
      | null
    const discardPopoverPosition = dndRectForPopover
      ? calculatePopoverPosition(dndRectForPopover, 150)
      : null
    
    
    // Show popover again after unsuccessful drag from popover
    const showPopoverAgain = (dropTargetPosition?: { x: number; y: number } | null) => {
      setPcaDragState(prev => ({
        ...prev,
        isActive: false,
        isDraggingFromPopover: false,
        showSlotSelection: true,
        ...(dropTargetPosition !== undefined && { popoverPosition: dropTargetPosition }),
      }))
    }
    
    // Keep popover visible but mark drag as inactive (for multi-slot selection)
    const pausePcaDrag = (newPosition?: { x: number; y: number } | null) => {
      setPcaDragState(prev => ({
        ...prev,
        isActive: false,
        isDraggingFromPopover: false,
        ...(newPosition !== undefined && { popoverPosition: newPosition }),
      }))
    }
    
    // Check if this is a PCA drag that we're handling (either from card or from popover)
    if ((pcaDragState.isActive && pcaDragState.staffId === staffId) || pcaDragState.isDraggingFromPopover) {
      const effectiveStaffId = pcaDragState.staffId || staffId
      
      // Handle PCA slot discard (dropped outside any team)
      if (!over || !over.id.toString().startsWith('pca-')) {
        // Dropped outside any PCA block - handle slot discard
        const currentAllocation = Object.values(pcaAllocations).flat()
          .find(a => a.staff_id === effectiveStaffId)
        
        if (!currentAllocation) {
          // No allocation to discard
          resetPcaDragState()
          return
        }
        
        const sourceTeam = pcaDragState.sourceTeam || currentAllocation.team
        const assignedSlots: number[] = []
        if (currentAllocation.slot1 === sourceTeam) assignedSlots.push(1)
        if (currentAllocation.slot2 === sourceTeam) assignedSlots.push(2)
        if (currentAllocation.slot3 === sourceTeam) assignedSlots.push(3)
        if (currentAllocation.slot4 === sourceTeam) assignedSlots.push(4)
        
        // Check if this is SPT (therapist) or PCA
        const staffMember = staff.find(s => s.id === effectiveStaffId)
        const isSPT = staffMember?.rank === 'SPT'
        
        // For SPT, slot discard removes the entire allocation (like buffer therapist)
        // No need to show slot selection - just remove the allocation immediately
        if (isSPT) {
          performTherapistSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // For PCA, handle single vs multi-slot discard
        if (assignedSlots.length === 1) {
          performSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // If multi-slot, show slot selection for discard (PCA only)
        if (assignedSlots.length > 1) {
          // Set up for slot discard selection
          setPcaDragState(prev => ({
            ...prev,
            isActive: false,
            isDraggingFromPopover: false,
            showSlotSelection: true,
            staffId: effectiveStaffId,
            staffName: prev.staffName ?? staff.find(s => s.id === effectiveStaffId)?.name ?? null,
            sourceTeam,
            availableSlots: assignedSlots,
            selectedSlots: [], // User will select which slots to discard
            popoverPosition:
              discardPopoverPosition ??
              prev.popoverPosition ??
              calculatePopoverPosition({ left: 100, top: 100, width: 0, height: 0 }, 150),
            inferredTargetTeam: null,
            isDiscardMode: true, // Flag to indicate this is discard, not transfer
          }))
          return
        }
        
        resetPcaDragState()
        return
      }
      
      const overId = over.id.toString()
      
      // Check if dropped on a PCA block (pca-{team})
      if (!overId.startsWith('pca-')) {
        // Not dropped on a PCA block - handle discard (same as above)
        const currentAllocation = Object.values(pcaAllocations).flat()
          .find(a => a.staff_id === effectiveStaffId)
        
        if (!currentAllocation) {
          resetPcaDragState()
          return
        }
        
        const sourceTeam = pcaDragState.sourceTeam || currentAllocation.team
        const assignedSlots: number[] = []
        if (currentAllocation.slot1 === sourceTeam) assignedSlots.push(1)
        if (currentAllocation.slot2 === sourceTeam) assignedSlots.push(2)
        if (currentAllocation.slot3 === sourceTeam) assignedSlots.push(3)
        if (currentAllocation.slot4 === sourceTeam) assignedSlots.push(4)
        
        // Check if this is SPT (therapist) or PCA
        const staffMemberForDiscard = staff.find(s => s.id === effectiveStaffId)
        const isSPTForDiscard = staffMemberForDiscard?.rank === 'SPT'
        
        // For SPT, slot discard removes the entire allocation (like buffer therapist)
        // No need to show slot selection - just remove the allocation immediately
        if (isSPTForDiscard) {
          performTherapistSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // For PCA, handle single vs multi-slot discard
        if (assignedSlots.length === 1) {
          performSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // If multi-slot, show slot selection for discard (PCA only)
        if (assignedSlots.length > 1) {
          setPcaDragState(prev => ({
            ...prev,
            isActive: false,
            isDraggingFromPopover: false,
            showSlotSelection: true,
            staffId: effectiveStaffId,
            staffName: prev.staffName ?? staff.find(s => s.id === effectiveStaffId)?.name ?? null,
            sourceTeam,
            availableSlots: assignedSlots,
            selectedSlots: [],
            popoverPosition:
              discardPopoverPosition ??
              prev.popoverPosition ??
              calculatePopoverPosition({ left: 100, top: 100, width: 0, height: 0 }, 150),
            inferredTargetTeam: null,
            isDiscardMode: true,
          }))
          return
        }
        
        resetPcaDragState()
        return
      }
      
      const targetTeam = overId.replace('pca-', '') as Team
      const sourceTeam = pcaDragState.sourceTeam
      const selectedSlots = pcaDragState.selectedSlots
      
      // If same team - if was dragging from popover, show it again
      if (targetTeam === sourceTeam) {
        if (pcaDragState.isDraggingFromPopover) {
          // Recalculate position from drop target after scroll/snap
          // Use requestAnimationFrame to ensure DOM has updated after scroll/snap
          requestAnimationFrame(() => {
            const dropTargetElement = document.querySelector(`[data-pca-team="${targetTeam}"]`) as HTMLElement
            const dropTargetPosition = dropTargetElement 
              ? calculatePopoverPosition(dropTargetElement.getBoundingClientRect(), 150)
              : null
            setPcaDragState(prev => ({
              ...prev,
              isActive: false,
              isDraggingFromPopover: false,
              showSlotSelection: true,
              ...(dropTargetPosition && { popoverPosition: dropTargetPosition }),
            }))
          })
          return
        }
        if (pcaDragState.showSlotSelection && pcaDragState.availableSlots.length > 1) {
          // Recalculate position from drop target after scroll/snap
          requestAnimationFrame(() => {
            const dropTargetElement = document.querySelector(`[data-pca-team="${targetTeam}"]`) as HTMLElement
            const dropTargetPosition = dropTargetElement 
              ? calculatePopoverPosition(dropTargetElement.getBoundingClientRect(), 150)
              : null
            pausePcaDrag(dropTargetPosition)
          })
          return
        }
        resetPcaDragState()
        return
      }
      
      // If no slots selected but multi-slot, keep popover visible
      if (selectedSlots.length === 0) {
        if (pcaDragState.availableSlots.length > 1) {
          // Calculate position from drop target (block 2) after auto-scroll/snap
          // Use requestAnimationFrame to ensure DOM has updated after scroll/snap
          requestAnimationFrame(() => {
            const dropTargetElement = document.querySelector(`[data-pca-team="${targetTeam}"]`) as HTMLElement
            const dropTargetPosition = dropTargetElement 
              ? calculatePopoverPosition(dropTargetElement.getBoundingClientRect(), 150)
              : null
            // IMPORTANT (post-fix): show popover ONLY after drop
            setPcaDragState(prev => ({
              ...prev,
              isActive: false,
              isDraggingFromPopover: false,
              showSlotSelection: true,
              inferredTargetTeam: targetTeam,
              isDiscardMode: false,
              ...(dropTargetPosition && { popoverPosition: dropTargetPosition }),
            }))
          })
          return
        }
        resetPcaDragState()
        return
      }
      
      // Perform the slot transfer using the shared function
      performSlotTransfer(targetTeam)
      return
    }
    
    // Reset therapist drag state on drag end
    setTherapistDragState(createIdleTherapistDragState())
    
    // Handle therapist drag (existing logic)
    if (!over) {
      // Dropped outside - handle SPT slot discard or buffer therapist discard
      if (staffMember && ['RPT', 'SPT', 'APPT'].includes(staffMember.rank)) {
        const isBufferStaff = staffMember.status === 'buffer'
        const isSPT = staffMember.rank === 'SPT'
        
        // For SPT: handle slot discard (similar to floating PCA)
        if (isSPT && therapistDragState.isActive && therapistDragState.sourceTeam) {
          const currentAllocation = Object.values(therapistAllocations).flat()
            .find(a => a.staff_id === staffId)
          
          if (currentAllocation) {
            const sourceTeam = therapistDragState.sourceTeam
            const assignedSlots: number[] = []
            if (currentAllocation.slot1 === sourceTeam) assignedSlots.push(1)
            if (currentAllocation.slot2 === sourceTeam) assignedSlots.push(2)
            if (currentAllocation.slot3 === sourceTeam) assignedSlots.push(3)
            if (currentAllocation.slot4 === sourceTeam) assignedSlots.push(4)
            
            // For SPT, slot discard removes the entire allocation (like buffer therapist)
            // No need to show slot selection - just remove the allocation immediately
            performTherapistSlotDiscard(staffId, sourceTeam, assignedSlots)
            setTherapistDragState(createIdleTherapistDragState())
            return
          }
        }
        
        // For buffer therapist: handle whole therapist removal
        if (isBufferStaff && currentStep === 'therapist-pca') {
          // Find current team from allocations
          let currentTeam: Team | undefined
          for (const [team, allocs] of Object.entries(therapistAllocations)) {
            if (allocs.some(a => a.staff_id === staffId)) {
              currentTeam = team as Team
              break
            }
          }
          
          if (currentTeam) {
            // Remove buffer therapist from team using shared function
            removeTherapistAllocationFromTeam(staffId, currentTeam)
            
            // Update buffer staff team in database via server action.
            updateBufferStaffTeamAction(staffId, null).then((result) => {
              if (!result.ok) return
              // Update local state
              setBufferStaff(prev => prev.map(s =>
                s.id === staffId ? { ...s, team: null } : s
              ))
            })
          }
        }
      }
      return // Dropped outside
    }
    
    // Check if dropped on a therapist block (therapist-{team})
    const overId = over.id.toString()
    if (!overId.startsWith('therapist-')) return // Not dropped on a therapist block
    
    const targetTeam = overId.replace('therapist-', '') as Team
    
    if (!staffMember) return
    
    // Allow RPT, SPT, APPT (including buffer and fixed-team) to be moved
    if (!['RPT', 'SPT', 'APPT'].includes(staffMember.rank)) return
    
    const isBufferStaff = staffMember.status === 'buffer'
    const isSharedTherapist = staffMember.team === null && (staffMember.rank === 'APPT' || staffMember.rank === 'RPT')
    const isFixedTeamStaff = !isBufferStaff && !isSharedTherapist && (staffMember.rank === 'APPT' || staffMember.rank === 'RPT')
    
    // Validate: Therapist transfer is only allowed in step 2
    if (currentStep !== 'therapist-pca') {
      // Transfer not allowed - card will return to original position
      return
    }
    
    // Find current team from allocations
    let currentTeam: Team | undefined
    for (const [team, allocs] of Object.entries(therapistAllocations)) {
      if (allocs.some(a => a.staff_id === staffId)) {
        currentTeam = team as Team
        break
      }
    }
    
    // If no current team found, check staffOverrides or staff.team
    if (!currentTeam) {
      currentTeam = staffOverrides[staffId]?.team ?? staffMember.team ?? undefined
    }
    
    // If already in target team, no change needed
    if (currentTeam === targetTeam) return
    
    // Get current FTE from allocation, staffOverrides, or buffer_fte
    const currentAlloc = Object.values(therapistAllocations).flat()
      .find(a => a.staff_id === staffId)
    const currentFTE = isBufferStaff 
      ? (staffOverrides[staffId]?.fteRemaining ?? staffMember.buffer_fte ?? 1.0)
      : (staffOverrides[staffId]?.fteRemaining ?? currentAlloc?.fte_therapist ?? 1.0)
    
    captureUndoCheckpoint('Therapist slot move')
    
    // Shared therapist (APPT/RPT with team === null): move slots from currentTeam to targetTeam via sharedTherapistSlotTeams
    if (isSharedTherapist && currentTeam) {
      const allocOnSource = therapistAllocations[currentTeam]?.find(a => a.staff_id === staffId)
      if (!allocOnSource) return
      const existingSlotTeams = (staffOverrides[staffId] as any)?.sharedTherapistSlotTeams as SharedTherapistSlotTeams | undefined
      const nextSlotTeams: SharedTherapistSlotTeams = { ...(existingSlotTeams ?? {}) }
      for (const s of [1, 2, 3, 4] as const) {
        const slotKey = `slot${s}` as 'slot1' | 'slot2' | 'slot3' | 'slot4'
        if ((allocOnSource as any)[slotKey] === currentTeam) nextSlotTeams[s] = targetTeam
      }
      const nextMap = buildSharedTherapistTeamFteByTeam({ slotTeamBySlot: nextSlotTeams })
      const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)
      setStaffOverrides(prev => ({
        ...prev,
        [staffId]: {
          ...prev[staffId],
          team: undefined,
          therapistTeamFTEByTeam: nextMap,
          sharedTherapistSlotTeams: nextSlotTeams,
          leaveType: prev[staffId]?.leaveType ?? currentAlloc?.leave_type ?? null,
          fteRemaining: prev[staffId]?.fteRemaining ?? total ?? currentFTE,
        }
      }))
      return
    }
    
    // Update staffOverrides with new team (buffer or fixed-team therapist)
    // For fixed-team staff (APPT, RPT), this is a staff override (does NOT change staff.team property)
    // For buffer staff, also update the staff.team in the database
    setStaffOverrides(prev => ({
      ...prev,
      [staffId]: {
        ...prev[staffId],
        team: targetTeam,
        fteRemaining: currentFTE,
        leaveType: prev[staffId]?.leaveType ?? currentAlloc?.leave_type ?? null,
      }
    }))
    
    // For buffer therapist, also update the staff.team in the database
    if (isBufferStaff) {
      updateBufferStaffTeamAction(staffId, targetTeam).then((result) => {
        if (!result.ok) return
        // Update local state
        setBufferStaff(prev => prev.map(s =>
          s.id === staffId ? { ...s, team: targetTeam } : s
        ))
      })
    }
    
    // For fixed-team staff (APPT, RPT), the FTE is carried to target team
    // This is handled by the therapist allocation algorithm respecting staffOverrides.team
  }

  return { sensors, handleDragStart, handleDragMove, handleDragEnd }
}
