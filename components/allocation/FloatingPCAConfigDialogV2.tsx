'use client'

import Link from 'next/link'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { rbipStep33, rbipStep34 } from '@/lib/design/rbipDesignTokens'
import { useStep3V2DetailBeakCenter } from '@/lib/hooks/useStep3V2DetailBeakCenter'
import { Step3V2LaneDetailShell } from '@/components/allocation/step3V2/Step3V2LaneDetailShell'
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
import {
  computeAdjacentSlotReservations,
  type AdjacentSlotInfo,
  type SlotAssignment,
} from '@/lib/utils/reservationLogic'
import { formatTimeRange, getSlotTime } from '@/lib/utils/slotHelpers'
import {
  buildReplaceEligibleTeamsFromScratchAssignments,
  buildStep3V2ScratchAfterStep32,
  buildStep32ScratchAssignmentsFromCommittedByTeam,
  computeStep33AssignedFloating3233Preview,
  shouldOmitStep32ForStep33ReplaceSave,
} from '@/lib/features/schedule/step3V2ScratchPreview'
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

/** Locked decision 2 — post-need default one line (exact). */
const STEP34_POST_NEED_DEFAULT_LINE =
  "After every team's basic floating need was met, rounding still left spare slot(s), so the system could place extra slot(s)."

function teamHasPositiveSurplusGrant(
  grants: Record<Team, number> | undefined,
  team: Team
): boolean {
  return (grants?.[team] ?? 0) > 1e-9
}

/** Step 3.4 lane dots — tooltips mirror tracker / “Why this happened” semantics. */
const STEP34_LANE_DOT_TOOLTIPS = {
  step32:
    'Floating coverage from Step 3.2 (preferred slot / outcome reservation) appears in the allocation tracker for this team.',
  step33:
    'Floating coverage from Step 3.3 (adjacent to special program) appears in the allocation tracker for this team.',
  surplus:
    'This team has a raised floating target from surplus redistribution (shared spare). Same signal as the Raised target chip.',
  extra:
    'Step 3.4 placed extra-after-needs slot(s) here: basic floating need was already satisfied before these rows.',
} as const

/** Popover legend — same order and colors as the lane dot cluster (hue = dot only). */
const STEP34_LANE_DOT_LEGEND_ROWS = [
  {
    key: 'step32',
    title: 'Step 3.2',
    dotClass: `${rbipStep34.laneDot} ${rbipStep34.laneDotLg} ${rbipStep34.laneDotStep32}`,
    body: 'Preferred slot / outcome reservation recorded.',
  },
  {
    key: 'step33',
    title: 'Step 3.3',
    dotClass: `${rbipStep34.laneDot} ${rbipStep34.laneDotLg} ${rbipStep34.laneDotStep33}`,
    body: 'Adjacent-to-special-program floating.',
  },
  {
    key: 'surplus',
    title: 'Surplus (raised target)',
    dotClass: `${rbipStep34.laneDot} ${rbipStep34.laneDotLg} ${rbipStep34.laneDotSurplus}`,
    body: "Surplus grant raised this team's floating headroom.",
  },
  {
    key: 'extra',
    title: 'Extra after needs',
    dotClass: `${rbipStep34.laneDot} ${rbipStep34.laneDotLg} ${rbipStep34.laneDotExtra}`,
    body: 'Step 3.4 extra rows after basic floating need was already met.',
  },
] as const

function getStep34LaneDotFlagsForTeam(args: {
  team: Team
  step34PreviewResult: FloatingPCAAllocationResultV2 | null
  grants: Record<Team, number> | undefined
  step32Assignments: SlotAssignment[]
  step33Assignments: SlotAssignment[]
}): { step32: boolean; step33: boolean; surplus: boolean; extra: boolean } {
  const { team, step34PreviewResult, grants, step32Assignments, step33Assignments } = args
  const teamLog = step34PreviewResult?.tracker?.[team]
  const assignments = teamLog?.assignments ?? []

  if (teamLog) {
    return {
      step32: assignments.some((a) => a.assignedIn === 'step32'),
      step33: assignments.some((a) => a.assignedIn === 'step33'),
      surplus: teamHasPositiveSurplusGrant(grants, team),
      extra: assignments.some((a) => a.assignedIn === 'step34' && a.allocationStage === 'extra-coverage'),
    }
  }

  return {
    step32: step32Assignments.some((a) => a.team === team),
    step33: step33Assignments.some((a) => a.team === team),
    surplus: teamHasPositiveSurplusGrant(grants, team),
    extra: false,
  }
}

/** Pending / Assigned + generic summary pills on the Step 3.4 detail panel. */
const STEP34_DETAIL_BADGE_CLASS =
  'border-blue-400/90 bg-white font-semibold text-blue-950 shadow-sm hover:bg-white dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-50 dark:hover:bg-blue-950/80'

/** Raised target (shared spare) — distinct from default blue chips. */
const STEP34_RAISED_TARGET_BADGE_CLASS =
  'border-emerald-600/85 bg-emerald-50 font-semibold text-emerald-950 shadow-sm hover:bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/55 dark:text-emerald-50 dark:hover:bg-emerald-950/65'

