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
  /** V2-only surplus-aware projection metadata. Omitted unless V2 projection runs. */
  rawSurplusFte?: number
  /** Therapist-weighted ideal share of [rawSurplusFte] (continuous). */
  idealWeightedSurplusShareByTeam?: Record<Team, number>
  /** Executable quarter-slot cap for surplus realization. */
  redistributableSlackSlots?: number
  /** Quarter-FTE grants after discretization (sum ≤ redistributableSlackSlots × 0.25). */
  realizedSurplusSlotGrantsByTeam?: Record<Team, number>
  /** Rounded operational targets after uplift + sum-preserving reconciliation. */
  roundedAdjustedTeamTargets?: Record<Team, number>
  /** Per-team delta vs quarter-rounded raw [teamTargets] (operational uplift trace). */
  surplusAdjustmentDeltaByTeam?: Record<Team, number>
  /** Echo of therapist-weighted base demand used for weighting (never merged into targets). */
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
 * Allocator authority uses [bootstrapSummary] / quarter-rounded bootstrap pending ([fixedRoundedFloatingTargetByTeam]) and executable slack.
 * Diagnostic “rounded model” slack fields on [Step3BootstrapSummary] are not surplus grant authority;
 * executable slack ([redistributableSlackSlots]) caps realized surplus.
 */
