'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Staff, StaffRank, Team } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { X } from 'lucide-react'

const RANKS: StaffRank[] = ['SPT', 'APPT', 'RPT', 'PCA', 'workman']
const SPECIALTY_OPTIONS = ['MSK/Ortho', 'Cardiac', 'Neuro', 'Cancer', 'nil']

interface StaffEditDialogProps {
  staff: Staff | Partial<Staff>
  specialPrograms: SpecialProgram[]
  onSave: (staffData: Partial<Staff> & { isRbipSupervisor?: boolean; specialty?: string | null }) => void
  onCancel: () => void
}

export function StaffEditDialog({ staff, specialPrograms, onSave, onCancel }: StaffEditDialogProps) {
  const isNew = !staff.id
  const supabase = createClientComponentClient()

  const [name, setName] = useState(staff.name || '')
  const [rank, setRank] = useState<StaffRank>(staff.rank || 'PCA')
  const [team, setTeam] = useState<Team | null>(staff.team || null)
  const [specialProgram, setSpecialProgram] = useState<string[]>(staff.special_program || [])
  const [floating, setFloating] = useState<boolean>(staff.floating ?? false)
  const [floorPCA, setFloorPCA] = useState<'upper' | 'lower' | 'both' | null>(() => {
    if (staff.rank !== 'PCA' || !staff.floor_pca || staff.floor_pca.length === 0) return null
    if (staff.floor_pca.includes('upper') && staff.floor_pca.includes('lower')) return 'both'
    if (staff.floor_pca.includes('upper')) return 'upper'
    if (staff.floor_pca.includes('lower')) return 'lower'
    return null
  })
  const [specialty, setSpecialty] = useState<string | null>(null)
  const [isRbipSupervisor, setIsRbipSupervisor] = useState(false)
  const [active, setActive] = useState(staff.active ?? true)
  const [loadingSPTData, setLoadingSPTData] = useState(false)

  // Load SPT allocation data if editing existing SPT staff
  useEffect(() => {
    const loadSPTData = async () => {
      if (!staff.id || rank !== 'SPT') return

      setLoadingSPTData(true)
      try {
        const { data } = await supabase
          .from('spt_allocations')
          .select('specialty, is_rbip_supervisor')
          .eq('staff_id', staff.id)
          .maybeSingle()

        if (data) {
          setSpecialty(data.specialty || null)
          setIsRbipSupervisor(data.is_rbip_supervisor || false)
        }
      } catch (err) {
        console.error('Error loading SPT data:', err)
      } finally {
        setLoadingSPTData(false)
      }
    }

    loadSPTData()
  }, [staff.id, rank, supabase])

  // Reset floor PCA when rank changes
  useEffect(() => {
    if (rank !== 'PCA') {
      setFloorPCA(null)
      setFloating(false)
    }
  }, [rank])

  // Get available special program names from specialPrograms prop
  const availableProgramNames = specialPrograms.map((p) => p.name).sort()

  // Validation
  const isTeamRequired = () => {
    if (rank === 'SPT') return false // SPT doesn't require team
    if (['APPT', 'RPT'].includes(rank)) return true // Therapists require team
    if (rank === 'PCA' && !floating) return true // Non-floating PCA requires team
    return false
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    if (!name.trim()) {
      alert('Staff name is required')
      return
    }

    if (isTeamRequired() && !team) {
      alert('Team is required for this staff type')
      return
    }

    if (rank === 'PCA' && floorPCA === null) {
      alert('Floor PCA is required for PCA staff')
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

    const staffData: Partial<Staff> & { isRbipSupervisor?: boolean; specialty?: string | null } = {
      name: name.trim(),
      rank,
      team: isTeamRequired() ? (team as Team) : (rank === 'PCA' && floating ? null : team),
      special_program: specialProgram.length > 0 ? specialProgram : null,
      floating: rank === 'PCA' ? floating : false,
      floor_pca: floorPCAArray,
      active,
    }

    if (rank === 'SPT') {
      staffData.isRbipSupervisor = isRbipSupervisor
      staffData.specialty = specialty === 'nil' ? null : specialty
    }

    onSave(staffData)
  }

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isNew ? 'Add New Staff' : 'Edit Staff'}</DialogTitle>
            <button
              onClick={onCancel}
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
            <p className="text-xs text-muted-foreground mb-2">
              ℹ️ Go to Special Programs dashboard for detailed configuration.
            </p>
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
            </div>
          )}

          {/* SPT Properties */}
          {rank === 'SPT' && (
            <>
              <div>
                <Label>SPT basic configure</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  ℹ️ Go to SPT allocation dashboard for detailed configuration.
                </p>
              </div>
              <div className="space-y-4 border p-4 rounded-md">
                {loadingSPTData ? (
                  <p className="text-sm text-muted-foreground">Loading SPT data...</p>
                ) : (
                  <>
                    <div className="flex items-center space-x-3">
                      <Label htmlFor="specialty" className="whitespace-nowrap">Specialty</Label>
                      <select
                        id="specialty"
                        value={specialty || 'nil'}
                        onChange={(e) => setSpecialty(e.target.value === 'nil' ? null : e.target.value)}
                        className="flex-1 h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                      >
                        <option value="nil">-- None --</option>
                        {SPECIALTY_OPTIONS.filter((opt) => opt !== 'nil').map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isRbipSupervisor"
                        checked={isRbipSupervisor}
                        onChange={(e) => setIsRbipSupervisor(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="isRbipSupervisor" className="font-normal cursor-pointer">
                        RBIP Overall Supervisor (can substitute for team heads when needed)
                      </Label>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Active */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="active" className="font-normal cursor-pointer">
              Active (staff will appear in team allocations and schedule page)
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
