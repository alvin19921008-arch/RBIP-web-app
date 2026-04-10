'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
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
import type { Team } from '@/types/staff'
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
import { computeAdjacentSlotReservations, type SlotAssignment } from '@/lib/utils/reservationLogic'
import { buildStep34TeamDetailViewModel } from './step34/step34ViewModel'

import type { FloatingPCAConfigDialogV1Props } from './FloatingPCAConfigDialogV1'

type FloatingPCAConfigDialogV2Props = FloatingPCAConfigDialogV1Props

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

/** Badges on the light-blue Step 3.4 detail panel: high contrast vs panel tint. */
const STEP34_DETAIL_BADGE_CLASS =
  'border-blue-400/90 bg-white font-semibold text-blue-950 shadow-sm hover:bg-white dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-50 dark:hover:bg-blue-950/80'

type Step32Decision = 'system' | 'keep-preferred' | 'skip'
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

function getOrdinalLabel(rank: number): string {
  if (rank === 1) return '1st choice'
  if (rank === 2) return '2nd choice'
  if (rank === 3) return '3rd choice'
  return `${rank}th choice`
}

function getSlotTime(slot: number): string {
  if (slot === 1) return '0900-1030'
  if (slot === 2) return '1030-1200'
  if (slot === 3) return '1330-1500'
  return '1500-1630'
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
  const [teamOrder, setTeamOrder] = useState<Team[]>([])
  const [step31Preview, setStep31Preview] = useState<Step31PreviewState>({ status: 'idle' })
  const [step32Decisions, setStep32Decisions] = useState<Partial<Record<Team, Step32Decision>>>({})
  const [selectedStep32Team, setSelectedStep32Team] = useState<Team | null>(null)
  const [selectedStep33Team, setSelectedStep33Team] = useState<Team | null>(null)
  const [step33Decisions, setStep33Decisions] = useState<Partial<Record<Team, Step33Decision>>>({})
  const [step33SelectedOptionByTeam, setStep33SelectedOptionByTeam] = useState<Partial<Record<Team, string>>>({})
  const [step34PreviewResult, setStep34PreviewResult] = useState<FloatingPCAAllocationResultV2 | null>(null)
  const [step34SelectedTeam, setStep34SelectedTeam] = useState<Team | null>(null)
  const [step34Loading, setStep34Loading] = useState(false)
  const step34DetailPanelRef = useRef<HTMLDivElement | null>(null)
  const step34TeamButtonRefs = useRef<Map<Team, HTMLButtonElement>>(new Map())
  const [step34DetailBeakCenterX, setStep34DetailBeakCenterX] = useState<number | null>(null)
  const v2TeamLaneMeasureRef = useRef<HTMLDivElement | null>(null)
  const v2Step34SlotsRowMeasureRef = useRef<HTMLDivElement | null>(null)
  const v2DialogHeaderTitleRef = useRef<HTMLDivElement | null>(null)
  const v2DialogHeaderStepperRef = useRef<HTMLDivElement | null>(null)
  const [dialogFitWidthPx, setDialogFitWidthPx] = useState(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    if (!open) return

    const roundedInitial = emptyTeamRecord()
    activeTeams.forEach((team) => {
      roundedInitial[team] = roundToNearestQuarterWithMidpoint(initialPendingFTE[team] || 0)
    })
    const sortedTeams = sortTeamsByPendingFTE(activeTeams, roundedInitial, activeTeams)

    setAdjustedFTE(roundedInitial)
    setOriginalRoundedFTE(roundedInitial)
    setTeamOrder(sortedTeams)
    setCurrentStep('3.1')
    setStep32Decisions({})
    setSelectedStep32Team(null)
    setSelectedStep33Team(null)
    setStep33Decisions({})
    setStep33SelectedOptionByTeam({})
    setStep34PreviewResult(null)
    setStep34SelectedTeam(null)
    setStep34Loading(false)
  }, [open, activeTeams, initialPendingFTE])

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
  }, [open, activeTeams, adjustedFTE, teamOrder, existingAllocations, floatingPCAs, pcaPreferences, specialPrograms])

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

  const flaggedTeams = useMemo(
    () => teamOrder.filter((team) => reservationPreview.summary.needsAttentionTeams.includes(team)),
    [teamOrder, reservationPreview.summary.needsAttentionTeams]
  )

  const adjacentTeams = useMemo(
    () => teamOrder.filter((team) => (adjacentPreview.adjacentReservations[team] || []).length > 0),
    [teamOrder, adjacentPreview.adjacentReservations]
  )

  useEffect(() => {
    if (!selectedStep32Team || !flaggedTeams.includes(selectedStep32Team)) {
      setSelectedStep32Team(flaggedTeams[0] ?? null)
    }
  }, [flaggedTeams, selectedStep32Team])

  useEffect(() => {
    if (!selectedStep33Team || !adjacentTeams.includes(selectedStep33Team)) {
      setSelectedStep33Team(adjacentTeams[0] ?? null)
    }
  }, [adjacentTeams, selectedStep33Team])

  const currentStepIndex = visibleSteps.indexOf(currentStep)
  const backTarget = getStep3V2BackTarget({ currentStep, visibleSteps })
  const nextTarget = currentStepIndex >= 0 ? visibleSteps[currentStepIndex + 1] ?? null : null

  const selectedReservation = selectedStep32Team ? reservationPreview.teamReservations[selectedStep32Team] : null
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
    return flaggedTeams.flatMap((team) => {
      const decision = step32Decisions[team]
      const reservation = reservationPreview.teamReservations[team]
      if (decision !== 'system' || !reservation?.recommendedPcaId) return []
      return [
        {
          team,
          slot: reservation.slot,
          pcaId: reservation.recommendedPcaId,
          pcaName: reservation.recommendedPcaName ?? reservation.pcaNames[reservation.recommendedPcaId] ?? reservation.recommendedPcaId,
        },
      ]
    })
  }, [flaggedTeams, reservationPreview.teamReservations, step32Decisions])

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

  const runStep34Preview = useCallback(async () => {
    setStep34Loading(true)
    try {
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
        preferenceSelectionMode: 'selected_only',
        extraCoverageMode: 'round-robin-team-order',
      })
      setStep34PreviewResult(result)
      setStep34SelectedTeam((current) => current ?? teamOrder[0] ?? null)
    } finally {
      setStep34Loading(false)
    }
  }, [
    adjustedFTE,
    existingAllocations,
    floatingPCAs,
    pcaPreferences,
    specialPrograms,
    step32AssignmentsForSave,
    step33AssignmentsForSave,
    teamOrder,
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
      if (currentStep === '3.4') {
        const slotsRow = v2Step34SlotsRowMeasureRef.current
        const slotsW = slotsRow?.offsetWidth ?? 0
        if (slotsW > 0) {
          detailW = slotsW + 40
        }
      }
      const innerContent = Math.max(laneW, headerW, detailW, 280)
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
    flaggedTeams,
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
                      Projected extra coverage: {scarcitySummary.projectedExtraSlots} slot
                      {scarcitySummary.projectedExtraSlots === 1 ? '' : 's'}
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
                {teamOrder.map((team, index) => (
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
                        step31TeamTargets ? step31TeamTargets[team] ?? null : null
                      }
                      assignedFromSlotsFTE={
                        step31AssignedByTeam ? step31AssignedByTeam[team] ?? 0 : null
                      }
                    />
                    {index < teamOrder.length - 1 ? (
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : null}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  )

  const renderStep32 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 text-blue-600" />
        <span>
          {`${reservationPreview.summary.teamsChecked} checked, ${flaggedTeams.length} need attention, ${reservationPreview.summary.autoContinueTeams.length} continue automatically`}
          {reservationPreview.summary.gymRiskTeams.length > 0 ? `, gym risk: ${formatTeamList(reservationPreview.summary.gymRiskTeams)}` : ''}
          .
        </span>
      </div>

      <div className="flex justify-center pb-1">
        <div className="max-w-full overflow-x-auto">
          <div
            ref={v2TeamLaneMeasureRef}
            className="inline-flex flex-nowrap items-center gap-2"
          >
        {teamOrder.map((team, index) => {
          const isFlagged = flaggedTeams.includes(team)
          const isSelected = selectedStep32Team === team
          const reservation = reservationPreview.teamReservations[team]
          const compactState = !isFlagged
            ? 'No manual review needed'
            : reservation?.preferredPcaMayStillHelpLater
              ? 'Preferred PCA still possible'
              : 'No preferred PCA here'
          return (
            <button
              key={team}
              type="button"
              onClick={() => isFlagged && setSelectedStep32Team(team)}
              className={cn(
                'min-w-[118px] rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                isFlagged ? 'border-blue-300 bg-blue-50/80 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100' : 'border-border bg-muted/10 text-muted-foreground opacity-60',
                isSelected && 'ring-2 ring-blue-500'
              )}
            >
              <div className="text-[11px] text-muted-foreground">{getOrderLabel(index + 1)}</div>
              <div className="font-semibold">{team}</div>
              {isFlagged && reservation ? (
                <>
                  <div className="mt-1 text-[11px] leading-4">{`Expected ${adjustedFTE[team].toFixed(2)}`}</div>
                  <div className="text-[11px] leading-4">Assigned 0.00</div>
                  <div className="mt-2 inline-flex rounded-md bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-100">
                    {`Slot ${reservation.slot} · ${getSlotTime(reservation.slot)}`}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-[11px] leading-4">No manual review needed</div>
              )}
              <div className="mt-2 text-[11px] font-medium leading-4">{compactState}</div>
            </button>
          )
        })}
          </div>
        </div>
      </div>

      {selectedReservation && selectedStep32Team ? (
        <div className="space-y-4 rounded-xl border border-blue-200 bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-foreground">{selectedStep32Team}</div>
            <Badge>{`${getOrderLabel(teamOrder.indexOf(selectedStep32Team) + 1)} in order`}</Badge>
            <Badge variant="outline">{`Pending ${adjustedFTE[selectedStep32Team].toFixed(2)}`}</Badge>
            <Badge variant="secondary">Needs decision</Badge>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            {(selectedReservation.rankedChoices || []).map((choice) => (
              <div key={`${selectedStep32Team}-${choice.slot}`} className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs font-semibold text-foreground">{choice.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">{`Slot ${choice.slot} · ${getSlotTime(choice.slot)}`}</div>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-semibold text-foreground">Other slots</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {selectedReservation.otherSlots && selectedReservation.otherSlots.length > 0
                  ? selectedReservation.otherSlots.map((slot) => `Slot ${slot} · ${getSlotTime(slot)}`).join(', ')
                  : 'None'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:bg-blue-950/20">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200">
              {`${selectedStep32Team} review`}
            </div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div>{`No preferred PCA is available for ${getOrdinalLabel(1)} Slot ${selectedReservation.slot} · ${getSlotTime(selectedReservation.slot)}.`}</div>
              <div>{`System plans to use ${selectedReservation.recommendedPcaName || 'another available PCA'} first.`}</div>
              {selectedReservation.preferredPcaMayStillHelpLater ? (
                <div>{`Preferred PCA may still be used later for ${selectedReservation.rankedChoices?.[1] ? `Slot ${selectedReservation.rankedChoices[1].slot} · ${getSlotTime(selectedReservation.rankedChoices[1].slot)}` : 'a later ranked choice'}.`}</div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['system', 'keep-preferred', 'skip'] as Step32Decision[]).map((decision) => (
              <Button
                key={decision}
                variant={step32Decisions[selectedStep32Team] === decision ? 'default' : 'outline'}
                onClick={() =>
                  setStep32Decisions((prev) => ({
                    ...prev,
                    [selectedStep32Team]: decision,
                  }))
                }
              >
                {decision === 'system'
                  ? 'Use system plan'
                  : decision === 'keep-preferred'
                    ? 'Try to keep preferred PCA'
                    : 'Skip manual change'}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          No teams need manual preferred-slot review in this run.
        </div>
      )}
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
                  <div className="mt-1 text-[11px] leading-4">
                    {`${adjacentPreview.adjacentReservations[team].length} adjacent slot(s)`}
                  </div>
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
            <Badge variant="outline">{`Pending ${adjustedFTE[selectedStep33Team].toFixed(2)}`}</Badge>
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
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">{`${selectedStep34Detail.team} details`}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                These results belong to the selected team above.
              </div>
            </div>
            <Badge variant="outline" className={STEP34_DETAIL_BADGE_CLASS}>
              {selectedStep34Detail.summaryPills[0]?.label}
            </Badge>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {selectedStep34Detail.summaryPills.slice(1).map((pill) => (
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
