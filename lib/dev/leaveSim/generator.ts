import type { Staff } from '@/types/staff'
import type { Weekday } from '@/types/staff'
import type { SpecialProgram, SPTAllocation } from '@/types/allocation'
import { roundToNearestQuarter } from '@/lib/utils/rounding'
import { createRng, pickWeighted, randChoice, randInt } from '@/lib/dev/leaveSim/rng'
import {
  ALL_SLOTS,
  clampNumber,
  type DevLeaveSimConfig,
  type DevLeaveSimDraft,
  type DevLeaveSimLeaveBucket,
  type DevLeaveSimPcaHalfDaySlotMode,
  type DevLeaveSimPcaNonFloatingTargeting,
  type DevLeaveSimRank,
  type DevLeaveSimRankWeights,
  type DevLeaveSimSpecialProgramTargeting,
  type DevLeaveSimStaffPatch,
  isValidSlot,
} from '@/lib/dev/leaveSim/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isActiveSpecialProgramForStaff(args: {
  staffId: string
  weekday: Weekday
  specialPrograms: SpecialProgram[]
}): boolean {
  const { staffId, weekday, specialPrograms } = args
  return (specialPrograms || []).some((p: any) => {
    if (!p) return false
    if (p.name === 'DRM') return false
    if (!Array.isArray(p.weekdays) || !p.weekdays.includes(weekday)) return false
    const ids: any = (p as any).staff_ids
    return Array.isArray(ids) && ids.includes(staffId)
  })
}

function isSptScheduledOnDay(args: { staffId: string; weekday: Weekday; sptAllocations: SPTAllocation[] }): boolean {
  const row = (args.sptAllocations || []).find((a: any) => a?.staff_id === args.staffId)
  if (!row) return false
  if (row.active === false) return false
  const weekdays: any = (row as any).weekdays
  return Array.isArray(weekdays) && weekdays.includes(args.weekday)
}

function filterCandidatesBySpecialProgramMode<T extends Staff>(args: {
  candidates: T[]
  mode: DevLeaveSimSpecialProgramTargeting
  weekday: Weekday
  specialPrograms: SpecialProgram[]
  rng: () => number
}): T[] {
  const { candidates, mode, weekday, specialPrograms, rng } = args
  if (mode === 'pure_random') return candidates

  const withFlag = candidates.map((s) => ({
    s,
    hasSpecial: isActiveSpecialProgramForStaff({ staffId: s.id, weekday, specialPrograms }),
  }))

  if (mode === 'only_special_program') return withFlag.filter((x) => x.hasSpecial).map((x) => x.s)
  if (mode === 'exclude_special_program') return withFlag.filter((x) => !x.hasSpecial).map((x) => x.s)
  if (mode === 'weighted_random') {
    // Keep all candidates, but we will select using weights later. Here we just return all.
    // Selection uses a 3x boost for special-program staff.
    void rng
    return candidates
  }
  return candidates
}

function pickCandidateWithSpecialBias<T extends Staff>(args: {
  rng: () => number
  candidates: T[]
  mode: DevLeaveSimSpecialProgramTargeting
  weekday: Weekday
  specialPrograms: SpecialProgram[]
}): T | undefined {
  const { rng, candidates, mode, weekday, specialPrograms } = args
  if (!candidates || candidates.length === 0) return undefined
  if (mode !== 'weighted_random') return randChoice(rng, candidates)
  return pickWeighted(
    rng,
    candidates.map((s) => ({
      value: s,
      weight: isActiveSpecialProgramForStaff({ staffId: s.id, weekday, specialPrograms }) ? 3 : 1,
    }))
  )
}

