'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Staff, StaffRank, Team, StaffStatus } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { X, Info } from 'lucide-react'

const RANKS: StaffRank[] = ['SPT', 'APPT', 'RPT', 'PCA']
const SPECIALTY_OPTIONS = ['MSK/Ortho', 'Cardiac', 'Neuro', 'Cancer', 'nil']

interface BufferStaffCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
  specialPrograms?: SpecialProgram[]
}

export function BufferStaffCreateDialog({ 
  open, 
  onOpenChange, 
  onSave,
  specialPrograms = []
}: BufferStaffCreateDialogProps) {
  const supabase = createClientComponentClient()

  const [name, setName] = useState('')
  const [rank, setRank] = useState<StaffRank>('PCA')
  const [team, setTeam] = useState<Team | null>(null)
  const [specialProgram, setSpecialProgram] = useState<string[]>([])
  const [floating, setFloating] = useState<boolean>(false)
  const [floorPCA, setFloorPCA] = useState<'upper' | 'lower' | 'both' | null>(null)
  const [bufferFTE, setBufferFTE] = useState<number>(1.0) // For therapist ranks
  const [availableSlots, setAvailableSlots] = useState<number[]>([]) // For PCA rank
  const [specialty, setSpecialty] = useState<string | null>(null)
  const [isRbipSupervisor, setIsRbipSupervisor] = useState(false)

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

  // Get available special program names
  const availableProgramNames = specialPrograms.map((p) => p.name).sort()

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

    // Validate required fields
    if (!name.trim()) {
      alert('Staff name is required')
      return
    }

    if (rank === 'PCA' && floorPCA === null) {
      alert('Floor PCA is required for PCA staff')
      return
    }

    if (rank === 'PCA' && availableSlots.length === 0) {
      alert('At least one slot must be selected for PCA staff')
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
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:138',message:'handleSubmit: Starting staff creation',data:{staffData:JSON.stringify(staffData),rank},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Insert new staff - try with buffer_fte first
      let { data: newStaff, error: staffError } = await supabase
        .from('staff')
        .insert(staffData)
        .select()
        .single()

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:145',message:'handleSubmit: Staff insert result',data:{hasData:!!newStaff,error:staffError?.message,errorCode:staffError?.code,errorDetails:staffError?.details},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // If buffer_fte or status column doesn't exist, show helpful error message
      if (staffError && (staffError.code === 'PGRST204' || staffError.message?.includes('buffer_fte') || staffError.message?.includes('status'))) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:150',message:'handleSubmit: Database column missing',data:{errorMessage:staffError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const missingColumn = staffError.message?.includes('buffer_fte') ? 'buffer_fte' : 
                             staffError.message?.includes('status') ? 'status' : 'required column'
        alert(`Database migration required: The ${missingColumn} column is missing. Please run the migration file: supabase/migrations/add_buffer_staff_system.sql in your Supabase SQL Editor.`)
        return
      }

      if (staffError) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:158',message:'handleSubmit: Staff insert error details',data:{message:staffError.message,code:staffError.code,details:staffError.details,hint:staffError.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        throw staffError
      }

      // Create SPT allocation if needed
      if (rank === 'SPT' && (specialty || isRbipSupervisor)) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:155',message:'handleSubmit: Creating SPT allocation',data:{staffId:newStaff.id,specialty,isRbipSupervisor},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
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
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:167',message:'handleSubmit: SPT allocation result',data:{error:sptError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (sptError) throw sptError
      }

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:172',message:'handleSubmit: Success',data:{staffId:newStaff.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      onSave()
      onOpenChange(false)
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BufferStaffCreateDialog.tsx:178',message:'handleSubmit: Catch block error',data:{error:err instanceof Error ? err.message : String(err),stack:err instanceof Error ? err.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error('Error creating buffer staff:', err)
      alert('Failed to create buffer staff. Please try again.')
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Create Buffer Staff</DialogTitle>
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
            </div>
          )}


          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Buffer Staff</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
