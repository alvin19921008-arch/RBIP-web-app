'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Staff, StaffRank, Team, Weekday, SpecialProgram as StaffSpecialProgram } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { AlertCircle, Edit2, ChevronDown, X } from 'lucide-react'
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
      requiredSlots?: number[]
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
      requiredSlots?: number[]
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
  primaryPcaId?: string
  slots?: number[]
  pcaCoverageBySlot?: Partial<Record<1 | 2 | 3 | 4, string>>
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
}

const SPECIAL_PROGRAM_SLOTS = [1, 2, 3, 4] as const
type SpecialProgramSlot = typeof SPECIAL_PROGRAM_SLOTS[number]
type PcaSubstitutionFlowState = {
  programId: string
  sourceType: 'existing' | 'buffer' | 'inactive'
  remainingQueue: SpecialProgramSlot[]
  mode: 'all-remaining' | 'slot-by-slot'
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
  const [pcaSubstitutionFlow, setPcaSubstitutionFlow] = useState<PcaSubstitutionFlowState | null>(null)
  
  // State for buffer staff creation
  const [showBufferCreateDialog, setShowBufferCreateDialog] = useState(false)
  const [pendingSubstitutionType, setPendingSubstitutionType] = useState<'therapist' | 'pca' | null>(null)
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
  const getConfiguredTherapistFteForStaffAndWeekday = (
    program: SpecialProgram,
    staffId: string,
    day: Weekday
  ): number | undefined => {
    const rawByStaff: any = (program as any).fte_subtraction?.[staffId]
    const hasDayKey =
      rawByStaff && typeof rawByStaff === 'object' && Object.prototype.hasOwnProperty.call(rawByStaff, day)
    const fte = hasDayKey ? rawByStaff[day] : undefined
    return typeof fte === 'number' ? fte : undefined
  }

  const getPrimaryConfiguredTherapistIdForWeekday = (
    program: SpecialProgram,
    day: Weekday
  ): { id: string; fte: number | undefined } | null => {
    if (!Array.isArray(program.staff_ids) || program.staff_ids.length === 0) return null

    const prefIds = program.therapist_preference_order ? Object.values(program.therapist_preference_order).flat() : []
    const prefIndex = (id: string) => {
      const idx = prefIds.indexOf(id)
      return idx >= 0 ? idx : Number.POSITIVE_INFINITY
    }

    const candidates: Array<{
      id: string
      fte: number | undefined
      slotCount: number
      hasExplicitFteForDay: boolean
    }> = []
    for (const id of program.staff_ids) {
      const staff = allStaff.find((s) => s.id === id)
      if (!staff) continue
      if (!['SPT', 'APPT', 'RPT'].includes(staff.rank)) continue

      const fte = getConfiguredTherapistFteForStaffAndWeekday(program, id, day)
      const hasExplicitFteForDay = typeof fte === 'number'
      const rawSlots: any = (program as any).slots
      const slotCount = Array.isArray(rawSlots?.[id]?.[day]) ? (rawSlots[id][day] as any[]).length : 0
      if (program.name === 'CRP') {
        // CRP runner inference:
        // - Prefer staff who have weekday slots configured (dashboard intent)
        // - If no slots exist for any staff, fall back to explicit fte_subtraction (0 is meaningful)
        if (slotCount > 0 || (typeof fte === 'number' && fte >= 0)) {
          candidates.push({
            id,
            fte: slotCount > 0 ? (typeof fte === 'number' ? fte : 0) : fte,
            slotCount,
            hasExplicitFteForDay,
          })
        }
        continue
      }

      if (typeof fte === 'number' && fte > 0) {
        candidates.push({ id, fte, slotCount, hasExplicitFteForDay })
      }
    }

    if (candidates.length === 0) return null

    // Primary configured runner:
    // - CRP: prefer staff with configured slots, then higher FTE, then preference order, then stable id.
    // - Others: higher configured FTE, then preference order, then stable id.
    candidates.sort((a, b) => {
      if (program.name === 'CRP') {
        const as = a.slotCount > 0 ? 1 : 0
        const bs = b.slotCount > 0 ? 1 : 0
        if (bs !== as) return bs - as
        if (b.slotCount !== a.slotCount) return b.slotCount - a.slotCount
      }
      const af = typeof a.fte === 'number' ? a.fte : -1
      const bf = typeof b.fte === 'number' ? b.fte : -1
      if (bf !== af) return bf - af
      const pi = prefIndex(a.id) - prefIndex(b.id)
      if (pi !== 0) return pi
      return a.id.localeCompare(b.id)
    })

    return { id: candidates[0].id, fte: candidates[0].fte }
  }

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

  const getTherapistEffectiveFteRemaining = (staff: Staff): number => {
    const override = staffOverrides?.[staff.id]
    const leaveType = override?.leaveType
    const isOnDuty = isOnDutyLeaveType(leaveType as any)

    const fteRemaining =
      override?.fteRemaining ??
      (staff.rank === 'SPT'
        ? (sptBaseFteByStaffId?.[staff.id] ?? 0)
        : (isOnDuty ? 1.0 : 0))

    return typeof fteRemaining === 'number' ? fteRemaining : 0
  }

  const pickBestTherapistForCRP = (program: SpecialProgram): string | undefined => {
    // Candidate pool is the same as UI dropdown pool (availability + special_program property).
    const candidates = getAvailableTherapists(program.name)
    if (candidates.length === 0) return undefined

    // If ANY therapist explicitly ticked "A/v during special program", respect that as the source of truth.
    const hasAnyExplicit = candidates.some((t) => staffOverrides?.[t.id]?.specialProgramAvailable === true)
    const pool = hasAnyExplicit
      ? candidates.filter((t) => staffOverrides?.[t.id]?.specialProgramAvailable === true)
      : candidates

    const prefIds = program.therapist_preference_order ? Object.values(program.therapist_preference_order).flat() : []
    const prefIndex = (id: string) => {
      const idx = prefIds.indexOf(id)
      return idx >= 0 ? idx : Number.POSITIVE_INFINITY
    }

    const rawSlots: any = (program as any).slots
    const slotCountFor = (id: string) => {
      const slots = rawSlots?.[id]?.[weekday]
      return Array.isArray(slots) ? slots.length : 0
    }

    // For CRP: "No duty" SPTs can show up with 0 FTE; deprioritize them behind real on-duty therapists.
    const rankOrder: Record<StaffRank, number> = { APPT: 1, RPT: 2, SPT: 3, PCA: 99, workman: 99 }

    const sorted = [...pool].sort((a, b) => {
      const aSlots = slotCountFor(a.id)
      const bSlots = slotCountFor(b.id)
      if (bSlots !== aSlots) return bSlots - aSlots

      const aFte = getTherapistEffectiveFteRemaining(a)
      const bFte = getTherapistEffectiveFteRemaining(b)
      const aPos = aFte > 1e-6 ? 1 : 0
      const bPos = bFte > 1e-6 ? 1 : 0
      if (bPos !== aPos) return bPos - aPos
      if (bFte !== aFte) return bFte - aFte

      const rd = (rankOrder[a.rank] || 99) - (rankOrder[b.rank] || 99)
      if (rd !== 0) return rd

      const pi = prefIndex(a.id) - prefIndex(b.id)
      if (pi !== 0) return pi

      return a.name.localeCompare(b.name)
    })

    return sorted[0]?.id
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

    const out = getProgramSlotsForWeekday(program, day, configuredTherapistId, configuredPcaId)
    return out
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
      let foundPrimaryPCAId: string | undefined
      let foundSlots: number[] | undefined
      let foundTherapistFTE: number | undefined
      let foundPCAFTE: number | undefined
      let foundDRMAddOn: number | undefined
      let foundRequiredSlots: SpecialProgramSlot[] | undefined
      const foundPcaCoverageBySlot: Partial<Record<SpecialProgramSlot, string>> = {}
      
      for (const override of Object.values(staffOverrides)) {
        if (override.specialProgramOverrides) {
          const programOverrideList = override.specialProgramOverrides.filter(
            o => o.programId === program.id
          )
          
          if (programOverrideList.length > 0) {
            // Collect all override data (may be split across therapist and PCA)
            programOverrideList.forEach((programOverride) => {
              if (programOverride.therapistId !== undefined) {
                foundTherapistId = programOverride.therapistId
              }
              if (programOverride.therapistFTESubtraction !== undefined) {
                foundTherapistFTE = programOverride.therapistFTESubtraction
              }
              if (programOverride.pcaId !== undefined && !foundPrimaryPCAId) {
                foundPrimaryPCAId = programOverride.pcaId
              }
              if (programOverride.pcaFTESubtraction !== undefined) {
                foundPCAFTE = programOverride.pcaFTESubtraction
              }
              if (Array.isArray((programOverride as any).requiredSlots)) {
                const nextRequired = (programOverride as any).requiredSlots
                  .filter((slot: any): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot))
                if (nextRequired.length > 0) {
                  foundRequiredSlots = Array.from(new Set([...(foundRequiredSlots ?? []), ...nextRequired])).sort()
                }
              }
              if (Array.isArray(programOverride.slots)) {
                const normalizedSlots = programOverride.slots
                  .filter((slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot))
                  .sort()
                if (normalizedSlots.length > 0) {
                  foundSlots = normalizedSlots
                  if (programOverride.pcaId) {
                    normalizedSlots.forEach((slot) => {
                      foundPcaCoverageBySlot[slot] = programOverride.pcaId!
                    })
                  }
                }
              }
              if (programOverride.drmAddOn !== undefined) {
                foundDRMAddOn = programOverride.drmAddOn
              }
            })
          }
        }
      }

      // If we found any existing override data, use it
      if (foundTherapistId || foundPrimaryPCAId || foundSlots || foundRequiredSlots || foundDRMAddOn !== undefined) {
        const effectiveRequiredSlots = foundRequiredSlots ?? foundSlots
        const existingOverride: ProgramOverride = {
          programId: program.id,
          therapistId: foundTherapistId,
          pcaId: foundPrimaryPCAId,
          primaryPcaId: foundPrimaryPCAId,
          slots: effectiveRequiredSlots ?? foundSlots,
          pcaCoverageBySlot: foundPcaCoverageBySlot,
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

      // CRP is special: "configured runner" often has 0 therapist subtraction, and SPTs with 0 FTE can
      // incorrectly win due to generic rank sorting. Prefer explicit special-program availability +
      // configured runner signals.
      if (!therapistId && program.name === 'CRP') {
        therapistId = pickBestTherapistForCRP(program)
      }

      // Prefer the therapist configured in dashboard for THIS weekday.
      // In dashboard config, a therapist "assigned" to a program/day has a weekday entry in `fte_subtraction`
      // (CRP may intentionally be 0). Prefer that "primary configured runner" rather than falling back to
      // the first available therapist (which often picks SPT due to sort order).
      const primaryConfiguredTherapist = getPrimaryConfiguredTherapistIdForWeekday(program, weekday)
      if (!therapistId) {
        if (!therapistId && primaryConfiguredTherapist) {
          const staff = allStaff.find((s) => s.id === primaryConfiguredTherapist.id)
          if (staff && isTherapistAvailable(staff, program.name)) {
            therapistId = primaryConfiguredTherapist.id
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
        if (staff && isPCAAvailable(staff) && getCoverableSlotsForPCA(staff.id, requiredSlotsForPca).length > 0) {
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
          : (primaryConfiguredTherapist?.fte ?? getConfiguredTherapistFTESubtractionForWeekday(program, weekday))
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
        primaryPcaId: program.name === 'DRM' ? undefined : pcaId,
        slots: program.name === 'DRM' ? undefined : slots,
        pcaCoverageBySlot:
          program.name === 'DRM' || !pcaId
            ? undefined
            : slots.reduce((acc, slot) => {
                if (!getPCAAvailableSlots(pcaId).includes(slot as SpecialProgramSlot)) return acc
                acc[slot as SpecialProgramSlot] = pcaId
                return acc
              }, {} as Partial<Record<SpecialProgramSlot, string>>),
        therapistFTESubtraction,
        pcaFTESubtraction,
        drmAddOn,
      }

      if (program.name === 'CRP') {
        const available = getAvailableTherapists(program.name)
        void available
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

  // Helper: Check if PCA is available for special program pool (slot-agnostic)
  const isPCAAvailable = (staff: Staff): boolean => {
    if (staff.rank !== 'PCA') return false
    if (!staff.special_program) return false

    // IMPORTANT: This function is used for "existing staff" auto-pick + dropdown.
    // Inactive staff should never be surfaced here.
    // Buffer staff ARE allowed (per UI requirement) if they have compatible special_program + slots.
    if (staff.status === 'inactive') return false
    if (staff.active === false) return false

    // Step 2.0 enhancement:
    // Allow partially-available PCAs (e.g. half-day leave) to appear in the pool so they
    // can cover SOME program slots, and other PCAs can cover the remaining slots.
    // Source of truth is Step 1: fteRemaining + availableSlots.
    const override = staffOverrides[staff.id]
    const effectiveFTE =
      typeof override?.fteRemaining === 'number'
        ? override.fteRemaining
        : staff.status === 'buffer' && typeof staff.buffer_fte === 'number'
          ? staff.buffer_fte
          : 1.0
    if (effectiveFTE <= 0) {
      return false
    }
    
    return true
  }

  const getEffectivePCAFteRemaining = (pcaId: string): number => {
    const staff = allStaff.find((s) => s.id === pcaId)
    const override = staffOverrides[pcaId]
    if (typeof override?.fteRemaining === 'number') return override.fteRemaining
    if (staff?.status === 'buffer' && typeof staff.buffer_fte === 'number') return staff.buffer_fte
    return 1.0
  }

  const getPCAAvailableSlots = (pcaId: string): SpecialProgramSlot[] => {
    const raw = staffOverrides[pcaId]?.availableSlots
    if (!Array.isArray(raw) || raw.length === 0) return [...SPECIAL_PROGRAM_SLOTS]
    return raw.filter((slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot))
  }

  const getCoverableSlotsForPCA = (pcaId: string, requiredSlots: number[]): SpecialProgramSlot[] => {
    const required = requiredSlots.filter(
      (slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot)
    )
    const available = new Set(getPCAAvailableSlots(pcaId))
    const coverable = required.filter((slot) => available.has(slot))

    // Cap by remaining FTE: each slot = 0.25 FTE.
    const fte = getEffectivePCAFteRemaining(pcaId)
    const maxSlots = Math.max(0, Math.min(4, Math.floor((fte + 1e-6) / 0.25)))
    return coverable.slice(0, maxSlots)
  }

  const getRequiredSlotsForProgram = (program: SpecialProgram, override?: ProgramOverride): SpecialProgramSlot[] => {
    return (override?.slots ?? getConfiguredProgramSlotsForWeekday(program, weekday))
      .filter((slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot))
      .sort((a, b) => a - b)
  }

  const normalizeCoverageBySlot = (
    requiredSlots: SpecialProgramSlot[],
    coverage?: Partial<Record<SpecialProgramSlot, string>>
  ): Partial<Record<SpecialProgramSlot, string>> => {
    const raw = { ...(coverage ?? {}) }
    const normalized: Partial<Record<SpecialProgramSlot, string>> = {}
    requiredSlots.forEach((slot) => {
      const pcaId = raw[slot]
      if (!pcaId) return
      if (!getPCAAvailableSlots(pcaId).includes(slot)) return
      normalized[slot] = pcaId
    })
    return normalized
  }

  const getRemainingSlotsForProgram = (program: SpecialProgram, override?: ProgramOverride): SpecialProgramSlot[] => {
    const requiredSlots = getRequiredSlotsForProgram(program, override)
    const normalizedCoverage = normalizeCoverageBySlot(requiredSlots, override?.pcaCoverageBySlot)
    const covered = new Set(Object.keys(normalizedCoverage).map((slot) => Number(slot) as SpecialProgramSlot))
    return requiredSlots.filter((slot) => !covered.has(slot))
  }

  const assignPcaToSpecificSlots = (programId: string, pcaId: string, targetSlots: SpecialProgramSlot[]) => {
    setProgramOverrides((prev) => {
      const program = activePrograms.find((p) => p.id === programId)
      const currentOverride = prev[programId] || { programId }
      if (!program) return prev

      const requiredSlots = getRequiredSlotsForProgram(program, currentOverride)
      const requiredSet = new Set(requiredSlots)
      const nextCoverage = { ...(currentOverride.pcaCoverageBySlot ?? {}) }
      const coverable = new Set(getCoverableSlotsForPCA(pcaId, targetSlots))

      targetSlots.forEach((slot) => {
        if (!requiredSet.has(slot)) return
        if (!coverable.has(slot)) return
        nextCoverage[slot] = pcaId
      })

      return {
        ...prev,
        [programId]: {
          ...currentOverride,
          pcaId: currentOverride.pcaId ?? pcaId,
          primaryPcaId: currentOverride.primaryPcaId ?? pcaId,
          pcaCoverageBySlot: nextCoverage,
        },
      }
    })
  }

  const clearPcaCoverageForSlot = (programId: string, slot: SpecialProgramSlot) => {
    setProgramOverrides((prev) => {
      const currentOverride = prev[programId]
      if (!currentOverride) return prev
      const nextCoverage = { ...(currentOverride.pcaCoverageBySlot ?? {}) }
      delete nextCoverage[slot]
      return {
        ...prev,
        [programId]: {
          ...currentOverride,
          pcaCoverageBySlot: nextCoverage,
        },
      }
    })
  }

  // Helper: Get available PCAs for a program (partial slot coverage allowed)
  const getAvailablePCAs = (programName: string): Staff[] => {
    const pcas = allStaff.filter(s => {
      if (s.rank !== 'PCA') return false
      if (!s.special_program?.includes(programName as StaffSpecialProgram)) return false
      return isPCAAvailable(s)
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

      const requiredSlots = (currentOverride.slots ?? getConfiguredProgramSlotsForWeekday(program, weekday))
        .filter((slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot))
      const existingCoverage = { ...(currentOverride.pcaCoverageBySlot ?? {}) }
      const coverableByPrimary = new Set(getCoverableSlotsForPCA(pcaId, requiredSlots))
      const nextCoverage: Partial<Record<SpecialProgramSlot, string>> = { ...existingCoverage }

      // Progressive default: primary PCA claims uncovered slots it can cover.
      requiredSlots.forEach((slot) => {
        if (nextCoverage[slot]) return
        if (!coverableByPrimary.has(slot)) return
        nextCoverage[slot] = pcaId
      })

      const next: ProgramOverride = {
        ...currentOverride,
        pcaId,
        primaryPcaId: pcaId,
        pcaCoverageBySlot: nextCoverage,
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
  }

  const handleAdditionalPCASelection = (programId: string, pcaId: string, checked: boolean) => {
    setProgramOverrides((prev) => {
      const program = activePrograms.find((p) => p.id === programId)
      const currentOverride = prev[programId] || { programId }
      if (!program) return prev

      const requiredSlots = (currentOverride.slots ?? getConfiguredProgramSlotsForWeekday(program, weekday))
        .filter((slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot))
      const currentCoverage = { ...(currentOverride.pcaCoverageBySlot ?? {}) }

      if (checked) {
        const coverable = new Set(getCoverableSlotsForPCA(pcaId, requiredSlots))
        requiredSlots.forEach((slot) => {
          if (currentCoverage[slot]) return
          if (!coverable.has(slot)) return
          currentCoverage[slot] = pcaId
        })
      } else {
        SPECIAL_PROGRAM_SLOTS.forEach((slot) => {
          if (currentCoverage[slot] === pcaId) {
            delete currentCoverage[slot]
          }
        })
      }

      return {
        ...prev,
        [programId]: {
          ...currentOverride,
          pcaCoverageBySlot: currentCoverage,
        },
      }
    })
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
      ? getRemainingSlotsForProgram(program, currentOverride)
      : undefined
    const minRequiredFTE = getMinRequiredFTEForProgram(program, type, currentOverride, requiredSlots)
    let pcaFlowMode: 'all-remaining' | 'slot-by-slot' | null = null

    if (type === 'pca') {
      const remaining = (requiredSlots ?? []).filter(
        (slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot)
      )
      if (remaining.length === 0) return

      const canCoverAllRemaining = allStaff.some((staff) => {
        if (staff.rank !== 'PCA') return false
        if (!staff.special_program?.includes(program.name as StaffSpecialProgram)) return false
        if (staff.active === false) return false
        if (sourceType === 'buffer' && staff.status !== 'buffer') return false
        if (sourceType === 'inactive' && staff.status !== 'inactive') return false
        if (sourceType === 'existing' && (staff.status === 'buffer' || staff.status === 'inactive')) return false
        if (getEffectivePCAFteRemaining(staff.id) <= 0) return false
        const coverable = getCoverableSlotsForPCA(staff.id, remaining)
        return remaining.every((slot) => coverable.includes(slot))
      })

      if (canCoverAllRemaining) {
        pcaFlowMode = 'all-remaining'
        setPcaSubstitutionFlow({
          programId,
          sourceType,
          remainingQueue: remaining,
          mode: 'all-remaining',
        })
      } else {
        pcaFlowMode = 'slot-by-slot'
        setPcaSubstitutionFlow({
          programId,
          sourceType,
          remainingQueue: remaining,
          mode: 'slot-by-slot',
        })
      }
    } else {
      setPcaSubstitutionFlow(null)
    }

    if (sourceType === 'existing' || sourceType === 'buffer' || sourceType === 'inactive') {
      const dialogSlots =
        type === 'pca' && pcaFlowMode === 'slot-by-slot' && requiredSlots && requiredSlots.length > 0
          ? [requiredSlots[0]]
          : requiredSlots
      setSubstitutionDialogConfig({
        staffType: type,
        programName: program.name,
        programId,
        requiredSlots: dialogSlots,
        minRequiredFTE: type === 'pca' && dialogSlots && dialogSlots.length > 0
          ? getMinRequiredFTEForProgram(program, type, currentOverride, dialogSlots)
          : minRequiredFTE,
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
      setPendingProgramId(null)
      setPendingRequiredSlots(null)
      setPendingMinRequiredFTE(null)
    }
  }

  const handleSubstitutionSelect = (selectedStaffId: string) => {
    if (!substitutionDialogConfig) return

    const { programId, staffType, requiredSlots, sourceType } = substitutionDialogConfig

    if (staffType === 'therapist') {
      handleTherapistSelect(programId, selectedStaffId)
    } else {
      const slots = (requiredSlots ?? []).filter(
        (slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot)
      )
      if (slots.length > 0) {
        assignPcaToSpecificSlots(programId, selectedStaffId, slots)
      }

      if (
        pcaSubstitutionFlow &&
        pcaSubstitutionFlow.programId === programId &&
        pcaSubstitutionFlow.mode === 'slot-by-slot'
      ) {
        const used = new Set(slots)
        const nextQueue = pcaSubstitutionFlow.remainingQueue.filter((slot) => !used.has(slot))
        if (nextQueue.length > 0) {
          const program = activePrograms.find((p) => p.id === programId)
          const currentOverride = programOverrides[programId]
          if (program) {
            const nextSlot = nextQueue[0]
            setPcaSubstitutionFlow({
              ...pcaSubstitutionFlow,
              remainingQueue: nextQueue,
            })
            setSubstitutionDialogConfig({
              staffType: 'pca',
              programName: program.name,
              programId,
              requiredSlots: [nextSlot],
              minRequiredFTE: getMinRequiredFTEForProgram(program, 'pca', currentOverride, [nextSlot]),
              sourceType,
            })
            return
          }
        }
      }
    }

    setSubstitutionDialogOpen(false)
    setSubstitutionDialogConfig(null)
    setPcaSubstitutionFlow(null)
  }

  const handleSlotToggle = (programId: string, slot: number) => {
    setProgramOverrides(prev => {
      const current = prev[programId]
      const currentSlots = current?.slots || []
      const newSlots = currentSlots.includes(slot)
        ? currentSlots.filter(s => s !== slot)
        : [...currentSlots, slot].sort()

      const requiredSet = new Set(newSlots)
      const nextCoverage = { ...(current?.pcaCoverageBySlot ?? {}) }
      SPECIAL_PROGRAM_SLOTS.forEach((s) => {
        if (!requiredSet.has(s)) {
          delete nextCoverage[s]
          return
        }
        const assignedPcaId = nextCoverage[s]
        if (!assignedPcaId) return
        const pcaAvailable = getPCAAvailableSlots(assignedPcaId)
        if (!pcaAvailable.includes(s)) {
          delete nextCoverage[s]
        }
      })

      // Auto-assign primary PCA to newly uncovered required slots when slot is re-added
      if (current?.primaryPcaId || current?.pcaId) {
        const primaryPcaId = current.primaryPcaId ?? current.pcaId
        if (primaryPcaId) {
          const coverableByPrimary = new Set(getCoverableSlotsForPCA(primaryPcaId, newSlots))
          
          newSlots.forEach((s) => {
            const slot = s as SpecialProgramSlot
            if (nextCoverage[slot]) return // Already has coverage
            if (!coverableByPrimary.has(slot)) return // Primary can't cover
            nextCoverage[slot] = primaryPcaId
          })
        }
      }

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
          pcaCoverageBySlot: nextCoverage,
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
        requiredSlots?: number[]
        therapistFTESubtraction?: number
        pcaFTESubtraction?: number
        drmAddOn?: number
      }>
    }> = {}

    Object.values(programOverrides).forEach(override => {
      const program = activePrograms.find(p => p.id === override.programId)
      const requiredSlots = (override.slots ?? [])
        .filter((slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot))
      const coverageBySlot = { ...(override.pcaCoverageBySlot ?? {}) }
      const slotsByPca = new Map<string, SpecialProgramSlot[]>()

      requiredSlots.forEach((slot) => {
        const pcaId = coverageBySlot[slot]
        if (!pcaId) return
        const list = slotsByPca.get(pcaId) ?? []
        if (!list.includes(slot)) list.push(slot)
        slotsByPca.set(pcaId, list)
      })

      const primaryPcaId = override.primaryPcaId ?? override.pcaId
      if (primaryPcaId && slotsByPca.size === 0) {
        const primaryCoverable = getCoverableSlotsForPCA(primaryPcaId, requiredSlots)
        if (primaryCoverable.length > 0) {
          slotsByPca.set(primaryPcaId, primaryCoverable)
        }
      }
      
      // Only add therapist override if not Robotic
      if (override.therapistId && program?.name !== 'Robotic') {
        if (!overrides[override.therapistId]) {
          overrides[override.therapistId] = { specialProgramOverrides: [] }
        }
        overrides[override.therapistId].specialProgramOverrides!.push({
          programId: override.programId,
          therapistId: override.therapistId,
          requiredSlots: requiredSlots.length > 0 ? requiredSlots : undefined,
          therapistFTESubtraction: override.therapistFTESubtraction,
        })
      }

      // PCA override logic (supports multi-cover by slot)
      slotsByPca.forEach((coveredSlots, pcaId) => {
        if (!overrides[pcaId]) {
          overrides[pcaId] = { specialProgramOverrides: [] }
        }

        // If this PCA was created as buffer staff in this dialog, persist its availability + base FTE into overrides.
        // This prevents Step 3 from treating it as whole-day available or as 1.0 FTE.
        const bufferMeta = createdBufferMetaByStaffId[pcaId]
        if (bufferMeta?.availableSlots) {
          overrides[pcaId].availableSlots = bufferMeta.availableSlots
        }
        if (typeof bufferMeta?.fteRemaining === 'number') {
          overrides[pcaId].fteRemaining = bufferMeta.fteRemaining
        }
        
        // Auto-calculate PCA FTE for Robotic/CRP from this PCA's covered slots
        let pcaFTE = override.pcaFTESubtraction
        if (program?.name === 'Robotic' || program?.name === 'CRP') {
          pcaFTE = coveredSlots.length * 0.25
        }
        
        overrides[pcaId].specialProgramOverrides!.push({
          programId: override.programId,
          pcaId,
          slots: coveredSlots,
          requiredSlots: requiredSlots.length > 0 ? requiredSlots : undefined,
          pcaFTESubtraction: pcaFTE,
        })
      })
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
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Special program overrides</DialogTitle>
            <DialogDescription>
              <span className="block text-xs text-muted-foreground">Step 2.0 · Before allocation</span>
              <span className="mt-1 block">Configure special program assignments before algorithm runs.</span>
            </DialogDescription>
          </DialogHeader>

          <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 font-semibold text-primary">2.0 Programs</span>
            <span aria-hidden="true">·</span>
            <span className="px-2.5 py-1 rounded-md">2.1 Substitute</span>
            <span aria-hidden="true">·</span>
            <span className="px-2.5 py-1 rounded-md">2.2 SPT</span>
          </div>

          <div className="py-4">
            {activePrograms.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No special programs active on this weekday.
              </div>
            ) : (
              <HorizontalCardCarousel recomputeKey={open} showDots={false}>
                {activePrograms.map((program) => {
                    const override = programOverrides[program.id] || {}
                    const therapist = override.therapistId ? allStaff.find(s => s.id === override.therapistId) : null
                    const currentSlots = (override.slots ?? getProgramSlotsForWeekday(program, weekday, override.therapistId, override.primaryPcaId ?? override.pcaId))
                      .filter((slot): slot is SpecialProgramSlot => SPECIAL_PROGRAM_SLOTS.includes(slot as SpecialProgramSlot))
                      .sort((a, b) => a - b)
                    const availableTherapists = getAvailableTherapists(program.name)
                    const availablePCAs = getAvailablePCAs(program.name)
                    const primaryPcaId = override.primaryPcaId ?? override.pcaId
                    const primaryPcaStaff = primaryPcaId
                      ? allStaff.find((s) => s.id === primaryPcaId)
                      : null
                    const primaryPcaOptions =
                      primaryPcaStaff && !availablePCAs.some((candidate) => candidate.id === primaryPcaStaff.id)
                        ? [primaryPcaStaff, ...availablePCAs]
                        : availablePCAs
                    const rawCoverage = { ...(override.pcaCoverageBySlot ?? {}) } as Partial<Record<SpecialProgramSlot, string>>
                    const normalizedCoverageBySlot = currentSlots.reduce((acc, slot) => {
                      const pcaId = rawCoverage[slot]
                      if (!pcaId) return acc
                      const pcaCanCoverSlot = getPCAAvailableSlots(pcaId).includes(slot)
                      if (!pcaCanCoverSlot) return acc
                      acc[slot] = pcaId
                      return acc
                    }, {} as Partial<Record<SpecialProgramSlot, string>>)
                    const selectedCoverageByPca = new Map<string, SpecialProgramSlot[]>()
                    currentSlots.forEach((slot) => {
                      const pcaId = normalizedCoverageBySlot[slot]
                      if (!pcaId) return
                      const list = selectedCoverageByPca.get(pcaId) ?? []
                      if (!list.includes(slot)) list.push(slot)
                      selectedCoverageByPca.set(pcaId, list)
                    })
                    const coveredSlots = new Set(Object.keys(normalizedCoverageBySlot).map((slot) => Number(slot) as SpecialProgramSlot))
                    const remainingSlots = currentSlots.filter((slot) => !coveredSlots.has(slot))
                    const availablePCAsForRemaining = availablePCAs.filter((p) =>
                      getCoverableSlotsForPCA(p.id, remainingSlots).length > 0
                    )
                    // For CRP: Check if configured therapist exists but is not available
                    let needsTherapistSubstitution = !therapist && availableTherapists.length === 0
                    if (program.name === 'CRP' && !therapist) {
                      const primaryConfiguredTherapist = getPrimaryConfiguredTherapistIdForWeekday(program, weekday)
                      if (primaryConfiguredTherapist) {
                        const configuredTherapist = allStaff.find((s) => s.id === primaryConfiguredTherapist.id)
                        if (configuredTherapist && !isTherapistAvailable(configuredTherapist, program.name)) {
                          needsTherapistSubstitution = true
                        }
                      }
                    }
                    const availableFloatingPCAsCount = availablePCAsForRemaining.filter(p => p.floating).length
                    // New behavior (per user request):
                    // If only NON-floating candidates remain, surface substitution controls so user can pick buffer instead.
                    // Also show substitution controls when there are no candidates at all.
                    const showPCASubstitutionControls =
                      program.name !== 'DRM' &&
                      remainingSlots.length > 0 &&
                      availableFloatingPCAsCount === 0

                    const isEditingTherapist = editingTherapist?.programId === program.id
                    const substitutionDropdownKey = `${program.id}-therapist`
                    const isCRPThursday = program.name === 'CRP' && weekday === 'thu'
                    const pcaFTESubtraction = (program.name === 'Robotic' || program.name === 'CRP') && currentSlots
                      ? currentSlots.length * 0.25
                      : override.pcaFTESubtraction

                    return (
                      <Card
                        key={program.id}
                        className="min-w-[360px] max-w-[420px] w-[min(420px,calc(100vw-120px))] flex-shrink-0"
                      >
                        <CardHeader>
                          <CardTitle>{program.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Therapist Section - Skip for Robotic */}
                          {program.name !== 'Robotic' && (
                            <div className="space-y-2">
                              <Label>Therapist</Label>
                        {isEditingTherapist ? (
                          <div className="flex items-center justify-between gap-2 p-2 border rounded">
                            <Select
                              value={override.therapistId ?? undefined}
                              onValueChange={(value) => {
                                if (value) handleTherapistSelect(program.id, value)
                              }}
                            >
                              <SelectTrigger className="h-9 w-full max-w-[320px]">
                                <SelectValue placeholder="Select therapist" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableTherapists.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.name} ({t.rank})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" size="sm" onClick={() => setEditingTherapist(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : therapist ? (
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
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>PCA</Label>
                            <Select
                              value={primaryPcaId ?? undefined}
                              onValueChange={(value) => {
                                if (value) handlePCASelect(program.id, value)
                              }}
                            >
                              <SelectTrigger className="h-9 w-full">
                                <SelectValue placeholder="Select PCA" />
                              </SelectTrigger>
                              <SelectContent>
                                {primaryPcaOptions.map((candidate) => {
                                  const coverable = getCoverableSlotsForPCA(candidate.id, currentSlots)
                                  const coverableCount = coverable.length
                                  const coverableLabel =
                                    coverableCount > 0 && coverableCount < currentSlots.length
                                      ? ` — can cover: ${coverable.join(', ')}`
                                      : ''
                                  const statusLabel =
                                    candidate.status === 'inactive'
                                      ? 'Inactive'
                                      : candidate.status === 'buffer'
                                        ? 'Buffer'
                                        : null
                                  return (
                                    <SelectItem
                                      key={candidate.id}
                                      value={candidate.id}
                                      disabled={coverableCount === 0}
                                    >
                                      {candidate.name} ({statusLabel ? `${statusLabel} ` : ''}{candidate.floating ? 'Floating' : 'Non-floating'}){coverableLabel}
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Multi-cover picker: only show when required slots > 1 and still incomplete */}
                          {currentSlots.length > 1 && primaryPcaId && remainingSlots.length > 0 ? (
                            <div className="space-y-2">
                              <Label>Cover remaining slots: {remainingSlots.join(', ')}</Label>
                              <Select
                                key={`${program.id}:${remainingSlots.join(',')}:${Array.from(selectedCoverageByPca.keys()).sort().join(',')}`}
                                onValueChange={(value) => {
                                  if (!value) return
                                  // Assign this PCA to cover any currently-uncovered slots it can.
                                  handleAdditionalPCASelection(program.id, value, true)
                                }}
                              >
                                <SelectTrigger className="h-9 w-full">
                                  <SelectValue placeholder="Select PCA for remaining slots" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availablePCAs
                                    .filter((candidate) => candidate.id !== primaryPcaId)
                                    .filter((candidate) => !selectedCoverageByPca.has(candidate.id))
                                    .map((candidate) => {
                                      const coverable = getCoverableSlotsForPCA(candidate.id, remainingSlots)
                                      if (coverable.length === 0) return null
                                      return (
                                        <SelectItem key={candidate.id} value={candidate.id}>
                                          {candidate.name} ({candidate.floating ? 'Floating' : 'Non-floating'}) — can cover: {coverable.join(', ')}
                                        </SelectItem>
                                      )
                                    })}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                Add more PCAs until all required slots are covered.
                              </p>
                            </div>
                          ) : null}

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

                          {/* Slot Selection */}
                          <div>
                            <Label>Required slots</Label>
                            <div className="grid grid-cols-4 gap-1.5 mt-2 w-full">
                              {SPECIAL_PROGRAM_SLOTS.map((slot) => {
                                const isSelected = currentSlots.includes(slot)
                                const assignedPcaId = normalizedCoverageBySlot[slot]
                                const assignedPca = assignedPcaId ? allStaff.find((s) => s.id === assignedPcaId) : null
                                const isDisabledSingleSlotMode =
                                  currentSlots.length === 1 &&
                                  primaryPcaId &&
                                  !getPCAAvailableSlots(primaryPcaId).includes(slot)

                                const button = (
                                  <Button
                                    type="button"
                                    onClick={() => !isDisabledSingleSlotMode && handleSlotToggle(program.id, slot)}
                                    disabled={!!isDisabledSingleSlotMode}
                                    className={cn(
                                      'w-full px-2 py-2 rounded text-sm font-medium',
                                      isSelected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                                      isDisabledSingleSlotMode && 'opacity-50 cursor-not-allowed pointer-events-none'
                                    )}
                                  >
                                    {slotTimes[slot]}
                                  </Button>
                                )

                                if (isDisabledSingleSlotMode) {
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
                                  <div key={slot} className="w-full space-y-1">
                                    {button}
                                    {currentSlots.length > 1 && isSelected ? (
                                      <div className="min-h-[18px] px-1">
                                        {assignedPca ? (
                                          <div className="group flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                                            <span className="truncate max-w-[72px]">{assignedPca.name}</span>
                                            <button
                                              type="button"
                                              aria-label={`Remove ${assignedPca.name} from slot ${slot}`}
                                              className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted"
                                              onClick={() => clearPcaCoverageForSlot(program.id, slot)}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="text-center text-[11px] text-amber-700">Uncovered</div>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
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

          <DialogFooter className="sticky bottom-0 z-10 mt-4 flex-row flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="max-w-full whitespace-normal">
              Cancel
            </Button>
            <div className="relative group">
              <Button variant="outline" onClick={onSkip} className="max-w-full whitespace-normal">
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
            <Button onClick={handleConfirm} className="max-w-full whitespace-normal">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Substitution Selection Dialog */}
      {substitutionDialogConfig && (
        <SpecialProgramSubstitutionDialog
          open={substitutionDialogOpen}
          onOpenChange={(open) => {
            setSubstitutionDialogOpen(open)
            if (!open) {
              setSubstitutionDialogConfig(null)
              setPcaSubstitutionFlow(null)
            }
          }}
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
            setPcaSubstitutionFlow(null)
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
