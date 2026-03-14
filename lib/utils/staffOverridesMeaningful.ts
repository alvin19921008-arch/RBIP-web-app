type AllocationFactsArgs = {
  hasTherapistAllocations: boolean
  hasPCAAllocations: boolean
  hasBedAllocations: boolean
}

type ScheduleMeaningArgs = AllocationFactsArgs & {
  staffOverrides: unknown
}

export function hasMeaningfulStaffOverrideEntry(override: unknown): boolean {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return false
  const entry = override as Record<string, unknown>

  if (entry.leaveType !== undefined) return true
  if (typeof entry.fteRemaining === 'number') return true
  if (typeof entry.fteSubtraction === 'number') return true
  if (entry.invalidSlot != null) return true
  if (Array.isArray(entry.invalidSlots) && entry.invalidSlots.length > 0) return true
  if (Array.isArray(entry.availableSlots)) return true

  return false
}

export function hasMeaningfulStep1Overrides(staffOverrides: unknown): boolean {
  if (!staffOverrides || typeof staffOverrides !== 'object' || Array.isArray(staffOverrides)) return false

  const overridesRecord = staffOverrides as Record<string, unknown>
  const statusOverrides = overridesRecord.__staffStatusOverrides
  if (statusOverrides && typeof statusOverrides === 'object' && !Array.isArray(statusOverrides)) {
    if (Object.keys(statusOverrides as Record<string, unknown>).length > 0) return true
  }

  return Object.entries(overridesRecord).some(([key, value]) => {
    if (!key || key.startsWith('__')) return false
    return hasMeaningfulStaffOverrideEntry(value)
  })
}

export function hasAnyAllocationFacts(args: AllocationFactsArgs): boolean {
  return Boolean(args.hasTherapistAllocations || args.hasPCAAllocations || args.hasBedAllocations)
}

export function classifyScheduleMeaning(args: ScheduleMeaningArgs): 'allocations' | 'step1' | 'empty' {
  if (hasAnyAllocationFacts(args)) return 'allocations'
  if (hasMeaningfulStep1Overrides(args.staffOverrides)) return 'step1'
  return 'empty'
}

export function hasAnyStaffOverrideKey(staffOverrides: unknown): boolean {
  return hasMeaningfulStep1Overrides(staffOverrides)
}

