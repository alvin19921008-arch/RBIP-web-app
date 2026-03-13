import { buildReservationRuntimeProgramsById } from '@/lib/utils/scheduleReservationRuntime'
import type { SpecialProgram } from '@/types/allocation'
import type { Weekday } from '@/types/staff'

export function buildSpecialProgramSlotsByProgramId(args: {
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
}): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  const programsById = buildReservationRuntimeProgramsById({
    specialPrograms: args.specialPrograms,
    weekday: args.weekday,
    staffOverrides: args.staffOverrides,
  })
  for (const [programId, runtimeProgram] of programsById.entries()) {
    out.set(programId, new Set(runtimeProgram.effectiveRequiredSlots))
  }
  // Keep disabled/not-active programs represented as empty sets for compatibility.
  for (const program of args.specialPrograms || []) {
    const key = String(program.id)
    if (!out.has(key)) out.set(key, new Set<number>())
  }
  return out
}
