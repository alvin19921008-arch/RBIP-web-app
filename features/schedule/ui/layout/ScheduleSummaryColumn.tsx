'use client'

import type { Team, Weekday, Staff } from '@/types/staff'
import type { PCAAllocation, ScheduleCalculations, TherapistAllocation } from '@/types/schedule'
import type { SPTAllocation } from '@/types/allocation'
import { SummaryColumn } from '@/components/allocation/SummaryColumn'
import { TEAMS } from '@/lib/features/schedule/constants'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import type {
  BedCountsOverridesByTeam,
  ScheduleWardRow,
  StaffOverrideState,
} from '@/lib/features/schedule/controller/scheduleControllerTypes'

export type ScheduleSummaryColumnProps = {
  wards: ScheduleWardRow[]
  bedCountsOverridesByTeam: BedCountsOverridesByTeam
  calculations: Record<Team, ScheduleCalculations | null>
  sptAllocations: SPTAllocation[]
  currentWeekday: Weekday
  therapistAllocations: Record<Team, (TherapistAllocation & { staff?: Staff })[]>
  staffOverrides: Record<string, StaffOverrideState>
  staff: Staff[]
  bufferStaff: Staff[]
  pcaAllocationsForUi: Record<Team, (PCAAllocation & { staff?: Staff })[]>
}

