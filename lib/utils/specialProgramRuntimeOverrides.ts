const VALID_SLOTS = new Set([1, 2, 3, 4])

export type SpecialProgramRuntimeOverrideEntryLike = {
  programId?: string
  therapistId?: string
  pcaId?: string
  slots?: number[]
  requiredSlots?: number[]
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
  enabled?: boolean
}

export type SpecialProgramRuntimeOverrideSummary = {
  entries: SpecialProgramRuntimeOverrideEntryLike[]
  explicitlyDisabled: boolean
  requiredSlots: number[]
  pcaOverrides: Array<{ pcaId: string; slots: number[] }>
  therapistOverrides: Array<{
    therapistId: string
    therapistFTESubtraction?: number
  }>
  drmAddOn?: number
}

function normalizeSlots(input: unknown): number[] {
  if (!Array.isArray(input)) return []
  const out: number[] = []
  for (const value of input) {
    if (typeof value !== 'number') continue
    if (!VALID_SLOTS.has(value)) continue
    out.push(value)
  }
  return Array.from(new Set(out)).sort((a, b) => a - b)
}

export function getSpecialProgramRuntimeOverrideSummary(args: {
  staffOverrides?: Record<string, unknown>
  programId: string
}): SpecialProgramRuntimeOverrideSummary {
  const { staffOverrides, programId } = args

  const entries: SpecialProgramRuntimeOverrideEntryLike[] = []
  const requiredSlots = new Set<number>()
  const pcaSlotsById = new Map<string, Set<number>>()
  const therapistOverrides: Array<{
    therapistId: string
    therapistFTESubtraction?: number
  }> = []
  let explicitlyDisabled = false
  let drmAddOn: number | undefined

  for (const value of Object.values(staffOverrides ?? {})) {
    if (!value || typeof value !== 'object') continue
    const list = (value as any).specialProgramOverrides
    if (!Array.isArray(list)) continue

    for (const rawEntry of list) {
      if (!rawEntry || typeof rawEntry !== 'object') continue
      const entry = rawEntry as SpecialProgramRuntimeOverrideEntryLike
      if (String(entry.programId ?? '') !== programId) continue

      entries.push(entry)

      if (entry.enabled === false) {
        explicitlyDisabled = true
      }

      for (const slot of normalizeSlots(entry.requiredSlots)) {
        requiredSlots.add(slot)
      }

      if (typeof entry.pcaId === 'string' && entry.pcaId.length > 0) {
        const slots = normalizeSlots(entry.slots)
        const current = pcaSlotsById.get(entry.pcaId) ?? new Set<number>()
        slots.forEach((slot) => current.add(slot))
        pcaSlotsById.set(entry.pcaId, current)
      }

      if (typeof entry.therapistId === 'string' && entry.therapistId.length > 0) {
        therapistOverrides.push({
          therapistId: entry.therapistId,
          therapistFTESubtraction: entry.therapistFTESubtraction,
        })
      }

      if (typeof entry.drmAddOn === 'number' && Number.isFinite(entry.drmAddOn) && entry.drmAddOn >= 0) {
        drmAddOn = entry.drmAddOn
      }
    }
  }

  return {
    entries,
    explicitlyDisabled,
    requiredSlots: Array.from(requiredSlots).sort((a, b) => a - b),
    pcaOverrides: Array.from(pcaSlotsById.entries())
      .map(([pcaId, slots]) => ({
        pcaId,
        slots: Array.from(slots).sort((a, b) => a - b),
      }))
      .filter((entry) => entry.slots.length > 0),
    therapistOverrides,
    drmAddOn,
  }
}
