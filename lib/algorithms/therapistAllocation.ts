import { Team, StaffRank, LeaveType } from '@/types/staff'
import { TherapistAllocation, DailySchedule } from '@/types/schedule'
import { SPTAllocation, SpecialProgram } from '@/types/allocation'
import { roundToNearestQuarter } from '@/lib/utils/rounding'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { getSptWeekdayConfig } from '@/lib/features/schedule/sptConfig'

export interface StaffData {
  id: string
  name: string
  rank: StaffRank
  team: Team | null
  special_program: string[] | null
  fte_therapist: number
  leave_type: LeaveType
  is_available: boolean
  availableSlots?: number[] // Slots (1, 2, 3, 4) that are available for this staff member
}

export interface AllocationContext {
  date: Date
  previousSchedule: DailySchedule | null
  staff: StaffData[]
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  manualOverrides: Record<string, { team: Team; fte: number }[]>
  includeSPTAllocation?: boolean // If false, skip SPT allocation logic (Phase 6a and 6b). Defaults to true for backward compatibility.
}

export interface AllocationResult {
  allocations: TherapistAllocation[]
  calculations: {
    totalPTOnDuty: number
    ptPerTeam: Record<Team, number>
  }
}

export function allocateTherapists(context: AllocationContext): AllocationResult {
  const allocations: TherapistAllocation[] = []
  const ptPerTeam: Record<Team, number> = {
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
  }

  // Step 1: Load base schedule from previous day (if exists)
  // This would be handled by loading previous allocations

  // Step 2: Apply base rules - default team assignments
  const staffByTeam: Record<Team, StaffData[]> = {
    FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
  }

  context.staff.forEach((staff) => {
    // Allow staff with leave_type if they have FTE > 0 (partial availability)
    // Only exclude if FTE = 0 (fully on leave)
    if (staff.team && staff.is_available && staff.fte_therapist > 0) {
      staffByTeam[staff.team].push(staff)
    }
  })

  // Step 3: Apply manual overrides
  Object.entries(context.manualOverrides).forEach(([staffId, overrides]) => {
    const staff = context.staff.find(s => s.id === staffId)
    if (!staff) return

    overrides.forEach((override) => {
      const allocation: TherapistAllocation = {
        id: crypto.randomUUID(),
        schedule_id: '', // Will be set when saving
        staff_id: staffId,
        team: override.team,
        fte_therapist: override.fte,
        fte_remaining: staff.fte_therapist - override.fte,
        slot_whole: null,
        slot1: override.team,
        slot2: override.team,
        slot3: override.team,
        slot4: override.team,
        leave_type: null,
        special_program_ids: null,
        is_substitute_team_head: false,
        spt_slot_display: null,
        is_manual_override: true,
        manual_override_note: null,
      }
      allocations.push(allocation)
      ptPerTeam[override.team] += override.fte
    })
  })

  // Step 4: Apply default team assignments (excluding manual overrides)
  context.staff.forEach((staff) => {
    if (context.manualOverrides[staff.id]) return // Skip if manually overridden
    
    // IMPORTANT: SPT allocations are handled exclusively by the dedicated SPT phases (6a/6b),
    // or preserved externally when `includeSPTAllocation` is false.
    // If we allocate SPTs here (default assignment) and again in Phase 6, they will appear as
    // duplicated SPT cards across teams (especially noticeable when Step 2.2 is skipped).
    if (staff.rank === 'SPT') return

    // Allow staff with leave_type if they have FTE > 0 (partial availability)
    if (staff.team && staff.is_available && staff.fte_therapist > 0) {
      // Map program names to UUIDs using the specialPrograms context
      const programIds = staff.special_program?.map(name => {
        const program = context.specialPrograms.find(p => p.name === name)
        return program?.id
      }).filter((id): id is string => !!id) || null
      
      const allocation: TherapistAllocation = {
        id: crypto.randomUUID(),
        schedule_id: '',
        staff_id: staff.id,
        team: staff.team,
        fte_therapist: staff.fte_therapist,
        fte_remaining: 0,
        slot_whole: null,
        slot1: staff.team,
        slot2: staff.team,
        slot3: staff.team,
        slot4: staff.team,
        leave_type: staff.leave_type || null,
        special_program_ids: programIds && programIds.length > 0 ? programIds : null,
        is_substitute_team_head: false,
        spt_slot_display: null,
        is_manual_override: false,
        manual_override_note: null,
      }
      allocations.push(allocation)
      ptPerTeam[staff.team] += staff.fte_therapist
    }
  })

  // Step 6: Apply SPT allocations (only active ones)
  const weekday = getWeekday(context.date)

  // Deduplicate SPT allocation rows (single-row-per-staff model).
  // Keep the canonical row per staff_id: prefer active, then most recently updated.
  const canonicalSptAllocs: SPTAllocation[] = (() => {
    const byStaff = new Map<string, SPTAllocation[]>()
    for (const a of context.sptAllocations || []) {
      if (!a?.staff_id) continue
      const list = byStaff.get(a.staff_id) ?? []
      list.push(a)
      byStaff.set(a.staff_id, list)
    }
    const pickCanonical = (rows: SPTAllocation[]) => {
      const sorted = [...rows].sort((a, b) => {
        const aActive = a.active !== false
        const bActive = b.active !== false
        if (aActive !== bActive) return aActive ? -1 : 1
        const aT = a.updated_at ? Date.parse(a.updated_at) : 0
        const bT = b.updated_at ? Date.parse(b.updated_at) : 0
        return bT - aT
      })
      return sorted[0] ?? null
    }
    const out: SPTAllocation[] = []
    for (const [staffId, rows] of byStaff.entries()) {
      const canonical = pickCanonical(rows)
      if (!canonical) continue
      if (canonical.active === false) continue
      out.push(canonical)
    }
    return out
  })()
  
  // Helper function to evaluate teams for SPT allocation
  const evaluateTeamsForSPT = (sptAlloc: SPTAllocation, availableTeams: Team[]) => {
    // Evaluate each team: check if it has existing SPT and get ptPerTeam value
    // IMPORTANT: Calculate expected ptPerTeam after special program subtractions
    // We need to estimate what ptPerTeam will be after Step 7 (special program subtractions)
    const teamEvaluations = availableTeams.map(team => {
      const existingSPTCount = allocations.filter(
        a => a.team === team && 
        context.staff.find(s => s.id === a.staff_id)?.rank === 'SPT'
      ).length
      
      const hasExistingSPT = existingSPTCount > 0
      let currentPTFTE = ptPerTeam[team]
      
      // Estimate ptPerTeam after special program subtractions
      // For each staff in this team, check if they have special programs that will subtract FTE
      const teamAllocations = allocations.filter(a => a.team === team)
      let estimatedSpecialProgramSubtraction = 0
      
      context.specialPrograms.forEach(program => {
        if (!program.weekdays.includes(weekday)) return
        
        // Check if any staff in this team has this special program
        // Staff must be in program.staff_ids AND have FTE subtraction for this weekday
        const teamStaffWithProgram = teamAllocations.filter(alloc => {
          // Check if staff is in the program's staff_ids
          if (!program.staff_ids.includes(alloc.staff_id)) return false
          
          // Check if staff has FTE subtraction for this weekday
          const staffFTE = program.fte_subtraction[alloc.staff_id]
          const subtraction = staffFTE?.[weekday] || 0
          return subtraction > 0
        })
        
        if (teamStaffWithProgram.length > 0) {
          // Use preference order to determine which staff will run the program
          const preferenceOrder = program.therapist_preference_order?.[team]
          
          if (preferenceOrder && preferenceOrder.length > 0 && teamStaffWithProgram.length > 1) {
            // Multiple staff: use preference order, find first available
            const orderedStaff = preferenceOrder
              .map(staffId => teamStaffWithProgram.find(a => a.staff_id === staffId))
              .filter(a => a !== undefined)
            
            if (orderedStaff.length > 0) {
              const selectedStaff = orderedStaff[0]
              const staffFTE = program.fte_subtraction[selectedStaff.staff_id]
              estimatedSpecialProgramSubtraction += staffFTE?.[weekday] || 0
            }
          } else if (teamStaffWithProgram.length === 1) {
            // Single staff: subtract their FTE
            const staffFTE = program.fte_subtraction[teamStaffWithProgram[0].staff_id]
            estimatedSpecialProgramSubtraction += staffFTE?.[weekday] || 0
          } else {
            // No preference order, use maximum (fallback to old logic)
            const maxSubtraction = Math.max(...teamStaffWithProgram.map(alloc => {
              const staffFTE = program.fte_subtraction[alloc.staff_id]
              return staffFTE?.[weekday] || 0
            }))
            estimatedSpecialProgramSubtraction += maxSubtraction
          }
        }
      })
      
      // Calculate estimated ptPerTeam after special program subtractions
      const estimatedPTFTE = currentPTFTE - estimatedSpecialProgramSubtraction
      
      // Check yesterday's allocation for tiebreaker (priority 3)
      let yesterdayTeam: Team | null = null
      if (context.previousSchedule) {
        const yesterdayAlloc = (context.previousSchedule as any).therapist_allocations?.find(
          (a: any) => a.staff_id === sptAlloc.staff_id
        )
        if (yesterdayAlloc) {
          yesterdayTeam = yesterdayAlloc.team
        }
      }
      
      return {
        team,
        hasExistingSPT,
        ptPerTeam: estimatedPTFTE, // Use estimated value after special program subtractions
        isYesterdayTeam: yesterdayTeam === team
      }
    })

    // Sort ALL teams by estimatedPTFTE (ptPerTeam) first - this already accounts for:
    // - Pre-assigned SPT addons (from Phase 6a)
    // - Special program FTE subtractions (estimated)
    // Then use pre-SPT status as tiebreaker only when ptPerTeam is equal
    const allTeamsSorted = teamEvaluations.sort((a, b) => {
      // Primary sort: by ptPerTeam (ascending - lower is better)
      if (a.ptPerTeam !== b.ptPerTeam) {
        return a.ptPerTeam - b.ptPerTeam
      }
      // Tiebreaker 1: Prefer teams without pre-SPT if ptPerTeam is equal
      if (!a.hasExistingSPT && b.hasExistingSPT) return -1
      if (a.hasExistingSPT && !b.hasExistingSPT) return 1
      // Tiebreaker 2: Prefer yesterday's team if still tied
      if (a.isYesterdayTeam && !b.isYesterdayTeam) return -1
      if (!a.isYesterdayTeam && b.isYesterdayTeam) return 1
      // If still tied, use original array order (first team in sptAlloc.teams)
      return 0
    })

    // Select the team with the lowest ptPerTeam (after special program subtractions and pre-SPT addons)
    return allTeamsSorted[0]
  }

  // Helper function to apply slot assignments to an allocation
  const applySlotAssignments = (
    allocation: TherapistAllocation,
    slots: number[],
    slotModes: { am: 'AND' | 'OR', pm: 'AND' | 'OR' },
    targetTeam: Team,
    staffAvailableSlots?: number[] // Available slots for this staff member
  ) => {
    // Filter slots to only include those available for this staff member
    const availableSlots = staffAvailableSlots && staffAvailableSlots.length > 0
      ? slots.filter(s => staffAvailableSlots.includes(s))
      : slots

    const amSlots = availableSlots.filter(s => s === 1 || s === 2)
    const pmSlots = availableSlots.filter(s => s === 3 || s === 4)

    // Apply slot assignment based on mode for AM group (slots 1-2)
    if (amSlots.length > 0) {
      if (slotModes.am === 'OR' && amSlots.length > 1) {
        // OR mode: assign to only the first selected AM slot
        const firstAMSlot = amSlots[0]
        if (firstAMSlot === 1) allocation.slot1 = targetTeam
        if (firstAMSlot === 2) allocation.slot2 = targetTeam
      } else {
        // AND mode (default): assign to all selected AM slots
        if (amSlots.includes(1)) allocation.slot1 = targetTeam
        if (amSlots.includes(2)) allocation.slot2 = targetTeam
      }
    }
    
    // Apply slot assignment based on mode for PM group (slots 3-4)
    if (pmSlots.length > 0) {
      if (slotModes.pm === 'OR' && pmSlots.length > 1) {
        // OR mode: assign to only the first selected PM slot
        const firstPMSlot = pmSlots[0]
        if (firstPMSlot === 3) allocation.slot3 = targetTeam
        if (firstPMSlot === 4) allocation.slot4 = targetTeam
      } else {
        // AND mode (default): assign to all selected PM slots
        if (pmSlots.includes(3)) allocation.slot3 = targetTeam
        if (pmSlots.includes(4)) allocation.slot4 = targetTeam
      }
    }
  }

  // Phase 6a: Apply regular SPT allocations (skip RBIP supervisors)
  // Only run if includeSPTAllocation is not explicitly set to false
  if (context.includeSPTAllocation !== false) {
    canonicalSptAllocs
      .filter((sptAlloc) => !sptAlloc.is_rbip_supervisor)
      .forEach((sptAlloc) => {
        // Safety: ensure we never emit more than one allocation per SPT staff member.
        // (e.g. if upstream logic ever adds an SPT allocation before Phase 6a).
        if (allocations.some((a) => a.staff_id === sptAlloc.staff_id)) return

        const staffMember = context.staff.find((s) => s.id === sptAlloc.staff_id)
        if (staffMember && !staffMember.is_available) return

        const sptCfg = getSptWeekdayConfig({
          staffId: sptAlloc.staff_id,
          weekday,
          sptAllocations: [sptAlloc],
        })
        if (!sptCfg.enabled) return

        const slots = sptCfg.slots
        if (slots.length === 0) return

        const slotModes = sptCfg.slotModes

        // Normal SPT allocation processing
        const availableTeams = sptAlloc.teams.filter((team) => {
          return !allocations.some((a) => a.staff_id === sptAlloc.staff_id && a.team === team)
        })
        if (availableTeams.length === 0) return

        const selectedEvaluation = evaluateTeamsForSPT(sptAlloc, availableTeams)
        if (!selectedEvaluation) return

        const selectedTeam = selectedEvaluation.team
        // Prefer the effective staff FTE (already accounts for schedule overrides),
        // fallback to the config-derived value.
        const fteToAdd = staffMember?.fte_therapist ?? sptCfg.baseFte
        const slotDisplay = sptCfg.slotDisplay

        const allocation: TherapistAllocation = {
          id: crypto.randomUUID(),
          schedule_id: '',
          staff_id: sptAlloc.staff_id,
          team: selectedTeam,
          fte_therapist: fteToAdd,
          fte_remaining: 0,
          slot_whole: null,
          slot1: null,
          slot2: null,
          slot3: null,
          slot4: null,
          leave_type: null,
          special_program_ids: null,
          is_substitute_team_head: false,
          spt_slot_display: slotDisplay,
          is_manual_override: false,
          manual_override_note: null,
        }

        applySlotAssignments(allocation, slots, slotModes, selectedTeam, staffMember?.availableSlots)

        allocations.push(allocation)
        ptPerTeam[selectedTeam] += fteToAdd
      })
  }

  // Phase 6b: Apply RBIP supervisor logic
  // Only run if includeSPTAllocation is not explicitly set to false
  if (context.includeSPTAllocation !== false) {
    const supervisors = canonicalSptAllocs.filter((sptAlloc) => !!sptAlloc.is_rbip_supervisor)

    supervisors.forEach((supervisorAlloc) => {
      const staffMember = context.staff.find((s) => s.id === supervisorAlloc.staff_id)
      if (staffMember && !staffMember.is_available) return

      const sptCfg = getSptWeekdayConfig({
        staffId: supervisorAlloc.staff_id,
        weekday,
        sptAllocations: [supervisorAlloc],
      })
      if (!sptCfg.enabled) return

      const slots = sptCfg.slots
      if (slots.length === 0) return

      // Check if already allocated
      const alreadyAllocated = allocations.some((a) => a.staff_id === supervisorAlloc.staff_id)
      if (alreadyAllocated) return

      const slotModes = sptCfg.slotModes

    // Find teams without team heads
    const teamsWithoutHeads: Team[] = []
    Object.entries(staffByTeam).forEach(([team, staffList]) => {
      const teamKey = team as Team
      const teamHeads = staffList.filter(s => s.rank === 'APPT' && s.is_available)
      if (teamHeads.length === 0) {
        teamsWithoutHeads.push(teamKey)
      }
    })

    if (teamsWithoutHeads.length > 0) {
      // Substitute for first team needing head
      const targetTeam = teamsWithoutHeads[0]
      const supervisorStaff = staffMember
      if (supervisorStaff && supervisorStaff.is_available) {
        const slotDisplay = sptCfg.slotDisplay
        const allocation: TherapistAllocation = {
          id: crypto.randomUUID(),
          schedule_id: '',
          staff_id: supervisorAlloc.staff_id,
          team: targetTeam,
          fte_therapist: supervisorStaff.fte_therapist ?? sptCfg.baseFte,
          fte_remaining: 1 - (supervisorStaff.fte_therapist ?? sptCfg.baseFte),
          slot_whole: null,
          slot1: null,
          slot2: null,
          slot3: null,
          slot4: null,
          leave_type: null,
          special_program_ids: null,
          is_substitute_team_head: true,
          spt_slot_display: slotDisplay,
          is_manual_override: false,
          manual_override_note: null,
        }
        
        applySlotAssignments(allocation, slots, slotModes, targetTeam, supervisorStaff.availableSlots)
        allocations.push(allocation)
        ptPerTeam[targetTeam] += supervisorStaff.fte_therapist ?? sptCfg.baseFte
      }
    } else {
      // Fallback: Use SPT allocation teams and priority logic
      // If no team preferences configured, RBIP supervisor can go to any team
      const allPossibleTeams: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
      const teamsToConsider = (supervisorAlloc.teams && supervisorAlloc.teams.length > 0) 
        ? supervisorAlloc.teams  // Use configured teams if provided
        : allPossibleTeams        // Use all teams if no preference configured
      
      const availableTeams = teamsToConsider.filter(team => {
        return !allocations.some(
          a => a.staff_id === supervisorAlloc.staff_id && a.team === team
        )
      })

      if (availableTeams.length === 0) return

      const selectedEvaluation = evaluateTeamsForSPT(supervisorAlloc, availableTeams)
      if (!selectedEvaluation) return

      const selectedTeam = selectedEvaluation.team
      const fteToAdd = staffMember?.fte_therapist ?? sptCfg.baseFte
      const slotDisplay = sptCfg.slotDisplay
      
      const staffAvailableSlots = staffMember?.availableSlots

      const allocation: TherapistAllocation = {
        id: crypto.randomUUID(),
        schedule_id: '',
        staff_id: supervisorAlloc.staff_id,
        team: selectedTeam,
        fte_therapist: fteToAdd,
        fte_remaining: 0,
        slot_whole: null,
        slot1: null,
        slot2: null,
        slot3: null,
        slot4: null,
        leave_type: null,
        special_program_ids: null,
        is_substitute_team_head: false,
        spt_slot_display: slotDisplay,
        is_manual_override: false,
        manual_override_note: null,
      }
      
      applySlotAssignments(allocation, slots, slotModes, selectedTeam, staffAvailableSlots)
      allocations.push(allocation)
      ptPerTeam[selectedTeam] += fteToAdd
    }
  })
  }

  // Step 7: Apply special program FTE subtractions
  // Rule: If multiple therapists in the same team have the same special program,
  // use preference order to assign to only one therapist per team
  context.specialPrograms.forEach((program) => {
    if (!program.weekdays.includes(weekday)) return
    
    // Group staff by team for this special program
    const staffByTeam: Record<Team, { staffId: string; fteSubtraction: number; allocation: TherapistAllocation }[]> = {
      FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
    }
    
    program.staff_ids.forEach((staffId) => {
      const allocation = allocations.find(a => a.staff_id === staffId)
      if (!allocation) return

      // Access weekday-specific FTE subtraction: fte_subtraction[staffId][weekday]
      const staffFTE = program.fte_subtraction[staffId]
      const fteSubtraction = staffFTE?.[weekday] || 0
      if (fteSubtraction > 0) {
        staffByTeam[allocation.team].push({ staffId, fteSubtraction, allocation })
      }
    })
    
    // For each team, use preference order to assign to only one therapist
    Object.entries(staffByTeam).forEach(([team, staffList]) => {
      if (staffList.length === 0) return
      
      // If only one staff, assign normally
      if (staffList.length === 1) {
        const { allocation, fteSubtraction } = staffList[0]
        allocation.fte_therapist -= fteSubtraction
        ptPerTeam[team as Team] -= fteSubtraction
        
        if (!allocation.special_program_ids) {
          allocation.special_program_ids = []
        }
        allocation.special_program_ids.push(program.id)
        return
      }
      
      // Multiple staff: use preference order
      const preferenceOrder = program.therapist_preference_order?.[team as Team]
      let orderedStaffList = staffList
      
      if (preferenceOrder && preferenceOrder.length > 0) {
        // Sort by preference order
        orderedStaffList = preferenceOrder
          .map(staffId => staffList.find(s => s.staffId === staffId))
          .filter((s): s is { staffId: string; fteSubtraction: number; allocation: TherapistAllocation } => s !== undefined)
        // Add any staff not in preference order to the end
        const orderedIds = new Set(orderedStaffList.map(s => s.staffId))
        const unorderedStaff = staffList.filter(s => !orderedIds.has(s.staffId))
        orderedStaffList = [...orderedStaffList, ...unorderedStaff]
      }
      
      // Find first available therapist.
      // - Default rule: therapist must have remaining FTE > 0
      // - Edge rule: SPT may have configured FTE = 0 but still be on duty (leave_type null),
      //   and can still be assigned to run special programs IF the program's therapist FTE subtraction is 0.
      let assignedStaff: { staffId: string; fteSubtraction: number; allocation: TherapistAllocation } | null = null
      
      for (const staffItem of orderedStaffList) {
        // Get staff data from context (allocation doesn't have staff object yet)
        const staffData = context.staff.find(s => s.id === staffItem.staffId)
        const originalFTE = staffData?.fte_therapist ?? 1.0
        const currentFTE = staffItem.allocation.fte_therapist ?? originalFTE
        
        const isOnDuty = isOnDutyLeaveType(staffItem.allocation.leave_type as any)
        const isOnDutyZeroFteSPT =
          staffData?.rank === 'SPT' &&
          currentFTE === 0 &&
          isOnDuty &&
          (staffItem.fteSubtraction ?? 0) === 0

        // Check if therapist is available
        if (currentFTE > 0 || isOnDutyZeroFteSPT) {
          assignedStaff = staffItem
          break
        }
      }
      
      if (assignedStaff) {
        // Assign to preferred/available therapist
        const { allocation, fteSubtraction } = assignedStaff
        allocation.fte_therapist -= fteSubtraction
        ptPerTeam[team as Team] -= fteSubtraction
        
        if (!allocation.special_program_ids) {
          allocation.special_program_ids = []
        }
        allocation.special_program_ids.push(program.id)
      }
      // If no available therapist, don't assign the program
    })
  })

  // Calculate total PT on duty
  const totalPTOnDuty = Object.values(ptPerTeam).reduce((sum, val) => sum + val, 0)

  return {
    allocations,
    calculations: {
      totalPTOnDuty,
      ptPerTeam,
    },
  }
}

function getWeekday(date: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' {
  const day = date.getDay()
  const weekdays: ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[] = ['mon', 'tue', 'wed', 'thu', 'fri']
  return weekdays[day === 0 ? 6 : day - 1] // Sunday = 0, adjust to Monday = 0
}

function getSlotDisplay(slots: number[]): 'AM' | 'PM' | 'AM+PM' | null {
  const hasAM = slots.some(s => s === 1 || s === 2)
  const hasPM = slots.some(s => s === 3 || s === 4)
  
  if (hasAM && hasPM) return 'AM+PM'
  if (hasAM) return 'AM'
  if (hasPM) return 'PM'
  return null
}
