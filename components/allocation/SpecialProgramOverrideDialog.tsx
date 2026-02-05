'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Staff, StaffRank, Team, Weekday, SpecialProgram as StaffSpecialProgram } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { AlertCircle, Edit2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BufferStaffCreateDialog } from './BufferStaffCreateDialog'
import { SpecialProgramSubstitutionDialog } from '@/components/allocation/SpecialProgramSubstitutionDialog'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { HorizontalCardCarousel } from '@/components/ui/horizontal-card-carousel'

interface SpecialProgramOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  specialPrograms: SpecialProgram[]
  allStaff: Staff[]
  // Base SPT FTE for this weekday (from dashboard `spt_allocations.fte_addon`)
  // Used to avoid defaulting SPT to 1.0 in availability checks.
  sptBaseFteByStaffId?: Record<string, number>
  staffOverrides: Record<string, {
    leaveType?: any
    fteRemaining?: number
    availableSlots?: number[]
    specialProgramAvailable?: boolean
    specialProgramOverrides?: Array<{
      programId: string
      therapistId?: string
      pcaId?: string
      slots?: number[]
      therapistFTESubtraction?: number
      pcaFTESubtraction?: number
      drmAddOn?: number
    }>
  }>
  weekday: Weekday
  onConfirm: (overrides: Record<string, {
    fteRemaining?: number
    availableSlots?: number[]
    specialProgramOverrides?: Array<{
      programId: string
      therapistId?: string
      pcaId?: string
      slots?: number[]
      therapistFTESubtraction?: number
      pcaFTESubtraction?: number
      drmAddOn?: number
    }>
  }>) => void
  onSkip: () => void
  onStaffRefresh?: () => void  // Callback to refresh staff list after buffer creation
}

interface ProgramOverride {
  programId: string
  therapistId?: string
  pcaId?: string
  slots?: number[]
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
}

