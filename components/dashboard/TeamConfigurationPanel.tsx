'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Staff, Team } from '@/types/staff'
import { Ward } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { Checkbox } from '@/components/ui/checkbox'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast-provider'

interface TeamSettings {
  team: Team
  display_name: string
}

interface PortionPopoverState {
  wardId: string
  wardName: string
  totalBeds: number
  currentBeds: number
  currentPortion: string | null
}

// Helper to compute fraction from numeric values
function computeFractionFromBeds(teamBeds: number, totalBeds: number): string | null {
  if (teamBeds === totalBeds || teamBeds === 0) return null
  
  const fraction = teamBeds / totalBeds
  const knownFractions = [
    { num: 1, den: 2, value: 0.5 },
    { num: 1, den: 3, value: 1/3 },
    { num: 2, den: 3, value: 2/3 },
    { num: 3, den: 4, value: 0.75 }
  ]
  
  for (const f of knownFractions) {
    if (Math.abs(fraction - f.value) < 0.01) {
      return `${f.num}/${f.den}`
    }
  }
  return null
}

// Helper to format ward label with portion
function formatWardLabel(ward: Ward, team: Team, editPortions?: Record<string, string | null>, editBeds?: Record<string, number>): string {
  // Use editPortions if provided (for edit mode)
  const portion = editPortions ? editPortions[ward.id] : ward.team_assignment_portions?.[team]
  if (portion) {
    return `${portion} ${ward.name}`
  }
  
  // Use editBeds if provided (for edit mode), otherwise use ward.team_assignments
  const teamBeds = editBeds ? (editBeds[ward.id] ?? ward.team_assignments[team] ?? 0) : (ward.team_assignments[team] || 0)
  if (teamBeds < ward.total_beds && teamBeds > 0) {
    const computedFraction = computeFractionFromBeds(teamBeds, ward.total_beds)
    if (computedFraction) {
      return `${computedFraction} ${ward.name}`
    }
  }
  
  return ward.name
}

