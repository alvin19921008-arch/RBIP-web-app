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
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'

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
      const { error } = await supabase
        .from('spt_allocations')
        .update({ active: false })
        .eq('id', allocationId)
      if (error) throw error
      await loadData()
      toast.success('SPT allocation removed from work schedules.')
    } catch (err) {
      console.error('Error deleting allocation:', err)
      toast.error('Failed to remove SPT allocation.', err instanceof Error ? err.message : String(err))
    }
  }

  const handleSave = async (allocation: Partial<SPTAllocation>) => {
    try {
      // IMPORTANT:
      // - Supabase does NOT throw by default; always check `error`.
      // - We treat `staff_id` as the canonical unique key (migration adds unique index),
      //   so we upsert by `staff_id` for both create + edit.
      if (!allocation.staff_id) {
        throw new Error('Missing staff_id in save payload.')
      }

      const { error } = await supabase
        .from('spt_allocations')
        .upsert(allocation, { onConflict: 'staff_id' })

      if (error) throw error

      await loadData()
      setEditingAllocation(null)
      toast.success(editingAllocation?.id ? 'SPT allocation updated.' : 'SPT allocation created.')
    } catch (err) {
      console.error('Error saving allocation:', err)
      toast.error('Failed to save SPT allocation.', err instanceof Error ? err.message : String(err))
    }
  }

  const configuredStaffIds = new Set(allocations.map((a) => a.staff_id))
  const availableStaffForNew = staff.filter((s) => !configuredStaffIds.has(s.id))
  const addDisabled = availableStaffForNew.length === 0

  return (
    <Card>
      <CardContent className="pt-6">
        <DashboardConfigMetaBanner />
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-4">
            {addDisabled ? (
              <Tooltip
                side="bottom"
                className="whitespace-normal max-w-[320px]"
                content="No SPT staff left without an allocation. If you want to add a new SPT allocation, first update/add an SPT staff in Staff Profile."
              >
                <div className="inline-block">
                  <Button disabled>Add New SPT Allocation</Button>
                </div>
              </Tooltip>
            ) : (
              <Button
                disabled={addDisabled}
                onClick={() => {
                  setEditingAllocation({} as SPTAllocation)
                  expand.open('new')
                }}
              >
                Add New SPT Allocation
              </Button>
            )}
            
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
                        Teams: {alloc.teams.join(', ')} | Weekday FTE:{' '}
                        {(() => {
                          const cfg = (alloc as any).config_by_weekday as any
                          const days: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
                          const computeEff = (slots: number[], mode: 'AND' | 'OR') => {
                            if (slots.length === 0) return 0
                            if (mode === 'OR' && slots.length > 1) return 1
                            return slots.length
                          }
                          const parts: string[] = []
                          days.forEach((d) => {
                            const c = cfg?.[d]
                            const enabled = c ? c.enabled !== false : false
                            if (!enabled) return
                            const contributes = c.contributes_fte !== false
                            const slots = Array.isArray(c.slots) ? c.slots.filter((n: any) => [1, 2, 3, 4].includes(n)) : []
                            const modes: { am: 'AND' | 'OR'; pm: 'AND' | 'OR' } = c.slot_modes
                              ? {
                                  am: c.slot_modes.am === 'OR' ? 'OR' : 'AND',
                                  pm: c.slot_modes.pm === 'OR' ? 'OR' : 'AND',
                                }
                              : { am: 'AND', pm: 'AND' }
                            const amSlots = slots.filter((s: number) => s === 1 || s === 2)
                            const pmSlots = slots.filter((s: number) => s === 3 || s === 4)
                            const eff = computeEff(amSlots, modes.am) + computeEff(pmSlots, modes.pm)
                            const fte = contributes ? eff * 0.25 : 0
                            parts.push(`${d}:${fte.toFixed(2)}`)
                          })
                          return parts.length > 0 ? parts.join(', ') : '--'
                        })()}
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
                    staff={availableStaffForNew}
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
  type SlotModes = { am: 'AND' | 'OR'; pm: 'AND' | 'OR' }
  type WeekdayConfigState = {
    enabled: boolean
    contributesFte: boolean
    slots: number[]
    slotModes: SlotModes
    displayText: string
  }

  const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
  const defaultCfg: WeekdayConfigState = {
    enabled: false,
    contributesFte: true,
    slots: [],
    slotModes: { am: 'AND', pm: 'AND' },
    displayText: '',
  }

  const normalizeSlotModes = (m: any): SlotModes => ({
    am: m?.am === 'OR' ? 'OR' : 'AND',
    pm: m?.pm === 'OR' ? 'OR' : 'AND',
  })

  const initWeekdayConfigState = (): Record<Weekday, WeekdayConfigState> => {
    const next = {
      mon: { ...defaultCfg },
      tue: { ...defaultCfg },
      wed: { ...defaultCfg },
      thu: { ...defaultCfg },
      fri: { ...defaultCfg },
    } as Record<Weekday, WeekdayConfigState>

    // Prefer new config_by_weekday
    const cfgByDay = allocation.config_by_weekday as any
    if (cfgByDay) {
      WEEKDAYS.forEach((day) => {
        const c = cfgByDay?.[day]
        if (!c) return
        next[day] = {
          enabled: c.enabled !== false,
          contributesFte: c.contributes_fte !== false,
          slots: Array.isArray(c.slots) ? c.slots.filter((n: any) => [1, 2, 3, 4].includes(n)) : [],
          slotModes: normalizeSlotModes(c.slot_modes),
          displayText: typeof c.display_text === 'string' ? c.display_text : '',
        }
      })
      return next
    }

    // Legacy fallback
    const legacyWeekdays = (allocation.weekdays || []) as Weekday[]
    WEEKDAYS.forEach((day) => {
      if (!legacyWeekdays.includes(day)) return
      const slots = (allocation.slots?.[day] || []) as number[]
      const slotModes = allocation.slot_modes?.[day] as any
      next[day] = {
        enabled: true,
        contributesFte: (allocation.fte_addon ?? 0) > 0,
        slots: Array.isArray(slots) ? slots.filter((n) => [1, 2, 3, 4].includes(n)) : [],
        slotModes: normalizeSlotModes(slotModes),
        displayText: '',
      }
    })
    return next
  }

  const [selectedStaff, setSelectedStaff] = useState(allocation.staff_id || '')
  const isEditingExisting = !!allocation.id
  const [teams, setTeams] = useState<Team[]>(allocation.teams || [])
  const [weekdayCfg, setWeekdayCfg] = useState<Record<Weekday, WeekdayConfigState>>(initWeekdayConfigState)
  const [specialty, setSpecialty] = useState(allocation.specialty || '')
  const [isRbipSupervisor, setIsRbipSupervisor] = useState(allocation.is_rbip_supervisor || false)
  const [addWeekday, setAddWeekday] = useState<Weekday | ''>('')

  const allTeams: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const weekdayLabel: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

  const computeEffectiveSlotCount = (slots: number[], mode: 'AND' | 'OR'): number => {
    if (slots.length === 0) return 0
    if (mode === 'OR' && slots.length > 1) return 1
    return slots.length
  }

  const computeDerivedFteForDay = (day: Weekday): { fte: number; effectiveSlots: number } => {
    const c = weekdayCfg[day]
    if (!c?.enabled) return { fte: 0, effectiveSlots: 0 }
    if (!c.contributesFte) return { fte: 0, effectiveSlots: 0 }
    const amSlots = c.slots.filter((s) => s === 1 || s === 2)
    const pmSlots = c.slots.filter((s) => s === 3 || s === 4)
    const eff = computeEffectiveSlotCount(amSlots, c.slotModes.am) + computeEffectiveSlotCount(pmSlots, c.slotModes.pm)
    return { fte: eff * 0.25, effectiveSlots: eff }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff) return

    const config_by_weekday: any = {}
    WEEKDAYS.forEach((day) => {
      const c = weekdayCfg[day]
      const enabled = !!c.enabled
      const cleanedSlots = Array.isArray(c.slots) ? c.slots.filter((n) => [1, 2, 3, 4].includes(n)) : []
      config_by_weekday[day] = {
        enabled,
        contributes_fte: !!c.contributesFte,
        slots: cleanedSlots,
        slot_modes: { am: c.slotModes.am, pm: c.slotModes.pm },
        display_text: c.displayText && c.displayText.trim() !== '' ? c.displayText.trim() : null,
      }
    })

    // Keep legacy columns populated minimally for backward compatibility (best-effort)
    const legacyWeekdays = WEEKDAYS.filter((d) => weekdayCfg[d].enabled)
    const legacySlots: any = {}
    const legacyModes: any = {}
    legacyWeekdays.forEach((d) => {
      legacySlots[d] = weekdayCfg[d].slots
      legacyModes[d] = weekdayCfg[d].slotModes
    })

    const savePayload: Partial<SPTAllocation> = {
      staff_id: selectedStaff,
      teams,
      specialty: specialty || null,
      substitute_team_head: allocation.substitute_team_head || false,
      is_rbip_supervisor: isRbipSupervisor,
      active: allocation.active !== undefined ? allocation.active : true,
      // new config
      config_by_weekday,
      // legacy best-effort
      weekdays: legacyWeekdays,
      slots: legacySlots,
      slot_modes: legacyModes,
      fte_addon: 0,
    }

    onSave(savePayload)
  }

  const toggleTeam = (team: Team) => {
    setTeams(prev =>
      prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
    )
  }

  const toggleDayEnabled = (day: Weekday) => {
    setWeekdayCfg((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }))
  }

  const enableDay = (day: Weekday) => {
    setWeekdayCfg((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: true },
    }))
  }

  const removeDay = (day: Weekday) => {
    setWeekdayCfg((prev) => ({
      ...prev,
      [day]: { ...defaultCfg, enabled: false },
    }))
  }

  const toggleSlot = (day: Weekday, slot: number) => {
    setWeekdayCfg((prev) => {
      const cur = prev[day]
      const slots = cur.slots.includes(slot) ? cur.slots.filter((s) => s !== slot) : [...cur.slots, slot]
      return { ...prev, [day]: { ...cur, slots } }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border p-4 rounded">
      <div>
        <Label className="text-sm font-medium mb-1">SPT staff</Label>
        <Select value={selectedStaff} onValueChange={setSelectedStaff} disabled={isEditingExisting}>
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
        <Label className="text-sm font-medium mb-2">Weekday configuration</Label>
        <div className="space-y-2">
          {(() => {
            const enabledDays = WEEKDAYS.filter((d) => !!weekdayCfg[d]?.enabled)
            const remainingDays = WEEKDAYS.filter((d) => !weekdayCfg[d]?.enabled)

            return (
              <>
                {enabledDays.length === 0 ? (
                  <div className="text-xs text-muted-foreground border rounded-md p-3">
                    No weekday configured yet.
                  </div>
                ) : null}

                {enabledDays.map((day) => {
                  const c = weekdayCfg[day]
                  const derived = computeDerivedFteForDay(day)
                  const amSlots = c.slots.filter((s) => s === 1 || s === 2)
                  const pmSlots = c.slots.filter((s) => s === 3 || s === 4)

                  return (
                    <div key={day} className="border rounded-md p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{weekdayLabel[day]}</span>
                          <span className="text-[11px] text-muted-foreground">configured</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                            FTE: {derived.fte.toFixed(2)}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => removeDay(day)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* AM Group */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleSlot(day, 1)}
                          className={`px-2 py-1 rounded text-xs ${c.slots.includes(1) ? 'bg-blue-600 text-white' : 'bg-secondary'}`}
                        >
                          {getSlotLabel(1)}
                        </button>
                        {amSlots.length > 1 && (
                          <div className="inline-flex rounded border border-input overflow-hidden">
                            <button
                              type="button"
                              onClick={() =>
                                setWeekdayCfg((prev) => ({
                                  ...prev,
                                  [day]: { ...prev[day], slotModes: { ...prev[day].slotModes, am: 'AND' } },
                                }))
                              }
                              className={`px-2 py-1 text-xs font-medium transition-colors ${
                                c.slotModes.am === 'AND' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                              title="AND: Both slots 1-2"
                            >
                              AND
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setWeekdayCfg((prev) => ({
                                  ...prev,
                                  [day]: { ...prev[day], slotModes: { ...prev[day].slotModes, am: 'OR' } },
                                }))
                              }
                              className={`px-2 py-1 text-xs font-medium transition-colors border-l border-input ${
                                c.slotModes.am === 'OR' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                          className={`px-2 py-1 rounded text-xs ${c.slots.includes(2) ? 'bg-blue-600 text-white' : 'bg-secondary'}`}
                        >
                          {getSlotLabel(2)}
                        </button>
                      </div>

                      <span className="text-muted-foreground mx-1">|</span>

                      {/* PM Group */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleSlot(day, 3)}
                          className={`px-2 py-1 rounded text-xs ${c.slots.includes(3) ? 'bg-blue-600 text-white' : 'bg-secondary'}`}
                        >
                          {getSlotLabel(3)}
                        </button>
                        {pmSlots.length > 1 && (
                          <div className="inline-flex rounded border border-input overflow-hidden">
                            <button
                              type="button"
                              onClick={() =>
                                setWeekdayCfg((prev) => ({
                                  ...prev,
                                  [day]: { ...prev[day], slotModes: { ...prev[day].slotModes, pm: 'AND' } },
                                }))
                              }
                              className={`px-2 py-1 text-xs font-medium transition-colors ${
                                c.slotModes.pm === 'AND' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                              title="AND: Both slots 3-4"
                            >
                              AND
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setWeekdayCfg((prev) => ({
                                  ...prev,
                                  [day]: { ...prev[day], slotModes: { ...prev[day].slotModes, pm: 'OR' } },
                                }))
                              }
                              className={`px-2 py-1 text-xs font-medium transition-colors border-l border-input ${
                                c.slotModes.pm === 'OR' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                          className={`px-2 py-1 rounded text-xs ${c.slots.includes(4) ? 'bg-blue-600 text-white' : 'bg-secondary'}`}
                        >
                          {getSlotLabel(4)}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={c.contributesFte}
                          onChange={(e) =>
                            setWeekdayCfg((prev) => ({
                              ...prev,
                              [day]: { ...prev[day], contributesFte: e.target.checked },
                            }))
                          }
                          className="h-4 w-4"
                        />
                        <span className="text-xs text-muted-foreground">Contributes FTE</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        AM: {c.slotModes.am} ({amSlots.join(',') || '-'}) · PM: {c.slotModes.pm} ({pmSlots.join(',') || '-'})
                      </div>
                    </div>

                    {!c.contributesFte && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          When on duty and FTE=0, Block 1 will show this text on the right (else “No Duty”).
                        </div>
                        <Input
                          value={c.displayText}
                          onChange={(e) =>
                            setWeekdayCfg((prev) => ({
                              ...prev,
                              [day]: { ...prev[day], displayText: e.target.value },
                            }))
                          }
                          placeholder="e.g. 8 beds"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                      </div>
                    </div>
                  )
                })}

                {remainingDays.length > 0 ? (
                  <div className="border rounded-md p-2 bg-muted/10">
                    <div className="text-xs font-semibold">Add other weekday configuration</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Select value={addWeekday} onValueChange={(v) => setAddWeekday(v as any)}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select weekday" />
                        </SelectTrigger>
                        <SelectContent>
                          {remainingDays.map((d) => (
                            <SelectItem key={d} value={d}>
                              {weekdayLabel[d]} ({d.toUpperCase()})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="h-8"
                        disabled={!addWeekday}
                        onClick={() => {
                          if (!addWeekday) return
                          enableDay(addWeekday)
                          setAddWeekday('')
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground border rounded-md p-2">
                    All weekdays are configured.
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>

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

      {/* NOTE: FTE add-on is now computed per weekday from slots/modes + contributes toggle. */}

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

