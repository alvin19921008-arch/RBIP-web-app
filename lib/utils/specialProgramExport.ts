import { resolveSpecialProgramRuntimeModel } from '@/lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'

type RowSlot = 1 | 2 | 3 | 4

export function getSpecialProgramNameBySlotForAllocation(args: {
  allocation: PCAAllocation
  specialPrograms: SpecialProgram[]
  weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  staffOverrides?: Record<string, unknown>
}): Partial<Record<RowSlot, string>> {
  const labels: Partial<Record<RowSlot, string>> = {}
  if (!Array.isArray(args.allocation.special_program_ids) || args.allocation.special_program_ids.length === 0) {
    return labels
  }

  const programById = new Map<string, SpecialProgram>()
  for (const program of args.specialPrograms || []) {
    programById.set(String(program.id), program)
  }

  for (const programId of args.allocation.special_program_ids) {
    const program = programById.get(String(programId))
    if (!program) continue

    const runtimeModel = resolveSpecialProgramRuntimeModel({
      program,
      weekday: args.weekday,
      staffOverrides: args.staffOverrides,
      targetTeam: args.allocation.team,
    })
    if (!runtimeModel.isActiveOnWeekday) continue

    for (const slot of runtimeModel.effectiveRequiredSlots) {
      if (slot !== 1 && slot !== 2 && slot !== 3 && slot !== 4) continue
      const assignedTeam =
        slot === 1
          ? args.allocation.slot1
          : slot === 2
            ? args.allocation.slot2
            : slot === 3
              ? args.allocation.slot3
              : args.allocation.slot4
      if (!assignedTeam) continue
      if (runtimeModel.slotTeamBySlot[slot] !== assignedTeam) continue
      labels[slot] = program.name
    }
  }

  return labels
}
