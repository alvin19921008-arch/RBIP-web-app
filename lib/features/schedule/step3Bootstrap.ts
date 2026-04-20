import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import { roundDownToQuarter, roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { createEmptyTeamRecord } from '@/lib/utils/types'
import {
  buildReservationRuntimeProgramsById,
  computeSpecialProgramAssignedFteByTeam,
  isAllocationSlotFromSpecialProgram,
} from '@/lib/utils/scheduleReservationRuntime'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team, Weekday } from '@/types/staff'

const TEAM_ORDER: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

/**
 * Classifies PCA FTE that is **not** the floating pool for Step 3, so the UI can stay at a friendly
 * “Non-floating” total (often `1.0`) while the engine distinguishes substitution / special-program / designated PCA.
 * [computeStep3BootstrapState] / [computeStep3NonFloatingFteBreakdownByTeamFromAllocations] populate
 * [nonFloatingFteBreakdownByTeam] when allocations + staff + programs are available; [existingAssignedByTeam] stays the reconciled scalar for pending math.
 */
export type Step3NonFloatingCoverageKind =
  | 'designated_non_floating_pca'
  | 'substitution_for_non_floating'
  | 'special_program_pca_slot'
  /** Legacy / not yet attributed when folding Step 2 output into one number. */
  | 'unclassified'

/** Per-team FTE slices by [Step3NonFloatingCoverageKind] (optional; sums should reconcile with [existingAssignedByTeam]). */
export type Step3NonFloatingFteBreakdownByTeam = Partial<
  Record<Team, Partial<Record<Step3NonFloatingCoverageKind, number>>>
>

export type Step3BootstrapSummary = {
  teamTargets: Record<Team, number>
  /**
   * Non-floating-class FTE already on the team before Step 3 floating work (single sum today).
   * Prefer [nonFloatingFteBreakdownByTeam] once Step 2 emits attributed rows — avoids “always 1.0” headcount bugs.
   */
  existingAssignedByTeam: Record<Team, number>
  pendingByTeam: Record<Team, number>
  reservedSpecialProgramPcaFte: number
  availableFloatingSlots: number
  neededFloatingSlots: number
  slackFloatingSlots: number
  /**
   * Echo of therapist-weighted base demand (projection fingerprint / display weighting only;
   * not used for surplus grants — pathway removed).
   */
  rawAveragePCAPerTeamByTeam?: Record<Team, number>
  /**
   * Optional attributed non-floating FTE (substitution vs designated vs special program). When absent, only
   * [existingAssignedByTeam] is available for the Step 3.1 “Non-floating” row.
   */
  nonFloatingFteBreakdownByTeam?: Step3NonFloatingFteBreakdownByTeam
}

/**
 * Single Step 2 → Step 3 projection snapshot: display avg, fixed rounded floating targets,
 * initial pending, and surplus provenance metadata share one builder + reference.
 *
 * Allocator authority uses [bootstrapSummary] and quarter-rounded bootstrap pending ([fixedRoundedFloatingTargetByTeam]).
 */
export type Step3ProjectionV2 = {
  /** Fingerprint of bootstrap inputs; consumers compare to skip duplicate recomputation. */
  projectionVersion: string
  /** Raw/display Avg PCA per team (dashboard + Step 3.1 “avg”). */
  displayTargetByTeam: Record<Team, number>
  /**
   * Quarter-rounded bootstrap **floating** pending at Step 2→3 open: `roundToNearestQuarterWithMidpoint(pendingByTeam)`.
   * V2 [pendingByTeam] is `round(max(0, Avg − existingAssigned))` per team.
   */
  fixedRoundedFloatingTargetByTeam: Record<Team, number>
  /** Pending FTE after bootstrap. */
  initialRemainingPendingByTeam: Record<Team, number>
  existingAssignedByTeam: Record<Team, number>
  /** Authoritative bootstrap summary this projection was derived from. */
  bootstrapSummary: Step3BootstrapSummary
}

