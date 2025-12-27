'use client'

import { Team } from '@/types/staff'
import { PCAAllocation, TeamAllocationLog } from '@/types/schedule'
import { Staff } from '@/types/staff'
import { SpecialProgram } from '@/types/allocation'
import { StaffCard } from './StaffCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDroppable } from '@dnd-kit/core'
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
  staffOverrides?: Record<string, { leaveType?: any; fteRemaining?: number }> // Current staff overrides to check actual FTE
  allPCAStaff?: Staff[] // All PCA staff (for identifying non-floating PCAs even when not in allocations)
  currentStep?: string // Current step in the workflow - substitution styling only shown in step 2+
  step2Initialized?: boolean // Whether Step 2 algorithm has been run
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' // Weekday for checking if DRM is active
  externalHover?: boolean // External hover state (e.g., from popover drag)
  allocationLog?: TeamAllocationLog // Allocation tracking log for this team (from Step 3.4)
}

export function PCABlock({ team, allocations, onEditStaff, requiredPCA, averagePCAPerTeam, baseAveragePCAPerTeam, specialPrograms = [], allPCAAllocations = [], staffOverrides = {}, allPCAStaff = [], currentStep = 'leave-fte', step2Initialized = false, weekday, externalHover = false, allocationLog }: PCABlockProps) {
  // Only show substitution styling AFTER Step 2 algorithm has run (not just when navigating to Step 2)
  const showSubstitutionStyling = currentStep !== 'leave-fte' && step2Initialized
  
  const { setNodeRef, isOver } = useDroppable({
    id: `pca-${team}`,
    data: { type: 'pca', team },
  })
  
  // Combine dnd-kit hover and external hover
  const showHoverEffect = isOver || externalHover

  // Filter out staff with FTE = 0 (they should only appear in leave block)
  // Check both allocation FTE and current override FTE (in case allocations haven't been regenerated)
  const pcaAllocationsWithFTE = allocations.filter(alloc => {
    // Check allocation FTE first
    const allocationFTE = alloc.fte_pca || 0
    // Check override FTE (current value from edits, may be more up-to-date)
    const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
    // Use override FTE if available, otherwise use allocation FTE
    const currentFTE = overrideFTE !== undefined ? overrideFTE : allocationFTE
    const shouldInclude = currentFTE > 0
    return shouldInclude
  })

  // Helper function to determine if slots in a team are part of special program assignment
  const areSlotsPartOfSpecialProgram = (
    allocation: PCAAllocation & { staff: Staff },
    currentTeam: Team,
    slotsForTeam: number[]
  ): boolean => {
    if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
      return false
    }

    if (slotsForTeam.length === 0) return false

    // Find the special program(s) for this allocation
    const program = specialPrograms.find(p => allocation.special_program_ids?.includes(p.id))
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
  }

  // Helper function to format time as 4-digit (HHMM)
  const formatTime4Digit = (timeStr: string): string => {
    // Convert HH:MM to HHMM (4-digit)
    return timeStr.replace(':', '')
  }

  // Helper function to get slot display for PCA allocation in this team
  // Helper function to get slot display with optional slot filter
  const getSlotDisplayForTeamFiltered = (allocation: PCAAllocation & { staff: Staff }, slotsToInclude?: number[]): string | null => {
    const slotsForThisTeam: number[] = []
    if (allocation.slot1 === team) slotsForThisTeam.push(1)
    if (allocation.slot2 === team) slotsForThisTeam.push(2)
    if (allocation.slot3 === team) slotsForThisTeam.push(3)
    if (allocation.slot4 === team) slotsForThisTeam.push(4)
    
    // If slotsToInclude is provided, filter to only those slots
    const filteredSlots = slotsToInclude 
      ? slotsForThisTeam.filter(slot => slotsToInclude.includes(slot))
      : slotsForThisTeam
    
    if (filteredSlots.length === 0) return null
    
    const invalidSlot = (allocation as any).invalid_slot
    const leaveComebackTime = (allocation as any).leave_comeback_time
    const leaveMode = (allocation as any).leave_mode
    const isLeave = leaveMode === 'leave'
    
    // Get available slots (excluding invalid slot) from filtered slots
    const availableSlots = filteredSlots.filter(slot => slot !== invalidSlot)
    
    // Rule 1: If all filtered slots 1-4 assigned to this team only: show "Whole day"
    // BUT: exclude invalid slots from this check - if there's an invalid slot, don't show "Whole day"
    if (filteredSlots.length === 4 && 
        filteredSlots.includes(1) && 
        filteredSlots.includes(2) && 
        filteredSlots.includes(3) && 
        filteredSlots.includes(4) &&
        !invalidSlot) { // FIX: Only show whole day if no invalid slot
      // Check if there's a leave/come back time
      if (invalidSlot && leaveComebackTime) {
        const time4Digit = formatTime4Digit(leaveComebackTime)
        const slotTime = getSlotTime(invalidSlot)
        const slotStart = slotTime.split('-')[0].replace(':', '')
        const slotEnd = slotTime.split('-')[1].replace(':', '')
        if (isLeave) {
          // Leave: "Whole day, (slot_end-leave_time)" - Eg: "Whole day, (1600-1500)" for slot 4
          return `Whole day, (${slotEnd}-${time4Digit})`
        } else {
          // Come back: "(come_back_time-slot_start), Whole day" - Eg: "(0930-0900), Whole day" for slot 1
          return `(${time4Digit}-${slotStart}), Whole day`
        }
      }
      return 'Whole day'
    }
    
    // Rule 2: Check for slot pairs (1&2 -> AM, 3&4 -> PM) when both are available (not invalid)
    const hasSlot1 = availableSlots.includes(1)
    const hasSlot2 = availableSlots.includes(2)
    const hasSlot3 = availableSlots.includes(3)
    const hasSlot4 = availableSlots.includes(4)
    
    const hasAM = hasSlot1 && hasSlot2
    const hasPM = hasSlot3 && hasSlot4
    
    // Build display parts in slot order (1, 2, 3, 4)
    const parts: string[] = []
    
    // Process slots 1 and 2
    if (hasAM) {
      // Both slot 1 and 2 are available - show as "AM"
      parts.push('AM')
    } else {
      // Show slots 1 and 2 individually
      if (hasSlot1) {
        parts.push(formatTimeRange(getSlotTime(1)))
      }
      if (hasSlot2) {
        parts.push(formatTimeRange(getSlotTime(2)))
      }
    }
    
    // Handle invalid slot in slot 1 or 2
    if (invalidSlot === 1 && leaveComebackTime) {
        const time4Digit = formatTime4Digit(leaveComebackTime)
      const slotTime = getSlotTime(1)
      const slotStart = slotTime.split('-')[0].replace(':', '')
      const slotEnd = slotTime.split('-')[1].replace(':', '')
        if (isLeave) {
        // Leave: (slot_start-leave_time) - Eg: (0900-0930) for slot 1
        parts.push(`(${slotStart}-${time4Digit})`)
        } else {
        // Come back: (come_back_time-slot_end) - Eg: (0930-1030) for slot 1
        parts.push(`(${time4Digit}-${slotEnd})`)
      }
    } else if (invalidSlot === 2 && leaveComebackTime) {
      const time4Digit = formatTime4Digit(leaveComebackTime)
      const slotTime = getSlotTime(2)
          const slotStart = slotTime.split('-')[0].replace(':', '')
          const slotEnd = slotTime.split('-')[1].replace(':', '')
      if (isLeave) {
        // Leave: (slot_start-leave_time) - Eg: (1030-1100) for slot 2
        parts.push(`(${slotStart}-${time4Digit})`)
          } else {
        // Come back: (come_back_time-slot_end) - Eg: (1100-1200) for slot 2
        parts.push(`(${time4Digit}-${slotEnd})`)
      }
    }
    
    // Process slots 3 and 4
    if (hasPM) {
      // Both slot 3 and 4 are available - show as "PM"
      parts.push('PM')
    } else {
      // Show slots 3 and 4 individually
      if (hasSlot3) {
        parts.push(formatTimeRange(getSlotTime(3)))
      }
      if (hasSlot4) {
        parts.push(formatTimeRange(getSlotTime(4)))
      }
    }
    
    // Handle invalid slot in slot 3 or 4
    if (invalidSlot === 3 && leaveComebackTime) {
        const time4Digit = formatTime4Digit(leaveComebackTime)
      const slotTime = getSlotTime(3)
      const slotStart = slotTime.split('-')[0].replace(':', '')
      const slotEnd = slotTime.split('-')[1].replace(':', '')
        if (isLeave) {
        // Leave: (slot_start-leave_time) - Eg: (1330-1400) for slot 3
        parts.push(`(${slotStart}-${time4Digit})`)
        } else {
        // Come back: (come_back_time-slot_end) - Eg: (1400-1500) for slot 3
        parts.push(`(${time4Digit}-${slotEnd})`)
      }
    } else if (invalidSlot === 4 && leaveComebackTime) {
      const time4Digit = formatTime4Digit(leaveComebackTime)
      const slotTime = getSlotTime(4)
          const slotStart = slotTime.split('-')[0].replace(':', '')
          const slotEnd = slotTime.split('-')[1].replace(':', '')
      if (isLeave) {
        // Leave: (slot_start-leave_time) - Eg: (1500-1600) for slot 4
        parts.push(`(${slotStart}-${time4Digit})`)
          } else {
        // Come back: (come_back_time-slot_end) - Eg: (1600-1630) for slot 4
        parts.push(`(${time4Digit}-${slotEnd})`)
          }
        }
    
    // For come back, we want the come back time to appear first
    if (!isLeave && invalidSlot && leaveComebackTime) {
      const time4Digit = formatTime4Digit(leaveComebackTime)
      // Find the come back time part and move it to the beginning
      const comeBackIndex = parts.findIndex(p => p.startsWith('(') && p.includes(time4Digit))
      if (comeBackIndex > 0) {
        const comeBackTime = parts.splice(comeBackIndex, 1)[0]
        parts.unshift(comeBackTime)
      }
    }
    
    const result = parts.length > 0 ? parts.join(', ') : null
    return result
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
    if (!floatingAlloc.staff.floating) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }
    
    // Get slots assigned to this team for the floating PCA
    const floatingSlotsForTeam: number[] = []
    if (floatingAlloc.slot1 === team) floatingSlotsForTeam.push(1)
    if (floatingAlloc.slot2 === team) floatingSlotsForTeam.push(2)
    if (floatingAlloc.slot3 === team) floatingSlotsForTeam.push(3)
    if (floatingAlloc.slot4 === team) floatingSlotsForTeam.push(4)
    
    if (floatingSlotsForTeam.length === 0) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }
    
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
  
  // Helper function to render slot display with blue/bold styling for leave/come back times
  // and green styling for substituted slots (only in Step 2+)
  const renderSlotDisplay = (displayText: string | null, allocation: PCAAllocation & { staff: Staff }): React.ReactNode => {
    if (!displayText) return null
    
    const invalidSlot = (allocation as any).invalid_slot
    const leaveComebackTime = (allocation as any).leave_comeback_time
    
    // Check if this is a floating PCA substituting slots (only in Step 2+)
    const substitutionInfo = showSubstitutionStyling ? getSubstitutionInfo(allocation) : { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    const isSubstituting = substitutionInfo.isSubstituting
    const substitutedSlots = substitutionInfo.substitutedSlots
    
    // Get slot times for substituted slots to highlight them in green
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
    
    if (!invalidSlot || !leaveComebackTime) {
      // No invalid slot, but might have substitutions
      // Check for substitutions - use substitutedSlots.length for "Whole day" case
      if (isSubstituting && (substitutedSlots.length > 0 || substitutedSlotTimes.size > 0)) {
        // If displayText is "Whole day" and ALL 4 slots are substituted, show "Whole day" in green
        if (displayText === 'Whole day' && substitutedSlots.length === 4) {
          return <span className="text-green-700 font-medium">Whole day</span>
        }
        
        // If displayText is "Whole day" and we have SOME substituted slots (not all), show individual slots
        // with the substituted one in green
        if (displayText === 'Whole day' && substitutedSlots.length > 0) {
          // Get all slots for this team
          const slotsForThisTeam: number[] = []
          if (allocation.slot1 === team) slotsForThisTeam.push(1)
          if (allocation.slot2 === team) slotsForThisTeam.push(2)
          if (allocation.slot3 === team) slotsForThisTeam.push(3)
          if (allocation.slot4 === team) slotsForThisTeam.push(4)
          
          // Build display with substituted slots in green
          const parts: string[] = []
          const hasSlot1 = slotsForThisTeam.includes(1)
          const hasSlot2 = slotsForThisTeam.includes(2)
          const hasSlot3 = slotsForThisTeam.includes(3)
          const hasSlot4 = slotsForThisTeam.includes(4)
          
          const hasAM = hasSlot1 && hasSlot2
          const hasPM = hasSlot3 && hasSlot4
          
          // Process AM slots
          if (hasAM) {
            if (substitutedSlots.includes(1) || substitutedSlots.includes(2)) {
              // Show individual slots if one is substituted
              if (hasSlot1) {
                const time = formatTimeRange(getSlotTime(1))
                parts.push(substitutedSlots.includes(1) ? `[${time}]` : time)
              }
              if (hasSlot2) {
                const time = formatTimeRange(getSlotTime(2))
                parts.push(substitutedSlots.includes(2) ? `[${time}]` : time)
              }
            } else {
              parts.push('AM')
            }
          } else {
            if (hasSlot1) {
              const time = formatTimeRange(getSlotTime(1))
              parts.push(substitutedSlots.includes(1) ? `[${time}]` : time)
            }
            if (hasSlot2) {
              const time = formatTimeRange(getSlotTime(2))
              parts.push(substitutedSlots.includes(2) ? `[${time}]` : time)
            }
          }
          
          // Process PM slots
          if (hasPM) {
            if (substitutedSlots.includes(3) || substitutedSlots.includes(4)) {
              // Show individual slots if one is substituted
              if (hasSlot3) {
                const time = formatTimeRange(getSlotTime(3))
                parts.push(substitutedSlots.includes(3) ? `[${time}]` : time)
              }
              if (hasSlot4) {
                const time = formatTimeRange(getSlotTime(4))
                parts.push(substitutedSlots.includes(4) ? `[${time}]` : time)
              }
            } else {
              parts.push('PM')
            }
          } else {
            if (hasSlot3) {
              const time = formatTimeRange(getSlotTime(3))
              parts.push(substitutedSlots.includes(3) ? `[${time}]` : time)
            }
            if (hasSlot4) {
              const time = formatTimeRange(getSlotTime(4))
              parts.push(substitutedSlots.includes(4) ? `[${time}]` : time)
            }
          }
          
          // Render with green highlighting for substituted slots
          return (
            <span>
              {parts.map((part, index) => {
                if (part.startsWith('[') && part.endsWith(']')) {
                  // This is a substituted slot - make it green
                  const time = part.slice(1, -1)
                  return (
                    <span key={index} className="text-green-700 font-medium">
                      {time}
                    </span>
                  )
                }
                return <span key={index}>{part}</span>
              }).reduce((acc, elem, index) => {
                if (index > 0) acc.push(<span key={`sep-${index}`}>, </span>)
                acc.push(elem)
                return acc
              }, [] as React.ReactNode[])}
            </span>
          )
        }
        
        // Normal case: split and highlight
        const parts = displayText.split(/(AM|PM|\d{4}-\d{4})/g)
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
          </span>
        )
      }
      return <span>{displayText}</span>
    }
    
    // Find leave/come back time portion (in parentheses)
    const time4Digit = formatTime4Digit(leaveComebackTime)
    const parts = displayText.split(/(\([^)]+\)|AM|PM|\d{4}-\d{4})/g)
    
    return (
      <span>
        {parts.map((part, index) => {
          if (part.startsWith('(') && part.includes(time4Digit)) {
            // This is the leave/come back time - make it blue and bold
            return (
              <span key={index} className="text-blue-600 font-bold">
                {part}
              </span>
            )
          }
          if (isSubstituting && substitutedSlotTimes.has(part)) {
            // This is a substituted slot time - make it green
            return (
              <span key={index} className="text-green-700 font-medium">
                {part}
              </span>
            )
          }
          return <span key={index}>{part}</span>
        })}
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
      const program = specialPrograms.find(p => p.id === programId)
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

  // Separate regular PCA from special program PCA
  // For whole day substitutions, move floating PCAs to the top
  const regularPCA: (PCAAllocation & { staff: Staff })[] = pcaAllocationsWithFTE.filter(alloc => 
    !alloc.special_program_ids || alloc.special_program_ids.length === 0
  )
  const specialProgramPCA: (PCAAllocation & { staff: Staff })[] = []
  
  // Track split allocations: allocations that need to appear in both sections with different slot filters
  const splitAllocationSlots = new Map<string, { regularSlots: number[], specialProgramSlots: number[] }>()
  
  // Process allocations with special programs - split those with both regular and special program slots in the same team
  pcaAllocationsWithFTE.forEach(alloc => {
    if (!alloc.special_program_ids || alloc.special_program_ids.length === 0) {
      return // Already in regularPCA
    }
    
    // Get all slots for this team
    const slotsForThisTeam: number[] = []
    if (alloc.slot1 === team) slotsForThisTeam.push(1)
    if (alloc.slot2 === team) slotsForThisTeam.push(2)
    if (alloc.slot3 === team) slotsForThisTeam.push(3)
    if (alloc.slot4 === team) slotsForThisTeam.push(4)
    
    if (slotsForThisTeam.length === 0) return // No slots in this team
    
    // Determine which slots are special program slots
    const specialProgramSlots = getSpecialProgramSlotsForTeam(alloc, team)
    const regularSlots = slotsForThisTeam.filter(slot => !specialProgramSlots.includes(slot))
    
    // If this allocation has both special program slots and regular slots in this team, split it
    if (specialProgramSlots.length > 0 && regularSlots.length > 0) {
      // Track which slots to show in each section
      splitAllocationSlots.set(`${alloc.id}-${team}`, { regularSlots, specialProgramSlots })
      // Add to both sections
      regularPCA.push(alloc)
      specialProgramPCA.push(alloc)
    } else {
      // All slots are either all special program or all regular - keep as single entry
      specialProgramPCA.push(alloc)
    }
  })
  
  // Sort regular PCA: whole day substituting floating PCAs first, then non-floating, then other floating
  regularPCA.sort((a, b) => {
    const aSubInfo = getSubstitutionInfo(a)
    const bSubInfo = getSubstitutionInfo(b)
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
  
  // Calculate from allocations (excluding special program slots and invalid slots)
    pcaAllocationsWithFTE.forEach(allocation => {
      const slotsForThisTeam: number[] = []
      if (allocation.slot1 === team) slotsForThisTeam.push(1)
      if (allocation.slot2 === team) slotsForThisTeam.push(2)
      if (allocation.slot3 === team) slotsForThisTeam.push(3)
      if (allocation.slot4 === team) slotsForThisTeam.push(4)
      
      // Exclude invalid slot from FTE calculation
      const invalidSlot = (allocation as any).invalid_slot
      const validSlotsForTeam = invalidSlot ? slotsForThisTeam.filter(s => s !== invalidSlot) : slotsForThisTeam
      
      // Identify which slots are special program slots (if any)
      const specialProgramSlots = getSpecialProgramSlotsForTeam(allocation, team)
      
      // Count only regular slots (exclude special program slots)
      const regularSlotsForTeam = validSlotsForTeam.filter(slot => !specialProgramSlots.includes(slot))
      
      // Add 0.25 FTE per regular slot (special program slots are excluded, invalid slots already excluded)
      assignedPcaFteRaw += regularSlotsForTeam.length * 0.25
    })
  
  // Round to nearest 0.25 using the same rounding logic as pending values
  const assignedPcaFteRounded = roundToNearestQuarterWithMidpoint(assignedPcaFteRaw)

  // Get original calculated PCA for tooltip
  // For DRO: use averagePCAPerTeam (which includes DRM add-on)
  // For others: use requiredPCA (raw calculated value)
  const originalCalculatedPCA = team === 'DRO' && averagePCAPerTeam !== undefined
    ? averagePCAPerTeam
    : (requiredPCA ?? 0)

  // Calculate rounding interval details for tooltip
  const getRoundingDetails = (value: number) => {
    const lower = Math.floor(value / 0.25) * 0.25
    const upper = lower + 0.25
    const midpoint = (lower + upper) / 2
    const rounded = roundToNearestQuarterWithMidpoint(value)
    return { lower, upper, midpoint, rounded }
  }
  
  const roundingDetails = getRoundingDetails(originalCalculatedPCA)

  return (
    <Card ref={setNodeRef} className={showHoverEffect ? 'border-2 border-slate-900 dark:border-slate-100' : ''} data-pca-team={team}>
      <CardContent className="p-2 pt-1 flex flex-col min-h-full">
        <div className="space-y-1 flex-1">
          {/* Regular PCA first */}
          {regularPCA.map((allocation) => {
            // Check if this is a split allocation - if so, only show regular slots
            const splitInfo = splitAllocationSlots.get(`${allocation.id}-${team}`)
            const slotsToDisplay = splitInfo ? splitInfo.regularSlots : undefined
            const slotDisplay = slotsToDisplay 
              ? getSlotDisplayForTeamFiltered(allocation, slotsToDisplay)
              : getSlotDisplayForTeam(allocation)
            const slotDisplayNode = renderSlotDisplay(slotDisplay, allocation)
            
            // Check substitution info (only apply styling in Step 2+)
            const substitutionInfo = showSubstitutionStyling ? getSubstitutionInfo(allocation) : { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
            const isWholeDaySub = substitutionInfo.isWholeDaySubstitution
            
            // Set border color: green for non-floating PCA, or for whole day substituting floating PCA (Step 2+ only)
            const borderColor = (!allocation.staff.floating || (showSubstitutionStyling && isWholeDaySub)) 
              ? 'border-green-700' 
              : undefined
            
            // Underline name for whole day substituting floating PCA (Step 2+ only)
            const nameStyle = (showSubstitutionStyling && allocation.staff.floating && isWholeDaySub) ? 'underline' : undefined
            
            return (
              <StaffCard
                key={`${allocation.id}-regular-${team}`}
                staff={allocation.staff}
                allocation={allocation as any}
                fteRemaining={undefined}
                slotDisplay={slotDisplayNode}
                onEdit={(e) => onEditStaff?.(allocation.staff_id, e)}
                borderColor={borderColor}
                nameColor={nameStyle}
                dragTeam={team}
              />
            )
          })}
          
          {/* Special program PCA at bottom (before FTE text) */}
          {specialProgramPCA.map((allocation) => {
            // Check if this is a split allocation - if so, only show special program slots
            const splitInfo = splitAllocationSlots.get(`${allocation.id}-${team}`)
            const slotsToDisplay = splitInfo ? splitInfo.specialProgramSlots : undefined
            const slotDisplay = slotsToDisplay
              ? getSlotDisplayForTeamFiltered(allocation, slotsToDisplay)
              : getSlotDisplayForTeam(allocation)
            const slotDisplayNode = renderSlotDisplay(slotDisplay, allocation)
            
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
            
            // Set border color to deep green for non-floating PCA
            const borderColor = !allocation.staff.floating ? 'border-green-700' : undefined
            
            return (
              <StaffCard
                key={`${allocation.id}-special-${team}`}
                staff={allocation.staff}
                allocation={allocation as any}
                fteRemaining={undefined}
                slotDisplay={slotDisplayNode}
                onEdit={(e) => onEditStaff?.(allocation.staff_id, e)}
                nameColor={nameColor}
                borderColor={borderColor}
                dragTeam={team}
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
            {assignedPcaFteRounded > 0 && (
              <div className="relative group mt-0.5">
                <div className="text-xs text-black/60 cursor-help">
                  Assigned: {assignedPcaFteRounded.toFixed(2)}
                </div>
                {/* Allocation Tracking Tooltip on hover */}
                <div className="absolute left-0 bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none">
                  {allocationLog && allocationLog.assignments.length > 0 ? (
                    <div className="space-y-2">
                      {/* Summary Header */}
                      <div className="font-semibold border-b border-gray-700 pb-1">
                        Allocation Tracking - {team}
                      </div>
                      
                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <div>Total slots: {allocationLog.summary.totalSlotsAssigned}</div>
                        <div>From 3.2: {allocationLog.summary.fromStep32}</div>
                        <div>From 3.3: {allocationLog.summary.fromStep33}</div>
                        <div>From 3.4: {allocationLog.summary.fromStep34Cycle1 + allocationLog.summary.fromStep34Cycle2 + allocationLog.summary.fromStep34Cycle3}</div>
                      </div>
                      
                      {/* Per-Slot Details */}
                      <div className="space-y-1 border-t border-gray-700 pt-1 max-h-32 overflow-y-auto">
                        {allocationLog.assignments.map((a, i) => (
                          <div key={i} className="text-[10px] flex flex-wrap items-center gap-1">
                            <span className="font-mono">Slot {a.slot}:</span>
                            <span>{a.pcaName}</span>
                            <span className="text-gray-400">
                              ({a.assignedIn === 'step34' 
                                ? `C${a.cycle}${a.condition ? `-${a.condition}` : ''}` 
                                : a.assignedIn})
                            </span>
                            {a.wasPreferredPCA && <span className="text-green-400">★PCA</span>}
                            {a.wasPreferredSlot && <span className="text-blue-400">★Slot</span>}
                            {a.wasFloorPCA && <span className="text-yellow-400">Floor</span>}
                            {a.wasExcludedInCycle1 && <span className="text-orange-400">C2-unlocked</span>}
                          </div>
                        ))}
                      </div>
                      
                      {/* Constraint Status */}
                      <div className="text-[10px] border-t border-gray-700 pt-1 text-gray-400">
                        AM/PM: {allocationLog.summary.amPmBalanced ? '✓ Balanced' : '○ Not balanced'}
                        {' | '}
                        Gym: {allocationLog.summary.gymSlotUsed ? '⚠ Used' : '✓ Avoided'}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div>Original calculated PCA: {originalCalculatedPCA.toFixed(2)}</div>
                      <div>Expected to assign PCA: {originalCalculatedPCA.toFixed(2)} → {roundingDetails.rounded.toFixed(2)}</div>
                      <div>in interval of {roundingDetails.lower.toFixed(2)} - ({roundingDetails.midpoint.toFixed(3)}) - {roundingDetails.upper.toFixed(2)} (rounded to nearest 0.25)</div>
                      <div>Finally assigned with a/v PCA: {assignedPcaFteRounded.toFixed(2)}</div>
                      <div className="text-gray-400 mt-2 text-[10px]">Run Step 3 algorithm to see detailed tracking.</div>
                    </div>
                  )}
                  {/* Arrow pointing down */}
                  <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

