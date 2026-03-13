import { createEmptyTeamRecord } from '@/lib/utils/types'
import { buildSpecialProgramSlotsByProgramId } from '@/lib/utils/specialProgramSlotMap'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team, Weekday } from '@/types/staff'

export function computeStep3BootstrapState(args: {
  pcaAllocations: Record<Team, Array<PCAAllocation & { staff?: Staff }>>
  staff: Staff[]
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
}): {
  existingTeamPCAAssigned: Record<Team, number>
  existingAllocations: PCAAllocation[]
} {
  const teamPCAAssigned = createEmptyTeamRecord<number>(0)
  const existingAllocations: PCAAllocation[] = []
  const addedStaffIds = new Set<string>()

  const specialSlotsByProgramId = buildSpecialProgramSlotsByProgramId({
    specialPrograms: args.specialPrograms,
    weekday: args.weekday,
    staffOverrides: args.staffOverrides,
  })

  Object.entries(args.pcaAllocations).forEach(([team, allocs]) => {
    ;(allocs || []).forEach((alloc: any) => {
      const specialSlotSet = (() => {
        const ids = alloc?.special_program_ids
        if (!Array.isArray(ids) || ids.length === 0) return null
        const out = new Set<number>()
        ids.forEach((id: any) => {
          const s = specialSlotsByProgramId.get(String(id))
          if (!s) return
          s.forEach((slot) => out.add(slot))
        })
        return out.size > 0 ? out : null
      })()

      let slotsInTeam = 0
      if (alloc.slot1 === team && !(specialSlotSet?.has(1))) slotsInTeam++
      if (alloc.slot2 === team && !(specialSlotSet?.has(2))) slotsInTeam++
      if (alloc.slot3 === team && !(specialSlotSet?.has(3))) slotsInTeam++
      if (alloc.slot4 === team && !(specialSlotSet?.has(4))) slotsInTeam++

      const invalidSlot = (alloc as any).invalid_slot
      if (invalidSlot) {
        const slotField = `slot${invalidSlot}` as keyof PCAAllocation
        if ((alloc as any)[slotField] === team && !(specialSlotSet?.has(invalidSlot))) {
          slotsInTeam = Math.max(0, slotsInTeam - 1)
        }
      }

      teamPCAAssigned[team as Team] += slotsInTeam * 0.25

      const staffMember = args.staff.find((s) => s.id === alloc.staff_id)
      if (!staffMember) return
      if (addedStaffIds.has(alloc.staff_id)) return

      const hasSlots = alloc.slot1 != null || alloc.slot2 != null || alloc.slot3 != null || alloc.slot4 != null
      if (!staffMember.floating || hasSlots) {
        existingAllocations.push(alloc)
        addedStaffIds.add(alloc.staff_id)
      }
    })
  })

  return {
    existingTeamPCAAssigned: teamPCAAssigned,
    existingAllocations,
  }
}
