import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'
import { getSpecialProgramNameBySlotForAllocation } from '@/lib/utils/specialProgramExport'
import { derivePcaSubstitutionInfo } from '@/lib/features/schedule/pcaSubstitutionDisplay'

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
type Slot = 1 | 2 | 3 | 4

export type PcaDisplaySlotFlags = {
  team: Team | null
  programName: string | null
  isSpecialProgram: boolean
  isSubstitution: boolean
  isExtraCoverage: boolean
}

export type PcaDisplayFlagsBySlot = Record<Slot, PcaDisplaySlotFlags>

function getSlotTeam(allocation: PCAAllocation, slot: Slot): Team | null {
  if (slot === 1) return (allocation as any).slot1 ?? null
  if (slot === 2) return (allocation as any).slot2 ?? null
  if (slot === 3) return (allocation as any).slot3 ?? null
  return (allocation as any).slot4 ?? null
}

export function derivePcaDisplayFlagsBySlot(args: {
  allocation: PCAAllocation & { staff?: Staff }
  staffOverrides: Record<string, any>
  allPCAStaff: Staff[]
  specialPrograms: SpecialProgram[]
  weekday?: Weekday
  showExtraCoverageStyling: boolean
}): PcaDisplayFlagsBySlot {
  const {
    allocation,
    staffOverrides,
    allPCAStaff,
    specialPrograms,
    weekday,
    showExtraCoverageStyling,
  } = args
  const staffId = (allocation as any)?.staff_id as string
  const override = (staffOverrides && staffId ? staffOverrides[staffId] : undefined) || {}

  const programNameBySlot = weekday
    ? getSpecialProgramNameBySlotForAllocation({
        allocation,
        specialPrograms: specialPrograms || [],
        weekday,
        staffOverrides,
      })
    : {}

  const substitutionSlotsByTeam = new Map<Team, Set<number>>()
  const isFloating = !!(allocation as any)?.staff?.floating
  if (isFloating) {
    const teamsInSlots = new Set<Team>()
    ;([1, 2, 3, 4] as const).forEach((slot) => {
      const team = getSlotTeam(allocation, slot)
      if (team) teamsInSlots.add(team)
    })

    teamsInSlots.forEach((team) => {
      const substitutionInfo = derivePcaSubstitutionInfo({
        team,
        floatingAlloc: allocation as any,
        staffOverrides: staffOverrides || {},
        allPCAStaff: allPCAStaff || [],
      })
      substitutionSlotsByTeam.set(team, new Set(substitutionInfo.substitutedSlots || []))
    })
  }

  const result = {
    1: {
      team: null,
      programName: null,
      isSpecialProgram: false,
      isSubstitution: false,
      isExtraCoverage: false,
    },
    2: {
      team: null,
      programName: null,
      isSpecialProgram: false,
      isSubstitution: false,
      isExtraCoverage: false,
    },
    3: {
      team: null,
      programName: null,
      isSpecialProgram: false,
      isSubstitution: false,
      isExtraCoverage: false,
    },
    4: {
      team: null,
      programName: null,
      isSpecialProgram: false,
      isSubstitution: false,
      isExtraCoverage: false,
    },
  } as PcaDisplayFlagsBySlot

  ;([1, 2, 3, 4] as const).forEach((slot) => {
    const team = getSlotTeam(allocation, slot)
    const programName = (programNameBySlot as any)?.[slot] ?? null
    const isSpecialProgram = !!programName
    const substitutedInTeam = team ? substitutionSlotsByTeam.get(team)?.has(slot) ?? false : false
    const isSubstitution = isSpecialProgram ? false : substitutedInTeam
    const isExtraCoverage = showExtraCoverageStyling && !!(override?.extraCoverageBySlot?.[slot] ?? false)

    result[slot] = {
      team,
      programName,
      isSpecialProgram,
      isSubstitution,
      isExtraCoverage,
    }
  })

  return result
}
