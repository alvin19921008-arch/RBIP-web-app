import type { PCAAllocation } from '@/types/schedule'
import type { Staff } from '@/types/staff'
import { buildStep2SubstitutionDisplayOverrides } from '@/lib/features/schedule/substitutionDisplayPersistence'

type SelectionEntry = {
  floatingPCAId?: string
  slots?: number[]
}

export function buildAuthoritativeStep2SubstitutionOverrides(args: {
  baseOverrides: Record<string, any>
  staff: Staff[]
  allocations: PCAAllocation[]
  resolvedSelections?: Record<string, SelectionEntry[]>
}): Record<string, any> {
  return buildStep2SubstitutionDisplayOverrides({
    baseOverrides: args.baseOverrides,
    resolvedSelections: args.resolvedSelections,
    staff: args.staff,
    allocations: args.allocations,
  })
}
