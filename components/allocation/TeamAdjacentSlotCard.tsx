'use client'

import { Team } from '@/types/staff'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { SlotAssignment, AdjacentSlotInfo } from '@/lib/utils/reservationLogic'

// Slot time labels
const SLOT_TIMES: Record<number, string> = {
  1: '0900-1030',
  2: '1030-1200',
  3: '1330-1500',
  4: '1500-1630',
}

interface TeamAdjacentSlotCardProps {
  team: Team
  expectedFTE: number           // Constant from 3.1 (for display reference)
  currentPendingFTE: number     // Current pending after assignments
  step32Assignments: SlotAssignment[]  // Slots assigned in 3.2 (shown in gray)
  adjacentSlots: AdjacentSlotInfo[]    // Adjacent slots available for 3.3
  selections: SlotAssignment[]         // Current 3.3 selections across all teams
  onSelectionChange: (team: Team, slot: number, pcaId: string, pcaName: string, selected: boolean) => void
}

export function TeamAdjacentSlotCard({
  team,
  expectedFTE,
  currentPendingFTE,
  step32Assignments,
  adjacentSlots,
  selections,
  onSelectionChange,
}: TeamAdjacentSlotCardProps) {
  // Calculate assigned FTE from both 3.2 and current 3.3 selections
  const assignedFromStep32 = step32Assignments.length * 0.25
  const assignedFromStep33 = selections.filter(s => s.team === team).length * 0.25
  const totalAssigned = assignedFromStep32 + assignedFromStep33

  // Check if team has any content to show
  const hasStep32Slots = step32Assignments.length > 0
  const hasAdjacentSlots = adjacentSlots.length > 0
  const hasContent = hasStep32Slots || hasAdjacentSlots
  
  // Determine if card should be shrunk:
  // - Shrink if no adjacent slots AND no 3.2 assignments
  // - Don't shrink if has 3.2 assignments (even without adjacent slots)
  // - Don't shrink if has adjacent slots
  const shouldShrink = !hasAdjacentSlots && !hasStep32Slots
  
  // Determine if card should have colored border:
  // - Colored border only if has adjacent slots (for 3.3 selection)
  // - Dark grey border if only has 3.2 assignments but no adjacent slots
  const shouldHaveColoredBorder = hasAdjacentSlots
  
  // Get special program info from first adjacent slot (all should have same program)
  const specialProgramInfo = hasAdjacentSlots && adjacentSlots.length > 0
    ? {
        name: adjacentSlots[0].specialProgramName,
        slot: adjacentSlots[0].specialProgramSlot,
      }
    : null

  // Check if a slot is selected by another team (for auto-disable)
  const isDisabledByOtherTeam = (pcaId: string, slot: number): boolean => {
    return selections.some(s => s.pcaId === pcaId && s.slot === slot && s.team !== team)
  }

  // Check if this team already has a selection for this slot
  const isSelectedByThisTeam = (pcaId: string, slot: number): boolean => {
    return selections.some(s => s.pcaId === pcaId && s.slot === slot && s.team === team)
  }

  const handleCheckboxChange = (adjacentSlot: AdjacentSlotInfo, checked: boolean) => {
    onSelectionChange(team, adjacentSlot.adjacentSlot, adjacentSlot.pcaId, adjacentSlot.pcaName, checked)
  }

  return (
    <Card className={cn(
      'transition-all duration-200',
      shouldShrink 
        ? 'w-16 border opacity-60'  // Shrunk when no content
        : shouldHaveColoredBorder
          ? 'w-28 border-green-300 bg-green-50 dark:bg-green-950/30 border-2'  // Normal size with colored border
          : 'w-28 border-gray-600 dark:border-gray-500 border-2'  // Normal size with dark grey border (has 3.2 but no adjacent)
    )}>
      <CardContent className={cn(
        'flex flex-col items-center gap-0.5',
        shouldShrink ? 'p-1' : 'p-1.5'  // Less padding when shrunk
      )}>
        {/* Team Name */}
        <div className={cn(
          'font-bold leading-tight',
          shouldShrink
            ? 'text-[10px] text-muted-foreground'  // Smaller when shrunk
            : shouldHaveColoredBorder
              ? 'text-xs text-green-700 dark:text-green-300'  // Colored when has adjacent slots
              : 'text-xs text-muted-foreground'  // Normal size but muted (has 3.2 but no adjacent)
        )}>
          {team}
        </div>

        {/* Expected FTE (constant from 3.1) */}
        {!shouldShrink && (
          <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
            Expected: {expectedFTE.toFixed(2)}
          </div>
        )}

        {/* Assigned FTE (total from 3.2 + 3.3) */}
        {!shouldShrink && (
          <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
            Assigned: {totalAssigned.toFixed(2)}
          </div>
        )}

        {/* Special Program Info - shown below Assigned and above dividing line */}
        {!shouldShrink && specialProgramInfo && (
          <div className="text-[10px] text-gray-400 leading-tight">
            ({specialProgramInfo.name} {SLOT_TIMES[specialProgramInfo.slot]})
          </div>
        )}

        {/* Content Section - only show when not shrunk */}
        {!shouldShrink && (
          <div className={cn(
            'w-full mt-1 pt-1',
            shouldHaveColoredBorder 
              ? 'border-t border-green-200 dark:border-green-800' 
              : 'border-t border-gray-600 dark:border-gray-500'  // Dark grey border when has 3.2 but no adjacent
          )}>
            {/* Step 3.2 assigned slots (gray, non-interactive) */}
            {hasStep32Slots && (
              <div className="mb-1">
                {step32Assignments.map((assignment) => (
                  <div
                    key={`step32-${assignment.pcaId}-${assignment.slot}`}
                    className="text-[10px] text-gray-400 leading-tight py-0.5"
                  >
                    <span className="font-medium">{SLOT_TIMES[assignment.slot]}</span>: {assignment.pcaName}
                  </div>
                ))}
              </div>
            )}

            {/* Step 3.3 adjacent slots (checkboxes) */}
            {hasAdjacentSlots && (
              <div className="space-y-1">
                {adjacentSlots.map((adjacentSlot) => {
                  const isSelected = isSelectedByThisTeam(adjacentSlot.pcaId, adjacentSlot.adjacentSlot)
                  const isDisabled = isDisabledByOtherTeam(adjacentSlot.pcaId, adjacentSlot.adjacentSlot)
                  const disabledReason = isDisabled ? 'Selected by another team' : ''

                  return (
                    <label
                      key={`step33-${adjacentSlot.pcaId}-${adjacentSlot.adjacentSlot}`}
                      className={cn(
                        'flex items-center gap-1 px-0.5 py-0.5 rounded text-[10px] cursor-pointer',
                        isDisabled && 'opacity-50 cursor-not-allowed',
                        isSelected && 'bg-green-100 dark:bg-green-900'
                      )}
                      title={disabledReason}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isDisabled}
                        onCheckedChange={(checked) => handleCheckboxChange(adjacentSlot, !!checked)}
                        className="h-3 w-3"
                      />
                      <span className={cn(
                        'truncate',
                        isDisabled && 'line-through'
                      )}>
                        <span className="font-bold">{SLOT_TIMES[adjacentSlot.adjacentSlot]}</span>: {adjacentSlot.pcaName}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* No content placeholder - only show when shrunk */}
        {shouldShrink && (
          <div className="text-[9px] text-muted-foreground text-center py-1">
            No reserved or adjacent slots
          </div>
        )}
      </CardContent>
    </Card>
  )
}


