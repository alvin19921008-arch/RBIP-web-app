import { getEffectiveSpecialProgramWeekdaySlots } from '@/lib/utils/specialProgramConfigRows'
import { getSpecialProgramRuntimeOverrideSummary } from '@/lib/utils/specialProgramRuntimeOverrides'
import type { SpecialProgram } from '@/types/allocation'
import type { Weekday } from '@/types/staff'

export function buildSpecialProgramSlotsByProgramId(args: {
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
}): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  for (const program of args.specialPrograms || []) {
    const runtimeOverride = getSpecialProgramRuntimeOverrideSummary({
      staffOverrides: args.staffOverrides,
      programId: String(program.id),
    })
    const effectiveSlots = runtimeOverride.explicitlyDisabled
      ? []
      : runtimeOverride.requiredSlots.length > 0
        ? runtimeOverride.requiredSlots
        : getEffectiveSpecialProgramWeekdaySlots({ program, day: args.weekday })
    out.set(String(program.id), new Set(effectiveSlots))
  }
  return out
}