/** Extra after needs — distinct violet so it reads apart from blue + emerald. */
const STEP34_EXTRA_AFTER_NEEDS_BADGE_CLASS =
  'border-violet-600/85 bg-violet-50 font-semibold text-violet-950 shadow-sm hover:bg-violet-50 dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-50 dark:hover:bg-violet-950/70'

/** Step 3.1 flat literacy (match Step 3.4 chip hues; use violet, not purple). */
const STEP31_RAISED_TARGET_TEXT_CLASS =
  'font-semibold text-emerald-800 dark:text-emerald-200'
const STEP31_EXTRA_AFTER_NEEDS_TEXT_CLASS =
  'font-semibold text-violet-800 dark:text-violet-200'

type Step33Decision = 'use' | 'skip'

/** Step 3.3 decision buttons — same structure as Step 3.2 save choices (outline + `choiceSelected`). */
const STEP33_CHOICE_BUTTON_BASE = cn(
  rbipStep33.focusable,
  rbipStep33.choiceIdleHover,
  'border-border bg-background text-left text-foreground hover:bg-muted/40 hover:text-foreground',
  'focus-visible:ring-0 focus-visible:ring-offset-0',
  'disabled:pointer-events-none disabled:opacity-50'
)

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

function formatAdjacentOptionRowLabel(option: AdjacentSlotInfo): string {
  const program = option.specialProgramName?.trim() || 'special program'
  const adjacent = formatTimeRange(getSlotTime(option.adjacentSlot))
  const programSlot = formatTimeRange(getSlotTime(option.specialProgramSlot))
  return `${program} · ${option.pcaName} · adjacent slot ${adjacent} (next to ${program} ${programSlot})`
}

