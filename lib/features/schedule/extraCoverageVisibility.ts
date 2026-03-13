export function shouldShowExtraCoverage(args: {
  currentStep?: string | null
  initializedSteps?: Set<string> | null
}): boolean {
  if (args.initializedSteps?.has('floating-pca')) return true
  return false
}

export function sanitizeExtraCoverageOverrides<T extends Record<string, any>>(args: {
  staffOverrides: T
  currentStep?: string | null
  initializedSteps?: Set<string> | null
}): T {
  if (shouldShowExtraCoverage(args)) return args.staffOverrides

  let changed = false
  const next = { ...(args.staffOverrides ?? {}) } as T
  Object.entries(next).forEach(([staffId, override]) => {
    if (!override || typeof override !== 'object' || !('extraCoverageBySlot' in override)) return
    const { extraCoverageBySlot: _extra, ...rest } = override as any
    changed = true
    if (Object.keys(rest).length > 0) {
      ;(next as any)[staffId] = rest
    } else {
      delete (next as any)[staffId]
    }
  })

  return changed ? next : args.staffOverrides
}
