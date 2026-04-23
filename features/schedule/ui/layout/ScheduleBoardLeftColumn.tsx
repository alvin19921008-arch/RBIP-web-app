'use client'

import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react'
import { StaffPool } from '@/components/allocation/StaffPool'
import {
  ScheduleSummaryColumn,
  type ScheduleSummaryColumnProps,
} from '@/features/schedule/ui/layout/ScheduleSummaryColumn'
import { cn } from '@/lib/utils'
import type { Team, Staff, Weekday } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { SpecialProgram } from '@/types/allocation'
import type { StaffOverrideState } from '@/lib/features/schedule/controller/scheduleControllerTypes'
import { createActivePcaDragState, type PcaDragState } from '@/lib/features/schedule/dnd/dragState'

type PcaAllocationsForUi = Record<Team, (PCAAllocation & { staff?: Staff })[]>

export interface ScheduleBoardLeftPcaSlotTransferProps {
  setPcaDragState: Dispatch<SetStateAction<PcaDragState>>
  createActivePcaDragState: typeof createActivePcaDragState
  staff: Staff[]
  performSlotTransfer: (targetTeam: Team) => void
}

export interface ScheduleBoardLeftStaffPoolProps {
  therapists: Staff[]
  pcas: Staff[]
  inactiveStaff: Staff[]
  bufferStaff: Staff[]
  onConvertInactiveToBuffer: (args: { staff: Staff; bufferFTE: number }) => void
  openStaffPoolContextMenu: (staffId: string, event?: React.MouseEvent) => void
  staffOverrides: Record<string, StaffOverrideState>
  specialPrograms: SpecialProgram[]
  pcaAllocations: PcaAllocationsForUi
  currentStep: string
  initializedSteps: Set<string>
  poolWeekday: Weekday | undefined
  staffPoolContextMenuOpen: boolean
  snapshotNotice?: string
  snapshotDateLabel?: string
  pcaSlotTransfer: ScheduleBoardLeftPcaSlotTransferProps
}

export interface ScheduleBoardLeftColumnProps {
  summaryColumnProps: ScheduleSummaryColumnProps
  isDisplayMode: boolean
  MaybeProfiler: ComponentType<{ id: string; children: ReactNode }>
  staffPool: ScheduleBoardLeftStaffPoolProps
}

export function ScheduleBoardLeftColumn({
  summaryColumnProps,
  isDisplayMode,
  MaybeProfiler,
  staffPool,
}: ScheduleBoardLeftColumnProps) {
  const {
    therapists,
    pcas,
    inactiveStaff,
    bufferStaff,
    onConvertInactiveToBuffer,
    openStaffPoolContextMenu,
    staffOverrides,
    specialPrograms,
    pcaAllocations,
    currentStep,
    initializedSteps,
    poolWeekday,
    staffPoolContextMenuOpen,
    snapshotNotice,
    snapshotDateLabel,
    pcaSlotTransfer,
  } = staffPool

  const { setPcaDragState, createActivePcaDragState, staff, performSlotTransfer } = pcaSlotTransfer

  return (
    <>
      <ScheduleSummaryColumn {...summaryColumnProps} />

      <div
        className={cn(
          'vt-mode-anim',
          'flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden transition-[width,max-height,opacity,margin] duration-300 ease-in-out',
          isDisplayMode ? 'w-0 max-h-0 opacity-0 -mt-2 pointer-events-none' : 'w-40 max-h-[9999px] opacity-100 mt-0'
        )}
        aria-hidden={isDisplayMode}
      >
        <div className="flex-1 min-h-0">
          <MaybeProfiler id="StaffPool">
            <StaffPool
              therapists={therapists}
              pcas={pcas}
              inactiveStaff={inactiveStaff}
              bufferStaff={bufferStaff}
              onConvertInactiveToBuffer={onConvertInactiveToBuffer}
              onOpenStaffContextMenu={openStaffPoolContextMenu}
              staffOverrides={staffOverrides}
              specialPrograms={specialPrograms}
              pcaAllocations={pcaAllocations}
              currentStep={currentStep}
              initializedSteps={initializedSteps}
              weekday={poolWeekday}
              disableDragging={staffPoolContextMenuOpen}
              snapshotNotice={snapshotNotice}
              snapshotDateLabel={snapshotDateLabel}
              onSlotTransfer={(staffId: string, targetTeam: string, slots: number[]) => {
                let sourceTeam: Team | null = null
                for (const [team, allocs] of Object.entries(pcaAllocations)) {
                  if (allocs.some((a) => a.staff_id === staffId)) {
                    sourceTeam = team as Team
                    break
                  }
                }
                if (sourceTeam) {
                  const staffMember = staff.find((s) => s.id === staffId)
                  const isBufferStaff = staffMember?.status === 'buffer'
                  setPcaDragState(
                    createActivePcaDragState({
                      staffId,
                      staffName: staffMember?.name || null,
                      sourceTeam,
                      availableSlots: staffOverrides[staffId]?.availableSlots || [1, 2, 3, 4],
                      selectedSlots: slots,
                      popoverPosition: null,
                      isBufferStaff: isBufferStaff || false,
                    })
                  )
                  performSlotTransfer(targetTeam as Team)
                }
              }}
            />
          </MaybeProfiler>
        </div>
      </div>
    </>
  )
}
