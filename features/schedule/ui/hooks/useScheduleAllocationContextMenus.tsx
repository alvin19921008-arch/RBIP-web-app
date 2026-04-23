'use client'

import { useMemo, type Dispatch, type SetStateAction } from 'react'
import {
  Copy,
  FilePenLine,
  GitMerge,
  Highlighter,
  Pencil,
  PlusCircle,
  Split,
  Trash2,
  UserX,
} from 'lucide-react'
import type { StaffContextMenuItem } from '@/components/allocation/StaffContextMenu'
import type { StaffOverrideState } from '@/lib/features/schedule/controller/scheduleControllerTypes'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'

export type ScheduleGridStaffContextMenuState = {
  show: boolean
  position: { x: number; y: number } | null
  anchor: { x: number; y: number } | null
  staffId: string | null
  team: Team | null
  kind: 'therapist' | 'pca' | null
}

export type ScheduleStaffPoolContextMenuState = {
  show: boolean
  position: { x: number; y: number } | null
  anchor: { x: number; y: number } | null
  staffId: string | null
}

type PcaAllocationsByTeam = Record<Team, (PCAAllocation & { staff: Staff })[]>

export function useScheduleAllocationContextMenus({
  staffContextMenu,
  staffPoolContextMenu,
  closeStaffContextMenu,
  closeStaffPoolContextMenu,
  currentStep,
  staff,
  bufferStaff,
  inactiveStaff,
  staffOverrides,
  pcaAllocations,
  sptBaseFteByStaffId,
  getTherapistFteByTeam,
  handleEditStaff,
  startPcaContextAction,
  startTherapistContextAction,
  setColorContextAction,
  setPcaPoolAssignAction,
  setSptPoolAssignAction,
  setBufferStaffEditDialog,
  setBufferStaffConvertConfirm,
}: {
  staffContextMenu: ScheduleGridStaffContextMenuState
  staffPoolContextMenu: ScheduleStaffPoolContextMenuState
  closeStaffContextMenu: () => void
  closeStaffPoolContextMenu: () => void
  currentStep: string
  staff: Staff[]
  bufferStaff: Staff[]
  inactiveStaff: Staff[]
  staffOverrides: Record<string, StaffOverrideState>
  pcaAllocations: PcaAllocationsByTeam
  sptBaseFteByStaffId: Record<string, number>
  getTherapistFteByTeam: (staffId: string) => Partial<Record<Team, number>>
  handleEditStaff: (staffId: string, clickEvent?: React.MouseEvent) => void
  startPcaContextAction: (options: {
    staffId: string
    sourceTeam: Team
    mode: 'move' | 'discard'
    position: { x: number; y: number }
  }) => void
  startTherapistContextAction: (options: {
    staffId: string
    sourceTeam: Team
    mode: 'move' | 'discard' | 'split' | 'merge'
    position: { x: number; y: number }
  }) => void
  setColorContextAction: Dispatch<
    SetStateAction<{
      show: boolean
      position: { x: number; y: number } | null
      staffId: string | null
      team: Team | null
      selectedClassName: string | null
    }>
  >
  setPcaPoolAssignAction: Dispatch<
    SetStateAction<{
      show: boolean
      phase: 'team' | 'slots'
      position: { x: number; y: number } | null
      staffId: string | null
      staffName: string | null
      targetTeam: Team | null
      availableSlots: number[]
      selectedSlots: number[]
    }>
  >
  setSptPoolAssignAction: Dispatch<
    SetStateAction<{
      show: boolean
      position: { x: number; y: number } | null
      staffId: string | null
      staffName: string | null
      targetTeam: Team | null
      remainingFte: number
    }>
  >
  setBufferStaffEditDialog: Dispatch<
    SetStateAction<{
      open: boolean
      staff: Staff | null
      initialAvailableSlots: number[] | null
    }>
  >
  setBufferStaffConvertConfirm: Dispatch<
    SetStateAction<{
      show: boolean
      position: { x: number; y: number } | null
      staffId: string | null
      staffName: string | null
    }>
  >
}) {
  const gridStaffContextMenuItems = useMemo(() => {
    const staffId = staffContextMenu.staffId
    const team = staffContextMenu.team
    const kind = staffContextMenu.kind
    if (!staffId || !team || !kind) return []

    const isPCA = kind === 'pca'
    const isTherapist = kind === 'therapist'

    const canLeaveEdit = currentStep === 'leave-fte'
    const canTherapistActions = currentStep === 'therapist-pca'
    const canPcaActions = currentStep === 'floating-pca'

    const leaveDisabledTooltip = 'Leave arrangement editing is only available in Step 1 (Leave & FTE).'
    const therapistDisabledTooltip =
      'Therapist slot actions are only available in Step 2 (Therapist & Non-floating PCA).'
    const pcaDisabledTooltip = 'PCA slot actions are only available in Step 3 (Floating PCA).'
    const splitMinFteTooltip = 'SPT at 0.25 FTE cannot be split further.'
    const sourceFte = isTherapist ? (getTherapistFteByTeam(staffId)[team] ?? 0) : 0
    const staffMember = staff.find((x) => x.id === staffId) || bufferStaff.find((x) => x.id === staffId)
    const cannotSplitFurtherSpt = isTherapist && staffMember?.rank === 'SPT' && sourceFte <= 0.250001

    return [
      {
        key: 'leave-edit',
        label: 'Leave edit',
        icon: <Pencil className="h-4 w-4" />,
        disabled: !canLeaveEdit,
        disabledTooltip: leaveDisabledTooltip,
        onSelect: () => {
          closeStaffContextMenu()
          handleEditStaff(staffId)
        },
      },
      {
        key: 'move-slot',
        label: 'Move slot',
        icon: <Copy className="h-4 w-4" />,
        disabled: isTherapist ? !canTherapistActions : !canPcaActions,
        disabledTooltip: isTherapist ? therapistDisabledTooltip : pcaDisabledTooltip,
        onSelect: () => {
          const pos = staffContextMenu.position ?? { x: 100, y: 100 }
          closeStaffContextMenu()
          if (isPCA) {
            startPcaContextAction({ staffId, sourceTeam: team, mode: 'move', position: pos })
          } else {
            startTherapistContextAction({ staffId, sourceTeam: team, mode: 'move', position: pos })
          }
        },
      },
      {
        key: 'discard-slot',
        label: 'Discard slot',
        icon: <Trash2 className="h-4 w-4" />,
        disabled: isTherapist ? !canTherapistActions : !canPcaActions,
        disabledTooltip: isTherapist ? therapistDisabledTooltip : pcaDisabledTooltip,
        onSelect: () => {
          const pos = staffContextMenu.position ?? { x: 100, y: 100 }
          closeStaffContextMenu()
          if (isPCA) {
            startPcaContextAction({ staffId, sourceTeam: team, mode: 'discard', position: pos })
          } else {
            startTherapistContextAction({ staffId, sourceTeam: team, mode: 'discard', position: pos })
          }
        },
      },
      ...(isPCA
        ? []
        : [
            {
              key: 'split-slot',
              label: 'Split slot',
              icon: <Split className="h-4 w-4" />,
              disabled: !canTherapistActions || cannotSplitFurtherSpt,
              disabledTooltip: !canTherapistActions
                ? therapistDisabledTooltip
                : cannotSplitFurtherSpt
                  ? splitMinFteTooltip
                  : undefined,
              onSelect: () => {
                const pos = staffContextMenu.position ?? { x: 100, y: 100 }
                closeStaffContextMenu()
                startTherapistContextAction({ staffId, sourceTeam: team, mode: 'split', position: pos })
              },
            },
            {
              key: 'merge-slot',
              label: 'Merge slot',
              icon: <GitMerge className="h-4 w-4" />,
              disabled: !canTherapistActions,
              disabledTooltip: therapistDisabledTooltip,
              onSelect: () => {
                const pos = staffContextMenu.position ?? { x: 100, y: 100 }
                closeStaffContextMenu()
                startTherapistContextAction({ staffId, sourceTeam: team, mode: 'merge', position: pos })
              },
            },
          ]),
      {
        key: 'fill-color',
        label: 'Fill color',
        icon: <Highlighter className="h-4 w-4" />,
        disabled: false,
        onSelect: () => {
          const pos = staffContextMenu.position ?? { x: 100, y: 100 }
          const existing = (staffOverrides as any)?.[staffId]?.cardColorByTeam?.[team] as string | undefined
          closeStaffContextMenu()
          setColorContextAction({
            show: true,
            position: pos,
            staffId,
            team,
            selectedClassName: existing ?? null,
          })
        },
      },
    ]
  }, [
    staffContextMenu.staffId,
    staffContextMenu.team,
    staffContextMenu.kind,
    staffContextMenu.position,
    currentStep,
    staffOverrides,
    staff,
    bufferStaff,
    closeStaffContextMenu,
    handleEditStaff,
    getTherapistFteByTeam,
    startPcaContextAction,
    startTherapistContextAction,
    setColorContextAction,
  ])

  const staffPoolContextMenuItems = useMemo(() => {
    const staffId = staffPoolContextMenu.staffId
    if (!staffId) return []

    const s =
      staff.find((x) => x.id === staffId) || bufferStaff.find((x) => x.id === staffId) || inactiveStaff.find((x) => x.id === staffId)
    if (!s) return []

    const isBuffer = s.status === 'buffer'
    const isTherapistRank = ['SPT', 'APPT', 'RPT'].includes(s.rank)
    const isSPT = s.rank === 'SPT'
    const isPCA = s.rank === 'PCA'
    const isFloatingPCA = isPCA && !!s.floating
    const isNonFloatingPCA = isPCA && !s.floating

    const canLeaveEdit = currentStep === 'leave-fte'
    const canTherapistActions = currentStep === 'therapist-pca'
    const canPcaActions = currentStep === 'floating-pca'

    const leaveDisabledTooltip = 'Leave arrangement editing is only available in Step 1 (Leave & FTE).'
    const therapistDisabledTooltip =
      'Slot assignment/actions for therapists are only available in Step 2 (Therapist & Non-floating PCA).'
    const pcaDisabledTooltip = 'Slot assignment/actions for floating PCA are only available in Step 3 (Floating PCA).'

    // Infer a single team context for actions that require it (Move/Discard/Fill color).
    const inferSingleTherapistTeam = (): Team | null => {
      const byTeam = getTherapistFteByTeam(staffId)
      const teams = Object.entries(byTeam)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([t]) => t as Team)
      return teams.length === 1 ? teams[0] : null
    }
    const inferSinglePcaTeam = (): Team | null => {
      const alloc = Object.values(pcaAllocations).flat().find((a: any) => a.staff_id === staffId)
      if (!alloc) return null
      const teams = new Set<Team>()
      if (alloc.slot1) teams.add(alloc.slot1 as Team)
      if (alloc.slot2) teams.add(alloc.slot2 as Team)
      if (alloc.slot3) teams.add(alloc.slot3 as Team)
      if (alloc.slot4) teams.add(alloc.slot4 as Team)
      return teams.size === 1 ? Array.from(teams)[0] : null
    }

    const inferredTeam = isPCA ? inferSinglePcaTeam() : isTherapistRank ? inferSingleTherapistTeam() : null

    const needsTeamTooltip =
      'This action requires a single team allocation. Please use the team-grid card (per-team) instead.'
    const splitMinFteTooltip = 'SPT at 0.25 FTE cannot be split further.'
    const inferredSourceFte = isTherapistRank && inferredTeam ? (getTherapistFteByTeam(staffId)[inferredTeam] ?? 0) : 0
    const cannotSplitFurtherSpt = isSPT && !!inferredTeam && inferredSourceFte <= 0.250001

    // Compute remaining slots (floating PCA only) for Assign slot.
    const computeRemainingSlots = (): number[] => {
      const override = staffOverrides[staffId]
      const bufferFteRaw = (s as any).buffer_fte
      const bufferFte =
        typeof bufferFteRaw === 'number' ? bufferFteRaw : bufferFteRaw != null ? parseFloat(String(bufferFteRaw)) : NaN
      const capacitySlots =
        Array.isArray(override?.availableSlots) && override!.availableSlots.length > 0
          ? override!.availableSlots
          : isBuffer && Number.isFinite(bufferFte)
            ? [1, 2, 3, 4].slice(0, Math.max(0, Math.min(4, Math.round(bufferFte / 0.25))))
            : [1, 2, 3, 4]

      const assigned = new Set<number>()
      Object.values(pcaAllocations).forEach((teamAllocs: any[]) => {
        teamAllocs.forEach((a: any) => {
          if (a.staff_id !== staffId) return
          if (a.slot1) assigned.add(1)
          if (a.slot2) assigned.add(2)
          if (a.slot3) assigned.add(3)
          if (a.slot4) assigned.add(4)
        })
      })
      return capacitySlots.filter((slot) => !assigned.has(slot)).sort((a, b) => a - b)
    }

    const remainingSlots = isFloatingPCA ? computeRemainingSlots() : []

    // Compute remaining SPT FTE for Assign slot (Step 2 only).
    const computeRemainingSptFte = (): number => {
      const base =
        typeof staffOverrides[staffId]?.fteRemaining === 'number'
          ? (staffOverrides[staffId]!.fteRemaining as number)
          : ((sptBaseFteByStaffId as any)?.[staffId] ?? 0)
      const byTeam = getTherapistFteByTeam(staffId)
      const assigned = Object.values(byTeam).reduce((sum, v) => sum + (v ?? 0), 0)
      return Math.max(0, base - assigned)
    }

    const remainingSptFte = isSPT && !isBuffer ? computeRemainingSptFte() : 0

    const pos = staffPoolContextMenu.position ?? { x: 100, y: 100 }

    const items: StaffContextMenuItem[] = []

    // 1) First action: Leave edit OR buffer edit
    if (isBuffer) {
      items.push({
        key: 'buffer-edit',
        label: 'Edit buffer staff',
        icon: <FilePenLine className="h-4 w-4" />,
        disabled: false,
        onSelect: () => {
          closeStaffPoolContextMenu()
          setBufferStaffEditDialog({
            open: true,
            staff: s,
            initialAvailableSlots: Array.isArray(staffOverrides[staffId]?.availableSlots)
              ? (staffOverrides[staffId]!.availableSlots as number[])
              : null,
          })
        },
      })
    } else {
      items.push({
        key: 'leave-edit',
        label: 'Leave edit',
        icon: <Pencil className="h-4 w-4" />,
        disabled: !canLeaveEdit,
        disabledTooltip: leaveDisabledTooltip,
        onSelect: () => {
          closeStaffPoolContextMenu()
          handleEditStaff(staffId)
        },
      })
    }

    // SPT smart behavior (Staff Pool only):
    // If this SPT has NO duty on the current weekday per dashboard config, show ONLY "Leave edit".
    // Hide all other actions (assign/move/split/merge/discard/fill), because there is nothing to allocate.
    if (!isBuffer && isSPT) {
      const dutyFte =
        typeof staffOverrides[staffId]?.fteRemaining === 'number'
          ? (staffOverrides[staffId]!.fteRemaining as number)
          : ((sptBaseFteByStaffId as any)?.[staffId] ?? 0)
      if (!(dutyFte > 0)) {
        return items
      }
    }

    // 2) Assign slot (staff pool only)
    const canShowAssign =
      (isFloatingPCA && !isNonFloatingPCA) || (isSPT && !isBuffer) || (isBuffer && isTherapistRank) || (isBuffer && isFloatingPCA)

    if (canShowAssign && !isNonFloatingPCA) {
      const stepOk = isFloatingPCA ? canPcaActions : canTherapistActions
      const allSlotsAssigned = isFloatingPCA && remainingSlots.length === 0
      const allSptFteAssigned = isSPT && !isBuffer && remainingSptFte <= 0
      const disabled = !stepOk || allSlotsAssigned || allSptFteAssigned

      const disabledTooltip = !stepOk
        ? isFloatingPCA
          ? pcaDisabledTooltip
          : therapistDisabledTooltip
        : allSlotsAssigned
          ? 'All slots are already assigned.'
          : allSptFteAssigned
            ? 'All available SPT FTE is already assigned. Use Move slot / Split slot to amend existing assignments.'
            : undefined

      items.push({
        key: 'assign-slot',
        label: 'Assign slot',
        icon: <PlusCircle className="h-4 w-4" />,
        disabled,
        disabledTooltip,
        onSelect: () => {
          closeStaffPoolContextMenu()
          if (disabled) return

          if (isFloatingPCA) {
            setPcaPoolAssignAction({
              show: true,
              phase: 'team',
              position: pos,
              staffId,
              staffName: s.name,
              targetTeam: null,
              availableSlots: remainingSlots,
              selectedSlots: remainingSlots.length === 1 ? remainingSlots : [],
            })
            return
          }

          if (isBuffer && isTherapistRank) {
            // Buffer therapists: assign whole staff to a team (team picker)
            setSptPoolAssignAction({
              show: true,
              position: pos,
              staffId,
              staffName: s.name,
              targetTeam: null,
              remainingFte: -1, // sentinel (buffer therapist)
            })
            return
          }

          // SPT: assign remaining weekday FTE (team picker)
          setSptPoolAssignAction({
            show: true,
            position: pos,
            staffId,
            staffName: s.name,
            targetTeam: null,
            remainingFte: remainingSptFte,
          })
        },
      })
    }

    // 3) Move/Discard/Split/Merge (reuse existing contextual actions, but only when team is unambiguous)
    const therapistActionDisabled = !canTherapistActions
    const pcaActionDisabled = !canPcaActions

    if (isPCA) {
      items.push({
        key: 'move-slot',
        label: 'Move slot',
        icon: <Copy className="h-4 w-4" />,
        disabled: pcaActionDisabled || !inferredTeam,
        disabledTooltip: pcaActionDisabled ? pcaDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startPcaContextAction({ staffId, sourceTeam: inferredTeam, mode: 'move', position: pos })
        },
      })
      items.push({
        key: 'discard-slot',
        label: 'Discard slot',
        icon: <Trash2 className="h-4 w-4" />,
        disabled: pcaActionDisabled || !inferredTeam,
        disabledTooltip: pcaActionDisabled ? pcaDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startPcaContextAction({ staffId, sourceTeam: inferredTeam, mode: 'discard', position: pos })
        },
      })
    } else if (isTherapistRank) {
      items.push({
        key: 'move-slot',
        label: 'Move slot',
        icon: <Copy className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam,
        disabledTooltip: therapistActionDisabled ? therapistDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'move', position: pos })
        },
      })
      items.push({
        key: 'discard-slot',
        label: 'Discard slot',
        icon: <Trash2 className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam,
        disabledTooltip: therapistActionDisabled ? therapistDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'discard', position: pos })
        },
      })
      items.push({
        key: 'split-slot',
        label: 'Split slot',
        icon: <Split className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam || cannotSplitFurtherSpt,
        disabledTooltip: therapistActionDisabled
          ? therapistDisabledTooltip
          : !inferredTeam
            ? needsTeamTooltip
            : cannotSplitFurtherSpt
              ? splitMinFteTooltip
              : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'split', position: pos })
        },
      })
      items.push({
        key: 'merge-slot',
        label: 'Merge slot',
        icon: <GitMerge className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam,
        disabledTooltip: therapistActionDisabled ? therapistDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'merge', position: pos })
        },
      })
    }

    // 4) Buffer convert (before Fill color)
    if (isBuffer) {
      items.push({
        key: 'buffer-convert',
        label: 'Convert to inactive',
        icon: <UserX className="h-4 w-4" />,
        disabled: false,
        onSelect: () => {
          closeStaffPoolContextMenu()
          setBufferStaffConvertConfirm({
            show: true,
            position: pos,
            staffId,
            staffName: s.name,
          })
        },
      })
    }

    // 5) Fill color (only when a team context is unambiguous)
    items.push({
      key: 'fill-color',
      label: 'Fill color',
      icon: <Highlighter className="h-4 w-4" />,
      disabled: !inferredTeam,
      disabledTooltip: !inferredTeam ? needsTeamTooltip : undefined,
      onSelect: () => {
        if (!inferredTeam) return
        const existing = (staffOverrides as any)?.[staffId]?.cardColorByTeam?.[inferredTeam] as string | undefined
        closeStaffPoolContextMenu()
        setColorContextAction({
          show: true,
          position: pos,
          staffId,
          team: inferredTeam,
          selectedClassName: existing ?? null,
        })
      },
    })

    return items
  }, [
    staffPoolContextMenu.staffId,
    staffPoolContextMenu.position,
    staff,
    bufferStaff,
    inactiveStaff,
    currentStep,
    staffOverrides,
    pcaAllocations,
    sptBaseFteByStaffId,
    closeStaffPoolContextMenu,
    setBufferStaffEditDialog,
    handleEditStaff,
    getTherapistFteByTeam,
    startPcaContextAction,
    startTherapistContextAction,
    setPcaPoolAssignAction,
    setSptPoolAssignAction,
    setBufferStaffConvertConfirm,
    setColorContextAction,
  ])

  return { gridStaffContextMenuItems, staffPoolContextMenuItems }
}
