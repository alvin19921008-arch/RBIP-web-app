'use client'

import { DragOverlay } from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import dynamic from 'next/dynamic'
import type { Team, LeaveType } from '@/types/staff'
import { SlotSelectionPopover } from '@/components/allocation/SlotSelectionPopover'
import { StaffContextMenu } from '@/components/allocation/StaffContextMenu'
import { TeamPickerPopover } from '@/components/allocation/TeamPickerPopover'
import { ConfirmPopover } from '@/components/allocation/ConfirmPopover'
import { ScheduleOverlays } from '@/features/schedule/ui/overlays/ScheduleOverlays'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { TEAMS } from '@/lib/features/schedule/constants'
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import type { SchedulePageGridInteractionOverlaysProps } from '@/features/schedule/ui/overlays/schedulePageGridInteractionOverlaysProps'

const BufferStaffCreateDialog = dynamic(
  () => import('@/components/allocation/BufferStaffCreateDialog').then((m) => m.BufferStaffCreateDialog),
  { ssr: false }
)

/**
 * Grid interaction layer under `ScheduleDndContextShell`: `ScheduleOverlays`, pool/context popovers,
 * staff context menus, warnings, and `DragOverlay` — immediately before `ScheduleMainBoardChrome` (R3-30).
 * `useScheduleAllocationContextMenus` stays in `SchedulePageClient`; this module is JSX + grouped props only.
 */
