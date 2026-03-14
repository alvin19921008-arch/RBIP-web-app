import type { PCAAllocation } from '@/types/schedule'
import type { Team } from '@/types/staff'

export function computeStalePcaStaffIdsForReplace(args: {
  existingStaffIds: string[]
  submittedStaffIds: string[]
}): string[] {
  const submitted = new Set((args.submittedStaffIds ?? []).filter(Boolean))
  return Array.from(new Set((args.existingStaffIds ?? []).filter(Boolean))).filter((staffId) => !submitted.has(staffId))
}

function hasMaterialPcaAssignmentFacts(args: {
  staffTeam: Team
  allocation: PCAAllocation | null
}): boolean {
  const allocation = args.allocation
  if (!allocation) return false

  const slotAssigned = (allocation as any)?.slot_assigned ?? (allocation as any)?.fte_assigned ?? 0
  if (typeof slotAssigned === 'number' && slotAssigned > 0) return true
  if ((allocation as any)?.slot_whole != null) return true
  if ((allocation as any)?.invalid_slot != null) return true

  const specialProgramIds = Array.isArray((allocation as any)?.special_program_ids)
    ? ((allocation as any)?.special_program_ids as unknown[])
    : []
  if (specialProgramIds.length > 0) return true

  const slots = [allocation.slot1, allocation.slot2, allocation.slot3, allocation.slot4]
  return slots.some((slot) => slot != null && slot !== args.staffTeam)
}

export function shouldPersistPcaAllocationForSave(args: {
  staffTeam: Team
  floating: boolean
  allocation: PCAAllocation | null
}): boolean {
  return hasMaterialPcaAssignmentFacts({
    staffTeam: args.staffTeam,
    allocation: args.allocation,
  })
}
