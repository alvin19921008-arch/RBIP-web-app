'use client'

import { useState, useEffect, useRef, Fragment, useCallback, Suspense, useMemo, Profiler, type ReactNode } from 'react'
import { DndContext, DragOverlay, DragEndEvent, DragStartEvent, DragMoveEvent, Active } from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { Team, Weekday, LeaveType } from '@/types/staff'
import {
  TherapistAllocation,
  PCAAllocation,
  BedAllocation,
  BedRelievingNoteRow,
  BedRelievingNotesByToTeam,
  ScheduleCalculations,
  AllocationTracker,
  WorkflowState,
  ScheduleStepId,
  BaselineSnapshot,
  BaselineSnapshotStored,
  GlobalHeadAtCreation,
  SnapshotHealthReport,
} from '@/types/schedule'
import { Staff } from '@/types/staff'
import { TeamColumn } from '@/components/allocation/TeamColumn'
import { StaffPool } from '@/components/allocation/StaffPool'
import { TherapistBlock } from '@/components/allocation/TherapistBlock'
import { PCABlock } from '@/components/allocation/PCABlock'
import { AllocationNotesBoard } from '@/components/allocation/AllocationNotesBoard'
import { BedBlock } from '@/components/allocation/BedBlock'
import { LeaveBlock } from '@/components/allocation/LeaveBlock'
import { CalculationBlock } from '@/components/allocation/CalculationBlock'
import {
  BedCountsEditDialog,
  type BedCountsOverridePayload,
  type BedCountsOverrideState,
  type BedCountsWardRow,
} from '@/components/allocation/BedCountsEditDialog'
import { PCACalculationBlock } from '@/components/allocation/PCACalculationBlock'
import { SummaryColumn } from '@/components/allocation/SummaryColumn'
import { Button } from '@/components/ui/button'
import { ActionToast } from '@/components/ui/action-toast'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { TieBreakDialog } from '@/components/allocation/TieBreakDialog'
import { StepIndicator } from '@/components/allocation/StepIndicator'
import dynamic from 'next/dynamic'
import { SlotSelectionPopover } from '@/components/allocation/SlotSelectionPopover'
import { StaffContextMenu } from '@/components/allocation/StaffContextMenu'
import { TeamPickerPopover } from '@/components/allocation/TeamPickerPopover'
import { ConfirmPopover } from '@/components/allocation/ConfirmPopover'
import { ScheduleOverlays } from '@/components/schedule/ScheduleOverlays'
import { ScheduleCalendarPopover } from '@/components/schedule/ScheduleCalendarPopover'
import { SnapshotDiffPopover } from '@/components/schedule/SnapshotDiffPopover'
import { ScheduleHeaderBar } from '@/components/schedule/ScheduleHeaderBar'
import { ScheduleDialogsLayer } from '@/components/schedule/ScheduleDialogsLayer'
import { ScheduleMainLayout } from '@/components/schedule/ScheduleMainLayout'
import { DevLeaveSimPanel } from '@/components/schedule/DevLeaveSimPanel'
import { Save, RefreshCw, RotateCcw, X, Copy, ChevronLeft, ChevronRight, Pencil, Trash2, Plus, PlusCircle, Highlighter, Check, GitMerge, Split, FilePenLine, UserX } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAccessControl } from '@/lib/access/useAccessControl'
import { getNextWorkingDay, getPreviousWorkingDay, isWorkingDay } from '@/lib/utils/dateHelpers'
import { getWeekday, formatDateDDMMYYYY, formatDateForInput, parseDateFromInput } from '@/lib/features/schedule/date'
import {
  buildStaffByIdMap,
  groupTherapistAllocationsByTeam,
  groupPcaAllocationsByTeamWithSlotTeams,
  sortTherapistApptFirstThenName,
  sortPcaNonFloatingFirstOnly,
  sortPcaNonFloatingFirstThenName,
} from '@/lib/features/schedule/grouping'
import { computeBedsDesignatedByTeam, computeBedsForRelieving, formatWardLabel } from '@/lib/features/schedule/bedMath'
import { getSptWeekdayConfigMap } from '@/lib/features/schedule/sptConfig'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import type { StaffData, AllocationContext } from '@/lib/algorithms/therapistAllocation'
import type { PCAAllocationContext, PCAData, FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import type { BedAllocationContext } from '@/lib/algorithms/bedAllocation'
import { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { executeSlotAssignments, SlotAssignment } from '@/lib/utils/reservationLogic'
import { Input } from '@/components/ui/input'

const ScheduleCopyWizard = dynamic(
  () => import('@/components/allocation/ScheduleCopyWizard').then(m => m.ScheduleCopyWizard),
  { ssr: false }
)
const StaffEditDialog = dynamic(() => import('@/components/allocation/StaffEditDialog').then(m => m.StaffEditDialog), {
  ssr: false,
})
const FloatingPCAConfigDialog = dynamic(
  () => import('@/components/allocation/FloatingPCAConfigDialog').then(m => m.FloatingPCAConfigDialog),
  { ssr: false }
)
const NonFloatingSubstitutionDialog = dynamic(
  () => import('@/components/allocation/NonFloatingSubstitutionDialog').then(m => m.NonFloatingSubstitutionDialog),
  { ssr: false }
)
const SpecialProgramOverrideDialog = dynamic(
  () => import('@/components/allocation/SpecialProgramOverrideDialog').then(m => m.SpecialProgramOverrideDialog),
  { ssr: false }
)
const BufferStaffCreateDialog = dynamic(
  () => import('@/components/allocation/BufferStaffCreateDialog').then(m => m.BufferStaffCreateDialog),
  { ssr: false }
)
const PCADedicatedScheduleTable = dynamic(
  () => import('@/components/allocation/PCADedicatedScheduleTable').then(m => m.PCADedicatedScheduleTable),
  { ssr: false }
)

const prefetchScheduleCopyWizard = () => import('@/components/allocation/ScheduleCopyWizard')
const prefetchStaffEditDialog = () => import('@/components/allocation/StaffEditDialog')
const prefetchFloatingPCAConfigDialog = () => import('@/components/allocation/FloatingPCAConfigDialog')
const prefetchSpecialProgramOverrideDialog = () => import('@/components/allocation/SpecialProgramOverrideDialog')
const prefetchNonFloatingSubstitutionDialog = () => import('@/components/allocation/NonFloatingSubstitutionDialog')
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  toDbLeaveType,
  fromDbLeaveType,
  isCustomLeaveType,
  normalizeFTE,
  programNamesToIds,
  assertValidSpecialProgramIds,
  SpecialProgramRef,
  prepareTherapistAllocationForDb,
  preparePCAAllocationForDb,
} from '@/lib/db/types'
import { useAllocationSync } from '@/lib/hooks/useAllocationSync'
import { useActionToast } from '@/lib/hooks/useActionToast'
import { useResizeObservedHeight } from '@/lib/hooks/useResizeObservedHeight'
import { useScheduleDateParam } from '@/lib/hooks/useScheduleDateParam'
import { resetStep2OverridesForAlgoEntry } from '@/lib/features/schedule/stepReset'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'
import { useAnchoredPopoverPosition } from '@/lib/hooks/useAnchoredPopoverPosition'
import { useOnClickOutside } from '@/lib/hooks/useOnClickOutside'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { buildBaselineSnapshotEnvelope, unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import { extractReferencedStaffIds, validateAndRepairBaselineSnapshot } from '@/lib/utils/snapshotValidation'
import { minifySpecialProgramsForSnapshot } from '@/lib/utils/snapshotMinify'
import { createTimingCollector, type TimingReport } from '@/lib/utils/timing'
import { getCachedSchedule, cacheSchedule, clearCachedSchedule, getCacheSize } from '@/lib/utils/scheduleCache'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { ALLOCATION_STEPS, EMPTY_BED_ALLOCATIONS, TEAMS, WEEKDAYS, WEEKDAY_NAMES } from '@/lib/features/schedule/constants'
import { useScheduleController } from '@/lib/features/schedule/controller/useScheduleController'
import type { PCAAllocationErrors } from '@/lib/features/schedule/controller/useScheduleController'


function SchedulePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const schedule = useScheduleController({ defaultDate: initialDefaultDate, supabase })
  const { state: scheduleState, actions: scheduleActions } = schedule
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
    allocationNotesDoc,
    savedAllocationNotesDoc,
    currentStep,
    stepStatus,
    initializedSteps,
    pendingPCAFTEPerTeam,
    persistedWorkflowState,
    baselineSnapshot,
    snapshotHealthReport,
    step2Result,
    pcaAllocationErrors,
    tieBreakDecisions,
  } = scheduleState
  const {
    beginDateTransition: controllerBeginDateTransition,
    loadScheduleForDate,
    loadAndHydrateDate,
    runStep4BedRelieving,
    prefetchStep2Algorithms,
    prefetchStep3Algorithms,
    prefetchBedAlgorithm,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    _unsafe,
  } = scheduleActions

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
  const [activeDragStaffForOverlay, setActiveDragStaffForOverlay] = useState<Staff | null>(null)
  const [activeBedRelievingTransfer, setActiveBedRelievingTransfer] = useState<{
    fromTeam: Team
    toTeam: Team
  } | null>(null)
  
  const LAST_OPEN_SCHEDULE_DATE_KEY = 'rbip_last_open_schedule_date'
  const [initialDateResolved, setInitialDateResolved] = useState(false)
  const initialDateResolutionStartedRef = useRef(false)

  const toDateKey = useCallback((d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  const isScheduleCompletedToStep4 = useCallback((workflowState: WorkflowState | null | undefined) => {
    const completed = (workflowState?.completedSteps || []) as any[]
    if (!Array.isArray(completed)) return false
    return completed.includes('bed-relieving') || completed.includes('review')
  }, [])

  // Bed-relieving highlight is only meaningful while editing that step.
  useEffect(() => {
    if (currentStep !== 'bed-relieving') setActiveBedRelievingTransfer(null)
  }, [currentStep])

  // Initial navigation behavior:
  // - If URL has ?date=..., respect it.
  // - Else if user previously opened a schedule in this session, restore it.
  // - Else open today, but if today has no saved data, fall back to the latest schedule completed to Step 4.
  useEffect(() => {
    if (initialDateResolutionStartedRef.current) return
    initialDateResolutionStartedRef.current = true

    let cancelled = false

    const resolve = async () => {
      try {
        const dateParam = searchParams.get('date')
        if (dateParam) {
          try {
            const parsed = parseDateFromInput(dateParam)
            controllerBeginDateTransition(parsed, { resetLoadedForDate: true })
          } catch (e) {
            console.warn('Invalid ?date= param; falling back to auto date selection.', e)
          } finally {
            if (!cancelled) setInitialDateResolved(true)
          }
          return
        }

        const stored =
          typeof window !== 'undefined' ? window.sessionStorage.getItem(LAST_OPEN_SCHEDULE_DATE_KEY) : null
        if (stored) {
          try {
            const parsed = parseDateFromInput(stored)
            controllerBeginDateTransition(parsed, { resetLoadedForDate: true })
          } catch (e) {
            console.warn('Invalid stored last-open schedule date; falling back to auto date selection.', e)
          } finally {
            if (!cancelled) setInitialDateResolved(true)
          }
          return
        }

        const today = new Date()
        const todayKey = toDateKey(today)

        // Check if today already has a saved schedule row (without auto-creating a blank schedule).
        const todayRes = await supabase
          .from('daily_schedules')
          .select('id,date,workflow_state')
          .eq('date', todayKey)
          .maybeSingle()

        const todayScheduleId = (todayRes.data as any)?.id as string | undefined
        const todayWorkflow = (todayRes.data as any)?.workflow_state as WorkflowState | null | undefined

        const scheduleHasAnyAllocations = async (scheduleId: string): Promise<boolean> => {
          try {
            const [tRes, pRes, bRes] = await Promise.all([
              supabase.from('schedule_therapist_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
              supabase.from('schedule_pca_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
              supabase.from('schedule_bed_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
            ])
            if (tRes.error || pRes.error || bRes.error) return true // be conservative: keep today on errors
            return (
              (tRes.data && (tRes.data as any[]).length > 0) ||
              (pRes.data && (pRes.data as any[]).length > 0) ||
              (bRes.data && (bRes.data as any[]).length > 0)
            )
          } catch {
            return true
          }
        }

        const findLastCompletedScheduleDateKey = async (): Promise<string | null> => {
          const res = await supabase
            .from('daily_schedules')
            .select('date,workflow_state')
            .order('date', { ascending: false })
            .limit(90)
          if (res.error) return null
          const rows = (res.data || []) as any[]
          for (const row of rows) {
            const wk = row?.workflow_state as WorkflowState | null | undefined
            if (isScheduleCompletedToStep4(wk) && typeof row?.date === 'string') return row.date
          }
          return null
        }

        let initialDate: Date = today

        if (todayScheduleId) {
          const hasSavedRows = await scheduleHasAnyAllocations(todayScheduleId)
          const hasProgress = isScheduleCompletedToStep4(todayWorkflow) || ((todayWorkflow?.completedSteps || [])?.length ?? 0) > 0
          if (!hasSavedRows && !hasProgress) {
            const lastCompletedKey = await findLastCompletedScheduleDateKey()
            if (lastCompletedKey) {
              try {
                initialDate = parseDateFromInput(lastCompletedKey)
              } catch {
                initialDate = today
              }
            }
          }
        } else {
          // No schedule row for today yet: fall back to last completed schedule date (if any) rather than creating a blank today schedule.
          const lastCompletedKey = await findLastCompletedScheduleDateKey()
          if (lastCompletedKey) {
            try {
              initialDate = parseDateFromInput(lastCompletedKey)
            } catch {
              initialDate = today
            }
          }
        }

        if (cancelled) return
        controllerBeginDateTransition(initialDate, { resetLoadedForDate: true })
        setInitialDateResolved(true)
      } catch (e) {
        console.error('Failed to resolve initial schedule date:', e)
        if (cancelled) return
        setInitialDateResolved(true)
      }
    }

    resolve()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist "last opened schedule date" so navigating away and back restores the same date.
  useEffect(() => {
    if (!initialDateResolved) return
    try {
      if (typeof window === 'undefined') return
      window.sessionStorage.setItem(LAST_OPEN_SCHEDULE_DATE_KEY, toDateKey(selectedDate))
    } catch {
      // ignore
    }
  }, [initialDateResolved, selectedDate, toDateKey])

  useScheduleDateParam({ searchParams, selectedDate, setSelectedDate: controllerBeginDateTransition })
  const [showBackButton, setShowBackButton] = useState(false)
  const gridLoadingUsesLocalBarRef = useRef(false)
  const [userRole, setUserRole] = useState<'developer' | 'admin' | 'user'>('user')
  const [devLeaveSimOpen, setDevLeaveSimOpen] = useState(false)
  const { actionToast, actionToastContainerRef, showActionToast, dismissActionToast, handleToastExited } = useActionToast()
  const highlightTimerRef = useRef<any>(null)
  const [highlightDateKey, setHighlightDateKey] = useState<string | null>(null)
  const [isDateHighlighted, setIsDateHighlighted] = useState(false)
  const [lastSaveTiming, setLastSaveTiming] = useState<TimingReport | null>(null)
  const [lastCopyTiming, setLastCopyTiming] = useState<TimingReport | null>(null)
  const [lastLoadTiming, setLastLoadTiming] = useState<TimingReport | null>(null)
  const latestLoadTimingKeyRef = useRef<string | null>(null)
  const perfStatsRef = useRef<
    Record<
      string,
      {
        commits: number
        totalActualMs: number
        maxActualMs: number
        lastActualMs: number
        lastPhase: 'mount' | 'update' | 'nested-update'
        lastCommitAtMs: number
      }
    >
  >({})
  const lastPerfTickAtRef = useRef(0)
  const [perfTick, setPerfTick] = useState(0)

  const onPerfRender = useCallback(
    (
      id: string,
      phase: 'mount' | 'update' | 'nested-update',
      actualDuration: number,
      _baseDuration: number,
      _startTime: number,
      commitTime: number
    ) => {
      if (userRole !== 'developer') return
      const current = perfStatsRef.current[id] ?? {
        commits: 0,
        totalActualMs: 0,
        maxActualMs: 0,
        lastActualMs: 0,
        lastPhase: 'mount' as const,
        lastCommitAtMs: 0,
      }
      current.commits += 1
      current.totalActualMs += actualDuration
      current.maxActualMs = Math.max(current.maxActualMs, actualDuration)
      current.lastActualMs = actualDuration
      current.lastPhase = phase
      current.lastCommitAtMs = commitTime
      perfStatsRef.current[id] = current

      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
      if (now - lastPerfTickAtRef.current > 750) {
        lastPerfTickAtRef.current = now
        setPerfTick((t) => t + 1)
      }
    },
    [userRole]
  )

  const MaybeProfiler = useCallback(
    ({ id, children }: { id: string; children: ReactNode }) => {
      // Profiler adds overhead; keep it developer-only.
      if (userRole !== 'developer') return <>{children}</>
      return (
        <Profiler id={id} onRender={onPerfRender}>
          {children}
        </Profiler>
      )
    },
    [onPerfRender, userRole]
  )
  const [navToScheduleTiming, setNavToScheduleTiming] = useState<{
    targetHref: string
    startMs: number
    loadingShownMs: number | null
    mountedMs: number | null
    gridReadyMs: number
  } | null>(null)
  const [topLoadingVisible, setTopLoadingVisible] = useState(false)
  const [topLoadingProgress, setTopLoadingProgress] = useState(0)
  const loadingBarIntervalRef = useRef<number | null>(null)
  const loadingBarHideTimeoutRef = useRef<number | null>(null)
  const [copying, setCopying] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [tieBreakDialogOpen, setTieBreakDialogOpen] = useState(false)
  const [tieBreakTeams, setTieBreakTeams] = useState<Team[]>([])
  const [tieBreakPendingFTE, setTieBreakPendingFTE] = useState<number>(0)
  const [tieBreakResolver, setTieBreakResolver] = useState<((team: Team) => void) | null>(null)
  const tieBreakResolverRef = useRef<((team: Team) => void) | null>(null)
  
  // Keep ref in sync with state
  useEffect(() => {
    tieBreakResolverRef.current = tieBreakResolver
  }, [tieBreakResolver])
  // tieBreakDecisions moved into useScheduleController() (domain state)

  // NOTE: Team grid used to have an internal horizontal scroller with a synced sticky header scroller.
  // That caused a mismatch where the grid could scroll horizontally while the StepIndicator / top area did not,
  // creating an "underlay" strip on the right. We now rely on page-level horizontal scroll instead.

  type SpecialProgramOverrideEntry = {
    programId: string
    therapistId?: string
    pcaId?: string
    slots?: number[]
    therapistFTESubtraction?: number
    pcaFTESubtraction?: number
    drmAddOn?: number
  }

  // Domain state moved into useScheduleController() (Stage 2 / Option A).
  const [editingBedTeam, setEditingBedTeam] = useState<Team | null>(null)
  const saveBedRelievingNotesForToTeam = useCallback(
    (toTeam: Team, notes: Partial<Record<Team, BedRelievingNoteRow[]>>) => {
      scheduleActions.updateBedRelievingNotes({ toTeam, notes: notes as any })
    },
    []
  )

  const saveAllocationNotes = useCallback(
    async (nextDoc: any) => {
      setAllocationNotesDoc(nextDoc)

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
      showActionToast('Notes saved.', 'success')
    },
    [currentScheduleId, selectedDate, supabase]
  )
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set())
  const [datesWithDataLoading, setDatesWithDataLoading] = useState(false)
  const datesWithDataLoadedAtRef = useRef<number | null>(null)
  const datesWithDataInFlightRef = useRef<Promise<void> | null>(null)
  // Adjacent-day schedule prefetch (warm `scheduleCache` without creating schedules)
  const adjacentSchedulePrefetchBaseKeyRef = useRef<string | null>(null)
  const adjacentSchedulePrefetchInFlightRef = useRef<Promise<void> | null>(null)
  const adjacentSchedulePrefetchedDatesRef = useRef<Set<string>>(new Set())
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map())
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
  // Step-wise allocation workflow domain state moved into useScheduleController().
  // Track which steps have been initialized (domain; moved into useScheduleController()).
  
  // Step 3.1: Floating PCA Configuration Dialog state
  const [floatingPCAConfigOpen, setFloatingPCAConfigOpen] = useState(false)
  
  // Step 2.0: Special Program Override Dialog state
  const [showSpecialProgramOverrideDialog, setShowSpecialProgramOverrideDialog] = useState(false)
  const [specialProgramOverrideResolver, setSpecialProgramOverrideResolver] = useState<
    ((
      overrides: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }> | null
    ) => void) | null
  >(null)
  const specialProgramOverrideResolverRef = useRef<
    ((overrides: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }> | null) => void) | null
  >(null)
  
  // Keep ref in sync with state
  useEffect(() => {
    specialProgramOverrideResolverRef.current = specialProgramOverrideResolver
  }, [specialProgramOverrideResolver])

  // Step 2.0: If the user selects staff from the inactive pool as a special-program substitute,
  // promote them to status='buffer' so they appear on the schedule page (active/buffer pool)
  // and are included in Step 2/3 algorithms.
  const [pendingStep2AfterInactivePromotion, setPendingStep2AfterInactivePromotion] = useState(false)
  const pendingStep2OverridesFromDialogRef = useRef<Record<string, any> | null>(null)
  const pendingStep2ResolveAfterPromotionRef = useRef<(() => void) | null>(null)
  const pendingPromotedInactiveStaffIdsRef = useRef<string[] | null>(null)

  useEffect(() => {
    if (!pendingStep2AfterInactivePromotion) return

    const overridesFromDialog = pendingStep2OverridesFromDialogRef.current
    const resolveAfterPromotion = pendingStep2ResolveAfterPromotionRef.current
    const promotedIds = pendingPromotedInactiveStaffIdsRef.current ?? []

    if (!overridesFromDialog || !resolveAfterPromotion) return

    // prevent re-entry
    setPendingStep2AfterInactivePromotion(false)

    ;(async () => {
      try {
        // Merge special program overrides into staffOverrides (same logic as in resolver)
        const mergedOverrides = { ...staffOverrides }
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

        setStaffOverrides(mergedOverrides)

        // RESET Step 2-related data when initializing the algorithm (shared helper).
        // IMPORTANT: preserve leave-derived availability (e.g. half-day leave availableSlots) for floating PCAs.
        const cleanedOverrides = resetStep2OverridesForAlgoEntry({
          staffOverrides: mergedOverrides,
          allStaff: [...staff, ...bufferStaff],
        })
        setStaffOverrides(cleanedOverrides)

        await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)
      } catch (e) {
        console.error('Error running Step 2 after inactive->buffer promotion:', e)
      } finally {
        pendingStep2OverridesFromDialogRef.current = null
        pendingStep2ResolveAfterPromotionRef.current = null
        pendingPromotedInactiveStaffIdsRef.current = null
        resolveAfterPromotion()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStep2AfterInactivePromotion, staff, inactiveStaff, bufferStaff])
  
  // Non-floating PCA substitution wizard state
  const [substitutionWizardOpen, setSubstitutionWizardOpen] = useState(false)
  const [substitutionWizardData, setSubstitutionWizardData] = useState<{
    teams: Team[]
    substitutionsByTeam: Record<Team, Array<{
      nonFloatingPCAId: string
      nonFloatingPCAName: string
      team: Team
      fte: number
      missingSlots: number[]
      availableFloatingPCAs: Array<{
        id: string
        name: string
        availableSlots: number[]
        isPreferred: boolean
        isFloorPCA: boolean
        blockedSlotsInfo?: Array<{ slot: number; reasons: string[] }>
      }>
    }>>
    isWizardMode: boolean // true if multiple teams, false if single team
    initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  } | null>(null)
  const substitutionWizardResolverRef = useRef<
    ((selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>) => void) | null
  >(null)
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
  const [therapistDragState, setTherapistDragState] = useState<{
    isActive: boolean
    staffId: string | null
    sourceTeam: Team | null
  }>({
    isActive: false,
    staffId: null,
    sourceTeam: null,
  })
  
  // Warning popover for therapist drag after step 2
  const [therapistTransferWarningPopover, setTherapistTransferWarningPopover] = useState<{
    show: boolean
    position: { x: number; y: number } | null
  }>({
    show: false,
    position: null,
  })
  
  // Warning popover for leave arrangement edit after step 1
  const [leaveEditWarningPopover, setLeaveEditWarningPopover] = useState<{
    show: boolean
    position: { x: number; y: number } | null
  }>({
    show: false,
    position: null,
  })

  // Contextual menus (schedule grid + staff pool)
  const [staffContextMenu, setStaffContextMenu] = useState<{
    show: boolean
    position: { x: number; y: number } | null
    anchor: { x: number; y: number } | null
    staffId: string | null
    team: Team | null
    kind: 'therapist' | 'pca' | null
  }>({
    show: false,
    position: null,
    anchor: null,
    staffId: null,
    team: null,
    kind: null,
  })

  const [staffPoolContextMenu, setStaffPoolContextMenu] = useState<{
    show: boolean
    position: { x: number; y: number } | null
    anchor: { x: number; y: number } | null
    staffId: string | null
  }>({
    show: false,
    position: null,
    anchor: null,
    staffId: null,
  })

  // Staff Pool: Assign slot (floating PCA) popover flow (team -> slots)
  const [pcaPoolAssignAction, setPcaPoolAssignAction] = useState<{
    show: boolean
    phase: 'team' | 'slots'
    position: { x: number; y: number } | null
    staffId: string | null
    staffName: string | null
    targetTeam: Team | null
    availableSlots: number[]
    selectedSlots: number[]
  }>({
    show: false,
    phase: 'team',
    position: null,
    staffId: null,
    staffName: null,
    targetTeam: null,
    availableSlots: [],
    selectedSlots: [],
  })

  // Staff Pool: Assign slot (SPT) flow (team picker only; assigns remaining weekday FTE)
  const [sptPoolAssignAction, setSptPoolAssignAction] = useState<{
    show: boolean
    position: { x: number; y: number } | null
    staffId: string | null
    staffName: string | null
    targetTeam: Team | null
    remainingFte: number
  }>({
    show: false,
    position: null,
    staffId: null,
    staffName: null,
    targetTeam: null,
    remainingFte: 0,
  })

  // Staff Pool: Buffer staff edit + convert confirmation
  const [bufferStaffEditDialog, setBufferStaffEditDialog] = useState<{
    open: boolean
    staff: Staff | null
    initialAvailableSlots: number[] | null
  }>({
    open: false,
    staff: null,
    initialAvailableSlots: null,
  })

  const [bufferStaffConvertConfirm, setBufferStaffConvertConfirm] = useState<{
    show: boolean
    position: { x: number; y: number } | null
    staffId: string | null
    staffName: string | null
  }>({
    show: false,
    position: null,
    staffId: null,
    staffName: null,
  })

  const [pcaContextAction, setPcaContextAction] = useState<{
    show: boolean
    mode: 'move' | 'discard'
    phase: 'team' | 'slots'
    position: { x: number; y: number } | null
    staffId: string | null
    staffName: string | null
    sourceTeam: Team | null
    targetTeam: Team | null
    availableSlots: number[]
    selectedSlots: number[]
  }>({
    show: false,
    mode: 'move',
    phase: 'team',
    position: null,
    staffId: null,
    staffName: null,
    sourceTeam: null,
    targetTeam: null,
    availableSlots: [],
    selectedSlots: [],
  })

  const [therapistContextAction, setTherapistContextAction] = useState<{
    show: boolean
    mode: 'move' | 'discard' | 'split' | 'merge'
    phase: 'team' | 'splitFte' | 'mergeSelect' | 'confirmDiscard'
    position: { x: number; y: number } | null
    staffId: string | null
    staffName: string | null
    sourceTeam: Team | null
    targetTeam: Team | null
    movedFteQuarter: number | null
    splitMovedHalfDayChoice?: 'AUTO' | 'AM' | 'PM' | 'UNSPECIFIED'
    splitStayHalfDayChoice?: 'AUTO' | 'AM' | 'PM' | 'UNSPECIFIED'
    splitInputMode?: 'moved' | 'stay'
    mergeInputMode?: 'intoSource' | 'intoSelected'
    mergeTeams: Team[]
  }>({
    show: false,
    mode: 'move',
    phase: 'team',
    position: null,
    staffId: null,
    staffName: null,
    sourceTeam: null,
    targetTeam: null,
    movedFteQuarter: null,
    splitMovedHalfDayChoice: 'AUTO',
    splitStayHalfDayChoice: 'AUTO',
    splitInputMode: 'moved',
    mergeInputMode: 'intoSource',
    mergeTeams: [],
  })

  const [colorContextAction, setColorContextAction] = useState<{
    show: boolean
    position: { x: number; y: number } | null
    staffId: string | null
    team: Team | null
    selectedClassName: string | null
  }>({
    show: false,
    position: null,
    staffId: null,
    team: null,
    selectedClassName: null,
  })

  // Global click-outside close for contextual popovers (non-modal)
  useEffect(() => {
    const anyOpen =
      pcaContextAction.show ||
      therapistContextAction.show ||
      colorContextAction.show ||
      pcaPoolAssignAction.show ||
      sptPoolAssignAction.show ||
      bufferStaffConvertConfirm.show
    if (!anyOpen) return

    const onDown = () => {
      if (pcaContextAction.show) {
        setPcaContextAction({
          show: false,
          mode: 'move',
          phase: 'team',
          position: null,
          staffId: null,
          staffName: null,
          sourceTeam: null,
          targetTeam: null,
          availableSlots: [],
          selectedSlots: [],
        })
      }
      if (therapistContextAction.show) {
        setTherapistContextAction({
          show: false,
          mode: 'move',
          phase: 'team',
          position: null,
          staffId: null,
          staffName: null,
          sourceTeam: null,
          targetTeam: null,
          movedFteQuarter: null,
          splitMovedHalfDayChoice: 'AUTO',
          splitStayHalfDayChoice: 'AUTO',
          splitInputMode: 'moved',
          mergeInputMode: 'intoSource',
          mergeTeams: [],
        })
      }
      if (colorContextAction.show) {
        setColorContextAction({
          show: false,
          position: null,
          staffId: null,
          team: null,
          selectedClassName: null,
        })
      }
      if (pcaPoolAssignAction.show) {
        setPcaPoolAssignAction({
          show: false,
          phase: 'team',
          position: null,
          staffId: null,
          staffName: null,
          targetTeam: null,
          availableSlots: [],
          selectedSlots: [],
        })
      }
      if (sptPoolAssignAction.show) {
        setSptPoolAssignAction({
          show: false,
          position: null,
          staffId: null,
          staffName: null,
          targetTeam: null,
          remainingFte: 0,
        })
      }
      if (bufferStaffConvertConfirm.show) {
        setBufferStaffConvertConfirm({
          show: false,
          position: null,
          staffId: null,
          staffName: null,
        })
      }
    }

    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [
    pcaContextAction.show,
    therapistContextAction.show,
    colorContextAction.show,
    pcaPoolAssignAction.show,
    sptPoolAssignAction.show,
    bufferStaffConvertConfirm.show,
  ])

  // Warning popover for bed relieving edit outside Step 4
  const [bedRelievingEditWarningPopover, setBedRelievingEditWarningPopover] = useState<{
    show: boolean
    position: { x: number; y: number } | null
  }>({
    show: false,
    position: null,
  })

  // Tooltip-like: dismiss on any outside click / Escape (no timer).
  useEffect(() => {
    if (!bedRelievingEditWarningPopover.show) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBedRelievingEditWarningPopover({ show: false, position: null })
    }
    const onPointerDown = () => {
      setBedRelievingEditWarningPopover({ show: false, position: null })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [bedRelievingEditWarningPopover.show])
  
  // PCA Drag-and-Drop state for slot transfer
  const [pcaDragState, setPcaDragState] = useState<{
    isActive: boolean
    isDraggingFromPopover: boolean // True when user started drag from the popover preview card
    staffId: string | null
    staffName: string | null
    sourceTeam: Team | null
    availableSlots: number[]  // Slots available for this PCA in the source team
    selectedSlots: number[]   // Slots user has selected to move
    showSlotSelection: boolean // Whether to show slot selection popover
    popoverPosition: { x: number; y: number } | null // Fixed position near source team
    isDiscardMode?: boolean // True when discarding slots (opposite of transfer)
    isBufferStaff?: boolean // True if the dragged PCA is buffer staff
  }>({
    isActive: false,
    isDraggingFromPopover: false,
    staffId: null,
    staffName: null,
    sourceTeam: null,
    availableSlots: [],
    selectedSlots: [],
    showSlotSelection: false,
    popoverPosition: null,
    isDiscardMode: false,
    isBufferStaff: false,
  })
  
  // Ref to track mouse position for popover drag
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Force re-render when mouse moves during popover drag
  const [, forceUpdate] = useState({})
  
  // Track which team is being hovered during popover drag (for visual feedback)
  const [popoverDragHoverTeam, setPopoverDragHoverTeam] = useState<Team | null>(null)
  
  // Helper to find team from element at point
  const findTeamAtPoint = (x: number, y: number): Team | null => {
    const elementsAtPoint = document.elementsFromPoint(x, y)
    for (const el of elementsAtPoint) {
      let current: Element | null = el
      while (current) {
        const pcaTeam = current.getAttribute('data-pca-team')
        if (pcaTeam) {
          return pcaTeam as Team
        }
        current = current.parentElement
      }
    }
    return null
  }
  
  // Prevent hover effects during popover drag by adding a class to body and injecting CSS
  useEffect(() => {
    if (pcaDragState.isDraggingFromPopover) {
      document.body.classList.add('popover-drag-active')
      
      // Inject CSS to prevent hover/selection effects
      const styleId = 'popover-drag-active-styles'
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style')
        style.id = styleId
        style.textContent = `
          body.popover-drag-active {
            user-select: none !important;
            -webkit-user-select: none !important;
          }
          body.popover-drag-active * {
            user-select: none !important;
            -webkit-user-select: none !important;
          }
        `
        document.head.appendChild(style)
      }
      
      return () => {
        document.body.classList.remove('popover-drag-active')
        const style = document.getElementById(styleId)
        if (style) {
          style.remove()
        }
      }
    }
  }, [pcaDragState.isDraggingFromPopover])
  
  // Track mouse movement and handle drop when dragging from popover
  useEffect(() => {
    if (!pcaDragState.isDraggingFromPopover) {
      // Clear hover state when not dragging from popover
      if (popoverDragHoverTeam) setPopoverDragHoverTeam(null)
      return
    }
    
    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY }
      
      // Track which team we're hovering over for visual feedback
      const hoveredTeamRaw = findTeamAtPoint(e.clientX, e.clientY)
      // Only highlight valid drop targets (exclude source team)
      const hoveredTeam = hoveredTeamRaw && hoveredTeamRaw !== pcaDragState.sourceTeam ? hoveredTeamRaw : null
      if (hoveredTeam !== popoverDragHoverTeam) {
        setPopoverDragHoverTeam(hoveredTeam)
      }
      
      forceUpdate({}) // Force re-render to update overlay position
    }
    
    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault() // Prevent default
      // Clear hover state
      setPopoverDragHoverTeam(null)
      
      // Find target team
      const targetTeam = findTeamAtPoint(e.clientX, e.clientY)
      
      if (targetTeam && targetTeam !== pcaDragState.sourceTeam && pcaDragState.selectedSlots.length > 0) {
        // Successfully dropped on a different team - perform transfer
        performSlotTransfer(targetTeam)
      } else {
        // Failed drop - show popover again
        setPcaDragState(prev => ({
          ...prev,
          isActive: false,
          isDraggingFromPopover: false,
          showSlotSelection: true,
        }))
      }
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp, { passive: false })
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [pcaDragState.isDraggingFromPopover, pcaDragState.sourceTeam, pcaDragState.selectedSlots, popoverDragHoverTeam])
  
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
        const raw = (profile as any)?.role
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
    if (!highlightDateKey) return
    const currentKey = formatDateForInput(selectedDate)
    if (currentKey !== highlightDateKey) return

    setIsDateHighlighted(true)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => {
      setIsDateHighlighted(false)
    }, 2000)
  }, [selectedDate, highlightDateKey])

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
      ((cached as any).baselineSnapshot?.staff?.length > 0 ||
        ((cached as any).therapistAllocs?.length ?? 0) > 0 ||
        ((cached as any).pcaAllocs?.length ?? 0) > 0 ||
        ((cached as any).bedAllocs?.length ?? 0) > 0)

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
  // Check for return path from history page
  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') {
      const returnPath = sessionStorage.getItem('scheduleReturnPath')
      setShowBackButton(!!returnPath)
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
          setLastLoadTiming(prev => {
            if (!prev) return prev
            const metaPrev = (prev.meta as any) || {}
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
    setLastLoadTiming(prev => {
      if (!prev) return prev
      const metaPrev = (prev.meta as any) || {}
      const existing = metaPrev.nav as any
      if (existing && typeof existing.startMs === 'number') return prev
      return { ...prev, meta: { ...metaPrev, nav: navToScheduleTiming } }
    })
  }, [navToScheduleTiming])


  // Load + hydrate schedule when date changes (domain logic is in controller).
  useEffect(() => {
    if (!initialDateResolved) return
    let cancelled = false

    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    if (scheduleLoadedForDate === dateStr) return
    latestLoadTimingKeyRef.current = dateStr

    // Immediately reflect the *current* selected date in the diagnostics tooltip to avoid a
    // transient "stale" display while the async load for this date is still in-flight.
    setLastLoadTiming((prev) => {
      const prevMeta: any = (prev as any)?.meta || {}
      if (typeof prevMeta?.dateStr === 'string' && prevMeta.dateStr === dateStr && !prevMeta.pending) {
        return prev
      }

      const cachedNow = !!getCachedSchedule(dateStr)
      const pending: any = {
        at: new Date().toISOString(),
        totalMs: 0,
        stages: [],
        meta: {
          dateStr,
          pending: true,
          cacheHit: cachedNow,
          cacheSize: getCacheSize(),
        },
      }

      return pending
    })

    const controller = new AbortController()

    ;(async () => {
      const report = await loadAndHydrateDate({
        date: selectedDate,
        signal: controller.signal,
        loadAllDataFallback: loadAllData,
        recalculateScheduleCalculations,
      })
      if (cancelled || controller.signal.aborted) return

      if (latestLoadTimingKeyRef.current !== dateStr) {
        return
      }
      if (report) setLastLoadTiming(report)
    })().catch((e) => {
      console.error('Error loading schedule:', e)
      if (cancelled || controller.signal.aborted) {
        return
      }
      if (latestLoadTimingKeyRef.current !== dateStr) {
        return
      }
      setLastLoadTiming(
        createTimingCollector().finalize({
          dateStr,
          error: (e as any)?.message || String(e),
        })
      )
    })

    return () => {
      cancelled = true
      controller.abort()
    }
    // NOTE: do not depend on scheduleLoadedForDate here; it is set during loadAndHydrateDate(),
    // and including it would cause this effect to re-run and abort in-flight loads (leaving
    // diagnostics stuck in "pending" on cache-hit navigations).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDateResolved, selectedDate])

  // Once the grid is ready (and skeleton is gone), render below-the-fold heavy components when the browser is idle.
  useEffect(() => {
    if (gridLoading) return
    if (!deferBelowFold) return
    const w = window as any
    let cancelled = false
    const run = () => {
      if (cancelled) return
      setDeferBelowFold(false)
    }
    const handle =
      typeof w.requestIdleCallback === 'function' ? w.requestIdleCallback(run, { timeout: 750 }) : window.setTimeout(run, 150)
    return () => {
      cancelled = true
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [deferBelowFold, gridLoading])

  // End hydration AFTER the load-driven state updates flush to the screen.
  // This ensures downstream hooks (e.g., useAllocationSync TRIGGER2) can reliably see isHydratingSchedule=true
  // during the load-driven currentStep/staffOverrides updates.
  useEffect(() => {
    if (!isHydratingSchedule) return
    if (loading) return
    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    if (scheduleLoadedForDate !== dateStr) return
    setIsHydratingSchedule(false)
  }, [isHydratingSchedule, loading, staff.length, selectedDate, scheduleLoadedForDate, hasLoadedStoredCalculations, hasSavedAllocations])

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

  // Load dates that have schedule data
  const loadDatesWithData = async (opts?: { force?: boolean }): Promise<void> => {
    try {
      // Dot semantics (aligned with History page):
      // show dot only if the schedule has any saved allocation rows (therapist/PCA/bed).
      const now = Date.now()
      const lastLoadedAt = datesWithDataLoadedAtRef.current
      if (!opts?.force && lastLoadedAt && now - lastLoadedAt < 60_000) return
      if (datesWithDataInFlightRef.current) return await datesWithDataInFlightRef.current

      const inFlight = (async () => {
        setDatesWithDataLoading(true)

        const { data: scheduleData, error: scheduleError } = await supabase
          .from('daily_schedules')
          .select('id,date')
          .order('date', { ascending: false })

        if (scheduleError) {
          console.error('Error loading schedule dates:', scheduleError)
          return
        }

        const schedules = (scheduleData || []) as any[]
        const scheduleIds = schedules.map(s => s.id).filter(Boolean)

        // If there are no schedules at all, clear dots.
        if (scheduleIds.length === 0) {
          setDatesWithData(new Set())
          datesWithDataLoadedAtRef.current = Date.now()
          return
        }

        // Chunk to avoid excessively long query strings for `.in(...)`.
        const chunkSize = 500
        const chunks: string[][] = []
        for (let i = 0; i < scheduleIds.length; i += chunkSize) {
          chunks.push(scheduleIds.slice(i, i + chunkSize))
        }

        const hasTherapist = new Set<string>()
        const hasPca = new Set<string>()
        const hasBed = new Set<string>()

        for (const ids of chunks) {
          const [therapistRes, pcaRes, bedRes] = await Promise.all([
            supabase.from('schedule_therapist_allocations').select('schedule_id').in('schedule_id', ids),
            supabase.from('schedule_pca_allocations').select('schedule_id').in('schedule_id', ids),
            supabase.from('schedule_bed_allocations').select('schedule_id').in('schedule_id', ids),
          ])
          ;(therapistRes.data || []).forEach((r: any) => r?.schedule_id && hasTherapist.add(r.schedule_id))
          ;(pcaRes.data || []).forEach((r: any) => r?.schedule_id && hasPca.add(r.schedule_id))
          ;(bedRes.data || []).forEach((r: any) => r?.schedule_id && hasBed.add(r.schedule_id))
        }

        const dotDates = schedules
          .filter(s => hasTherapist.has(s.id) || hasPca.has(s.id) || hasBed.has(s.id))
          .map(s => s.date)

        const dateSet = new Set<string>(dotDates)
        setDatesWithData(dateSet)
        datesWithDataLoadedAtRef.current = Date.now()
      })()

      datesWithDataInFlightRef.current = inFlight
      await inFlight
    } catch (error) {
      console.error('Error loading dates with data:', error)
    } finally {
      datesWithDataInFlightRef.current = null
      setDatesWithDataLoading(false)
    }
  }

  // Load holidays when calendar or copy wizard opens (reuses same CalendarGrid UI)
  useEffect(() => {
    if (!(calendarOpen || copyWizardOpen || copyMenuOpen)) return
    loadDatesWithData()

    let cancelled = false
    void (async () => {
      const { getHongKongHolidays } = await import('@/lib/utils/hongKongHolidays')
      if (cancelled) return
      // Generate holidays for selected year and next year
      const baseYear = selectedDate.getFullYear()
      const holidaysMap = new Map<string, string>()
      const yearHolidays = getHongKongHolidays(baseYear)
      const nextYearHolidays = getHongKongHolidays(baseYear + 1)
      yearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      nextYearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      if (cancelled) return
      setHolidays(holidaysMap)
    })().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [calendarOpen, copyWizardOpen, copyMenuOpen, selectedDate])

  // Background prefetch: after the main schedule finishes loading (cold-start critical path),
  // fetch calendar dots in idle time so the Copy menu doesn't flicker disabled->enabled.
  useEffect(() => {
    if (!scheduleLoadedForDate) return
    const now = Date.now()
    const lastLoadedAt = datesWithDataLoadedAtRef.current
    if (lastLoadedAt && now - lastLoadedAt < 60_000) return

    let cancelled = false
    const run = () => {
      if (cancelled) return
      loadDatesWithData().catch(() => {})
    }

    const w = window as any
    if (typeof w?.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 1200 })
      return () => {
        cancelled = true
        if (typeof w?.cancelIdleCallback === 'function') w.cancelIdleCallback(id)
      }
    }

    const t = window.setTimeout(run, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scheduleLoadedForDate])

  // Code-split dialog prefetch: keep initial bundle smaller, but hide first-open latency.
  useEffect(() => {
    if (!scheduleLoadedForDate) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      prefetchStaffEditDialog().catch(() => {})
      prefetchScheduleCopyWizard().catch(() => {})
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
        const isMeaningfulStep1Edit = (rawStaffOverrides: any): boolean => {
          if (!rawStaffOverrides || typeof rawStaffOverrides !== 'object') return false

          // 1) Staff status overrides (counts as meaningful)
          const statusOverrides = (rawStaffOverrides as any).__staffStatusOverrides
          if (statusOverrides && typeof statusOverrides === 'object' && Object.keys(statusOverrides).length > 0) {
            return true
          }

          // 2) Per-staff step-1 edits (ignore schedule-level __ keys like __allocationNotes)
          for (const [k, v] of Object.entries(rawStaffOverrides as any)) {
            if (k.startsWith('__')) continue
            if (!v || typeof v !== 'object') continue
            const o: any = v
            if (o.leaveType != null) return true
            if (typeof o.fteRemaining === 'number') return true
            if (o.invalidSlot != null) return true
            if (Array.isArray(o.invalidSlots) && o.invalidSlots.length > 0) return true
          }
          return false
        }

        const prefetchOneIfMeaningful = async (date: Date) => {
          const dateKey = toDateKey(date)
          if (adjacentSchedulePrefetchedDatesRef.current.has(dateKey)) return

          // Already cached → nothing to do.
          const beforeCacheSize = getCacheSize()
          const alreadyCached = getCachedSchedule(dateKey)
          if (alreadyCached) {
            adjacentSchedulePrefetchedDatesRef.current.add(dateKey)

            // Surface updated cache size in the existing load diagnostics tooltip.
            setLastLoadTiming((prev) => {
              if (!prev) return prev
              const metaPrev = (prev.meta as any) || {}
            if (typeof metaPrev.dateStr === 'string' && metaPrev.dateStr !== baseKey) return prev
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
          const scheduleId = (schedRow as any).id as string
          const rawStaffOverrides = (schedRow as any).staff_overrides

          const step1Edits = isMeaningfulStep1Edit(rawStaffOverrides)

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
            const metaPrev = (prev.meta as any) || {}
            if (typeof metaPrev.dateStr === 'string' && metaPrev.dateStr !== baseKey) return prev
            const nextMeta = {
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
          const metaPrev = (prev.meta as any) || {}
          if (typeof metaPrev.dateStr === 'string' && metaPrev.dateStr !== baseKey) return prev
          return { ...prev, meta: { ...metaPrev, cacheSize: getCacheSize() } }
        })
      })()
        .catch(() => {})
        .finally(() => {
          adjacentSchedulePrefetchInFlightRef.current = null
        })
    }

    const w = window as any
    if (typeof w?.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 1200 })
      return () => {
        cancelled = true
        if (typeof w?.cancelIdleCallback === 'function') w.cancelIdleCallback(id)
      }
    }

    const t = window.setTimeout(run, 350)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scheduleLoadedForDate, selectedDate, supabase, loadScheduleForDate, toDateKey])

  // -----------------------------------------------------------------------------
  // Thin top loading bar (stage-driven, shown for everyone during Save/Copy)
  // -----------------------------------------------------------------------------
  const startTopLoading = (initialProgress: number = 0.05) => {
    if (loadingBarHideTimeoutRef.current) {
      window.clearTimeout(loadingBarHideTimeoutRef.current)
      loadingBarHideTimeoutRef.current = null
    }
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
    setTopLoadingVisible(true)
    setTopLoadingProgress(Math.max(0, Math.min(1, initialProgress)))
  }

  const bumpTopLoadingTo = (target: number) => {
    setTopLoadingProgress(prev => Math.max(prev, Math.max(0, Math.min(1, target))))
  }

  const startSoftAdvance = (cap: number = 0.9) => {
    if (loadingBarIntervalRef.current) return
    loadingBarIntervalRef.current = window.setInterval(() => {
      setTopLoadingProgress(prev => {
        const max = Math.max(prev, Math.min(0.98, cap))
        if (prev >= max) return prev
        const step = Math.min(0.015 + Math.random() * 0.02, max - prev)
        return prev + step
      })
    }, 180)
  }

  const stopSoftAdvance = () => {
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
  }

  const finishTopLoading = () => {
    stopSoftAdvance()
    bumpTopLoadingTo(1)
    loadingBarHideTimeoutRef.current = window.setTimeout(() => {
      setTopLoadingVisible(false)
      setTopLoadingProgress(0)
      loadingBarHideTimeoutRef.current = null
    }, 350)
  }

  useEffect(() => {
    return () => {
      if (loadingBarIntervalRef.current) window.clearInterval(loadingBarIntervalRef.current)
      if (loadingBarHideTimeoutRef.current) window.clearTimeout(loadingBarHideTimeoutRef.current)
    }
  }, [])

  // applyBaselineSnapshot/buildBaselineSnapshotFromCurrentState moved into useScheduleController()

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadStaff(),
        loadSpecialPrograms(),
        loadSPTAllocations(),
        loadWards(),
        loadPCAPreferences(),
      ])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStaff = async () => {
    const [activeRes, inactiveRes, bufferRes] = await Promise.all([
      supabase
        .from('staff')
        .select('id,name,rank,special_program,team,floating,floor_pca,status,buffer_fte')
        .eq('status', 'active')  // Load active staff for allocations
        .order('rank', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('staff')
        .select('id,name,rank,special_program,team,floating,floor_pca,status,buffer_fte')
        .eq('status', 'inactive')  // Load inactive staff for inactive pool
        .order('rank', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('staff')
        .select('id,name,rank,special_program,team,floating,floor_pca,status,buffer_fte')
        .eq('status', 'buffer')  // Load buffer staff
        .order('rank', { ascending: true })
        .order('name', { ascending: true })
    ])

    if (activeRes.error) {
      console.error('Error loading active staff:', activeRes.error)
      
      // Fallback: try loading with old 'active' column if status column doesn't exist
      if (activeRes.error.message?.includes('column') || activeRes.error.code === 'PGRST116') {
        const fallbackRes = await supabase
          .from('staff')
          .select('*')
          .eq('active', true)
          .order('rank', { ascending: true })
          .order('name', { ascending: true })
        
        if (fallbackRes.data) {
          // Map active boolean to status
          const mappedData = fallbackRes.data.map(s => ({
            ...s,
            status: s.active ? 'active' : 'inactive'
          }))
          setStaff(mappedData)
        }
      }
    } else if (activeRes.data) {
      setStaff(activeRes.data)
    }
    
    if (inactiveRes.error) {
      console.error('Error loading inactive staff:', inactiveRes.error)
      
      // Fallback for inactive
      if (inactiveRes.error.message?.includes('column') || inactiveRes.error.code === 'PGRST116') {
        const fallbackRes = await supabase
          .from('staff')
          .select('*')
          .eq('active', false)
          .order('rank', { ascending: true })
          .order('name', { ascending: true })
        
        if (fallbackRes.data) {
          const mappedData = fallbackRes.data.map(s => ({
            ...s,
            status: 'inactive'
          }))
          setInactiveStaff(mappedData)
        }
      }
    } else if (inactiveRes.data) {
      setInactiveStaff(inactiveRes.data)
    }

    if (bufferRes.error) {
      console.error('Error loading buffer staff:', bufferRes.error)
      // Buffer staff is new, so no fallback needed
      setBufferStaff([])
    } else if (bufferRes.data) {
      setBufferStaff(bufferRes.data)
      // Include buffer staff in main staff array for allocation algorithms
      setStaff(prev => [...(activeRes.data || []), ...(bufferRes.data || [])])
    } else {
      // If no buffer staff, just set active staff
      if (activeRes.data) {
        setStaff(activeRes.data)
      }
    }
  }

  const loadSpecialPrograms = async () => {
    const { data } = await supabase
      .from('special_programs')
      .select('id,name,staff_ids,weekdays,slots,fte_subtraction,pca_required,therapist_preference_order,pca_preference_order')
    if (data) {
      setSpecialPrograms(data as SpecialProgram[])
    }
  }

  const loadSPTAllocations = async () => {
    // Load all SPT allocations (active and inactive), filter in code
    const { data, error } = await supabase.from('spt_allocations').select('*')
    if (data) {
      // Filter for active allocations (active !== false, handles null as active)
      const activeAllocations = data.filter(a => a.active !== false) as SPTAllocation[]
      setSptAllocations(activeAllocations)
    }
  }


  const loadWards = async () => {
    const { data } = await supabase.from('wards').select('*')
    if (data) {
      setWards(data.map((ward: any) => ({
        name: ward.name,
        total_beds: ward.total_beds,
        team_assignments: ward.team_assignments || {},
        team_assignment_portions: ward.team_assignment_portions || {},
      })))
    }
  }


  const loadPCAPreferences = async () => {
    const { data } = await supabase.from('pca_preferences').select('*')
    if (data) {
      setPcaPreferences(data as PCAPreference[])
    }
  }

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

  const closeStaffContextMenu = useCallback(() => {
    setStaffContextMenu({
      show: false,
      position: null,
      anchor: null,
      staffId: null,
      team: null,
      kind: null,
    })
  }, [])

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

  const closeStaffPoolContextMenu = useCallback(() => {
    setStaffPoolContextMenu({
      show: false,
      position: null,
      anchor: null,
      staffId: null,
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

  const closePcaPoolAssignAction = () => {
    setPcaPoolAssignAction({
      show: false,
      phase: 'team',
      position: null,
      staffId: null,
      staffName: null,
      targetTeam: null,
      availableSlots: [],
      selectedSlots: [],
    })
  }

  const closeSptPoolAssignAction = () => {
    setSptPoolAssignAction({
      show: false,
      position: null,
      staffId: null,
      staffName: null,
      targetTeam: null,
      remainingFte: 0,
    })
  }

  const closePcaContextAction = () => {
    setPcaContextAction({
      show: false,
      mode: 'move',
      phase: 'team',
      position: null,
      staffId: null,
      staffName: null,
      sourceTeam: null,
      targetTeam: null,
      availableSlots: [],
      selectedSlots: [],
    })
  }

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

  const closeTherapistContextAction = () => {
    setTherapistContextAction({
      show: false,
      mode: 'move',
      phase: 'team',
      position: null,
      staffId: null,
      staffName: null,
      sourceTeam: null,
      targetTeam: null,
      movedFteQuarter: null,
      splitMovedHalfDayChoice: 'AUTO',
      splitStayHalfDayChoice: 'AUTO',
      splitInputMode: 'moved',
      mergeInputMode: 'intoSource',
      mergeTeams: [],
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

  const getTherapistFteByTeam = (staffId: string): Partial<Record<Team, number>> => {
    const o = staffOverrides[staffId]
    if (o?.therapistTeamFTEByTeam && Object.keys(o.therapistTeamFTEByTeam).length > 0) {
      return { ...(o.therapistTeamFTEByTeam as any) }
    }

    const byTeam: Partial<Record<Team, number>> = {}
    for (const team of TEAMS) {
      for (const alloc of therapistAllocations[team] || []) {
        if (alloc.staff_id !== staffId) continue
        byTeam[team] = (byTeam[team] ?? 0) + (alloc.fte_therapist ?? 0)
      }
    }
    return byTeam
  }

  const getTherapistLeaveType = (staffId: string): LeaveType | null => {
    const o = staffOverrides[staffId]
    if (o && 'leaveType' in o) return o.leaveType ?? null
    for (const team of TEAMS) {
      const alloc = therapistAllocations[team]?.find(a => a.staff_id === staffId)
      if (alloc) return (alloc.leave_type as any) ?? null
    }
    return null
  }

  const closeColorContextAction = () => {
    setColorContextAction({
      show: false,
      position: null,
      staffId: null,
      team: null,
      selectedClassName: null,
    })
  }

  // Helper function to recalculate schedule calculations using current staffOverrides
  const recalculateScheduleCalculations = useCallback(() => {
    // Prevent recalculation churn during initial hydration if we already loaded stored calculations.
    if (hasLoadedStoredCalculations && isHydratingSchedule) {
      return
    }
    // In step 1, we need to recalculate even without allocations to show updated PT/team, avg PCA/team, bed/team
    // In other steps, we still need allocations to exist
    const hasAllocations = Object.keys(pcaAllocations).some(team => pcaAllocations[team as Team]?.length > 0)
    if (!hasAllocations && currentStep !== 'leave-fte') {
      return
    }
    
    // Build PCA allocations by team (reuse existing pcaAllocations state)
    const pcaByTeam = pcaAllocations
    
    // Build therapist allocations by team
    // In step 1 with no allocations, build from staff data
    let therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]>
    if (!hasAllocations && currentStep === 'leave-fte') {
      // Build therapist allocations from staff data for step 1
      therapistByTeam = {
        FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
      }
      staff.forEach(s => {
        if (['SPT', 'APPT', 'RPT'].includes(s.rank)) {
          const override = staffOverrides[s.id]
          const fte = override?.fteRemaining ?? 1.0
          if (fte > 0 && s.team) {
            // Create a minimal allocation object for calculation purposes
            const alloc: TherapistAllocation & { staff: Staff } = {
              id: '',
              schedule_id: '',
              staff_id: s.id,
              team: s.team,
              fte_therapist: fte,
              fte_remaining: 1.0 - fte,
              slot_whole: null,
              slot1: null,
              slot2: null,
              slot3: null,
              slot4: null,
              leave_type: override?.leaveType ?? null,
              special_program_ids: null,
              is_substitute_team_head: false,
              spt_slot_display: null,
              is_manual_override: false,
              manual_override_note: null,
              staff: s
            }
            therapistByTeam[s.team].push(alloc)
          }
        }
      })
    } else {
      // Reuse existing therapistAllocations state
      therapistByTeam = therapistAllocations
    }
    
    // Reuse the calculation logic from applySavedAllocations
    // CRITICAL: Use staffOverrides for current FTE values (not stale alloc.fte_therapist)
    const totalBedsAllTeams = wards.reduce((sum, ward) => sum + ward.total_beds, 0)
    const totalPTOnDutyAllTeams = TEAMS.reduce((sum, team) => {
      return sum + therapistByTeam[team].reduce((teamSum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        // Use staffOverrides for current FTE, fallback to alloc.fte_therapist
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_therapist || 0)
        const hasFTE = currentFTE > 0
        return teamSum + (isTherapist && hasFTE ? currentFTE : 0)
      }, 0)
    }, 0)
    
    // IMPORTANT: Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
    // Otherwise the global sum of bedsForRelieving becomes positive (e.g. +15) and Block 3 cannot match Block 5.
    const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

    TEAMS.forEach(team => {
      const ptPerTeam = therapistByTeam[team].reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        // Use staffOverrides for current FTE, fallback to alloc.fte_therapist
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_therapist || 0)
        const hasFTE = currentFTE > 0
        return sum + (isTherapist && hasFTE ? currentFTE : 0)
      }, 0)
      ptPerTeamByTeam[team] = ptPerTeam
    })

    const { bedsDesignatedByTeam, totalBedsEffectiveAllTeams } = computeBedsDesignatedByTeam({
      teams: TEAMS,
      wards: wards as any,
      bedCountsOverridesByTeam: bedCountsOverridesByTeam as any,
    })
    const { bedsForRelieving, overallBedsPerPT } = computeBedsForRelieving({
      teams: TEAMS,
      bedsDesignatedByTeam,
      totalBedsEffectiveAllTeams,
      totalPTByTeam: ptPerTeamByTeam,
    })
    
    // Calculate totals for PCA formulas using ALL on-duty PCAs from staff database
    // This ensures the requirement (Avg PCA/team) is CONSISTENT regardless of allocation state
    const totalPCAOnDuty = staff
      .filter(s => s.rank === 'PCA')
      .reduce((sum, s) => {
        const overrideFTE = staffOverrides[s.id]?.fteRemaining
        // For buffer staff, use buffer_fte as base
        const isBufferStaff = s.status === 'buffer'
        const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
        // Use override FTE if set, otherwise default to baseFTE (or 0 if on leave)
        const isOnLeave = staffOverrides[s.id]?.leaveType && staffOverrides[s.id]?.fteRemaining === 0
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (isOnLeave ? 0 : baseFTE)
        return sum + currentFTE
      }, 0)
    // Keep the old calculation for comparison in logs
    const seenPCAIds = new Set<string>()
    const totalPCAFromAllocations = TEAMS.reduce((sum, team) => {
      return sum + pcaByTeam[team].reduce((teamSum, alloc) => {
        if (seenPCAIds.has(alloc.staff_id)) return teamSum
        seenPCAIds.add(alloc.staff_id)
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
        return teamSum + currentFTE
      }, 0)
    }, 0)
    // Use totalPCAOnDuty (from staff DB) for consistent requirements
    const bedsPerPCA = totalPCAOnDuty > 0 ? totalBedsEffectiveAllTeams / totalPCAOnDuty : 0
    
    const scheduleCalcs: Record<Team, ScheduleCalculations | null> = {
      FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null
    }
    
    TEAMS.forEach(team => {
      const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
      const totalBedsDesignated = bedsDesignatedByTeam[team] ?? 0
      const designatedWards = teamWards.map(w => formatWardLabel(w as any, team))
      
      const teamTherapists = therapistByTeam[team]
      const ptPerTeam = teamTherapists.reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        // Use staffOverrides for current FTE, fallback to alloc.fte_therapist
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_therapist || 0)
        const hasFTE = currentFTE > 0
        return sum + (isTherapist && hasFTE ? currentFTE : 0)
      }, 0)
      
      const bedsPerPT = ptPerTeam > 0 ? totalBedsDesignated / ptPerTeam : 0
      
      const teamPCAs = pcaByTeam[team]
      const pcaOnDuty = teamPCAs.reduce((sum, alloc) => {
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
        return sum + currentFTE
      }, 0)
      const totalPTPerPCA = pcaOnDuty > 0 ? ptPerTeam / pcaOnDuty : 0
      
      // Use totalPCAOnDuty for consistent requirement calculation
      const averagePCAPerTeam = totalPTOnDutyAllTeams > 0
        ? (ptPerTeam * totalPCAOnDuty) / totalPTOnDutyAllTeams
        : (totalPCAOnDuty / TEAMS.length)
      
      const expectedBedsPerTeam = totalPTOnDutyAllTeams > 0 
        ? (totalBedsEffectiveAllTeams / totalPTOnDutyAllTeams) * ptPerTeam 
        : 0
      const requiredPCAPerTeam = bedsPerPCA > 0 ? expectedBedsPerTeam / bedsPerPCA : 0
      
      // For DRO: check if DRM is active and calculate base avg PCA/team (without +0.4)
      const weekday = getWeekday(selectedDate)
      const drmProgram = specialPrograms.find(p => p.name === 'DRM')
      const drmPcaFteAddon = 0.4
      // Note: averagePCAPerTeam calculated from allocations already reflects DRM add-on effect,
      // so for DRO with DRM, we need to subtract 0.4 to get the base value
      const baseAveragePCAPerTeam = team === 'DRO' && drmProgram && drmProgram.weekdays.includes(weekday)
        ? averagePCAPerTeam - drmPcaFteAddon
        : undefined
      // For DRO with DRM: average_pca_per_team should be the final value (with add-on)
      // Since averagePCAPerTeam already reflects the add-on from allocations, use it directly
      const finalAveragePCAPerTeam = averagePCAPerTeam
      
      scheduleCalcs[team] = {
        id: '',
        schedule_id: '',
        team,
        designated_wards: designatedWards,
        total_beds_designated: totalBedsDesignated,
        total_beds: totalBedsAllTeams,
        total_pt_on_duty: totalPTOnDutyAllTeams,
        beds_per_pt: bedsPerPT,
        pt_per_team: ptPerTeam,
        beds_for_relieving: bedsForRelieving[team],
        pca_on_duty: pcaOnDuty,
        total_pt_per_pca: totalPTPerPCA,
        total_pt_per_team: ptPerTeam,
        average_pca_per_team: finalAveragePCAPerTeam,
        base_average_pca_per_team: baseAveragePCAPerTeam,
        expected_beds_per_team: expectedBedsPerTeam,
        required_pca_per_team: requiredPCAPerTeam,
      }
    })
    
    setCalculations(scheduleCalcs)
  }, [pcaAllocations, therapistAllocations, staffOverrides, wards, bedCountsOverridesByTeam, selectedDate, specialPrograms, staff, currentStep])

  // Auto-recalculate when allocations change (e.g., after Step 2 algo)
  useEffect(() => {
    // During initial hydration, never recalculate (prevents progressive avg PCA/team changes).
    if (isHydratingSchedule) {
      return
    }
    // OPTIMIZATION: Skip recalculation if we've loaded stored calculations
    if (hasLoadedStoredCalculations) {
      return
    }
    const hasAllocations = Object.keys(pcaAllocations).some(team => pcaAllocations[team as Team]?.length > 0)
    if (hasAllocations) {
      recalculateScheduleCalculations()
    }
  }, [therapistAllocations, pcaAllocations, recalculateScheduleCalculations, hasLoadedStoredCalculations, isHydratingSchedule])

  // Recalculate beds + relieving beds when bed-count overrides change.
  useEffect(() => {
    // During initial hydration, never recalculate (prevents progressive avg PCA/team changes).
    if (isHydratingSchedule) {
      return
    }
    // OPTIMIZATION: Skip recalculation if we've loaded stored calculations (bed counts changes are handled separately)
    if (hasLoadedStoredCalculations) {
      // IMPORTANT: Do not clear persisted bed allocations.
      // If bed allocations exist in DB (completed schedules), they should show immediately on load.
      const shouldComputeBeds =
        stepStatus['bed-relieving'] === 'completed' || currentStep === 'bed-relieving' || currentStep === 'review'
      if (!shouldComputeBeds) {
        return
      }
      // IMPORTANT: During initial load, do not call recalculateScheduleCalculations when stored calculations exist.
      // Bed allocations are loaded from DB; skip the rest of this effect to prevent any recalc-triggered UI churn.
      return
    }
    const hasAllocations = Object.keys(pcaAllocations).some(team => pcaAllocations[team as Team]?.length > 0)
    if (!hasAllocations && currentStep !== 'leave-fte') {
      return
    }

    recalculateScheduleCalculations()

    const shouldComputeBeds =
      stepStatus['bed-relieving'] === 'completed' || currentStep === 'bed-relieving' || currentStep === 'review'

    if (!shouldComputeBeds) {
      return
    }

    // Compute bed allocations using current therapist allocations and bed-count overrides
    // IMPORTANT: Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
    const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

    TEAMS.forEach(team => {
      const ptPerTeam = therapistAllocations[team].reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_therapist || 0)
        const hasFTE = currentFTE > 0
        return sum + (isTherapist && hasFTE ? currentFTE : 0)
      }, 0)
      ptPerTeamByTeam[team] = ptPerTeam
    })

    const { bedsDesignatedByTeam, totalBedsEffectiveAllTeams } = computeBedsDesignatedByTeam({
      teams: TEAMS,
      wards: wards as any,
      bedCountsOverridesByTeam: bedCountsOverridesByTeam as any,
    })
    const { bedsForRelieving } = computeBedsForRelieving({
      teams: TEAMS,
      bedsDesignatedByTeam,
      totalBedsEffectiveAllTeams,
      totalPTByTeam: ptPerTeamByTeam,
    })

    const bedContext: BedAllocationContext = {
      bedsForRelieving,
      wards: wards.map(w => ({ name: w.name, team_assignments: w.team_assignments })),
    }
    let cancelled = false
    void (async () => {
      const { allocateBeds } = await import('@/lib/algorithms/bedAllocation')
      if (cancelled) return
      const bedResult = allocateBeds(bedContext)
      if (cancelled) return
      setBedAllocations(bedResult.allocations)
    })().catch((e) => console.error('Failed to recompute bed allocations:', e))
    return () => {
      cancelled = true
    }
  }, [
    bedCountsOverridesByTeam,
    hasLoadedStoredCalculations,
    isHydratingSchedule,
    currentStep,
    stepStatus,
    wards,
    therapistAllocations,
    staffOverrides,
    pcaAllocations,
    recalculateScheduleCalculations,
  ])

  // ============================================================================
  // CENTRALIZED ALLOCATION SYNC
  // Uses useAllocationSync hook to handle all allocation syncing in one place.
  // See .cursor/rules/stepwise-workflow-data.mdc for architecture documentation.
  // 
  // The hook handles two sync triggers:
  // 1. On staffOverrides change (within a step): Real-time UI sync
  // 2. On step transition (currentStep changes): Full sync for "before algo" state
  // ============================================================================
  useAllocationSync({
    staffOverrides,
    currentStep,
    staff,
    therapistAllocations,
    pcaAllocations,
    specialPrograms,
    sptAllocations,
    selectedDate,
    setTherapistAllocations,
    recalculateScheduleCalculations,
    isHydrating: isHydratingSchedule,
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
      
      // In step 1, we should NOT run the full allocation algorithm (which triggers tie-breakers)
      // We only recalculate schedule calculations (PT/team, avg PCA/team, daily bed load)
      // If we have existing allocations, preserve them and only update FTE values
      // If we don't have existing allocations, we still shouldn't run allocation - wait until step 2
      if (currentStep === 'leave-fte') {
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
        
        // Recalculate pending PCA FTE per team using updated allocations
        const updatedPendingFTE: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        
        // Calculate total PCA available (sum of base FTE)
        const totalPCA = staff
          .filter(s => s.rank === 'PCA')
          .reduce((sum, s) => {
            const override = newOverrides[s.id]
            const baseFTE = override?.fteSubtraction !== undefined
              ? 1.0 - override.fteSubtraction
              : (override?.fteRemaining ?? 1)
            const isOnLeave = override?.leaveType && override.fteRemaining === 0
            return sum + (isOnLeave ? 0 : baseFTE)
          }, 0)
        
        // Calculate total PT on duty from therapist allocations
        const totalPTOnDuty = TEAMS.reduce((sum, team) => {
          return sum + therapistAllocations[team].reduce((teamSum, alloc) => {
            const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
            const override = newOverrides[alloc.staff_id]
            const fte = override ? override.fteRemaining : (alloc.fte_therapist || 0)
            const hasFTE = fte > 0
            return teamSum + (isTherapist && hasFTE ? fte : 0)
          }, 0)
        }, 0)
        
        // Calculate required PCA per team
        const requiredPCA: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        
        TEAMS.forEach(team => {
          const ptPerTeam = therapistAllocations[team].reduce((sum, alloc) => {
            const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
            const override = newOverrides[alloc.staff_id]
            const fte = override ? override.fteRemaining : (alloc.fte_therapist || 0)
            const hasFTE = fte > 0
            return sum + (isTherapist && hasFTE ? fte : 0)
          }, 0)
          
          if (totalPTOnDuty > 0) {
            requiredPCA[team] = (ptPerTeam * totalPCA) / totalPTOnDuty
          } else {
            requiredPCA[team] = totalPCA / 8
          }
          
          // Add DRM add-on for DRO if applicable
          const weekday = getWeekday(selectedDate)
          const drmProgram = specialPrograms.find(p => p.name === 'DRM')
          if (team === 'DRO' && drmProgram && drmProgram.weekdays.includes(weekday)) {
            requiredPCA[team] += 0.4
          }
        })
        
        // Calculate assigned PCA per team from updated allocations
        const assignedPCA: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        
        TEAMS.forEach(team => {
          assignedPCA[team] = updatedAllocations[team].reduce((sum, alloc) => {
            return sum + (alloc.slot_assigned || 0)
          }, 0)
        })
        
        // Calculate pending FTE and apply rounding
        TEAMS.forEach(team => {
          const pending = Math.max(0, requiredPCA[team] - assignedPCA[team])
          updatedPendingFTE[team] = roundToNearestQuarterWithMidpoint(pending)
        })
        
        setPendingPCAFTEPerTeam(updatedPendingFTE)
        } else {
          // Fresh data in step 1 - don't run allocation algorithm yet
          // Just recalculate schedule calculations (already done above)
          // Allocation will happen in step 2 when user clicks "Initialize Algo"
        }
      } else {
        // Not in step 1 - run full allocation
        await generateAllocationsWithOverrides(newOverrides)
      }
    } catch (error) {
      console.error('Error updating allocations after staff edit:', error)
    }
  }

  const generateAllocationsWithOverrides = async (overrides: Record<string, { leaveType: LeaveType | null; fteRemaining: number; team?: Team; fteSubtraction?: number; availableSlots?: number[]; invalidSlot?: number }>) => {
    if (staff.length === 0) return

    setLoading(true)
    try {
      // Check if we have existing allocations (loaded data) - if so, we're just recalculating, not doing fresh allocation
      const hasExistingAllocations = Object.values(pcaAllocations).some(teamAllocs => teamAllocs.length > 0)
      const weekday = getWeekday(selectedDate)
      const sptAddonByStaffId = new Map<string, number>()
      for (const a of sptAllocations) {
        if (a.weekdays?.includes(weekday)) {
          const raw = (a as any).fte_addon
          const fte = typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
          if (Number.isFinite(fte)) sptAddonByStaffId.set(a.staff_id, fte)
        }
      }

      // Transform staff data for algorithms, applying overrides if they exist
      const staffData: StaffData[] = staff.map(s => {
        const override = overrides[s.id]
        const defaultTherapistFTE = s.rank === 'SPT' ? (sptAddonByStaffId.get(s.id) ?? 1.0) : 1.0
        const effectiveFTE = override ? override.fteRemaining : defaultTherapistFTE
        const isOnDuty = isOnDutyLeaveType(override?.leaveType as any)
        const isAvailable =
          s.rank === 'SPT'
            ? (override
                ? (override.fteRemaining > 0 || (override.fteRemaining === 0 && isOnDuty))
                : effectiveFTE >= 0) // SPT can be on-duty with configured FTE=0
            : (override ? override.fteRemaining > 0 : effectiveFTE > 0)
        const transformed = {
          id: s.id,
          name: s.name,
          rank: s.rank,
          team: override?.team ?? s.team, // Use team from override if present, otherwise use staff's default team
          special_program: s.special_program,
          fte_therapist: effectiveFTE,
          leave_type: override ? override.leaveType : null,
          is_available: isAvailable,
          availableSlots: override?.availableSlots,
        }
        return transformed
      })

      // Generate therapist allocations
      // Skip SPT allocation in step 1 - only run in step 2 when "Initialize Algo" is clicked
      const therapistContext: AllocationContext = {
        date: selectedDate,
        previousSchedule: null,
        staff: staffData,
        specialPrograms,
        sptAllocations,
        manualOverrides: {},
        includeSPTAllocation: false, // Skip SPT allocation in step 1
      }

      const { allocateTherapists } = await import('@/lib/algorithms/therapistAllocation')
      const therapistResult = allocateTherapists(therapistContext)

      // Group therapist allocations by team and add staff info
      const therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = {
        FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
      }

      therapistResult.allocations.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (staffMember) {
          const override = overrides[alloc.staff_id]
          // Always update FTE, leave_type, and team from override if it exists
          if (override) {
            alloc.fte_therapist = override.fteRemaining
            alloc.leave_type = override.leaveType
            if (override.team) {
              alloc.team = override.team
            }
          }
          therapistByTeam[alloc.team].push({ ...alloc, staff: staffMember })
        }
      })
      
      // Sort therapist allocations: APPT first, then others
      TEAMS.forEach(team => {
        therapistByTeam[team].sort((a, b) => {
          const aIsAPPT = a.staff?.rank === 'APPT'
          const bIsAPPT = b.staff?.rank === 'APPT'
          if (aIsAPPT && !bIsAPPT) return -1
          if (!aIsAPPT && bIsAPPT) return 1
          return 0
        })
      })

      setTherapistAllocations(therapistByTeam)

      // Generate PCA allocations, applying overrides if they exist
      // For PCA: fte_pca = Base_FTE_remaining = 1.0 - fteSubtraction (for display and team requirement calculation)
      // For buffer PCA: use buffer_fte as base
      // True-FTE remaining for allocation = (availableSlots.length * 0.25) (special program FTE is handled during allocation, not in leave edit)
      const pcaData: PCAData[] = staff
        .filter(s => s.rank === 'PCA')
        .map(s => {
          const override = overrides[s.id]
          // For buffer staff, use buffer_fte as base
          const isBufferStaff = s.status === 'buffer'
          const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
          // Calculate base_FTE_remaining = baseFTE - fteSubtraction (excluding special program subtraction)
          // This is used for calculating averagePCAPerTeam and for display
          const baseFTERemaining = override && override.fteSubtraction !== undefined
            ? Math.max(0, baseFTE - override.fteSubtraction)
            : (override ? override.fteRemaining : baseFTE) // Fallback to fteRemaining if fteSubtraction not available
          return {
            id: s.id,
            name: s.name,
            floating: s.floating || false,
            special_program: s.special_program,
            fte_pca: baseFTERemaining, // Base_FTE_remaining = baseFTE - fteSubtraction (for display and team requirements)
            leave_type: override ? override.leaveType : null,
            is_available: override ? (override.fteRemaining > 0) : true, // Use fteRemaining (includes special program) for availability check
            team: s.team,
            availableSlots: override?.availableSlots,
            invalidSlot: override?.invalidSlot,
          }
        })

      // Calculate average PCA per team based on PT FTE distribution (not equal distribution)
      // Formula: requiredPCAPerTeam = ptPerTeam[team] * totalPCA / totalPT
      // This ensures teams with more PT-FTE get proportionally more PCA
      // CRITICAL: Use the same calculation as step 1 (recalculateScheduleCalculations) for consistency
      // Use fteRemaining from staffOverrides (same as step 1), not fte_pca from pcaData
      // This ensures avg PCA/team doesn't fluctuate between step 1 and step 2
      const totalPCA = staff
        .filter(s => s.rank === 'PCA')
        .reduce((sum, s) => {
          const overrideFTE = overrides[s.id]?.fteRemaining
          // Use override FTE if set, otherwise default to 1.0 (full day) unless on leave
          const isOnLeave = overrides[s.id]?.leaveType && overrides[s.id]?.fteRemaining === 0
          const currentFTE = overrideFTE !== undefined ? overrideFTE : (isOnLeave ? 0 : 1)
          return sum + currentFTE
        }, 0)
      
      // Calculate total PT on duty and PT per team from therapist allocations
      const ptPerTeamFromResult: Record<Team, number> = {
        FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
      }
      let totalPTOnDuty = 0
      
      therapistResult.allocations.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (staffMember) {
          const isTherapist = ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
          const override = overrides[alloc.staff_id]
          const fte = override ? override.fteRemaining : (alloc.fte_therapist || 0)
          const hasFTE = fte > 0
          if (isTherapist && hasFTE) {
            ptPerTeamFromResult[alloc.team] += fte
            totalPTOnDuty += fte
          }
        }
      })
      
      // Calculate average PCA per team: ptPerTeam * totalPCA / totalPT
      // Then round to nearest 0.25 for fair allocation
      const averagePCAPerTeam: Record<Team, number> = {} as Record<Team, number>
      const rawAveragePCAPerTeam: Record<Team, number> = {} as Record<Team, number>
      TEAMS.forEach(team => {
        if (totalPTOnDuty > 0) {
          const requiredPCA = (ptPerTeamFromResult[team] * totalPCA) / totalPTOnDuty
          rawAveragePCAPerTeam[team] = requiredPCA
          averagePCAPerTeam[team] = Math.round(requiredPCA * 4) / 4 // Round to nearest 0.25
        } else {
          const requiredPCA = totalPCA / 8
          rawAveragePCAPerTeam[team] = requiredPCA
          averagePCAPerTeam[team] = requiredPCA // Fallback to equal distribution
        }
      })

      // DRM Program: Add PCA FTE add-on to DRO team (before allocation algorithm)
      // This is a FORCE ADD-ON (0.4 FTE) to DRO team's required PCA, not a subtraction from any PCA staff
      // This add-on is independent of which PCA staff are assigned to DRM or DRO team
      const drmProgram = specialPrograms.find(p => p.name === 'DRM')
      const drmPcaFteAddon = 0.4 // Fixed add-on value for DRM program
      
      if (drmProgram && drmProgram.weekdays.includes(weekday)) {
        // Add fixed 0.4 FTE to DRO team's average PCA (this is an add-on, not subtraction)
        // This increases the required PCA for DRO team, which the allocation algorithm will consider
        rawAveragePCAPerTeam['DRO'] += drmPcaFteAddon
        averagePCAPerTeam['DRO'] += drmPcaFteAddon
      }

      // Step 2 does NOT trigger tie-breakers - Step 3 handles them comprehensively
      // Use raw values (before rounding) for accurate pending calculation
      // Rounding is only for display/fair allocation, but pending calculation needs raw values
      const pcaContext: PCAAllocationContext = {
        date: selectedDate,
        totalPCAAvailable: totalPCA,
        pcaPool: pcaData,
        averagePCAPerTeam: rawAveragePCAPerTeam, // Use raw values for accurate pending calculation
        specialPrograms,
        pcaPreferences,
        // gymSchedules removed - now comes from pcaPreferences
        // onTieBreak removed - Step 2 does not trigger tie-breakers (handled in Step 3)
      }

      const { allocatePCA } = await import('@/lib/algorithms/pcaAllocation')
      const pcaResult = await allocatePCA(pcaContext)

      // Extract and store errors (for full allocation - includes both phases)
      if (pcaResult.errors) {
        setPcaAllocationErrors(pcaResult.errors)
      } else {
        setPcaAllocationErrors({})
      }

      // Group PCA allocations by team and add staff info
      // For special program allocations, also add to teams where slots are assigned
      const pcaByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
        FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
      }

      pcaResult.allocations.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (!staffMember) return
        
        const override = overrides[alloc.staff_id]
        // Always update leave_type from override if it exists
        // Note: fte_pca in allocation is already rounded DOWN for PCA slot allocation
        // Don't overwrite with original value - keep the rounded value used for allocation
        if (override) {
          alloc.leave_type = override.leaveType
        }
        
        const allocationWithStaff = { ...alloc, staff: staffMember }
        
        // Collect all teams from slots (for both regular and special program allocations)
          const slotTeams = new Set<Team>()
          if (alloc.slot1) slotTeams.add(alloc.slot1)
          if (alloc.slot2) slotTeams.add(alloc.slot2)
          if (alloc.slot3) slotTeams.add(alloc.slot3)
          if (alloc.slot4) slotTeams.add(alloc.slot4)
          
        // Add to the team specified in alloc.team (for regular allocations)
        pcaByTeam[alloc.team].push(allocationWithStaff)
        
        // Also add to each team that has slots assigned (but not the original team to avoid duplicates)
        // This ensures floating PCA slots are displayed for the correct teams
          slotTeams.forEach(slotTeam => {
            if (slotTeam !== alloc.team) {
              pcaByTeam[slotTeam].push(allocationWithStaff)
            }
          })
      })
      
      // Sort PCA allocations: non-floating first, then floating
      TEAMS.forEach(team => {
        pcaByTeam[team].sort((a, b) => {
          const aIsNonFloating = !(a.staff?.floating ?? true)
          const bIsNonFloating = !(b.staff?.floating ?? true)
          if (aIsNonFloating && !bIsNonFloating) return -1
          if (!aIsNonFloating && bIsNonFloating) return 1
          return 0
        })
      })

      setPcaAllocations(pcaByTeam)

      // Store pending PCA FTE per team (used for Step 3 dialog)
      // Apply custom rounding to initial pending values (raw values used for tie-breaking internally)
      const roundedPendingValues: Record<Team, number> = {
        FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
      }
      Object.entries(pcaResult.pendingPCAFTEPerTeam).forEach(([team, pending]) => {
        roundedPendingValues[team as Team] = roundToNearestQuarterWithMidpoint(pending)
      })
      setPendingPCAFTEPerTeam(roundedPendingValues)

      // Calculate total beds across all wards and teams
      const totalBedsAllTeams = wards.reduce((sum, ward) => sum + ward.total_beds, 0)
      
      // Calculate total PT on duty (sum all FTE from all teams, including partial FTE)
      // Only count therapists (SPT, APPT, RPT) with FTE > 0
      const totalPTOnDutyAllTeams = TEAMS.reduce((sum, team) => {
        return sum + therapistByTeam[team].reduce((teamSum, alloc) => {
          const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
          const hasFTE = (alloc.fte_therapist || 0) > 0
          return teamSum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
        }, 0)
      }, 0)

      // Generate bed allocations
      const bedsForRelieving: Record<Team, number> = {
        FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
      }

      // Calculate beds for relieving based on overall beds per PT ratio
      // Overall beds per PT = total beds across all teams / total PT across all teams
      const overallBedsPerPT = totalPTOnDutyAllTeams > 0 
        ? totalBedsAllTeams / totalPTOnDutyAllTeams 
        : 0

      TEAMS.forEach(team => {
        // Calculate PT per team: sum all FTE for therapists in this team (only count therapists with FTE > 0)
        const ptPerTeam = therapistByTeam[team].reduce((sum, alloc) => {
          const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
          const hasFTE = (alloc.fte_therapist || 0) > 0
          return sum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
        }, 0)
        
        // Get the designated beds for this team
        const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
        const bedOverride = bedCountsOverridesByTeam?.[team] as any
        const calculatedBaseBeds = teamWards.reduce((sum, w) => {
          const overrideVal = bedOverride?.wardBedCounts?.[w.name]
          const effective =
            typeof overrideVal === 'number'
              ? Math.min(overrideVal, w.total_beds)
              : (w.team_assignments[team] || 0)
          return sum + effective
        }, 0)
        const shs = typeof bedOverride?.shsBedCounts === 'number' ? bedOverride.shsBedCounts : 0
        const students =
          typeof bedOverride?.studentPlacementBedCounts === 'number'
            ? bedOverride.studentPlacementBedCounts
            : 0
        const safeDeductions = Math.min(calculatedBaseBeds, shs + students)
        const totalBedsDesignated = Math.max(0, calculatedBaseBeds - safeDeductions)
        
        // Expected beds for this team based on overall beds per PT ratio
        const expectedBeds = overallBedsPerPT * ptPerTeam
        // Relieving beds = expected beds - actual designated beds
        bedsForRelieving[team] = expectedBeds - totalBedsDesignated
      })

      const shouldComputeBeds =
        stepStatus['bed-relieving'] === 'completed' || currentStep === 'bed-relieving' || currentStep === 'review'

      if (shouldComputeBeds) {
        const bedContext: BedAllocationContext = {
          bedsForRelieving,
          wards: wards.map(w => ({ name: w.name, team_assignments: w.team_assignments })),
        }

        const { allocateBeds } = await import('@/lib/algorithms/bedAllocation')
        const bedResult = allocateBeds(bedContext)
        setBedAllocations(bedResult.allocations)
      } else {
        setBedAllocations([])
      }

      // Calculate schedule calculations for each team
      const scheduleCalculations: Record<Team, ScheduleCalculations | null> = {
        FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null
      }

      // Note: weekday, drmProgram, and drmPcaFteAddon are already defined earlier in this function (around line 1060)
      
      // CRITICAL: Use totalPCAOnDuty (from staff DB) for STABLE requirement calculation
      // This ensures avg PCA/team doesn't fluctuate as floating PCAs get assigned/unassigned
      const totalPCAOnDuty = staff
        .filter(s => s.rank === 'PCA')
        .reduce((sum, s) => {
          const overrideFTE = overrides[s.id]?.fteRemaining
          const isOnLeave = overrides[s.id]?.leaveType && overrides[s.id]?.fteRemaining === 0
          return sum + (isOnLeave ? 0 : (overrideFTE !== undefined ? overrideFTE : 1))
        }, 0)
      
      // Also calculate totalPCAFromAllocations for reference (allocated PCAs only)
      const totalPCAFromAllocations = TEAMS.reduce((sum, team) => {
        return sum + pcaByTeam[team].reduce((teamSum, alloc) => {
          const overrideFTE = overrides[alloc.staff_id]?.fteRemaining
          const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
          return teamSum + currentFTE
        }, 0)
      }, 0)

      TEAMS.forEach(team => {
        const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
        const designatedWards = teamWards.map(w => formatWardLabel(w as any, team))
        const bedOverride = bedCountsOverridesByTeam?.[team] as any
        const calculatedBaseBeds = teamWards.reduce((sum, w) => {
          const overrideVal = bedOverride?.wardBedCounts?.[w.name]
          const effective =
            typeof overrideVal === 'number'
              ? Math.min(overrideVal, w.total_beds)
              : (w.team_assignments[team] || 0)
          return sum + effective
        }, 0)
        const shs = typeof bedOverride?.shsBedCounts === 'number' ? bedOverride.shsBedCounts : 0
        const students =
          typeof bedOverride?.studentPlacementBedCounts === 'number'
            ? bedOverride.studentPlacementBedCounts
            : 0
        const safeDeductions = Math.min(calculatedBaseBeds, shs + students)
        const totalBedsDesignated = Math.max(0, calculatedBaseBeds - safeDeductions)
        
        // Calculate PT per team: sum all FTE for therapists in this team (only count therapists with FTE > 0)
        const ptPerTeam = therapistByTeam[team].reduce((sum, alloc) => {
          const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
          const hasFTE = (alloc.fte_therapist || 0) > 0
          return sum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
        }, 0)
        
        const bedsPerPT = ptPerTeam > 0 ? totalBedsDesignated / ptPerTeam : 0
        // Use overrides if available to get the current FTE
        const pcaOnDuty = pcaByTeam[team].reduce((sum, alloc) => {
          const overrideFTE = overrides[alloc.staff_id]?.fteRemaining
          const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
          return sum + currentFTE
        }, 0)
        const totalPTPerPCA = pcaOnDuty > 0 ? ptPerTeam / pcaOnDuty : 0
        
        // Calculate averagePCAPerTeam using totalPCAOnDuty (from staff DB) for STABLE value
        // This ensures avg PCA/team doesn't fluctuate during step transitions
        const averagePCAPerTeam = totalPTOnDutyAllTeams > 0
          ? (ptPerTeam * totalPCAOnDuty) / totalPTOnDutyAllTeams
          : (totalPCAOnDuty / TEAMS.length) // Fallback to equal distribution

        // Calculate (3) Expected beds for team = (total beds / total PT) * (PT per team)
        const expectedBedsPerTeam = overallBedsPerPT * ptPerTeam
        
        // Calculate (4) Required PCA per team = (3) / (total beds / total PCAOnDuty)
        // Where total beds / total PCAOnDuty = beds per PCA
        const bedsPerPCA = totalPCAOnDuty > 0 ? totalBedsAllTeams / totalPCAOnDuty : 0
        const requiredPCAPerTeam = bedsPerPCA > 0 ? expectedBedsPerTeam / bedsPerPCA : 0

        // For DRO: store base avg PCA/team (without +0.4) separately
        // Note: averagePCAPerTeam calculated from allocations already reflects DRM add-on effect,
        // so for DRO with DRM, we need to subtract 0.4 to get the base value
        const baseAveragePCAPerTeam = team === 'DRO' && drmProgram && drmProgram.weekdays.includes(weekday)
          ? averagePCAPerTeam - drmPcaFteAddon
          : undefined

        // For DRO with DRM: average_pca_per_team should be the final value (with add-on)
        // Since averagePCAPerTeam already reflects the add-on from allocations, use it directly
        const finalAveragePCAPerTeam = averagePCAPerTeam

        scheduleCalculations[team] = {
          id: '',
          schedule_id: '',
          team,
          designated_wards: designatedWards,
          total_beds_designated: totalBedsDesignated,
          total_beds: totalBedsAllTeams, // This is now total across all teams
          total_pt_on_duty: totalPTOnDutyAllTeams, // This is now total across all teams
          beds_per_pt: bedsPerPT,
          pt_per_team: ptPerTeam, // Fixed: actual sum of FTE for this team
          beds_for_relieving: bedsForRelieving[team],
          pca_on_duty: pcaOnDuty,
          total_pt_per_pca: totalPTPerPCA,
          total_pt_per_team: ptPerTeam,
          average_pca_per_team: finalAveragePCAPerTeam,
          base_average_pca_per_team: baseAveragePCAPerTeam,
          expected_beds_per_team: expectedBedsPerTeam,
          required_pca_per_team: requiredPCAPerTeam,
        }

      })

      setCalculations(scheduleCalculations)
    } catch (error) {
      console.error('Error generating allocations:', error)
    } finally {
      setLoading(false)
    }
  }

  // NOTE: legacy "Regenerate All" dev action removed. Step-wise workflow uses explicit step actions instead.

  // ============================================================================
  // HELPER FUNCTIONS FOR STEP-WISE ALLOCATION
  // ============================================================================

  /**
   * Recalculates teamPCAAssigned and extracts non-floating allocations from current state.
   * This ensures Step 3 uses the latest data after any user edits in Step 2.
   * 
   * @returns Object containing recalculated teamPCAAssigned and non-floating allocations
   */
  const recalculateFromCurrentState = useCallback(() => {
    const teamPCAAssigned: Record<Team, number> = { 
      FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 
    }
    const existingAllocations: PCAAllocation[] = []

    // Track which staff IDs we've already added to avoid duplicates
    const addedStaffIds = new Set<string>()

    // Iterate through all current PCA allocations
    Object.entries(pcaAllocations).forEach(([team, allocs]) => {
      allocs.forEach(alloc => {
        // Use staffOverrides for latest FTE, fallback to alloc.fte_pca
        const currentFTE = staffOverrides[alloc.staff_id]?.fteRemaining ?? alloc.fte_pca ?? 1

        // Calculate slots assigned to this team
        let slotsInTeam = 0
        if (alloc.slot1 === team) slotsInTeam++
        if (alloc.slot2 === team) slotsInTeam++
        if (alloc.slot3 === team) slotsInTeam++
        if (alloc.slot4 === team) slotsInTeam++

        // Exclude invalid slot from count
        const invalidSlot = (alloc as any).invalid_slot
        if (invalidSlot) {
          const slotField = `slot${invalidSlot}` as keyof PCAAllocation
          if (alloc[slotField] === team) {
            slotsInTeam = Math.max(0, slotsInTeam - 1)
          }
        }

        // Add FTE contribution (0.25 per slot)
        teamPCAAssigned[team as Team] += slotsInTeam * 0.25

        // Collect ALL allocations (non-floating AND floating with slots assigned)
        // This ensures floating PCAs used for substitution in Step 2 are passed to Step 3
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (staffMember && !addedStaffIds.has(alloc.staff_id)) {
          // For floating PCAs, only include if they have slots assigned
          const hasSlots = alloc.slot1 !== null || alloc.slot2 !== null || 
                          alloc.slot3 !== null || alloc.slot4 !== null
          
          if (!staffMember.floating || hasSlots) {
            existingAllocations.push(alloc)
            addedStaffIds.add(alloc.staff_id)
          }
        }
      })
    })

    return { teamPCAAssigned, existingAllocations }
  }, [pcaAllocations, staffOverrides, staff])

  /**
   * Builds PCA data array from current staff and staffOverrides.
   * This ensures the algorithm uses the latest FTE values from user edits.
   */
  const buildPCADataFromCurrentState = useCallback((): PCAData[] => {
    return staff
      .filter(s => s.rank === 'PCA')
      .map(s => {
        const override = staffOverrides[s.id]
        // For buffer staff, use buffer_fte as base
        const isBufferStaff = s.status === 'buffer'
        const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
        const baseFTERemaining = override && override.fteSubtraction !== undefined
          ? Math.max(0, baseFTE - override.fteSubtraction)
          : (override ? override.fteRemaining : baseFTE)
        
        // Safety: buffer staff should never exceed its base FTE capacity.
        const effectiveBaseFTERemaining = isBufferStaff
          ? Math.min(baseFTE, baseFTERemaining)
          : baseFTERemaining
        
        // For floating PCAs, check if they have substitutionFor and exclude those slots from availableSlots
        let availableSlots = override?.availableSlots
        if (s.floating && override?.substitutionFor) {
          const substitutionSlots = override.substitutionFor.slots
          const baseAvailableSlots = availableSlots && availableSlots.length > 0
            ? availableSlots
            : [1, 2, 3, 4]
          // Remove substitution slots from available slots
          availableSlots = baseAvailableSlots.filter(slot => !substitutionSlots.includes(slot))
        }

        // Derive legacy invalidSlot from newer invalidSlots array when present (fallback to legacy invalidSlot).
        const invalidSlotFromArray =
          Array.isArray((override as any)?.invalidSlots) && (override as any).invalidSlots.length > 0
            ? (override as any).invalidSlots[0]?.slot
            : undefined
        const effectiveInvalidSlot =
          typeof (override as any)?.invalidSlot === 'number' ? (override as any).invalidSlot : invalidSlotFromArray

        // IMPORTANT: invalid slot should NOT be in availableSlots.
        if (effectiveInvalidSlot && Array.isArray(availableSlots)) {
          availableSlots = availableSlots.filter((slot) => slot !== effectiveInvalidSlot)
        }

        // NOTE: Do NOT clamp buffer PCA availableSlots here.
        // A floating buffer PCA with buffer_fte=0.5 does not mean it is only available for slots [1,2].
        // It means it has CAPACITY for 2 slots, and Step 2.1 should still be able to pick which missing slots it covers.
        // We handle "capacity" display separately in UI (and rely on fte_pca / fteRemaining to limit usage).
        
        
        
        return {
          id: s.id,
          name: s.name,
          floating: s.floating || false,
          special_program: s.special_program as string[] | null,
          team: s.team,
          fte_pca: effectiveBaseFTERemaining,
          leave_type: override?.leaveType || null,
          is_available: effectiveBaseFTERemaining > 0,
          availableSlots: availableSlots,
          invalidSlot: effectiveInvalidSlot,
          floor_pca: s.floor_pca || null,  // Include floor_pca for floor matching detection
        }
      })
  }, [staff, staffOverrides])

  // ============================================================================
  // STEP-WISE ALLOCATION FUNCTIONS
  // ============================================================================

  /**
   * Detect non-floating PCAs that need substitution (FTE ≠ 1.0)
   * Returns a record of teams with their non-floating PCAs needing substitution
   */
  const detectNonFloatingSubstitutions = useCallback((
    allocationsByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]>
  ): Record<Team, Array<{
    nonFloatingPCAId: string
    nonFloatingPCAName: string
    fte: number
    missingSlots: number[]
    currentSubstitute?: { pcaId: string; pcaName: string; slots: number[] }
  }>> => {
    const substitutionsNeeded = createEmptyTeamRecord<Array<{
      nonFloatingPCAId: string
      nonFloatingPCAName: string
      fte: number
      missingSlots: number[]
      currentSubstitute?: { pcaId: string; pcaName: string; slots: number[] }
    }>>([])

    // Iterate through all PCA allocations to find non-floating PCAs with FTE ≠ 1.0
    Object.entries(allocationsByTeam).forEach(([team, allocations]) => {
      const teamTyped = team as Team
      allocations.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (!staffMember || staffMember.floating) return // Only non-floating PCAs

        // Get actual FTE from staffOverrides or allocation
        const override = staffOverrides[alloc.staff_id]
        const actualFTE = override?.fteRemaining !== undefined 
          ? override.fteRemaining 
          : (alloc.fte_pca || 0)

        // Check if FTE ≠ 1.0 (needs substitution)
        if (Math.abs(actualFTE - 1.0) > 0.001) {
          // Identify missing slots (slots not in availableSlots)
          const allSlots = [1, 2, 3, 4]
          const availableSlots = override?.availableSlots && override.availableSlots.length > 0
            ? override.availableSlots
            : (actualFTE === 0 ? [] : [1, 2, 3, 4]) // If FTE = 0, no slots available
          const missingSlots = allSlots.filter(slot => !availableSlots.includes(slot))

          if (missingSlots.length > 0) {
            // Check if algorithm already assigned a floating PCA substitution
            // Look for floating PCAs with slots assigned to this team that match missing slots
            let currentSubstitute: { pcaId: string; pcaName: string; slots: number[] } | undefined
            Object.values(allocationsByTeam).flat().forEach(floatingAlloc => {
              const floatingStaff = staff.find(s => s.id === floatingAlloc.staff_id)
              if (!floatingStaff || !floatingStaff.floating) return

              // Check if this floating PCA has slots assigned to the non-floating PCA's team
              const assignedSlots: number[] = []
              if (floatingAlloc.slot1 === teamTyped) assignedSlots.push(1)
              if (floatingAlloc.slot2 === teamTyped) assignedSlots.push(2)
              if (floatingAlloc.slot3 === teamTyped) assignedSlots.push(3)
              if (floatingAlloc.slot4 === teamTyped) assignedSlots.push(4)

              // Check if assigned slots match missing slots (or are a subset)
              const matchingSlots = assignedSlots.filter(slot => missingSlots.includes(slot))
              if (matchingSlots.length > 0 && !currentSubstitute) {
                currentSubstitute = {
                  pcaId: floatingAlloc.staff_id,
                  pcaName: floatingStaff.name,
                  slots: matchingSlots
                }
              }
            })

            substitutionsNeeded[teamTyped].push({
              nonFloatingPCAId: alloc.staff_id,
              nonFloatingPCAName: staffMember.name,
              fte: actualFTE,
              missingSlots,
              currentSubstitute
            })
          }
        }
      })
    })

    return substitutionsNeeded
  }, [staff, staffOverrides])

  /**
   * Step 2: Generate Therapist allocations + Non-floating PCA allocations + Special Program PCA
   * This step does NOT trigger tie-breakers (floating PCA handled in Step 3)
   * Returns the PCA allocations by team for use in substitution detection
   * @param cleanedOverrides Optional cleaned overrides (with availableSlots cleared for floating PCAs)
   */
  /**
   * Step 2: Generate Therapist allocations + Non-floating PCA allocations + Special Program PCA
   * (implementation moved into useScheduleController: scheduleActions.runStep2TherapistAndNonFloatingPCA)
   */
  const generateStep2_TherapistAndNonFloatingPCA = async (
    cleanedOverrides?: typeof staffOverrides
  ): Promise<Record<Team, (PCAAllocation & { staff: Staff })[]>> => {
    return await scheduleActions.runStep2TherapistAndNonFloatingPCA({
      cleanedOverrides: cleanedOverrides as any,
      toast: showActionToast,
      onNonFloatingSubstitutionWizard: async ({
        teams,
        substitutionsByTeam,
        isWizardMode,
        initialSelections,
      }) => {
        if (teams.length === 0) return {}

        return await new Promise((resolve, reject) => {
          setSubstitutionWizardData({
            teams,
            substitutionsByTeam: substitutionsByTeam as any,
            isWizardMode,
            initialSelections,
          })
          setSubstitutionWizardOpen(true)

          const resolver = (
            selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>,
            opts?: { cancelled?: boolean }
          ) => {
            setSubstitutionWizardOpen(false)
            setSubstitutionWizardData(null)
            if (opts?.cancelled) {
              const err: any = new Error('user_cancelled')
              err.code = 'user_cancelled'
              reject(err)
              return
            }
            resolve(selections)
          }

          substitutionWizardResolverRef.current = resolver as any
        })
      },
    })
  }

  /**
   * Step 3: Generate Floating PCA allocations
   * This is where tie-breakers happen.
   * Uses recalculated data from current state to respect any user edits made after Step 2.
   * 
   * @param userAdjustedPendingFTE - Optional: user-adjusted pending FTE values from Step 3.1 dialog
   * @param userTeamOrder - Optional: user-specified team allocation order from Step 3.1 dialog
   */
  /**
   * Step 3: Generate Floating PCA allocations
   * (implementation moved into useScheduleController: scheduleActions.runStep3FloatingPCA)
   */
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
          setTieBreakResolver(() => resolver)
          tieBreakResolverRef.current = resolver
          setTieBreakDialogOpen(true)
        })
      },
    })
  }

  /**
   * Step 4: Calculate Bed Relieving
   * This is a derived calculation based on therapist allocations
   */
  const calculateStep4_BedRelieving = () => {
    runStep4BedRelieving({ toast: showActionToast })
  }

  /**
   * Handle advancing to the next step (navigation only, no algorithm)
   */
  const handleNextStep = async () => {
    // Only navigate, don't run algorithms
    goToNextStep()
  }

  /**
   * Handle initializing algorithm for current step
   */
  const handleInitializeAlgorithm = async () => {
    switch (currentStep) {
      case 'therapist-pca':
        // Only validate non-floating buffer PCA before Step 2 algo
        // Floating PCA buffer can be assigned in Step 3
        const bufferPCAs = bufferStaff.filter(s => s.rank === 'PCA' && s.status === 'buffer' && !s.floating)
        const unassignedBufferPCAs = bufferPCAs.filter(s => !s.team)
        
        if (unassignedBufferPCAs.length > 0) {
          const names = unassignedBufferPCAs.map(s => s.name).join(', ')
          showActionToast(
            'Non-floating buffer PCA must be assigned to a team before proceeding.',
            'warning',
            `Unassigned: ${names}`
          )
          return
        }
        
        // Check for active special programs - show override dialog if any exist
        const weekday = getWeekday(selectedDate)
        const activeSpecialPrograms = specialPrograms.filter(p => p.weekdays.includes(weekday))

        
        
        if (activeSpecialPrograms.length > 0) {
          // Show special program override dialog and wait for user confirmation
          return new Promise<void>((resolve) => {
            const resolver = (overrides: Record<string, {
              fteRemaining?: number
              availableSlots?: number[]
              specialProgramOverrides?: Array<{
                programId: string
                therapistId?: string
                pcaId?: string
                slots?: number[]
                therapistFTESubtraction?: number
                pcaFTESubtraction?: number
                drmAddOn?: number
              }>
            }> | null) => {
              // Cancel: abort Step 2 initialization (do not run algorithm, no success toast).
              if (overrides === null) {
                setShowSpecialProgramOverrideDialog(false)
                setSpecialProgramOverrideResolver(null)
                specialProgramOverrideResolverRef.current = null
                resolve()
                return
              }

              // Snapshot current Step 2-related state so we can restore if Step 2.1 is cancelled.
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
              // If any selected substitute staff is currently in the inactive pool, promote them to 'buffer'
              // so they are included in the schedule page (active/buffer staff pool) and algorithms.
              const inactiveSelectedIds = Object.keys(overrides).filter((id) =>
                inactiveStaff.some(s => s.id === id)
              )
              if (inactiveSelectedIds.length > 0) {
                pendingStep2OverridesFromDialogRef.current = overrides as any
                pendingStep2ResolveAfterPromotionRef.current = resolve
                pendingPromotedInactiveStaffIdsRef.current = inactiveSelectedIds

                ;(async () => {
                  try {
                    const { error } = await supabase
                      .from('staff')
                      .update({ status: 'buffer' })
                      .in('id', inactiveSelectedIds)

                    if (error) {
                      // Fallback for legacy schema without 'status' column
                      if (error.message?.includes('column') || (error as any).code === 'PGRST116') {
                        await supabase.from('staff').update({ active: true }).in('id', inactiveSelectedIds)
                      }
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

              // Merge special program overrides into staffOverrides
              const mergedOverrides = { ...staffOverrides }
              Object.entries(overrides).forEach(([staffId, override]) => {
                if (mergedOverrides[staffId]) {
                  mergedOverrides[staffId] = {
                    ...mergedOverrides[staffId],
                    ...override,
                    specialProgramOverrides: override.specialProgramOverrides,
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
                    fteRemaining: override.fteRemaining ?? baseFTE,
                    ...override,
                  }
                }
              })

              
              
              // Continue with Step 2 algorithm
              setStaffOverrides(mergedOverrides)
              
              // RESET Step 2-related data when initializing the algorithm (shared helper)
              const cleanedOverrides = resetStep2OverridesForAlgoEntry({
                staffOverrides: mergedOverrides,
                allStaff: [...staff, ...bufferStaff],
              })
              setStaffOverrides(cleanedOverrides)
              
              
              // Run Step 2 algorithm with cleaned overrides - it will pause for substitution dialog if needed
              ;(async () => {
                try {
                  await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)
                } catch (e: any) {
                  // User cancelled Step 2.1 substitution wizard → restore and abort without toast.
                  if (e?.code === 'user_cancelled' || String(e?.message ?? '').includes('user_cancelled')) {
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
                  // Other errors: keep existing behavior (log + proceed).
                  console.error('Error running Step 2:', e)
                }
                resolve()
              })()
            }
            
            setSpecialProgramOverrideResolver(() => resolver)
            specialProgramOverrideResolverRef.current = resolver
            prefetchSpecialProgramOverrideDialog().catch(() => {})
            // Step 2 can also pause into substitution flow; warm it up too.
            prefetchNonFloatingSubstitutionDialog().catch(() => {})
            setShowSpecialProgramOverrideDialog(true)
          })
        }
        
        // No active special programs - proceed directly to Step 2 algorithm
        // RESET Step 2-related data when initializing the algorithm (shared helper)
        const cleanedOverrides = resetStep2OverridesForAlgoEntry({
          staffOverrides,
          allStaff: [...staff, ...bufferStaff],
        })
        setStaffOverrides(cleanedOverrides)
        
        // Run Step 2 algorithm with cleaned overrides - it will pause for substitution dialog if needed
        await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)
        break
      case 'floating-pca':
        // Step 3.1: Recalculate pending FTE with proper rounding timing
        // For teams with buffer floating PCA: round avg FIRST, then subtract assignments
        // For teams without buffer floating PCA: round avg, then subtract non-floating only
        if (!step2Result) {
          showActionToast('Step 2 must be completed before Step 3.', 'warning')
          return
        }

        
        
        // RESET Step 3-related data when re-running the algorithm (shared helper)
        clearStep3StateOnly()
        clearStep3AllocationsPreserveStep2()

        // Step 3.1: Open the configuration dialog instead of running algo directly
        prefetchFloatingPCAConfigDialog().catch(() => {})
        setFloatingPCAConfigOpen(true)
        break
      case 'bed-relieving':
        calculateStep4_BedRelieving()
        break
      default:
        break
    }
  }

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

  const STEP_ORDER: ScheduleStepId[] = ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving', 'review']
  const hasLaterStepData = (target: ScheduleStepId) => {
    const idx = STEP_ORDER.indexOf(target)
    if (idx < 0) return false
    const later = STEP_ORDER.slice(idx + 1, STEP_ORDER.indexOf('review'))
    return later.some(stepId => stepStatus[stepId] !== 'pending')
  }

  const showClearForCurrentStep = useMemo(() => {
    const hasStep1Overrides = Object.keys(staffOverrides ?? {}).length > 0

    const hasNonBaselineTherapistAllocs = TEAMS.some(team =>
      (therapistAllocations[team] || []).some(a => typeof a.id === 'string' && !a.id.startsWith('baseline-therapist:'))
    )
    const hasNonBaselinePcaAllocs = TEAMS.some(team =>
      (pcaAllocations[team] || []).some(a => typeof a.id === 'string' && !a.id.startsWith('baseline-pca:'))
    )

    // Step 2 is considered to have data if algorithm allocations exist or step-specific override keys exist.
    const hasStep2OverrideKeys = Object.values(staffOverrides ?? {}).some((o: any) => {
      if (!o || typeof o !== 'object') return false
      if (Array.isArray(o.specialProgramOverrides) && o.specialProgramOverrides.length > 0) return true
      if (o.substitutionFor) return true
      // Team transfer overrides (fixed-team therapist emergency move)
      if (o.team != null) return true
      return false
    })
    const hasStep2Data =
      step2Result != null ||
      initializedSteps.has('therapist-pca') ||
      stepStatus['therapist-pca'] !== 'pending' ||
      hasNonBaselineTherapistAllocs ||
      hasNonBaselinePcaAllocs ||
      hasStep2OverrideKeys

    // Step 3 has data if floating allocations exist, or slotOverrides exist, or tracking state exists.
    const hasStep3SlotOverrides = Object.values(staffOverrides ?? {}).some((o: any) => !!o?.slotOverrides)
    const hasFloatingAllocations = TEAMS.some(team =>
      (pcaAllocations[team] || []).some(a => {
        const staffMember = staff.find(s => s.id === a.staff_id)
        return !!staffMember?.floating
      })
    )
    const hasStep3Data =
      initializedSteps.has('floating-pca') ||
      stepStatus['floating-pca'] !== 'pending' ||
      adjustedPendingFTE != null ||
      teamAllocationOrder != null ||
      allocationTracker != null ||
      hasStep3SlotOverrides ||
      hasFloatingAllocations

    const hasStep4Notes = Object.keys(bedRelievingNotesByToTeam ?? {}).length > 0
    const hasStep4Data =
      initializedSteps.has('bed-relieving') ||
      stepStatus['bed-relieving'] !== 'pending' ||
      (bedAllocations?.length ?? 0) > 0 ||
      hasStep4Notes

    const step = currentStep as ScheduleStepId
    if (step === 'leave-fte') return hasStep1Overrides || hasStep2Data || hasStep3Data || hasStep4Data
    if (step === 'therapist-pca') return hasStep2Data || hasStep3Data || hasStep4Data
    if (step === 'floating-pca') return hasStep3Data || hasStep4Data
    if (step === 'bed-relieving') return hasStep4Data
    return false
  }, [
    currentStep,
    staffOverrides,
    staff,
    therapistAllocations,
    pcaAllocations,
    bedAllocations,
    bedRelievingNotesByToTeam,
    step2Result,
    initializedSteps,
    stepStatus,
    adjustedPendingFTE,
    teamAllocationOrder,
    allocationTracker,
  ])

  const removeStep2KeysFromOverrides = (overrides: Record<string, any>) => {
    return scheduleActions.removeStep2KeysFromOverrides(overrides as any) as any
  }

  const clearStep3StateOnly = () => {
    // Step 3 wizard state + tracking
    setFloatingPCAConfigOpen(false)
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

  const clearStepOnly = async (stepId: ScheduleStepId) => {
    // UI-only: close any step dialogs to avoid dangling resolvers.
    setShowSpecialProgramOverrideDialog(false)
    setSpecialProgramOverrideResolver(null)
    specialProgramOverrideResolverRef.current = null
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
    substitutionWizardResolverRef.current = null
    setFloatingPCAConfigOpen(false)

    // Clear page-local Step 3 UI state
    setAdjustedPendingFTE(null)
    setTeamAllocationOrder(null)
    setAllocationTracker(null)

    scheduleActions.clearDomainFromStep(stepId)
  }

  const clearFromStep = async (stepId: ScheduleStepId) => {
    // Close any step dialogs to avoid dangling resolvers.
    setShowSpecialProgramOverrideDialog(false)
    setSpecialProgramOverrideResolver(null)
    specialProgramOverrideResolverRef.current = null
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
    substitutionWizardResolverRef.current = null
    setFloatingPCAConfigOpen(false)

    // Clear page-local Step 3 UI state
    setAdjustedPendingFTE(null)
    setTeamAllocationOrder(null)
    setAllocationTracker(null)

    scheduleActions.clearDomainFromStep(stepId)
  }

  const handleClearStep = (stepIdRaw: string) => {
    const stepId = stepIdRaw as ScheduleStepId
    if (!['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving'].includes(stepId)) return

    if (hasLaterStepData(stepId)) {
      const clearedLabel =
        stepId === 'leave-fte'
          ? 'Steps 1–4'
          : stepId === 'therapist-pca'
            ? 'Steps 2–4'
            : stepId === 'floating-pca'
              ? 'Steps 3–4'
              : 'Step 4'

      showActionToast(
        'This will clear later steps too',
        'warning',
        `Later-step data exists. Confirm to clear ${clearedLabel}.`,
        {
          persistUntilDismissed: true,
          dismissOnOutsideClick: true,
          actions: (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  dismissActionToast()
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={async (e) => {
                  e.stopPropagation()
                  dismissActionToast()
                  await clearFromStep(stepId)
                  showActionToast('Cleared', 'success', `Cleared ${clearedLabel}.`)
                }}
              >
                Confirm
              </Button>
            </div>
          ),
        }
      )
      return
    }

    ;(async () => {
      await clearStepOnly(stepId)
      const label =
        stepId === 'leave-fte'
          ? 'Step 1 (Leave & FTE)'
          : stepId === 'therapist-pca'
            ? 'Step 2 (Therapist & PCA)'
            : stepId === 'floating-pca'
              ? 'Step 3 (Floating PCA)'
              : 'Step 4 (Bed Relieving)'
      showActionToast('Cleared', 'success', `Cleared ${label}.`)
    })().catch((e) => {
      console.error('Clear step failed:', e)
      showActionToast('Clear failed', 'error', (e as any)?.message || 'Please try again.')
    })
  }
  
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
    // Store the team order for reference
    setTeamAllocationOrder(teamOrder)
    
    // Close the dialog
    setFloatingPCAConfigOpen(false)
    
    // Store the allocation tracker
    setAllocationTracker(result.tracker)
    
    // Update pending FTE state with final values from algorithm
    setPendingPCAFTEPerTeam(result.pendingPCAFTEPerTeam)
    setAdjustedPendingFTE(result.pendingPCAFTEPerTeam)
    
    // Update staffOverrides for all assigned PCAs (from 3.2, 3.3, and 3.4)
    const floatingPCAs = buildPCADataFromCurrentState().filter(p => p.floating)
    const allAssignments = [...step32Assignments, ...step33Assignments]
    
    const newOverrides = { ...staffOverrides }
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
    const updatedPcaAllocations = { ...pcaAllocations }
    for (const alloc of result.allocations) {
      // Find the staff member for this allocation
      const staffMember = staff.find(s => s.id === alloc.staff_id)
      if (!staffMember) continue
      
      // Create allocation with staff property
      const allocWithStaff = { ...alloc, staff: staffMember }
      
      // Find which team(s) this PCA is now assigned to
      const teamsWithSlots: Team[] = []
      if (alloc.slot1) teamsWithSlots.push(alloc.slot1)
      if (alloc.slot2) teamsWithSlots.push(alloc.slot2)
      if (alloc.slot3) teamsWithSlots.push(alloc.slot3)
      if (alloc.slot4) teamsWithSlots.push(alloc.slot4)
      
      // Add allocation to each team that has a slot
      for (const team of new Set(teamsWithSlots)) {
        const teamAllocs = updatedPcaAllocations[team] || []
        // Check if already exists
        const existingIdx = teamAllocs.findIndex(a => a.staff_id === alloc.staff_id)
        if (existingIdx >= 0) {
          teamAllocs[existingIdx] = allocWithStaff
        } else {
          teamAllocs.push(allocWithStaff)
        }
        updatedPcaAllocations[team] = teamAllocs
      }
    }

    setPcaAllocations(updatedPcaAllocations)
    
    // Handle any errors from the algorithm
    if (result.errors?.preferredSlotUnassigned && result.errors.preferredSlotUnassigned.length > 0) {
      setPcaAllocationErrors((prev: PCAAllocationErrors) => ({
        ...prev,
        preferredSlotUnassigned: result.errors!.preferredSlotUnassigned!.join('; ')
      }))
    }
    
    // Mark Step 3 as initialized and completed (domain-owned)
    scheduleActions.markStepCompleted('floating-pca')
    showActionToast('Step 3 allocation completed.', 'success', 'Floating PCA assignments updated.')
  }
  
  /**
   * Handle cancel from FloatingPCAConfigDialog
   */
  const handleFloatingPCAConfigCancel = () => {
    setFloatingPCAConfigOpen(false)
  }

  /**
   * Handle confirmation from NonFloatingSubstitutionDialog
   * Resolves the promise in the algorithm callback with user's selections
   */
  const handleSubstitutionWizardConfirm = (
    selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  ) => {
    // Resolve the promise in the algorithm callback
    if (substitutionWizardResolverRef.current) {
      substitutionWizardResolverRef.current(selections)
      substitutionWizardResolverRef.current = null
    }
    
    // Also update staffOverrides for persistence
    const newOverrides = { ...staffOverrides }

    // Clear any existing substitutionFor that targets any of the keys in this submission
    // so stale substitute mappings don't linger after edits.
    const targets = new Set(
      Object.keys(selections || {}).map((key) => {
        const dashIdx = key.indexOf('-')
        const team = (dashIdx >= 0 ? key.slice(0, dashIdx) : key) as Team
        const nonFloatingPCAId = dashIdx >= 0 ? key.slice(dashIdx + 1) : ''
        return `${team}::${nonFloatingPCAId}`
      })
    )
    Object.entries(newOverrides).forEach(([staffId, o]) => {
      const sf = (o as any)?.substitutionFor
      if (!sf) return
      const tag = `${sf.team}::${sf.nonFloatingPCAId}`
      if (targets.has(tag)) {
        const { substitutionFor, ...rest } = o as any
        newOverrides[staffId] = rest
      }
    })

    // Apply all selections to staffOverrides
    Object.entries(selections).forEach(([key, selectionArr]) => {
      // Key format is `${team}-${nonFloatingPCAId}` but nonFloatingPCAId is a UUID containing '-'.
      // So we must split ONLY on the first '-' to avoid truncating the UUID.
      const dashIdx = key.indexOf('-')
      const team = (dashIdx >= 0 ? key.slice(0, dashIdx) : key) as Team
      const nonFloatingPCAId = dashIdx >= 0 ? key.slice(dashIdx + 1) : ''

      const nonFloatingPCA = staff.find(s => s.id === nonFloatingPCAId)
      if (!nonFloatingPCA) return

      ;(selectionArr || []).forEach((selection) => {
        // Update floating PCA's staffOverrides with substitutionFor
        const floatingPCA = staff.find(s => s.id === selection.floatingPCAId)
        if (floatingPCA) {
          const existingOverride = newOverrides[selection.floatingPCAId] || {
            leaveType: null,
            fteRemaining: 1.0,
          }
          newOverrides[selection.floatingPCAId] = {
            ...existingOverride,
            substitutionFor: {
              nonFloatingPCAId,
              nonFloatingPCAName: nonFloatingPCA.name,
              team,
              slots: selection.slots
            }
          }
        }
      })

    })

    setStaffOverrides(newOverrides)

    

    // Note: pcaAllocations will be updated by the algorithm after it receives the selections
  }

  /**
   * Handle cancel from NonFloatingSubstitutionDialog
   * Resolves with empty selections (algorithm will use automatic fallback)
   */
  const handleSubstitutionWizardCancel = () => {
    if (substitutionWizardResolverRef.current) {
      ;(substitutionWizardResolverRef.current as any)({}, { cancelled: true })
      substitutionWizardResolverRef.current = null
    }
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
  }

  /**
   * Handle skip from NonFloatingSubstitutionDialog
   * Resolves with empty selections (algorithm will use automatic fallback)
   */
  const handleSubstitutionWizardSkip = () => {
    if (substitutionWizardResolverRef.current) {
      substitutionWizardResolverRef.current({})
      substitutionWizardResolverRef.current = null
    }
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
  }

  /**
   * Handle going to the previous step
   */
  const handlePreviousStep = () => {
    goToPreviousStep()
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

  // Handle confirmed copy from ScheduleCopyWizard by calling the copy API
  const handleConfirmCopy = async ({
    fromDate,
    toDate,
    mode,
    includeBufferStaff,
  }: {
    fromDate: Date
    toDate: Date
    mode: 'full' | 'hybrid'
    includeBufferStaff: boolean
  }): Promise<{ copiedUpToStep?: string }> => {
    let timing: any = null
    let serverTiming: any = null
    let copyError: unknown = null

    setCopying(true)
    startTopLoading(0.06)
    bumpTopLoadingTo(0.18)
    startSoftAdvance(0.72)

    try {
      const result = await scheduleActions.copySchedule({
        fromDate,
        toDate,
        mode,
        includeBufferStaff,
        onProgress: bumpTopLoadingTo,
        startSoftAdvance,
        stopSoftAdvance,
      })

      timing = result.timing
      serverTiming = (result.timing as any)?.meta?.server ?? null

      // Close wizard after success (non-modal feedback will be shown via toast).
      setCopyWizardOpen(false)
      setCopyWizardConfig(null)
      setCopyMenuOpen(false)
      bumpTopLoadingTo(0.86)

      // Highlight the newly-loaded date label briefly.
      setHighlightDateKey(formatDateForInput(toDate))

      // Navigate to copied schedule date and reload schedule metadata
      beginDateTransition(toDate, { resetLoadedForDate: true, useLocalTopBar: false })
      bumpTopLoadingTo(0.92)

      // Non-blocking refresh: optimistically mark the target date as having data,
      // then refresh the full set in the background (no await).
      setDatesWithData(prev => {
        const next = new Set(prev)
        next.add(formatDateForInput(toDate))
        return next
      })
      loadDatesWithData({ force: true })
      bumpTopLoadingTo(0.98)

      showActionToast('Copied schedule to ' + formatDateDDMMYYYY(toDate) + '.', 'success')

      return {
        copiedUpToStep: result.copiedUpToStep,
      }
    } catch (e: any) {
      copyError = e
      timing = e?.timing ?? timing
      serverTiming = e?.serverTiming ?? serverTiming
      throw e
    } finally {
      setCopying(false)
      setLastCopyTiming(
        (timing as any) ||
          createTimingCollector().finalize({
            ok: !copyError,
            server: serverTiming,
          })
      )
      finishTopLoading()
    }
  }


  // Check if there are unsaved changes (staff overrides or bed edits)
  const hasUnsavedChanges =
    JSON.stringify(staffOverrides) !== JSON.stringify(savedOverrides) ||
    JSON.stringify(bedCountsOverridesByTeam) !== JSON.stringify(savedBedCountsOverridesByTeam) ||
    JSON.stringify(bedRelievingNotesByToTeam) !== JSON.stringify(savedBedRelievingNotesByToTeam)

  const beginDateTransition = (nextDate: Date, options?: { resetLoadedForDate?: boolean; useLocalTopBar?: boolean }) => {
    const useLocalTopBar = options?.useLocalTopBar ?? true
    gridLoadingUsesLocalBarRef.current = useLocalTopBar
    if (useLocalTopBar) {
      startTopLoading(0.08)
      startSoftAdvance(0.75)
    }
    controllerBeginDateTransition(nextDate, { resetLoadedForDate: options?.resetLoadedForDate })
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = parseDateFromInput(e.target.value)
    if (!isNaN(newDate.getTime())) {
      beginDateTransition(newDate)
      setCalendarOpen(false) // Close calendar dialog when date is selected
    }
  }

  const currentWeekday = getWeekday(selectedDate)
  const weekdayName = WEEKDAY_NAMES[WEEKDAYS.indexOf(currentWeekday)]

  const allPCAAllocationsFlat = useMemo(() => Object.values(pcaAllocations).flat(), [pcaAllocations])

  // Step 3.1 "final" order (after user adjustments) for tooltip/display.
  const step3OrderPositionByTeam = useMemo(() => {
    const map: Record<Team, number | undefined> = { FO: undefined, SMM: undefined, SFM: undefined, CPPC: undefined, MC: undefined, GMC: undefined, NSM: undefined, DRO: undefined }
    if (!teamAllocationOrder || teamAllocationOrder.length === 0) return map
    teamAllocationOrder.forEach((t, idx) => {
      map[t] = idx + 1
    })
    return map
  }, [teamAllocationOrder])

  // Remaining floating PCA slot capacity (FTE) after current allocations (for diagnostics/tooltips).
  const floatingPoolRemainingFte = useMemo(() => {
    const byId = new Map<string, number>()
    for (const alloc of allPCAAllocationsFlat as any[]) {
      const staffRow = (alloc as any)?.staff
      if (!staffRow?.floating) continue
      const id = String((alloc as any)?.staff_id ?? '')
      if (!id) continue
      const rem = typeof (alloc as any)?.fte_remaining === 'number' ? (alloc as any).fte_remaining : 0
      byId.set(id, Math.max(byId.get(id) ?? 0, rem))
    }
    let sum = 0
    byId.forEach((v) => {
      sum += Math.max(0, v)
    })
    return sum
  }, [allPCAAllocationsFlat])

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

  // Per-team override slices with caching: preserve object identity when unrelated staffOverrides entries change.
  const overridesSliceCacheRef = useRef<{
    therapist: Partial<Record<Team, { idsKey: string; slice: Record<string, any> }>>
    pca: Partial<Record<Team, { idsKey: string; slice: Record<string, any> }>>
  }>({ therapist: {}, pca: {} })

  const therapistOverridesByTeam = useMemo(() => {
    const prev = overridesSliceCacheRef.current.therapist
    const next: Record<Team, Record<string, any>> = createEmptyTeamRecord<Record<string, any>>({})

    for (const team of TEAMS) {
      const ids = Array.from(
        new Set((therapistAllocations[team] || []).map((a: any) => a.staff_id).filter(Boolean))
      ).sort()
      const idsKey = ids.join('|')

      const cached = prev[team]
      let canReuse = !!cached && cached.idsKey === idsKey
      if (canReuse && cached) {
        for (const id of ids) {
          if (cached.slice[id] !== staffOverrides[id]) {
            canReuse = false
            break
          }
        }
      }

      if (canReuse && cached) {
        next[team] = cached.slice
      } else {
        const slice: Record<string, any> = {}
        for (const id of ids) {
          if (staffOverrides[id] !== undefined) slice[id] = staffOverrides[id]
        }
        prev[team] = { idsKey, slice }
        next[team] = slice
      }
    }

    overridesSliceCacheRef.current.therapist = prev
    return next
  }, [therapistAllocations, staffOverrides])

  const pcaOverridesByTeam = useMemo(() => {
    const prev = overridesSliceCacheRef.current.pca
    const next: Record<Team, Record<string, any>> = createEmptyTeamRecord<Record<string, any>>({})

    for (const team of TEAMS) {
      const ids = Array.from(new Set((pcaAllocations[team] || []).map((a: any) => a.staff_id).filter(Boolean))).sort()
      const idsKey = ids.join('|')

      const cached = prev[team]
      let canReuse = !!cached && cached.idsKey === idsKey
      if (canReuse && cached) {
        for (const id of ids) {
          if (cached.slice[id] !== staffOverrides[id]) {
            canReuse = false
            break
          }
        }
      }

      if (canReuse && cached) {
        next[team] = cached.slice
      } else {
        const slice: Record<string, any> = {}
        for (const id of ids) {
          if (staffOverrides[id] !== undefined) slice[id] = staffOverrides[id]
        }
        prev[team] = { idsKey, slice }
        next[team] = slice
      }
    }

    overridesSliceCacheRef.current.pca = prev
    return next
  }, [pcaAllocations, staffOverrides])

  // ---------------------------------------------------------------------------
  // Copy button helpers (dynamic labels and source/target resolution)
  // ---------------------------------------------------------------------------
  const selectedDateStr = formatDateForInput(selectedDate)
  const currentHasData = datesWithData.has(selectedDateStr)
  const isToday = selectedDateStr === formatDateForInput(new Date())

  // Snapshot vs Global head metadata (cheap drift gate for UI reminders).
  const [snapshotHeadAtCreation, setSnapshotHeadAtCreation] = useState<GlobalHeadAtCreation | null>(null)
  const [globalConfigHead, setGlobalConfigHead] = useState<GlobalHeadAtCreation | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await supabase.rpc('get_config_global_head_v1')
      if (cancelled) return
      if (!res.error && res.data) setGlobalConfigHead(res.data as any)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    if (!currentScheduleId) {
      setSnapshotHeadAtCreation(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('daily_schedules')
        .select('baseline_snapshot')
        .eq('id', currentScheduleId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setSnapshotHeadAtCreation(null)
        return
      }
      const stored = (data as any)?.baseline_snapshot as BaselineSnapshotStored | null | undefined
      const { envelope } = unwrapBaselineSnapshotStored(stored as any)
      const head = (envelope as any)?.globalHeadAtCreation ?? null
      setSnapshotHeadAtCreation(head)
    })().catch(() => {
      if (cancelled) return
      setSnapshotHeadAtCreation(null)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, currentScheduleId])

  const snapshotDiffersFromGlobalHead = useMemo(() => {
    // If there is no baseline snapshot, there is no "saved setup" reminder.
    if (!baselineSnapshot) return false
    // If either side is missing metadata (legacy snapshots / transient load), be conservative and show the reminder.
    if (!snapshotHeadAtCreation || !globalConfigHead) return true

    if (Number(snapshotHeadAtCreation.global_version) !== Number(globalConfigHead.global_version)) return true

    const a = (snapshotHeadAtCreation.category_versions || {}) as Record<string, number>
    const b = (globalConfigHead.category_versions || {}) as Record<string, number>
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      if (Number(a[k] ?? -1) !== Number(b[k] ?? -1)) return true
    }
    return false
  }, [baselineSnapshot, snapshotHeadAtCreation, globalConfigHead])

  // Header reminder icon should only show when snapshot settings differ from Global.
  const showSnapshotUiReminder = !!baselineSnapshot && snapshotDiffersFromGlobalHead

  // Drift notification (post-load; admin/developer only)
  const lastDriftToastKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (userRole !== 'developer' && userRole !== 'admin') return
    if (!currentScheduleId) return
    if (!baselineSnapshot) return
    if (loading || gridLoading) return

    const toastKey = `${selectedDateStr}|${currentScheduleId}`
    if (lastDriftToastKeyRef.current === toastKey) return

    const showDriftNotice = () => {
      lastDriftToastKeyRef.current = toastKey
      showActionToast(
        'Published setup has changed',
        'warning',
        'This schedule is using the saved setup from that day. You can review what changed in “Show differences” or manage it in Dashboard → Sync / Publish.',
        {
          persistUntilDismissed: true,
          dismissOnOutsideClick: true,
          actions: (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSnapshotDiffOpen(true)}
              >
                Show differences
              </Button>
            </div>
          ),
        }
      )
    }

    let cancelled = false
    // Don’t block initial paint.
    window.setTimeout(() => {
      if (cancelled) return
      ;(async () => {
        const headRes = await supabase.rpc('get_config_global_head_v1')
        if (cancelled) return
        if (headRes.error || !headRes.data) return
        const head = headRes.data as any

        const rawThreshold = head?.drift_notification_threshold
        const unit =
          rawThreshold?.unit === 'weeks' || rawThreshold?.unit === 'months' ? rawThreshold.unit : 'days'
        const rawValue =
          typeof rawThreshold?.value === 'number' ? rawThreshold.value : Number(rawThreshold?.value ?? 30)
        const value = Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : 30

        // Treat very large thresholds as “off”.
        if (unit === 'days' && value >= 3650) return

        const days =
          unit === 'weeks' ? value * 7 : unit === 'months' ? value * 30 : value
        const thresholdMs = Math.max(0, days) * 24 * 60 * 60 * 1000

        const { data: schedRow, error: schedErr } = await supabase
          .from('daily_schedules')
          .select('baseline_snapshot')
          .eq('id', currentScheduleId)
          .maybeSingle()
        if (cancelled) return
        if (schedErr) return

        const stored = (schedRow as any)?.baseline_snapshot
        const { envelope } = unwrapBaselineSnapshotStored(stored as any)

        const createdAtMs = Date.parse(String((envelope as any)?.createdAt ?? ''))
        const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : 0
        if (thresholdMs > 0 && ageMs < thresholdMs) return

        // "Always" mode (threshold=0): use a real diff against current published configuration.
        // Version metadata may remain unchanged (e.g., during testing or when global_version hasn't bumped),
        // but users still expect to be warned when the saved snapshot differs from today's Global config.
        if (thresholdMs === 0) {
          const [staffRes, teamSettingsRes, wardsRes, prefsRes, programsRes, sptRes] = await Promise.all([
            supabase
              .from('staff')
              .select('id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program'),
            supabase.from('team_settings').select('team,display_name'),
            supabase.from('wards').select('id,name,total_beds,team_assignments,team_assignment_portions'),
            supabase.from('pca_preferences').select('*'),
            supabase.from('special_programs').select('*'),
            supabase.from('spt_allocations').select('*'),
          ])
          if (cancelled) return

          // Back-compat: some DBs do not have wards.team_assignment_portions
          let effectiveWardsRes: typeof wardsRes = wardsRes
          if ((wardsRes as any)?.error?.message?.includes('team_assignment_portions')) {
            effectiveWardsRes = await supabase.from('wards').select('id,name,total_beds,team_assignments')
            if (cancelled) return
          }

          const firstError =
            (staffRes as any).error ||
            (teamSettingsRes as any).error ||
            (effectiveWardsRes as any).error ||
            (prefsRes as any).error ||
            (programsRes as any).error ||
            (sptRes as any).error
          if (firstError) return

          const { diffBaselineSnapshot } = await import('@/lib/features/schedule/snapshotDiff')
          const diff = diffBaselineSnapshot({
            snapshot: baselineSnapshot as any,
            live: {
              staff: (staffRes as any).data || [],
              teamSettings: (teamSettingsRes as any).data || [],
              wards: (effectiveWardsRes as any).data || [],
              pcaPreferences: (prefsRes as any).data || [],
              specialPrograms: (programsRes as any).data || [],
              sptAllocations: (sptRes as any).data || [],
            },
          })

          const hasAnyDrift =
            (diff.staff.added.length ?? 0) > 0 ||
            (diff.staff.removed.length ?? 0) > 0 ||
            (diff.staff.changed.length ?? 0) > 0 ||
            (diff.teamSettings.changed.length ?? 0) > 0 ||
            (diff.wards.added.length ?? 0) > 0 ||
            (diff.wards.removed.length ?? 0) > 0 ||
            (diff.wards.changed.length ?? 0) > 0 ||
            (diff.pcaPreferences.changed.length ?? 0) > 0 ||
            (diff.specialPrograms.added.length ?? 0) > 0 ||
            (diff.specialPrograms.removed.length ?? 0) > 0 ||
            (diff.specialPrograms.changed.length ?? 0) > 0 ||
            (diff.sptAllocations.added.length ?? 0) > 0 ||
            (diff.sptAllocations.removed.length ?? 0) > 0 ||
            (diff.sptAllocations.changed.length ?? 0) > 0

          if (!hasAnyDrift) return

          if (cancelled) return
          showDriftNotice()
          return
        }

        const snapHead = (envelope as any)?.globalHeadAtCreation as any | null | undefined
        const snapCat = snapHead?.category_versions
        const liveCat = head?.category_versions
        let hasDrift = false
        if (snapCat && typeof snapCat === 'object' && liveCat && typeof liveCat === 'object') {
          for (const [k, v] of Object.entries(liveCat)) {
            const sv = (snapCat as any)[k]
            if (typeof v === 'number' && typeof sv === 'number' && v !== sv) {
              hasDrift = true
              break
            }
          }
        } else if (snapHead?.global_version != null && head?.global_version != null) {
          hasDrift = Number(snapHead.global_version) !== Number(head.global_version)
        } else {
          // If we can’t compare reliably (older snapshots), don’t spam.
          hasDrift = false
        }

        if (!hasDrift) return

        if (cancelled) return
        showDriftNotice()
      })().catch(() => {})
    }, 0)

    return () => {
      cancelled = true
    }
  }, [userRole, currentScheduleId, selectedDateStr, loading, gridLoading, baselineSnapshot, supabase, showActionToast])

  // Snapshot differences (non-modal, on-demand)
  const snapshotDiffButtonRef = useRef<HTMLButtonElement | null>(null)
  const snapshotDiffPanelRef = useRef<HTMLDivElement | null>(null)
  const [snapshotDiffOpen, setSnapshotDiffOpen] = useState(false)
  const [snapshotDiffLoading, setSnapshotDiffLoading] = useState(false)
  const [snapshotDiffError, setSnapshotDiffError] = useState<string | null>(null)
  const [snapshotDiffResult, setSnapshotDiffResult] = useState<SnapshotDiffResult | null>(null)

  const snapshotDiffPos = useAnchoredPopoverPosition({
    open: snapshotDiffOpen,
    anchorRef: snapshotDiffButtonRef,
    popoverRef: snapshotDiffPanelRef,
    placement: 'bottom-end',
    offset: 8,
    pad: 8,
  })

  useOnClickOutside([snapshotDiffButtonRef, snapshotDiffPanelRef], () => setSnapshotDiffOpen(false), {
    enabled: snapshotDiffOpen,
    event: 'pointerdown',
  })

  useEffect(() => {
    if (!snapshotDiffOpen) return
    if (!baselineSnapshot) return

    let cancelled = false
    setSnapshotDiffLoading(true)
    setSnapshotDiffError(null)

    ;(async () => {
      const [staffRes, wardsRes, prefsRes, programsRes, sptRes] = await Promise.all([
        supabase
          .from('staff')
          .select('id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program'),
        supabase.from('wards').select('id,name,total_beds,team_assignments,team_assignment_portions'),
        supabase.from('pca_preferences').select('*'),
        supabase.from('special_programs').select('*'),
        supabase.from('spt_allocations').select('*'),
      ])

      // Back-compat: some DBs do not have wards.team_assignment_portions
      let effectiveWardsRes: typeof wardsRes = wardsRes
      if ((wardsRes as any)?.error?.message?.includes('team_assignment_portions')) {
        effectiveWardsRes = await supabase.from('wards').select('id,name,total_beds,team_assignments')
      }

      const firstError =
        (staffRes as any).error ||
        (effectiveWardsRes as any).error ||
        (prefsRes as any).error ||
        (programsRes as any).error ||
        (sptRes as any).error

      if (firstError) {
        if (cancelled) return
        setSnapshotDiffError((firstError as any)?.message || 'Failed to load live dashboard config.')
        setSnapshotDiffResult(null)
        return
      }

      const { diffBaselineSnapshot } = await import('@/lib/features/schedule/snapshotDiff')
      const diff = diffBaselineSnapshot({
        snapshot: baselineSnapshot,
        live: {
          staff: (staffRes as any).data || [],
          wards: (effectiveWardsRes as any).data || [],
          pcaPreferences: (prefsRes as any).data || [],
          specialPrograms: (programsRes as any).data || [],
          sptAllocations: (sptRes as any).data || [],
        },
      })

      if (cancelled) return
      setSnapshotDiffResult(diff)
    })()
      .catch((e) => {
        if (cancelled) return
        setSnapshotDiffError(e?.message || 'Failed to compute differences.')
        setSnapshotDiffResult(null)
      })
      .finally(() => {
        if (cancelled) return
        setSnapshotDiffLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [snapshotDiffOpen, baselineSnapshot, supabase])

  useEffect(() => {
    if (!showSnapshotUiReminder && snapshotDiffOpen) {
      setSnapshotDiffOpen(false)
    }
  }, [showSnapshotUiReminder, snapshotDiffOpen])

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
    
    const specialProgramSlots: number[] = []
    
    // Find which special programs this PCA is assigned to
    for (const programId of allocation.special_program_ids) {
      const program = specialPrograms.find(p => p.id === programId)
      if (!program) continue
      
      // Check which slots are assigned to this special program for this team
      // Robotic: slots 1-2 → SMM, slots 3-4 → SFM
      if (program.name === 'Robotic') {
        if (team === 'SMM') {
          if (allocation.slot1 === 'SMM') specialProgramSlots.push(1)
          if (allocation.slot2 === 'SMM') specialProgramSlots.push(2)
        }
        if (team === 'SFM') {
          if (allocation.slot3 === 'SFM') specialProgramSlots.push(3)
          if (allocation.slot4 === 'SFM') specialProgramSlots.push(4)
        }
      }
      // CRP: slot 2 → CPPC
      else if (program.name === 'CRP') {
        if (team === 'CPPC' && allocation.slot2 === 'CPPC') {
          specialProgramSlots.push(2)
        }
      }
      // For other programs, assume all slots in the program's designated team are special
      else {
        // Check program.slots for this weekday if available
        const currentWeekday = getWeekday(selectedDate)
        if (program.slots && program.slots[currentWeekday]) {
          const programSlots = program.slots[currentWeekday] as number[]
          for (const slot of programSlots) {
            if (getSlotsForTeam(allocation, team).includes(slot)) {
              specialProgramSlots.push(slot)
            }
          }
        }
      }
    }
    
    return [...new Set(specialProgramSlots)] // Remove duplicates
  }

  // Handle drag start - detect if it's a PCA being dragged
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const activeId = active.id as string
    
    // Extract staff ID from composite ID (format: staffId or staffId::team)
    // This allows each team's staff card instance to have a unique draggable ID
    // Use '::' as separator to avoid conflicts with UUIDs (which contain hyphens)
    const staffId = activeId.includes('::') ? activeId.split('::')[0] : activeId
    
    // Find the staff member
    const staffMember = staff.find(s => s.id === staffId)
    if (!staffMember) return
    setActiveDragStaffForOverlay(staffMember)

    // Auto-scroll to the relevant allocation block when dragging in the correct step.
    // - Therapists (SPT/APPT/RPT) in Step 2 → Block 1 (Therapist Allocation)
    // - Floating PCAs in Step 3 → Block 2 (PCA Allocation)
    const activeRank = (active.data.current as any)?.staff?.rank ?? staffMember.rank
    const isTherapistRank = ['RPT', 'SPT', 'APPT'].includes(activeRank)
    const isPcaRank = activeRank === 'PCA'
    if (isTherapistRank && currentStep === 'therapist-pca') {
      therapistAllocationBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (isPcaRank && currentStep === 'floating-pca' && staffMember.floating) {
      pcaAllocationBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    
    // Track therapist drag state for validation (including buffer therapists)
    if (['RPT', 'SPT', 'APPT'].includes(staffMember.rank)) {
      // Find the current team from allocations
      let currentTeam: Team | undefined
      for (const [team, allocs] of Object.entries(therapistAllocations)) {
        if (allocs.some(a => a.staff_id === staffId)) {
          currentTeam = team as Team
          break
        }
      }
      
      // If no current team found, check staffOverrides or staff.team
      if (!currentTeam) {
        currentTeam = staffOverrides[staffId]?.team ?? staffMember.team ?? undefined
      }
      
      // For buffer therapists without a team, allow dragging from StaffPool
      if (!currentTeam && staffMember.status === 'buffer') {
        // Buffer therapist not yet assigned - will be assigned on drop
        setTherapistDragState({
          isActive: true,
          staffId: staffId,
          sourceTeam: null, // No source team yet
        })
      } else if (currentTeam) {
        setTherapistDragState({
          isActive: true,
          staffId: staffId,
          sourceTeam: currentTeam,
        })
      }
    }
    
    // Only handle PCA drag here
    if (staffMember.rank !== 'PCA') return
    
    // Check if floating PCA
    if (!staffMember.floating) {
      // Non-floating PCA - will snap back
      return
    }
    
    // Check if this drag is from StaffPool (no team context in ID)
    const isFromStaffPool = !activeId.includes('::')
    
      // Validate slot transfer for floating PCA from StaffPool
      if (isFromStaffPool) {
        const isBufferStaff = staffMember.status === 'buffer'
        // Only allow slot transfer in Step 3 only
        // For buffer PCA: allow in Step 3 (before and after algo)
        // For regular PCA: allow in Step 3 only
        const canTransfer = currentStep === 'floating-pca'
        
        // Store buffer staff flag in drag state for later use
        setPcaDragState(prev => ({ ...prev, isBufferStaff }))
        if (!canTransfer) {
        // Don't show popover (tooltip handles the reminder for both buffer and regular staff)
        // Cancel the drag by not setting pcaDragState
        return
      }
      
      // Find source team from existing allocations for StaffPool drag
      let sourceTeam: Team | null = null
      for (const [team, allocs] of Object.entries(pcaAllocations)) {
        if (allocs.some(a => a.staff_id === staffId)) {
          sourceTeam = team as Team
          break
        }
      }
      
      // For buffer PCA, allow dragging even if not yet allocated (will create new allocation on drop)
      // Reuse isBufferStaff from above
      if (!sourceTeam && !isBufferStaff) {
        // PCA not yet allocated and not buffer staff - can't do slot transfer
        return
      }
      
      // Calculate available slots based on staff type
      let availableSlots: number[] = []
      
      if (isBufferStaff && staffMember.buffer_fte !== undefined) {
        // For buffer floating PCA: calculate remaining unassigned slots
        // Calculate all slots from buffer_fte (e.g., 0.5 FTE = 2 slots)
        const numSlots = Math.round(staffMember.buffer_fte / 0.25)
        const allBufferSlots = [1, 2, 3, 4].slice(0, numSlots)
        
        // Find all already assigned slots across ALL teams
        const assignedSlots = new Set<number>()
        Object.values(pcaAllocations).forEach((teamAllocs) => {
          teamAllocs.forEach((alloc) => {
            if (alloc.staff_id === staffId) {
              // Count all slots assigned to any team
              if (alloc.slot1) assignedSlots.add(1)
              if (alloc.slot2) assignedSlots.add(2)
              if (alloc.slot3) assignedSlots.add(3)
              if (alloc.slot4) assignedSlots.add(4)
            }
          })
        })
        
        // Available slots = all buffer slots minus already assigned slots
        availableSlots = allBufferSlots.filter(slot => !assignedSlots.has(slot))
        
        // If no available slots, can't drag
        if (availableSlots.length === 0) {
          return
        }
        
        // For buffer PCA, sourceTeam can be null (first assignment) or the first team found
        // But we want to allow dragging to assign remaining slots, so keep sourceTeam as found or null
      } else if (sourceTeam) {
        // For regular floating PCA: get slots from the source team's allocation
        const allocsForTeam = pcaAllocations[sourceTeam] || []
        const pcaAllocation = allocsForTeam.find(a => a.staff_id === staffId)
        
        if (!pcaAllocation) return
        
        // Get slots for the source team, EXCLUDING special program slots
        const allSlotsInTeam = getSlotsForTeam(pcaAllocation, sourceTeam)
        const specialProgramSlots = getSpecialProgramSlotsForTeam(pcaAllocation, sourceTeam)
        availableSlots = allSlotsInTeam.filter(slot => !specialProgramSlots.includes(slot))
        
        // If no available slots (all are special program), snap back
        if (availableSlots.length === 0) {
          return
        }
      } else {
        // Non-buffer PCA without sourceTeam - can't drag
        return
      }
      
      // Get the position of the dragged element for popover positioning
      const activeRect = active.rect.current.initial
      const popoverPosition = activeRect ? calculatePopoverPosition(activeRect, 150) : null
      
      // Set up drag state for StaffPool drag
      setPcaDragState({
        isActive: true,
        isDraggingFromPopover: false,
        staffId: staffId,
        staffName: staffMember.name,
        sourceTeam: sourceTeam,
        availableSlots: availableSlots,
        selectedSlots: availableSlots.length === 1 ? availableSlots : [], // Auto-select if only one slot
        showSlotSelection: false,
        popoverPosition: popoverPosition,
        isBufferStaff: isBufferStaff,
      })
      
      return
    }
    
    // Check if this is a re-drag after slot selection (popover is already showing)
    if (pcaDragState.showSlotSelection && pcaDragState.staffId === staffId && pcaDragState.selectedSlots.length > 0) {
      // User is re-dragging with already selected slots - just mark as active
      setPcaDragState(prev => ({
        ...prev,
        isActive: true,
      }))
      return
    }
    
    // Get the source team from the drag data (set by StaffCard via dragTeam prop)
    const dragData = active.data.current as { team?: Team } | undefined
    const sourceTeam = dragData?.team as Team | null
    
    if (!sourceTeam) {
      return
    }
    
    // Find the PCA allocation for this staff
    const allocsForTeam = pcaAllocations[sourceTeam] || []
    const pcaAllocation = allocsForTeam.find(a => a.staff_id === staffId)
    
    if (!pcaAllocation) return
    
    // Get slots for the source team, EXCLUDING special program slots
    const allSlotsInTeam = getSlotsForTeam(pcaAllocation, sourceTeam)
    const specialProgramSlots = getSpecialProgramSlotsForTeam(pcaAllocation, sourceTeam)
    const availableSlots = allSlotsInTeam.filter(slot => !specialProgramSlots.includes(slot))
    
    // If no available slots (all are special program), snap back
    if (availableSlots.length === 0) {
      return
    }
    
    // Get the position of the dragged element for popover positioning
    const activeRect = active.rect.current.initial
    const popoverPosition = activeRect ? calculatePopoverPosition(activeRect, 150) : null
    
    // Initialize PCA drag state
    const isBufferStaff = staffMember.status === 'buffer'
    setPcaDragState({
      isActive: true,
      isDraggingFromPopover: false,
      staffId: staffId,
      staffName: staffMember.name,
      sourceTeam: sourceTeam,
      availableSlots: availableSlots,
      selectedSlots: availableSlots.length === 1 ? availableSlots : [], // Auto-select if single slot
      showSlotSelection: false, // Will be shown when leaving team zone
      popoverPosition: popoverPosition,
      isBufferStaff: isBufferStaff,
    })
  }

  // Handle drag move - detect when PCA leaves source team zone
  const handleDragMove = (event: DragMoveEvent) => {
    const { over, active } = event
    
    // Validate therapist drag: only allowed in step 2
    // This applies to all therapists (SPT, APPT, RPT) including fixed-team staff
    if (therapistDragState.isActive && therapistDragState.sourceTeam) {
      const overId = over?.id?.toString() || ''
      const isOverDifferentTeam = overId.startsWith('therapist-') && overId !== `therapist-${therapistDragState.sourceTeam}`
      
      // Don't show popover when user drags out of source team after step 2
      // Tooltip handles the reminder for both buffer and regular staff
      // Fixed-team staff (APPT, RPT) will show warning tooltip when dragging
      if (isOverDifferentTeam && currentStep !== 'therapist-pca') {
        // Reset therapist drag state
        setTherapistDragState({
          isActive: false,
          staffId: null,
          sourceTeam: null,
        })
        
        return
      }
    }
    
    // Only process if we have an active PCA drag (not from popover)
    if (!pcaDragState.isActive || !pcaDragState.staffId || pcaDragState.isDraggingFromPopover) return
    
    // Check if we've left the source team zone (over a different drop target)
    const overId = over?.id?.toString() || ''
    const isOverDifferentTeam = overId.startsWith('pca-') && overId !== `pca-${pcaDragState.sourceTeam}`
    
    // Validate: Floating PCA slot transfer is only allowed in step 3
    // Don't show popover (tooltip handles the reminder)
    // Just reset drag state to prevent the transfer
    if (isOverDifferentTeam && currentStep !== 'floating-pca') {
      setPcaDragState({
        isActive: false,
        isDraggingFromPopover: false,
        staffId: null,
        staffName: null,
        sourceTeam: null,
        availableSlots: [],
        selectedSlots: [],
        showSlotSelection: false,
        popoverPosition: null,
        isDiscardMode: false,
        isBufferStaff: false,
      })
      
      return
    }
    
    // For multi-slot PCAs, we USED to show slot selection when leaving source team (pre-drop).
    // This caused the popover to appear near the origin card, then "jump" to the drop target after drop.
    // New behavior: ONLY show slot selection AFTER drop (handled in handleDragEnd).
    if (pcaDragState.availableSlots.length > 1 && !pcaDragState.showSlotSelection && isOverDifferentTeam) {
    }
  }

  // Handle slot toggle in the selection popover
  const handleSlotToggle = (slot: number) => {
    setPcaDragState(prev => {
      const isSelected = prev.selectedSlots.includes(slot)
      return {
        ...prev,
        selectedSlots: isSelected
          ? prev.selectedSlots.filter(s => s !== slot)
          : [...prev.selectedSlots, slot],
      }
    })
  }

  const handlePcaContextSlotToggle = (slot: number) => {
    setPcaContextAction(prev => {
      const isSelected = prev.selectedSlots.includes(slot)
      return {
        ...prev,
        selectedSlots: isSelected ? prev.selectedSlots.filter(s => s !== slot) : [...prev.selectedSlots, slot],
      }
    })
  }

  // Close the slot selection popover
  const handleCloseSlotSelection = () => {
    setPcaDragState({
      isActive: false,
      isDraggingFromPopover: false,
      staffId: null,
      staffName: null,
      sourceTeam: null,
      availableSlots: [],
      selectedSlots: [],
      showSlotSelection: false,
      popoverPosition: null,
      isDiscardMode: false,
      isBufferStaff: false,
    })
  }
  
  // Reset PCA drag state completely
  const resetPcaDragState = () => {
    setPcaDragState({
      isActive: false,
      isDraggingFromPopover: false,
      staffId: null,
      staffName: null,
      sourceTeam: null,
      availableSlots: [],
      selectedSlots: [],
      showSlotSelection: false,
      popoverPosition: null,
      isDiscardMode: false,
      isBufferStaff: false,
    })
  }
  
  // Start drag from the popover preview card (or perform discard if in discard mode)
  const handleStartDragFromPopover = () => {
    if (pcaDragState.selectedSlots.length === 0) return
    
    // If in discard mode, perform discard immediately (no need to drag)
    if (pcaDragState.isDiscardMode && pcaDragState.sourceTeam && pcaDragState.staffId) {
      // Check if this is SPT (therapist) or PCA
      const staffMember = staff.find(s => s.id === pcaDragState.staffId)
      if (staffMember?.rank === 'SPT') {
        performTherapistSlotDiscard(pcaDragState.staffId, pcaDragState.sourceTeam, pcaDragState.selectedSlots)
      } else {
        performSlotDiscard(pcaDragState.staffId, pcaDragState.sourceTeam, pcaDragState.selectedSlots)
      }
      resetPcaDragState()
      return
    }
    
    setPcaDragState(prev => ({
      ...prev,
      isActive: true,
      isDraggingFromPopover: true,
      showSlotSelection: false, // Hide popover during drag
    }))
  }
  
  // Shared function to remove therapist allocation from team (for buffer therapist and SPT slot discard)
  const removeTherapistAllocationFromTeam = (staffId: string, sourceTeam: Team) => {
    setTherapistAllocations(prev => ({
      ...prev,
      [sourceTeam]: prev[sourceTeam].filter(a => a.staff_id !== staffId),
    }))
    
    // Clear staffOverrides for this staff (remove team assignment)
    setStaffOverrides(prev => {
      const updated = { ...prev }
      if (updated[staffId]) {
        const { team, ...rest } = updated[staffId]
        if (Object.keys(rest).length === 0) {
          delete updated[staffId]
        } else {
          updated[staffId] = rest
        }
      }
      return updated
    })
  }
  
  // Perform therapist slot discard (for SPT) - works like buffer therapist removal
  const performTherapistSlotDiscard = (staffId: string, sourceTeam: Team, slotsToDiscard: number[]) => {
    if (slotsToDiscard.length === 0) return
    
    const currentAllocation = Object.values(therapistAllocations).flat()
      .find(a => a.staff_id === staffId && a.team === sourceTeam)
    
    if (!currentAllocation) return
    
    const staffMember = staff.find(s => s.id === staffId)
    if (!staffMember || staffMember.rank !== 'SPT') return // Only SPT has slot assignments
    
    // For SPT, slot discard removes the entire allocation from the team (like buffer therapist)
    // This is different from PCA slot discard which only removes specific slots
    removeTherapistAllocationFromTeam(staffId, sourceTeam)
  }
  
  // Perform slot discard (opposite of slot transfer) - for PCA
  const performSlotDiscard = (staffId: string, sourceTeam: Team, slotsToDiscard: number[]) => {
    if (slotsToDiscard.length === 0) return
    
    const currentAllocation = Object.values(pcaAllocations).flat()
      .find(a => a.staff_id === staffId)
    
    if (!currentAllocation) return
    
    const staffMember = staff.find(s => s.id === staffId)
    const isBufferStaff = staffMember?.status === 'buffer'
    const bufferFTE = staffMember?.buffer_fte
    
    // Calculate FTE to discard
    const fteDiscarded = slotsToDiscard.length * 0.25
    
    // Update pcaAllocations: remove selected slots from sourceTeam (set to null)
    setPcaAllocations(prev => {
      const newAllocations = { ...prev }
      
      // Remove old allocation from all teams first
      for (const team of TEAMS) {
        newAllocations[team] = (newAllocations[team] || []).filter(a => a.staff_id !== staffId)
      }
      
      // Create updated allocation with slots removed
      const updatedAllocation = { ...currentAllocation }
      
      // Remove selected slots (set to null)
      for (const slot of slotsToDiscard) {
        if (slot === 1) updatedAllocation.slot1 = null
        if (slot === 2) updatedAllocation.slot2 = null
        if (slot === 3) updatedAllocation.slot3 = null
        if (slot === 4) updatedAllocation.slot4 = null
      }
      
      // Update slot_assigned
      const remainingSlots = [
        updatedAllocation.slot1,
        updatedAllocation.slot2,
        updatedAllocation.slot3,
        updatedAllocation.slot4,
      ].filter(s => s !== null).length
      updatedAllocation.slot_assigned = remainingSlots * 0.25
      
      // Determine which teams this PCA now has slots in
      const teamsWithSlots = new Set<Team>()
      if (updatedAllocation.slot1) teamsWithSlots.add(updatedAllocation.slot1)
      if (updatedAllocation.slot2) teamsWithSlots.add(updatedAllocation.slot2)
      if (updatedAllocation.slot3) teamsWithSlots.add(updatedAllocation.slot3)
      if (updatedAllocation.slot4) teamsWithSlots.add(updatedAllocation.slot4)
      
      // Add the updated allocation to each team that has remaining slots
      for (const team of teamsWithSlots) {
        const teamAllocation = { ...updatedAllocation, team: team }
        newAllocations[team] = [...(newAllocations[team] || []), teamAllocation]
      }
      
      return newAllocations
    })
    
    // Update pending FTE per team (increase source team's pending by discarded FTE)
    const effectiveFTE = isBufferStaff && bufferFTE !== undefined ? bufferFTE : fteDiscarded
    setPendingPCAFTEPerTeam(prev => ({
      ...prev,
      [sourceTeam]: (prev[sourceTeam] || 0) + effectiveFTE,
    }))
    
    // Update staffOverrides to remove discarded slots
    setStaffOverrides(prev => {
      const current = prev[staffId] || {}
      const slotOverrides = current.slotOverrides || {}
      
      // Get current slot assignments from allocation
      const currentSlot1 = currentAllocation.slot1
      const currentSlot2 = currentAllocation.slot2
      const currentSlot3 = currentAllocation.slot3
      const currentSlot4 = currentAllocation.slot4
      
      // Remove discarded slots (set to null)
      const updatedSlotOverrides = {
        slot1: slotsToDiscard.includes(1) ? null : (slotOverrides.slot1 ?? currentSlot1),
        slot2: slotsToDiscard.includes(2) ? null : (slotOverrides.slot2 ?? currentSlot2),
        slot3: slotsToDiscard.includes(3) ? null : (slotOverrides.slot3 ?? currentSlot3),
        slot4: slotsToDiscard.includes(4) ? null : (slotOverrides.slot4 ?? currentSlot4),
      }

      const manual = (current as any).bufferManualSlotOverrides || {}
      const updatedManualSlotOverrides = isBufferStaff
        ? {
            slot1: slotsToDiscard.includes(1) ? null : (manual.slot1 ?? updatedSlotOverrides.slot1 ?? null),
            slot2: slotsToDiscard.includes(2) ? null : (manual.slot2 ?? updatedSlotOverrides.slot2 ?? null),
            slot3: slotsToDiscard.includes(3) ? null : (manual.slot3 ?? updatedSlotOverrides.slot3 ?? null),
            slot4: slotsToDiscard.includes(4) ? null : (manual.slot4 ?? updatedSlotOverrides.slot4 ?? null),
          }
        : undefined
      
      return {
        ...prev,
        [staffId]: {
          ...current,
          slotOverrides: updatedSlotOverrides,
          ...(isBufferStaff ? { bufferManualSlotOverrides: updatedManualSlotOverrides } : {}),
        },
      }
    })
  }
  
  // Perform the actual slot transfer
  const performSlotTransfer = (
    targetTeam: Team,
    options?: { staffId: string; sourceTeam: Team | null; selectedSlots: number[]; closeSlotPopover?: boolean }
  ) => {
    const closeIfNeeded = () => {
      if (options?.closeSlotPopover === false) return
      handleCloseSlotSelection()
    }

    const staffId = options?.staffId ?? pcaDragState.staffId
    const sourceTeam = options?.sourceTeam ?? pcaDragState.sourceTeam
    const selectedSlots = options?.selectedSlots ?? pcaDragState.selectedSlots
    
    if (!staffId || selectedSlots.length === 0) {
      closeIfNeeded()
      return
    }
    
    // Find the current PCA allocation
    const currentAllocation = Object.values(pcaAllocations).flat()
      .find(a => a.staff_id === staffId)
    
    // For buffer PCA that hasn't been assigned yet, create a new allocation
    const staffMember = staff.find(s => s.id === staffId)
    const isBufferStaff = staffMember?.status === 'buffer'
    const bufferFTE = staffMember?.buffer_fte
    
    // If no existing allocation and this is a buffer PCA being assigned for the first time
    if (!currentAllocation && isBufferStaff && bufferFTE !== undefined) {
      // Create new allocation for buffer PCA
      const newAllocation: PCAAllocation & { staff: Staff } = {
        id: `temp-${staffId}-${Date.now()}`,
        schedule_id: currentScheduleId || '',
        staff_id: staffId,
        team: targetTeam,
        fte_pca: bufferFTE,
        fte_remaining: bufferFTE,
        slot_assigned: selectedSlots.length * 0.25,
        slot_whole: null,
        slot1: selectedSlots.includes(1) ? targetTeam : null,
        slot2: selectedSlots.includes(2) ? targetTeam : null,
        slot3: selectedSlots.includes(3) ? targetTeam : null,
        slot4: selectedSlots.includes(4) ? targetTeam : null,
        leave_type: null,
        special_program_ids: null,
        invalid_slot: undefined,
        fte_subtraction: 0,
        staff: staffMember,
      }
      
      // Add to target team
      setPcaAllocations(prev => ({
        ...prev,
        [targetTeam]: [...(prev[targetTeam] || []), newAllocation],
      }))
      
      // Update staffOverrides
      setStaffOverrides(prev => ({
        ...prev,
        [staffId]: {
          ...prev[staffId],
          slotOverrides: {
            slot1: selectedSlots.includes(1) ? targetTeam : null,
            slot2: selectedSlots.includes(2) ? targetTeam : null,
            slot3: selectedSlots.includes(3) ? targetTeam : null,
            slot4: selectedSlots.includes(4) ? targetTeam : null,
          },
          bufferManualSlotOverrides: {
            slot1: selectedSlots.includes(1) ? targetTeam : null,
            slot2: selectedSlots.includes(2) ? targetTeam : null,
            slot3: selectedSlots.includes(3) ? targetTeam : null,
            slot4: selectedSlots.includes(4) ? targetTeam : null,
          },
          fteRemaining: bufferFTE,
        },
      }))
      
      // Update pending FTE per team (reduce target team's pending by buffer PCA FTE)
      const fteTransferred = bufferFTE
      setPendingPCAFTEPerTeam(prev => ({
        ...prev,
        [targetTeam]: Math.max(0, (prev[targetTeam] || 0) - fteTransferred),
      }))
      
      closeIfNeeded()
      return
    }
    
    // If no existing allocation and not buffer staff, can't proceed
    if (!currentAllocation) {
      closeIfNeeded()
      return
    }
    
    // If sourceTeam is null but we have an allocation, use the allocation's team as source
    const effectiveSourceTeam = sourceTeam || currentAllocation.team
    
    // Note: No validation needed here - special program slots are already filtered out in handleDragStart
    // (they're excluded from availableSlots), so selectedSlots will never contain special program slots.
    // Non-special-program slots can be moved to any team, even if that team has other special program slots
    // for the same staff member. The display logic will show them as separate cards.
    
    // Update pcaAllocations: reassign selected slots from sourceTeam to targetTeam
    setPcaAllocations(prev => {
      const newAllocations = { ...prev }
      
      // Create a deep copy of the allocation to modify
      const updatedAllocation = { ...currentAllocation }
      
      // Reassign selected slots to target team
      for (const slot of selectedSlots) {
        if (slot === 1) updatedAllocation.slot1 = targetTeam
        if (slot === 2) updatedAllocation.slot2 = targetTeam
        if (slot === 3) updatedAllocation.slot3 = targetTeam
        if (slot === 4) updatedAllocation.slot4 = targetTeam
      }
      
      // Recalculate slot_assigned
      let slotCount = 0
      if (updatedAllocation.slot1) slotCount++
      if (updatedAllocation.slot2) slotCount++
      if (updatedAllocation.slot3) slotCount++
      if (updatedAllocation.slot4) slotCount++
      updatedAllocation.slot_assigned = slotCount * 0.25
      
      // Remove old allocation from all teams
      for (const team of TEAMS) {
        newAllocations[team] = newAllocations[team].filter(a => a.staff_id !== staffId)
      }
      
      // Determine which teams this PCA now has slots in
      const teamsWithSlots = new Set<Team>()
      if (updatedAllocation.slot1) teamsWithSlots.add(updatedAllocation.slot1)
      if (updatedAllocation.slot2) teamsWithSlots.add(updatedAllocation.slot2)
      if (updatedAllocation.slot3) teamsWithSlots.add(updatedAllocation.slot3)
      if (updatedAllocation.slot4) teamsWithSlots.add(updatedAllocation.slot4)
      
      // Add the updated allocation to each team that has slots
      for (const team of teamsWithSlots) {
        const teamAllocation = { ...updatedAllocation, team: team }
        newAllocations[team] = [...newAllocations[team], teamAllocation]
      }
      
      return newAllocations
    })
    
    // Update staffOverrides to track the slot changes
    setStaffOverrides(prev => {
      const currentOverride = prev[staffId] || {}
      const existingAlloc = currentAllocation
      
      // Calculate new slot assignments
      const newSlot1 = selectedSlots.includes(1) ? targetTeam : existingAlloc?.slot1
      const newSlot2 = selectedSlots.includes(2) ? targetTeam : existingAlloc?.slot2
      const newSlot3 = selectedSlots.includes(3) ? targetTeam : existingAlloc?.slot3
      const newSlot4 = selectedSlots.includes(4) ? targetTeam : existingAlloc?.slot4
      
      return {
        ...prev,
        [staffId]: {
          ...currentOverride,
          slotOverrides: {
            slot1: newSlot1,
            slot2: newSlot2,
            slot3: newSlot3,
            slot4: newSlot4,
          },
          ...(isBufferStaff
            ? {
                bufferManualSlotOverrides: {
                  ...(currentOverride as any).bufferManualSlotOverrides,
                  slot1:
                    selectedSlots.includes(1)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot1 ?? existingAlloc?.slot1 ?? null,
                  slot2:
                    selectedSlots.includes(2)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot2 ?? existingAlloc?.slot2 ?? null,
                  slot3:
                    selectedSlots.includes(3)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot3 ?? existingAlloc?.slot3 ?? null,
                  slot4:
                    selectedSlots.includes(4)
                      ? targetTeam
                      : (currentOverride as any).bufferManualSlotOverrides?.slot4 ?? existingAlloc?.slot4 ?? null,
                },
              }
            : {}),
          fteRemaining: currentOverride.fteRemaining ?? existingAlloc?.fte_pca ?? 1.0,
          leaveType: currentOverride.leaveType ?? existingAlloc?.leave_type ?? null,
        },
      }
    })
    
    // Update pending FTE per team
    const fteTransferred = selectedSlots.length * 0.25
    // For buffer PCA, use buffer_fte if available
    const effectiveFTE = isBufferStaff && bufferFTE !== undefined ? bufferFTE : fteTransferred
    setPendingPCAFTEPerTeam(prev => ({
      ...prev,
      [effectiveSourceTeam]: Math.max(0, (prev[effectiveSourceTeam] || 0) + effectiveFTE),
      [targetTeam]: Math.max(0, (prev[targetTeam] || 0) - effectiveFTE),
    }))
    
    // Reset drag state
    closeIfNeeded()
  }

  // Staff Pool: Assign remaining/unassigned slots (floating PCA)
  const performPcaSlotAssignFromPool = (
    targetTeam: Team,
    options: { staffId: string; selectedSlots: number[] }
  ) => {
    const staffId = options.staffId
    const selectedSlots = options.selectedSlots
    if (!staffId || selectedSlots.length === 0) return

    const staffMember =
      staff.find(s => s.id === staffId) ||
      bufferStaff.find(s => s.id === staffId)
    if (!staffMember) return
    if (staffMember.rank !== 'PCA' || !staffMember.floating) return

    const currentAllocation = Object.values(pcaAllocations).flat().find(a => a.staff_id === staffId)

    // Capacity FTE (base) for the day
    const override = staffOverrides[staffId]
    const bufferFTEraw = (staffMember as any).buffer_fte
    const bufferFTE =
      typeof bufferFTEraw === 'number' ? bufferFTEraw : bufferFTEraw != null ? parseFloat(String(bufferFTEraw)) : NaN
    const capacityFTE =
      typeof override?.fteRemaining === 'number'
        ? override.fteRemaining
        : staffMember.status === 'buffer' && Number.isFinite(bufferFTE)
          ? bufferFTE
          : 1.0

    const baseAlloc = currentAllocation
      ? { ...currentAllocation }
      : ({
          id: `temp-assign-${staffId}-${Date.now()}`,
          schedule_id: currentScheduleId || '',
          staff_id: staffId,
          team: targetTeam,
          fte_pca: capacityFTE,
          fte_remaining: capacityFTE,
          slot_assigned: 0,
          slot_whole: null,
          slot1: null,
          slot2: null,
          slot3: null,
          slot4: null,
          leave_type: null,
          special_program_ids: null,
          invalid_slot: undefined,
          fte_subtraction: 0,
          staff: staffMember,
        } as any)

    // Assign selected slots to target team
    const updatedAllocation: any = { ...baseAlloc }
    for (const slot of selectedSlots) {
      if (slot === 1) updatedAllocation.slot1 = targetTeam
      if (slot === 2) updatedAllocation.slot2 = targetTeam
      if (slot === 3) updatedAllocation.slot3 = targetTeam
      if (slot === 4) updatedAllocation.slot4 = targetTeam
    }

    // Recalculate slot_assigned
    let slotCount = 0
    if (updatedAllocation.slot1) slotCount++
    if (updatedAllocation.slot2) slotCount++
    if (updatedAllocation.slot3) slotCount++
    if (updatedAllocation.slot4) slotCount++
    updatedAllocation.slot_assigned = slotCount * 0.25

    // Rebuild pcaAllocations across teams (mirrors performSlotTransfer)
    setPcaAllocations(prev => {
      const next: any = { ...prev }
      for (const team of TEAMS) {
        next[team] = (next[team] || []).filter((a: any) => a.staff_id !== staffId)
      }

      const teamsWithSlots = new Set<Team>()
      if (updatedAllocation.slot1) teamsWithSlots.add(updatedAllocation.slot1)
      if (updatedAllocation.slot2) teamsWithSlots.add(updatedAllocation.slot2)
      if (updatedAllocation.slot3) teamsWithSlots.add(updatedAllocation.slot3)
      if (updatedAllocation.slot4) teamsWithSlots.add(updatedAllocation.slot4)

      for (const team of teamsWithSlots) {
        next[team] = [...(next[team] || []), { ...updatedAllocation, team }]
      }
      return next
    })

    // Track slot overrides
    setStaffOverrides(prev => {
      const currentOverride = prev[staffId] || {}
      const existingAlloc = baseAlloc
      const newSlot1 = selectedSlots.includes(1) ? targetTeam : existingAlloc?.slot1 ?? null
      const newSlot2 = selectedSlots.includes(2) ? targetTeam : existingAlloc?.slot2 ?? null
      const newSlot3 = selectedSlots.includes(3) ? targetTeam : existingAlloc?.slot3 ?? null
      const newSlot4 = selectedSlots.includes(4) ? targetTeam : existingAlloc?.slot4 ?? null
      return {
        ...prev,
        [staffId]: {
          ...currentOverride,
          slotOverrides: {
            slot1: newSlot1,
            slot2: newSlot2,
            slot3: newSlot3,
            slot4: newSlot4,
          },
          ...(staffMember.status === 'buffer'
            ? {
                bufferManualSlotOverrides: {
                  ...(currentOverride as any).bufferManualSlotOverrides,
                  slot1: newSlot1,
                  slot2: newSlot2,
                  slot3: newSlot3,
                  slot4: newSlot4,
                },
              }
            : {}),
          // Preserve base capacity for display/logic (StaffPool trueFTE subtracts assigned slots)
          fteRemaining: currentOverride.fteRemaining ?? capacityFTE,
          leaveType: currentOverride.leaveType ?? existingAlloc?.leave_type ?? null,
        },
      }
    })

    // Reduce target team's pending by assigned FTE (slot-based)
    const delta = selectedSlots.length * 0.25
    setPendingPCAFTEPerTeam(prev => ({
      ...prev,
      [targetTeam]: Math.max(0, (prev[targetTeam] || 0) - delta),
    }))
  }

  // Handle drag and drop for therapist staff cards (RPT and SPT only) AND PCA slot transfers
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragStaffForOverlay(null)
    const { active, over } = event
    const activeId = active.id as string
    // Extract staff ID from composite ID (format: staffId or staffId::team)
    const staffId = activeId.includes('::') ? activeId.split('::')[0] : activeId
    const staffMember = staff.find(s => s.id === staffId)
    
    // For discard flow: when dropped "elsewhere" (no destination drop zone), anchor the popover
    // near the drag's final position (same viewport-safe positioning helper).
    const dndRectForPopover = (active.rect.current.translated ?? active.rect.current.initial) as
      | { left: number; top: number; width: number; height: number }
      | null
    const discardPopoverPosition = dndRectForPopover
      ? calculatePopoverPosition(dndRectForPopover, 150)
      : null
    
    
    // Show popover again after unsuccessful drag from popover
    const showPopoverAgain = (dropTargetPosition?: { x: number; y: number } | null) => {
      setPcaDragState(prev => ({
        ...prev,
        isActive: false,
        isDraggingFromPopover: false,
        showSlotSelection: true,
        ...(dropTargetPosition !== undefined && { popoverPosition: dropTargetPosition }),
      }))
    }
    
    // Keep popover visible but mark drag as inactive (for multi-slot selection)
    const pausePcaDrag = (newPosition?: { x: number; y: number } | null) => {
      setPcaDragState(prev => ({
        ...prev,
        isActive: false,
        isDraggingFromPopover: false,
        ...(newPosition !== undefined && { popoverPosition: newPosition }),
      }))
    }
    
    // Check if this is a PCA drag that we're handling (either from card or from popover)
    if ((pcaDragState.isActive && pcaDragState.staffId === staffId) || pcaDragState.isDraggingFromPopover) {
      const effectiveStaffId = pcaDragState.staffId || staffId
      
      // Handle PCA slot discard (dropped outside any team)
      if (!over || !over.id.toString().startsWith('pca-')) {
        // Dropped outside any PCA block - handle slot discard
        const currentAllocation = Object.values(pcaAllocations).flat()
          .find(a => a.staff_id === effectiveStaffId)
        
        if (!currentAllocation) {
          // No allocation to discard
          resetPcaDragState()
          return
        }
        
        const sourceTeam = pcaDragState.sourceTeam || currentAllocation.team
        const assignedSlots: number[] = []
        if (currentAllocation.slot1 === sourceTeam) assignedSlots.push(1)
        if (currentAllocation.slot2 === sourceTeam) assignedSlots.push(2)
        if (currentAllocation.slot3 === sourceTeam) assignedSlots.push(3)
        if (currentAllocation.slot4 === sourceTeam) assignedSlots.push(4)
        
        // Check if this is SPT (therapist) or PCA
        const staffMember = staff.find(s => s.id === effectiveStaffId)
        const isSPT = staffMember?.rank === 'SPT'
        
        // For SPT, slot discard removes the entire allocation (like buffer therapist)
        // No need to show slot selection - just remove the allocation immediately
        if (isSPT) {
          performTherapistSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // For PCA, handle single vs multi-slot discard
        if (assignedSlots.length === 1) {
          performSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // If multi-slot, show slot selection for discard (PCA only)
        if (assignedSlots.length > 1) {
          // Set up for slot discard selection
          setPcaDragState(prev => ({
            ...prev,
            isActive: false,
            isDraggingFromPopover: false,
            showSlotSelection: true,
            availableSlots: assignedSlots,
            selectedSlots: [], // User will select which slots to discard
            popoverPosition:
              discardPopoverPosition ??
              prev.popoverPosition ??
              calculatePopoverPosition({ left: 100, top: 100, width: 0, height: 0 }, 150),
            isDiscardMode: true, // Flag to indicate this is discard, not transfer
          }))
          return
        }
        
        resetPcaDragState()
        return
      }
      
      const overId = over.id.toString()
      
      // Check if dropped on a PCA block (pca-{team})
      if (!overId.startsWith('pca-')) {
        // Not dropped on a PCA block - handle discard (same as above)
        const currentAllocation = Object.values(pcaAllocations).flat()
          .find(a => a.staff_id === effectiveStaffId)
        
        if (!currentAllocation) {
          resetPcaDragState()
          return
        }
        
        const sourceTeam = pcaDragState.sourceTeam || currentAllocation.team
        const assignedSlots: number[] = []
        if (currentAllocation.slot1 === sourceTeam) assignedSlots.push(1)
        if (currentAllocation.slot2 === sourceTeam) assignedSlots.push(2)
        if (currentAllocation.slot3 === sourceTeam) assignedSlots.push(3)
        if (currentAllocation.slot4 === sourceTeam) assignedSlots.push(4)
        
        // Check if this is SPT (therapist) or PCA
        const staffMemberForDiscard = staff.find(s => s.id === effectiveStaffId)
        const isSPTForDiscard = staffMemberForDiscard?.rank === 'SPT'
        
        // For SPT, slot discard removes the entire allocation (like buffer therapist)
        // No need to show slot selection - just remove the allocation immediately
        if (isSPTForDiscard) {
          performTherapistSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // For PCA, handle single vs multi-slot discard
        if (assignedSlots.length === 1) {
          performSlotDiscard(effectiveStaffId, sourceTeam, assignedSlots)
          resetPcaDragState()
          return
        }
        
        // If multi-slot, show slot selection for discard (PCA only)
        if (assignedSlots.length > 1) {
          setPcaDragState(prev => ({
            ...prev,
            isActive: false,
            isDraggingFromPopover: false,
            showSlotSelection: true,
            availableSlots: assignedSlots,
            selectedSlots: [],
            popoverPosition:
              discardPopoverPosition ??
              prev.popoverPosition ??
              calculatePopoverPosition({ left: 100, top: 100, width: 0, height: 0 }, 150),
            isDiscardMode: true,
          }))
          return
        }
        
        resetPcaDragState()
        return
      }
      
      const targetTeam = overId.replace('pca-', '') as Team
      const sourceTeam = pcaDragState.sourceTeam
      const selectedSlots = pcaDragState.selectedSlots
      
      // If same team - if was dragging from popover, show it again
      if (targetTeam === sourceTeam) {
        if (pcaDragState.isDraggingFromPopover) {
          // Recalculate position from drop target after scroll/snap
          // Use requestAnimationFrame to ensure DOM has updated after scroll/snap
          requestAnimationFrame(() => {
            const dropTargetElement = document.querySelector(`[data-pca-team="${targetTeam}"]`) as HTMLElement
            const dropTargetPosition = dropTargetElement 
              ? calculatePopoverPosition(dropTargetElement.getBoundingClientRect(), 150)
              : null
            setPcaDragState(prev => ({
              ...prev,
              isActive: false,
              isDraggingFromPopover: false,
              showSlotSelection: true,
              ...(dropTargetPosition && { popoverPosition: dropTargetPosition }),
            }))
          })
          return
        }
        if (pcaDragState.showSlotSelection && pcaDragState.availableSlots.length > 1) {
          // Recalculate position from drop target after scroll/snap
          requestAnimationFrame(() => {
            const dropTargetElement = document.querySelector(`[data-pca-team="${targetTeam}"]`) as HTMLElement
            const dropTargetPosition = dropTargetElement 
              ? calculatePopoverPosition(dropTargetElement.getBoundingClientRect(), 150)
              : null
            pausePcaDrag(dropTargetPosition)
          })
          return
        }
        resetPcaDragState()
        return
      }
      
      // If no slots selected but multi-slot, keep popover visible
      if (selectedSlots.length === 0) {
        if (pcaDragState.availableSlots.length > 1) {
          // Calculate position from drop target (block 2) after auto-scroll/snap
          // Use requestAnimationFrame to ensure DOM has updated after scroll/snap
          requestAnimationFrame(() => {
            const dropTargetElement = document.querySelector(`[data-pca-team="${targetTeam}"]`) as HTMLElement
            const dropTargetPosition = dropTargetElement 
              ? calculatePopoverPosition(dropTargetElement.getBoundingClientRect(), 150)
              : null
            // IMPORTANT (post-fix): show popover ONLY after drop
            setPcaDragState(prev => ({
              ...prev,
              isActive: false,
              isDraggingFromPopover: false,
              showSlotSelection: true,
              ...(dropTargetPosition && { popoverPosition: dropTargetPosition }),
            }))
          })
          return
        }
        resetPcaDragState()
        return
      }
      
      // Perform the slot transfer using the shared function
      performSlotTransfer(targetTeam)
      return
    }
    
    // Reset therapist drag state on drag end
    setTherapistDragState({
      isActive: false,
      staffId: null,
      sourceTeam: null,
    })
    
    // Handle therapist drag (existing logic)
    if (!over) {
      // Dropped outside - handle SPT slot discard or buffer therapist discard
      if (staffMember && ['RPT', 'SPT', 'APPT'].includes(staffMember.rank)) {
        const isBufferStaff = staffMember.status === 'buffer'
        const isSPT = staffMember.rank === 'SPT'
        
        // For SPT: handle slot discard (similar to floating PCA)
        if (isSPT && therapistDragState.isActive && therapistDragState.sourceTeam) {
          const currentAllocation = Object.values(therapistAllocations).flat()
            .find(a => a.staff_id === staffId)
          
          if (currentAllocation) {
            const sourceTeam = therapistDragState.sourceTeam
            const assignedSlots: number[] = []
            if (currentAllocation.slot1 === sourceTeam) assignedSlots.push(1)
            if (currentAllocation.slot2 === sourceTeam) assignedSlots.push(2)
            if (currentAllocation.slot3 === sourceTeam) assignedSlots.push(3)
            if (currentAllocation.slot4 === sourceTeam) assignedSlots.push(4)
            
            // For SPT, slot discard removes the entire allocation (like buffer therapist)
            // No need to show slot selection - just remove the allocation immediately
            performTherapistSlotDiscard(staffId, sourceTeam, assignedSlots)
            setTherapistDragState({
              isActive: false,
              staffId: null,
              sourceTeam: null,
            })
            return
          }
        }
        
        // For buffer therapist: handle whole therapist removal
        if (isBufferStaff && currentStep === 'therapist-pca') {
          // Find current team from allocations
          let currentTeam: Team | undefined
          for (const [team, allocs] of Object.entries(therapistAllocations)) {
            if (allocs.some(a => a.staff_id === staffId)) {
              currentTeam = team as Team
              break
            }
          }
          
          if (currentTeam) {
            // Remove buffer therapist from team using shared function
            removeTherapistAllocationFromTeam(staffId, currentTeam)
            
            // Update staff.team to null in database
            supabase
              .from('staff')
              .update({ team: null })
              .eq('id', staffId)
              .then(() => {
                // Update local state
                setBufferStaff(prev => prev.map(s => 
                  s.id === staffId ? { ...s, team: null } : s
                ))
              })
          }
        }
      }
      return // Dropped outside
    }
    
    // Check if dropped on a therapist block (therapist-{team})
    const overId = over.id.toString()
    if (!overId.startsWith('therapist-')) return // Not dropped on a therapist block
    
    const targetTeam = overId.replace('therapist-', '') as Team
    
    if (!staffMember) return
    
    // Allow RPT, SPT, APPT (including buffer and fixed-team) to be moved
    if (!['RPT', 'SPT', 'APPT'].includes(staffMember.rank)) return
    
    const isBufferStaff = staffMember.status === 'buffer'
    const isFixedTeamStaff = !isBufferStaff && (staffMember.rank === 'APPT' || staffMember.rank === 'RPT')
    
    // Validate: Therapist transfer is only allowed in step 2
    if (currentStep !== 'therapist-pca') {
      // Transfer not allowed - card will return to original position
      return
    }
    
    // Find current team from allocations
    let currentTeam: Team | undefined
    for (const [team, allocs] of Object.entries(therapistAllocations)) {
      if (allocs.some(a => a.staff_id === staffId)) {
        currentTeam = team as Team
        break
      }
    }
    
    // If no current team found, check staffOverrides or staff.team
    if (!currentTeam) {
      currentTeam = staffOverrides[staffId]?.team ?? staffMember.team ?? undefined
    }
    
    // If already in target team, no change needed
    if (currentTeam === targetTeam) return
    
    // Get current FTE from allocation, staffOverrides, or buffer_fte
    const currentAlloc = Object.values(therapistAllocations).flat()
      .find(a => a.staff_id === staffId)
    const currentFTE = isBufferStaff 
      ? (staffOverrides[staffId]?.fteRemaining ?? staffMember.buffer_fte ?? 1.0)
      : (staffOverrides[staffId]?.fteRemaining ?? currentAlloc?.fte_therapist ?? 1.0)
    
    // Update staffOverrides with new team
    // For fixed-team staff (APPT, RPT), this is a staff override (does NOT change staff.team property)
    // For buffer staff, also update the staff.team in the database
    setStaffOverrides(prev => ({
      ...prev,
      [staffId]: {
        ...prev[staffId],
        team: targetTeam,
        fteRemaining: currentFTE,
        leaveType: prev[staffId]?.leaveType ?? currentAlloc?.leave_type ?? null,
      }
    }))
    
    // For buffer therapist, also update the staff.team in the database
    // For fixed-team staff (APPT, RPT), do NOT change staff.team - it's only a staff override
    if (isBufferStaff) {
      supabase
        .from('staff')
        .update({ team: targetTeam })
        .eq('id', staffId)
        .then(() => {
          // Update local state
          setBufferStaff(prev => prev.map(s => 
            s.id === staffId ? { ...s, team: targetTeam } : s
          ))
        })
    }
    
    // For fixed-team staff (APPT, RPT), the FTE is carried to target team
    // The original team will lose PT-FTE/team when allocations are regenerated
    // This is handled by the therapist allocation algorithm respecting staffOverrides.team
  }

  const gridStaffContextMenuItems = useMemo(() => {
    const staffId = staffContextMenu.staffId
    const team = staffContextMenu.team
    const kind = staffContextMenu.kind
    if (!staffId || !team || !kind) return []

    const isPCA = kind === 'pca'
    const isTherapist = kind === 'therapist'

    const canLeaveEdit = currentStep === 'leave-fte'
    const canTherapistActions = currentStep === 'therapist-pca'
    const canPcaActions = currentStep === 'floating-pca'

    const leaveDisabledTooltip = 'Leave arrangement editing is only available in Step 1 (Leave & FTE).'
    const therapistDisabledTooltip =
      'Therapist slot actions are only available in Step 2 (Therapist & Non-floating PCA).'
    const pcaDisabledTooltip = 'PCA slot actions are only available in Step 3 (Floating PCA).'

    return [
      {
        key: 'leave-edit',
        label: 'Leave edit',
        icon: <Pencil className="h-4 w-4" />,
        disabled: !canLeaveEdit,
        disabledTooltip: leaveDisabledTooltip,
        onSelect: () => {
          closeStaffContextMenu()
          handleEditStaff(staffId)
        },
      },
      {
        key: 'move-slot',
        label: 'Move slot',
        icon: <Copy className="h-4 w-4" />,
        disabled: isTherapist ? !canTherapistActions : !canPcaActions,
        disabledTooltip: isTherapist ? therapistDisabledTooltip : pcaDisabledTooltip,
        onSelect: () => {
          const pos = staffContextMenu.position ?? { x: 100, y: 100 }
          closeStaffContextMenu()
          if (isPCA) {
            startPcaContextAction({ staffId, sourceTeam: team, mode: 'move', position: pos })
          } else {
            startTherapistContextAction({ staffId, sourceTeam: team, mode: 'move', position: pos })
          }
        },
      },
      {
        key: 'discard-slot',
        label: 'Discard slot',
        icon: <Trash2 className="h-4 w-4" />,
        disabled: isTherapist ? !canTherapistActions : !canPcaActions,
        disabledTooltip: isTherapist ? therapistDisabledTooltip : pcaDisabledTooltip,
        onSelect: () => {
          const pos = staffContextMenu.position ?? { x: 100, y: 100 }
          closeStaffContextMenu()
          if (isPCA) {
            startPcaContextAction({ staffId, sourceTeam: team, mode: 'discard', position: pos })
          } else {
            startTherapistContextAction({ staffId, sourceTeam: team, mode: 'discard', position: pos })
          }
        },
      },
      ...(isPCA
        ? []
        : [
            {
              key: 'split-slot',
              label: 'Split slot',
              icon: <Split className="h-4 w-4" />,
              disabled: !canTherapistActions,
              disabledTooltip: therapistDisabledTooltip,
              onSelect: () => {
                const pos = staffContextMenu.position ?? { x: 100, y: 100 }
                closeStaffContextMenu()
                startTherapistContextAction({ staffId, sourceTeam: team, mode: 'split', position: pos })
              },
            },
            {
              key: 'merge-slot',
              label: 'Merge slot',
              icon: <GitMerge className="h-4 w-4" />,
              disabled: !canTherapistActions,
              disabledTooltip: therapistDisabledTooltip,
              onSelect: () => {
                const pos = staffContextMenu.position ?? { x: 100, y: 100 }
                closeStaffContextMenu()
                startTherapistContextAction({ staffId, sourceTeam: team, mode: 'merge', position: pos })
              },
            },
          ]),
      {
        key: 'fill-color',
        label: 'Fill color',
        icon: <Highlighter className="h-4 w-4" />,
        disabled: false,
        onSelect: () => {
          const pos = staffContextMenu.position ?? { x: 100, y: 100 }
          const existing = (staffOverrides as any)?.[staffId]?.cardColorByTeam?.[team] as string | undefined
          closeStaffContextMenu()
          setColorContextAction({
            show: true,
            position: pos,
            staffId,
            team,
            selectedClassName: existing ?? null,
          })
        },
      },
    ]
  }, [
    staffContextMenu.staffId,
    staffContextMenu.team,
    staffContextMenu.kind,
    staffContextMenu.position,
    currentStep,
    staffOverrides,
    closeStaffContextMenu,
    handleEditStaff,
    startPcaContextAction,
    startTherapistContextAction,
    setColorContextAction,
  ])

  const staffPoolContextMenuItems = useMemo(() => {
    const staffId = staffPoolContextMenu.staffId
    if (!staffId) return []

    const s =
      staff.find((x) => x.id === staffId) || bufferStaff.find((x) => x.id === staffId) || inactiveStaff.find((x) => x.id === staffId)
    if (!s) return []

    const isBuffer = s.status === 'buffer'
    const isTherapistRank = ['SPT', 'APPT', 'RPT'].includes(s.rank)
    const isSPT = s.rank === 'SPT'
    const isPCA = s.rank === 'PCA'
    const isFloatingPCA = isPCA && !!s.floating
    const isNonFloatingPCA = isPCA && !s.floating

    const canLeaveEdit = currentStep === 'leave-fte'
    const canTherapistActions = currentStep === 'therapist-pca'
    const canPcaActions = currentStep === 'floating-pca'

    const leaveDisabledTooltip = 'Leave arrangement editing is only available in Step 1 (Leave & FTE).'
    const therapistDisabledTooltip =
      'Slot assignment/actions for therapists are only available in Step 2 (Therapist & Non-floating PCA).'
    const pcaDisabledTooltip = 'Slot assignment/actions for floating PCA are only available in Step 3 (Floating PCA).'

    // Infer a single team context for actions that require it (Move/Discard/Fill color).
    const inferSingleTherapistTeam = (): Team | null => {
      const byTeam = getTherapistFteByTeam(staffId)
      const teams = Object.entries(byTeam)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([t]) => t as Team)
      return teams.length === 1 ? teams[0] : null
    }
    const inferSinglePcaTeam = (): Team | null => {
      const alloc = Object.values(pcaAllocations).flat().find((a: any) => a.staff_id === staffId)
      if (!alloc) return null
      const teams = new Set<Team>()
      if (alloc.slot1) teams.add(alloc.slot1 as Team)
      if (alloc.slot2) teams.add(alloc.slot2 as Team)
      if (alloc.slot3) teams.add(alloc.slot3 as Team)
      if (alloc.slot4) teams.add(alloc.slot4 as Team)
      return teams.size === 1 ? Array.from(teams)[0] : null
    }

    const inferredTeam = isPCA ? inferSinglePcaTeam() : isTherapistRank ? inferSingleTherapistTeam() : null

    const needsTeamTooltip =
      'This action requires a single team allocation. Please use the team-grid card (per-team) instead.'

    // Compute remaining slots (floating PCA only) for Assign slot.
    const computeRemainingSlots = (): number[] => {
      const override = staffOverrides[staffId]
      const bufferFteRaw = (s as any).buffer_fte
      const bufferFte =
        typeof bufferFteRaw === 'number' ? bufferFteRaw : bufferFteRaw != null ? parseFloat(String(bufferFteRaw)) : NaN
      const capacitySlots =
        Array.isArray(override?.availableSlots) && override!.availableSlots.length > 0
          ? override!.availableSlots
          : isBuffer && Number.isFinite(bufferFte)
            ? [1, 2, 3, 4].slice(0, Math.max(0, Math.min(4, Math.round(bufferFte / 0.25))))
            : [1, 2, 3, 4]

      const assigned = new Set<number>()
      Object.values(pcaAllocations).forEach((teamAllocs: any[]) => {
        teamAllocs.forEach((a: any) => {
          if (a.staff_id !== staffId) return
          if (a.slot1) assigned.add(1)
          if (a.slot2) assigned.add(2)
          if (a.slot3) assigned.add(3)
          if (a.slot4) assigned.add(4)
        })
      })
      return capacitySlots.filter((slot) => !assigned.has(slot)).sort((a, b) => a - b)
    }

    const remainingSlots = isFloatingPCA ? computeRemainingSlots() : []

    // Compute remaining SPT FTE for Assign slot (Step 2 only).
    const computeRemainingSptFte = (): number => {
      const base =
        typeof staffOverrides[staffId]?.fteRemaining === 'number'
          ? (staffOverrides[staffId]!.fteRemaining as number)
          : ((sptBaseFteByStaffId as any)?.[staffId] ?? 0)
      const byTeam = getTherapistFteByTeam(staffId)
      const assigned = Object.values(byTeam).reduce((sum, v) => sum + (v ?? 0), 0)
      return Math.max(0, base - assigned)
    }

    const remainingSptFte = isSPT && !isBuffer ? computeRemainingSptFte() : 0

    const pos = staffPoolContextMenu.position ?? { x: 100, y: 100 }

    const items: any[] = []

    // 1) First action: Leave edit OR buffer edit
    if (isBuffer) {
      items.push({
        key: 'buffer-edit',
        label: 'Edit buffer staff',
        icon: <FilePenLine className="h-4 w-4" />,
        disabled: false,
        onSelect: () => {
          closeStaffPoolContextMenu()
          setBufferStaffEditDialog({
            open: true,
            staff: s,
            initialAvailableSlots: Array.isArray(staffOverrides[staffId]?.availableSlots)
              ? (staffOverrides[staffId]!.availableSlots as number[])
              : null,
          })
        },
      })
    } else {
      items.push({
        key: 'leave-edit',
        label: 'Leave edit',
        icon: <Pencil className="h-4 w-4" />,
        disabled: !canLeaveEdit,
        disabledTooltip: leaveDisabledTooltip,
        onSelect: () => {
          closeStaffPoolContextMenu()
          handleEditStaff(staffId)
        },
      })
    }

    // SPT smart behavior (Staff Pool only):
    // If this SPT has NO duty on the current weekday per dashboard config, show ONLY "Leave edit".
    // Hide all other actions (assign/move/split/merge/discard/fill), because there is nothing to allocate.
    if (!isBuffer && isSPT) {
      const dutyFte =
        typeof staffOverrides[staffId]?.fteRemaining === 'number'
          ? (staffOverrides[staffId]!.fteRemaining as number)
          : ((sptBaseFteByStaffId as any)?.[staffId] ?? 0)
      if (!(dutyFte > 0)) {
        return items
      }
    }

    // 2) Assign slot (staff pool only)
    const canShowAssign =
      (isFloatingPCA && !isNonFloatingPCA) || (isSPT && !isBuffer) || (isBuffer && isTherapistRank) || (isBuffer && isFloatingPCA)

    if (canShowAssign && !isNonFloatingPCA) {
      const stepOk = isFloatingPCA ? canPcaActions : canTherapistActions
      const allSlotsAssigned = isFloatingPCA && remainingSlots.length === 0
      const allSptFteAssigned = isSPT && !isBuffer && remainingSptFte <= 0
      const disabled = !stepOk || allSlotsAssigned || allSptFteAssigned

      const disabledTooltip = !stepOk
        ? isFloatingPCA
          ? pcaDisabledTooltip
          : therapistDisabledTooltip
        : allSlotsAssigned
          ? 'All slots are already assigned.'
          : allSptFteAssigned
            ? 'All available SPT FTE is already assigned. Use Move slot / Split slot to amend existing assignments.'
            : undefined

      items.push({
        key: 'assign-slot',
        label: 'Assign slot',
        icon: <PlusCircle className="h-4 w-4" />,
        disabled,
        disabledTooltip,
        onSelect: () => {
          closeStaffPoolContextMenu()
          if (disabled) return

          if (isFloatingPCA) {
            setPcaPoolAssignAction({
              show: true,
              phase: 'team',
              position: pos,
              staffId,
              staffName: s.name,
              targetTeam: null,
              availableSlots: remainingSlots,
              selectedSlots: remainingSlots.length === 1 ? remainingSlots : [],
            })
            return
          }

          if (isBuffer && isTherapistRank) {
            // Buffer therapists: assign whole staff to a team (team picker)
            setSptPoolAssignAction({
              show: true,
              position: pos,
              staffId,
              staffName: s.name,
              targetTeam: null,
              remainingFte: -1, // sentinel (buffer therapist)
            })
            return
          }

          // SPT: assign remaining weekday FTE (team picker)
          setSptPoolAssignAction({
            show: true,
            position: pos,
            staffId,
            staffName: s.name,
            targetTeam: null,
            remainingFte: remainingSptFte,
          })
        },
      })
    }

    // 3) Move/Discard/Split/Merge (reuse existing contextual actions, but only when team is unambiguous)
    const therapistActionDisabled = !canTherapistActions
    const pcaActionDisabled = !canPcaActions

    if (isPCA) {
      items.push({
        key: 'move-slot',
        label: 'Move slot',
        icon: <Copy className="h-4 w-4" />,
        disabled: pcaActionDisabled || !inferredTeam,
        disabledTooltip: pcaActionDisabled ? pcaDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startPcaContextAction({ staffId, sourceTeam: inferredTeam, mode: 'move', position: pos })
        },
      })
      items.push({
        key: 'discard-slot',
        label: 'Discard slot',
        icon: <Trash2 className="h-4 w-4" />,
        disabled: pcaActionDisabled || !inferredTeam,
        disabledTooltip: pcaActionDisabled ? pcaDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startPcaContextAction({ staffId, sourceTeam: inferredTeam, mode: 'discard', position: pos })
        },
      })
    } else if (isTherapistRank) {
      items.push({
        key: 'move-slot',
        label: 'Move slot',
        icon: <Copy className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam,
        disabledTooltip: therapistActionDisabled ? therapistDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'move', position: pos })
        },
      })
      items.push({
        key: 'discard-slot',
        label: 'Discard slot',
        icon: <Trash2 className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam,
        disabledTooltip: therapistActionDisabled ? therapistDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'discard', position: pos })
        },
      })
      items.push({
        key: 'split-slot',
        label: 'Split slot',
        icon: <Split className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam,
        disabledTooltip: therapistActionDisabled ? therapistDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'split', position: pos })
        },
      })
      items.push({
        key: 'merge-slot',
        label: 'Merge slot',
        icon: <GitMerge className="h-4 w-4" />,
        disabled: therapistActionDisabled || !inferredTeam,
        disabledTooltip: therapistActionDisabled ? therapistDisabledTooltip : !inferredTeam ? needsTeamTooltip : undefined,
        onSelect: () => {
          if (!inferredTeam) return
          closeStaffPoolContextMenu()
          startTherapistContextAction({ staffId, sourceTeam: inferredTeam, mode: 'merge', position: pos })
        },
      })
    }

    // 4) Buffer convert (before Fill color)
    if (isBuffer) {
      items.push({
        key: 'buffer-convert',
        label: 'Convert to inactive',
        icon: <UserX className="h-4 w-4" />,
        disabled: false,
        onSelect: () => {
          closeStaffPoolContextMenu()
          setBufferStaffConvertConfirm({
            show: true,
            position: pos,
            staffId,
            staffName: s.name,
          })
        },
      })
    }

    // 5) Fill color (only when a team context is unambiguous)
    items.push({
      key: 'fill-color',
      label: 'Fill color',
      icon: <Highlighter className="h-4 w-4" />,
      disabled: !inferredTeam,
      disabledTooltip: !inferredTeam ? needsTeamTooltip : undefined,
      onSelect: () => {
        if (!inferredTeam) return
        const existing = (staffOverrides as any)?.[staffId]?.cardColorByTeam?.[inferredTeam] as string | undefined
        closeStaffPoolContextMenu()
        setColorContextAction({
          show: true,
          position: pos,
          staffId,
          team: inferredTeam,
          selectedClassName: existing ?? null,
        })
      },
    })

    return items
  }, [
    staffPoolContextMenu.staffId,
    staffPoolContextMenu.position,
    staff,
    bufferStaff,
    inactiveStaff,
    currentStep,
    staffOverrides,
    pcaAllocations,
    sptBaseFteByStaffId,
    closeStaffPoolContextMenu,
    setBufferStaffEditDialog,
    handleEditStaff,
    getTherapistFteByTeam,
    startPcaContextAction,
    startTherapistContextAction,
    setPcaPoolAssignAction,
    setSptPoolAssignAction,
    setBufferStaffConvertConfirm,
    setColorContextAction,
  ])

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <ScheduleOverlays
        topLoadingVisible={topLoadingVisible}
        topLoadingProgress={topLoadingProgress}
        pcaSlotSelection={
          pcaDragState.showSlotSelection && pcaDragState.popoverPosition && pcaDragState.staffName
            ? {
                staffName: pcaDragState.staffName,
                availableSlots: pcaDragState.availableSlots,
                selectedSlots: pcaDragState.selectedSlots,
                position: pcaDragState.popoverPosition,
                isDiscardMode: pcaDragState.isDiscardMode,
              }
            : null
        }
        onSlotToggle={handleSlotToggle}
        onCloseSlotSelection={handleCloseSlotSelection}
        onStartDragFromSlotPopover={handleStartDragFromPopover}
      />

      {/* Schedule-grid Staff Card Context Menu (pencil click) */}
      <StaffContextMenu
        open={staffContextMenu.show}
        position={staffContextMenu.position}
        anchor={staffContextMenu.anchor}
        onClose={closeStaffContextMenu}
        items={gridStaffContextMenuItems}
      />

      {/* Staff Pool Staff Card Context Menu (pencil click / right click) */}
      <StaffContextMenu
        open={staffPoolContextMenu.show}
        position={staffPoolContextMenu.position}
        anchor={staffPoolContextMenu.anchor}
        onClose={closeStaffPoolContextMenu}
        items={staffPoolContextMenuItems}
      />

      {/* Staff Pool: Assign slot (floating PCA) */}
      {pcaPoolAssignAction.show &&
        pcaPoolAssignAction.position &&
        pcaPoolAssignAction.staffId &&
        pcaPoolAssignAction.staffName && (
          <>
            {pcaPoolAssignAction.phase === 'team' ? (
              <TeamPickerPopover
                title="Assign slot"
                selectedTeam={pcaPoolAssignAction.targetTeam}
                onSelectTeam={(t) => setPcaPoolAssignAction(prev => ({ ...prev, targetTeam: t }))}
                onClose={closePcaPoolAssignAction}
                confirmDisabled={!pcaPoolAssignAction.targetTeam}
                onConfirm={() => {
                  const targetTeam = pcaPoolAssignAction.targetTeam
                  if (!targetTeam) return
                  if (pcaPoolAssignAction.availableSlots.length === 1) {
                    performPcaSlotAssignFromPool(targetTeam, {
                      staffId: pcaPoolAssignAction.staffId!,
                      selectedSlots: pcaPoolAssignAction.availableSlots,
                    })
                    closePcaPoolAssignAction()
                    return
                  }
                  setPcaPoolAssignAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                position={pcaPoolAssignAction.position}
                hint="Choose a target team, then confirm."
                pageIndicator={pcaPoolAssignAction.availableSlots.length > 1 ? { current: 1, total: 2 } : undefined}
                onNextPage={() => {
                  const targetTeam = pcaPoolAssignAction.targetTeam
                  if (!targetTeam) return
                  if (pcaPoolAssignAction.availableSlots.length === 1) return
                  setPcaPoolAssignAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                onPrevPage={() => {}}
                prevDisabled={true}
                nextDisabled={!pcaPoolAssignAction.targetTeam || pcaPoolAssignAction.availableSlots.length === 1}
              />
            ) : null}

            {pcaPoolAssignAction.phase === 'slots' && pcaPoolAssignAction.targetTeam ? (
              <SlotSelectionPopover
                staffName={pcaPoolAssignAction.staffName}
                availableSlots={pcaPoolAssignAction.availableSlots}
                selectedSlots={pcaPoolAssignAction.selectedSlots}
                onSlotToggle={(slot) =>
                  setPcaPoolAssignAction(prev => {
                    const selected = prev.selectedSlots.includes(slot)
                      ? prev.selectedSlots.filter(s => s !== slot)
                      : [...prev.selectedSlots, slot].sort((a, b) => a - b)
                    return { ...prev, selectedSlots: selected }
                  })
                }
                onClose={closePcaPoolAssignAction}
                onStartDrag={() => {}}
                position={pcaPoolAssignAction.position}
                mode="confirm"
                actionLabel="assign"
                onConfirm={() => {
                  const targetTeam = pcaPoolAssignAction.targetTeam
                  if (!targetTeam) return
                  if (pcaPoolAssignAction.selectedSlots.length === 0) return
                  performPcaSlotAssignFromPool(targetTeam, {
                    staffId: pcaPoolAssignAction.staffId!,
                    selectedSlots: pcaPoolAssignAction.selectedSlots,
                  })
                  closePcaPoolAssignAction()
                }}
                confirmDisabled={pcaPoolAssignAction.selectedSlots.length === 0}
              />
            ) : null}
          </>
        )}

      {/* Staff Pool: Assign slot (SPT remaining FTE / buffer therapist team assignment) */}
      {sptPoolAssignAction.show &&
        sptPoolAssignAction.position &&
        sptPoolAssignAction.staffId &&
        sptPoolAssignAction.staffName && (
          <TeamPickerPopover
            title="Assign slot"
            selectedTeam={sptPoolAssignAction.targetTeam}
            onSelectTeam={(t) => setSptPoolAssignAction(prev => ({ ...prev, targetTeam: t }))}
            onClose={closeSptPoolAssignAction}
            confirmDisabled={!sptPoolAssignAction.targetTeam}
            onConfirm={() => {
              const staffId = sptPoolAssignAction.staffId!
              const targetTeam = sptPoolAssignAction.targetTeam
              if (!targetTeam) return

              const staffMember =
                staff.find(x => x.id === staffId) ||
                bufferStaff.find(x => x.id === staffId) ||
                null
              if (!staffMember) return

              // Buffer therapist: assign whole staff to team (override.team + DB update)
              if (staffMember.status === 'buffer' && ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)) {
                const fte =
                  typeof staffOverrides[staffId]?.fteRemaining === 'number'
                    ? (staffOverrides[staffId]!.fteRemaining as number)
                    : typeof (staffMember as any).buffer_fte === 'number'
                      ? ((staffMember as any).buffer_fte as number)
                      : 1.0

                setStaffOverrides(prev => ({
                  ...prev,
                  [staffId]: {
                    ...prev[staffId],
                    team: targetTeam,
                    fteRemaining: fte,
                    leaveType: prev[staffId]?.leaveType ?? null,
                  },
                }))

                supabase
                  .from('staff')
                  .update({ team: targetTeam })
                  .eq('id', staffId)
                  .then(() => {
                    setBufferStaff(prev => prev.map(s => (s.id === staffId ? { ...s, team: targetTeam } : s)))
                  })

                closeSptPoolAssignAction()
                return
              }

              // SPT: assign remaining weekday FTE to team (ad hoc override)
              const remaining = sptPoolAssignAction.remainingFte
              if (remaining <= 0) {
                closeSptPoolAssignAction()
                return
              }

              const currentMap = getTherapistFteByTeam(staffId)
              const nextMap: Partial<Record<Team, number>> = { ...currentMap }
              nextMap[targetTeam] = (nextMap[targetTeam] ?? 0) + remaining
              const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

              setStaffOverrides(prev => {
                const existing = prev[staffId]
                const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                return {
                  ...prev,
                  [staffId]: {
                    ...(existing ?? { leaveType, fteRemaining: total }),
                    leaveType,
                    fteRemaining: total,
                    therapistTeamFTEByTeam: nextMap,
                    therapistTeamHalfDayByTeam: undefined,
                    therapistTeamHalfDayUiByTeam: undefined,
                    therapistNoAllocation: false,
                    team: undefined,
                  },
                }
              })

              closeSptPoolAssignAction()
            }}
            position={sptPoolAssignAction.position}
            hint="Choose a target team, then confirm."
          />
        )}

      {/* Staff Pool: Convert buffer staff to inactive (confirm) */}
      {bufferStaffConvertConfirm.show &&
        bufferStaffConvertConfirm.position &&
        bufferStaffConvertConfirm.staffId && (
          <ConfirmPopover
            title="Convert to inactive"
            description={
              bufferStaffConvertConfirm.staffName
                ? `Convert "${bufferStaffConvertConfirm.staffName}" to inactive staff?`
                : 'Convert to inactive staff?'
            }
            onClose={() =>
              setBufferStaffConvertConfirm({ show: false, position: null, staffId: null, staffName: null })
            }
            onConfirm={async () => {
              const id = bufferStaffConvertConfirm.staffId
              if (!id) return
              const { error } = await supabase
                .from('staff')
                .update({ status: 'inactive', team: null })
                .eq('id', id)

              if (error) {
                showActionToast('Failed to convert to inactive. Please try again.', 'error')
              } else {
                showActionToast('Converted to inactive.', 'success')
                loadStaff()
              }

              setBufferStaffConvertConfirm({ show: false, position: null, staffId: null, staffName: null })
            }}
            position={bufferStaffConvertConfirm.position}
          />
        )}

      {/* Staff Pool: Edit buffer staff dialog */}
      {bufferStaffEditDialog.open && (
        <BufferStaffCreateDialog
          open={bufferStaffEditDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setBufferStaffEditDialog({ open: false, staff: null, initialAvailableSlots: null })
            }
          }}
          onSave={() => {
            setBufferStaffEditDialog({ open: false, staff: null, initialAvailableSlots: null })
            loadStaff()
          }}
          specialPrograms={specialPrograms}
          staffToEdit={bufferStaffEditDialog.staff}
          initialAvailableSlots={bufferStaffEditDialog.initialAvailableSlots}
        />
      )}

      {/* PCA contextual action popovers (Move/Discard) */}
      {pcaContextAction.show &&
        pcaContextAction.position &&
        pcaContextAction.staffId &&
        pcaContextAction.sourceTeam &&
        pcaContextAction.staffName && (
          <>
            {pcaContextAction.phase === 'team' && pcaContextAction.mode === 'move' ? (
              <TeamPickerPopover
                title="Move slot"
                selectedTeam={pcaContextAction.targetTeam}
                onSelectTeam={(t) => setPcaContextAction(prev => ({ ...prev, targetTeam: t }))}
                onClose={closePcaContextAction}
                confirmDisabled={
                  !pcaContextAction.targetTeam ||
                  pcaContextAction.targetTeam === pcaContextAction.sourceTeam
                }
                onConfirm={() => {
                  const targetTeam = pcaContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === pcaContextAction.sourceTeam) return

                  // Single-slot: confirm immediately; Multi-slot: next page = slot picker
                  if (pcaContextAction.availableSlots.length === 1) {
                    performSlotTransfer(targetTeam, {
                      staffId: pcaContextAction.staffId!,
                      sourceTeam: pcaContextAction.sourceTeam!,
                      selectedSlots: pcaContextAction.availableSlots,
                      closeSlotPopover: false,
                    })
                    closePcaContextAction()
                    return
                  }

                  setPcaContextAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                position={pcaContextAction.position}
                hint="Choose a target team, then confirm."
                pageIndicator={
                  pcaContextAction.availableSlots.length > 1 ? { current: 1, total: 2 } : undefined
                }
                onNextPage={() => {
                  // Next = same as confirm on page 1
                  const targetTeam = pcaContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === pcaContextAction.sourceTeam) return
                  if (pcaContextAction.availableSlots.length === 1) return
                  setPcaContextAction(prev => ({ ...prev, phase: 'slots' }))
                }}
                onPrevPage={() => {}}
                prevDisabled={true}
                nextDisabled={
                  !pcaContextAction.targetTeam ||
                  pcaContextAction.targetTeam === pcaContextAction.sourceTeam ||
                  pcaContextAction.availableSlots.length === 1
                }
              />
            ) : null}

            {pcaContextAction.phase === 'slots' ? (
              <SlotSelectionPopover
                staffName={pcaContextAction.staffName}
                availableSlots={pcaContextAction.availableSlots}
                selectedSlots={pcaContextAction.selectedSlots}
                onSlotToggle={handlePcaContextSlotToggle}
                onClose={closePcaContextAction}
                onStartDrag={() => {
                  // confirm-mode; no dragging in this flow
                }}
                position={pcaContextAction.position}
                isDiscardMode={pcaContextAction.mode === 'discard'}
                mode="confirm"
                onConfirm={() => {
                  if (!pcaContextAction.staffId || !pcaContextAction.sourceTeam) return
                  if (pcaContextAction.selectedSlots.length === 0) return

                  if (pcaContextAction.mode === 'discard') {
                    performSlotDiscard(pcaContextAction.staffId, pcaContextAction.sourceTeam, pcaContextAction.selectedSlots)
                    closePcaContextAction()
                    return
                  }

                  const targetTeam = pcaContextAction.targetTeam
                  if (!targetTeam) return
                  performSlotTransfer(targetTeam, {
                    staffId: pcaContextAction.staffId,
                    sourceTeam: pcaContextAction.sourceTeam,
                    selectedSlots: pcaContextAction.selectedSlots,
                    closeSlotPopover: false,
                  })
                  closePcaContextAction()
                }}
              />
            ) : null}
          </>
        )}

      {/* Therapist contextual action popovers (Move/Discard/Split/Merge) */}
      {therapistContextAction.show &&
        therapistContextAction.position &&
        therapistContextAction.staffId &&
        therapistContextAction.sourceTeam && (
          <>
            {/* Move (team picker) */}
            {therapistContextAction.mode === 'move' && therapistContextAction.phase === 'team' ? (
              <TeamPickerPopover
                title="Move slot"
                selectedTeam={therapistContextAction.targetTeam}
                onSelectTeam={(t) => setTherapistContextAction(prev => ({ ...prev, targetTeam: t }))}
                onClose={closeTherapistContextAction}
                confirmDisabled={
                  !therapistContextAction.targetTeam ||
                  therapistContextAction.targetTeam === therapistContextAction.sourceTeam
                }
                onConfirm={() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const targetTeam = therapistContextAction.targetTeam
                  if (!targetTeam) return
                  if (targetTeam === sourceTeam) return

                  const currentMap = getTherapistFteByTeam(staffId)
                  const fteToMove = currentMap[sourceTeam] ?? 0
                  if (fteToMove <= 0) {
                    showActionToast('No FTE found to move for this staff card.', 'warning')
                    closeTherapistContextAction()
                    return
                  }

                  const nextMap: Partial<Record<Team, number>> = { ...currentMap }
                  delete nextMap[sourceTeam]
                  nextMap[targetTeam] = (nextMap[targetTeam] ?? 0) + fteToMove
                  const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

                  setStaffOverrides(prev => {
                    const existing = prev[staffId]
                    const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                    return {
                      ...prev,
                      [staffId]: {
                        ...(existing ?? { leaveType, fteRemaining: total }),
                        leaveType,
                        fteRemaining: total,
                        therapistTeamFTEByTeam: nextMap,
                        therapistTeamHalfDayByTeam: undefined,
                        therapistTeamHalfDayUiByTeam: undefined,
                        therapistNoAllocation: false,
                        team: undefined,
                      },
                    }
                  })

                  closeTherapistContextAction()
                }}
                position={therapistContextAction.position}
                hint="Choose a target team, then confirm."
              />
            ) : null}

            {/* Discard (confirm) */}
            {therapistContextAction.mode === 'discard' && therapistContextAction.phase === 'confirmDiscard' ? (
              <ConfirmPopover
                title="Discard slot"
                description="This will remove this therapist allocation from the selected team (ad hoc override)."
                onClose={closeTherapistContextAction}
                onConfirm={() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const currentMap = getTherapistFteByTeam(staffId)
                  const nextMap: Partial<Record<Team, number>> = { ...currentMap }
                  delete nextMap[sourceTeam]
                  const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

                  setStaffOverrides(prev => {
                    const existing = prev[staffId]
                    const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                    const hasAnyAllocation = Object.values(nextMap).some(v => typeof v === 'number' && v > 0)
                    return {
                      ...prev,
                      [staffId]: {
                        ...(existing ?? { leaveType, fteRemaining: total }),
                        leaveType,
                        fteRemaining: total,
                        therapistTeamFTEByTeam: nextMap,
                        therapistTeamHalfDayByTeam: undefined,
                        therapistTeamHalfDayUiByTeam: undefined,
                        therapistNoAllocation: !hasAnyAllocation,
                        team: undefined,
                      },
                    }
                  })

                  closeTherapistContextAction()
                }}
                position={therapistContextAction.position}
              />
            ) : null}

            {/* Split: page 1 team picker */}
            {therapistContextAction.mode === 'split' && therapistContextAction.phase === 'team' ? (
              <TeamPickerPopover
                title="Split slot"
                selectedTeam={therapistContextAction.targetTeam}
                onSelectTeam={(t) => setTherapistContextAction(prev => ({ ...prev, targetTeam: t }))}
                onClose={closeTherapistContextAction}
                confirmDisabled={
                  !therapistContextAction.targetTeam ||
                  therapistContextAction.targetTeam === therapistContextAction.sourceTeam
                }
                onConfirm={() => {
                  if (!therapistContextAction.targetTeam) return
                  setTherapistContextAction(prev => ({ ...prev, phase: 'splitFte' }))
                }}
                position={therapistContextAction.position}
                hint="Pick the destination team for the moved portion."
                pageIndicator={{ current: 1, total: 2 }}
                onNextPage={() => {
                  if (!therapistContextAction.targetTeam) return
                  if (therapistContextAction.targetTeam === therapistContextAction.sourceTeam) return
                  setTherapistContextAction(prev => ({ ...prev, phase: 'splitFte' }))
                }}
                onPrevPage={() => {}}
                prevDisabled={true}
                nextDisabled={
                  !therapistContextAction.targetTeam ||
                  therapistContextAction.targetTeam === therapistContextAction.sourceTeam
                }
              />
            ) : null}

            {/* Split: page 2 FTE input */}
            {therapistContextAction.mode === 'split' && therapistContextAction.phase === 'splitFte' ? (
              <div
                className="absolute z-[10003] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[240px]"
                style={{
                  left: therapistContextAction.position.x,
                  top: therapistContextAction.position.y,
                  pointerEvents: 'auto',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTherapistContextAction()
                  }}
                  className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 pr-4">
                  Split slot
                </div>
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Enter the moved portion (multiples of 0.25). The remaining portion will stay in the current team.
                </div>

                {(() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const targetTeam = therapistContextAction.targetTeam
                  const currentMap = getTherapistFteByTeam(staffId)
                  const currentTeams = Object.entries(currentMap).filter(([, v]) => (v ?? 0) > 0)
                  const sourceFte = currentMap[sourceTeam] ?? 0
                  const hasExistingMultiTeam = currentTeams.length > 1

                  const isQuarterMultiple = (n: number) => {
                    const scaled = Math.round(n * 4)
                    return Math.abs(n * 4 - scaled) < 1e-6
                  }
                  const isSourceQuarterMultiple = isQuarterMultiple(sourceFte)

                  const inputMode = therapistContextAction.splitInputMode ?? 'moved'
                  const inputValue = therapistContextAction.movedFteQuarter ?? 0

                  const moved = inputMode === 'moved' ? inputValue : Math.max(0, sourceFte - inputValue)
                  const stay = inputMode === 'moved' ? Math.max(0, sourceFte - inputValue) : inputValue

                  const movedIsQuarter = isQuarterMultiple(moved)
                  const stayIsQuarter = isQuarterMultiple(stay)

                  // Validation rules:
                  // - Both portions must be >= 0.25
                  // - Total must equal sourceFte (up to float tolerance)
                  // - If sourceFte is a quarter multiple: require BOTH to be quarter multiples.
                  // - Else: require at least ONE portion to be a quarter multiple (user can choose which via inputMode).
                  const totalOk = Math.abs((moved + stay) - sourceFte) < 1e-6
                  const quarterOk = isSourceQuarterMultiple ? (movedIsQuarter && stayIsQuarter) : (movedIsQuarter || stayIsQuarter)

                  const staffMember = staff.find(s => s.id === staffId) || bufferStaff.find(s => s.id === staffId)
                  const isSPT = staffMember?.rank === 'SPT'
                  const isSeventyFiveTotal = Math.abs(sourceFte - 0.75) < 0.01
                  const isSeventyFiveSplit =
                    isSeventyFiveTotal &&
                    ((Math.abs(moved - 0.5) < 0.01 && Math.abs(stay - 0.25) < 0.01) ||
                      (Math.abs(moved - 0.25) < 0.01 && Math.abs(stay - 0.5) < 0.01))

                  const movedHalfDayChoice = therapistContextAction.splitMovedHalfDayChoice ?? 'AUTO'
                  const stayHalfDayChoice = therapistContextAction.splitStayHalfDayChoice ?? 'AUTO'
                  const canHalfDayTag =
                    !!isSPT && isSeventyFiveSplit && !!sptWeekdayByStaffId?.[staffId]?.hasAM && !!sptWeekdayByStaffId?.[staffId]?.hasPM
                  const halfDayConflict =
                    canHalfDayTag &&
                    movedHalfDayChoice !== 'AUTO' &&
                    movedHalfDayChoice !== 'UNSPECIFIED' &&
                    stayHalfDayChoice !== 'AUTO' &&
                    stayHalfDayChoice !== 'UNSPECIFIED' &&
                    movedHalfDayChoice === stayHalfDayChoice

                  const canConfirm =
                    !!targetTeam &&
                    !hasExistingMultiTeam &&
                    Number.isFinite(inputValue) &&
                    moved >= 0.25 &&
                    stay >= 0.25 &&
                    totalOk &&
                    quarterOk &&
                    !halfDayConflict

                  return (
                    <>
                      {hasExistingMultiTeam ? (
                        <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">
                          Split is currently only supported when this therapist has a single team allocation.
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Current team FTE: {sourceFte.toFixed(2)}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[10px] text-slate-600 dark:text-slate-300">
                                {inputMode === 'moved'
                                  ? `Moved portion (to ${targetTeam ?? '—'})`
                                  : `Stay-in portion (in ${sourceTeam})`}
                              </label>
                              <button
                                type="button"
                                className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTherapistContextAction(prev => ({
                                    ...prev,
                                    splitInputMode: (prev.splitInputMode ?? 'moved') === 'moved' ? 'stay' : 'moved',
                                  }))
                                }}
                              >
                                Swap input
                              </button>
                            </div>
                            <Input
                              type="number"
                              step={0.25}
                              min={0.25}
                              max={Math.max(0.25, sourceFte - 0.25)}
                              value={therapistContextAction.movedFteQuarter ?? ''}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                setTherapistContextAction(prev => ({
                                  ...prev,
                                  movedFteQuarter: Number.isFinite(v) ? v : null,
                                }))
                              }}
                              className="h-8 text-xs"
                            />
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              Move to {targetTeam ?? '—'}: {moved.toFixed(2)}{' '}
                              {(!isSourceQuarterMultiple && movedIsQuarter) || (isSourceQuarterMultiple && movedIsQuarter) ? '' : ''}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              Stays in {sourceTeam}: {stay.toFixed(2)}
                            </div>
                            {canHalfDayTag && (
                              <div className="mt-2 space-y-1">
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                  Half-day tag (0.75 split only): <span className="font-semibold">Auto</span> resolves AM/PM from weekday slot config.{' '}
                                  <span className="font-semibold">Unspecified</span> hides the label but still resolves internally (Auto).
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] text-slate-600 dark:text-slate-300">
                                      Move to {targetTeam ?? '—'}
                                    </div>
                                    <div className="inline-flex rounded border border-input overflow-hidden">
                                      {(['AUTO', 'AM', 'PM', 'UNSPECIFIED'] as const).map(opt => (
                                        <button
                                          key={opt}
                                          type="button"
                                          className={cn(
                                            'px-2 py-1 text-[10px] font-medium',
                                            (therapistContextAction.splitMovedHalfDayChoice ?? 'AUTO') === opt
                                              ? 'bg-slate-700 text-white'
                                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setTherapistContextAction(prev => ({ ...prev, splitMovedHalfDayChoice: opt }))
                                          }}
                                        >
                                          {opt === 'UNSPECIFIED' ? 'UNSP' : opt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] text-slate-600 dark:text-slate-300">
                                      Stays in {sourceTeam}
                                    </div>
                                    <div className="inline-flex rounded border border-input overflow-hidden">
                                      {(['AUTO', 'AM', 'PM', 'UNSPECIFIED'] as const).map(opt => (
                                        <button
                                          key={opt}
                                          type="button"
                                          className={cn(
                                            'px-2 py-1 text-[10px] font-medium',
                                            (therapistContextAction.splitStayHalfDayChoice ?? 'AUTO') === opt
                                              ? 'bg-slate-700 text-white'
                                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setTherapistContextAction(prev => ({ ...prev, splitStayHalfDayChoice: opt }))
                                          }}
                                        >
                                          {opt === 'UNSPECIFIED' ? 'UNSP' : opt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                {halfDayConflict && (
                                  <div className="text-[10px] text-amber-700 dark:text-amber-300">
                                    Half-day tags cannot be the same for both portions.
                                  </div>
                                )}
                              </div>
                            )}
                            {!quarterOk && (
                              <div className="text-[10px] text-amber-700 dark:text-amber-300">
                                For non-0.25-multiple totals, ensure either the moved portion or the stay-in portion is a multiple of 0.25 (use “Swap input”).
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tooltip content="Previous" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                              onClick={(e) => {
                                e.stopPropagation()
                                setTherapistContextAction(prev => ({ ...prev, phase: 'team' }))
                              }}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <div className="text-sm text-slate-400 dark:text-slate-500 leading-none select-none">
                            • •
                          </div>
                          <Tooltip content="Next" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className="p-1 rounded opacity-40 cursor-not-allowed text-slate-600 dark:text-slate-300"
                              disabled
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Tooltip content="Cancel" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                              onClick={(e) => {
                                e.stopPropagation()
                                closeTherapistContextAction()
                              }}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Confirm" side="top" zIndex={120000}>
                            <button
                              type="button"
                              className={cn(
                                'p-1 rounded text-amber-700 dark:text-amber-300',
                                canConfirm ? 'hover:bg-amber-100 dark:hover:bg-amber-900/40' : 'opacity-50 cursor-not-allowed'
                              )}
                              disabled={!canConfirm}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!canConfirm || !targetTeam) return

                                const nextMap: Partial<Record<Team, number>> = {
                                  [sourceTeam]: stay,
                                  [targetTeam]: moved,
                                }
                                const total = stay + moved

                                // Optional half-day tagging for 0.75 split SPT (for display + validation).
                                let halfDayByTeam: Partial<Record<Team, 'AM' | 'PM'>> | undefined = undefined
                                let halfDayUiByTeam:
                                  | Partial<Record<Team, 'AUTO' | 'AM' | 'PM' | 'UNSPECIFIED'>>
                                  | undefined = undefined

                                if (canHalfDayTag) {
                                  const cfg = sptWeekdayByStaffId?.[staffId]
                                  const computeEff = (slots: number[], mode: 'AND' | 'OR') => {
                                    if (slots.length === 0) return 0
                                    if (mode === 'OR' && slots.length > 1) return 1
                                    return slots.length
                                  }
                                  const resolveAutoForPortion = (portionFte: number): 'AM' | 'PM' => {
                                    if (!cfg) return portionFte >= 0.5 ? 'AM' : 'PM'
                                    const amSlots = (cfg.slots || []).filter(s => s === 1 || s === 2)
                                    const pmSlots = (cfg.slots || []).filter(s => s === 3 || s === 4)
                                    const amEff = computeEff(amSlots, (cfg.slotModes?.am ?? 'AND') as any)
                                    const pmEff = computeEff(pmSlots, (cfg.slotModes?.pm ?? 'AND') as any)
                                    if (amEff === 0 && pmEff > 0) return 'PM'
                                    if (pmEff === 0 && amEff > 0) return 'AM'
                                    if (portionFte >= 0.5) {
                                      return amEff >= pmEff ? 'AM' : 'PM'
                                    }
                                    return amEff <= pmEff ? 'AM' : 'PM'
                                  }

                                  const movedUi = movedHalfDayChoice
                                  const stayUi = stayHalfDayChoice

                                  const movedResolved: 'AM' | 'PM' =
                                    movedUi === 'AM'
                                      ? 'AM'
                                      : movedUi === 'PM'
                                        ? 'PM'
                                        : resolveAutoForPortion(moved)
                                  const stayResolved: 'AM' | 'PM' =
                                    stayUi === 'AM'
                                      ? 'AM'
                                      : stayUi === 'PM'
                                        ? 'PM'
                                        : (movedResolved === 'AM' ? 'PM' : 'AM')

                                  halfDayByTeam = {
                                    [sourceTeam]: stayResolved,
                                    [targetTeam]: movedResolved,
                                  }
                                  halfDayUiByTeam = {
                                    [sourceTeam]: stayUi,
                                    [targetTeam]: movedUi,
                                  }
                                }

                                setStaffOverrides(prev => {
                                  const existing = prev[staffId]
                                  const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                                  return {
                                    ...prev,
                                    [staffId]: {
                                      ...(existing ?? { leaveType, fteRemaining: total }),
                                      leaveType,
                                      fteRemaining: total,
                                      therapistTeamFTEByTeam: nextMap,
                                      therapistTeamHalfDayByTeam: halfDayByTeam,
                                      therapistTeamHalfDayUiByTeam: halfDayUiByTeam,
                                      therapistNoAllocation: false,
                                      team: undefined,
                                    },
                                  }
                                })

                                closeTherapistContextAction()
                              }}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : null}

            {/* Merge: select which team allocations to merge into current team */}
            {therapistContextAction.mode === 'merge' && therapistContextAction.phase === 'mergeSelect' ? (
              <div
                className="absolute z-[10003] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[260px]"
                style={{
                  left: therapistContextAction.position.x,
                  top: therapistContextAction.position.y,
                  pointerEvents: 'auto',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTherapistContextAction()
                  }}
                  className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 pr-4">
                  Merge slot
                </div>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    {therapistContextAction.mergeInputMode === 'intoSelected'
                      ? 'Swap mode: pick exactly 1 destination team to merge into.'
                      : `Select team allocations to merge into ${therapistContextAction.sourceTeam}.`}
                  </div>
                  <button
                    type="button"
                    className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTherapistContextAction(prev => ({
                        ...prev,
                        mergeInputMode: (prev.mergeInputMode ?? 'intoSource') === 'intoSource' ? 'intoSelected' : 'intoSource',
                        // clear selection when swapping direction to avoid ambiguity
                        mergeTeams: [],
                      }))
                    }}
                  >
                    Swap
                  </button>
                </div>

                {(() => {
                  const staffId = therapistContextAction.staffId!
                  const sourceTeam = therapistContextAction.sourceTeam!
                  const currentMap = getTherapistFteByTeam(staffId)
                  const candidates = Object.entries(currentMap)
                    .filter(([t, v]) => t !== sourceTeam && (v ?? 0) > 0)
                    .map(([t]) => t as Team)

                  const inputMode = therapistContextAction.mergeInputMode ?? 'intoSource'
                  const confirmDisabled =
                    inputMode === 'intoSelected'
                      ? therapistContextAction.mergeTeams.length !== 1
                      : therapistContextAction.mergeTeams.length === 0

                  return (
                    <>
                      {candidates.length === 0 ? (
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                          No other team allocations found for this therapist.
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                          {candidates.map(t => (
                            <div key={t} className="flex items-center gap-2">
                              <Checkbox
                                checked={therapistContextAction.mergeTeams.includes(t)}
                                onCheckedChange={(checked) => {
                                  setTherapistContextAction(prev => ({
                                    ...prev,
                                    mergeTeams:
                                      (prev.mergeInputMode ?? 'intoSource') === 'intoSelected'
                                        ? (checked ? [t] : [])
                                        : (checked
                                            ? Array.from(new Set([...prev.mergeTeams, t]))
                                            : prev.mergeTeams.filter(x => x !== t)),
                                  }))
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                }}
                              />
                              <div className="text-xs text-slate-700 dark:text-slate-200">{t}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {inputMode === 'intoSelected' && (
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          Destination team: {therapistContextAction.mergeTeams[0] ?? '—'}
                        </div>
                      )}

                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-end gap-1.5">
                        <Tooltip content="Cancel" side="top" zIndex={120000}>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            onClick={(e) => {
                              e.stopPropagation()
                              closeTherapistContextAction()
                            }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Confirm" side="top" zIndex={120000}>
                          <button
                            type="button"
                            className={cn(
                              'p-1 rounded text-amber-700 dark:text-amber-300',
                              confirmDisabled
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            )}
                            disabled={confirmDisabled}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirmDisabled) return

                              const nextMap: Partial<Record<Team, number>> = { ...currentMap }
                              const mode = therapistContextAction.mergeInputMode ?? 'intoSource'

                              if (mode === 'intoSelected') {
                                const destTeam = therapistContextAction.mergeTeams[0]
                                if (!destTeam) return
                                // Merge sourceTeam into destTeam (swap direction)
                                const sourceFte = nextMap[sourceTeam] ?? 0
                                nextMap[destTeam] = (nextMap[destTeam] ?? 0) + sourceFte
                                delete nextMap[sourceTeam]
                              } else {
                                // Default: merge selected teams into sourceTeam
                                let added = 0
                                for (const t of therapistContextAction.mergeTeams) {
                                  added += nextMap[t] ?? 0
                                  delete nextMap[t]
                                }
                                nextMap[sourceTeam] = (nextMap[sourceTeam] ?? 0) + added
                              }

                              const total = Object.values(nextMap).reduce((sum, v) => sum + (v ?? 0), 0)

                              setStaffOverrides(prev => {
                                const existing = prev[staffId]
                                const leaveType = existing?.leaveType ?? getTherapistLeaveType(staffId)
                                return {
                                  ...prev,
                                  [staffId]: {
                                    ...(existing ?? { leaveType, fteRemaining: total }),
                                    leaveType,
                                    fteRemaining: total,
                                    therapistTeamFTEByTeam: nextMap,
                                        therapistTeamHalfDayByTeam: undefined,
                                        therapistTeamHalfDayUiByTeam: undefined,
                                    therapistNoAllocation: false,
                                    team: undefined,
                                  },
                                }
                              })

                              closeTherapistContextAction()
                            }}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : null}
          </>
        )}

      {/* Staff card Fill color popover (any step) */}
      {colorContextAction.show &&
        colorContextAction.position &&
        colorContextAction.staffId &&
        colorContextAction.team && (
          <div
            className="absolute z-[10004] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[260px]"
            style={{
              left: colorContextAction.position.x,
              top: colorContextAction.position.y,
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeColorContextAction()
              }}
              className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 pr-4">
              Fill color
            </div>
            <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Choose a color for this staff card (schedule override).
            </div>

            {(() => {
              const swatches: Array<{ label: string; className: string | null }> = [
                { label: 'Yellow', className: 'bg-yellow-200 dark:bg-yellow-900/30' },
                { label: 'Orange', className: 'bg-orange-200 dark:bg-orange-900/30' },
                { label: 'Red', className: 'bg-red-200 dark:bg-red-900/30' },
                { label: 'Green', className: 'bg-green-200 dark:bg-green-900/30' },
                { label: 'Teal', className: 'bg-teal-200 dark:bg-teal-900/30' },
                { label: 'Blue', className: 'bg-blue-200 dark:bg-blue-900/30' },
                { label: 'Purple', className: 'bg-violet-200 dark:bg-violet-900/30' },
                { label: 'Pink', className: 'bg-pink-200 dark:bg-pink-900/30' },
                { label: 'Gray', className: 'bg-gray-200 dark:bg-slate-700/60' },
                { label: 'None', className: null },
              ]

              const selected = colorContextAction.selectedClassName

              return (
                <>
                  <div className="mt-2 grid grid-cols-5 gap-1">
                    {swatches.map((s) => {
                      const isSelected = (s.className ?? null) === (selected ?? null)
                      return (
                        <Tooltip key={s.label} content={s.label} side="top" zIndex={120000}>
                          <button
                            type="button"
                            className={cn(
                              'h-8 w-10 rounded border',
                              s.className ?? 'bg-background border-input',
                              isSelected ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background' : 'border-slate-200 dark:border-slate-600'
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              setColorContextAction(prev => ({
                                ...prev,
                                selectedClassName: s.className,
                              }))
                            }}
                          />
                        </Tooltip>
                      )
                    })}
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-end gap-1.5">
                    <Tooltip content="Cancel" side="top" zIndex={120000}>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeColorContextAction()
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Confirm" side="top" zIndex={120000}>
                      <button
                        type="button"
                        className="p-1 rounded text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        onClick={(e) => {
                          e.stopPropagation()
                          const staffId = colorContextAction.staffId!
                          const team = colorContextAction.team!
                          const selectedClassName = colorContextAction.selectedClassName

                          setStaffOverrides(prev => {
                            const current = prev[staffId]
                            // Ensure required base fields exist if we are creating a new entry.
                            // IMPORTANT: creating a staffOverrides entry must NOT accidentally change leave/FTE.
                            const staffMember =
                              staff.find(s => s.id === staffId) || bufferStaff.find(s => s.id === staffId)

                            const baseLeaveType: LeaveType | null =
                              typeof current?.leaveType !== 'undefined'
                                ? current.leaveType
                                : (staffMember?.rank === 'PCA'
                                    ? (Object.values(pcaAllocations).flat().find(a => a.staff_id === staffId)?.leave_type ??
                                      null)
                                    : getTherapistLeaveType(staffId))

                            const baseFteRemaining =
                              typeof current?.fteRemaining === 'number'
                                ? current.fteRemaining
                                : staffMember?.status === 'buffer' && typeof (staffMember as any)?.buffer_fte === 'number'
                                  ? ((staffMember as any).buffer_fte as number)
                                  : staffMember?.rank === 'PCA'
                                    ? (Object.values(pcaAllocations).flat().find(a => a.staff_id === staffId)?.fte_pca ??
                                      1.0)
                                    : (() => {
                                        // Therapist: infer from current allocations (sum across teams if split)
                                        let sum = 0
                                        for (const t of TEAMS) {
                                          for (const a of therapistAllocations[t] || []) {
                                            if (a.staff_id === staffId) sum += a.fte_therapist ?? 0
                                          }
                                        }
                                        return sum > 0 ? sum : 1.0
                                      })()

                            const nextByTeam = { ...(current?.cardColorByTeam ?? {}) }
                            if (selectedClassName) nextByTeam[team] = selectedClassName
                            else delete nextByTeam[team]

                            return {
                              ...prev,
                              [staffId]: {
                                ...(current ?? { leaveType: baseLeaveType, fteRemaining: baseFteRemaining }),
                                cardColorByTeam: nextByTeam,
                              },
                            }
                          })

                          closeColorContextAction()
                        }}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      
      
      {/* Warning Popover for leave arrangement edit after step 1 */}
      {leaveEditWarningPopover.show && leaveEditWarningPopover.position && (
        <div
          className="absolute z-[9999] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-3 w-[200px]"
          style={{
            left: leaveEditWarningPopover.position.x,
            top: leaveEditWarningPopover.position.y,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setLeaveEditWarningPopover({ show: false, position: null })
            }}
            className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1 pr-4">
            Leave Arrangement Edit Not Available
          </div>
          <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
            Leave arrangement editing is only available in Step 1 (Leave & FTE). Please return to Step 1 to edit leave arrangements.
          </div>
        </div>
      )}

      {/* Warning Popover for bed relieving edit outside step 4 */}
      {bedRelievingEditWarningPopover.show && bedRelievingEditWarningPopover.position && (
        <div
          className="fixed z-[9999] px-2 py-1 text-xs text-popover-foreground bg-popover border border-amber-500 rounded-md shadow-md whitespace-normal max-w-[260px]"
          style={{
            left: bedRelievingEditWarningPopover.position.x,
            top: bedRelievingEditWarningPopover.position.y,
            pointerEvents: 'none',
          }}
        >
          Bed relieving note editing is only available in Step 4 (Bed Relieving). Please return to Step 4 to edit.
        </div>
      )}
      
      {/* PCA Drag Overlay - shows mini card with selected slots (when dragging from popover) */}
      {pcaDragState.isDraggingFromPopover && pcaDragState.staffName && pcaDragState.selectedSlots.length > 0 && (
        <div
          className="fixed z-[10000] pointer-events-none"
          style={{
            left: mousePositionRef.current.x - 60,
            top: mousePositionRef.current.y - 20,
          }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-md shadow-lg border-2 border-amber-500 p-2 min-w-[120px]">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {pcaDragState.staffName}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {pcaDragState.selectedSlots.sort((a, b) => a - b).map(slot => {
                const slotTime = slot === 1 ? '0900-1030' : slot === 2 ? '1030-1200' : slot === 3 ? '1330-1500' : '1500-1630'
                return slotTime
              }).join(', ')}
            </div>
            {pcaDragState.selectedSlots.length > 1 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                {pcaDragState.selectedSlots.length} slots ({(pcaDragState.selectedSlots.length * 0.25).toFixed(2)} FTE)
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* DragOverlay for regular card drags */}
      <DragOverlay modifiers={[snapCenterToCursor]}>
        {!pcaDragState.isDraggingFromPopover && activeDragStaffForOverlay ? (
          <div className="pointer-events-none select-none">
            <div className="bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-300 dark:border-slate-600 px-2 py-1">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                {activeDragStaffForOverlay.name}
                {activeDragStaffForOverlay.status === 'buffer' ? '*' : ''}
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
      
      <div className="w-full px-8 py-4 min-w-[1440px] bg-background">
        {actionToast && (
          <div ref={actionToastContainerRef} className="fixed right-4 top-4 z-[9999]">
            <ActionToast
              key={actionToast.id}
              title={actionToast.title}
              description={actionToast.description}
              actions={actionToast.actions}
              variant={actionToast.variant}
              open={actionToast.open}
              onClose={dismissActionToast}
              onExited={() => {
                handleToastExited(actionToast.id)
              }}
            />
          </div>
        )}
        <ScheduleHeaderBar
          showBackButton={showBackButton}
          onBack={() => {
              const returnPath = sessionStorage.getItem('scheduleReturnPath')
              if (returnPath) {
                sessionStorage.removeItem('scheduleReturnPath')
                navLoading.start(returnPath)
                router.push(returnPath)
              } else {
                navLoading.start('/history')
                router.push('/history')
              }
            }}
          userRole={userRole}
          showLoadDiagnostics={access.can('schedule.diagnostics.load')}
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
            beginDateTransition(date)
          }}
          showSnapshotUiReminder={showSnapshotUiReminder}
          snapshotDiffButtonRef={snapshotDiffButtonRef}
          onToggleSnapshotDiff={() => setSnapshotDiffOpen((v) => !v)}
          rightActions={
            <>
              {userRole === 'developer' ? (
                <Tooltip
                  side="bottom"
                  content="Developer-only: seeded leave simulation harness (generate/apply/replay + invariants)."
                >
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setDevLeaveSimOpen(true)}
                    disabled={saving || copying}
                  >
                    Leave Sim
                  </Button>
                </Tooltip>
              ) : null}

              {/* Copy dropdown button */}
              <div className="relative">
                {access.can('schedule.diagnostics.copy') || access.can('schedule.diagnostics.snapshot-health') ? (
                  <Tooltip
                    side="bottom"
                    className="p-0 bg-transparent border-0 shadow-none whitespace-normal"
                    content={
                      <div className="w-56 bg-slate-800 border border-slate-700 rounded-md shadow-lg">
                        <div className="border-b border-slate-700 px-3 py-2 text-xs text-slate-500">
                          Diagnostics
                        </div>

                        {access.can('schedule.diagnostics.snapshot-health') ? (
                          snapshotHealthReport ? (
                            <div className="px-3 pt-2 text-xs text-slate-200 space-y-1">
                              <div>
                                <span className="text-slate-400">snapshotHealth:</span> {snapshotHealthReport.status}
                              </div>
                              {snapshotHealthReport.issues?.length > 0 && (
                                <div>
                                  <span className="text-slate-400">issues:</span> {snapshotHealthReport.issues.join(', ')}
                                </div>
                              )}
                              <div>
                                <span className="text-slate-400">staff:</span> {snapshotHealthReport.snapshotStaffCount} (missing
                                referenced: {snapshotHealthReport.missingReferencedStaffCount})
                              </div>
                              {(snapshotHealthReport.schemaVersion || snapshotHealthReport.source) && (
                                <div>
                                  <span className="text-slate-400">meta:</span>{' '}
                                  {snapshotHealthReport.schemaVersion ? `v${snapshotHealthReport.schemaVersion}` : 'v?'}
                                  {snapshotHealthReport.source ? `, ${snapshotHealthReport.source}` : ''}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="px-3 pt-2 text-xs text-slate-500">snapshotHealth: (none)</div>
                          )
                        ) : null}

                        {access.can('schedule.diagnostics.copy') ? (
                          <>
                            <div className="border-t border-slate-700 mt-2 px-3 py-2 text-[11px] text-slate-500">
                              Copy timing
                            </div>
                            <div className="px-3 pb-3 text-xs text-slate-200 space-y-1">
                              {lastCopyTiming ? (
                                <>
                                  <div>
                                    <span className="text-slate-400">client total:</span> {Math.round(lastCopyTiming.totalMs)}ms
                                  </div>
                                  {lastCopyTiming.stages.length > 0 && (
                                    <div className="text-[11px] text-slate-300 space-y-0.5">
                                      {lastCopyTiming.stages.map((s) => (
                                        <div key={`copy-client-${s.name}`}>
                                          <span className="text-slate-400">{s.name}:</span> {Math.round(s.ms)}ms
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {(() => {
                                    const server = (lastCopyTiming.meta as any)?.server
                                    if (!server) return null
                                    return (
                                      <div className="pt-1">
                                        <div>
                                          <span className="text-slate-400">server total:</span> {Math.round(server.totalMs ?? 0)}ms{' '}
                                          {typeof server?.meta?.rpcUsed === 'boolean'
                                            ? `(rpc:${server.meta.rpcUsed ? 'yes' : 'no'})`
                                            : null}
                                          {typeof server?.meta?.baselineBytes === 'number' ? (
                                            <span className="text-slate-400"> baseline:{Math.round(server.meta.baselineBytes / 1024)}KB</span>
                                          ) : null}
                                          {typeof server?.meta?.specialProgramsBytes === 'number' ? (
                                            <span className="text-slate-400"> sp:{Math.round(server.meta.specialProgramsBytes / 1024)}KB</span>
                                          ) : null}
                                        </div>
                                        {Array.isArray(server.stages) && server.stages.length > 0 && (
                                          <div className="text-[11px] text-slate-300 space-y-0.5">
                                            {server.stages.map((s: any) => (
                                              <div key={`copy-server-${s.name}`}>
                                                <span className="text-slate-400">{s.name}:</span> {Math.round(s.ms ?? 0)}ms
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </>
                              ) : (
                                <div className="text-slate-500">No copy timing captured yet.</div>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    }
                  >
                    <Button
                      variant="outline"
                      onClick={() => {
                        const next = !copyMenuOpen
                        setCopyMenuOpen(next)
                        if (next) loadDatesWithData()
                      }}
                      onMouseEnter={() => {
                        prefetchScheduleCopyWizard().catch(() => {})
                      }}
                      onFocus={() => {
                        prefetchScheduleCopyWizard().catch(() => {})
                      }}
                      type="button"
                      className="flex items-center"
                      disabled={copying || saving}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {copying ? 'Copying...' : 'Copy'}
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = !copyMenuOpen
                      setCopyMenuOpen(next)
                      if (next) loadDatesWithData()
                    }}
                    onMouseEnter={() => {
                      prefetchScheduleCopyWizard().catch(() => {})
                    }}
                    onFocus={() => {
                      prefetchScheduleCopyWizard().catch(() => {})
                    }}
                    type="button"
                    className="flex items-center"
                    disabled={copying || saving}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {copying ? 'Copying...' : 'Copy'}
                  </Button>
                )}
                {copyMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-background border border-border rounded-md shadow-lg z-50">
                    {!datesWithDataLoadedAtRef.current && datesWithDataLoading ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Loading schedule dates…</div>
                    ) : (
                      <div className="p-1">
                        <button
                          type="button"
                          className="w-full flex items-center px-3 py-2 text-xs text-left hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!nextWorkingEnabled}
                          onClick={() => {
                            setCopyMenuOpen(false)
                            if (!nextWorkingEnabled || !nextWorkingSourceDate || !nextWorkingTargetDate) {
                              return
                            }
                            setCopyWizardConfig({
                              sourceDate: nextWorkingSourceDate,
                              targetDate: nextWorkingTargetDate,
                              flowType: nextWorkingDirection === 'from' ? 'last-working-day' : 'next-working-day',
                              direction: nextWorkingDirection,
                            })
                            setCopyWizardOpen(true)
                          }}
                        >
                          {nextWorkingLabel}
                        </button>
                        <button
                          type="button"
                          className="w-full flex items-center px-3 py-2 text-xs text-left hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!specificEnabled}
                          onClick={() => {
                            setCopyMenuOpen(false)
                            setCopyWizardConfig({
                              sourceDate: selectedDate,
                              targetDate: null,
                              flowType: 'specific-date',
                              direction: specificDirection,
                            })
                            setCopyWizardOpen(true)
                          }}
                        >
                          {specificLabel}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {access.can('schedule.diagnostics.save') ? (
                <Tooltip
                  side="bottom"
                  className="p-0 bg-transparent border-0 shadow-none whitespace-normal"
                  content={
                    <div className="w-56 bg-slate-800 border border-slate-700 rounded-md shadow-lg">
                      <div className="border-b border-slate-700 px-3 py-2 text-xs text-slate-500">
                        Save timing
                      </div>
                      <div className="px-3 py-2 text-xs text-slate-200 space-y-1">
                        {lastSaveTiming ? (
                          <>
                            <div>
                              <span className="text-slate-400">total:</span>{' '}
                              {Math.round(lastSaveTiming.totalMs)}ms
                            </div>
                            {(() => {
                              const meta = lastSaveTiming.meta as any
                              if (!meta) return null
                              return (
                                <div className="text-[11px] text-slate-400">
                                  rpc:{meta.rpcUsed ? 'yes' : 'no'}
                                  {typeof meta.snapshotWritten === 'boolean'
                                    ? `, snapshotWrite:${meta.snapshotWritten ? 'yes' : 'no'}`
                                    : null}
                                  {typeof meta.snapshotBytes === 'number'
                                    ? `, baseline:${Math.round(meta.snapshotBytes / 1024)}KB`
                                    : null}
                                  {typeof meta.specialProgramsBytes === 'number'
                                    ? `, sp:${Math.round(meta.specialProgramsBytes / 1024)}KB`
                                    : null}
                                </div>
                              )
                            })()}
                            {lastSaveTiming.stages.length > 0 && (
                              <div className="pt-1 text-[11px] text-slate-300 space-y-0.5">
                                {lastSaveTiming.stages.map(s => (
                                  <div key={`save-${s.name}`}>
                                    <span className="text-slate-400">{s.name}:</span>{' '}
                                    {Math.round(s.ms)}ms
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-slate-500">No save timing captured yet.</div>
                        )}
                      </div>
                    </div>
                  }
                >
                  <Button 
                    onClick={saveScheduleToDatabase} 
                    disabled={saving || !hasUnsavedChanges}
                    variant={hasUnsavedChanges ? "default" : "outline"}
                    className={hasUnsavedChanges ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Schedule' : 'Saved'}
                  </Button>
                </Tooltip>
              ) : (
                <Button 
                  onClick={saveScheduleToDatabase} 
                  disabled={saving || !hasUnsavedChanges}
                  variant={hasUnsavedChanges ? "default" : "outline"}
                  className={hasUnsavedChanges ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Schedule' : 'Saved'}
                </Button>
              )}
            </>
          }
        />
        <SnapshotDiffPopover
          open={showSnapshotUiReminder && snapshotDiffOpen}
          panelRef={snapshotDiffPanelRef}
          position={snapshotDiffPos}
          selectedDate={selectedDate}
          loading={snapshotDiffLoading}
          error={snapshotDiffError}
          result={snapshotDiffResult}
          onClose={() => setSnapshotDiffOpen(false)}
        />

        {userRole === 'developer' ? (
          <DevLeaveSimPanel
            open={devLeaveSimOpen}
            onOpenChange={setDevLeaveSimOpen}
            userRole={userRole}
            selectedDate={selectedDate}
            selectedDateKey={toDateKey(selectedDate)}
            weekday={currentWeekday}
            staff={staff}
            specialPrograms={specialPrograms}
            sptAllocations={sptAllocations}
            staffOverrides={staffOverrides as any}
            setStaffOverrides={(next) => setStaffOverrides(next as any)}
            clearDomainFromStep={(stepId) => scheduleActions.clearDomainFromStep(stepId as any)}
            goToStep={goToStep as any}
            setInitializedSteps={(next) => setInitializedSteps(next as any)}
            setStepStatus={(next) => setStepStatus(next as any)}
            setStep2Result={(next) => setStep2Result(next as any)}
            setHasSavedAllocations={(next) => setHasSavedAllocations(next as any)}
            setTieBreakDecisions={(next) => setTieBreakDecisions(next as any)}
            recalculateScheduleCalculations={recalculateScheduleCalculations}
            runStep2={async ({ cleanedOverrides }) => {
              return await scheduleActions.runStep2TherapistAndNonFloatingPCA({
                cleanedOverrides: cleanedOverrides as any,
                toast: showActionToast,
              })
            }}
            runStep2Auto={async ({ autoStep20, autoStep21 }) => {
              // Auto Step 2.1: skip special program override wizard and proceed.
              // Auto Step 2.0: auto-handle substitution decisions (no dialog).

              // If the caller wants the real special-program override dialog, open it and await results.
              let baseOverrides: any = { ...(staffOverrides as any) }

              const weekday = getWeekday(selectedDate)
              const activeSpecialPrograms = specialPrograms.filter((p) => (p as any)?.weekdays?.includes?.(weekday))

              if (!autoStep21 && activeSpecialPrograms.length > 0) {
                const overridesFromDialog = await new Promise<Record<string, any>>((resolve) => {
                  const resolver = (overrides: Record<string, any>) => resolve(overrides || {})
                  setSpecialProgramOverrideResolver(() => resolver as any)
                  specialProgramOverrideResolverRef.current = resolver as any
                  prefetchSpecialProgramOverrideDialog().catch(() => {})
                  setShowSpecialProgramOverrideDialog(true)
                })

                Object.entries(overridesFromDialog || {}).forEach(([staffId, override]) => {
                  baseOverrides[staffId] = {
                    ...(baseOverrides[staffId] ?? { leaveType: null, fteRemaining: 1.0 }),
                    ...(override as any),
                  }
                })
              }

              const cleanedOverrides = resetStep2OverridesForAlgoEntry({
                staffOverrides: baseOverrides,
                allStaff: [...staff, ...bufferStaff],
              })
              setStaffOverrides(cleanedOverrides as any)

              if (!autoStep20) {
                // Use the real substitution wizard flow.
                await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides as any)
                return
              }

              const autoSelectSubstitutions = (params: {
                teams: Team[]
                substitutionsByTeam: Record<Team, any[]>
              }): Record<string, Array<{ floatingPCAId: string; slots: number[] }>> => {
                const selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>> = {}
                const used = new Set<string>() // `${floatingId}:${slot}`

                const scoreCandidate = (c: any, missing: number[]) => {
                  const avail: number[] = Array.isArray(c?.availableSlots) ? c.availableSlots : []
                  const coverage = missing.filter((s) => avail.includes(s)).length
                  const preferred = c?.isPreferred ? 1 : 0
                  const floor = c?.isFloorPCA ? 1 : 0
                  return { preferred, floor, coverage, name: String(c?.name ?? '') }
                }

                for (const team of params.teams) {
                  const subs = params.substitutionsByTeam?.[team] ?? []
                  for (const sub of subs) {
                    const key = `${team}-${sub.nonFloatingPCAId}`
                    const missingSlots: number[] = Array.isArray(sub?.missingSlots) ? sub.missingSlots : []
                    const candidates: any[] = Array.isArray(sub?.availableFloatingPCAs) ? sub.availableFloatingPCAs : []
                    if (missingSlots.length === 0 || candidates.length === 0) continue

                    let remaining = [...missingSlots]
                    const picked: Array<{ floatingPCAId: string; slots: number[] }> = []

                    const sorted = [...candidates].sort((a, b) => {
                      const sa = scoreCandidate(a, missingSlots)
                      const sb = scoreCandidate(b, missingSlots)
                      if (sa.preferred !== sb.preferred) return sb.preferred - sa.preferred
                      if (sa.floor !== sb.floor) return sb.floor - sa.floor
                      if (sa.coverage !== sb.coverage) return sb.coverage - sa.coverage
                      return sa.name.localeCompare(sb.name)
                    })

                    for (const c of sorted) {
                      if (remaining.length === 0) break
                      const id = String(c?.id ?? '')
                      if (!id) continue
                      const avail: number[] = Array.isArray(c?.availableSlots) ? c.availableSlots : []
                      const slots = remaining.filter((s) => avail.includes(s) && !used.has(`${id}:${s}`))
                      if (slots.length === 0) continue
                      slots.forEach((s) => used.add(`${id}:${s}`))
                      picked.push({ floatingPCAId: id, slots })
                      remaining = remaining.filter((s) => !slots.includes(s))
                    }

                    if (picked.length > 0) selections[key] = picked
                  }
                }

                return selections
              }

              await scheduleActions.runStep2TherapistAndNonFloatingPCA({
                cleanedOverrides: cleanedOverrides as any,
                toast: showActionToast,
                onNonFloatingSubstitutionWizard: async ({ teams, substitutionsByTeam }) => {
                  return autoSelectSubstitutions({ teams, substitutionsByTeam: substitutionsByTeam as any })
                },
              })
            }}
            runStep3={async ({ onTieBreak }) => {
              await scheduleActions.runStep3FloatingPCA({
                onTieBreak: onTieBreak as any,
              })
            }}
            runStep3V2Auto={async ({ autoStep32, autoStep33, bufferPreAssignRatio }) => {
              // Build defaults similar to the wizard (3.1/3.4), optionally auto-applying 3.0/3.2/3.3.
              const pending0 = pendingPCAFTEPerTeam
              const teamOrder = [...TEAMS].sort((a, b) => {
                const d = (pending0[b] || 0) - (pending0[a] || 0)
                if (d !== 0) return d
                return TEAMS.indexOf(a) - TEAMS.indexOf(b)
              })

              const floatingPCAs = buildPCADataFromCurrentState().filter((p) => p.floating)
              const baseExistingAllocations = recalculateFromCurrentState().existingAllocations

              const { allocateFloatingPCA_v2 } = await import('@/lib/algorithms/pcaAllocation')
              const { computeReservations, computeAdjacentSlotReservations, executeSlotAssignments } = await import('@/lib/utils/reservationLogic')
              const {
                recordAssignment,
                getTeamPreferenceInfo,
                getTeamFloor,
                isFloorPCAForTeam,
                finalizeTrackerSummary,
              } = await import('@/lib/utils/floatingPCAHelpers')

              // Mutable working state across 3.0/3.2/3.3
              let currentPending: Record<Team, number> = { ...pending0 }
              let currentAllocations: any[] = baseExistingAllocations.map((a: any) => ({ ...a }))

              const step30Assignments: Array<{ team: Team; slot: number; pcaId: string; pcaName: string }> = []
              const step32Assignments: Array<{ team: Team; slot: number; pcaId: string; pcaName: string }> = []
              const step33Assignments: Array<{ team: Team; slot: number; pcaId: string; pcaName: string }> = []

              const pickNextTeam = (pending: Record<Team, number>): Team | null => {
                // Choose the highest pending team by current teamOrder.
                let best: Team | null = null
                let bestVal = -Infinity
                for (const t of teamOrder) {
                  const v = pending[t] || 0
                  if (v > bestVal) {
                    bestVal = v
                    best = t
                  }
                }
                if (!best) return null
                return (pending[best] || 0) > 0 ? best : null
              }

              // Step 3.0 (simulated): pre-assign some buffer-floating PCA slots before 3.1.
              const ratio = Math.max(0, Math.min(1, bufferPreAssignRatio || 0))
              if (ratio > 0) {
                const bufferFloatingPCAs = (bufferStaff || []).filter(
                  (s) => s.rank === 'PCA' && s.status === 'buffer' && (s as any).floating
                )
                const byId = new Map<string, any>(floatingPCAs.map((p: any) => [p.id, p]))
                const countAssignedSlots = (alloc: any) => {
                  let n = 0
                  if (alloc.slot1) n++
                  if (alloc.slot2) n++
                  if (alloc.slot3) n++
                  if (alloc.slot4) n++
                  return n
                }

                for (const staffRow of bufferFloatingPCAs) {
                  const p = byId.get(staffRow.id)
                  if (!p) continue
                  const totalSlots = Math.max(0, Math.min(4, Math.round((p.fte_pca || 0) / 0.25)))
                  if (totalSlots <= 0) continue

                  const existing = currentAllocations.find((a: any) => a.staff_id === staffRow.id)
                  const already = existing ? countAssignedSlots(existing) : 0
                  const remainingSlots = Math.max(0, totalSlots - already)
                  const target = Math.max(0, Math.min(remainingSlots, Math.floor(remainingSlots * ratio)))
                  if (target <= 0) continue

                  // Find which slots are free.
                  const taken = new Set<number>()
                  if (existing?.slot1) taken.add(1)
                  if (existing?.slot2) taken.add(2)
                  if (existing?.slot3) taken.add(3)
                  if (existing?.slot4) taken.add(4)
                  const freeSlots = [1, 2, 3, 4].filter((s) => !taken.has(s)).slice(0, target)

                  for (const slot of freeSlots) {
                    const team = pickNextTeam(currentPending)
                    if (!team) break
                    const assignment = { team, slot, pcaId: staffRow.id, pcaName: p.name }
                    step30Assignments.push(assignment)
                    const r = executeSlotAssignments([assignment], currentPending, currentAllocations, floatingPCAs as any)
                    currentPending = r.updatedPendingFTE as any
                    currentAllocations = r.updatedAllocations as any
                  }
                }
              }

              // Step 3.2 (auto): preferred PCA + preferred slot reservations.
              if (autoStep32) {
                const res = computeReservations(
                  pcaPreferences,
                  currentPending,
                  floatingPCAs as any,
                  currentAllocations as any,
                  staffOverrides as any
                )
                const used = new Set<string>() // pcaId:slot
                for (const team of teamOrder) {
                  const info = res.teamReservations[team]
                  if (!info) continue
                  const slot = info.slot
                  const candidates = [...(info.pcaIds || [])].sort((a, b) => {
                    const an = info.pcaNames?.[a] || a
                    const bn = info.pcaNames?.[b] || b
                    if (an !== bn) return an.localeCompare(bn)
                    return a.localeCompare(b)
                  })
                  for (const pcaId of candidates) {
                    const key = `${pcaId}:${slot}`
                    if (used.has(key)) continue
                    used.add(key)
                    const assignment = { team, slot, pcaId, pcaName: info.pcaNames?.[pcaId] || 'Unknown PCA' }
                    step32Assignments.push(assignment)
                    const r = executeSlotAssignments([assignment], currentPending, currentAllocations, floatingPCAs as any)
                    currentPending = r.updatedPendingFTE as any
                    currentAllocations = r.updatedAllocations as any
                    break
                  }
                }
              }

              // Step 3.3 (auto): adjacent-slot reservations from special program PCAs.
              if (autoStep33) {
                // Keep selecting greedily until no more valid options.
                const used = new Set<string>()
                const markUsedFromAllocations = () => {
                  used.clear()
                  for (const alloc of currentAllocations as any[]) {
                    if (alloc.slot1) used.add(`${alloc.staff_id}:1`)
                    if (alloc.slot2) used.add(`${alloc.staff_id}:2`)
                    if (alloc.slot3) used.add(`${alloc.staff_id}:3`)
                    if (alloc.slot4) used.add(`${alloc.staff_id}:4`)
                  }
                }
                markUsedFromAllocations()

                while (true) {
                  const adj = computeAdjacentSlotReservations(
                    currentPending,
                    currentAllocations as any,
                    floatingPCAs as any,
                    specialPrograms as any
                  )
                  if (!adj.hasAnyAdjacentReservations) break

                  let picked = false
                  for (const team of teamOrder) {
                    const pending = currentPending[team] || 0
                    if (pending <= 0) continue
                    const options = [...(adj.adjacentReservations[team] || [])].sort((a, b) => {
                      if (a.pcaName !== b.pcaName) return a.pcaName.localeCompare(b.pcaName)
                      return a.adjacentSlot - b.adjacentSlot
                    })
                    for (const opt of options) {
                      const slot = opt.adjacentSlot
                      const key = `${opt.pcaId}:${slot}`
                      if (used.has(key)) continue
                      const assignment = { team, slot, pcaId: opt.pcaId, pcaName: opt.pcaName }
                      step33Assignments.push(assignment)
                      const r = executeSlotAssignments([assignment], currentPending, currentAllocations, floatingPCAs as any)
                      currentPending = r.updatedPendingFTE as any
                      currentAllocations = r.updatedAllocations as any
                      markUsedFromAllocations()
                      picked = true
                      break
                    }
                  }

                  if (!picked) break
                }
              }

              const result = await allocateFloatingPCA_v2({
                teamOrder,
                currentPendingFTE: currentPending,
                existingAllocations: currentAllocations as any,
                pcaPool: floatingPCAs as any,
                pcaPreferences,
                specialPrograms,
              })

              // Add Step 3.0/3.2/3.3 assignments into tracker for visibility, matching wizard behavior.
              const allocationOrderMap = new Map<Team, number>()
              teamOrder.forEach((team, idx) => allocationOrderMap.set(team, idx + 1))

              const addAssignmentsToTracker = (assignments: Array<{ team: Team; slot: number; pcaId: string; pcaName: string }>, assignedIn: 'step30' | 'step32' | 'step33') => {
                for (const assignment of assignments) {
                  const pca = (floatingPCAs as any[]).find((p) => p.id === assignment.pcaId)
                  if (!pca) continue
                  const teamPref = getTeamPreferenceInfo(assignment.team, pcaPreferences)
                  const teamFloor = getTeamFloor(assignment.team, pcaPreferences)
                  const isPreferredPCA = teamPref.preferredPCAIds.includes(assignment.pcaId)
                  const isPreferredSlot = teamPref.preferredSlot === assignment.slot
                  recordAssignment(result.tracker as any, assignment.team, {
                    slot: assignment.slot,
                    pcaId: assignment.pcaId,
                    pcaName: assignment.pcaName,
                    assignedIn,
                    wasPreferredSlot: isPreferredSlot,
                    wasPreferredPCA: isPreferredPCA,
                    wasFloorPCA: isFloorPCAForTeam(pca, teamFloor),
                    allocationOrder: allocationOrderMap.get(assignment.team),
                    isBufferAssignment: assignedIn === 'step30',
                  } as any)
                }
              }

              addAssignmentsToTracker(step30Assignments, 'step30')
              addAssignmentsToTracker(step32Assignments, 'step32')
              addAssignmentsToTracker(step33Assignments, 'step33')
              finalizeTrackerSummary(result.tracker as any)

              await handleFloatingPCAConfigSave(result, teamOrder, step32Assignments as any, step33Assignments as any)
            }}
            openStep3Wizard={() => {
              if (!step2Result) {
                showActionToast('Step 2 must be completed before Step 3.', 'warning')
                return
              }
              goToStep('floating-pca' as any)
              setDevLeaveSimOpen(false)
              setFloatingPCAConfigOpen(true)
            }}
            runStep4={async () => {
              await runStep4BedRelieving({ toast: showActionToast })
            }}
            therapistAllocationsByTeam={therapistAllocations as any}
            pcaAllocationsByTeam={pcaAllocations as any}
            calculationsByTeam={calculations as any}
          />
        ) : null}

        {/* Step Indicator with Navigation */}
        <div className="mb-4">
          <StepIndicator
            steps={ALLOCATION_STEPS}
            currentStep={currentStep}
            stepStatus={stepStatus}
            userRole={userRole}
            canResetToBaseline={access.can('schedule.tools.reset-to-baseline')}
            onResetToBaseline={resetToBaseline}
            onStepClick={(stepId) => goToStep(stepId as any)}
            canNavigateToStep={(stepId) => {
              // Can always go to earlier steps
              const targetIndex = ALLOCATION_STEPS.findIndex(s => s.id === stepId)
              const currentIndex = ALLOCATION_STEPS.findIndex(s => s.id === currentStep)
              if (targetIndex <= currentIndex) return true
              // Can only go forward if previous step is completed
              const previousStep = ALLOCATION_STEPS[targetIndex - 1]
              return previousStep && stepStatus[previousStep.id] === 'completed'
            }}
            onNext={handleNextStep}
            onPrevious={handlePreviousStep}
            canGoNext={currentStep !== 'review'}
            canGoPrevious={currentStep !== 'leave-fte'}
            onInitialize={handleInitializeAlgorithm}
            onInitializePrefetch={() => {
              if (currentStep === 'therapist-pca') prefetchStep2Algorithms()
              else if (currentStep === 'floating-pca') prefetchStep3Algorithms()
              else if (currentStep === 'bed-relieving') prefetchBedAlgorithm()
            }}
            onClearStep={handleClearStep}
            showClear={showClearForCurrentStep}
            isInitialized={initializedSteps.has(currentStep)}
            isLoading={loading}
            errorMessage={
              currentStep === 'therapist-pca'
                ? (pcaAllocationErrors.missingSlotSubstitution || pcaAllocationErrors.specialProgramAllocation)
                : undefined
            }
            bufferTherapistStatus={
              currentStep === 'therapist-pca'
                ? (() => {
                    // Check if there are buffer therapists
                    const bufferTherapists = bufferStaff.filter(s => ['SPT', 'APPT', 'RPT'].includes(s.rank))
                    if (bufferTherapists.length === 0) return undefined
                    
                    // Check if all buffer therapists are assigned to teams
                    const assignedBufferTherapists = bufferTherapists.filter(staff => {
                      // Check if staff is in any team's therapistAllocations
                      return Object.values(therapistAllocations).some(teamAllocs =>
                        teamAllocs.some(alloc => alloc.staff_id === staff.id)
                      )
                    })
                    
                    if (assignedBufferTherapists.length === bufferTherapists.length) {
                      return 'Buffer therapist detected and assigned'
                    } else {
                      return 'Buffer therapist detected and not yet assigned'
                    }
                  })()
                : undefined
            }
          />
        </div>

        <ScheduleMainLayout>
          <div
            className="shrink-0 flex flex-col gap-4 self-start min-h-0"
            style={typeof rightContentHeight === 'number' && rightContentHeight > 0 ? { height: rightContentHeight } : undefined}
          >
            {/* Summary */}
            {(() => {
              const totalBeds = wards.reduce((sum, ward) => sum + ward.total_beds, 0)
              const shsBedsTotal = TEAMS.reduce((sum, team) => {
                const o = (bedCountsOverridesByTeam as any)?.[team]
                const shs = typeof o?.shsBedCounts === 'number' ? o.shsBedCounts : 0
                return sum + shs
              }, 0)
              const studentBedsTotal = TEAMS.reduce((sum, team) => {
                const o = (bedCountsOverridesByTeam as any)?.[team]
                const students =
                  typeof o?.studentPlacementBedCounts === 'number' ? o.studentPlacementBedCounts : 0
                return sum + students
              }, 0)
              const hasShsOrStudents = TEAMS.some(team => {
                const o = (bedCountsOverridesByTeam as any)?.[team]
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
                const raw = (a as any).fte_addon
                const fte =
                  typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
                if (!Number.isFinite(fte)) continue
                sptConfiguredFteByStaffId.set(a.staff_id, Math.max(0, Math.min(fte, 1.0)))
              }

              let totalPTOnDutyRegular = 0
              let totalPTOnDutyBuffer = 0
              const therapistLeaveTypeById = new Map<string, unknown>()
              const therapistAllocatedFteById = new Map<string, number>()
              const therapistStaffById = new Map<string, any>()

              for (const team of TEAMS) {
                for (const alloc of therapistAllocations[team] || []) {
                  const s = (alloc as any).staff
                  if (!s || !therapistRanks.includes(s.rank as any)) continue

                  const fte = typeof alloc.fte_therapist === 'number' ? alloc.fte_therapist : 0
                  const isBuffer = (s as any).status === 'buffer'
                  if (isBuffer) totalPTOnDutyBuffer += fte
                  else totalPTOnDutyRegular += fte

                  therapistStaffById.set(s.id, s)
                  therapistAllocatedFteById.set(s.id, (therapistAllocatedFteById.get(s.id) ?? 0) + fte)

                  // Leave tracking: only if this staff is expected to work today.
                  const expectedBase =
                    s.rank === 'SPT'
                      ? (sptConfiguredFteByStaffId.get(s.id) ?? 0)
                      : isBuffer && typeof (s as any).buffer_fte === 'number'
                        ? ((s as any).buffer_fte as number)
                        : 1.0
                  if (expectedBase <= 0.0001) continue

                  const o = (staffOverrides as any)?.[s.id] as any
                  const effectiveLeaveType = o?.leaveType ?? alloc.leave_type
                  if (isOnDutyLeaveType(effectiveLeaveType as any)) continue
                  // Deduplicate by staff id (SPT may appear across multiple teams).
                  if (!therapistLeaveTypeById.has(s.id)) therapistLeaveTypeById.set(s.id, effectiveLeaveType)
                }
              }

              // Also include therapist overrides with leaveType set even if not present in allocations,
              // but ONLY when expected to work today (SPT weekday-configured; others default to 1.0).
              for (const [staffId, o] of Object.entries(staffOverrides as any)) {
                const override = o as any
                const lt = override?.leaveType
                if (isOnDutyLeaveType(lt as any)) continue
                const s = staff.find(x => x.id === staffId) || bufferStaff.find(x => x.id === staffId)
                if (!s || !therapistRanks.includes(s.rank as any)) continue
                therapistStaffById.set(s.id, s as any)
                const expectedBase =
                  s.rank === 'SPT'
                    ? (sptConfiguredFteByStaffId.get(s.id) ?? 0)
                    : (s as any).status === 'buffer' && typeof (s as any).buffer_fte === 'number'
                      ? ((s as any).buffer_fte as number)
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
                    : (s as any).status === 'buffer' && typeof (s as any).buffer_fte === 'number'
                      ? ((s as any).buffer_fte as number)
                      : 1.0
                if (expectedBase <= 0.0001) continue

                const o = (staffOverrides as any)?.[staffId] as any
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
              const allPCAStaffForSummary = [
                ...staff.filter(s => s.rank === 'PCA'),
                ...bufferStaff.filter(s => s.rank === 'PCA'),
              ]
              const pcaLeaveTypeById = new Map<string, unknown>()
              const pcaAllocatedFteById = new Map<string, number>()
              const pcaStaffById = new Map<string, any>()
              for (const team of TEAMS) {
                for (const alloc of pcaAllocations[team] || []) {
                  const staffId = (alloc as any).staff_id
                  if (!staffId) continue
                  const s = (alloc as any).staff
                  if (s) pcaStaffById.set(staffId, s)
                  const fte = typeof (alloc as any).fte_pca === 'number'
                    ? (alloc as any).fte_pca
                    : (typeof (alloc as any).fte_remaining === 'number' ? (alloc as any).fte_remaining : 0)
                  pcaAllocatedFteById.set(staffId, (pcaAllocatedFteById.get(staffId) ?? 0) + fte)
                  const o = (staffOverrides as any)?.[staffId] as any
                  const leaveType = o?.leaveType ?? (alloc as any).leave_type
                  if (isOnDutyLeaveType(leaveType as any)) continue
                  if (!pcaLeaveTypeById.has(staffId)) pcaLeaveTypeById.set(staffId, leaveType)
                }
              }
              for (const [staffId, o] of Object.entries(staffOverrides as any)) {
                const override = o as any
                if (isOnDutyLeaveType(override?.leaveType as any)) continue
                const s =
                  staff.find(x => x.id === staffId) || bufferStaff.find(x => x.id === staffId)
                if (!s || s.rank !== 'PCA') continue
                pcaStaffById.set(staffId, s as any)
                if (!pcaLeaveTypeById.has(staffId)) pcaLeaveTypeById.set(staffId, override.leaveType)
              }

              let totalPCALeaveFteCost = 0
              let totalPCASickLeaveFteCost = 0
              for (const [staffId, leaveType] of pcaLeaveTypeById.entries()) {
                const s = pcaStaffById.get(staffId)
                const isBuffer = (s as any)?.status === 'buffer'
                const baseFTE =
                  isBuffer && typeof (s as any)?.buffer_fte === 'number' ? ((s as any).buffer_fte as number) : 1.0

                const o = (staffOverrides as any)?.[staffId] as any
                const remaining =
                  typeof o?.fteRemaining === 'number'
                    ? o.fteRemaining
                    : (pcaAllocatedFteById.get(staffId) ?? baseFTE)
                const costFromOverride =
                  typeof o?.fteSubtraction === 'number' ? o.fteSubtraction : (baseFTE - remaining)
                const cost = Math.max(0, Math.min(baseFTE, costFromOverride))

                if (isSickLeaveType(leaveType)) totalPCASickLeaveFteCost += cost
                else totalPCALeaveFteCost += cost
              }
              const totalPCAOnDutyRegular = allPCAStaffForSummary
                .filter(s => (s as any).status !== 'buffer')
                .reduce((sum, s) => {
                  const o = (staffOverrides as any)?.[s.id] as any
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
                .filter(s => (s as any).status === 'buffer')
                .reduce((sum, s) => {
                  const o = (staffOverrides as any)?.[s.id] as any
                  const baseFTE =
                    typeof (s as any).buffer_fte === 'number' ? ((s as any).buffer_fte as number) : 1.0

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
            })()}

            <div className="w-40 flex-1 min-h-0 flex flex-col min-w-0">
              <div className="flex-1 min-h-0">
                <MaybeProfiler id="StaffPool">
                <StaffPool
                  therapists={therapists}
                  pcas={pcas}
                  inactiveStaff={inactiveStaff}
                  bufferStaff={bufferStaff}
                  onConvertInactiveToBuffer={({ staff, bufferFTE }) => {
                    scheduleActions.setScheduleStaffStatusOverride({
                      staffId: staff.id,
                      status: 'buffer',
                      bufferFTE,
                      nameAtTime: staff.name,
                      rankAtTime: staff.rank,
                    })
                  }}
                  onOpenStaffContextMenu={openStaffPoolContextMenu}
                  staffOverrides={staffOverrides}
                  specialPrograms={specialPrograms}
                  pcaAllocations={pcaAllocations}
                  currentStep={currentStep}
                  initializedSteps={initializedSteps}
                  weekday={selectedDate ? getWeekday(selectedDate) : undefined}
                  disableDragging={staffPoolContextMenu.show}
                  snapshotNotice={
                    showSnapshotUiReminder
                      ? `Staff pool is shown from the saved snapshot for ${formatDateDDMMYYYY(selectedDate)}.`
                      : undefined
                  }
                  snapshotDateLabel={showSnapshotUiReminder ? formatDateDDMMYYYY(selectedDate) : undefined}
                  onSlotTransfer={(staffId: string, targetTeam: string, slots: number[]) => {
                  // Find source team from allocations
                  let sourceTeam: Team | null = null
                  for (const [team, allocs] of Object.entries(pcaAllocations)) {
                    if (allocs.some(a => a.staff_id === staffId)) {
                      sourceTeam = team as Team
                      break
                    }
                  }
                  if (sourceTeam) {
                    // Update drag state and perform transfer
                    const staffMember = staff.find(s => s.id === staffId)
                    const isBufferStaff = staffMember?.status === 'buffer'
                    setPcaDragState({
                      isActive: true,
                      isDraggingFromPopover: false,
                      staffId,
                      staffName: staffMember?.name || null,
                      sourceTeam,
                      availableSlots: staffOverrides[staffId]?.availableSlots || [1, 2, 3, 4],
                      selectedSlots: slots,
                      showSlotSelection: false,
                      popoverPosition: null,
                      isBufferStaff: isBufferStaff || false,
                    })
                    performSlotTransfer(targetTeam as Team)
                  }
                  }}
                />
                </MaybeProfiler>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 bg-background relative">
            {/* Team grid loading: prefer native skeleton (no dimming overlay) */}
            {gridLoading && (
              <div className="absolute inset-0 z-50 pointer-events-auto bg-background">
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-8 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={`hdr-skel-${i}`} className="h-6 rounded-md bg-muted animate-pulse" />
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="h-4 w-40 rounded-md bg-muted animate-pulse" />
                    <div className="grid grid-cols-8 gap-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={`b1-skel-${i}`} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="h-4 w-32 rounded-md bg-muted animate-pulse" />
                    <div className="grid grid-cols-8 gap-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={`b2-skel-${i}`} className="h-28 rounded-lg border border-border bg-card animate-pulse" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Sticky Team headers row (Excel-like freeze) */}
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
              <div className="grid grid-cols-8 gap-2 py-2 min-w-[960px]">
                {TEAMS.map((team) => (
                  <h2 key={`header-${team}`} className="text-lg font-bold text-center">
                    {team}
                  </h2>
                ))}
              </div>
            </div>

            {/* Team grid content (page-level horizontal scroll) */}
            <MaybeProfiler id="TeamGrid">
            <div className="bg-background">
              <div className="min-w-[960px]">
                {/* Height anchor for Staff Pool column: stop at bottom of PCA Dedicated table (exclude notes board). */}
                <div ref={rightContentRef}>
                
                {/* Block 1: Therapist Allocation */}
                <div ref={therapistAllocationBlockRef} className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Therapist Allocation</h3>
                  <div className="grid grid-cols-8 gap-2">
                    {TEAMS.map((team) => (
                      <TherapistBlock
                        key={`therapist-${team}`}
                        team={team}
                        allocations={therapistAllocations[team]}
                        specialPrograms={specialPrograms}
                        weekday={currentWeekday}
                        currentStep={currentStep}
                        onEditStaff={onEditTherapistByTeam[team]}
                        staffOverrides={therapistOverridesByTeam[team]}
                        sptWeekdayByStaffId={sptWeekdayByStaffId}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Block 2: PCA Allocation */}
                <div ref={pcaAllocationBlockRef} className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">PCA Allocation</h3>
                  <div className="grid grid-cols-8 gap-2">
                    {TEAMS.map((team) => (
                      <Fragment key={`pca-${team}`}>
                        <PCABlock
                          team={team}
                          allocations={pcaAllocations[team]}
                          onEditStaff={onEditPcaByTeam[team]}
                          requiredPCA={calculations[team]?.required_pca_per_team}
                          averagePCAPerTeam={calculations[team]?.average_pca_per_team}
                          baseAveragePCAPerTeam={calculations[team]?.base_average_pca_per_team}
                        specialPrograms={specialPrograms}
                          allPCAAllocations={allPCAAllocationsFlat}
                          staffOverrides={pcaOverridesByTeam[team]}
                          allPCAStaff={pcas}
                          currentStep={currentStep}
                          step2Initialized={initializedSteps.has('therapist-pca')}
                          initializedSteps={initializedSteps}
                          weekday={currentWeekday}
                          externalHover={popoverDragHoverTeam === team}
                          allocationLog={allocationTracker?.[team]}
                          step3OrderPosition={step3OrderPositionByTeam[team]}
                          pendingPcaFte={pendingPCAFTEPerTeam?.[team]}
                          floatingPoolRemainingFte={floatingPoolRemainingFte}
                      />
                      </Fragment>
                    ))}
                  </div>
                </div>
                
                {/* Block 3: Bed Allocation */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Relieving Beds</h3>
                  <div className="grid grid-cols-8 gap-2">
                    {(() => {
                      const canShowBeds =
                        stepStatus['bed-relieving'] === 'completed' ||
                        currentStep === 'bed-relieving' ||
                        currentStep === 'review'
                      const visibleBedAllocs = canShowBeds ? bedAllocations : EMPTY_BED_ALLOCATIONS

                      return TEAMS.map((team) => (
                        <BedBlock
                          key={`bed-${team}`}
                          team={team}
                          allocations={visibleBedAllocs}
                          wards={wards}
                          bedRelievingNotesByToTeam={bedRelievingNotesByToTeam}
                          onSaveBedRelievingNotesForToTeam={saveBedRelievingNotesForToTeam}
                          activeEditingTransfer={activeBedRelievingTransfer}
                          onActiveEditingTransferChange={setActiveBedRelievingTransfer}
                          currentStep={currentStep}
                          onInvalidEditAttempt={(position) => {
                            // Position is client coords (cursor). Render as fixed tooltip near cursor.
                            const pad = 8
                            const estW = 260
                            const estH = 80
                            let x = position.x + 12
                            let y = position.y + 12
                            if (x + estW > window.innerWidth - pad) x = window.innerWidth - estW - pad
                            if (y + estH > window.innerHeight - pad) y = window.innerHeight - estH - pad
                            x = Math.max(pad, x)
                            y = Math.max(pad, y)
                            setBedRelievingEditWarningPopover({ show: true, position: { x, y } })
                          }}
                        />
                      ))
                    })()}
                  </div>
                </div>
                
                {/* Block 4: Leave Arrangements */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Leave Arrangements</h3>
                  <div className="grid grid-cols-8 gap-2">
                    {TEAMS.map((team) => {
                      // Get staff on leave from allocations AND staffOverrides
                      // Only include staff who are truly on leave (not on-duty).
                      const therapistLeaves = therapistAllocations[team]
                        .filter(alloc => {
                          const override = staffOverrides[alloc.staff.id]
                          const effectiveLeaveType =
                            override?.leaveType !== undefined ? override.leaveType : (alloc.leave_type as any)
                          const hasLeaveType = effectiveLeaveType !== null && effectiveLeaveType !== undefined
                          const isTrulyOnLeave = hasLeaveType && !isOnDutyLeaveType(effectiveLeaveType as any)

                          // IMPORTANT:
                          // - SPT can be "on duty" with FTE=0 (supervisory), and should NOT show in leave block.
                          // - Only show in leave block when leave type is truly a leave type (not on-duty).
                          return isTrulyOnLeave
                        })
                        .map(alloc => {
                          const override = staffOverrides[alloc.staff.id]
                          const effectiveLeaveType =
                            override?.leaveType !== undefined ? override.leaveType : (alloc.leave_type as any)
                          // Use override FTE if available, otherwise use allocation FTE
                          const fteRemaining = override?.fteRemaining !== undefined
                            ? override.fteRemaining
                            : (alloc.fte_therapist || 0)
                          return { 
                            ...alloc.staff, 
                            leave_type: effectiveLeaveType as LeaveType,
                            fteRemaining: fteRemaining
                          }
                        })
                      
                      // Also check staffOverrides for staff with leave types that might not be in allocations
                      // This includes non-floating staff assigned to this team
                      // Only include therapists (SPT, APPT, RPT) - exclude PCA
                      const overrideLeaves = Object.entries(staffOverrides)
                        .filter(([staffId, override]) => {
                          const staffMember = staff.find(s => s.id === staffId)
                          // Include only therapists with any leave type set, regardless of FTE
                          const isTherapist = staffMember && ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
                          const hasLeaveType = override.leaveType !== null && override.leaveType !== undefined
                          const isTrulyOnLeave = hasLeaveType && !isOnDutyLeaveType(override.leaveType as any)
                          return isTherapist && staffMember.team === team && isTrulyOnLeave
                        })
                        .map(([staffId, override]) => {
                          const staffMember = staff.find(s => s.id === staffId)!
                          return {
                            ...staffMember,
                            leave_type: override.leaveType as any,
                            fteRemaining: override.fteRemaining
                          }
                        })
                      
                      // Combine and deduplicate by staff id, prioritizing override leaves
                      // Only include therapists - exclude PCA leaves
                      const allLeaves = [...therapistLeaves, ...overrideLeaves]
                      const uniqueLeaves = allLeaves.filter((staff, index, self) =>
                        index === self.findIndex(s => s.id === staff.id)
                      )
                      
                      return (
                        <LeaveBlock
                          key={`leave-${team}`}
                          team={team}
                          staffOnLeave={uniqueLeaves}
                          onEditStaff={handleEditStaff}
                        />
                      )
                    })}
                  </div>
                </div>
                
                {/* Block 5: Calculations */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">Beds Calculations</h3>
                  <div className="grid grid-cols-8 gap-2">
                    {TEAMS.map((team) => {
                      const bedOverride = bedCountsOverridesByTeam?.[team] as any
                      const shs =
                        typeof bedOverride?.shsBedCounts === 'number' ? (bedOverride.shsBedCounts as number) : null
                      const students =
                        typeof bedOverride?.studentPlacementBedCounts === 'number'
                          ? (bedOverride.studentPlacementBedCounts as number)
                          : null

                      return (
                        <CalculationBlock
                          key={`calc-${team}`}
                          team={team}
                          calculations={calculations[team]}
                          shsBedCounts={shs}
                          studentPlacementBedCounts={students}
                          onEditBedCounts={() => setEditingBedTeam(team)}
                        />
                      )
                    })}
                  </div>
                </div>
                
                {/* Block 6: PCA Calculations */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">PCA Calculations</h3>
                  <div className="grid grid-cols-8 gap-2">
                    {TEAMS.map((team) => (
                      <PCACalculationBlock
                        key={`pca-calc-${team}`}
                        team={team}
                        calculations={calculations[team]}
                      />
                    ))}
                  </div>
                </div>

                {/* PCA Dedicated Schedule (separate table, below entire team grid) */}
                  {!deferBelowFold ? (
                    <MaybeProfiler id="PCADedicatedTable">
                <PCADedicatedScheduleTable
                  allPCAStaff={[
                    ...staff.filter(s => s.rank === 'PCA'),
                    ...bufferStaff.filter(s => s.rank === 'PCA'),
                  ]}
                  pcaAllocationsByTeam={pcaAllocations}
                  staffOverrides={staffOverrides as any}
                  specialPrograms={specialPrograms}
                  weekday={currentWeekday}
                  stepStatus={stepStatus}
                  initializedSteps={initializedSteps}
                  showStaffIds={userRole === 'developer'}
                />
                    </MaybeProfiler>
                  ) : (
                    <div className="mt-3 rounded-lg border border-border bg-card p-3">
                      <div className="h-4 w-48 rounded-md bg-muted animate-pulse" />
                      <div className="mt-2 h-16 rounded-md bg-muted/70 animate-pulse" />
                    </div>
                  )}
                </div>

                  {!deferBelowFold ? (
                    <MaybeProfiler id="AllocationNotesBoard">
                <AllocationNotesBoard doc={allocationNotesDoc} onSave={saveAllocationNotes} />
                    </MaybeProfiler>
                  ) : (
                    <div className="mt-3 rounded-lg border border-border bg-card p-3">
                      <div className="h-4 w-40 rounded-md bg-muted animate-pulse" />
                      <div className="mt-2 h-20 rounded-md bg-muted/70 animate-pulse" />
              </div>
                  )}
            </div>
          </div>
            </MaybeProfiler>
        </div>
        </ScheduleMainLayout>

        <ScheduleDialogsLayer
          bedCountsDialog={editingBedTeam && (() => {
          const team = editingBedTeam

          const wardRows: BedCountsWardRow[] = wards
            .filter(w => (w.team_assignments[team] || 0) > 0)
            .map(w => ({
              wardName: w.name,
                wardLabel: formatWardLabel(w as any, team),
              wardTotalBeds: w.total_beds,
              baselineTeamBeds: w.team_assignments[team] || 0,
            }))

          const initialOverrides = bedCountsOverridesByTeam?.[team]

          return (
            <BedCountsEditDialog
              open={true}
              onOpenChange={(open) => {
                if (!open) setEditingBedTeam(null)
              }}
              team={team}
              wardRows={wardRows}
              initialOverrides={initialOverrides}
              onSave={(payload: BedCountsOverridePayload) => {
                const wardBedCountsPruned: Record<string, number> = {}
                Object.entries(payload.wardBedCounts || {}).forEach(([wardName, value]) => {
                  if (typeof value === 'number') wardBedCountsPruned[wardName] = value
                })

                const shs = payload.shsBedCounts ?? null
                const students = payload.studentPlacementBedCounts ?? null

                setBedCountsOverridesByTeam(prev => {
                  const next = { ...prev } as any
                  const hasAny =
                    Object.keys(wardBedCountsPruned).length > 0 ||
                    (typeof shs === 'number' && shs > 0) ||
                    (typeof students === 'number' && students > 0)
                  if (!hasAny) {
                    delete next[team]
                    return next
                  }
                  next[team] = {
                    wardBedCounts: wardBedCountsPruned,
                    shsBedCounts: shs,
                    studentPlacementBedCounts: students,
                  } satisfies BedCountsOverrideState
                  return next
                })

                // Mark bed relieving as modified (and review as pending) since bed math changed.
                setStepStatus(prev => ({
                  ...prev,
                  'bed-relieving': prev['bed-relieving'] === 'completed' ? 'modified' : prev['bed-relieving'],
                  'review': 'pending',
                }))
              }}
            />
          )
        })()}
          staffEditDialog={editingStaffId && (() => {
          const staffMember = staff.find(s => s.id === editingStaffId)
          if (!staffMember) return null

          // Find current leave type and FTE from overrides first, then allocations
          const override = staffOverrides[editingStaffId]
          let currentLeaveType: LeaveType | null = override ? override.leaveType : null
          let currentFTERemaining = override ? override.fteRemaining : 1.0
          let currentFTESubtraction = override?.fteSubtraction // Changed from const to let to allow reassignment
          let currentAvailableSlots = override?.availableSlots
          // NEW: Invalid slots array
          let currentInvalidSlots = override?.invalidSlots
          // NEW: AM/PM selection
          let currentAmPmSelection = override?.amPmSelection
          // NEW: Special program availability
          let currentSpecialProgramAvailable = override?.specialProgramAvailable
          // SPT-specific: dashboard-configured base FTE and current base FTE used for leave calculations
          let sptConfiguredFTE: number | undefined = undefined
          let currentSPTBaseFTE: number | undefined = undefined

          // If no override, check allocations
          if (!override) {
            // Check therapist allocations first
            for (const team of TEAMS) {
              const alloc = therapistAllocations[team].find(a => a.staff_id === editingStaffId)
              if (alloc) {
                currentLeaveType = alloc.leave_type
                currentFTERemaining = alloc.fte_therapist ?? 1.0
                break
              }
            }

            // If not found in therapist allocations, check PCA allocations
            if (currentLeaveType === null && currentFTERemaining === 1.0) {
              // Find all PCA allocations for this staff member across all teams
              const allPcaAllocations = TEAMS.flatMap(team => 
                pcaAllocations[team].filter(a => a.staff_id === editingStaffId)
              )
              
              if (allPcaAllocations.length > 0) {
                // Use the leave type from the first allocation found
                currentLeaveType = allPcaAllocations[0].leave_type
                
                // For PCA: Calculate base_FTE_remaining = 1.0 - fteSubtraction for display
                const allocation = allPcaAllocations[0]
                const slotAssigned = (allocation as any)?.slot_assigned ?? (allocation as any)?.fte_assigned ?? 0
                currentFTERemaining = allocation.fte_pca ?? ((allocation.fte_remaining ?? 0) + slotAssigned)
                currentFTESubtraction = 1.0 - currentFTERemaining
                
                // Load invalid slot fields from allocation if not in override
                if ((allocation as any).invalid_slot !== undefined && (allocation as any).invalid_slot !== null) {
                  const invalidSlot = (allocation as any).invalid_slot
                  const getSlotStartTime = (slot: number): string => {
                    const ranges: Record<number, string> = { 1: '0900', 2: '1030', 3: '1330', 4: '1500' }
                    return ranges[slot] || '0900'
                  }
                  const getSlotEndTime = (slot: number): string => {
                    const ranges: Record<number, string> = { 1: '1030', 2: '1200', 3: '1500', 4: '1630' }
                    return ranges[slot] || '1030'
                  }
                  currentInvalidSlots = [{
                    slot: invalidSlot,
                    timeRange: {
                      start: getSlotStartTime(invalidSlot),
                      end: getSlotEndTime(invalidSlot)
                    }
                  }]
                }
                
                // Reconstruct available slots (all slots assigned, excluding invalid slots)
                const allSlots: number[] = []
                if (allocation.slot1) allSlots.push(1)
                if (allocation.slot2) allSlots.push(2)
                if (allocation.slot3) allSlots.push(3)
                if (allocation.slot4) allSlots.push(4)
                if (allSlots.length > 0) {
                  const invalidSlotNumbers = currentInvalidSlots?.map(is => is.slot) || []
                  currentAvailableSlots = allSlots.filter(s => !invalidSlotNumbers.includes(s))
                }
              }
            }
          }

          if (staffMember.rank === 'SPT') {
            const cfg = sptAllocations.find(a => a.staff_id === editingStaffId && a.weekdays?.includes(currentWeekday))
            const cfgFTEraw = (cfg as any)?.fte_addon
            const cfgFTE =
              typeof cfgFTEraw === 'number'
                ? cfgFTEraw
                : cfgFTEraw != null
                  ? parseFloat(String(cfgFTEraw))
                  : NaN
            sptConfiguredFTE = Number.isFinite(cfgFTE) ? Math.max(0, Math.min(cfgFTE, 1.0)) : 0

            const o = staffOverrides[editingStaffId]
            const legacyAutoFilled =
              !!o &&
              (o.leaveType == null) &&
              typeof o.fteSubtraction === 'number' &&
              typeof sptConfiguredFTE === 'number' &&
              Math.abs((o.fteRemaining ?? 0) - sptConfiguredFTE) < 0.01 &&
              Math.abs((o.fteSubtraction ?? 0) - (1.0 - (o.fteRemaining ?? 0))) < 0.01

            const leaveCost = legacyAutoFilled
              ? 0
              : (typeof o?.fteSubtraction === 'number' ? o.fteSubtraction : 0)

            const derivedBase =
              typeof o?.fteSubtraction === 'number'
                ? (o.fteRemaining ?? (sptConfiguredFTE ?? currentFTERemaining)) + leaveCost
                : (sptConfiguredFTE ?? (o?.fteRemaining ?? currentFTERemaining))

            currentSPTBaseFTE = Math.max(0, Math.min(derivedBase, 1.0))
            currentFTESubtraction = leaveCost
            currentFTERemaining = Math.max(0, currentSPTBaseFTE - leaveCost)
          }

          return (
            <StaffEditDialog
              open={editDialogOpen}
              onOpenChange={setEditDialogOpen}
              staffName={staffMember.name}
              staffId={editingStaffId}
              staffRank={staffMember.rank}
              currentLeaveType={currentLeaveType}
              currentFTERemaining={currentFTERemaining}
              currentFTESubtraction={currentFTESubtraction}
              sptConfiguredFTE={sptConfiguredFTE}
              currentSPTBaseFTE={currentSPTBaseFTE}
              currentAvailableSlots={currentAvailableSlots}
              currentInvalidSlots={currentInvalidSlots}
              currentAmPmSelection={currentAmPmSelection}
              currentSpecialProgramAvailable={currentSpecialProgramAvailable}
              specialPrograms={specialPrograms}
              weekday={currentWeekday}
              onSave={handleSaveStaffEdit}
            />
          )
        })()}
          tieBreakDialog={
        <TieBreakDialog
          open={tieBreakDialogOpen}
          teams={tieBreakTeams}
          pendingFTE={tieBreakPendingFTE}
          onSelect={(team) => {
            const resolver = tieBreakResolverRef.current
            if (resolver) {
              resolver(team)
              setTieBreakResolver(null)
              tieBreakResolverRef.current = null
            }
            setTieBreakDialogOpen(false)
          }}
        />
          }
          copyWizardDialog={
            copyWizardConfig ? (
          <ScheduleCopyWizard
            open={copyWizardOpen}
            onOpenChange={(open) => {
              if (!open) {
                setCopyWizardOpen(false)
                setCopyWizardConfig(null)
              } else {
                setCopyWizardOpen(true)
              }
            }}
            sourceDate={copyWizardConfig.sourceDate}
            initialTargetDate={copyWizardConfig.targetDate}
            flowType={copyWizardConfig.flowType}
            direction={copyWizardConfig.direction}
            datesWithData={datesWithData}
            holidays={holidays}
            onConfirmCopy={handleConfirmCopy}
          />
            ) : null
          }
          floatingPcaDialog={
        <FloatingPCAConfigDialog
          open={floatingPCAConfigOpen}
          initialPendingFTE={pendingPCAFTEPerTeam}
          pcaPreferences={pcaPreferences}
          floatingPCAs={buildPCADataFromCurrentState().filter(p => p.floating)}
          existingAllocations={recalculateFromCurrentState().existingAllocations}
          specialPrograms={specialPrograms}
          bufferStaff={bufferStaff}
          staffOverrides={staffOverrides}
          onSave={handleFloatingPCAConfigSave}
          onCancel={handleFloatingPCAConfigCancel}
        />
          }
          specialProgramOverrideDialog={
        <SpecialProgramOverrideDialog
          open={showSpecialProgramOverrideDialog}
          onOpenChange={(open) => {
            setShowSpecialProgramOverrideDialog(open)
            if (!open) {
              const resolver = specialProgramOverrideResolverRef.current
              if (resolver) {
                resolver(null)
                setSpecialProgramOverrideResolver(null)
                specialProgramOverrideResolverRef.current = null
              }
            }
          }}
          specialPrograms={specialPrograms}
          allStaff={Array.from(new Map([...staff, ...inactiveStaff].map(s => [s.id, s])).values())}
          sptBaseFteByStaffId={sptBaseFteByStaffId}
          staffOverrides={staffOverrides}
          weekday={getWeekday(selectedDate)}
          onConfirm={(overrides) => {
            const resolver = specialProgramOverrideResolverRef.current
            if (resolver) {
              resolver(overrides)
              setSpecialProgramOverrideResolver(null)
              specialProgramOverrideResolverRef.current = null
            }
            setShowSpecialProgramOverrideDialog(false)
          }}
          onSkip={() => {
            const resolver = specialProgramOverrideResolverRef.current
            if (resolver) {
              resolver({})
              setSpecialProgramOverrideResolver(null)
              specialProgramOverrideResolverRef.current = null
            }
            setShowSpecialProgramOverrideDialog(false)
          }}
          onStaffRefresh={() => {
            return (async () => {
              try {
                await loadStaff()
                await loadSPTAllocations()
              } catch (e) {
                console.error('Error refreshing staff after buffer creation:', e)
              }
            })()
          }}
        />
          }
          nonFloatingSubstitutionDialog={
            substitutionWizardData ? (
          <NonFloatingSubstitutionDialog
            open={substitutionWizardOpen}
            teams={substitutionWizardData.teams}
            substitutionsByTeam={substitutionWizardData.substitutionsByTeam}
            isWizardMode={substitutionWizardData.isWizardMode}
            initialSelections={substitutionWizardData.initialSelections}
            allStaff={staff}
            pcaPreferences={pcaPreferences}
            specialPrograms={specialPrograms}
            weekday={getWeekday(selectedDate)}
                currentAllocations={[]}
            staffOverrides={staffOverrides}
            onConfirm={handleSubstitutionWizardConfirm}
            onCancel={handleSubstitutionWizardCancel}
            onSkip={handleSubstitutionWizardSkip}
          />
            ) : null
          }
          calendarPopover={
        <ScheduleCalendarPopover
          open={calendarOpen}
          selectedDate={selectedDate}
          datesWithData={datesWithData}
          holidays={holidays}
          onClose={() => setCalendarOpen(false)}
          onDateSelect={(date) => {
            beginDateTransition(date)
            setCalendarOpen(false)
          }}
          anchorRef={calendarButtonRef}
          popoverRef={calendarPopoverRef}
            />
          }
        />
      </div>
    </DndContext>
  )
}

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <SchedulePageContent />
    </Suspense>
  )
}
