'use client'

import * as React from 'react'
import type { Team, Weekday } from '@/types/staff'
import type { SpecialProgram, SPTAllocation } from '@/types/allocation'
import type {
  BedAllocation,
  BedRelievingNotesByToTeam,
  BedRelievingNoteRow,
  PCAAllocation,
  ScheduleCalculations,
  TherapistAllocation,
} from '@/types/schedule'
import type { Staff } from '@/types/staff'
import { TEAMS, EMPTY_BED_ALLOCATIONS } from '@/lib/features/schedule/constants'
import { getSptWeekdayConfigMap } from '@/lib/features/schedule/sptConfig'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { cn } from '@/lib/utils'

import { TherapistBlock } from '@/components/allocation/TherapistBlock'
import { PCABlock } from '@/components/allocation/PCABlock'
import { BedBlock } from '@/components/allocation/BedBlock'
import { LeaveBlock } from '@/components/allocation/LeaveBlock'
import { CalculationBlock } from '@/components/allocation/CalculationBlock'
import { PCACalculationBlock } from '@/components/allocation/PCACalculationBlock'

type StaffOverrides = Record<
  string,
  {
    leaveType?: any
    fteRemaining?: number
    fteSubtraction?: number
    availableSlots?: number[]
    invalidSlot?: number
    invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
  }
>

