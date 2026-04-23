import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { flushSync } from 'react-dom'
import type { Team, Staff, LeaveType } from '@/types/staff'
import type { PCAAllocation, ScheduleStepId, StepStatus, TherapistAllocation } from '@/types/schedule'
import type { PCAAllocationErrors } from '@/lib/features/schedule/controller/useScheduleController'
import type { SpecialProgram, SPTAllocation } from '@/types/allocation'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import { getWeekday } from '@/lib/features/schedule/date'
import { resetStep2OverridesForAlgoEntry } from '@/lib/features/schedule/stepReset'
import { applySptFinalEditToTherapistAllocations } from '@/lib/features/schedule/sptFinalEdit'
import { mergeStep2Point2StaffOverrides } from '@/lib/features/schedule/step2Point2StateMerge'
import {
  applySharedTherapistEditsToTherapistAllocations,
  buildSharedTherapistTeamFteByTeam,
  mergeStep2Point3SharedTherapistOverrides,
  type SharedTherapistSlotTeams,
} from '@/lib/features/schedule/sharedTherapistStep'
import { buildStaffByIdMap } from '@/lib/features/schedule/grouping'
import { promoteInactiveStaffToBufferAction } from '@/app/(dashboard)/schedule/actions'
import {
  type SharedTherapistDialogCurrentAllocation,
  type SharedTherapistDialogData,
  type SpecialProgramOverrideEntry,
  type SptFinalEditUpdate,
  type SharedTherapistEditUpdate,
} from '@/features/schedule/ui/overlays/SchedulePageDialogNodes'
import type { Step2FinalizeContext } from '@/features/schedule/ui/hooks/useScheduleStep2DependencyAndToast'

const prefetchSpecialProgramOverrideDialog = () => import('@/components/allocation/SpecialProgramOverrideDialog')
const prefetchSptFinalEditDialog = () => import('@/components/allocation/SptFinalEditDialog')
const prefetchSharedTherapistEditDialog = () => import('@/components/allocation/SharedTherapistEditDialog')
const prefetchNonFloatingSubstitutionDialog = () => import('@/components/allocation/NonFloatingSubstitutionDialog')
const prefetchFloatingPCAEntryDialog = () =>
  import('@/features/schedule/ui/steps/step3-floating/substeps/step30-entry-flow/FloatingPCAEntryDialog')
const prefetchFloatingPCAConfigDialogV1 = () => import('@/features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV1')

type Step2RunResult = Record<Team, (PCAAllocation & { staff: Staff })[]>

export type ScheduleAlgorithmEntryActions = {
  runStep2TherapistAndNonFloatingPCA: (args: {
    cleanedOverrides?: StaffOverrides
    toast: any
    onStep21Projection: (args: { showStep21: boolean }) => void
    onNonFloatingSubstitutionWizard?: (params: {
      teams: Team[]
      substitutionsByTeam: Record<Team, any[]>
      isWizardMode: boolean
      initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
    }) => Promise<Record<string, Array<{ floatingPCAId: string; slots: number[] }>>>
  }) => Promise<Step2RunResult>
  runStep3FloatingPCA: (args: {
    userAdjustedPendingFTE?: Record<Team, number>
    userTeamOrder?: Team[]
    onTieBreak: (args: { teams: Team[]; pendingFTE: number }) => Promise<Team>
  }) => Promise<void>
  resetStep3ForReentry: () => void
}

