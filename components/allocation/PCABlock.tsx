'use client'

import React, { useMemo, useCallback, memo, useEffect } from 'react'
import { Team } from '@/types/staff'
import { PCAAllocation, TeamAllocationLog } from '@/types/schedule'
import { Staff } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { StaffCard } from './StaffCard'
import { DragValidationTooltip } from './DragValidationTooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDroppable, useDndContext } from '@dnd-kit/core'
import { getSlotTime, formatTimeRange } from '@/lib/utils/slotHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { computeDrmAddOnFte } from '@/lib/utils/specialProgramPcaCapacity'
import { getAllocationSpecialProgramSlotsForTeam } from '@/lib/utils/scheduleReservationRuntime'
import { buildDisplayViewForWeekday } from '@/lib/utils/scheduleRuntimeProjection'
import { shouldShowExtraCoverage } from '@/lib/features/schedule/extraCoverageVisibility'
import { derivePcaDisplayFlagsBySlot } from '@/lib/features/schedule/pcaDisplayClassification'
import type { Step3FlowChoice } from '@/lib/features/schedule/step3DialogFlow'
import { selectPcaTrackerTooltipVariant } from '@/lib/features/schedule/pcaTrackerTooltip'
import { buildV2PcaTrackerTooltipModel } from '@/lib/features/schedule/v2PcaTrackerTooltipModel'
import { V1PcaTrackerTooltip } from './pcaTracker/V1PcaTrackerTooltip'
import { V2PcaTrackerTooltip } from './pcaTracker/V2PcaTrackerTooltip'

interface PCABlockProps {
  team: Team
  allocations: (PCAAllocation & { staff: Staff })[]
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
  requiredPCA?: number // Required PCA per team for display
  averagePCAPerTeam?: number // Average PCA per team (calculated requirement) for display - includes DRM add-on for DRO
  baseAveragePCAPerTeam?: number // Base avg PCA/team for DRO (without DRM +0.4 add-on)
  specialPrograms?: SpecialProgram[] // To identify special program names
  allPCAAllocations?: (PCAAllocation & { staff: Staff })[] // All PCA allocations across all teams (for substitution detection)
  staffOverrides?: Record<string, {
    leaveType?: any
    fteRemaining?: number
    fteSubtraction?: number
    availableSlots?: number[]
    invalidSlot?: number
    invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
    substitutionForBySlot?: Partial<Record<1 | 2 | 3 | 4, { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team }>>
    extraCoverageBySlot?: Partial<Record<1 | 2 | 3 | 4, true>>
  }> // Current staff overrides (leave + substitution UI)
  allPCAStaff?: Staff[] // All PCA staff (for identifying non-floating PCAs even when not in allocations)
  currentStep?: string // Current step in the workflow - substitution styling only shown in step 2+
  step2Initialized?: boolean // Whether Step 2 algorithm has been run
  initializedSteps?: Set<string> // Set of initialized steps (for transfer restriction validation)
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' // Weekday for checking if DRM is active
  externalHover?: boolean // External hover state (e.g., from popover drag)
  allocationLog?: TeamAllocationLog // Allocation tracking log for this team (from Step 3.4)
  /** Explicit Step 3 flow choice for tooltip rendering when known. */
  step3FlowChoice?: Step3FlowChoice | null
  /** Final Step 3.1 allocation order position (1-based), if known. */
  step3OrderPosition?: number
  /** Current pending PCA FTE for this team (from Step 2/3 state), if known. */
  pendingPcaFte?: number
  /** Total remaining floating PCA capacity (fte_remaining sum) across the pool, if known. */
  floatingPoolRemainingFte?: number

  /** When true, disables drag/drop and edit affordances (for reference panes). */
  readOnly?: boolean
  /** Optional prefix to avoid droppable id collisions across panes. */
  droppableIdPrefix?: string
}

type SubstitutionInfo = {
  isSubstituting: boolean
  isWholeDaySubstitution: boolean
  substitutedSlots: number[]
}

type PCABlockViewModelParams = Pick<
  PCABlockProps,
  | 'team'
  | 'allocations'
  | 'specialPrograms'
  | 'staffOverrides'
  | 'allPCAStaff'
  | 'currentStep'
  | 'step2Initialized'
  | 'weekday'
>

type PCABlockViewModel = {
  showSubstitutionStyling: boolean
  specialProgramsById: Map<string, SpecialProgram>
  pcaAllocationsWithFTE: (PCAAllocation & { staff: Staff })[]
  areSlotsPartOfSpecialProgram: (allocation: PCAAllocation & { staff: Staff }, currentTeam: Team, slotsForTeam: number[]) => boolean
  getSlotDisplayForTeamFiltered: (
    allocation: PCAAllocation & { staff: Staff },
    slotsToInclude?: number[],
    opts?: { cardKind?: 'regular' | 'specialProgram' }
  ) => string | null
  getSlotDisplayForTeam: (allocation: PCAAllocation & { staff: Staff }) => string | null
  getSubstitutionInfo: (floatingAlloc: PCAAllocation & { staff: Staff }) => SubstitutionInfo
  regularPCA: (PCAAllocation & { staff: Staff })[]
  specialProgramPCA: (PCAAllocation & { staff: Staff })[]
  splitAllocationSlots: Map<string, { regularSlots: number[]; specialProgramSlots: number[] }>
  assignedPcaFteRounded: number
  substitutionInfoByAllocId: Map<string, SubstitutionInfo>
}