function formatAdjacentPcaTimeCompact(option: AdjacentSlotInfo): string {
  return `${option.pcaName} · ${formatTimeRange(getSlotTime(option.adjacentSlot))}`
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
  /** Step 3.3 lane/detail must ignore Step 3.4 preview assignments for Assigned floating. */
  assignedFloatingScope: 'steps-32-33' | 'through-step34'
}): number {
  const { team, step34PreviewResult, step32Assignments, step33Assignments, assignedFloatingScope } = args
  const teamLog = step34PreviewResult?.tracker?.[team]
  if (assignedFloatingScope === 'through-step34' && teamLog) {
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
  const [step31SharedSpareDetailsOpen, setStep31SharedSpareDetailsOpen] = useState(false)
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
  const step32DetailPanelRef = useRef<HTMLDivElement | null>(null)
  const step32TeamButtonRefs = useRef<Map<Team, HTMLButtonElement>>(new Map())
  const step33DetailPanelRef = useRef<HTMLDivElement | null>(null)
  const step33TeamButtonRefs = useRef<Map<Team, HTMLButtonElement>>(new Map())
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

  const step32ScratchAssignments = useMemo(
    () =>
      buildStep32ScratchAssignmentsFromCommittedByTeam({
        teamOrder,
        step32CommittedAssignmentsByTeam,
      }),
    [teamOrder, step32CommittedAssignmentsByTeam]
  )

  const { scratchAllocations, pendingAfter32 } = useMemo(
    () =>
      buildStep3V2ScratchAfterStep32({
        adjustedPendingFTE: adjustedFTE,
        existingAllocations,
        floatingPCAs,
        step32Assignments: step32ScratchAssignments,
      }),
    [adjustedFTE, existingAllocations, floatingPCAs, step32ScratchAssignments]
  )

  const replaceEligibleTeams = useMemo(
    () => buildReplaceEligibleTeamsFromScratchAssignments(step32ScratchAssignments),
    [step32ScratchAssignments]
  )

  const adjacentPreview = useMemo(
    () =>
      computeAdjacentSlotReservations(
        pendingAfter32,
        scratchAllocations,
        floatingPCAs,
        specialPrograms,
        staffOverrides as Record<string, any>,
        weekday,
        { replaceEligibleTeams }
      ),
    [
      pendingAfter32,
      scratchAllocations,
      floatingPCAs,
      specialPrograms,
      staffOverrides,
      weekday,
      replaceEligibleTeams,
    ]
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

    if (selectedStep32PcaId != null) {
      const supportingOutcomes = selectedStep32Review.outcomeOptions.filter((option) => {
        const path = selectedStep32Review.pathOptions.find((p) => p.pathKey === option.primaryPathKey)
        if (!path) return false
        const ids = new Set(
          [...path.preferredCandidates, ...path.floorCandidates, ...path.nonFloorCandidates].map((c) => c.id)
        )
        return ids.has(selectedStep32PcaId)
      })
      if (supportingOutcomes.length > 0) {
        const pick = supportingOutcomes[0]
        if (pick.outcomeKey !== selectedStep32OutcomeKey) {
          setSelectedStep32OutcomeByTeam((prev) => ({
            ...prev,
            [selectedStep32Team]: pick.outcomeKey,
          }))
        }
        return
      }
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
      const pendingAfter32Rounded = roundToNearestQuarterWithMidpoint(pendingAfter32[team] || 0)
      if (
        shouldOmitStep32ForStep33ReplaceSave({
          step33Decision: step33Decisions[team],
          pendingAfter32Rounded,
        })
      ) {
        return []
      }
      return [assignment]
    })
  }, [pendingAfter32, step32CommittedAssignmentsByTeam, step33Decisions, teamOrder])

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
    const assignedFloatingScope = currentStep === '3.3' ? 'steps-32-33' : 'through-step34'
    for (const team of activeTeams) {
      record[team] = getStep3FloatingAssignedFteForTeam({
        team,
        step34PreviewResult,
        step32Assignments: step32AssignmentsForSave,
        step33Assignments: step33AssignmentsForSave,
        assignedFloatingScope,
      })
    }
    return record
  }, [
    activeTeams,
    currentStep,
    step34PreviewResult,
    step32AssignmentsForSave,
    step33AssignmentsForSave,
  ])

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

  const registerStep32TeamButtonRef = useCallback((team: Team, node: HTMLButtonElement | null) => {
    if (node) {
      step32TeamButtonRefs.current.set(team, node)
    } else {
      step32TeamButtonRefs.current.delete(team)
    }
  }, [])

  const registerStep33TeamButtonRef = useCallback((team: Team, node: HTMLButtonElement | null) => {
    if (node) {
      step33TeamButtonRefs.current.set(team, node)
    } else {
      step33TeamButtonRefs.current.delete(team)
    }
  }, [])

  const selectedStep34Detail = useMemo(() => {
    if (!step34PreviewResult || !selectedStep34Team) return null
    return buildStep34TeamDetailViewModel({
      team: selectedStep34Team,
      result: step34PreviewResult,
      pcaPreferences,
      staffOverrides,
    })
  }, [pcaPreferences, selectedStep34Team, staffOverrides, step34PreviewResult])

  const step34SurplusAndExtraFlags = useMemo(() => {
    if (!step34PreviewResult || !selectedStep34Team) {
      return { showRaisedTargetChip: false, showExtraAfterNeedsChip: false }
    }
    const grants = step31BootstrapSummary?.realizedSurplusSlotGrantsByTeam
    const showRaisedTargetChip = teamHasPositiveSurplusGrant(grants, selectedStep34Team)
    const teamLog = step34PreviewResult.tracker[selectedStep34Team]
    const showExtraAfterNeedsChip = teamLog.assignments.some(
      (a) => a.assignedIn === 'step34' && a.allocationStage === 'extra-coverage'
    )
    return { showRaisedTargetChip, showExtraAfterNeedsChip }
  }, [step31BootstrapSummary, step34PreviewResult, selectedStep34Team])

  const step32DetailBeakCenterX = useStep3V2DetailBeakCenter(
    currentStep === '3.2' && !!selectedStep32Team && !!selectedStep32Review,
    step32DetailPanelRef,
    step32TeamButtonRefs,
    selectedStep32Team,
    true,
    [
      currentStep,
      dialogFitWidthPx,
      selectedStep32Team,
      teamOrder.join(','),
      selectedStep32Review?.team ?? '',
      selectedStep32Review?.reviewState ?? '',
    ].join('|')
  )

  const step34DetailBeakCenterX = useStep3V2DetailBeakCenter(
    currentStep === '3.4' && !step34Loading && !!selectedStep34Team && !!step34PreviewResult,
    step34DetailPanelRef,
    step34TeamButtonRefs,
    selectedStep34Team,
    false,
    [
      currentStep,
      step34Loading,
      dialogFitWidthPx,
      selectedStep34Team,
      teamOrder.join(','),
      step34PreviewResult ? 'y' : 'n',
    ].join('|')
  )

  const step33DetailBeakCenterX = useStep3V2DetailBeakCenter(
    currentStep === '3.3' &&
      !!selectedStep33Team &&
      adjacentTeams.includes(selectedStep33Team),
    step33DetailPanelRef,
    step33TeamButtonRefs,
    selectedStep33Team,
    true,
    [
      currentStep,
      dialogFitWidthPx,
      selectedStep33Team,
      teamOrder.join(','),
      adjacentTeams.join(','),
      selectedStep33Team ? (step33SelectedOptionByTeam[selectedStep33Team] ?? '') : '',
      selectedStep33Team ? (step33Decisions[selectedStep33Team] ?? '') : '',
    ].join('|')
  )

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
      let stepLaneRichW = 0
      if (currentStep === '3.4') {
        const slotsRow = v2Step34SlotsRowMeasureRef.current
        const slotsW = slotsRow?.offsetWidth ?? 0
        if (slotsW > 0) {
          detailW = slotsW + 40
        }
      } else if (currentStep === '3.2' || currentStep === '3.3') {
        // Step 3.2 / 3.3: lane + beaked detail — keep dialog comfortably wide.
        stepLaneRichW = 1160
      }
      const innerContent = Math.max(laneW, headerW, detailW, stepLaneRichW, 280)
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

      <div className="mt-2 space-y-2">
        {(() => {
          const bs = step31BootstrapSummary
          const grants = bs?.realizedSurplusSlotGrantsByTeam
          if (!grants) return null
          const teamsWithShare = teamOrder.filter((t) => teamHasPositiveSurplusGrant(grants, t))
          if (teamsWithShare.length === 0) return null

          const spareSlots = bs.redistributableSlackSlots
          const displayByTeam =
            initialStep3ProjectionV2?.displayTargetByTeam ?? bs.rawAveragePCAPerTeamByTeam
          const weightingSample = teamOrder
            .map((t) => {
              const v = displayByTeam?.[t]
              if (v == null || !Number.isFinite(v)) return null
              return `${t} ${v.toFixed(2)}`
            })
            .filter((s): s is string => s != null)
          const weightingLine =
            weightingSample.length > 0
              ? `Current Avg PCA/team (display) weights used for sharing: ${weightingSample.join(', ')}.`
              : null

          const onlyTeam = teamsWithShare.length === 1 ? teamsWithShare[0] : null
          const raisedTargetNumClass = cn(STEP31_RAISED_TARGET_TEXT_CLASS, 'tabular-nums')

          return (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <span className={STEP31_RAISED_TARGET_TEXT_CLASS}>Raised target (shared spare).</span>{' '}
                Floating target includes a small raise from shared spare (rounding).{' '}
                <Link
                  href="/help/avg-and-slots"
                  className="text-primary underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  What does this mean?
                </Link>
              </p>
              <button
                type="button"
                aria-expanded={step31SharedSpareDetailsOpen}
                onClick={() => setStep31SharedSpareDetailsOpen((v) => !v)}
                className="flex w-full max-w-full items-center gap-1.5 rounded-sm py-1 text-left text-[11px] font-medium text-foreground/90 outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                    step31SharedSpareDetailsOpen && 'rotate-180'
                  )}
                  aria-hidden
                />
                <span>Show details</span>
              </button>
              {step31SharedSpareDetailsOpen ? (
                <ul className="mt-2 list-outside list-disc space-y-1.5 pl-5 text-[11px] leading-snug text-muted-foreground marker:text-muted-foreground">
                  <li className="pl-1">
                    The floating pool had spare placeable slot(s) after each team{"'"}s need was rounded to slots
                    {typeof spareSlots === 'number' && Number.isFinite(spareSlots) ? (
                      <>
                        {' '}
                        (
                        <span className={raisedTargetNumClass}>{spareSlots}</span>
                        {' '}
                        spare slot{spareSlots === 1 ? '' : 's'}).
                      </>
                    ) : (
                      '.'
                    )}
                  </li>
                  <li className="pl-1">
                    Those spare slot(s) were shared using each team{"'"}s Avg PCA/team weighting (not an equal split).
                    {weightingLine ? <> {weightingLine}</> : null}
                  </li>
                  <li className="pl-1">
                    {onlyTeam != null ? (
                      <>
                        {onlyTeam}
                        {"'"}s floating target includes that share (
                        <span className={raisedTargetNumClass}>
                          {(grants[onlyTeam] ?? 0).toFixed(2)}
                        </span>{' '}
                        FTE).
                      </>
                    ) : (
                      <>
                        These teams{"'"} floating targets include that share:{' '}
                        {teamsWithShare.map((t, i) => (
                          <span key={t}>
                            {i > 0 ? ', ' : null}
                            {t}{' '}
                            <span className={raisedTargetNumClass}>+{(grants[t] ?? 0).toFixed(2)}</span> FTE
                          </span>
                        ))}
                        .
                      </>
                    )}
                  </li>
                  <li className="pl-1">
                    This is not the same as{' '}
                    <span className={STEP31_EXTRA_AFTER_NEEDS_TEXT_CLASS}>Extra after needs</span>
                    {' in Step 3.4.'}
                  </li>
                </ul>
              ) : null}
              {step31SharedSpareDetailsOpen ? (
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">Avg PCA/team</span> here was not increased — it stays
                  the Step 2 average.
                </p>
              ) : null}
            </div>
          )
        })()}

        {step31Preview.status === 'ready' && step31Preview.standardProjectedExtraSlots > 0 ? (
          <p className="text-sm text-muted-foreground">
            Preview: up to{' '}
            <span className={cn(STEP31_EXTRA_AFTER_NEEDS_TEXT_CLASS, 'tabular-nums')}>
              {step31Preview.standardProjectedExtraSlots}
            </span>{' '}
            optional slot
            {step31Preview.standardProjectedExtraSlots === 1 ? '' : 's'} in Step 3.4 after needs are met (
            <span className={STEP31_EXTRA_AFTER_NEEDS_TEXT_CLASS}>Extra after needs</span>).{' '}
            <Link
              href="/help/avg-and-slots"
              className="text-primary underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              What does this mean?
            </Link>
          </p>
        ) : null}

        <div>
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
              <span className="font-medium text-foreground">Raw floating</span> — Avg – non-floating PCA.
            </p>
            <p>
              <span className="font-medium text-foreground">Rounded floating</span> — Round the &ldquo;Raw floating&rdquo;
              to nearest 0.25. Allow editable in Step 3.1; and stay fixed from Step 3.2 onwards.
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
    </div>
  )

  const renderStep32 = () => (
    <div className="space-y-4">
      <div className="min-w-0">
        <Step32PreferredReviewLane
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

  const renderStep33 = () => {
    const wideLane = dialogFitWidthPx >= 720

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
          <span className="min-w-0">
            Gray: no adjacent special-program slot. Teal: a special program&apos;s adjacent slot to review.
          </span>
        </div>

        {teamOrder.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No teams are in scope for this Step 3.3 review right now.
          </div>
        ) : null}

        <div className="flex justify-center pb-1">
          <div className="max-w-full overflow-x-auto">
            <div ref={v2TeamLaneMeasureRef} className="inline-flex flex-nowrap items-center gap-2">
              {teamOrder.map((team, index) => {
                const hasAdjacent = adjacentTeams.includes(team)
                const isSelected = selectedStep33Team === team
                const decision = step33Decisions[team]
                const pendingFloating = roundToNearestQuarterWithMidpoint(adjustedFTE[team] || 0)
                const pendingAfter32Rounded = roundToNearestQuarterWithMidpoint(pendingAfter32[team] || 0)
                const assignedFloating = computeStep33AssignedFloating3233Preview({
                  committedStep32: step32CommittedAssignmentsByTeam[team],
                  step33Decision: decision,
                  pendingAfter32Rounded,
                })
                const remainingPending = Math.max(
                  0,
                  roundToNearestQuarterWithMidpoint(pendingFloating - assignedFloating)
                )
                const step32Commit = step32CommittedAssignmentsByTeam[team]
                const step32LineWide = step32Commit
                  ? `${step32Commit.pcaName} · ${formatTimeRange(getSlotTime(step32Commit.slot))}`
                  : null
                const step32LineNarrow = step32Commit ? `${step32Commit.pcaName} · Slot ${step32Commit.slot}` : null
                const laneOptions = adjacentPreview.adjacentReservations[team] || []
                const canAssignAdjacentAdditive =
                  hasAdjacent && pendingAfter32Rounded >= 0.25 && laneOptions.length > 0
                const replaceOnlyAdjacent =
                  hasAdjacent && pendingAfter32Rounded < 0.25 && !!step32Commit && laneOptions.length > 0
                const cannotAssignAdjacent =
                  hasAdjacent && laneOptions.length === 0
                return (
                  <button
                    key={team}
                    type="button"
                    ref={(node) => registerStep33TeamButtonRef(team, node)}
                    onClick={() => hasAdjacent && setSelectedStep33Team(team)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                      hasAdjacent
                        ? cn('min-w-[152px] max-w-[196px]', rbipStep33.laneChipActive)
                        : 'min-w-[92px] shrink-0 border-border bg-muted/20 text-muted-foreground',
                      isSelected && hasAdjacent && rbipStep33.laneChipSelected
                    )}
                  >
                    <div className="text-[11px] text-muted-foreground">{getOrderLabel(index + 1)}</div>
                    <div className="font-semibold text-foreground">{team}</div>
                    {hasAdjacent ? (
                      <>
                        <div className="mt-1 whitespace-nowrap text-[11px] leading-4 text-foreground">{`Pending floating: ${pendingFloating.toFixed(2)}`}</div>
                        <div className="whitespace-nowrap text-[11px] leading-4 text-foreground">{`Assigned floating: ${assignedFloating.toFixed(2)}`}</div>
                        <div className="whitespace-nowrap text-[11px] leading-4 text-foreground">{`Remaining pending: ${remainingPending.toFixed(2)}`}</div>
                        {step32Commit ? (
                          <div className="mt-1 text-[11px] leading-4 text-foreground">
                            {wideLane ? step32LineWide : step32LineNarrow}
                          </div>
                        ) : null}
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium leading-tight text-foreground">
                          {cannotAssignAdjacent ? (
                            <>
                              <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span>Cannot assign</span>
                            </>
                          ) : canAssignAdjacentAdditive ? (
                            <>
                              <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', rbipStep33.iconCheck)} aria-hidden />
                              <span>Can assign</span>
                            </>
                          ) : replaceOnlyAdjacent ? (
                            <>
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                              <span>Switch only</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span>Cannot assign</span>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 text-[11px] font-semibold text-muted-foreground">N/A</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {selectedStep33Team ? (
          <div className={cn('space-y-4 pt-4', rbipStep33.sectionDivider)}>
            <Step3V2LaneDetailShell
              theme="adjacent"
              detailPanelRef={step33DetailPanelRef}
              beakCenterX={step33DetailBeakCenterX}
              className="space-y-4 p-4"
            >
            {(() => {
              const team = selectedStep33Team
              const pendingFloating = roundToNearestQuarterWithMidpoint(adjustedFTE[team] || 0)
              const pendingAfter32Rounded = roundToNearestQuarterWithMidpoint(pendingAfter32[team] || 0)
              const decision = step33Decisions[team]
              const assignedFloating = computeStep33AssignedFloating3233Preview({
                committedStep32: step32CommittedAssignmentsByTeam[team],
                step33Decision: decision,
                pendingAfter32Rounded,
              })
              const remainingPending = Math.max(
                0,
                roundToNearestQuarterWithMidpoint(pendingFloating - assignedFloating)
              )
              const step32Commit = step32CommittedAssignmentsByTeam[team]
              const replacePath =
                pendingAfter32Rounded < 0.25 && !!step32Commit && selectedAdjacentOptions.length > 0
              const additivePath =
                pendingAfter32Rounded >= 0.25 && selectedAdjacentOptions.length > 0
              const noAdjacentRows = selectedAdjacentOptions.length === 0
              const crossPcaMismatch =
                replacePath &&
                !!step32Commit &&
                !!selectedAdjacentOption &&
                selectedAdjacentOption.pcaId !== step32Commit.pcaId
              const samePcaReplace =
                replacePath && !!step32Commit && !!selectedAdjacentOption && !crossPcaMismatch

              return (
                <>
                  <div className="text-sm font-semibold text-foreground">{team}</div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={rbipStep33.metricBadge}>
                      {`Pending floating ${pendingFloating.toFixed(2)}`}
                    </Badge>
                    <Badge variant="outline" className={rbipStep33.metricBadge}>
                      {`Assigned floating ${assignedFloating.toFixed(2)}`}
                    </Badge>
                    <Badge variant="outline" className={rbipStep33.metricBadge}>
                      {`Remaining pending ${remainingPending.toFixed(2)}`}
                    </Badge>
                  </div>

                  {pendingAfter32Rounded < 0.25 && step32Commit ? (
                    <div className={cn('pl-3 text-sm text-foreground', rbipStep33.calloutAccent)}>
                      <div>Floating need met for this team.</div>
                      <div className="mt-1">
                        Step 3.2 already placed assigned floating:{' '}
                        <span className="font-semibold">
                          {`${step32Commit.pcaName} · ${formatTimeRange(getSlotTime(step32Commit.slot))}`}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1 text-sm text-muted-foreground">
                    {additivePath ? (
                      <p>
                        Choose an adjacent row below, then use{' '}
                        <span className="font-medium text-foreground">Assign adjacent slot</span> or{' '}
                        <span className="font-medium text-foreground">Skip adjacent slot</span>.
                      </p>
                    ) : null}
                    {replacePath && step32Commit ? (
                      <>
                        <p>You can&apos;t assign more floating here because remaining floating is 0.</p>
                        <p className="pt-1">
                          You can switch Step 3.2 assignment{' ('}
                          <span className="font-semibold text-foreground">
                            {`${step32Commit.pcaName} · ${formatTimeRange(getSlotTime(step32Commit.slot))}`}
                          </span>
                          {') to the adjacent special-program slot ('}
                          <span className="font-semibold text-foreground">
                            {(() => {
                              const opt = selectedAdjacentOption ?? selectedAdjacentOptions[0]
                              return opt ? formatAdjacentPcaTimeCompact(opt) : '—'
                            })()}
                          </span>
                          {') instead.'}
                        </p>
                      </>
                    ) : null}
                  </div>

                  <div className={cn('pt-4', rbipStep33.sectionDivider)}>
                    <div className="text-sm font-semibold text-foreground">Adjacent to special program</div>
                    {selectedAdjacentOptions.length > 0 ? (
                      <div className="mt-2 divide-y divide-border rounded-md border border-border">
                        {selectedAdjacentOptions.map((option) => {
                          const optionKey = getAdjacentOptionKey(option)
                          const isChosen =
                            selectedAdjacentOption != null &&
                            getAdjacentOptionKey(selectedAdjacentOption) === optionKey
                          return (
                            <button
                              key={`${option.pcaId}-${option.adjacentSlot}`}
                              type="button"
                              onClick={() =>
                                setStep33SelectedOptionByTeam((prev) => ({
                                  ...prev,
                                  [team]: optionKey,
                                }))
                              }
                              className={cn(
                                'w-full px-2 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/40',
                                isChosen && rbipStep33.optionRowSelected
                              )}
                            >
                              <span className="flex items-start gap-2">
                                <CheckCircle2
                                  className={cn('mt-0.5 h-4 w-4 shrink-0', rbipStep33.iconCheck)}
                                  aria-hidden
                                />
                                <span className="min-w-0">
                                  {formatAdjacentOptionRowLabel(option)} is available
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                        {pendingAfter32Rounded < 0.25 && step32Commit ? (
                          <>
                            <div>No adjacent special-program slot is available to switch to.</div>
                            <div>Nothing to do here unless you go back to Step 3.1.</div>
                          </>
                        ) : (
                          <div>No adjacent special-program slot applies for this team in the current path.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={cn('pt-4', rbipStep33.sectionDivider)}>
                    <div className="flex flex-col gap-3">
                      {additivePath ? (
                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              STEP33_CHOICE_BUTTON_BASE,
                              step33Decisions[team] === 'use' && rbipStep33.choiceSelected
                            )}
                            onClick={() =>
                              setStep33Decisions((prev) => ({
                                ...prev,
                                [team]: 'use',
                              }))
                            }
                          >
                            Assign adjacent slot
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              STEP33_CHOICE_BUTTON_BASE,
                              step33Decisions[team] === 'skip' && rbipStep33.choiceSelected
                            )}
                            onClick={() =>
                              setStep33Decisions((prev) => ({
                                ...prev,
                                [team]: 'skip',
                              }))
                            }
                          >
                            Skip adjacent slot
                          </Button>
                        </div>
                      ) : null}

                      {replacePath ? (
                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              STEP33_CHOICE_BUTTON_BASE,
                              step33Decisions[team] === 'use' && rbipStep33.choiceSelected
                            )}
                            onClick={() =>
                              setStep33Decisions((prev) => ({
                                ...prev,
                                [team]: 'use',
                              }))
                            }
                          >
                            Replace Step 3.2 with adjacent slot
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              STEP33_CHOICE_BUTTON_BASE,
                              step33Decisions[team] === 'skip' && rbipStep33.choiceSelected
                            )}
                            onClick={() =>
                              setStep33Decisions((prev) => ({
                                ...prev,
                                [team]: 'skip',
                              }))
                            }
                            aria-label="Keep Step 3.2, skip adjacent. Reverts to your Step 3.2 choice only."
                          >
                            Keep Step 3.2, skip adjacent
                          </Button>
                        </div>
                      ) : null}

                      {noAdjacentRows && pendingAfter32Rounded < 0.25 && step32Commit ? (
                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(STEP33_CHOICE_BUTTON_BASE, rbipStep33.choiceSelected)}
                            onClick={() =>
                              setStep33Decisions((prev) => ({
                                ...prev,
                                [team]: 'skip',
                              }))
                            }
                            aria-label="Keep Step 3.2, skip adjacent. Reverts to your Step 3.2 choice only."
                          >
                            Keep Step 3.2, skip adjacent
                          </Button>
                        </div>
                      ) : null}

                      {additivePath ? (
                        <div className="text-xs text-muted-foreground">Uses one slot of remaining pending.</div>
                      ) : null}

                      {replacePath ? (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {decision === 'use' && samePcaReplace && step32Commit ? (
                            <div>
                              Step 3.2 assignment{' ('}
                              <span className="font-semibold text-foreground">
                                {`${step32Commit.pcaName} · ${formatTimeRange(getSlotTime(step32Commit.slot))}`}
                              </span>
                              {') to the adjacent special-program slot ('}
                              <span className="font-semibold text-foreground">
                                {(() => {
                                  const opt = selectedAdjacentOption ?? selectedAdjacentOptions[0]
                                  return opt ? formatAdjacentPcaTimeCompact(opt) : '—'
                                })()}
                              </span>
                              {').'}
                            </div>
                          ) : null}
                          {decision === 'use' && crossPcaMismatch && step32Commit && selectedAdjacentOption ? (
                            <div>
                              Replacing removes {step32Commit.pcaName} from this assignment and uses{' '}
                              {selectedAdjacentOption.pcaName} on the adjacent slot instead (Step 3.2 preferred PCA for
                              that slot no longer applies).
                            </div>
                          ) : null}
                          {decision === 'skip' && selectedAdjacentOptions.length > 0 ? (
                            <div>
                              Keeping Step 3.2: {(selectedAdjacentOption ?? selectedAdjacentOptions[0]).pcaName} is not
                              assigned on the adjacent slot (
                              {formatTimeRange(
                                getSlotTime((selectedAdjacentOption ?? selectedAdjacentOptions[0]).adjacentSlot)
                              )}
                              ).
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              )
            })()}
            </Step3V2LaneDetailShell>
          </div>
        ) : null}
      </div>
    )
  }

  const renderStep34 = () => (
    <div className="relative space-y-4">
      <Popover modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 z-20 h-auto min-h-8 shrink-0 gap-1 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            aria-label="What the team lane dots mean"
          >
            <span className="inline-flex items-center gap-1" aria-hidden>
              <span className={cn(rbipStep34.laneDot, rbipStep34.laneDotLg, rbipStep34.laneDotStep32)} />
              <span className={cn(rbipStep34.laneDot, rbipStep34.laneDotLg, rbipStep34.laneDotStep33)} />
              <span className={cn(rbipStep34.laneDot, rbipStep34.laneDotLg, rbipStep34.laneDotSurplus)} />
              <span className={cn(rbipStep34.laneDot, rbipStep34.laneDotLg, rbipStep34.laneDotExtra)} />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={6}
          className="z-[100] w-[min(18.5rem,calc(100vw-2rem))] border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Team lane dots
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Dots on each team card follow tracker order (left to right). Only shown when that signal applies.
          </p>
          <ul className="mt-3 space-y-2.5">
            {STEP34_LANE_DOT_LEGEND_ROWS.map((row) => (
              <li key={row.key} className="flex gap-2.5">
                <span className="mt-1 shrink-0 self-start" aria-hidden>
                  <span className={row.dotClass} />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">{row.title}</div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{row.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <div className="pr-14 text-sm text-muted-foreground">
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
          const laneDots = getStep34LaneDotFlagsForTeam({
            team,
            step34PreviewResult,
            grants: step31BootstrapSummary?.realizedSurplusSlotGrantsByTeam,
            step32Assignments: step32AssignmentsForSave,
            step33Assignments: step33AssignmentsForSave,
          })
          const showAnyLaneDot =
            laneDots.step32 || laneDots.step33 || laneDots.surplus || laneDots.extra
          const laneDotAriaLabel = showAnyLaneDot
            ? `Tracker signals for ${team}: ${[
                laneDots.step32 && 'Step 3.2 reservation',
                laneDots.step33 && 'Step 3.3 adjacent slot',
                laneDots.surplus && 'raised target from surplus',
                laneDots.extra && 'extra after needs in Step 3.4',
              ]
                .filter(Boolean)
                .join('; ')}. Hover each dot for details.`
            : undefined
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
                'relative min-w-[84px] max-w-[104px] shrink-0 rounded-lg border py-1.5 pl-2 text-left text-xs transition-colors',
                showAnyLaneDot ? 'pr-5' : 'pr-2',
                isSelected
                  ? 'border-sky-600 bg-sky-50 text-foreground shadow-sm ring-2 ring-sky-400/45 dark:border-sky-500 dark:bg-sky-950/45 dark:text-sky-50 dark:ring-sky-500/35'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/20'
              )}
            >
              {showAnyLaneDot ? (
                <span className={rbipStep34.laneDotCluster} role="group" aria-label={laneDotAriaLabel}>
                  {laneDots.step32 ? (
                    <span
                      className={cn(rbipStep34.laneDot, rbipStep34.laneDotStep32)}
                      title={STEP34_LANE_DOT_TOOLTIPS.step32}
                    />
                  ) : null}
                  {laneDots.step33 ? (
                    <span
                      className={cn(rbipStep34.laneDot, rbipStep34.laneDotStep33)}
                      title={STEP34_LANE_DOT_TOOLTIPS.step33}
                    />
                  ) : null}
                  {laneDots.surplus ? (
                    <span
                      className={cn(rbipStep34.laneDot, rbipStep34.laneDotSurplus)}
                      title={STEP34_LANE_DOT_TOOLTIPS.surplus}
                    />
                  ) : null}
                  {laneDots.extra ? (
                    <span
                      className={cn(rbipStep34.laneDot, rbipStep34.laneDotExtra)}
                      title={STEP34_LANE_DOT_TOOLTIPS.extra}
                    />
                  ) : null}
                </span>
              ) : null}
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
        <Step3V2LaneDetailShell
          theme="final"
          detailPanelRef={step34DetailPanelRef}
          beakCenterX={step34DetailBeakCenterX}
          className="p-4"
        >
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0 flex-1 pr-2">
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">{`${selectedStep34Detail.team} details`}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                These results belong to the selected team above.
              </div>
            </div>
            <div className="flex min-w-0 w-full flex-1 flex-wrap items-center gap-2 sm:w-auto sm:max-w-[min(100%,52rem)] sm:justify-end">
              <Badge variant="outline" className={cn(STEP34_DETAIL_BADGE_CLASS, 'whitespace-nowrap')}>
                {`Pending floating ${roundToNearestQuarterWithMidpoint(adjustedFTE[selectedStep34Detail.team] || 0).toFixed(2)}`}
              </Badge>
              <Badge variant="outline" className={cn(STEP34_DETAIL_BADGE_CLASS, 'whitespace-nowrap')}>
                {`Assigned floating ${step3FloatingAssignedFteByTeam[selectedStep34Detail.team].toFixed(2)}`}
              </Badge>
              {step34SurplusAndExtraFlags.showRaisedTargetChip ? (
                <Badge variant="outline" className={cn(STEP34_RAISED_TARGET_BADGE_CLASS, 'whitespace-nowrap')}>
                  Raised target
                </Badge>
              ) : null}
              {step34SurplusAndExtraFlags.showExtraAfterNeedsChip ? (
                <Badge variant="outline" className={cn(STEP34_EXTRA_AFTER_NEEDS_BADGE_CLASS, 'whitespace-nowrap')}>
                  Extra after needs
                </Badge>
              ) : null}
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
          </div>

          {step34SurplusAndExtraFlags.showExtraAfterNeedsChip ? (
            <p className="mb-3 w-full rounded-md border border-violet-200/80 bg-violet-50/90 px-3 py-2 text-xs text-violet-950 dark:border-violet-700/80 dark:bg-violet-950/35 dark:text-violet-100">
              {STEP34_POST_NEED_DEFAULT_LINE}
            </p>
          ) : null}

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
                <li key={reason.text} className="pl-1">
                  {reason.tone === 'extra-after-needs' ? (
                    <span className="block rounded-md border border-violet-200/90 bg-violet-50/95 px-2.5 py-1.5 text-violet-950 dark:border-violet-600 dark:bg-violet-950/45 dark:text-violet-100">
                      {reason.extraAfterNeedsCount != null ? (
                        <>
                          This team has{' '}
                          <span className={cn(STEP31_EXTRA_AFTER_NEEDS_TEXT_CLASS, 'tabular-nums')}>
                            {reason.extraAfterNeedsCount}
                          </span>{' '}
                          Step 3.4 {reason.extraAfterNeedsCount === 1 ? 'row' : 'rows'} from{' '}
                          <span className={STEP31_EXTRA_AFTER_NEEDS_TEXT_CLASS}>Extra after needs</span>{' '}
                          (required floating need was already satisfied).
                        </>
                      ) : (
                        reason.text
                      )}
                    </span>
                  ) : (
                    reason.text
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Step3V2LaneDetailShell>
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