export function useScheduleAlgorithmEntry(args: {
  scheduleActions: ScheduleAlgorithmEntryActions
  /** Controller may type this as `string`; switch arms match known schedule steps. */
  currentStep: ScheduleStepId | string
  stepStatus: Record<string, StepStatus>
  selectedDate: Date
  staff: Staff[]
  bufferStaff: Staff[]
  inactiveStaff: Staff[]
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  staffOverrides: StaffOverrides
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]>
  pendingPCAFTEPerTeam: Record<Team, number>
  step2Result: unknown
  initializedSteps: Set<string>
  pcaAllocationErrors: PCAAllocationErrors
  recalculationTeams: Team[]
  showActionToast: (title: string, variant: 'success' | 'error' | 'warning', description?: string) => void
  step2ToastProxy: any
  runStep4BedRelieving: (opts: {
    toast: (title: string, variant: 'success' | 'error' | 'warning', description?: string) => void
  }) => void
  onNonFloatingSubstitutionWizard: NonNullable<
    Parameters<ScheduleAlgorithmEntryActions['runStep2TherapistAndNonFloatingPCA']>[0]['onNonFloatingSubstitutionWizard']
  >
  setStep21RuntimeVisible: Dispatch<SetStateAction<boolean | null>>
  setShowSpecialProgramOverrideDialog: Dispatch<SetStateAction<boolean>>
  specialProgramOverrideResolverRef: MutableRefObject<
    ((overrides: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }> | null) => void) | null
  >
  sptFinalEditResolverRef: MutableRefObject<((updates: Record<string, SptFinalEditUpdate> | null) => void) | null>
  setShowSptFinalEditDialog: Dispatch<SetStateAction<boolean>>
  sharedTherapistEditResolverRef: MutableRefObject<
    ((updates: Record<string, SharedTherapistEditUpdate> | null) => void) | null
  >
  setSharedTherapistDialogData: Dispatch<SetStateAction<SharedTherapistDialogData | null>>
  setShowSharedTherapistEditDialog: Dispatch<SetStateAction<boolean>>
  tieBreakResolverRef: MutableRefObject<((team: Team) => void) | null>
  setTieBreakTeams: Dispatch<SetStateAction<Team[]>>
  setTieBreakPendingFTE: Dispatch<SetStateAction<number>>
  setTieBreakDialogOpen: Dispatch<SetStateAction<boolean>>
  setTherapistAllocations: (v: SetStateAction<Record<Team, (TherapistAllocation & { staff: Staff })[]>>) => void
  setPcaAllocations: (v: SetStateAction<Record<Team, (PCAAllocation & { staff: Staff })[]>>) => void
  setStaffOverrides: (v: SetStateAction<StaffOverrides>) => void
  setPendingPCAFTEPerTeam: (v: SetStateAction<Record<Team, number>>) => void
  setStep2Result: (v: SetStateAction<any>) => void
  setStepStatus: (v: SetStateAction<Record<string, StepStatus>>) => void
  setInitializedSteps: (v: SetStateAction<Set<string>>) => void
  setPcaAllocationErrors: (v: SetStateAction<PCAAllocationErrors>) => void
  latestStaffOverridesRef: MutableRefObject<StaffOverrides>
  latestTherapistAllocationsRef: MutableRefObject<Record<Team, (TherapistAllocation & { staff: Staff })[]>>
  latestPcaAllocationsRef: MutableRefObject<Record<Team, (PCAAllocation & { staff: Staff })[]>>
  bufferStep2SuccessToastRef: MutableRefObject<boolean>
  step2WizardAllowBackToSpecialProgramsRef: MutableRefObject<boolean>
  pendingStep2OverridesFromDialogRef: MutableRefObject<Record<string, any> | null>
  pendingStep2ResolveAfterPromotionRef: MutableRefObject<(() => void) | null>
  pendingPromotedInactiveStaffIdsRef: MutableRefObject<string[] | null>
  setPendingStep2AfterInactivePromotion: Dispatch<SetStateAction<boolean>>
  recalculateScheduleCalculations: (opts?: {
    forceWithoutAllocations?: boolean
    source?: {
      pcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]>
      therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
      staffOverrides: StaffOverrides
    }
  }) => void
  captureStep2DependencyBaseline: (context?: Step2FinalizeContext) => void
  getSpecialProgramFinalizeContext: (
    overrides?: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }> | null
  ) => Step2FinalizeContext
  finalizeStep2DependencyChanges: () => void
  scheduleFinalizeStep2DependencyChanges: () => void
  clearBufferedStep2Toast: () => void
  flushBufferedStep2Toast: (opts: { awaitCalculations: boolean }) => void
  startBufferedStep2ToastSession: () => void
  clearStep3StateOnly: () => void
  clearStep3AllocationsPreserveStep2: () => void
  openStep3EntryDialog: () => void
  loadStaff: () => Promise<void>
  loadSPTAllocations: () => Promise<void>
}): {
  generateStep2_TherapistAndNonFloatingPCA: (
    cleanedOverrides?: StaffOverrides
  ) => Promise<Record<Team, (PCAAllocation & { staff: Staff })[]>>
  generateStep3_FloatingPCA: (
    userAdjustedPendingFTE?: Record<Team, number>,
    userTeamOrder?: Team[]
  ) => Promise<void>
  runStep2WithHarnessSubstitutionAuto: (
    cleanedOverrides: StaffOverrides | undefined,
    autoSelectSubstitutions: (params: {
      teams: Team[]
      substitutionsByTeam: Record<Team, any[]>
    }) => Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  ) => Promise<Step2RunResult>
  calculateStep4_BedRelieving: () => void
  showStep2Point2_SptFinalEdit: () => Promise<Record<string, SptFinalEditUpdate> | null>
  applyStep2Point2_SptFinalEdits: (updates: Record<string, SptFinalEditUpdate>) => {
    nextStaffOverrides: StaffOverrides
    nextTherapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  }
  showSharedTherapistStep: boolean
  showStep2Point3_SharedTherapistEdit: (source?: {
    staffOverrides?: Record<string, any>
    therapistAllocations?: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  }) => Promise<Record<string, SharedTherapistEditUpdate> | null>
  applyStep2Point3_SharedTherapistEdits: (updates: Record<string, SharedTherapistEditUpdate>) => {
    nextStaffOverrides: StaffOverrides
    nextTherapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  }
  handleInitializeAlgorithm: () => Promise<void>
} {
  const {
    scheduleActions,
    currentStep,
    stepStatus,
    selectedDate,
    staff,
    bufferStaff,
    inactiveStaff,
    specialPrograms,
    sptAllocations,
    staffOverrides,
    therapistAllocations,
    pcaAllocations,
    pendingPCAFTEPerTeam,
    step2Result,
    initializedSteps,
    pcaAllocationErrors,
    recalculationTeams,
    showActionToast,
    step2ToastProxy,
    runStep4BedRelieving,
    onNonFloatingSubstitutionWizard,
    setStep21RuntimeVisible,
    setShowSpecialProgramOverrideDialog,
    specialProgramOverrideResolverRef,
    sptFinalEditResolverRef,
    setShowSptFinalEditDialog,
    sharedTherapistEditResolverRef,
    setSharedTherapistDialogData,
    setShowSharedTherapistEditDialog,
    tieBreakResolverRef,
    setTieBreakTeams,
    setTieBreakPendingFTE,
    setTieBreakDialogOpen,
    setTherapistAllocations,
    setPcaAllocations,
    setStaffOverrides,
    setPendingPCAFTEPerTeam,
    setStep2Result,
    setStepStatus,
    setInitializedSteps,
    setPcaAllocationErrors,
    latestStaffOverridesRef,
    latestTherapistAllocationsRef,
    latestPcaAllocationsRef,
    bufferStep2SuccessToastRef,
    step2WizardAllowBackToSpecialProgramsRef,
    pendingStep2OverridesFromDialogRef,
    pendingStep2ResolveAfterPromotionRef,
    pendingPromotedInactiveStaffIdsRef,
    setPendingStep2AfterInactivePromotion,
    recalculateScheduleCalculations,
    captureStep2DependencyBaseline,
    getSpecialProgramFinalizeContext,
    finalizeStep2DependencyChanges,
    scheduleFinalizeStep2DependencyChanges,
    clearBufferedStep2Toast,
    flushBufferedStep2Toast,
    startBufferedStep2ToastSession,
    clearStep3StateOnly,
    clearStep3AllocationsPreserveStep2,
    openStep3EntryDialog,
    loadStaff,
    loadSPTAllocations,
  } = args

  const generateStep2_TherapistAndNonFloatingPCA = async (
    cleanedOverrides?: StaffOverrides
  ): Promise<Record<Team, (PCAAllocation & { staff: Staff })[]>> => {
    setStep21RuntimeVisible(false)
    return await scheduleActions.runStep2TherapistAndNonFloatingPCA({
      cleanedOverrides: cleanedOverrides as any,
      toast: step2ToastProxy,
      onStep21Projection: ({ showStep21 }) => {
        setStep21RuntimeVisible(showStep21)
      },
      onNonFloatingSubstitutionWizard,
    })
  }

  const runStep2WithHarnessSubstitutionAuto = useCallback(
    async (
      cleanedOverrides: StaffOverrides | undefined,
      autoSelectSubstitutions: (params: {
        teams: Team[]
        substitutionsByTeam: Record<Team, any[]>
      }) => Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
    ) => {
      setStep21RuntimeVisible(false)
      return await scheduleActions.runStep2TherapistAndNonFloatingPCA({
        cleanedOverrides: cleanedOverrides as any,
        toast: showActionToast,
        onStep21Projection: ({ showStep21 }) => {
          setStep21RuntimeVisible(showStep21)
        },
        onNonFloatingSubstitutionWizard: async ({ teams, substitutionsByTeam }) => {
          return autoSelectSubstitutions({ teams, substitutionsByTeam: substitutionsByTeam as any })
        },
      })
    },
    [scheduleActions, setStep21RuntimeVisible, showActionToast]
  )

  const generateStep3_FloatingPCA = async (
    userAdjustedPendingFTE?: Record<Team, number>,
    userTeamOrder?: Team[]
  ) => {
    await scheduleActions.runStep3FloatingPCA({
      userAdjustedPendingFTE,
      userTeamOrder,
      onTieBreak: async ({ teams, pendingFTE }) => {
        return await new Promise<Team>((resolve) => {
          setTieBreakTeams(teams)
          setTieBreakPendingFTE(pendingFTE)
          const resolver = (selectedTeam: Team) => {
            resolve(selectedTeam)
          }
          tieBreakResolverRef.current = resolver
          setTieBreakDialogOpen(true)
        })
      },
    })
  }

  const calculateStep4_BedRelieving = () => {
    runStep4BedRelieving({ toast: showActionToast })
  }

  const showStep2Point2_SptFinalEdit = useCallback(async (): Promise<Record<string, SptFinalEditUpdate> | null> => {
    const hasAnySPT = [...staff, ...bufferStaff].some((s) => s.rank === 'SPT')
    if (!hasAnySPT) return {}

    prefetchSptFinalEditDialog().catch(() => {})
    return await new Promise((resolve) => {
      const resolver = (updates: Record<string, SptFinalEditUpdate> | null) => {
        resolve(updates)
      }
      sptFinalEditResolverRef.current = resolver
      setShowSptFinalEditDialog(true)
    })
  }, [staff, bufferStaff, setShowSptFinalEditDialog, sptFinalEditResolverRef])

  const applyStep2Point2_SptFinalEdits = useCallback(
    (updates: Record<string, SptFinalEditUpdate>) => {
      captureStep2DependencyBaseline({
        kind: 'spt-final-edits',
        explicitStep4Change: true,
      })
      const allStaffForMap = [...staff, ...bufferStaff]
      const staffById = buildStaffByIdMap(allStaffForMap)
      const currentStaffOverrides = latestStaffOverridesRef.current
      const currentTherapistAllocations = latestTherapistAllocationsRef.current
      const currentPcaAllocations = latestPcaAllocationsRef.current

      const sanitized: Record<string, { leaveType: LeaveType | null; fteRemaining: number; team?: Team; sptOnDayOverride: any }> = {}
      Object.entries(updates || {}).forEach(([staffId, u]) => {
        const cfg: any = u?.sptOnDayOverride ?? {}
        const enabled = !!cfg.enabled
        const slots = Array.isArray(cfg.slots) ? cfg.slots : []
        const shouldAllocate = enabled && slots.length > 0
        const team = shouldAllocate ? ((u.team ?? cfg.assignedTeam) as Team | undefined) : undefined
        sanitized[staffId] = {
          leaveType: u.leaveType ?? null,
          fteRemaining: typeof u.fteRemaining === 'number' ? u.fteRemaining : 0,
          team,
          sptOnDayOverride: {
            ...cfg,
            assignedTeam: shouldAllocate ? (team ?? null) : null,
          },
        }
      })
      const nextStaffOverrides = mergeStep2Point2StaffOverrides({
        baseOverrides: currentStaffOverrides as any,
        updates: updates as any,
      })

      const nextTherapistAllocations = applySptFinalEditToTherapistAllocations({
        therapistAllocations: currentTherapistAllocations as any,
        updatesByStaffId: sanitized as any,
        staffById,
        date: selectedDate,
      }) as any

      latestStaffOverridesRef.current = nextStaffOverrides as any
      latestTherapistAllocationsRef.current = nextTherapistAllocations as any

      flushSync(() => {
        setStaffOverrides(nextStaffOverrides)
        setTherapistAllocations(nextTherapistAllocations)
        recalculateScheduleCalculations({
          forceWithoutAllocations: true,
          source: {
            pcaAllocations: currentPcaAllocations,
            therapistAllocations: nextTherapistAllocations,
            staffOverrides: nextStaffOverrides,
          },
        })
      })
      finalizeStep2DependencyChanges()

      return {
        nextStaffOverrides,
        nextTherapistAllocations,
      }
    },
    [
      staff,
      bufferStaff,
      selectedDate,
      recalculateScheduleCalculations,
      captureStep2DependencyBaseline,
      finalizeStep2DependencyChanges,
      latestPcaAllocationsRef,
      latestStaffOverridesRef,
      latestTherapistAllocationsRef,
      setStaffOverrides,
      setTherapistAllocations,
    ]
  )

  const sharedTherapistsForStep23 = useMemo(() => {
    return staff.filter((s) => (s.rank === 'APPT' || s.rank === 'RPT') && s.team === null && (s.status ?? 'active') === 'active')
  }, [staff])

  const showSharedTherapistStep = useMemo(() => {
    if (sharedTherapistsForStep23.length === 0) return false
    if (sharedTherapistsForStep23.length === 1) {
      const therapist = sharedTherapistsForStep23[0]
      const fteRemaining =
        typeof staffOverrides?.[therapist.id]?.fteRemaining === 'number' ? staffOverrides[therapist.id].fteRemaining : 1
      if (fteRemaining <= 0) return false
    }
    return true
  }, [sharedTherapistsForStep23, staffOverrides])

  const buildSharedTherapistDialogData = useCallback(
    (source?: {
      staffOverrides?: Record<string, any>
      therapistAllocations?: Record<Team, (TherapistAllocation & { staff: Staff })[]>
    }): SharedTherapistDialogData => {
      const effectiveOverrides = source?.staffOverrides ?? latestStaffOverridesRef.current
      const effectiveTherapistAllocations = source?.therapistAllocations ?? latestTherapistAllocationsRef.current
      const sharedTherapistIds = new Set(sharedTherapistsForStep23.map((staffMember) => staffMember.id))
      const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
      const currentAllocationByStaffId: Record<string, SharedTherapistDialogCurrentAllocation> = {}

      for (const sharedTherapist of sharedTherapistsForStep23) {
        currentAllocationByStaffId[sharedTherapist.id] = {
          teamFteByTeam: {},
          slotTeamBySlot: {},
        }
      }

      for (const team of recalculationTeams) {
        for (const allocation of effectiveTherapistAllocations?.[team] ?? []) {
          ptPerTeamByTeam[team] += allocation.fte_therapist ?? 0
          if (!sharedTherapistIds.has(allocation.staff_id)) continue

          const current = currentAllocationByStaffId[allocation.staff_id] ?? {
            teamFteByTeam: {},
            slotTeamBySlot: {},
          }
          current.teamFteByTeam[team] = Number(
            (((current.teamFteByTeam[team] ?? 0) + (allocation.fte_therapist ?? 0)) as number).toFixed(2)
          )
          if (allocation.slot1 === team) current.slotTeamBySlot[1] = team
          if (allocation.slot2 === team) current.slotTeamBySlot[2] = team
          if (allocation.slot3 === team) current.slotTeamBySlot[3] = team
          if (allocation.slot4 === team) current.slotTeamBySlot[4] = team
          currentAllocationByStaffId[allocation.staff_id] = current
        }
      }

      Object.entries(effectiveOverrides ?? {}).forEach(([staffId, override]) => {
        if (!sharedTherapistIds.has(staffId)) return
        const slotTeams = (override as any)?.sharedTherapistSlotTeams as SharedTherapistSlotTeams | undefined
        if (!slotTeams || Object.keys(slotTeams).length === 0) return
        currentAllocationByStaffId[staffId] = {
          teamFteByTeam: buildSharedTherapistTeamFteByTeam({ slotTeamBySlot: slotTeams }),
          slotTeamBySlot: { ...slotTeams },
        }
      })

      return {
        sharedTherapists: sharedTherapistsForStep23,
        staffOverrides: effectiveOverrides,
        currentAllocationByStaffId,
        ptPerTeamByTeam,
      }
    },
    [recalculationTeams, sharedTherapistsForStep23, latestStaffOverridesRef, latestTherapistAllocationsRef]
  )

  const showStep2Point3_SharedTherapistEdit = useCallback(
    async (source?: {
      staffOverrides?: Record<string, any>
      therapistAllocations?: Record<Team, (TherapistAllocation & { staff: Staff })[]>
    }): Promise<Record<string, SharedTherapistEditUpdate> | null> => {
      if (!showSharedTherapistStep) return {}

      const dialogData = buildSharedTherapistDialogData(source)
      prefetchSharedTherapistEditDialog().catch(() => {})

      return await new Promise((resolve) => {
        const resolver = (updates: Record<string, SharedTherapistEditUpdate> | null) => {
          resolve(updates)
        }
        sharedTherapistEditResolverRef.current = resolver
        setSharedTherapistDialogData(dialogData)
        setShowSharedTherapistEditDialog(true)
      })
    },
    [
      buildSharedTherapistDialogData,
      showSharedTherapistStep,
      setSharedTherapistDialogData,
      setShowSharedTherapistEditDialog,
      sharedTherapistEditResolverRef,
    ]
  )

  const applyStep2Point3_SharedTherapistEdits = useCallback(
    (updates: Record<string, SharedTherapistEditUpdate>) => {
      captureStep2DependencyBaseline({
        kind: 'shared-therapist-edits',
        explicitStep4Change: true,
      })
      const allStaffForMap = [...staff, ...bufferStaff]
      const staffById = buildStaffByIdMap(allStaffForMap)
      const currentStaffOverrides = latestStaffOverridesRef.current
      const currentTherapistAllocations = latestTherapistAllocationsRef.current
      const currentPcaAllocations = latestPcaAllocationsRef.current

      const nextStaffOverrides = mergeStep2Point3SharedTherapistOverrides({
        baseOverrides: currentStaffOverrides as any,
        updates: updates as any,
      })

      const nextTherapistAllocations = applySharedTherapistEditsToTherapistAllocations({
        therapistAllocations: currentTherapistAllocations as any,
        updatesByStaffId: updates as any,
        staffById,
        date: selectedDate,
      }) as any

      latestStaffOverridesRef.current = nextStaffOverrides as any
      latestTherapistAllocationsRef.current = nextTherapistAllocations as any

      flushSync(() => {
        setStaffOverrides(nextStaffOverrides)
        setTherapistAllocations(nextTherapistAllocations)
        recalculateScheduleCalculations({
          forceWithoutAllocations: true,
          source: {
            pcaAllocations: currentPcaAllocations,
            therapistAllocations: nextTherapistAllocations,
            staffOverrides: nextStaffOverrides,
          },
        })
      })
      finalizeStep2DependencyChanges()

      return {
        nextStaffOverrides,
        nextTherapistAllocations,
      }
    },
    [
      bufferStaff,
      recalculateScheduleCalculations,
      selectedDate,
      staff,
      captureStep2DependencyBaseline,
      finalizeStep2DependencyChanges,
      latestPcaAllocationsRef,
      latestStaffOverridesRef,
      latestTherapistAllocationsRef,
      setStaffOverrides,
      setTherapistAllocations,
    ]
  )

  const handleInitializeAlgorithm = async () => {
    switch (currentStep) {
      case 'therapist-pca': {
        let cancelled = false
        const bufferPCAs = bufferStaff.filter((s) => s.rank === 'PCA' && s.status === 'buffer' && !s.floating)
        const unassignedBufferPCAs = bufferPCAs.filter((s) => !s.team)

        if (unassignedBufferPCAs.length > 0) {
          const names = unassignedBufferPCAs.map((s) => s.name).join(', ')
          showActionToast('Non-floating buffer PCA must be assigned to a team before proceeding.', 'warning', `Unassigned: ${names}`)
          return
        }

        const weekday = getWeekday(selectedDate)
        const activeSpecialPrograms = specialPrograms.filter((p) => p.weekdays.includes(weekday))

        if (activeSpecialPrograms.length > 0) {
          return new Promise<void>((resolve) => {
            const resolver = (
              overrides: Record<
                string,
                {
                  fteRemaining?: number
                  availableSlots?: number[]
                  specialProgramOverrides?: Array<{
                    programId: string
                    enabled?: boolean
                    therapistId?: string
                    pcaId?: string
                    slots?: number[]
                    requiredSlots?: number[]
                    therapistFTESubtraction?: number
                    pcaFTESubtraction?: number
                    drmAddOn?: number
                  }>
                }
              > | null
            ) => {
              if (overrides === null) {
                setShowSpecialProgramOverrideDialog(false)
                specialProgramOverrideResolverRef.current = null
                resolve()
                return
              }

              const snapshot = {
                therapistAllocations,
                pcaAllocations,
                staffOverrides,
                pendingPCAFTEPerTeam,
                step2Result,
                stepStatus,
                initializedSteps,
                pcaAllocationErrors,
              }
              const inactiveSelectedIds = Object.keys(overrides).filter((id) => inactiveStaff.some((s) => s.id === id))
              if (inactiveSelectedIds.length > 0) {
                pendingStep2OverridesFromDialogRef.current = overrides as any
                pendingStep2ResolveAfterPromotionRef.current = resolve
                pendingPromotedInactiveStaffIdsRef.current = inactiveSelectedIds

                ;(async () => {
                  try {
                    const promotionResult = await promoteInactiveStaffToBufferAction(inactiveSelectedIds)
                    if (!promotionResult.ok) {
                      console.error('Error promoting inactive staff to buffer:', promotionResult.error)
                    }

                    await loadStaff()
                    await loadSPTAllocations()
                  } catch (e) {
                    console.error('Error promoting inactive staff to buffer:', e)
                  } finally {
                    setPendingStep2AfterInactivePromotion(true)
                  }
                })().catch(() => {})

                return
              }

              const mergedOverrides: Record<string, any> = { ...(staffOverrides as any) }
              const touchedProgramIds = new Set(
                Object.values(overrides).flatMap((override: any) =>
                  Array.isArray((override as any)?.specialProgramOverrides)
                    ? (override as any).specialProgramOverrides
                        .map((entry: any) => String(entry?.programId ?? ''))
                        .filter((id: string) => id.length > 0)
                    : []
                )
              )
              if (touchedProgramIds.size > 0) {
                Object.entries(mergedOverrides).forEach(([ownerId, ownerOverride]: any) => {
                  const currentList = ownerOverride?.specialProgramOverrides
                  if (!Array.isArray(currentList) || currentList.length === 0) return
                  const filtered = currentList.filter((entry: any) => !touchedProgramIds.has(String(entry?.programId ?? '')))
                  if (filtered.length === currentList.length) return
                  if (filtered.length === 0) {
                    const { specialProgramOverrides: _omit, ...rest } = ownerOverride
                    mergedOverrides[ownerId] = rest
                    return
                  }
                  mergedOverrides[ownerId] = {
                    ...ownerOverride,
                    specialProgramOverrides: filtered,
                  }
                })
              }
              Object.entries(overrides).forEach(([staffId, override]) => {
                if (mergedOverrides[staffId]) {
                  mergedOverrides[staffId] = {
                    ...mergedOverrides[staffId],
                    ...override,
                    specialProgramOverrides: override.specialProgramOverrides,
                  }
                } else {
                  const staffMember =
                    staff.find((s) => s.id === staffId) ?? bufferStaff.find((s) => s.id === staffId) ?? inactiveStaff.find((s) => s.id === staffId)
                  const isBuffer = staffMember?.status === 'buffer'
                  const weekdayInner = getWeekday(selectedDate)
                  const sptConfiguredFte = (() => {
                    if (!staffMember || staffMember.rank !== 'SPT') return undefined
                    const cfg = sptAllocations.find((a) => a.staff_id === staffMember.id && a.weekdays?.includes(weekdayInner))
                    const raw = (cfg as any)?.fte_addon
                    const fte = typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
                    return Number.isFinite(fte) ? Math.max(0, Math.min(fte, 1.0)) : undefined
                  })()
                  const baseFTE =
                    isBuffer && typeof staffMember?.buffer_fte === 'number'
                      ? staffMember!.buffer_fte
                      : staffMember?.rank === 'SPT'
                        ? (sptConfiguredFte ?? 1.0)
                        : 1.0
                  mergedOverrides[staffId] = {
                    leaveType: null,
                    fteRemaining: override.fteRemaining ?? baseFTE,
                    ...override,
                  }
                }
              })

              captureStep2DependencyBaseline(getSpecialProgramFinalizeContext(overrides))
              setStaffOverrides(mergedOverrides)

              const cleanedOverrides = resetStep2OverridesForAlgoEntry({
                staffOverrides: mergedOverrides,
                allStaff: [...staff, ...bufferStaff],
              })
              setStaffOverrides(cleanedOverrides)

              ;(async () => {
                try {
                  startBufferedStep2ToastSession()
                  step2WizardAllowBackToSpecialProgramsRef.current = true

                  step2RunLoop: while (true) {
                    await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)

                    step2ReviewLoop: while (true) {
                      const step22 = await showStep2Point2_SptFinalEdit()
                      if (step22 === null) {
                        clearBufferedStep2Toast()
                        break step2RunLoop
                      }
                      if (step22 && (step22 as any).__nav === 'back') {
                        continue step2RunLoop
                      }

                      let nextStep2Point2Source:
                        | {
                            staffOverrides: Record<string, any>
                            therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
                          }
                        | undefined

                      const hasStep22Updates = !!(step22 && Object.keys(step22).length > 0)
                      if (hasStep22Updates) {
                        const applied = applyStep2Point2_SptFinalEdits(step22)
                        nextStep2Point2Source = {
                          staffOverrides: applied.nextStaffOverrides as any,
                          therapistAllocations: applied.nextTherapistAllocations as any,
                        }
                      }

                      const step23 = await showStep2Point3_SharedTherapistEdit(nextStep2Point2Source)
                      if (step23 === null) {
                        clearBufferedStep2Toast()
                        break step2RunLoop
                      }
                      if (step23 && (step23 as any).__nav === 'back') {
                        continue step2ReviewLoop
                      }

                      const hasStep23Updates = !!(step23 && Object.keys(step23).length > 0)
                      if (hasStep23Updates) {
                        applyStep2Point3_SharedTherapistEdits(step23)
                      }

                      flushBufferedStep2Toast({ awaitCalculations: hasStep22Updates || hasStep23Updates })
                      scheduleFinalizeStep2DependencyChanges()
                      break step2RunLoop
                    }
                  }
                } catch (e: any) {
                  if (e?.code === 'user_cancelled' || String(e?.message ?? '').includes('user_cancelled')) {
                    clearBufferedStep2Toast()
                    bufferStep2SuccessToastRef.current = false
                    setTherapistAllocations(snapshot.therapistAllocations as any)
                    setPcaAllocations(snapshot.pcaAllocations as any)
                    setStaffOverrides(snapshot.staffOverrides as any)
                    setPendingPCAFTEPerTeam(snapshot.pendingPCAFTEPerTeam as any)
                    setStep2Result(snapshot.step2Result as any)
                    setStepStatus(snapshot.stepStatus as any)
                    setInitializedSteps(snapshot.initializedSteps as any)
                    setPcaAllocationErrors(snapshot.pcaAllocationErrors as any)
                    resolve()
                    return
                  }
                  if (e?.code === 'wizard_back' || String(e?.message ?? '').includes('wizard_back')) {
                    clearBufferedStep2Toast()
                    bufferStep2SuccessToastRef.current = false
                    setTherapistAllocations(snapshot.therapistAllocations as any)
                    setPcaAllocations(snapshot.pcaAllocations as any)
                    setStaffOverrides(snapshot.staffOverrides as any)
                    setPendingPCAFTEPerTeam(snapshot.pendingPCAFTEPerTeam as any)
                    setStep2Result(snapshot.step2Result as any)
                    setStepStatus(snapshot.stepStatus as any)
                    setInitializedSteps(snapshot.initializedSteps as any)
                    setPcaAllocationErrors(snapshot.pcaAllocationErrors as any)

                    specialProgramOverrideResolverRef.current = resolver
                    setShowSpecialProgramOverrideDialog(true)
                    return
                  }
                  console.error('Error running Step 2:', e)
                }
                bufferStep2SuccessToastRef.current = false
                if (cancelled) {
                  resolve()
                  return
                }
                resolve()
              })()
            }

            specialProgramOverrideResolverRef.current = resolver
            prefetchSpecialProgramOverrideDialog().catch(() => {})
            prefetchNonFloatingSubstitutionDialog().catch(() => {})
            setStep21RuntimeVisible(null)
            setShowSpecialProgramOverrideDialog(true)
          })
        }

        captureStep2DependencyBaseline({
          kind: 'main-rerun',
        })
        const cleanedOverrides = resetStep2OverridesForAlgoEntry({
          staffOverrides,
          allStaff: [...staff, ...bufferStaff],
        })
        setStaffOverrides(cleanedOverrides)

        startBufferedStep2ToastSession()
        step2WizardAllowBackToSpecialProgramsRef.current = false
        try {
          step2RunLoop: while (true) {
            await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)

            step2ReviewLoop: while (true) {
              const step22 = await showStep2Point2_SptFinalEdit()
              if (step22 === null) {
                clearBufferedStep2Toast()
                cancelled = true
                break step2RunLoop
              }
              if (step22 && (step22 as any).__nav === 'back') {
                continue step2RunLoop
              }

              let nextStep2Point2Source:
                | {
                    staffOverrides: Record<string, any>
                    therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
                  }
                | undefined

              const hasStep22Updates = !!(step22 && Object.keys(step22).length > 0)
              if (hasStep22Updates) {
                const applied = applyStep2Point2_SptFinalEdits(step22)
                nextStep2Point2Source = {
                  staffOverrides: applied.nextStaffOverrides as any,
                  therapistAllocations: applied.nextTherapistAllocations as any,
                }
              }

              const step23 = await showStep2Point3_SharedTherapistEdit(nextStep2Point2Source)
              if (step23 === null) {
                clearBufferedStep2Toast()
                cancelled = true
                break step2RunLoop
              }
              if (step23 && (step23 as any).__nav === 'back') {
                continue step2ReviewLoop
              }

              const hasStep23Updates = !!(step23 && Object.keys(step23).length > 0)
              if (hasStep23Updates) {
                applyStep2Point3_SharedTherapistEdits(step23)
              }
              if (!cancelled) {
                flushBufferedStep2Toast({ awaitCalculations: hasStep22Updates || hasStep23Updates })
                scheduleFinalizeStep2DependencyChanges()
              }
              break step2RunLoop
            }
          }
        } catch (e: any) {
          if (e?.code === 'user_cancelled' || String(e?.message ?? '').includes('user_cancelled')) {
            clearBufferedStep2Toast()
            bufferStep2SuccessToastRef.current = false
            break
          }
          console.error('Error running Step 2:', e)
        } finally {
          bufferStep2SuccessToastRef.current = false
        }
        break
      }
      case 'floating-pca': {
        if (stepStatus['therapist-pca'] === 'pending') {
          showActionToast('Step 2 must be completed before Step 3.', 'warning')
          return
        }

        clearStep3StateOnly()
        clearStep3AllocationsPreserveStep2()

        prefetchFloatingPCAEntryDialog().catch(() => {})
        prefetchFloatingPCAConfigDialogV1().catch(() => {})
        openStep3EntryDialog()
        break
      }
      case 'bed-relieving': {
        calculateStep4_BedRelieving()
        break
      }
      default:
        break
    }
  }

  return {
    generateStep2_TherapistAndNonFloatingPCA,
    generateStep3_FloatingPCA,
    runStep2WithHarnessSubstitutionAuto,
    calculateStep4_BedRelieving,
    showStep2Point2_SptFinalEdit,
    applyStep2Point2_SptFinalEdits,
    showSharedTherapistStep,
    showStep2Point3_SharedTherapistEdit,
    applyStep2Point3_SharedTherapistEdits,
    handleInitializeAlgorithm,
  }
}
