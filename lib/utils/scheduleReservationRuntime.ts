import { resolveSpecialProgramRuntimeModel } from '@/lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Team, Weekday } from '@/types/staff'

export type ReservationRuntimeProgram = {
  programId: string
  programName: string
  effectiveRequiredSlots: number[]
  slotTeamBySlot: Partial<Record<1 | 2 | 3 | 4, Team>>
}

function toValidSlot(slot: number): 1 | 2 | 3 | 4 | null {
  return slot === 1 || slot === 2 || slot === 3 || slot === 4 ? slot : null
}

export function buildReservationRuntimeProgramsById(args: {
  specialPrograms: SpecialProgram[]
  weekday?: Weekday
  staffOverrides?: Record<string, unknown>
  allocationTargetTeam?: Team | null
}): Map<string, ReservationRuntimeProgram> {
  const map = new Map<string, ReservationRuntimeProgram>()
  for (const program of args.specialPrograms || []) {
    const runtimeModel = resolveSpecialProgramRuntimeModel({
      program,
      weekday: args.weekday,
      staffOverrides: args.staffOverrides,
      targetTeam: args.allocationTargetTeam ?? null,
    })
    if (!runtimeModel.isActiveOnWeekday) continue
    map.set(String(program.id), {
      programId: String(program.id),
      programName: program.name,
      effectiveRequiredSlots: [...runtimeModel.effectiveRequiredSlots],
      slotTeamBySlot: runtimeModel.slotTeamBySlot,
    })
  }
  return map
}

export function isAllocationSlotFromSpecialProgram(args: {
  allocation: PCAAllocation
  slot: number
  team: Team
  specialProgramsById: Map<string, ReservationRuntimeProgram>
}): boolean {
  const normalizedSlot = toValidSlot(args.slot)
  if (!normalizedSlot) return false

  const ids = args.allocation.special_program_ids
  if (!Array.isArray(ids) || ids.length === 0) return false

  for (const id of ids) {
    const runtimeProgram = args.specialProgramsById.get(String(id))
    if (!runtimeProgram) continue
    if (!runtimeProgram.effectiveRequiredSlots.includes(normalizedSlot)) continue
    if (runtimeProgram.slotTeamBySlot[normalizedSlot] === args.team) return true
  }
  return false
}

export function getAllocationSpecialProgramNameForSlot(args: {
  allocation: PCAAllocation
  slot: number
  team: Team
  specialProgramsById: Map<string, ReservationRuntimeProgram>
}): string {
  const normalizedSlot = toValidSlot(args.slot)
  if (!normalizedSlot) return 'Unknown Program'

  const ids = args.allocation.special_program_ids
  if (!Array.isArray(ids) || ids.length === 0) return 'Unknown Program'

  for (const id of ids) {
    const runtimeProgram = args.specialProgramsById.get(String(id))
    if (!runtimeProgram) continue
    if (!runtimeProgram.effectiveRequiredSlots.includes(normalizedSlot)) continue
    if (runtimeProgram.slotTeamBySlot[normalizedSlot] === args.team) {
      return runtimeProgram.programName
    }
  }
  return 'Unknown Program'
}

export function getAllocationSpecialProgramSlotsForTeam(args: {
  allocation: PCAAllocation
  team: Team
  specialProgramsById: Map<string, ReservationRuntimeProgram>
}): number[] {
  const out = new Set<number>()
  for (const slot of [1, 2, 3, 4] as const) {
    const assignedTeam =
      slot === 1
        ? args.allocation.slot1
        : slot === 2
          ? args.allocation.slot2
          : slot === 3
            ? args.allocation.slot3
            : args.allocation.slot4
    if (assignedTeam !== args.team) continue
    if (
      isAllocationSlotFromSpecialProgram({
        allocation: args.allocation,
        slot,
        team: args.team,
        specialProgramsById: args.specialProgramsById,
      })
    ) {
      out.add(slot)
    }
  }
  return Array.from(out).sort((a, b) => a - b)
}

export function getAllocationSpecialProgramNamesBySlot(args: {
  allocation: PCAAllocation
  specialProgramsById: Map<string, ReservationRuntimeProgram>
}): Partial<Record<1 | 2 | 3 | 4, string>> {
  const labels: Partial<Record<1 | 2 | 3 | 4, string>> = {}
  for (const slot of [1, 2, 3, 4] as const) {
    const assignedTeam =
      slot === 1
        ? args.allocation.slot1
        : slot === 2
          ? args.allocation.slot2
          : slot === 3
            ? args.allocation.slot3
            : args.allocation.slot4
    if (!assignedTeam) continue
    const label = getAllocationSpecialProgramNameForSlot({
      allocation: args.allocation,
      slot,
      team: assignedTeam,
      specialProgramsById: args.specialProgramsById,
    })
    if (label !== 'Unknown Program') {
      labels[slot] = label
    }
  }
  return labels
}