function usePcaBlockViewModel({
  team,
  allocations,
  specialPrograms,
  staffOverrides,
  allPCAStaff,
  currentStep,
  step2Initialized,
  weekday,
}: PCABlockViewModelParams): PCABlockViewModel {
  const resolvedStaffOverrides = staffOverrides ?? {}
  const resolvedSpecialPrograms = specialPrograms ?? []
  const resolvedAllPCAStaff = allPCAStaff ?? []
  const resolvedCurrentStep = currentStep ?? 'leave-fte'
  const resolvedStep2Initialized = step2Initialized ?? false

  const showSubstitutionStyling = resolvedCurrentStep !== 'leave-fte' && resolvedStep2Initialized
  const displayView = useMemo(
    () =>
      weekday
        ? buildDisplayViewForWeekday({
            weekday,
            specialPrograms: resolvedSpecialPrograms,
            staffOverrides: resolvedStaffOverrides as any,
          })
        : null,
    [weekday, resolvedSpecialPrograms, resolvedStaffOverrides]
  )

  const specialProgramsById = useMemo(() => {
    const map = new Map<string, SpecialProgram>()
    for (const p of resolvedSpecialPrograms) map.set(p.id, p)
    return map
  }, [resolvedSpecialPrograms])

  // Helper function to determine if slots in a team are part of special program assignment
  const areSlotsPartOfSpecialProgram = useCallback((
    allocation: PCAAllocation & { staff: Staff },
    currentTeam: Team,
    slotsForTeam: number[]
  ): boolean => {
    if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
      return false
    }

    if (slotsForTeam.length === 0) return false

    const specialProgramSlots = getAllocationSpecialProgramSlotsForTeam({
      allocation: allocation as any,
      team: currentTeam,
      specialProgramsById: displayView
        ? displayView.getProgramsByAllocationTeam((allocation as any)?.team as Team | null | undefined)
        : new Map(),
    })

    return slotsForTeam.some((slot) => specialProgramSlots.includes(slot))
  }, [displayView])

  // Helper function to get slot display with optional slot filter
  const getSlotDisplayForTeamFiltered = (
    allocation: PCAAllocation & { staff: Staff },
    slotsToInclude?: number[],
    opts?: { cardKind?: 'regular' | 'specialProgram' }
  ): string | null => {
    const slotsForThisTeam: number[] = []
    if (allocation.slot1 === team) slotsForThisTeam.push(1)
    if (allocation.slot2 === team) slotsForThisTeam.push(2)
    if (allocation.slot3 === team) slotsForThisTeam.push(3)
    if (allocation.slot4 === team) slotsForThisTeam.push(4)
    const displayOnlySlots = Array.isArray((allocation as any).__displaySlots)
      ? ((allocation as any).__displaySlots as number[]).filter((slot): slot is 1 | 2 | 3 | 4 =>
          [1, 2, 3, 4].includes(slot as 1 | 2 | 3 | 4)
        )
      : []
    const baseSlotsForThisTeam =
      slotsForThisTeam.length > 0 || allocation.staff.floating ? slotsForThisTeam : displayOnlySlots
    
    // Step 1 (leave-fte): For NON-floating PCA, show the a/v slots from staffOverrides early,
    // so the staff card updates immediately when user edits leave/FTE/slots.
    const override = resolvedStaffOverrides[allocation.staff_id]
    const cardKind = opts?.cardKind ?? 'regular'

    // NEW: Check for invalidSlots array first, fallback to old invalidSlot for backward compatibility
    const invalidSlotsArray = override?.invalidSlots || []
    const hasInvalidSlots = invalidSlotsArray.length > 0
    const effectiveInvalidSlot = hasInvalidSlots ? null : (override?.invalidSlot ?? (allocation as any).invalid_slot)
    
    let effectiveSlotsToInclude = slotsToInclude
    // For NON-floating PCA, prefer staffOverrides.availableSlots as the UI source of truth
    // across steps (prevents "Whole day" flicker when saved allocations store slot1-4 = team).
    if (!effectiveSlotsToInclude && !allocation.staff.floating && cardKind !== 'specialProgram') {
      const overrideAvailable = override?.availableSlots
      if (Array.isArray(overrideAvailable) && overrideAvailable.length > 0) {
        const extra = typeof effectiveInvalidSlot === 'number' ? [effectiveInvalidSlot] : []
        const combined = Array.from(new Set([...overrideAvailable, ...extra])).sort((a, b) => a - b)
        effectiveSlotsToInclude = combined
      }
    }

    // If slotsToInclude is provided, filter to only those slots
    const filteredSlots = effectiveSlotsToInclude 
      ? baseSlotsForThisTeam.filter(slot => effectiveSlotsToInclude.includes(slot))
      : baseSlotsForThisTeam

    if (filteredSlots.length === 0) return null
    
    const invalidSlot = effectiveInvalidSlot
    
    // Exclude invalid slots from availability for THIS card, even if we don't display them here.
    const invalidSlotNumbersAll = hasInvalidSlots
      ? invalidSlotsArray.map((is) => is.slot)
      : (invalidSlot ? [invalidSlot] : [])
    const availableSlots = filteredSlots.filter((slot) => !invalidSlotNumbersAll.includes(slot))
    
    // Rule 1: If all filtered slots 1-4 assigned to this team only: show "Whole day"
    // BUT: exclude invalid slots from this check - if there's an invalid slot, don't show "Whole day"
    if (filteredSlots.length === 4 && 
        filteredSlots.includes(1) && 
        filteredSlots.includes(2) && 
        filteredSlots.includes(3) && 
        filteredSlots.includes(4) &&
        !hasInvalidSlots && !invalidSlot) { // FIX: Only show whole day if no invalid slots (new or old system)
      return 'Whole day'
    }
    
    // Rule 2: Build display parts in slot order (1, 2, 3, 4)
    // Invalid slots appear in their natural position with time ranges in brackets
    const parts: string[] = []
    
    // Decide which invalid slots are allowed to DISPLAY on this card.
    // Requirement:
    // - Never show invalid-slot formatting on special-program cards
    // - For floating PCA cards: show invalid slot only when the card includes the adjacent paired slot
    //   (1↔2, 3↔4). Example: invalid=4 shows only on the card that includes slot 3.
    const invalidSlotsForDisplay = (() => {
      if (!hasInvalidSlots) return []
      if (cardKind === 'specialProgram') return []
      if (!allocation.staff.floating) return invalidSlotsArray
      const has = (s: number) => filteredSlots.includes(s)
      const paired = (s: number) => (s === 1 ? 2 : s === 2 ? 1 : s === 3 ? 4 : s === 4 ? 3 : null)
      return invalidSlotsArray.filter((inv) => {
        const p = paired(inv.slot)
        return typeof p === 'number' && has(p)
      })
    })()

    // Get invalid slot time ranges from new system (invalidSlots array)
    const invalidSlot1 = invalidSlotsForDisplay.find((is) => is.slot === 1)
    const invalidSlot2 = invalidSlotsForDisplay.find((is) => is.slot === 2)
    const invalidSlot3 = invalidSlotsForDisplay.find((is) => is.slot === 3)
    const invalidSlot4 = invalidSlotsForDisplay.find((is) => is.slot === 4)
    
    // Check which slots are available (not invalid)
    const hasSlot1 = availableSlots.includes(1)
    const hasSlot2 = availableSlots.includes(2)
    const hasSlot3 = availableSlots.includes(3)
    const hasSlot4 = availableSlots.includes(4)
    
    // Also check if slots are assigned (for fallback display when slot is assigned but filtered out)
    const hasSlot1Assigned = filteredSlots.includes(1)
    const hasSlot2Assigned = filteredSlots.includes(2)
    const hasSlot3Assigned = filteredSlots.includes(3)
    const hasSlot4Assigned = filteredSlots.includes(4)
    
    // Process slots in order: 1, 2, 3, 4
    // Slot 1
    if (invalidSlot1) {
      // Slot 1 is invalid - show invalid time range
      parts.push(`(${invalidSlot1.timeRange.start}-${invalidSlot1.timeRange.end})`)
    } else if (hasSlot1) {
      // Slot 1 is available - check if we can show as "AM" with slot 2
      if (hasSlot2 && !invalidSlot2) {
        // Both slot 1 and 2 are available - show as "AM" (will be added when processing slot 2)
      } else {
        // Only slot 1 is available - show individual time range
        parts.push(formatTimeRange(getSlotTime(1)))
      }
    }
    
    // Slot 2
    if (invalidSlot2) {
      // Slot 2 is invalid - show invalid time range
      parts.push(`(${invalidSlot2.timeRange.start}-${invalidSlot2.timeRange.end})`)
    } else if (hasSlot2) {
      // Slot 2 is available - check if we can show as "AM" with slot 1
      if (hasSlot1 && !invalidSlot1) {
        // Both slot 1 and 2 are available - show as "AM"
        // Check if we already added slot 1 individually, if so replace it with "AM"
        const slot1Index = parts.findIndex(p => p === formatTimeRange(getSlotTime(1)))
        if (slot1Index >= 0) {
          parts[slot1Index] = 'AM'
        } else {
          parts.push('AM')
        }
      } else {
        // Only slot 2 is available - show individual time range
        parts.push(formatTimeRange(getSlotTime(2)))
      }
    }
    
    // Slot 3
    if (invalidSlot3) {
      // Slot 3 is invalid - show invalid time range
      parts.push(`(${invalidSlot3.timeRange.start}-${invalidSlot3.timeRange.end})`)
    } else if (hasSlot3) {
      // Slot 3 is available - check if we can show as "PM" with slot 4
      if (hasSlot4 && !invalidSlot4) {
        // Both slot 3 and 4 are available - show as "PM" (will be added when processing slot 4)
      } else {
        // Only slot 3 is available - show individual time range
        parts.push(formatTimeRange(getSlotTime(3)))
      }
    }
    
    // Slot 4
    if (invalidSlot4) {
      // Slot 4 is invalid - show invalid time range
      parts.push(`(${invalidSlot4.timeRange.start}-${invalidSlot4.timeRange.end})`)
    } else if (hasSlot4) {
      // Slot 4 is available - check if we can show as "PM" with slot 3
      if (hasSlot3 && !invalidSlot3) {
        // Both slot 3 and 4 are available - show as "PM"
        // Check if we already added slot 3 individually, if so replace it with "PM"
        const slot3Index = parts.findIndex(p => p === formatTimeRange(getSlotTime(3)))
        if (slot3Index >= 0) {
          parts[slot3Index] = 'PM'
        } else {
          parts.push('PM')
        }
      } else {
        // Only slot 4 is available - show individual time range
        parts.push(formatTimeRange(getSlotTime(4)))
      }
    } else if (hasSlot4Assigned && allocation.slot4 === team) {
      // FIX: If slot 4 is assigned to this team but not in availableSlots (shouldn't happen normally,
      // but handle edge case where filtering might have removed it incorrectly), still show it.
      // This ensures slot 4 displays correctly when slot 3 is invalid.
      parts.push(formatTimeRange(getSlotTime(4)))
    }
    
    // Note: New system (invalidSlots array) positions invalid slots in natural slot order (1->2->3->4)
    // Legacy leave/come-back time display has been removed.
    
    return parts.length > 0 ? parts.join(', ') : null
  }

  // Original function (calls filtered version with no filter)
  const getSlotDisplayForTeam = (allocation: PCAAllocation & { staff: Staff }): string | null => {
    return getSlotDisplayForTeamFiltered(allocation)
  }

  // Helper function to detect if a floating PCA is substituting for a non-floating PCA
  const getSubstitutionInfo = (floatingAlloc: PCAAllocation & { staff: Staff }): SubstitutionInfo => {
    if (!floatingAlloc.staff?.floating) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }
    const slotFlags = derivePcaDisplayFlagsBySlot({
      allocation: floatingAlloc as any,
      staffOverrides: resolvedStaffOverrides as Record<string, any>,
      allPCAStaff: resolvedAllPCAStaff,
      specialPrograms: resolvedSpecialPrograms,
      weekday,
      showExtraCoverageStyling: true,
    })
    const substitutedSlots = ([1, 2, 3, 4] as const).filter((slot) => {
      const slotTeam =
        slot === 1 ? floatingAlloc.slot1 : slot === 2 ? floatingAlloc.slot2 : slot === 3 ? floatingAlloc.slot3 : floatingAlloc.slot4
      return slotTeam === team && !!slotFlags[slot]?.isSubstitution
    })
    const isWholeDaySubstitution =
      substitutedSlots.length >= 3 ||
      (substitutedSlots.length === 4 &&
        substitutedSlots.includes(1) &&
        substitutedSlots.includes(2) &&
        substitutedSlots.includes(3) &&
        substitutedSlots.includes(4))
    return {
      isSubstituting: substitutedSlots.length > 0,
      isWholeDaySubstitution,
      substitutedSlots,
    }
  }

  // Helper to get special program slots for a team
  const getSpecialProgramSlotsForTeam = (allocation: PCAAllocation & { staff: Staff }, team: Team): number[] => {
    if (!displayView) return []
    const specialProgramsByIdForAllocationTeam = displayView.getProgramsByAllocationTeam((allocation as any)?.team as Team | null | undefined)
    return getAllocationSpecialProgramSlotsForTeam({
      allocation: allocation as any,
      team,
      specialProgramsById: specialProgramsByIdForAllocationTeam,
    })
  }

  const {
    pcaAllocationsWithFTE,
    regularPCA,
    specialProgramPCA,
    splitAllocationSlots,
    assignedPcaFteRounded,
    substitutionInfoByAllocId,
  } = useMemo(() => {
    // Filter out staff with FTE = 0 (they should only appear in leave block)
    // Check both allocation FTE and current override FTE (in case allocations haven't been regenerated)
    const pcaAllocationsWithFTE: (PCAAllocation & { staff: Staff })[] = allocations.filter((alloc) => {
      const allocationFTE = alloc.fte_pca || 0
      const overrideFTE = resolvedStaffOverrides[alloc.staff_id]?.fteRemaining
      const currentFTE = overrideFTE !== undefined ? overrideFTE : allocationFTE
      return currentFTE > 0
    })

    const getSlotsForThisTeam = (alloc: PCAAllocation & { staff: Staff }): number[] => {
      const slots: number[] = []
      if (alloc.slot1 === team) slots.push(1)
      if (alloc.slot2 === team) slots.push(2)
      if (alloc.slot3 === team) slots.push(3)
      if (alloc.slot4 === team) slots.push(4)
      return slots
    }

    const specialProgramSlotsByAllocId = new Map<string, number[]>()
    const getSpecialSlotsCached = (alloc: PCAAllocation & { staff: Staff }): number[] => {
      const cached = specialProgramSlotsByAllocId.get(alloc.id)
      if (cached) return cached
      const slots = getSpecialProgramSlotsForTeam(alloc, team)
      specialProgramSlotsByAllocId.set(alloc.id, slots)
      return slots
    }

    // Separate regular PCA from special program PCA
    const regularPCA: (PCAAllocation & { staff: Staff })[] = pcaAllocationsWithFTE.filter(
      alloc => !alloc.special_program_ids || alloc.special_program_ids.length === 0
    )
    const specialProgramPCA: (PCAAllocation & { staff: Staff })[] = []
    
    // Track split allocations: allocations that need to appear in both sections with different slot filters
    const splitAllocationSlots = new Map<string, { regularSlots: number[]; specialProgramSlots: number[] }>()
    
    // Process allocations with special programs - split those with both regular and special program slots in the same team
    pcaAllocationsWithFTE.forEach(alloc => {
      if (!alloc.special_program_ids || alloc.special_program_ids.length === 0) {
        return // Already in regularPCA
      }
      
      const slotsForThisTeam = getSlotsForThisTeam(alloc)
      if (slotsForThisTeam.length === 0) return // No slots in this team
      
      // Determine which slots are special program slots
      const specialProgramSlots = getSpecialSlotsCached(alloc)
      const regularSlots = slotsForThisTeam.filter(slot => !specialProgramSlots.includes(slot))
      
      // If this team has NO special-program slots for this PCA, treat it as regular for THIS team.
      // (The PCA may still be special-program in another team, but that should not disable dragging here.)
      if (specialProgramSlots.length === 0) {
        regularPCA.push(alloc)
        return
      }

      // If this allocation has both special program slots and regular slots in this team, split it
      if (regularSlots.length > 0) {
        // Track which slots to show in each section
        splitAllocationSlots.set(`${alloc.id}-${team}`, { regularSlots, specialProgramSlots })
        // Add to both sections
        regularPCA.push(alloc)
        specialProgramPCA.push(alloc)
      } else {
        // All slots in this team are special program slots.
        specialProgramPCA.push(alloc)
      }
    })

    const substitutionInfoByAllocId = new Map<string, SubstitutionInfo>()
    for (const alloc of regularPCA) {
      substitutionInfoByAllocId.set(alloc.id, getSubstitutionInfo(alloc))
    }
    
    // Sort regular PCA: whole day substituting floating PCAs first, then non-floating, then other floating
    regularPCA.sort((a, b) => {
      const aSubInfo = substitutionInfoByAllocId.get(a.id) ?? getSubstitutionInfo(a)
      const bSubInfo = substitutionInfoByAllocId.get(b.id) ?? getSubstitutionInfo(b)
      const aIsWholeDaySub = aSubInfo.isWholeDaySubstitution
      const bIsWholeDaySub = bSubInfo.isWholeDaySubstitution
      
      if (aIsWholeDaySub && !bIsWholeDaySub) return -1
      if (!aIsWholeDaySub && bIsWholeDaySub) return 1
      
      const aIsNonFloating = !a.staff.floating
      const bIsNonFloating = !b.staff.floating
      if (aIsNonFloating && !bIsNonFloating) return -1
      if (!aIsNonFloating && bIsNonFloating) return 1
      
      return 0
    })

    // Calculate assigned PCA-FTE per team (excluding special program slots)
    // This is for display only - not used in computation
    let assignedPcaFteRaw = 0
    pcaAllocationsWithFTE.forEach(allocation => {
      const slotsForThisTeam = getSlotsForThisTeam(allocation)
      
      // Exclude invalid slot from FTE calculation
      const invalidSlot = (allocation as any).invalid_slot
      const validSlotsForTeam = invalidSlot ? slotsForThisTeam.filter(s => s !== invalidSlot) : slotsForThisTeam
      
      // Identify which slots are special program slots (if any)
      const specialProgramSlots = getSpecialSlotsCached(allocation)
      
      // Count only regular slots (exclude special program slots)
      const regularSlotsForTeam = validSlotsForTeam.filter(slot => !specialProgramSlots.includes(slot))
      
      // Add 0.25 FTE per regular slot (special program slots are excluded, invalid slots already excluded)
      assignedPcaFteRaw += regularSlotsForTeam.length * 0.25
    })
    
    // Round to nearest 0.25 using the same rounding logic as pending values
    const assignedPcaFteRounded = roundToNearestQuarterWithMidpoint(assignedPcaFteRaw)

    return {
      pcaAllocationsWithFTE,
      regularPCA,
      specialProgramPCA,
      splitAllocationSlots,
      assignedPcaFteRounded,
      substitutionInfoByAllocId,
    }
  }, [
    resolvedStaffOverrides,
    allocations,
    resolvedAllPCAStaff,
    specialProgramsById,
    weekday,
    team,
  ])

  return {
    showSubstitutionStyling,
    specialProgramsById,
    pcaAllocationsWithFTE,
    areSlotsPartOfSpecialProgram,
    getSlotDisplayForTeamFiltered,
    getSlotDisplayForTeam,
    getSubstitutionInfo,
    regularPCA,
    specialProgramPCA,
    splitAllocationSlots,
    assignedPcaFteRounded,
    substitutionInfoByAllocId,
  }
}

