import { getEffectiveSpecialProgramWeekdaySlots } from '@/lib/utils/specialProgramConfigRows'
import type { SpecialProgram } from '@/types/allocation'
import type { Weekday } from '@/types/staff'

export function buildSpecialProgramSlotsByProgramId(args: {
  specialPrograms: SpecialProgram[]
  weekday: Weekday
}): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  for (const program of args.specialPrograms || []) {
    out.set(String(program.id), new Set(getEffectiveSpecialProgramWeekdaySlots({ program, day: args.weekday })))
  }
  return out
}
