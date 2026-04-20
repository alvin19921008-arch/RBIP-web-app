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
import { ArrowRight, GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatEnglishOrdinal } from '@/lib/utils/formatOrdinal'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { Staff } from '@/types/staff'

function sortableIdForPca(pcaId: string): string {
  return `ranked-pca-${pcaId}`
}

function RankedPCAChip({
  pcaId,
  rankIndex,
  displayName,
  pcaIdPendingDelete,
  onRequestRemove,
  onCancelPendingRemove,
  onConfirmRemove,
}: {
  pcaId: string
  rankIndex: number
  displayName: string
  pcaIdPendingDelete: string | null
  onRequestRemove: () => void
  onCancelPendingRemove: () => void
  onConfirmRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableIdForPca(pcaId) })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  }

  const pending = pcaIdPendingDelete === pcaId

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[10px] border border-teal-200/80 bg-teal-50/70 px-2.5 py-1.5 touch-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)]',
        isDragging && 'z-50 opacity-90 shadow-md ring-2 ring-teal-400/35'
      )}
    >
      <span className="text-[11px] font-bold text-teal-800/70">{formatEnglishOrdinal(rankIndex + 1)}</span>
      {!pending ? (
        <button
          type="button"
          className="cursor-grab rounded p-0.5 text-teal-700/80 hover:bg-teal-100/80 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${displayName}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <span className="max-w-[12rem] truncate text-[13px] font-semibold text-teal-950">{displayName}</span>
      {pending ? (
        <div className="flex items-center gap-1">
          <Button variant="destructive" size="sm" className="h-7 text-xs" type="button" onClick={onConfirmRemove}>
            Confirm?
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" type="button" onClick={onCancelPendingRemove}>
            ×
          </Button>
        </div>
      ) : (
        <Tooltip content={`Remove ${displayName}`} side="top">
          <button
            type="button"
            onClick={onRequestRemove}
            className="ml-0.5 rounded p-0.5 text-teal-700/70 hover:bg-teal-100/90 hover:text-teal-950"
            aria-label={`Remove ${displayName} from preferred list`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

export function RankedPCAPreferencesEditor({
  rankedPcaIds,
  onRankedPcaIdsChange,
  staff,
  pcaIdPendingDelete,
  onRequestRemove,
  onCancelPendingRemove,
  onConfirmRemove,
}: {
  rankedPcaIds: string[]
  onRankedPcaIdsChange: (next: string[]) => void
  staff: Staff[]
  pcaIdPendingDelete: string | null
  onRequestRemove: (pcaId: string) => void
  onCancelPendingRemove: () => void
  onConfirmRemove: (pcaId: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const sortableItems = useMemo(() => rankedPcaIds.map(sortableIdForPca), [rankedPcaIds])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = sortableItems.indexOf(String(active.id))
      const newIndex = sortableItems.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return
      onRankedPcaIdsChange(arrayMove(rankedPcaIds, oldIndex, newIndex))
    },
    [rankedPcaIds, sortableItems, onRankedPcaIdsChange]
  )

  const nameFor = useCallback(
    (id: string) => staff.find((s) => s.id === id)?.name ?? id,
    [staff]
  )

  if (rankedPcaIds.length === 0) {
    return (
      <div className="overflow-x-auto pb-0.5">
        <p className="text-sm text-muted-foreground">Use Add Preferred PCA above to choose who appears here.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-0.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableItems} strategy={horizontalListSortingStrategy}>
          <div className="inline-flex items-center gap-1.5">
            {rankedPcaIds.map((pcaId, index) => {
              const displayName = nameFor(pcaId)
              return (
                <Fragment key={pcaId}>
                  <RankedPCAChip
                    pcaId={pcaId}
                    rankIndex={index}
                    displayName={displayName}
                    pcaIdPendingDelete={pcaIdPendingDelete}
                    onRequestRemove={() => onRequestRemove(pcaId)}
                    onCancelPendingRemove={onCancelPendingRemove}
                    onConfirmRemove={() => onConfirmRemove(pcaId)}
                  />
                  {index < rankedPcaIds.length - 1 ? (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                  ) : null}
                </Fragment>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Drag ⋮⋮ to reorder preference. × removes a PCA after you confirm.
      </p>
    </div>
  )
}
