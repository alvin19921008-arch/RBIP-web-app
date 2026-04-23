'use client'

import dynamic from 'next/dynamic'
import {
  Fragment,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react'
import { Info } from 'lucide-react'
import { TherapistBlock } from '@/components/allocation/TherapistBlock'
import { PCABlock } from '@/components/allocation/PCABlock'
import { AllocationNotesBoard } from '@/components/allocation/AllocationNotesBoard'
import { BedBlock } from '@/components/allocation/BedBlock'
import { LeaveBlock } from '@/components/allocation/LeaveBlock'
import { CalculationBlock } from '@/components/allocation/CalculationBlock'
import { PCACalculationBlock } from '@/components/allocation/PCACalculationBlock'
import { PcaAllocationLegendPopover } from '@/components/allocation/PcaAllocationLegendPopover'
import { AvgPcaFormulaPopoverContent } from '@/components/help/AvgPcaFormulaPopoverContent'
import { FormulaBlock, FormulaChip } from '@/components/help/avgPcaFormulaSteps'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { getMainTeam, type TeamMergeResolvedConfig } from '@/lib/utils/teamMerge'
import { EMPTY_BED_ALLOCATIONS } from '@/lib/features/schedule/constants'
import type { Step3FlowChoice } from '@/lib/features/schedule/step3DialogFlow'
import type { SptWeekdayComputed } from '@/lib/features/schedule/sptConfig'
import type { Team, Weekday, Staff, LeaveType } from '@/types/staff'
import type {
  AllocationTracker,
  BedAllocation,
  BedRelievingNotesByToTeam,
  PCAAllocation,
  ScheduleCalculations,
  StepStatus,
  TherapistAllocation,
} from '@/types/schedule'
import type { SpecialProgram } from '@/types/allocation'
import type { ScheduleWardRow, StaffOverrideState } from '@/lib/features/schedule/controller/scheduleControllerTypes'

const PCADedicatedScheduleTable = dynamic(
  () => import('@/components/allocation/PCADedicatedScheduleTable').then((m) => m.PCADedicatedScheduleTable),
  { ssr: false }
)

export type ScheduleBoardRightEditByTeam = Record<Team, (staffId: string, event?: React.MouseEvent) => void>

type TherapistBlockStaffOverrides = NonNullable<ComponentProps<typeof TherapistBlock>['staffOverrides']>
type SaveBedRelievingNotesForToTeam = NonNullable<
  ComponentProps<typeof BedBlock>['onSaveBedRelievingNotesForToTeam']
>

export interface ScheduleBoardRightLayoutShellProps {
  isDisplayMode: boolean
  isSplitMode: boolean
  gridLoading: boolean
  deferBelowFold: boolean
  scheduleMinWidthPx: number
  visibleTeams: Team[]
  visibleTeamGridStyle: CSSProperties
  mainTeamDisplayNames: Partial<Record<Team, string>>
}

export interface ScheduleBoardRightBoardRefsProps {
  rightContentRef: RefObject<HTMLDivElement | null>
  therapistAllocationBlockRef: RefObject<HTMLDivElement | null>
  pcaAllocationBlockRef: RefObject<HTMLDivElement | null>
}

export interface ScheduleBoardRightPcaBalanceSanity {
  positiveSum: number
  negativeAbsSum: number
  netDiff: number
  perTeamText: string
}

export interface ScheduleBoardRightTeamGridBundle {
  currentWeekday: Weekday
  /** Mirrors orchestrator `currentStep` (URL-driven string in practice). */
  currentStep: string
  stepStatus: Record<string, StepStatus>
  specialPrograms: SpecialProgram[]
  therapistAllocationsForDisplay: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  onEditTherapistByTeam: ScheduleBoardRightEditByTeam
  therapistOverridesByTeam: Record<Team, TherapistBlockStaffOverrides>
  sptWeekdayByStaffId: Record<string, SptWeekdayComputed> | undefined
  pcaAllocationsForDisplay: Record<Team, (PCAAllocation & { staff: Staff })[]>
  onEditPcaByTeam: ScheduleBoardRightEditByTeam
  calculationsForDisplay: Record<Team, ScheduleCalculations | null | undefined>
  step3DashboardAvgPcaDisplayByTeam: Partial<Record<Team, number>> | null | undefined
  allPCAAllocationsFlat: (PCAAllocation & { staff: Staff })[]
  pcaOverridesByTeam: Record<Team, Record<string, StaffOverrideState>>
  pcas: Staff[]
  initializedSteps: Set<string>
  popoverDragHoverTeam: Team | null
  allocationTracker: AllocationTracker | null | undefined
  step3FlowChoiceForTooltip: Step3FlowChoice | null | undefined
  step3OrderPositionByTeam: Partial<Record<Team, number>>
  pendingPCAFTEPerTeam: Partial<Record<Team, number>> | null | undefined
  floatingPoolRemainingFte: number | undefined
  bedAllocationsForDisplay: BedAllocation[]
  wards: ScheduleWardRow[]
  bedRelievingNotesByToTeamForDisplay: BedRelievingNotesByToTeam
  saveBedRelievingNotesForToTeam: SaveBedRelievingNotesForToTeam
  activeBedRelievingTransfer: { fromTeam: Team; toTeam: Team } | null
  setActiveBedRelievingTransfer: Dispatch<SetStateAction<{ fromTeam: Team; toTeam: Team } | null>>
  setBedRelievingEditWarningPopover: (v: { show: boolean; position: { x: number; y: number } }) => void
  staffOverrides: Record<string, StaffOverrideState>
  staff: Staff[]
  effectiveTeamMergeConfig: TeamMergeResolvedConfig
  handleEditStaff: (staffId: string, event?: React.MouseEvent) => void
  bedCountsOverridesByTeamForDisplay: Partial<
    Record<Team, { shsBedCounts?: number | null; studentPlacementBedCounts?: number | null }>
  >
  setEditingBedTeam: (team: Team) => void
  pcaBalanceSanity: ScheduleBoardRightPcaBalanceSanity
  bufferStaff: Staff[]
  pcaAllocations: Record<Team, (PCAAllocation & { staff?: Staff })[]>
  staffOverridesForPcaDisplay: Record<string, StaffOverrideState>
  userRole: string
  allocationNotesDoc: unknown
  saveAllocationNotes: (next: unknown) => Promise<void> | void
}

export interface ScheduleBoardRightColumnProps {
  MaybeProfiler: ComponentType<{ id: string; children: ReactNode }>
  layoutShell: ScheduleBoardRightLayoutShellProps
  boardRefs: ScheduleBoardRightBoardRefsProps
  teamGrid: ScheduleBoardRightTeamGridBundle
}

export function ScheduleBoardRightColumn({
  MaybeProfiler,
  layoutShell,
  boardRefs,
  teamGrid,
}: ScheduleBoardRightColumnProps) {
  const {
    isDisplayMode,
    isSplitMode,
    gridLoading,
    deferBelowFold,
    scheduleMinWidthPx,
    visibleTeams,
    visibleTeamGridStyle,
    mainTeamDisplayNames,
  } = layoutShell

  const { rightContentRef, therapistAllocationBlockRef, pcaAllocationBlockRef } = boardRefs

  const {
    currentWeekday,
    currentStep,
    stepStatus,
    specialPrograms,
    therapistAllocationsForDisplay,
    onEditTherapistByTeam,
    therapistOverridesByTeam,
    sptWeekdayByStaffId,
    pcaAllocationsForDisplay,
    onEditPcaByTeam,
    calculationsForDisplay,
    step3DashboardAvgPcaDisplayByTeam,
    allPCAAllocationsFlat,
    pcaOverridesByTeam,
    pcas,
    initializedSteps,
    popoverDragHoverTeam,
    allocationTracker,
    step3FlowChoiceForTooltip,
    step3OrderPositionByTeam,
    pendingPCAFTEPerTeam,
    floatingPoolRemainingFte,
    bedAllocationsForDisplay,
    wards,
    bedRelievingNotesByToTeamForDisplay,
    saveBedRelievingNotesForToTeam,
    activeBedRelievingTransfer,
    setActiveBedRelievingTransfer,
    setBedRelievingEditWarningPopover,
    staffOverrides,
    staff,
    effectiveTeamMergeConfig,
    handleEditStaff,
    bedCountsOverridesByTeamForDisplay,
    setEditingBedTeam,
    pcaBalanceSanity,
    bufferStaff,
    pcaAllocations,
    staffOverridesForPcaDisplay,
    userRole,
    allocationNotesDoc,
    saveAllocationNotes,
  } = teamGrid

  return (
    <>
      <div className="flex-1 min-w-0 bg-background relative">
        {isDisplayMode ? (
          <div
            className="absolute inset-0 z-[60] pointer-events-auto cursor-not-allowed bg-transparent"
            aria-hidden={true}
          />
        ) : null}
        {gridLoading && (
          <div className="absolute inset-0 z-50 pointer-events-auto bg-background">
            <div className="p-4 space-y-4">
              <div className="grid gap-2" style={visibleTeamGridStyle}>
                {Array.from({ length: visibleTeams.length }).map((_, i) => (
                  <div key={`hdr-skel-${i}`} className="h-6 rounded-md bg-muted animate-pulse" />
                ))}
              </div>

              <div className="space-y-3">
                <div className="h-4 w-40 rounded-md bg-muted animate-pulse" />
                <div className="grid gap-2" style={visibleTeamGridStyle}>
                  {Array.from({ length: visibleTeams.length }).map((_, i) => (
                    <div
                      key={`b1-skel-${i}`}
                      className="h-24 rounded-lg border border-border bg-card animate-pulse"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="h-4 w-32 rounded-md bg-muted animate-pulse" />
                <div className="grid gap-2" style={visibleTeamGridStyle}>
                  {Array.from({ length: visibleTeams.length }).map((_, i) => (
                    <div
                      key={`b2-skel-${i}`}
                      className="h-28 rounded-lg border border-border bg-card animate-pulse"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div
          className={cn(
            'sticky top-0 z-40 bg-background/95 border-b border-border',
            !isSplitMode && 'backdrop-blur'
          )}
        >
          <div className="grid gap-2 py-2" style={{ ...visibleTeamGridStyle, minWidth: `${scheduleMinWidthPx}px` }}>
            {visibleTeams.map((team) => (
              <h2 key={`header-${team}`} className="text-lg font-bold text-center">
                {mainTeamDisplayNames[team] || team}
              </h2>
            ))}
          </div>
        </div>

        <MaybeProfiler id="TeamGrid">
          <div className="bg-background">
            <div style={{ minWidth: `${scheduleMinWidthPx}px` }}>
              <div ref={rightContentRef}>
                <div ref={therapistAllocationBlockRef} className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Therapist Allocation</h3>
                  <div className="grid gap-2" style={visibleTeamGridStyle}>
                    {visibleTeams.map((team) => (
                      <TherapistBlock
                        key={`therapist-${team}`}
                        team={team}
                        allocations={therapistAllocationsForDisplay[team]}
                        specialPrograms={specialPrograms}
                        weekday={currentWeekday}
                        currentStep={currentStep}
                        onEditStaff={onEditTherapistByTeam[team]}
                        staffOverrides={therapistOverridesByTeam[team]}
                        sptWeekdayByStaffId={sptWeekdayByStaffId}
                      />
                    ))}
                  </div>
                </div>

                <div ref={pcaAllocationBlockRef} className="mb-4">
                  <div className="mb-2 flex items-center justify-center gap-1">
                    <h3 className="text-xs font-semibold">PCA Allocation</h3>
                    <PcaAllocationLegendPopover />
                  </div>
                  <div className="grid gap-2" style={visibleTeamGridStyle}>
                    {visibleTeams.map((team) => (
                      <Fragment key={`pca-${team}`}>
                        <PCABlock
                          team={team}
                          allocations={pcaAllocationsForDisplay[team]}
                          onEditStaff={onEditPcaByTeam[team]}
                          requiredPCA={calculationsForDisplay[team]?.required_pca_per_team}
                          averagePCAPerTeam={
                            step3DashboardAvgPcaDisplayByTeam?.[team] ??
                            calculationsForDisplay[team]?.average_pca_per_team
                          }
                          baseAveragePCAPerTeam={calculationsForDisplay[team]?.base_average_pca_per_team}
                          specialPrograms={specialPrograms}
                          allPCAAllocations={allPCAAllocationsFlat}
                          staffOverrides={pcaOverridesByTeam[team]}
                          allPCAStaff={pcas}
                          currentStep={currentStep}
                          step2Initialized={initializedSteps.has('therapist-pca')}
                          initializedSteps={initializedSteps}
                          weekday={currentWeekday}
                          externalHover={popoverDragHoverTeam === team}
                          allocationLog={allocationTracker?.[team]}
                          step3FlowChoice={step3FlowChoiceForTooltip}
                          step3OrderPosition={step3OrderPositionByTeam[team]}
                          pendingPcaFte={pendingPCAFTEPerTeam?.[team]}
                          floatingPoolRemainingFte={floatingPoolRemainingFte}
                        />
                      </Fragment>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Relieving Beds</h3>
                  <div className="grid gap-2" style={visibleTeamGridStyle}>
                    {(() => {
                      const canShowBeds =
                        stepStatus['bed-relieving'] === 'completed' ||
                        currentStep === 'bed-relieving' ||
                        currentStep === 'review'
                      const visibleBedAllocs = canShowBeds ? bedAllocationsForDisplay : EMPTY_BED_ALLOCATIONS

                      return visibleTeams.map((team) => (
                        <BedBlock
                          key={`bed-${team}`}
                          team={team}
                          allocations={visibleBedAllocs}
                          wards={wards}
                          bedRelievingNotesByToTeam={bedRelievingNotesByToTeamForDisplay}
                          onSaveBedRelievingNotesForToTeam={saveBedRelievingNotesForToTeam}
                          activeEditingTransfer={activeBedRelievingTransfer}
                          onActiveEditingTransferChange={setActiveBedRelievingTransfer}
                          currentStep={currentStep}
                          onInvalidEditAttempt={(position) => {
                            const pad = 8
                            const estW = 260
                            const estH = 80
                            let x = position.x + 12
                            let y = position.y + 12
                            if (x + estW > window.innerWidth - pad) x = window.innerWidth - estW - pad
                            if (y + estH > window.innerHeight - pad) y = window.innerHeight - estH - pad
                            x = Math.max(pad, x)
                            y = Math.max(pad, y)
                            setBedRelievingEditWarningPopover({ show: true, position: { x, y } })
                          }}
                        />
                      ))
                    })()}
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Leave Arrangements</h3>
                  <div className="grid gap-2" style={visibleTeamGridStyle}>
                    {visibleTeams.map((team) => {
                      const therapistLeaves = therapistAllocationsForDisplay[team]
                        .filter((alloc) => {
                          const override = staffOverrides[alloc.staff.id]
                          const effectiveLeaveType =
                            override?.leaveType !== undefined ? override.leaveType : (alloc.leave_type as any)
                          const hasLeaveType = effectiveLeaveType !== null && effectiveLeaveType !== undefined
                          const isTrulyOnLeave = hasLeaveType && !isOnDutyLeaveType(effectiveLeaveType as any)

                          return isTrulyOnLeave
                        })
                        .map((alloc) => {
                          const override = staffOverrides[alloc.staff.id]
                          const effectiveLeaveType =
                            override?.leaveType !== undefined ? override.leaveType : (alloc.leave_type as any)
                          const fteRemaining =
                            override?.fteRemaining !== undefined ? override.fteRemaining : alloc.fte_therapist || 0
                          return {
                            ...alloc.staff,
                            leave_type: effectiveLeaveType as LeaveType,
                            fteRemaining: fteRemaining,
                          }
                        })

                      const overrideLeaves = Object.entries(staffOverrides)
                        .filter(([staffId, override]) => {
                          const staffMember = staff.find((s) => s.id === staffId)
                          const isTherapist = staffMember && ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
                          const hasLeaveType = override.leaveType !== null && override.leaveType !== undefined
                          const isTrulyOnLeave = hasLeaveType && !isOnDutyLeaveType(override.leaveType as any)
                          const canonicalTeam = staffMember?.team
                            ? getMainTeam(staffMember.team as Team, effectiveTeamMergeConfig.mergedInto)
                            : null
                          return isTherapist && canonicalTeam === team && isTrulyOnLeave
                        })
                        .map(([_staffId, override]) => {
                          const staffMember = staff.find((s) => s.id === _staffId)!
                          return {
                            ...staffMember,
                            leave_type: override.leaveType as any,
                            fteRemaining: override.fteRemaining,
                          }
                        })

                      const allLeaves = [...therapistLeaves, ...overrideLeaves]
                      const uniqueLeaves = allLeaves.filter(
                        (s, index, self) => index === self.findIndex((x) => x.id === s.id)
                      )

                      return (
                        <LeaveBlock
                          key={`leave-${team}`}
                          team={team}
                          staffOnLeave={uniqueLeaves}
                          onEditStaff={handleEditStaff}
                        />
                      )
                    })}
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Beds Calculations</h3>
                  <div className="grid gap-2" style={visibleTeamGridStyle}>
                    {visibleTeams.map((team) => {
                      const bedOverride = bedCountsOverridesByTeamForDisplay?.[team]
                      const shs = typeof bedOverride?.shsBedCounts === 'number' ? bedOverride.shsBedCounts : null
                      const students =
                        typeof bedOverride?.studentPlacementBedCounts === 'number'
                          ? bedOverride.studentPlacementBedCounts
                          : null

                      return (
                        <CalculationBlock
                          key={`calc-${team}`}
                          team={team}
                          calculations={calculationsForDisplay[team] ?? null}
                          shsBedCounts={shs}
                          studentPlacementBedCounts={students}
                          onEditBedCounts={() => setEditingBedTeam(team)}
                        />
                      )
                    })}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-semibold text-center mb-2 flex items-center justify-center gap-1">
                    <span>PCA Calculations</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0 text-muted-foreground"
                          aria-label="How Avg PCA/team is calculated"
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="center"
                        side="top"
                        className="flex w-[420px] max-h-[min(520px,70vh)] min-h-0 flex-col overflow-hidden rounded-md border border-amber-200 bg-amber-50/95 p-0"
                      >
                        <AvgPcaFormulaPopoverContent
                          sanityCheckFooter={
                            <div className="space-y-2">
                              <div className="text-muted-foreground text-xs">
                                For each team, compare <span className="font-medium text-foreground">assigned FTE</span>{' '}
                                to <span className="font-medium text-foreground">Avg</span>. On DRM days, use DRO’s{' '}
                                <span className="font-medium text-foreground">final</span> Avg (including the add-on).
                                Check: <FormulaChip>balance = Assigned − Avg</FormulaChip>. Then:
                              </div>
                              <FormulaBlock className="mt-0">
                                Over-assigned: {pcaBalanceSanity.positiveSum.toFixed(2)} | Under-assigned:{' '}
                                {pcaBalanceSanity.negativeAbsSum.toFixed(2)} | Net:{' '}
                                {pcaBalanceSanity.netDiff.toFixed(2)}
                              </FormulaBlock>
                              <FormulaBlock className="mt-0 block w-full max-w-full text-[11px] leading-snug">
                                Team balances (today): {pcaBalanceSanity.perTeamText}
                              </FormulaBlock>
                              <div className="text-muted-foreground text-[11px]">
                                Small drift can happen due to quarter-slot rounding and 2-decimal display.
                              </div>
                            </div>
                          }
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2" style={visibleTeamGridStyle}>
                    {visibleTeams.map((team) => (
                      <PCACalculationBlock
                        key={`pca-calc-${team}`}
                        team={team}
                        calculations={calculationsForDisplay[team] ?? null}
                      />
                    ))}
                  </div>
                </div>

                {!deferBelowFold ? (
                  <MaybeProfiler id="PCADedicatedTable">
                    <PCADedicatedScheduleTable
                      allPCAStaff={[...staff.filter((s) => s.rank === 'PCA'), ...bufferStaff.filter((s) => s.rank === 'PCA')]}
                      pcaAllocationsByTeam={pcaAllocations as any}
                      staffOverrides={staffOverridesForPcaDisplay as any}
                      specialPrograms={specialPrograms}
                      weekday={currentWeekday}
                      stepStatus={stepStatus}
                      initializedSteps={initializedSteps}
                      showStaffIds={userRole === 'developer'}
                    />
                  </MaybeProfiler>
                ) : (
                  <div className="mt-3 rounded-lg border border-border bg-card p-3">
                    <div className="h-4 w-48 rounded-md bg-muted animate-pulse" />
                    <div className="mt-2 h-16 rounded-md bg-muted/70 animate-pulse" />
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'vt-mode-anim',
                  'overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-in-out',
                  isDisplayMode
                    ? 'max-h-0 opacity-0 -translate-y-2 mt-0 pointer-events-none'
                    : 'max-h-[9999px] opacity-100 translate-y-0 mt-0'
                )}
                aria-hidden={isDisplayMode}
              >
                {!deferBelowFold ? (
                  <MaybeProfiler id="AllocationNotesBoard">
                    <AllocationNotesBoard doc={allocationNotesDoc} onSave={saveAllocationNotes} />
                  </MaybeProfiler>
                ) : (
                  <div className="mt-3 rounded-lg border border-border bg-card p-3">
                    <div className="h-4 w-40 rounded-md bg-muted animate-pulse" />
                    <div className="mt-2 h-20 rounded-md bg-muted/70 animate-pulse" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </MaybeProfiler>
      </div>
    </>
  )
}