export function buildStep3ProjectionV2FromBootstrapSummary(
  summary: Step3BootstrapSummary,
  meta: { projectionVersion: string }
): Step3ProjectionV2 {
  const displayTargetByTeam = createEmptyTeamRecord<number>(0)
  const fixedRoundedFloatingTargetByTeam = createEmptyTeamRecord<number>(0)
  const initialRemainingPendingByTeam = createEmptyTeamRecord<number>(0)
  const existingAssignedByTeam = createEmptyTeamRecord<number>(0)

  for (const team of TEAM_ORDER) {
    displayTargetByTeam[team] = summary.teamTargets[team] ?? 0
    existingAssignedByTeam[team] = summary.existingAssignedByTeam[team] ?? 0
    initialRemainingPendingByTeam[team] = summary.pendingByTeam[team] ?? 0
    fixedRoundedFloatingTargetByTeam[team] = roundToNearestQuarterWithMidpoint(
      summary.pendingByTeam[team] ?? 0
    )
  }

  return {
    projectionVersion: meta.projectionVersion,
    displayTargetByTeam,
    fixedRoundedFloatingTargetByTeam,
    initialRemainingPendingByTeam,
    existingAssignedByTeam,
    bootstrapSummary: summary,
  }
}

function stableStaffOverrideSlotFingerprint(staffOverrides?: Record<string, unknown>): string[] {
  const ids = Object.keys(staffOverrides ?? {}).sort()
  return ids.map((id) => {
    const o = (staffOverrides as Record<string, any> | undefined)?.[id]
    const m = o?.bufferManualSlotOverrides ?? o?.slotOverrides
    if (!m) return `${id}:`
    return `${id}:${m.slot1 ?? ''}|${m.slot2 ?? ''}|${m.slot3 ?? ''}|${m.slot4 ?? ''}`
  })
}

/**
 * Stable key for whether a [Step3BootstrapSummary] / projection is still valid for current inputs.
 */
