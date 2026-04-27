'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useTransition, Suspense, useMemo, useOptimistic, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Team, Weekday, LeaveType, Staff } from '@/types/staff'
import type {
  TherapistAllocation,
  PCAAllocation,
  BedAllocation,
  BedRelievingNotesForToTeam,
  BedRelievingNotesByToTeam,
  ScheduleCalculations,
  AllocationTracker,
  WorkflowState,
  ScheduleStepId,
  StepStatus,
  BaselineSnapshot,
  SnapshotHealthReport,
} from '@/types/schedule'
import { TeamColumn } from '@/components/allocation/TeamColumn'
import { Button } from '@/components/ui/button'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { useToast } from '@/components/ui/toast-context'
import { ScheduleDndContextShell } from '@/features/schedule/ui/sections/ScheduleDndContextShell'
import { SchedulePageToolbar } from '@/features/schedule/ui/sections/SchedulePageToolbar'
import { ScheduleMainBoardChrome } from '@/features/schedule/ui/sections/ScheduleMainBoardChrome'
import { SchedulePageHeaderRightActions } from '@/features/schedule/ui/sections/SchedulePageHeaderRightActions'
import { SchedulePageSplitMainPaneHeader } from '@/features/schedule/ui/sections/SchedulePageSplitMainPaneHeader'
import { ScheduleWorkflowStepShell } from '@/features/schedule/ui/sections/ScheduleWorkflowStepShell'
import { ScheduleDevHarnessBridge } from '@/features/schedule/ui/dev/ScheduleDevHarnessBridge'
import dynamic from 'next/dynamic'
import { SchedulePageGridInteractionOverlays } from '@/features/schedule/ui/overlays/SchedulePageGridInteractionOverlays'
import { ScheduleHeaderBar } from '@/features/schedule/ui/layout/ScheduleHeaderBar'
import {
  SchedulePageDialogNodes,
  type SharedTherapistDialogCurrentAllocation,
  type SharedTherapistDialogData,
  type SpecialProgramOverrideEntry,
  type SptFinalEditUpdate,
  type SharedTherapistEditUpdate,
  type Step1BulkEditPayload,
} from '@/features/schedule/ui/overlays/SchedulePageDialogNodes'
import { useMainPaneLoadAndHydrateDateEffect } from '@/features/schedule/ui/hooks/useSchedulePaneHydration'
import {
  useScheduleAllocationRecalcAndSync,
  useSchedulePaneHydrationEndForRecalcCluster,
} from '@/features/schedule/ui/hooks/useScheduleAllocationRecalcAndSync'
import { useScheduleDisplayProjections } from '@/features/schedule/ui/hooks/useScheduleDisplayProjections'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import { useSchedulePageQueryState } from '@/features/schedule/ui/hooks/useSchedulePageQueryState'
import { useStep3DialogProjection } from '@/features/schedule/ui/hooks/useStep3DialogProjection'
import { useScheduleBoardDndWiring } from '@/features/schedule/ui/hooks/useScheduleBoardDndWiring'
import { useScheduleSnapshotDiff } from '@/features/schedule/ui/hooks/useScheduleSnapshotDiff'
import { useScheduleExportActions } from '@/features/schedule/ui/hooks/useScheduleExportActions'
import { useScheduleCopyWorkflow } from '@/features/schedule/ui/hooks/useScheduleCopyWorkflow'
import { useScheduleStepChromeNavigation } from '@/features/schedule/ui/hooks/useScheduleStepChromeNavigation'
import { useScheduleAllocationContextMenus } from '@/features/schedule/ui/hooks/useScheduleAllocationContextMenus'
import { useScheduleGridInteractionState } from '@/features/schedule/ui/hooks/useScheduleGridInteractionState'
import { useScheduleTopLoadingBar } from '@/features/schedule/ui/hooks/useScheduleTopLoadingBar'
import { useScheduleCalendarData } from '@/features/schedule/ui/hooks/useScheduleCalendarData'
import { useScheduleStepClearActions } from '@/features/schedule/ui/hooks/useScheduleStepClearActions'
import type { Step2ResultSurplusProjectionForStep3 } from '@/lib/features/schedule/schedulePageFingerprints'
import { ScheduleBoardLeftColumn } from '@/features/schedule/ui/layout/ScheduleBoardLeftColumn'
import { ScheduleBoardRightColumn } from '@/features/schedule/ui/layout/ScheduleBoardRightColumn'
import { ScheduleMainGrid } from '@/features/schedule/ui/layout/ScheduleMainGrid'
import { ScheduleSplitLayout } from '@/features/schedule/ui/layout/ScheduleSplitLayout'
import { RefreshCw, RotateCcw, X, Copy, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Pencil, Trash2, Plus, PlusCircle, Highlighter, Check, GitMerge, Split, FilePenLine, UserX } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useAccessControl } from '@/lib/access/useAccessControl'
import { getNextWorkingDay, getPreviousWorkingDay, isWorkingDay } from '@/lib/utils/dateHelpers'
import { getWeekday, formatDateDDMMYYYY, formatDateForInput, parseDateFromInput } from '@/lib/features/schedule/date'
import { computeDrmAddOnFte, computeReservedSpecialProgramPcaFte } from '@/lib/utils/specialProgramPcaCapacity'
import { getAllocationSpecialProgramSlotsForTeam } from '@/lib/utils/scheduleReservationRuntime'
import {
  closeStep3DialogSurface,
  openStep3EntrySurface,
  openStep3FlowSurface,
  type Step3DialogSurface,
  type Step3FlowChoice,
} from '@/lib/features/schedule/step3DialogFlow'
import { buildPageStep3RuntimeState } from '@/lib/features/schedule/pageStep3Runtime'
import { willNeedStep21Substitution } from '@/lib/features/schedule/step2SubstitutionProjection'
import {
  stripExtraCoverageOverrides,
} from '@/lib/features/schedule/extraCoverageVisibility'
import {
  buildStaffByIdMap,
  groupTherapistAllocationsByTeam,
  groupPcaAllocationsByTeamWithSlotTeams,
  sortTherapistApptFirstThenName,
  sortPcaNonFloatingFirstOnly,
  sortPcaNonFloatingFirstThenName,
} from '@/lib/features/schedule/grouping'
import { formatWardLabel } from '@/lib/features/schedule/bedMath'
import { getSptWeekdayConfigMap } from '@/lib/features/schedule/sptConfig'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Step2DialogReminder } from '@/components/allocation/Step2DialogReminder'
import type { PCAData, FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import type { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import type { SlotAssignment } from '@/lib/utils/reservationLogic'
const ScheduleBlocks1To6 = dynamic(
  () => import('@/features/schedule/ui/panes/ScheduleBlocks1To6').then(m => m.ScheduleBlocks1To6),
  { ssr: false }
)
const prefetchScheduleCopyWizard = () => import('@/components/allocation/ScheduleCopyWizard')
const prefetchStaffEditDialog = () => import('@/components/allocation/StaffEditDialog')
const prefetchFloatingPCAEntryDialog = () =>
  import('@/features/schedule/ui/steps/step3-floating/substeps/step30-entry-flow/FloatingPCAEntryDialog')
const prefetchFloatingPCAConfigDialogV1 = () => import('@/features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV1')
const prefetchFloatingPCAConfigDialogV2 = () => import('@/features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV2')
const prefetchSpecialProgramOverrideDialog = () => import('@/components/allocation/SpecialProgramOverrideDialog')
const prefetchSptFinalEditDialog = () => import('@/components/allocation/SptFinalEditDialog')
const prefetchSharedTherapistEditDialog = () => import('@/components/allocation/SharedTherapistEditDialog')
const prefetchNonFloatingSubstitutionDialog = () => import('@/components/allocation/NonFloatingSubstitutionDialog')
const prefetchScheduleCalendarPopover = () => import('@/features/schedule/ui/overlays/ScheduleCalendarPopover')

const STAFF_SELECT_FIELDS =
  'id,name,rank,special_program,team,floating,floor_pca,status,buffer_fte'
const SPT_ALLOC_SELECT_FIELDS =
  'id,staff_id,specialty,teams,weekdays,slots,slot_modes,fte_addon,config_by_weekday,substitute_team_head,is_rbip_supervisor,active'
import { Label } from '@/components/ui/label'
import {
  toDbLeaveType,
  fromDbLeaveType,
  isCustomLeaveType,
  normalizeFTE,
  programNamesToIds,
  assertValidSpecialProgramIds,
  prepareTherapistAllocationForDb,
  preparePCAAllocationForDb,
} from '@/lib/db/types'
import { useResizeObservedHeight } from '@/lib/hooks/useResizeObservedHeight'
import { useScheduleInitialDateResolution } from '@/features/schedule/ui/hooks/useScheduleInitialDateResolution'
import { useScheduleDateTransition } from '@/features/schedule/ui/hooks/useScheduleDateTransition'
import {
  useScheduleStep2Dependency,
  useScheduleStep2SuccessToastBuffer,
  useScheduleBufferedStep2HandoffAfterProjection,
  type Step2FinalizeContext,
} from '@/features/schedule/ui/hooks/useScheduleStep2DependencyAndToast'
import { useScheduleSubstitutionWizard } from '@/features/schedule/ui/hooks/useScheduleSubstitutionWizard'
import { useScheduleAlgorithmEntry } from '@/features/schedule/ui/hooks/useScheduleAlgorithmEntry'
import { useSchedulePageDevPerf } from '@/features/schedule/ui/hooks/useSchedulePageDevPerf'
import { resetStep2OverridesForAlgoEntry } from '@/lib/features/schedule/stepReset'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { extractReferencedStaffIds, validateAndRepairBaselineSnapshot } from '@/lib/utils/snapshotValidation'
import { minifySpecialProgramsForSnapshot } from '@/lib/utils/snapshotMinify'
import { createTimingCollector, type TimingReport } from '@/lib/utils/timing'
import { getCachedSchedule, cacheSchedule, clearCachedSchedule, getCacheSize } from '@/lib/utils/scheduleCache'
import { clearDraftSchedule, hasDraftSchedule } from '@/lib/utils/scheduleDraftCache'
import { hasMeaningfulStep1Overrides } from '@/lib/utils/staffOverridesMeaningful'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import {
  getAllSubstitutionSlots,
} from '@/lib/utils/substitutionFor'
import { ALLOCATION_STEPS, TEAMS, WEEKDAYS, WEEKDAY_NAMES } from '@/lib/features/schedule/constants'
import { useScheduleController } from '@/lib/features/schedule/controller/useScheduleController'
import type { PCAAllocationErrors } from '@/lib/features/schedule/controller/useScheduleController'
import type { BedCountsOverridesByTeam } from '@/lib/features/schedule/controller/scheduleControllerTypes'
import { AllocationExportView } from '@/features/schedule/ui/panes/AllocationExportView'
import { SplitReferencePortal } from '@/features/schedule/ui/panes/SplitReferencePortal'
import { HELP_TOUR_PENDING_KEY } from '@/lib/help/tours'
import { startHelpTourWithRetry } from '@/lib/help/startTour'
import {
  applyPcaOptimisticAction,
  createActivePcaDragState,
  createActiveTherapistDragState,
  createIdleTherapistDragState,
  type PcaOptimisticAction,
  type TherapistDragState,
} from '@/lib/features/schedule/dnd/dragState'
import type { ScheduleWardRow, StaffOverrideState } from '@/lib/features/schedule/controller/scheduleControllerTypes'
import type { WardForScheduleBedMath } from '@/lib/features/schedule/bedMath'
import {
  fetchSptAllocationsWithFallback,
  fetchStaffRowsWithFallback,
  splitStaffRowsByStatus,
} from '@/lib/features/schedule/controller/dataGateway'
import {
  convertBufferStaffToInactiveAction,
  promoteInactiveStaffToBufferAction,
  updateBufferStaffTeamAction,
} from '@/app/(dashboard)/schedule/actions'
import {
  getContributingTeams,
  getMainTeam,
  getMainTeamDisplayName,
  getVisibleTeams,
  resolveTeamMergeConfig,
  type TeamSettingsMergeRow,
} from '@/lib/utils/teamMerge'

function SchedulePageContent() {
  const supabase = createClientComponentClient()
  const navLoading = useNavigationLoading()
  const access = useAccessControl()
  const rightContentRef = useRef<HTMLDivElement | null>(null)
  const therapistAllocationBlockRef = useRef<HTMLDivElement | null>(null)
  const pcaAllocationBlockRef = useRef<HTMLDivElement | null>(null)
  // Keep the Staff Pool column ending at the same bottom edge as the right content (incl. PCA dedicated table),
  // while keeping Staff Pool itself internally scrollable.
  const rightContentHeight = useResizeObservedHeight({ targetRef: rightContentRef })

  const initialDefaultDate = useMemo(() => new Date(), [])
  const schedule = useScheduleController({
    defaultDate: initialDefaultDate,
    supabase,
    controllerRole: 'main',
    preserveUnsavedAcrossDateSwitch: true,
  })
  const { state: scheduleState, actions: scheduleActions } = schedule

  const {
    searchParams,
    urlDateKey,
    isDisplayMode,
    isSplitMode,
    refDateParam,
    splitDirection,
    splitRatio,
    isSplitSwapped,
    isRefHidden,
    replaceScheduleQuery,
    toggleDisplayMode,
    setRefHidden,
    revealReferencePane,
    commitSplitRatio,
    toggleSplitSwap,
    toggleSplitMode,
  } = useSchedulePageQueryState(scheduleState.selectedDate)

  const triggerHaptic = useCallback((pattern: number | number[] = 10) => {
    const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    if (!coarsePointer) return
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    try {
      navigator.vibrate(pattern)
    } catch {
      // Ignore unsupported/browser-blocked vibration.
    }
  }, [])

  const [refPortalHost, setRefPortalHost] = useState<HTMLDivElement | null>(null)

  const {
    selectedDate,
    therapistAllocations,
    pcaAllocations,
    bedAllocations,
    calculations,
    hasLoadedStoredCalculations,
    isHydratingSchedule,
    staff,
    inactiveStaff,
    bufferStaff,
    specialPrograms,
    sptAllocations,
    wards,
    pcaPreferences,
    loading,
    gridLoading,
    deferBelowFold,
    currentScheduleId,
    staffOverrides,
    savedOverrides,
    saving,
    scheduleLoadedForDate,
    hasSavedAllocations,
    bedCountsOverridesByTeam,
    savedBedCountsOverridesByTeam,
    bedRelievingNotesByToTeam,
    savedBedRelievingNotesByToTeam,
    staffOverridesVersion,
    savedOverridesVersion,
    bedCountsOverridesVersion,
    savedBedCountsOverridesVersion,
    bedRelievingNotesVersion,
    savedBedRelievingNotesVersion,
    allocationNotesDoc,
    savedAllocationNotesDoc,
    currentStep,
    stepStatus,
    initializedSteps,
    pendingPCAFTEPerTeam,
    persistedWorkflowState,
    baselineSnapshot,
    lastSnapshotAutoSyncStatus,
    snapshotHealthReport,
    step2Result,
    pcaAllocationErrors,
    tieBreakDecisions,
  } = scheduleState
  const {
    beginDateTransition: controllerBeginDateTransition,
    loadScheduleForDate,
    loadAndHydrateDate,
    flushDraftForCurrentDate,
    runStep4BedRelieving,
    prefetchStep2Algorithms,
    prefetchStep3Algorithms,
    prefetchBedAlgorithm,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    captureUndoCheckpoint,
    undoLastManualEdit,
    redoLastManualEdit,
    canUndo,
    canRedo,
    _unsafe,
  } = scheduleActions
  const [isUiTransitionPending, startUiTransition] = useTransition()
  const [optimisticPcaAllocations, queueOptimisticPcaAction] = useOptimistic<
    typeof pcaAllocations,
    PcaOptimisticAction
  >(pcaAllocations, (currentAllocations, action) =>
    applyPcaOptimisticAction(currentAllocations, action) as typeof pcaAllocations
  )
  const pcaAllocationsForUi = optimisticPcaAllocations

  // Remaining raw setters live behind an explicit escape hatch.
  const {
    setTherapistAllocations,
    setPcaAllocations,
    setBedAllocations,
    setCalculations,
    setHasLoadedStoredCalculations,
    setIsHydratingSchedule,
    setStaff,
    setInactiveStaff,
    setBufferStaff,
    setSpecialPrograms,
    setSptAllocations,
    setWards,
    setPcaPreferences,
    setLoading,
    setGridLoading,
    setDeferBelowFold,
    setCurrentScheduleId,
    setStaffOverrides,
    setSaving,
    setHasSavedAllocations,
    setBedCountsOverridesByTeam,
    setBedRelievingNotesByToTeam,
    setAllocationNotesDoc,
    setSavedAllocationNotesDoc,
    setStepStatus,
    setInitializedSteps,
    setPendingPCAFTEPerTeam,
    setPersistedWorkflowState,
    setBaselineSnapshot,
    setSnapshotHealthReport,
    setStep2Result,
    setPcaAllocationErrors,
    setTieBreakDecisions,
  } = _unsafe
  const latestStaffOverridesRef = useRef(staffOverrides)
  const latestTherapistAllocationsRef = useRef(therapistAllocations)
  const latestPcaAllocationsRef = useRef(pcaAllocations)
  const {
    latestStep3DependencyFingerprintRef,
    latestStep4DependencyFingerprintRef,
    step2DownstreamImpact,
    captureStep2DependencyBaseline,
    finalizeStep2DependencyChanges,
    scheduleFinalizeStep2DependencyChanges,
  } = useScheduleStep2Dependency({ setStepStatus, stepStatus })
  const [step3FlowChoiceForTooltip, setStep3FlowChoiceForTooltip] = useState<Step3FlowChoice | null>(null)

  useEffect(() => {
    latestStaffOverridesRef.current = staffOverrides
  }, [staffOverrides])

  useEffect(() => {
    latestTherapistAllocationsRef.current = therapistAllocations
  }, [therapistAllocations])

  useEffect(() => {
    latestPcaAllocationsRef.current = pcaAllocations
  }, [pcaAllocations])

  const getSpecialProgramFinalizeContext = useCallback(
    (overrides?: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }> | null): Step2FinalizeContext => {
      let explicitStep3Change = false
      let explicitStep4Change = false

      Object.values(overrides ?? {}).forEach((override) => {
        const entries = Array.isArray(override?.specialProgramOverrides) ? override.specialProgramOverrides : []
        if (entries.length === 0) return
        explicitStep3Change = true
        if (
          entries.some((entry) => {
            const therapistFTESubtraction = typeof entry?.therapistFTESubtraction === 'number'
              ? entry.therapistFTESubtraction
              : Number(entry?.therapistFTESubtraction ?? 0)
            return !!entry?.therapistId || Number.isFinite(therapistFTESubtraction) && Math.abs(therapistFTESubtraction) > 0.001
          })
        ) {
          explicitStep4Change = true
        }
      })

      return {
        kind: 'special-programs',
        explicitStep3Change,
        explicitStep4Change,
      }
    },
    []
  )

  const [teamSettingsRows, setTeamSettingsRows] = useState<TeamSettingsMergeRow[]>([])
  const [activeDragStaffForOverlay, setActiveDragStaffForOverlay] = useState<Staff | null>(null)
  const [activeBedRelievingTransfer, setActiveBedRelievingTransfer] = useState<{
    fromTeam: Team
    toTeam: Team
  } | null>(null)

  const effectiveTeamMergeConfig = useMemo(
    () =>
      resolveTeamMergeConfig({
        teamSettingsRows,
        snapshotMerge: baselineSnapshot?.teamMerge ?? null,
        snapshotDisplayNames: baselineSnapshot?.teamDisplayNames ?? null,
        hasBaselineSnapshot: !!baselineSnapshot,
      }),
    [teamSettingsRows, baselineSnapshot]
  )
  const visibleTeams = useMemo(
    () => getVisibleTeams(effectiveTeamMergeConfig.mergedInto),
    [effectiveTeamMergeConfig.mergedInto]
  )
  const step2ResultSurplusProjection = step2Result as Step2ResultSurplusProjectionForStep3 | null
  const visibleTeamGridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${Math.max(1, visibleTeams.length)}, minmax(0, 1fr))` }),
    [visibleTeams.length]
  )
  const scheduleMinWidthPx = Math.max(720, visibleTeams.length * 120)
  const mainTeamDisplayNames = useMemo(() => {
    const out: Partial<Record<Team, string>> = {}
    visibleTeams.forEach((mainTeam) => {
      out[mainTeam] = getMainTeamDisplayName({
        mainTeam,
        mergedInto: effectiveTeamMergeConfig.mergedInto,
        displayNames: effectiveTeamMergeConfig.displayNames,
        mergeLabelOverrideByTeam: effectiveTeamMergeConfig.mergeLabelOverrideByTeam,
      })
    })
    return out
  }, [visibleTeams, effectiveTeamMergeConfig])

  const teamContributorsByMain = useMemo(() => {
    const out: Partial<Record<Team, Team[]>> = {}
    visibleTeams.forEach((mainTeam) => {
      out[mainTeam] = getContributingTeams(mainTeam, effectiveTeamMergeConfig.mergedInto)
    })
    return out
  }, [visibleTeams, effectiveTeamMergeConfig.mergedInto])

  const {
    substitutionWizardOpen,
    setSubstitutionWizardOpen,
    setSubstitutionWizardData,
    substitutionWizardResolverRef,
    step2WizardAllowBackToSpecialProgramsRef,
    onNonFloatingSubstitutionWizard,
    substitutionWizardDataForDisplay,
    handleSubstitutionWizardConfirm,
    handleSubstitutionWizardCancel,
    handleSubstitutionWizardSkip,
    resetSubstitutionWizardForStepClear,
  } = useScheduleSubstitutionWizard({
    visibleTeams,
    teamContributorsByMain,
    mergedInto: effectiveTeamMergeConfig.mergedInto,
  })

  const toDateKey = useCallback((d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  const isScheduleCompletedToStep4 = useCallback((workflowState: WorkflowState | null | undefined) => {
    const completed = workflowState?.completedSteps ?? []
    if (!Array.isArray(completed)) return false
    return completed.includes('bed-relieving') || completed.includes('review')
  }, [])

  const { initialDateResolved } = useScheduleInitialDateResolution({
    supabase,
    searchParams,
    selectedDate,
    toDateKey,
    controllerBeginDateTransition,
    isScheduleCompletedToStep4,
  })

  // Bed-relieving highlight is only meaningful while editing that step.
  useEffect(() => {
    if (currentStep !== 'bed-relieving') setActiveBedRelievingTransfer(null)
  }, [currentStep])
  const flushDraftForCurrentDateRef = useRef(flushDraftForCurrentDate)
  flushDraftForCurrentDateRef.current = flushDraftForCurrentDate
  const autoFlushTimerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      try {
        flushDraftForCurrentDateRef.current()
      } catch {
        // ignore cleanup-time flush failures
      }
    }
  }, [])

  // Auto-flush unsaved work into the draft cache shortly after edits.
  // This prevents "confirm → immediately navigate away" from losing the latest state.
  useEffect(() => {
    if (!initialDateResolved) return
    if (typeof window === 'undefined') return
    if (autoFlushTimerRef.current != null) {
      window.clearTimeout(autoFlushTimerRef.current)
      autoFlushTimerRef.current = null
    }

    // Always schedule a flush when any of these change (dirty or becoming clean).
    autoFlushTimerRef.current = window.setTimeout(() => {
      try {
        flushDraftForCurrentDateRef.current()
      } catch {
        // ignore
      }
    }, 120)

    return () => {
      if (autoFlushTimerRef.current != null) {
        window.clearTimeout(autoFlushTimerRef.current)
        autoFlushTimerRef.current = null
      }
    }
  }, [
    initialDateResolved,
    currentScheduleId,
    scheduleLoadedForDate,
    staffOverridesVersion,
    savedOverridesVersion,
    bedCountsOverridesVersion,
    savedBedCountsOverridesVersion,
    bedRelievingNotesVersion,
    savedBedRelievingNotesVersion,
    allocationNotesDoc,
    savedAllocationNotesDoc,
  ])
  const gridLoadingUsesLocalBarRef = useRef(false)
  const [userRole, setUserRole] = useState<'developer' | 'admin' | 'user'>('user')
  const [devLeaveSimOpen, setDevLeaveSimOpen] = useState(false)
  const toastApi = useToast()
  const lastShownToastRef = useRef<{ id: number; title: string } | null>(null)
  const lastSnapshotAutoSyncToastKeyRef = useRef<string | null>(null)
  const showActionToast = useCallback(
    (
      title: string,
      variant: any = 'success',
      description?: string,
      options?: {
        durationMs?: number
        actions?: ReactNode
        progress?: import('@/components/ui/action-toast').ActionToastProgress
        persistUntilDismissed?: boolean
        dismissOnOutsideClick?: boolean
        showDurationProgress?: boolean
        pauseOnHover?: boolean
      }
    ) => {
      const id = toastApi.show({
        title,
        description,
        variant,
        ...options,
      } as any)
      lastShownToastRef.current = { id, title }
      return id
    },
    [toastApi]
  )
  useEffect(() => {
    if (userRole !== 'developer' && userRole !== 'admin') return
    if (!lastSnapshotAutoSyncStatus || lastSnapshotAutoSyncStatus.kind !== 'synced') return

    const key = `${lastSnapshotAutoSyncStatus.dateKey}|${lastSnapshotAutoSyncStatus.toGlobalVersion ?? 'unknown'}`
    if (lastSnapshotAutoSyncToastKeyRef.current === key) return
    lastSnapshotAutoSyncToastKeyRef.current = key

    showActionToast(
      'Schedule setup updated',
      'success',
      'This clean current/future schedule is now using the latest published setup.'
    )
  }, [lastSnapshotAutoSyncStatus, showActionToast, userRole])
  const updateActionToast = useCallback(
    (id: number, patch: any, options?: { durationMs?: number; persistUntilDismissed?: boolean }) => {
      toastApi.update(id, patch, options)
    },
    [toastApi]
  )
  const dismissActionToast = useCallback(() => toastApi.dismiss(), [toastApi])
  const [lastSaveTiming, setLastSaveTiming] = useState<TimingReport | null>(null)
  const [lastCopyTiming, setLastCopyTiming] = useState<TimingReport | null>(null)
  const [lastLoadTiming, setLastLoadTiming] = useState<TimingReport | null>(null)
  const latestLoadTimingKeyRef = useRef<string | null>(null)
  /** Filled after `recalculateScheduleCalculations` is defined; main-pane load hook calls through here. */
  const recalculateScheduleCalculationsForLoadRef = useRef<
    | ((opts?: { allowDuringHydration?: boolean; forceWithoutAllocations?: boolean; source?: unknown }) => void)
    | null
  >(null)
  const invokeRecalculateForMainLoad = useCallback(() => {
    recalculateScheduleCalculationsForLoadRef.current?.()
  }, [])
  const { perfStatsRef, perfTick, MaybeProfiler } = useSchedulePageDevPerf({ userRole })

  const allowScheduleDevHarnessRuntime =
    userRole === 'developer' || process.env.NODE_ENV === 'development'

  useEffect(() => {
    try {
      const pending = window.localStorage.getItem(HELP_TOUR_PENDING_KEY)
      if (!pending) return
      if (pending !== 'schedule-core' && pending !== 'dashboard-admin') return
      window.localStorage.removeItem(HELP_TOUR_PENDING_KEY)
      window.setTimeout(() => {
        void startHelpTourWithRetry(pending)
      }, 220)
    } catch {
      // ignore pending-tour errors
    }
  }, [])
  const [navToScheduleTiming, setNavToScheduleTiming] = useState<{
    targetHref: string
    startMs: number
    loadingShownMs: number | null
    mountedMs: number | null
    gridReadyMs: number
  } | null>(null)
  /**
   * @deprecated Hook slot preserved (ordering). Live dashboard “Avg PCA/team” uses
   * [step3DashboardAvgPcaDisplayByTeam] derived from [step3ProjectionV2.displayTargetByTeam].
   */
  const surplusAdjustedAveragePCAPerTeamByTeam = useMemo(
    () => null as Partial<Record<Team, number>> | null,
    []
  )
  const {
    topLoadingVisible,
    topLoadingProgress,
    startTopLoading,
    bumpTopLoadingTo,
    startSoftAdvance,
    stopSoftAdvance,
    finishTopLoading,
  } = useScheduleTopLoadingBar()
  const [copying, setCopying] = useState(false)
  const {
    isLikelyMobileDevice,
    exportPngLayerOpen,
    exportPngRootRef,
    renderExportAction,
    mobilePreviewDialog,
  } = useScheduleExportActions({
    selectedDate,
    toDateKey,
    showActionToast,
    updateActionToast,
    copying,
    saving,
  })
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [step1LeaveSetupOpen, setStep1LeaveSetupOpen] = useState(false)
  const [tieBreakDialogOpen, setTieBreakDialogOpen] = useState(false)
  const [tieBreakTeams, setTieBreakTeams] = useState<Team[]>([])
  const [tieBreakPendingFTE, setTieBreakPendingFTE] = useState<number>(0)
  const tieBreakResolverRef = useRef<((team: Team) => void) | null>(null)
  // tieBreakDecisions moved into useScheduleController() (domain state)

  // NOTE: Team grid used to have an internal horizontal scroller with a synced sticky header scroller.
  // That caused a mismatch where the grid could scroll horizontally while the StepIndicator / top area did not,
  // creating an "underlay" strip on the right. We now rely on page-level horizontal scroll instead.

  // Domain state moved into useScheduleController() (Stage 2 / Option A).
  const [editingBedTeam, setEditingBedTeam] = useState<Team | null>(null)
  const saveBedRelievingNotesForToTeam = useCallback(
    (toTeam: Team, notes: BedRelievingNotesForToTeam) => {
      try {
        flushSync(() => {
          scheduleActions.updateBedRelievingNotes({ toTeam, notes: notes as any })
        })
      } catch {
        scheduleActions.updateBedRelievingNotes({ toTeam, notes: notes as any })
      }
    },
    [scheduleActions]
  )

  const step2SuccessToastBuffer = useScheduleStep2SuccessToastBuffer({ showActionToast, calculations })
  const {
    bufferStep2SuccessToastRef,
    bufferedStep2SuccessToastPayloadRef,
    bufferedStep2ToastPendingRef,
    bufferedStep2ToastAwaitCalculationsRef,
    clearBufferedStep2Toast,
    flushBufferedStep2Toast,
    step2ToastProxy,
  } = step2SuccessToastBuffer

  const handleUndoManualEdit = useCallback(() => {
    if (isDisplayMode || !canUndo) return
    const undone = undoLastManualEdit()
    if (undone) {
      showActionToast('Undo', 'success', `Undid: ${undone.label}`)
    }
  }, [canUndo, isDisplayMode, undoLastManualEdit, showActionToast])

  const handleRedoManualEdit = useCallback(() => {
    if (isDisplayMode || !canRedo) return
    const redone = redoLastManualEdit()
    if (redone) {
      showActionToast('Redo', 'success', `Redid: ${redone.label}`)
    }
  }, [canRedo, isDisplayMode, redoLastManualEdit, showActionToast])

  const isEditableTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    if (target.closest('[contenteditable="true"]')) return true
    return false
  }, [])

  const saveAllocationNotes = useCallback(
    async (nextDoc: any) => {
      try {
        flushSync(() => {
          setAllocationNotesDoc(nextDoc)
        })
      } catch {
        setAllocationNotesDoc(nextDoc)
      }

      // Ensure schedule row exists so we have an id to save against.
      let scheduleId = currentScheduleId
      if (!scheduleId) {
        const result = await loadScheduleForDate(selectedDate)
        if (!result || !result.scheduleId) {
          showActionToast('Could not create schedule. Please try again.', 'error')
          throw new Error('Missing schedule id')
        }
        scheduleId = result.scheduleId
        setCurrentScheduleId(scheduleId)
      }

      const { error } = await supabase.rpc('update_schedule_allocation_notes_v1', {
        p_schedule_id: scheduleId,
        p_doc: nextDoc ?? null,
        p_updated_at: new Date().toISOString(),
      } as any)

      if (error) {
        showActionToast('Failed to save notes. Please try again.', 'error', error.message)
        throw error
      }

      setSavedAllocationNotesDoc(nextDoc)
      try {
        const y = selectedDate.getFullYear()
        const m = String(selectedDate.getMonth() + 1).padStart(2, '0')
        const d = String(selectedDate.getDate()).padStart(2, '0')
        const dateStr = `${y}-${m}-${d}`
        const cached = getCachedSchedule(dateStr)
        if (cached) {
          cacheSchedule(dateStr, {
            ...cached,
            allocationNotesDoc: nextDoc ?? null,
          } as any)
        }
      } catch {
        // ignore cache update
      }
      showActionToast('Notes confirmed.', 'success', 'Click Save Schedule to persist schedule changes to the database.')
    },
    [currentScheduleId, selectedDate, supabase]
  )
  const [calendarOpen, setCalendarOpen] = useState(false)
  // Adjacent-day schedule prefetch (warm `scheduleCache` without creating schedules)
  const adjacentSchedulePrefetchBaseKeyRef = useRef<string | null>(null)
  const adjacentSchedulePrefetchInFlightRef = useRef<Promise<void> | null>(null)
  const adjacentSchedulePrefetchedDatesRef = useRef<Set<string>>(new Set())
  const calendarButtonRef = useRef<HTMLButtonElement>(null)
  const calendarPopoverRef = useRef<HTMLDivElement>(null)
  // Copy wizard state
  const [copyMenuOpen, setCopyMenuOpen] = useState(false)
  const [copyWizardConfig, setCopyWizardConfig] = useState<{
    sourceDate: Date
    targetDate: Date | null
    flowType: 'next-working-day' | 'last-working-day' | 'specific-date'
    direction: 'to' | 'from'
  } | null>(null)
  const [copyWizardOpen, setCopyWizardOpen] = useState(false)
  const {
    datesWithData,
    setDatesWithData,
    datesWithDataLoading,
    datesWithDataLoadedAtRef,
    holidays,
    loadDatesWithData,
  } = useScheduleCalendarData({
    supabase,
    calendarOpen,
    copyWizardOpen,
    copyMenuOpen,
    selectedDate,
    scheduleLoadedForDate,
  })
  // Step-wise allocation workflow domain state moved into useScheduleController().
  // Track which steps have been initialized (domain; moved into useScheduleController()).
  
  // Display mode should behave like "read-only": close transient UI affordances that would otherwise linger.
  useEffect(() => {
    if (!isDisplayMode) return
    setCalendarOpen(false)
    setCopyMenuOpen(false)
    setCopyWizardOpen(false)
    setDevLeaveSimOpen(false)
    setSavedSetupPopoverOpen(false)
    setEditingStaffId(null)
    setEditingBedTeam(null)
    closeAllStep3Dialogs()
    setShowSpecialProgramOverrideDialog(false)
    setShowSptFinalEditDialog(false)
    setShowSharedTherapistEditDialog(false)
    setSharedTherapistDialogData(null)
    setStaffContextMenu({
      show: false,
      position: null,
      anchor: null,
      staffId: null,
      team: null,
      kind: null,
    })
    setStaffPoolContextMenu({
      show: false,
      position: null,
      anchor: null,
      staffId: null,
    })
    setPcaPoolAssignAction((prev) => ({
      ...prev,
      show: false,
      phase: 'team',
      position: null,
      staffId: null,
      staffName: null,
      targetTeam: null,
      availableSlots: [],
      selectedSlots: [],
    }))
    setLeaveEditWarningPopover({
      show: false,
      position: null,
    })
  }, [isDisplayMode])

  // Step 3 entry: launcher + isolated flow surfaces
  const [step3DialogSurface, setStep3DialogSurface] = useState<Step3DialogSurface>(closeStep3DialogSurface())
  const floatingPCAEntryOpen = step3DialogSurface === 'entry'
  const floatingPCAConfigV1Open = step3DialogSurface === 'v1-legacy'
  const floatingPCAConfigV2Open = step3DialogSurface === 'v2-ranked'
  const closeAllStep3Dialogs = () => setStep3DialogSurface(closeStep3DialogSurface())
  const openStep3EntryDialog = () => setStep3DialogSurface(openStep3EntrySurface())
  const openStep3V1Dialog = () => setStep3DialogSurface(openStep3FlowSurface('v1-legacy'))
  const openStep3V2Dialog = () => setStep3DialogSurface(openStep3FlowSurface('v2-ranked'))
  
  // Step 2.0: Special Program Override Dialog state
  const [showSpecialProgramOverrideDialog, setShowSpecialProgramOverrideDialog] = useState(false)
  const [step21RuntimeVisible, setStep21RuntimeVisible] = useState<boolean | null>(null)
  const step21PredictedVisible = useMemo(
    () =>
      willNeedStep21Substitution({
        selectedDate,
        staff,
        staffOverrides: staffOverrides as Record<string, any>,
      }),
    [selectedDate, staff, staffOverrides]
  )
  const showStep21InStep2Stepper = step21RuntimeVisible ?? step21PredictedVisible
  const specialProgramOverrideResolverRef = useRef<
    ((overrides: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }> | null) => void) | null
  >(null)

  // Step 2.2: SPT Final Edit Dialog state
  const [showSptFinalEditDialog, setShowSptFinalEditDialog] = useState(false)
  const sptFinalEditResolverRef = useRef<((updates: Record<string, SptFinalEditUpdate> | null) => void) | null>(null)
  const [showSharedTherapistEditDialog, setShowSharedTherapistEditDialog] = useState(false)
  const [sharedTherapistDialogData, setSharedTherapistDialogData] = useState<SharedTherapistDialogData | null>(null)
  const sharedTherapistEditResolverRef = useRef<((updates: Record<string, SharedTherapistEditUpdate> | null) => void) | null>(null)

  // Step 2.0: If the user selects staff from the inactive pool as a special-program substitute,
  // promote them to status='buffer' so they appear on the schedule page (active/buffer pool)
  // and are included in Step 2/3 algorithms.
  const [pendingStep2AfterInactivePromotion, setPendingStep2AfterInactivePromotion] = useState(false)
  const pendingStep2OverridesFromDialogRef = useRef<Record<string, any> | null>(null)
  const pendingStep2ResolveAfterPromotionRef = useRef<(() => void) | null>(null)
  const pendingPromotedInactiveStaffIdsRef = useRef<string[] | null>(null)


  const [adjustedPendingFTE, setAdjustedPendingFTE] = useState<Record<Team, number> | null>(null)
  const [teamAllocationOrder, setTeamAllocationOrder] = useState<Team[] | null>(null)
  const [allocationTracker, setAllocationTracker] = useState<AllocationTracker | null>(null)
  
  // Warning popover for floating PCA slot transfer before step 3
  const [slotTransferWarningPopover, setSlotTransferWarningPopover] = useState<{
    show: boolean
    position: { x: number; y: number } | null
  }>({
    show: false,
    position: null,
  })
  
  // Therapist drag state for validation
  const [therapistDragState, setTherapistDragState] = useState<TherapistDragState>(createIdleTherapistDragState())
  
  // Warning popover for therapist drag after step 2
  const [therapistTransferWarningPopover, setTherapistTransferWarningPopover] = useState<{
    show: boolean
    position: { x: number; y: number } | null
  }>({
    show: false,
    position: null,
  })
  const performSlotTransferFromPopoverRef = useRef<((targetTeam: Team) => void) | null>(null)
  const onPopoverDragDropToTeam = useCallback((targetTeam: Team) => {
    performSlotTransferFromPopoverRef.current?.(targetTeam)
  }, [])

  const {
    staffContextMenu,
    setStaffContextMenu,
    closeStaffContextMenu,
    staffPoolContextMenu,
    setStaffPoolContextMenu,
    closeStaffPoolContextMenu,
    setPcaPoolAssignAction,
    setSptPoolAssignAction,
    setBufferStaffEditDialog,
    setBufferStaffConvertConfirm,
    setPcaContextAction,
    setTherapistContextAction,
    setColorContextAction,
    setLeaveEditWarningPopover,
    setBedRelievingEditWarningPopover,
    pcaDragState,
    setPcaDragState,
    popoverDragHoverTeam,
    buildOverlayGroups,
  } = useScheduleGridInteractionState({ onPopoverDragDropToTeam })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey) return
      if (isEditableTarget(e.target)) return

      const key = e.key.toLowerCase()
      const wantsUndo = key === 'z' && !e.shiftKey
      const wantsRedo = (key === 'z' && e.shiftKey) || key === 'y'
      if (!wantsUndo && !wantsRedo) return

      if (wantsUndo) {
        if (!canUndo || isDisplayMode) return
        e.preventDefault()
        handleUndoManualEdit()
        return
      }

      if (wantsRedo) {
        if (!canRedo || isDisplayMode) return
        e.preventDefault()
        handleRedoManualEdit()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [
    canUndo,
    canRedo,
    isDisplayMode,
    isEditableTarget,
    handleUndoManualEdit,
    handleRedoManualEdit,
  ])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const userId = data.user?.id
        if (!userId) return
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()
        const raw = profile?.role
        const role: 'developer' | 'admin' | 'user' =
          raw === 'developer' ? 'developer' : raw === 'admin' ? 'admin' : raw === 'user' || raw === 'regular' ? 'user' : 'user'
        if (!cancelled) setUserRole(role)
      } catch {
        // default to regular
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    const isScheduleNavTarget = (navLoading.targetHref ?? '').startsWith('/schedule')
    // If we already have cached data for the current date (e.g. React dev remount / fast back nav),
    // skip the initial overlay to avoid flicker loops.
    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    const cached = getCachedSchedule(dateStr)
    const canSkipInitialOverlay =
      !!cached &&
      ((Array.isArray(cached.baselineSnapshot?.staff) && cached.baselineSnapshot.staff.length > 0) ||
        (cached.therapistAllocs?.length ?? 0) > 0 ||
        (cached.pcaAllocs?.length ?? 0) > 0 ||
        (cached.bedAllocs?.length ?? 0) > 0)

    if (canSkipInitialOverlay) {
      setGridLoading(false)
      gridLoadingUsesLocalBarRef.current = false
      if (isScheduleNavTarget) {
        window.requestAnimationFrame(() => navLoading.stop())
      }
      return
    }

    setGridLoading(true)
    // If we're not coming from a navigation overlay, use the schedule's own top bar.
    gridLoadingUsesLocalBarRef.current = !isScheduleNavTarget
    if (!isScheduleNavTarget) {
      startTopLoading(0.08)
      startSoftAdvance(0.75)
    }
    // Cold-start optimization:
    // - Do NOT preload base tables here (staff/programs/wards). Saved schedules should rely on baseline_snapshot.
    // - Do NOT preload calendar dots here. Dates are loaded lazily when calendar/copy wizard opens.
  }, [])

  // Record when the schedule page client code is mounted (used for nav diagnostics tooltip).
  useEffect(() => {
    try {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      window.sessionStorage.setItem('rbip_nav_schedule_mounted_ms', String(now))
      // If we skipped the schedule loading overlay due to cached data, we may never hit the "grid ready" timing path.
      // In that case, compute a lightweight nav timing fallback so the diagnostics tooltip can still show nav deltas.
      const navStartStr = window.sessionStorage.getItem('rbip_nav_start_ms')
      const navTarget = window.sessionStorage.getItem('rbip_nav_target_href') ?? ''
      if (navStartStr && navTarget.startsWith('/schedule')) {
        const startMs = Number(navStartStr)
        if (Number.isFinite(startMs)) {
          const loadingShownStr = window.sessionStorage.getItem('rbip_nav_schedule_loading_shown_ms')
          const loadingShownMs = loadingShownStr != null ? Number(loadingShownStr) : null
          const safeLoadingShownMs = loadingShownMs != null && Number.isFinite(loadingShownMs) ? loadingShownMs : null
          const navMeta = {
            targetHref: navTarget,
            startMs,
            loadingShownMs: safeLoadingShownMs,
            mountedMs: now,
            gridReadyMs: now,
          }
          window.sessionStorage.setItem('rbip_nav_schedule_grid_ready_ms', String(now))
          setNavToScheduleTiming(navMeta)
        }
      }
    } catch {
      // ignore
    }
  }, [])
  // End the grid loading overlay only after schedule data is loaded for this date,
  // so we never undim the grid while it's still visually blank.
  useEffect(() => {
    if (!gridLoading) return
    if (loading) return

    // Use local date components to avoid timezone issues
    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    if (scheduleLoadedForDate !== dateStr) return

    const finish = () => {
      setGridLoading(false)
      if (gridLoadingUsesLocalBarRef.current) {
        stopSoftAdvance()
        bumpTopLoadingTo(0.95)
        finishTopLoading()
        gridLoadingUsesLocalBarRef.current = false
      }
      if ((navLoading.targetHref ?? '').startsWith('/schedule')) {
        navLoading.stop()
      }

      // Persist + surface navigation timings in the existing load diagnostics tooltip.
      try {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        window.sessionStorage.setItem('rbip_nav_schedule_grid_ready_ms', String(now))

        const startMs = parseFloat(window.sessionStorage.getItem('rbip_nav_start_ms') || '')
        const targetHref = window.sessionStorage.getItem('rbip_nav_target_href')
        const loadingShownMs = parseFloat(window.sessionStorage.getItem('rbip_nav_schedule_loading_shown_ms') || '')
        const mountedMs = parseFloat(window.sessionStorage.getItem('rbip_nav_schedule_mounted_ms') || '')
        const gridReadyMs = now

        if (Number.isFinite(startMs) && targetHref && targetHref.startsWith('/schedule')) {
          const navMeta = {
            targetHref,
            startMs,
            loadingShownMs: Number.isFinite(loadingShownMs) ? loadingShownMs : null,
            mountedMs: Number.isFinite(mountedMs) ? mountedMs : null,
            gridReadyMs,
          }
          setNavToScheduleTiming(navMeta)
          setLastLoadTiming((prev) => {
            if (!prev) return prev
            const metaPrev: Record<string, unknown> = { ...(prev.meta ?? {}) }
            return { ...prev, meta: { ...metaPrev, nav: navMeta } }
          })
        }
      } catch {
        // ignore
      }
    }

    // Wait for the next paint (and a follow-up) so the grid content is on screen.
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish))
  }, [gridLoading, loading, staff.length, scheduleLoadedForDate, selectedDate, navLoading])

  // If we captured nav timing before lastLoadTiming was available, merge it in once load timing exists.
  useEffect(() => {
    if (!navToScheduleTiming) return
    setLastLoadTiming((prev) => {
      if (!prev) return prev
      const metaPrev: Record<string, unknown> = { ...(prev.meta ?? {}) }
      const existing = metaPrev['nav'] as { startMs?: number } | undefined
      if (existing && typeof existing.startMs === 'number') return prev
      return { ...prev, meta: { ...metaPrev, nav: navToScheduleTiming } }
    })
  }, [navToScheduleTiming])

  const onMainPaneLoadScheduled = useCallback(({ dateStr }: { dateStr: string }) => {
    // Immediately reflect the *current* selected date in the diagnostics tooltip to avoid a
    // transient "stale" display while the async load for this date is still in-flight.
    setLastLoadTiming((prev) => {
      const prevMeta: Record<string, unknown> = { ...((prev?.meta as Record<string, unknown> | undefined) ?? {}) }
      if (typeof prevMeta['dateStr'] === 'string' && prevMeta['dateStr'] === dateStr && !prevMeta['pending']) {
        return prev
      }

      const cachedNow = !!getCachedSchedule(dateStr)
      const draftNow = hasDraftSchedule(dateStr)
      const pending: TimingReport = {
        at: new Date().toISOString(),
        totalMs: 0,
        stages: [],
        meta: {
          dateStr,
          pending: true,
          cacheHit: cachedNow,
          draftHit: draftNow,
          cacheSize: getCacheSize(),
        },
      }

      return pending
    })
  }, [])

  const onMainPaneLoadedForDate = useCallback(({ dateStr, report }: { dateStr: string; report: unknown | null }) => {
    if (latestLoadTimingKeyRef.current !== dateStr) {
      return
    }
    if (report) setLastLoadTiming(report as TimingReport)
  }, [])

  const onMainPaneLoadError = useCallback(({ dateStr, error }: { dateStr: string; error: unknown }) => {
    if (latestLoadTimingKeyRef.current !== dateStr) {
      return
    }
    setLastLoadTiming(
      createTimingCollector().finalize({
        dateStr,
        error: error instanceof Error ? error.message : String(error),
      })
    )
  }, [])

  // Load + hydrate schedule when date changes (domain logic is in controller).
  useMainPaneLoadAndHydrateDateEffect({
    initialDateResolved,
    selectedDate,
    scheduleLoadedForDate,
    loadAndHydrateDate,
    recalculateScheduleCalculations: invokeRecalculateForMainLoad,
    onLoadScheduled: onMainPaneLoadScheduled,
    onLoadedForDate: onMainPaneLoadedForDate,
    onLoadError: onMainPaneLoadError,
    latestLoadKeyRef: latestLoadTimingKeyRef,
  })

  // Once the grid is ready (and skeleton is gone), render below-the-fold heavy components when the browser is idle.
  useEffect(() => {
    if (gridLoading) return
    if (!deferBelowFold) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      setDeferBelowFold(false)
    }
    const handle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(run, { timeout: 750 })
        : window.setTimeout(run, 150)
    return () => {
      cancelled = true
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle as number)
      else window.clearTimeout(handle)
    }
  }, [deferBelowFold, gridLoading])

  // End hydration AFTER the load-driven state updates flush to the screen.
  // This ensures downstream hooks (e.g., useAllocationSync TRIGGER2) can reliably see isHydratingSchedule=true
  // during the load-driven currentStep/staffOverrides updates.
  useSchedulePaneHydrationEndForRecalcCluster({
    endMode: 'sync',
    targetDateKey: toDateKey(selectedDate),
    isHydratingSchedule,
    loading,
    scheduleLoadedForDate,
    setIsHydratingSchedule,
    mainPaneStaffLength: staff.length,
    mainPaneHasLoadedStoredCalculations: hasLoadedStoredCalculations,
    mainPaneHasSavedAllocations: hasSavedAllocations,
  })

  // NOTE: Auto-regeneration on staffOverrides change has been DISABLED for step-wise workflow
  // User must now explicitly click "Next Step" to regenerate allocations
  // This useEffect is kept for regenerating when BASE DATA changes (not user edits)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Use local date components to avoid timezone issues
    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    // Only regenerate if schedule for this date has been loaded AND no saved allocations
    // AND staffOverrides is empty (initial load only, not user edits)
    if (staff.length > 0 && specialPrograms.length >= 0 && sptAllocations.length >= 0 && scheduleLoadedForDate === dateStr && !hasSavedAllocations && Object.keys(staffOverrides).length === 0) {
      // Step-wise workflow: do NOT auto-run algorithms on load.
      // User must explicitly initialize Step 2/3/4.
    }
  }, [staff, specialPrograms, sptAllocations, wards, pcaPreferences, scheduleLoadedForDate, hasSavedAllocations])
  // NOTE: staffOverrides intentionally removed from dependencies - step-wise workflow controls regeneration

  // Background prefetch: warm cache for previous/next working day schedules (only if meaningful),
  // while avoiding accidental creation of new schedule rows.
  useEffect(() => {
    if (!scheduleLoadedForDate) return
    const baseKey = toDateKey(selectedDate)
    if (scheduleLoadedForDate !== baseKey) return
    if (adjacentSchedulePrefetchBaseKeyRef.current === baseKey) return

    let cancelled = false
    const run = () => {
      if (cancelled) return
      if (adjacentSchedulePrefetchInFlightRef.current) return
      if (adjacentSchedulePrefetchBaseKeyRef.current === baseKey) return
      adjacentSchedulePrefetchBaseKeyRef.current = baseKey

      adjacentSchedulePrefetchInFlightRef.current = (async () => {
        const prefetchOneIfMeaningful = async (date: Date) => {
          const dateKey = toDateKey(date)
          if (adjacentSchedulePrefetchedDatesRef.current.has(dateKey)) return

          // Already cached → nothing to do.
          const alreadyCached = getCachedSchedule(dateKey)
          if (alreadyCached) {
            adjacentSchedulePrefetchedDatesRef.current.add(dateKey)

            // Surface updated cache size in the existing load diagnostics tooltip.
            setLastLoadTiming((prev) => {
              if (!prev) return prev
              const metaPrev: Record<string, unknown> = { ...(prev.meta ?? {}) }
              if (typeof metaPrev['dateStr'] === 'string' && metaPrev['dateStr'] !== baseKey) return prev
              return { ...prev, meta: { ...metaPrev, cacheSize: getCacheSize() } }
            })
            return
          }

          // Peek schedule row first (DO NOT create schedules as part of prefetch).
          const { data: schedRow, error: schedErr } = await supabase
            .from('daily_schedules')
            .select('id, staff_overrides, workflow_state')
            .eq('date', dateKey)
            .maybeSingle()

          if (schedErr || !schedRow?.id) return
          const scheduleId = schedRow.id
          const rawStaffOverrides = schedRow.staff_overrides

          const step1Edits = hasMeaningfulStep1Overrides(rawStaffOverrides)

          // Allocation presence check (any allocation row counts as meaningful)
          const [tRes, pRes, bRes] = await Promise.all([
            supabase.from('schedule_therapist_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
            supabase.from('schedule_pca_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
            supabase.from('schedule_bed_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
          ])

          const hasAlloc =
            (tRes.data?.length ?? 0) > 0 || (pRes.data?.length ?? 0) > 0 || (bRes.data?.length ?? 0) > 0

          if (!hasAlloc && !step1Edits) return

          // Now it is safe to prefetch via the normal loader (it will cache, and won't create missing schedules).
          await loadScheduleForDate(date, { prefetchOnly: true })
          adjacentSchedulePrefetchedDatesRef.current.add(dateKey)

          // Surface updated cache size in the existing load diagnostics tooltip.
          setLastLoadTiming((prev) => {
            if (!prev) return prev
            const metaPrev: Record<string, unknown> = { ...(prev.meta ?? {}) }
            if (typeof metaPrev['dateStr'] === 'string' && metaPrev['dateStr'] !== baseKey) return prev
            const nextMeta: Record<string, unknown> = {
              ...metaPrev,
              cacheSize: getCacheSize(),
            }
            return { ...prev, meta: nextMeta }
          })
        }

        const prev = getPreviousWorkingDay(selectedDate)
        const next = getNextWorkingDay(selectedDate)
        await Promise.all([prefetchOneIfMeaningful(prev), prefetchOneIfMeaningful(next)])

        // Ensure the tooltip reflects the latest cache size even if we didn't prefetch (or hit cache short-circuits).
        setLastLoadTiming((prev) => {
          if (!prev) return prev
          const metaPrev: Record<string, unknown> = { ...(prev.meta ?? {}) }
          if (typeof metaPrev['dateStr'] === 'string' && metaPrev['dateStr'] !== baseKey) return prev
          return { ...prev, meta: { ...metaPrev, cacheSize: getCacheSize() } }
        })
      })()
        .catch(() => {})
        .finally(() => {
          adjacentSchedulePrefetchInFlightRef.current = null
        })
    }

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 1200 })
      return () => {
        cancelled = true
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id)
      }
    }

    const t = window.setTimeout(run, 350)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scheduleLoadedForDate, selectedDate, supabase, loadScheduleForDate, toDateKey])

  const { queueDateTransition } = useScheduleDateTransition({
    urlDateKey,
    replaceScheduleQuery,
    toDateKey,
    controllerBeginDateTransition,
    startUiTransition,
    gridLoadingUsesLocalBarRef,
    startTopLoading,
    startSoftAdvance,
  })

  const handleDeveloperCacheClear = () => {
    const dateStr = toDateKey(selectedDate)
    clearCachedSchedule(dateStr)
    clearDraftSchedule(dateStr)
    showActionToast(
      'Cache cleared',
      'success',
      `Cleared cache for ${formatDateDDMMYYYY(selectedDate)}. Reloading schedule data...`
    )
    queueDateTransition(new Date(selectedDate.getTime()), {
      resetLoadedForDate: true,
      useLocalTopBar: false,
    })
  }

  // applyBaselineSnapshot/buildBaselineSnapshotFromCurrentState moved into useScheduleController()

  const loadStaff = async () => {
    const result = await fetchStaffRowsWithFallback({
      supabase,
      selectFields: STAFF_SELECT_FIELDS,
    })
    if (!result.data) {
      console.error(result.error || 'Error loading staff.')
      return
    }

    const { activeRows, inactiveRows, bufferRows } = splitStaffRowsByStatus(result.data)
    setInactiveStaff(inactiveRows)
    setBufferStaff(bufferRows)
    // Include buffer staff in main staff array for allocation algorithms.
    setStaff([...activeRows, ...bufferRows])
  }

  const loadSPTAllocations = async () => {
    const result = await fetchSptAllocationsWithFallback({
      supabase,
      selectFields: SPT_ALLOC_SELECT_FIELDS,
    })
    if (result.data) {
      setSptAllocations(result.data)
    } else if (result.error) {
      console.error(result.error)
    }
  }

  const loadTeamSettings = async () => {
    try {
      const result = await supabase
        .from('team_settings')
        .select('team,display_name,merged_into,merge_label_override,merged_pca_preferences_override')
        .order('team')
      if (result.error) {
        console.error('Error loading team settings:', result.error.message)
        return
      }
      setTeamSettingsRows((result.data || []) as TeamSettingsMergeRow[])
    } catch (error) {
      console.error('Error loading team settings:', error)
    }
  }

  useEffect(() => {
    void loadTeamSettings()
    // Refresh merge settings when date changes (snapshot merge may differ by date).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // loadScheduleForDate moved into useScheduleController() as scheduleActions.loadScheduleForDate()
  
  // Reset the flag when date changes (new schedule load)
  useEffect(() => {
    setHasLoadedStoredCalculations(false)
  }, [selectedDate])

  const handleEditStaff = (staffId: string, clickEvent?: React.MouseEvent) => {
    // Validate: Leave arrangement editing is only allowed in step 1
    if (currentStep !== 'leave-fte') {
      // Show warning popover instead of opening dialog
      if (clickEvent) {
        // Get the card element (button's parent card)
        const button = clickEvent.currentTarget as HTMLElement
        const card = button.closest('.border-2') as HTMLElement || button.parentElement?.parentElement as HTMLElement || button
        
        const rect = card.getBoundingClientRect()
        
        const popoverWidth = 200
        const padding = 10
        
        let popoverX: number
        let popoverY: number
        
        const scrollX = window.scrollX
        const scrollY = window.scrollY

        // Position to the left if it would be cut off on the right (viewport-relative first)
        const rightEdge = rect.left + rect.width + padding + popoverWidth
        const windowWidth = window.innerWidth
        
        if (rightEdge > windowWidth - 20) {
          popoverX = rect.left - popoverWidth - padding
        } else {
          popoverX = rect.left + rect.width + padding
        }
        
        popoverY = rect.top
        
        setLeaveEditWarningPopover({
          show: true,
          // Store document coords so it scrolls with page
          position: { x: popoverX + scrollX, y: popoverY + scrollY },
        })
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setLeaveEditWarningPopover(prev => ({ ...prev, show: false }))
        }, 5000)
      }
      return
    }
    
    setEditingStaffId(staffId)
    setEditDialogOpen(true)
  }

  const openStaffContextMenu = useCallback((
    staffId: string,
    team: Team,
    kind: 'therapist' | 'pca',
    clickEvent?: React.MouseEvent
  ) => {
    if (!clickEvent) {
      // Fallback: open at a reasonable default position
      const sx = typeof window !== 'undefined' ? window.scrollX : 0
      const sy = typeof window !== 'undefined' ? window.scrollY : 0
      setStaffContextMenu({
        show: true,
        // Document-relative position (so popover scrolls with page)
        position: { x: sx + 100, y: sy + 100 },
        anchor: null,
        staffId,
        team,
        kind,
      })
      return
    }

    const anchor = clickEvent.currentTarget as HTMLElement
    const rect = anchor.getBoundingClientRect()

    const popoverWidth = 220
    const padding = 10
    const estimatedHeight = 240
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    // Compute viewport-relative first (client coords)
    let xClient = rect.right + padding
    if (xClient + popoverWidth > viewportWidth - 10) {
      xClient = Math.max(10, rect.left - popoverWidth - padding)
    }

    let yClient = rect.top
    if (yClient + estimatedHeight > viewportHeight - 10) {
      yClient = Math.max(10, viewportHeight - estimatedHeight - 10)
    }

    setStaffContextMenu({
      show: true,
      // Store document-relative coords so it scrolls away naturally.
      position: { x: xClient + scrollX, y: yClient + scrollY },
      // Animate expanding from the pencil icon.
      anchor: { x: rect.left + rect.width / 2 + scrollX, y: rect.top + rect.height / 2 + scrollY },
      staffId,
      team,
      kind,
    })
  }, [])

  const openStaffPoolContextMenu = useCallback((staffId: string, clickEvent?: React.MouseEvent) => {
    if (!clickEvent) {
      const sx = typeof window !== 'undefined' ? window.scrollX : 0
      const sy = typeof window !== 'undefined' ? window.scrollY : 0
      setStaffPoolContextMenu({
        show: true,
        position: { x: sx + 100, y: sy + 100 },
        anchor: null,
        staffId,
      })
      return
    }

    const anchor = clickEvent.currentTarget as HTMLElement
    const rect = anchor.getBoundingClientRect()

    const popoverWidth = 220
    const padding = 10
    const estimatedHeight = 260
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    let xClient = rect.right + padding
    if (xClient + popoverWidth > viewportWidth - 10) {
      xClient = Math.max(10, rect.left - popoverWidth - padding)
    }

    // IMPORTANT (Staff Pool UX):
    // Always align the menu's top border with the staff card's top border.
    // If the menu would be truncated by viewport, auto-scroll the *page* to make room,
    // instead of clamping the Y position (which breaks alignment).
    const margin = 12
    const yClient = rect.top

    const overflowBottom = (yClient + estimatedHeight) - (viewportHeight - margin)
    const overflowTop = margin - yClient
    if (overflowBottom > 0) {
      window.scrollBy({ top: overflowBottom, behavior: 'smooth' })
    } else if (overflowTop > 0) {
      window.scrollBy({ top: -overflowTop, behavior: 'smooth' })
    }

    setStaffPoolContextMenu({
      show: true,
      position: { x: xClient + scrollX, y: yClient + scrollY },
      anchor: { x: rect.left + rect.width / 2 + scrollX, y: rect.top + rect.height / 2 + scrollY },
      staffId,
    })
  }, [])

  const startPcaContextAction = (options: {
    staffId: string
    sourceTeam: Team
    mode: 'move' | 'discard'
    position: { x: number; y: number }
  }) => {
    const staffMember = staff.find(s => s.id === options.staffId) || bufferStaff.find(s => s.id === options.staffId)
    const staffName = staffMember?.name ?? null

    const allocInTeam = pcaAllocations[options.sourceTeam]?.find(a => a.staff_id === options.staffId)
      ?? Object.values(pcaAllocations).flat().find(a => a.staff_id === options.staffId)

    if (!allocInTeam) {
      showActionToast('No PCA allocation found for this staff card.', 'error')
      return
    }

    const assignedSlots: number[] = []
    if (allocInTeam.slot1 === options.sourceTeam) assignedSlots.push(1)
    if (allocInTeam.slot2 === options.sourceTeam) assignedSlots.push(2)
    if (allocInTeam.slot3 === options.sourceTeam) assignedSlots.push(3)
    if (allocInTeam.slot4 === options.sourceTeam) assignedSlots.push(4)

    if (assignedSlots.length === 0) {
      showActionToast('No slots found in this team for this PCA.', 'warning')
      return
    }

    setPcaContextAction({
      show: true,
      mode: options.mode,
      phase: options.mode === 'move' ? 'team' : 'slots',
      position: options.position,
      staffId: options.staffId,
      staffName,
      sourceTeam: options.sourceTeam,
      targetTeam: null,
      availableSlots: assignedSlots,
      selectedSlots: assignedSlots.length === 1 ? assignedSlots : [],
    })
  }

  const startTherapistContextAction = (options: {
    staffId: string
    sourceTeam: Team
    mode: 'move' | 'discard' | 'split' | 'merge'
    position: { x: number; y: number }
  }) => {
    const staffMember = staff.find(s => s.id === options.staffId) || bufferStaff.find(s => s.id === options.staffId)
    const staffName = staffMember?.name ?? null

    setTherapistContextAction({
      show: true,
      mode: options.mode,
      phase:
        options.mode === 'move'
          ? 'team'
          : options.mode === 'split'
            ? 'team'
            : options.mode === 'merge'
              ? 'mergeSelect'
              : 'confirmDiscard',
      position: options.position,
      staffId: options.staffId,
      staffName,
      sourceTeam: options.sourceTeam,
      targetTeam: null,
      movedFteQuarter: null,
      splitMovedHalfDayChoice: 'AUTO',
      splitStayHalfDayChoice: 'AUTO',
      splitInputMode: 'moved',
      mergeInputMode: 'intoSource',
      mergeTeams: [],
    })
  }

  const therapistAllocationIndex = useMemo(() => {
    const fteByStaffId = new Map<string, Partial<Record<Team, number>>>()
    const leaveTypeByStaffId = new Map<string, LeaveType | null>()

    for (const team of TEAMS) {
      for (const alloc of therapistAllocations[team] || []) {
        const staffId = alloc.staff_id
        if (!staffId) continue
        const entry = fteByStaffId.get(staffId) || {}
        entry[team] = (entry[team] ?? 0) + (alloc.fte_therapist ?? 0)
        fteByStaffId.set(staffId, entry)

        if (!leaveTypeByStaffId.has(staffId)) {
          const lt = alloc.leave_type ?? null
          leaveTypeByStaffId.set(staffId, lt)
        }
      }
    }

    return { fteByStaffId, leaveTypeByStaffId }
  }, [therapistAllocations])

  const getTherapistFteByTeam = (staffId: string): Partial<Record<Team, number>> => {
    const o = staffOverrides[staffId]
    if (o?.therapistTeamFTEByTeam && Object.keys(o.therapistTeamFTEByTeam).length > 0) {
      return { ...(o.therapistTeamFTEByTeam ?? {}) }
    }

    const fromAlloc = therapistAllocationIndex.fteByStaffId.get(staffId)
    return fromAlloc ? { ...fromAlloc } : {}
  }

  const getTherapistLeaveType = (staffId: string): LeaveType | null => {
    const o = staffOverrides[staffId]
    if (o && 'leaveType' in o) return o.leaveType ?? null
    return therapistAllocationIndex.leaveTypeByStaffId.get(staffId) ?? null
  }

  const recalculationTeams = useMemo(
    () => (visibleTeams.length > 0 ? visibleTeams : TEAMS),
    [visibleTeams]
  )

  const wardsForRecalculation = useMemo(() => {
    const mergedInto = effectiveTeamMergeConfig.mergedInto
    return (wards || []).map((ward: ScheduleWardRow) => {
      const rawAssignments = ((ward?.team_assignments as Partial<Record<Team, number>>) ?? {})
      const nextAssignments = createEmptyTeamRecord<number>(0)
      const nextPortions = createEmptyTeamRecord<string | undefined>(undefined)

      Object.entries(rawAssignments).forEach(([teamKey, beds]) => {
        const team = teamKey as Team
        const mainTeam = getMainTeam(team, mergedInto)
        const val = typeof beds === 'number' ? beds : 0
        nextAssignments[mainTeam] = (nextAssignments[mainTeam] || 0) + val
      })

      const rawPortions = ((ward?.team_assignment_portions as Partial<Record<Team, string>>) ?? {})
      Object.entries(rawPortions).forEach(([teamKey, portion]) => {
        const team = teamKey as Team
        const mainTeam = getMainTeam(team, mergedInto)
        if (!portion) return
        if (!nextPortions[mainTeam]) nextPortions[mainTeam] = portion
      })

      return {
        ...ward,
        team_assignments: nextAssignments,
        team_assignment_portions: nextPortions,
      }
    })
  }, [wards, effectiveTeamMergeConfig.mergedInto])

  const wardsByTeam = useMemo(() => {
    const byTeam = createEmptyTeamRecordFactory<WardForScheduleBedMath[]>(() => [])
    for (const ward of wardsForRecalculation || []) {
      for (const team of recalculationTeams) {
        if ((ward.team_assignments[team] ?? 0) > 0) {
          byTeam[team].push(ward)
        }
      }
    }
    return byTeam
  }, [wardsForRecalculation, recalculationTeams])

  const designatedWardsByTeam = useMemo(() => {
    const byTeam = createEmptyTeamRecordFactory<string[]>(() => [])
    for (const team of recalculationTeams) {
      byTeam[team] = (wardsByTeam[team] || []).map((ward) => formatWardLabel(ward, team))
    }
    return byTeam
  }, [wardsByTeam, recalculationTeams])

  const totalBedsAllTeams = useMemo(() => wards.reduce((sum, ward) => sum + ward.total_beds, 0), [wards])

  const { recalculateScheduleCalculations } = useScheduleAllocationRecalcAndSync({
    recalculateScheduleCalculationsForLoadRef,
    pcaAllocations,
    therapistAllocations,
    staffOverrides: staffOverrides as StaffOverrides,
    wardsForRecalculation,
    wardsByTeam,
    designatedWardsByTeam,
    totalBedsAllTeams,
    bedCountsOverridesByTeam,
    selectedDate,
    specialPrograms,
    staff,
    currentStep,
    recalculationTeams,
    teamMergeMergedInto: effectiveTeamMergeConfig.mergedInto,
    hasLoadedStoredCalculations,
    isHydratingSchedule,
    setCalculations,
    calculations,
    loading,
    wards,
    stepStatus,
    setBedAllocations,
    setTherapistAllocations,
    sptAllocations,
    initializedSteps,
  })

  // applySavedAllocations moved into useScheduleController() as scheduleActions.applySavedAllocationsFromDb()

  const handleSaveStaffEdit = async (staffId: string, leaveType: LeaveType | null, fteRemaining: number, fteSubtraction?: number, availableSlots?: number[], invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>, amPmSelection?: 'AM' | 'PM', specialProgramAvailable?: boolean) => {
    // Domain-safe: apply override + reset workflow flags in controller (single source of truth).
    const newOverrides = scheduleActions.applyStaffEditDomain({
      staffId,
      leaveType,
      fteRemaining,
      fteSubtraction,
      availableSlots,
      invalidSlots,
      amPmSelection,
      specialProgramAvailable,
    })
    
    // Trigger internal updates: recalculate schedule calculations and update allocations
    // This updates therapist-FTE/team, avg PCA/team, True-FTE remaining, slot_assigned, 
    // Pending PCA-FTE/team, daily bed load internally and updates in staff overrides
    // Treat the edit as an allocation so user can proceed to step 2
    try {
      // Check if we have existing allocations (loaded data)
      const hasExistingAllocations = Object.values(pcaAllocations).some(teamAllocs => teamAllocs.length > 0)
      
      // First, recalculate schedule calculations (therapist-FTE/team, avg PCA/team, daily bed load)
      recalculateScheduleCalculations()
      
      // applyStaffEditDomain() always routes edits back to Step 1.
      // Do not run Step 2/3 algorithms here; only keep existing Step 1-safe value sync.
      if (hasExistingAllocations) {
        
        // Update FTE values in existing allocations without redistributing
        // First, create updated allocations map
        const updatedAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
          FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
        }
        
        Object.keys(pcaAllocations).forEach(team => {
          updatedAllocations[team as Team] = pcaAllocations[team as Team].map(alloc => {
            if (alloc.staff_id === staffId) {
              // Update FTE values for the edited staff
              const override = newOverrides[staffId]
              const baseFTE = override?.fteSubtraction !== undefined
                ? 1.0 - override.fteSubtraction
                : (override?.fteRemaining ?? alloc.fte_pca)
              
              // Recalculate fte_remaining based on slot_assigned
              const slotCount = [alloc.slot1, alloc.slot2, alloc.slot3, alloc.slot4].filter(s => s !== null).length
              const slotAssigned = slotCount * 0.25
              const fteRemaining = Math.max(0, baseFTE - slotAssigned)
              
              return {
                ...alloc,
                fte_pca: baseFTE,
                fte_remaining: fteRemaining,
                slot_assigned: slotAssigned,
                leave_type: override?.leaveType ?? alloc.leave_type,
              }
            }
            return alloc
          })
        })
        
        setPcaAllocations(updatedAllocations)

        // Step 1 edits invalidate downstream PCA pending math.
        // Do not recompute pending locally here because this shortcut cannot
        // faithfully exclude special-program slots the same way the canonical
        // Step 2/3 pipeline does. Pending is recomputed when the downstream
        // allocation flow reruns from Step 2.
      } else {
        // Fresh data in step 1 - don't run allocation algorithm yet.
        // Allocation will happen in Step 2 initialize.
      }
    } catch (error) {
      console.error('Error updating allocations after staff edit:', error)
    }
  }

  const handleSaveStep1LeaveSetup = async (args: { edits: Step1BulkEditPayload[] }) => {
    const edits = Array.isArray(args.edits) ? args.edits : []
    if (edits.length === 0) {
      setStep1LeaveSetupOpen(false)
      return
    }

    try {
      scheduleActions.applyBulkStaffEditsDomain({ edits: edits as any })
      recalculateScheduleCalculations()
      setStep1LeaveSetupOpen(false)
      showActionToast('Step 1 leave setup saved.', 'success')
    } catch (error) {
      console.error('Failed to save step 1 leave setup:', error)
      showActionToast('Failed to save step 1 leave setup.', 'error')
    }
  }

  // NOTE: legacy "Regenerate All" dev action removed. Step-wise workflow uses explicit step actions instead.

  // ============================================================================
  // HELPER FUNCTIONS FOR STEP-WISE ALLOCATION
  // ============================================================================

  const step3RuntimeState = useMemo(
    () =>
      buildPageStep3RuntimeState({
        selectedDate,
        staff,
        staffOverrides: staffOverrides as Record<string, any>,
        pcaAllocations: pcaAllocations as Record<Team, Array<PCAAllocation & { staff?: Staff }>>,
        specialPrograms: (specialPrograms || []) as SpecialProgram[],
      }),
    [selectedDate, staff, staffOverrides, pcaAllocations, specialPrograms]
  )

  const existingAllocationsForStep3 = step3RuntimeState.existingAllocations
  const floatingPCAsForStep3 = useMemo(
    () => step3RuntimeState.pcaData.filter((p) => p.floating),
    [step3RuntimeState]
  )

  // ============================================================================
  // STEP-WISE ALLOCATION FUNCTIONS
  // ============================================================================

  const createEmptyTherapistAllocationsByTeam = () => ({
    FO: [],
    SMM: [],
    SFM: [],
    CPPC: [],
    MC: [],
    GMC: [],
    NSM: [],
    DRO: [],
  }) as Record<Team, (TherapistAllocation & { staff: Staff })[]>

  const createEmptyPCAAllocationsByTeam = () => ({
    FO: [],
    SMM: [],
    SFM: [],
    CPPC: [],
    MC: [],
    GMC: [],
    NSM: [],
    DRO: [],
  }) as Record<Team, (PCAAllocation & { staff: Staff })[]>

  const applyBaselineViewAllocations = (overrides: Record<string, any>) => {
    scheduleActions.applyBaselineViewAllocations(overrides as any)
  }

  const {
    handleNextStep,
    handlePreviousStep,
    handleStepClick,
    attentionStepIds,
    canNavigateToStep,
    handleStepInitializePrefetch,
  } = useScheduleStepChromeNavigation({
    startUiTransition,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    currentStep,
    stepStatus,
    staff,
    staffOverrides,
    therapistAllocations,
    pcaAllocations,
    bedAllocations,
    bedRelievingNotesByToTeam,
    step2Result,
    initializedSteps,
    adjustedPendingFTE,
    teamAllocationOrder,
    allocationTracker,
    step2DownstreamImpact,
    prefetchStep2Algorithms,
    prefetchStep3Algorithms,
    prefetchBedAlgorithm,
  })

  const removeStep2KeysFromOverrides = (overrides: Record<string, any>) => {
    return scheduleActions.removeStep2KeysFromOverrides(overrides as any) as any
  }

  const clearStep3StateOnly = () => {
    // Step 3 wizard state + tracking
    closeAllStep3Dialogs()
    setAdjustedPendingFTE(null)
    setTeamAllocationOrder(null)
    setAllocationTracker(null)
    setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })
    setPcaAllocationErrors((prev: PCAAllocationErrors) => ({ ...prev, preferredSlotUnassigned: undefined }))
  }

  const clearStep4StateOnly = () => {
    scheduleActions.clearDomainFromStep('bed-relieving')
  }

  const clearStep3AllocationsPreserveStep2 = () => {
    scheduleActions.resetStep3ForReentry()
  }

  const { showClearForCurrentStep, handleClearStep } = useScheduleStepClearActions({
    currentStep,
    stepStatus,
    initializedSteps,
    staffOverrides,
    therapistAllocations,
    pcaAllocations,
    bedAllocations,
    bedRelievingNotesByToTeam,
    step2Result,
    adjustedPendingFTE,
    teamAllocationOrder,
    allocationTracker,
    staff,
    showActionToast,
    dismissActionToast,
    closeDialogsForStepClear: () => {
      // UI-only: close any step dialogs to avoid dangling resolvers.
      setShowSpecialProgramOverrideDialog(false)
      specialProgramOverrideResolverRef.current = null
      setShowSptFinalEditDialog(false)
      sptFinalEditResolverRef.current = null
      setShowSharedTherapistEditDialog(false)
      setSharedTherapistDialogData(null)
      sharedTherapistEditResolverRef.current = null
      setStep21RuntimeVisible(null)
      resetSubstitutionWizardForStepClear()
      closeAllStep3Dialogs()
    },
    clearStep3UiStateForStepClear: () => {
      // Clear page-local Step 3 UI state
      setAdjustedPendingFTE(null)
      setTeamAllocationOrder(null)
      setAllocationTracker(null)
    },
    clearDomainFromStep: (stepId) => {
      scheduleActions.clearDomainFromStep(stepId)
    },
  })
  
  /**
   * Handle save from FloatingPCAConfigDialog (Steps 3.1 + 3.2 + 3.3 + 3.4)
   * The dialog now runs the full floating PCA algorithm v2 internally
   */
  const handleFloatingPCAConfigSave = async (
    result: FloatingPCAAllocationResultV2,
    teamOrder: Team[],
    step32Assignments: SlotAssignment[],
    step33Assignments: SlotAssignment[]
  ) => {
    const selectedStep3FlowChoice: Step3FlowChoice = step3DialogSurface === 'v1-legacy' ? 'v1-legacy' : 'v2-ranked'
    // Store the team order for reference
    setTeamAllocationOrder(teamOrder)
    setStep3FlowChoiceForTooltip(selectedStep3FlowChoice)
    
    // Close the dialog
    closeAllStep3Dialogs()
    
    // Store the allocation tracker
    setAllocationTracker(result.tracker)
    
    // Update pending FTE state with final values from algorithm
    setPendingPCAFTEPerTeam(result.pendingPCAFTEPerTeam)
    setAdjustedPendingFTE(result.pendingPCAFTEPerTeam)
    
    // Update staffOverrides for all assigned PCAs (from 3.2, 3.3, and 3.4)
    const floatingPCAs = floatingPCAsForStep3
    const allAssignments = [...step32Assignments, ...step33Assignments]
    
    const newOverrides = stripExtraCoverageOverrides({ ...staffOverrides } as any)

    // Step 3.4 extra coverage markers are recomputed each run; clear previous markers for floating PCAs.
    for (const pca of floatingPCAs) {
      const cur = (newOverrides as any)?.[pca.id]
      if (!cur || typeof cur !== 'object') continue
      if (!('extraCoverageBySlot' in cur)) continue
      const { extraCoverageBySlot: _extra, ...rest } = cur as any
      // Keep object compact
      if (Object.keys(rest).length > 0) (newOverrides as any)[pca.id] = rest
      else delete (newOverrides as any)[pca.id]
    }
    for (const assignment of allAssignments) {
      const pca = floatingPCAs.find(p => p.id === assignment.pcaId)
      if (pca) {
        const existingOverride = newOverrides[assignment.pcaId] || {
          leaveType: pca.leave_type as LeaveType | null,
          fteRemaining: pca.fte_pca,
        }
        // Decrement FTE by 0.25 for the assigned slot
        newOverrides[assignment.pcaId] = {
          ...existingOverride,
          fteRemaining: Math.max(0, (existingOverride.fteRemaining || pca.fte_pca) - 0.25),
        }
      }
    }
    
    // Also update FTE for PCAs assigned in Step 3.4 (from result.allocations)
    // NOTE: Use fte_pca (on-duty FTE), NOT fte_remaining (unassigned slots FTE)
    // fte_remaining = 0 means all slots assigned, but PCA is still ON DUTY
    for (const alloc of result.allocations) {
      const pca = floatingPCAs.find(p => p.id === alloc.staff_id)
      if (pca) {
        newOverrides[alloc.staff_id] = {
          ...newOverrides[alloc.staff_id],
          leaveType: pca.leave_type as LeaveType | null,
          fteRemaining: alloc.fte_pca,  // Use fte_pca (on-duty FTE), not fte_remaining
        }
      }
    }

    setStaffOverrides(newOverrides)
    
    // Update PCA allocations state with all new slot assignments
    // IMPORTANT: Avoid mutating existing arrays in-place.
    // `PCABlock` / table view-models memoize heavily by `allocations` array reference, so we must
    // ensure each team gets a fresh array reference when Step 3 updates allocations.
    const updatedPcaAllocations = createEmptyTeamRecordFactory<(PCAAllocation & { staff: Staff })[]>(() => [])
    ;(Object.keys(pcaAllocations) as Team[]).forEach((t) => {
      updatedPcaAllocations[t] = [...(pcaAllocations[t] || [])]
    })
    for (const alloc of result.allocations) {
      // Find the staff member for this allocation
      const staffMember = staff.find(s => s.id === alloc.staff_id)
      if (!staffMember) continue
      
      // Create allocation with staff property
      const allocWithStaff = { ...alloc, staff: staffMember }

      // Remove this staff from all teams first (slots may have moved).
      ;(Object.keys(updatedPcaAllocations) as Team[]).forEach((t) => {
        updatedPcaAllocations[t] = (updatedPcaAllocations[t] || []).filter((a) => a.staff_id !== alloc.staff_id)
      })
      
      // Find which team(s) this PCA is now assigned to
      const teamsWithSlots: Team[] = []
      if (alloc.slot1) teamsWithSlots.push(alloc.slot1)
      if (alloc.slot2) teamsWithSlots.push(alloc.slot2)
      if (alloc.slot3) teamsWithSlots.push(alloc.slot3)
      if (alloc.slot4) teamsWithSlots.push(alloc.slot4)
      
      // Add allocation to each team that has a slot
      for (const team of new Set(teamsWithSlots)) {
        updatedPcaAllocations[team] = updatedPcaAllocations[team] || []
        updatedPcaAllocations[team].push(allocWithStaff)
      }
    }

    setPcaAllocations(updatedPcaAllocations)
    
    // Handle any errors from the algorithm
    const preferredSlotWarnings = Array.isArray(result.errors?.preferredSlotUnassigned)
      ? result.errors!.preferredSlotUnassigned!.filter(Boolean)
      : []
    if (preferredSlotWarnings.length > 0) {
      const msg = preferredSlotWarnings.join('; ')
      setPcaAllocationErrors((prev: PCAAllocationErrors) => ({
        ...prev,
        preferredSlotUnassigned: msg,
      }))
      showActionToast('Step 3 completed with warnings.', 'warning', msg)
    }
    
    // Mark Step 3 as initialized and completed (domain-owned)
    scheduleActions.markStepCompleted('floating-pca')
    if (preferredSlotWarnings.length === 0) {
      showActionToast('Step 3 allocation completed.', 'success', 'Floating PCA assignments updated.')
    }
  }
  
  /**
   * Handle cancel from FloatingPCAConfigDialog
   */
  const handleFloatingPCAConfigCancel = () => {
    closeAllStep3Dialogs()
  }

  /**
   * Reset to baseline - clear all staff overrides and start fresh
   */
  const resetToBaseline = () => {
    scheduleActions.resetToBaseline()
  }


  // Save all changes to database (batch save)
  const saveScheduleToDatabase = async () => {
    startTopLoading(0.06)
    bumpTopLoadingTo(0.12)

    let timing = null
    try {
      timing = await scheduleActions.saveScheduleToDatabase({
        userRole,
        toast: showActionToast,
        onProgress: bumpTopLoadingTo,
        startSoftAdvance,
        stopSoftAdvance,
      })
    } catch (e) {
      console.error('Error saving schedule:', e)
      showActionToast('Failed to save. Please try again.', 'error')
    } finally {
      if (timing) setLastSaveTiming(timing)
      finishTopLoading()
    }
  }

  // Check if there are unsaved changes (staff overrides or bed edits)
  const workflowDirty = useMemo(() => {
    const currentCompletedSteps = ALLOCATION_STEPS
      .filter((step) => {
        const status = stepStatus[step.id]
        return status === 'completed' || status === 'modified' || status === 'outdated'
      })
      .map((step) => step.id)
      .sort()

    const currentOutdatedSteps = ALLOCATION_STEPS
      .filter((step) => stepStatus[step.id] === 'outdated')
      .map((step) => step.id)
      .sort()

    if (!persistedWorkflowState) {
      return currentStep !== 'leave-fte' || currentCompletedSteps.length > 0 || currentOutdatedSteps.length > 0
    }

    const savedCompletedSteps = Array.isArray(persistedWorkflowState.completedSteps)
      ? [...persistedWorkflowState.completedSteps].sort()
      : []
    const savedOutdatedSteps = Array.isArray(persistedWorkflowState.outdatedSteps)
      ? [...persistedWorkflowState.outdatedSteps].sort()
      : []

    return (
      JSON.stringify(currentCompletedSteps) !== JSON.stringify(savedCompletedSteps) ||
      JSON.stringify(currentOutdatedSteps) !== JSON.stringify(savedOutdatedSteps)
    )
  }, [currentStep, persistedWorkflowState, stepStatus])

  // Check if there are unsaved changes (staff overrides or bed edits)
  const hasUnsavedChanges = useMemo(
    () =>
      staffOverridesVersion !== savedOverridesVersion ||
      bedCountsOverridesVersion !== savedBedCountsOverridesVersion ||
      bedRelievingNotesVersion !== savedBedRelievingNotesVersion ||
      JSON.stringify(allocationNotesDoc ?? null) !== JSON.stringify(savedAllocationNotesDoc ?? null) ||
      workflowDirty,
    [
      staffOverridesVersion,
      savedOverridesVersion,
      bedCountsOverridesVersion,
      savedBedCountsOverridesVersion,
      bedRelievingNotesVersion,
      savedBedRelievingNotesVersion,
      allocationNotesDoc,
      savedAllocationNotesDoc,
      workflowDirty,
    ]
  )

  const { handleConfirmCopy, leaveSetupPulseKey, isDateHighlighted } = useScheduleCopyWorkflow({
    scheduleActions,
    scheduleLoadedForDate: scheduleState.scheduleLoadedForDate,
    currentStep: scheduleState.currentStep,
    setCopying,
    startTopLoading,
    bumpTopLoadingTo,
    finishTopLoading,
    startSoftAdvance,
    stopSoftAdvance,
    showActionToast,
    formatDateForInput,
    formatDateDDMMYYYY,
    createTimingCollector,
    setLastCopyTiming,
    setCopyWizardOpen,
    setCopyWizardConfig,
    setCopyMenuOpen,
    clearCachedSchedule,
    clearDraftSchedule,
    queueDateTransition,
    setDatesWithData,
    loadDatesWithData,
  })

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = parseDateFromInput(e.target.value)
    if (!isNaN(newDate.getTime())) {
      queueDateTransition(newDate)
      setCalendarOpen(false) // Close calendar dialog when date is selected
    }
  }

  const currentWeekday = getWeekday(selectedDate)
  const weekdayName = WEEKDAY_NAMES[WEEKDAYS.indexOf(currentWeekday)]

  const {
    displayViewForCurrentWeekday,
    reservedSpecialProgramPcaFteForStep3,
    existingAllocationsForStep3Dialog,
    step3BootstrapSummary,
    step3BootstrapSummaryV2,
    step3ProjectionV2,
    step3DashboardAvgPcaDisplayByTeam,
    pendingPCAFTEForStep3Dialog,
  } = useStep3DialogProjection({
    latestStep3DependencyFingerprintRef,
    latestStep4DependencyFingerprintRef,
    therapistAllocations,
    selectedDate,
    specialPrograms,
    staffOverrides,
    staff,
    bufferStaff,
    existingAllocationsForStep3,
    floatingPCAsForStep3,
    visibleTeams,
    teamContributorsByMain,
    calculations,
    mergedInto: effectiveTeamMergeConfig.mergedInto,
    step2Result,
    step3DialogSurface,
    pendingPCAFTEPerTeam,
    currentWeekday,
  })

  const { captureStep3BootstrapBaseline, startBufferedStep2ToastSession } =
    useScheduleBufferedStep2HandoffAfterProjection({
      successToast: step2SuccessToastBuffer,
      step3BootstrapSummary,
      step3BootstrapSummaryV2,
      calculations,
      showActionToast,
      dismissToast: dismissActionToast,
      lastShownToastRef,
    })

  const {
    handleInitializeAlgorithm,
    generateStep2_TherapistAndNonFloatingPCA,
    runStep2WithHarnessSubstitutionAuto,
    showSharedTherapistStep,
    showStep2Point2_SptFinalEdit,
    showStep2Point3_SharedTherapistEdit,
    applyStep2Point2_SptFinalEdits,
    applyStep2Point3_SharedTherapistEdits,
  } = useScheduleAlgorithmEntry({
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
  })

  useEffect(() => {
    if (!pendingStep2AfterInactivePromotion) return

    const overridesFromDialog = pendingStep2OverridesFromDialogRef.current
    const resolveAfterPromotion = pendingStep2ResolveAfterPromotionRef.current
    const promotedIds = pendingPromotedInactiveStaffIdsRef.current ?? []

    if (!overridesFromDialog || !resolveAfterPromotion) return

    setPendingStep2AfterInactivePromotion(false)

    ;(async () => {
      try {
        startBufferedStep2ToastSession()
        const mergedOverrides = { ...staffOverrides }
        const touchedProgramIds = new Set(
          Object.values(overridesFromDialog).flatMap((override: any) =>
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
            const filtered = currentList.filter(
              (entry: any) => !touchedProgramIds.has(String(entry?.programId ?? ''))
            )
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
        Object.entries(overridesFromDialog).forEach(([staffId, override]) => {
          if (mergedOverrides[staffId]) {
            mergedOverrides[staffId] = {
              ...mergedOverrides[staffId],
              ...override,
              specialProgramOverrides: (override as any).specialProgramOverrides,
            }
          } else {
            const staffMember =
              staff.find(s => s.id === staffId) ??
              bufferStaff.find(s => s.id === staffId) ??
              inactiveStaff.find(s => s.id === staffId)
            const isBuffer = staffMember?.status === 'buffer'
            const weekday = getWeekday(selectedDate)
            const sptConfiguredFte = (() => {
              if (!staffMember || staffMember.rank !== 'SPT') return undefined
              const cfg = sptAllocations.find(a => a.staff_id === staffMember.id && a.weekdays?.includes(weekday))
              const raw = (cfg as any)?.fte_addon
              const fte = typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
              return Number.isFinite(fte) ? Math.max(0, Math.min(fte, 1.0)) : undefined
            })()
            const baseFTE =
              isBuffer && typeof staffMember?.buffer_fte === 'number'
                ? staffMember!.buffer_fte
                : (staffMember?.rank === 'SPT' ? (sptConfiguredFte ?? 1.0) : 1.0)
            mergedOverrides[staffId] = {
              leaveType: null,
              fteRemaining: (override as any).fteRemaining ?? baseFTE,
              ...(override as any),
            }
          }
        })

        captureStep2DependencyBaseline(getSpecialProgramFinalizeContext(overridesFromDialog as any))
        setStaffOverrides(mergedOverrides)

        const cleanedOverrides = resetStep2OverridesForAlgoEntry({
          staffOverrides: mergedOverrides,
          allStaff: [...staff, ...bufferStaff],
        })
        setStaffOverrides(cleanedOverrides)

        while (true) {
          await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)

          const step22 = await showStep2Point2_SptFinalEdit()
          if (step22 === null) {
            clearBufferedStep2Toast()
            break
          }
          if (step22 && (step22 as any).__nav === 'back') {
            continue
          }
          const hasStep22Updates = !!(step22 && Object.keys(step22).length > 0)
          if (hasStep22Updates) {
            applyStep2Point2_SptFinalEdits(step22)
          }
          flushBufferedStep2Toast({ awaitCalculations: hasStep22Updates })
          scheduleFinalizeStep2DependencyChanges()
          break
        }
      } catch (e) {
        console.error('Error running Step 2 after inactive->buffer promotion:', e)
      } finally {
        bufferStep2SuccessToastRef.current = false
        pendingStep2OverridesFromDialogRef.current = null
        pendingStep2ResolveAfterPromotionRef.current = null
        pendingPromotedInactiveStaffIdsRef.current = null
        resolveAfterPromotion()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStep2AfterInactivePromotion, staff, inactiveStaff, bufferStaff])

  const {
    therapistAllocationsForDisplay,
    pcaAllocationsForDisplay,
    calculationsForDisplay,
    bedCountsOverridesByTeamForDisplay,
    bedRelievingNotesByToTeamForDisplay,
    bedAllocationsForDisplay,
    allPCAAllocationsFlat,
    step3OrderPositionByTeam,
    floatingPoolRemainingFte,
    therapistOverridesByTeam,
    staffOverridesForPcaDisplay,
    pcaOverridesByTeam,
    pcaBalanceSanity,
  } = useScheduleDisplayProjections({
    selectedDate,
    visibleTeams,
    teamContributorsByMain,
    mergedInto: effectiveTeamMergeConfig.mergedInto,
    therapistAllocations,
    pcaAllocationsForUi,
    bedAllocations,
    calculations: calculations as Record<Team, ScheduleCalculations | null>,
    staff,
    bufferStaff,
    staffOverrides,
    bedCountsOverridesByTeam,
    bedRelievingNotesByToTeam,
    teamAllocationOrder,
    currentStep,
    initializedSteps,
    displayViewForCurrentWeekday,
    specialPrograms,
  })

  const onEditTherapistByTeam = useMemo(() => {
    const next = createEmptyTeamRecordFactory<(staffId: string, e?: React.MouseEvent) => void>(() => () => {})
    for (const team of TEAMS) {
      next[team] = (staffId, e) => openStaffContextMenu(staffId, team, 'therapist', e)
    }
    return next
  }, [openStaffContextMenu])

  const onEditPcaByTeam = useMemo(() => {
    const next = createEmptyTeamRecordFactory<(staffId: string, e?: React.MouseEvent) => void>(() => () => {})
    for (const team of TEAMS) {
      next[team] = (staffId, e) => openStaffContextMenu(staffId, team, 'pca', e)
    }
    return next
  }, [openStaffContextMenu])

  // ---------------------------------------------------------------------------
  // Copy button helpers (dynamic labels and source/target resolution)
  // ---------------------------------------------------------------------------
  const selectedDateStr = formatDateForInput(selectedDate)
  const currentHasData = datesWithData.has(selectedDateStr)
  const isToday = selectedDateStr === formatDateForInput(new Date())

  const {
    snapshotDiffButtonRef,
    savedSetupPopoverOpen,
    setSavedSetupPopoverOpen,
    snapshotDiffExpanded,
    snapshotDiffLoading,
    snapshotDiffError,
    snapshotDiffResult,
    showSnapshotUiReminder,
    onToggleSnapshotDiffExpanded,
  } = useScheduleSnapshotDiff({
    supabase,
    currentScheduleId,
    selectedDateStr,
    baselineSnapshot,
    loading,
    gridLoading,
    userRole,
    showActionToast,
    dismissActionToast,
  })

  // Code-split dialog prefetch: keep initial bundle smaller, but hide first-open latency.
  useEffect(() => {
    if (!scheduleLoadedForDate) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      // Stage 1 (high-probability, lightweight): top-level actions users hit immediately.
      prefetchStaffEditDialog().catch(() => {})
      prefetchScheduleCopyWizard().catch(() => {})
      prefetchScheduleCalendarPopover().catch(() => {})
    }

    const w = window as any
    if (typeof w?.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 2500 })
      return () => {
        cancelled = true
        if (typeof w?.cancelIdleCallback === 'function') w.cancelIdleCallback(id)
      }
    }

    const t = window.setTimeout(run, 800)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scheduleLoadedForDate])

  let nextWorkingLabel = 'Copy to next working day'
  let nextWorkingEnabled = false
  let nextWorkingSourceDate: Date | null = null
  let nextWorkingTargetDate: Date | null = null
  let nextWorkingDirection: 'to' | 'from' = 'to'

  try {
    const nextWorkingDay = getNextWorkingDay(selectedDate)
    const nextWorkingStr = formatDateForInput(nextWorkingDay)
    const nextHasData = datesWithData.has(nextWorkingStr)

    if (currentHasData && !nextHasData) {
      nextWorkingLabel = 'Copy to next working day'
      nextWorkingEnabled = true
      nextWorkingSourceDate = selectedDate
      nextWorkingTargetDate = nextWorkingDay
      nextWorkingDirection = 'to'
    } else if (!currentHasData) {
      // Try copying FROM the last working day that has data
      const prevWorkingDay = getPreviousWorkingDay(selectedDate)
      const prevWorkingStr = formatDateForInput(prevWorkingDay)
      const prevHasData = datesWithData.has(prevWorkingStr)
      nextWorkingLabel = 'Copy from last working day'
      if (prevHasData) {
        nextWorkingEnabled = true
        nextWorkingSourceDate = prevWorkingDay
        nextWorkingTargetDate = selectedDate
        nextWorkingDirection = 'from'
      } else {
        nextWorkingEnabled = false
      }
    } else {
      // Both current and next working day have data – keep label but disable
      nextWorkingLabel = 'Copy to next working day'
      nextWorkingEnabled = false
    }
  } catch {
    // If working-day helpers throw (should be rare), keep option disabled
    nextWorkingEnabled = false
  }

  const specificLabel = currentHasData ? 'Copy to a specific date' : 'Copy from a specific date'
  const specificDirection: 'to' | 'from' = currentHasData ? 'to' : 'from'
  const specificEnabled = datesWithData.size > 0 || currentHasData

  const renderSchedulePageHeaderRightActions = () => (
    <SchedulePageHeaderRightActions
      userRole={userRole}
      isDisplayMode={isDisplayMode}
      saving={saving}
      copying={copying}
      access={access}
      onOpenLeaveSim={() => setDevLeaveSimOpen(true)}
      snapshotHealthReport={snapshotHealthReport}
      lastCopyTiming={lastCopyTiming}
      prefetchScheduleCopyWizard={prefetchScheduleCopyWizard}
      loadDatesWithData={loadDatesWithData}
      copyMenuOpen={copyMenuOpen}
      setCopyMenuOpen={setCopyMenuOpen}
      datesWithDataLoadedAtRef={datesWithDataLoadedAtRef}
      datesWithDataLoading={datesWithDataLoading}
      nextWorkingLabel={nextWorkingLabel}
      nextWorkingEnabled={nextWorkingEnabled}
      nextWorkingSourceDate={nextWorkingSourceDate}
      nextWorkingTargetDate={nextWorkingTargetDate}
      nextWorkingDirection={nextWorkingDirection}
      setCopyWizardConfig={setCopyWizardConfig}
      setCopyWizardOpen={setCopyWizardOpen}
      selectedDate={selectedDate}
      specificEnabled={specificEnabled}
      specificDirection={specificDirection}
      specificLabel={specificLabel}
      exportAction={renderExportAction()}
      lastSaveTiming={lastSaveTiming}
      hasUnsavedChanges={hasUnsavedChanges}
      onSaveSchedule={saveScheduleToDatabase}
    />
  )

  const sptWeekdayByStaffId = useMemo(() => {
    return getSptWeekdayConfigMap({ weekday: currentWeekday, sptAllocations })
  }, [currentWeekday, sptAllocations])

  const sptBaseFteByStaffId = useMemo(() => {
    const next: Record<string, number> = {}
    Object.entries(sptWeekdayByStaffId).forEach(([staffId, cfg]) => {
      next[staffId] = cfg.baseFte
    })
    return next
  }, [sptWeekdayByStaffId])

  const sptTeamsByStaffIdForStep22 = useMemo(() => {
    // Pick canonical row per staff_id: prefer active, then most recently updated.
    const byStaff = new Map<string, SPTAllocation[]>()
    for (const a of sptAllocations ?? []) {
      if (!a?.staff_id) continue
      const list = byStaff.get(a.staff_id) ?? []
      list.push(a)
      byStaff.set(a.staff_id, list)
    }
    const out: Record<string, Team[]> = {}
    for (const [staffId, rows] of byStaff.entries()) {
      const sorted = [...rows].sort((a, b) => {
        const aActive = a.active !== false
        const bActive = b.active !== false
        if (aActive !== bActive) return aActive ? -1 : 1
        const aT = a.updated_at ? Date.parse(a.updated_at) : 0
        const bT = b.updated_at ? Date.parse(b.updated_at) : 0
        return bT - aT
      })
      const row = sorted[0]
      const teams = Array.isArray(row?.teams) ? (row.teams as Team[]) : []
      out[staffId] = Array.from(
        new Set(
          teams
            .filter((t) => TEAMS.includes(t))
            .map((t) => getMainTeam(t, effectiveTeamMergeConfig.mergedInto))
            .filter((t) => recalculationTeams.includes(t))
        )
      )
    }
    return out
  }, [sptAllocations, effectiveTeamMergeConfig.mergedInto, recalculationTeams])

  const sptStaffForStep22 = useMemo(() => {
    return [...staff, ...bufferStaff].filter((s) => s.rank === 'SPT')
  }, [staff, bufferStaff])

  const currentSptAllocationByStaffIdForStep22 = useMemo(() => {
    const out: Record<string, { team: Team; fte: number } | null> = {}
    for (const team of recalculationTeams) {
      for (const alloc of therapistAllocationsForDisplay[team] ?? []) {
        if (alloc.staff?.rank !== 'SPT') continue
        out[alloc.staff_id] = { team, fte: alloc.fte_therapist ?? 0 }
      }
    }
    return out
  }, [recalculationTeams, therapistAllocationsForDisplay])

  const ptPerTeamByTeamForStep22 = useMemo(() => {
    const out: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
    for (const t of recalculationTeams) {
      out[t] = calculationsForDisplay[t]?.pt_per_team ?? 0
    }
    return out
  }, [recalculationTeams, calculationsForDisplay])

  // SPT leave edit enhancement:
  // Nullify legacy auto-filled "FTE Cost due to Leave" for SPT where it was derived from (1.0 - remaining),
  // even when there is no real leave. New model:
  // - Base SPT FTE comes from SPT weekday config (dashboard) unless overridden.
  // - Leave cost is user input (stored in staffOverrides[staffId].fteSubtraction).
  // - Remaining on duty is derived (stored in staffOverrides[staffId].fteRemaining).
  useEffect(() => {
    if (staff.length === 0) return
    if (sptAllocations.length === 0) return
    if (Object.keys(staffOverrides).length === 0) return

    let changed = false
    const next = { ...staffOverrides }

    for (const s of staff) {
      if (s.rank !== 'SPT') continue
      const cfgFTE = sptWeekdayByStaffId?.[s.id]?.baseFte
      if (typeof cfgFTE !== 'number' || !Number.isFinite(cfgFTE)) continue

      const o = next[s.id]
      if (!o) continue
      const onDuty = isOnDutyLeaveType(o.leaveType as any)

      const legacyAutoFilled =
        onDuty &&
        typeof o.fteSubtraction === 'number' &&
        Math.abs((o.fteRemaining ?? 0) - cfgFTE) < 0.01 &&
        Math.abs((o.fteSubtraction ?? 0) - (1.0 - (o.fteRemaining ?? 0))) < 0.01

      if (legacyAutoFilled && (o.fteSubtraction ?? 0) !== 0) {
        next[s.id] = { ...o, fteSubtraction: 0 }
        changed = true
      }

      // Fix another legacy edge: Step-2 special-program overrides may create a SPT override with default
      // fteRemaining=1.0 (even when dashboard-configured base is 0). When on duty and leave cost is 0,
      // sync remaining back to dashboard-configured base FTE.
      const leaveCost = typeof o.fteSubtraction === 'number' ? o.fteSubtraction : 0
      const remaining = typeof o.fteRemaining === 'number' ? o.fteRemaining : cfgFTE
      const looksLikeDefaultOne = Math.abs(remaining - 1.0) < 0.01
      const cfgClamped = Math.max(0, Math.min(cfgFTE, 1.0))
      if (
        onDuty &&
        leaveCost === 0 &&
        looksLikeDefaultOne &&
        Math.abs(cfgClamped - 1.0) > 0.01
      ) {
        next[s.id] = { ...o, fteRemaining: cfgClamped }
        changed = true
      }
    }

    if (changed) {
      setStaffOverrides(next)
    }
  }, [staff, sptAllocations.length, staffOverrides, currentWeekday, sptWeekdayByStaffId])

  // Filter out buffer staff from regular pools (they appear in Buffer Staff Pool)
  const therapists = staff.filter(s => ['SPT', 'APPT', 'RPT'].includes(s.rank) && s.status !== 'buffer')
  const pcas = staff.filter(s => s.rank === 'PCA' && s.status !== 'buffer')

  // Helper function to calculate popover position with viewport boundary detection
  const calculatePopoverPosition = (cardRect: { left: number; top: number; width: number; height: number }, popoverWidth: number) => {
    const padding = 10
    const estimatedPopoverHeight = 250 // Estimate based on max slots (4) + header + padding
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    
    // Calculate X position - prefer right side, but flip to left if it would be truncated
    let popoverX: number
    const rightEdge = cardRect.left + cardRect.width + padding + popoverWidth
    if (rightEdge > viewportWidth - 20) {
      // Position to the LEFT of the card to avoid right truncation
      popoverX = Math.max(10, cardRect.left - popoverWidth - padding)
    } else {
      // Position to the RIGHT of the card (default)
      popoverX = cardRect.left + cardRect.width + padding
    }
    
    // Calculate Y position - ensure it's not truncated at bottom
    let popoverY = cardRect.top
    const bottomEdge = popoverY + estimatedPopoverHeight
    if (bottomEdge > viewportHeight - 10) {
      // Adjust upward to fit in viewport
      popoverY = Math.max(10, viewportHeight - estimatedPopoverHeight - 10)
    }
    
    // IMPORTANT: SlotSelectionPopover is absolutely positioned in document space,
    // so convert viewport (client) coords to document coords.
    return { x: popoverX + scrollX, y: popoverY + scrollY }
  }

  // Helper function to get slots assigned to a specific team for a PCA
  const getSlotsForTeam = (allocation: PCAAllocation, team: Team): number[] => {
    const slots: number[] = []
    if (allocation.slot1 === team) slots.push(1)
    if (allocation.slot2 === team) slots.push(2)
    if (allocation.slot3 === team) slots.push(3)
    if (allocation.slot4 === team) slots.push(4)
    return slots
  }

  // Helper function to get slots that are part of special programs for a PCA in a team
  const getSpecialProgramSlotsForTeam = (allocation: PCAAllocation & { staff: Staff }, team: Team): number[] => {
    if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
      return []
    }

    return getAllocationSpecialProgramSlotsForTeam({
      allocation,
      team,
      specialProgramsById: displayViewForCurrentWeekday.getProgramsByAllocationTeam(allocation.team as Team | null | undefined),
    })
  }

  const {
    resetPcaDragState,
    performSlotTransfer,
    performSlotDiscard,
    performPcaSlotAssignFromPool,
    handleStartDragFromPopover,
    sensors,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  } = useScheduleBoardDndWiring({
    closeStaffContextMenu,
    closeStaffPoolContextMenu,
    staff,
    setActiveDragStaffForOverlay,
    therapistAllocationBlockRef,
    pcaAllocationBlockRef,
    currentStep,
    therapistAllocations,
    setTherapistAllocations,
    staffOverrides,
    setTherapistDragState,
    pcaAllocations,
    pcaDragState,
    setPcaDragState,
    therapistDragState,
    triggerHaptic,
    staffContextMenu,
    staffPoolContextMenu,
    calculatePopoverPosition,
    getSlotsForTeam,
    getSpecialProgramSlotsForTeam,
    captureUndoCheckpoint,
    setStaffOverrides,
    setBufferStaff,
    setPcaAllocations,
    bufferStaff,
    currentScheduleId,
    queueOptimisticPcaAction,
    setPendingPCAFTEPerTeam,
    stripExtraCoverageOverrides,
  })
  performSlotTransferFromPopoverRef.current = performSlotTransfer

  const { gridStaffContextMenuItems, staffPoolContextMenuItems } = useScheduleAllocationContextMenus({
    staffContextMenu,
    staffPoolContextMenu,
    closeStaffContextMenu,
    closeStaffPoolContextMenu,
    currentStep,
    staff,
    bufferStaff,
    inactiveStaff,
    staffOverrides,
    pcaAllocations,
    sptBaseFteByStaffId,
    getTherapistFteByTeam,
    handleEditStaff,
    startPcaContextAction,
    startTherapistContextAction,
    setColorContextAction,
    setPcaPoolAssignAction,
    setSptPoolAssignAction,
    setBufferStaffEditDialog,
    setBufferStaffConvertConfirm,
  })

  const gridInteractionOverlay = buildOverlayGroups({
    topLoadingVisible,
    topLoadingProgress,
    resetPcaDragState,
    handleStartDragFromPopover,
    performPcaSlotAssignFromPool,
    performSlotTransfer,
    performSlotDiscard,
    gridStaffContextMenuItems,
    staffPoolContextMenuItems,
    visibleTeams,
    staff,
    bufferStaff,
    setBufferStaff,
    staffOverrides,
    setStaffOverrides,
    showActionToast,
    getTherapistFteByTeam,
    getTherapistLeaveType,
    captureUndoCheckpoint,
    pcaAllocations,
    therapistAllocations,
    specialPrograms,
    sptWeekdayByStaffId,
    updateBufferStaffTeamAction,
    convertBufferStaffToInactiveAction,
    loadStaff,
    isLikelyMobileDevice,
    activeDragStaffForOverlay,
  })

  const scheduleDisplayToolsNode = isSplitMode ? null : (
    <SchedulePageToolbar
      isDisplayMode={isDisplayMode}
      isSplitMode={isSplitMode}
      isRefHidden={isRefHidden}
      canUndo={scheduleActions.canUndo}
      canRedo={scheduleActions.canRedo}
      onToggleDisplayMode={toggleDisplayMode}
      onToggleSplitMode={toggleSplitMode}
      onUndo={() => {
        if (isDisplayMode || !scheduleActions.canUndo) return
        const undone = scheduleActions.undoLastManualEdit()
        if (undone) {
          showActionToast('Undo', 'success', `Undid: ${undone.label}`)
        }
      }}
      onRedo={() => {
        if (isDisplayMode || !scheduleActions.canRedo) return
        const redone = scheduleActions.redoLastManualEdit()
        if (redone) {
          showActionToast('Redo', 'success', `Redid: ${redone.label}`)
        }
      }}
    />
  )

  // Avoid a transient "today → fallback date" flicker on cold load:
  // wait until our initial date resolver (URL param / last-open / fallback lookup) finishes.
  if (!initialDateResolved) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading schedule…</div>
      </div>
    )
  }

  return (
    <ScheduleDndContextShell
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <SchedulePageGridInteractionOverlays {...gridInteractionOverlay.overlayGroups} />

      
      <ScheduleMainBoardChrome isSplitMode={isSplitMode}>
        {exportPngLayerOpen ? (
          <div
            aria-hidden={true}
            style={{
              position: 'fixed',
              left: -100000,
              top: 0,
              // keep it out of flow but still renderable
              pointerEvents: 'none',
            }}
          >
            <AllocationExportView
              ref={exportPngRootRef}
              dateKey={toDateKey(selectedDate)}
              weekday={currentWeekday as any}
              currentStep={currentStep as any}
              teams={visibleTeams as any}
              teamDisplayNames={mainTeamDisplayNames as any}
              sptAllocations={sptAllocations as any}
              specialPrograms={specialPrograms as any}
              therapistAllocationsByTeam={therapistAllocationsForDisplay as any}
              pcaAllocationsByTeam={pcaAllocationsForDisplay as any}
              bedAllocations={bedAllocationsForDisplay as any}
              wards={(wards as any[]).map((w: any) => ({ name: w.name, team_assignments: w.team_assignments }))}
              calculationsByTeam={calculationsForDisplay as any}
              staff={staff as any}
              staffOverrides={staffOverridesForPcaDisplay as any}
              bedCountsOverridesByTeam={bedCountsOverridesByTeamForDisplay}
              bedRelievingNotesByToTeam={bedRelievingNotesByToTeamForDisplay as any}
              stepStatus={stepStatus as any}
              initializedSteps={initializedSteps as any}
              allPCAStaff={[
                ...staff.filter((s) => s.rank === 'PCA'),
                ...bufferStaff.filter((s) => s.rank === 'PCA'),
              ]}
              includePcaDedicatedTable={!isLikelyMobileDevice}
            />
          </div>
        ) : null}
        <div className={cn(!isSplitMode && 'inline-block min-w-full align-top', isSplitMode && 'flex-1 min-h-0 flex flex-col')}>
        {!isSplitMode && (
        <ScheduleHeaderBar
          userRole={userRole}
          showLoadDiagnostics={access.can('schedule.diagnostics.load')}
          showCacheStatus={access.can('schedule.diagnostics.cache-status')}
          lastLoadTiming={lastLoadTiming}
          navToScheduleTiming={navToScheduleTiming}
          perfTick={perfTick}
          perfStats={perfStatsRef.current}
          selectedDate={selectedDate}
          selectedDateKey={toDateKey(selectedDate)}
          weekdayName={weekdayName}
          isDateHighlighted={isDateHighlighted}
          calendarButtonRef={calendarButtonRef}
          onToggleCalendar={() => setCalendarOpen(!calendarOpen)}
          onSelectDate={(date) => {
                            setCalendarOpen(false)
            queueDateTransition(date)
          }}
          showSnapshotUiReminder={showSnapshotUiReminder && !isDisplayMode}
          savedSetupPopoverOpen={savedSetupPopoverOpen}
          onSavedSetupPopoverOpenChange={setSavedSetupPopoverOpen}
          snapshotDiffButtonRef={snapshotDiffButtonRef}
          snapshotDiffExpanded={snapshotDiffExpanded}
          onToggleSnapshotDiffExpanded={onToggleSnapshotDiffExpanded}
          snapshotDiffLoading={snapshotDiffLoading}
          snapshotDiffError={snapshotDiffError}
          snapshotDiffResult={snapshotDiffResult}
          canAccessDashboardSyncPublish={access.can('dashboard.category.sync-publish')}
          displayTools={scheduleDisplayToolsNode}
          rightActions={renderSchedulePageHeaderRightActions()}
          onClearCache={handleDeveloperCacheClear}
        />
        )}
        <ScheduleDevHarnessBridge
          allowRuntime={allowScheduleDevHarnessRuntime}
          open={devLeaveSimOpen}
          onOpenChange={setDevLeaveSimOpen}
          setDevLeaveSimOpen={setDevLeaveSimOpen}
          userRole={userRole}
          selectedDate={selectedDate}
          selectedDateKey={toDateKey(selectedDate)}
          weekday={currentWeekday}
          staff={staff}
          bufferStaff={bufferStaff}
          specialPrograms={specialPrograms}
          sptAllocations={sptAllocations}
          staffOverrides={staffOverrides}
          showSharedTherapistStep={showSharedTherapistStep}
          visibleTeams={visibleTeams}
          pendingPCAFTEPerTeam={pendingPCAFTEPerTeam}
          setStaffOverrides={setStaffOverrides}
          clearDomainFromStep={scheduleActions.clearDomainFromStep}
          goToStep={goToStep}
          setInitializedSteps={setInitializedSteps}
          setStepStatus={setStepStatus}
          setStep2Result={setStep2Result}
          setHasSavedAllocations={setHasSavedAllocations}
          setTieBreakDecisions={setTieBreakDecisions}
          recalculateScheduleCalculations={recalculateScheduleCalculations}
          runStep2TherapistAndNonFloatingPCA={scheduleActions.runStep2TherapistAndNonFloatingPCA}
          runStep3FloatingPCA={scheduleActions.runStep3FloatingPCA}
          setStep21RuntimeVisible={setStep21RuntimeVisible}
          showActionToast={showActionToast}
          specialProgramOverrideResolverRef={specialProgramOverrideResolverRef}
          prefetchSpecialProgramOverrideDialog={prefetchSpecialProgramOverrideDialog}
          setShowSpecialProgramOverrideDialog={setShowSpecialProgramOverrideDialog}
          generateStep2TherapistAndNonFloatingPCA={generateStep2_TherapistAndNonFloatingPCA}
          runStep2WithHarnessSubstitutionAuto={runStep2WithHarnessSubstitutionAuto}
          showStep2Point2SptFinalEdit={showStep2Point2_SptFinalEdit}
          applyStep2Point2SptFinalEdits={applyStep2Point2_SptFinalEdits}
          showStep2Point3SharedTherapistEdit={showStep2Point3_SharedTherapistEdit}
          applyStep2Point3SharedTherapistEdits={applyStep2Point3_SharedTherapistEdits}
          floatingPCAsForStep3={floatingPCAsForStep3}
          existingAllocationsForStep3={existingAllocationsForStep3}
          pcaPreferences={pcaPreferences}
          handleFloatingPCAConfigSave={handleFloatingPCAConfigSave}
          step2Result={step2Result}
          openStep3EntryDialog={openStep3EntryDialog}
          runStep4BedRelieving={runStep4BedRelieving}
          therapistAllocationsByTeam={therapistAllocations}
          pcaAllocationsByTeam={pcaAllocations}
          calculationsByTeam={calculations}
        />

        {/* Step Indicator with Navigation — see ScheduleWorkflowStepShell (Phase 2b) */}
        <ScheduleWorkflowStepShell
          isDisplayMode={isDisplayMode}
          isSplitMode={isSplitMode}
          steps={ALLOCATION_STEPS}
          currentStep={currentStep}
          stepStatus={stepStatus}
          attentionStepIds={attentionStepIds}
          userRole={userRole}
          canResetToBaseline={access.can('schedule.tools.reset-to-baseline')}
          onResetToBaseline={resetToBaseline}
          onStepClick={handleStepClick}
          canNavigateToStep={canNavigateToStep}
          onNext={handleNextStep}
          onPrevious={handlePreviousStep}
          canGoNext={currentStep !== 'review'}
          canGoPrevious={currentStep !== 'leave-fte'}
          onInitialize={handleInitializeAlgorithm}
          onInitializePrefetch={handleStepInitializePrefetch}
          onOpenLeaveSetup={isDisplayMode ? undefined : () => setStep1LeaveSetupOpen(true)}
          onClearStep={handleClearStep}
          showClear={showClearForCurrentStep}
          isInitialized={initializedSteps.has(currentStep)}
          isLoading={loading || isUiTransitionPending}
          isAlgorithmRunning={loading}
          leaveSetupPulseKey={leaveSetupPulseKey}
          belowDescriptionSlot={
            <Step2DialogReminder
              impact={step2DownstreamImpact}
              className="mt-0 w-full text-center text-sm leading-snug"
            />
          }
        />

        <div className={cn(isSplitMode && 'flex-1 min-h-0 overflow-hidden')}>
          {(() => {
          const mainLayout = (
            <ScheduleMainGrid
              rightContentHeight={typeof rightContentHeight === 'number' && rightContentHeight > 0 ? rightContentHeight : undefined}
              leftColumn={
                <ScheduleBoardLeftColumn
                  summaryColumnProps={{
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
                  }}
                  isDisplayMode={isDisplayMode}
                  MaybeProfiler={MaybeProfiler}
                  staffPool={{
                    therapists,
                    pcas,
                    inactiveStaff,
                    bufferStaff,
                    onConvertInactiveToBuffer: ({ staff, bufferFTE }) => {
                      scheduleActions.setScheduleStaffStatusOverride({
                        staffId: staff.id,
                        status: 'buffer',
                        bufferFTE,
                        nameAtTime: staff.name,
                        rankAtTime: staff.rank,
                      })
                    },
                    openStaffPoolContextMenu,
                    staffOverrides,
                    specialPrograms,
                    pcaAllocations,
                    currentStep,
                    initializedSteps,
                    poolWeekday: selectedDate ? getWeekday(selectedDate) : undefined,
                    staffPoolContextMenuOpen: staffPoolContextMenu.show,
                    snapshotNotice: showSnapshotUiReminder
                      ? `Staff pool is shown from the saved snapshot for ${formatDateDDMMYYYY(selectedDate)}.`
                      : undefined,
                    snapshotDateLabel: showSnapshotUiReminder ? formatDateDDMMYYYY(selectedDate) : undefined,
                    pcaSlotTransfer: {
                      setPcaDragState,
                      createActivePcaDragState,
                      staff,
                      performSlotTransfer,
                    },
                  }}
                />
              }
              rightColumn={
                <ScheduleBoardRightColumn
                  MaybeProfiler={MaybeProfiler}
                  layoutShell={{
                    isDisplayMode,
                    isSplitMode,
                    gridLoading,
                    deferBelowFold,
                    scheduleMinWidthPx,
                    visibleTeams,
                    visibleTeamGridStyle,
                    mainTeamDisplayNames,
                  }}
                  boardRefs={{
                    rightContentRef,
                    therapistAllocationBlockRef,
                    pcaAllocationBlockRef,
                  }}
                  teamGrid={{
                    currentWeekday,
                    currentStep,
                    stepStatus,
                    specialPrograms,
                    therapistAllocationsForDisplay,
                    onEditTherapistByTeam,
                    therapistOverridesByTeam,
                    sptWeekdayByStaffId,
                    pcaAllocationsForDisplay,
                    onEditPcaByTeam,
                    calculationsForDisplay,
                    step3DashboardAvgPcaDisplayByTeam,
                    allPCAAllocationsFlat,
                    pcaOverridesByTeam,
                    pcas,
                    initializedSteps,
                    popoverDragHoverTeam,
                    allocationTracker,
                    step3FlowChoiceForTooltip,
                    step3OrderPositionByTeam,
                    pendingPCAFTEPerTeam,
                    floatingPoolRemainingFte,
                    bedAllocationsForDisplay,
                    wards,
                    bedRelievingNotesByToTeamForDisplay,
                    saveBedRelievingNotesForToTeam,
                    activeBedRelievingTransfer,
                    setActiveBedRelievingTransfer,
                    setBedRelievingEditWarningPopover,
                    staffOverrides,
                    staff,
                    effectiveTeamMergeConfig,
                    handleEditStaff,
                    bedCountsOverridesByTeamForDisplay,
                    setEditingBedTeam,
                    pcaBalanceSanity,
                    bufferStaff,
                    pcaAllocations,
                    staffOverridesForPcaDisplay: staffOverridesForPcaDisplay as Record<string, StaffOverrideState>,
                    userRole,
                    allocationNotesDoc,
                    saveAllocationNotes,
                  }}
                />
              }
            />
          )

          if (!isSplitMode) {
            return mainLayout
          }

          const showReference = !isRefHidden
          const refSelectedDateForUi = (() => {
            if (refDateParam) {
              try {
                return parseDateFromInput(refDateParam)
              } catch {
                // ignore and fall back
              }
            }
            return selectedDate
          })()
          const splitReferenceLayer = (
            <SplitReferencePortal
              supabase={supabase}
              refDateParam={refDateParam}
              splitDirection={splitDirection}
              showReference={showReference}
              liveTeamSettingsRows={teamSettingsRows}
              datesWithData={datesWithData}
              holidays={holidays}
              replaceScheduleQuery={replaceScheduleQuery}
              refPortalHost={refPortalHost}
            />
          )

          const mainHeader = (
            <SchedulePageSplitMainPaneHeader
              isRefHidden={isRefHidden}
              isDisplayMode={isDisplayMode}
              canUndo={canUndo}
              canRedo={canRedo}
              onToggleDisplayMode={toggleDisplayMode}
              onExitSplitMode={toggleSplitMode}
              onUndoManualEdit={handleUndoManualEdit}
              onRedoManualEdit={handleRedoManualEdit}
            />
          )

          const splitHeaderBar = (
            <ScheduleHeaderBar
          userRole={userRole}
          showLoadDiagnostics={access.can('schedule.diagnostics.load')}
          showCacheStatus={access.can('schedule.diagnostics.cache-status')}
          lastLoadTiming={lastLoadTiming}
          navToScheduleTiming={navToScheduleTiming}
          perfTick={perfTick}
          perfStats={perfStatsRef.current}
          selectedDate={selectedDate}
          selectedDateKey={toDateKey(selectedDate)}
          weekdayName={weekdayName}
          isDateHighlighted={isDateHighlighted}
          calendarButtonRef={calendarButtonRef}
          onToggleCalendar={() => setCalendarOpen(!calendarOpen)}
          onSelectDate={(date) => {
                            setCalendarOpen(false)
            queueDateTransition(date)
          }}
          showSnapshotUiReminder={showSnapshotUiReminder && !isDisplayMode}
          savedSetupPopoverOpen={savedSetupPopoverOpen}
          onSavedSetupPopoverOpenChange={setSavedSetupPopoverOpen}
          snapshotDiffButtonRef={snapshotDiffButtonRef}
          snapshotDiffExpanded={snapshotDiffExpanded}
          onToggleSnapshotDiffExpanded={onToggleSnapshotDiffExpanded}
          snapshotDiffLoading={snapshotDiffLoading}
          snapshotDiffError={snapshotDiffError}
          snapshotDiffResult={snapshotDiffResult}
          canAccessDashboardSyncPublish={access.can('dashboard.category.sync-publish')}
          displayTools={scheduleDisplayToolsNode}
          rightActions={renderSchedulePageHeaderRightActions()}
        />
          )

          return (
            <ScheduleSplitLayout
              MaybeProfiler={MaybeProfiler}
              showReference={showReference}
              isRefHidden={isRefHidden}
              onToggleRefHidden={() => setRefHidden(!isRefHidden)}
              splitDirection={splitDirection}
              splitRatio={splitRatio}
              isSplitSwapped={isSplitSwapped}
              onSplitSwap={toggleSplitSwap}
              onSplitRatioCommit={commitSplitRatio}
              setRefPortalHost={setRefPortalHost}
              referenceDateForPane={refSelectedDateForUi}
              datesWithData={datesWithData}
              holidays={holidays}
              onRevealReferencePane={revealReferencePane}
              isSplitMode={isSplitMode}
              mainHeader={mainHeader}
              splitHeaderBar={splitHeaderBar}
              mainLayout={mainLayout}
              splitReferenceLayer={splitReferenceLayer}
            />
          )
        })()}
        </div>
        </div>

        <SchedulePageDialogNodes
          resolvers={{
            tieBreakResolverRef,
            specialProgramOverrideResolverRef,
            sptFinalEditResolverRef,
            sharedTherapistEditResolverRef,
            substitutionWizardResolverRef,
          }}
          step1AndStaff={{
            editingBedTeam,
            setEditingBedTeam,
            wards,
            bedCountsOverridesByTeam,
            captureUndoCheckpoint,
            setBedCountsOverridesByTeam,
            setStepStatus,
            step1LeaveSetupOpen,
            setStep1LeaveSetupOpen,
            staff,
            staffOverrides,
            specialPrograms,
            sptAllocations,
            currentWeekday,
            handleSaveStep1LeaveSetup,
            editingStaffId,
            therapistAllocations,
            pcaAllocationsForUi,
            editDialogOpen,
            setEditDialogOpen,
            handleSaveStaffEdit,
          }}
          copyWizard={{
            copyWizardConfig,
            copyWizardOpen,
            setCopyWizardOpen,
            setCopyWizardConfig,
            handleConfirmCopy,
            datesWithData,
            holidays,
          }}
          step2Dialogs={{
            tieBreakDialogOpen,
            setTieBreakDialogOpen,
            tieBreakTeams,
            tieBreakPendingFTE,
            showSpecialProgramOverrideDialog,
            setShowSpecialProgramOverrideDialog,
            inactiveStaff,
            sptBaseFteByStaffId,
            selectedDate,
            showStep21InStep2Stepper,
            showSharedTherapistStep,
            step2DownstreamImpact,
            loadStaff,
            loadSPTAllocations,
            staff,
            staffOverrides,
            specialPrograms,
            showSptFinalEditDialog,
            setShowSptFinalEditDialog,
            sptStaffForStep22,
            sptWeekdayByStaffId,
            sptTeamsByStaffIdForStep22,
            currentSptAllocationByStaffIdForStep22,
            ptPerTeamByTeamForStep22,
            showSharedTherapistEditDialog,
            setShowSharedTherapistEditDialog,
            sharedTherapistDialogData,
            setSharedTherapistDialogData,
            substitutionWizardOpen,
            substitutionWizardDataForDisplay,
            setSubstitutionWizardOpen,
            setSubstitutionWizardData,
            handleSubstitutionWizardConfirm,
            handleSubstitutionWizardCancel,
            handleSubstitutionWizardSkip,
            pcaPreferences,
          }}
          step3Floating={{
            floatingPCAEntryOpen,
            floatingPCAConfigV1Open,
            floatingPCAConfigV2Open,
            prefetchFloatingPCAConfigDialogV1,
            prefetchFloatingPCAConfigDialogV2,
            openStep3V1Dialog,
            openStep3V2Dialog,
            handleFloatingPCAConfigCancel,
            handleFloatingPCAConfigSave,
            visibleTeams,
            selectedDate,
            pendingPCAFTEForStep3Dialog,
            pcaPreferences,
            floatingPCAsForStep3,
            existingAllocationsForStep3Dialog,
            specialPrograms,
            bufferStaff,
            staffOverrides,
            step3BootstrapSummary,
            step3ProjectionV2,
            step2Result,
            reservedSpecialProgramPcaFteForStep3,
            staff,
          }}
          calendarAndSnapshot={{
            calendarOpen,
            setCalendarOpen,
            queueDateTransition,
            calendarButtonRef,
            calendarPopoverRef,
            selectedDate,
            datesWithData,
            holidays,
          }}
        />
        {mobilePreviewDialog}
      </ScheduleMainBoardChrome>
    </ScheduleDndContextShell>
  )
}

export default function SchedulePageClient() {
  return (
    <Suspense fallback={null}>
      <SchedulePageContent />
    </Suspense>
  )
}