export const PCABlock = memo(function PCABlock({
  team,
  allocations,
  onEditStaff,
  requiredPCA,
  averagePCAPerTeam,
  baseAveragePCAPerTeam,
  specialPrograms = [],
  staffOverrides = {},
  allPCAStaff = [],
  currentStep = 'leave-fte',
  step2Initialized = false,
  initializedSteps,
  weekday,
  externalHover = false,
  allocationLog,
  step3FlowChoice,
  step3OrderPosition,
  pendingPcaFte,
  floatingPoolRemainingFte,
  readOnly = false,
  droppableIdPrefix,
}: PCABlockProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${droppableIdPrefix ?? ''}pca-${team}`,
    data: { type: 'pca', team },
    disabled: readOnly,
  })
  
  const { active } = useDndContext()
  
  // Only show drag zone border if a PCA is being dragged
  const isPCADragging = !readOnly && active?.data?.current?.staff 
    ? active.data.current.staff.rank === 'PCA'
    : false
  
  // Combine dnd-kit hover and external hover.
  // - dnd-kit hover should only apply when a PCA is being dragged via dnd-kit
  // - externalHover is used for "drag from slot picker" mode (not dnd-kit), so allow it directly
  const showHoverEffect = !readOnly && ((isOver && isPCADragging) || externalHover)
  const showExtraCoverageStyling = shouldShowExtraCoverage({ currentStep, initializedSteps })

  const {
    showSubstitutionStyling,
    specialProgramsById,
    pcaAllocationsWithFTE,
    areSlotsPartOfSpecialProgram,
    getSlotDisplayForTeam,
    getSlotDisplayForTeamFiltered,
    getSubstitutionInfo,
    regularPCA,
    specialProgramPCA,
    splitAllocationSlots,
    assignedPcaFteRounded,
    substitutionInfoByAllocId,
  } = usePcaBlockViewModel({
    team,
    allocations,
    specialPrograms,
    staffOverrides,
    allPCAStaff,
    currentStep,
    step2Initialized,
    weekday,
  })

  // DRO only: if this is a DRM weekday, we can derive base Avg PCA/team even when legacy/stored calculations
  // did not persist `base_average_pca_per_team`.
  const drmPcaFteAddon =
    !!weekday
      ? computeDrmAddOnFte({
          specialPrograms,
          weekday,
          staffOverrides: staffOverrides as any,
          defaultAddOn: 0.4,
        })
      : 0
  const isDrmActive = team === 'DRO' && !!weekday && drmPcaFteAddon > 0
  const derivedBaseAveragePCAPerTeam =
    isDrmActive && typeof averagePCAPerTeam === 'number' ? averagePCAPerTeam - drmPcaFteAddon : undefined
  const effectiveBaseAveragePCAPerTeam =
    team === 'DRO'
      ? typeof baseAveragePCAPerTeam === 'number'
        ? baseAveragePCAPerTeam
        : derivedBaseAveragePCAPerTeam
      : undefined

  // Helper function to group slots and format them (for both substituting and regular slots)
  const formatSlotGroup = (slots: number[]): string => {
    if (slots.length === 0) return ''
    
    // Check for AM grouping (slots 1 and 2)
    const hasSlot1 = slots.includes(1)
    const hasSlot2 = slots.includes(2)
    const hasAM = hasSlot1 && hasSlot2
    
    // Check for PM grouping (slots 3 and 4)
    const hasSlot3 = slots.includes(3)
    const hasSlot4 = slots.includes(4)
    const hasPM = hasSlot3 && hasSlot4
    
    const parts: string[] = []
    
    // Process AM slots
    if (hasAM) {
      parts.push('AM')
    } else {
      if (hasSlot1) parts.push(formatTimeRange(getSlotTime(1)))
      if (hasSlot2) parts.push(formatTimeRange(getSlotTime(2)))
    }
    
    // Process PM slots
    if (hasPM) {
      parts.push('PM')
    } else {
      if (hasSlot3) parts.push(formatTimeRange(getSlotTime(3)))
      if (hasSlot4) parts.push(formatTimeRange(getSlotTime(4)))
    }
    
    return parts.join(', ')
  }

  // Helper function to render slot display with blue/bold styling for leave/come back times
  // and green styling for substituted slots (only in Step 2+)
  // Now handles separation of substituting slots from regular slots
  const renderSlotDisplay = (
    displayText: string | null,
    allocation: PCAAllocation & { staff: Staff },
    displayedSlots?: number[]
  ): React.ReactNode => {
    if (!displayText) return null

    // NEW: Check for invalid slots from staffOverrides (new system)
    const override = staffOverrides[allocation.staff_id]
    const invalidSlots = override?.invalidSlots || []
    
    // Check if this is a floating PCA substituting slots (only in Step 2+)
    const substitutionInfo = showSubstitutionStyling ? getSubstitutionInfo(allocation) : { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    const isSubstituting = substitutionInfo.isSubstituting
    const substitutedSlots = substitutionInfo.substitutedSlots
    
    // Get all slots assigned to this team for the PCA.
    // If caller provides displayedSlots (e.g. split allocation regular slots),
    // keep display mutually-exclusive by only considering those slots.
    const allSlotsForTeam: number[] = []
    const allow = Array.isArray(displayedSlots) && displayedSlots.length > 0 ? displayedSlots : null
    if (allocation.slot1 === team && (!allow || allow.includes(1))) allSlotsForTeam.push(1)
    if (allocation.slot2 === team && (!allow || allow.includes(2))) allSlotsForTeam.push(2)
    if (allocation.slot3 === team && (!allow || allow.includes(3))) allSlotsForTeam.push(3)
    if (allocation.slot4 === team && (!allow || allow.includes(4))) allSlotsForTeam.push(4)
    
    // Separate substituting slots from regular slots
    const regularSlots = allSlotsForTeam.filter(slot => !substitutedSlots.includes(slot))
    
    // If no substitution, return display text (invalid slots are already integrated into displayText)
    if (!isSubstituting || substitutedSlots.length === 0) {
      // Invalid slot time ranges are now part of displayText, so we need to highlight them in blue
      // NOTE: invalidSlots represent "present interval inside an invalid (non-counted) slot".
      // They should be highlighted even if that slot isn't counted as assigned to this team.
      const invalidSlotTimeRanges = invalidSlots.map(is => `(${is.timeRange.start}-${is.timeRange.end})`)
      
      if (invalidSlotTimeRanges.length > 0) {
        // Split displayText by invalid slot time ranges and highlight them
        const regex = new RegExp(`(${invalidSlotTimeRanges.map(tr => tr.replace(/[()]/g, '\\$&')).join('|')})`, 'g')
        const parts = displayText.split(regex)
        return (
          <span>
            {parts.map((part, index) => {
              if (invalidSlotTimeRanges.includes(part)) {
                return <span key={index} className="text-blue-600">{part}</span>
              }
              return <span key={index}>{part}</span>
            })}
          </span>
        )
      }
      
      return <span>{displayText}</span>
    }
    
    // Case 1: Whole day substitution (all 4 slots are substituting)
    if (substitutedSlots.length === 4 && displayText === 'Whole day') {
      // Add invalid slot time ranges if any
      const invalidSlotTimeRanges = invalidSlots.map(is => `(${is.timeRange.start}-${is.timeRange.end})`)
        .join('')
      
      if (invalidSlotTimeRanges) {
        return (
          <span>
            <span className="text-green-700 font-medium">Whole day</span>
            <span className="text-blue-600">{invalidSlotTimeRanges}</span>
          </span>
        )
      }
      return <span className="text-green-700 font-medium">Whole day</span>
    }
    
    // Case 2: Mixed case - some slots are substituting, some are regular
    // Build display directly from slot numbers so AM/PM grouping never crosses substitution boundaries.
    if (substitutedSlots.length > 0 && regularSlots.length > 0) {
      const slotsInTeam = new Set(allSlotsForTeam)
      const substitutedSet = new Set(substitutedSlots)
      const parts: Array<{ text: string; isSubstituted: boolean }> = []

      const pushSlot = (slot: number) => {
        parts.push({
          text: formatTimeRange(getSlotTime(slot as 1 | 2 | 3 | 4)),
          isSubstituted: substitutedSet.has(slot),
        })
      }
      const pushGrouped = (label: 'AM' | 'PM', isSubstituted: boolean) => {
        parts.push({ text: label, isSubstituted })
      }

      const hasSlot1 = slotsInTeam.has(1)
      const hasSlot2 = slotsInTeam.has(2)
      if (hasSlot1 && hasSlot2) {
        const slot1Sub = substitutedSet.has(1)
        const slot2Sub = substitutedSet.has(2)
        if (slot1Sub === slot2Sub) {
          pushGrouped('AM', slot1Sub)
        } else {
          pushSlot(1)
          pushSlot(2)
        }
      } else {
        if (hasSlot1) pushSlot(1)
        if (hasSlot2) pushSlot(2)
      }

      const hasSlot3 = slotsInTeam.has(3)
      const hasSlot4 = slotsInTeam.has(4)
      if (hasSlot3 && hasSlot4) {
        const slot3Sub = substitutedSet.has(3)
        const slot4Sub = substitutedSet.has(4)
        if (slot3Sub === slot4Sub) {
          pushGrouped('PM', slot3Sub)
        } else {
          pushSlot(3)
          pushSlot(4)
        }
      } else {
        if (hasSlot3) pushSlot(3)
        if (hasSlot4) pushSlot(4)
      }

      const invalidSlotTimeRanges = invalidSlots.map((is) => `(${is.timeRange.start}-${is.timeRange.end})`).join('')

      return (
        <span>
          {parts.map((part, index) => (
            <React.Fragment key={`${part.text}-${index}`}>
              {index > 0 ? ', ' : null}
              {part.isSubstituted ? (
                <span className="text-green-700 font-medium">{part.text}</span>
              ) : (
                <span>{part.text}</span>
              )}
            </React.Fragment>
          ))}
          {invalidSlotTimeRanges && <span className="text-blue-600">{invalidSlotTimeRanges}</span>}
        </span>
      )
    }
    
    // Case 3: Only substituting slots (no regular slots) - partial substitution
    // This handles cases where floating PCA is only substituting, not also assigned as regular
    if (substitutedSlots.length > 0 && regularSlots.length === 0) {
      const substitutingDisplay = formatSlotGroup(substitutedSlots)
      
      // Add invalid slot time ranges if any
      const invalidSlotTimeRanges = invalidSlots.map(is => `(${is.timeRange.start}-${is.timeRange.end})`)
        .join('')
      
      // Show substituting slots in green
      return (
        <span>
          <span className="text-green-700 font-medium">
            {substitutingDisplay || displayText}
          </span>
          {invalidSlotTimeRanges && <span className="text-blue-600">{invalidSlotTimeRanges}</span>}
        </span>
      )
    }
    
    // Fallback: if we somehow have substitution info but no slots match,
    // try to highlight substituted parts in the display text
    const substitutedSlotTimes = new Set<string>()
    substitutedSlots.forEach(slot => {
      const slotTime = getSlotTime(slot)
      const formatted = formatTimeRange(slotTime)
      substitutedSlotTimes.add(formatted)
    })
    
    // Also check for AM/PM substitutions
    if (substitutedSlots.includes(1) && substitutedSlots.includes(2)) {
      substitutedSlotTimes.add('AM')
    }
    if (substitutedSlots.includes(3) && substitutedSlots.includes(4)) {
      substitutedSlotTimes.add('PM')
    }
    
    const parts = displayText.split(/(AM|PM|\d{4}-\d{4})/g)
    
    // Add invalid slot time ranges if any
    const invalidSlotTimeRanges = invalidSlots.map(is => `(${is.timeRange.start}-${is.timeRange.end})`)
      .join('')
    
    return (
      <span>
        {parts.map((part, index) => {
          if (substitutedSlotTimes.has(part)) {
            return (
              <span key={index} className="text-green-700 font-medium">
                {part}
              </span>
            )
          }
          return <span key={index}>{part}</span>
        })}
        {invalidSlotTimeRanges && <span className="text-blue-600">{invalidSlotTimeRanges}</span>}
      </span>
    )
  }

  return (
    <Card
      ref={setNodeRef}
      className={showHoverEffect ? 'border-2 border-slate-900 dark:border-slate-100' : ''}
      data-pca-team={team}
    >
      <CardContent className="p-2 pt-1 flex flex-col min-h-full">
        <div className="space-y-1 flex-1">
          {/* Regular PCA first */}
          {regularPCA.map((allocation) => {
            // Check if this is a split allocation - if so, only show regular slots
            const splitInfo = splitAllocationSlots.get(`${allocation.id}-${team}`)
            const slotsToDisplay = splitInfo ? splitInfo.regularSlots : undefined

            // Hide "ghost" cards that exist in this team ONLY because of invalid slot(s).
            // Example (from bug): invalid slot 3 is assigned to SFM in allocations, but should be paired with slot 4,
            // so we should not render a standalone card in SFM when this team only contains invalid slots.
            const override = staffOverrides?.[allocation.staff_id]
            const invalidNums = Array.isArray(override?.invalidSlots) ? override!.invalidSlots.map((x) => x.slot) : []
            const hasInvalidNums = invalidNums.length > 0
            if (hasInvalidNums) {
              const slotsInThisTeam: number[] = []
              const allow = Array.isArray(slotsToDisplay) && slotsToDisplay.length > 0 ? slotsToDisplay : null
              if (allocation.slot1 === team && (!allow || allow.includes(1))) slotsInThisTeam.push(1)
              if (allocation.slot2 === team && (!allow || allow.includes(2))) slotsInThisTeam.push(2)
              if (allocation.slot3 === team && (!allow || allow.includes(3))) slotsInThisTeam.push(3)
              if (allocation.slot4 === team && (!allow || allow.includes(4))) slotsInThisTeam.push(4)
              if (slotsInThisTeam.length > 0 && slotsInThisTeam.every((s) => invalidNums.includes(s))) {
                return null
              }
            }

            const slotDisplay = slotsToDisplay 
              ? getSlotDisplayForTeamFiltered(allocation, slotsToDisplay, { cardKind: 'regular' })
              : getSlotDisplayForTeam(allocation)
            const slotDisplayNode = renderSlotDisplay(slotDisplay, allocation, slotsToDisplay)
            const extraSlotsForTeam = (() => {
              if (!showExtraCoverageStyling) return [] as number[]
              const o: any = (staffOverrides as any)?.[allocation.staff_id]
              const flags: any = o?.extraCoverageBySlot
              if (!flags || typeof flags !== 'object') return [] as number[]
              const allow = Array.isArray(slotsToDisplay) && slotsToDisplay.length > 0 ? new Set(slotsToDisplay) : null
              const extra: number[] = []
              if (allocation.slot1 === team && !!flags[1] && (!allow || allow.has(1))) extra.push(1)
              if (allocation.slot2 === team && !!flags[2] && (!allow || allow.has(2))) extra.push(2)
              if (allocation.slot3 === team && !!flags[3] && (!allow || allow.has(3))) extra.push(3)
              if (allocation.slot4 === team && !!flags[4] && (!allow || allow.has(4))) extra.push(4)
              return extra
            })()
            const slotDisplayNodeWithExtra = extraSlotsForTeam.length > 0 ? (
              <div className="space-y-0.5">
                {slotDisplayNode}
                <div className="text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                  Extra: slots {extraSlotsForTeam.join(', ')}
                </div>
              </div>
            ) : slotDisplayNode
            
            // Check substitution info (only apply styling in Step 2+)
            const computedSub = substitutionInfoByAllocId.get(allocation.id)
            const substitutionInfo = showSubstitutionStyling && computedSub
              ? computedSub
              : { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
            const isWholeDaySub = substitutionInfo.isWholeDaySubstitution
          const isSubstituting = substitutionInfo.isSubstituting
            
            // Set border color: green only for substitute coverage cards (Step 2+ only).
            const borderColor = (showSubstitutionStyling && isSubstituting) 
              ? 'border-green-700' 
              : undefined
            
            // Underline name for whole day substitution (Step 2+ only)
            // Includes buffer non-floating substitutes when they are explicitly marked via staffOverrides.substitutionFor.
            const nameStyle = (showSubstitutionStyling && isSubstituting && isWholeDaySub) ? 'underline' : undefined
            
            // Buffer floating PCA: transferrable in Step 3 only
            // Regular floating PCA: transferrable in Step 3 only
            const isBufferStaff = allocation.staff.status === 'buffer'
            const isFloatingPCA = allocation.staff.floating
            // All floating PCA (buffer and regular) can be dragged in Step 3 only
            // The schedule page validation will handle step restrictions
            const canDrag = isFloatingPCA
            const isInCorrectStep = currentStep === 'floating-pca'
            
            const staffCard = (
              <StaffCard
                key={`${allocation.id}-regular-${team}`}
                staff={allocation.staff}
                useDragOverlay={true}
                allocation={allocation as any}
                fteRemaining={undefined}
                slotDisplay={slotDisplayNodeWithExtra}
                headerRight={(() => {
                  if (extraSlotsForTeam.length === 0) return null
                  return <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 whitespace-nowrap">Extra</span>
                })()}
                onEdit={readOnly ? undefined : (e) => onEditStaff?.(allocation.staff_id, e)}
                onOpenContextMenu={readOnly ? undefined : (e) => onEditStaff?.(allocation.staff_id, e)}
                fillColorClassName={(staffOverrides as any)?.[allocation.staff_id]?.cardColorByTeam?.[team]}
                borderColor={borderColor}
                nameColor={nameStyle}
                dragTeam={team}
                draggable={!readOnly} // Reference panes should never initiate drags
              />
            )
            
            if (readOnly) return staffCard

            // Add tooltip for regular floating PCA when not in correct step
            // Use composite ID (staffId::team) to match the draggable ID
            if (isFloatingPCA && !isInCorrectStep) {
              const compositeStaffId = `${allocation.staff.id}::${team}`
              return (
                <DragValidationTooltip
                  key={`${allocation.id}-regular-${team}`}
                  staffId={compositeStaffId}
                  allowMultiLine={true}
                  content="Floating PCA slot dragging-&-allocating is only available in Step 3 only."
                >
                  {staffCard}
                </DragValidationTooltip>
              )
            }
            
            return staffCard
          })}
          
          {/* Special program PCA at bottom (before FTE text) */}
          {specialProgramPCA.map((allocation) => {
            // Check if this is a split allocation - if so, only show special program slots
            const splitInfo = splitAllocationSlots.get(`${allocation.id}-${team}`)
            const slotsToDisplay = splitInfo ? splitInfo.specialProgramSlots : undefined
            const slotDisplay = slotsToDisplay
              ? getSlotDisplayForTeamFiltered(allocation, slotsToDisplay, { cardKind: 'specialProgram' })
              : getSlotDisplayForTeamFiltered(allocation, undefined, { cardKind: 'specialProgram' })
            // IMPORTANT: Special program card should show ONLY special-program slot time(s),
            // and should NOT inherit non-floating substitution (green) styling.
            const slotDisplayNode = slotDisplay ? <span>{slotDisplay}</span> : null
            
            // For split allocations, always show red (special program slots)
            // For non-split allocations, determine based on slots
            const nameColor = splitInfo 
              ? 'text-red-600'  // Split allocation in special program section = always red
              : (() => {
                  const slotsForThisTeam: number[] = []
                  if (allocation.slot1 === team) slotsForThisTeam.push(1)
                  if (allocation.slot2 === team) slotsForThisTeam.push(2)
                  if (allocation.slot3 === team) slotsForThisTeam.push(3)
                  if (allocation.slot4 === team) slotsForThisTeam.push(4)
                  const isSpecialProgramSlot = areSlotsPartOfSpecialProgram(allocation, team, slotsForThisTeam)
                  return isSpecialProgramSlot ? 'text-red-600' : 'text-black'
                })()

            const specialProgramLabel = (() => {
              const ids = (allocation as any).special_program_ids as string[] | null | undefined
              if (!Array.isArray(ids) || ids.length === 0) return null
              const names = ids
                .map((id) => specialProgramsById.get(id)?.name)
                .filter((n): n is string => typeof n === 'string' && n.length > 0)
              if (names.length === 0) return null
              return names.join('/')
            })()
            
            // Set border color to deep green for non-floating PCA
            const borderColor = !allocation.staff.floating ? 'border-green-700' : undefined
            
            // Special program slots are non-draggable (always)
            
            return (
              <StaffCard
                key={`${allocation.id}-special-${team}`}
                staff={allocation.staff}
                useDragOverlay={true}
                allocation={allocation as any}
                fteRemaining={undefined}
                slotDisplay={slotDisplayNode}
                headerRight={
                  specialProgramLabel ? (
                    <span className="text-red-600 whitespace-nowrap">{specialProgramLabel}</span>
                  ) : null
                }
                onEdit={readOnly ? undefined : (e) => onEditStaff?.(allocation.staff_id, e)}
                onOpenContextMenu={readOnly ? undefined : (e) => onEditStaff?.(allocation.staff_id, e)}
                fillColorClassName={(staffOverrides as any)?.[allocation.staff_id]?.cardColorByTeam?.[team]}
                nameColor={nameColor}
                borderColor={borderColor}
                dragTeam={team}
                draggable={false} // Special program slots are never draggable
              />
            )
          })}
          
          {pcaAllocationsWithFTE.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No PCA assigned
            </p>
          )}
        </div>
        {/* Required PCA per team indicator at absolute bottom */}
        {(averagePCAPerTeam !== undefined && averagePCAPerTeam > 0) || assignedPcaFteRounded > 0 ? (
          <div className="mt-auto pt-1 border-t border-border/50">
            {/* DRM special program indicator for DRO team (similar to CRP in TherapistBlock) */}
            {isDrmActive && (
              <div className="flex justify-between items-center mb-1">
                <div className="text-xs text-red-600 font-medium">DRM</div>
                <div className="text-xs text-red-600 font-medium">+{drmPcaFteAddon.toFixed(2)}</div>
              </div>
            )}
            {/* Average PCA per team (calculated requirement) */}
            {/* For DRO+DRM: show base avg PCA/team (without DRM add-on) if available (or derivable) */}
            {team === 'DRO' && effectiveBaseAveragePCAPerTeam !== undefined && effectiveBaseAveragePCAPerTeam > 0 ? (
              <div className="text-xs text-black font-medium">
                Avg PCA/team: {effectiveBaseAveragePCAPerTeam.toFixed(2)}
              </div>
            ) : averagePCAPerTeam !== undefined && averagePCAPerTeam > 0 ? (
              <div className="text-xs text-black font-medium">
                Avg PCA/team: {averagePCAPerTeam.toFixed(2)}
              </div>
            ) : null}
            {/* Final PCA/team for DRO team (with DRM add-on) */}
            {team === 'DRO' &&
              isDrmActive &&
              averagePCAPerTeam !== undefined &&
              averagePCAPerTeam > 0 &&
              effectiveBaseAveragePCAPerTeam !== undefined &&
              effectiveBaseAveragePCAPerTeam > 0 && (
              <div className="text-xs text-black/70 mt-0.5">
                Final PCA/team: {averagePCAPerTeam.toFixed(2)}
              </div>
            )}
            {/* Assigned PCA-FTE per team (rounded, excluding special program slots) with allocation tracking tooltip */}
            {assignedPcaFteRounded > 0 && (() => {
              // Detect buffer floating PCA assignments from allocations (not in allocationLog)
              // These are manual assignments from step 3.0
              const bufferFloatingAssignments: Array<{ pcaId: string; pcaName: string; slots: number[] }> = []
              const bufferFloatingSlots: number[] = []
              
              allocations.forEach(alloc => {
                if (alloc.staff.floating && alloc.staff.status === 'buffer') {
                  const slots: number[] = []
                  if (alloc.slot1 === team) slots.push(1)
                  if (alloc.slot2 === team) slots.push(2)
                  if (alloc.slot3 === team) slots.push(3)
                  if (alloc.slot4 === team) slots.push(4)
                  
                  if (slots.length > 0) {
                    bufferFloatingAssignments.push({
                      pcaId: alloc.staff_id,
                      pcaName: alloc.staff.name,
                      slots
                    })
                    bufferFloatingSlots.push(...slots)
                  }
                }
              })
              
              // Check if team was fulfilled by buffer assignments
              const hasBufferAssignments = bufferFloatingSlots.length > 0
              const hasTracker = !!allocationLog
              const hasAllocationAssignments = !!allocationLog && allocationLog.assignments.length > 0
              
              // Group assignments by PCA name for display
              // Exclude buffer floating PCAs from groupedByPCA (they're shown separately above)
              const bufferPCAIds = new Set(bufferFloatingAssignments.map(b => b.pcaId))
              type AllocationAssignment = TeamAllocationLog['assignments'][number]
              const groupedByPCA = new Map<string, Array<{ slot: number; assignment: AllocationAssignment }>>()
              if (hasAllocationAssignments) {
                allocationLog.assignments.forEach(a => {
                  // Skip buffer floating PCAs - they're already shown in bufferFloatingAssignments section
                  if (bufferPCAIds.has(a.pcaId)) return
                  
                  if (!groupedByPCA.has(a.pcaName)) {
                    groupedByPCA.set(a.pcaName, [])
                  }
                  groupedByPCA.get(a.pcaName)!.push({ slot: a.slot, assignment: a })
                })
              }
              
              // Count actual slots (1,2,3,4) - count ALL slot numbers, not unique slots
              // This means if 光劭 has slots [1,2,4] and 友好 has slot [2], total = 4 slots (1+2+4+2)
              // From allocation log: get all slot numbers (including duplicates)
              // BUT exclude buffer floating PCAs - they're counted separately
              const slotsFromLog = hasAllocationAssignments
                ? allocationLog.assignments
                    .filter(a => !bufferPCAIds.has(a.pcaId))  // Exclude buffer PCAs from log
                    .map(a => a.slot)
                : []
              // From buffer assignments: get all slot numbers
              // Combine and count all slots (not unique)
              const allSlots = [...slotsFromLog, ...bufferFloatingSlots]
              const totalActualSlots = allSlots.length
              
              // Check if team was fulfilled by buffer assignments only
              // This happens when buffer assignments cover all the team's needs and no algorithm ran
              const fulfilledByBufferOnly = hasBufferAssignments && !hasAllocationAssignments && bufferFloatingSlots.length > 0
              
              // Get allocation order for each cycle (if available)
              // Cycle 1 order is always available (from step 3.1 teamOrder) - all teams are processed in cycle 1
              // Cycle 2/3 orders are only shown if the team received assignments in those cycles
              const cycle1Assignments = hasAllocationAssignments
                ? allocationLog.assignments.filter(a => a.cycle === 1)
                : []
              const cycle2Assignments = hasAllocationAssignments
                ? allocationLog.assignments.filter(a => a.cycle === 2)
                : []
              const cycle3Assignments = hasAllocationAssignments
                ? allocationLog.assignments.filter(a => a.cycle === 3)
                : []
              
              // Cycle 1 order: Get from any assignment (all should have the same allocationOrder based on teamOrder from step 3.1)
              // Always show cycle 1 order since all teams are processed in cycle 1
              const allocationOrderCycle1 =
                step3OrderPosition !== undefined
                  ? step3OrderPosition
                  : (hasAllocationAssignments && allocationLog.assignments[0].allocationOrder !== undefined
                      ? allocationLog.assignments[0].allocationOrder
                      : undefined)
              
              // Cycle 2 order: Only show if team received assignments in cycle 2
              const allocationOrderCycle2 = cycle2Assignments.length > 0 && cycle2Assignments[0].allocationOrder !== undefined
                ? cycle2Assignments[0].allocationOrder
                : undefined
              
              // Cycle 3 order: Only show if team received assignments in cycle 3
              const allocationOrderCycle3 = cycle3Assignments.length > 0 && cycle3Assignments[0].allocationOrder !== undefined
                ? cycle3Assignments[0].allocationOrder
                : undefined
              
              const showOnLeft = team === 'DRO' || ['NSM', 'GMC', 'MC'].includes(team)
              const tooltipVariant = selectPcaTrackerTooltipVariant({
                explicitFlowSurface: step3FlowChoice,
                allocationLog,
              })
              const v2TooltipModel =
                tooltipVariant === 'v2'
                  ? buildV2PcaTrackerTooltipModel({
                      team,
                      allocationLog,
                      bufferAssignments: bufferFloatingAssignments,
                      step3OrderPosition: allocationOrderCycle1,
                      pendingPcaFte,
                      staffOverrides,
                    })
                  : null

              const tooltipBody =
                hasTracker || hasBufferAssignments ? (
                  tooltipVariant === 'v2' && v2TooltipModel ? (
                    <V2PcaTrackerTooltip model={v2TooltipModel} />
                  ) : (
                    <V1PcaTrackerTooltip
                      team={team}
                      hasAllocationAssignments={hasAllocationAssignments}
                      hasBufferAssignments={hasBufferAssignments}
                      allocationLog={allocationLog}
                      allocationOrderCycle1={allocationOrderCycle1}
                      allocationOrderCycle2={allocationOrderCycle2}
                      allocationOrderCycle3={allocationOrderCycle3}
                      totalActualSlots={totalActualSlots}
                      bufferFloatingSlots={bufferFloatingSlots}
                      bufferFloatingAssignments={bufferFloatingAssignments}
                      groupedByPCA={groupedByPCA}
                      fulfilledByBufferOnly={fulfilledByBufferOnly}
                      pendingPcaFte={pendingPcaFte}
                      floatingPoolRemainingFte={floatingPoolRemainingFte}
                    />
                  )
                ) : null

              return (
                <div className="relative group mt-0.5">
                  <div className="text-xs text-black/60 cursor-help">Assigned: {assignedPcaFteRounded.toFixed(2)}</div>
                  <div
                    className={`absolute ${showOnLeft ? 'right-0' : 'left-0'} bottom-full mb-2 ${tooltipVariant === 'v2' ? 'max-w-[min(92vw,18rem)] w-72 p-2.5 text-[10px] leading-snug rounded-md' : 'w-80 p-3 text-xs rounded'} bg-gray-900 text-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none`}
                  >
                    {tooltipBody}
                    <div
                      className={`absolute top-full ${showOnLeft ? 'right-4' : 'left-4'} w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900`}
                    />
                  </div>
                </div>
              )
            })()}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
})

