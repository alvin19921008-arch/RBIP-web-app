'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SPTAllocation } from '@/types/allocation'
import { Staff, Team, Weekday } from '@/types/staff'
import { getSlotLabel } from '@/lib/utils/slotHelpers'
import { X, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast-context'
import { useDashboardExpandableCard } from '@/hooks/useDashboardExpandableCard'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'

export function SPTAllocationPanel() {
  const [allocations, setAllocations] = useState<SPTAllocation[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [editingAllocation, setEditingAllocation] = useState<SPTAllocation | null>(null)
  const [expandedAllocIds, setExpandedAllocIds] = useState<Set<string>>(new Set())
  const [pendingDeleteAllocId, setPendingDeleteAllocId] = useState<string | null>(null)
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

  const activeStaff = staff.filter((s) => (s.status ?? 'active') === 'active')
  const displayedAllocations = allocations.filter((a) =>
    activeStaff.some((s) => s.id === a.staff_id)
  )
  const configuredStaffIds = new Set(allocations.map((a) => a.staff_id))
  const availableStaffForNew = activeStaff.filter((s) => !configuredStaffIds.has(s.id))
  const addDisabled = availableStaffForNew.length === 0

  return (
    <div className="pt-6 space-y-4">
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
            
            <div className="divide-y divide-border">
              {displayedAllocations.map((alloc) => {
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
                          staff={activeStaff}
                          onSave={handleSave}
                          onCancel={() => expand.close(() => setEditingAllocation(null))}
                        />
                      </Card>
                    </div>
                  )
                }
                
                const isExpanded = expandedAllocIds.has(alloc.id)
                const staffMember = staff.find(s => s.id === alloc.staff_id)
                
                return (
                  <div
                    key={alloc.id}
                    className={`py-3 px-2 hover:bg-muted/30 transition-colors cursor-pointer ${alloc.active === false ? 'opacity-50' : ''}`}
                    onClick={(e) => {
                      // Don't toggle if clicking on interactive elements
                      const target = e.target as HTMLElement
                      if (target.closest('button') || target.closest('input') || target.closest('select')) return
                      setExpandedAllocIds(prev => {
                        const next = new Set(prev)
                        if (next.has(alloc.id)) {
                          next.delete(alloc.id)
                        } else {
                          next.add(alloc.id)
                        }
                        return next
                      })
                      if (!isExpanded) {
                        setEditingAllocation(alloc)
                      } else {
                        setEditingAllocation(null)
                      }
                    }}
                  >
                    {/* Header row with chevron, name, badges, and delete */}
                    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                      {/* Chevron for expand/collapse */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedAllocIds(prev => {
                            const next = new Set(prev)
                            if (next.has(alloc.id)) {
                              next.delete(alloc.id)
                            } else {
                              next.add(alloc.id)
                            }
                            return next
                          })
                          if (!isExpanded) {
                            setEditingAllocation(alloc)
                          } else {
                            setEditingAllocation(null)
                          }
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>

                      {/* Name + Specialty badge (inline) + Supervisor badge + Delete button */}
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">
                          {staffMember?.name || 'Unknown'}
                        </h3>
                        {alloc.specialty && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground border-border bg-muted/40"
                          >
                            {alloc.specialty}
                          </Badge>
                        )}
                        {alloc.is_rbip_supervisor && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 font-normal text-amber-700 border-amber-200 bg-amber-100"
                          >
                            Supervisor
                          </Badge>
                        )}
                        {alloc.active === false && (
                          <span className="text-xs text-muted-foreground">(Inactive)</span>
                        )}

                        {/* Delete button - appears on hover, next to name/badges */}
                        {pendingDeleteAllocId === alloc.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(alloc.id)
                                setPendingDeleteAllocId(null)
                              }}
                            >
                              Confirm?
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPendingDeleteAllocId(null)
                              }}
                            >
                              ×
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip content={`Remove ${staffMember?.name || 'Unknown'}`} side="right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPendingDeleteAllocId(alloc.id)
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Collapsed summary - teams and weekday config */}
                    {!isExpanded && (
                      <div className="pl-6 pt-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="text-foreground">{alloc.teams.join(', ')}</span>
                          <span className="mx-1.5 text-border">·</span>
                          <span>
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
                              return parts.length > 0 ? parts.join(', ') : 'No weekday config'
                            })()}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

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
    </div>
  )
}

