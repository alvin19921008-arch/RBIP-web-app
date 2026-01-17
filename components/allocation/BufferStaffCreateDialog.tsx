'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Staff, StaffRank, Team, StaffStatus, SpecialProgram as StaffSpecialProgram } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-provider'

const RANKS: StaffRank[] = ['SPT', 'APPT', 'RPT', 'PCA']
const SPECIALTY_OPTIONS = ['MSK/Ortho', 'Cardiac', 'Neuro', 'Cancer', 'nil']

interface BufferStaffCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (
    createdStaff?: Staff,
    meta?: { availableSlots?: number[]; bufferFTE?: number | null }
  ) => void
  specialPrograms?: SpecialProgram[]
  minRequiredFTE?: number
  staffToEdit?: Staff | null
  initialAvailableSlots?: number[] | null
}

export function BufferStaffCreateDialog({ 
  open, 
  onOpenChange, 
  onSave,
  specialPrograms = [],
  minRequiredFTE,
  staffToEdit = null,
  initialAvailableSlots = null,
}: BufferStaffCreateDialogProps) {
  const supabase = createClientComponentClient()
  const toast = useToast()

  const [name, setName] = useState('')
  const [rank, setRank] = useState<StaffRank>('PCA')
  const [team, setTeam] = useState<Team | null>(null)
  const [specialProgram, setSpecialProgram] = useState<StaffSpecialProgram[]>([])
  const [floating, setFloating] = useState<boolean>(false)
  const [floorPCA, setFloorPCA] = useState<'upper' | 'lower' | 'both' | null>(null)
  const [bufferFTE, setBufferFTE] = useState<number>(1.0) // For therapist ranks
  const [availableSlots, setAvailableSlots] = useState<number[]>([]) // For PCA rank
  const [specialty, setSpecialty] = useState<string | null>(null)
  const [isRbipSupervisor, setIsRbipSupervisor] = useState(false)

  const isEditMode = !!staffToEdit

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setName('')
      setRank('PCA')
      setTeam(null)
      setSpecialProgram([])
      setFloating(false)
      setFloorPCA(null)
      setBufferFTE(1.0)
      setAvailableSlots([])
      setSpecialty(null)
      setIsRbipSupervisor(false)
    }
  }, [open])

  // Populate form when editing
  useEffect(() => {
    if (!open) return
    if (!staffToEdit) return

    setName(staffToEdit.name ?? '')
    setRank(staffToEdit.rank ?? 'PCA')
    setTeam((staffToEdit.team as Team | null) ?? null)
    setSpecialProgram((staffToEdit.special_program as StaffSpecialProgram[] | null) ?? [])
    setFloating(!!staffToEdit.floating)

    // floor_pca stored as array ['upper'] | ['lower'] | ['upper','lower']
    const floor = staffToEdit.floor_pca ?? null
    if (Array.isArray(floor) && floor.length > 0) {
      const hasUpper = floor.includes('upper')
      const hasLower = floor.includes('lower')
      setFloorPCA(hasUpper && hasLower ? 'both' : hasUpper ? 'upper' : hasLower ? 'lower' : null)
    } else {
      setFloorPCA(null)
    }

    const rawBufferFte = (staffToEdit as any).buffer_fte
    const parsed = typeof rawBufferFte === 'number' ? rawBufferFte : rawBufferFte != null ? parseFloat(String(rawBufferFte)) : NaN
    const bufferFte = Number.isFinite(parsed) ? parsed : 1.0
    setBufferFTE(bufferFte)

    // For PCA rank, seed slots from initialAvailableSlots (best), else from buffer_fte, else whole-day.
    if ((staffToEdit.rank as StaffRank) === 'PCA') {
      if (Array.isArray(initialAvailableSlots) && initialAvailableSlots.length > 0) {
        setAvailableSlots([...initialAvailableSlots].sort((a, b) => a - b))
      } else if (Number.isFinite(bufferFte) && bufferFte > 0) {
        const numSlots = Math.max(0, Math.min(4, Math.round(bufferFte / 0.25)))
        setAvailableSlots([1, 2, 3, 4].slice(0, numSlots))
      } else {
        setAvailableSlots([1, 2, 3, 4])
      }
    }
  }, [open, staffToEdit, initialAvailableSlots])

  // Reset floor PCA and slots when rank changes
  useEffect(() => {
    if (rank !== 'PCA') {
      setFloorPCA(null)
      setFloating(false)
      setAvailableSlots([])
    } else {
      // Default to all slots for PCA
      setAvailableSlots([1, 2, 3, 4])
    }
  }, [rank])

  // Enforce: non-floating buffer PCA must be whole-day (all 4 slots)
  useEffect(() => {
    if (rank !== 'PCA') return
    if (!floating) {
      setAvailableSlots([1, 2, 3, 4])
    }
  }, [rank, floating])

  // Get available special program names
  const availableProgramNames = specialPrograms.map((p) => p.name as StaffSpecialProgram).sort()

  // Calculate buffer_fte for PCA from selected slots
  const calculatePCAFTE = (slots: number[]): number => {
    return slots.length * 0.25
  }

  const handleSlotToggle = (slot: number) => {
    // Non-floating buffer PCA is always whole-day; don't allow changing slots.
    if (rank === 'PCA' && !floating) return
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

    // Validate required fields
    if (!name.trim()) {
      toast.warning('Staff name is required')
      return
    }

    if (rank === 'PCA' && floorPCA === null) {
      toast.warning('Floor PCA is required for PCA staff')
      return
    }

    if (rank === 'PCA' && availableSlots.length === 0) {
      toast.warning('At least one slot must be selected for PCA staff')
      return
    }

    // Buffer non-floating PCA: must be full-day only (whole-day substitute intent).
    if (rank === 'PCA' && !floating && availableSlots.length !== 4) {
      toast.warning('Non-floating buffer PCA must be whole day (all 4 slots).')
      return
    }

    // Convert floor_pca to array format
    let floorPCAArray: ('upper' | 'lower')[] | null = null
    if (rank === 'PCA' && floorPCA) {
      if (floorPCA === 'both') {
        floorPCAArray = ['upper', 'lower']
      } else {
        floorPCAArray = [floorPCA]
      }
    }

    // Calculate buffer_fte
    let finalBufferFTE: number | null = null
    if (rank === 'PCA') {
      finalBufferFTE = calculatePCAFTE(availableSlots)
    } else {
      finalBufferFTE = bufferFTE
    }

    // If this buffer staff is being created specifically to cover a special program,
    // ensure the buffer has enough FTE to cover the required special-program cost.
    if (typeof minRequiredFTE === 'number' && minRequiredFTE > 0) {
      const effective = finalBufferFTE ?? 0
      if (effective < minRequiredFTE) {
        toast.warning(
          'Insufficient FTE for special program.',
          `Required: ${minRequiredFTE.toFixed(2)} • This buffer staff: ${effective.toFixed(2)}`
        )
        return
      }
    }

    // Prepare staff data
    const staffData: Partial<Staff> = {
      name: name.trim(),
      rank,
      team: rank === 'PCA' && floating ? null : team,
      special_program: specialProgram.length > 0 ? specialProgram : null,
      floating: rank === 'PCA' ? floating : false,
      floor_pca: floorPCAArray,
      status: 'buffer' as StaffStatus,
      buffer_fte: finalBufferFTE,
    }

    try {
      let newStaff: any = null
      let staffError: any = null

      if (isEditMode && staffToEdit?.id) {
        ;({ data: newStaff, error: staffError } = await supabase
          .from('staff')
          .update(staffData)
          .eq('id', staffToEdit.id)
          .select()
          .single())
      } else {
        // Insert new staff - try with buffer_fte first
        ;({ data: newStaff, error: staffError } = await supabase
          .from('staff')
          .insert(staffData)
          .select()
          .single())
      }

      // If buffer_fte or status column doesn't exist, show helpful error message
      if (staffError && (staffError.code === 'PGRST204' || staffError.message?.includes('buffer_fte') || staffError.message?.includes('status'))) {
        const missingColumn = staffError.message?.includes('buffer_fte') ? 'buffer_fte' : 
                             staffError.message?.includes('status') ? 'status' : 'required column'
        toast.error(
          'Database migration required.',
          `Missing column: ${missingColumn}. Run supabase/migrations/add_buffer_staff_system.sql in Supabase SQL Editor.`
        )
        return
      }

      if (staffError) {
        throw staffError
      }

      // Create SPT allocation if needed (create mode only)
      if (!isEditMode && rank === 'SPT' && (specialty || isRbipSupervisor)) {
        const { error: sptError } = await supabase.from('spt_allocations').insert({
          staff_id: newStaff.id,
          specialty: specialty ?? null,
          is_rbip_supervisor: isRbipSupervisor ?? false,
          teams: [],
          weekdays: [],
          slots: {},
          fte_addon: 0,
          substitute_team_head: false,
          active: true,
        })
        if (sptError) throw sptError
      }

      onSave(newStaff as Staff, {
        availableSlots: rank === 'PCA' ? availableSlots : undefined,
        bufferFTE: finalBufferFTE,
      })
      onOpenChange(false)
    } catch (err) {
      console.error(isEditMode ? 'Error updating buffer staff:' : 'Error creating buffer staff:', err)
      toast.error(isEditMode ? 'Failed to update buffer staff. Please try again.' : 'Failed to create buffer staff. Please try again.')
    }
  }

  const isTeamRequired = () => {
    if (rank === 'SPT') return false
    if (['APPT', 'RPT'].includes(rank)) return true
    if (rank === 'PCA' && !floating) return true
    return false
  }

  const pcaFTE = calculatePCAFTE(availableSlots)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isEditMode ? 'Edit Buffer Staff' : 'Create Buffer Staff'}</DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 hover:bg-accent rounded"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          {typeof minRequiredFTE === 'number' && minRequiredFTE > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              <p className="font-medium mb-1">Special program requirement</p>
              <p>This buffer staff must have FTE ≥ {minRequiredFTE.toFixed(2)}.</p>
            </div>
          )}
          {/* Staff Name */}
          <div>
            <Label htmlFor="name">
              Staff Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          {/* Rank */}
          <div>
            <Label htmlFor="rank">
              Rank <span className="text-destructive">*</span>
            </Label>
            <select
              id="rank"
              value={rank}
              onChange={(e) => setRank(e.target.value as StaffRank)}
              required
              className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
            {rank === 'PCA' && (
              <p className="text-xs text-muted-foreground mt-1">
                {floating ? 'Floating PCA does not require a team assignment.' : 'Non-floating PCA requires a team assignment.'}
              </p>
            )}
            {rank === 'SPT' && (
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
          {['SPT', 'APPT', 'RPT'].includes(rank) && (
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
          {rank === 'PCA' && (
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
                <div className="flex gap-2 mt-2">
                  {[
                    { slot: 1, time: '0900-1030' },
                    { slot: 2, time: '1030-1200' },
                    { slot: 3, time: '1330-1500' },
                    { slot: 4, time: '1500-1630' },
                  ].map(({ slot, time }) => (
                    <Button
                      key={slot}
                      type="button"
                      onClick={() => handleSlotToggle(slot)}
                      disabled={!floating}
                      className={cn(
                        'px-3 py-2 rounded text-sm font-medium',
                        availableSlots.includes(slot)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                        !floating && 'opacity-60 cursor-not-allowed hover:bg-gray-100'
                      )}
                    >
                      {time}
                    </Button>
                  ))}
                </div>
                {availableSlots.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Selected: {availableSlots.length} slot(s) = {pcaFTE.toFixed(2)} FTE
                  </p>
                )}
              </div>
            </div>
          )}

          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEditMode ? 'Save Changes' : 'Create Buffer Staff'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
