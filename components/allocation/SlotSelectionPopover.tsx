'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { getSlotTime, formatTimeRange } from '@/lib/utils/slotHelpers'
import { Check, X, GripVertical } from 'lucide-react'

interface SlotSelectionPopoverProps {
  staffName: string
  availableSlots: number[]
  selectedSlots: number[]
  onSlotToggle: (slot: number) => void
  onClose: () => void
  onStartDrag: () => void // Called when user starts dragging a selected slot
  position: { x: number; y: number }
}

export function SlotSelectionPopover({
  staffName,
  availableSlots,
  selectedSlots,
  onSlotToggle,
  onClose,
  onStartDrag,
  position,
}: SlotSelectionPopoverProps) {
  // Track if mouse moved enough to be considered a drag vs click
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  
  if (availableSlots.length === 0) return null

  const hasSelectedSlots = selectedSlots.length > 0

  // Handle mousedown on a selected slot to potentially start drag
  const handleSlotMouseDown = (e: React.MouseEvent, slot: number, isSelected: boolean) => {
    e.stopPropagation()
    e.preventDefault() // Prevent default to avoid text selection and other behaviors
    
    if (!isSelected) {
      // If not selected, just toggle it
      return
    }
    
    // Track start position for drag detection
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current = false
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return
      
      const dx = moveEvent.clientX - dragStartRef.current.x
      const dy = moveEvent.clientY - dragStartRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      // If moved more than 5px, consider it a drag
      if (distance > 5 && !isDraggingRef.current) {
        isDraggingRef.current = true
        onStartDrag()
        cleanup()
      }
    }
    
    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault()
      // If didn't drag, toggle the slot
      if (!isDraggingRef.current) {
        onSlotToggle(slot)
      }
      cleanup()
    }
    
    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      dragStartRef.current = null
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[150px]"
      style={{
        left: position.x,
        top: position.y,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      
      {/* Header */}
      <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1.5 font-medium pr-4">
        {hasSelectedSlots ? 'Drag selected slots:' : 'Select slots to move:'}
      </div>
      
      {/* Staff name */}
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-600 truncate">
        {staffName}
      </div>
      
      {/* Slot options - selected slots are draggable */}
      <div className="space-y-1">
        {availableSlots.sort((a, b) => a - b).map((slot) => {
          const isSelected = selectedSlots.includes(slot)
          const slotTime = getSlotTime(slot)
          const formattedTime = formatTimeRange(slotTime)
          
          return (
            <div
              key={slot}
              onMouseDown={(e) => handleSlotMouseDown(e, slot, isSelected)}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                if (!isSelected) {
                  onSlotToggle(slot)
                }
                // Selected slots handle toggle in mouseup after checking for drag
              }}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium transition-all",
                isSelected
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-500 cursor-grab active:cursor-grabbing"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
              )}
            >
              <div className="flex items-center gap-1.5">
                {isSelected && <GripVertical className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />}
                <span>{formattedTime}</span>
              </div>
              {isSelected && <Check className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
            </div>
          )
        })}
      </div>
      
      {/* Summary of selected slots */}
      {hasSelectedSlots && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
          <div className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
            {selectedSlots.length} slot{selectedSlots.length !== 1 ? 's' : ''} selected ({(selectedSlots.length * 0.25).toFixed(2)} FTE)
          </div>
          <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 italic">
            Drag any selected slot to move
          </div>
        </div>
      )}
      
      {/* Instruction when no slots selected */}
      {!hasSelectedSlots && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-600 text-[10px] text-slate-400 dark:text-slate-500 italic leading-tight">
          Click slots to select,<br/>then drag to move
        </div>
      )}
    </div>
  )
}


