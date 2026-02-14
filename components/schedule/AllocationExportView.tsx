'use client'

import * as React from 'react'
import type { Team, Weekday, Staff } from '@/types/staff'
import type { SpecialProgram, SPTAllocation } from '@/types/allocation'
import type {
  BedAllocation,
  BedRelievingNotesByToTeam,
  BedRelievingNoteRow,
  PCAAllocation,
  ScheduleCalculations,
  TherapistAllocation,
} from '@/types/schedule'
import { TEAMS, EMPTY_BED_ALLOCATIONS } from '@/lib/features/schedule/constants'
import { cn } from '@/lib/utils'

import { ScheduleBlocks1To6 } from '@/components/schedule/ScheduleBlocks1To6'
import { PCADedicatedScheduleTable } from '@/components/allocation/PCADedicatedScheduleTable'

type StaffOverridesLike = Record<
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

export type AllocationExportViewProps = {
  dateKey: string // YYYY-MM-DD
  weekday: Weekday
  currentStep?: string

  sptAllocations: SPTAllocation[]
  specialPrograms: SpecialProgram[]

  therapistAllocationsByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocationsByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]>
  bedAllocations: BedAllocation[]
  wards: { name: string; team_assignments: Record<Team, number> }[]
  calculationsByTeam: Record<Team, ScheduleCalculations | null>

  staff: Staff[]
  staffOverrides: StaffOverridesLike
  bedCountsOverridesByTeam?: Record<
    Team,
    { shsBedCounts?: number | null; studentPlacementBedCounts?: number | null } | undefined
  >
  bedRelievingNotesByToTeam?: BedRelievingNotesByToTeam
  onSaveBedRelievingNotesForToTeam?: (toTeam: Team, notes: Partial<Record<Team, BedRelievingNoteRow[]>>) => void

  stepStatus: Record<string, 'pending' | 'completed' | 'modified'>
  initializedSteps: Set<string>

  allPCAStaff: Staff[]
  includePcaDedicatedTable?: boolean

  className?: string
}

export const AllocationExportView = React.forwardRef<HTMLDivElement, AllocationExportViewProps>(
  function AllocationExportView(props, ref) {
    const includePcaDedicatedTable = props.includePcaDedicatedTable ?? true
    const canShowBeds =
      props.stepStatus?.['bed-relieving'] === 'completed' ||
      props.currentStep === 'bed-relieving' ||
      props.currentStep === 'review'
    const visibleBedAllocs = canShowBeds ? props.bedAllocations : EMPTY_BED_ALLOCATIONS

    return (
      <div
        ref={ref}
        className={cn(
          'bg-background text-foreground',
          'p-4',
          // keep layout consistent for capture
          'min-w-[960px]',
          props.className
        )}
        data-rbip-export-root
      >
        {/* Team headers row (non-sticky, export-friendly) */}
        <div className="grid grid-cols-8 gap-2 py-2 min-w-[960px]">
          {TEAMS.map((team) => (
            <h2 key={`export-header-${team}`} className="text-lg font-bold text-center">
              {team}
            </h2>
          ))}
        </div>

        <ScheduleBlocks1To6
          mode="reference"
          density="compact"
          enableContentVisibility={false}
          weekday={props.weekday}
          sptAllocations={props.sptAllocations}
          specialPrograms={props.specialPrograms}
          therapistAllocationsByTeam={props.therapistAllocationsByTeam}
          pcaAllocationsByTeam={props.pcaAllocationsByTeam}
          bedAllocations={visibleBedAllocs}
          wards={props.wards}
          calculationsByTeam={props.calculationsByTeam}
          staff={props.staff}
          staffOverrides={props.staffOverrides}
          bedCountsOverridesByTeam={props.bedCountsOverridesByTeam}
          bedRelievingNotesByToTeam={props.bedRelievingNotesByToTeam}
          onSaveBedRelievingNotesForToTeam={props.onSaveBedRelievingNotesForToTeam}
          stepStatus={props.stepStatus}
          initializedSteps={props.initializedSteps}
        />

        {includePcaDedicatedTable ? (
          <PCADedicatedScheduleTable
            allPCAStaff={props.allPCAStaff}
            pcaAllocationsByTeam={props.pcaAllocationsByTeam}
            staffOverrides={props.staffOverrides}
            specialPrograms={props.specialPrograms}
            weekday={props.weekday as any}
            stepStatus={props.stepStatus}
            initializedSteps={props.initializedSteps}
            renderMode="export"
            maxColumnsPerChunk={10}
          />
        ) : null}
      </div>
    )
  }
)

