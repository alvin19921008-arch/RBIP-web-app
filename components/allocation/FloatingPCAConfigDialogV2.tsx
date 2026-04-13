'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  Info,
  XCircle,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TeamPendingCard, TIE_BREAKER_COLORS } from './TeamPendingCard'
import {
  buildStep3V2VisibleSteps,
  getStep3V2BackTarget,
  type Step3V2Step,
} from '@/lib/features/schedule/step3V2Path'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import type { Staff, Team } from '@/types/staff'
import {
  allocateFloatingPCA_v2RankedSlot,
  type FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/pcaAllocation'
import {
  buildStep31PreviewExtraCoverageOptions,
  countProjectedExtraSlots,
} from '@/lib/features/schedule/step31ProjectedExtraSlots'
import { buildV2Step31ScarcitySummary } from '@/lib/features/schedule/step31V2ScarcitySummary'
import { runStep3V2CommittedSelections } from '@/lib/features/schedule/step3V2CommittedSelections'
import { computeStep3V2ReservationPreview } from '@/lib/features/schedule/step3V2ReservationPreview'
import { Step32PreferredReviewDetailPanel } from '@/components/allocation/step32V2/Step32PreferredReviewDetailPanel'
import { Step32PreferredReviewLane } from '@/components/allocation/step32V2/Step32PreferredReviewLane'
import { computeAdjacentSlotReservations, type SlotAssignment } from '@/lib/utils/reservationLogic'
import { buildStep34TeamDetailViewModel } from './step34/step34ViewModel'

import type { FloatingPCAConfigDialogV1Props } from './FloatingPCAConfigDialogV1'
import {
  buildStep3ProjectionVersionKey,
  computeStep3BootstrapSummary,
  computeStep3NonFloatingFteBreakdownByTeamFromAllocations,
  type Step3BootstrapSummary,
  type Step3ProjectionV2,
} from '@/lib/features/schedule/step3Bootstrap'

type FloatingPCAConfigDialogV2Props = FloatingPCAConfigDialogV1Props & {
  /** Therapist-weighted demand for V2 surplus projection (kept separate from floating [teamTargets]). */
  step31RawAveragePCAPerTeamByTeam?: Record<Team, number>
  /**
   * Precomputed Step 2 → Step 3 projection from the page/controller (same bootstrap inputs as dialog).
   * When present with V2 raw-average weights, avoids a second [computeStep3BootstrapSummary] on open.
   */
  initialStep3ProjectionV2?: Step3ProjectionV2 | null
  /** Must match page bootstrap [reservedSpecialProgramPcaFte] so projection fingerprints align. */
  step31ReservedSpecialProgramPcaFte?: number
  /** Staff roster (e.g. on-duty + buffer) for non-floating FTE breakdown when the dialog recomputes bootstrap. */
  step31BootstrapStaff?: Staff[]
}

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

/** Badges on the light-blue Step 3.4 detail panel: high contrast vs panel tint. */
const STEP34_DETAIL_BADGE_CLASS =
  'border-blue-400/90 bg-white font-semibold text-blue-950 shadow-sm hover:bg-white dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-50 dark:hover:bg-blue-950/80'

type Step33Decision = 'use' | 'skip'

function getStepDisplayLabel(step: Step3V2Step): string {
  if (step === '3.1') return '3.1 Adjust'
  if (step === '3.2') return '3.2 Preferred'
  if (step === '3.3') return '3.3 Adjacent'
  return '3.4 Final'
}

function getOrderLabel(position: number): string {
  if (position === 1) return '1st'
  if (position === 2) return '2nd'
  if (position === 3) return '3rd'
  return `${position}th`
}

function getAdjacentOptionKey(option: { pcaId: string; adjacentSlot: number }): string {
  return `${option.pcaId}:${option.adjacentSlot}`
}

type Step31PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready'
      standardZeroTeams: Team[]
      balancedShortTeams: Team[]
      standardProjectedExtraSlots: number
      balancedProjectedExtraSlots: number
    }
  | { status: 'error'; message: string }

interface TieGroup {
  value: number
  teams: Team[]
  colorIndex: number
}

function stepLabel(step: Step3V2Step): string {
  switch (step) {
    case '3.1':
      return 'Adjust'
    case '3.2':
      return 'Preferred'
    case '3.3':
      return 'Adjacent'
    case '3.4':
      return 'Final'
  }
}

function getSlotTime(slot: number): string {
  if (slot === 1) return '0900-1030'
  if (slot === 2) return '1030-1200'
  if (slot === 3) return '1330-1500'
  return '1500-1630'
}

function formatNoPreferredPcaAvailabilityLine(args: {
  team: Team
  firstChoiceSlot: number
  pcaPreferences: Array<{ team: Team; preferred_pca_ids?: string[] }>
  floatingPCAs: Array<{ id: string; name?: string | null }>
}): string {
  const time = getSlotTime(args.firstChoiceSlot)
  const pref = args.pcaPreferences.find((p) => p.team === args.team)
  const ids = pref?.preferred_pca_ids?.filter(Boolean) ?? []
  const poolById = new Map(args.floatingPCAs.map((pca) => [pca.id, pca]))
  const names = ids.map((id) => {
    const pca = poolById.get(id)
    const label = pca?.name?.trim()
    return label && label.length > 0 ? label : id
  })

  if (names.length === 0) {
    return `No preferred PCA is available for 1st choice ${time}.`
  }
  if (names.length === 1) {
    return `No preferred PCA "${names[0]}" is available for 1st choice ${time}.`
  }
  const quoted = names.map((n) => `"${n}"`)
  const list =
    quoted.length === 2
      ? `${quoted[0]} and ${quoted[1]}`
      : `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`
  return `No preferred PCAs ${list} are available for 1st choice ${time}.`
}

/** Step 3.3: one workplace-style line for special-program PCA + adjacent slot (avoids duplicating list + panel copy). */
function formatAdjacentSpecialProgramSentence(option: {
  pcaName: string
  specialProgramName: string
  specialProgramSlot: number
  adjacentSlot: number
}): string {
  const program = option.specialProgramName?.trim() || 'special program'
  return `${option.pcaName} covers ${program} at ${getSlotTime(option.specialProgramSlot)}, and is also available at adjacent slot ${getSlotTime(option.adjacentSlot)}.`
}

