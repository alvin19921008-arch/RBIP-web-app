/**
 * Props for `SchedulePageGridInteractionOverlays` (Round 3 R3-30).
 * Grouped objects mirror orchestration wiring from `SchedulePageClient`; no hook logic here.
 */
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react'
import type { Team, Staff, LeaveType } from '@/types/staff'
import type { TherapistAllocation, PCAAllocation } from '@/types/schedule'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import type { SpecialProgram } from '@/types/allocation'
import type { StaffContextMenuItem } from '@/components/allocation/StaffContextMenu'
import type { SptWeekdayComputed } from '@/lib/features/schedule/sptConfig'
import type { PcaDragState } from '@/lib/features/schedule/dnd/dragState'

export type SchedulePageGridInteractionOverlaysProps = {
  overlays: ScheduleGridOverlaysGroup
  contextMenus: ScheduleGridContextMenusGroup
  sharedGrid: ScheduleGridSharedGroup
  poolAndBuffer: ScheduleGridPoolAndBufferGroup
  slotsColorWarningsDrag: ScheduleGridSlotsColorWarningsDragGroup
}

export type ScheduleGridOverlaysGroup = {
  topLoadingVisible: boolean
  topLoadingProgress: number
  pcaSlotSelection: {
    staffName: string
    availableSlots: number[]
    selectedSlots: number[]
    position: { x: number; y: number }
    isDiscardMode?: boolean
    mode?: 'drag' | 'confirm' | 'hybrid'
    onConfirm?: () => void
    confirmDisabled?: boolean
    confirmHint?: ReactNode
  } | null
  onSlotToggle: (slot: number) => void
  onCloseSlotSelection: () => void
  onStartDragFromSlotPopover: () => void
}

export type ScheduleGridContextMenusGroup = {
  staffContextMenu: {
    show: boolean
    position: { x: number; y: number } | null
    anchor: { x: number; y: number } | null
    staffId: string | null
    team: Team | null
    kind: 'therapist' | 'pca' | null
  }
  closeStaffContextMenu: () => void
  gridStaffContextMenuItems: StaffContextMenuItem[]
  staffPoolContextMenu: {
    show: boolean
    position: { x: number; y: number } | null
    anchor: { x: number; y: number } | null
    staffId: string | null
  }
  closeStaffPoolContextMenu: () => void
  staffPoolContextMenuItems: StaffContextMenuItem[]
}

export type ScheduleGridSharedGroup = {
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
}

export type PcaPoolAssignActionState = {
  show: boolean
  phase: 'team' | 'slots'
  position: { x: number; y: number } | null
  staffId: string | null
  staffName: string | null
  targetTeam: Team | null
  availableSlots: number[]
  selectedSlots: number[]
}

export type SptPoolAssignActionState = {
  show: boolean
  position: { x: number; y: number } | null
  staffId: string | null
  staffName: string | null
  targetTeam: Team | null
  remainingFte: number
}

export type BufferStaffConvertConfirmState = {
  show: boolean
  position: { x: number; y: number } | null
  staffId: string | null
  staffName: string | null
}

export type BufferStaffEditDialogState = {
  open: boolean
  staff: Staff | null
  initialAvailableSlots: number[] | null
}

export type ScheduleGridPoolAndBufferGroup = {
  pcaPoolAssignAction: PcaPoolAssignActionState
  setPcaPoolAssignAction: Dispatch<SetStateAction<PcaPoolAssignActionState>>
  closePcaPoolAssignAction: () => void
  performPcaSlotAssignFromPool: (
    targetTeam: Team,
    args: { staffId: string; selectedSlots: number[] }
  ) => void
  sptPoolAssignAction: SptPoolAssignActionState
  setSptPoolAssignAction: Dispatch<SetStateAction<SptPoolAssignActionState>>
  closeSptPoolAssignAction: () => void
  updateBufferStaffTeamAction: (staffId: string, team: Team) => Promise<{ ok: boolean }>
  bufferStaffConvertConfirm: BufferStaffConvertConfirmState
  setBufferStaffConvertConfirm: Dispatch<SetStateAction<BufferStaffConvertConfirmState>>
  convertBufferStaffToInactiveAction: (id: string) => Promise<{ ok: boolean }>
  loadStaff: () => void
  bufferStaffEditDialog: BufferStaffEditDialogState
  setBufferStaffEditDialog: Dispatch<SetStateAction<BufferStaffEditDialogState>>
}

export type PcaContextActionState = {
  show: boolean
  mode: 'move' | 'discard'
  phase: 'team' | 'slots'
  position: { x: number; y: number } | null
  staffId: string | null
  staffName: string | null
  sourceTeam: Team | null
  targetTeam: Team | null
  availableSlots: number[]
  selectedSlots: number[]
}

export type TherapistContextActionState = {
  show: boolean
  mode: 'move' | 'discard' | 'split' | 'merge'
  phase: 'team' | 'splitFte' | 'mergeSelect' | 'confirmDiscard'
  position: { x: number; y: number } | null
  staffId: string | null
  staffName: string | null
  sourceTeam: Team | null
  targetTeam: Team | null
  movedFteQuarter: number | null
  splitMovedHalfDayChoice?: 'AUTO' | 'AM' | 'PM' | 'UNSPECIFIED'
  splitStayHalfDayChoice?: 'AUTO' | 'AM' | 'PM' | 'UNSPECIFIED'
  splitInputMode?: 'moved' | 'stay'
  mergeInputMode?: 'intoSource' | 'intoSelected'
  mergeTeams: Team[]
}

export type ColorContextActionState = {
  show: boolean
  position: { x: number; y: number } | null
  staffId: string | null
  team: Team | null
  selectedClassName: string | null
}

export type ScheduleGridSlotsColorWarningsDragGroup = {
  performSlotTransfer: (
    targetTeam: Team,
    options?: { staffId: string; sourceTeam: Team | null; selectedSlots: number[]; closeSlotPopover?: boolean }
  ) => void
  performSlotDiscard: (staffId: string, sourceTeam: Team, slotsToDiscard: number[]) => void
  pcaContextAction: PcaContextActionState
  setPcaContextAction: Dispatch<SetStateAction<PcaContextActionState>>
  closePcaContextAction: () => void
  handlePcaContextSlotToggle: (slot: number) => void
  therapistContextAction: TherapistContextActionState
  setTherapistContextAction: Dispatch<SetStateAction<TherapistContextActionState>>
  closeTherapistContextAction: () => void
  colorContextAction: ColorContextActionState
  setColorContextAction: Dispatch<SetStateAction<ColorContextActionState>>
  closeColorContextAction: () => void
  leaveEditWarningPopover: { show: boolean; position: { x: number; y: number } | null }
  setLeaveEditWarningPopover: Dispatch<
    SetStateAction<{ show: boolean; position: { x: number; y: number } | null }>
  >
  bedRelievingEditWarningPopover: { show: boolean; position: { x: number; y: number } | null }
  pcaDragState: PcaDragState
  mousePositionRef: MutableRefObject<{ x: number; y: number }>
  isLikelyMobileDevice: boolean
  activeDragStaffForOverlay: Staff | null
}