export function ScheduleSummaryColumn({
  wards,
  bedCountsOverridesByTeam,
  calculations,
  sptAllocations,
  currentWeekday,
  therapistAllocations,
  staffOverrides,
  staff,
  bufferStaff,
  pcaAllocationsForUi,
}: ScheduleSummaryColumnProps) {
  const totalBeds = wards.reduce((sum, ward) => sum + ward.total_beds, 0)
  const shsBedsTotal = TEAMS.reduce((sum, team) => {
    const o = bedCountsOverridesByTeam?.[team]
    const shs = typeof o?.shsBedCounts === 'number' ? o.shsBedCounts : 0
    return sum + shs
  }, 0)
  const studentBedsTotal = TEAMS.reduce((sum, team) => {
    const o = bedCountsOverridesByTeam?.[team]
    const students =
      typeof o?.studentPlacementBedCounts === 'number' ? o.studentPlacementBedCounts : 0
    return sum + students
  }, 0)
  const hasShsOrStudents = TEAMS.some(team => {
    const o = bedCountsOverridesByTeam?.[team]
    const shs = typeof o?.shsBedCounts === 'number' ? o.shsBedCounts : 0
    const students =
      typeof o?.studentPlacementBedCounts === 'number' ? o.studentPlacementBedCounts : 0
    return shs > 0 || students > 0
  })
  const totalBedsAfterDeductions = hasShsOrStudents
    ? (() => {
        const raw = TEAMS.reduce((sum, team) => {
          const designated = calculations[team]?.total_beds_designated
          return sum + (typeof designated === 'number' ? designated : 0)
        }, 0)
        // If calculations aren't ready yet, don't show a misleading 0.
        return raw > 0 ? raw : totalBeds
      })()
    : undefined

  const normalizeLeaveType = (v: unknown): string => {
    return typeof v === 'string' ? v.trim().toLowerCase() : ''
  }
  const isSickLeaveType = (v: unknown): boolean => {
    const s = normalizeLeaveType(v)
    return s === 'sick leave' || s === 'sl' || s === 'sick'
  }

  // PT totals + leave counts:
  // - SPT should only count on configured weekdays, using spt_allocations.fte_addon.
  // - Leave cost totals should sum "FTE cost due to leave" (NOT headcount) and should NOT round up.
  const therapistRanks = ['SPT', 'APPT', 'RPT'] as const
  const sptConfiguredFteByStaffId = new Map<string, number>()
  for (const a of sptAllocations) {
    if (!a?.staff_id) continue
    if (!a.weekdays?.includes(currentWeekday)) continue
    const raw = a.fte_addon
    const fte = typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
    if (!Number.isFinite(fte)) continue
    sptConfiguredFteByStaffId.set(a.staff_id, Math.max(0, Math.min(fte, 1.0)))
  }

  let totalPTOnDutyRegular = 0
  let totalPTOnDutyBuffer = 0
  const therapistLeaveTypeById = new Map<string, unknown>()
  const therapistAllocatedFteById = new Map<string, number>()
  const therapistStaffById = new Map<string, Staff>()

  for (const team of TEAMS) {
    for (const alloc of therapistAllocations[team] || []) {
      const s = alloc.staff
      if (!s || !therapistRanks.includes(s.rank as (typeof therapistRanks)[number])) continue

      const fte = typeof alloc.fte_therapist === 'number' ? alloc.fte_therapist : 0
      const isBuffer = s.status === 'buffer'
      if (isBuffer) totalPTOnDutyBuffer += fte
      else totalPTOnDutyRegular += fte

      therapistStaffById.set(s.id, s)
      therapistAllocatedFteById.set(s.id, (therapistAllocatedFteById.get(s.id) ?? 0) + fte)

      // Leave tracking: only if this staff is expected to work today.
      const expectedBase =
        s.rank === 'SPT'
          ? (sptConfiguredFteByStaffId.get(s.id) ?? 0)
          : isBuffer && typeof s.buffer_fte === 'number'
            ? s.buffer_fte
            : 1.0
      if (expectedBase <= 0.0001) continue

      const o = staffOverrides[s.id]
      const effectiveLeaveType = o?.leaveType ?? alloc.leave_type
      if (isOnDutyLeaveType(effectiveLeaveType)) continue
      // Deduplicate by staff id (SPT may appear across multiple teams).
      if (!therapistLeaveTypeById.has(s.id)) therapistLeaveTypeById.set(s.id, effectiveLeaveType)
    }
  }

  // Also include therapist overrides with leaveType set even if not present in allocations,
  // but ONLY when expected to work today (SPT weekday-configured; others default to 1.0).
  for (const [staffId, o] of Object.entries(staffOverrides)) {
    const override = o
    const lt = override?.leaveType
    if (isOnDutyLeaveType(lt)) continue
    const s = staff.find(x => x.id === staffId) || bufferStaff.find(x => x.id === staffId)
    if (!s || !therapistRanks.includes(s.rank as (typeof therapistRanks)[number])) continue
    therapistStaffById.set(s.id, s)
    const expectedBase =
      s.rank === 'SPT'
        ? (sptConfiguredFteByStaffId.get(s.id) ?? 0)
        : s.status === 'buffer' && typeof s.buffer_fte === 'number'
          ? s.buffer_fte
          : 1.0
    if (expectedBase <= 0.0001) continue
    if (!therapistLeaveTypeById.has(s.id)) therapistLeaveTypeById.set(s.id, lt)
  }

  let totalPTLeaveFteCost = 0
  let totalPTSickLeaveFteCost = 0
  for (const [staffId, leaveType] of therapistLeaveTypeById.entries()) {
    const s = therapistStaffById.get(staffId)
    if (!s) continue
    const expectedBase =
      s.rank === 'SPT'
        ? (sptConfiguredFteByStaffId.get(staffId) ?? 0)
        : s.status === 'buffer' && typeof s.buffer_fte === 'number'
          ? s.buffer_fte
          : 1.0
    if (expectedBase <= 0.0001) continue

    const o = staffOverrides[staffId]
    const remaining =
      typeof o?.fteRemaining === 'number'
        ? o.fteRemaining
        : (therapistAllocatedFteById.get(staffId) ?? expectedBase)
    const costFromOverride =
      typeof o?.fteSubtraction === 'number' ? o.fteSubtraction : (expectedBase - remaining)
    const cost = Math.max(0, Math.min(expectedBase, costFromOverride))

    if (isSickLeaveType(leaveType)) totalPTSickLeaveFteCost += cost
    else totalPTLeaveFteCost += cost
  }

  const totalPT = totalPTOnDutyRegular + totalPTOnDutyBuffer

  // Total PCA-FTE across all teams BEFORE any allocations:
  // only considers leave cost (fteSubtraction / fteRemaining) and buffer base FTE.
  const allPCAStaffForSummary = [...staff.filter(s => s.rank === 'PCA'), ...bufferStaff.filter(s => s.rank === 'PCA')]
  const pcaLeaveTypeById = new Map<string, unknown>()
  const pcaAllocatedFteById = new Map<string, number>()
  const pcaStaffById = new Map<string, Staff>()
  for (const team of TEAMS) {
    for (const alloc of pcaAllocationsForUi[team] || []) {
      const staffId = alloc.staff_id
      if (!staffId) continue
      const s = alloc.staff
      if (s) pcaStaffById.set(staffId, s)
      const fte =
        typeof alloc.fte_pca === 'number'
          ? alloc.fte_pca
          : typeof alloc.fte_remaining === 'number'
            ? alloc.fte_remaining
            : 0
      pcaAllocatedFteById.set(staffId, (pcaAllocatedFteById.get(staffId) ?? 0) + fte)
      const o = staffOverrides[staffId]
      const leaveType = o?.leaveType ?? alloc.leave_type
      if (isOnDutyLeaveType(leaveType)) continue
      if (!pcaLeaveTypeById.has(staffId)) pcaLeaveTypeById.set(staffId, leaveType)
    }
  }
  for (const [staffId, o] of Object.entries(staffOverrides)) {
    const override = o
    if (isOnDutyLeaveType(override?.leaveType)) continue
    const s = staff.find(x => x.id === staffId) || bufferStaff.find(x => x.id === staffId)
    if (!s || s.rank !== 'PCA') continue
    pcaStaffById.set(staffId, s)
    if (!pcaLeaveTypeById.has(staffId)) pcaLeaveTypeById.set(staffId, override.leaveType)
  }

  let totalPCALeaveFteCost = 0
  let totalPCASickLeaveFteCost = 0
  for (const [staffId, leaveType] of pcaLeaveTypeById.entries()) {
    const s = pcaStaffById.get(staffId)
    const isBuffer = s?.status === 'buffer'
    const baseFTE = isBuffer && typeof s?.buffer_fte === 'number' ? s.buffer_fte : 1.0

    const o = staffOverrides[staffId]
    const remaining =
      typeof o?.fteRemaining === 'number' ? o.fteRemaining : (pcaAllocatedFteById.get(staffId) ?? baseFTE)
    const costFromOverride =
      typeof o?.fteSubtraction === 'number' ? o.fteSubtraction : (baseFTE - remaining)
    const cost = Math.max(0, Math.min(baseFTE, costFromOverride))

    if (isSickLeaveType(leaveType)) totalPCASickLeaveFteCost += cost
    else totalPCALeaveFteCost += cost
  }
  const totalPCAOnDutyRegular = allPCAStaffForSummary
    .filter(s => s.status !== 'buffer')
    .reduce((sum, s) => {
      const o = staffOverrides[s.id]
      const baseFTE = 1.0

      const remaining =
        typeof o?.fteSubtraction === 'number'
          ? Math.max(0, Math.min(baseFTE, baseFTE - o.fteSubtraction))
          : typeof o?.fteRemaining === 'number'
            ? Math.max(0, Math.min(baseFTE, o.fteRemaining))
            : baseFTE

      return sum + remaining
    }, 0)

  const totalPCAOnDutyBuffer = allPCAStaffForSummary
    .filter(s => s.status === 'buffer')
    .reduce((sum, s) => {
      const o = staffOverrides[s.id]
      const baseFTE = typeof s.buffer_fte === 'number' ? s.buffer_fte : 1.0

      const remaining =
        typeof o?.fteSubtraction === 'number'
          ? Math.max(0, Math.min(baseFTE, baseFTE - o.fteSubtraction))
          : typeof o?.fteRemaining === 'number'
            ? Math.max(0, Math.min(baseFTE, o.fteRemaining))
            : baseFTE

      return sum + remaining
    }, 0)

  const totalPCAOnDuty = totalPCAOnDutyRegular
  const totalPCABufferOnDuty = totalPCAOnDutyBuffer
  const bedsPerPT = totalPT > 0 ? totalBeds / totalPT : 0

  return (
    <SummaryColumn
      totalBeds={totalBeds}
      totalBedsAfterDeductions={totalBedsAfterDeductions}
      totalShsBeds={shsBedsTotal}
      totalStudentBeds={studentBedsTotal}
      totalPTOnDuty={totalPTOnDutyRegular}
      totalPTBufferOnDuty={totalPTOnDutyBuffer}
      totalPTLeaveFteCost={totalPTLeaveFteCost}
      totalPTSickLeaveFteCost={totalPTSickLeaveFteCost}
      totalPCAOnDuty={totalPCAOnDuty}
      totalPCABufferOnDuty={totalPCABufferOnDuty}
      totalPCALeaveFteCost={totalPCALeaveFteCost}
      totalPCASickLeaveFteCost={totalPCASickLeaveFteCost}
      bedsPerPT={bedsPerPT}
    />
  )
}
