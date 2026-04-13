import type { ExtraCoverageByStaffId } from '@/lib/features/schedule/extraCoverageRuntime'

/**
 * Extra coverage UI: optional Step 3.4 floating slots **after** each team’s floating need is satisfied
 * (`extraCoverageMode: round-robin-team-order`). This path is **independent** of V2 **surplus** grants /
 * surplus-adjusted targets (`realizedSurplusSlotGrantsByTeam`, `v2EnabledBySurplusAdjustedTarget`).
 */

export function shouldShowExtraCoverage(args: {
  currentStep?: string | null
  initializedSteps?: Set<string> | null
}): boolean {
  if (args.initializedSteps?.has('floating-pca')) return true
  return false
}

export function stripExtraCoverageOverrides<T extends Record<string, any>>(staffOverrides: T): T {
  let changed = false
  const next = { ...(staffOverrides ?? {}) } as T
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

  return changed ? next : staffOverrides
}

export function sanitizeExtraCoverageOverrides<T extends Record<string, any>>(args: {
  staffOverrides: T
  currentStep?: string | null
  initializedSteps?: Set<string> | null
}): T {
  if (shouldShowExtraCoverage(args)) return args.staffOverrides
  return stripExtraCoverageOverrides(args.staffOverrides)
}

export function mergeExtraCoverageIntoStaffOverridesForDisplay<T extends Record<string, any>>(args: {
  staffOverrides: T
  extraCoverageByStaffId: ExtraCoverageByStaffId
  currentStep?: string | null
  initializedSteps?: Set<string> | null
}): T {
  const base = stripExtraCoverageOverrides(args.staffOverrides)
  if (!shouldShowExtraCoverage(args)) return base

  const next = { ...base } as T
  Object.entries(args.extraCoverageByStaffId || {}).forEach(([staffId, bySlot]) => {
    if (!bySlot || Object.keys(bySlot).length === 0) return
    ;(next as any)[staffId] = {
      ...((next as any)[staffId] || {}),
      extraCoverageBySlot: bySlot,
    }
  })
  return next
}
