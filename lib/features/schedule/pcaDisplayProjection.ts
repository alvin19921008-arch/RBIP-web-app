import { buildPcaAllocatorView, buildScheduleRuntimeProjection } from '@/lib/utils/scheduleRuntimeProjection'
import type { StaffRuntimeOverrideLike } from '@/lib/utils/staffRuntimeProjection'
import { hasMeaningfulStaffOverrideEntry } from '@/lib/utils/staffOverridesMeaningful'
import { createEmptyTeamRecordFactory } from '@/lib/utils/types'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'

const ALL_SLOTS = [1, 2, 3, 4] as const

export type DisplayPcaAllocation = PCAAllocation & {
  staff: Staff
  __displayOnlyStep1?: true
  __displaySlots?: Array<1 | 2 | 3 | 4>
}

function normalizeDisplaySlots(availableSlots?: number[]): Array<1 | 2 | 3 | 4> {
  const normalized = Array.isArray(availableSlots)
    ? availableSlots.filter((slot): slot is 1 | 2 | 3 | 4 => ALL_SLOTS.includes(slot as 1 | 2 | 3 | 4))
    : []
  return normalized.length > 0 ? normalized : [...ALL_SLOTS]
}

export function buildDisplayPcaAllocationsByTeam(args: {
  selectedDate: Date
  staff: Staff[]
  staffOverrides: Record<string, StaffRuntimeOverrideLike | undefined>
  pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff?: Staff }>>
}): Record<Team, DisplayPcaAllocation[]> {
  const projected = createEmptyTeamRecordFactory<DisplayPcaAllocation[]>(() => [])
  const staffById = new Map(args.staff.map((member) => [member.id, member]))
  const existingStaffIds = new Set<string>()

  for (const [team, allocations] of Object.entries(args.pcaAllocationsByTeam) as Array<
    [Team, Array<PCAAllocation & { staff?: Staff }>]
  >) {
    for (const allocation of allocations || []) {
      const staffMember = allocation.staff ?? staffById.get(allocation.staff_id)
      if (!staffMember) continue
      existingStaffIds.add(allocation.staff_id)
      projected[team].push({
        ...(allocation as PCAAllocation),
        staff: staffMember,
      })
    }
  }

  const runtimeProjection = buildScheduleRuntimeProjection({
    selectedDate: args.selectedDate,
    staff: args.staff,
    staffOverrides: args.staffOverrides,
  })
  const runtimePcaRows = buildPcaAllocatorView({
    projection: runtimeProjection,
    fallbackToBaseTeamWhenEffectiveTeamMissing: true,
  })

  for (const runtimeRow of runtimePcaRows) {
    if (runtimeRow.floating) continue
    if (!runtimeRow.team) continue
    if (!(runtimeRow.fte_pca > 0)) continue
    if (existingStaffIds.has(runtimeRow.id)) continue
    const override = args.staffOverrides[runtimeRow.id]
    if (!hasMeaningfulStaffOverrideEntry(override)) continue

    const staffMember = staffById.get(runtimeRow.id)
    if (!staffMember) continue

    projected[runtimeRow.team].push({
      id: `display-step1-pca:${runtimeRow.id}:${runtimeRow.team}`,
      schedule_id: '',
      staff_id: runtimeRow.id,
      team: runtimeRow.team,
      fte_pca: runtimeRow.fte_pca,
      fte_remaining: runtimeRow.fte_pca,
      slot_assigned: 0,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: runtimeRow.leave_type,
      special_program_ids: null,
      invalid_slot: runtimeRow.invalidSlot,
      staff: staffMember,
      __displayOnlyStep1: true,
      __displaySlots: normalizeDisplaySlots(runtimeRow.availableSlots),
    })
  }

  return projected
}