export function SPTAllocationForm({
  allocation,
  staff,
  onSave,
  onCancel,
  saveButtonLabel = 'Save',
  cancelButtonLabel = 'Cancel',
}: {
  allocation: Partial<SPTAllocation>
  staff: Staff[]
  onSave: (allocation: Partial<SPTAllocation>) => void
  onCancel: () => void
  saveButtonLabel?: string
  cancelButtonLabel?: string
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
  const [pendingRemoveDay, setPendingRemoveDay] = useState<Weekday | null>(null)

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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label className="text-sm font-medium mb-1.5 block">SPT staff</Label>
        <Select value={selectedStaff} onValueChange={setSelectedStaff} disabled={isEditingExisting}>
          <SelectTrigger className="w-fit min-w-36">
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
        <Label className="text-sm font-medium mb-2 block">Teams</Label>
        <div className="flex flex-wrap gap-2">
          {allTeams.map((team) => (
            <button
              key={team}
              type="button"
              onClick={() => toggleTeam(team)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                teams.includes(team) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-border" />

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Weekday Configuration
        </h3>
        <div className="space-y-0">
          {(() => {
            const enabledDays = WEEKDAYS.filter((d) => !!weekdayCfg[d]?.enabled)
            const remainingDays = WEEKDAYS.filter((d) => !weekdayCfg[d]?.enabled)

            return (
              <div>
                {enabledDays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No weekday configured yet.</p>
                ) : null}

                {enabledDays.map((day, index) => {
                  const c = weekdayCfg[day]
                  const derived = computeDerivedFteForDay(day)
                  const amSlots = c.slots.filter((s) => s === 1 || s === 2)
                  const pmSlots = c.slots.filter((s) => s === 3 || s === 4)

                  return (
                    <div key={day} className="py-4">
                      {index > 0 && <hr className="border-border mb-4" />}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-semibold">{weekdayLabel[day]}</span>
                        <span className="text-xs font-medium text-muted-foreground">
                          FTE: {derived.fte.toFixed(2)}
                        </span>
                        {pendingRemoveDay === day ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                removeDay(day)
                                setPendingRemoveDay(null)
                              }}
                            >
                              Confirm?
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setPendingRemoveDay(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingRemoveDay(day)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* AM slots */}
                        <button
                          type="button"
                          onClick={() => toggleSlot(day, 1)}
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                            c.slots.includes(1) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {getSlotLabel(1)}
                        </button>
                        {amSlots.length === 2 && (
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
                            >
                              OR
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleSlot(day, 2)}
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                            c.slots.includes(2) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {getSlotLabel(2)}
                        </button>

                        <span className="text-muted-foreground mx-1 text-xs">|</span>

                        {/* PM slots */}
                        <button
                          type="button"
                          onClick={() => toggleSlot(day, 3)}
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                            c.slots.includes(3) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {getSlotLabel(3)}
                        </button>
                        {pmSlots.length === 2 && (
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
                            >
                              OR
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleSlot(day, 4)}
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                            c.slots.includes(4) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {getSlotLabel(4)}
                        </button>
                      </div>

                      <div className="flex items-center gap-4 mt-3">
                        <label className="flex items-center gap-2 cursor-pointer">
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
                        </label>
                        <div className="text-[10px] text-muted-foreground">
                          AM: {c.slotModes.am} ({amSlots.join(',') || '-'}) · PM: {c.slotModes.pm} ({pmSlots.join(',') || '-'})
                        </div>
                      </div>

                      {!c.contributesFte && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs text-muted-foreground">Display text on staff card on schedule page when FTE=0:</p>
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
                  )
                })}

                {remainingDays.length > 0 && (
                  <>
                    <hr className="border-border" />
                    <div className="flex items-center gap-2 pt-4">
                      <span className="text-xs text-muted-foreground">Add weekday:</span>
                      <Select value={addWeekday} onValueChange={(v) => setAddWeekday(v as Weekday | '')}>
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {remainingDays.map((d) => (
                            <SelectItem key={d} value={d}>
                              {weekdayLabel[d]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
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
                  </>
                )}

                {remainingDays.length === 0 && (
                  <p className="text-xs text-muted-foreground pt-4">All weekdays are configured.</p>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      <hr className="border-border" />

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Other Settings
        </h3>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Specialty</Label>
            <Select
              value={specialty || 'nil'}
              onValueChange={(v) => setSpecialty(v === 'nil' ? '' : v)}
            >
              <SelectTrigger className="w-fit min-w-36">
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

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              id="is_rbip_supervisor"
              checked={isRbipSupervisor}
              onChange={(e) => setIsRbipSupervisor(e.target.checked)}
              className="h-4 w-4 mt-0.5"
            />
            <div>
              <span className="text-sm font-medium">RBIP Overall Supervisor</span>
              <p className="text-xs text-muted-foreground">
                Can substitute for team heads when needed
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit">{saveButtonLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelButtonLabel}
        </Button>
      </div>
    </form>
  )
}

