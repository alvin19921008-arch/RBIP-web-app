'use client'

import { Fragment, useCallback, useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowRight, GripVertical, Info, X } from 'lucide-react'
import { getSlotLabel } from '@/lib/utils/slotHelpers'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-context'

const SLOT_NUMBERS = [1, 2, 3, 4] as const
type SlotNumber = (typeof SLOT_NUMBERS)[number]

function sortableIdForSlot(slot: number): string {
  return `ranked-slot-${slot}`
}

function RankedSlotChip({
  slot,
  rankIndex,
  timeLabel,
  showGymBadge,
  onRemove,
}: {
  slot: SlotNumber
  rankIndex: number
  timeLabel: string
  showGymBadge: boolean
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableIdForSlot(slot) })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-muted/40 px-2.5 py-1.5 touch-none',
        isDragging && 'z-50 opacity-90 shadow-md ring-2 ring-ring'
      )}
    >
      <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{rankIndex + 1}</span>
      <button
        type="button"
        className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder slot ${timeLabel}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-[13px] font-semibold tabular-nums text-foreground">{timeLabel}</span>
      {showGymBadge ? (
        <span className="ml-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Gym</span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Remove slot ${timeLabel} from rank`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function RankedSlotPreferencesEditor({
  rankedSlots,
  onRankedSlotsChange,
  gymSchedule,
  avoidGymSchedule,
}: {
  rankedSlots: number[]
  onRankedSlotsChange: (next: number[]) => void
  gymSchedule: number | null
  avoidGymSchedule: boolean
}) {
  const toast = useToast()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const sortableItems = useMemo(() => rankedSlots.map(sortableIdForSlot), [rankedSlots])

  const toggleInterval = useCallback(
    (slot: SlotNumber) => {
      if (rankedSlots.includes(slot)) {
        onRankedSlotsChange(rankedSlots.filter((s) => s !== slot))
        return
      }
      if (rankedSlots.length >= 4) {
        toast.warning('Maximum 4 ranked slots', 'Remove one slot before adding another.')
        return
      }
      onRankedSlotsChange([...rankedSlots, slot])
    },
    [rankedSlots, onRankedSlotsChange, toast]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = sortableItems.indexOf(String(active.id))
      const newIndex = sortableItems.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return
      onRankedSlotsChange(arrayMove(rankedSlots, oldIndex, newIndex))
    },
    [rankedSlots, sortableItems, onRankedSlotsChange]
  )

  const showGymNotice =
    avoidGymSchedule === true && gymSchedule != null && rankedSlots.includes(gymSchedule)

  const gymTimeLabel = gymSchedule != null ? getSlotLabel(gymSchedule) : ''

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="mb-2 text-xs font-semibold text-foreground">Slots</div>
        <div className="flex flex-wrap gap-2">
          {SLOT_NUMBERS.map((slot) => {
            const selected = rankedSlots.includes(slot)
            return (
              <button
                key={slot}
                type="button"
                onClick={() => toggleInterval(slot)}
                className={cn(
                  'rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors',
                  selected
                    ? 'bg-blue-600 font-semibold text-white'
                    : 'border border-border bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {getSlotLabel(slot)}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Tap a slot to add or remove it from your rank. Slots you don&apos;t tap stay unranked.
        </p>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-foreground">Rank</div>
        <div className="overflow-x-auto pb-0.5">
          {rankedSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tap Slots above to build your rank.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableItems} strategy={horizontalListSortingStrategy}>
                <div className="inline-flex items-center gap-1.5">
                  {rankedSlots.map((slot, index) => (
                    <Fragment key={slot}>
                      <RankedSlotChip
                        slot={slot as SlotNumber}
                        rankIndex={index}
                        timeLabel={getSlotLabel(slot)}
                        showGymBadge={gymSchedule != null && gymSchedule === slot}
                        onRemove={() => onRankedSlotsChange(rankedSlots.filter((s) => s !== slot))}
                      />
                      {index < rankedSlots.length - 1 ? (
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                      ) : null}
                    </Fragment>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Drag ⋮⋮ to reorder. × puts the slot back under Slots (unranked).
        </p>
      </div>

      {showGymNotice ? (
        <div className="w-full max-w-2xl rounded-xl border border-border border-l-[3px] border-l-muted-foreground/35 bg-muted/30 p-3 shadow-sm">
          <div className="flex gap-2.5 text-sm">
            <div
              className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm"
              role="img"
              aria-label="Information"
            >
              <Info className="h-3 w-3" aria-hidden />
            </div>
            <p className="font-medium leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">{gymTimeLabel}</span> (gym). Avoid gym on: may stay
              ranked; used only as last resort.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
