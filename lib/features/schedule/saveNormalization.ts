import type { Team } from '@/types/staff'
import type { BedAllocation, PCAAllocation, TherapistAllocation } from '@/types/schedule'
import { stripExtraCoverageOverrides } from '@/lib/features/schedule/extraCoverageVisibility'

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
  const persistBedData = persistPcaData && args.stepStatus['bed-relieving'] !== 'pending'

  return {
    persistTherapistData,
    persistPcaData,
    persistBedData,
    staffOverrides: stripExtraCoverageOverrides(args.staffOverrides),
    therapistAllocations: persistTherapistData
      ? args.therapistAllocations
      : emptyTeamRecord<(TherapistAllocation & { staff: any })[]>([]),
    pcaAllocations: persistPcaData
      ? args.pcaAllocations
      : emptyTeamRecord<(PCAAllocation & { staff: any })[]>([]),
    bedAllocations: persistBedData ? args.bedAllocations : [],
  }
}
