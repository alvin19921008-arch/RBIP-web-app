import { buildPcaAllocatorView, buildScheduleRuntimeProjection } from '@/lib/utils/scheduleRuntimeProjection'
import type { Staff } from '@/types/staff'

export function willNeedStep21Substitution(args: {
  selectedDate: Date
  staff: Staff[]
  staffOverrides: Record<string, any>
}): boolean {
  const projection = buildScheduleRuntimeProjection({
    selectedDate: args.selectedDate,
    staff: args.staff,
    staffOverrides: args.staffOverrides,
    clampBufferFteRemaining: true,
  })

  const pcaPool = buildPcaAllocatorView({
    projection,
    fallbackToBaseTeamWhenEffectiveTeamMissing: true,
  })

  const nonFloatingPCA = pcaPool.filter((pca) => !pca.floating && pca.is_available)
  const nonFloatingUnavailable = pcaPool.filter((pca) => !pca.floating && !pca.is_available && pca.team)

  if (nonFloatingUnavailable.length > 0) return true

  return nonFloatingPCA.some((pca) => {
    if (!pca.team) return false
    const availableSlots = pca.availableSlots && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
    const missingSlots = [1, 2, 3, 4].filter((slot) => !availableSlots.includes(slot))
    if (missingSlots.length === 0) return false
    const actualFTE = pca.fte_pca || 0
    return Math.abs(actualFTE - 1.0) >= 0.001
  })
}

