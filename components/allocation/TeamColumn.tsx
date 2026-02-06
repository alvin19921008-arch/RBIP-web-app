'use client'

import { memo } from 'react'
import { Team } from '@/types/staff'
import { TherapistAllocation, PCAAllocation, BedAllocation, ScheduleCalculations } from '@/types/schedule'
import { Staff } from '@/types/staff'
import { TherapistBlock } from './TherapistBlock'
import { PCABlock } from './PCABlock'
import { BedBlock } from './BedBlock'
import { LeaveBlock } from './LeaveBlock'
import { CalculationBlock } from './CalculationBlock'
import { PCACalculationBlock } from './PCACalculationBlock'

import { LeaveType } from '@/types/staff'

interface TeamColumnProps {
  team: Team
  therapistAllocations: (TherapistAllocation & { staff: Staff })[]
  pcaAllocations: (PCAAllocation & { staff: Staff })[]
  bedAllocations: BedAllocation[]
  calculations: ScheduleCalculations | null
  staffOnLeave: (Staff & { leave_type: LeaveType; fteRemaining?: number })[]
  onEditStaff?: (staffId: string) => void
}

function TeamColumnComponent({
  team,
  therapistAllocations,
  pcaAllocations,
  bedAllocations,
  calculations,
  staffOnLeave,
  onEditStaff,
}: TeamColumnProps) {
  return (
    <div className="flex flex-col min-w-[200px]">
      <h2 className="text-lg font-bold text-center mb-4">{team}</h2>
      
      <div className="grid grid-rows-[auto_auto_auto_auto_auto_auto] gap-4">
      <TherapistBlock
        team={team}
        allocations={therapistAllocations}
        onEditStaff={onEditStaff}
      />
      
      <PCABlock
        team={team}
        allocations={pcaAllocations}
        onEditStaff={onEditStaff}
      />
      
      <BedBlock team={team} allocations={bedAllocations} />
      
      <LeaveBlock team={team} staffOnLeave={staffOnLeave} />
      
      <CalculationBlock team={team} calculations={calculations} />
      
      <PCACalculationBlock team={team} calculations={calculations} />
      </div>
    </div>
  )
}

export const TeamColumn = memo(TeamColumnComponent)

