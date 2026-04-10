import type { Team } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'
import { assignSlotIfValid } from '@/lib/utils/floatingPCAHelpers'

/**
 * Display-only: pair invalid half-day slots with their assigned neighbor for UI.
 * Does not consume pending/FTE (invalid slot is excluded from availableSlots upstream).
 */
export function applyInvalidSlotPairingForDisplay(allocations: PCAAllocation[], pcaPool: PCAData[]): void {
  const getSlotTeam = (alloc: PCAAllocation, slot: number): Team | null => {
    if (slot === 1) return alloc.slot1
    if (slot === 2) return alloc.slot2
    if (slot === 3) return alloc.slot3
    if (slot === 4) return alloc.slot4
    return null
  }

  const allocationByStaffId = new Map<string, PCAAllocation>()
  allocations.forEach((allocation) => {
    if (!allocationByStaffId.has(allocation.staff_id)) {
      allocationByStaffId.set(allocation.staff_id, allocation)
    }
  })

  for (const pca of pcaPool) {
    const invalidSlot = (pca as { invalidSlot?: number | null })?.invalidSlot as number | null | undefined
    if (invalidSlot == null) continue
    if (![1, 2, 3, 4].includes(invalidSlot)) continue

    const alloc = allocationByStaffId.get(pca.id)
    if (!alloc) continue

    const pairedSlot = invalidSlot === 1 ? 2 : invalidSlot === 2 ? 1 : invalidSlot === 3 ? 4 : 3
    const pairedTeam = getSlotTeam(alloc, pairedSlot)
    if (!pairedTeam) continue

    assignSlotIfValid({
      allocation: alloc,
      slot: invalidSlot,
      team: pairedTeam,
      skipFteCheck: true,
      allowOverwrite: true,
    })
    ;(alloc as { invalid_slot?: number }).invalid_slot = invalidSlot
  }
}
