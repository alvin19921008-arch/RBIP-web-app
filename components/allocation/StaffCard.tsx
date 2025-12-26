'use client'

import { useState, ReactNode } from 'react'
import { Staff } from '@/types/staff'
import { TherapistAllocation } from '@/types/schedule'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { formatFTE } from '@/lib/utils/rounding'

interface StaffCardProps {
  staff: Staff
  allocation?: TherapistAllocation
  fteRemaining?: number
  sptDisplay?: string
  slotDisplay?: ReactNode // Optional: slot display with leave/come back times
  onEdit?: (event?: React.MouseEvent) => void
  draggable?: boolean
  nameColor?: string // Optional: custom color class for name (e.g., 'text-red-600')
  borderColor?: string // Optional: custom border color class (e.g., 'border-green-700')
  dragTeam?: string // Optional: team context for drag-and-drop (used for PCA slot transfers)
}

export function StaffCard({ staff, allocation, fteRemaining, sptDisplay, slotDisplay, onEdit, draggable = true, nameColor, borderColor, dragTeam }: StaffCardProps) {
  // Use composite ID to ensure each team's instance has a unique draggable id
  // This prevents drag styling from applying to the same staff card in other teams
  // Use '::' as separator (unlikely to appear in UUIDs)
  const draggableId = dragTeam ? `${staff.id}::${dragTeam}` : staff.id
  const dragProps = draggable ? useDraggable({
    id: draggableId,
    data: { staff, allocation, team: dragTeam },
  }) : {
    attributes: {},
    listeners: {},
    setNodeRef: null,
    transform: null,
    isDragging: false,
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = dragProps

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  // Only show FTE number when FTE ≠ 1 and ≠ 0
  // Show only the number, not "FTE remaining: xxx"
  const displayName = sptDisplay 
    ? `${staff.name} ${sptDisplay}`
    : fteRemaining !== undefined && fteRemaining !== 1.0 && fteRemaining !== 0
    ? `${staff.name} ${formatFTE(fteRemaining)}`
    : staff.name

  const [isHoveringCard, setIsHoveringCard] = useState(false)
  const [isHoveringEdit, setIsHoveringEdit] = useState(false)

  // Determine border color: use provided borderColor, or default based on rank
  const borderColorClass = borderColor 
    ? borderColor
    : staff.rank === 'APPT' 
    ? 'border-[#e7cc32]' 
    : staff.rank === 'SPT' 
    ? 'border-[#d38e25]' 
    : 'border-border'

  return (
    <div
      ref={setNodeRef || undefined}
      style={style}
      {...(draggable && !isHoveringEdit ? { ...listeners, ...attributes } : {})}
      className={cn(
        "relative p-1 border-2 rounded-md bg-card hover:bg-accent transition-colors",
        borderColorClass,
        draggable && !isHoveringEdit && "cursor-move",
        isDragging && "opacity-50"
      )}
      onMouseEnter={() => setIsHoveringCard(true)}
      onMouseLeave={() => {
        setIsHoveringCard(false)
        setIsHoveringEdit(false)
      }}
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm font-medium flex-1", nameColor === 'underline' ? 'underline' : nameColor || "")}>{displayName}</span>
          {onEdit && isHoveringCard && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 flex-shrink-0 ml-1"
              onMouseEnter={() => setIsHoveringEdit(true)}
              onMouseLeave={() => setIsHoveringEdit(false)}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onEdit?.(e)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
        {slotDisplay && (
          <div className="text-xs mt-0.5 ml-0">
            {slotDisplay}
          </div>
        )}
      </div>
    </div>
  )
}

