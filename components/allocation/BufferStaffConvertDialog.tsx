'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Staff, Team, StaffStatus, SpecialProgram as StaffSpecialProgram } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { X, Info } from 'lucide-react'

interface BufferStaffConvertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: Staff | null
  onSave: () => void
  specialPrograms?: SpecialProgram[]
}

export function BufferStaffConvertDialog({ 
  open, 
  onOpenChange, 
  staff,
  onSave,
  specialPrograms = []
}: BufferStaffConvertDialogProps) {
  const supabase = createClientComponentClient()

  const [team, setTeam] = useState<Team | null>(null)
  const [specialProgram, setSpecialProgram] = useState<StaffSpecialProgram[]>([])
  const [floating, setFloating] = useState<boolean>(false)
  const [floorPCA, setFloorPCA] = useState<'upper' | 'lower' | 'both' | null>(null)
  const [bufferFTE, setBufferFTE] = useState<number>(1.0) // For therapist ranks
  const [availableSlots, setAvailableSlots] = useState<number[]>([]) // For PCA rank

  // Initialize form from staff data when dialog opens
  useEffect(() => {
    if (open && staff) {
      // Initialize from existing staff data
      setTeam(staff.team || null)
      setSpecialProgram(staff.special_program || [])
      setFloating(staff.floating || false)
      
      // Initialize floor_pca
      if (staff.floor_pca) {
        if (staff.floor_pca.length === 2) {
          setFloorPCA('both')
        } else if (staff.floor_pca.includes('upper')) {
          setFloorPCA('upper')
        } else if (staff.floor_pca.includes('lower')) {
          setFloorPCA('lower')
        } else {
          setFloorPCA(null)
        }
      } else {
        setFloorPCA(null)
      }
      
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

  // Reset floor PCA and slots when rank changes (shouldn't happen for existing staff, but just in case)
  useEffect(() => {
    if (staff && staff.rank !== 'PCA') {
      setFloorPCA(null)
      setFloating(false)
      setAvailableSlots([])
    } else if (staff && staff.rank === 'PCA') {
      // Default to all slots for PCA
      if (availableSlots.length === 0) {
        setAvailableSlots([1, 2, 3, 4])
      }
    }
  }, [staff])

  // Enforce: non-floating buffer PCA must be whole-day (all 4 slots)
  useEffect(() => {
    if (!staff || staff.rank !== 'PCA') return
    if (!floating) {
      setAvailableSlots([1, 2, 3, 4])
    }
  }, [staff, floating])

  // Get available special program names
  const availableProgramNames = specialPrograms.map((p) => p.name as StaffSpecialProgram).sort()

  // Calculate buffer_fte for PCA from selected slots
  const calculatePCAFTE = (slots: number[]): number => {
    return slots.length * 0.25
  }

  const handleSlotToggle = (slot: number) => {
    // Non-floating buffer PCA is always whole-day; don't allow changing slots.
    if (staff?.rank === 'PCA' && !floating) return
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

    // Validate required fields
    if (staff.rank === 'PCA' && floorPCA === null) {
      alert('Floor PCA is required for PCA staff')
      return
    }

    if (staff.rank === 'PCA' && availableSlots.length === 0) {
      alert('At least one slot must be selected for PCA staff')
      return
    }

    // Buffer non-floating PCA: must be full-day only (whole-day substitute intent).
    if (staff.rank === 'PCA' && !floating && availableSlots.length !== 4) {
      alert('Non-floating buffer PCA must be whole day (all 4 slots).')
      return
    }

    // Convert floor_pca to array format
    let floorPCAArray: ('upper' | 'lower')[] | null = null
    if (staff.rank === 'PCA' && floorPCA) {
      if (floorPCA === 'both') {
        floorPCAArray = ['upper', 'lower']
      } else {
        floorPCAArray = [floorPCA]
      }
    }

    // Calculate buffer_fte
    let finalBufferFTE: number | null = null
    if (staff.rank === 'PCA') {
      finalBufferFTE = calculatePCAFTE(availableSlots)
    } else {
      finalBufferFTE = bufferFTE
    }

    // Prepare update data
    const updateData: Partial<Staff> = {
      status: 'buffer' as StaffStatus,
      team: staff.rank === 'PCA' && floating ? null : team,
      special_program: specialProgram.length > 0 ? specialProgram : null,
      floating: staff.rank === 'PCA' ? floating : false,
      floor_pca: floorPCAArray,
      buffer_fte: finalBufferFTE,
    }

    try {
      const { error } = await supabase
        .from('staff')
        .update(updateData)
        .eq('id', staff.id)

      if (error) {
        console.error('Error converting to buffer staff:', error)
        alert('Failed to convert to buffer staff. Please try again.')
        return
      }

      onSave()
      onOpenChange(false)
    } catch (err) {
      console.error('Error converting to buffer staff:', err)
      alert('Failed to convert to buffer staff. Please try again.')
    }
  }

  const isTeamRequired = () => {
    if (!staff) return false
    if (staff.rank === 'SPT') return false
    if (['APPT', 'RPT'].includes(staff.rank)) return true
    if (staff.rank === 'PCA' && !floating) return true
    return false
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
          </div>

          {/* Team */}
          <div>
            <Label htmlFor="team">
              Team {isTeamRequired() && <span className="text-destructive">*</span>}
            </Label>
            <select
              id="team"
              value={team || ''}
              onChange={(e) => setTeam(e.target.value ? (e.target.value as Team) : null)}
              required={isTeamRequired()}
              className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm mt-1"
            >
              <option value="">-- Select Team --</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {staff.rank === 'PCA' && (
              <p className="text-xs text-muted-foreground mt-1">
                {floating ? 'Floating PCA does not require a team assignment.' : 'Non-floating PCA requires a team assignment.'}
              </p>
            )}
            {staff.rank === 'SPT' && (
              <p className="text-xs text-muted-foreground mt-1">
                Team assignment for SPT is optional and can be configured in SPT Allocations.
              </p>
            )}
          </div>

          {/* Special Program */}
          <div>
            <Label>Special Program</Label>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Info className="h-3.5 w-3.5" />
              <span>Go to Special Programs dashboard for detailed configuration.</span>
            </div>
            <div className="space-y-2 mt-2 border rounded-md p-3 max-h-40 overflow-y-auto">
              {availableProgramNames.length > 0 ? (
                availableProgramNames.map((prog) => (
                  <label key={prog} className="flex items-center space-x-2 cursor-pointer hover:bg-accent/50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={specialProgram.includes(prog)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSpecialProgram([...specialProgram, prog])
                        } else {
                          setSpecialProgram(specialProgram.filter((p) => p !== prog))
                        }
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{prog}</span>
                  </label>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No special programs available</p>
              )}
            </div>
          </div>

          {/* Therapist: FTE Input */}
          {['SPT', 'APPT', 'RPT'].includes(staff.rank) && (
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

          {/* PCA Properties */}
          {staff.rank === 'PCA' && (
            <div className="space-y-4 border p-4 rounded-md">
              <div>
                <Label htmlFor="floating">
                  Floating <span className="text-destructive">*</span>
                </Label>
                <select
                  id="floating"
                  value={floating ? 'floating' : 'non-floating'}
                  onChange={(e) => setFloating(e.target.value === 'floating')}
                  required
                  className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm mt-1"
                >
                  <option value="floating">Floating</option>
                  <option value="non-floating">Non-floating</option>
                </select>
              </div>

              <div>
                <Label htmlFor="floorPCA">
                  Floor PCA <span className="text-destructive">*</span>
                </Label>
                <select
                  id="floorPCA"
                  value={floorPCA || ''}
                  onChange={(e) => setFloorPCA(e.target.value ? (e.target.value as 'upper' | 'lower' | 'both') : null)}
                  required
                  className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm mt-1"
                >
                  <option value="">-- Select --</option>
                  <option value="upper">Upper</option>
                  <option value="lower">Lower</option>
                  <option value="both">Both</option>
                </select>
              </div>

              {/* Slot Selection for PCA */}
              <div>
                <Label>Available Slots <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {floating
                    ? 'Select which slots this buffer PCA is available for. Buffer FTE will be calculated from selected slots.'
                    : 'Non-floating buffer PCA must be whole day (all 4 slots).'}
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
                          ${!floating ? 'opacity-60 cursor-not-allowed' : ''}
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={availableSlots.includes(slot)}
                          onChange={() => handleSlotToggle(slot)}
                          disabled={!floating}
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
