/**
 * Legacy `allocatePCA()` floating phase (highest-pending-first inline allocator).
 * Kept separate so floating behavior is not hidden only under pcaAllocationFloating.ts.
 */

import type { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import type { PCAPreference } from '@/types/allocation'
import { assignSlotIfValid } from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import type { PCAAllocationContext } from '@/lib/algorithms/pcaAllocation'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'

function shouldAvoidGymSchedule(preference: PCAPreference | undefined): boolean {
  return preference?.avoid_gym_schedule ?? false
}

function calculateFTEAssigned(
  slot1: Team | null,
  slot2: Team | null,
  slot3: Team | null,
  slot4: Team | null
): number {
  let assigned = 0
  if (slot1 !== null) assigned += 0.25
  if (slot2 !== null) assigned += 0.25
  if (slot3 !== null) assigned += 0.25
  if (slot4 !== null) assigned += 0.25
  return assigned
}

function updateAllocationFTE(allocation: PCAAllocation, baseFTE: number): void {
  allocation.slot_assigned = calculateFTEAssigned(allocation.slot1, allocation.slot2, allocation.slot3, allocation.slot4)
  allocation.fte_remaining = Math.max(0, baseFTE - allocation.slot_assigned)
}

function updatePendingValues(
  pendingPCAFTEPerTeam: Record<Team, number>,
  teamPCAAssigned: Record<Team, number>,
  averagePCAPerTeam: Record<Team, number>
): void {
  Object.entries(averagePCAPerTeam).forEach(([team, baseRequired]) => {
    const teamKey = team as Team
    const assigned = teamPCAAssigned[teamKey]
    const pending = baseRequired - assigned
    pendingPCAFTEPerTeam[teamKey] = Math.max(0, pending)
  })
}

export async function runLegacyAllocatePcaFloatingPhase(args: {
  context: PCAAllocationContext
  allocations: PCAAllocation[]
  teamPCAAssigned: Record<Team, number>
  pendingPCAFTEPerTeam: Record<Team, number>
  floatingPCA: PCAData[]
  getFirstAllocationByStaffId: (staffId: string) => PCAAllocation | undefined
  getPcaById: (pcaId: string) => PCAData | undefined
  getTeamPreference: (team: Team) => PCAPreference | undefined
}): Promise<{
  allocations: PCAAllocation[]
  teamPCAAssigned: Record<Team, number>
  pendingPCAFTEPerTeam: Record<Team, number>
}> {
  const {
    context,
    allocations,
    teamPCAAssigned,
    pendingPCAFTEPerTeam,
    floatingPCA,
    getFirstAllocationByStaffId,
    getPcaById,
    getTeamPreference,
  } = args

    // Priority 2: Specific preferences
    // NOTE: Skip preference-based allocation here - preferences are now handled WITHIN the floating PCA loop
    // This ensures tie-breakers work correctly based on pending FTE, and preferences only affect WHICH PCA
    // is assigned to a team AFTER the team is selected by tie-breaker
    const SKIP_PREFERENCE_ALLOCATION = true
    if (!SKIP_PREFERENCE_ALLOCATION) context.pcaPreferences.forEach((pref) => {
      const prefSlots = pref.preferred_slots
      const gymSlot = pref.gym_schedule ?? null
      const slotConflict = prefSlots.some(slot => slot === gymSlot)

      const requiredFTE = context.averagePCAPerTeam[pref.team]
      const currentFTE = teamPCAAssigned[pref.team]
      const neededFTE = Math.max(0, requiredFTE - currentFTE)
    
      // Check if we should avoid gym schedule (floating PCA only)
      const avoidGym = shouldAvoidGymSchedule(pref)
    
      // Skip if conflicts with gym schedule and we should avoid it
      if (slotConflict && avoidGym && prefSlots.length > 0) {
        return
      }

      // Handle preferred PCA assignments (when preferred_pca_ids is specified)
      if (pref.preferred_pca_ids.length > 0) {
        pref.preferred_pca_ids.forEach((pcaId) => {
          const pca = floatingPCA.find(p => p.id === pcaId && p.is_available)
          if (!pca) return

          const existingAllocation = getFirstAllocationByStaffId(pcaId)
          if (existingAllocation && existingAllocation.fte_remaining <= 0) return

          if (neededFTE > 0) {
            // Check which preferred slots are available for this PCA
            const availableSlots: number[] = []
            prefSlots.forEach(slot => {
              if (existingAllocation) {
                // Check if slot is already assigned to another team (special program takes priority)
                const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
                const currentSlotTeam = existingAllocation[slotField]
                // Only assign if slot is null or already assigned to this team
                if (currentSlotTeam === null || currentSlotTeam === pref.team) {
                  availableSlots.push(slot)
                }
                // Don't overwrite if assigned to another team (special program takes priority)
              } else {
                // New allocation - all slots available
                availableSlots.push(slot)
              }
            })

            if (availableSlots.length === 0) return // No available slots

            const fteToAssign = Math.min(neededFTE, existingAllocation?.fte_remaining || 1, 0.25 * availableSlots.length)
          
            if (existingAllocation) {
              // Only assign available slots
              availableSlots.forEach(slot => {
                if (slot === 1) existingAllocation.slot1 = pref.team
                if (slot === 2) existingAllocation.slot2 = pref.team
                if (slot === 3) existingAllocation.slot3 = pref.team
                if (slot === 4) existingAllocation.slot4 = pref.team
              })
              existingAllocation.fte_remaining -= fteToAssign
            } else {
              const slot1Team = availableSlots.includes(1) ? pref.team : null
              const slot2Team = availableSlots.includes(2) ? pref.team : null
              const slot3Team = availableSlots.includes(3) ? pref.team : null
              const slot4Team = availableSlots.includes(4) ? pref.team : null
              const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
            
              const allocation: PCAAllocation = {
                id: crypto.randomUUID(),
                schedule_id: '',
                staff_id: pcaId,
                team: pref.team,
                fte_pca: pca.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                fte_remaining: pca.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                slot_assigned: fteAssigned,
                slot_whole: null,
                slot1: slot1Team,
                slot2: slot2Team,
                slot3: slot3Team,
                slot4: slot4Team,
                leave_type: null,
                special_program_ids: null,
              }
              allocations.push(allocation)
            }
            // NOTE: Do NOT increment teamPCAAssigned here - let the floating PCA loop handle FTE counting
            // This ensures tie-breakers work correctly based on pending FTE, not preferences
            // teamPCAAssigned[pref.team] += fteToAssign

            // Find alternative floating PCA for remaining preferred slots that couldn't be assigned
            const unassignedSlots = prefSlots.filter(slot => !availableSlots.includes(slot))
            if (unassignedSlots.length > 0 && teamPCAAssigned[pref.team] < requiredFTE) {
              // Try to find other floating PCA for these slots
              const alternativePCA = floatingPCA.find(p => 
                p.id !== pcaId && 
                p.is_available &&
                !allocations.some(a => 
                  a.staff_id === p.id && 
                  a.special_program_ids && 
                  a.special_program_ids.length > 0
                ) // Don't use PCA already assigned to special programs
              )

              if (alternativePCA) {
                const altAllocation = getFirstAllocationByStaffId(alternativePCA.id)
                const altRemainingFTE = altAllocation?.fte_remaining || 1
                const stillNeededFTE = requiredFTE - teamPCAAssigned[pref.team]
                const fteForAlt = Math.min(stillNeededFTE, altRemainingFTE, 0.25 * unassignedSlots.length)

                if (altAllocation) {
                  unassignedSlots.forEach(slot => {
                    const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
                    // Only assign if slot is not already assigned (respect special programs)
                    if (altAllocation[slotField] === null) {
                      altAllocation[slotField] = pref.team
                    }
                  })
                  altAllocation.fte_remaining -= fteForAlt
                } else {
                  const slot1Team = unassignedSlots.includes(1) ? pref.team : null
                  const slot2Team = unassignedSlots.includes(2) ? pref.team : null
                  const slot3Team = unassignedSlots.includes(3) ? pref.team : null
                  const slot4Team = unassignedSlots.includes(4) ? pref.team : null
                  const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
                
                  const newAllocation: PCAAllocation = {
                    id: crypto.randomUUID(),
                    schedule_id: '',
                    staff_id: alternativePCA.id,
                    team: pref.team,
                    fte_pca: fteForAlt,
                    fte_remaining: 1 - fteForAlt,
                    slot_assigned: fteAssigned,
                    slot_whole: null,
                    slot1: slot1Team,
                    slot2: slot2Team,
                    slot3: slot3Team,
                    slot4: slot4Team,
                    leave_type: null,
                    special_program_ids: null,
                  }
                  allocations.push(newAllocation)
                }
                // NOTE: Do NOT increment teamPCAAssigned here - let the floating PCA loop handle FTE counting
                // teamPCAAssigned[pref.team] += fteForAlt
              }
            }
          }
        })
      }

      // Handle preferred slots without preferred PCA (slots only preference)
      if (pref.preferred_pca_ids.length === 0 && prefSlots.length > 0 && neededFTE > 0) {
        // Find available floating PCA for these preferred slots
        const availablePCA = floatingPCA.find(p => 
          p.is_available &&
          !allocations.some(a => 
            a.staff_id === p.id && 
            a.special_program_ids && 
            a.special_program_ids.length > 0
          ) // Don't use PCA already assigned to special programs
        )

        if (availablePCA) {
          const existingAllocation = getFirstAllocationByStaffId(availablePCA.id)
          const remainingFTE = existingAllocation?.fte_remaining || 1
          const fteToAssign = Math.min(neededFTE, remainingFTE, 0.25 * prefSlots.length)

          // Check which preferred slots are available
          const availableSlots: number[] = []
          prefSlots.forEach(slot => {
            if (existingAllocation) {
              const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
              // Only assign if slot is not already assigned (respect special programs)
              if (existingAllocation[slotField] === null) {
                availableSlots.push(slot)
              }
            } else {
              availableSlots.push(slot)
            }
          })

          if (availableSlots.length > 0) {
            const finalFte = Math.min(fteToAssign, 0.25 * availableSlots.length)

            if (existingAllocation) {
              availableSlots.forEach(slot => {
                if (slot === 1) existingAllocation.slot1 = pref.team
                if (slot === 2) existingAllocation.slot2 = pref.team
                if (slot === 3) existingAllocation.slot3 = pref.team
                if (slot === 4) existingAllocation.slot4 = pref.team
              })
              existingAllocation.fte_remaining -= finalFte
            } else {
              const slot1Team = availableSlots.includes(1) ? pref.team : null
              const slot2Team = availableSlots.includes(2) ? pref.team : null
              const slot3Team = availableSlots.includes(3) ? pref.team : null
              const slot4Team = availableSlots.includes(4) ? pref.team : null
              const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
            
              const allocation: PCAAllocation = {
                id: crypto.randomUUID(),
                schedule_id: '',
                staff_id: availablePCA.id,
                team: pref.team,
                fte_pca: finalFte,
                fte_remaining: 1 - finalFte,
                slot_assigned: fteAssigned,
                slot_whole: null,
                slot1: slot1Team,
                slot2: slot2Team,
                slot3: slot3Team,
                slot4: slot4Team,
                leave_type: null,
                special_program_ids: null,
              }
              allocations.push(allocation)
            }
            // NOTE: Do NOT increment teamPCAAssigned here - let the floating PCA loop handle FTE counting
            // teamPCAAssigned[pref.team] += finalFte
          }
        }
      }
    })

    // Recalculate pending values after special programs and preferences allocations
    updatePendingValues(pendingPCAFTEPerTeam, teamPCAAssigned, context.averagePCAPerTeam)

    // Priority 3 & 4: Fill remaining needs using highest-pending-first strategy
    const remainingFloatingPCA = floatingPCA.filter(
      pca => {
        const allocation = getFirstAllocationByStaffId(pca.id)
        if (!allocation) {
          // No allocation yet - PCA is fully available
          return true
        }
      
        // Check if all slots are already assigned (for substitution or other allocation)
        // If all 4 slots are assigned, the PCA is not available for further allocation
        const allSlotsAssigned = allocation.slot1 !== null && 
                                allocation.slot2 !== null && 
                                allocation.slot3 !== null && 
                                allocation.slot4 !== null
      
        if (allSlotsAssigned) {
          // All slots assigned - PCA is not available for further allocation
          return false
        }
      
        // Include PCA with remaining FTE and available slots
        // (they can still be assigned to other teams using remaining slots)
        return allocation.fte_remaining > 0
      }
    )

    // Helper function to get next team with highest pending FTE
    // If userTeamOrder is provided, use it as the priority order instead of sorting by pending FTE
    // If userAdjustedPendingFTE is provided, use it instead of computed pending values
    const getNextHighestPendingTeam = async (excludedTeams: Set<Team> = new Set()): Promise<Team | null> => {
      // Use user-adjusted pending FTE if provided, otherwise use computed values
      const effectivePendingFTE = context.userAdjustedPendingFTE ?? pendingPCAFTEPerTeam
    
      // Filter teams with ROUNDED pending > 0, excluding preference_not teams and already-fulfilled teams
      // IMPORTANT: Use rounded pending to be consistent with the inner while loop condition
      // This prevents infinite loops when raw pending > 0 but rounded pending = 0
      const teamsWithPending: Array<{ team: Team; pending: number; orderIndex: number }> = []
    
      Object.entries(effectivePendingFTE).forEach(([team, pending]) => {
        const teamKey = team as Team
        // Use rounded pending to check if team needs more PCA
        const roundedPending = roundToNearestQuarterWithMidpoint(pending)
        if (roundedPending > 0 && !excludedTeams.has(teamKey)) {
          // Get order index from userTeamOrder if provided
          const orderIndex = context.userTeamOrder 
            ? context.userTeamOrder.indexOf(teamKey)
            : -1
          teamsWithPending.push({ team: teamKey, pending, orderIndex })
        }
      })
    
      if (teamsWithPending.length === 0) return null
    
      // If user specified a team order, use it as primary sort
      if (context.userTeamOrder) {
        // Sort by user-specified order (teams not in order list go last)
        teamsWithPending.sort((a, b) => {
          const aIndex = a.orderIndex >= 0 ? a.orderIndex : 999
          const bIndex = b.orderIndex >= 0 ? b.orderIndex : 999
          return aIndex - bIndex
        })
      
        // Return the first team (highest priority in user order that still needs PCA)
        return teamsWithPending[0].team
      }
    
      // No user order - use original logic: sort by pending (descending)
      teamsWithPending.sort((a, b) => b.pending - a.pending)
    
      const highestPending = teamsWithPending[0].pending
      // Use exact equality for tie-breaking (compare RAW values, not rounded)
      // Teams with exactly the same raw pending value are truly tied
      const tiedTeams = teamsWithPending.filter(t => t.pending === highestPending).map(t => t.team)
    
      if (tiedTeams.length > 1 && context.onTieBreak) {
        // Multiple teams tied - use callback to get user selection
        const selectedTeam = await context.onTieBreak(tiedTeams, highestPending)
        return selectedTeam
      }
    
      // No callback or single team - return first team (alphabetical order for consistency)
      return tiedTeams.sort()[0]
    }

    // Allocate floating PCA to highest pending teams first, filling each completely
    const excludedTeams = new Set<Team>() // Track teams that can't be filled
    while (remainingFloatingPCA.length > 0) {
      // Get next team with highest pending FTE (excluding teams that can't be filled)
      const targetTeam = await getNextHighestPendingTeam(excludedTeams)
      if (!targetTeam) break // No more teams need PCA
    
      // Fill this team completely (until pending = 0)
      // Get team's preferences to guide PCA selection
      const targetPreference = getTeamPreference(targetTeam)
      const preferredPCAIds = targetPreference?.preferred_pca_ids || []
      const preferredSlots = targetPreference?.preferred_slots || []
      const gymSlot = targetPreference?.gym_schedule ?? null
      const avoidGym = shouldAvoidGymSchedule(targetPreference)
    
      // Keep assigning slots until rounded pending reaches 0
      // We work with raw pending values, but round to nearest 0.25 (with midpoint) when checking if we should continue
      // This ensures 0.96 rounds to 1.0 (4 slots) instead of 0.75 (3 slots)
      while (roundToNearestQuarterWithMidpoint(pendingPCAFTEPerTeam[targetTeam]) > 0 && remainingFloatingPCA.length > 0) {
        // Find next available floating PCA - prioritize preferred PCAs
        let pcaToAssign: PCAData | null = null
        let pcaIndex = -1
      
        // Calculate slots needed upfront - use roundToNearestQuarterWithMidpoint to ensure correct rounding
        // (e.g., 0.96 → 1.0 → 4 slots, not 0.75 → 3 slots)
        const remainingPending = roundToNearestQuarterWithMidpoint(pendingPCAFTEPerTeam[targetTeam])
        const slotsNeeded = Math.floor(remainingPending / 0.25)
      
        // First, try to find a preferred PCA
        if (preferredPCAIds.length > 0) {
          const preferWholeDay = slotsNeeded >= 4
          let bestPCA: PCAData | null = null
          let bestPCAIndex = -1
          let bestHasWholeDay = false
          let bestAvailableSlotCount = 0
        
          // First pass: if we need whole day (>=4 slots), prioritize preferred PCAs with whole day available
          // Otherwise, collect all candidates and pick the best one
          for (let i = 0; i < remainingFloatingPCA.length; i++) {
            const pca = remainingFloatingPCA[i]
            if (!preferredPCAIds.includes(pca.id)) continue
          
      const allocation = getFirstAllocationByStaffId(pca.id)
      const remainingFTE = allocation?.fte_remaining || 1

            if (remainingFTE <= 0) continue
          
            // Check available slots for this PCA
            const pcaAvailableSlots = pca.availableSlots && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
            const availableSlots: number[] = []
            pcaAvailableSlots.forEach(slot => {
              const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : slot === 4 ? 'slot4' : 'slot1'
              if (allocation && allocation[slotField] === null) {
                availableSlots.push(slot)
              } else if (!allocation) {
                availableSlots.push(slot)
              }
            })
            const availableSlotCount = availableSlots.length
            const hasWholeDay = availableSlotCount >= 4 && availableSlots.includes(1) && availableSlots.includes(2) && availableSlots.includes(3) && availableSlots.includes(4)
          
            // If we prefer whole day and this PCA has whole day, select it immediately
            if (preferWholeDay && hasWholeDay) {
              pcaToAssign = pca
              pcaIndex = i
              break
            }
          
            // Otherwise, track the best candidate (prefer whole day, then most available slots)
            if (!bestPCA || 
                (hasWholeDay && !bestHasWholeDay) ||
                (hasWholeDay === bestHasWholeDay && availableSlotCount > bestAvailableSlotCount)) {
              bestPCA = pca
              bestPCAIndex = i
              bestHasWholeDay = hasWholeDay
              bestAvailableSlotCount = availableSlotCount
            }
          }
        
          // If we didn't find a whole day PCA but have a best candidate, use it
          if (!pcaToAssign && bestPCA) {
            pcaToAssign = bestPCA
            pcaIndex = bestPCAIndex
          }
        }
      
        // If no preferred PCA found, fall back to any available PCA
        // When slotsNeeded >= 4, prioritize PCAs with whole day available
        if (!pcaToAssign) {
          let bestFallbackPCA: PCAData | null = null
          let bestFallbackIndex = -1
          let bestFallbackHasWholeDay = false
          let bestFallbackAvailableSlotCount = 0
        
          for (let i = 0; i < remainingFloatingPCA.length; i++) {
            const pca = remainingFloatingPCA[i]
            const allocation = getFirstAllocationByStaffId(pca.id)
            const remainingFTE = allocation?.fte_remaining || 1
          
            if (remainingFTE <= 0) continue
          
            // Check available slots for this PCA
            const pcaAvailableSlots = pca.availableSlots && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
            const availableSlots: number[] = []
            pcaAvailableSlots.forEach(slot => {
              const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : slot === 4 ? 'slot4' : 'slot1'
              if (allocation && allocation[slotField] === null) {
                availableSlots.push(slot)
              } else if (!allocation) {
                availableSlots.push(slot)
              }
            })
            const availableSlotCount = availableSlots.length
            const hasWholeDay = availableSlotCount >= 4 && availableSlots.includes(1) && availableSlots.includes(2) && availableSlots.includes(3) && availableSlots.includes(4)
          
            // If we need whole day (>=4 slots), prioritize PCAs with whole day available
            if (slotsNeeded >= 4 && hasWholeDay) {
              pcaToAssign = pca
              pcaIndex = i
              break
            }
          
            // Otherwise, track the best candidate (prefer whole day, then most available slots)
            if (!bestFallbackPCA || 
                (hasWholeDay && !bestFallbackHasWholeDay) ||
                (hasWholeDay === bestFallbackHasWholeDay && availableSlotCount > bestFallbackAvailableSlotCount)) {
              bestFallbackPCA = pca
              bestFallbackIndex = i
              bestFallbackHasWholeDay = hasWholeDay
              bestFallbackAvailableSlotCount = availableSlotCount
            }
          }
        
          // If we didn't find a whole day PCA but have a best candidate, use it
          if (!pcaToAssign && bestFallbackPCA) {
            pcaToAssign = bestFallbackPCA
            pcaIndex = bestFallbackIndex
          }
        }
      
        if (!pcaToAssign) {
          // No available PCA for this team - exclude it from further selection to prevent infinite loop
          excludedTeams.add(targetTeam)
          break // Exit inner loop, outer loop will try next team
        }
      
        const allocation = getFirstAllocationByStaffId(pcaToAssign!.id)
        const remainingFTE = allocation?.fte_remaining || 1
      
        if (allocation) {
          // Find available slots - prioritize preferred slots, then PCA's available slots
          // BUT: When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences and use all slots
          const pcaAvailableSlots = pcaToAssign.availableSlots && pcaToAssign.availableSlots.length > 0
            ? pcaToAssign.availableSlots
            : [1, 2, 3, 4]
        
          // IMPORTANT: Find slots already taken by OTHER floating PCAs for this team
          // This prevents assigning multiple floating PCAs to the same slot for substitution
          const slotsTakenByOtherFloating: number[] = []
          allocations.forEach(alloc => {
            if (alloc.staff_id === pcaToAssign!.id) return // Skip self
            const allocStaff = getPcaById(alloc.staff_id)
            if (allocStaff?.floating) {
              if (alloc.slot1 === targetTeam) slotsTakenByOtherFloating.push(1)
              if (alloc.slot2 === targetTeam) slotsTakenByOtherFloating.push(2)
              if (alloc.slot3 === targetTeam) slotsTakenByOtherFloating.push(3)
              if (alloc.slot4 === targetTeam) slotsTakenByOtherFloating.push(4)
            }
          })
        
          // Build ordered slot list
          const orderedSlots: number[] = []
        
          // When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences - use all available slots
          if (slotsNeeded >= 4) {
            // Just use all available slots in order (1, 2, 3, 4)
            pcaAvailableSlots.forEach(slot => {
              orderedSlots.push(slot)
            })
          } else {
            // When slotsNeeded < 4, prioritize preferred slots first, then others
            if (preferredSlots.length > 0) {
              // Add preferred slots that are also available for this PCA
              preferredSlots.forEach(slot => {
                if (pcaAvailableSlots.includes(slot) && !orderedSlots.includes(slot)) {
                  orderedSlots.push(slot)
                }
              })
            }
            // Add remaining PCA available slots
            pcaAvailableSlots.forEach(slot => {
              if (!orderedSlots.includes(slot)) {
                orderedSlots.push(slot)
              }
            })
          }
        
          // Try to assign as many slots as possible from this PCA (up to slotsNeeded)
          // Exclude slots already taken by other floating PCAs for this team
          let slotsAssigned = 0
          const assignedSlotNumbers: number[] = []
          for (const slot of orderedSlots) {
            if (slotsAssigned >= slotsNeeded) break // Already fulfilled the need
          
            // Skip slots already taken by other floating PCAs for this team
            if (slotsTakenByOtherFloating.includes(slot)) continue
          
            const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
            // Only assign if slot is null (not already assigned, including special program assignments)
            if (allocation[slotField] === null && (!avoidGym || gymSlot !== slot)) {
              allocation[slotField] = targetTeam
              slotsAssigned++
              assignedSlotNumbers.push(slot)
            }
          }
        
          if (slotsAssigned === 0) {
            // No available slots for this PCA
            remainingFloatingPCA.splice(pcaIndex, 1)
            continue
          }
        
          // Update FTE based on how many slots were assigned
          const baseFTE = pcaToAssign.fte_pca
          updateAllocationFTE(allocation, baseFTE)
        
          // Update tracking for all slots assigned in this iteration
          const fteToAssign = slotsAssigned * 0.25
          teamPCAAssigned[targetTeam] += fteToAssign
          pendingPCAFTEPerTeam[targetTeam] = Math.max(0, pendingPCAFTEPerTeam[targetTeam] - fteToAssign)
        } else {
          // Create new allocation - assign as many slots as needed
          // BUT: When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences and use all slots
          const pcaAvailableSlots = pcaToAssign.availableSlots && pcaToAssign.availableSlots.length > 0
            ? pcaToAssign.availableSlots
            : [1, 2, 3, 4]
        
          // IMPORTANT: Find slots already taken by OTHER floating PCAs for this team
          // This prevents assigning multiple floating PCAs to the same slot for substitution
          const slotsTakenByOtherFloating: number[] = []
          allocations.forEach(alloc => {
            const allocStaff = getPcaById(alloc.staff_id)
            if (allocStaff?.floating) {
              // Check each slot - if assigned to target team, it's taken
              if (alloc.slot1 === targetTeam) slotsTakenByOtherFloating.push(1)
              if (alloc.slot2 === targetTeam) slotsTakenByOtherFloating.push(2)
              if (alloc.slot3 === targetTeam) slotsTakenByOtherFloating.push(3)
              if (alloc.slot4 === targetTeam) slotsTakenByOtherFloating.push(4)
            }
          })
        
          // Build ordered slot list
          const orderedSlots: number[] = []
        
          // When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences - use all available slots
          if (slotsNeeded >= 4) {
            // Just use all available slots in order (1, 2, 3, 4)
            pcaAvailableSlots.forEach(slot => {
              orderedSlots.push(slot)
            })
          } else {
            // When slotsNeeded < 4, prioritize preferred slots first, then others
            if (preferredSlots.length > 0) {
              preferredSlots.forEach(slot => {
                if (pcaAvailableSlots.includes(slot) && !orderedSlots.includes(slot)) {
                  orderedSlots.push(slot)
                }
              })
            }
            pcaAvailableSlots.forEach(slot => {
              if (!orderedSlots.includes(slot)) {
                orderedSlots.push(slot)
              }
            })
          }
        
          // Try to assign as many slots as needed from this PCA
          // Exclude slots already taken by other floating PCAs for this team
          const assignedSlots: number[] = []
          for (const slot of orderedSlots) {
            if (assignedSlots.length >= slotsNeeded) break // Already fulfilled the need
          
            // Skip slots already taken by other floating PCAs for this team
            if (slotsTakenByOtherFloating.includes(slot)) continue
          
            if (!avoidGym || gymSlot !== slot) {
              assignedSlots.push(slot)
            }
          }
        
          if (assignedSlots.length === 0) {
            // No available slots for this PCA
            remainingFloatingPCA.splice(pcaIndex, 1)
            continue
          }
        
          // Create new allocation with all assigned slots
          // Note: assignedSlots should NOT include invalid slot (it's excluded from availableSlots)
          const fteToAssign = assignedSlots.length * 0.25
          // True FTE = available slots only (invalid slot not counted)
          const trueFTE = assignedSlots.length * 0.25
        
          const newAllocation: PCAAllocation = {
            id: crypto.randomUUID(),
            schedule_id: '',
            staff_id: pcaToAssign.id,
            team: targetTeam,
            fte_pca: trueFTE, // Use true FTE (available slots only, invalid slot not counted)
            fte_remaining: pcaToAssign.fte_pca - fteToAssign,
            slot_assigned: fteToAssign,
            slot_whole: null,
            slot1: assignedSlots.includes(1) ? targetTeam : null,
            slot2: assignedSlots.includes(2) ? targetTeam : null,
            slot3: assignedSlots.includes(3) ? targetTeam : null,
            slot4: assignedSlots.includes(4) ? targetTeam : null,
            leave_type: pcaToAssign.leave_type,
            special_program_ids: null,
          }
        
          // Add invalid slot fields if they exist (invalid slot will be assigned in post-processing)
          if (pcaToAssign.invalidSlot !== undefined && pcaToAssign.invalidSlot !== null) {
            (newAllocation as any).invalid_slot = pcaToAssign.invalidSlot
          }
        
          allocations.push(newAllocation)
        
          // Update tracking using true FTE (invalid slot not counted)
          teamPCAAssigned[targetTeam] += trueFTE
          pendingPCAFTEPerTeam[targetTeam] = Math.max(0, pendingPCAFTEPerTeam[targetTeam] - trueFTE)
        }
      
        // Remove PCA from available list if fully allocated
        const updatedAllocation = getFirstAllocationByStaffId(pcaToAssign.id)
        if (updatedAllocation && updatedAllocation.fte_remaining <= 0) {
          remainingFloatingPCA.splice(pcaIndex, 1)
        }
      }
    }

    // Post-processing: Handle invalid slots for floating PCA (bundle with neighboring slot)
    // This should only run in floating or all phase
    floatingPCA.forEach((pca) => {
      if (pca.invalidSlot === undefined || pca.invalidSlot === null) return
    
      const allocation = getFirstAllocationByStaffId(pca.id)
      if (!allocation) return
    
      // Find neighboring slot in same half-day
      // AM: slots 1-2, PM: slots 3-4
      const invalidSlot = pca.invalidSlot
      let neighboringSlot: number | null = null
      let neighboringTeam: Team | null = null
    
      if (invalidSlot === 1 || invalidSlot === 2) {
        // AM half-day: find slot 1 or 2 that is assigned
        if (allocation.slot1 && invalidSlot !== 1) {
          neighboringSlot = 1
          neighboringTeam = allocation.slot1
        } else if (allocation.slot2 && invalidSlot !== 2) {
          neighboringSlot = 2
          neighboringTeam = allocation.slot2
        }
      } else if (invalidSlot === 3 || invalidSlot === 4) {
        // PM half-day: find slot 3 or 4 that is assigned
        if (allocation.slot3 && invalidSlot !== 3) {
          neighboringSlot = 3
          neighboringTeam = allocation.slot3
        } else if (allocation.slot4 && invalidSlot !== 4) {
          neighboringSlot = 4
          neighboringTeam = allocation.slot4
        }
      }
    
      // If neighboring slot found, assign invalid slot to same team (display-only, no FTE consumed)
      if (neighboringTeam) {
        assignSlotIfValid({
          allocation,
          slot: invalidSlot,
          team: neighboringTeam,
          skipFteCheck: true,
          allowOverwrite: true,
        })
      
        // Add invalid slot fields
        ;(allocation as any).invalid_slot = invalidSlot
      }
    })

  return { allocations, teamPCAAssigned, pendingPCAFTEPerTeam }
}
