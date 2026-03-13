import type { SpecialProgram } from '@/types/allocation'
import type { Weekday } from '@/types/staff'
import { getEffectiveSpecialProgramWeekdaySlots } from '@/lib/utils/specialProgramConfigRows'
import { getSpecialProgramRuntimeOverrideSummary } from '@/lib/utils/specialProgramRuntimeOverrides'

/**
 * Special-program reserved PCA capacity (in FTE) for a given weekday.
 *
 * IMPORTANT:
 * - Derived from the program's *required slots* (not current allocations) so it stays stable
 *   even when assignments are missing / mid-edit.
 * - Applies Step 2.0 overrides:
 *   - If any override has `requiredSlots`, that becomes the required slot set (union).
 *   - Otherwise, if overrides specify PCA `slots`, we fall back to that union (legacy behavior).
 * - DRM is excluded (it is an add-on requirement, not reserved slot capacity).
 */
export function computeReservedSpecialProgramPcaFte(args: {
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
}): number {
  const { specialPrograms, weekday, staffOverrides } = args

  let total = 0

  for (const program of specialPrograms || []) {
    if (!program?.id) continue
    if (!Array.isArray((program as any).weekdays) || !(program as any).weekdays.includes(weekday)) continue
    if ((program as any).name === 'DRM') continue

    const runtimeOverride = getSpecialProgramRuntimeOverrideSummary({
      staffOverrides,
      programId: String(program.id),
    })
    if (runtimeOverride.explicitlyDisabled) continue

    const slotsUnion = new Set<number>()
    runtimeOverride.pcaOverrides.forEach((entry) => {
      entry.slots.forEach((slot) => slotsUnion.add(slot))
    })

    const effectiveSlots =
      runtimeOverride.requiredSlots.length > 0
        ? runtimeOverride.requiredSlots
        : slotsUnion.size > 0
          ? Array.from(slotsUnion).sort((a, b) => a - b)
          : getEffectiveSpecialProgramWeekdaySlots({ program, day: weekday })

    total += effectiveSlots.length * 0.25
  }

  return total
}

/**
 * DRM add-on (in FTE) for the given weekday.
 * - Returns 0 when DRM is not active for the weekday.
 * - If Step 2.0 override provides `drmAddOn`, that value is used; otherwise defaults to 0.4.
 */
export function computeDrmAddOnFte(args: {
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
  defaultAddOn?: number
}): number {
  const { specialPrograms, weekday, staffOverrides, defaultAddOn = 0.4 } = args

  const drmProgram = (specialPrograms || []).find((p) => (p as any)?.name === 'DRM')
  if (!drmProgram) return 0
  if (!Array.isArray((drmProgram as any).weekdays) || !(drmProgram as any).weekdays.includes(weekday)) return 0

  const runtimeOverride = getSpecialProgramRuntimeOverrideSummary({
    staffOverrides,
    programId: String((drmProgram as any).id ?? ''),
  })
  if (runtimeOverride.explicitlyDisabled) return 0
  if (typeof runtimeOverride.drmAddOn === 'number') return runtimeOverride.drmAddOn

  return defaultAddOn
}

