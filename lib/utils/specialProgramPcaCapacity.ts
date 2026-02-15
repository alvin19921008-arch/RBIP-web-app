import type { SpecialProgram } from '@/types/allocation'
import type { Weekday } from '@/types/staff'

const VALID_SLOTS = new Set([1, 2, 3, 4])

function normalizeSlots(input: unknown): number[] {
  if (!Array.isArray(input)) return []
  const out: number[] = []
  for (const v of input) {
    if (typeof v !== 'number') continue
    if (!VALID_SLOTS.has(v)) continue
    out.push(v)
  }
  return Array.from(new Set(out)).sort((a, b) => a - b)
}

function getProgramRequiredSlotsWithFallback(program: SpecialProgram, weekday: Weekday): number[] {
  const raw = (program as any)?.slots?.[weekday]
  const slots = normalizeSlots(raw)
  if (slots.length > 0) return slots

  // Keep behavior consistent with allocation fallbacks in `lib/algorithms/pcaAllocation.ts`.
  if ((program as any)?.name === 'Robotic') return [1, 2, 3, 4]
  if ((program as any)?.name === 'CRP') return [2]
  return [1, 2, 3, 4]
}

function getAllSpecialProgramOverrideEntries(
  staffOverrides: Record<string, unknown> | undefined,
  programId: string
): any[] {
  if (!staffOverrides) return []
  const out: any[] = []
  for (const value of Object.values(staffOverrides)) {
    if (!value || typeof value !== 'object') continue
    const list = (value as any).specialProgramOverrides
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue
      if (String((entry as any).programId ?? '') !== programId) continue
      out.push(entry)
    }
  }
  return out
}

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

    const overrideEntries = getAllSpecialProgramOverrideEntries(staffOverrides, String(program.id))
    const requiredUnion = new Set<number>()
    const slotsUnion = new Set<number>()

    for (const e of overrideEntries) {
      for (const s of normalizeSlots((e as any).requiredSlots)) requiredUnion.add(s)
      for (const s of normalizeSlots((e as any).slots)) slotsUnion.add(s)
    }

    const effectiveSlots =
      requiredUnion.size > 0
        ? Array.from(requiredUnion).sort((a, b) => a - b)
        : slotsUnion.size > 0
          ? Array.from(slotsUnion).sort((a, b) => a - b)
          : getProgramRequiredSlotsWithFallback(program, weekday)

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

  const entries = getAllSpecialProgramOverrideEntries(staffOverrides, String((drmProgram as any).id ?? ''))
  for (const e of entries) {
    const v = (e as any)?.drmAddOn
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  }

  return defaultAddOn
}