export function buildStep3ProjectionVersionKey(args: {
  teams: Team[]
  teamTargets: Record<Team, number>
  existingTeamPCAAssigned: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, unknown>
  reservedSpecialProgramPcaFte?: number
  floatingPcaAllocationVersion?: 'v1' | 'v2'
  rawAveragePCAPerTeamByTeam?: Record<Team, number>
}): string {
  const sortedTeams = [...args.teams].slice().sort()
  const teamTargets: Record<string, number> = {}
  const existingAssigned: Record<string, number> = {}
  const rawAvg: Record<string, number> = {}
  for (const t of sortedTeams) {
    teamTargets[t] = Number((args.teamTargets[t] ?? 0).toFixed(4))
    existingAssigned[t] = Number((args.existingTeamPCAAssigned[t] ?? 0).toFixed(4))
    rawAvg[t] = Number((args.rawAveragePCAPerTeamByTeam?.[t] ?? 0).toFixed(4))
  }

  const floating = [...args.floatingPCAs]
    .map((p) => ({
      id: p.id,
      fte: Number((p.fte_pca ?? 0).toFixed(4)),
      slots: [...(Array.isArray(p.availableSlots) ? p.availableSlots : [1, 2, 3, 4])].sort((a, b) => a - b),
      invalidSlot:
        p.invalidSlot === 1 || p.invalidSlot === 2 || p.invalidSlot === 3 || p.invalidSlot === 4
          ? p.invalidSlot
          : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const allocs = [...args.existingAllocations]
    .map((a) => ({
      staffId: a.staff_id,
      slot1: (a.slot1 as Team | null) ?? null,
      slot2: (a.slot2 as Team | null) ?? null,
      slot3: (a.slot3 as Team | null) ?? null,
      slot4: (a.slot4 as Team | null) ?? null,
      invalidSlot:
        (a as any).invalid_slot === 1 ||
        (a as any).invalid_slot === 2 ||
        (a as any).invalid_slot === 3 ||
        (a as any).invalid_slot === 4
          ? ((a as any).invalid_slot as 1 | 2 | 3 | 4)
          : null,
    }))
    .sort((a, b) => a.staffId.localeCompare(b.staffId))

  return JSON.stringify({
    teams: sortedTeams,
    teamTargets,
    existingAssigned,
    reserved: Number((args.reservedSpecialProgramPcaFte ?? 0).toFixed(4)),
    mode: args.floatingPcaAllocationVersion ?? 'v1',
    rawAvg,
    floating,
    allocs,
    staffSlotOverrides: stableStaffOverrideSlotFingerprint(args.staffOverrides),
  })
}

export function getStep3AveragePcaDisplayTargets(
  summary: Step3BootstrapSummary | Step3ProjectionV2 | null | undefined
): Partial<Record<Team, number>> | null {
  const rawTargets =
    summary && 'bootstrapSummary' in summary ? summary.displayTargetByTeam : summary?.teamTargets
  if (!rawTargets) return null

  const next: Partial<Record<Team, number>> = {}
  for (const team of TEAM_ORDER) {
    const raw = rawTargets[team]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      next[team] = raw
    }
  }
  return next
}

function isSubstitutionCoverageSlot(args: {
  staffId: string
  team: Team
  slot: 1 | 2 | 3 | 4
  staffOverrides?: Record<string, unknown>
}): boolean {
  const o = args.staffOverrides?.[args.staffId] as
    | {
        substitutionFor?: { team?: Team; slots?: number[] }
        substitutionForBySlot?: Partial<
          Record<1 | 2 | 3 | 4, { team?: Team; nonFloatingPCAId?: string }>
        >
      }
    | undefined
  if (!o) return false
  const whole = o.substitutionFor
  if (whole && whole.team === args.team && Array.isArray(whole.slots) && whole.slots.includes(args.slot)) {
    return true
  }
  const per = o.substitutionForBySlot?.[args.slot]
  return !!(per && per.team === args.team)
}

function classifyHandoffNonFloatingSlot(args: {
  staff: Staff
  staffId: string
  team: Team
  slot: 1 | 2 | 3 | 4
  staffOverrides?: Record<string, unknown>
}): Step3NonFloatingCoverageKind {
  if (args.staff.floating) {
    return isSubstitutionCoverageSlot({
      staffId: args.staffId,
      team: args.team,
      slot: args.slot,
      staffOverrides: args.staffOverrides,
    })
      ? 'substitution_for_non_floating'
      : 'unclassified'
  }
  return 'designated_non_floating_pca'
}

/**
 * Per-quarter FTE on each team from existing allocations, excluding special-program slots that bootstrap subtracts
 * from [existingTeamPCAAssigned]. Sums per team should match [existingTeamPCAAssigned] when inputs align with
 * [computeStep3BootstrapState] (no team merge); schedule page passes [canonicalSlotTeam] for merged wards.
 */
export function computeStep3NonFloatingFteBreakdownByTeamFromAllocations(args: {
  existingAllocations: PCAAllocation[]
  staff: Staff[]
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
  /** Remap slot-assigned team (e.g. merged wards on the schedule page). Default: identity. */
  canonicalSlotTeam?: (team: Team | null | undefined) => Team | null
}): Step3NonFloatingFteBreakdownByTeam {
  const breakdown: Step3NonFloatingFteBreakdownByTeam = {}
  const canon = args.canonicalSlotTeam ?? ((t: Team | null | undefined) => t ?? null)

  const staffById = new Map(args.staff.map((s) => [s.id, s]))
  const specialProgramsByTeamCache = new Map<string, ReturnType<typeof buildReservationRuntimeProgramsById>>()

  const getProgramsById = (allocationTeam: Team | null | undefined) => {
    const cacheKey = allocationTeam ?? '__null__'
    let cached = specialProgramsByTeamCache.get(cacheKey)
    if (!cached) {
      cached = buildReservationRuntimeProgramsById({
        specialPrograms: args.specialPrograms,
        weekday: args.weekday,
        staffOverrides: args.staffOverrides,
        allocationTargetTeam: allocationTeam ?? null,
      })
      specialProgramsByTeamCache.set(cacheKey, cached)
    }
    return cached
  }

  const add = (team: Team, kind: Step3NonFloatingCoverageKind, fte: number) => {
    breakdown[team] = breakdown[team] ?? {}
    const prev = breakdown[team]![kind] ?? 0
    breakdown[team]![kind] = prev + fte
  }

  for (const alloc of args.existingAllocations) {
    const staffMember = staffById.get(alloc.staff_id)
    if (!staffMember) continue

    const invalidSlot = (alloc as any).invalid_slot as 1 | 2 | 3 | 4 | null | undefined
    const specialProgramsById = getProgramsById(alloc.team as Team | null)

    for (const slot of [1, 2, 3, 4] as const) {
      if (invalidSlot === slot) continue

      const rawTeam =
        slot === 1
          ? alloc.slot1
          : slot === 2
            ? alloc.slot2
            : slot === 3
              ? alloc.slot3
              : alloc.slot4
      const teamOnSlot = canon(rawTeam as Team | null | undefined)
      if (!teamOnSlot) continue

      if (
        isAllocationSlotFromSpecialProgram({
          allocation: alloc,
          slot,
          team: teamOnSlot,
          specialProgramsById,
        })
      ) {
        continue
      }

      const kind = classifyHandoffNonFloatingSlot({
        staff: staffMember,
        staffId: alloc.staff_id,
        team: teamOnSlot,
        slot,
        staffOverrides: args.staffOverrides,
      })
      add(teamOnSlot, kind, 0.25)
    }
  }

  return breakdown
}

export function computeStep3BootstrapState(args: {
  pcaAllocations: Record<Team, Array<PCAAllocation & { staff?: Staff }>>
  staff: Staff[]
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
}): {
  existingTeamPCAAssigned: Record<Team, number>
  existingAllocations: PCAAllocation[]
  nonFloatingFteBreakdownByTeam: Step3NonFloatingFteBreakdownByTeam
} {
  const teamPCAAssigned = createEmptyTeamRecord<number>(0)
  const uniqueAllocations = Array.from(new Set(Object.values(args.pcaAllocations).flat()))
  const specialProgramAssignedByTeam = computeSpecialProgramAssignedFteByTeam({
    allocations: uniqueAllocations,
    specialPrograms: args.specialPrograms,
    weekday: args.weekday,
    staffOverrides: args.staffOverrides,
  })
  const existingAllocations: PCAAllocation[] = []
  const addedStaffIds = new Set<string>()

  Object.entries(args.pcaAllocations).forEach(([team, allocs]) => {
    ;(allocs || []).forEach((alloc: any) => {
      let slotsInTeam = 0
      if (alloc.slot1 === team) slotsInTeam++
      if (alloc.slot2 === team) slotsInTeam++
      if (alloc.slot3 === team) slotsInTeam++
      if (alloc.slot4 === team) slotsInTeam++

      const invalidSlot = (alloc as any).invalid_slot as 1 | 2 | 3 | 4 | null | undefined
      if (invalidSlot === 1 || invalidSlot === 2 || invalidSlot === 3 || invalidSlot === 4) {
        const slotField = `slot${invalidSlot}` as keyof PCAAllocation
        if ((alloc as any)[slotField] === team) {
          slotsInTeam = Math.max(0, slotsInTeam - 1)
        }
      }

      teamPCAAssigned[team as Team] += slotsInTeam * 0.25

      const staffMember = args.staff.find((s) => s.id === alloc.staff_id)
      if (!staffMember) return
      if (addedStaffIds.has(alloc.staff_id)) return

      const hasSlots = alloc.slot1 != null || alloc.slot2 != null || alloc.slot3 != null || alloc.slot4 != null
      if (!staffMember.floating || hasSlots) {
        existingAllocations.push(alloc)
        addedStaffIds.add(alloc.staff_id)
      }
    })
  })

  for (const team of TEAM_ORDER) {
    teamPCAAssigned[team] = Math.max(
      0,
      (teamPCAAssigned[team] || 0) - (specialProgramAssignedByTeam[team] || 0)
    )
  }

  const nonFloatingFteBreakdownByTeam = computeStep3NonFloatingFteBreakdownByTeamFromAllocations({
    existingAllocations: uniqueAllocations,
    staff: args.staff,
    specialPrograms: args.specialPrograms,
    weekday: args.weekday,
    staffOverrides: args.staffOverrides,
  })

  return {
    existingTeamPCAAssigned: teamPCAAssigned,
    existingAllocations,
    nonFloatingFteBreakdownByTeam,
  }
}

export function computeStep3BootstrapSummary(args: {
  teams: Team[]
  teamTargets: Record<Team, number>
  existingTeamPCAAssigned: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, unknown>
  reservedSpecialProgramPcaFte?: number
  /** When `'v2'`, applies surplus-aware projection for [pendingByTeam] and optional metadata. */
  floatingPcaAllocationVersion?: 'v1' | 'v2'
  /**
   * Therapist-weighted demand for surplus share (V2). Must be supplied per team in [teams]
   * when using surplus projection; kept separate from raw floating [teamTargets].
   */
  rawAveragePCAPerTeamByTeam?: Record<Team, number>
  /** When supplied (e.g. from [computeStep3BootstrapState]), attached to summary / projection for Step 3.1 tooling. */
  nonFloatingFteBreakdownByTeam?: Step3NonFloatingFteBreakdownByTeam
}): Step3BootstrapSummary {
  const pendingByTeam = createEmptyTeamRecord<number>(0)
  const teamTargets = createEmptyTeamRecord<number>(0)
  const existingAssignedByTeam = createEmptyTeamRecord<number>(0)

  for (const team of args.teams) {
    const target = args.teamTargets[team] ?? 0
    const assigned = args.existingTeamPCAAssigned[team] ?? 0
    teamTargets[team] = target
    existingAssignedByTeam[team] = assigned
    const rawGap = Math.max(0, target - assigned)
    pendingByTeam[team] =
      args.floatingPcaAllocationVersion === 'v2'
        ? roundToNearestQuarterWithMidpoint(rawGap)
        : rawGap
  }

  const usedSlotsByPcaId = new Map<string, Set<1 | 2 | 3 | 4>>()
  const markUsed = (id: string, slot: 1 | 2 | 3 | 4) => {
    const used = usedSlotsByPcaId.get(id) ?? new Set<1 | 2 | 3 | 4>()
    used.add(slot)
    usedSlotsByPcaId.set(id, used)
  }

  for (const alloc of args.existingAllocations) {
    if (alloc.slot1) markUsed(alloc.staff_id, 1)
    if (alloc.slot2) markUsed(alloc.staff_id, 2)
    if (alloc.slot3) markUsed(alloc.staff_id, 3)
    if (alloc.slot4) markUsed(alloc.staff_id, 4)
    const invalidSlot = (alloc as any)?.invalid_slot as 1 | 2 | 3 | 4 | null | undefined
    if (invalidSlot === 1 || invalidSlot === 2 || invalidSlot === 3 || invalidSlot === 4) {
      markUsed(alloc.staff_id, invalidSlot)
    }
  }

  for (const pca of args.floatingPCAs) {
    const override = (args.staffOverrides as Record<string, any> | undefined)?.[pca.id]
    const manual = override?.bufferManualSlotOverrides ?? override?.slotOverrides
    if (!manual) continue
    if (manual.slot1) markUsed(pca.id, 1)
    if (manual.slot2) markUsed(pca.id, 2)
    if (manual.slot3) markUsed(pca.id, 3)
    if (manual.slot4) markUsed(pca.id, 4)
  }

  let availableFloatingSlots = 0
  for (const pca of args.floatingPCAs) {
    const fteSlots = Math.max(0, Math.round(roundDownToQuarter(pca.fte_pca ?? 0) / 0.25))
    let candidateSlots: number[] =
      Array.isArray(pca.availableSlots) && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
    const invalidSlot = (pca as any)?.invalidSlot as number | null | undefined
    if (invalidSlot === 1 || invalidSlot === 2 || invalidSlot === 3 || invalidSlot === 4) {
      candidateSlots = candidateSlots.filter((slot) => slot !== invalidSlot)
    }
    const used = usedSlotsByPcaId.get(pca.id)
    const remainingSlotCapacity = used ? candidateSlots.filter((slot) => !used.has(slot as 1 | 2 | 3 | 4)).length : candidateSlots.length
    availableFloatingSlots += Math.min(fteSlots, remainingSlotCapacity)
  }

  const computeNeededSlotsFromPending = (pending: Record<Team, number>) => {
    let needed = 0
    for (const team of args.teams) {
      needed += Math.max(0, Math.round(roundToNearestQuarterWithMidpoint(pending[team] ?? 0) / 0.25))
    }
    return needed
  }

  let neededFloatingSlots = computeNeededSlotsFromPending(pendingByTeam)
  let slackFloatingSlots = availableFloatingSlots - neededFloatingSlots

  let rawAveragePCAPerTeamEcho: Record<Team, number> | undefined
  if (args.floatingPcaAllocationVersion === 'v2' && args.rawAveragePCAPerTeamByTeam) {
    rawAveragePCAPerTeamEcho = { ...args.rawAveragePCAPerTeamByTeam }
  }

  return {
    teamTargets,
    existingAssignedByTeam,
    pendingByTeam,
    reservedSpecialProgramPcaFte: args.reservedSpecialProgramPcaFte ?? 0,
    availableFloatingSlots,
    neededFloatingSlots,
    slackFloatingSlots,
    ...(args.nonFloatingFteBreakdownByTeam != null
      ? { nonFloatingFteBreakdownByTeam: args.nonFloatingFteBreakdownByTeam }
      : {}),
    ...(rawAveragePCAPerTeamEcho != null
      ? { rawAveragePCAPerTeamByTeam: rawAveragePCAPerTeamEcho }
      : {}),
  }
}

const operationalTargetForStep3Handoff = (summary: Step3BootstrapSummary, team: Team): number => {
  return summary.teamTargets[team] ?? 0
}

/**
 * User-facing context line when Step 2 completes and a Step 3 floating handoff delta exists.
 * Keep in sync with `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` Locked decision 2.
 */
export const STEP2_HANDOFF_FLOATING_TARGET_TOAST_MAIN =
  'Floating targets updated after Step 2.'

/** Returns structured lines for toast: main (short), details (second line). */
export function describeStep3BootstrapDelta(
  previous: Step3BootstrapSummary | null | undefined,
  next: Step3BootstrapSummary | null | undefined
): { main: string; details: string } | null {
  if (!previous || !next) return null

  const teamDeltas = TEAM_ORDER.flatMap((team) => {
    const delta = roundToNearestQuarterWithMidpoint(
      operationalTargetForStep3Handoff(next, team) - operationalTargetForStep3Handoff(previous, team)
    )
    if (Math.abs(delta) < 0.25) return []
    const slotCount = Math.round(Math.abs(delta) / 0.25)
    const sign = delta > 0 ? '+' : '-'
    return [`${team} ${sign}${slotCount} PCA slot${slotCount === 1 ? '' : 's'}`]
  })

  if (teamDeltas.length === 0) {
    return null
  }

  return {
    main: STEP2_HANDOFF_FLOATING_TARGET_TOAST_MAIN,
    details: teamDeltas.join(', '),
  }
}

function trimTrailingZeros(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}
