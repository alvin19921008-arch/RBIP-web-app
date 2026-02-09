'use client'

import { memo, useMemo } from 'react'
import { Team } from '@/types/staff'
import { TherapistAllocation } from '@/types/schedule'
import { Staff } from '@/types/staff'
import { StaffCard } from './StaffCard'
import { DragValidationTooltip } from './DragValidationTooltip'
import { TeamTransferWarningTooltip } from './TeamTransferWarningTooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDroppable, useDndContext } from '@dnd-kit/core'
import { SpecialProgram } from '@/types/allocation'
import { formatFTE } from '@/lib/utils/rounding'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { cn } from '@/lib/utils'
import type { SptWeekdayComputed } from '@/lib/features/schedule/sptConfig'

interface TherapistBlockProps {
  team: Team
  allocations: (TherapistAllocation & { staff: Staff })[]
  specialPrograms?: SpecialProgram[]
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  currentStep?: string
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
  sptWeekdayByStaffId?: Record<string, SptWeekdayComputed>
  staffOverrides?: Record<string, {
    leaveType?: any
    fteRemaining?: number
    amPmSelection?: 'AM' | 'PM'
    // ... other fields
  }>
  /** When true, disables drag/drop and edit affordances (for reference panes). */
  readOnly?: boolean
  /** Optional prefix to avoid droppable id collisions across panes. */
  droppableIdPrefix?: string
}

