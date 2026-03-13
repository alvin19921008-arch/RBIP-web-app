import { getWeekday } from '@/lib/features/schedule/date'
import { buildStaffRuntimeById, type StaffRuntimeOverrideLike } from '@/lib/utils/staffRuntimeProjection'
import { buildReservationRuntimeProgramsById } from '@/lib/utils/scheduleReservationRuntime'
import type { StaffData } from '@/lib/algorithms/therapistAllocation'
import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import type { SpecialProgram } from '@/types/allocation'
import type { Staff, Team, Weekday } from '@/types/staff'

export type ScheduleRuntimeProjection = {
  date: Date
  weekday: Weekday
  staff: Staff[]
  staffOverrides: Record<string, StaffRuntimeOverrideLike | undefined>
  staffById: ReturnType<typeof buildStaffRuntimeById>
}

export function buildScheduleRuntimeProjection(args: {
  selectedDate: Date
  staff: Staff[]
  staffOverrides: Record<string, StaffRuntimeOverrideLike | undefined>
  replacedNonFloatingIds?: Set<string>
  excludeSubstitutionSlotsForFloating?: boolean
  clampBufferFteRemaining?: boolean
}): ScheduleRuntimeProjection {
  return {
    date: args.selectedDate,
    weekday: getWeekday(args.selectedDate),
    staff: args.staff,
    staffOverrides: args.staffOverrides,
    staffById: buildStaffRuntimeById({
      staff: args.staff,
      staffOverrides: args.staffOverrides,
      replacedNonFloatingIds: args.replacedNonFloatingIds,
      excludeSubstitutionSlotsForFloating: args.excludeSubstitutionSlotsForFloating,
      clampBufferFteRemaining: args.clampBufferFteRemaining,
    }),
  }
}

export function buildTherapistAllocatorView(args: {
  projection: ScheduleRuntimeProjection
  sptWeekdayByStaffId: Record<string, { baseFte?: number }>
}): StaffData[] {
  const { projection, sptWeekdayByStaffId } = args
  return projection.staff.map((member) => {
    const runtime = projection.staffById[member.id]
    const override = projection.staffOverrides[member.id]
    const isBufferStaff = member.status === 'buffer'
    const baseFTE =
      member.rank === 'SPT'
        ? (sptWeekdayByStaffId[member.id]?.baseFte ?? 0)
        : isBufferStaff && (member as any).buffer_fte !== undefined
          ? (member as any).buffer_fte
          : 1.0
    const effectiveFTE = override ? runtime?.fteRemaining ?? baseFTE : baseFTE
    const isOnDuty = runtime?.isOnDuty ?? false
    const isAvailable =
      member.rank === 'SPT'
        ? override
          ? effectiveFTE > 0 || (effectiveFTE === 0 && isOnDuty)
          : effectiveFTE >= 0
        : override
          ? effectiveFTE > 0
          : effectiveFTE > 0

    return {
      id: member.id,
      name: member.name,
      rank: member.rank,
      team: (runtime?.effectiveTeam ?? member.team) as Team | null,
      special_program: (member as any).special_program,
      fte_therapist: effectiveFTE,
      leave_type: runtime?.leaveType ?? null,
      is_available: isAvailable,
      availableSlots: runtime?.availableSlots,
    }
  })
}

export function buildPcaAllocatorView(args: {
  projection: ScheduleRuntimeProjection
  fallbackToBaseTeamWhenEffectiveTeamMissing?: boolean
}): PCAData[] {
  const { projection } = args
  return projection.staff
    .filter((member) => member.rank === 'PCA')
    .map((member) => {
      const runtime = projection.staffById[member.id]
      return {
        id: member.id,
        name: member.name,
        floating: runtime?.floating ?? false,
        special_program: (member as any).special_program,
        team:
          runtime?.effectiveTeam ??
          (args.fallbackToBaseTeamWhenEffectiveTeamMissing ? member.team : null),
        fte_pca: runtime?.fteRemaining ?? 0,
        leave_type: runtime?.leaveType ?? null,
        is_available: runtime?.isAvailable ?? true,
        availableSlots: runtime?.availableSlots,
        invalidSlot: runtime?.effectiveInvalidSlot,
        floor_pca: (member as any).floor_pca || null,
      }
    })
}

export type ScheduleDisplayView = {
  weekday: Weekday
  getProgramsByAllocationTeam: (
    allocationTeam: Team | null | undefined
  ) => ReturnType<typeof buildReservationRuntimeProgramsById>
}

function buildDisplayViewForResolvedWeekday(args: {
  weekday: Weekday
  specialPrograms: SpecialProgram[]
  staffOverrides?: Record<string, unknown>
}): ScheduleDisplayView {
  const weekday = args.weekday
  const cache = new Map<string, ReturnType<typeof buildReservationRuntimeProgramsById>>()
  const getProgramsByAllocationTeam = (allocationTeam: Team | null | undefined) => {
    const cacheKey = allocationTeam ?? '__null__'
    const cached = cache.get(cacheKey)
    if (cached) return cached
    const built = buildReservationRuntimeProgramsById({
      specialPrograms: args.specialPrograms,
      weekday,
      staffOverrides: args.staffOverrides,
      allocationTargetTeam: allocationTeam ?? null,
    })
    cache.set(cacheKey, built)
    return built
  }

  return {
    weekday,
    getProgramsByAllocationTeam,
  }
}

export function buildDisplayView(args: {
  selectedDate: Date
  specialPrograms: SpecialProgram[]
  staffOverrides?: Record<string, unknown>
}): ScheduleDisplayView {
  return buildDisplayViewForResolvedWeekday({
    weekday: getWeekday(args.selectedDate),
    specialPrograms: args.specialPrograms,
    staffOverrides: args.staffOverrides,
  })
}

export function buildDisplayViewForWeekday(args: {
  weekday: Weekday
  specialPrograms: SpecialProgram[]
  staffOverrides?: Record<string, unknown>
}): ScheduleDisplayView {
  return buildDisplayViewForResolvedWeekday(args)
}