function emptyTeamRecord(value = 0): Record<Team, number> {
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

function hasPositiveRawAverageWeights(raw?: Record<Team, number>): boolean {
  if (!raw) return false
  for (const v of Object.values(raw)) {
    if ((v || 0) > 0) return true
  }
  return false
}

const STEP3_FLOATING_ASSIGNED_IN = new Set(['step32', 'step33', 'step34'])

/**
 * Quarter-slots of floating coverage committed in Steps 3.2–3.4 for UI "Assigned" totals.
 * When a Step 3.4 preview exists, prefer the tracker (includes executed 3.2/3.3 rows); otherwise use saved slot picks only.
 */
function getStep3FloatingAssignedFteForTeam(args: {
  team: Team
  step34PreviewResult: FloatingPCAAllocationResultV2 | null
  step32Assignments: SlotAssignment[]
  step33Assignments: SlotAssignment[]
}): number {
  const { team, step34PreviewResult, step32Assignments, step33Assignments } = args
  const teamLog = step34PreviewResult?.tracker?.[team]
  if (teamLog) {
    const logs = teamLog.assignments ?? []
    const n = logs.filter((a) => {
      const src = (a as { assignedIn?: string }).assignedIn
      return typeof src === 'string' && STEP3_FLOATING_ASSIGNED_IN.has(src)
    }).length
    return roundToNearestQuarterWithMidpoint(n * 0.25)
  }
  const n =
    step32Assignments.filter((a) => a.team === team).length +
    step33Assignments.filter((a) => a.team === team).length
  return roundToNearestQuarterWithMidpoint(n * 0.25)
}

function identifyTieGroups(pendingFTE: Record<Team, number>): TieGroup[] {
  const valueMap = new Map<number, Team[]>()

  Object.entries(pendingFTE).forEach(([team, value]) => {
    const roundedValue = roundToNearestQuarterWithMidpoint(value)
    if (roundedValue > 0) {
      const existing = valueMap.get(roundedValue) || []
      existing.push(team as Team)
      valueMap.set(roundedValue, existing)
    }
  })

  const tieGroups: TieGroup[] = []
  let colorIndex = 0
  const sortedEntries = Array.from(valueMap.entries()).sort((a, b) => b[0] - a[0])

  sortedEntries.forEach(([value, teams]) => {
    if (teams.length >= 2) {
      tieGroups.push({
        value,
        teams,
        colorIndex: colorIndex % TIE_BREAKER_COLORS.length,
      })
      colorIndex += 1
    }
  })

  return tieGroups
}

function sortTeamsByPendingFTE(
  teams: Team[],
  pendingFTE: Record<Team, number>,
  currentOrder: Team[]
): Team[] {
  const positionMap = new Map<Team, number>()
  currentOrder.forEach((team, index) => positionMap.set(team, index))

  return [...teams].sort((a, b) => {
    const aRounded = roundToNearestQuarterWithMidpoint(pendingFTE[a])
    const bRounded = roundToNearestQuarterWithMidpoint(pendingFTE[b])
    if (aRounded !== bRounded) return bRounded - aRounded
    return (positionMap.get(a) ?? 0) - (positionMap.get(b) ?? 0)
  })
}

function formatTeamList(teams: Team[]): string {
  if (teams.length === 0) return 'None'
  if (teams.length <= 3) return teams.join(', ')
  return `${teams.slice(0, 2).join(', ')} +${teams.length - 2}`
}

function getStep34PendingVisualStatus(
  team: Team,
  result: FloatingPCAAllocationResultV2,
  adjustedNeed: number
): 'met' | 'partial' | 'unmet' {
  const need = roundToNearestQuarterWithMidpoint(adjustedNeed)
  if (need < 0.25) return 'met'
  const remaining = roundToNearestQuarterWithMidpoint(result.pendingPCAFTEPerTeam[team] ?? 0)
  if (remaining < 0.25) return 'met'
  if (remaining < need) return 'partial'
  return 'unmet'
}

export function FloatingPCAConfigDialogV2({
  open,
  teams = TEAMS,
  weekday,
  initialPendingFTE,
  pcaPreferences,
  floatingPCAs,
  existingAllocations,
  specialPrograms,
  staffOverrides = {},
  step31AssignedByTeam,
  step31TeamTargets,
  step31RawAveragePCAPerTeamByTeam,
  initialStep3ProjectionV2,
  step31ReservedSpecialProgramPcaFte = 0,
  step31BootstrapStaff,
  onSave,
  onCancel,
}: FloatingPCAConfigDialogV2Props) {
  const activeTeams = useMemo(
    () => (Array.isArray(teams) && teams.length > 0 ? teams : TEAMS),
    [teams]
  )
  const [currentStep, setCurrentStep] = useState<Step3V2Step>('3.1')
  const [adjustedFTE, setAdjustedFTE] = useState<Record<Team, number>>(emptyTeamRecord())
  const [originalRoundedFTE, setOriginalRoundedFTE] = useState<Record<Team, number>>(emptyTeamRecord())
  const [step31BootstrapSummary, setStep31BootstrapSummary] = useState<Step3BootstrapSummary | null>(null)
  const [teamOrder, setTeamOrder] = useState<Team[]>([])
  const [step31Preview, setStep31Preview] = useState<Step31PreviewState>({ status: 'idle' })
  const [step31CardLegendOpen, setStep31CardLegendOpen] = useState(false)
  const [selectedStep32Team, setSelectedStep32Team] = useState<Team | null>(null)
  const [selectedStep32OutcomeByTeam, setSelectedStep32OutcomeByTeam] = useState<Partial<Record<Team, string>>>({})
  const [selectedStep32PcaByTeam, setSelectedStep32PcaByTeam] = useState<Partial<Record<Team, string>>>({})
  const [step32CommittedAssignmentsByTeam, setStep32CommittedAssignmentsByTeam] = useState<
    Partial<Record<Team, SlotAssignment | null>>
  >({})
  const [selectedStep33Team, setSelectedStep33Team] = useState<Team | null>(null)
  const [step33Decisions, setStep33Decisions] = useState<Partial<Record<Team, Step33Decision>>>({})
  const [step33SelectedOptionByTeam, setStep33SelectedOptionByTeam] = useState<Partial<Record<Team, string>>>({})
  const [step34PreviewResult, setStep34PreviewResult] = useState<FloatingPCAAllocationResultV2 | null>(null)
  const [step34SelectedTeam, setStep34SelectedTeam] = useState<Team | null>(null)
  const [step34Loading, setStep34Loading] = useState(false)
  const step34DetailPanelRef = useRef<HTMLDivElement | null>(null)
  const step34TeamButtonRefs = useRef<Map<Team, HTMLButtonElement>>(new Map())
  const [step34DetailBeakCenterX, setStep34DetailBeakCenterX] = useState<number | null>(null)
  const step32DetailPanelRef = useRef<HTMLDivElement | null>(null)
  const step32TeamButtonRefs = useRef<Map<Team, HTMLButtonElement>>(new Map())
  const [step32DetailBeakCenterX, setStep32DetailBeakCenterX] = useState<number | null>(null)
  const v2TeamLaneMeasureRef = useRef<HTMLDivElement | null>(null)
  const v2Step34SlotsRowMeasureRef = useRef<HTMLDivElement | null>(null)
  const v2DialogHeaderTitleRef = useRef<HTMLDivElement | null>(null)
  const v2DialogHeaderStepperRef = useRef<HTMLDivElement | null>(null)
  const [dialogFitWidthPx, setDialogFitWidthPx] = useState(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    if (!open) return

    let surplusPendingByTeam: Record<Team, number> | null = null
    let computedBootstrapSummary: Step3BootstrapSummary | null = null
    const projectionVersionAtOpen =
      step31TeamTargets && step31AssignedByTeam
        ? buildStep3ProjectionVersionKey({
            teams: activeTeams,
            teamTargets: step31TeamTargets as Record<Team, number>,
            existingTeamPCAAssigned: step31AssignedByTeam as Record<Team, number>,
            floatingPCAs,
            existingAllocations,
            staffOverrides,
            reservedSpecialProgramPcaFte: step31ReservedSpecialProgramPcaFte,
            floatingPcaAllocationVersion: 'v2',
            rawAveragePCAPerTeamByTeam: step31RawAveragePCAPerTeamByTeam,
          })
        : null
    const reuseBootstrapFromProjection =
      !!initialStep3ProjectionV2?.bootstrapSummary &&
      hasPositiveRawAverageWeights(step31RawAveragePCAPerTeamByTeam) &&
      projectionVersionAtOpen != null &&
      initialStep3ProjectionV2.projectionVersion === projectionVersionAtOpen

    if (reuseBootstrapFromProjection) {
      computedBootstrapSummary = initialStep3ProjectionV2!.bootstrapSummary
      surplusPendingByTeam = computedBootstrapSummary.pendingByTeam
    } else if (
      hasPositiveRawAverageWeights(step31RawAveragePCAPerTeamByTeam) &&
      step31TeamTargets &&
      step31AssignedByTeam
    ) {
      try {
        const nonFloatingFteBreakdownByTeam =
          Array.isArray(step31BootstrapStaff) && step31BootstrapStaff.length > 0
            ? computeStep3NonFloatingFteBreakdownByTeamFromAllocations({
                existingAllocations,
                staff: step31BootstrapStaff,
                specialPrograms,
                weekday,
                staffOverrides,
              })
            : undefined
        const summary = computeStep3BootstrapSummary({
          teams: activeTeams,
          teamTargets: step31TeamTargets as Record<Team, number>,
          existingTeamPCAAssigned: step31AssignedByTeam as Record<Team, number>,
          floatingPCAs,
          existingAllocations,
          staffOverrides,
          reservedSpecialProgramPcaFte: step31ReservedSpecialProgramPcaFte,
          floatingPcaAllocationVersion: 'v2',
          rawAveragePCAPerTeamByTeam: step31RawAveragePCAPerTeamByTeam,
          ...(nonFloatingFteBreakdownByTeam != null
            ? { nonFloatingFteBreakdownByTeam }
            : {}),
        })
        computedBootstrapSummary = summary
        surplusPendingByTeam = summary.pendingByTeam
      } catch {
        computedBootstrapSummary = null
        surplusPendingByTeam = null
      }
    }

    const roundedInitial = emptyTeamRecord()
    activeTeams.forEach((team) => {
      const projected = surplusPendingByTeam?.[team]
      const base = initialPendingFTE[team] || 0
      roundedInitial[team] = roundToNearestQuarterWithMidpoint(
        projected != null ? projected : base
      )
    })
    const sortedTeams = sortTeamsByPendingFTE(activeTeams, roundedInitial, activeTeams)

    setAdjustedFTE(roundedInitial)
    setOriginalRoundedFTE(roundedInitial)
    setStep31BootstrapSummary(computedBootstrapSummary)
    setTeamOrder(sortedTeams)
    setCurrentStep('3.1')
    setSelectedStep32Team(null)
    setSelectedStep32OutcomeByTeam({})
    setSelectedStep32PcaByTeam({})
    setStep32CommittedAssignmentsByTeam({})
    setSelectedStep33Team(null)
    setStep33Decisions({})
    setStep33SelectedOptionByTeam({})
    setStep34PreviewResult(null)
    setStep34SelectedTeam(null)
    setStep34Loading(false)
  }, [
    open,
    activeTeams,
    initialPendingFTE,
    step31AssignedByTeam,
    step31TeamTargets,
    step31RawAveragePCAPerTeamByTeam,
    initialStep3ProjectionV2,
    step31ReservedSpecialProgramPcaFte,
    step31BootstrapStaff,
    floatingPCAs,
    existingAllocations,
    specialPrograms,
    staffOverrides,
  ])

  const handleValueChange = useCallback(
    (team: Team, newValue: number) => {
      setAdjustedFTE((prev) => {
        const next = {
          ...prev,
          [team]: roundToNearestQuarterWithMidpoint(newValue),
        }
        setTeamOrder((currentOrder) => sortTeamsByPendingFTE(activeTeams, next, currentOrder))
        return next
      })
    },
    [activeTeams]
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setTeamOrder((currentOrder) => {
      const oldIndex = currentOrder.indexOf(active.id as Team)
      const newIndex = currentOrder.indexOf(over.id as Team)
      if (oldIndex < 0 || newIndex < 0) return currentOrder
      return arrayMove(currentOrder, oldIndex, newIndex)
    })
  }, [])

  const tieGroups = useMemo(() => identifyTieGroups(adjustedFTE), [adjustedFTE])

  const teamTieInfo = useMemo(() => {
    const info = {} as Record<Team, { isTied: boolean; groupIndex: number | null }>
    activeTeams.forEach((team) => {
      info[team] = { isTied: false, groupIndex: null }
    })
    tieGroups.forEach((group) => {
      group.teams.forEach((team) => {
        info[team] = {
          isTied: true,
          groupIndex: group.colorIndex,
        }
      })
    })
    return info
  }, [activeTeams, tieGroups])

  useEffect(() => {
    if (!open || teamOrder.length === 0 || floatingPCAs.length === 0) {
      setStep31Preview({ status: 'idle' })
      return
    }

    let cancelled = false
    setStep31Preview({ status: 'loading' })

    ;(async () => {
      try {
        // Ranked V2 + selected_only preserves base [preferred_slots] order; empty Step 3.2 picks here
        // fall back to DB [preferred_pca_ids]. Manual selections may bias PCA choice in Step 3.4 but
        // must not erase ranked-slot priority.
        const standardRes = await allocateFloatingPCA_v2RankedSlot(
          buildStep31PreviewExtraCoverageOptions({
            mode: 'standard' as const,
            teamOrder,
            currentPendingFTE: { ...adjustedFTE },
            existingAllocations: existingAllocations.map((allocation) => ({ ...allocation })),
            pcaPool: floatingPCAs,
            pcaPreferences,
            specialPrograms,
            preferenceSelectionMode: 'selected_only' as const,
            preferenceProtectionMode: 'exclusive' as const,
            selectedPreferenceAssignments: [],
          })
        )

        if (cancelled) return

        const teamsNeeding = activeTeams.filter((team) => (adjustedFTE[team] || 0) > 0)
        const standardZeroTeams = teamsNeeding.filter((team) => {
          const count = (standardRes.tracker?.[team]?.assignments || []).filter((assignment) => assignment.assignedIn === 'step34').length
          return count === 0
        })
        const balancedShortTeams = teamsNeeding.filter(
          (team) => roundToNearestQuarterWithMidpoint(standardRes.pendingPCAFTEPerTeam[team] || 0) >= 0.25
        )

        // #region agent log (H9) step31 preview projected extra snapshot
        ;(typeof fetch === 'function'
          ? fetch('http://127.0.0.1:7321/ingest/76ac89bc-8813-496d-9eb0-551725b988b5', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9381e2' },
              body: JSON.stringify({
                sessionId: '9381e2',
                runId: 'step31-surplus-investigation',
                hypothesisId: 'H9',
                location: 'components/allocation/FloatingPCAConfigDialogV2.tsx:step31PreviewReady',
                message: 'step31 preview projected extra snapshot',
                data: {
                  adjustedFTE: { FO: adjustedFTE.FO ?? null, DRO: adjustedFTE.DRO ?? null },
                  standardProjectedExtraSlots: countProjectedExtraSlots(standardRes.extraCoverageByStaffId),
                  extraCoverageByStaffId: standardRes.extraCoverageByStaffId ?? {},
                  standardZeroTeams,
                  balancedShortTeams,
                  pendingAfterPreview: {
                    FO: standardRes.pendingPCAFTEPerTeam.FO ?? null,
                    DRO: standardRes.pendingPCAFTEPerTeam.DRO ?? null,
                  },
                  trackerAssignedStep34: {
                    FO:
                      standardRes.tracker?.FO?.assignments?.filter((assignment) => assignment.assignedIn === 'step34').length ?? 0,
                    DRO:
                      standardRes.tracker?.DRO?.assignments?.filter((assignment) => assignment.assignedIn === 'step34').length ?? 0,
                  },
                  step31TeamTargets: {
                    FO: step31TeamTargets?.FO ?? null,
                    DRO: step31TeamTargets?.DRO ?? null,
                  },
                  step31AssignedByTeam: {
                    FO: step31AssignedByTeam?.FO ?? null,
                    DRO: step31AssignedByTeam?.DRO ?? null,
                  },
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {})
          : Promise.resolve())
        // #endregion

        setStep31Preview({
          status: 'ready',
          standardZeroTeams,
          balancedShortTeams,
          standardProjectedExtraSlots: countProjectedExtraSlots(standardRes.extraCoverageByStaffId),
          balancedProjectedExtraSlots: 0,
        })
      } catch (error) {
        if (cancelled) return
        setStep31Preview({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    open,
    activeTeams,
    adjustedFTE,
    teamOrder,
    existingAllocations,
    floatingPCAs,
    pcaPreferences,
    specialPrograms,
    step31AssignedByTeam,
    step31TeamTargets,
  ])

  const reservationPreview = useMemo(
    () =>
      computeStep3V2ReservationPreview({
        pcaPreferences,
        adjustedPendingFTE: adjustedFTE,
        floatingPCAs,
        existingAllocations,
        staffOverrides: staffOverrides as Record<string, any>,
      }),
    [pcaPreferences, adjustedFTE, floatingPCAs, existingAllocations, staffOverrides]
  )

  const reviewableStep32Teams = useMemo(
    () => teamOrder.filter((team) => reservationPreview.teamReviews[team]?.reviewApplies),
    [reservationPreview.teamReviews, teamOrder]
  )

  const adjacentPreview = useMemo(
    () =>
      computeAdjacentSlotReservations(
        adjustedFTE,
        existingAllocations,
        floatingPCAs,
        specialPrograms,
        staffOverrides as Record<string, any>,
        weekday
      ),
    [adjustedFTE, existingAllocations, floatingPCAs, specialPrograms, staffOverrides, weekday]
  )

  const visibleSteps = useMemo(
    () =>
      buildStep3V2VisibleSteps({
        includeStep32: reservationPreview.hasAnyReservations,
        includeStep33: adjacentPreview.hasAnyAdjacentReservations,
      }),
    [reservationPreview.hasAnyReservations, adjacentPreview.hasAnyAdjacentReservations]
  )

  useEffect(() => {
    if (!visibleSteps.includes(currentStep)) {
      setCurrentStep(visibleSteps[0] ?? '3.1')
    }
  }, [visibleSteps, currentStep])

  const adjacentTeams = useMemo(
    () => teamOrder.filter((team) => (adjacentPreview.adjacentReservations[team] || []).length > 0),
    [teamOrder, adjacentPreview.adjacentReservations]
  )

  useEffect(() => {
    if (!selectedStep32Team || !reviewableStep32Teams.includes(selectedStep32Team)) {
      setSelectedStep32Team(reviewableStep32Teams[0] ?? null)
    }
  }, [reviewableStep32Teams, selectedStep32Team])

  const selectedStep32Review = selectedStep32Team ? reservationPreview.teamReviews[selectedStep32Team] : null
  const selectedStep32OutcomeKey = selectedStep32Team ? selectedStep32OutcomeByTeam[selectedStep32Team] ?? null : null
  const selectedStep32PcaId = selectedStep32Team ? selectedStep32PcaByTeam[selectedStep32Team] ?? null : null

  const selectedStep32Outcome = useMemo(() => {
    if (!selectedStep32Review) return null
    return (
      selectedStep32Review.outcomeOptions.find((option) => option.outcomeKey === selectedStep32OutcomeKey) ??
      selectedStep32Review.outcomeOptions[0] ??
      null
    )
  }, [selectedStep32OutcomeKey, selectedStep32Review])

  const selectedStep32Path = useMemo(() => {
    if (!selectedStep32Review) return null
    if (!selectedStep32Outcome) return selectedStep32Review.pathOptions[0] ?? null
    return (
      selectedStep32Review.pathOptions.find((path) => path.pathKey === selectedStep32Outcome.primaryPathKey) ??
      selectedStep32Review.pathOptions[0] ??
      null
    )
  }, [selectedStep32Outcome, selectedStep32Review])

  const selectedStep32CommittedAssignment = selectedStep32Team
    ? step32CommittedAssignmentsByTeam[selectedStep32Team] ?? null
    : null

  useEffect(() => {
    if (!selectedStep32Team || !selectedStep32Review) return
    if (selectedStep32Review.outcomeOptions.length === 0) return

    const hasValidOutcome =
      selectedStep32OutcomeKey != null &&
      selectedStep32Review.outcomeOptions.some((option) => option.outcomeKey === selectedStep32OutcomeKey)

    if (!hasValidOutcome) {
      const nextOutcomeKey = selectedStep32Review.outcomeOptions[0]?.outcomeKey ?? null
      if (nextOutcomeKey != null) {
        setSelectedStep32OutcomeByTeam((prev) => ({
          ...prev,
          [selectedStep32Team]: nextOutcomeKey,
        }))
      }
      return
    }

    const validPcaIds = new Set(
      [
        ...(selectedStep32Path?.preferredCandidates ?? []),
        ...(selectedStep32Path?.floorCandidates ?? []),
        ...(selectedStep32Path?.nonFloorCandidates ?? []),
      ].map((candidate) => candidate.id)
    )

    if (selectedStep32PcaId != null && validPcaIds.has(selectedStep32PcaId)) {
      return
    }

    const nextPcaId =
      selectedStep32Path?.systemSuggestedPcaId ??
      selectedStep32Path?.preferredCandidates[0]?.id ??
      selectedStep32Path?.floorCandidates[0]?.id ??
      selectedStep32Path?.nonFloorCandidates[0]?.id ??
      null

    if (nextPcaId != null) {
      setSelectedStep32PcaByTeam((prev) => ({
        ...prev,
        [selectedStep32Team]: nextPcaId,
      }))
    }
  }, [
    selectedStep32OutcomeKey,
    selectedStep32PcaId,
    selectedStep32Path,
    selectedStep32Review,
    selectedStep32Team,
  ])

  const handleCommitSelectedStep32Outcome = useCallback(() => {
    if (!selectedStep32Team || !selectedStep32Review || !selectedStep32Outcome || !selectedStep32Path) return

    const pcaId =
      selectedStep32PcaId ??
      selectedStep32Path.systemSuggestedPcaId ??
      selectedStep32Path.preferredCandidates[0]?.id ??
      selectedStep32Path.floorCandidates[0]?.id ??
      selectedStep32Path.nonFloorCandidates[0]?.id ??
      null

    if (!pcaId) return

    const pcaName =
      [
        ...selectedStep32Path.preferredCandidates,
        ...selectedStep32Path.floorCandidates,
        ...selectedStep32Path.nonFloorCandidates,
      ].find((candidate) => candidate.id === pcaId)?.name ??
      selectedStep32Path.systemSuggestedPcaName ??
      selectedStep32Review.recommendedPcaName ??
      pcaId

    setStep32CommittedAssignmentsByTeam((prev) => ({
      ...prev,
      [selectedStep32Team]: {
        team: selectedStep32Team,
        slot: selectedStep32Path.slot,
        pcaId,
        pcaName,
      },
    }))
  }, [selectedStep32Outcome, selectedStep32PcaId, selectedStep32Path, selectedStep32Review, selectedStep32Team])

  const handleLeaveOpenStep32 = useCallback(() => {
    if (!selectedStep32Team) return
    setStep32CommittedAssignmentsByTeam((prev) => {
      const next = { ...prev }
      delete next[selectedStep32Team]
      return next
    })
  }, [selectedStep32Team])

  useEffect(() => {
    if (!selectedStep33Team || !adjacentTeams.includes(selectedStep33Team)) {
      setSelectedStep33Team(adjacentTeams[0] ?? null)
    }
  }, [adjacentTeams, selectedStep33Team])

  const currentStepIndex = visibleSteps.indexOf(currentStep)
  const backTarget = getStep3V2BackTarget({ currentStep, visibleSteps })
  const nextTarget = currentStepIndex >= 0 ? visibleSteps[currentStepIndex + 1] ?? null : null

  const selectedAdjacentOptions = useMemo(
    () => (selectedStep33Team ? adjacentPreview.adjacentReservations[selectedStep33Team] || [] : []),
    [adjacentPreview.adjacentReservations, selectedStep33Team]
  )
  const selectedStep34Team = step34SelectedTeam ?? teamOrder[0] ?? null

  useEffect(() => {
    if (!selectedStep33Team || selectedAdjacentOptions.length === 0) return
    const currentKey = step33SelectedOptionByTeam[selectedStep33Team]
    if (currentKey && selectedAdjacentOptions.some((option) => getAdjacentOptionKey(option) === currentKey)) return

    setStep33SelectedOptionByTeam((prev) => ({
      ...prev,
      [selectedStep33Team]: getAdjacentOptionKey(selectedAdjacentOptions[0]),
    }))
  }, [selectedAdjacentOptions, selectedStep33Team, step33SelectedOptionByTeam])

  const selectedAdjacentOption = useMemo(() => {
    if (!selectedStep33Team || selectedAdjacentOptions.length === 0) return null
    const selectedKey = step33SelectedOptionByTeam[selectedStep33Team]
    return (
      selectedAdjacentOptions.find((option) => getAdjacentOptionKey(option) === selectedKey) ??
      selectedAdjacentOptions[0] ??
      null
    )
  }, [selectedAdjacentOptions, selectedStep33Team, step33SelectedOptionByTeam])

  const step32AssignmentsForSave = useMemo<SlotAssignment[]>(() => {
    return teamOrder.flatMap((team) => {
      const assignment = step32CommittedAssignmentsByTeam[team]
      if (!assignment) return []
      return [
        assignment,
      ]
    })
  }, [step32CommittedAssignmentsByTeam, teamOrder])

  const step33AssignmentsForSave = useMemo<SlotAssignment[]>(() => {
    return adjacentTeams.flatMap((team) => {
      if (step33Decisions[team] !== 'use') return []
      const options = adjacentPreview.adjacentReservations[team] || []
      const selectedKey = step33SelectedOptionByTeam[team]
      const option = options.find((entry) => getAdjacentOptionKey(entry) === selectedKey) ?? options[0]
      if (!option) return []
      return [
        {
          team,
          slot: option.adjacentSlot,
          pcaId: option.pcaId,
          pcaName: option.pcaName,
        },
      ]
    })
  }, [adjacentPreview.adjacentReservations, adjacentTeams, step33Decisions, step33SelectedOptionByTeam])

  const step3FloatingAssignedFteByTeam = useMemo(() => {
    const record = emptyTeamRecord(0)
    for (const team of activeTeams) {
      record[team] = getStep3FloatingAssignedFteForTeam({
        team,
        step34PreviewResult,
        step32Assignments: step32AssignmentsForSave,
        step33Assignments: step33AssignmentsForSave,
      })
    }
    return record
  }, [activeTeams, step34PreviewResult, step32AssignmentsForSave, step33AssignmentsForSave])

  const runStep34Preview = useCallback(async () => {
    setStep34Loading(true)
    try {
      const projectionVersionNow =
        step31TeamTargets && step31AssignedByTeam
          ? buildStep3ProjectionVersionKey({
              teams: activeTeams,
              teamTargets: step31TeamTargets as Record<Team, number>,
              existingTeamPCAAssigned: step31AssignedByTeam as Record<Team, number>,
              floatingPCAs,
              existingAllocations,
              staffOverrides,
              reservedSpecialProgramPcaFte: step31ReservedSpecialProgramPcaFte,
              floatingPcaAllocationVersion: 'v2',
              rawAveragePCAPerTeamByTeam: step31RawAveragePCAPerTeamByTeam,
            })
          : null

      const projectionAligned =
        !!initialStep3ProjectionV2 &&
        projectionVersionNow != null &&
        initialStep3ProjectionV2.projectionVersion === projectionVersionNow

      const displayTargetByTeamForBaseline = projectionAligned
        ? initialStep3ProjectionV2!.displayTargetByTeam
        : step31BootstrapSummary?.teamTargets
      const existingAssignedByTeamForBaseline = projectionAligned
        ? initialStep3ProjectionV2!.existingAssignedByTeam
        : step31BootstrapSummary?.existingAssignedByTeam

      const step34SurplusProvenanceByTeam = teamOrder.reduce<
        Partial<Record<Team, { realizedGrantFte: number; enabledStep34RowCount: number }>>
      >((acc, team) => {
        const realizedGrantFte = projectionAligned
          ? (initialStep3ProjectionV2!.realizedSurplusGrantByTeam[team] ?? 0)
          : (step31BootstrapSummary?.realizedSurplusSlotGrantsByTeam?.[team] ?? 0)
        if (roundToNearestQuarterWithMidpoint(realizedGrantFte) < 0.25) {
          return acc
        }

        const baselineRoundedPending = roundToNearestQuarterWithMidpoint(
          Math.max(
            0,
            (displayTargetByTeamForBaseline?.[team] ?? 0) -
              (existingAssignedByTeamForBaseline?.[team] ?? 0)
          )
        )
        const adjustedRoundedPending =
          roundToNearestQuarterWithMidpoint(adjustedFTE[team] || 0)
        const upliftedQuarterSlots = Math.max(
          0,
          Math.round((adjustedRoundedPending - baselineRoundedPending) / 0.25)
        )
        if (upliftedQuarterSlots <= 0) {
          return acc
        }

        acc[team] = {
          realizedGrantFte: roundToNearestQuarterWithMidpoint(realizedGrantFte),
          enabledStep34RowCount: upliftedQuarterSlots,
        }
        return acc
      }, {})

      // #region agent log (H3) step34 surplus provenance inputs
      ;(typeof fetch === 'function'
        ? fetch('http://127.0.0.1:7321/ingest/76ac89bc-8813-496d-9eb0-551725b988b5', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a8e678' },
            body: JSON.stringify({
              sessionId: 'a8e678',
              runId: 'step3-surplus-takeover-initial',
              hypothesisId: 'H3',
              location: 'components/allocation/FloatingPCAConfigDialogV2.tsx:runStep34Preview',
              message: 'Built Step 3.4 surplus provenance inputs',
              data: {
                originalRoundedFTE: {
                  FO: Number((originalRoundedFTE.FO ?? 0).toFixed(3)),
                  DRO: Number((originalRoundedFTE.DRO ?? 0).toFixed(3)),
                },
                adjustedFTE: {
                  FO: Number((adjustedFTE.FO ?? 0).toFixed(3)),
                  DRO: Number((adjustedFTE.DRO ?? 0).toFixed(3)),
                },
                realizedGrantFte: {
                  FO: Number((step31BootstrapSummary?.realizedSurplusSlotGrantsByTeam?.FO ?? 0).toFixed(3)),
                  DRO: Number((step31BootstrapSummary?.realizedSurplusSlotGrantsByTeam?.DRO ?? 0).toFixed(3)),
                },
                enabledStep34RowCount: {
                  FO: step34SurplusProvenanceByTeam.FO?.enabledStep34RowCount ?? 0,
                  DRO: step34SurplusProvenanceByTeam.DRO?.enabledStep34RowCount ?? 0,
                },
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {})
        : Promise.resolve())
      // #endregion

      const result = await runStep3V2CommittedSelections({
        teamOrder,
        currentPendingFTE: { ...adjustedFTE },
        existingAllocations: existingAllocations.map((allocation) => ({ ...allocation })),
        floatingPCAs,
        pcaPreferences,
        specialPrograms,
        step32Assignments: step32AssignmentsForSave,
        step33Assignments: step33AssignmentsForSave,
        mode: 'standard',
        preferenceSelectionMode: 'legacy',
        extraCoverageMode: 'round-robin-team-order',
        step34SurplusProvenanceByTeam,
        step34SurplusProvenanceMeta: {
          projectionVersion: projectionVersionNow,
          grantReadSource: projectionAligned ? 'step3_projection_v2' : 'bootstrap_summary',
        },
      })
      setStep34PreviewResult(result)
      setStep34SelectedTeam((current) => current ?? teamOrder[0] ?? null)
    } finally {
      setStep34Loading(false)
    }
  }, [
    activeTeams,
    adjustedFTE,
    existingAllocations,
    floatingPCAs,
    initialStep3ProjectionV2,
    pcaPreferences,
    specialPrograms,
    step31AssignedByTeam,
    step31BootstrapSummary,
    step31RawAveragePCAPerTeamByTeam,
    step31ReservedSpecialProgramPcaFte,
    step31TeamTargets,
    staffOverrides,
    step32AssignmentsForSave,
    step33AssignmentsForSave,
    teamOrder,
    originalRoundedFTE,
  ])

  useEffect(() => {
    if (!open || currentStep !== '3.4') return
    void runStep34Preview()
  }, [currentStep, open, runStep34Preview])

  useLayoutEffect(() => {
    if (currentStep !== '3.4' || step34Loading || !selectedStep34Team || !step34PreviewResult) {
      setStep34DetailBeakCenterX(null)
      return
    }

    const updateBeak = () => {
      const detail = step34DetailPanelRef.current
      const btn = step34TeamButtonRefs.current.get(selectedStep34Team)
      if (!detail || !btn) {
        setStep34DetailBeakCenterX(null)
        return
      }
      const detailRect = detail.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const center = btnRect.left + btnRect.width / 2 - detailRect.left
      const clamped = Math.min(Math.max(center, 24), Math.max(detailRect.width - 24, 24))
      setStep34DetailBeakCenterX(clamped)
    }

    updateBeak()
    window.addEventListener('resize', updateBeak)
    return () => window.removeEventListener('resize', updateBeak)
  }, [currentStep, step34Loading, selectedStep34Team, step34PreviewResult, teamOrder])

  const registerStep32TeamButtonRef = useCallback((team: Team, node: HTMLButtonElement | null) => {
    if (node) {
      step32TeamButtonRefs.current.set(team, node)
    } else {
      step32TeamButtonRefs.current.delete(team)
    }
  }, [])

  useLayoutEffect(() => {
    if (currentStep !== '3.2' || !selectedStep32Team || !selectedStep32Review) {
      setStep32DetailBeakCenterX(null)
      return
    }

    const updateBeak = () => {
      const detail = step32DetailPanelRef.current
      const btn = step32TeamButtonRefs.current.get(selectedStep32Team)
      if (!detail || !btn) {
        setStep32DetailBeakCenterX(null)
        return
      }
      const detailRect = detail.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const center = btnRect.left + btnRect.width / 2 - detailRect.left
      const clamped = Math.min(Math.max(center, 24), Math.max(detailRect.width - 24, 24))
      setStep32DetailBeakCenterX(clamped)
    }

    updateBeak()
    window.addEventListener('resize', updateBeak)
    window.addEventListener('scroll', updateBeak, true)
    return () => {
      window.removeEventListener('resize', updateBeak)
      window.removeEventListener('scroll', updateBeak, true)
    }
  }, [
    currentStep,
    dialogFitWidthPx,
    selectedStep32Review,
    selectedStep32Team,
    teamOrder,
  ])

  const selectedStep34Detail = useMemo(() => {
    if (!step34PreviewResult || !selectedStep34Team) return null
    return buildStep34TeamDetailViewModel({
      team: selectedStep34Team,
      result: step34PreviewResult,
      pcaPreferences,
      staffOverrides,
    })
  }, [pcaPreferences, selectedStep34Team, staffOverrides, step34PreviewResult])

  useLayoutEffect(() => {
    if (!open) {
      setDialogFitWidthPx(0)
      return
    }

    const measure = () => {
      const laneEl = v2TeamLaneMeasureRef.current
      const titleEl = v2DialogHeaderTitleRef.current
      const stepperEl = v2DialogHeaderStepperRef.current
      // `inline-flex` lane: offsetWidth = intrinsic card row width (not stretched to viewport).
      const laneW = laneEl?.offsetWidth ?? 0
      const headerW =
        (titleEl?.offsetWidth ?? 0) + (stepperEl?.offsetWidth ?? 0) + 24
      let detailW = 0
      let step32W = 0
      if (currentStep === '3.4') {
        const slotsRow = v2Step34SlotsRowMeasureRef.current
        const slotsW = slotsRow?.offsetWidth ?? 0
        if (slotsW > 0) {
          detailW = slotsW + 40
        }
      } else if (currentStep === '3.2') {
        // Step 3.2 is a rich, two-surface UI (lane + detail). Keep it wide enough to avoid
        // "narrow dialog" scroll fatigue, while still clamping to viewport.
        step32W = 1160
      }
      const innerContent = Math.max(laneW, headerW, detailW, step32W, 280)
      const horizontalChrome = 56
      const padded = innerContent + horizontalChrome
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
      const capped = Math.min(vw - 24, padded)
      setDialogFitWidthPx(Math.max(340, Math.round(capped)))
    }

    measure()
    window.addEventListener('resize', measure)
    const raf1 = requestAnimationFrame(() => {
      measure()
      requestAnimationFrame(measure)
    })
    return () => {
      window.removeEventListener('resize', measure)
      cancelAnimationFrame(raf1)
    }
  }, [
    open,
    currentStep,
    teamOrder,
    adjustedFTE,
    step31Preview,
    reservationPreview,
    adjacentPreview,
    step34Loading,
    step34PreviewResult,
    selectedStep34Detail,
    visibleSteps,
  ])

  const renderStep31 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span>Non-floating PCA assigned</span>
      </div>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Adjust pending FTE directly on the team strip and change order only when you want to override the default queue.
        </p>
        <p className="text-sm text-muted-foreground">
          Drag <GripVertical className="mx-0.5 inline h-3 w-3" /> only inside tie groups.
        </p>
      </div>

      {(() => {
        const scarcitySummary = buildV2Step31ScarcitySummary(step31Preview)
        const showScarcityReady = scarcitySummary !== null
        const showBlock =
          step31Preview.status === 'loading' ||
          step31Preview.status === 'error' ||
          showScarcityReady
        if (!showBlock) return null

        return (
          <div
            className={cn(
              'rounded-xl border border-border bg-background p-4',
              showScarcityReady && 'border-amber-200/70 dark:border-amber-900/45'
            )}
          >
            <div className="flex items-center gap-2">
              {showScarcityReady ? (
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
              ) : null}
              <div className="text-sm font-semibold text-foreground">Scarcity preview</div>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              {step31Preview.status === 'loading' ? (
                <div>Calculating Step 3 preview…</div>
              ) : step31Preview.status === 'error' ? (
                <div>{`Preview unavailable: ${step31Preview.message}`}</div>
              ) : showScarcityReady ? (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    If you run Step 3 now, some teams may still miss floating PCA coverage or remain short.
                  </p>
                  <div className="inline-grid grid-cols-1 gap-3 rounded-lg border border-amber-200/50 bg-background/80 px-3 py-2 sm:grid-cols-[max-content_auto_max-content] sm:items-stretch sm:gap-0 dark:border-amber-900/35">
                    <div className="sm:pr-3">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        No floating PCA if run now
                      </div>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium tabular-nums text-foreground">
                          {scarcitySummary.zeroCount}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {scarcitySummary.zeroCount === 1 ? 'team' : 'teams'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatTeamList(scarcitySummary.zeroTeams)}
                      </div>
                    </div>
                    <div
                      className="hidden h-auto w-px shrink-0 bg-amber-200/40 dark:bg-amber-900/30 sm:block"
                      aria-hidden
                    />
                    <div className="border-t border-amber-200/30 pt-3 dark:border-amber-900/25 sm:border-t-0 sm:pl-3 sm:pt-0">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Still short after allocation
                      </div>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium tabular-nums text-foreground">
                          {scarcitySummary.shortCount}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {scarcitySummary.shortCount === 1 ? 'team' : 'teams'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatTeamList(scarcitySummary.shortTeams)}
                      </div>
                    </div>
                  </div>
                  {scarcitySummary.showProjectedExtraSlots ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Projected optional slots after core needs: {scarcitySummary.projectedExtraSlots} slot
                      {scarcitySummary.projectedExtraSlots === 1 ? '' : 's'} (Step 3.4 post-need pass — not surplus
                      redistribution).
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        )
      })()}

      <div className="flex justify-center py-2">
        <div className="max-w-full overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={teamOrder} strategy={horizontalListSortingStrategy}>
              <div
                ref={v2TeamLaneMeasureRef}
                className="inline-flex flex-nowrap items-center gap-1.5 py-1"
              >
                {teamOrder.map((team, index) => {
                  const continuousPendingForSeed =
                    step31BootstrapSummary?.pendingByTeam?.[team] ??
                    (step31TeamTargets != null && step31AssignedByTeam != null
                      ? Math.max(
                          0,
                          (step31TeamTargets[team] ?? 0) - (step31AssignedByTeam[team] ?? 0)
                        )
                      : (initialPendingFTE[team] ?? 0))
                  const fixedRoundedSeed =
                    initialStep3ProjectionV2?.fixedRoundedFloatingTargetByTeam?.[team] ??
                    roundToNearestQuarterWithMidpoint(continuousPendingForSeed)
                  const initialPendingRounded = originalRoundedFTE[team] || 0
                  const pendingNow = adjustedFTE[team] || 0
                  const fixedRoundedFloatingTargetFte = roundToNearestQuarterWithMidpoint(
                    fixedRoundedSeed + (pendingNow - initialPendingRounded)
                  )
                  return (
                  <div key={team} className="flex items-center gap-1.5">
                    <TeamPendingCard
                      team={team}
                      pendingFTE={adjustedFTE[team] || 0}
                      originalPendingFTE={originalRoundedFTE[team] || 0}
                      maxValue={originalRoundedFTE[team] || 0}
                      tieGroupIndex={teamTieInfo[team]?.groupIndex ?? null}
                      isTied={teamTieInfo[team]?.isTied ?? false}
                      onValueChange={handleValueChange}
                      orderPosition={index + 1}
                      avgPcaPerTeam={
                        initialStep3ProjectionV2?.displayTargetByTeam?.[team] ??
                        (step31TeamTargets ? step31TeamTargets[team] ?? null : null)
                      }
                      rawFloatingFTE={initialPendingFTE[team] ?? 0}
                      assignedFromSlotsFTE={
                        step31AssignedByTeam ? step31AssignedByTeam[team] ?? 0 : null
                      }
                      fixedRoundedFloatingTargetFte={fixedRoundedFloatingTargetFte}
                    />
                    {index < teamOrder.length - 1 ? (
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : null}
                  </div>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <div className="mt-2">
        <button
          type="button"
          id="step31-card-legend-trigger"
          aria-expanded={step31CardLegendOpen}
          aria-controls="step31-card-legend"
          onClick={() => setStep31CardLegendOpen((open) => !open)}
          className="flex w-full max-w-full items-center gap-1.5 rounded-sm py-1 text-left text-[11px] font-medium text-foreground/90 outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              step31CardLegendOpen && 'rotate-180'
            )}
            aria-hidden
          />
          <span>What the card numbers mean</span>
        </button>
        {step31CardLegendOpen ? (
          <div
            id="step31-card-legend"
            role="region"
            aria-labelledby="step31-card-legend-trigger"
            className="mt-1.5 space-y-1.5 pl-5 text-[11px] leading-snug text-muted-foreground"
          >
            <p>
              <span className="font-medium text-foreground">Avg</span> — Target PCA per team (same as the dashboard).
            </p>
            <p>
              <span className="font-medium text-foreground">Raw floating</span> — What is still needed toward that
              target after non-floating PCA, before rounding to quarters.
            </p>
            <p>
              <span className="font-medium text-foreground">Rounded floating</span> — Quarter-rounded bootstrap floating
              pending from the Step 2→3 projection (`round(pending)` at open). In Step 3.1 only, ± on pending moves this by
              the same quarter step; from Step 3.2 onward that adjusted target stays fixed until you return to Step 3.1.
            </p>
            <p>
              <span className="font-medium text-foreground">Non-floating</span> — PCA on this team from Step 2 (often{' '}
              <span className="tabular-nums">1.00</span>).
            </p>
            <p>
              <span className="font-medium text-foreground">Pending floating</span> — Floating FTE still needed from the
              pool (large number). Adjust with ± in Step 3.1 only; from Step 3.2 onward this need stays fixed unless you
              go back to Step 3.1.
            </p>
            <p>
              <span className="font-medium text-foreground">Assigned floating</span> — Floating PCA already placed on
              this team in Steps 3.2–3.4.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )

  const renderStep32 = () => (
    <div className="space-y-4">
      <div className="min-w-0">
        <Step32PreferredReviewLane
          gymRiskTeams={reservationPreview.summary.gymRiskTeams}
          teamOrder={teamOrder}
          teamReviews={reservationPreview.teamReviews}
          selectedTeam={selectedStep32Team}
          onSelectTeam={setSelectedStep32Team}
          registerTeamButtonRef={registerStep32TeamButtonRef}
        />
      </div>

      <div className="min-w-0">
        {selectedStep32Review ? (
          <Step32PreferredReviewDetailPanel
            detailPanelRef={step32DetailPanelRef}
            beakCenterX={step32DetailBeakCenterX}
            review={selectedStep32Review}
            assignedFloatingFte={
              selectedStep32Team ? step3FloatingAssignedFteByTeam[selectedStep32Team] ?? 0 : 0
            }
            queuePosition={Math.max(1, teamOrder.indexOf(selectedStep32Team as Team) + 1)}
            selectedOutcomeKey={selectedStep32OutcomeKey}
            onSelectOutcome={(outcomeKey) =>
              selectedStep32Team &&
              setSelectedStep32OutcomeByTeam((prev) => ({
                ...prev,
                [selectedStep32Team]: outcomeKey,
              }))
            }
            selectedPcaId={selectedStep32PcaId}
            onSelectPca={(pcaId) =>
              selectedStep32Team &&
              setSelectedStep32PcaByTeam((prev) => ({
                ...prev,
                [selectedStep32Team]: pcaId,
              }))
            }
            committedAssignment={selectedStep32CommittedAssignment}
            onCommit={handleCommitSelectedStep32Outcome}
            onLeaveOpen={handleLeaveOpenStep32}
          />
        ) : (
          <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
            No teams need manual preferred-slot review in this run.
          </div>
        )}
      </div>
    </div>
  )

  const renderStep33 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 text-violet-600" />
        <span>
          {`Gray: no adjacent slot tied to a special program. Green: a special program's adjacent slot to review.`}
        </span>
      </div>

      <div className="flex justify-center pb-1">
        <div className="max-w-full overflow-x-auto">
          <div
            ref={v2TeamLaneMeasureRef}
            className="inline-flex flex-nowrap items-center gap-2"
          >
        {teamOrder.map((team, index) => {
          const hasAdjacent = adjacentTeams.includes(team)
          const isSelected = selectedStep33Team === team
          const decision = step33Decisions[team]
          return (
            <button
              key={team}
              type="button"
              onClick={() => hasAdjacent && setSelectedStep33Team(team)}
              className={cn(
                'min-w-[118px] rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                hasAdjacent ? 'border-emerald-300 bg-emerald-50/80 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-border bg-muted/10 text-muted-foreground opacity-60',
                isSelected && 'ring-2 ring-emerald-500'
              )}
            >
              <div className="text-[11px] text-muted-foreground">{getOrderLabel(index + 1)}</div>
              <div className="font-semibold">{team}</div>
              {hasAdjacent ? (
                <>
                  <div className="mt-1 text-[11px] leading-4">{`Pending floating ${roundToNearestQuarterWithMidpoint(adjustedFTE[team] || 0).toFixed(2)}`}</div>
                  <div className="text-[11px] leading-4">{`Assigned floating ${step3FloatingAssignedFteByTeam[team].toFixed(2)}`}</div>
                  <div className="mt-2 text-[11px] font-medium leading-4">
                    {decision === 'use'
                      ? 'Will assign adjacent slot'
                      : decision === 'skip'
                        ? 'Will skip adjacent slot'
                        : 'Adjacent slot available'}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-[11px] font-medium leading-4 text-muted-foreground">
                  No adjacent slot
                </div>
              )}
            </button>
          )
        })}
          </div>
        </div>
      </div>

      {selectedStep33Team ? (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-foreground">{selectedStep33Team}</div>
            <Badge variant="outline">{`Pending floating ${roundToNearestQuarterWithMidpoint(adjustedFTE[selectedStep33Team] || 0).toFixed(2)}`}</Badge>
            <Badge variant="outline">{`Assigned floating ${step3FloatingAssignedFteByTeam[selectedStep33Team].toFixed(2)}`}</Badge>
            <Badge>{`${selectedAdjacentOptions.length} adjacent slot(s)`}</Badge>
          </div>

          {selectedAdjacentOptions.length > 0 ? (
            <>
              <div className="text-sm font-semibold text-foreground">{`${selectedStep33Team} review`}</div>
              <div className="space-y-2">
                {selectedAdjacentOptions.map((option) => {
                  const optionKey = getAdjacentOptionKey(option)
                  const isChosen =
                    selectedAdjacentOption != null && getAdjacentOptionKey(selectedAdjacentOption) === optionKey
                  return (
                    <button
                      key={`${option.pcaId}-${option.adjacentSlot}`}
                      type="button"
                      onClick={() =>
                        setStep33SelectedOptionByTeam((prev) => ({
                          ...prev,
                          [selectedStep33Team]: optionKey,
                        }))
                      }
                      className={cn(
                        'w-full rounded-lg border bg-muted/20 p-3 text-left text-sm text-muted-foreground transition-colors',
                        isChosen && 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                      )}
                    >
                      {formatAdjacentSpecialProgramSentence(option)}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-emerald-200/70 pt-4 dark:border-emerald-900/50">
                <Button
                  variant={step33Decisions[selectedStep33Team] === 'use' ? 'default' : 'outline'}
                  onClick={() =>
                    setStep33Decisions((prev) => ({
                      ...prev,
                      [selectedStep33Team]: 'use',
                    }))
                  }
                >
                  Assign adjacent slot
                </Button>
                <Button
                  variant={step33Decisions[selectedStep33Team] === 'skip' ? 'default' : 'outline'}
                  onClick={() =>
                    setStep33Decisions((prev) => ({
                      ...prev,
                      [selectedStep33Team]: 'skip',
                    }))
                  }
                >
                  Skip adjacent slot
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              No adjacent special-program slot applies for this team in the current path.
            </div>
          )}
        </div>
      ) : null}
    </div>
  )

  const renderStep34 = () => (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Keep the selected team in focus to understand how Slots 1 to 4 were handled.
      </div>

      <div className="flex justify-center pb-1">
        <div className="max-w-full overflow-x-auto">
          <div
            ref={v2TeamLaneMeasureRef}
            className="inline-flex flex-nowrap items-center gap-1.5"
          >
        {teamOrder.map((team, index) => {
          const isSelected = selectedStep34Team === team
          const adjustedNeed = adjustedFTE[team] || 0
          const pendingVisual =
            step34PreviewResult != null
              ? getStep34PendingVisualStatus(team, step34PreviewResult, adjustedNeed)
              : 'met'
          const hadNoPendingNeed = roundToNearestQuarterWithMidpoint(adjustedNeed) < 0.25
          const StatusIcon =
            pendingVisual === 'met' ? CheckCircle2 : pendingVisual === 'partial' ? AlertCircle : XCircle
          const statusIconClass =
            pendingVisual === 'met'
              ? 'text-emerald-600'
              : pendingVisual === 'partial'
                ? 'text-amber-600'
                : 'text-red-600'
          const statusLabel =
            pendingVisual === 'met' && hadNoPendingNeed
              ? 'No pending'
              : pendingVisual === 'met'
                ? 'Met'
                : pendingVisual === 'partial'
                  ? 'Partially met'
                  : 'Not met'
          return (
            <button
              key={team}
              type="button"
              ref={(node) => {
                if (node) step34TeamButtonRefs.current.set(team, node)
                else step34TeamButtonRefs.current.delete(team)
              }}
              onClick={() => setStep34SelectedTeam(team)}
              className={cn(
                'min-w-[84px] max-w-[104px] shrink-0 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors',
                isSelected
                  ? 'border-sky-600 bg-sky-50 text-foreground shadow-sm ring-2 ring-sky-400/45 dark:border-sky-500 dark:bg-sky-950/45 dark:text-sky-50 dark:ring-sky-500/35'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/20'
              )}
            >
              <div className="text-[10px] text-muted-foreground">{getOrderLabel(index + 1)}</div>
              <div className="font-semibold leading-tight">{team}</div>
              <div className="mt-1 flex items-center gap-1 text-[10px] font-medium leading-tight">
                <StatusIcon className={cn('h-3.5 w-3.5 flex-shrink-0', statusIconClass)} aria-hidden />
                <span>{statusLabel}</span>
              </div>
            </button>
          )
        })}
          </div>
        </div>
      </div>

      {step34Loading ? (
        <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          Building the ranked-slot review...
        </div>
      ) : selectedStep34Detail ? (
        <div
          ref={step34DetailPanelRef}
          className="relative rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm dark:bg-blue-950/10"
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0 flex-1 pr-2">
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">{`${selectedStep34Detail.team} details`}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                These results belong to the selected team above.
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <Badge variant="outline" className={cn(STEP34_DETAIL_BADGE_CLASS, 'whitespace-nowrap')}>
                {`Pending floating ${roundToNearestQuarterWithMidpoint(adjustedFTE[selectedStep34Detail.team] || 0).toFixed(2)}`}
              </Badge>
              <Badge variant="outline" className={cn(STEP34_DETAIL_BADGE_CLASS, 'whitespace-nowrap')}>
                {`Assigned floating ${step3FloatingAssignedFteByTeam[selectedStep34Detail.team].toFixed(2)}`}
              </Badge>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {selectedStep34Detail.summaryPills.map((pill) => (
              <Badge
                key={`${selectedStep34Detail.team}-${pill.label}`}
                variant="outline"
                className={STEP34_DETAIL_BADGE_CLASS}
              >
                {pill.label}
              </Badge>
            ))}
          </div>

          <div className="overflow-x-auto pb-1">
            <div
              ref={v2Step34SlotsRowMeasureRef}
              className="inline-flex flex-nowrap items-stretch gap-2"
            >
            {selectedStep34Detail.slotCards.map((card, index) => (
              <div key={`${selectedStep34Detail.team}-${card.slot}`} className="flex items-center gap-2">
                <div className="min-w-[108px] max-w-[140px] shrink-0 rounded-xl border bg-background p-2.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">{card.label}</div>
                  <div className="mt-1.5 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {card.timeRange}
                  </div>
                  <div className="mt-1.5 text-xs font-semibold leading-snug text-foreground">{card.resultLabel}</div>
                  <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{card.detailLabel}</div>
                </div>
                {index < selectedStep34Detail.slotCards.length - 1 ? (
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                ) : null}
              </div>
            ))}
            </div>
          </div>

          <div className="mt-4 border-t border-blue-200/70 pt-4 dark:border-blue-800/50">
            <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">Why this happened</div>
            <ul className="mt-2 list-outside list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-muted-foreground">
              {selectedStep34Detail.reasons.map((reason) => (
                <li key={reason} className="pl-1">
                  {reason}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="pointer-events-none absolute -top-1 z-10 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/40"
            style={{ left: step34DetailBeakCenterX ?? 32 }}
            aria-hidden
          />
        </div>
      ) : (
        <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          No Step 3.4 preview is available yet.
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="relative flex w-auto max-w-[min(96vw,calc(100vw-16px))] flex-col overflow-hidden sm:w-auto"
        style={
          open && dialogFitWidthPx > 0
            ? {
                width: `${dialogFitWidthPx}px`,
                maxWidth: 'min(96vw, calc(100vw - 16px))',
              }
            : undefined
        }
      >
        <DialogHeader className="gap-3 border-b pb-3 text-left sm:text-left">
          <div className="flex w-full min-w-0 flex-row items-start justify-between gap-4">
            <div className="min-w-0 shrink">
              <div
                ref={v2DialogHeaderTitleRef}
                className="inline-block w-max max-w-full space-y-1 text-left"
              >
                <DialogTitle>Floating PCA allocation</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">{`Step ${currentStep} · ${stepLabel(currentStep)}`}</DialogDescription>
              </div>
            </div>
            <div
              ref={v2DialogHeaderStepperRef}
              className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs font-medium text-muted-foreground"
            >
              {visibleSteps.map((step, index) => (
                <div key={step} className="flex items-center gap-2">
                  {index > 0 ? <span className="text-slate-400">•</span> : null}
                  <span
                    className={cn(
                      currentStep === step
                        ? 'rounded-full bg-slate-100 px-3 py-1 font-semibold text-foreground dark:bg-slate-700'
                        : ''
                    )}
                  >
                    {getStepDisplayLabel(step)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto pr-1 pt-4">
          {currentStep === '3.1' && renderStep31()}
          {currentStep === '3.2' && renderStep32()}
          {currentStep === '3.3' && renderStep33()}
          {currentStep === '3.4' && renderStep34()}
        </div>

        <DialogFooter className="flex-row flex-wrap items-center gap-2 border-t bg-background/95 pt-3 sm:justify-between">
          {backTarget ? (
            <Button variant="outline" onClick={() => setCurrentStep(backTarget)} className="mr-auto">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {`Back to ${getStepDisplayLabel(backTarget)}`}
            </Button>
          ) : (
            <Button variant="outline" onClick={onCancel} className="mr-auto">
              Close
            </Button>
          )}
          <div className="flex items-center gap-2">
            {nextTarget ? (
              <Button onClick={() => setCurrentStep(nextTarget)}>
                {`Continue to ${getStepDisplayLabel(nextTarget)}`}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (!step34PreviewResult) return
                  onSave(step34PreviewResult, teamOrder, step32AssignmentsForSave, step33AssignmentsForSave)
                }}
                disabled={!step34PreviewResult || step34Loading}
              >
                Save V2 review
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
