import type { Team } from '@/types/staff'
import type { BedAllocation, PCAAllocation, TherapistAllocation } from '@/types/schedule'

type StepState = 'pending' | 'completed' | 'modified'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return {
    FO: value,
    SMM: value,
    SFM: value,
    CPPC: value,
    MC: value,
    GMC: value,
    NSM: value,
    DRO: value,
  }
}

function stripExtraCoverageOverrides(overrides: Record<string, any>): Record<string, any> {
  const next = { ...(overrides ?? {}) }
  Object.entries(next).forEach(([staffId, override]) => {
    if (!override || typeof override !== 'object' || !('extraCoverageBySlot' in override)) return
    const { extraCoverageBySlot: _extra, ...rest } = override as any
    if (Object.keys(rest).length > 0) next[staffId] = rest
    else delete next[staffId]
  })
  return next
}

export function normalizeScheduleStateForSave(args: {
  stepStatus: Record<string, StepState | undefined>
  staffOverrides: Record<string, any>
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: any })[]>
  pcaAllocations: Record<Team, (PCAAllocation & { staff: any })[]>
  bedAllocations: BedAllocation[]
}): {
  persistTherapistData: boolean
  persistPcaData: boolean
  persistBedData: boolean
  staffOverrides: Record<string, any>
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: any })[]>
  pcaAllocations: Record<Team, (PCAAllocation & { staff: any })[]>
  bedAllocations: BedAllocation[]
} {
  const persistTherapistData = true
  const persistPcaData = args.stepStatus['therapist-pca'] !== 'pending'
  const persistFloatingData = args.stepStatus['floating-pca'] !== 'pending'
  const persistBedData = persistPcaData && args.stepStatus['bed-relieving'] !== 'pending'

  return {
    persistTherapistData,
    persistPcaData,
    persistBedData,
    staffOverrides: persistFloatingData ? args.staffOverrides : stripExtraCoverageOverrides(args.staffOverrides),
    therapistAllocations: persistTherapistData
      ? args.therapistAllocations
      : emptyTeamRecord<(TherapistAllocation & { staff: any })[]>([]),
    pcaAllocations: persistPcaData
      ? args.pcaAllocations
      : emptyTeamRecord<(PCAAllocation & { staff: any })[]>([]),
    bedAllocations: persistBedData ? args.bedAllocations : [],
  }
}
