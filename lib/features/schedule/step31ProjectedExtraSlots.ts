import type { Step31ExtraAfterNeedsBudget } from '@/lib/features/schedule/step3ExtraAfterNeedsBudget'

export function countProjectedExtraSlots(
  extraCoverageByStaffId?: Record<string, Array<1 | 2 | 3 | 4>>
): number {
  return Object.values(extraCoverageByStaffId || {}).reduce((sum, slots) => sum + (slots?.length || 0), 0)
}

export function buildProjectedExtraSlotsTooltipLines(args: {
  neededSlots: number
  availableSlots: number
}): [string, string] {
  return [
    `Floating slots still needed after Step 2: ${args.neededSlots}`,
    `Floating PCA available slots pool: ${args.availableSlots}`,
  ]
}

export function buildStep31PreviewExtraCoverageOptions<T extends object>(
  args: T
): T & { extraCoverageMode: 'round-robin-team-order' } {
  return {
    ...args,
    extraCoverageMode: 'round-robin-team-order' as const,
  } as T & { extraCoverageMode: 'round-robin-team-order' }
}

/** Spec default line when `extraBudgetSlots > 0` (Step 3.1 anticipation). */
export function formatStep31LikelyExtrasPreviewPlain(extraBudgetSlots: number): string {
  const slotLabel = extraBudgetSlots === 1 ? 'slot' : 'slots'
  return `Likely extras: up to ${extraBudgetSlots} optional ${slotLabel} in Step 3.4 after needs are met (Extra after needs).`
}

function fmtBal(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
}

/** Copy for Step 3.1 “Show how we estimate this” disclosure (matches design spec blocks). */
export function buildStep31BudgetDisclosureParts(budget: Step31ExtraAfterNeedsBudget): {
  supplyLines: string[]
  demandSummaryLine: string
  demandPerTeamLine: string
  demandLegend: string
  recipientLines: string[]
} {
  const s = budget.balanceSummary
  const demandSummaryLine = `All teams (aggregate): Over-assigned: ${s.overAssignedSum.toFixed(2)} | Under-assigned: ${s.underAssignedSum.toFixed(2)} | Net: ${s.net.toFixed(2)}`
  const supplyLines = [
    `Available floating slots: ${budget.availableFloatingSlots}`,
    `Needed slots (pending): ${budget.neededSlots}`,
    `Pool spare slots: ${budget.availableFloatingSlots} − ${budget.neededSlots} = ${budget.poolSpareSlots}`,
  ]
  const demandPerTeamLine = `Team balances (after rounded needs): ${s.perTeamText}`
  const demandLegend = '(+ = over-assigned, − = under-assigned)'
  const recipientLines = budget.recipientsPreview.map((row) => {
    return `${row.team}: ${fmtBal(row.before)} → ${fmtBal(row.after)} after 1 extra slot`
  })
  return {
    supplyLines,
    demandSummaryLine,
    demandPerTeamLine,
    demandLegend,
    recipientLines,
  }
}
