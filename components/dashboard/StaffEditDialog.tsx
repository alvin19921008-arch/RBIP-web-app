'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Staff, StaffRank, Team, StaffStatus, SpecialProgram as StaffSpecialProgram } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useToast } from '@/components/ui/toast-provider'

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
  const toast = useToast()

  const [name, setName] = useState(staff.name || '')
  const [rank, setRank] = useState<StaffRank>(staff.rank || 'PCA')
  const [team, setTeam] = useState<Team | null>(staff.team || null)
  const [specialProgram, setSpecialProgram] = useState<StaffSpecialProgram[]>(staff.special_program || [])
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
  const [status, setStatus] = useState<StaffStatus>((staff.status ?? 'active') as StaffStatus)
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

  // Reset floor PCA and team when rank changes
  useEffect(() => {
    if (rank !== 'PCA') {
      setFloorPCA(null)
      setFloating(false)
    }
  }, [rank])

  // Clear team when switching to floating (PCA)
  useEffect(() => {
    if (rank === 'PCA' && floating) {
      setTeam(null)
    }
  }, [rank, floating])

  const availableProgramNames = specialPrograms.map((p) => p.name as StaffSpecialProgram).sort()

  const isTeamRequired = () => {
    if (rank === 'SPT') return false
    if (['APPT', 'RPT'].includes(rank)) return true
    if (rank === 'PCA' && !floating) return true
    return false
  }

  const isFloorPCARequired = () => rank === 'PCA' && floating

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.warning('Staff name is required')
      return
    }

    if (isTeamRequired() && !team) {
      toast.warning('Team is required for this staff type')
      return
    }

    if (isFloorPCARequired() && floorPCA === null) {
      toast.warning('Floor PCA is required for floating PCA')
      return
    }

    let floorPCAArray: ('upper' | 'lower')[] | null = null
    if (rank === 'PCA' && floorPCA) {
      floorPCAArray = floorPCA === 'both' ? ['upper', 'lower'] : [floorPCA]
    }

    const staffData: Partial<Staff> & { isRbipSupervisor?: boolean; specialty?: string | null } = {
      name: name.trim(),
      rank,
      team: isTeamRequired() ? (team as Team) : rank === 'PCA' && floating ? null : team,
      special_program: specialProgram.length > 0 ? specialProgram : null,
      floating: rank === 'PCA' ? floating : false,
      floor_pca: floorPCAArray,
      status,
    }

    if (rank === 'SPT') {
      staffData.isRbipSupervisor = isRbipSupervisor
      staffData.specialty = specialty === 'nil' ? null : specialty
    }

    onSave(staffData)
  }

  const renderTeamField = (showHelperText = true) => (
    <div>
      <Label>
        Team {isTeamRequired() && <span className="text-destructive">*</span>}
      </Label>
      <Select
        value={team ?? '__none__'}
        onValueChange={(v) => setTeam(v === '__none__' ? null : (v as Team))}
      >
        <SelectTrigger className="mt-1">
          <SelectValue placeholder="-- Select Team --" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">-- Select Team --</SelectItem>
          {TEAMS.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showHelperText && rank === 'SPT' && (
        <p className="text-xs text-muted-foreground mt-1">
          Optional. Can be configured in SPT Allocations.
        </p>
      )}
    </div>
  )

  const renderSpecialProgramField = () => (
    <div>
      <Label>Special Program</Label>
      <div className="space-y-2 mt-1 p-2 rounded-md max-h-40 overflow-y-auto">
        {availableProgramNames.length > 0 ? (
          availableProgramNames.map((prog) => (
            <label key={prog} className="flex items-center gap-2 cursor-pointer hover:bg-accent/50 p-1 rounded">
              <input
                type="checkbox"
                checked={specialProgram.includes(prog)}
                onChange={(e) => {
                  if (e.target.checked) setSpecialProgram([...specialProgram, prog])
                  else setSpecialProgram(specialProgram.filter((p) => p !== prog))
                }}
                className="h-4 w-4"
              />
              <span className="text-sm">{prog}</span>
            </label>
          ))
        ) : (
          <p className="text-xs text-muted-foreground py-2">No special programs available</p>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isNew ? 'Add New Staff' : 'Edit Staff'}</DialogTitle>
            <button onClick={onCancel} className="p-1 hover:bg-accent rounded" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name & Rank */}
          <div className="space-y-4">
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

            <div>
              <Label>Rank <span className="text-destructive">*</span></Label>
              <Select value={rank} onValueChange={(v) => setRank(v as StaffRank)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANKS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* PCA Configuration */}
          {rank === 'PCA' && (
            <>
              <hr className="border-border" />
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                PCA configuration
              </h4>
              <div className="space-y-4">
                <div>
                  <Label>Assignment type <span className="text-destructive">*</span></Label>
                  <Select
                    value={floating ? 'floating' : 'non-floating'}
                    onValueChange={(v) => setFloating(v === 'floating')}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="non-floating">Non-floating</SelectItem>
                      <SelectItem value="floating">Floating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!floating && renderTeamField(false)}

                <div>
                  <Label>
                    Floor PCA
                    {isFloorPCARequired() && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={floorPCA ?? '__none__'}
                    onValueChange={(v) => setFloorPCA(v === '__none__' ? null : (v as 'upper' | 'lower' | 'both'))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="-- Select --" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Select --</SelectItem>
                      <SelectItem value="upper">Upper</SelectItem>
                      <SelectItem value="lower">Lower</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                  {!floating && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Optional for non-floating PCA.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* SPT Configuration */}
          {rank === 'SPT' && (
            <>
              <hr className="border-border" />
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                SPT configuration
              </h4>
              <div className="space-y-4">
                {loadingSPTData ? (
                  <p className="text-sm text-muted-foreground">Loading SPT data...</p>
                ) : (
                  <>
                    <div>
                      <Label>Specialty</Label>
                      <Select
                        value={specialty ?? 'nil'}
                        onValueChange={(v) => setSpecialty(v === 'nil' ? null : v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="-- None --" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nil">-- None --</SelectItem>
                          {SPECIALTY_OPTIONS.filter((o) => o !== 'nil').map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isRbipSupervisor"
                        checked={isRbipSupervisor}
                        onChange={(e) => setIsRbipSupervisor(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="isRbipSupervisor" className="font-normal cursor-pointer">
                        RBIP Supervisor (can substitute team heads when needed)
                      </Label>
                    </div>

                    {renderTeamField(true)}
                    {renderSpecialProgramField()}
                  </>
                )}
              </div>
            </>
          )}

          {/* Therapist / workman: Team & Special Program */}
          {['APPT', 'RPT', 'workman'].includes(rank) && (
            <>
              <hr className="border-border" />
              <div className="space-y-4">
                {renderTeamField(false)}
                {renderSpecialProgramField()}
              </div>
            </>
          )}

          {/* Special Program for PCA (only section if PCA - SPT/therapist already have it above) */}
          {rank === 'PCA' && (
            <>
              <hr className="border-border" />
              {renderSpecialProgramField()}
            </>
          )}

          {/* Status */}
          <hr className="border-border" />
          <div>
            <Label className="mb-2 block">Status</Label>
            <div className="flex flex-wrap gap-2">
              {(['active', 'inactive', 'buffer'] as const).map((s) => {
                const selected = status === s
                const badgeClass = selected
                  ? s === 'active'
                    ? 'bg-green-500 hover:bg-green-600 text-white border-transparent'
                    : s === 'inactive'
                      ? 'bg-gray-400 hover:bg-gray-500 text-white border-transparent'
                      : 'bg-[#a4b1ed] hover:bg-[#8b9ae8] text-white border-transparent'
                  : 'border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
                      badgeClass
                    )}
                  >
                    {s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : 'Buffer'}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Active: staff appears in allocations and schedule. Inactive: hidden from allocations. Buffer: temporary staff with custom FTE.
            </p>
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