function pickPcaCandidate(args: {
  rng: () => number
  candidates: Staff[]
  specialProgramMode: DevLeaveSimSpecialProgramTargeting
  pcaNonFloatingTargeting: DevLeaveSimPcaNonFloatingTargeting
  weekday: Weekday
  specialPrograms: SpecialProgram[]
  warnings: string[]
}): Staff | undefined {
  const { rng, candidates, specialProgramMode, pcaNonFloatingTargeting, weekday, specialPrograms, warnings } = args
  if (!candidates || candidates.length === 0) return undefined

  const filtered =
    pcaNonFloatingTargeting === 'only_non_floating' ? candidates.filter((s) => !(s as any)?.floating) : candidates

  if (filtered.length === 0) {
    warnings.push('PCA targeting is set to only_non_floating but no non-floating PCA candidates are available.')
    return undefined
  }

  const needsWeighted =
    specialProgramMode === 'weighted_random' || pcaNonFloatingTargeting === 'prefer_non_floating'

  if (!needsWeighted) {
    return randChoice(rng, filtered)
  }

  return pickWeighted(
    rng,
    filtered.map((s) => {
      const isSpecial =
        specialProgramMode === 'weighted_random'
          ? isActiveSpecialProgramForStaff({ staffId: s.id, weekday, specialPrograms })
          : false
      const isNonFloating = !(s as any)?.floating
      const wSpecial = isSpecial ? 3 : 1
      const wNonFloating = pcaNonFloatingTargeting === 'prefer_non_floating' && isNonFloating ? 3 : 1
      return { value: s, weight: wSpecial * wNonFloating }
    })
  )
}

function getRankBuckets(args: { staff: Staff[]; weekday: Weekday; sptAllocations: SPTAllocation[] }) {
  const excludedSptNotScheduledIds: string[] = []
  const included: Staff[] = []

  for (const s of args.staff || []) {
    if (!s || typeof s.id !== 'string') continue
    if (s.status === 'inactive') continue
    if (s.rank === 'workman') continue

    if (s.rank === 'SPT') {
      const scheduled = isSptScheduledOnDay({ staffId: s.id, weekday: args.weekday, sptAllocations: args.sptAllocations })
      if (!scheduled) {
        excludedSptNotScheduledIds.push(s.id)
        continue
      }
    }
    included.push(s)
  }

  const therapistsNonSPT = included.filter((s) => s.rank === 'APPT' || s.rank === 'RPT')
  const pcas = included.filter((s) => s.rank === 'PCA')
  const spts = included.filter((s) => s.rank === 'SPT')

  return { therapistsNonSPT, pcas, spts, excludedSptNotScheduledIds }
}

function pickRankByWeights(args: {
  rng: () => number
  weights: DevLeaveSimRankWeights
  availableCounts: Record<DevLeaveSimRank, number>
  mode: 'pool_proportional' | 'custom'
}): DevLeaveSimRank | undefined {
  const { rng, weights, availableCounts, mode } = args
  const computed: Array<{ value: DevLeaveSimRank; weight: number }> = []
  ;(['SPT', 'APPT', 'RPT', 'PCA'] as const).forEach((rank) => {
    const count = availableCounts[rank] ?? 0
    if (count <= 0) return
    const w = mode === 'pool_proportional' ? count : weights[rank]
    computed.push({ value: rank, weight: w })
  })
  return pickWeighted(rng, computed)
}

function getPcaHalfDaySlots(mode: DevLeaveSimPcaHalfDaySlotMode, rng: () => number): number[] {
  const chosen =
    mode === 'random'
      ? (rng() < 0.5 ? 'am' : 'pm')
      : mode
  return chosen === 'am' ? [1, 2] : [3, 4]
}

function slotBounds(slot: 1 | 2 | 3 | 4): { start: string; end: string } {
  // Match PCADedicatedScheduleTable fallback slot bounds.
  if (slot === 1) return { start: '0900', end: '1030' }
  if (slot === 2) return { start: '1030', end: '1200' }
  if (slot === 3) return { start: '1330', end: '1500' }
  return { start: '1500', end: '1630' }
}

function timeToMinutes(hhmm: string): number {
  const h = parseInt(hhmm.slice(0, 2))
  const m = parseInt(hhmm.slice(2))
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
}

function randomPresentIntervalWithinSlot(rng: () => number, slot: 1 | 2 | 3 | 4): { start: string; end: string } {
  const { start, end } = slotBounds(slot)
  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  const total = endMin - startMin
  const steps = Math.floor(total / 15)
  if (steps <= 1) return { start, end }

  const a = randInt(rng, 0, steps - 1)
  const b = randInt(rng, a + 1, steps)
  return { start: minutesToTime(startMin + a * 15), end: minutesToTime(startMin + b * 15) }
}

function pickLeaveTypeWeighted(rng: () => number, weights: Array<{ leaveType: any; weight: number }>): any {
  const chosen = pickWeighted(rng, weights.map((w) => ({ value: w.leaveType, weight: w.weight })))
  return chosen ?? null
}

