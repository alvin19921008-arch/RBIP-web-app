/**
 * Pure detection of non-floating PCAs that need substitution (FTE ≠ 1.0).
 *
 * **Argument order:** `(allocationsByTeam, staff, staffOverrides)` — `staff` and
 * `staffOverrides` are explicit parameters (not closed over) for testability and lib layering.
 */
import type { Team, Staff } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import { createEmptyTeamRecord } from '@/lib/utils/types'

export type NonFloatingSubstitutionEntry = {
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  fte: number
  missingSlots: number[]
  currentSubstitute?: { pcaId: string; pcaName: string; slots: number[] }
}

export function detectNonFloatingSubstitutions(
  allocationsByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]>,
  staff: Staff[],
  staffOverrides: StaffOverrides
): Record<Team, NonFloatingSubstitutionEntry[]> {
  const substitutionsNeeded = createEmptyTeamRecord<NonFloatingSubstitutionEntry[]>([])

  Object.entries(allocationsByTeam).forEach(([team, allocations]) => {
    const teamTyped = team as Team
    allocations.forEach((alloc) => {
      const staffMember = staff.find((s) => s.id === alloc.staff_id)
      if (!staffMember || staffMember.floating) return

      const override = staffOverrides[alloc.staff_id]
      const actualFTE =
        override?.fteRemaining !== undefined ? override.fteRemaining : (alloc.fte_pca || 0)

      if (Math.abs(actualFTE - 1.0) > 0.001) {
        const allSlots = [1, 2, 3, 4]
        const availableSlots =
          override?.availableSlots && override.availableSlots.length > 0
            ? override.availableSlots
            : actualFTE === 0
              ? []
              : [1, 2, 3, 4]
        const missingSlots = allSlots.filter((slot) => !availableSlots.includes(slot))

        if (missingSlots.length > 0) {
          let currentSubstitute: { pcaId: string; pcaName: string; slots: number[] } | undefined
          Object.values(allocationsByTeam)
            .flat()
            .forEach((floatingAlloc) => {
              const floatingStaff = staff.find((s) => s.id === floatingAlloc.staff_id)
              if (!floatingStaff || !floatingStaff.floating) return

              const assignedSlots: number[] = []
              if (floatingAlloc.slot1 === teamTyped) assignedSlots.push(1)
              if (floatingAlloc.slot2 === teamTyped) assignedSlots.push(2)
              if (floatingAlloc.slot3 === teamTyped) assignedSlots.push(3)
              if (floatingAlloc.slot4 === teamTyped) assignedSlots.push(4)

              const matchingSlots = assignedSlots.filter((slot) => missingSlots.includes(slot))
              if (matchingSlots.length > 0 && !currentSubstitute) {
                currentSubstitute = {
                  pcaId: floatingAlloc.staff_id,
                  pcaName: floatingStaff.name,
                  slots: matchingSlots,
                }
              }
            })

          substitutionsNeeded[teamTyped].push({
            nonFloatingPCAId: alloc.staff_id,
            nonFloatingPCAName: staffMember.name,
            fte: actualFTE,
            missingSlots,
            currentSubstitute,
          })
        }
      }
    })
  })

  return substitutionsNeeded
}
