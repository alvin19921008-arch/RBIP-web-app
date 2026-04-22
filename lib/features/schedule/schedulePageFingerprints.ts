import type { Team, Staff } from '@/types/staff'
import type { PCAAllocation, TherapistAllocation } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import type { Step3BootstrapSummary, Step3ProjectionV2 } from '@/lib/features/schedule/step3Bootstrap'
import type { Step2ResultSurplusProjection as Step2ResultSurplusProjectionDomain } from '@/lib/features/schedule/controller/scheduleDomainState'
import { createEmptyTeamRecord } from '@/lib/utils/types'
import { TEAMS } from '@/lib/features/schedule/constants'

/** Step 2 surplus + optional Step 3 artifacts for the schedule page (distinct name from `scheduleDomainState`’s `Step2ResultSurplusProjection`). */
export type Step2ResultSurplusProjectionForStep3 = Step2ResultSurplusProjectionDomain & {
  step3FloatingBootstrapSummaryV2?: Step3BootstrapSummary
  step3ProjectionV2?: Step3ProjectionV2
}

export type Step3DependencyFingerprint = {
  teamTargetsByTeam: Record<Team, number>
  existingAssignedByTeam: Record<Team, number>
  reservedSpecialProgramPcaFte: number
  floatingPcas: Array<{
    id: string
    ftePca: number
    availableSlots: number[]
    invalidSlot: 1 | 2 | 3 | 4 | null
    team: Team | null
    floorPca: string[]
  }>
  existingAllocations: Array<{
    staffId: string
    slot1: Team | null
    slot2: Team | null
    slot3: Team | null
    slot4: Team | null
    invalidSlot: 1 | 2 | 3 | 4 | null
    specialProgramIds: string[]
    isFloating: boolean
  }>
}

export function jsonFingerprint(value: unknown): string {
  return JSON.stringify(value)
}

export function buildPtPerTeamFingerprint(args: {
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  teams?: Team[]
}): Record<Team, number> {
  const teams = args.teams ?? TEAMS
  const out = createEmptyTeamRecord<number>(0)
  teams.forEach((team) => {
    out[team] = Number(
      (args.therapistAllocations[team] || [])
        .reduce((sum, allocation) => sum + (allocation.fte_therapist ?? 0), 0)
        .toFixed(2)
    )
  })
  return out
}

export function buildStep3DependencyFingerprint(args: {
  visibleTeams: Team[]
  teamTargetsByTeam: Record<Team, number>
  existingAssignedByTeam: Record<Team, number>
  reservedSpecialProgramPcaFte: number
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffById: Map<string, Staff>
}): Step3DependencyFingerprint {
  const teamTargetsByTeam = createEmptyTeamRecord<number>(0)
  const existingAssignedByTeam = createEmptyTeamRecord<number>(0)
  for (const team of args.visibleTeams) {
    teamTargetsByTeam[team] = Number((args.teamTargetsByTeam[team] ?? 0).toFixed(2))
    existingAssignedByTeam[team] = Number((args.existingAssignedByTeam[team] ?? 0).toFixed(2))
  }

  return {
    teamTargetsByTeam,
    existingAssignedByTeam,
    reservedSpecialProgramPcaFte: Number(args.reservedSpecialProgramPcaFte.toFixed(2)),
    floatingPcas: [...args.floatingPCAs]
      .map((pca) => ({
        id: pca.id,
        ftePca: Number((pca.fte_pca ?? 0).toFixed(2)),
        availableSlots: [...(Array.isArray(pca.availableSlots) ? pca.availableSlots : [1, 2, 3, 4])].sort((a, b) => a - b),
        invalidSlot:
          pca.invalidSlot === 1 || pca.invalidSlot === 2 || pca.invalidSlot === 3 || pca.invalidSlot === 4
            ? (pca.invalidSlot as 1 | 2 | 3 | 4)
            : null,
        team: (pca.team as Team | null) ?? null,
        floorPca: Array.isArray(pca.floor_pca) ? [...pca.floor_pca].sort() : [],
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    existingAllocations: [...args.existingAllocations]
      .map((allocation) => ({
        staffId: allocation.staff_id,
        slot1: (allocation.slot1 as Team | null) ?? null,
        slot2: (allocation.slot2 as Team | null) ?? null,
        slot3: (allocation.slot3 as Team | null) ?? null,
        slot4: (allocation.slot4 as Team | null) ?? null,
        invalidSlot:
          (allocation as any).invalid_slot === 1 ||
          (allocation as any).invalid_slot === 2 ||
          (allocation as any).invalid_slot === 3 ||
          (allocation as any).invalid_slot === 4
            ? ((allocation as any).invalid_slot as 1 | 2 | 3 | 4)
            : null,
        specialProgramIds: Array.isArray((allocation as any).special_program_ids)
          ? [...((allocation as any).special_program_ids as string[])].sort()
          : [],
        isFloating: !!args.staffById.get(allocation.staff_id)?.floating,
      }))
      .sort((a, b) => a.staffId.localeCompare(b.staffId)),
  }
}