export const ScheduleBlocks1To6 = React.memo(function ScheduleBlocks1To6(props: {
  mode: 'main' | 'reference'
  density?: 'normal' | 'compact'
  /** Perf optimization for on-screen rendering. Disable for offscreen export. */
  enableContentVisibility?: boolean
  weekday: Weekday
  sptAllocations: SPTAllocation[]
  specialPrograms: SpecialProgram[]

  therapistAllocationsByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocationsByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]>
  bedAllocations: BedAllocation[]
  wards: { name: string; team_assignments: Record<Team, number> }[]
  calculationsByTeam: Record<Team, ScheduleCalculations | null>

  staff: Staff[]
  staffOverrides: StaffOverrides
  bedCountsOverridesByTeam?: Record<Team, { shsBedCounts?: number | null; studentPlacementBedCounts?: number | null } | undefined>

  // Bed relieving note editing is only enabled when this callback is provided AND currentStep === 'bed-relieving' within BedBlock.
  bedRelievingNotesByToTeam?: BedRelievingNotesByToTeam
  onSaveBedRelievingNotesForToTeam?: (toTeam: Team, notes: Partial<Record<Team, BedRelievingNoteRow[]>>) => void

  // For PCA block diagnostics/styling (optional)
  stepStatus?: Record<string, 'pending' | 'completed' | 'modified'>
  initializedSteps?: Set<string>
}) {
  const {
    mode,
    density = 'normal',
    enableContentVisibility = true,
    weekday,
    sptAllocations,
    specialPrograms,
    therapistAllocationsByTeam,
    pcaAllocationsByTeam,
    bedAllocations,
    wards,
    calculationsByTeam,
    staff,
    staffOverrides,
    bedCountsOverridesByTeam,
    bedRelievingNotesByToTeam,
    onSaveBedRelievingNotesForToTeam,
    stepStatus,
    initializedSteps,
  } = props

  const readOnly = mode === 'reference'
  const isCompact = density === 'compact'
  const cvClass = enableContentVisibility ? 'cv-auto' : ''
  const blockWrapClass = cn(isCompact ? 'mb-2' : 'mb-4', cvClass)
  const titleClass = isCompact ? 'text-xs font-semibold text-center mb-1' : 'text-xs font-semibold text-center mb-2'

  const sptWeekdayByStaffId = React.useMemo(() => {
    return getSptWeekdayConfigMap({ weekday, sptAllocations })
  }, [weekday, sptAllocations])

  const allPCAAllocationsFlat = React.useMemo(() => {
    return TEAMS.flatMap((t) => pcaAllocationsByTeam[t] ?? [])
  }, [pcaAllocationsByTeam])

  const visibleBedAllocs = React.useMemo(() => {
    // In main page, beds are sometimes gated by step status. For reference mode, always show what’s loaded.
    if (readOnly) return bedAllocations
    const canShowBeds =
      stepStatus?.['bed-relieving'] === 'completed' ||
      stepStatus?.['review'] === 'completed' ||
      // Allow live editing path to keep current behavior (caller can gate above if desired).
      true
    return canShowBeds ? bedAllocations : EMPTY_BED_ALLOCATIONS
  }, [bedAllocations, readOnly, stepStatus])

  const staffOnLeaveByTeam = React.useMemo(() => {
    const byTeam: Record<Team, Array<Staff & { leave_type: any; fteRemaining?: number }>> = {
      FO: [],
      SMM: [],
      SFM: [],
      CPPC: [],
      MC: [],
      GMC: [],
      NSM: [],
      DRO: [],
    }

    for (const team of TEAMS) {
      const therapistLeaves = (therapistAllocationsByTeam[team] ?? [])
        .filter((alloc) => {
          const override = staffOverrides?.[alloc.staff?.id]
          const effectiveLeaveType =
            override?.leaveType !== undefined ? override.leaveType : (alloc.leave_type as any)
          const hasLeaveType = effectiveLeaveType !== null && effectiveLeaveType !== undefined
          const isTrulyOnLeave = hasLeaveType && !isOnDutyLeaveType(effectiveLeaveType as any)
          return isTrulyOnLeave
        })
        .map((alloc) => {
          const override = staffOverrides?.[alloc.staff?.id]
          const effectiveLeaveType =
            override?.leaveType !== undefined ? override.leaveType : (alloc.leave_type as any)
          const fteRemaining =
            override?.fteRemaining !== undefined ? override.fteRemaining : (alloc.fte_therapist || 0)
          return {
            ...(alloc.staff as any),
            leave_type: effectiveLeaveType as any,
            fteRemaining,
          }
        })

      const overrideLeaves = Object.entries(staffOverrides || {})
        .filter(([staffId, override]) => {
          const staffMember = staff.find((s) => s.id === staffId)
          const isTherapist = !!staffMember && ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
          const hasLeaveType = override.leaveType !== null && override.leaveType !== undefined
          const isTrulyOnLeave = hasLeaveType && !isOnDutyLeaveType(override.leaveType as any)
          return isTherapist && staffMember!.team === team && isTrulyOnLeave
        })
        .map(([staffId, override]) => {
          const staffMember = staff.find((s) => s.id === staffId)!
          return {
            ...(staffMember as any),
            leave_type: override.leaveType as any,
            fteRemaining: override.fteRemaining,
          }
        })

      const allLeaves = [...therapistLeaves, ...overrideLeaves]
      const uniqueLeaves = allLeaves.filter(
        (s, idx, arr) => idx === arr.findIndex((x) => x.id === s.id)
      )
      byTeam[team] = uniqueLeaves
    }

    return byTeam
  }, [staff, staffOverrides, therapistAllocationsByTeam])

  return (
    <div className="bg-background">
      <div className="min-w-[960px]">
        {/* Block 1: Therapist Allocation */}
        <div className={blockWrapClass}>
          <h3 className={titleClass}>Therapist Allocation</h3>
          <div className="grid grid-cols-8 gap-2">
            {TEAMS.map((team) => (
              <TherapistBlock
                key={`therapist-${team}`}
                team={team}
                allocations={therapistAllocationsByTeam[team] ?? []}
                specialPrograms={specialPrograms}
                weekday={weekday as any}
                currentStep={readOnly ? 'review' : undefined}
                // no edit handlers in this wrapper
                sptWeekdayByStaffId={sptWeekdayByStaffId as any}
                readOnly={readOnly}
                droppableIdPrefix={readOnly ? 'ref-' : undefined}
              />
            ))}
          </div>
        </div>

        {/* Block 2: PCA Allocation */}
        <div className={blockWrapClass}>
          <h3 className={titleClass}>PCA Allocation</h3>
          <div className="grid grid-cols-8 gap-2">
            {TEAMS.map((team) => (
              <PCABlock
                key={`pca-${team}`}
                team={team}
                allocations={pcaAllocationsByTeam[team] ?? []}
                requiredPCA={calculationsByTeam[team]?.required_pca_per_team}
                averagePCAPerTeam={calculationsByTeam[team]?.average_pca_per_team}
                baseAveragePCAPerTeam={calculationsByTeam[team]?.base_average_pca_per_team}
                specialPrograms={specialPrograms}
                allPCAAllocations={allPCAAllocationsFlat as any}
                staffOverrides={staffOverrides as any}
                currentStep={readOnly ? 'review' : undefined}
                step2Initialized={true}
                initializedSteps={initializedSteps}
                weekday={weekday as any}
                readOnly={readOnly}
                droppableIdPrefix={readOnly ? 'ref-' : undefined}
              />
            ))}
          </div>
        </div>

        {/* Block 3: Bed Allocation */}
        <div className={blockWrapClass}>
          <h3 className={titleClass}>Relieving Beds</h3>
          <div className="grid grid-cols-8 gap-2">
            {TEAMS.map((team) => (
              <BedBlock
                key={`bed-${team}`}
                team={team}
                allocations={visibleBedAllocs}
                wards={wards}
                bedRelievingNotesByToTeam={bedRelievingNotesByToTeam}
                onSaveBedRelievingNotesForToTeam={readOnly ? undefined : onSaveBedRelievingNotesForToTeam}
                currentStep={readOnly ? 'review' : undefined}
              />
            ))}
          </div>
        </div>

        {/* Block 4: Leave Arrangements */}
        <div className={blockWrapClass}>
          <h3 className={titleClass}>Leave Arrangements</h3>
          <div className="grid grid-cols-8 gap-2">
            {TEAMS.map((team) => (
              <LeaveBlock key={`leave-${team}`} team={team} staffOnLeave={staffOnLeaveByTeam[team] ?? []} />
            ))}
          </div>
        </div>

        {/* Block 5: Calculations */}
        <div className={blockWrapClass}>
          <h3 className={titleClass}>Beds Calculations</h3>
          <div className="grid grid-cols-8 gap-2">
            {TEAMS.map((team) => {
              const bedOverride = bedCountsOverridesByTeam?.[team]
              const shs =
                typeof bedOverride?.shsBedCounts === 'number' ? (bedOverride.shsBedCounts as number) : null
              const students =
                typeof bedOverride?.studentPlacementBedCounts === 'number'
                  ? (bedOverride.studentPlacementBedCounts as number)
                  : null

              return (
                <CalculationBlock
                  key={`calc-${team}`}
                  team={team}
                  calculations={calculationsByTeam[team]}
                  shsBedCounts={shs}
                  studentPlacementBedCounts={students}
                />
              )
            })}
          </div>
        </div>

        {/* Block 6: PCA Calculations */}
        <div className={blockWrapClass}>
          <h3 className={titleClass}>PCA Calculations</h3>
          <div className="grid grid-cols-8 gap-2">
            {TEAMS.map((team) => (
              <PCACalculationBlock key={`pca-calc-${team}`} team={team} calculations={calculationsByTeam[team]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})

