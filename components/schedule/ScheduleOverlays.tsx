'use client'

import { memo } from 'react'
import { SlotSelectionPopover } from '@/components/allocation/SlotSelectionPopover'

export const ScheduleOverlays = memo(function ScheduleOverlays(props: {
  topLoadingVisible: boolean
  topLoadingProgress: number

  pcaSlotSelection: {
    staffName: string
    availableSlots: number[]
    selectedSlots: number[]
    position: { x: number; y: number }
    isDiscardMode?: boolean
  } | null
  onSlotToggle: (slot: number) => void
  onCloseSlotSelection: () => void
  onStartDragFromSlotPopover: () => void
}) {
  const {
    topLoadingVisible,
    topLoadingProgress,
    pcaSlotSelection,
    onSlotToggle,
    onCloseSlotSelection,
    onStartDragFromSlotPopover,
  } = props

  return (
    <>
      {/* Thin top loading bar (Save/Copy). Shown for everyone. */}
      {topLoadingVisible && (
        <div className="fixed top-0 left-0 right-0 h-[6px] z-[99999] bg-transparent">
          <div
            className="h-full bg-sky-500 transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(topLoadingProgress * 100)}%` }}
          />
        </div>
      )}

      {/* PCA Slot Selection Popover */}
      {pcaSlotSelection && (
        <SlotSelectionPopover
          staffName={pcaSlotSelection.staffName}
          availableSlots={pcaSlotSelection.availableSlots}
          selectedSlots={pcaSlotSelection.selectedSlots}
          onSlotToggle={onSlotToggle}
          onClose={onCloseSlotSelection}
          onStartDrag={onStartDragFromSlotPopover}
          position={pcaSlotSelection.position}
          isDiscardMode={pcaSlotSelection.isDiscardMode}
        />
      )}
    </>
  )
})

