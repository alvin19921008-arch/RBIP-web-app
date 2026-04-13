'use client'

import { Team } from '@/types/staff'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GripVertical, Minus, Plus } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

// Color schemes for tie-breaker groups (up to 4 groups)
const TIE_BREAKER_COLORS = [
  { border: 'border-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-300' },
  { border: 'border-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300' },
  { border: 'border-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-300' },
  { border: 'border-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300' },
]

interface TeamPendingCardProps {
  team: Team
  pendingFTE: number
  /** Quarter-rounded floating cap from Step 3 open (max for ± control). */
  originalPendingFTE: number
  maxValue: number
  tieGroupIndex: number | null
  isTied: boolean
  onValueChange: (team: Team, newValue: number) => void
  isDragging?: boolean
  /** Display average PCA/team (same as dashboard — [Step3ProjectionV2.displayTargetByTeam] / raw bootstrap target). */
  avgPcaPerTeam?: number | null
  /** Raw floating need before quarter rounding: max(0, avg − non-floating). */
  rawFloatingFTE?: number | null
  /** Non-floating PCA FTE on team from Step 2 (shown as “Non-floating”). */
  assignedFromSlotsFTE?: number | null
  /**
   * Step 3.1 “Rounded” row: quarter-rounded fixed floating target from the Step 2→3 projection
   * ([fixedRoundedFloatingTargetByTeam] at open). Step 3.1 ± adjusts pending; this value moves by the same
   * quarter delta so it stays the fixed target Steps 3.2+ use (not “non-floating + pending” as a separate sum).
   */
  fixedRoundedFloatingTargetFte?: number | null
  assignedFTE?: number
  orderPosition?: number
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

export function TeamPendingCard({
  team,
  pendingFTE,
  originalPendingFTE,
  maxValue,
  tieGroupIndex,
  isTied,
  onValueChange,
  isDragging = false,
  avgPcaPerTeam,
  rawFloatingFTE,
  assignedFromSlotsFTE,
  fixedRoundedFloatingTargetFte,
  assignedFTE,
  orderPosition,
}: TeamPendingCardProps) {
  const showV2Step31Breakdown =
    avgPcaPerTeam != null ||
    (rawFloatingFTE != null && !Number.isNaN(rawFloatingFTE)) ||
    assignedFromSlotsFTE != null ||
    (fixedRoundedFloatingTargetFte != null && Number.isFinite(fixedRoundedFloatingTargetFte))

  const roundedCap = originalPendingFTE
  const fixedRoundedFloatingDisplay =
    fixedRoundedFloatingTargetFte != null && Number.isFinite(fixedRoundedFloatingTargetFte)
      ? fixedRoundedFloatingTargetFte
      : roundedCap
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: team,
    disabled: !isTied, // Only enable drag for tied teams
  })

  const isBeingDragged = isDragging || isSortableDragging
  
  // Force horizontal-only drag by zeroing out Y-axis
  const horizontalTransform = transform ? { ...transform, y: 0 } : null
  
  // Only apply transition when not dragging to prevent visual artifacts
  const style = {
    transform: CSS.Transform.toString(horizontalTransform),
    transition: isBeingDragged ? 'none' : transition,
  }

  // Get color scheme based on tie group index
  const colorScheme = tieGroupIndex !== null && tieGroupIndex < TIE_BREAKER_COLORS.length
    ? TIE_BREAKER_COLORS[tieGroupIndex]
    : null

  const handleDecrement = () => {
    const newValue = Math.max(0, pendingFTE - 0.25)
    onValueChange(team, newValue)
  }

  const handleIncrement = () => {
    // Cannot exceed maxValue (original pre-adjusted value)
    const newValue = Math.min(maxValue, pendingFTE + 0.25)
    onValueChange(team, newValue)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'touch-pan-x flex-shrink-0',
        isBeingDragged && 'opacity-50 z-50'
      )}
    >
      <Card
        className={cn(
          'w-[8.125rem] shrink-0',
          colorScheme ? `${colorScheme.border} ${colorScheme.bg} border-2` : 'border',
          isBeingDragged && 'shadow-lg ring-2 ring-primary'
        )}
      >
        <CardContent className="flex flex-col items-stretch gap-0.5 p-1.5">
          {/* Order Position (ordinal number) */}
          {orderPosition !== undefined && (
            <div className="text-center text-[9px] leading-tight text-muted-foreground">
              {orderPosition}
              {getOrdinalSuffix(orderPosition)}
            </div>
          )}

          {/* Team Name */}
          <div
            className={cn('text-center text-xs font-bold leading-tight', colorScheme?.text)}
          >
            {team}
          </div>

          <div className="text-center">
            <div className="text-[9px] leading-tight text-muted-foreground">Pending floating</div>
            <div className="text-base font-mono font-semibold tabular-nums leading-tight text-foreground">
              {pendingFTE.toFixed(2)}
            </div>
          </div>

          <div className="space-y-0.5 border-t border-border/60 pt-1 text-[9px] leading-tight text-muted-foreground">
            {showV2Step31Breakdown ? (
              <>
                {avgPcaPerTeam != null && !Number.isNaN(avgPcaPerTeam) ? (
                  <div className="flex justify-between gap-0.5 tabular-nums">
                    <span className="text-muted-foreground/90">Avg</span>
                    <span className="font-medium text-foreground">{avgPcaPerTeam.toFixed(2)}</span>
                  </div>
                ) : null}
                {rawFloatingFTE != null && !Number.isNaN(rawFloatingFTE) ? (
                  <div className="flex justify-between gap-0.5 tabular-nums">
                    <span className="min-w-0 shrink text-muted-foreground/90">Raw floating</span>
                    <span className="font-medium text-foreground">{rawFloatingFTE.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-0.5 tabular-nums">
                  <span
                    className="text-muted-foreground/90"
                    title="Fixed rounded floating target from the Step 2→3 projection at open; Step 3.1 ± moves it by the same quarter change as pending. Locked from Step 3.2 onward unless you return to Step 3.1."
                  >
                    Rounded floating
                  </span>
                  <span className="font-medium text-foreground">{fixedRoundedFloatingDisplay.toFixed(2)}</span>
                </div>
                {assignedFromSlotsFTE != null && !Number.isNaN(assignedFromSlotsFTE) ? (
                  <div className="flex justify-between gap-0.5 tabular-nums">
                    <span className="min-w-0 shrink text-muted-foreground/90">Non-floating</span>
                    <span className="font-medium text-foreground">{assignedFromSlotsFTE.toFixed(2)}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex justify-between gap-0.5 tabular-nums">
                <span
                  className="text-muted-foreground/90"
                  title="Fixed rounded floating target from the Step 2→3 projection at open; Step 3.1 ± moves it by the same quarter change as pending. Locked from Step 3.2 onward unless you return to Step 3.1."
                >
                  Rounded floating
                </span>
                <span className="font-medium text-foreground">{fixedRoundedFloatingDisplay.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Assigned Value (if buffer PCA assigned) */}
          {assignedFTE !== undefined && assignedFTE > 0 && (
            <div className="text-center text-[9px] leading-tight text-muted-foreground">
              Buffer +{assignedFTE.toFixed(2)}
            </div>
          )}

          {/* Increment/Decrement Buttons */}
          <div className="flex items-center justify-center gap-0.5">
            <Button
              variant="outline"
              size="icon"
              className="h-5 w-5"
              onClick={handleDecrement}
              disabled={pendingFTE <= 0}
            >
              <Minus className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-5 w-5"
              onClick={handleIncrement}
              disabled={pendingFTE >= maxValue}
            >
              <Plus className="h-2.5 w-2.5" />
            </Button>
          </div>

          {/* Drag Handle - only visible for tied teams */}
          {isTied && (
            <div
              {...attributes}
              {...listeners}
              className={cn(
                'flex touch-none cursor-grab justify-center active:cursor-grabbing rounded p-0.5 hover:bg-accent',
                colorScheme?.text || 'text-muted-foreground'
              )}
            >
              <GripVertical className="h-3 w-3" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export { TIE_BREAKER_COLORS }

