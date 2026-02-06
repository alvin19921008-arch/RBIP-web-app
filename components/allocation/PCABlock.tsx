'use client'

import React, { useMemo, useCallback } from 'react'
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
  }> // Current staff overrides (leave + substitution UI)
  allPCAStaff?: Staff[] // All PCA staff (for identifying non-floating PCAs even when not in allocations)
  currentStep?: string // Current step in the workflow - substitution styling only shown in step 2+
  step2Initialized?: boolean // Whether Step 2 algorithm has been run
  initializedSteps?: Set<string> // Set of initialized steps (for transfer restriction validation)
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' // Weekday for checking if DRM is active
  externalHover?: boolean // External hover state (e.g., from popover drag)
  allocationLog?: TeamAllocationLog // Allocation tracking log for this team (from Step 3.4)
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

export function PCABlock({
  team,
  allocations,
  onEditStaff,
  requiredPCA,
  averagePCAPerTeam,
  baseAveragePCAPerTeam,
  specialPrograms = [],
  allPCAAllocations = [],
  staffOverrides = {},
  allPCAStaff = [],
  currentStep = 'leave-fte',
  step2Initialized = false,
  initializedSteps,
  weekday,
  externalHover = false,
  allocationLog,
  step3OrderPosition,
  pendingPcaFte,
  floatingPoolRemainingFte,
  readOnly = false,
  droppableIdPrefix,
}: PCABlockProps) {
  // Only show substitution styling AFTER Step 2 algorithm has run (not just when navigating to Step 2)
  const showSubstitutionStyling = currentStep !== 'leave-fte' && step2Initialized
  
  const specialProgramsById = useMemo(() => {
    const map = new Map<string, SpecialProgram>()
    for (const p of specialPrograms) map.set(p.id, p)
    return map
  }, [specialPrograms])
  
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

  // Filter out staff with FTE = 0 (they should only appear in leave block)
  // Check both allocation FTE and current override FTE (in case allocations haven't been regenerated)
  const pcaAllocationsWithFTE = useMemo(() => {
    return allocations.filter(alloc => {
    // Check allocation FTE first
    const allocationFTE = alloc.fte_pca || 0
    // Check override FTE (current value from edits, may be more up-to-date)
    const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
    // Use override FTE if available, otherwise use allocation FTE
    const currentFTE = overrideFTE !== undefined ? overrideFTE : allocationFTE
      return currentFTE > 0
  })
  }, [allocations, staffOverrides])

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

    // Find the special program(s) for this allocation (preserve specialPrograms array order)
    let program: SpecialProgram | undefined
    for (const p of specialPrograms) {
      if (allocation.special_program_ids?.includes(p.id)) {
        program = p
        break
      }
    }
    if (!program) return false

    // For Robotic: slots 1-2 → SMM, slots 3-4 → SFM
    // Only these specific slot-team combinations are special program slots
    if (program.name === 'Robotic') {
      if (currentTeam === 'SMM') {
        // In SMM, only slots 1-2 are special program slots
        return slotsForTeam.some(slot => slot === 1 || slot === 2)
      }
      if (currentTeam === 'SFM') {
        // In SFM, only slots 3-4 are special program slots
        return slotsForTeam.some(slot => slot === 3 || slot === 4)
      }
      // In any other team, these are not special program slots
      return false
    }

    // For CRP: slot 2 → CPPC
    // Only slot 2 in CPPC is a special program slot
    if (program.name === 'CRP') {
      return currentTeam === 'CPPC' && slotsForTeam.includes(2)
    }

    // For other programs, if the current team matches the allocation's primary team,
    // assume all slots in that team are special program slots
    return allocation.team === currentTeam
  }, [specialPrograms])

  // Helper function to get slot display for PCA allocation in this team
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
    
    // Step 1 (leave-fte): For NON-floating PCA, show the a/v slots from staffOverrides early,
    // so the staff card updates immediately when user edits leave/FTE/slots.
    const override = staffOverrides[allocation.staff_id]
    const cardKind = opts?.cardKind ?? 'regular'

    // NEW: Check for invalidSlots array first, fallback to old invalidSlot for backward compatibility
    const invalidSlotsArray = override?.invalidSlots || []
    const hasInvalidSlots = invalidSlotsArray.length > 0
    const effectiveInvalidSlot = hasInvalidSlots ? null : (override?.invalidSlot ?? (allocation as any).invalid_slot)
    
    let effectiveSlotsToInclude = slotsToInclude
    if (!effectiveSlotsToInclude && currentStep === 'leave-fte' && !allocation.staff.floating) {
      const overrideAvailable = override?.availableSlots
      if (Array.isArray(overrideAvailable) && overrideAvailable.length > 0) {
        const extra = typeof effectiveInvalidSlot === 'number' ? [effectiveInvalidSlot] : []
        const combined = Array.from(new Set([...overrideAvailable, ...extra])).sort((a, b) => a - b)
        effectiveSlotsToInclude = combined
      }
    }

    // If slotsToInclude is provided, filter to only those slots
    const filteredSlots = effectiveSlotsToInclude 
      ? slotsForThisTeam.filter(slot => effectiveSlotsToInclude.includes(slot))
      : slotsForThisTeam
    
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
  const getSubstitutionInfo = (floatingAlloc: PCAAllocation & { staff: Staff }): {
    isSubstituting: boolean
    isWholeDaySubstitution: boolean
    substitutedSlots: number[] // Slots that are being substituted
  } => {
    const override = staffOverrides[floatingAlloc.staff_id]
    
    // Get slots assigned to this team for the floating PCA
    const floatingSlotsForTeam: number[] = []
    if (floatingAlloc.slot1 === team) floatingSlotsForTeam.push(1)
    if (floatingAlloc.slot2 === team) floatingSlotsForTeam.push(2)
    if (floatingAlloc.slot3 === team) floatingSlotsForTeam.push(3)
    if (floatingAlloc.slot4 === team) floatingSlotsForTeam.push(4)
    
    if (floatingSlotsForTeam.length === 0) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }
    
    // FIRST: Check if this PCA has substitutionFor in staffOverrides (user-selected substitution)
    // NOTE: This can apply to BOTH:
    // - floating PCAs (classic Step 2.1 substitution)
    // - buffer non-floating PCAs that are explicitly marked as whole-day substitutes
    if (override?.substitutionFor && override.substitutionFor.team === team) {
      const substitutedSlots = override.substitutionFor.slots
      // Treat 3+ slots as "whole-day-ish" for UI polish (underline + green border),
      // to support edge cases where a special program occupies 1 slot and the PCA substitutes the other 3.
      const isWholeDay =
        substitutedSlots.length >= 3 ||
        (substitutedSlots.length === 4 &&
          substitutedSlots.includes(1) &&
          substitutedSlots.includes(2) &&
          substitutedSlots.includes(3) &&
          substitutedSlots.includes(4))

      return {
        isSubstituting: true,
        isWholeDaySubstitution: isWholeDay,
        substitutedSlots,
      }
    }

    // If this floating PCA is assigned to a special program (Step 2),
    // don't auto-derive "non-floating substitution" styling from missing slots.
    // (But if user explicitly picked substitutionFor above, we DO allow green styling.)
    const hasSpecialProgramAssignment =
      Array.isArray((floatingAlloc as any).special_program_ids) && (floatingAlloc as any).special_program_ids.length > 0
    if (hasSpecialProgramAssignment) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }

    // (special-program guard moved above)

    // SECOND: Derive substitution slots from the *non-floating* PCA's overrides (survives refresh/load).
    // - If a non-floating PCA has fteRemaining=0, they need whole-day substitution (slots 1-4).
    // - If a non-floating PCA has availableSlots, missing slots are ([1..4] \ availableSlots).
    // - If a non-floating PCA has invalidSlot set, they need substitution for that specific slot.
    //
    // This supports the "mixed case" where the same floating PCA is both:
    // - subbing for specific slot(s) AND
    // - assigned regular slots in Step 3 to the same team.
    try {
      const hasAnyExplicitSubstitutionForTeam =
        Object.values(staffOverrides).some((o: any) => o?.substitutionFor?.team === team && Array.isArray(o?.substitutionFor?.slots) && o.substitutionFor.slots.length > 0)

      // If explicit substitutionFor exists for this team (from Step 2.1),
      // do NOT use heuristic inference. Otherwise we can incorrectly paint
      // other floating PCAs green just because they share a missing slot.
      if (hasAnyExplicitSubstitutionForTeam) {
        return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
      }

      // If a whole-day buffer/non-floating substitute exists for a missing non-floating PCA in this team,
      // we should NOT mark unrelated floating allocations as "substituting" for that missing PCA.
      const bufferWholeDayTargets = new Set(
        Object.values(staffOverrides)
          .map((o: any) => o?.substitutionFor)
          .filter((sf: any) => sf && sf.team === team && Array.isArray(sf.slots) && sf.slots.length === 4)
          .map((sf: any) => sf.nonFloatingPCAId)
      )

      const nonFloatingStaffInTeam = allPCAStaff.filter(s => !s.floating && s.team === team)
      const missingSlotsNeeded: number[] = []
      const sources: Array<{ nonFloatingId: string; kind: 'fte0' | 'availableSlots' | 'invalidSlot'; slots: number[]; availableSlots?: number[] }> = []

      for (const nf of nonFloatingStaffInTeam) {
        // If this non-floating PCA is already covered by a whole-day substitute (e.g. buffer non-floating),
        // do not derive substitution needs from it. Otherwise, floating PCAs assigned in Step 3 can be
        // incorrectly marked green as "substituting" even though substitution was already satisfied.
        if (bufferWholeDayTargets.has(nf.id)) {
          continue
        }
        const nfOverride = staffOverrides[nf.id]
        if (!nfOverride) continue

        if (nfOverride.fteRemaining === 0) {
          sources.push({ nonFloatingId: nf.id, kind: 'fte0', slots: [1, 2, 3, 4] })
          missingSlotsNeeded.push(1, 2, 3, 4)
          continue
        }

        const availableSlots = (nfOverride as any).availableSlots as number[] | undefined
        if (Array.isArray(availableSlots) && availableSlots.length > 0) {
          const missingFromAvailable = [1, 2, 3, 4].filter(s => !availableSlots.includes(s))
          if (missingFromAvailable.length > 0) {
            sources.push({ nonFloatingId: nf.id, kind: 'availableSlots', slots: missingFromAvailable, availableSlots })
            missingSlotsNeeded.push(...missingFromAvailable)
          }
        }

        const invalidSlot = (nfOverride as any).invalidSlot
        if (typeof invalidSlot === 'number' && [1, 2, 3, 4].includes(invalidSlot)) {
          sources.push({ nonFloatingId: nf.id, kind: 'invalidSlot', slots: [invalidSlot] })
          missingSlotsNeeded.push(invalidSlot)
        }
      }

      const uniqueMissing = Array.from(new Set(missingSlotsNeeded)).sort()

      // Determine which floating PCA is actually occupying each slot in this team.
      // This prevents accidentally marking *other* floating PCAs green just because they
      // have slots and the team happens to have missing slots.
      //
      // IMPORTANT: Ignore special-program allocations here.
      // Special-program PCAs (e.g. CRP slot 2) should NOT "steal" slot occupancy from the
      // Step 2.1 substitute styling calculation. Otherwise a whole-day substitute can show as
      // mixed (e.g. '0900-1030, PM, 1030-1200') instead of 'Whole day'.
      const floatingStaffIdsBySlot: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] }
      for (const alloc of allPCAAllocations) {
        if (!alloc.staff?.floating) continue
        const hasSpecialProgramAssignment =
          Array.isArray((alloc as any).special_program_ids) && (alloc as any).special_program_ids.length > 0
        if (hasSpecialProgramAssignment) continue
        if (alloc.slot1 === team) floatingStaffIdsBySlot[1].push(alloc.staff_id)
        if (alloc.slot2 === team) floatingStaffIdsBySlot[2].push(alloc.staff_id)
        if (alloc.slot3 === team) floatingStaffIdsBySlot[3].push(alloc.staff_id)
        if (alloc.slot4 === team) floatingStaffIdsBySlot[4].push(alloc.staff_id)
      }
      const floatingOccupantBySlot: Record<number, string | null> = {
        1: floatingStaffIdsBySlot[1][0] ?? null,
        2: floatingStaffIdsBySlot[2][0] ?? null,
        3: floatingStaffIdsBySlot[3][0] ?? null,
        4: floatingStaffIdsBySlot[4][0] ?? null,
      }

      // Overlap slots = "this floating PCA has a slot that is missing for non-floating"
      // Substituted slots = overlap slots, but ONLY if this PCA is the occupant for that slot.
      const overlapSlots = floatingSlotsForTeam.filter(s => uniqueMissing.includes(s))
      const substitutedSlots = overlapSlots.filter(s => floatingOccupantBySlot[s] === floatingAlloc.staff_id)

      if (substitutedSlots.length > 0) {
        const hasNonFloatingFTE0 = sources.some(s => s.kind === 'fte0')
        const isWholeDay = hasNonFloatingFTE0 &&
          substitutedSlots.length === 4 &&
          substitutedSlots.includes(1) &&
          substitutedSlots.includes(2) &&
          substitutedSlots.includes(3) &&
          substitutedSlots.includes(4) &&
          floatingSlotsForTeam.length === 4

        return {
          isSubstituting: true,
          isWholeDaySubstitution: isWholeDay,
          substitutedSlots,
        }
      }
    } catch {}
    
    // Check if there's a non-floating PCA in this team with missing slots
    // Also check allocations prop (which might include FTE=0 allocations that are filtered out of display)
    const nonFloatingAllocs = allPCAAllocations.filter(alloc => 
      !alloc.staff.floating && alloc.team === team
    )
    
    // Also check the allocations prop directly for non-floating PCAs
    // Use staffOverrides to get actual FTE (since allocation.fte_pca may not reflect current edits)
    const nonFloatingAllocsFromProps = allocations.filter(alloc => {
      if (alloc.staff.floating || alloc.team !== team) return false
      // Check staffOverrides for actual FTE value
      const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
      const actualFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
      return actualFTE === 0
    })
    
    // CRITICAL: Also check allPCAStaff for non-floating PCAs who have FTE=0 in staffOverrides
    // These staff may not be in allocations after Step 2 regenerates
    const nonFloatingStaffWithFTE0 = allPCAStaff
      .filter(s => !s.floating && s.team === team && staffOverrides[s.id]?.fteRemaining === 0)
      .map(s => ({
        staff_id: s.id,
        staff: s,
        team: s.team,
        fte_pca: 0,
        // Assume whole day assignment since they're on the team
        slot1: s.team,
        slot2: s.team,
        slot3: s.team,
        slot4: s.team,
      } as unknown as PCAAllocation & { staff: Staff }))
    
    // Combine all sources
    const allNonFloatingAllocs = [...nonFloatingAllocs]
    for (const alloc of nonFloatingAllocsFromProps) {
      if (!allNonFloatingAllocs.find(a => a.staff_id === alloc.staff_id)) {
        allNonFloatingAllocs.push(alloc)
      }
    }
    // Add staff with FTE=0 from allPCAStaff
    for (const alloc of nonFloatingStaffWithFTE0) {
      if (!allNonFloatingAllocs.find(a => a.staff_id === alloc.staff_id)) {
        allNonFloatingAllocs.push(alloc)
      }
    }
    
    // Special case: If floating has all 4 slots and there are non-floating PCAs with FTE=0,
    // check if this is a whole day substitution
    if (floatingSlotsForTeam.length === 4 &&
        floatingSlotsForTeam.includes(1) &&
        floatingSlotsForTeam.includes(2) &&
        floatingSlotsForTeam.includes(3) &&
        floatingSlotsForTeam.includes(4)) {
      // Check if any non-floating PCAs in this team have FTE=0 (use staffOverrides for actual FTE)
      const nonFloatingWithFTE0 = allNonFloatingAllocs.filter(alloc => {
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const actualFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
        return actualFTE === 0
      })
      if (nonFloatingWithFTE0.length > 0) {
        // Check if any of them have all 4 slots assigned to this team
        for (const nonFloatingAlloc of nonFloatingWithFTE0) {
          const nonFloatingSlotsForTeam: number[] = []
          if (nonFloatingAlloc.slot1 === team) nonFloatingSlotsForTeam.push(1)
          if (nonFloatingAlloc.slot2 === team) nonFloatingSlotsForTeam.push(2)
          if (nonFloatingAlloc.slot3 === team) nonFloatingSlotsForTeam.push(3)
          if (nonFloatingAlloc.slot4 === team) nonFloatingSlotsForTeam.push(4)
          
          if (nonFloatingSlotsForTeam.length === 4 &&
              nonFloatingSlotsForTeam.includes(1) &&
              nonFloatingSlotsForTeam.includes(2) &&
              nonFloatingSlotsForTeam.includes(3) &&
              nonFloatingSlotsForTeam.includes(4)) {
            return {
              isSubstituting: true,
              isWholeDaySubstitution: true,
              substitutedSlots: [1, 2, 3, 4]
            }
          }
        }
      }
    }
    
    for (const nonFloatingAlloc of allNonFloatingAllocs) {
      // Get slots assigned to this team for the non-floating PCA
      const nonFloatingSlotsForTeam: number[] = []
      if (nonFloatingAlloc.slot1 === team) nonFloatingSlotsForTeam.push(1)
      if (nonFloatingAlloc.slot2 === team) nonFloatingSlotsForTeam.push(2)
      if (nonFloatingAlloc.slot3 === team) nonFloatingSlotsForTeam.push(3)
      if (nonFloatingAlloc.slot4 === team) nonFloatingSlotsForTeam.push(4)
      
      // Check if non-floating PCA has FTE=0 (completely unavailable - whole day substitution case)
      // Use staffOverrides for actual FTE value
      const nonFloatingOverrideFTE = staffOverrides[nonFloatingAlloc.staff_id]?.fteRemaining
      const nonFloatingFTE = nonFloatingOverrideFTE !== undefined ? nonFloatingOverrideFTE : (nonFloatingAlloc.fte_pca || 0)
      const isNonFloatingCompletelyUnavailable = nonFloatingFTE === 0
      
      // Check if non-floating PCA has an invalid slot (missing slot)
      const invalidSlot = (nonFloatingAlloc as any).invalid_slot
      
      // Case 1: Non-floating has FTE=0 (completely unavailable)
      // If floating has all 4 slots in this team, it's a whole day substitution
      if (isNonFloatingCompletelyUnavailable && 
          nonFloatingSlotsForTeam.length === 4 &&
          nonFloatingSlotsForTeam.includes(1) &&
          nonFloatingSlotsForTeam.includes(2) &&
          nonFloatingSlotsForTeam.includes(3) &&
          nonFloatingSlotsForTeam.includes(4) &&
          floatingSlotsForTeam.length === 4 &&
          floatingSlotsForTeam.includes(1) &&
          floatingSlotsForTeam.includes(2) &&
          floatingSlotsForTeam.includes(3) &&
          floatingSlotsForTeam.includes(4)) {
        return {
          isSubstituting: true,
          isWholeDaySubstitution: true,
          substitutedSlots: [1, 2, 3, 4]
        }
      }
      
      // Case 2: Non-floating has an invalid slot (partial substitution)
      if (!invalidSlot) continue // No missing slot, not a substitution case
      
      // The invalid slot is the missing slot that needs substitution
      const missingSlot = invalidSlot
      
      // Check if floating PCA has this missing slot assigned to this team
      if (floatingSlotsForTeam.includes(missingSlot)) {
        // Floating PCA is substituting for this missing slot
        // Check if it's a whole day substitution:
        // - Non-floating has all 4 slots assigned to this team
        // - Floating has all 4 slots assigned to this team
        // - This is only whole day if the non-floating is completely unavailable (FTE=0)
        // Otherwise, it's just a single slot substitution
        const isWholeDay = isNonFloatingCompletelyUnavailable &&
                          nonFloatingSlotsForTeam.length === 4 &&
                          nonFloatingSlotsForTeam.includes(1) &&
                          nonFloatingSlotsForTeam.includes(2) &&
                          nonFloatingSlotsForTeam.includes(3) &&
                          nonFloatingSlotsForTeam.includes(4) &&
                          floatingSlotsForTeam.length === 4
        
        return {
          isSubstituting: true,
          isWholeDaySubstitution: isWholeDay,
          substitutedSlots: isWholeDay ? [1, 2, 3, 4] : [missingSlot]
        }
      }
    }
    
    return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
  }
  
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
    // This is the key case: floating PCA is both substituting AND assigned as regular
    if (substitutedSlots.length > 0 && regularSlots.length > 0) {
      // We have both substituting and regular slots - separate them
      const substitutingDisplay = formatSlotGroup(substitutedSlots)
      const regularDisplay = formatSlotGroup(regularSlots)
      
      const parts: React.ReactNode[] = []
      
      if (substitutingDisplay) {
        parts.push(
          <span key="sub" className="text-green-700 font-medium">
            {substitutingDisplay}
          </span>
        )
      }
      
      if (regularDisplay) {
        if (parts.length > 0) {
          parts.push(<span key="sep">, </span>)
        }
        parts.push(
          <span key="reg">
            {regularDisplay}
          </span>
        )
      }
      
      // Add invalid slot time ranges if any
      const invalidSlotTimeRanges = invalidSlots.map(is => `(${is.timeRange.start}-${is.timeRange.end})`)
        .join('')
      
      if (invalidSlotTimeRanges) {
        parts.push(<span key="invalid" className="text-blue-600">{invalidSlotTimeRanges}</span>)
      }
      
      return <span>{parts}</span>
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

  // Helper to get special program slots for a team
  const getSpecialProgramSlotsForTeam = (allocation: PCAAllocation & { staff: Staff }, team: Team): number[] => {
    if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
      return []
    }
    
    const specialProgramSlots: number[] = []
    
    // Find which special programs this PCA is assigned to
    for (const programId of allocation.special_program_ids) {
      const program = specialProgramsById.get(programId)
      if (!program) continue
      
      // Check which slots are assigned to this special program for this team
      // Robotic: slots 1-2 → SMM, slots 3-4 → SFM
      if (program.name === 'Robotic') {
        if (team === 'SMM') {
          if (allocation.slot1 === 'SMM') specialProgramSlots.push(1)
          if (allocation.slot2 === 'SMM') specialProgramSlots.push(2)
        }
        if (team === 'SFM') {
          if (allocation.slot3 === 'SFM') specialProgramSlots.push(3)
          if (allocation.slot4 === 'SFM') specialProgramSlots.push(4)
        }
      }
      // CRP: slot 2 → CPPC
      else if (program.name === 'CRP') {
        if (team === 'CPPC' && allocation.slot2 === 'CPPC') {
          specialProgramSlots.push(2)
        }
      }
      // For other programs, check program.slots for this weekday if available
      else {
        if (weekday && program.slots && program.slots[weekday]) {
          const programSlots = program.slots[weekday] as number[]
          // Check which of these program slots are assigned to this team
          if (allocation.slot1 === team && programSlots.includes(1)) specialProgramSlots.push(1)
          if (allocation.slot2 === team && programSlots.includes(2)) specialProgramSlots.push(2)
          if (allocation.slot3 === team && programSlots.includes(3)) specialProgramSlots.push(3)
          if (allocation.slot4 === team && programSlots.includes(4)) specialProgramSlots.push(4)
        }
      }
    }
    
    return [...new Set(specialProgramSlots)] // Remove duplicates
  }

  const { regularPCA, specialProgramPCA, splitAllocationSlots, assignedPcaFteRounded, substitutionInfoByAllocId } = useMemo(() => {
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

    const substitutionInfoByAllocId = new Map<string, ReturnType<typeof getSubstitutionInfo>>()
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

    return { regularPCA, specialProgramPCA, splitAllocationSlots, assignedPcaFteRounded, substitutionInfoByAllocId }
  }, [pcaAllocationsWithFTE, staffOverrides, allocations, allPCAAllocations, allPCAStaff, specialProgramsById, weekday, team])

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
            
            // Check substitution info (only apply styling in Step 2+)
            const computedSub = substitutionInfoByAllocId.get(allocation.id)
            const substitutionInfo = showSubstitutionStyling && computedSub
              ? computedSub
              : { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
            const isWholeDaySub = substitutionInfo.isWholeDaySubstitution
          const isSubstituting = substitutionInfo.isSubstituting
            
            // Set border color: green for non-floating PCA, or for whole day substituting floating PCA (Step 2+ only)
            const borderColor = (!allocation.staff.floating || (showSubstitutionStyling && isWholeDaySub)) 
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
                slotDisplay={slotDisplayNode}
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
            {team === 'DRO' && weekday && specialPrograms.some(p => p.name === 'DRM' && p.weekdays.includes(weekday)) && (
              <div className="flex justify-between items-center mb-1">
                <div className="text-xs text-red-600 font-medium">DRM</div>
                <div className="text-xs text-red-600 font-medium">+0.4</div>
              </div>
            )}
            {/* Average PCA per team (calculated requirement) */}
            {/* For DRO: show base avg PCA/team (without +0.4) if available, otherwise show regular avg */}
            {team === 'DRO' && baseAveragePCAPerTeam !== undefined && baseAveragePCAPerTeam > 0 ? (
              <div className="text-xs text-black font-medium">
                Avg PCA/team: {baseAveragePCAPerTeam.toFixed(2)}
              </div>
            ) : averagePCAPerTeam !== undefined && averagePCAPerTeam > 0 ? (
              <div className="text-xs text-black font-medium">
                Avg PCA/team: {averagePCAPerTeam.toFixed(2)}
              </div>
            ) : null}
            {/* Final PCA/team for DRO team (with +0.4) */}
            {team === 'DRO' && averagePCAPerTeam !== undefined && averagePCAPerTeam > 0 && baseAveragePCAPerTeam !== undefined && (
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
              
              // Condition descriptions
              const getConditionDescription = (condition?: 'A' | 'B' | 'C' | 'D'): string => {
                switch (condition) {
                  case 'A': return 'Preferred PCA + Preferred slot'
                  case 'B': return 'Preferred slot only'
                  case 'C': return 'Preferred PCA only'
                  case 'D': return 'No preferences'
                  default: return ''
                }
              }
              
              // Determine tooltip position (left for DRO and rightmost teams to prevent truncation)
              const showOnLeft = team === 'DRO' || ['NSM', 'GMC', 'MC'].includes(team)
              
              return (
                <div className="relative group mt-0.5">
                  <div className="text-xs text-black/60 cursor-help">
                    Assigned: {assignedPcaFteRounded.toFixed(2)}
                  </div>
                  {/* Allocation Tracking Tooltip on hover */}
                  <div className={`absolute ${showOnLeft ? 'right-0' : 'left-0'} bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none`}>
                    {(hasTracker || hasBufferAssignments) ? (
                      <div className="space-y-2">
                        {/* Summary Header */}
                        <div className="font-semibold border-b border-gray-700 pb-1">
                          Allocation Tracking - {team}
                        </div>

                        {hasAllocationAssignments && allocationLog?.summary?.allocationMode && (
                          <div className="text-[10px] text-gray-300">
                            Mode: {allocationLog.summary.allocationMode === 'balanced' ? 'Balanced (take turns)' : 'Standard'}
                          </div>
                        )}
                        
                        {/* Allocation Order by Cycle - show before total slots */}
                        {/* Cycle 1 order is always shown (all teams processed in cycle 1, order from step 3.1 teamOrder) */}
                        {/* Cycle 2/3 orders shown on top if team received assignments in those cycles */}
                        {allocationOrderCycle1 !== undefined && (
                          <div className="text-[10px] text-gray-300 space-y-0.5">
                            {allocationOrderCycle3 !== undefined && (
                              <div>
                                {allocationOrderCycle3 === 1 ? '1st' : allocationOrderCycle3 === 2 ? '2nd' : allocationOrderCycle3 === 3 ? '3rd' : `${allocationOrderCycle3}th`} in cycle 3
                              </div>
                            )}
                            {allocationOrderCycle2 !== undefined && (
                              <div>
                                {allocationOrderCycle2 === 1 ? '1st' : allocationOrderCycle2 === 2 ? '2nd' : allocationOrderCycle2 === 3 ? '3rd' : `${allocationOrderCycle2}th`} in cycle 2
                              </div>
                            )}
                            <div>
                              {allocationOrderCycle1 === 1 ? '1st' : allocationOrderCycle1 === 2 ? '2nd' : allocationOrderCycle1 === 3 ? '3rd' : `${allocationOrderCycle1}th`} in cycle 1
                            </div>
                          </div>
                        )}
                        
                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 gap-1 text-[10px] border-t border-gray-700 pt-1">
                          <div>Total slots: {totalActualSlots}</div>
                          {hasBufferAssignments && <div>From 3.0: {bufferFloatingSlots.length}</div>}
                          {hasAllocationAssignments && (() => {
                            // Recalculate step 3.4 count by filtering out buffer PCAs (same as slotsFromLog)
                            const step34Assignments = allocationLog.assignments.filter(a => 
                              a.assignedIn === 'step34' && !bufferPCAIds.has(a.pcaId)
                            )
                            const fromStep34Count = step34Assignments.length
                            const fromStep34Cycle1 = step34Assignments.filter(a => a.cycle === 1).length
                            const fromStep34Cycle2 = step34Assignments.filter(a => a.cycle === 2).length
                            const fromStep34Cycle3 = step34Assignments.filter(a => a.cycle === 3).length
                            
                            return (
                              <>
                                <div>From 3.2: {allocationLog.summary.fromStep32}</div>
                                <div>From 3.3: {allocationLog.summary.fromStep33}</div>
                                <div>From 3.4: {fromStep34Count}</div>
                              </>
                            )
                          })()}
                        </div>

                        {/* Pending/diagnostic note when there are no Step 3 assignments */}
                        {!hasAllocationAssignments && (
                          <div className="text-[10px] border-t border-gray-700 pt-1 text-gray-300 space-y-1">
                            <div>Pending (current): {typeof pendingPcaFte === 'number' ? pendingPcaFte.toFixed(2) : '—'}</div>
                            {typeof pendingPcaFte === 'number' && pendingPcaFte <= 0.001 ? (
                              <div>No floating PCA assignment needed (pending ≈ 0).</div>
                            ) : (
                              <div>
                                No Step 3 assignments recorded for this team.
                                {typeof floatingPoolRemainingFte === 'number' && floatingPoolRemainingFte <= 0.001
                                  ? ' Floating pool appears exhausted.'
                                  : typeof floatingPoolRemainingFte === 'number'
                                    ? ' Floating pool still has capacity; constraints/preferences may have blocked assignment.'
                                    : ''}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Show message if fulfilled by buffer only */}
                        {fulfilledByBufferOnly && (
                          <div className="text-[10px] text-yellow-400 border-t border-gray-700 pt-1">
                            Team pending requirement wholly fulfilled by manual buffer floating PCA assignment (Step 3.0)
                          </div>
                        )}
                        
                        {/* Per-PCA Details (grouped by PCA name) */}
                        <div className="space-y-1 border-t border-gray-700 pt-1 max-h-48 overflow-y-auto">
                          {/* Buffer floating PCA assignments (Step 3.0) */}
                          {bufferFloatingAssignments.map((bufferAssign, idx) => (
                            <div key={`buffer-${idx}`} className="text-[10px]">
                              <div className="font-medium">{bufferAssign.pcaName}:</div>
                              {bufferAssign.slots.map(slot => (
                                <div key={slot} className="text-[10px] pl-4">
                                  slot {slot} (From step 3.0)
                                </div>
                              ))}
                            </div>
                          ))}
                          
                          {/* Algorithm assignments (grouped by PCA) */}
                          {Array.from(groupedByPCA.entries()).map(([pcaName, slotAssignments]) => (
                            <div key={pcaName} className="text-[10px]">
                              <div className="font-medium">{pcaName}:</div>
                              {slotAssignments.map(({ slot, assignment }) => (
                                <div key={slot} className="text-[10px] pl-4">
                                  slot {slot} (
                                  {assignment.assignedIn === 'step34' 
                                    ? `C${assignment.cycle}${assignment.condition ? `-${getConditionDescription(assignment.condition)}` : ''}` 
                                    : assignment.assignedIn === 'step32' 
                                    ? 'From step 3.2'
                                    : assignment.assignedIn === 'step33'
                                    ? 'From step 3.3'
                                    : assignment.assignedIn === 'step30'
                                    ? 'From step 3.0'
                                    : assignment.assignedIn}
                                  {assignment.wasPreferredPCA && assignment.wasPreferredSlot ? ', ★PCA, ★Slot' :
                                   assignment.wasPreferredSlot ? ', ★Slot' :
                                   assignment.wasPreferredPCA ? ', ★PCA' : ''}
                                  {assignment.assignmentTag === 'remaining' && ', remaining'}
                                  {assignment.wasFloorPCA !== undefined && (
                                    assignment.wasFloorPCA ? ', Floor' : ', Non-floor'
                                  )}
                                  {assignment.wasExcludedInCycle1 && ', C2-unlocked'}
                                  )
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        
                        {/* Constraint Status */}
                        {hasAllocationAssignments && (
                          <div className="text-[10px] border-t border-gray-700 pt-1 text-gray-400">
                            AM/PM: {allocationLog.summary.amPmBalanced ? '✓ Balanced' : '○ Not balanced'}
                            {' | '}
                            Gym: {allocationLog.summary.gymSlotUsed ? '⚠ Used' : '✓ Avoided'}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {/* Arrow pointing down */}
                    <div className={`absolute top-full ${showOnLeft ? 'right-4' : 'left-4'} w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900`}></div>
                  </div>
                </div>
              )
            })()}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