export function SpecialProgramOverrideDialog({
  open,
  onOpenChange,
  specialPrograms,
  allStaff,
  sptBaseFteByStaffId,
  staffOverrides,
  weekday,
  onConfirm,
  onSkip,
  onStaffRefresh,
}: SpecialProgramOverrideDialogProps) {
  // State for each program's overrides
  const [programOverrides, setProgramOverrides] = useState<Record<string, ProgramOverride>>({})
  
  // State for edit dialogs
  const [editingTherapist, setEditingTherapist] = useState<{ programId: string } | null>(null)
  const [editingPCA, setEditingPCA] = useState<{ programId: string } | null>(null)
  
  // State for pending buffer staff auto-selection (after creation)
  const [pendingBufferStaffSelection, setPendingBufferStaffSelection] = useState<{
    staffId: string
    programId: string
    type: 'therapist' | 'pca'
  } | null>(null)
  
  // State for substitution dropdowns
  const [substitutionDropdownOpen, setSubstitutionDropdownOpen] = useState<Record<string, { type: 'therapist' | 'pca' } | null>>({})
  
  // Refs for dropdown click-outside detection
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({})
  
  // State for substitution selection dialog
  const [substitutionDialogOpen, setSubstitutionDialogOpen] = useState(false)
  const [substitutionDialogConfig, setSubstitutionDialogConfig] = useState<{
    staffType: 'therapist' | 'pca'
    programName: string
    programId: string
    requiredSlots?: number[]
    minRequiredFTE?: number
    sourceType: 'existing' | 'buffer' | 'inactive'
  } | null>(null)
  
  // State for buffer staff creation
  const [showBufferCreateDialog, setShowBufferCreateDialog] = useState(false)
  const [pendingSubstitutionType, setPendingSubstitutionType] = useState<'therapist' | 'pca' | null>(null)
  const [pendingProgramName, setPendingProgramName] = useState<string | null>(null)
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null)
  const [pendingRequiredSlots, setPendingRequiredSlots] = useState<number[] | null>(null)
  const [pendingMinRequiredFTE, setPendingMinRequiredFTE] = useState<number | null>(null)
  
  // Buffer staff meta captured at creation time (needed to preserve availability for Step 3)
  const [createdBufferMetaByStaffId, setCreatedBufferMetaByStaffId] = useState<Record<string, { availableSlots?: number[]; fteRemaining?: number }>>({})

  // Filter active programs for current weekday
  const activePrograms = useMemo(() => {
    return specialPrograms.filter(p => p.weekdays.includes(weekday))
  }, [specialPrograms, weekday])

  // Special programs slots are stored in DB as a per-staff map:
  // { [staffId]: { mon?: number[]; tue?: number[]; ... } }
  // Older/idealized code expects: { mon: number[]; tue: number[]; ... }.
  // This helper supports BOTH shapes and returns a program-level slot list for the given weekday.
  const getProgramSlotsForWeekday = (
    program: SpecialProgram,
    day: Weekday,
    therapistId?: string,
    pcaId?: string
  ): number[] => {
    const rawSlots: any = (program as any).slots
    if (!rawSlots) return []

    // Shape A: weekday-keyed
    const direct = rawSlots?.[day]
    if (Array.isArray(direct)) {
      return (direct as any[]).filter((s) => typeof s === 'number').sort()
    }

    // Shape B: staffId-keyed
    const candidates = [pcaId, therapistId, ...(program.staff_ids || [])].filter(Boolean) as string[]
    for (const staffId of candidates) {
      const staffDaySlots = rawSlots?.[staffId]?.[day]
      if (Array.isArray(staffDaySlots)) {
        return (staffDaySlots as any[]).filter((s) => typeof s === 'number').sort()
      }
    }

    // Fallback: union across all staff configs for this weekday
    const set = new Set<number>()
    Object.values(rawSlots).forEach((v: any) => {
      const daySlots = v?.[day]
      if (Array.isArray(daySlots)) {
        daySlots.forEach((s: any) => {
          if (typeof s === 'number') set.add(s)
        })
      }
    })
    return Array.from(set).sort()
  }

  // Use the dashboard-configured values for THIS weekday (independent of who substitutes).
  // - Slots/FTE in DB are sometimes staffId-keyed, so we pick the staff member(s) with a
  //   non-zero weekday entry (when available) to derive the "configured" baseline.
  // - Exception: CRP therapist subtraction may be explicitly configured as 0 (meaningful).
  const getConfiguredTherapistFTESubtractionForWeekday = (
    program: SpecialProgram,
    day: Weekday
  ): number | undefined => {
    const therapistIds = (program.staff_ids || []).filter((id) => {
      const s = allStaff.find(st => st.id === id)
      return !!s && ['SPT', 'APPT', 'RPT'].includes(s.rank)
    })

    let best: number | undefined
    for (const id of therapistIds) {
      const rawByStaff: any = (program as any).fte_subtraction?.[id]
      const hasDayKey =
        rawByStaff && typeof rawByStaff === 'object' && Object.prototype.hasOwnProperty.call(rawByStaff, day)
      const fte = hasDayKey ? rawByStaff[day] : undefined

      if (program.name === 'CRP') {
        if (typeof fte === 'number' && fte >= 0) {
          best = best === undefined ? fte : Math.max(best, fte)
        }
      } else {
        if (typeof fte === 'number' && fte > 0) {
          best = best === undefined ? fte : Math.max(best, fte)
        }
      }
    }
    return best
  }

  const getConfiguredPCAFTESubtractionForWeekday = (
    program: SpecialProgram,
    day: Weekday
  ): number | undefined => {
    const pcaIds = (program.staff_ids || []).filter((id) => {
      const s = allStaff.find(st => st.id === id)
      return !!s && s.rank === 'PCA'
    })

    let best: number | undefined
    for (const id of pcaIds) {
      const fte = (program as any).fte_subtraction?.[id]?.[day]
      if (typeof fte === 'number' && fte > 0) {
        best = best === undefined ? fte : Math.max(best, fte)
      }
    }
    return best
  }

  const getConfiguredProgramSlotsForWeekday = (
    program: SpecialProgram,
    day: Weekday
  ): number[] => {
    // Prefer staff with non-zero weekday FTE entry (when available), since that typically
    // represents the "assigned runner" from dashboard config.
    const configuredTherapistId = (program.staff_ids || []).find((id) => {
      const s = allStaff.find(st => st.id === id)
      if (!s) return false
      if (!['SPT', 'APPT', 'RPT'].includes(s.rank)) return false
      const rawByStaff: any = (program as any).fte_subtraction?.[id]
      const hasDayKey =
        rawByStaff && typeof rawByStaff === 'object' && Object.prototype.hasOwnProperty.call(rawByStaff, day)
      const fte = hasDayKey ? rawByStaff[day] : undefined
      if (program.name === 'CRP') {
        // CRP can have explicit 0; treat that as the configured runner.
        return typeof fte === 'number' && fte >= 0
      }
      return typeof fte === 'number' && fte > 0
    })

    const configuredPcaId = (program.staff_ids || []).find((id) => {
      const s = allStaff.find(st => st.id === id)
      if (!s) return false
      if (s.rank !== 'PCA') return false
      const fte = (program as any).fte_subtraction?.[id]?.[day] ?? 0
      return typeof fte === 'number' && fte > 0
    })

    return getProgramSlotsForWeekday(program, day, configuredTherapistId, configuredPcaId)
  }

  const getMinRequiredFTEForProgram = (
    program: SpecialProgram,
    type: 'therapist' | 'pca',
    currentOverride?: ProgramOverride,
    requiredSlots?: number[]
  ): number => {
    if (type === 'therapist') {
      if (program.name === 'Robotic') return 0
      return (
        currentOverride?.therapistFTESubtraction ??
        getConfiguredTherapistFTESubtractionForWeekday(program, weekday) ??
        0
      )
    }

    // PCA
    if (program.name === 'DRM') return 0
    const slots = requiredSlots ?? currentOverride?.slots ?? getConfiguredProgramSlotsForWeekday(program, weekday)
    if (program.name === 'Robotic' || program.name === 'CRP') {
      return (slots?.length ?? 0) * 0.25
    }
    return (
      currentOverride?.pcaFTESubtraction ??
      getConfiguredPCAFTESubtractionForWeekday(program, weekday) ??
      0
    )
  }

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(substitutionDropdownOpen).forEach(key => {
        const ref = dropdownRefs.current[key]
        if (ref && !ref.contains(event.target as Node)) {
          setSubstitutionDropdownOpen(prev => {
            const newState = { ...prev }
            delete newState[key]
            return newState
          })
        }
      })
    }

    if (Object.keys(substitutionDropdownOpen).length > 0) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [substitutionDropdownOpen])

  // Initialize program overrides from existing staffOverrides or dashboard config
  useEffect(() => {
    if (!open) return

    const initialOverrides: Record<string, ProgramOverride> = {}
    
    activePrograms.forEach(program => {
      // First, check if there are existing overrides in staffOverrides
      // The override can be stored on either the therapist or PCA staff member
      // We need to search through ALL staff overrides and collect all pieces for this program
      let foundTherapistId: string | undefined
      let foundPCAId: string | undefined
      let foundSlots: number[] | undefined
      let foundTherapistFTE: number | undefined
      let foundPCAFTE: number | undefined
      let foundDRMAddOn: number | undefined
      
      for (const [staffId, override] of Object.entries(staffOverrides)) {
        if (override.specialProgramOverrides) {
          const programOverride = override.specialProgramOverrides.find(
            o => o.programId === program.id
          )
          
          if (programOverride) {
            // Collect all override data (may be split across therapist and PCA)
            if (programOverride.therapistId !== undefined) {
              foundTherapistId = programOverride.therapistId
            }
            if (programOverride.therapistFTESubtraction !== undefined) {
              foundTherapistFTE = programOverride.therapistFTESubtraction
            }
            if (programOverride.pcaId !== undefined) {
              foundPCAId = programOverride.pcaId
            }
            if (programOverride.pcaFTESubtraction !== undefined) {
              foundPCAFTE = programOverride.pcaFTESubtraction
            }
            if (programOverride.slots !== undefined) {
              foundSlots = programOverride.slots
            }
            if (programOverride.drmAddOn !== undefined) {
              foundDRMAddOn = programOverride.drmAddOn
            }
          }
        }
      }

      // If we found any existing override data, use it
      if (foundTherapistId || foundPCAId || foundSlots || foundDRMAddOn !== undefined) {
        const existingOverride: ProgramOverride = {
          programId: program.id,
          therapistId: foundTherapistId,
          pcaId: foundPCAId,
          slots: foundSlots,
          therapistFTESubtraction: foundTherapistFTE,
          pcaFTESubtraction: foundPCAFTE,
          drmAddOn: foundDRMAddOn,
        }
        
        // Fill in missing values from program config if needed
        if (existingOverride.slots == null && program.name !== 'DRM') {
          // Use weekday-configured slots (independent of substituted staffId)
          existingOverride.slots = getConfiguredProgramSlotsForWeekday(program, weekday)
        }
        
        // Auto-calculate PCA FTE for Robotic/CRP if slots are set
        if ((program.name === 'Robotic' || program.name === 'CRP') && existingOverride.slots) {
          existingOverride.pcaFTESubtraction = existingOverride.slots.length * 0.25
        }

        // If an existing override is missing staff-id-keyed values, fall back to the weekday-configured baseline.
        if (program.name !== 'Robotic' && existingOverride.therapistFTESubtraction === undefined) {
          const configured = getConfiguredTherapistFTESubtractionForWeekday(program, weekday)
          if (configured !== undefined) {
            existingOverride.therapistFTESubtraction = configured
          }
        }
        if (program.name !== 'DRM' && program.name !== 'Robotic' && program.name !== 'CRP' && existingOverride.pcaFTESubtraction === undefined) {
          const configured = getConfiguredPCAFTESubtractionForWeekday(program, weekday)
          if (configured !== undefined) {
            existingOverride.pcaFTESubtraction = configured
          }
        }
        
        // If DRM add-on wasn't in override, use default
        if (program.name === 'DRM' && existingOverride.drmAddOn === undefined) {
          existingOverride.drmAddOn = 0.4
        }
        
        initialOverrides[program.id] = existingOverride
        return
      }

      // Otherwise, build from dashboard config
      // Find therapist from preference order, or fallback to first available therapist
      let therapistId: string | undefined
      const therapistPrefOrder = program.therapist_preference_order

      // Prefer the therapist configured in dashboard for THIS weekday.
      // In dashboard config, a therapist "assigned" to a program/day has a non-zero fte_subtraction entry.
      // This avoids picking some other available therapist who merely has the program property.
      if (!therapistId && program.staff_ids && program.fte_subtraction) {
        const configuredTherapistIdsWithFte = program.staff_ids.filter(id => {
          const staff = allStaff.find(s => s.id === id)
          if (!staff) return false
          if (!['SPT', 'APPT', 'RPT'].includes(staff.rank)) return false
          const rawByStaff: any = (program as any).fte_subtraction?.[id]
          const hasWeekdayKey =
            rawByStaff && typeof rawByStaff === 'object' && Object.prototype.hasOwnProperty.call(rawByStaff, weekday)
          const fte = hasWeekdayKey ? rawByStaff[weekday] : undefined
          if (program.name === 'CRP') {
            // CRP can be configured with 0 therapist FTE subtraction (still a real "runner")
            return typeof fte === 'number' && fte >= 0
          }
          return typeof fte === 'number' && fte > 0
        })

        // CRP legacy support: if fte_subtraction omits explicit 0 entries, infer configured runner(s)
        // from staffId-keyed slots for this weekday.
        const configuredTherapistIdsForSelection =
          program.name === 'CRP' && configuredTherapistIdsWithFte.length === 0
            ? (program.staff_ids || []).filter((id) => {
                const staff = allStaff.find(s => s.id === id)
                if (!staff) return false
                if (!['SPT', 'APPT', 'RPT'].includes(staff.rank)) return false
                const rawSlots: any = (program as any).slots
                const daySlots = rawSlots?.[id]?.[weekday]
                return Array.isArray(daySlots) && daySlots.length > 0
              })
            : configuredTherapistIdsWithFte

        if (configuredTherapistIdsForSelection.length > 0) {
          // If preference order has entries, use it to break ties among configured therapists
          const prefIds = therapistPrefOrder ? Object.values(therapistPrefOrder).flat() : []
          const orderedIds = prefIds.length > 0
            ? prefIds.filter(id => configuredTherapistIdsForSelection.includes(id))
            : configuredTherapistIdsForSelection

          for (const id of orderedIds) {
            const staff = allStaff.find(s => s.id === id)
            if (staff && isTherapistAvailable(staff, program.name)) {
              therapistId = id
              break
            }
          }

          // If none matched preference order (or no pref order), pick first available configured therapist
          if (!therapistId) {
            for (const id of configuredTherapistIdsForSelection) {
              const staff = allStaff.find(s => s.id === id)
              if (staff && isTherapistAvailable(staff, program.name)) {
                therapistId = id
                break
              }
            }
          }
        }
      }
      
      // For CRP: no automatic fallback - if configured therapist is not available, show substitution alert.
      // For other programs: Try preference order if available.
      if (!therapistId && therapistPrefOrder && program.name !== 'CRP') {
        for (const team of Object.keys(therapistPrefOrder) as Team[]) {
          const teamPrefs = therapistPrefOrder[team] || []
          for (const staffId of teamPrefs) {
            const staff = allStaff.find(s => s.id === staffId)
            if (staff && isTherapistAvailable(staff, program.name)) {
              therapistId = staffId
              break
            }
          }
          if (therapistId) break
        }
      }
      
      // If no therapist found from preference order, try to find any available therapist
      // Skip this fallback for CRP - user must manually select substitution.
      if (!therapistId && program.name !== 'CRP') {
        const availableTherapists = getAvailableTherapists(program.name)
        if (availableTherapists.length > 0) {
          therapistId = availableTherapists[0].id
        }
      }

      // Find PCA from preference order
      let pcaId: string | undefined
      const pcaPrefOrder = program.pca_preference_order || []
      // Use weekday-configured slots (independent of substituted staffId)
      const requiredSlotsForPca = program.name === 'DRM'
        ? []
        : getConfiguredProgramSlotsForWeekday(program, weekday)
      for (const staffId of pcaPrefOrder) {
        const staff = allStaff.find(s => s.id === staffId)
        if (staff && isPCAAvailable(staff, requiredSlotsForPca)) {
          pcaId = staffId
          break
        }
      }

      // Get slots from program config
      const slots = program.name === 'DRM'
        ? []
        : getConfiguredProgramSlotsForWeekday(program, weekday)

      // Get FTE subtractions
      let therapistFTESubtraction: number | undefined =
        program.name === 'Robotic'
          ? undefined
          : getConfiguredTherapistFTESubtractionForWeekday(program, weekday)
      if (program.name === 'CRP' && therapistId && therapistFTESubtraction === undefined) {
        // Legacy support: if dashboard omitted explicit 0 entries, treat configured CRP therapist as 0 subtraction.
        therapistFTESubtraction = 0
      }

      let pcaFTESubtraction: number | undefined
      
      // Auto-calculate PCA FTE for Robotic/CRP based on slots
      if (program.name === 'Robotic' || program.name === 'CRP') {
        pcaFTESubtraction = slots.length * 0.25
      } else {
        pcaFTESubtraction = getConfiguredPCAFTESubtractionForWeekday(program, weekday)
      }

      // DRM add-on (default 0.4)
      const drmAddOn = program.name === 'DRM' ? 0.4 : undefined

      initialOverrides[program.id] = {
        programId: program.id,
        therapistId: program.name === 'Robotic' ? undefined : therapistId,
        pcaId: program.name === 'DRM' ? undefined : pcaId,
        slots: program.name === 'DRM' ? undefined : slots,
        therapistFTESubtraction,
        pcaFTESubtraction,
        drmAddOn,
      }
    })

    setProgramOverrides(initialOverrides)
  }, [open, activePrograms, allStaff, staffOverrides, weekday])

  // Helper: Check if therapist is available
  const isTherapistAvailable = (staff: Staff, programName: string): boolean => {
    // Must have special program property
    if (!staff.special_program?.includes(programName as StaffSpecialProgram)) {
      return false
    }
    
    const override = staffOverrides[staff.id]
      const leaveType = override?.leaveType
      const isOnDuty = isOnDutyLeaveType(leaveType as any)

    // FTE remaining:
    // - Prefer explicit override.fteRemaining when present
    // - Otherwise default:
    //   - SPT: use dashboard-configured base FTE for this weekday (can be 0)
    //   - Others: 1.0 if on duty, 0 if on leave
    const fteRemaining =
      override?.fteRemaining ??
      (staff.rank === 'SPT'
        ? (sptBaseFteByStaffId?.[staff.id] ?? 0)
        : (isOnDuty ? 1.0 : 0))

    // Availability rule:
    // - Non-SPT: must have FTE > 0
    // - SPT: allow FTE = 0 ONLY when on duty (leaveType is null/undefined)
    if (fteRemaining <= 0) {
      if (!(staff.rank === 'SPT' && isOnDuty)) {
        return false
      }
    }
    
    // Must be available during special program slot (if override exists)
    if (override?.specialProgramAvailable !== undefined) {
      return override.specialProgramAvailable === true
    }
    
    // If no override, default to available (backward compatibility)
    return true
  }

  // Helper: Get available therapists for a program
  const getAvailableTherapists = (programName: string): Staff[] => {
    const therapists = allStaff.filter(s => {
      if (!['SPT', 'APPT', 'RPT'].includes(s.rank)) return false
      return isTherapistAvailable(s, programName)
    })

    // Sort by rank: SPT → APPT → RPT
    const rankOrder: Record<StaffRank, number> = { 'SPT': 1, 'APPT': 2, 'RPT': 3, 'PCA': 99, 'workman': 99 }
    therapists.sort((a, b) => {
      const rankDiff = (rankOrder[a.rank] || 99) - (rankOrder[b.rank] || 99)
      return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name)
    })

    return therapists
  }

  // Helper: Check if PCA is available
  const isPCAAvailable = (staff: Staff, requiredSlots: number[]): boolean => {
    if (staff.rank !== 'PCA') return false
    if (!staff.special_program) return false

    // IMPORTANT: This function is used for "existing staff" auto-pick + dropdown.
    // Inactive staff should never be surfaced here.
    // Buffer staff ARE allowed (per UI requirement) if they have compatible special_program + slots.
    if (staff.status === 'inactive') return false
    if (staff.active === false) return false

    // Must be on duty AND have base FTE > 0 (Step 1 overrides are source of truth).
    const override = staffOverrides[staff.id]
    const leaveTypeOnDuty = isOnDutyLeaveType((override as any)?.leaveType ?? null)
    if (!leaveTypeOnDuty) {
      return false
    }

    const effectiveFTE =
      typeof override?.fteRemaining === 'number'
        ? override.fteRemaining
        : staff.status === 'buffer' && typeof staff.buffer_fte === 'number'
          ? staff.buffer_fte
          : 1.0
    if (effectiveFTE <= 0) {
      return false
    }
    
    // Check if PCA has required slots available
    const availableSlots = staffOverrides[staff.id]?.availableSlots || [1, 2, 3, 4]
    const ok = requiredSlots.every(slot => availableSlots.includes(slot))

    return ok
  }

  // Helper: Get available PCAs for a program
  const getAvailablePCAs = (programName: string, requiredSlots: number[]): Staff[] => {
    const pcas = allStaff.filter(s => {
      if (s.rank !== 'PCA') return false
      if (!s.special_program?.includes(programName as StaffSpecialProgram)) return false
      return isPCAAvailable(s, requiredSlots)
    })

    // Sort: Floating first, then non-floating
    pcas.sort((a, b) => {
      if (a.floating !== b.floating) return a.floating ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return pcas
  }

  const handleTherapistEdit = (programId: string) => {
    setEditingTherapist({ programId })
  }

  const handlePCAEdit = (programId: string) => {
    setEditingPCA({ programId })
  }

  const handleTherapistSelect = (programId: string, therapistId: string) => {
    setProgramOverrides(prev => {
      const program = activePrograms.find(p => p.id === programId)
      const currentOverride = prev[programId] || { programId }
      if (!program) return prev

      const next: ProgramOverride = {
        ...currentOverride,
        therapistId,
      }

      // Persist configured slots (if they were only being derived implicitly).
      if (program.name !== 'DRM' && next.slots == null) {
        next.slots = getConfiguredProgramSlotsForWeekday(program, weekday)
      }

      // Copy dashboard-configured therapist FTE subtraction for this weekday (unless already set by user).
      if (program.name !== 'Robotic' && next.therapistFTESubtraction === undefined) {
        const configured = getConfiguredTherapistFTESubtractionForWeekday(program, weekday)
        if (configured !== undefined) {
          next.therapistFTESubtraction = configured
        }
      }

      return { ...prev, [programId]: next }
    })
    setEditingTherapist(null)
  }

  const handlePCASelect = (programId: string, pcaId: string) => {
    setProgramOverrides(prev => {
      const program = activePrograms.find(p => p.id === programId)
      const currentOverride = prev[programId] || { programId }
      if (!program) return prev

      const next: ProgramOverride = {
        ...currentOverride,
        pcaId,
      }

      // Slots should remain the configured weekday slots regardless of who substitutes.
      if (program.name !== 'DRM' && next.slots == null) {
        next.slots = getConfiguredProgramSlotsForWeekday(program, weekday)
      }

      // Copy dashboard-configured PCA FTE subtraction for this weekday (unless already set by user).
      // Robotic/CRP are always derived from slots.
      if (program.name === 'Robotic' || program.name === 'CRP') {
        next.pcaFTESubtraction = (next.slots?.length ?? 0) * 0.25
      } else if (program.name !== 'DRM' && next.pcaFTESubtraction === undefined) {
        const configured = getConfiguredPCAFTESubtractionForWeekday(program, weekday)
        if (configured !== undefined) {
          next.pcaFTESubtraction = configured
        }
      }

      return { ...prev, [programId]: next }
    })
    setEditingPCA(null)
  }

  // Auto-select buffer staff when it appears in allStaff after creation
  useEffect(() => {
    if (!pendingBufferStaffSelection) return
    
    const { staffId, programId, type } = pendingBufferStaffSelection
    
    // Check if the staff is now in allStaff
    const staffExists = allStaff.some(s => s.id === staffId)
    if (staffExists) {
      if (type === 'therapist') {
        handleTherapistSelect(programId, staffId)
      } else {
        handlePCASelect(programId, staffId)
      }
      setPendingBufferStaffSelection(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBufferStaffSelection, allStaff])

  const handleSubstitutionMenuClick = (programId: string, type: 'therapist' | 'pca', sourceType: 'existing' | 'buffer' | 'inactive') => {
    const program = activePrograms.find(p => p.id === programId)
    if (!program) return
    const currentOverride = programOverrides[programId]
    const requiredSlots = type === 'pca'
      ? (currentOverride?.slots ?? getConfiguredProgramSlotsForWeekday(program, weekday))
      : undefined
    const minRequiredFTE = getMinRequiredFTEForProgram(program, type, currentOverride, requiredSlots)

    if (sourceType === 'existing' || sourceType === 'buffer' || sourceType === 'inactive') {
      setSubstitutionDialogConfig({
        staffType: type,
        programName: program.name,
        programId,
        requiredSlots,
        minRequiredFTE,
        sourceType,
      })
      setSubstitutionDialogOpen(true)
      setSubstitutionDropdownOpen({})
    }
  }

  const handleCreateBufferStaff = (programId: string, type: 'therapist' | 'pca') => {
    const program = activePrograms.find(p => p.id === programId)
    if (!program) return
    const currentOverride = programOverrides[programId]
    const requiredSlots = type === 'pca'
      ? (currentOverride?.slots ?? getConfiguredProgramSlotsForWeekday(program, weekday))
      : null
    const minRequiredFTE = getMinRequiredFTEForProgram(program, type, currentOverride, requiredSlots ?? undefined)

    setPendingSubstitutionType(type)
    setPendingProgramName(program.name)
    setPendingProgramId(programId)
    setPendingRequiredSlots(requiredSlots)
    setPendingMinRequiredFTE(minRequiredFTE)
    setShowBufferCreateDialog(true)
    setSubstitutionDropdownOpen({})
  }


  const handleBufferStaffCreated = async (
    createdStaff?: Staff,
    meta?: { availableSlots?: number[]; bufferFTE?: number | null }
  ) => {
    try {
      // Close buffer creation dialog
      setShowBufferCreateDialog(false)
      
      // Refresh staff list if callback provided
      if (onStaffRefresh) {
        await Promise.resolve(onStaffRefresh())
      }

      // Capture buffer staff availability meta for Step 3 (floating buffer PCA MUST respect available slots)
      if (createdStaff && pendingSubstitutionType === 'pca') {
        const fteRemaining =
          typeof createdStaff.buffer_fte === 'number'
            ? createdStaff.buffer_fte
            : (typeof meta?.bufferFTE === 'number' ? meta?.bufferFTE : undefined)
        setCreatedBufferMetaByStaffId(prev => ({
          ...prev,
          [createdStaff.id]: {
            availableSlots: meta?.availableSlots,
            fteRemaining,
          }
        }))
      }

      // Auto-select the newly created buffer staff (per requirement)
      if (createdStaff && pendingProgramId && pendingSubstitutionType) {
        // Set pending selection - will be handled by useEffect when staff appears in allStaff
        setPendingBufferStaffSelection({
          staffId: createdStaff.id,
          programId: pendingProgramId,
          type: pendingSubstitutionType,
        })
      } else if (pendingProgramId && pendingSubstitutionType) {
        // Fallback: open substitution dialog if we don't have created staff details
        const program = activePrograms.find(p => p.id === pendingProgramId)
        if (program) {
          const currentOverride = programOverrides[pendingProgramId]
          const minRequiredFTE = getMinRequiredFTEForProgram(
            program,
            pendingSubstitutionType,
            currentOverride,
            pendingSubstitutionType === 'pca' ? (pendingRequiredSlots ?? undefined) : undefined
          )
          setSubstitutionDialogConfig({
            staffType: pendingSubstitutionType,
            programName: program.name,
            programId: pendingProgramId,
            requiredSlots: pendingSubstitutionType === 'pca' ? (pendingRequiredSlots ?? undefined) : undefined,
            minRequiredFTE,
            sourceType: 'buffer',
          })
          setSubstitutionDialogOpen(true)
        }
      }
    } finally {
      // Reset pending state
      setPendingSubstitutionType(null)
      setPendingProgramName(null)
      setPendingProgramId(null)
      setPendingRequiredSlots(null)
      setPendingMinRequiredFTE(null)
    }
  }

  const handleSubstitutionSelect = (selectedStaffId: string) => {
    if (!substitutionDialogConfig) return

    const { programId, staffType, sourceType } = substitutionDialogConfig

    if (staffType === 'therapist') {
      handleTherapistSelect(programId, selectedStaffId)
    } else {
      handlePCASelect(programId, selectedStaffId)
    }

    setSubstitutionDialogOpen(false)
    setSubstitutionDialogConfig(null)
  }

  const handleSlotToggle = (programId: string, slot: number) => {
    setProgramOverrides(prev => {
      const current = prev[programId]
      const currentSlots = current?.slots || []
      const newSlots = currentSlots.includes(slot)
        ? currentSlots.filter(s => s !== slot)
        : [...currentSlots, slot].sort()

      // Auto-calculate PCA FTE for Robotic/CRP
      const program = activePrograms.find(p => p.id === programId)
      const pcaFTE = (program?.name === 'Robotic' || program?.name === 'CRP')
        ? newSlots.length * 0.25
        : current?.pcaFTESubtraction

      return {
        ...prev,
        [programId]: {
          ...current,
          slots: newSlots,
          pcaFTESubtraction: pcaFTE,
        }
      }
    })
  }

  const handleConfirm = () => {
    // Convert programOverrides to staffOverrides format
    const overrides: Record<string, {
      fteRemaining?: number
      availableSlots?: number[]
      specialProgramOverrides?: Array<{
        programId: string
        therapistId?: string
        pcaId?: string
        slots?: number[]
        therapistFTESubtraction?: number
        pcaFTESubtraction?: number
        drmAddOn?: number
      }>
    }> = {}

    Object.values(programOverrides).forEach(override => {
      const program = activePrograms.find(p => p.id === override.programId)
      
      // Only add therapist override if not Robotic
      if (override.therapistId && program?.name !== 'Robotic') {
        if (!overrides[override.therapistId]) {
          overrides[override.therapistId] = { specialProgramOverrides: [] }
        }
        overrides[override.therapistId].specialProgramOverrides!.push({
          programId: override.programId,
          therapistId: override.therapistId,
          therapistFTESubtraction: override.therapistFTESubtraction,
        })
      }

      // PCA override logic (for Robotic, CRP, DRM, etc.)
      if (override.pcaId) {
        if (!overrides[override.pcaId]) {
          overrides[override.pcaId] = { specialProgramOverrides: [] }
        }
        
        // If this PCA was created as buffer staff in this dialog, persist its availability + base FTE into overrides.
        // This prevents Step 3 from treating it as whole-day available or as 1.0 FTE.
        const bufferMeta = createdBufferMetaByStaffId[override.pcaId]
        if (bufferMeta?.availableSlots) {
          overrides[override.pcaId].availableSlots = bufferMeta.availableSlots
        }
        if (typeof bufferMeta?.fteRemaining === 'number') {
          overrides[override.pcaId].fteRemaining = bufferMeta.fteRemaining
        }
        
        // Auto-calculate PCA FTE for Robotic/CRP if not already set
        let pcaFTE = override.pcaFTESubtraction
        if ((program?.name === 'Robotic' || program?.name === 'CRP') && override.slots) {
          pcaFTE = override.slots.length * 0.25
        }
        
        overrides[override.pcaId].specialProgramOverrides!.push({
          programId: override.programId,
          pcaId: override.pcaId,
          slots: override.slots,
          pcaFTESubtraction: pcaFTE,
        })
      }
    })

    onConfirm(overrides)
    onOpenChange(false)
  }

  const slotTimes: Record<number, string> = {
    1: '0900-1030',
    2: '1030-1200',
    3: '1330-1500',
    4: '1500-1630',
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Special Program Overrides – Step 2.0</DialogTitle>
            <DialogDescription>
              Configure special program assignments before algorithm runs
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden py-4 min-h-0 flex flex-col">
            {activePrograms.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No special programs active on this weekday.
              </div>
            ) : (
              <HorizontalCardCarousel recomputeKey={open}>
                {activePrograms.map((program) => {
                    const override = programOverrides[program.id] || {}
                    const therapist = override.therapistId ? allStaff.find(s => s.id === override.therapistId) : null
                    const pca = override.pcaId ? allStaff.find(s => s.id === override.pcaId) : null
                    const currentSlots = override.slots ?? getProgramSlotsForWeekday(program, weekday, override.therapistId, override.pcaId)
                    const availableTherapists = getAvailableTherapists(program.name)
                    const availablePCAs = getAvailablePCAs(program.name, currentSlots)
                    // For CRP: Check if configured therapist exists but is not available
                    let needsTherapistSubstitution = !therapist && availableTherapists.length === 0
                    if (program.name === 'CRP' && !therapist) {
                      // Check if there's a configured therapist in dashboard
                      const configuredTherapistIds = program.staff_ids?.filter(id => {
                        const staff = allStaff.find(s => s.id === id)
                        if (!staff) return false
                        if (!['SPT', 'APPT', 'RPT'].includes(staff.rank)) return false
                        const fte = program.fte_subtraction?.[id]?.[weekday] ?? 0
                        return fte > 0
                      }) || []
                      if (configuredTherapistIds.length > 0) {
                        // Check if configured therapist is available
                        const configuredTherapist = allStaff.find(s => s.id === configuredTherapistIds[0])
                        if (configuredTherapist && !isTherapistAvailable(configuredTherapist, program.name)) {
                          needsTherapistSubstitution = true
                        }
                      }
                    }
                    const needsPCASubstitution_oldRule = !pca && program.name !== 'DRM' && availablePCAs.length === 0
                    const availableFloatingPCAsCount = availablePCAs.filter(p => p.floating).length
                    const availableNonFloatingPCAsCount = availablePCAs.filter(p => !p.floating).length
                    const needsPCASubstitution_whenOnlyNonFloating =
                      !pca && program.name !== 'DRM' && availablePCAs.length > 0 && availableFloatingPCAsCount === 0
                    // New behavior (per user request):
                    // If only NON-floating candidates remain, surface substitution controls so user can pick buffer instead.
                    // Also show substitution controls when there are no candidates at all.
                    const showPCASubstitutionControls =
                      program.name !== 'DRM' &&
                      availableFloatingPCAsCount === 0 &&
                      !(pca && pca.floating)

                    const isEditingTherapist = editingTherapist?.programId === program.id
                    const isEditingPCA = editingPCA?.programId === program.id
                    const substitutionDropdownKey = `${program.id}-therapist`
                    const isCRPThursday = program.name === 'CRP' && weekday === 'thu'
                    const pcaFTESubtraction = (program.name === 'Robotic' || program.name === 'CRP') && currentSlots
                      ? currentSlots.length * 0.25
                      : override.pcaFTESubtraction

                    return (
                      <Card
                        key={program.id}
                        className="min-w-[360px] max-w-[420px] w-[min(420px,calc(100vw-120px))] flex-shrink-0 max-h-[80vh] overflow-y-auto"
                      >
                        <CardHeader>
                          <CardTitle>{program.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Therapist Section - Skip for Robotic */}
                          {program.name !== 'Robotic' && (
                            <div className="space-y-2">
                              <Label>Therapist</Label>
                        {therapist ? (
                          <div className="flex items-center justify-between p-2 border rounded">
                            <span>{therapist.name} ({therapist.rank})</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTherapistEdit(program.id)}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          </div>
                        ) : needsTherapistSubstitution ? (
                          <div className="flex items-center gap-2 p-2 border border-yellow-200 bg-yellow-50 rounded">
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                            <span className="flex-1 text-sm">Substitution needed</span>
                            <div 
                              className="relative"
                              ref={(el) => { dropdownRefs.current[substitutionDropdownKey] = el }}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSubstitutionDropdownOpen(prev => ({
                                  ...prev,
                                  [substitutionDropdownKey]: prev[substitutionDropdownKey] ? null : { type: 'therapist' }
                                }))}
                              >
                                Find Substitution <ChevronDown className="h-4 w-4 ml-1" />
                              </Button>
                              {substitutionDropdownOpen[substitutionDropdownKey] && (
                                <div className="absolute right-0 mt-1 w-48 bg-white border rounded-md shadow-lg z-10">
                                  <button
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                    onClick={() => handleSubstitutionMenuClick(program.id, 'therapist', 'existing')}
                                  >
                                    from existing staff
                                  </button>
                                  <button
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                    onClick={() => handleSubstitutionMenuClick(program.id, 'therapist', 'buffer')}
                                  >
                                    from buffer staff
                                  </button>
                                  <button
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                    onClick={() => handleSubstitutionMenuClick(program.id, 'therapist', 'inactive')}
                                  >
                                    from inactive staff
                                  </button>
                                  <button
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 border-t"
                                    onClick={() => handleCreateBufferStaff(program.id, 'therapist')}
                                  >
                                    create a buffer staff
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-2 border rounded">
                            <span className="text-muted-foreground">No therapist assigned</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTherapistEdit(program.id)}
                            >
                              Select
                            </Button>
                          </div>
                        )}

                        {isEditingTherapist && (
                          <div className="p-3 border rounded space-y-2">
                            <Label>Select Therapist</Label>
                            <select
                              className="w-full max-w-[320px] px-3 py-2 border rounded-md"
                              value={override.therapistId || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleTherapistSelect(program.id, e.target.value)
                                }
                              }}
                            >
                              <option value="">-- Select Therapist --</option>
                              {availableTherapists.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.rank})
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingTherapist(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}

                              {/* Therapist FTE Subtraction */}
                              <div>
                                <Label htmlFor={`therapist-fte-${program.id}`}>
                                  {program.name === 'DRM' 
                                    ? 'Therapist FTE Subtraction by Special Program'
                                    : 'FTE Subtraction by Special Program'}
                                </Label>
                                {isCRPThursday ? (
                                  <div className="flex items-center gap-4 mt-2">
                                    <Button
                                      type="button"
                                      variant={override.therapistFTESubtraction === 0.25 ? "default" : "outline"}
                                      onClick={() => setProgramOverrides(prev => ({
                                        ...prev,
                                        [program.id]: {
                                          ...prev[program.id],
                                          therapistFTESubtraction: 0.25,
                                        }
                                      }))}
                                    >
                                      0.25
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={override.therapistFTESubtraction === 0.4 ? "default" : "outline"}
                                      onClick={() => setProgramOverrides(prev => ({
                                        ...prev,
                                        [program.id]: {
                                          ...prev[program.id],
                                          therapistFTESubtraction: 0.4,
                                        }
                                      }))}
                                    >
                                      0.4
                                    </Button>
                                    <span className="text-xs text-muted-foreground">(Thursday only)</span>
                                  </div>
                                ) : (
                                  <Input
                                    id={`therapist-fte-${program.id}`}
                                    type="number"
                                    step="0.01"
                                    value={override.therapistFTESubtraction ?? ''}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value) || 0
                                      setProgramOverrides(prev => ({
                                        ...prev,
                                        [program.id]: {
                                          ...prev[program.id],
                                          therapistFTESubtraction: value,
                                        }
                                      }))
                                    }}
                                    className="mt-1 max-w-[180px]"
                                  />
                                )}
                              </div>
                            </div>
                          )}

                      {/* PCA Section (skip for DRM) */}
                      {program.name !== 'DRM' && (
                        <div className="space-y-2">
                          <Label>PCA</Label>
                          {pca ? (
                            <div className="flex items-center justify-between p-2 border rounded">
                              <span>{pca.name} ({pca.floating ? 'Floating' : 'Non-floating'})</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePCAEdit(program.id)}
                              >
                                <Edit2 className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between p-2 border rounded">
                              <span className="text-muted-foreground">No PCA assigned</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePCAEdit(program.id)}
                              >
                                Select
                              </Button>
                            </div>
                          )}

                          {showPCASubstitutionControls && (
                            <div className="flex items-center gap-2 p-2 border border-yellow-200 bg-yellow-50 rounded">
                              <AlertCircle className="h-5 w-5 text-yellow-500" />
                              <span className="flex-1 text-sm">Substitution needed</span>
                              <div
                                className="relative"
                                ref={(el) => { dropdownRefs.current[`${program.id}-pca`] = el }}
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSubstitutionDropdownOpen(prev => ({
                                    ...prev,
                                    [`${program.id}-pca`]: prev[`${program.id}-pca`] ? null : { type: 'pca' }
                                  }))}
                                >
                                  Find Substitution <ChevronDown className="h-4 w-4 ml-1" />
                                </Button>
                                {substitutionDropdownOpen[`${program.id}-pca`] && (
                                  <div className="absolute right-0 mt-1 w-48 bg-white border rounded-md shadow-lg z-10">
                                    <button
                                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                      onClick={() => handleSubstitutionMenuClick(program.id, 'pca', 'existing')}
                                    >
                                      from existing staff
                                    </button>
                                    <button
                                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                      onClick={() => handleSubstitutionMenuClick(program.id, 'pca', 'buffer')}
                                    >
                                      from buffer staff
                                    </button>
                                    <button
                                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                      onClick={() => handleSubstitutionMenuClick(program.id, 'pca', 'inactive')}
                                    >
                                      from inactive staff
                                    </button>
                                    <button
                                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 border-t"
                                      onClick={() => handleCreateBufferStaff(program.id, 'pca')}
                                    >
                                      create a buffer staff
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {isEditingPCA && (
                            <div className="p-3 border rounded space-y-2">
                              <Label>Select PCA</Label>
                              <select
                                className="w-full max-w-[320px] px-3 py-2 border rounded-md"
                                value={override.pcaId || ''}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handlePCASelect(program.id, e.target.value)
                                  }
                                }}
                              >
                                <option value="">-- Select PCA --</option>
                                {availablePCAs.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.status === 'buffer' ? 'Buffer ' : ''}{p.floating ? 'Floating' : 'Non-floating'})
                                  </option>
                                ))}
                              </select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingPCA(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}

                          {/* Slot Selection */}
                          <div>
                            <Label>Slots</Label>
                            <div className="grid grid-cols-4 gap-1.5 mt-2 w-full">
                              {[1, 2, 3, 4].map(slot => {
                                const isSelected = currentSlots.includes(slot)
                                const pcaAvailableSlots = override.pcaId ? (staffOverrides[override.pcaId]?.availableSlots || [1, 2, 3, 4]) : [1, 2, 3, 4]
                                const isDisabled = override.pcaId && !pcaAvailableSlots.includes(slot)

                                const button = (
                                  <Button
                                    type="button"
                                    onClick={() => !isDisabled && handleSlotToggle(program.id, slot)}
                                    disabled={!!isDisabled}
                                    className={cn(
                                      'w-full px-2 py-2 rounded text-sm font-medium',
                                      isSelected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                                      isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none'
                                    )}
                                  >
                                    {slotTimes[slot]}
                                  </Button>
                                )

                                // Native tooltips generally won't show on disabled buttons.
                                // Wrap in a span with title, and disable pointer events on the button.
                                if (isDisabled) {
                                  return (
                                    <span
                                      key={slot}
                                      title="Slot not available"
                                      className="inline-block w-full cursor-not-allowed"
                                    >
                                      {button}
                                    </span>
                                  )
                                }

                                return (
                                  <span key={slot} className="w-full">
                                    {button}
                                  </span>
                                )
                              })}
                            </div>
                          </div>

                          {/* PCA FTE Subtraction - Auto-calculated for Robotic/CRP */}
                          {(program.name === 'Robotic' || program.name === 'CRP') ? (
                            <div>
                              <Label>FTE Subtraction by Special Program</Label>
                              <div className="p-2 bg-muted rounded text-sm mt-1">
                                {pcaFTESubtraction?.toFixed(2) ?? '0.00'} ({currentSlots.length} slots × 0.25)
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* DRM Add-On */}
                      {program.name === 'DRM' && (
                        <div>
                          <Label htmlFor={`drm-addon-${program.id}`}>PCA FTE Add-on</Label>
                          <Input
                            id={`drm-addon-${program.id}`}
                            type="number"
                            step="0.01"
                            value={override.drmAddOn ?? 0.4}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0
                              setProgramOverrides(prev => ({
                                ...prev,
                                [program.id]: {
                                  ...prev[program.id],
                                  drmAddOn: value,
                                }
                              }))
                            }}
                            className="mt-1 max-w-[180px]"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  )
                  })}
              </HorizontalCardCarousel>
            )}
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="relative inline-block group">
              <Button variant="outline" onClick={onSkip}>
                Skip
              </Button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-popover border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none whitespace-normal">
                <p className="text-xs text-popover-foreground mb-2 font-medium">
                  Should the algorithm automatically assign therapists and PCAs for special programs?
                </p>
                <ul className="text-xs text-popover-foreground space-y-1 list-disc list-inside">
                  <li><strong>Skip:</strong> Algorithm will use dashboard config and preference orders to assign automatically</li>
                  <li><strong>Cancel:</strong> Exit dialog without changes</li>
                  <li><strong>Confirm:</strong> Apply your manual overrides</li>
                </ul>
              </div>
            </div>
            <Button onClick={handleConfirm}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Substitution Selection Dialog */}
      {substitutionDialogConfig && (
        <SpecialProgramSubstitutionDialog
          open={substitutionDialogOpen}
          onOpenChange={setSubstitutionDialogOpen}
          staffType={substitutionDialogConfig.staffType}
          programName={substitutionDialogConfig.programName}
          requiredSlots={substitutionDialogConfig.requiredSlots}
          minRequiredFTE={substitutionDialogConfig.minRequiredFTE}
          allStaff={allStaff}
          sptBaseFteByStaffId={sptBaseFteByStaffId}
          staffOverrides={staffOverrides}
          sourceType={substitutionDialogConfig.sourceType}
          onConfirm={handleSubstitutionSelect}
          onCancel={() => {
            setSubstitutionDialogOpen(false)
            setSubstitutionDialogConfig(null)
          }}
        />
      )}

      {/* Buffer Staff Creation Dialog */}
      {pendingSubstitutionType && (
        <BufferStaffCreateDialog
          open={showBufferCreateDialog}
          onOpenChange={setShowBufferCreateDialog}
          onSave={handleBufferStaffCreated}
          specialPrograms={specialPrograms}
        minRequiredFTE={pendingMinRequiredFTE ?? undefined}
        />
      )}
    </>
  )
}
