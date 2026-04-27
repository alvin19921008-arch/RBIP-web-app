'use client'

import { createElement, useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { Badge } from '@/components/ui/badge'
import type { Team, Staff, LeaveType } from '@/types/staff'
import type { TherapistAllocation, PCAAllocation } from '@/types/schedule'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import type { SpecialProgram } from '@/types/allocation'
import type { StaffContextMenuItem } from '@/components/allocation/StaffContextMenu'
import type { SptWeekdayComputed } from '@/lib/features/schedule/sptConfig'
import {
  createIdlePcaDragState,
  type PcaDragState,
} from '@/lib/features/schedule/dnd/dragState'
import type {
  BufferStaffConvertConfirmState,
  BufferStaffEditDialogState,
  ColorContextActionState,
  PcaContextActionState,
  PcaPoolAssignActionState,
  ScheduleGridContextMenusGroup,
  ScheduleGridOverlaysGroup,
  ScheduleGridPoolAndBufferGroup,
  ScheduleGridSharedGroup,
  ScheduleGridSlotsColorWarningsDragGroup,
  SptPoolAssignActionState,
  TherapistContextActionState,
} from '@/features/schedule/ui/overlays/schedulePageGridInteractionOverlaysProps'

type WarningPopoverState = { show: boolean; position: { x: number; y: number } | null }
type StaffContextMenuState = ScheduleGridContextMenusGroup['staffContextMenu']
type StaffPoolContextMenuState = ScheduleGridContextMenusGroup['staffPoolContextMenu']

const createInitialStaffContextMenu = (): StaffContextMenuState => ({
  show: false,
  position: null,
  anchor: null,
  staffId: null,
  team: null,
  kind: null,
})

const createInitialStaffPoolContextMenu = (): StaffPoolContextMenuState => ({
  show: false,
  position: null,
  anchor: null,
  staffId: null,
})

const createInitialPcaPoolAssignAction = (): PcaPoolAssignActionState => ({
  show: false,
  phase: 'team',
  position: null,
  staffId: null,
  staffName: null,
  targetTeam: null,
  availableSlots: [],
  selectedSlots: [],
})

const createInitialSptPoolAssignAction = (): SptPoolAssignActionState => ({
  show: false,
  position: null,
  staffId: null,
  staffName: null,
  targetTeam: null,
  remainingFte: 0,
})

const createInitialBufferStaffEditDialog = (): BufferStaffEditDialogState => ({
  open: false,
  staff: null,
  initialAvailableSlots: null,
})

const createInitialBufferStaffConvertConfirm = (): BufferStaffConvertConfirmState => ({
  show: false,
  position: null,
  staffId: null,
  staffName: null,
})

const createInitialPcaContextAction = (): PcaContextActionState => ({
  show: false,
  mode: 'move',
  phase: 'team',
  position: null,
  staffId: null,
  staffName: null,
  sourceTeam: null,
  targetTeam: null,
  availableSlots: [],
  selectedSlots: [],
})

const createInitialTherapistContextAction = (): TherapistContextActionState => ({
  show: false,
  mode: 'move',
  phase: 'team',
  position: null,
  staffId: null,
  staffName: null,
  sourceTeam: null,
  targetTeam: null,
  movedFteQuarter: null,
  splitMovedHalfDayChoice: 'AUTO',
  splitStayHalfDayChoice: 'AUTO',
  splitInputMode: 'moved',
  mergeInputMode: 'intoSource',
  mergeTeams: [],
})

const createInitialColorContextAction = (): ColorContextActionState => ({
  show: false,
  position: null,
  staffId: null,
  team: null,
  selectedClassName: null,
})

const createInitialWarningPopover = (): WarningPopoverState => ({
  show: false,
  position: null,
})

export type ScheduleGridInteractionOverlayInputs = {
  topLoadingVisible: boolean
  topLoadingProgress: number
  resetPcaDragState: () => void
  handleStartDragFromPopover: () => void
  performPcaSlotAssignFromPool: ScheduleGridPoolAndBufferGroup['performPcaSlotAssignFromPool']
  performSlotTransfer: ScheduleGridSlotsColorWarningsDragGroup['performSlotTransfer']
  performSlotDiscard: ScheduleGridSlotsColorWarningsDragGroup['performSlotDiscard']
  gridStaffContextMenuItems: StaffContextMenuItem[]
  staffPoolContextMenuItems: StaffContextMenuItem[]
  visibleTeams: Team[]
  staff: Staff[]
  bufferStaff: Staff[]
  setBufferStaff: Dispatch<SetStateAction<Staff[]>>
  staffOverrides: StaffOverrides
  setStaffOverrides: Dispatch<SetStateAction<StaffOverrides>>
  showActionToast: (
    title: string,
    variant?: unknown,
    description?: string,
    options?: Record<string, unknown>
  ) => unknown
  getTherapistFteByTeam: (staffId: string) => Partial<Record<Team, number>>
  getTherapistLeaveType: (staffId: string) => LeaveType | null
  captureUndoCheckpoint: (label: string) => void
  pcaAllocations: Record<Team, PCAAllocation[]>
  therapistAllocations: Record<Team, TherapistAllocation[]>
  specialPrograms: SpecialProgram[]
  sptWeekdayByStaffId: Record<string, SptWeekdayComputed>
  updateBufferStaffTeamAction: (staffId: string, team: Team) => Promise<{ ok: boolean }>
  convertBufferStaffToInactiveAction: (id: string) => Promise<{ ok: boolean }>
  loadStaff: () => void
  isLikelyMobileDevice: boolean
  activeDragStaffForOverlay: Staff | null
}

export type ScheduleGridInteractionOverlayResult = {
  overlayGroups: {
    overlays: ScheduleGridOverlaysGroup
    contextMenus: ScheduleGridContextMenusGroup
    sharedGrid: ScheduleGridSharedGroup
    poolAndBuffer: ScheduleGridPoolAndBufferGroup
    slotsColorWarningsDrag: ScheduleGridSlotsColorWarningsDragGroup
  }
}

export type ScheduleGridInteractionStateResult = {
  staffContextMenu: StaffContextMenuState
  setStaffContextMenu: Dispatch<SetStateAction<StaffContextMenuState>>
  closeStaffContextMenu: () => void
  staffPoolContextMenu: StaffPoolContextMenuState
  setStaffPoolContextMenu: Dispatch<SetStateAction<StaffPoolContextMenuState>>
  closeStaffPoolContextMenu: () => void
  pcaPoolAssignAction: PcaPoolAssignActionState
  setPcaPoolAssignAction: Dispatch<SetStateAction<PcaPoolAssignActionState>>
  closePcaPoolAssignAction: () => void
  sptPoolAssignAction: SptPoolAssignActionState
  setSptPoolAssignAction: Dispatch<SetStateAction<SptPoolAssignActionState>>
  closeSptPoolAssignAction: () => void
  bufferStaffEditDialog: BufferStaffEditDialogState
  setBufferStaffEditDialog: Dispatch<SetStateAction<BufferStaffEditDialogState>>
  bufferStaffConvertConfirm: BufferStaffConvertConfirmState
  setBufferStaffConvertConfirm: Dispatch<SetStateAction<BufferStaffConvertConfirmState>>
  pcaContextAction: PcaContextActionState
  setPcaContextAction: Dispatch<SetStateAction<PcaContextActionState>>
  closePcaContextAction: () => void
  therapistContextAction: TherapistContextActionState
  setTherapistContextAction: Dispatch<SetStateAction<TherapistContextActionState>>
  closeTherapistContextAction: () => void
  colorContextAction: ColorContextActionState
  setColorContextAction: Dispatch<SetStateAction<ColorContextActionState>>
  closeColorContextAction: () => void
  leaveEditWarningPopover: WarningPopoverState
  setLeaveEditWarningPopover: Dispatch<SetStateAction<WarningPopoverState>>
  bedRelievingEditWarningPopover: WarningPopoverState
  setBedRelievingEditWarningPopover: Dispatch<SetStateAction<WarningPopoverState>>
  pcaDragState: PcaDragState
  setPcaDragState: Dispatch<SetStateAction<PcaDragState>>
  popoverDragHoverTeam: Team | null
  mousePositionRef: MutableRefObject<{ x: number; y: number }>
  handlePcaContextSlotToggle: (slot: number) => void
  buildOverlayGroups: (params: ScheduleGridInteractionOverlayInputs) => ScheduleGridInteractionOverlayResult
}

export function useScheduleGridInteractionState({
  onPopoverDragDropToTeam,
}: {
  onPopoverDragDropToTeam: (targetTeam: Team) => void
}): ScheduleGridInteractionStateResult {
  const [staffContextMenu, setStaffContextMenu] = useState<StaffContextMenuState>(createInitialStaffContextMenu())
  const [staffPoolContextMenu, setStaffPoolContextMenu] = useState<StaffPoolContextMenuState>(createInitialStaffPoolContextMenu())
  const [pcaPoolAssignAction, setPcaPoolAssignAction] = useState<PcaPoolAssignActionState>(createInitialPcaPoolAssignAction())
  const [sptPoolAssignAction, setSptPoolAssignAction] = useState<SptPoolAssignActionState>(createInitialSptPoolAssignAction())
  const [bufferStaffEditDialog, setBufferStaffEditDialog] = useState<BufferStaffEditDialogState>(
    createInitialBufferStaffEditDialog()
  )
  const [bufferStaffConvertConfirm, setBufferStaffConvertConfirm] = useState<BufferStaffConvertConfirmState>(
    createInitialBufferStaffConvertConfirm()
  )
  const [pcaContextAction, setPcaContextAction] = useState<PcaContextActionState>(createInitialPcaContextAction())
  const [therapistContextAction, setTherapistContextAction] = useState<TherapistContextActionState>(
    createInitialTherapistContextAction()
  )
  const [colorContextAction, setColorContextAction] = useState<ColorContextActionState>(createInitialColorContextAction())
  const [leaveEditWarningPopover, setLeaveEditWarningPopover] = useState<WarningPopoverState>(createInitialWarningPopover())
  const [bedRelievingEditWarningPopover, setBedRelievingEditWarningPopover] = useState<WarningPopoverState>(
    createInitialWarningPopover()
  )
  const [pcaDragState, setPcaDragState] = useState<PcaDragState>(createIdlePcaDragState())
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [, forceUpdate] = useState({})
  const [popoverDragHoverTeam, setPopoverDragHoverTeam] = useState<Team | null>(null)

  const closeStaffContextMenu = useCallback(() => {
    setStaffContextMenu(createInitialStaffContextMenu())
  }, [])

  const closeStaffPoolContextMenu = useCallback(() => {
    setStaffPoolContextMenu(createInitialStaffPoolContextMenu())
  }, [])

  const closePcaPoolAssignAction = useCallback(() => {
    setPcaPoolAssignAction(createInitialPcaPoolAssignAction())
  }, [])

  const closeSptPoolAssignAction = useCallback(() => {
    setSptPoolAssignAction(createInitialSptPoolAssignAction())
  }, [])

  const closePcaContextAction = useCallback(() => {
    setPcaContextAction(createInitialPcaContextAction())
  }, [])

  const closeTherapistContextAction = useCallback(() => {
    setTherapistContextAction(createInitialTherapistContextAction())
  }, [])

  const closeColorContextAction = useCallback(() => {
    setColorContextAction(createInitialColorContextAction())
  }, [])

  // Global click-outside close for contextual popovers (non-modal).
  useEffect(() => {
    const anyOpen =
      pcaContextAction.show ||
      therapistContextAction.show ||
      colorContextAction.show ||
      pcaPoolAssignAction.show ||
      sptPoolAssignAction.show ||
      bufferStaffConvertConfirm.show
    if (!anyOpen) return

    const onDown = () => {
      if (pcaContextAction.show) closePcaContextAction()
      if (therapistContextAction.show) closeTherapistContextAction()
      if (colorContextAction.show) closeColorContextAction()
      if (pcaPoolAssignAction.show) closePcaPoolAssignAction()
      if (sptPoolAssignAction.show) closeSptPoolAssignAction()
      if (bufferStaffConvertConfirm.show) setBufferStaffConvertConfirm(createInitialBufferStaffConvertConfirm())
    }

    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [
    pcaContextAction.show,
    therapistContextAction.show,
    colorContextAction.show,
    pcaPoolAssignAction.show,
    sptPoolAssignAction.show,
    bufferStaffConvertConfirm.show,
    closePcaContextAction,
    closeTherapistContextAction,
    closeColorContextAction,
    closePcaPoolAssignAction,
    closeSptPoolAssignAction,
  ])

  // Tooltip-like: dismiss on any outside click / Escape (no timer).
  useEffect(() => {
    if (!bedRelievingEditWarningPopover.show) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBedRelievingEditWarningPopover(createInitialWarningPopover())
    }
    const onPointerDown = () => {
      setBedRelievingEditWarningPopover(createInitialWarningPopover())
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [bedRelievingEditWarningPopover.show])

  const findTeamAtPoint = useCallback((x: number, y: number): Team | null => {
    const elementsAtPoint = document.elementsFromPoint(x, y)
    for (const el of elementsAtPoint) {
      let current: Element | null = el
      while (current) {
        const pcaTeam = current.getAttribute('data-pca-team')
        if (pcaTeam) return pcaTeam as Team
        current = current.parentElement
      }
    }
    return null
  }, [])

  // Prevent hover effects during popover drag by adding a class to body and injecting CSS.
  useEffect(() => {
    if (pcaDragState.isDraggingFromPopover) {
      document.body.classList.add('popover-drag-active')

      const styleId = 'popover-drag-active-styles'
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style')
        style.id = styleId
        style.textContent = `
          body.popover-drag-active {
            user-select: none !important;
            -webkit-user-select: none !important;
          }
          body.popover-drag-active * {
            user-select: none !important;
            -webkit-user-select: none !important;
          }
        `
        document.head.appendChild(style)
      }

      return () => {
        document.body.classList.remove('popover-drag-active')
        const style = document.getElementById(styleId)
        if (style) style.remove()
      }
    }
  }, [pcaDragState.isDraggingFromPopover])

  // Track mouse movement and handle drop when dragging from popover.
  useEffect(() => {
    if (!pcaDragState.isDraggingFromPopover) {
      if (popoverDragHoverTeam) setPopoverDragHoverTeam(null)
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY }

      const hoveredTeamRaw = findTeamAtPoint(e.clientX, e.clientY)
      const hoveredTeam = hoveredTeamRaw && hoveredTeamRaw !== pcaDragState.sourceTeam ? hoveredTeamRaw : null
      if (hoveredTeam !== popoverDragHoverTeam) {
        setPopoverDragHoverTeam(hoveredTeam)
      }

      forceUpdate({})
    }

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault()
      setPopoverDragHoverTeam(null)

      const targetTeam = findTeamAtPoint(e.clientX, e.clientY)
      if (targetTeam && targetTeam !== pcaDragState.sourceTeam && pcaDragState.selectedSlots.length > 0) {
        onPopoverDragDropToTeam(targetTeam)
        return
      }

      setPcaDragState((prev) => ({
        ...prev,
        isActive: false,
        isDraggingFromPopover: false,
        showSlotSelection: true,
      }))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp, { passive: false })

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [
    onPopoverDragDropToTeam,
    findTeamAtPoint,
    pcaDragState.isDraggingFromPopover,
    pcaDragState.sourceTeam,
    pcaDragState.selectedSlots,
    popoverDragHoverTeam,
  ])

  const handleSlotToggle = useCallback((slot: number) => {
    setPcaDragState((prev) => {
      const isSelected = prev.selectedSlots.includes(slot)
      return {
        ...prev,
        selectedSlots: isSelected
          ? prev.selectedSlots.filter((s) => s !== slot)
          : [...prev.selectedSlots, slot],
      }
    })
  }, [])

  const handlePcaContextSlotToggle = useCallback((slot: number) => {
    setPcaContextAction((prev) => {
      const isSelected = prev.selectedSlots.includes(slot)
      return {
        ...prev,
        selectedSlots: isSelected ? prev.selectedSlots.filter((s) => s !== slot) : [...prev.selectedSlots, slot],
      }
    })
  }, [])

  const buildOverlayGroups = useCallback((inputs: ScheduleGridInteractionOverlayInputs): ScheduleGridInteractionOverlayResult => {
    return {
      overlayGroups: {
        overlays: {
          topLoadingVisible: inputs.topLoadingVisible,
          topLoadingProgress: inputs.topLoadingProgress,
          pcaSlotSelection:
            pcaDragState.showSlotSelection && pcaDragState.popoverPosition && pcaDragState.staffName
              ? {
                  staffName: pcaDragState.staffName,
                  availableSlots: pcaDragState.availableSlots,
                  selectedSlots: pcaDragState.selectedSlots,
                  position: pcaDragState.popoverPosition,
                  isDiscardMode: pcaDragState.isDiscardMode,
                  mode:
                    pcaDragState.isDiscardMode
                      ? 'confirm'
                      : !pcaDragState.isDiscardMode && pcaDragState.inferredTargetTeam
                        ? 'hybrid'
                        : 'drag',
                  confirmDisabled:
                    !!pcaDragState.isDiscardMode
                      ? false
                      : !pcaDragState.inferredTargetTeam ||
                        pcaDragState.inferredTargetTeam === pcaDragState.sourceTeam,
                  confirmHint:
                    pcaDragState.isDiscardMode
                      ? 'Discard selected slot(s)'
                      : !pcaDragState.isDiscardMode && pcaDragState.inferredTargetTeam
                        ? createElement(
                            'div',
                            { className: 'flex items-center gap-1.5' },
                            createElement('span', { className: 'truncate' }, 'Default target'),
                            createElement(
                              Badge,
                              { variant: 'secondary', className: 'px-1.5 py-0 text-[10px]' },
                              pcaDragState.inferredTargetTeam
                            )
                          )
                        : undefined,
                  onConfirm:
                    pcaDragState.isDiscardMode
                      ? () => {
                          if (!pcaDragState.staffId || !pcaDragState.sourceTeam) return
                          inputs.performSlotDiscard(pcaDragState.staffId, pcaDragState.sourceTeam, pcaDragState.selectedSlots)
                          inputs.resetPcaDragState()
                        }
                      : !pcaDragState.isDiscardMode && pcaDragState.inferredTargetTeam
                        ? () => inputs.performSlotTransfer(pcaDragState.inferredTargetTeam as Team)
                        : undefined,
                }
              : null,
          onSlotToggle: handleSlotToggle,
          onCloseSlotSelection: inputs.resetPcaDragState,
          onStartDragFromSlotPopover: inputs.handleStartDragFromPopover,
        },
        contextMenus: {
          staffContextMenu,
          closeStaffContextMenu,
          gridStaffContextMenuItems: inputs.gridStaffContextMenuItems,
          staffPoolContextMenu,
          closeStaffPoolContextMenu,
          staffPoolContextMenuItems: inputs.staffPoolContextMenuItems,
        },
        sharedGrid: {
          visibleTeams: inputs.visibleTeams,
          staff: inputs.staff,
          bufferStaff: inputs.bufferStaff,
          setBufferStaff: inputs.setBufferStaff,
          staffOverrides: inputs.staffOverrides,
          setStaffOverrides: inputs.setStaffOverrides,
          showActionToast: inputs.showActionToast,
          getTherapistFteByTeam: inputs.getTherapistFteByTeam,
          getTherapistLeaveType: inputs.getTherapistLeaveType,
          captureUndoCheckpoint: inputs.captureUndoCheckpoint,
          pcaAllocations: inputs.pcaAllocations,
          therapistAllocations: inputs.therapistAllocations,
          specialPrograms: inputs.specialPrograms,
          sptWeekdayByStaffId: inputs.sptWeekdayByStaffId,
        },
        poolAndBuffer: {
          pcaPoolAssignAction,
          setPcaPoolAssignAction,
          closePcaPoolAssignAction,
          performPcaSlotAssignFromPool: inputs.performPcaSlotAssignFromPool,
          sptPoolAssignAction,
          setSptPoolAssignAction,
          closeSptPoolAssignAction,
          updateBufferStaffTeamAction: inputs.updateBufferStaffTeamAction,
          bufferStaffConvertConfirm,
          setBufferStaffConvertConfirm,
          convertBufferStaffToInactiveAction: inputs.convertBufferStaffToInactiveAction,
          loadStaff: inputs.loadStaff,
          bufferStaffEditDialog,
          setBufferStaffEditDialog,
        },
        slotsColorWarningsDrag: {
          performSlotTransfer: inputs.performSlotTransfer,
          performSlotDiscard: inputs.performSlotDiscard,
          pcaContextAction,
          setPcaContextAction,
          closePcaContextAction,
          handlePcaContextSlotToggle,
          therapistContextAction,
          setTherapistContextAction,
          closeTherapistContextAction,
          colorContextAction,
          setColorContextAction,
          closeColorContextAction,
          leaveEditWarningPopover,
          setLeaveEditWarningPopover,
          bedRelievingEditWarningPopover,
          pcaDragState,
          mousePositionRef,
          isLikelyMobileDevice: inputs.isLikelyMobileDevice,
          activeDragStaffForOverlay: inputs.activeDragStaffForOverlay,
        },
      },
    }
  }, [
    pcaDragState,
    handleSlotToggle,
    staffContextMenu,
    closeStaffContextMenu,
    staffPoolContextMenu,
    closeStaffPoolContextMenu,
    pcaPoolAssignAction,
    closePcaPoolAssignAction,
    sptPoolAssignAction,
    closeSptPoolAssignAction,
    bufferStaffConvertConfirm,
    bufferStaffEditDialog,
    pcaContextAction,
    closePcaContextAction,
    handlePcaContextSlotToggle,
    therapistContextAction,
    closeTherapistContextAction,
    colorContextAction,
    closeColorContextAction,
    leaveEditWarningPopover,
    bedRelievingEditWarningPopover,
  ])

  return {
    staffContextMenu,
    setStaffContextMenu,
    closeStaffContextMenu,
    staffPoolContextMenu,
    setStaffPoolContextMenu,
    closeStaffPoolContextMenu,
    pcaPoolAssignAction,
    setPcaPoolAssignAction,
    closePcaPoolAssignAction,
    sptPoolAssignAction,
    setSptPoolAssignAction,
    closeSptPoolAssignAction,
    bufferStaffEditDialog,
    setBufferStaffEditDialog,
    bufferStaffConvertConfirm,
    setBufferStaffConvertConfirm,
    pcaContextAction,
    setPcaContextAction,
    closePcaContextAction,
    therapistContextAction,
    setTherapistContextAction,
    closeTherapistContextAction,
    colorContextAction,
    setColorContextAction,
    closeColorContextAction,
    leaveEditWarningPopover,
    setLeaveEditWarningPopover,
    bedRelievingEditWarningPopover,
    setBedRelievingEditWarningPopover,
    pcaDragState,
    setPcaDragState,
    popoverDragHoverTeam,
    mousePositionRef,
    handlePcaContextSlotToggle,
    buildOverlayGroups,
  }
}
