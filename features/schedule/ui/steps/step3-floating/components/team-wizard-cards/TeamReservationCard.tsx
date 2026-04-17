'use client'

import { Team } from '@/types/staff'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { TeamReservation, SlotAssignment } from '@/lib/utils/reservationLogic'

// Slot time labels
const SLOT_TIMES: Record<number, string> = {
  1: '0900-1030',
  2: '1030-1200',
  3: '1330-1500',
  4: '1500-1630',
}

// Helper function to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
function getOrdinalSuffix(n: number): string {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return 'st'
  if (j === 2 && k !== 12) return 'nd'
  if (j === 3 && k !== 13) return 'rd'
  return 'th'
}

interface TeamReservationCardProps {
  team: Team
  pendingFTE: number
  reservation: TeamReservation | null
  selections: SlotAssignment[]  // Current selections across all teams
  onSelectionChange: (team: Team, slot: number, pcaId: string, pcaName: string, selected: boolean) => void
  orderPosition?: number  // Optional: position in the order (1-based) for displaying ordinal number
}

export function TeamReservationCard({
  team,
  pendingFTE,
  reservation,
  selections,
  onSelectionChange,
  orderPosition,
}: TeamReservationCardProps) {
  // Check if this team has any reservation
  const hasReservation = reservation !== null
  
  // Get current selection for this team (if any)
  const teamSelection = selections.find(s => s.team === team)
  
  // Calculate assigned FTE: each slot assignment = 0.25 FTE
  const assignedFTE = teamSelection ? 0.25 : 0
  
  // Check if a PCA slot is selected by another team (for auto-disable)
  const isDisabledByOtherTeam = (pcaId: string, slot: number): boolean => {
    return selections.some(s => s.pcaId === pcaId && s.slot === slot && s.team !== team)
  }
  
  // Check if this team already has a selection (only one allowed per team per slot)
  const hasOtherSelection = (pcaId: string): boolean => {
    return teamSelection !== undefined && teamSelection.pcaId !== pcaId
  }
  
  const handleCheckboxChange = (pcaId: string, pcaName: string, checked: boolean) => {
    if (!reservation) return
    onSelectionChange(team, reservation.slot, pcaId, pcaName, checked)
  }
  
  return (
    <Card className={cn(
      'transition-all duration-200',
      hasReservation 
        ? 'w-24 border-blue-300 bg-blue-50 dark:bg-blue-950/30 border-2' 
        : 'w-16 border opacity-60'  // Shrunk when no reservation
    )}>
      <CardContent className={cn(
        'flex flex-col items-center gap-0.5',
        hasReservation ? 'p-1.5' : 'p-1'  // Less padding when shrunk
      )}>
        {/* Order Position (ordinal number) */}
        {orderPosition !== undefined && (
          <div className={cn(
            'text-muted-foreground leading-tight',
            hasReservation ? 'text-[9px]' : 'text-[8px]'  // Match size to team name
          )}>
            {orderPosition}{getOrdinalSuffix(orderPosition)}
          </div>
        )}
        
        {/* Team Name */}
        <div className={cn(
          'font-bold leading-tight',
          hasReservation 
            ? 'text-xs text-blue-700 dark:text-blue-300' 
            : 'text-[10px] text-muted-foreground'  // Smaller when shrunk
        )}>
          {team}
        </div>

        {/* Expected Pending FTE */}
        {hasReservation && (
          <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
            Expected: {pendingFTE.toFixed(2)}
          </div>
        )}

        {/* Assigned FTE */}
        {hasReservation && (
          <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
            Assigned: {assignedFTE.toFixed(2)}
          </div>
        )}

        {/* Reserved Slots Section */}
        {hasReservation && reservation && (
          <div className="w-full mt-1 pt-1 border-t border-blue-200 dark:border-blue-800">
            {/* Slot Time - Bold, no "Slot X" text */}
            <div className="text-xs font-bold text-center mb-1">
              {SLOT_TIMES[reservation.slot]}
            </div>
            
            {/* PCA Checkboxes */}
            <div className="space-y-1">
              {reservation.pcaIds.map(pcaId => {
                const pcaName = reservation.pcaNames[pcaId] || pcaId
                const isSelected = teamSelection?.pcaId === pcaId
                const isDisabled = isDisabledByOtherTeam(pcaId, reservation.slot) || hasOtherSelection(pcaId)
                const disabledReason = isDisabledByOtherTeam(pcaId, reservation.slot) 
                  ? 'Selected by another team'
                  : hasOtherSelection(pcaId)
                    ? 'Already selected another PCA'
                    : ''
                
                return (
                  <label
                    key={pcaId}
                    className={cn(
                      'flex items-center gap-1.5 px-1 py-0.5 rounded text-xs cursor-pointer',
                      isDisabled && 'opacity-50 cursor-not-allowed',
                      isSelected && 'bg-blue-100 dark:bg-blue-900'
                    )}
                    title={disabledReason}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isDisabled}
                      onCheckedChange={(checked) => handleCheckboxChange(pcaId, pcaName, !!checked)}
                      className="h-3 w-3"
                    />
                    <span className={cn(
                      'truncate',
                      isDisabled && 'line-through'
                    )}>
                      {pcaName}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
        
        {/* No reservation placeholder */}
        {!hasReservation && (
          <div className="text-[9px] text-muted-foreground text-center py-1">
            No reserved slots
          </div>
        )}
      </CardContent>
    </Card>
  )
}