export type Step3ProjectionV2 = {
  /** Fingerprint of bootstrap inputs; consumers compare to skip duplicate recomputation. */
  projectionVersion: string
  /** Raw/display Avg PCA per team (dashboard + Step 3.1 “avg” — not surplus-adjusted operational target). */
  displayTargetByTeam: Record<Team, number>
  /**
   * Quarter-rounded bootstrap **floating** pending at Step 2→3 open: `roundToNearestQuarterWithMidpoint(pendingByTeam)`.
   * [pendingByTeam] is surplus-aware in V2 (grants / reconciliation); this is **not** `round(teamTargets)` as a team total.
   */
  fixedRoundedFloatingTargetByTeam: Record<Team, number>
  /** Pending FTE after bootstrap (V2 surplus-aware when applicable). */
  initialRemainingPendingByTeam: Record<Team, number>
  existingAssignedByTeam: Record<Team, number>
  /** Realized surplus slot grants (FTE), metadata for provenance. */
  realizedSurplusGrantByTeam: Record<Team, number>
  /** Rounded operational targets after surplus uplift + reconciliation (tracker/tooltip alignment). */
  roundedSurplusAdjustedTargetByTeam?: Record<Team, number>
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
  const realizedSurplusGrantByTeam = createEmptyTeamRecord<number>(0)

  for (const team of TEAM_ORDER) {
    displayTargetByTeam[team] = summary.teamTargets[team] ?? 0
    existingAssignedByTeam[team] = summary.existingAssignedByTeam[team] ?? 0
    initialRemainingPendingByTeam[team] = summary.pendingByTeam[team] ?? 0
    fixedRoundedFloatingTargetByTeam[team] = roundToNearestQuarterWithMidpoint(
      summary.pendingByTeam[team] ?? 0
    )
    realizedSurplusGrantByTeam[team] = summary.realizedSurplusSlotGrantsByTeam?.[team] ?? 0
  }

  const roundedSurplusAdjustedTargetByTeam = summary.roundedAdjustedTeamTargets
    ? { ...summary.roundedAdjustedTeamTargets }
    : undefined

  return {
    projectionVersion: meta.projectionVersion,
    displayTargetByTeam,
    fixedRoundedFloatingTargetByTeam,
    initialRemainingPendingByTeam,
    existingAssignedByTeam,
    realizedSurplusGrantByTeam,
    roundedSurplusAdjustedTargetByTeam,
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
    pendingByTeam[team] = Math.max(0, target - assigned)
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

  let rawSurplusFte: number | undefined
  let idealWeightedSurplusShareByTeam: Record<Team, number> | undefined
  let redistributableSlackSlots: number | undefined
  let realizedSurplusSlotGrantsByTeam: Record<Team, number> | undefined
  let roundedAdjustedTeamTargets: Record<Team, number> | undefined
  let surplusAdjustmentDeltaByTeam: Record<Team, number> | undefined
  let rawAveragePCAPerTeamEcho: Record<Team, number> | undefined

  if (args.floatingPcaAllocationVersion === 'v2') {
    const rawPendingByTeam = createEmptyTeamRecord<number>(0)
    let totalRawPending = 0
    let discreteNeededSlots = 0
    for (const team of args.teams) {
      const raw = Math.max(0, (args.teamTargets[team] ?? 0) - (args.existingTeamPCAAssigned[team] ?? 0))
      rawPendingByTeam[team] = raw
      totalRawPending += raw
      discreteNeededSlots += Math.ceil(raw / 0.25 - 1e-9)
    }

    const availableFloatingFte = availableFloatingSlots * 0.25
    rawSurplusFte = Math.max(0, availableFloatingFte - totalRawPending)
    // Executable slack cap uses strict per-team quarter realizability (ceil), so tiny
    // continuous uplift shares do not auto-bloat into guaranteed surplus slot grants.
    redistributableSlackSlots = Math.max(0, availableFloatingSlots - discreteNeededSlots)

    const rawAvgByTeam = createEmptyTeamRecord<number>(0)
    let weightSum = 0
    for (const team of args.teams) {
      const w = args.rawAveragePCAPerTeamByTeam?.[team] ?? 0
      rawAvgByTeam[team] = w
      weightSum += Math.max(0, w)
    }
    rawAveragePCAPerTeamEcho = { ...rawAvgByTeam }

    // Weighting must stay on continuous raw surplus (spec contract). Executable slack only caps realization.
    const weightedDistributionInputFte = rawSurplusFte

    idealWeightedSurplusShareByTeam = createEmptyTeamRecord<number>(0)
    if (weightedDistributionInputFte > 0 && weightSum > 0) {
      for (const team of args.teams) {
        const w = Math.max(0, rawAvgByTeam[team] ?? 0)
        idealWeightedSurplusShareByTeam[team] = weightedDistributionInputFte * (w / weightSum)
      }
    }

    const grantBudgetFte = Math.min(weightedDistributionInputFte, redistributableSlackSlots * 0.25)
    let grantSlotCount = 0
    if (grantBudgetFte > 0 && weightSum > 0) {
      grantSlotCount = Math.min(redistributableSlackSlots, Math.floor(grantBudgetFte / 0.25 + 1e-9))
    }

    realizedSurplusSlotGrantsByTeam = createEmptyTeamRecord<number>(0)
    const continuousProportionalGrant = createEmptyTeamRecord<number>(0)

    const baselineRoundedTargets = createEmptyTeamRecord<number>(0)
    for (const team of args.teams) {
      baselineRoundedTargets[team] = roundToNearestQuarterWithMidpoint(args.teamTargets[team] ?? 0)
    }

    if (grantSlotCount === 0) {
      roundedAdjustedTeamTargets = { ...baselineRoundedTargets }
      surplusAdjustmentDeltaByTeam = createEmptyTeamRecord<number>(0)
      for (const team of args.teams) {
        pendingByTeam[team] = rawPendingByTeam[team] ?? 0
      }
      neededFloatingSlots = computeNeededSlotsFromPending(pendingByTeam)
      slackFloatingSlots = availableFloatingSlots - neededFloatingSlots
    } else if (grantSlotCount > 0 && weightSum > 0) {
      for (const team of args.teams) {
        const w = Math.max(0, rawAvgByTeam[team] ?? 0)
        continuousProportionalGrant[team] = grantBudgetFte * (w / weightSum)
      }

      const floorSlots: Record<Team, number> = createEmptyTeamRecord<number>(0)
      const remainder: Record<Team, number> = createEmptyTeamRecord<number>(0)
      let floorTotal = 0
      for (const team of args.teams) {
        const slotsFloat = continuousProportionalGrant[team] / 0.25
        const f = Math.floor(slotsFloat + 1e-9)
        floorSlots[team] = f
        remainder[team] = slotsFloat - f
        floorTotal += f
      }

      let deficit = grantSlotCount - floorTotal
      const bonusOrder = [...args.teams].sort((a, b) => {
        const dr = remainder[b]! - remainder[a]!
        if (Math.abs(dr) > 1e-12) return dr
        return TEAM_ORDER.indexOf(a) - TEAM_ORDER.indexOf(b)
      })
      let bi = 0
      while (deficit > 0 && bonusOrder.length > 0) {
        const team = bonusOrder[bi % bonusOrder.length]!
        floorSlots[team] = (floorSlots[team] ?? 0) + 1
        deficit -= 1
        bi += 1
      }

      while (deficit < 0) {
        const team = [...args.teams].sort((a, b) => {
          const dr = remainder[a]! - remainder[b]!
          if (Math.abs(dr) > 1e-12) return dr
          return TEAM_ORDER.indexOf(a) - TEAM_ORDER.indexOf(b)
        })[0]!
        if ((floorSlots[team] ?? 0) <= 0) break
        floorSlots[team] = (floorSlots[team] ?? 0) - 1
        deficit += 1
      }

      for (const team of args.teams) {
        realizedSurplusSlotGrantsByTeam[team] = (floorSlots[team] ?? 0) * 0.25
      }

      const surplusAdjusted = createEmptyTeamRecord<number>(0)
      for (const team of args.teams) {
        surplusAdjusted[team] =
          (args.teamTargets[team] ?? 0) + (realizedSurplusSlotGrantsByTeam[team] ?? 0)
      }

      roundedAdjustedTeamTargets = createEmptyTeamRecord<number>(0)
      for (const team of args.teams) {
        roundedAdjustedTeamTargets[team] = roundToNearestQuarterWithMidpoint(surplusAdjusted[team] ?? 0)
      }

      surplusAdjustmentDeltaByTeam = createEmptyTeamRecord<number>(0)

      const recomputeAdjustmentDeltas = () => {
        for (const team of args.teams) {
          surplusAdjustmentDeltaByTeam![team] =
            (roundedAdjustedTeamTargets![team] ?? 0) - (baselineRoundedTargets[team] ?? 0)
        }
      }

      const sumAdjustmentDelta = () =>
        args.teams.reduce(
          (acc, team) =>
            acc +
            ((roundedAdjustedTeamTargets![team] ?? 0) - (baselineRoundedTargets[team] ?? 0)),
          0
        )

      recomputeAdjustmentDeltas()
      const intendedGrantFte = grantSlotCount * 0.25
      let guard = 0
      while (guard < 64 && Math.abs(sumAdjustmentDelta() - intendedGrantFte) > 1e-9) {
        const sumDelta = sumAdjustmentDelta()
        if (sumDelta > intendedGrantFte + 1e-9) {
          const team = [...args.teams].sort((a, b) => {
            const oa =
              (roundedAdjustedTeamTargets![a] ?? 0) - (surplusAdjusted[a] ?? 0)
            const ob =
              (roundedAdjustedTeamTargets![b] ?? 0) - (surplusAdjusted[b] ?? 0)
            if (Math.abs(ob - oa) > 1e-12) return ob - oa
            return TEAM_ORDER.indexOf(a) - TEAM_ORDER.indexOf(b)
          })[0]!
          roundedAdjustedTeamTargets![team] =
            (roundedAdjustedTeamTargets![team] ?? 0) - 0.25
        } else if (sumDelta < intendedGrantFte - 1e-9) {
          const team = [...args.teams].sort((a, b) => {
            const ua =
              (surplusAdjusted[a] ?? 0) - (roundedAdjustedTeamTargets![a] ?? 0)
            const ub =
              (surplusAdjusted[b] ?? 0) - (roundedAdjustedTeamTargets![b] ?? 0)
            if (Math.abs(ub - ua) > 1e-12) return ub - ua
            return TEAM_ORDER.indexOf(a) - TEAM_ORDER.indexOf(b)
          })[0]!
          roundedAdjustedTeamTargets![team] =
            (roundedAdjustedTeamTargets![team] ?? 0) + 0.25
        } else {
          break
        }
        recomputeAdjustmentDeltas()
        guard += 1
      }

      for (const team of args.teams) {
        pendingByTeam[team] = Math.max(
          0,
          (roundedAdjustedTeamTargets[team] ?? 0) - (existingAssignedByTeam[team] ?? 0)
        )
      }

      neededFloatingSlots = computeNeededSlotsFromPending(pendingByTeam)
      slackFloatingSlots = availableFloatingSlots - neededFloatingSlots
    }
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
    ...(args.floatingPcaAllocationVersion === 'v2'
      ? {
          rawSurplusFte,
          idealWeightedSurplusShareByTeam,
          redistributableSlackSlots,
          realizedSurplusSlotGrantsByTeam,
          roundedAdjustedTeamTargets,
          surplusAdjustmentDeltaByTeam,
          rawAveragePCAPerTeamByTeam: rawAveragePCAPerTeamEcho,
        }
      : {}),
  }
}

const operationalTargetForStep3Handoff = (summary: Step3BootstrapSummary, team: Team): number => {
  const adjusted = summary.roundedAdjustedTeamTargets?.[team]
  if (adjusted != null) return adjusted
  return summary.teamTargets[team] ?? 0
}

/**
 * User-facing context line when Step 2 completes and a Step 3 floating handoff delta exists.
 * Keep in sync with `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md` Locked decision 2.
 */
export const STEP2_HANDOFF_FLOATING_TARGET_TOAST_MAIN =
  'Floating targets updated after Step 2 + shared spare from rounding the floating pool.'

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