export function TeamConfigurationPanel() {
  const [teamSettings, setTeamSettings] = useState<Record<Team, TeamSettings>>({} as Record<Team, TeamSettings>)
  const [staff, setStaff] = useState<Staff[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [loading, setLoading] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [saving, setSaving] = useState(false)
  const [portionPopover, setPortionPopover] = useState<PortionPopoverState | null>(null)
  const supabase = createClientComponentClient()
  const toast = useToast()

  // Edit state for current team
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editSelectedAPPT, setEditSelectedAPPT] = useState<Set<string>>(new Set())
  const [editSelectedRPT, setEditSelectedRPT] = useState<Set<string>>(new Set())
  const [editSelectedPCA, setEditSelectedPCA] = useState<Set<string>>(new Set())
  const [editRemovedAPPT, setEditRemovedAPPT] = useState<Set<string>>(new Set())
  const [editRemovedRPT, setEditRemovedRPT] = useState<Set<string>>(new Set())
  const [editRemovedPCA, setEditRemovedPCA] = useState<Set<string>>(new Set())
  const [editSelectedWards, setEditSelectedWards] = useState<Set<string>>(new Set())
  const [editWardBeds, setEditWardBeds] = useState<Record<string, number>>({})
  const [editWardPortions, setEditWardPortions] = useState<Record<string, string | null>>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [settingsRes, staffRes, wardsRes] = await Promise.all([
        supabase.from('team_settings').select('*'),
        supabase.from('staff').select('*').order('name'),
        supabase.from('wards').select('*').order('name'),
      ])

      if (settingsRes.data) {
        const settingsMap: Record<Team, TeamSettings> = {} as Record<Team, TeamSettings>
        settingsRes.data.forEach((s: any) => {
          settingsMap[s.team as Team] = {
            team: s.team,
            display_name: s.display_name,
          }
        })
        // Ensure all teams have settings
        TEAMS.forEach(team => {
          if (!settingsMap[team]) {
            settingsMap[team] = { team, display_name: team }
          }
        })
        setTeamSettings(settingsMap)
      }

      if (staffRes.data) {
        setStaff(staffRes.data as Staff[])
      }

      if (wardsRes.data) {
        const wardsData = (wardsRes.data as any[]).map(w => ({
          id: w.id,
          name: w.name,
          total_beds: w.total_beds,
          team_assignments: w.team_assignments || {},
          team_assignment_portions: w.team_assignment_portions || {},
        }))
        setWards(wardsData)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team)
    const settings = teamSettings[team]
    setEditDisplayName(settings?.display_name || team)

    // Clear selections for new unassigned staff
    setEditSelectedAPPT(new Set())
    setEditSelectedRPT(new Set())
    setEditSelectedPCA(new Set())
    setEditRemovedAPPT(new Set())
    setEditRemovedRPT(new Set())
    setEditRemovedPCA(new Set())

    // Load current ward assignments
    const selectedWardsSet = new Set<string>()
    const wardBedsMap: Record<string, number> = {}
    const wardPortionsMap: Record<string, string | null> = {}
    
    wards.forEach(ward => {
      const teamBeds = ward.team_assignments[team] || 0
      if (teamBeds > 0) {
        selectedWardsSet.add(ward.id)
        wardBedsMap[ward.id] = teamBeds
        wardPortionsMap[ward.id] = ward.team_assignment_portions?.[team] || null
      }
    })
    
    setEditSelectedWards(selectedWardsSet)
    setEditWardBeds(wardBedsMap)
    setEditWardPortions(wardPortionsMap)
  }

  const handleCancelEdit = () => {
    setEditingTeam(null)
    setPortionPopover(null)
  }

  const handleSave = async () => {
    if (!editingTeam) return

    setSaving(true)
    try {
      // Validate ward over-allocation
      const wardTotals: Record<string, number> = {}
      wards.forEach(ward => {
        let sum = 0
        TEAMS.forEach(team => {
          if (team === editingTeam) {
            sum += editWardBeds[ward.id] || 0
          } else {
            sum += ward.team_assignments[team] || 0
          }
        })
        wardTotals[ward.id] = sum
      })

      const overAllocatedWards = wards.filter(ward => {
        const total = wardTotals[ward.id] || 0
        return total > ward.total_beds
      })

      if (overAllocatedWards.length > 0) {
        const details = overAllocatedWards
          .map(w => `${w.name}: ${wardTotals[w.id]} / ${w.total_beds}`)
          .join(' • ')
        toast.warning('Cannot save: ward bed over-allocation.', details)
        setSaving(false)
        return
      }

      // Save team settings
      await supabase
        .from('team_settings')
        .upsert({
          team: editingTeam,
          display_name: editDisplayName,
          updated_at: new Date().toISOString(),
        })

      // Update staff assignments
      // Remove existing APPT members that were unchecked
      for (const staffId of editRemovedAPPT) {
        await supabase
          .from('staff')
          .update({ team: null })
          .eq('id', staffId)
      }

      // Assign new unassigned APPT staff to the team
      for (const staffId of editSelectedAPPT) {
          await supabase
            .from('staff')
            .update({ team: editingTeam })
          .eq('id', staffId)
      }

      // Remove existing RPT members that were unchecked
      for (const staffId of editRemovedRPT) {
          await supabase
            .from('staff')
            .update({ team: null })
          .eq('id', staffId)
      }

      // Assign new unassigned RPT staff to the team
      for (const staffId of editSelectedRPT) {
          await supabase
            .from('staff')
            .update({ team: editingTeam })
          .eq('id', staffId)
      }

      // Remove existing PCA members that were unchecked
      for (const staffId of editRemovedPCA) {
          await supabase
            .from('staff')
          .update({ team: null, floating: true })
          .eq('id', staffId)
      }

      // Assign new unassigned PCA staff to the team
      for (const staffId of editSelectedPCA) {
          await supabase
            .from('staff')
            .update({ team: editingTeam, floating: false })
          .eq('id', staffId)
      }

      // Update ward assignments
      for (const ward of wards) {
        const isSelected = editSelectedWards.has(ward.id)
        const currentBeds = ward.team_assignments[editingTeam] || 0
        const newBeds = editWardBeds[ward.id] || 0
        const newPortion = editWardPortions[ward.id] || null

        if (isSelected) {
          // Update team_assignments
          const updatedAssignments = { ...ward.team_assignments }
          updatedAssignments[editingTeam] = newBeds
          
          // Update team_assignment_portions
          const updatedPortions = { ...(ward.team_assignment_portions || {}) }
          if (newPortion) {
            updatedPortions[editingTeam] = newPortion
          } else {
            delete updatedPortions[editingTeam]
          }

          await supabase
            .from('wards')
            .update({
              team_assignments: updatedAssignments,
              team_assignment_portions: updatedPortions,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ward.id)
        } else if (currentBeds > 0) {
          // Remove team assignment
          const updatedAssignments = { ...ward.team_assignments }
          updatedAssignments[editingTeam] = 0
          
          const updatedPortions = { ...(ward.team_assignment_portions || {}) }
          delete updatedPortions[editingTeam]

          await supabase
            .from('wards')
            .update({
              team_assignments: updatedAssignments,
              team_assignment_portions: updatedPortions,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ward.id)
        }
      }

      await loadData()
      setEditingTeam(null)
      setPortionPopover(null)
      toast.success('Team configuration saved.')
    } catch (err) {
      console.error('Error saving team configuration:', err)
      toast.error('Error saving team configuration.', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleWardToggle = (wardId: string) => {
    const ward = wards.find(w => w.id === wardId)
    if (!ward) return

    const newSelected = new Set(editSelectedWards)
    if (newSelected.has(wardId)) {
      newSelected.delete(wardId)
      const newBeds = { ...editWardBeds }
      const newPortions = { ...editWardPortions }
      delete newBeds[wardId]
      delete newPortions[wardId]
      setEditWardBeds(newBeds)
      setEditWardPortions(newPortions)
    } else {
      newSelected.add(wardId)
      const newBeds = { ...editWardBeds }
      newBeds[wardId] = ward.total_beds // Default to full ward
      setEditWardBeds(newBeds)
    }
    setEditSelectedWards(newSelected)
  }

  const handlePortionClick = (wardId: string) => {
    const ward = wards.find(w => w.id === wardId)
    if (!ward || !editingTeam) return

    const currentBeds = editWardBeds[wardId] || ward.team_assignments[editingTeam] || 0
    const currentPortion = editWardPortions[wardId] || ward.team_assignment_portions?.[editingTeam] || null

    setPortionPopover({
      wardId,
      wardName: ward.name,
      totalBeds: ward.total_beds,
      currentBeds,
      currentPortion,
    })
  }

  const handlePortionSave = (portion: string | null, actualBeds: number) => {
    if (!portionPopover) return

    const newBeds = { ...editWardBeds }
    const newPortions = { ...editWardPortions }
    
    newBeds[portionPopover.wardId] = actualBeds
    if (portion) {
      newPortions[portionPopover.wardId] = portion
    } else {
      delete newPortions[portionPopover.wardId]
    }

    setEditWardBeds(newBeds)
    setEditWardPortions(newPortions)
    setPortionPopover(null)
  }

  // Get staff for a team (for preview) - only active staff
  const getTeamStaff = (team: Team, rank: 'APPT' | 'RPT' | 'PCA') => {
    if (rank === 'PCA') {
      return staff.filter(s => s.rank === 'PCA' && s.team === team && !s.floating && (s.active ?? true))
    }
    return staff.filter(s => s.rank === rank && s.team === team && (s.active ?? true))
  }

  // Get wards for a team (for preview)
  const getTeamWards = (team: Team) => {
    return wards.filter(w => (w.team_assignments[team] || 0) > 0)
  }

  // Calculate total beds for a team
  const getTotalBeds = (team: Team) => {
    return wards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
  }

  // Get selected wards total beds (for edit mode)
  const getSelectedWardsTotalBeds = () => {
    return Array.from(editSelectedWards).reduce((sum, wardId) => {
      return sum + (editWardBeds[wardId] || 0)
    }, 0)
  }

  // Get unassigned staff for a rank (team === null)
  const getUnassignedStaff = (rank: 'APPT' | 'RPT' | 'PCA') => {
    if (rank === 'PCA') {
      return staff.filter(s => s.rank === 'PCA' && s.team === null && (s.active ?? true))
    }
    return staff.filter(s => s.rank === rank && s.team === null && (s.active ?? true))
  }

  // Sort wards with selected at top
  const sortWardsWithSelectedFirst = (selectedIds: Set<string>) => {
    const selected = wards.filter(w => selectedIds.has(w.id))
    const unselected = wards.filter(w => !selectedIds.has(w.id))
    return [...selected, ...unselected]
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p>Loading...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TEAMS.map((team) => {
              const settings = teamSettings[team]
              const isEditing = editingTeam === team
              const teamAPPT = getTeamStaff(team, 'APPT')
              const teamRPT = getTeamStaff(team, 'RPT')
              const teamPCA = getTeamStaff(team, 'PCA')
              const teamWards = getTeamWards(team)
              const totalBeds = getTotalBeds(team)

              if (isEditing) {
                // Expanded edit mode - show existing team members and unassigned staff
                const currentAPPT = getTeamStaff(team, 'APPT')
                const currentRPT = getTeamStaff(team, 'RPT')
                const currentPCA = getTeamStaff(team, 'PCA')
                const unassignedAPPT = getUnassignedStaff('APPT')
                const unassignedRPT = getUnassignedStaff('RPT')
                const unassignedPCA = getUnassignedStaff('PCA')
                const sortedWards = sortWardsWithSelectedFirst(editSelectedWards)

                return (
                  <Card key={team} className="p-4 border-2 col-span-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Edit: {team}</h3>
                      <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {/* Team name */}
                      <div>
                        <Label htmlFor="team-name">Team name</Label>
                        <Input
                          id="team-name"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="mt-1"
                        />
                      </div>

                      {/* Team head (APPT) */}
                      <div>
                        <Label>Team head (APPT)</Label>
                        <div className="max-h-40 overflow-y-auto border rounded p-2 mt-1 space-y-2">
                          {/* Current team members */}
                          {currentAPPT.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Current:</p>
                              {currentAPPT.map((s) => (
                                <label key={s.id} className="flex items-center space-x-2 py-1">
                                  <Checkbox
                                    checked={!editRemovedAPPT.has(s.id)}
                                    onCheckedChange={(checked) => {
                                      setEditRemovedAPPT((prev) => {
                                        const newRemoved = new Set(prev)
                                        if (checked) {
                                          newRemoved.delete(s.id)
                                        } else {
                                          newRemoved.add(s.id)
                                        }
                                        return newRemoved
                                      })
                                    }}
                                  />
                                  <span>{s.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {/* Unassigned staff available for swapping */}
                          {unassignedAPPT.length > 0 && (
                            <div className={currentAPPT.length > 0 ? "border-t pt-2" : ""}>
                              {currentAPPT.length > 0 && (
                                <p className="text-xs font-medium text-muted-foreground mb-1">Available to assign:</p>
                              )}
                              {unassignedAPPT.map((s) => (
                            <label key={s.id} className="flex items-center space-x-2 py-1">
                              <Checkbox
                                checked={editSelectedAPPT.has(s.id)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(editSelectedAPPT)
                                  if (checked) {
                                    newSet.add(s.id)
                                  } else {
                                    newSet.delete(s.id)
                                  }
                                  setEditSelectedAPPT(newSet)
                                }}
                              />
                              <span>{s.name}</span>
                            </label>
                          ))}
                            </div>
                          )}
                          {currentAPPT.length === 0 && unassignedAPPT.length === 0 && (
                            <p className="text-sm text-muted-foreground py-2">
                              No unassigned APPT staff available. All APPT staff are already assigned to teams.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Team's RPT */}
                      <div>
                        <Label>Team's RPT</Label>
                        <div className="max-h-40 overflow-y-auto border rounded p-2 mt-1 space-y-2">
                          {/* Current team members */}
                          {currentRPT.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Current:</p>
                              {currentRPT.map((s) => (
                                <label key={s.id} className="flex items-center space-x-2 py-1">
                                  <Checkbox
                                    checked={!editRemovedRPT.has(s.id)}
                                    onCheckedChange={(checked) => {
                                      setEditRemovedRPT((prev) => {
                                        const newRemoved = new Set(prev)
                                        if (checked) {
                                          newRemoved.delete(s.id)
                                        } else {
                                          newRemoved.add(s.id)
                                        }
                                        return newRemoved
                                      })
                                    }}
                                  />
                                  <span>{s.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {/* Unassigned staff available for swapping */}
                          {unassignedRPT.length > 0 && (
                            <div className={currentRPT.length > 0 ? "border-t pt-2" : ""}>
                              {currentRPT.length > 0 && (
                                <p className="text-xs font-medium text-muted-foreground mb-1">Available to assign:</p>
                              )}
                              {unassignedRPT.map((s) => (
                            <label key={s.id} className="flex items-center space-x-2 py-1">
                              <Checkbox
                                checked={editSelectedRPT.has(s.id)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(editSelectedRPT)
                                  if (checked) {
                                    newSet.add(s.id)
                                  } else {
                                    newSet.delete(s.id)
                                  }
                                  setEditSelectedRPT(newSet)
                                }}
                              />
                              <span>{s.name}</span>
                            </label>
                          ))}
                            </div>
                          )}
                          {currentRPT.length === 0 && unassignedRPT.length === 0 && (
                            <p className="text-sm text-muted-foreground py-2">
                              No unassigned RPT staff available. All RPT staff are already assigned to teams.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Team's non-floating PCA */}
                      <div>
                        <Label>Team's non-floating PCA</Label>
                        <div className="max-h-40 overflow-y-auto border rounded p-2 mt-1 space-y-2">
                          {/* Current team members */}
                          {currentPCA.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Current:</p>
                              {currentPCA.map((s) => (
                                <label key={s.id} className="flex items-center space-x-2 py-1">
                                  <Checkbox
                                    checked={!editRemovedPCA.has(s.id)}
                                    onCheckedChange={(checked) => {
                                      setEditRemovedPCA((prev) => {
                                        const newRemoved = new Set(prev)
                                        if (checked) {
                                          newRemoved.delete(s.id)
                                        } else {
                                          newRemoved.add(s.id)
                                        }
                                        return newRemoved
                                      })
                                    }}
                                  />
                                  <span>{s.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {/* Unassigned staff available for swapping */}
                          {unassignedPCA.length > 0 && (
                            <div className={currentPCA.length > 0 ? "border-t pt-2" : ""}>
                              {currentPCA.length > 0 && (
                                <p className="text-xs font-medium text-muted-foreground mb-1">Available to assign:</p>
                              )}
                              {unassignedPCA.map((s) => (
                            <label key={s.id} className="flex items-center space-x-2 py-1">
                              <Checkbox
                                checked={editSelectedPCA.has(s.id)}
                                onCheckedChange={(checked) => {
                                      setEditSelectedPCA((prev) => {
                                        const newSet = new Set(prev)
                                  if (checked) {
                                    newSet.add(s.id)
                                  } else {
                                    newSet.delete(s.id)
                                  }
                                        return newSet
                                      })
                                }}
                              />
                              <span>{s.name}</span>
                            </label>
                          ))}
                            </div>
                          )}
                          {currentPCA.length === 0 && unassignedPCA.length === 0 && (
                            <p className="text-sm text-muted-foreground py-2">
                              No unassigned PCA staff available. All PCA staff are already assigned to teams.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Designated wards */}
                      <div>
                        <Label>Designated ward & responsible bed number</Label>
                        <div className="max-h-40 overflow-y-auto border rounded p-2 mt-1">
                          {sortedWards.map((w) => (
                            <label key={w.id} className="flex items-center space-x-2 py-1">
                              <Checkbox
                                checked={editSelectedWards.has(w.id)}
                                onCheckedChange={() => handleWardToggle(w.id)}
                              />
                              <span>{w.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Selected wards list */}
                      {editSelectedWards.size > 0 && (
                        <div className="border p-4 rounded-md space-y-2">
                          <Label>Selected wards</Label>
                          {Array.from(editSelectedWards).map((wardId) => {
                            const ward = wards.find(w => w.id === wardId)
                            if (!ward) return null
                            const wardLabel = formatWardLabel(ward, team, editWardPortions, editWardBeds)
                            const beds = editWardBeds[wardId] || ward.team_assignments[team] || 0
                            const hasPortion = editWardPortions[wardId] !== undefined ? editWardPortions[wardId] : (ward.team_assignment_portions?.[team] || null)

                            return (
                              <div key={wardId} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                                  <span className="font-medium">{wardLabel}</span>
                                <span className="text-sm text-muted-foreground">
                                    Bed counts: {beds}
                                  </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePortionClick(wardId)}
                                  className="ml-2 shrink-0"
                                >
                                  {hasPortion ? 'Edit portion' : 'Set portion'}
                                </Button>
                              </div>
                            )
                          })}
                          <div className="pt-2 border-t">
                            <span className="font-semibold">Total bed counts: {getSelectedWardsTotalBeds()}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex space-x-2">
                        <Button onClick={handleSave} disabled={saving}>
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleCancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </Card>
                )
              }

              // Collapsed preview mode
              return (
                <Card key={team} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-lg">{settings?.display_name || team}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditTeam(team)}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="space-y-1 text-sm">
                    {teamAPPT.length > 0 && (
                      <p className="text-black">
                        <span className="font-medium">Heads:</span> {teamAPPT.map(s => s.name).join(', ')}
                      </p>
                    )}
                    {teamRPT.length > 0 && (
                      <p className="text-black">
                        <span className="font-medium">RPT:</span> {teamRPT.map(s => s.name).join(', ')}
                      </p>
                    )}
                    {teamPCA.length > 0 && (
                      <p className="text-black">
                        <span className="font-medium">Non-floating PCA:</span> {teamPCA.map(s => s.name).join(', ')}
                      </p>
                    )}
                    {teamWards.length > 0 && (
                      <p className="text-black">
                        <span className="font-medium">Wards:</span>{' '}
                        {teamWards.map(w => {
                          const label = formatWardLabel(w, team)
                          const beds = w.team_assignments[team] || 0
                          return `${label} (${beds})`
                        }).join(', ')}
                      </p>
                    )}
                    <p className="text-black font-semibold">
                      Total bed counts: {totalBeds}
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Portion Popover Dialog */}
      {portionPopover && (
        <PortionPopoverDialog
          popover={portionPopover}
          onSave={handlePortionSave}
          onCancel={() => setPortionPopover(null)}
        />
      )}
    </>
  )
}

function PortionPopoverDialog({
  popover,
  onSave,
  onCancel,
}: {
  popover: PortionPopoverState
  onSave: (portion: string | null, actualBeds: number) => void
  onCancel: () => void
}) {
  const [portion, setPortion] = useState(popover.currentPortion || '')
  const [actualBeds, setActualBeds] = useState(popover.currentBeds)
  const [portionError, setPortionError] = useState<string | null>(null)
  const [actualBedsError, setActualBedsError] = useState<string | null>(null)
  const [manualOverride, setManualOverride] = useState(false)

  useEffect(() => {
    if (!manualOverride && portion) {
      // Auto-calculate beds from portion
      const match = portion.match(/^(\d+)\/(\d+)$/)
      if (match) {
        const numerator = parseInt(match[1], 10)
        const denominator = parseInt(match[2], 10)
        if (denominator > 0) {
          const calculated = Math.round((numerator / denominator) * popover.totalBeds)
          setActualBeds(calculated)
          setPortionError(null)
        }
      }
    }
  }, [portion, popover.totalBeds, manualOverride])

  const handlePortionChange = (value: string) => {
    setPortion(value)
    setManualOverride(false)
    
    // Validate format
    if (value && !/^\d+\/\d+$/.test(value)) {
      setPortionError('Portion must be in format x/y (e.g., 1/3, 2/3)')
      return
    }
    
    const match = value.match(/^(\d+)\/(\d+)$/)
    if (match) {
      const denominator = parseInt(match[2], 10)
      if (denominator === 0) {
        setPortionError('Denominator cannot be zero')
        return
      }
    }
    
    setPortionError(null)
  }

  const handleActualBedsChange = (value: number) => {
    setActualBeds(value)
    setManualOverride(true)
    // Clear error when user types
    if (actualBedsError && value <= popover.totalBeds) {
      setActualBedsError(null)
    }
  }

  const handleSave = () => {
    setActualBedsError(null)
    setPortionError(null)

    // Validation
    if (portion && !/^\d+\/\d+$/.test(portion)) {
      setPortionError('Portion must be in format x/y (e.g., 1/3, 2/3)')
      return
    }

    if (portion) {
      const match = portion.match(/^(\d+)\/(\d+)$/)
      if (match) {
        const denominator = parseInt(match[2], 10)
        if (denominator === 0) {
          setPortionError('Denominator cannot be zero')
          return
        }
      }
    }

    // Validate actual beds cannot exceed total beds
    if (actualBeds > popover.totalBeds) {
      setActualBedsError(`Actual beds (${actualBeds}) cannot exceed ward total beds (${popover.totalBeds})`)
      return
    }

    if (portion && !portion.trim()) {
      setPortionError('If portion mode is enabled, portion must be provided')
      return
    }

    onSave(portion ? portion.trim() : null, actualBeds)
  }

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Portion for {popover.wardName}</DialogTitle>
            <button
              onClick={onCancel}
              className="p-1 hover:bg-accent rounded"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Bed stat</Label>
            <p className="text-sm text-muted-foreground">{popover.totalBeds}</p>
          </div>

          <div>
            <Label htmlFor="portion">
              Portion
            </Label>
            <Input
              id="portion"
              value={portion}
              onChange={(e) => handlePortionChange(e.target.value)}
              placeholder="e.g., 1/3, 2/3, 3/4"
              className="mt-1"
            />
            {portionError && (
              <p className="text-sm text-destructive mt-1">{portionError}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Enter fraction in format x/y (e.g., 1/3, 2/3, 3/4)
            </p>
          </div>

          <div>
            <Label htmlFor="actual-beds">Actual bed number</Label>
            <Input
              id="actual-beds"
              type="number"
              min="0"
              max={popover.totalBeds}
              value={actualBeds}
              onChange={(e) => handleActualBedsChange(parseInt(e.target.value, 10) || 0)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Auto-calculated from portion; you can manually override
            </p>
          </div>

          {actualBedsError && (
            <p className="text-sm text-destructive mt-1">{actualBedsError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
