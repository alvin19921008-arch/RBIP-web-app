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
  originalPendingFTE: number  // Original pre-adjusted rounded pending FTE for reference
  maxValue: number             // Maximum allowed value (cannot exceed original)
  tieGroupIndex: number | null  // null = not in a tie group, 0-3 = tie group index for coloring
  isTied: boolean               // Whether this team is in a tie-breaker group (enables drag)
  onValueChange: (team: Team, newValue: number) => void
  isDragging?: boolean
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
}: TeamPendingCardProps) {
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
        'touch-none flex-shrink-0',
        isBeingDragged && 'opacity-50 z-50'
      )}
    >
      <Card
        className={cn(
          'w-20',
          colorScheme ? `${colorScheme.border} ${colorScheme.bg} border-2` : 'border',
          isBeingDragged && 'shadow-lg ring-2 ring-primary'
        )}
      >
        <CardContent className="p-1.5 flex flex-col items-center gap-0.5">
          {/* Team Name */}
          <div className={cn(
            'text-xs font-bold leading-tight',
            colorScheme?.text
          )}>
            {team}
          </div>

          {/* Pending FTE Value */}
          <div className="text-base font-mono font-semibold tabular-nums leading-tight">
            {pendingFTE.toFixed(2)}
          </div>
          
          {/* Original Value (in brackets) */}
          <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
            (original {originalPendingFTE.toFixed(2)})
          </div>

          {/* Increment/Decrement Buttons */}
          <div className="flex items-center gap-0.5">
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
                'cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-accent',
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

