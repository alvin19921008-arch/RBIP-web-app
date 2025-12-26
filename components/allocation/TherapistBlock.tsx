'use client'

import { Team } from '@/types/staff'
import { TherapistAllocation } from '@/types/schedule'
import { Staff } from '@/types/staff'
import { StaffCard } from './StaffCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDroppable } from '@dnd-kit/core'
import { SpecialProgram } from '@/types/allocation'
import { formatFTE } from '@/lib/utils/rounding'

interface TherapistBlockProps {
  team: Team
  allocations: (TherapistAllocation & { staff: Staff })[]
  specialPrograms?: SpecialProgram[]
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
}

export function TherapistBlock({ team, allocations, specialPrograms = [], weekday, onEditStaff }: TherapistBlockProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `therapist-${team}`,
    data: { type: 'therapist', team },
  })

  // Filter out PCA staff - only show therapists (SPT, APPT, RPT)
  // Also filter out staff with FTE = 0 (they should only appear in leave block)
  const therapistAllocations = allocations.filter(alloc => {
    const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
    const hasFTE = (alloc.fte_therapist || 0) > 0
    return isTherapist && hasFTE
  })

  // Calculate sum of therapist FTE per team
  const ptPerTeam = therapistAllocations.reduce((sum, alloc) => {
    return sum + (alloc.fte_therapist || 0)
  }, 0)

  // Collect special program information for this team
  // Only therapists assigned to special programs (via preference order) will have special_program_ids
  const teamSpecialPrograms: { name: string; fteSubtraction: number }[] = []
  if (weekday && specialPrograms.length > 0) {
    therapistAllocations.forEach(allocation => {
      if (allocation.special_program_ids && allocation.special_program_ids.length > 0) {
        allocation.special_program_ids.forEach(programId => {
          const program = specialPrograms.find(p => p.id === programId)
          if (program && program.weekdays.includes(weekday)) {
            const staffFTE = program.fte_subtraction[allocation.staff_id]
            const subtraction = staffFTE?.[weekday] || 0
            if (subtraction > 0) {
              // Check if program already added (shouldn't happen with preference system, but keep for safety)
              const existing = teamSpecialPrograms.find(p => p.name === program.name)
              if (existing) {
                // Use maximum FTE subtraction if somehow multiple staff have same program
                existing.fteSubtraction = Math.max(existing.fteSubtraction, subtraction)
              } else {
                teamSpecialPrograms.push({ name: program.name, fteSubtraction: subtraction })
              }
            }
          }
        })
      }
    })
  }

  return (
    <Card ref={setNodeRef} className={isOver ? 'border-primary' : ''}>
      <CardContent className="p-2 pt-1 flex flex-col min-h-full">
        <div className="space-y-1 flex-1">
          {therapistAllocations.map((allocation) => {
            const sptDisplay = allocation.spt_slot_display
              ? `${allocation.fte_therapist} ${allocation.spt_slot_display}`
              : undefined
            
            // Calculate FTE for display
            const originalFTE = allocation.fte_therapist || 1.0
            const hasSpecialProgram = allocation.special_program_ids && allocation.special_program_ids.length > 0
            
            // Calculate special program FTE subtraction
            let specialProgramFTE = 0
            if (hasSpecialProgram && weekday && specialPrograms.length > 0 && allocation.special_program_ids) {
              allocation.special_program_ids.forEach(programId => {
                const program = specialPrograms.find(p => p.id === programId)
                if (program && program.weekdays.includes(weekday)) {
                  const staffFTE = program.fte_subtraction[allocation.staff_id]
                  const subtraction = staffFTE?.[weekday] || 0
                  specialProgramFTE += subtraction
                }
              })
            }
            
            // Get allocation FTE (which accounts for leave, excluding special program FTE subtraction)
            // The allocationFTE already represents FTE remaining after all deductions
            const allocationFTE = allocation.fte_therapist || originalFTE
            
            // Display FTE remaining (excluding special program FTE subtraction)
            // This is the FTE that's actually available for duty after leave
            let displayFTE: number | undefined = allocationFTE
            
            // Only show FTE if it's not 1.0 and not 0
            if (displayFTE === 1.0 || displayFTE === 0) {
              displayFTE = undefined
            }
            
            return (
              <StaffCard
                key={allocation.id}
                staff={allocation.staff}
                allocation={allocation}
                fteRemaining={displayFTE}
                sptDisplay={sptDisplay}
                onEdit={(e) => onEditStaff?.(allocation.staff_id, e)}
              />
            )
          })}
          {therapistAllocations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No therapists assigned
            </p>
          )}
        </div>
        {/* Special program indicators and PT/team at absolute bottom */}
        {(ptPerTeam > 0 || teamSpecialPrograms.length > 0) && (
          <div className="mt-auto pt-1 border-t border-border/50">
            {/* Special program indicators */}
        {teamSpecialPrograms.length > 0 && (
              <div className="flex justify-between items-center mb-1">
            <div className="text-xs text-red-600 font-medium">
              {teamSpecialPrograms.map(p => p.name).join(', ')}
            </div>
            <div className="text-xs text-red-600 font-medium">
              {teamSpecialPrograms.map(p => `-${formatFTE(p.fteSubtraction)}`).join(', ')}
            </div>
              </div>
            )}
            {/* PT/team display */}
            {ptPerTeam > 0 && (
              <div className="flex justify-between items-center">
                <div className="text-xs text-black font-medium">PT/team</div>
                <div className="text-xs text-black font-medium">{ptPerTeam.toFixed(2)}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