function addPatch(
  patches: DevLeaveSimStaffPatch[],
  selectedStaffIds: Set<string>,
  patch: DevLeaveSimStaffPatch
) {
  if (selectedStaffIds.has(patch.staffId)) return
  selectedStaffIds.add(patch.staffId)
  patches.push(patch)
}

export function generateDevLeaveSimDraft(args: {
  staff: Staff[]
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  weekday: Weekday
  config: DevLeaveSimConfig
}): DevLeaveSimDraft {
  const rng = createRng(args.config.seed)
  const warnings: string[] = []

  const { therapistsNonSPT, pcas, spts, excludedSptNotScheduledIds } = getRankBuckets({
    staff: args.staff,
    weekday: args.weekday,
    sptAllocations: args.sptAllocations,
  })

  const selectedStaffIds = new Set<string>()
  const patches: DevLeaveSimStaffPatch[] = []

  // --------------------------------------------------------------------------
  // Planned leave
  // --------------------------------------------------------------------------
  const plannedTherapistCount = Math.floor(clampNumber(args.config.plannedTherapistCount, 0, args.config.plannedTherapistMax))
  const plannedTherapistCandidates = filterCandidatesBySpecialProgramMode({
    candidates: therapistsNonSPT,
    mode: args.config.specialProgramTargeting,
    weekday: args.weekday,
    specialPrograms: args.specialPrograms,
    rng,
  })
  for (let i = 0; i < plannedTherapistCount; i++) {
    const pick = pickCandidateWithSpecialBias({
      rng,
      candidates: plannedTherapistCandidates.filter((s) => !selectedStaffIds.has(s.id)),
      mode: args.config.specialProgramTargeting,
      weekday: args.weekday,
      specialPrograms: args.specialPrograms,
    })
    if (!pick) break
    addPatch(patches, selectedStaffIds, {
      staffId: pick.id,
      rank: pick.rank as DevLeaveSimRank,
      bucket: 'planned',
      leaveType: pickLeaveTypeWeighted(rng, args.config.plannedLeaveTypeWeights),
      fteRemaining: 0,
      fteSubtraction: 1.0,
    })
  }

  // Planned PCA leave uses budget in chunks of 1.0 or 0.5.
  let plannedBudget = clampNumber(args.config.plannedPcaFteBudget, 0, args.config.plannedPcaFteBudgetMax)
  plannedBudget = Math.round(plannedBudget * 2) / 2 // snap to 0.5 increments for the harness knob
  const plannedPcaCandidates = filterCandidatesBySpecialProgramMode({
    candidates: pcas,
    mode: args.config.specialProgramTargeting,
    weekday: args.weekday,
    specialPrograms: args.specialPrograms,
    rng,
  })
  while (plannedBudget >= 0.49) {
    const chunk = plannedBudget >= 1 && rng() < 0.55 ? 1.0 : 0.5
    if (chunk > plannedBudget + 1e-6) break
    const pick = pickPcaCandidate({
      rng,
      candidates: plannedPcaCandidates.filter((s) => !selectedStaffIds.has(s.id)),
      specialProgramMode: args.config.specialProgramTargeting,
      pcaNonFloatingTargeting: args.config.pcaNonFloatingTargeting,
      weekday: args.weekday,
      specialPrograms: args.specialPrograms,
      warnings,
    })
    if (!pick) break

    if (chunk >= 0.99) {
      addPatch(patches, selectedStaffIds, {
        staffId: pick.id,
        rank: 'PCA',
        bucket: 'planned',
        leaveType: pickLeaveTypeWeighted(rng, args.config.plannedLeaveTypeWeights),
        fteRemaining: 0,
        fteSubtraction: 1.0,
        availableSlots: [],
        invalidSlots: [],
      })
    } else {
      const slots = getPcaHalfDaySlots(args.config.pcaHalfDaySlotMode, rng)
      addPatch(patches, selectedStaffIds, {
        staffId: pick.id,
        rank: 'PCA',
        bucket: 'planned',
        leaveType: rng() < 0.5 ? 'half day VL' : 'half day TIL',
        fteRemaining: 0.5,
        fteSubtraction: 0.5,
        availableSlots: slots,
        invalidSlots: [],
      })
    }
    plannedBudget = round2(plannedBudget - chunk)
  }

  // --------------------------------------------------------------------------
  // Sick leave
  // --------------------------------------------------------------------------
  const sickCount = Math.floor(clampNumber(args.config.sickCount, 0, 50))
  for (let i = 0; i < sickCount; i++) {
    const availableCounts: Record<DevLeaveSimRank, number> = {
      SPT: spts.filter((s) => !selectedStaffIds.has(s.id)).length,
      APPT: therapistsNonSPT.filter((s) => s.rank === 'APPT' && !selectedStaffIds.has(s.id)).length,
      RPT: therapistsNonSPT.filter((s) => s.rank === 'RPT' && !selectedStaffIds.has(s.id)).length,
      PCA: pcas.filter((s) => !selectedStaffIds.has(s.id)).length,
    }
    const rank = pickRankByWeights({
      rng,
      weights: args.config.rankWeights,
      availableCounts,
      mode: args.config.rankWeightMode,
    })
    if (!rank) break

    const pool =
      rank === 'SPT'
        ? spts
        : rank === 'PCA'
          ? pcas
          : therapistsNonSPT.filter((s) => s.rank === rank)
    const candidates = filterCandidatesBySpecialProgramMode({
      candidates: pool,
      mode: args.config.specialProgramTargeting,
      weekday: args.weekday,
      specialPrograms: args.specialPrograms,
      rng,
    }).filter((s) => !selectedStaffIds.has(s.id))
    const pick =
      rank === 'PCA'
        ? pickPcaCandidate({
            rng,
            candidates,
            specialProgramMode: args.config.specialProgramTargeting,
            pcaNonFloatingTargeting: args.config.pcaNonFloatingTargeting,
            weekday: args.weekday,
            specialPrograms: args.specialPrograms,
            warnings,
          })
        : pickCandidateWithSpecialBias({
            rng,
            candidates,
            mode: args.config.specialProgramTargeting,
            weekday: args.weekday,
            specialPrograms: args.specialPrograms,
          })
    if (!pick) continue

    const isPca = pick.rank === 'PCA'
    addPatch(patches, selectedStaffIds, {
      staffId: pick.id,
      rank: pick.rank as DevLeaveSimRank,
      bucket: 'sick',
      leaveType: 'sick leave',
      fteRemaining: 0,
      fteSubtraction: 1.0,
      availableSlots: isPca ? [] : undefined,
      invalidSlots: isPca ? [] : undefined,
    })
  }

  // --------------------------------------------------------------------------
  // Urgent leave (incl. medical follow-up)
  // --------------------------------------------------------------------------
  const urgentCount = Math.floor(clampNumber(args.config.urgentCount, 0, 50))
  for (let i = 0; i < urgentCount; i++) {
    const availableCounts: Record<DevLeaveSimRank, number> = {
      SPT: spts.filter((s) => !selectedStaffIds.has(s.id)).length,
      APPT: therapistsNonSPT.filter((s) => s.rank === 'APPT' && !selectedStaffIds.has(s.id)).length,
      RPT: therapistsNonSPT.filter((s) => s.rank === 'RPT' && !selectedStaffIds.has(s.id)).length,
      PCA: pcas.filter((s) => !selectedStaffIds.has(s.id)).length,
    }
    const rank = pickRankByWeights({
      rng,
      weights: args.config.rankWeights,
      availableCounts,
      mode: args.config.rankWeightMode,
    })
    if (!rank) break

    const pool =
      rank === 'SPT'
        ? spts
        : rank === 'PCA'
          ? pcas
          : therapistsNonSPT.filter((s) => s.rank === rank)
    const candidates = filterCandidatesBySpecialProgramMode({
      candidates: pool,
      mode: args.config.specialProgramTargeting,
      weekday: args.weekday,
      specialPrograms: args.specialPrograms,
      rng,
    }).filter((s) => !selectedStaffIds.has(s.id))
    const pick =
      rank === 'PCA'
        ? pickPcaCandidate({
            rng,
            candidates,
            specialProgramMode: args.config.specialProgramTargeting,
            pcaNonFloatingTargeting: args.config.pcaNonFloatingTargeting,
            weekday: args.weekday,
            specialPrograms: args.specialPrograms,
            warnings,
          })
        : pickCandidateWithSpecialBias({
            rng,
            candidates,
            mode: args.config.specialProgramTargeting,
            weekday: args.weekday,
            specialPrograms: args.specialPrograms,
          })
    if (!pick) continue

    const leaveType = pickLeaveTypeWeighted(rng, args.config.urgentLeaveTypeWeights) as any
    if (pick.rank !== 'PCA') {
      // Therapist urgent leave: allow arbitrary decimal FTE remaining.
      const remaining = round2(clampNumber(1.0 - (0.05 + rng() * 0.65), 0, 1))
      addPatch(patches, selectedStaffIds, {
        staffId: pick.id,
        rank: pick.rank as DevLeaveSimRank,
        bucket: 'urgent',
        leaveType,
        fteRemaining: remaining,
        fteSubtraction: round2(1.0 - remaining),
      })
      continue
    }

    // PCA urgent leave: allow non-quarter leave cost, but keep slots consistent with rounded FTE.
    const shouldUseInvalidSlot = args.config.pcaUrgentUsesInvalidSlot && rng() < clampNumber(args.config.pcaUrgentInvalidSlotProbability, 0, 1)

    const invalidSlot = shouldUseInvalidSlot ? (randChoice(rng, ALL_SLOTS) as 1 | 2 | 3 | 4 | undefined) : undefined
    const baseSlots = invalidSlot ? ALL_SLOTS.filter((s) => s !== invalidSlot) : [...ALL_SLOTS]
    const slotFte = baseSlots.length * 0.25

    // Choose an fteRemaining that is NOT necessarily a multiple of 0.25,
    // but rounds to match slotFte (the UI expects this alignment).
    // Keep strictly inside the rounding band to avoid flakiness at midpoints.
    const lower = slotFte - 0.124
    const upper = slotFte + 0.124
    const rawRemaining = lower + rng() * (upper - lower)
    const remaining = round2(clampNumber(rawRemaining, 0, 1.0))
    const rounded = roundToNearestQuarter(remaining)
    if (Math.abs(rounded - slotFte) > 0.001) {
      warnings.push(`PCA urgent FTE rounding mismatch for ${pick.id}: fte=${remaining}, rounded=${rounded}, slotsFte=${slotFte}`)
    }

    const patch: DevLeaveSimStaffPatch = {
      staffId: pick.id,
      rank: 'PCA',
      bucket: 'urgent',
      leaveType,
      fteRemaining: remaining,
      fteSubtraction: round2(1.0 - remaining),
      availableSlots: baseSlots,
      invalidSlots: [],
    }

    if (invalidSlot && isValidSlot(invalidSlot)) {
      patch.invalidSlots = [
        {
          slot: invalidSlot,
          timeRange: randomPresentIntervalWithinSlot(rng, invalidSlot),
        },
      ]
      // NOTE: legacy invalidSlot fields are derived for algorithms in the controller mapping.
    }

    // Ensure invalid slot is NOT in availableSlots.
    if (patch.availableSlots && patch.invalidSlots && patch.invalidSlots.length > 0) {
      const inv = patch.invalidSlots[0]!.slot
      patch.availableSlots = patch.availableSlots.filter((s) => s !== inv)
    }

    addPatch(patches, selectedStaffIds, patch)
  }

  // Post-process safety: ensure mutual exclusivity and normalize slots
  for (const p of patches) {
    if (p.rank !== 'PCA') continue
    const inv = p.invalidSlots?.[0]?.slot
    if (inv && Array.isArray(p.availableSlots)) {
      p.availableSlots = p.availableSlots.filter((s) => s !== inv)
    }
    if (Array.isArray(p.availableSlots)) {
      p.availableSlots = Array.from(new Set(p.availableSlots)).filter((s) => isValidSlot(s)).sort((a, b) => a - b)
    }
  }

  const metaWarnings: string[] = []
  if (plannedTherapistCount > plannedTherapistCandidates.length) {
    metaWarnings.push(`Planned therapist count (${plannedTherapistCount}) exceeds eligible therapists (${plannedTherapistCandidates.length}).`)
  }
  if (plannedBudget > 0.01) {
    metaWarnings.push(`Planned PCA leave budget not fully allocated (remaining budget: ${plannedBudget.toFixed(2)}).`)
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seedUsed: args.config.seed,
    config: args.config,
    patches,
    meta: {
      excludedSptNotScheduledIds,
      warnings: [...metaWarnings, ...warnings],
    },
  }
}

