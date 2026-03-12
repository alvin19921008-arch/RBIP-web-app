import { getWeekday } from '@/lib/features/schedule/date'
import { getEffectiveSpecialProgramWeekdaySlots } from '@/lib/utils/specialProgramConfigRows'
import type { SpecialProgram } from '@/types/allocation'
import type { Team } from '@/types/staff'

interface PcaAllocationLike {
  slot1?: Team | null
  slot2?: Team | null
  slot3?: Team | null
  slot4?: Team | null
  special_program_ids?: string[] | null
}

function getSlotsForTeam(allocation: PcaAllocationLike, team: Team): number[] {
  const slots: number[] = []
  if (allocation.slot1 === team) slots.push(1)
  if (allocation.slot2 === team) slots.push(2)
  if (allocation.slot3 === team) slots.push(3)
  if (allocation.slot4 === team) slots.push(4)
  return slots
}

export function getSpecialProgramSlotsForAllocationTeam(args: {
  allocation: PcaAllocationLike
  team: Team
  selectedDate: Date
  specialPrograms: SpecialProgram[]
}): number[] {
  const { allocation, team, selectedDate, specialPrograms } = args
  if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
    return []
  }

  const weekday = getWeekday(selectedDate)
  const slotsForTeam = getSlotsForTeam(allocation, team)
  const out = new Set<number>()

  for (const programId of allocation.special_program_ids) {
    const program = specialPrograms.find((item) => item.id === programId)
    if (!program) continue
    const programSlots = getEffectiveSpecialProgramWeekdaySlots({ program, day: weekday })
    for (const slot of programSlots) {
      if (slotsForTeam.includes(slot)) {
        out.add(slot)
      }
    }
  }

  return Array.from(out).sort((a, b) => a - b)
}