export const TherapistBlock = memo(function TherapistBlock({
  team,
  allocations,
  specialPrograms = [],
  weekday,
  onEditStaff,
  currentStep,
  staffOverrides,
  sptWeekdayByStaffId,
  readOnly = false,
  droppableIdPrefix,
}: TherapistBlockProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${droppableIdPrefix ?? ''}therapist-${team}`,
    data: { type: 'therapist', team },
    disabled: readOnly,
  })
  
  const { active } = useDndContext()
  
  // Only show drag zone border if a therapist is being dragged
  const isTherapistDragging = !readOnly && active?.data?.current?.staff 
    ? ['SPT', 'APPT', 'RPT'].includes(active.data.current.staff.rank)
    : false
  
  const showDragZone = isOver && isTherapistDragging

  const specialProgramsById = useMemo(() => {
    const map = new Map<string, SpecialProgram>()
    for (const p of specialPrograms) map.set(p.id, p)
    return map
  }, [specialPrograms])

  // Filter out PCA staff - only show therapists (SPT, APPT, RPT)
  // Also filter out staff with FTE = 0 (they should only appear in leave block),
  // EXCEPT SPT with configured FTE=0 that are still on-duty (leave_type null) and have SPT slot display.
  const therapistAllocations = useMemo(() => {
    const filtered = allocations.filter((alloc) => {
      const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
      const fte = alloc.fte_therapist ?? 0
      const isOnDuty = isOnDutyLeaveType(alloc.leave_type as any)
      const isOnDutyZeroFteSPT =
        alloc.staff.rank === 'SPT' && fte === 0 && isOnDuty && !!alloc.spt_slot_display
      return isTherapist && (fte > 0 || isOnDutyZeroFteSPT)
    })

    return filtered
  }, [allocations])

  // Calculate sum of therapist FTE per team
  const ptPerTeam = useMemo(() => {
    return therapistAllocations.reduce((sum, alloc) => sum + (alloc.fte_therapist ?? 0), 0)
  }, [therapistAllocations])

  // Collect special program information for this team
  // Only therapists assigned to special programs (via preference order) will have special_program_ids
  const teamSpecialPrograms = useMemo((): { name: string; fteSubtraction: number }[] => {
  const teamSpecialPrograms: { name: string; fteSubtraction: number }[] = []
  if (weekday && specialPrograms.length > 0) {
    therapistAllocations.forEach(allocation => {
      if (allocation.special_program_ids && allocation.special_program_ids.length > 0) {
        allocation.special_program_ids.forEach(programId => {
            const program = specialProgramsById.get(programId)
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
    return teamSpecialPrograms
  }, [weekday, specialPrograms.length, specialProgramsById, therapistAllocations])

  return (
    <Card ref={setNodeRef} className={showDragZone ? 'border-2 border-slate-900 dark:border-slate-100' : ''}>
      <CardContent className="p-2 pt-1 flex flex-col min-h-full">
        <div className="space-y-1 flex-1">
          {therapistAllocations.map((allocation) => {
            const fte = allocation.fte_therapist ?? 0
            // SPT supervisory case: can be on duty with FTE=0 (should look "disabled" / non-workforce)
            const isSupervisoryNoDuty =
              allocation.staff.rank === 'SPT' &&
              fte === 0 &&
              isOnDutyLeaveType(allocation.leave_type as any) &&
              !!allocation.spt_slot_display

            const sptMeta = sptWeekdayByStaffId?.[allocation.staff_id]
            const supervisoryRightText = sptMeta?.displayText ?? null

            // For supervisory "No Duty" SPT, hide weekday slot display (AM/PM) and show only "No Duty".
            // UX change: keep SPT name clean (no "0.25 AM" suffix next to the name).
            // We will render "FTE + AM/PM" on the right side instead.
            const sptDisplay = undefined
            
            // Calculate FTE for display
            // For buffer staff, use buffer_fte if available, otherwise default to 1.0
            const isBufferStaff = allocation.staff.status === 'buffer'
            const baseFTE = isBufferStaff && allocation.staff.buffer_fte !== undefined 
              ? allocation.staff.buffer_fte 
              : 1.0
            const originalFTE = allocation.fte_therapist ?? baseFTE
            const hasSpecialProgram = allocation.special_program_ids && allocation.special_program_ids.length > 0
            
            // Calculate special program FTE subtraction
            let specialProgramFTE = 0
            if (hasSpecialProgram && weekday && specialPrograms.length > 0 && allocation.special_program_ids) {
              allocation.special_program_ids.forEach(programId => {
                const program = specialProgramsById.get(programId)
                if (program && program.weekdays.includes(weekday)) {
                  const staffFTE = program.fte_subtraction[allocation.staff_id]
                  const subtraction = staffFTE?.[weekday] || 0
                  specialProgramFTE += subtraction
                }
              })
            }
            
            // Get allocation FTE (which accounts for leave, excluding special program FTE subtraction)
            // The allocationFTE already represents FTE remaining after all deductions
            const allocationFTE = allocation.fte_therapist ?? originalFTE
            
            // Check if there's a leave type (leave FTE subtraction)
            const hasLeave = !isOnDutyLeaveType(allocation.leave_type as any)
            
            // Display FTE remaining logic:
            // - If FTE subtraction is ONLY from special program (no leave), don't show FTE value
            // - If FTE subtraction is from BOTH special program + leave, show the final FTE (after both subtractions)
            let displayFTE: number | string | undefined = undefined
            if (hasLeave) {
              // There is leave - show the FTE (which includes both leave and special program deductions)
              displayFTE = allocationFTE
              // Only show FTE if it's not 1.0 and not 0
              if (displayFTE === 1.0 || displayFTE === 0) {
                displayFTE = undefined
              } else {
                // Add AM/PM if applicable
                const override = staffOverrides?.[allocation.staff_id]
                if ((allocationFTE === 0.5 || allocationFTE === 0.25) && override?.amPmSelection) {
                  displayFTE = `${allocationFTE} ${override.amPmSelection}`
                }
              }
            }
            // If no leave but special program FTE subtraction exists, don't show FTE (displayFTE remains undefined)
            // If therapist split override is active, always show per-team FTE (even if it equals 1.0)
            const overrideForSplit = staffOverrides?.[allocation.staff_id] as any
            const splitMap = overrideForSplit?.therapistTeamFTEByTeam as
              | Partial<Record<Team, number>>
              | undefined
            if (!hasLeave && splitMap && typeof splitMap[team] === 'number') {
              const fte = splitMap[team] as number
              const halfDay = overrideForSplit?.therapistTeamHalfDayByTeam?.[team] as ('AM' | 'PM' | undefined)
              const halfDayUi = overrideForSplit?.therapistTeamHalfDayUiByTeam?.[team] as
                | 'AUTO'
                | 'AM'
                | 'PM'
                | 'UNSPECIFIED'
                | undefined

              if (fte === 0.75) {
                displayFTE = '0.75'
              } else if (
                (fte === 0.5 || fte === 0.25) &&
                halfDay &&
                halfDayUi !== 'UNSPECIFIED'
              ) {
                displayFTE = `${fte} ${halfDay}`
              } else {
                displayFTE = fte
              }
            }

            // For SPT: show "FTE + AM/PM" on the right side based on spt_slot_display.
            // (Split-generated SPT allocations now preserve/infer spt_slot_display.)
            if (!isSupervisoryNoDuty && allocation.staff.rank === 'SPT') {
              const overrideDisplayText = staffOverrides?.[allocation.staff_id]?.sptOnDayOverride?.displayText
              if (typeof overrideDisplayText === 'string' && overrideDisplayText.trim() !== '') {
                displayFTE = overrideDisplayText
              } else {
              const fteNum =
                typeof displayFTE === 'number'
                  ? displayFTE
                  : typeof allocationFTE === 'number'
                    ? allocationFTE
                    : undefined
              if (fteNum === 0.75) {
                displayFTE = '0.75'
              } else if ((fteNum === 0.5 || fteNum === 0.25) && allocation.spt_slot_display) {
                displayFTE = `${fteNum} ${allocation.spt_slot_display}`
              }
              }
            }
            
            // Buffer therapist: transferrable in Step 2 only
            // Regular therapist: transferrable in Step 2 only
            // Reuse isBufferStaff from above
            const isTherapistRank = ['SPT', 'APPT', 'RPT'].includes(allocation.staff.rank)
            // For buffer therapist, allow dragging in Step 2 only
            // For regular therapist, dragging is handled by schedule page validation
            const canDragBufferTherapist = isBufferStaff && currentStep === 'therapist-pca'
            const isInCorrectStep = currentStep === 'therapist-pca'
            
            // Check if this is a fixed-team staff (APPT, RPT) that can be transferred with warning
            const isFixedTeamStaff = !isBufferStaff && (allocation.staff.rank === 'APPT' || allocation.staff.rank === 'RPT')
            
            const staffCard = (
              <StaffCard
                key={allocation.id}
                staff={allocation.staff}
                useDragOverlay={true}
                allocation={allocation}
                fteRemaining={displayFTE}
                sptDisplay={sptDisplay}
                headerRight={
                  isSupervisoryNoDuty ? (
                    <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                      {supervisoryRightText ?? 'No Duty'}
                    </span>
                  ) : undefined
                }
                onEdit={readOnly ? undefined : (e) => onEditStaff?.(allocation.staff_id, e)}
                onOpenContextMenu={readOnly ? undefined : (e) => onEditStaff?.(allocation.staff_id, e)}
                fillColorClassName={cn(
                  (staffOverrides as any)?.[allocation.staff_id]?.cardColorByTeam?.[team],
                  isSupervisoryNoDuty && 'bg-muted/70 hover:bg-muted/70'
                )}
                draggable={!readOnly} // Reference panes should never initiate drags
                dragTeam={team}
              />
            )
            
            if (readOnly) return staffCard

            // For fixed-team staff (APPT, RPT), show warning tooltip when dragging (if in correct step)
            // Use composite ID (staffId::team) to match the draggable ID
            if (isFixedTeamStaff && isInCorrectStep) {
              const compositeStaffId = `${allocation.staff.id}::${team}`
              return (
                <TeamTransferWarningTooltip
                  key={allocation.id}
                  staffId={compositeStaffId}
                  content="Team transfer for fixed-team staff detected."
                >
                  {staffCard}
                </TeamTransferWarningTooltip>
              )
            }
            
            // Add tooltip for regular therapist when not in correct step (buffer staff handled in BufferStaffPool)
            if (!isBufferStaff && !isInCorrectStep) {
              const compositeStaffId = `${allocation.staff.id}::${team}`
              return (
                <DragValidationTooltip
                  key={allocation.id}
                  staffId={compositeStaffId}
                  content="Therapist slot dragging-&-allocating is only available in Step 2 only."
                >
                  {staffCard}
                </DragValidationTooltip>
              )
            }
            
            return staffCard
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
})

