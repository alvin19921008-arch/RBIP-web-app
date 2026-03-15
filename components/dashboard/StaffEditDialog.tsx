'use client'

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Staff, StaffRank, Team, StaffStatus, SpecialProgram as StaffSpecialProgram, SharedTherapistAllocationMode } from '@/types/staff'
import { SpecialProgram, SPTAllocation } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { cn } from '@/lib/utils'
import { X, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/ui/toast-context'
import { StaffEditOverlaySheet } from '@/components/dashboard/StaffEditOverlaySheet'
import { StaffEditDialogSPTOverlay } from '@/components/dashboard/StaffEditDialogSPTOverlay'
import {
  StaffEditDialogSpecialProgramOverlay,
} from '@/components/dashboard/StaffEditDialogSpecialProgramOverlay'
import {
  areSpecialProgramConfigsEqual,
  buildSpecialProgramSummaryFromConfig,
  createEmptySpecialProgramConfig,
  getSpecialProgramConfigForStaff,
  type SpecialProgramDraftMap,
  type SpecialProgramOverlaySummary,
  type StaffEditDialogSavePayload,
} from '@/lib/utils/staffEditDrafts'
import { buildSpecialProgramsFromRows } from '@/lib/utils/specialProgramConfigRows'

const RANKS: StaffRank[] = ['SPT', 'APPT', 'RPT', 'PCA', 'workman']
const SPT_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
const SPT_WEEKDAY_LABELS: Record<(typeof SPT_WEEKDAYS)[number], string> = {
  mon: 'MON',
  tue: 'TUE',
  wed: 'WED',
  thu: 'THU',
  fri: 'FRI',
}
type SptOverlaySummary = {
  exists: boolean
  specialty: string | null
  isRbipSupervisor: boolean
  teams: Team[]
  enabledDays: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri'>
}

type ActiveOverlay =
  | null
  | { type: 'spt' }
  | { type: 'special-program'; programName: StaffSpecialProgram }

interface StaffEditDialogProps {
  staff: Staff | Partial<Staff>
  specialPrograms: SpecialProgram[]
  onSave: (payload: StaffEditDialogSavePayload) => void
  onCancel: () => void
}

function buildSptSummary(allocation: Partial<SPTAllocation> | null): SptOverlaySummary {
  if (!allocation) {
    return {
      exists: false,
      specialty: null,
      isRbipSupervisor: false,
      teams: [],
      enabledDays: [],
    }
  }

  const cfgByDay = allocation.config_by_weekday as Partial<
    Record<(typeof SPT_WEEKDAYS)[number], { enabled?: boolean } | undefined>
  > | null | undefined

  const enabledDays = SPT_WEEKDAYS.filter((day) => {
    if (cfgByDay) return cfgByDay?.[day]?.enabled !== false && !!cfgByDay?.[day]
    return Array.isArray(allocation.weekdays) && allocation.weekdays.includes(day)
  })

  const hasAnyData =
    !!allocation.specialty ||
    !!allocation.is_rbip_supervisor ||
    (Array.isArray(allocation.teams) && allocation.teams.length > 0) ||
    enabledDays.length > 0

  return {
    exists: hasAnyData,
    specialty: allocation.specialty ?? null,
    isRbipSupervisor: !!allocation.is_rbip_supervisor,
    teams: Array.isArray(allocation.teams) ? (allocation.teams as Team[]) : [],
    enabledDays,
  }
}

function normalizeSptAllocation(allocation: Partial<SPTAllocation> | null | undefined) {
  const cfgByDay = allocation?.config_by_weekday as Partial<
    Record<
      (typeof SPT_WEEKDAYS)[number],
      {
        enabled?: boolean
        contributes_fte?: boolean
        slots?: unknown
        slot_modes?: { am?: 'AND' | 'OR'; pm?: 'AND' | 'OR' } | null
        display_text?: string | null
      } | undefined
    >
  > | null | undefined

  const normalizedConfig = Object.fromEntries(
    SPT_WEEKDAYS.map((day) => {
      const current = cfgByDay?.[day]
      if (current) {
        return [
          day,
          {
            enabled: current.enabled !== false,
            contributes_fte: current.contributes_fte !== false,
            slots: Array.isArray(current.slots)
              ? current.slots.filter((slot): slot is number => [1, 2, 3, 4].includes(slot as number)).slice().sort((a, b) => a - b)
              : [],
            slot_modes: {
              am: current.slot_modes?.am === 'OR' ? 'OR' : 'AND',
              pm: current.slot_modes?.pm === 'OR' ? 'OR' : 'AND',
            },
            display_text:
              typeof current.display_text === 'string' && current.display_text.trim() !== ''
                ? current.display_text.trim()
                : null,
          },
        ]
      }

      const legacyWeekdays = Array.isArray(allocation?.weekdays) ? allocation?.weekdays : []
      const legacySlots = Array.isArray(allocation?.slots?.[day])
        ? allocation?.slots?.[day]?.filter((slot): slot is number => [1, 2, 3, 4].includes(slot as number)).slice().sort((a, b) => a - b)
        : []
      const legacyModes = allocation?.slot_modes?.[day] as { am?: 'AND' | 'OR'; pm?: 'AND' | 'OR' } | undefined

      return [
        day,
        {
          enabled: legacyWeekdays.includes(day),
          contributes_fte: (allocation?.fte_addon ?? 0) > 0,
          slots: legacySlots,
          slot_modes: {
            am: legacyModes?.am === 'OR' ? 'OR' : 'AND',
            pm: legacyModes?.pm === 'OR' ? 'OR' : 'AND',
          },
          display_text: null,
        },
      ]
    })
  )

  return {
    specialty: allocation?.specialty ?? null,
    is_rbip_supervisor: !!allocation?.is_rbip_supervisor,
    teams: Array.isArray(allocation?.teams) ? [...allocation.teams].sort() : [],
    substitute_team_head: !!allocation?.substitute_team_head,
    active: allocation?.active !== false,
    config_by_weekday: normalizedConfig,
  }
}

function areSptAllocationsEqual(
  left: Partial<SPTAllocation> | null | undefined,
  right: Partial<SPTAllocation> | null | undefined
): boolean {
  return JSON.stringify(normalizeSptAllocation(left)) === JSON.stringify(normalizeSptAllocation(right))
}

export function StaffEditDialog({ staff, specialPrograms, onSave, onCancel }: StaffEditDialogProps) {
  const isNew = !staff.id
  const supabase = createClientComponentClient()
  const toast = useToast()
  const [mounted, setMounted] = useState(false)

  const [name, setName] = useState(staff.name || '')
  const [rank, setRank] = useState<StaffRank>(staff.rank || 'PCA')
  const [team, setTeam] = useState<Team | null>(staff.team || null)
  const [sharedTherapistMode, setSharedTherapistMode] = useState<SharedTherapistAllocationMode>(
    staff.shared_therapist_mode === 'single-team' ? 'single-team' : 'slot-based'
  )
  const [specialProgram, setSpecialProgram] = useState<StaffSpecialProgram[]>(staff.special_program || [])
  const [floating, setFloating] = useState<boolean>(staff.floating ?? false)
  const [floorPCA, setFloorPCA] = useState<'upper' | 'lower' | 'both' | null>(() => {
    if (staff.rank !== 'PCA' || !staff.floor_pca || staff.floor_pca.length === 0) return null
    if (staff.floor_pca.includes('upper') && staff.floor_pca.includes('lower')) return 'both'
    if (staff.floor_pca.includes('upper')) return 'upper'
    if (staff.floor_pca.includes('lower')) return 'lower'
    return null
  })
  const [status, setStatus] = useState<StaffStatus>((staff.status ?? 'active') as StaffStatus)
  const [loadingSPTData, setLoadingSPTData] = useState(false)
  const [sptDraft, setSptDraft] = useState<Partial<SPTAllocation> | null>(null)
  const [savedSptDraft, setSavedSptDraft] = useState<Partial<SPTAllocation> | null>(null)
  const [loadingSpecialProgramData, setLoadingSpecialProgramData] = useState(false)
  const [specialProgramDrafts, setSpecialProgramDrafts] = useState<SpecialProgramDraftMap>({})
  const [savedSpecialProgramDrafts, setSavedSpecialProgramDrafts] = useState<SpecialProgramDraftMap>({})
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [stageX, setStageX] = useState(0)
  const persistedSpecialPrograms = useMemo(
    () => (Array.isArray(staff.special_program) ? (staff.special_program as StaffSpecialProgram[]) : []),
    [staff.special_program]
  )

  useEffect(() => {
    const refresh = async () => {
      if (rank !== 'SPT') {
        setLoadingSPTData(false)
        return
      }

      if (!staff.id) {
        setSavedSptDraft(null)
        return
      }

      setLoadingSPTData(true)
      try {
        const { data, error } = await supabase
          .from('spt_allocations')
          .select('id, specialty, is_rbip_supervisor, teams, config_by_weekday, weekdays')
          .eq('staff_id', staff.id)
          .maybeSingle()

        if (error) throw error

        if (!data) {
          setSavedSptDraft(null)
          setSptDraft({ staff_id: staff.id as string })
          return
        }
        setSavedSptDraft(data as Partial<SPTAllocation>)
        setSptDraft(data as Partial<SPTAllocation>)
      } catch (err) {
        console.error('Error loading SPT data:', err)
        setSavedSptDraft(null)
        setSptDraft({ staff_id: staff.id as string })
      } finally {
        setLoadingSPTData(false)
      }
    }

    void refresh()
  }, [staff.id, rank, supabase])

  useEffect(() => {
    let cancelled = false
    const persistedProgramSet = new Set<StaffSpecialProgram>(persistedSpecialPrograms)

    const load = async () => {
      if (!staff.id || specialProgram.length === 0) {
        setLoadingSpecialProgramData(false)
        return
      }

      setLoadingSpecialProgramData(true)
      try {
        const { data, error } = await supabase
          .from('special_programs')
          .select('id, name, staff_ids, weekdays, slots, fte_subtraction, pca_required, therapist_preference_order, pca_preference_order')
          .in('name', specialProgram)

        if (error) throw error
        if (cancelled) return

        const baseRows = Array.isArray(data) ? data : []
        const programIds = baseRows
          .map((row: any) => row?.id)
          .filter((id: any): id is string => typeof id === 'string')
        const { data: configRows, error: configError } = programIds.length > 0
          ? await supabase
              .from('special_program_staff_configs')
              .select('id,program_id,staff_id,config_by_weekday,created_at,updated_at')
              .in('program_id', programIds)
          : { data: [], error: null as any }

        if (configError) throw configError
        if (cancelled) return

        const rows = buildSpecialProgramsFromRows({
          programRows: baseRows,
          staffConfigRows: (configRows || []) as any[],
        })
        const hydratedConfigs: SpecialProgramDraftMap = {}
        specialProgram.forEach((programName) => {
          if (!persistedProgramSet.has(programName)) return
          const row = rows.find((entry: any) => entry.name === programName)
          hydratedConfigs[programName] = row
            ? getSpecialProgramConfigForStaff(row, staff.id as string)
            : createEmptySpecialProgramConfig()
        })

        setSavedSpecialProgramDrafts((prev) => ({
          ...prev,
          ...hydratedConfigs,
        }))
        setSpecialProgramDrafts((prev) => {
          const next = { ...prev }
          let changed = false
          specialProgram.forEach((programName) => {
            if (next[programName] || !persistedProgramSet.has(programName)) return
            next[programName] = hydratedConfigs[programName] ?? createEmptySpecialProgramConfig()
            changed = true
          })
          return changed ? next : prev
        })
      } catch (err) {
        console.error('Error loading special program summaries:', err)
      } finally {
        if (!cancelled) setLoadingSpecialProgramData(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [persistedSpecialPrograms, specialProgram, staff.id, supabase])

  useEffect(() => {
    if (rank !== 'PCA') {
      setFloorPCA(null)
      setFloating(false)
    }
  }, [rank])

  useEffect(() => {
    if (rank === 'PCA' && floating) {
      setTeam(null)
    }
  }, [rank, floating])

  useEffect(() => {
    setSpecialProgramDrafts((prev) => {
      const next = { ...prev }
      const persistedProgramSet = new Set<StaffSpecialProgram>(persistedSpecialPrograms)
      let changed = false
      specialProgram.forEach((programName) => {
        if (next[programName] || (!!staff.id && persistedProgramSet.has(programName))) return
        next[programName] = createEmptySpecialProgramConfig()
        changed = true
      })
      return changed ? next : prev
    })
  }, [persistedSpecialPrograms, specialProgram, staff.id])

  const availableProgramNames = specialPrograms.map((program) => program.name as StaffSpecialProgram).sort()

  const isTeamRequired = () => {
    if (rank === 'SPT') return false
    if (['APPT', 'RPT'].includes(rank)) return false // optional: null = shared therapist assigned per day in Step 2
    if (rank === 'PCA' && !floating) return true
    return false
  }

  const isSharedTherapistConfigVisible = ['APPT', 'RPT'].includes(rank) && team === null

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

    if ((rank === 'SPT' && loadingSPTData) || loadingSpecialProgramData || (!!staff.id && specialProgram.some((programName) => !specialProgramDrafts[programName]))) {
      toast.warning('Wait for draft data to finish loading.')
      return
    }

    let floorPCAArray: ('upper' | 'lower')[] | null = null
    if (rank === 'PCA' && floorPCA) {
      floorPCAArray = floorPCA === 'both' ? ['upper', 'lower'] : [floorPCA]
    }

    const staffData: Partial<Staff> = {
      name: name.trim(),
      rank,
      team: isTeamRequired() ? (team as Team) : rank === 'PCA' && floating ? null : team,
      shared_therapist_mode: ['APPT', 'RPT'].includes(rank) ? sharedTherapistMode : null,
      special_program: specialProgram.length > 0 ? specialProgram : null,
      floating: rank === 'PCA' ? floating : false,
      floor_pca: floorPCAArray,
      status,
    }

    onSave({
      staffId: staff.id ?? null,
      staff: staffData,
      sptAllocation: rank === 'SPT' ? sptDraft : null,
      specialProgramConfigs: Object.fromEntries(
        specialProgram.map((programName) => [programName, specialProgramDrafts[programName] ?? createEmptySpecialProgramConfig()])
      ) as SpecialProgramDraftMap,
    })
  }

  const sptSummary = buildSptSummary(sptDraft)
  const sptHasUnsavedChanges = rank === 'SPT' && !loadingSPTData && !areSptAllocationsEqual(sptDraft, savedSptDraft)
  const specialProgramSummaries: Partial<Record<StaffSpecialProgram, SpecialProgramOverlaySummary>> = Object.fromEntries(
    specialProgram.map((programName) => [
      programName,
      buildSpecialProgramSummaryFromConfig(
        specialProgramDrafts[programName] ?? createEmptySpecialProgramConfig(),
        programName
      ),
    ])
  ) as Partial<Record<StaffSpecialProgram, SpecialProgramOverlaySummary>>
  const specialProgramDirtyMap: Partial<Record<StaffSpecialProgram, boolean>> = Object.fromEntries(
    specialProgram.map((programName) => {
      const currentConfig = specialProgramDrafts[programName] ?? createEmptySpecialProgramConfig()
      const savedConfig = savedSpecialProgramDrafts[programName] ?? createEmptySpecialProgramConfig()
      const isSelectionDirty = !persistedSpecialPrograms.includes(programName)
      const isConfigDirty = !areSpecialProgramConfigsEqual(currentConfig, savedConfig)
      return [programName, isSelectionDirty || isConfigDirty]
    })
  ) as Partial<Record<StaffSpecialProgram, boolean>>
  const overlayOpen = activeOverlay !== null
  const sptSheetOpen = activeOverlay?.type === 'spt'
  const specialProgramOverlayName = activeOverlay?.type === 'special-program' ? activeOverlay.programName : null
  const canOpenSptSheet = rank === 'SPT' && (!staff.id || !loadingSPTData)
  const hasAllTeamsSelected = sptSummary.teams.length === TEAMS.length
  const hasAllWeekdaysSelected = sptSummary.enabledDays.length === SPT_WEEKDAYS.length
  const draftStaffName = name.trim() || staff.name || 'New staff'
  const teamSummaryLabel = sptSummary.teams.length === 0
    ? 'Teams: —'
    : hasAllTeamsSelected
      ? 'All teams'
      : `Teams: ${sptSummary.teams.join(', ')}`
  const weekdaySummaryLabel = sptSummary.enabledDays.length === 0
    ? 'Days: —'
    : hasAllWeekdaysSelected
      ? 'All weekdays'
      : `Days: ${sptSummary.enabledDays.map((day) => SPT_WEEKDAY_LABELS[day]).join(', ')}`
  const saveBlockedByDraftLoad =
    (rank === 'SPT' && loadingSPTData) ||
    loadingSpecialProgramData ||
    (!!staff.id && specialProgram.some((programName) => !specialProgramDrafts[programName]))

  const closeOverlay = () => setActiveOverlay(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!overlayOpen) {
      setStageX(0)
      return
    }
    const el = dialogRef.current
    if (!el) return

    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const sliverPx = 28
      const delta = -(rect.left + rect.width - sliverPx)
      setStageX(Number.isFinite(delta) ? delta : 0)
    })
    return () => cancelAnimationFrame(raf)
  }, [overlayOpen])

  const renderTeamField = (showHelperText = true) => (
    <div>
      <Label>
        Team {isTeamRequired() && <span className="text-destructive">*</span>}
      </Label>
      <Select value={team ?? '__none__'} onValueChange={(value) => setTeam(value === '__none__' ? null : (value as Team))}>
        <SelectTrigger className="mt-1">
          <SelectValue placeholder="-- Select Team --" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">-- Select Team --</SelectItem>
          {TEAMS.map((currentTeam) => (
            <SelectItem key={currentTeam} value={currentTeam}>
              {currentTeam}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showHelperText && rank === 'SPT' ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. Can be configured in SPT Allocations.
        </p>
      ) : null}
      {showHelperText && ['APPT', 'RPT'].includes(rank) ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. Leave empty for shared therapist (assigned per day in Step 2).
        </p>
      ) : null}
      {showHelperText && isSharedTherapistConfigVisible ? (
        <div className="mt-3 space-y-1">
          <Label>Shared therapist allocation</Label>
          <Select value={sharedTherapistMode} onValueChange={(value) => setSharedTherapistMode(value as SharedTherapistAllocationMode)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slot-based">Slot-based</SelectItem>
              <SelectItem value="single-team">Single-team</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Slot-based supports slot routing in Step 2.3. Single-team behaves like a regular therapist team assignment.
          </p>
        </div>
      ) : null}
    </div>
  )

  const renderSpecialProgramField = () => (
    <div className="space-y-3">
      <div>
        <Label>Special Program</Label>
        <div className="space-y-2 mt-1 rounded-md p-2 max-h-40 overflow-y-auto">
          {availableProgramNames.length > 0 ? (
            availableProgramNames.map((programName) => (
              <label key={programName} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-accent/50">
                <input
                  type="checkbox"
                  checked={specialProgram.includes(programName)}
                  onChange={(e) => {
                    if (e.target.checked) setSpecialProgram([...specialProgram, programName])
                    else setSpecialProgram(specialProgram.filter((existing) => existing !== programName))
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">{programName}</span>
              </label>
            ))
          ) : (
            <p className="py-2 text-xs text-muted-foreground">No special programs available</p>
          )}
        </div>
      </div>

      {specialProgram.length > 0 ? (
        <div className="space-y-2">
          {specialProgram.map((programName) => {
            const summary = specialProgramSummaries[programName]
            const isLoading = !!staff.id && loadingSpecialProgramData && !specialProgramDrafts[programName]
            const canOpen = !isLoading
            const showUnsavedHint = !isLoading && !!specialProgramDirtyMap[programName]

            return (
              <div key={programName}>
                <Label>{programName} configuration</Label>
                <button
                  type="button"
                  disabled={!canOpen}
                  data-testid={`staff-edit-special-program-card-${programName}`}
                  onClick={() => setActiveOverlay({ type: 'special-program', programName })}
                  className={cn(
                    'mt-1 w-full rounded-xl border border-border bg-muted/20 p-3 text-left transition-colors',
                    canOpen ? 'hover:bg-muted/35' : 'cursor-wait opacity-80'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{programName} configuration</div>
                      <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                        {isLoading
                          ? 'Loading…'
                          : summary?.exists
                            ? summary.displayText
                            : 'Not configured.'}
                      </div>
                      {showUnsavedHint ? (
                        <div className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          Unsaved changes. Save to apply.
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 pt-0.5 text-muted-foreground">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )

  return (
    <>
      <Dialog
        open={true}
        onOpenChange={() => {}}
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <DialogContent
          ref={dialogRef}
          className={cn(
            'max-w-lg max-h-[90vh] overflow-y-auto',
            'transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1)] will-change-transform',
            overlayOpen
              ? [
                  'pointer-events-none',
                  'brightness-[0.92] saturate-[0.85] contrast-[0.95]',
                  'h-[calc(100dvh-24px)] max-h-none overflow-hidden',
                ].join(' ')
              : null
          )}
          style={stageX ? { transform: `translate3d(${stageX}px, 0, 0)` } : undefined}
        >
          {overlayOpen ? (
            <div className="space-y-3">
              <div className="truncate text-sm font-semibold leading-tight">
                {name.trim() ? name.trim() : isNew ? 'New staff (draft)' : staff.name}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>Rank: {rank}</div>
                <div>Status: {status}</div>
                {team ? <div>Team: {team}</div> : <div>Team: —</div>}
                {specialProgram.length > 0 ? <div className="truncate">Programs: {specialProgram.join(', ')}</div> : <div>Programs: —</div>}
              </div>
              {activeOverlay?.type === 'spt' ? (
                <div className="pt-2 text-xs text-muted-foreground">SPT config open…</div>
              ) : activeOverlay?.type === 'special-program' ? (
                <div className="pt-2 text-xs text-muted-foreground">{activeOverlay.programName} config open…</div>
              ) : null}
            </div>
          ) : null}

          <div className={overlayOpen ? 'hidden' : undefined}>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>{isNew ? 'Add New Staff' : 'Edit Staff'}</DialogTitle>
                <button onClick={onCancel} className="rounded p-1 hover:bg-accent" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">
                    Staff Name <span className="text-destructive">*</span>
                  </Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
                </div>

                <div>
                  <Label>
                    Rank <span className="text-destructive">*</span>
                  </Label>
                  <Select value={rank} onValueChange={(value) => setRank(value as StaffRank)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RANKS.map((currentRank) => (
                        <SelectItem key={currentRank} value={currentRank}>
                          {currentRank}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {rank === 'PCA' ? (
                <>
                  <hr className="border-border" />
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    PCA configuration
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <Label>
                        Assignment type <span className="text-destructive">*</span>
                      </Label>
                      <Select value={floating ? 'floating' : 'non-floating'} onValueChange={(value) => setFloating(value === 'floating')}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="non-floating">Non-floating</SelectItem>
                          <SelectItem value="floating">Floating</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {!floating ? renderTeamField(false) : null}

                    <div>
                      <Label>
                        Floor PCA
                        {isFloorPCARequired() ? <span className="text-destructive"> *</span> : null}
                      </Label>
                      <Select
                        value={floorPCA ?? '__none__'}
                        onValueChange={(value) => setFloorPCA(value === '__none__' ? null : (value as 'upper' | 'lower' | 'both'))}
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
                      {!floating ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Optional for non-floating PCA.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {rank === 'SPT' ? (
                <>
                  <hr className="border-border" />
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SPT configuration
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <Label>SPT allocation</Label>
                      <button
                        type="button"
                        disabled={!canOpenSptSheet}
                        data-testid="staff-edit-spt-card"
                        onClick={() => setActiveOverlay({ type: 'spt' })}
                        className={cn(
                          'mt-1 w-full rounded-xl border border-border bg-muted/20 p-3 text-left transition-colors',
                          canOpenSptSheet ? 'hover:bg-muted/35' : 'cursor-not-allowed opacity-60'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            {loadingSPTData ? (
                              <div className="text-sm text-muted-foreground">Loading…</div>
                            ) : sptSummary?.exists ? (
                              <>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                                  <span>{sptSummary.specialty ? `Specialty: ${sptSummary.specialty}` : 'Specialty: —'}</span>
                                  {sptSummary.isRbipSupervisor ? (
                                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                                      <span>·</span>
                                      <span>RBIP Supervisor</span>
                                      <span className="text-yellow-500" title="RBIP Supervisor">
                                        ★
                                      </span>
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {teamSummaryLabel} {' · '} {weekdaySummaryLabel}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-sm font-medium">Not configured</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Configure specialty, RBIP supervisor, teams, and weekday slots.
                                </div>
                              </>
                            )}
                            {sptHasUnsavedChanges ? (
                              <div className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                Unsaved changes. Save to apply.
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 pt-0.5 text-muted-foreground">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      </button>
                    </div>

                    {renderTeamField(true)}
                    {renderSpecialProgramField()}
                  </div>
                </>
              ) : null}

              {['APPT', 'RPT', 'workman'].includes(rank) ? (
                <>
                  <hr className="border-border" />
                  <div className="space-y-4">
                    {renderTeamField(true)}
                    {renderSpecialProgramField()}
                  </div>
                </>
              ) : null}

              {rank === 'PCA' ? (
                <>
                  <hr className="border-border" />
                  {renderSpecialProgramField()}
                </>
              ) : null}

              <hr className="border-border" />
              <div>
                <Label className="mb-2 block">Status</Label>
                <div className="flex flex-wrap gap-2">
                  {(['active', 'inactive', 'buffer'] as const).map((currentStatus) => {
                    const selected = status === currentStatus
                    const badgeClass = selected
                      ? currentStatus === 'active'
                        ? 'bg-green-500 hover:bg-green-600 text-white border-transparent'
                        : currentStatus === 'inactive'
                          ? 'bg-gray-400 hover:bg-gray-500 text-white border-transparent'
                          : 'bg-[#a4b1ed] hover:bg-[#8b9ae8] text-white border-transparent'
                      : 'border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                    return (
                      <button
                        key={currentStatus}
                        type="button"
                        onClick={() => setStatus(currentStatus)}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
                          badgeClass
                        )}
                      >
                        {currentStatus === 'active' ? 'Active' : currentStatus === 'inactive' ? 'Inactive' : 'Buffer'}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Active: staff appears in allocations and schedule. Inactive: hidden from allocations. Buffer: temporary staff with custom FTE.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveBlockedByDraftLoad}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {mounted && overlayOpen
        ? createPortal(
            <button
              type="button"
              onClick={closeOverlay}
              className={cn(
                'fixed left-0 top-1/2 -translate-y-1/2 z-[70]',
                'group h-40 w-10 px-2 rounded-r-xl border border-border bg-background shadow-sm hover:bg-muted/30'
              )}
              aria-label="Back to staff edit"
            >
              <span
                className={cn(
                  'block text-[11px] font-semibold text-muted-foreground',
                  'group-hover:text-foreground',
                  '[writing-mode:vertical-rl] rotate-180'
                )}
              >
                Edit staff · {draftStaffName}
              </span>
            </button>,
            document.body
          )
        : null}

      {canOpenSptSheet ? (
        <StaffEditOverlaySheet
          open={sptSheetOpen}
          onOpenChange={(open) => {
            if (!open) closeOverlay()
            else setActiveOverlay({ type: 'spt' })
          }}
          closeOnBackdrop={false}
          closeOnEscape={false}
          title={`SPT allocation — ${draftStaffName}`}
          widthClassName="max-w-xl"
        >
          <StaffEditDialogSPTOverlay
            staff={{ ...(staff as Staff), id: staff.id as string, name: draftStaffName } as Staff}
            allocation={sptDraft ?? { staff_id: staff.id as string }}
            showUnsavedHint={sptHasUnsavedChanges}
            onDone={closeOverlay}
            onSaved={(allocation) => {
              setSptDraft(allocation)
            }}
          />
        </StaffEditOverlaySheet>
      ) : null}

      {specialProgramOverlayName ? (
        <StaffEditOverlaySheet
          open={activeOverlay?.type === 'special-program'}
          onOpenChange={(open) => {
            if (!open) closeOverlay()
            else setActiveOverlay({ type: 'special-program', programName: specialProgramOverlayName })
          }}
          closeOnBackdrop={false}
          closeOnEscape={false}
          title={`${specialProgramOverlayName} configuration — ${draftStaffName}`}
          widthClassName="max-w-2xl"
        >
          <StaffEditDialogSpecialProgramOverlay
            staffName={draftStaffName}
            programName={specialProgramOverlayName}
            initialConfig={specialProgramDrafts[specialProgramOverlayName] ?? createEmptySpecialProgramConfig()}
            showUnsavedHint={!!specialProgramDirtyMap[specialProgramOverlayName]}
            onDone={closeOverlay}
            onSaved={(config) => {
              setSpecialProgramDrafts((prev) => ({
                ...prev,
                [specialProgramOverlayName]: config,
              }))
            }}
          />
        </StaffEditOverlaySheet>
      ) : null}
    </>
  )
}
