'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Staff } from '@/types/staff'

interface BufferSlotSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: Staff | null
  onConfirm: (slots: number[], bufferFTE: number) => void
}

export function BufferSlotSelectionDialog({
  open,
  onOpenChange,
  staff,
  onConfirm,
}: BufferSlotSelectionDialogProps) {
  const [availableSlots, setAvailableSlots] = useState<number[]>([])

  useEffect(() => {
    if (open && staff) {
      // Default to all slots
      setAvailableSlots([1, 2, 3, 4])
    }
  }, [open, staff])

  const handleSlotToggle = (slot: number) => {
    setAvailableSlots(prev => {
      if (prev.includes(slot)) {
        return prev.filter(s => s !== slot)
      } else {
        return [...prev, slot].sort((a, b) => a - b)
      }
    })
  }

  const handleConfirm = () => {
    if (availableSlots.length === 0) {
      alert('At least one slot must be selected')
      return
    }
    const bufferFTE = availableSlots.length * 0.25
    onConfirm(availableSlots, bufferFTE)
    onOpenChange(false)
  }

  if (!staff) return null

  const slotTimes = {
    1: '0900-1030',
    2: '1030-1200',
    3: '1330-1500',
    4: '1500-1630',
  }

  const bufferFTE = availableSlots.length * 0.25

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Available Slots for {staff.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select which slots this buffer PCA is available for. Buffer FTE will be calculated from selected slots.
          </p>
          
          <div>
            <Label>Available Slots <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[1, 2, 3, 4].map((slot) => (
                <label
                  key={slot}
                  className={`
                    flex flex-col items-center justify-center p-3 border-2 rounded-md cursor-pointer transition-colors
                    ${availableSlots.includes(slot)
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={availableSlots.includes(slot)}
                    onChange={() => handleSlotToggle(slot)}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold">Slot {slot}</span>
                  <span className="text-xs text-muted-foreground">{slotTimes[slot as keyof typeof slotTimes]}</span>
                </label>
              ))}
            </div>
            {availableSlots.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Selected: {availableSlots.length} slot(s) = {bufferFTE.toFixed(2)} FTE
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={availableSlots.length === 0}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
