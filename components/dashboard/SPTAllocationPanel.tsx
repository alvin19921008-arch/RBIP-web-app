'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SPTAllocation } from '@/types/allocation'
import { Staff, Team, Weekday } from '@/types/staff'
import { getSlotLabel } from '@/lib/utils/slotHelpers'
import { Trash2 } from 'lucide-react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useToast } from '@/components/ui/toast-provider'
import { useDashboardExpandableCard } from '@/hooks/useDashboardExpandableCard'
import { DashboardConfigMetaBanner } from '@/components/dashboard/DashboardConfigMetaBanner'

export function SPTAllocationPanel() {
  const [allocations, setAllocations] = useState<SPTAllocation[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [editingAllocation, setEditingAllocation] = useState<SPTAllocation | null>(null)
  const expand = useDashboardExpandableCard<string>({ animationMs: 220 })
  const supabase = createClientComponentClient()
  const toast = useToast()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [allocationsRes, staffRes] = await Promise.all([
        supabase.from('spt_allocations').select('*, staff:staff_id(name)').order('created_at'),
        supabase.from('staff').select('*').eq('rank', 'SPT').order('name'),
      ])

      if (allocationsRes.data) {
        // Filter to show all allocations (both active and inactive) for management
        setAllocations(allocationsRes.data as any)
      }
      if (staffRes.data) setStaff(staffRes.data)
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (allocationId: string) => {
    if (!confirm('Are you sure you want to remove this SPT allocation from work schedules? The data will be kept in the database.')) {
      return
    }
    
    try {
      await supabase
        .from('spt_allocations')
        .update({ active: false })
        .eq('id', allocationId)
      await loadData()
      toast.success('SPT allocation removed from work schedules.')
    } catch (err) {
      console.error('Error deleting allocation:', err)
      toast.error('Failed to remove SPT allocation.', err instanceof Error ? err.message : String(err))
    }
  }

  const handleSave = async (allocation: Partial<SPTAllocation>) => {
    try {
      if (editingAllocation?.id) {
        await supabase
          .from('spt_allocations')
          .update(allocation)
          .eq('id', editingAllocation.id)
      } else {
        await supabase.from('spt_allocations').insert(allocation)
      }
      await loadData()
      setEditingAllocation(null)
      toast.success(editingAllocation?.id ? 'SPT allocation updated.' : 'SPT allocation created.')
    } catch (err) {
      console.error('Error saving allocation:', err)
      toast.error('Failed to save SPT allocation.', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <DashboardConfigMetaBanner />
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-4">
            <Button onClick={() => {
              setEditingAllocation({} as SPTAllocation)
              expand.open('new')
            }}>
              Add New SPT Allocation
            </Button>
            
            {allocations.map((alloc) => {
              const isEditing = editingAllocation?.id === alloc.id
              
              if (isEditing) {
                return (
                  <div
                    key={alloc.id}
                    ref={expand.expandedRef}
                    className={expand.getExpandedAnimationClass(alloc.id)}
                  >
                    <Card className="p-4 border-2">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold">
                          Edit: {staff.find(s => s.id === alloc.staff_id)?.name || 'Unknown'}
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => expand.close(() => setEditingAllocation(null))}
                        >
                          Cancel
                        </Button>
                      </div>
                      <SPTAllocationForm
                        allocation={editingAllocation}
                        staff={staff}
                        onSave={handleSave}
                        onCancel={() => expand.close(() => setEditingAllocation(null))}
                      />
                    </Card>
                  </div>
                )
              }
              
              return (
                <div key={alloc.id} className={`border p-4 rounded ${alloc.active === false ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">
                        {staff.find(s => s.id === alloc.staff_id)?.name || 'Unknown'}
                        {alloc.active === false && (
                          <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Teams: {alloc.teams.join(', ')} | FTE: {alloc.fte_addon}
                        {alloc.specialty && (
                          <span className="ml-2 text-xs font-semibold text-primary">Specialized service: {alloc.specialty}</span>
                        )}
                        {alloc.is_rbip_supervisor && (
                          <span className="ml-2 text-xs font-semibold text-primary">(RBIP Supervisor)</span>
                        )}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingAllocation(alloc)
                          expand.open(alloc.id)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(alloc.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}

            {editingAllocation && !editingAllocation.id && (
              <div
                ref={expand.expandedRef}
                className={expand.getExpandedAnimationClass('new')}
              >
                <Card className="p-4 border-2">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Add New SPT Allocation</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => expand.close(() => setEditingAllocation(null))}
                    >
                      Cancel
                    </Button>
                  </div>
                  <SPTAllocationForm
                    allocation={editingAllocation}
                    staff={staff}
                    onSave={handleSave}
                    onCancel={() => expand.close(() => setEditingAllocation(null))}
                  />
                </Card>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SPTAllocationForm({
  allocation,
  staff,
  onSave,
  onCancel,
}: {
  allocation: Partial<SPTAllocation>
  staff: Staff[]
  onSave: (allocation: Partial<SPTAllocation>) => void
  onCancel: () => void
}) {
  const [selectedStaff, setSelectedStaff] = useState(allocation.staff_id || '')
  const [teams, setTeams] = useState<Team[]>(allocation.teams || [])
  const [weekdays, setWeekdays] = useState<Weekday[]>(allocation.weekdays || [])
  const [slots, setSlots] = useState<Record<Weekday, number[]>>(
    allocation.slots || { mon: [], tue: [], wed: [], thu: [], fri: [] }
  )
  // Convert old format (string) to new format (object with am/pm) if needed
  const normalizeSlotModes = (modes: any): Record<Weekday, { am: 'AND' | 'OR', pm: 'AND' | 'OR' }> => {
    if (!modes) {
      return {
        mon: { am: 'AND', pm: 'AND' },
        tue: { am: 'AND', pm: 'AND' },
        wed: { am: 'AND', pm: 'AND' },
        thu: { am: 'AND', pm: 'AND' },
        fri: { am: 'AND', pm: 'AND' },
      }
    }
    
    const defaultModes = { am: 'AND' as const, pm: 'AND' as const }
    const result: Record<Weekday, { am: 'AND' | 'OR', pm: 'AND' | 'OR' }> = {
      mon: defaultModes,
      tue: defaultModes,
      wed: defaultModes,
      thu: defaultModes,
      fri: defaultModes,
    }
    
    ;(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).forEach(day => {
      if (modes[day]) {
        if (typeof modes[day] === 'string') {
          // Old format: just a string 'AND' or 'OR'
          result[day] = { am: modes[day] as 'AND' | 'OR', pm: modes[day] as 'AND' | 'OR' }
        } else if (modes[day].am || modes[day].pm) {
          // New format: object with am/pm
          result[day] = {
            am: modes[day].am || 'AND',
            pm: modes[day].pm || 'AND',
          }
        }
      }
    })
    
    return result
  }
  
  const [slotModes, setSlotModes] = useState<Record<Weekday, { am: 'AND' | 'OR', pm: 'AND' | 'OR' }>>(
    normalizeSlotModes(allocation.slot_modes)
  )
  const [fteAddon, setFteAddon] = useState(allocation.fte_addon || 0)
  const [specialty, setSpecialty] = useState(allocation.specialty || '')
  const [isRbipSupervisor, setIsRbipSupervisor] = useState(allocation.is_rbip_supervisor || false)

  const allTeams: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff) return
      const savePayload = {
      staff_id: selectedStaff,
      teams,
      weekdays,
      slots,
      slot_modes: slotModes,
      fte_addon: fteAddon,
      specialty: specialty || null,
      substitute_team_head: allocation.substitute_team_head || false,
      is_rbip_supervisor: isRbipSupervisor,
      active: allocation.active !== undefined ? allocation.active : true, // Default to active for new allocations
    }
      onSave(savePayload)
  }

  const toggleTeam = (team: Team) => {
    setTeams(prev =>
      prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
    )
  }

  const toggleWeekday = (day: Weekday) => {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const toggleSlot = (day: Weekday, slot: number) => {
    setSlots(prev => ({
      ...prev,
      [day]: prev[day].includes(slot)
        ? prev[day].filter(s => s !== slot)
        : [...prev[day], slot],
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border p-4 rounded">
      <div>
        <Label className="text-sm font-medium mb-1">SPT staff</Label>
        <Select value={selectedStaff} onValueChange={setSelectedStaff}>
          <SelectTrigger>
            <SelectValue placeholder="Select SPT" />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2">Teams</Label>
        <div className="flex flex-wrap gap-2">
          {allTeams.map((team) => (
            <button
              key={team}
              type="button"
              onClick={() => toggleTeam(team)}
              className={`px-3 py-1 rounded text-sm ${
                teams.includes(team) ? 'bg-blue-600 text-white' : 'bg-secondary'
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2">Weekdays</Label>
        <div className="flex space-x-2">
          {(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleWeekday(day)}
              className={`px-3 py-1 rounded text-sm ${
                weekdays.includes(day) ? 'bg-blue-600 text-white' : 'bg-secondary'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {weekdays.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-1">Slots per weekday</Label>
          {weekdays.map((day) => {
            const selectedSlots = slots[day] || []
            const amSlots = selectedSlots.filter(s => s === 1 || s === 2)
            const pmSlots = selectedSlots.filter(s => s === 3 || s === 4)
            const dayModes = slotModes[day] || { am: 'AND', pm: 'AND' }
            
            return (
              <div key={day} className="mb-3">
                <span className="text-sm font-medium">{day}:</span>
                <div className="flex items-center space-x-2 mt-1">
                  {/* AM Group: Slots 1-2 */}
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => toggleSlot(day, 1)}
                      className={`px-2 py-1 rounded text-xs ${
                        selectedSlots.includes(1) ? 'bg-blue-600 text-white' : 'bg-secondary'
                      }`}
                    >
                      {getSlotLabel(1)}
                    </button>
                    {amSlots.length > 1 && (
                      <div className="inline-flex rounded border border-input overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setSlotModes(prev => ({
                              ...prev,
                              [day]: {
                                ...prev[day],
                                am: 'AND'
                              }
                            }))
                          }}
                          className={`px-2 py-1 text-xs font-medium transition-colors ${
                            dayModes.am === 'AND'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title="AND: Both slots 1-2"
                        >
                          AND
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSlotModes(prev => ({
                              ...prev,
                              [day]: {
                                ...prev[day],
                                am: 'OR'
                              }
                            }))
                          }}
                          className={`px-2 py-1 text-xs font-medium transition-colors border-l border-input ${
                            dayModes.am === 'OR'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title="OR: One of slots 1-2"
                        >
                          OR
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSlot(day, 2)}
                      className={`px-2 py-1 rounded text-xs ${
                        selectedSlots.includes(2) ? 'bg-blue-600 text-white' : 'bg-secondary'
                      }`}
                    >
                      {getSlotLabel(2)}
                    </button>
                  </div>
                  
                  {/* Divider */}
                  <span className="text-muted-foreground mx-2">|</span>
                  
                  {/* PM Group: Slots 3-4 */}
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => toggleSlot(day, 3)}
                      className={`px-2 py-1 rounded text-xs ${
                        selectedSlots.includes(3) ? 'bg-blue-600 text-white' : 'bg-secondary'
                      }`}
                    >
                      {getSlotLabel(3)}
                    </button>
                    {pmSlots.length > 1 && (
                      <div className="inline-flex rounded border border-input overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setSlotModes(prev => ({
                              ...prev,
                              [day]: {
                                ...prev[day],
                                pm: 'AND'
                              }
                            }))
                          }}
                          className={`px-2 py-1 text-xs font-medium transition-colors ${
                            dayModes.pm === 'AND'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title="AND: Both slots 3-4"
                        >
                          AND
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSlotModes(prev => ({
                              ...prev,
                              [day]: {
                                ...prev[day],
                                pm: 'OR'
                              }
                            }))
                          }}
                          className={`px-2 py-1 text-xs font-medium transition-colors border-l border-input ${
                            dayModes.pm === 'OR'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title="OR: One of slots 3-4"
                        >
                          OR
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSlot(day, 4)}
                      className={`px-2 py-1 rounded text-xs ${
                        selectedSlots.includes(4) ? 'bg-blue-600 text-white' : 'bg-secondary'
                      }`}
                    >
                      {getSlotLabel(4)}
                    </button>
                  </div>
                </div>
                {(amSlots.length > 1 || pmSlots.length > 1) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {amSlots.length > 1 && (
                      <span>AM ({dayModes.am}): {dayModes.am === 'OR' ? 'One of' : 'Both'} slots {amSlots.join(', ')}</span>
                    )}
                    {amSlots.length > 1 && pmSlots.length > 1 && ' | '}
                    {pmSlots.length > 1 && (
                      <span>PM ({dayModes.pm}): {dayModes.pm === 'OR' ? 'One of' : 'Both'} slots {pmSlots.join(', ')}</span>
                    )}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div>
        <Label className="text-sm font-medium mb-1">Specialty</Label>
        <Select
          value={specialty || 'nil'}
          onValueChange={(v) => setSpecialty(v === 'nil' ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nil">-- None --</SelectItem>
            <SelectItem value="MSK/Ortho">MSK/Ortho</SelectItem>
            <SelectItem value="Cardiac">Cardiac</SelectItem>
            <SelectItem value="Neuro">Neuro</SelectItem>
            <SelectItem value="Cancer">Cancer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">FTE Add-on to the assigned team</label>
        <input
          type="number"
          step="0.25"
          min="0"
          max="1"
          value={fteAddon}
          onChange={(e) => setFteAddon(parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 border rounded-md"
          required
        />
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="is_rbip_supervisor"
          checked={isRbipSupervisor}
          onChange={(e) => setIsRbipSupervisor(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="is_rbip_supervisor" className="text-sm font-medium">
          RBIP Overall Supervisor (can substitute for team heads when needed)
        </label>
      </div>

      <div className="flex space-x-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

