import { getWeekday } from '@/lib/features/schedule/date'
import { resolveSpecialProgramRuntimeModel } from '@/lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '@/types/allocation'
import type { Team } from '@/types/staff'

interface PcaAllocationLike {
  team?: Team | null
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
  staffOverrides?: Record<string, unknown>
}): number[] {
  const { allocation, team, selectedDate, specialPrograms, staffOverrides } = args
  if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
    return []
  }

  const weekday = getWeekday(selectedDate)
  const slotsForTeam = getSlotsForTeam(allocation, team)
  const out = new Set<number>()
  const programById = new Map<string, SpecialProgram>()
  for (const program of specialPrograms || []) {
    programById.set(String(program.id), program)
  }

  for (const programId of allocation.special_program_ids) {
    const program = programById.get(String(programId))
    if (!program) continue

    const runtimeModel = resolveSpecialProgramRuntimeModel({
      program,
      weekday,
      staffOverrides,
      targetTeam: allocation.team ?? team,
    })
    if (!runtimeModel.isActiveOnWeekday) continue

    for (const slot of runtimeModel.effectiveRequiredSlots) {
      if (!slotsForTeam.includes(slot)) continue
      if (runtimeModel.slotTeamBySlot[slot] !== team) continue
      out.add(slot)
    }
  }

  return Array.from(out).sort((a, b) => a - b)
}
