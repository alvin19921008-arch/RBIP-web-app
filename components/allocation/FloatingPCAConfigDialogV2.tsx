'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, GripVertical, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
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
  allocateFloatingPCA_rankedV2,
  type FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/pcaAllocation'
import {
  buildStep31PreviewExtraCoverageOptions,
  countProjectedExtraSlots,
} from '@/lib/features/schedule/step31ProjectedExtraSlots'
import { computeStep3V2ReservationPreview } from '@/lib/features/schedule/step3V2ReservationPreview'
import { computeAdjacentSlotReservations, type SlotAssignment } from '@/lib/utils/reservationLogic'
import { buildStep34TeamDetailViewModel } from './step34/step34ViewModel'

import type { FloatingPCAConfigDialogV1Props } from './FloatingPCAConfigDialogV1'

type FloatingPCAConfigDialogV2Props = FloatingPCAConfigDialogV1Props

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

type Step32Decision = 'system' | 'keep-preferred' | 'skip'
type Step33Decision = 'use' | 'skip'

interface V2ManualAssignment {
  team: Team
  slot: number
  pcaId: string
  source: 'step32' | 'step33'
}

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
        const standardRes = await allocateFloatingPCA_rankedV2(
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

  const step34Selections = useMemo<V2ManualAssignment[]>(() => {
    return [
      ...step32AssignmentsForSave.map((assignment) => ({
        team: assignment.team,
        slot: assignment.slot,
        pcaId: assignment.pcaId,
        source: 'step32' as const,
      })),
      ...step33AssignmentsForSave.map((assignment) => ({
        team: assignment.team,
        slot: assignment.slot,
        pcaId: assignment.pcaId,
        source: 'step33' as const,
      })),
    ]
  }, [step32AssignmentsForSave, step33AssignmentsForSave])

  const runStep34Preview = useCallback(async () => {
    setStep34Loading(true)
    try {
      const result = await allocateFloatingPCA_rankedV2({
        mode: 'standard',
        teamOrder,
        currentPendingFTE: { ...adjustedFTE },
        existingAllocations: existingAllocations.map((allocation) => ({ ...allocation })),
        pcaPool: floatingPCAs,
        pcaPreferences,
        specialPrograms,
        preferenceSelectionMode: 'selected_only',
        selectedPreferenceAssignments: step34Selections,
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
    step34Selections,
    teamOrder,
  ])

  useEffect(() => {
    if (!open || currentStep !== '3.4') return
    void runStep34Preview()
  }, [currentStep, open, runStep34Preview])

  const selectedStep34Detail = useMemo(() => {
    if (!step34PreviewResult || !selectedStep34Team) return null
    return buildStep34TeamDetailViewModel({
      team: selectedStep34Team,
      result: step34PreviewResult,
      pcaPreferences,
    })
  }, [pcaPreferences, selectedStep34Team, step34PreviewResult])

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

      <div className="rounded-xl border bg-background p-4">
        <div className="text-sm font-semibold text-foreground">Scarcity preview</div>
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          {step31Preview.status === 'loading' ? (
            <div>Calculating Step 3 preview…</div>
          ) : step31Preview.status === 'error' ? (
            <div>{`Preview unavailable: ${step31Preview.message}`}</div>
          ) : step31Preview.status === 'ready' ? (
            <>
              <div>{`Teams with 0 floating PCA (if run now): ${step31Preview.standardZeroTeams.length} · ${formatTeamList(step31Preview.standardZeroTeams)}`}</div>
              <div>{`Teams still short after allocation (if run now): ${step31Preview.balancedShortTeams.length} · ${formatTeamList(step31Preview.balancedShortTeams)}`}</div>
            </>
          ) : (
            <div>Preview is preparing…</div>
          )}
        </div>
        {step31Preview.status === 'ready' &&
        (step31Preview.standardZeroTeams.length > 0 || step31Preview.balancedShortTeams.length > 0) ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <div>
              <div className="font-medium">Watch teams with either no slot coverage or remaining shortfall.</div>
              <div className="mt-1 text-xs text-amber-800">
                Ranked V2 keeps this as a preview only, not as a user-facing engine switch.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="py-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={teamOrder} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto py-2">
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
                  />
                  {index < teamOrder.length - 1 ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : null}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
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
        <span>Gray means no adjacent help. Green means there is adjacent help to review.</span>
      </div>

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
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
              <div className="mt-1 text-[11px] leading-4">
                {hasAdjacent ? `${adjacentPreview.adjacentReservations[team].length} adjacent option(s)` : 'No reserved or adjacent slots'}
              </div>
              <div className="mt-2 text-[11px] font-medium leading-4">
                {hasAdjacent
                  ? decision === 'use'
                    ? 'Using adjacent help'
                    : decision === 'skip'
                      ? 'Skipping adjacent help'
                      : 'Adjacent help available'
                  : 'No adjacent help'}
              </div>
            </button>
          )
        })}
      </div>

      {selectedStep33Team ? (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-foreground">{selectedStep33Team}</div>
            <Badge variant="outline">{`Pending ${adjustedFTE[selectedStep33Team].toFixed(2)}`}</Badge>
            <Badge>{`${selectedAdjacentOptions.length} adjacent option(s)`}</Badge>
          </div>

          {selectedAdjacentOptions.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">{`${selectedStep33Team} review`}</div>
              {selectedAdjacentOptions.map((option) => {
                const optionKey = getAdjacentOptionKey(option)
                const isChosen = selectedAdjacentOption != null && getAdjacentOptionKey(selectedAdjacentOption) === optionKey
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
                      'w-full rounded-lg border bg-muted/20 p-3 text-left text-sm transition-colors',
                      isChosen && 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                    )}
                  >
                    <div className="font-medium text-foreground">{option.pcaName}</div>
                    <div className="mt-1 text-muted-foreground">
                      {`${option.specialProgramName} covers ${getSlotTime(option.specialProgramSlot)}, so ${getSlotTime(option.adjacentSlot)} is also available.`}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              No adjacent help is needed for this team in the current V2 path.
            </div>
          )}

          {selectedAdjacentOptions.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:bg-emerald-950/20">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                {`${selectedStep33Team} review`}
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div>{`A special-program PCA can also help at ${selectedAdjacentOption ? getSlotTime(selectedAdjacentOption.adjacentSlot) : 'this adjacent slot'}.`}</div>
                <div>This reduces pressure on the final floating allocation.</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant={step33Decisions[selectedStep33Team] === 'use' ? 'default' : 'outline'}
                  onClick={() =>
                    setStep33Decisions((prev) => ({
                      ...prev,
                      [selectedStep33Team]: 'use',
                    }))
                  }
                >
                  Use adjacent help
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
                  Skip adjacent help
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  const renderStep34 = () => (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Keep the selected team in focus to understand how Slots 1 to 4 were handled.
      </div>

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        {teamOrder.map((team, index) => {
          const isSelected = selectedStep34Team === team
          const pendingMet = step34PreviewResult?.tracker[team]?.summary.pendingMet
          return (
            <button
              key={team}
              type="button"
              onClick={() => setStep34SelectedTeam(team)}
              className={cn(
                'min-w-[118px] rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary/40'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/20'
              )}
            >
              <div className="text-[11px] text-muted-foreground">{getOrderLabel(index + 1)}</div>
              <div className="font-semibold">{team}</div>
              <div className="mt-1 text-[11px] leading-4">{pendingMet ? 'Pending met' : 'Pending not fully met'}</div>
            </button>
          )
        })}
      </div>

      {step34Loading ? (
        <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          Building the ranked-slot review...
        </div>
      ) : selectedStep34Detail ? (
        <div className="relative rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm dark:bg-blue-950/10">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">{`${selectedStep34Detail.team} details`}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                These results belong to the selected team above.
              </div>
            </div>
            <Badge variant="secondary">{selectedStep34Detail.summaryPills[0]?.label}</Badge>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {selectedStep34Detail.summaryPills.slice(1).map((pill) => (
              <Badge
                key={`${selectedStep34Detail.team}-${pill.label}`}
                variant={pill.tone === 'muted' ? 'outline' : 'secondary'}
              >
                {pill.label}
              </Badge>
            ))}
          </div>

          <div className="flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1">
            {selectedStep34Detail.slotCards.map((card, index) => (
              <div key={`${selectedStep34Detail.team}-${card.slot}`} className="flex items-center gap-2">
                <div className="min-w-[126px] rounded-xl border bg-background p-3">
                  <div className="text-xs font-semibold text-muted-foreground">{card.label}</div>
                  <div className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {card.timeRange}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{card.resultLabel}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{card.detailLabel}</div>
                </div>
                {index < selectedStep34Detail.slotCards.length - 1 ? (
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border bg-background p-4">
            <div className="text-sm font-semibold text-foreground">Why this happened</div>
            <ul className="mt-2 space-y-2 pl-5 text-sm text-muted-foreground">
              {selectedStep34Detail.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          <div className="pointer-events-none absolute -top-1 left-8 h-4 w-4 rotate-45 border-l border-t border-blue-200 bg-blue-50/80 dark:bg-blue-950/20" />
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
      <DialogContent className="flex w-[calc(100vw-16px)] max-w-2xl flex-col overflow-hidden sm:w-full">
        <DialogHeader className="gap-3 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <DialogTitle>Floating PCA allocation</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">{`Step ${currentStep} · ${stepLabel(currentStep)}`}</DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground sm:justify-end">
            {visibleSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                {index > 0 ? <span className="text-slate-400">•</span> : null}
                <span
                  className={cn(
                    currentStep === step ? 'rounded-full bg-slate-100 px-3 py-1 font-semibold text-foreground dark:bg-slate-700' : ''
                  )}
                >
                  {getStepDisplayLabel(step)}
                </span>
              </div>
            ))}
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
