export function hasAnyStaffOverrideKey(staffOverrides: unknown): boolean {
  if (!staffOverrides || typeof staffOverrides !== 'object' || Array.isArray(staffOverrides)) return false
  return Object.keys(staffOverrides as Record<string, unknown>).some((key) => key !== '' && !key.startsWith('__'))
}

