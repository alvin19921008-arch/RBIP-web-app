'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Staff } from '@/types/staff'
import { X } from 'lucide-react'
import { useToast } from '@/components/ui/toast-provider'

interface BufferStaffConvertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: Staff | null
  onConfirm: (result: { bufferFTE: number; availableSlots?: number[] }) => void
}

export function BufferStaffConvertDialog({ 
  open, 
  onOpenChange, 
  staff,
  onConfirm,
}: BufferStaffConvertDialogProps) {
  const toast = useToast()

  const [bufferFTE, setBufferFTE] = useState<number>(1.0) // For therapist ranks
  const [availableSlots, setAvailableSlots] = useState<number[]>([]) // For PCA rank

  // Initialize form from staff data when dialog opens
  useEffect(() => {
    if (open && staff) {
      // Initialize buffer FTE (for therapist) or available slots (for PCA)
      if (staff.rank === 'PCA') {
        // Default to all slots for PCA
        setAvailableSlots([1, 2, 3, 4])
      } else {
        // For therapist, default to 1.0 FTE
        setBufferFTE(staff.buffer_fte || 1.0)
      }
    }
  }, [open, staff])

  // Calculate buffer_fte for PCA from selected slots
  const calculatePCAFTE = (slots: number[]): number => {
    return slots.length * 0.25
  }

  const handleSlotToggle = (slot: number) => {
    setAvailableSlots(prev => {
      if (prev.includes(slot)) {
        return prev.filter(s => s !== slot)
      } else {
        return [...prev, slot].sort((a, b) => a - b)
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!staff) return

    if (staff.rank === 'PCA' && availableSlots.length === 0) {
      toast.warning('At least one slot must be selected for PCA staff')
      return
    }

    // Calculate buffer_fte
    let finalBufferFTE: number | null = null
    if (staff.rank === 'PCA') {
      finalBufferFTE = calculatePCAFTE(availableSlots)
    } else {
      finalBufferFTE = bufferFTE
    }

    onConfirm({
      bufferFTE: finalBufferFTE ?? 0,
      availableSlots: staff.rank === 'PCA' ? availableSlots : undefined,
    })
    toast.success('Converted to buffer staff (schedule-local).')
    onOpenChange(false)
  }

  if (!staff) return null

  const pcaFTE = staff.rank === 'PCA' ? calculatePCAFTE(availableSlots) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Convert to Buffer Staff: {staff.name}</DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 hover:bg-accent rounded"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Staff Info (Read-only) */}
          <div className="bg-muted p-3 rounded-md">
            <div className="text-sm">
              <span className="font-semibold">Rank:</span> {staff.rank}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              This conversion is schedule-local (snapshot). It will be persisted when you save the schedule.
            </div>
          </div>

          {/* Therapist: FTE Input (schedule-local) */}
          {staff.rank !== 'PCA' && (
            <div>
              <Label htmlFor="buffer-fte">
                Buffer FTE <span className="text-destructive">*</span>
              </Label>
              <Input
                id="buffer-fte"
                type="number"
                min="0.25"
                max="1.0"
                step="0.25"
                value={bufferFTE}
                onChange={(e) => {
                  const value = parseFloat(e.target.value)
                  if (!isNaN(value) && value >= 0.25 && value <= 1.0) {
                    setBufferFTE(value)
                  }
                }}
                required
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                FTE value for this buffer staff (0.25 to 1.0, in 0.25 increments)
              </p>
            </div>
          )}

          {/* PCA slots (schedule-local) */}
          {staff.rank === 'PCA' && (
            <div>
              <Label>Available Slots <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select which slots this buffer PCA is available for. Buffer FTE will be calculated from selected slots.
              </p>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[1, 2, 3, 4].map((slot) => {
                  const slotTimes = {
                    1: '0900-1030',
                    2: '1030-1200',
                    3: '1330-1500',
                    4: '1500-1630',
                  }
                  return (
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
                  )
                })}
              </div>
              {availableSlots.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Selected: {availableSlots.length} slot(s) = {pcaFTE.toFixed(2)} FTE
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Convert to Buffer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
