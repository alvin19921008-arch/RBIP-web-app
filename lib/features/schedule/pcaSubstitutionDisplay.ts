import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'
import { getSubstitutionSlotsForTeam, normalizeSubstitutionForBySlot } from '@/lib/utils/substitutionFor'

export type PcaSubstitutionInfo = {
  isSubstituting: boolean
  isWholeDaySubstitution: boolean
  substitutedSlots: number[]
}

export function derivePcaSubstitutionInfo(args: {
  team: Team
  floatingAlloc: PCAAllocation & { staff: Staff }
  staffOverrides: Record<string, any>
  allPCAStaff: Staff[]
}): PcaSubstitutionInfo {
  const { team, floatingAlloc, staffOverrides, allPCAStaff } = args
  const override = staffOverrides[floatingAlloc.staff_id]

  const floatingSlotsForTeam: number[] = []
  if (floatingAlloc.slot1 === team) floatingSlotsForTeam.push(1)
  if (floatingAlloc.slot2 === team) floatingSlotsForTeam.push(2)
  if (floatingAlloc.slot3 === team) floatingSlotsForTeam.push(3)
  if (floatingAlloc.slot4 === team) floatingSlotsForTeam.push(4)

  if (floatingSlotsForTeam.length === 0) {
    return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
  }

  const explicitSubstitutedSlots = getSubstitutionSlotsForTeam(override as any, team)
  if (explicitSubstitutedSlots.length > 0) {
    const substitutedSlots = explicitSubstitutedSlots
    const isWholeDay =
      substitutedSlots.length >= 3 ||
      (substitutedSlots.length === 4 &&
        substitutedSlots.includes(1) &&
        substitutedSlots.includes(2) &&
        substitutedSlots.includes(3) &&
        substitutedSlots.includes(4))

    return {
      isSubstituting: true,
      isWholeDaySubstitution: isWholeDay,
      substitutedSlots,
    }
  }

  const hasSpecialProgramAssignment =
    Array.isArray((floatingAlloc as any).special_program_ids) && (floatingAlloc as any).special_program_ids.length > 0
  if (hasSpecialProgramAssignment) {
    return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
  }

  try {
    const hasAnyExplicitSubstitutionForTeam = Object.values(staffOverrides).some(
      (o: any) => getSubstitutionSlotsForTeam(o, team).length > 0
    )
    if (hasAnyExplicitSubstitutionForTeam) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }

    const bufferWholeDayTargets = new Set(
      Object.values(staffOverrides).flatMap((o: any) => {
        const bySlot = normalizeSubstitutionForBySlot(o)
        const slotsForTeam = ([1, 2, 3, 4] as const).filter((slot) => bySlot[slot]?.team === team)
        if (slotsForTeam.length !== 4) return []
        const ids = new Set(slotsForTeam.map((slot) => bySlot[slot]?.nonFloatingPCAId).filter(Boolean))
        return ids.size === 1 ? [Array.from(ids)[0] as string] : []
      })
    )

    const nonFloatingStaffInTeam = allPCAStaff.filter((s) => !s.floating && s.team === team)
    const missingSlotsNeeded: number[] = []
    const sources: Array<{ nonFloatingId: string; kind: 'fte0' | 'availableSlots' | 'invalidSlot'; slots: number[] }> = []

    for (const nf of nonFloatingStaffInTeam) {
      if (bufferWholeDayTargets.has(nf.id)) continue

      const o = staffOverrides[nf.id]
      if (!o) continue

      if (o.fteRemaining === 0) {
        const slots = [1, 2, 3, 4]
        missingSlotsNeeded.push(...slots)
        sources.push({ nonFloatingId: nf.id, kind: 'fte0', slots })
        continue
      }

      if (Array.isArray(o.availableSlots) && o.availableSlots.length > 0) {
        const missingSlots = [1, 2, 3, 4].filter((s) => !o.availableSlots.includes(s))
        if (missingSlots.length > 0) {
          missingSlotsNeeded.push(...missingSlots)
          sources.push({ nonFloatingId: nf.id, kind: 'availableSlots', slots: missingSlots })
        }
      } else if (typeof o.invalidSlot === 'number') {
        missingSlotsNeeded.push(o.invalidSlot)
        sources.push({ nonFloatingId: nf.id, kind: 'invalidSlot', slots: [o.invalidSlot] })
      } else if (Array.isArray(o.invalidSlots) && o.invalidSlots.length > 0) {
        const slots = o.invalidSlots.map((s: any) => s.slot)
        missingSlotsNeeded.push(...slots)
        sources.push({ nonFloatingId: nf.id, kind: 'invalidSlot', slots })
      }
    }

    if (missingSlotsNeeded.length === 0) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }

    const substitutedSlots = floatingSlotsForTeam.filter((s) => missingSlotsNeeded.includes(s))
    if (substitutedSlots.length === 0) {
      return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
    }

    const isWholeDay =
      sources.some((s) => s.kind === 'fte0') ||
      (substitutedSlots.length === 4 &&
        substitutedSlots.includes(1) &&
        substitutedSlots.includes(2) &&
        substitutedSlots.includes(3) &&
        substitutedSlots.includes(4))

    return {
      isSubstituting: true,
      isWholeDaySubstitution: isWholeDay,
      substitutedSlots,
    }
  } catch {
    return { isSubstituting: false, isWholeDaySubstitution: false, substitutedSlots: [] }
  }
}
