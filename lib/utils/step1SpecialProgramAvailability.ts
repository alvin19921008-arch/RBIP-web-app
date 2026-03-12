import { formatTimeRange, getSlotTime } from '@/lib/utils/slotHelpers'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { getPrimaryConfiguredTherapistForWeekday } from '@/lib/utils/specialProgramConfigRows'
import type { SpecialProgram } from '@/types/allocation'
import type { LeaveType, Staff, StaffRank, Weekday } from '@/types/staff'

type TherapistLookup = Pick<Staff, 'id' | 'rank' | 'team'>

export type Step1TherapistSpecialProgramInfo = {
  programId: string
  programName: string
  slotLabel: string
}

export type TherapistSpecialProgramUiState = {
  info: Step1TherapistSpecialProgramInfo | null
  showToggle: boolean
}

function getPrimarySlotLabel(slots: number[] | undefined): string {
  const firstSlot = Array.isArray(slots) ? slots.find((slot) => [1, 2, 3, 4].includes(slot)) : undefined
  if (!firstSlot) return '0900-1030'
  return formatTimeRange(getSlotTime(firstSlot as 1 | 2 | 3 | 4))
}

function isFullDayLeaveType(leaveType: LeaveType | null | undefined): boolean {
  if (!leaveType) return false
  return ['VL', 'TIL', 'SDO', 'sick leave'].includes(leaveType)
}

export function getStep1TherapistSpecialProgramInfo(args: {
  member: Pick<Staff, 'id' | 'rank'>
  allStaff: TherapistLookup[]
  specialPrograms: SpecialProgram[]
  weekday: Weekday
}): Step1TherapistSpecialProgramInfo | null {
  const { member, allStaff, specialPrograms, weekday } = args
  if (!['SPT', 'APPT', 'RPT'].includes(member.rank)) return null

  for (const program of specialPrograms) {
    if (program.name === 'DRO') continue
    if (!program.weekdays.includes(weekday)) continue
    const configured = getPrimaryConfiguredTherapistForWeekday({
      program,
      day: weekday,
      allStaff,
    })
    if (!configured || configured.staffId !== member.id) continue
    return {
      programId: program.id,
      programName: program.name,
      slotLabel: getPrimarySlotLabel(configured.slots),
    }
  }

  return null
}

export function shouldShowStep1SpecialProgramAvailabilityToggle(args: {
  rank: StaffRank
  hasSpecialProgramToday: boolean
  leaveType: LeaveType | null | undefined
  fteRemaining: number
  fteSubtraction: number
}): boolean {
  const { rank, hasSpecialProgramToday, leaveType, fteRemaining, fteSubtraction } = args
  if (!hasSpecialProgramToday) return false
  if (isOnDutyLeaveType(leaveType)) return false

  if (rank === 'SPT') {
    if (isFullDayLeaveType(leaveType)) return false
    return true
  }

  return fteSubtraction > 0 && fteRemaining > 0
}

export function normalizeStep1SpecialProgramAvailabilityForSave(args: {
  hasSpecialProgramToday: boolean
  shouldShowToggle: boolean
  selected: boolean | undefined
}): boolean | undefined {
  const { hasSpecialProgramToday, shouldShowToggle, selected } = args
  if (!hasSpecialProgramToday) return undefined
  if (!shouldShowToggle) return undefined
  return selected === true
}

export function getTherapistSpecialProgramUiState(args: {
  member: Pick<Staff, 'id' | 'rank'>
  allStaff: TherapistLookup[]
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  leaveType: LeaveType | null | undefined
  fteRemaining: number
  fteSubtraction: number
}): TherapistSpecialProgramUiState {
  const info = getStep1TherapistSpecialProgramInfo({
    member: args.member,
    allStaff: args.allStaff,
    specialPrograms: args.specialPrograms,
    weekday: args.weekday,
  })

  return {
    info,
    showToggle: shouldShowStep1SpecialProgramAvailabilityToggle({
      rank: args.member.rank,
      hasSpecialProgramToday: info !== null,
      leaveType: args.leaveType,
      fteRemaining: args.fteRemaining,
      fteSubtraction: args.fteSubtraction,
    }),
  }
}