export function SchedulePageGridInteractionOverlays(props: SchedulePageGridInteractionOverlaysProps) {
  const { overlays, contextMenus, sharedGrid, poolAndBuffer, slotsColorWarningsDrag } = props
  const {
    topLoadingVisible,
    topLoadingProgress,
    pcaSlotSelection,
    onSlotToggle,
    onCloseSlotSelection,
    onStartDragFromSlotPopover,
  } = overlays
  const {
    staffContextMenu,
    closeStaffContextMenu,
    gridStaffContextMenuItems,
    staffPoolContextMenu,
    closeStaffPoolContextMenu,
    staffPoolContextMenuItems,
  } = contextMenus
  const {
    visibleTeams,
    staff,
    bufferStaff,
    setBufferStaff,
    staffOverrides,
    setStaffOverrides,
    showActionToast,
    getTherapistFteByTeam,
    getTherapistLeaveType,
    captureUndoCheckpoint,
    pcaAllocations,
    therapistAllocations,
    specialPrograms,
    sptWeekdayByStaffId,
  } = sharedGrid
  const {
    pcaPoolAssignAction,
    setPcaPoolAssignAction,
    closePcaPoolAssignAction,
    performPcaSlotAssignFromPool,
    sptPoolAssignAction,
    setSptPoolAssignAction,
    closeSptPoolAssignAction,
    updateBufferStaffTeamAction,
    bufferStaffConvertConfirm,
    setBufferStaffConvertConfirm,
    convertBufferStaffToInactiveAction,
    loadStaff,
    bufferStaffEditDialog,
    setBufferStaffEditDialog,
  } = poolAndBuffer
  const {
    performSlotTransfer,
    performSlotDiscard,
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
    isLikelyMobileDevice,
    activeDragStaffForOverlay,
  } = slotsColorWarningsDrag

  return (
    <>
      <ScheduleOverlays
        topLoadingVisible={topLoadingVisible}
        topLoadingProgress={topLoadingProgress}
        pcaSlotSelection={pcaSlotSelection}
        onSlotToggle={onSlotToggle}
        onCloseSlotSelection={onCloseSlotSelection}
        onStartDragFromSlotPopover={onStartDragFromSlotPopover}
      />

      {/* Schedule-grid Staff Card Context Menu (pencil click) */}
      <StaffContextMenu
        open={staffContextMenu.show}
        position={staffContextMenu.position}
        anchor={staffContextMenu.anchor}
        onClose={closeStaffContextMenu}
        items={gridStaffContextMenuItems}
      />

      {/* Staff Pool Staff Card Context Menu (pencil click / right click) */}
      <StaffContextMenu
        open={staffPoolContextMenu.show}
        position={staffPoolContextMenu.position}
        anchor={staffPoolContextMenu.anchor}
        onClose={closeStaffPoolContextMenu}
        items={staffPoolContextMenuItems}
      />

      {/* Staff Pool: Assign slot (floating PCA) */}
      {pcaPoolAssignAction.show &&
        pcaPoolAssignAction.position &&
        pcaPoolAssignAction.staffId &&
        pcaPoolAssignAction.staffName && (
          <>
            {pcaPoolAssignAction.phase === 'team' ? (
              <TeamPickerPopover
                title="Assign slot"
                teams={visibleTeams}
                selectedTeam={pcaPoolAssignAction.targetTeam}
                onSelectTeam={(t) => setPcaPoolAssignAction(prev => ({ ...prev, targetTeam: t }))}
                onClose={closePcaPoolAssignAction}
                confirmDisabled={!pcaPoolAssignAction.targetTeam}
                onConfirm={() => {
                  const targetTeam = pcaPoolAssignAction.targetTeam
                  if (!targetTeam) return
                  if (pcaPoolAssignAction.availableSlots.length === 1) {
                    performPcaSlotAssignFromPool(targetTeam, {
                      staffId: pcaPoolAssignAction.staffId!,
                      selectedSlots: pcaPoolAssignAction.availableSlots,
                    })
                    closePcaPoolAssignAction()
                    return
                  }
                  setPcaPoolAssignAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                position={pcaPoolAssignAction.position}
                hint="Choose a target team, then confirm."
                pageIndicator={pcaPoolAssignAction.availableSlots.length > 1 ? { current: 1, total: 2 } : undefined}
                onNextPage={() => {
                  const targetTeam = pcaPoolAssignAction.targetTeam
                  if (!targetTeam) return
                  if (pcaPoolAssignAction.availableSlots.length === 1) return
                  setPcaPoolAssignAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                onPrevPage={() => {}}
                prevDisabled={true}
                nextDisabled={!pcaPoolAssignAction.targetTeam || pcaPoolAssignAction.availableSlots.length === 1}
              />
            ) : null}

            {pcaPoolAssignAction.phase === 'slots' && pcaPoolAssignAction.targetTeam ? (
              <SlotSelectionPopover
                staffName={pcaPoolAssignAction.staffName}
                availableSlots={pcaPoolAssignAction.availableSlots}
                selectedSlots={pcaPoolAssignAction.selectedSlots}
                onSlotToggle={(slot) =>
                  setPcaPoolAssignAction(prev => {
                    const selected = prev.selectedSlots.includes(slot)
                      ? prev.selectedSlots.filter(s => s !== slot)
                      : [...prev.selectedSlots, slot].sort((a, b) => a - b)
                    return { ...prev, selectedSlots: selected }
                  })
                }
                onClose={closePcaPoolAssignAction}
                onStartDrag={() => {}}
                position={pcaPoolAssignAction.position}
                mode="confirm"
                actionLabel="assign"
                onConfirm={() => {
                  const targetTeam = pcaPoolAssignAction.targetTeam
                  if (!targetTeam) return
                  if (pcaPoolAssignAction.selectedSlots.length === 0) return
                  performPcaSlotAssignFromPool(targetTeam, {
                    staffId: pcaPoolAssignAction.staffId!,
                    selectedSlots: pcaPoolAssignAction.selectedSlots,
                  })
                  closePcaPoolAssignAction()
                }}
                confirmDisabled={pcaPoolAssignAction.selectedSlots.length === 0}
              />
            ) : null}
          </>
        )}

      {/* Staff Pool: Assign slot (SPT remaining FTE / buffer therapist team assignment) */}
      {sptPoolAssignAction.show &&
        sptPoolAssignAction.position &&
        sptPoolAssignAction.staffId &&
        sptPoolAssignAction.staffName && (
          <TeamPickerPopover
            title="Assign slot"
            teams={visibleTeams}
            selectedTeam={sptPoolAssignAction.targetTeam}
            onSelectTeam={(t) => setSptPoolAssignAction(prev => ({ ...prev, targetTeam: t }))}
            onClose={closeSptPoolAssignAction}
            confirmDisabled={!sptPoolAssignAction.targetTeam}
            onConfirm={() => {
              const staffId = sptPoolAssignAction.staffId!
              const targetTeam = sptPoolAssignAction.targetTeam
              if (!targetTeam) return

              const staffMember =
                staff.find(x => x.id === staffId) ||
                bufferStaff.find(x => x.id === staffId) ||
                null
              if (!staffMember) return

              // Buffer therapist: assign whole staff to team (override.team + DB update)
              if (staffMember.status === 'buffer' && ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)) {
                captureUndoCheckpoint('Therapist team assignment')
                const fte =
                  typeof staffOverrides[staffId]?.fteRemaining === 'number'
                    ? (staffOverrides[staffId]!.fteRemaining as number)
                    : typeof (staffMember as any).buffer_fte === 'number'
                      ? ((staffMember as any).buffer_fte as number)
                      : 1.0

                setStaffOverrides(prev => ({
                  ...prev,
                  [staffId]: {
                    ...prev[staffId],
                    team: targetTeam,
                    fteRemaining: fte,
                    leaveType: prev[staffId]?.leaveType ?? null,
                  },
                }))

                updateBufferStaffTeamAction(staffId, targetTeam).then((result) => {
                  if (!result.ok) return
                  setBufferStaff(prev => prev.map(s => (s.id === staffId ? { ...s, team: targetTeam } : s)))
                })

                closeSptPoolAssignAction()
                return
              }

              // SPT: assign remaining weekday FTE to team (ad hoc override)
              const remaining = sptPoolAssignAction.remainingFte
              if (remaining <= 0) {
                closeSptPoolAssignAction()
                return
              }

              const currentMap = getTherapistFteByTeam(staffId)
              const nextMap: Partial<Record<Team, number>> = { ...currentMap }
              nextMap[targetTeam] = (nextMap[targetTeam] ?? 0) + remaining
              const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

              captureUndoCheckpoint('Therapist slot assignment')
              setStaffOverrides(prev => {
                const existing = prev[staffId]
                const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                return {
                  ...prev,
                  [staffId]: {
                    ...(existing ?? { leaveType, fteRemaining: total }),
                    leaveType,
                    fteRemaining: total,
                    therapistTeamFTEByTeam: nextMap,
                    therapistTeamHalfDayByTeam: undefined,
                    therapistTeamHalfDayUiByTeam: undefined,
                    therapistNoAllocation: false,
                    team: undefined,
                  },
                }
              })

              closeSptPoolAssignAction()
            }}
            position={sptPoolAssignAction.position}
            hint="Choose a target team, then confirm."
          />
        )}

      {/* Staff Pool: Convert buffer staff to inactive (confirm) */}
      {bufferStaffConvertConfirm.show &&
        bufferStaffConvertConfirm.position &&
        bufferStaffConvertConfirm.staffId && (
          <ConfirmPopover
            title="Convert to inactive"
            description={
              bufferStaffConvertConfirm.staffName
                ? `Convert "${bufferStaffConvertConfirm.staffName}" to inactive staff?`
                : 'Convert to inactive staff?'
            }
            onClose={() =>
              setBufferStaffConvertConfirm({ show: false, position: null, staffId: null, staffName: null })
            }
            onConfirm={async () => {
              const id = bufferStaffConvertConfirm.staffId
              if (!id) return
              const result = await convertBufferStaffToInactiveAction(id)
              if (result.ok) {
                showActionToast('Converted to inactive.', 'success')
                loadStaff()
              } else {
                showActionToast('Failed to convert to inactive. Please try again.', 'error')
              }

              setBufferStaffConvertConfirm({ show: false, position: null, staffId: null, staffName: null })
            }}
            position={bufferStaffConvertConfirm.position}
          />
        )}

      {/* Staff Pool: Edit buffer staff dialog */}
      {bufferStaffEditDialog.open && (
        <BufferStaffCreateDialog
          open={bufferStaffEditDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setBufferStaffEditDialog({ open: false, staff: null, initialAvailableSlots: null })
            }
          }}
          onSave={() => {
            setBufferStaffEditDialog({ open: false, staff: null, initialAvailableSlots: null })
            loadStaff()
          }}
          specialPrograms={specialPrograms}
          staffToEdit={bufferStaffEditDialog.staff}
          initialAvailableSlots={bufferStaffEditDialog.initialAvailableSlots}
        />
      )}

      {/* PCA contextual action popovers (Move/Discard) */}
      {pcaContextAction.show &&
        pcaContextAction.position &&
        pcaContextAction.staffId &&
        pcaContextAction.sourceTeam &&
        pcaContextAction.staffName && (
          <>
            {pcaContextAction.phase === 'team' && pcaContextAction.mode === 'move' ? (
              <TeamPickerPopover
                title="Move slot"
                teams={visibleTeams}
                selectedTeam={pcaContextAction.targetTeam}
                onSelectTeam={(t) => setPcaContextAction(prev => ({ ...prev, targetTeam: t }))}
                disabledTeams={pcaContextAction.sourceTeam ? [pcaContextAction.sourceTeam] : []}
                onClose={closePcaContextAction}
                confirmDisabled={
                  !pcaContextAction.targetTeam ||
                  pcaContextAction.targetTeam === pcaContextAction.sourceTeam
                }
                onConfirm={() => {
                  const targetTeam = pcaContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === pcaContextAction.sourceTeam) return

                  // Single-slot: confirm immediately; Multi-slot: next page = slot picker
                  if (pcaContextAction.availableSlots.length === 1) {
                    performSlotTransfer(targetTeam, {
                      staffId: pcaContextAction.staffId!,
                      sourceTeam: pcaContextAction.sourceTeam!,
                      selectedSlots: pcaContextAction.availableSlots,
                      closeSlotPopover: false,
                    })
                    closePcaContextAction()
                    return
                  }

                  setPcaContextAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                position={pcaContextAction.position}
                hint="Choose a target team, then confirm."
                pageIndicator={
                  pcaContextAction.availableSlots.length > 1 ? { current: 1, total: 2 } : undefined
                }
                onNextPage={() => {
                  // Next = same as confirm on page 1
                  const targetTeam = pcaContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === pcaContextAction.sourceTeam) return
                  if (pcaContextAction.availableSlots.length === 1) return
                  setPcaContextAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                onPrevPage={() => {}}
                prevDisabled={true}
                nextDisabled={
                  !pcaContextAction.targetTeam ||
                  pcaContextAction.targetTeam === pcaContextAction.sourceTeam ||
                  pcaContextAction.availableSlots.length === 1
                }
              />
            ) : null}

            {pcaContextAction.phase === 'slots' ? (
              <SlotSelectionPopover
                staffName={pcaContextAction.staffName}
                availableSlots={pcaContextAction.availableSlots}
                selectedSlots={pcaContextAction.selectedSlots}
                onSlotToggle={handlePcaContextSlotToggle}
                onClose={closePcaContextAction}
                onStartDrag={() => {
                  // confirm-mode; no dragging in this flow
                }}
                position={pcaContextAction.position}
                isDiscardMode={pcaContextAction.mode === 'discard'}
                mode="confirm"
                onConfirm={() => {
                  if (!pcaContextAction.staffId || !pcaContextAction.sourceTeam) return
                  if (pcaContextAction.selectedSlots.length === 0) return

                  if (pcaContextAction.mode === 'discard') {
                    performSlotDiscard(pcaContextAction.staffId, pcaContextAction.sourceTeam, pcaContextAction.selectedSlots)
                    closePcaContextAction()
                    return
                  }

                  const targetTeam = pcaContextAction.targetTeam
                  if (!targetTeam) return
                  performSlotTransfer(targetTeam, {
                    staffId: pcaContextAction.staffId,
                    sourceTeam: pcaContextAction.sourceTeam,
                    selectedSlots: pcaContextAction.selectedSlots,
                    closeSlotPopover: false,
                  })
                  closePcaContextAction()
                }}
              />
            ) : null}
          </>
        )}

      {/* Therapist contextual action popovers (Move/Discard/Split/Merge) */}
      {therapistContextAction.show &&
        therapistContextAction.position &&
        therapistContextAction.staffId &&
        therapistContextAction.sourceTeam && (
          <>
            {/* Move (team picker) */}
            {therapistContextAction.mode === 'move' && therapistContextAction.phase === 'team' ? (
              <TeamPickerPopover
                title="Move slot"
                teams={visibleTeams}
                selectedTeam={therapistContextAction.targetTeam}
                onSelectTeam={(t) => setTherapistContextAction(prev => ({ ...prev, targetTeam: t }))}
                disabledTeams={therapistContextAction.sourceTeam ? [therapistContextAction.sourceTeam] : []}
                onClose={closeTherapistContextAction}
                confirmDisabled={
                  !therapistContextAction.targetTeam ||
                  therapistContextAction.targetTeam === therapistContextAction.sourceTeam
                }
                onConfirm={() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const targetTeam = therapistContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === sourceTeam) return

                  const currentMap = getTherapistFteByTeam(staffId)
                  const fteToMove = currentMap[sourceTeam] ?? 0
                  if (fteToMove <= 0) {
                    showActionToast('No FTE found to move for this staff card.', 'warning')
                    closeTherapistContextAction()
                    return
                  }

                  const nextMap: Partial<Record<Team, number>> = { ...currentMap }
                  delete nextMap[sourceTeam]
                  nextMap[targetTeam] = (nextMap[targetTeam] ?? 0) + fteToMove
                  const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

                  captureUndoCheckpoint('Therapist slot move')
                  setStaffOverrides(prev => {
                    const existing = prev[staffId]
                    const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                    return {
                      ...prev,
                      [staffId]: {
                        ...(existing ?? { leaveType, fteRemaining: total }),
                        leaveType,
                        fteRemaining: total,
                        therapistTeamFTEByTeam: nextMap,
                        therapistTeamHalfDayByTeam: undefined,
                        therapistTeamHalfDayUiByTeam: undefined,
                        therapistNoAllocation: false,
                        team: undefined,
                      },
                    }
                  })

                  closeTherapistContextAction()
                }}
                position={therapistContextAction.position}
                hint="Choose a target team, then confirm."
              />
            ) : null}

            {/* Discard (confirm) */}
            {therapistContextAction.mode === 'discard' && therapistContextAction.phase === 'confirmDiscard' ? (
              <ConfirmPopover
                title="Discard slot"
                description="This will remove this therapist allocation from the selected team (ad hoc override)."
                onClose={closeTherapistContextAction}
                onConfirm={() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const currentMap = getTherapistFteByTeam(staffId)
                  const nextMap: Partial<Record<Team, number>> = { ...currentMap }
                  delete nextMap[sourceTeam]
                  const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

                  captureUndoCheckpoint('Therapist slot discard')
                  setStaffOverrides(prev => {
                    const existing = prev[staffId]
                    const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                    const hasAnyAllocation = Object.values(nextMap).some(v => typeof v === 'number' && v > 0)
                    return {
                      ...prev,
                      [staffId]: {
                        ...(existing ?? { leaveType, fteRemaining: total }),
                        leaveType,
                        fteRemaining: total,
                        therapistTeamFTEByTeam: nextMap,
                        therapistTeamHalfDayByTeam: undefined,
                        therapistTeamHalfDayUiByTeam: undefined,
                        therapistNoAllocation: !hasAnyAllocation,
                        team: undefined,
                      },
                    }
                  })

                  closeTherapistContextAction()
                }}
                position={therapistContextAction.position}
              />
            ) : null}

            {/* Split: page 1 team picker */}
            {therapistContextAction.mode === 'split' && therapistContextAction.phase === 'team' ? (
              <TeamPickerPopover
                title="Split slot"
                teams={visibleTeams}
                selectedTeam={therapistContextAction.targetTeam}
                onSelectTeam={(t) => setTherapistContextAction(prev => ({ ...prev, targetTeam: t }))}
                disabledTeams={therapistContextAction.sourceTeam ? [therapistContextAction.sourceTeam] : []}
                onClose={closeTherapistContextAction}
                confirmDisabled={
                  !therapistContextAction.targetTeam ||
                  therapistContextAction.targetTeam === therapistContextAction.sourceTeam
                }
                onConfirm={() => {
                  const targetTeam = therapistContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === therapistContextAction.sourceTeam) return
                  setTherapistContextAction(prev => ({ ...prev, phase: 'splitFte' }))
                }}
                position={therapistContextAction.position}
                hint="Pick the destination team for the moved portion."
                pageIndicator={{ current: 1, total: 2 }}
                onNextPage={() => {
                  const targetTeam = therapistContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === therapistContextAction.sourceTeam) return
                  setTherapistContextAction(prev => ({ ...prev, phase: 'splitFte' }))
                }}
                onPrevPage={() => {}}
                prevDisabled={true}
                nextDisabled={
                  !therapistContextAction.targetTeam ||
                  therapistContextAction.targetTeam === therapistContextAction.sourceTeam
                }
              />
            ) : null}

            {/* Split: page 2 FTE input */}
            {therapistContextAction.mode === 'split' && therapistContextAction.phase === 'splitFte' ? (
              <div
                className="absolute z-[10003] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[240px]"
                style={{
                  left: therapistContextAction.position.x,
                  top: therapistContextAction.position.y,
                  pointerEvents: 'auto',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTherapistContextAction()
                  }}
                  className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 pr-4">
                  Split slot
                </div>
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Enter the moved portion (multiples of 0.25). The remaining portion will stay in the current team.
                </div>

                {(() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const targetTeam = therapistContextAction.targetTeam
                  const currentMap = getTherapistFteByTeam(staffId)
                  const currentTeams = Object.entries(currentMap).filter(([, v]) => (v ?? 0) > 0)
                  const sourceFte = currentMap[sourceTeam] ?? 0
                  const hasExistingMultiTeam = currentTeams.length > 1

                  const isQuarterMultiple = (n: number) => {
                    const scaled = Math.round(n * 4)
                    return Math.abs(n * 4 - scaled) < 1e-6
                  }
                  const isSourceQuarterMultiple = isQuarterMultiple(sourceFte)

                  const inputMode = therapistContextAction.splitInputMode ?? 'moved'
                  const inputValue = therapistContextAction.movedFteQuarter ?? 0

                  const moved = inputMode === 'moved' ? inputValue : Math.max(0, sourceFte - inputValue)
                  const stay = inputMode === 'moved' ? Math.max(0, sourceFte - inputValue) : inputValue

                  const movedIsQuarter = isQuarterMultiple(moved)
                  const stayIsQuarter = isQuarterMultiple(stay)

                  // Validation rules:
                  // - Both portions must be >= 0.25
                  // - Total must equal sourceFte (up to float tolerance)
                  // - If sourceFte is a quarter multiple: require BOTH to be quarter multiples.
                  // - Else: require at least ONE portion to be a quarter multiple (user can choose which via inputMode).
                  const totalOk = Math.abs((moved + stay) - sourceFte) < 1e-6
                  const quarterOk = isSourceQuarterMultiple ? (movedIsQuarter && stayIsQuarter) : (movedIsQuarter || stayIsQuarter)

                  const staffMember = staff.find(s => s.id === staffId) || bufferStaff.find(s => s.id === staffId)
                  const isSPT = staffMember?.rank === 'SPT'
                  const isSeventyFiveTotal = Math.abs(sourceFte - 0.75) < 0.01
                  const isSeventyFiveSplit =
                    isSeventyFiveTotal &&
                    ((Math.abs(moved - 0.5) < 0.01 && Math.abs(stay - 0.25) < 0.01) ||
                      (Math.abs(moved - 0.25) < 0.01 && Math.abs(stay - 0.5) < 0.01))

                  const movedHalfDayChoice = therapistContextAction.splitMovedHalfDayChoice ?? 'AUTO'
                  const stayHalfDayChoice = therapistContextAction.splitStayHalfDayChoice ?? 'AUTO'
                  const canHalfDayTag =
                    !!isSPT && isSeventyFiveSplit && !!sptWeekdayByStaffId?.[staffId]?.hasAM && !!sptWeekdayByStaffId?.[staffId]?.hasPM
                  const halfDayConflict =
                    canHalfDayTag &&
                    movedHalfDayChoice !== 'AUTO' &&
                    movedHalfDayChoice !== 'UNSPECIFIED' &&
                    stayHalfDayChoice !== 'AUTO' &&
                    stayHalfDayChoice !== 'UNSPECIFIED' &&
                    movedHalfDayChoice === stayHalfDayChoice

                  const canConfirm =
                    !!targetTeam &&
                    !hasExistingMultiTeam &&
                    Number.isFinite(inputValue) &&
                    moved >= 0.25 &&
                    stay >= 0.25 &&
                    totalOk &&
                    quarterOk &&
                    !halfDayConflict

                  return (
                    <>
                      {hasExistingMultiTeam ? (
                        <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">
                          Split is currently only supported when this therapist has a single team allocation.
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Current team FTE: {sourceFte.toFixed(2)}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[10px] text-slate-600 dark:text-slate-300">
                                {inputMode === 'moved'
                                  ? `Moved portion (to ${targetTeam ?? '—'})`
                                  : `Stay-in portion (in ${sourceTeam})`}
                              </label>
                              <button
                                type="button"
                                className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTherapistContextAction(prev => ({
                                    ...prev,
                                    splitInputMode: (prev.splitInputMode ?? 'moved') === 'moved' ? 'stay' : 'moved',
                                  }))
                                }}
                              >
                                Swap input
                              </button>
                            </div>
                            <Input
                              type="number"
                              step={0.25}
                              min={0.25}
                              max={Math.max(0.25, sourceFte - 0.25)}
                              value={therapistContextAction.movedFteQuarter ?? ''}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                setTherapistContextAction(prev => ({
                                  ...prev,
                                  movedFteQuarter: Number.isFinite(v) ? v : null,
                                }))
                              }}
                              className="h-8 text-xs"
                            />
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              Move to {targetTeam ?? '—'}: {moved.toFixed(2)}{' '}
                              {(!isSourceQuarterMultiple && movedIsQuarter) || (isSourceQuarterMultiple && movedIsQuarter) ? '' : ''}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              Stays in {sourceTeam}: {stay.toFixed(2)}
                            </div>
                            {canHalfDayTag && (
                              <div className="mt-2 space-y-1">
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                  Half-day tag (0.75 split only): <span className="font-semibold">Auto</span> resolves AM/PM from weekday slot config.{' '}
                                  <span className="font-semibold">Unspecified</span> hides the label but still resolves internally (Auto).
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] text-slate-600 dark:text-slate-300">
                                      Move to {targetTeam ?? '—'}
                                    </div>
                                    <div className="inline-flex rounded border border-input overflow-hidden">
                                      {(['AUTO', 'AM', 'PM', 'UNSPECIFIED'] as const).map(opt => (
                                        <button
                                          key={opt}
                                          type="button"
                                          className={cn(
                                            'px-2 py-1 text-[10px] font-medium',
                                            (therapistContextAction.splitMovedHalfDayChoice ?? 'AUTO') === opt
                                              ? 'bg-slate-700 text-white'
                                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setTherapistContextAction(prev => ({ ...prev, splitMovedHalfDayChoice: opt }))
                                          }}
                                        >
                                          {opt === 'UNSPECIFIED' ? 'UNSP' : opt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] text-slate-600 dark:text-slate-300">
                                      Stays in {sourceTeam}
                                    </div>
                                    <div className="inline-flex rounded border border-input overflow-hidden">
                                      {(['AUTO', 'AM', 'PM', 'UNSPECIFIED'] as const).map(opt => (
                                        <button
                                          key={opt}
                                          type="button"
                                          className={cn(
                                            'px-2 py-1 text-[10px] font-medium',
                                            (therapistContextAction.splitStayHalfDayChoice ?? 'AUTO') === opt
                                              ? 'bg-slate-700 text-white'
                                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setTherapistContextAction(prev => ({ ...prev, splitStayHalfDayChoice: opt }))
                                          }}
                                        >
                                          {opt === 'UNSPECIFIED' ? 'UNSP' : opt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                {halfDayConflict && (
                                  <div className="text-[10px] text-amber-700 dark:text-amber-300">
                                    Half-day tags cannot be the same for both portions.
                                  </div>
                                )}
                              </div>
                            )}
                            {!quarterOk && (
                              <div className="text-[10px] text-amber-700 dark:text-amber-300">
                                For non-0.25-multiple totals, ensure either the moved portion or the stay-in portion is a multiple of 0.25 (use “Swap input”).
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tooltip content="Previous" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                              onClick={(e) => {
                                e.stopPropagation()
                                setTherapistContextAction(prev => ({ ...prev, phase: 'team' }))
                              }}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <div className="text-sm text-slate-400 dark:text-slate-500 leading-none select-none">
                            • •
                          </div>
                          <Tooltip content="Next" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className="p-1 rounded opacity-40 cursor-not-allowed text-slate-600 dark:text-slate-300"
                              disabled
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Tooltip content="Cancel" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                              onClick={(e) => {
                                e.stopPropagation()
                                closeTherapistContextAction()
                              }}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Confirm" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className={cn(
                                'p-1 rounded text-amber-700 dark:text-amber-300',
                                canConfirm ? 'hover:bg-amber-100 dark:hover:bg-amber-900/40' : 'opacity-50 cursor-not-allowed'
                              )}
                              disabled={!canConfirm}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!canConfirm || !targetTeam) return

                                const nextMap: Partial<Record<Team, number>> = {
                                  [sourceTeam]: stay,
                                  [targetTeam]: moved,
                                }
                                const total = stay + moved

                                // Optional half-day tagging for 0.75 split SPT (for display + validation).
                                let halfDayByTeam: Partial<Record<Team, 'AM' | 'PM'>> | undefined = undefined
                                let halfDayUiByTeam:
                                  | Partial<Record<Team, 'AUTO' | 'AM' | 'PM' | 'UNSPECIFIED'>>
                                  | undefined = undefined

                                if (canHalfDayTag) {
                                  const cfg = sptWeekdayByStaffId?.[staffId]
                                  const computeEff = (slots: number[], mode: 'AND' | 'OR') => {
                                    if (slots.length === 0) return 0
                                    if (mode === 'OR' && slots.length > 1) return 1
                                    return slots.length
                                  }
                                  const resolveAutoForPortion = (portionFte: number): 'AM' | 'PM' => {
                                    if (!cfg) return portionFte >= 0.5 ? 'AM' : 'PM'
                                    const amSlots = (cfg.slots || []).filter(s => s === 1 || s === 2)
                                    const pmSlots = (cfg.slots || []).filter(s => s === 3 || s === 4)
                                    const amEff = computeEff(amSlots, (cfg.slotModes?.am ?? 'AND') as any)
                                    const pmEff = computeEff(pmSlots, (cfg.slotModes?.pm ?? 'AND') as any)
                                    if (amEff === 0 && pmEff > 0) return 'PM'
                                    if (pmEff === 0 && amEff > 0) return 'AM'
                                    if (portionFte >= 0.5) {
                                      return amEff >= pmEff ? 'AM' : 'PM'
                                    }
                                    return amEff <= pmEff ? 'AM' : 'PM'
                                  }

                                  const movedUi = movedHalfDayChoice
                                  const stayUi = stayHalfDayChoice

                                  const movedResolved: 'AM' | 'PM' =
                                    movedUi === 'AM'
                                      ? 'AM'
                                      : movedUi === 'PM'
                                        ? 'PM'
                                        : resolveAutoForPortion(moved)
                                  const stayResolved: 'AM' | 'PM' =
                                    stayUi === 'AM'
                                      ? 'AM'
                                      : stayUi === 'PM'
                                        ? 'PM'
                                        : (movedResolved === 'AM' ? 'PM' : 'AM')

                                  halfDayByTeam = {
                                    [sourceTeam]: stayResolved,
                                    [targetTeam]: movedResolved,
                                  }
                                  halfDayUiByTeam = {
                                    [sourceTeam]: stayUi,
                                    [targetTeam]: movedUi,
                                  }
                                }

                                captureUndoCheckpoint('Therapist slot split')
                                setStaffOverrides(prev => {
                                  const existing = prev[staffId]
                                  const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                                  return {
                                    ...prev,
                                    [staffId]: {
                                      ...(existing ?? { leaveType, fteRemaining: total }),
                                      leaveType,
                                      fteRemaining: total,
                                      therapistTeamFTEByTeam: nextMap,
                                      therapistTeamHalfDayByTeam: halfDayByTeam,
                                      therapistTeamHalfDayUiByTeam: halfDayUiByTeam,
                                      therapistNoAllocation: false,
                                      team: undefined,
                                    },
                                  }
                                })

                                closeTherapistContextAction()
                              }}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : null}

            {/* Merge: select which team allocations to merge into current team */}
            {therapistContextAction.mode === 'merge' && therapistContextAction.phase === 'mergeSelect' ? (
              <div
                className="absolute z-[10003] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[260px]"
                style={{
                  left: therapistContextAction.position.x,
                  top: therapistContextAction.position.y,
                  pointerEvents: 'auto',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTherapistContextAction()
                  }}
                  className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 pr-4">
                  Merge slot
                </div>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    {therapistContextAction.mergeInputMode === 'intoSelected'
                      ? 'Swap mode: pick exactly 1 destination team to merge into.'
                      : `Select team allocations to merge into ${therapistContextAction.sourceTeam}.`}
                  </div>
                  <button
                    type="button"
                    className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTherapistContextAction(prev => ({
                        ...prev,
                        mergeInputMode: (prev.mergeInputMode ?? 'intoSource') === 'intoSource' ? 'intoSelected' : 'intoSource',
                        // clear selection when swapping direction to avoid ambiguity
                        mergeTeams: [],
                      }))
                    }}
                  >
                    Swap
                  </button>
                </div>

                {(() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const currentMap = getTherapistFteByTeam(staffId)
                  const candidates = Object.entries(currentMap)
                    .filter(([t, v]) => t !== sourceTeam && (v ?? 0) > 0)
                    .map(([t]) => t as Team)

                  const inputMode = therapistContextAction.mergeInputMode ?? 'intoSource'
                  const confirmDisabled =
                    inputMode === 'intoSelected'
                      ? therapistContextAction.mergeTeams.length !== 1
                      : therapistContextAction.mergeTeams.length === 0

                  return (
                    <>
                      {candidates.length === 0 ? (
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                          No other team allocations found for this therapist.
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                          {candidates.map(t => (
                            <div key={t} className="flex items-center gap-2">
                              <Checkbox
                                checked={therapistContextAction.mergeTeams.includes(t)}
                                onCheckedChange={(checked) => {
                                  setTherapistContextAction(prev => ({
                                    ...prev,
                                    mergeTeams:
                                      (prev.mergeInputMode ?? 'intoSource') === 'intoSelected'
                                        ? (checked ? [t] : [])
                                        : (checked
                                            ? Array.from(new Set([...prev.mergeTeams, t]))
                                            : prev.mergeTeams.filter(x => x !== t)),
                                  }))
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                }}
                              />
                              <div className="text-xs text-slate-700 dark:text-slate-200">{t}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {inputMode === 'intoSelected' && (
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          Destination team: {therapistContextAction.mergeTeams[0] ?? '—'}
                        </div>
                      )}

                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-end gap-1.5">
                        <Tooltip content="Cancel" side="top" zIndex={120000}>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            onClick={(e) => {
                              e.stopPropagation()
                              closeTherapistContextAction()
                            }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Confirm" side="top" zIndex={120000}>
                          <button
                            type="button"
                            className={cn(
                              'p-1 rounded text-amber-700 dark:text-amber-300',
                              confirmDisabled
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            )}
                            disabled={confirmDisabled}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirmDisabled) return

                              const nextMap: Partial<Record<Team, number>> = { ...currentMap }
                              const mode = therapistContextAction.mergeInputMode ?? 'intoSource'

                              if (mode === 'intoSelected') {
                                const destTeam = therapistContextAction.mergeTeams[0]
                                if (!destTeam) return
                                // Merge sourceTeam into destTeam (swap direction)
                                const sourceFte = nextMap[sourceTeam] ?? 0
                                nextMap[destTeam] = (nextMap[destTeam] ?? 0) + sourceFte
                                delete nextMap[sourceTeam]
                              } else {
                                // Default: merge selected teams into sourceTeam
                                let added = 0
                                for (const t of therapistContextAction.mergeTeams) {
                                  added += nextMap[t] ?? 0
                                  delete nextMap[t]
                                }
                                nextMap[sourceTeam] = (nextMap[sourceTeam] ?? 0) + added
                              }

                              const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

                              captureUndoCheckpoint('Therapist slot merge')
                              setStaffOverrides(prev => {
                                const existing = prev[staffId]
                                const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                                return {
                                  ...prev,
                                  [staffId]: {
                                    ...(existing ?? { leaveType, fteRemaining: total }),
                                    leaveType,
                                    fteRemaining: total,
                                    therapistTeamFTEByTeam: nextMap,
                                        therapistTeamHalfDayByTeam: undefined,
                                        therapistTeamHalfDayUiByTeam: undefined,
                                    therapistNoAllocation: false,
                                    team: undefined,
                                  },
                                }
                              })

                              closeTherapistContextAction()
                            }}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : null}
          </>
        )}

      {/* Staff card Fill color popover (any step) */}
      {colorContextAction.show &&
        colorContextAction.position &&
        colorContextAction.staffId &&
        colorContextAction.team && (
          <div
            className="absolute z-[10004] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[260px]"
            style={{
              left: colorContextAction.position.x,
              top: colorContextAction.position.y,
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeColorContextAction()
              }}
              className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 pr-4">
              Fill color
            </div>
            <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Choose a color for this staff card (schedule override).
            </div>

            {(() => {
              const swatches: Array<{ label: string; className: string | null }> = [
                { label: 'Yellow', className: 'bg-yellow-200 dark:bg-yellow-900/30' },
                { label: 'Orange', className: 'bg-orange-200 dark:bg-orange-900/30' },
                { label: 'Red', className: 'bg-red-200 dark:bg-red-900/30' },
                { label: 'Green', className: 'bg-green-200 dark:bg-green-900/30' },
                { label: 'Teal', className: 'bg-teal-200 dark:bg-teal-900/30' },
                { label: 'Blue', className: 'bg-blue-200 dark:bg-blue-900/30' },
                { label: 'Purple', className: 'bg-violet-200 dark:bg-violet-900/30' },
                { label: 'Pink', className: 'bg-pink-200 dark:bg-pink-900/30' },
                { label: 'Gray', className: 'bg-gray-200 dark:bg-slate-700/60' },
                { label: 'None', className: null },
              ]

              const selected = colorContextAction.selectedClassName

              return (
                <>
                  <div className="mt-2 grid grid-cols-5 gap-1">
                    {swatches.map((s) => {
                      const isSelected = (s.className ?? null) === (selected ?? null)
                      return (
                        <Tooltip key={s.label} content={s.label} side="top" zIndex={120000}>
                          <button
                            type="button"
                            className={cn(
                              'h-8 w-10 rounded border',
                              s.className ?? 'bg-background border-input',
                              isSelected ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background' : 'border-slate-200 dark:border-slate-600'
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              setColorContextAction(prev => ({
                                ...prev,
                                selectedClassName: s.className,
                              }))
                            }}
                          />
                        </Tooltip>
                      )
                    })}
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-end gap-1.5">
                    <Tooltip content="Cancel" side="top" zIndex={120000}>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeColorContextAction()
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Confirm" side="top" zIndex={120000}>
                      <button
                        type="button"
                        className="p-1 rounded text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        onClick={(e) => {
                          e.stopPropagation()
                          const staffId = colorContextAction.staffId!
                          const team = colorContextAction.team!
                          const selectedClassName = colorContextAction.selectedClassName

                          captureUndoCheckpoint('Staff card color')
                          setStaffOverrides(prev => {
                            const current = prev[staffId]
                            // Ensure required base fields exist if we are creating a new entry.
                            // IMPORTANT: creating a staffOverrides entry must NOT accidentally change leave/FTE.
                            const staffMember =
                              staff.find(s => s.id === staffId) || bufferStaff.find(s => s.id === staffId)

                            const baseLeaveType: LeaveType | null =
                              typeof current?.leaveType !== 'undefined'
                                ? current.leaveType
                                : (staffMember?.rank === 'PCA'
                                    ? (Object.values(pcaAllocations).flat().find(a => a.staff_id === staffId)?.leave_type ??
                                      null)
                                    : getTherapistLeaveType(staffId))

                            const baseFteRemaining =
                              typeof current?.fteRemaining === 'number'
                                ? current.fteRemaining
                                : staffMember?.status === 'buffer' && typeof (staffMember as any)?.buffer_fte === 'number'
                                  ? ((staffMember as any).buffer_fte as number)
                                  : staffMember?.rank === 'PCA'
                                    ? (Object.values(pcaAllocations).flat().find(a => a.staff_id === staffId)?.fte_pca ??
                                      1.0)
                                    : (() => {
                                        // Therapist: infer from current allocations (sum across teams if split)
                                        let sum = 0
                                        for (const t of TEAMS) {
                                          for (const a of therapistAllocations[t] || []) {
                                            if (a.staff_id === staffId) sum += a.fte_therapist ?? 0
                                          }
                                        }
                                        return sum > 0 ? sum : 1.0
                                      })()

                            const nextByTeam = {
                              ...(((current as { cardColorByTeam?: Partial<Record<Team, string | null>> } | undefined)
                                ?.cardColorByTeam) ?? {}),
                            }
                            if (selectedClassName) nextByTeam[team] = selectedClassName
                            else delete nextByTeam[team]

                            return {
                              ...prev,
                              [staffId]: {
                                ...(current ?? { leaveType: baseLeaveType, fteRemaining: baseFteRemaining }),
                                cardColorByTeam: nextByTeam,
                              },
                            }
                          })

                          closeColorContextAction()
                        }}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      
      
      {/* Warning Popover for leave arrangement edit after step 1 */}
      {leaveEditWarningPopover.show && leaveEditWarningPopover.position && (
        <div
          className="absolute z-[9999] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-3 w-[200px]"
          style={{
            left: leaveEditWarningPopover.position.x,
            top: leaveEditWarningPopover.position.y,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setLeaveEditWarningPopover({ show: false, position: null })
            }}
            className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1 pr-4">
            Leave Arrangement Edit Not Available
          </div>
          <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
            Leave arrangement editing is only available in Step 1 (Leave & FTE). Please return to Step 1 to edit leave arrangements.
          </div>
        </div>
      )}

      {/* Warning Popover for bed relieving edit outside step 4 */}
      {bedRelievingEditWarningPopover.show && bedRelievingEditWarningPopover.position && (
        <div
          className="fixed z-[9999] px-2 py-1 text-xs text-popover-foreground bg-popover border border-amber-500 rounded-md shadow-md whitespace-normal max-w-[260px]"
          style={{
            left: bedRelievingEditWarningPopover.position.x,
            top: bedRelievingEditWarningPopover.position.y,
            pointerEvents: 'none',
          }}
        >
          Bed relieving note editing is only available in Step 4 (Bed Relieving). Please return to Step 4 to edit.
        </div>
      )}
      
      {/* PCA Drag Overlay - shows mini card with selected slots (when dragging from popover) */}
      {pcaDragState.isDraggingFromPopover && pcaDragState.staffName && pcaDragState.selectedSlots.length > 0 && (
        <div
          className="fixed z-[10000] pointer-events-none"
          style={{
            left: mousePositionRef.current.x - 60,
            top: mousePositionRef.current.y - 20,
          }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-md shadow-lg border-2 border-amber-500 p-2 min-w-[120px]">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {pcaDragState.staffName}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {pcaDragState.selectedSlots.sort((a, b) => a - b).map(slot => {
                const slotTime = slot === 1 ? '0900-1030' : slot === 2 ? '1030-1200' : slot === 3 ? '1330-1500' : '1500-1630'
                return slotTime
              }).join(', ')}
            </div>
            {pcaDragState.selectedSlots.length > 1 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                {pcaDragState.selectedSlots.length} slots ({(pcaDragState.selectedSlots.length * 0.25).toFixed(2)} FTE)
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* DragOverlay for regular card drags */}
      <DragOverlay modifiers={[snapCenterToCursor]}>
        {!pcaDragState.isDraggingFromPopover && activeDragStaffForOverlay ? (
          <div
            className={cn(
              'pointer-events-none select-none',
              isLikelyMobileDevice && 'origin-center scale-125 translate-y-3'
            )}
          >
            <div
              className={cn(
                'bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-300 dark:border-slate-600 px-2 py-1',
                isLikelyMobileDevice && 'ring-2 ring-primary/30 shadow-2xl'
              )}
            >
              <div className={cn('text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap', isLikelyMobileDevice && 'text-base')}>
                {activeDragStaffForOverlay.name}
                {activeDragStaffForOverlay.status === 'buffer' ? '*' : ''}
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>

    </>
  )
}
