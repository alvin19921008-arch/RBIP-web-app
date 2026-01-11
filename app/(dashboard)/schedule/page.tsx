'use client'

import { useState, useEffect, useLayoutEffect, useRef, Fragment, useCallback, Suspense, useMemo, type ReactNode } from 'react'
import { DndContext, DragOverlay, DragEndEvent, DragStartEvent, DragMoveEvent, Active } from '@dnd-kit/core'
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
  SnapshotHealthReport,
} from '@/types/schedule'
import { Staff } from '@/types/staff'
import { TeamColumn } from '@/components/allocation/TeamColumn'
import { StaffPool } from '@/components/allocation/StaffPool'
import { TherapistBlock } from '@/components/allocation/TherapistBlock'
import { PCABlock } from '@/components/allocation/PCABlock'
import { PCADedicatedScheduleTable } from '@/components/allocation/PCADedicatedScheduleTable'
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
import { ScheduleCopyWizard } from '@/components/allocation/ScheduleCopyWizard'
import { Button } from '@/components/ui/button'
import { ActionToast, type ActionToastVariant } from '@/components/ui/action-toast'
import { LoadingAnimation } from '@/components/ui/loading-animation'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { StaffEditDialog } from '@/components/allocation/StaffEditDialog'
import { TieBreakDialog } from '@/components/allocation/TieBreakDialog'
import { StepIndicator } from '@/components/allocation/StepIndicator'
import { FloatingPCAConfigDialog } from '@/components/allocation/FloatingPCAConfigDialog'
import { NonFloatingSubstitutionDialog } from '@/components/allocation/NonFloatingSubstitutionDialog'
import { SpecialProgramOverrideDialog } from '@/components/allocation/SpecialProgramOverrideDialog'
import { SlotSelectionPopover } from '@/components/allocation/SlotSelectionPopover'
import { Save, Calendar, MoreVertical, RefreshCw, RotateCcw, X, ArrowLeft, Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CalendarGrid } from '@/components/ui/calendar-grid'
import { Tooltip } from '@/components/ui/tooltip'
import { getHongKongHolidays } from '@/lib/utils/hongKongHolidays'
import { getNextWorkingDay, getPreviousWorkingDay, isWorkingDay } from '@/lib/utils/dateHelpers'
import { createClientComponentClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { allocateTherapists, StaffData, AllocationContext } from '@/lib/algorithms/therapistAllocation'
import { allocatePCA, PCAAllocationContext, PCAData, FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import { allocateBeds, BedAllocationContext } from '@/lib/algorithms/bedAllocation'
import { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { executeSlotAssignments, SlotAssignment } from '@/lib/utils/reservationLogic'
import { Input } from '@/components/ui/input'
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
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { buildBaselineSnapshotEnvelope, unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import { extractReferencedStaffIds, validateAndRepairBaselineSnapshot } from '@/lib/utils/snapshotValidation'
import { minifySpecialProgramsForSnapshot } from '@/lib/utils/snapshotMinify'
import { createTimingCollector, type TimingReport } from '@/lib/utils/timing'
import { getCachedSchedule, cacheSchedule, clearCachedSchedule } from '@/lib/utils/scheduleCache'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const EMPTY_BED_ALLOCATIONS: BedAllocation[] = []

// Cache RPC availability to avoid repeated failing calls when migrations aren't applied yet.
let cachedSaveScheduleRpcAvailable: boolean | null = null
let cachedLoadScheduleRpcAvailable: boolean | null = null

// Step definitions for step-wise allocation workflow
const ALLOCATION_STEPS = [
  { id: 'leave-fte', number: 1, title: 'Leave & FTE', description: 'Set staff leave types and FTE remaining' },
  { id: 'therapist-pca', number: 2, title: 'Therapist & PCA', description: 'Generate therapist and non-floating PCA allocations' },
  { id: 'floating-pca', number: 3, title: 'Floating PCA', description: 'Distribute floating PCAs to teams' },
  { id: 'bed-relieving', number: 4, title: 'Bed Relieving', description: 'Calculate bed distribution' },
  { id: 'review', number: 5, title: 'Review', description: 'Review and finalize schedule' },
]

// Default date: 1/12/2025 (Monday)
const DEFAULT_DATE = new Date(2025, 11, 1) // Month is 0-indexed, so 11 = December

function getWeekday(date: Date): Weekday {
  const day = date.getDay()
  const weekdayMap: { [key: number]: Weekday } = {
    1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri'
  }
  return weekdayMap[day] || 'mon'
}

function formatDateDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatDateForInput(date: Date): string {
  // Use local date components to avoid timezone issues
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateFromInput(dateStr: string): Date {
  // Parse YYYY-MM-DD format and create date in local timezone
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function SchedulePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const navLoading = useNavigationLoading()
  const rightContentRef = useRef<HTMLDivElement | null>(null)
  const [rightContentHeight, setRightContentHeight] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(DEFAULT_DATE)
  
  // Read date from URL query parameter on mount and when searchParams change
  useEffect(() => {
    const dateParam = searchParams.get('date')
    
    if (dateParam) {
      try {
        const parsedDate = parseDateFromInput(dateParam)
        
        // Only update if the date is different to avoid infinite loops
        if (parsedDate.getTime() !== selectedDate.getTime()) {
          setSelectedDate(parsedDate)
        }
      } catch (error) {
        console.error('Error parsing date from URL:', error)
      }
    }
  }, [searchParams]) // Only depend on searchParams, not selectedDate to avoid loops
  const [showBackButton, setShowBackButton] = useState(false)
  const [therapistAllocations, setTherapistAllocations] = useState<Record<Team, (TherapistAllocation & { staff: Staff })[]>>({
    FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
  })
  const [pcaAllocations, setPcaAllocations] = useState<Record<Team, (PCAAllocation & { staff: Staff })[]>>({
    FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
  })
  const [bedAllocations, setBedAllocations] = useState<BedAllocation[]>([])
  const [calculations, setCalculations] = useState<Record<Team, ScheduleCalculations | null>>({
    FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null
  })
  // Flag to track if we've loaded stored calculations (prevents useEffect from recalculating)
  const [hasLoadedStoredCalculations, setHasLoadedStoredCalculations] = useState(false)
  // Flag to prevent recalculation during initial hydration when stored calculations exist
  const [isHydratingSchedule, setIsHydratingSchedule] = useState(false)
  const [staff, setStaff] = useState<Staff[]>([])
  const [inactiveStaff, setInactiveStaff] = useState<Staff[]>([])
  const [bufferStaff, setBufferStaff] = useState<Staff[]>([])
  const [specialPrograms, setSpecialPrograms] = useState<SpecialProgram[]>([])
  const [sptAllocations, setSptAllocations] = useState<SPTAllocation[]>([])
  const [wards, setWards] = useState<{ name: string; total_beds: number; team_assignments: Record<Team, number>; team_assignment_portions?: Record<Team, string> }[]>([])
  const [pcaPreferences, setPcaPreferences] = useState<PCAPreference[]>([])
  const [loading, setLoading] = useState(false)
  const [gridLoading, setGridLoading] = useState(true)
  const gridLoadingUsesLocalBarRef = useRef(false)
  const [userRole, setUserRole] = useState<'developer' | 'admin' | 'user'>('user')
  const toastTimerRef = useRef<any>(null)
  const toastIdRef = useRef(0)
  const highlightTimerRef = useRef<any>(null)
  const actionToastContainerRef = useRef<HTMLDivElement | null>(null)
  const [actionToast, setActionToast] = useState<{
    id: number
    title: string
    description?: string
    variant: ActionToastVariant
    actions?: ReactNode
    persistUntilDismissed?: boolean
    dismissOnOutsideClick?: boolean
    open: boolean
  } | null>(null)
  const [highlightDateKey, setHighlightDateKey] = useState<string | null>(null)
  const [isDateHighlighted, setIsDateHighlighted] = useState(false)
  const [lastSaveTiming, setLastSaveTiming] = useState<TimingReport | null>(null)
  const [lastCopyTiming, setLastCopyTiming] = useState<TimingReport | null>(null)
  const [lastLoadTiming, setLastLoadTiming] = useState<TimingReport | null>(null)
  const teamHeaderScrollRef = useRef<HTMLDivElement | null>(null)
  const teamGridScrollRef = useRef<HTMLDivElement | null>(null)
  const teamScrollSyncSourceRef = useRef<'header' | 'grid' | null>(null)
  const teamScrollSyncRafRef = useRef<number | null>(null)
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
  const [tieBreakDecisions, setTieBreakDecisions] = useState<Record<string, Team>>({}) // Store tie-breaker decisions: key = `${teams.sort().join(',')}:${pendingFTE}`, value = selected team

  // Sync horizontal scrolling between sticky team header and grid (Excel-like).
  useEffect(() => {
    const headerEl = teamHeaderScrollRef.current
    const gridEl = teamGridScrollRef.current
    if (!headerEl || !gridEl) return

    // Align header with any existing grid scroll on mount.
    headerEl.scrollLeft = gridEl.scrollLeft

    const scheduleUnlock = () => {
      if (teamScrollSyncRafRef.current) {
        cancelAnimationFrame(teamScrollSyncRafRef.current)
      }
      teamScrollSyncRafRef.current = requestAnimationFrame(() => {
        teamScrollSyncSourceRef.current = null
        teamScrollSyncRafRef.current = null
      })
    }

    const onHeaderScroll = () => {
      if (teamScrollSyncSourceRef.current === 'grid') return
      teamScrollSyncSourceRef.current = 'header'
      gridEl.scrollLeft = headerEl.scrollLeft
      scheduleUnlock()
    }

    const onGridScroll = () => {
      if (teamScrollSyncSourceRef.current === 'header') return
      teamScrollSyncSourceRef.current = 'grid'
      headerEl.scrollLeft = gridEl.scrollLeft
      scheduleUnlock()
    }

    headerEl.addEventListener('scroll', onHeaderScroll, { passive: true })
    gridEl.addEventListener('scroll', onGridScroll, { passive: true })

    return () => {
      headerEl.removeEventListener('scroll', onHeaderScroll)
      gridEl.removeEventListener('scroll', onGridScroll)
      if (teamScrollSyncRafRef.current) {
        cancelAnimationFrame(teamScrollSyncRafRef.current)
        teamScrollSyncRafRef.current = null
      }
      teamScrollSyncSourceRef.current = null
    }
  }, [])

  // Keep the Staff Pool column ending at the same bottom edge as the right content (incl. PCA dedicated table),
  // while keeping Staff Pool itself internally scrollable.
  useLayoutEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | null = null

    let attempts = 0
    const maxAttempts = 10

    const attach = () => {
      if (cancelled) return
      const el = rightContentRef.current
      if (!el) {
        attempts += 1
        if (attempts < maxAttempts) requestAnimationFrame(attach)
        return
      }

      const update = () => {
        if (cancelled) return
        // offsetHeight can briefly report 0 during layout transitions; ignore those.
        const h = el.offsetHeight
        if (h > 0) setRightContentHeight(h)
      }

      update()
      ro = new ResizeObserver(() => update())
      ro.observe(el)
    }

    attach()

    return () => {
      cancelled = true
      ro?.disconnect()
    }
  }, [])

  type SpecialProgramOverrideEntry = {
    programId: string
    therapistId?: string
    pcaId?: string
    slots?: number[]
    therapistFTESubtraction?: number
    pcaFTESubtraction?: number
    drmAddOn?: number
  }

  // Store staff leave/FTE overrides for the current date
  const [staffOverrides, setStaffOverrides] = useState<Record<string, {
    leaveType: LeaveType | null;
    fteRemaining: number;
    team?: Team;
    fteSubtraction?: number;
    availableSlots?: number[];
    // Backward-compatible leave/come-back fields (used by PCA allocation algorithm + DB columns)
    invalidSlot?: number;
    leaveComebackTime?: string;
    isLeave?: boolean;
    // NEW: Invalid slots with time ranges
    invalidSlots?: Array<{
      slot: number  // 1, 2, 3, or 4
      timeRange: {
        start: string  // "1030" (HHMM format)
        end: string    // "1100" (HHMM format)
      }
    }>
    // NEW: Therapist AM/PM selection
    amPmSelection?: 'AM' | 'PM'  // Only when fteRemaining = 0.5 or 0.25
    // NEW: Therapist special program availability
    specialProgramAvailable?: boolean  // Only for therapists with special_program (not DRO)
    // Step 2.0: special program overrides
    specialProgramOverrides?: SpecialProgramOverrideEntry[]
    slotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null };
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
  }>>({})
  const [currentScheduleId, setCurrentScheduleId] = useState<string | null>(null)
  const [savedOverrides, setSavedOverrides] = useState<Record<string, {
    leaveType: LeaveType | null;
    fteRemaining: number;
    team?: Team;
    fteSubtraction?: number;
    availableSlots?: number[];
    // Backward-compatible leave/come-back fields (used by PCA allocation algorithm + DB columns)
    invalidSlot?: number;
    leaveComebackTime?: string;
    isLeave?: boolean;
    // NEW: Invalid slots with time ranges
    invalidSlots?: Array<{
      slot: number  // 1, 2, 3, or 4
      timeRange: {
        start: string  // "1030" (HHMM format)
        end: string    // "1100" (HHMM format)
      }
    }>
    // NEW: Therapist AM/PM selection
    amPmSelection?: 'AM' | 'PM'  // Only when fteRemaining = 0.5 or 0.25
    // NEW: Therapist special program availability
    specialProgramAvailable?: boolean  // Only for therapists with special_program (not DRO)
    // Step 2.0: special program overrides
    specialProgramOverrides?: SpecialProgramOverrideEntry[]
    slotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null };
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
  }>>({})
  const [saving, setSaving] = useState(false)
  const [scheduleLoadedForDate, setScheduleLoadedForDate] = useState<string | null>(null) // Track which date's schedule is loaded
  const [hasSavedAllocations, setHasSavedAllocations] = useState(false) // Track if we loaded allocations from DB (to skip regeneration)
  type BedCountsOverridesByTeam = Partial<Record<Team, BedCountsOverrideState>>
  const [bedCountsOverridesByTeam, setBedCountsOverridesByTeam] = useState<BedCountsOverridesByTeam>({})
  const [savedBedCountsOverridesByTeam, setSavedBedCountsOverridesByTeam] = useState<BedCountsOverridesByTeam>({})
  type BedRelievingNotesState = BedRelievingNotesByToTeam
  const [bedRelievingNotesByToTeam, setBedRelievingNotesByToTeam] = useState<BedRelievingNotesState>({})
  const [savedBedRelievingNotesByToTeam, setSavedBedRelievingNotesByToTeam] = useState<BedRelievingNotesState>({})
  const [allocationNotesDoc, setAllocationNotesDoc] = useState<any>(null)
  const [savedAllocationNotesDoc, setSavedAllocationNotesDoc] = useState<any>(null)
  const [editingBedTeam, setEditingBedTeam] = useState<Team | null>(null)
  const saveBedRelievingNotesForToTeam = useCallback(
    (toTeam: Team, notes: Partial<Record<Team, BedRelievingNoteRow[]>>) => {
      setBedRelievingNotesByToTeam(prev => ({
        ...(prev as any),
        [toTeam]: notes,
      }))
      setStepStatus(prev => ({
        ...prev,
        'bed-relieving': 'modified',
      }))
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
  const [pendingPCAFTEPerTeam, setPendingPCAFTEPerTeam] = useState<Record<Team, number>>({
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
  })
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set())
  const [datesWithDataLoading, setDatesWithDataLoading] = useState(false)
  const datesWithDataLoadedAtRef = useRef<number | null>(null)
  const datesWithDataInFlightRef = useRef<Promise<void> | null>(null)
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
  // Step-wise allocation workflow state
  const [currentStep, setCurrentStep] = useState<string>('leave-fte')
  const [stepStatus, setStepStatus] = useState<Record<string, 'pending' | 'completed' | 'modified'>>({
    'leave-fte': 'pending',
    'therapist-pca': 'pending',
    'floating-pca': 'pending',
    'bed-relieving': 'pending',
    'review': 'pending',
  })
  // Persisted workflow state from database (daily_schedules.workflow_state)
  const [persistedWorkflowState, setPersistedWorkflowState] = useState<WorkflowState | null>(null)
  // Baseline snapshot for this schedule date (daily_schedules.baseline_snapshot)
  const [baselineSnapshot, setBaselineSnapshot] = useState<BaselineSnapshot | null>(null)
  // Runtime-only snapshot health report (for admin dev panel)
  const [snapshotHealthReport, setSnapshotHealthReport] = useState<SnapshotHealthReport | null>(null)
  // Intermediate state for step-wise allocation (passed between steps)
  const [step2Result, setStep2Result] = useState<{
    pcaData: PCAData[]
    teamPCAAssigned: Record<Team, number>
    nonFloatingAllocations: PCAAllocation[]
    rawAveragePCAPerTeam: Record<Team, number>
  } | null>(null)
  // PCA allocation errors (for display in step indicator)
  const [pcaAllocationErrors, setPcaAllocationErrors] = useState<{
    missingSlotSubstitution?: string
    specialProgramAllocation?: string
    preferredSlotUnassigned?: string  // Step 3.4: preferred slots that couldn't be assigned
  }>({})
  // Dropdown menu state for dev/testing options
  const [showDevMenu, setShowDevMenu] = useState(false)
  // Track which steps have been initialized
  const [initializedSteps, setInitializedSteps] = useState<Set<string>>(new Set())
  
  // Step 3.1: Floating PCA Configuration Dialog state
  const [floatingPCAConfigOpen, setFloatingPCAConfigOpen] = useState(false)
  
  // Step 2.0: Special Program Override Dialog state
  const [showSpecialProgramOverrideDialog, setShowSpecialProgramOverrideDialog] = useState(false)
  const [specialProgramOverrideResolver, setSpecialProgramOverrideResolver] = useState<((overrides: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }>) => void) | null>(null)
  const specialProgramOverrideResolverRef = useRef<((overrides: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }>) => void) | null>(null)
  
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

        // Reset Step 2-related data: clear availableSlots for floating PCAs (preserve buffer PCA)
        const cleanedOverrides = { ...mergedOverrides }
        const floatingPCAIds = new Set(
          staff
            .filter(s => s.rank === 'PCA' && s.floating)
            .map(s => s.id)
        )
        floatingPCAIds.forEach(pcaId => {
          if (cleanedOverrides[pcaId]) {
            const staffMember = staff.find(s => s.id === pcaId)
            const isBuffer = staffMember?.status === 'buffer'
            if (isBuffer) return
            const { availableSlots, ...otherOverrides } = cleanedOverrides[pcaId]
            cleanedOverrides[pcaId] = otherOverrides
          }
        })

        setStaffOverrides(cleanedOverrides)

        await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)
        setInitializedSteps(prev => new Set(prev).add('therapist-pca'))
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
      }>
    }>>
    isWizardMode: boolean // true if multiple teams, false if single team
    initialSelections?: Record<string, { floatingPCAId: string; slots: number[] }>
  } | null>(null)
  const substitutionWizardResolverRef = useRef<((selections: Record<string, { floatingPCAId: string; slots: number[] }>) => void) | null>(null)
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

  // Warning popover for bed relieving edit outside Step 4
  const [bedRelievingEditWarningPopover, setBedRelievingEditWarningPopover] = useState<{
    show: boolean
    position: { x: number; y: number } | null
  }>({
    show: false,
    position: null,
  })
  
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
      const hoveredTeam = findTeamAtPoint(e.clientX, e.clientY)
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

  const dismissActionToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    setActionToast(prev => (prev ? { ...prev, open: false } : null))
  }, [])

  const showActionToast = (
    title: string,
    variant: ActionToastVariant = 'success',
    description?: string,
    options?: {
      durationMs?: number
      actions?: ReactNode
      persistUntilDismissed?: boolean
      dismissOnOutsideClick?: boolean
    }
  ) => {
    const id = (toastIdRef.current += 1)
    setActionToast({
      id,
      title,
      description,
      variant,
      actions: options?.actions,
      persistUntilDismissed: options?.persistUntilDismissed,
      dismissOnOutsideClick: options?.dismissOnOutsideClick,
      open: true,
    })

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null

    if (!options?.persistUntilDismissed) {
      toastTimerRef.current = setTimeout(() => {
        setActionToast(prev => (prev && prev.id === id ? { ...prev, open: false } : prev))
      }, options?.durationMs ?? 3000)
    }
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // For persistent toasts (e.g., confirm/cancel), dismiss when user clicks elsewhere.
  useEffect(() => {
    if (!actionToast?.open) return
    if (!actionToast.dismissOnOutsideClick) return

    const onMouseDown = (e: MouseEvent) => {
      const container = actionToastContainerRef.current
      if (!container) return
      if (container.contains(e.target as Node)) return
      dismissActionToast()
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [actionToast?.open, actionToast?.dismissOnOutsideClick, dismissActionToast])

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
    if (staff.length === 0) return

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
    }

    // Wait for the next paint (and a follow-up) so the grid content is on screen.
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish))
  }, [gridLoading, loading, staff.length, scheduleLoadedForDate, selectedDate, navLoading])


  // Load schedule when date changes (cold start should NOT require preloading base tables).
  useEffect(() => {
    let cancelled = false

    // Use local date components to avoid timezone issues
    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    if (scheduleLoadedForDate === dateStr) return

    setIsHydratingSchedule(true)
    setHasSavedAllocations(false)

    const timer = createTimingCollector()

    ;(async () => {
      let result: any = await loadScheduleForDate(selectedDate)
      timer.stage('loadScheduleForDate')
      if (cancelled) return
      let resultAny = result as any

      // Fallback for legacy schedules without baseline_snapshot: load base tables once, then retry.
      const snapshotStaff0: any[] = (resultAny?.baselineSnapshot?.staff || []) as any[]
      const needsBaseDataFallback =
        !resultAny?.meta?.baselineSnapshotUsed &&
        snapshotStaff0.length === 0 &&
        staff.length === 0 &&
        (Array.isArray(resultAny?.therapistAllocs) || Array.isArray(resultAny?.pcaAllocs))

      if (needsBaseDataFallback) {
        await loadAllData()
        timer.stage('loadAllDataFallback')
        result = await loadScheduleForDate(selectedDate)
        timer.stage('retryLoadScheduleForDate')
        if (cancelled) return
        resultAny = result as any
      }

      if (!resultAny) {
        setScheduleLoadedForDate(dateStr)
        setLastLoadTiming(timer.finalize({ dateStr, result: 'null' }))
        return
      }

      const loadedWorkflowState: WorkflowState | null = (resultAny?.workflowState ?? null) as any
      if (loadedWorkflowState && typeof loadedWorkflowState === 'object') {
        if (loadedWorkflowState.currentStep) {
          setCurrentStep(loadedWorkflowState.currentStep)
        }
        if (Array.isArray(loadedWorkflowState.completedSteps)) {
          const baseStatus: Record<string, 'pending' | 'completed' | 'modified'> = {
            'leave-fte': 'pending',
            'therapist-pca': 'pending',
            'floating-pca': 'pending',
            'bed-relieving': 'pending',
            review: 'pending',
          }
          loadedWorkflowState.completedSteps.forEach((stepId: string) => {
            if (baseStatus[stepId]) baseStatus[stepId] = 'completed'
          })
          setStepStatus(baseStatus)
        }
      }
      timer.stage('applyWorkflowState')

      // Prefer stored calculations if available to avoid recalculation on load.
      if (resultAny?.calculations) {
        setCalculations(resultAny.calculations)
        setHasLoadedStoredCalculations(true)
      } else {
        setHasLoadedStoredCalculations(false)
      }
      timer.stage('applyStoredCalculations')

      const snapshotStaff: any[] = (resultAny?.baselineSnapshot?.staff || []) as any[]
      const staffFromSnapshot: Staff[] =
        snapshotStaff.length > 0
          ? snapshotStaff
              .map((raw: any) => ({ ...(raw as any), status: (raw as any).status ?? 'active' } as Staff))
              .filter((s: any) => s.status !== 'inactive')
          : staff

      const hasLeaveData = resultAny.overrides && Object.keys(resultAny.overrides).length > 0
      const hasTherapistData = resultAny.therapistAllocs && resultAny.therapistAllocs.length > 0
      const hasPCAData = resultAny.pcaAllocs && resultAny.pcaAllocs.length > 0
      const hasBedData = resultAny.bedAllocs && resultAny.bedAllocs.length > 0

      if (hasPCAData) {
        // Saved schedule: use saved allocations directly (no algorithm regen).
        useSavedAllocations(resultAny.therapistAllocs, resultAny.pcaAllocs, resultAny.overrides, staffFromSnapshot)
        timer.stage('useSavedAllocations')

        setInitializedSteps(
          new Set<string>([
            'therapist-pca',
            'floating-pca',
            ...(hasBedData ? ['bed-relieving'] : []),
          ])
        )

        if (!resultAny.calculations) {
          // Defer recalculation to a microtask so state updates flush first (no setTimeout).
          queueMicrotask(() => {
            recalculateScheduleCalculations()
          })
        }

        const workflowState: WorkflowState | null = resultAny.workflowState ?? persistedWorkflowState
        let newStepStatus: Record<string, 'pending' | 'completed' | 'modified'> = {
          'leave-fte': hasLeaveData ? 'completed' : 'pending',
          'therapist-pca': hasTherapistData ? 'completed' : 'pending',
          'floating-pca': hasPCAData ? 'completed' : 'pending',
          'bed-relieving': hasBedData ? 'completed' : 'pending',
          review: 'pending',
        }

        if (workflowState && Array.isArray(workflowState.completedSteps)) {
          workflowState.completedSteps.forEach(stepId => {
            if (newStepStatus[stepId]) newStepStatus[stepId] = 'completed'
          })
          if (workflowState.currentStep) {
            setCurrentStep(workflowState.currentStep)
          }
        } else if (hasLeaveData && hasTherapistData && hasPCAData) {
          // Legacy fallback: infer completion from data presence.
          setCurrentStep('review')
          newStepStatus = { ...newStepStatus, review: 'completed' }
        }

        setStepStatus(newStepStatus)
      } else if (resultAny && resultAny.overrides) {
        // No saved allocations: step-wise baseline view (Step 1), no auto-run algos.
        const overrides = (resultAny as any).overrides || {}

        const baselineTherapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = {
          FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
        }
        staffFromSnapshot.forEach(s => {
          if (!s.team) return
          if (!['SPT', 'APPT', 'RPT'].includes(s.rank)) return
          const o = overrides[s.id]
          const fte = typeof o?.fteRemaining === 'number' ? o.fteRemaining : 1.0
          if (fte <= 0) return
          baselineTherapistByTeam[s.team as Team].push({
            id: `baseline-therapist:${dateStr}:${s.id}:${s.team}`,
            schedule_id: '',
            staff_id: s.id,
            team: s.team as Team,
            fte_therapist: fte,
            fte_remaining: Math.max(0, 1.0 - fte),
            slot_whole: null,
            slot1: null,
            slot2: null,
            slot3: null,
            slot4: null,
            leave_type: (o?.leaveType ?? null) as any,
            special_program_ids: null,
            is_substitute_team_head: false,
            spt_slot_display: null,
            is_manual_override: false,
            manual_override_note: null,
            staff: s,
          } as any)
        })
        setTherapistAllocations(baselineTherapistByTeam)

        const baselinePCAByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
          FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
        }
        staffFromSnapshot.forEach(s => {
          if (!s.team) return
          if (s.rank !== 'PCA') return
          if (s.floating) return
          const o = overrides[s.id]
          const baseFTE = s.status === 'buffer' && s.buffer_fte != null ? (s.buffer_fte as any) : 1.0
          const fte = typeof o?.fteRemaining === 'number' ? o.fteRemaining : baseFTE
          if (fte <= 0) return
          baselinePCAByTeam[s.team as Team].push({
            id: `baseline-pca:${dateStr}:${s.id}:${s.team}`,
            schedule_id: '',
            staff_id: s.id,
            team: s.team as Team,
            fte_pca: fte,
            fte_remaining: fte,
            slot_assigned: 0,
            slot_whole: null,
            slot1: null,
            slot2: null,
            slot3: null,
            slot4: null,
            leave_type: (o?.leaveType ?? null) as any,
            special_program_ids: null,
            invalid_slot: null,
            leave_comeback_time: null,
            leave_mode: null,
            staff: s,
          } as any)
        })
        TEAMS.forEach(team => {
          baselinePCAByTeam[team].sort((a, b) => (a.staff?.name ?? '').localeCompare(b.staff?.name ?? ''))
        })
        setPcaAllocations(baselinePCAByTeam)
        setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })
        setBedAllocations([])
        setInitializedSteps(new Set())

        const ws: WorkflowState =
          loadedWorkflowState && typeof loadedWorkflowState === 'object'
            ? loadedWorkflowState
            : { currentStep: 'leave-fte', completedSteps: [] }
        setCurrentStep(ws.currentStep ?? 'leave-fte')
        const nextStatus: Record<string, 'pending' | 'completed' | 'modified'> = {
          'leave-fte': 'pending',
          'therapist-pca': 'pending',
          'floating-pca': 'pending',
          'bed-relieving': 'pending',
          review: 'pending',
        }
        if (Array.isArray(ws.completedSteps)) {
          ws.completedSteps.forEach(stepId => {
            if (nextStatus[stepId]) nextStatus[stepId] = 'completed'
          })
        }
        setStepStatus(nextStatus)
        timer.stage('baselineView')
      } else {
        // No overrides and no saved allocations: keep everything empty.
        setTherapistAllocations({ FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] })
        setPcaAllocations({ FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] })
        setBedAllocations([])
        setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })
        setInitializedSteps(new Set())
      }

      // Mark loaded only after load-driven state updates were applied.
      setScheduleLoadedForDate(dateStr)
      setLastLoadTiming(
        timer.finalize({
          dateStr,
          rpcUsed: !!resultAny?.meta?.rpcUsed,
          batchedQueriesUsed: !!resultAny?.meta?.batchedQueriesUsed,
          baselineSnapshotUsed: !!resultAny?.meta?.baselineSnapshotUsed,
          calculationsSource: resultAny?.meta?.calculationsSource,
          counts: resultAny?.meta?.counts,
          snapshotBytes: resultAny?.meta?.snapshotBytes,
        })
      )
    })().catch((e) => {
      console.error('Error loading schedule:', e)
      setLastLoadTiming(timer.finalize({ dateStr, error: (e as any)?.message || String(e) }))
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, scheduleLoadedForDate]) // Do not depend on base-table preload for cold starts

  // End hydration AFTER the load-driven state updates flush to the screen.
  // This ensures downstream hooks (e.g., useAllocationSync TRIGGER2) can reliably see isHydratingSchedule=true
  // during the load-driven currentStep/staffOverrides updates.
  useEffect(() => {
    if (!isHydratingSchedule) return
    if (loading) return
    if (staff.length === 0) return
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
    if (calendarOpen || copyWizardOpen || copyMenuOpen) {
      loadDatesWithData()
      // Generate holidays for selected year and next year
      const baseYear = selectedDate.getFullYear()
      const holidaysMap = new Map<string, string>()
      const yearHolidays = getHongKongHolidays(baseYear)
      const nextYearHolidays = getHongKongHolidays(baseYear + 1)
      yearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      nextYearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      setHolidays(holidaysMap)
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

  const applyBaselineSnapshot = (snapshot: BaselineSnapshot) => {
    setBaselineSnapshot(snapshot)

    // Derive staff pools from snapshot staff list
    if (snapshot.staff && Array.isArray(snapshot.staff)) {
      const activeStaff: Staff[] = []
      const inactiveStaffList: Staff[] = []
      const bufferStaffList: Staff[] = []

      snapshot.staff.forEach((raw: any) => {
        const status = (raw.status as any) ?? 'active'
        const staffMember: Staff = {
          ...raw,
          status,
        }
        if (status === 'buffer') {
          bufferStaffList.push(staffMember)
        } else if (status === 'inactive') {
          inactiveStaffList.push(staffMember)
        } else {
          activeStaff.push(staffMember)
        }
      })

      // Main staff array used for allocations: active + buffer (matches loadStaff behavior)
      setStaff([...activeStaff, ...bufferStaffList])
      setInactiveStaff(inactiveStaffList)
      setBufferStaff(bufferStaffList)
    }

    if (snapshot.specialPrograms) {
      setSpecialPrograms(snapshot.specialPrograms as any)
    }
    if (snapshot.sptAllocations) {
      setSptAllocations(snapshot.sptAllocations as any)
    }
    if (snapshot.wards) {
      setWards(
        snapshot.wards.map((ward: any) => ({
          name: ward.name,
          total_beds: ward.total_beds,
          team_assignments: ward.team_assignments || {},
          team_assignment_portions: ward.team_assignment_portions || {},
        }))
      )
    }
    if (snapshot.pcaPreferences) {
      setPcaPreferences(snapshot.pcaPreferences as any)
    }
  }

  const buildBaselineSnapshotFromCurrentState = (): BaselineSnapshot => {
    // Include all staff pools (active + buffer + inactive) and dedupe by id
    const all = [...staff, ...inactiveStaff, ...bufferStaff]
    const byId = new Map<string, any>()
    all.forEach(s => {
      if (!s?.id) return
      const status = (s as any).status ?? (bufferStaff.some(b => b.id === s.id) ? 'buffer' : 'active')
      // Snapshot should be a minimal projection to reduce JSONB size.
      // (DB rows may contain extra metadata fields we don't need in the schedule snapshot.)
      byId.set(s.id, {
        ...(byId.get(s.id) || {}),
        id: s.id,
        name: s.name,
        rank: s.rank,
        team: s.team ?? null,
        floating: !!s.floating,
        floor_pca: s.floor_pca ?? null,
        special_program: s.special_program ?? null,
        status,
        buffer_fte: (s as any).buffer_fte ?? (s as any).bufferFte ?? undefined,
      })
    })

    return {
      staff: Array.from(byId.values()) as any,
      specialPrograms: minifySpecialProgramsForSnapshot(specialPrograms) as any,
      sptAllocations: sptAllocations as any,
      wards: wards as any,
      pcaPreferences: pcaPreferences as any,
    }
  }

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
    const { data } = await supabase.from('spt_allocations').select('*')
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

  // Load schedule for date and restore saved overrides / metadata
  const loadScheduleForDate = async (date: Date): Promise<{
    scheduleId: string
    overrides: Record<string, {
      leaveType: LeaveType | null
      fteRemaining: number
      fteSubtraction?: number
      availableSlots?: number[]
      invalidSlot?: number
      leaveComebackTime?: string
      isLeave?: boolean
    }>
    pcaAllocs: any[]
    therapistAllocs: any[]
    bedAllocs: any[]
    baselineSnapshot?: BaselineSnapshot | null
    workflowState?: WorkflowState | null
    calculations?: Record<Team, ScheduleCalculations | null> | null
    meta?: {
      rpcUsed: boolean
      batchedQueriesUsed: boolean
      baselineSnapshotUsed: boolean
      calculationsSource: 'schedule_calculations' | 'snapshot.calculatedValues' | 'none'
      counts: {
        therapistAllocs: number
        pcaAllocs: number
        bedAllocs: number
        calculationsRows: number
      }
      snapshotBytes?: number | null
    }
  } | null> => {
    // Use local date components to avoid timezone issues
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    
    // Check cache first (for fast navigation)
    const cached = getCachedSchedule(dateStr)
    if (cached) {
      console.log(`[ScheduleCache] Using cached data for ${dateStr}`)
      setCurrentScheduleId(cached.scheduleId)
      if (cached.baselineSnapshot) {
        applyBaselineSnapshot(cached.baselineSnapshot)
      }
      if (cached.workflowState) {
        setPersistedWorkflowState(cached.workflowState)
      }
      if (cached.calculations) {
        setCalculations(cached.calculations)
        setHasLoadedStoredCalculations(true) // Mark that we've loaded stored calculations
      }
      if (cached.tieBreakDecisions) {
        setTieBreakDecisions(cached.tieBreakDecisions as any)
      } else {
        setTieBreakDecisions({})
      }
      setStaffOverrides(cached.overrides || {})
      setSavedOverrides(cached.overrides || {})
      setBedCountsOverridesByTeam((cached as any).bedCountsOverridesByTeam || {})
      setSavedBedCountsOverridesByTeam((cached as any).bedCountsOverridesByTeam || {})
      setBedRelievingNotesByToTeam((cached as any).bedRelievingNotesByToTeam || {})
      setSavedBedRelievingNotesByToTeam((cached as any).bedRelievingNotesByToTeam || {})
      setAllocationNotesDoc((cached as any).allocationNotesDoc ?? null)
      setSavedAllocationNotesDoc((cached as any).allocationNotesDoc ?? null)
      setBedAllocations((cached.bedAllocs || []) as any)
      return {
        scheduleId: cached.scheduleId,
        overrides: cached.overrides,
        pcaAllocs: cached.pcaAllocs,
        therapistAllocs: cached.therapistAllocs,
        bedAllocs: cached.bedAllocs || [],
        baselineSnapshot: cached.baselineSnapshot,
        workflowState: cached.workflowState,
        calculations: cached.calculations,
        meta: {
          rpcUsed: false,
          batchedQueriesUsed: false,
          baselineSnapshotUsed: !!cached.baselineSnapshot,
          calculationsSource: cached.calculations ? 'schedule_calculations' : 'none',
          counts: {
            therapistAllocs: (cached.therapistAllocs || []).length,
            pcaAllocs: (cached.pcaAllocs || []).length,
            bedAllocs: (cached.bedAllocs || []).length,
            calculationsRows: cached.calculations
              ? Object.keys(cached.calculations).filter(k => (cached.calculations as any)[k]).length
              : 0,
          },
          snapshotBytes: null,
        },
      }
    }
    let rpcUsed = false
    let batchedQueriesUsed = false
    let rpcBundle: any | null = null

    if (cachedLoadScheduleRpcAvailable !== false) {
      const rpcAttempt = await supabase.rpc('load_schedule_v1', { p_date: dateStr })
      if (!rpcAttempt.error) {
        cachedLoadScheduleRpcAvailable = true
        rpcBundle = rpcAttempt.data as any
        if ((rpcBundle as any)?.schedule?.id) {
          rpcUsed = true
        }
      } else {
        const code = (rpcAttempt.error as any)?.code
        const msg = (rpcAttempt.error as any)?.message || ''
        const isMissingFn =
          code === 'PGRST202' ||
          (msg.includes('load_schedule_v1') &&
            (msg.includes('schema cache') || msg.includes('Could not find') || msg.includes('not found')))
        if (isMissingFn) {
          cachedLoadScheduleRpcAvailable = false
        }
      }
    }

    // Get or create schedule for this date
    // First try with extended columns (including JSONB metadata), fall back to minimal selection if columns don't exist
    let scheduleData: any = rpcUsed ? (rpcBundle as any).schedule : null
    let queryError: any = null
    let createdSeededStaffOverrides: Record<string, any> | null = null

    if (!scheduleData) {
      const initialResult = (await supabase
        .from('daily_schedules')
        .select('id, is_tentative, tie_break_decisions, baseline_snapshot, staff_overrides, workflow_state')
        .eq('date', dateStr)
        .maybeSingle()) as any

      scheduleData = initialResult.data as any
      queryError = initialResult.error

      // If query failed due to missing columns (older schema), retry with minimal selection
      if (queryError && queryError.message?.includes('column')) {
        const fallbackResult = await supabase
          .from('daily_schedules')
          .select('id, is_tentative')
          .eq('date', dateStr)
          .maybeSingle()
        scheduleData = fallbackResult.data as { id: string; is_tentative: boolean } | null
        queryError = (fallbackResult as any).error
      }
    }
    
    let scheduleId: string
    let effectiveWorkflowState: WorkflowState | null = null
    if (!scheduleData) {
      // Create new schedule if it doesn't exist
      // Immediately snapshot current dashboard state for this new schedule to prevent cross-date contamination.
      // If DB schema doesn't have the new columns yet (legacy), fall back to minimal insert.
      const baselineSnapshotToSave = buildBaselineSnapshotFromCurrentState()
      const baselineEnvelopeToSave = buildBaselineSnapshotEnvelope({
        data: baselineSnapshotToSave,
        source: 'save',
      })
      const initialWorkflowState: WorkflowState = { currentStep: 'leave-fte', completedSteps: [] }
      effectiveWorkflowState = initialWorkflowState

      // Seed schedule-level allocation notes from previous working day (if available).
      let seededStaffOverrides: Record<string, any> = {}
      try {
        const prevDate = getPreviousWorkingDay(date)
        const py = prevDate.getFullYear()
        const pm = String(prevDate.getMonth() + 1).padStart(2, '0')
        const pd = String(prevDate.getDate()).padStart(2, '0')
        const prevDateStr = `${py}-${pm}-${pd}`

        const prevRes = await supabase
          .from('daily_schedules')
          .select('staff_overrides')
          .eq('date', prevDateStr)
          .maybeSingle()

        // If legacy schema doesn't have staff_overrides, ignore.
        if (!(prevRes as any)?.error) {
          const prevOverrides = (prevRes as any)?.data?.staff_overrides as any
          const prevNotes = prevOverrides?.__allocationNotes
          if (prevNotes && typeof prevNotes === 'object') {
            seededStaffOverrides = { __allocationNotes: prevNotes }
          }
        }
      } catch {
        // ignore (seed is best-effort)
      }

      let newSchedule: { id: string } | null = null
      let error: any = null

      const attempt = await supabase
        .from('daily_schedules')
        .insert({
          date: dateStr,
          is_tentative: true,
          baseline_snapshot: baselineEnvelopeToSave as any,
          staff_overrides: seededStaffOverrides as any,
          workflow_state: initialWorkflowState as any,
        })
        .select('id')
        .single()

      newSchedule = attempt.data
      error = attempt.error

      if (error && error.message?.includes('column')) {
        const fallback = await supabase
          .from('daily_schedules')
          .insert({ date: dateStr, is_tentative: true })
          .select('id')
          .single()
        newSchedule = fallback.data
        error = fallback.error
      }

      if (error) {
        console.error('Error creating schedule:', error)
        return null
      }

      scheduleId = newSchedule?.id || ''
      createdSeededStaffOverrides = seededStaffOverrides

      // Apply snapshot locally so UI uses it immediately
      applyBaselineSnapshot(baselineSnapshotToSave)
      setPersistedWorkflowState(initialWorkflowState)
      const seededDoc = (seededStaffOverrides as any)?.__allocationNotes?.doc
      setAllocationNotesDoc(seededDoc ?? null)
      setSavedAllocationNotesDoc(seededDoc ?? null)
    } else {
      scheduleId = scheduleData.id
      // Ensure schedule is tentative (required by RLS policy)
      if (!rpcUsed && !scheduleData.is_tentative) {
        const { error: updateError } = await supabase
          .from('daily_schedules')
          .update({ is_tentative: true })
          .eq('id', scheduleId)
        if (updateError) {
          console.error('Error updating schedule to tentative:', updateError)
          return null
        }
      }
    }
    
    if (!scheduleId) {
      return null
    }
    
    setCurrentScheduleId(scheduleId)
    
    // Load tie-breaker decisions if they exist
    if ((scheduleData as any)?.tie_break_decisions) {
      setTieBreakDecisions((scheduleData as any).tie_break_decisions as Record<string, Team>)
    } else {
      setTieBreakDecisions({})
    }
    const tieBreakDecisionsForCache = ((scheduleData as any)?.tie_break_decisions || {}) as any

    // Load and apply baseline snapshot if present (supports both legacy raw snapshot and v1 envelope)
    const rawBaselineSnapshotStored = (scheduleData as any)?.baseline_snapshot as BaselineSnapshotStored | undefined
    const hasBaselineSnapshot =
      rawBaselineSnapshotStored &&
      typeof rawBaselineSnapshotStored === 'object' &&
      Object.keys(rawBaselineSnapshotStored as any).length > 0
    if (hasBaselineSnapshot) {
      const { data } = unwrapBaselineSnapshotStored(rawBaselineSnapshotStored)
      applyBaselineSnapshot(data)
    }

    // Load workflow state if present (for newly created schedules we already set effectiveWorkflowState above)
    const rawWorkflowState = (scheduleData as any)?.workflow_state as WorkflowState | undefined
    if (!effectiveWorkflowState) {
      if (rawWorkflowState && typeof rawWorkflowState === 'object') {
        effectiveWorkflowState = rawWorkflowState
      } else {
        effectiveWorkflowState = { currentStep: 'leave-fte', completedSteps: [] }
      }
    }
    setPersistedWorkflowState(effectiveWorkflowState)
    
    // OPTIMIZATION: Prefer one RPC round-trip if available; otherwise batch queries in parallel.
    let therapistAllocs: any[] = []
    let pcaAllocs: any[] = []
    let bedAllocs: any[] = []
    let scheduleCalcsRows: any[] = []

    if (rpcUsed) {
      therapistAllocs = ((rpcBundle as any)?.therapist_allocations as any[]) || []
      pcaAllocs = ((rpcBundle as any)?.pca_allocations as any[]) || []
      bedAllocs = ((rpcBundle as any)?.bed_allocations as any[]) || []
      scheduleCalcsRows = ((rpcBundle as any)?.calculations as any[]) || []
    } else {
      batchedQueriesUsed = true
      const [therapistResult, pcaResult, bedResult, calcsResult] = await Promise.all([
        supabase.from('schedule_therapist_allocations').select('*').eq('schedule_id', scheduleId),
        supabase.from('schedule_pca_allocations').select('*').eq('schedule_id', scheduleId),
        supabase.from('schedule_bed_allocations').select('*').eq('schedule_id', scheduleId),
        supabase.from('schedule_calculations').select('*').eq('schedule_id', scheduleId),
      ])

      therapistAllocs = (therapistResult as any).data || []
      pcaAllocs = (pcaResult as any).data || []
      bedAllocs = (bedResult as any).data || []
      scheduleCalcsRows = ((calcsResult as any).data || []) as any[]
    }

    setBedAllocations((bedAllocs || []) as any)

    // If this is a legacy/blank schedule with no snapshot yet, create snapshot once.
    // Do NOT overwrite if the schedule already has a snapshot (e.g., created via copy API).
    const existingSnapshot = (scheduleData as any)?.baseline_snapshot as BaselineSnapshotStored | undefined
    const hasSnapshot =
      existingSnapshot && typeof existingSnapshot === 'object' && Object.keys(existingSnapshot as any).length > 0
    const hasAnyAllocations = (therapistAllocs?.length || 0) > 0 || (pcaAllocs?.length || 0) > 0
    const persistedOverridesCandidate = (scheduleData as any)?.staff_overrides
    const hasPersistedOverrides =
      persistedOverridesCandidate &&
      typeof persistedOverridesCandidate === 'object' &&
      Object.keys(persistedOverridesCandidate as any).length > 0

    if (!hasSnapshot && !hasAnyAllocations && !hasPersistedOverrides) {
      const baselineSnapshotToSave = buildBaselineSnapshotFromCurrentState()
      const baselineEnvelopeToSave = buildBaselineSnapshotEnvelope({
        data: baselineSnapshotToSave,
        source: 'save',
      })
      const initialWorkflowState: WorkflowState = { currentStep: 'leave-fte', completedSteps: [] }
      const { error: snapshotError } = await supabase
        .from('daily_schedules')
        .update({
          baseline_snapshot: baselineEnvelopeToSave as any,
          workflow_state: (scheduleData as any)?.workflow_state || (initialWorkflowState as any),
        })
        .eq('id', scheduleId)
      if (!snapshotError) {
        applyBaselineSnapshot(baselineSnapshotToSave)
        setPersistedWorkflowState((scheduleData as any)?.workflow_state || initialWorkflowState)
      }
    }
    
    
    // Build overrides from saved allocations or use persisted staff_overrides if present
    // Use centralized fromDbLeaveType from lib/db/types.ts for type conversion
    const persistedOverrides = ((scheduleData as any)?.staff_overrides ??
      createdSeededStaffOverrides) as Record<string, any> | undefined
    const overrides: Record<string, {
      leaveType: LeaveType | null
      fteRemaining: number
      fteSubtraction?: number
      availableSlots?: number[]
      invalidSlot?: number
      leaveComebackTime?: string
      isLeave?: boolean
    }> = {}
    let bedCountsByTeamForCache: any = {}
    let bedRelievingByToTeamForCache: any = {}
    let allocationNotesDocForCache: any = null

    if (persistedOverrides && Object.keys(persistedOverrides).length > 0) {
      // Extract schedule-level bed count overrides (stored under __bedCounts) and keep them in a dedicated state.
      const persistedBedCountsByTeam = (persistedOverrides as any)?.__bedCounts?.byTeam
      if (persistedBedCountsByTeam && typeof persistedBedCountsByTeam === 'object') {
        bedCountsByTeamForCache = persistedBedCountsByTeam as any
        setBedCountsOverridesByTeam(persistedBedCountsByTeam as any)
        setSavedBedCountsOverridesByTeam(persistedBedCountsByTeam as any)
      } else {
        bedCountsByTeamForCache = {}
        setBedCountsOverridesByTeam({})
        setSavedBedCountsOverridesByTeam({})
      }

      // Extract schedule-level bed relieving notes (stored under __bedRelieving) and keep them in a dedicated state.
      const persistedBedRelievingByToTeam = (persistedOverrides as any)?.__bedRelieving?.byToTeam
      if (persistedBedRelievingByToTeam && typeof persistedBedRelievingByToTeam === 'object') {
        bedRelievingByToTeamForCache = persistedBedRelievingByToTeam as any
        setBedRelievingNotesByToTeam(persistedBedRelievingByToTeam as any)
        setSavedBedRelievingNotesByToTeam(persistedBedRelievingByToTeam as any)
      } else {
        bedRelievingByToTeamForCache = {}
        setBedRelievingNotesByToTeam({})
        setSavedBedRelievingNotesByToTeam({})
      }

      // Extract schedule-level allocation notes (stored under __allocationNotes).
      const persistedAllocationNotes = (persistedOverrides as any)?.__allocationNotes
      const persistedAllocationNotesDoc = (persistedAllocationNotes as any)?.doc
      if (persistedAllocationNotes && typeof persistedAllocationNotes === 'object') {
        allocationNotesDocForCache = persistedAllocationNotesDoc ?? null
        setAllocationNotesDoc(persistedAllocationNotesDoc ?? null)
        setSavedAllocationNotesDoc(persistedAllocationNotesDoc ?? null)
      } else {
        allocationNotesDocForCache = null
        setAllocationNotesDoc(null)
        setSavedAllocationNotesDoc(null)
      }

      // Use staff_overrides JSON from database as single source of truth
      const persistedStaffOverrides = { ...(persistedOverrides as any) }
      delete (persistedStaffOverrides as any).__bedCounts
      delete (persistedStaffOverrides as any).__bedRelieving
      delete (persistedStaffOverrides as any).__allocationNotes
      Object.assign(overrides, persistedStaffOverrides)

      // Normalize legacy "on duty" leave types that may have been persisted as strings.
      Object.values(overrides as any).forEach((o: any) => {
        if (!o || typeof o !== 'object') return
        if (isOnDutyLeaveType(o.leaveType)) {
          o.leaveType = null
        }
      })
    } else {
      // No persisted staff_overrides: clear bed count overrides as well
      bedCountsByTeamForCache = {}
      setBedCountsOverridesByTeam({})
      setSavedBedCountsOverridesByTeam({})
      bedRelievingByToTeamForCache = {}
      setBedRelievingNotesByToTeam({})
      setSavedBedRelievingNotesByToTeam({})
      allocationNotesDocForCache = null
      setAllocationNotesDoc(null)
      setSavedAllocationNotesDoc(null)

      // Legacy path: derive overrides from saved allocations
      therapistAllocs?.forEach(alloc => {
        if (alloc.leave_type !== null || alloc.fte_therapist !== 1) {
          const fte = parseFloat(alloc.fte_therapist.toString())
          // Use centralized type conversion that handles manual_override_note
          const leaveType = fromDbLeaveType(alloc.leave_type as any, fte, alloc.manual_override_note)
          overrides[alloc.staff_id] = {
            leaveType: leaveType,
            fteRemaining: fte,
          }
        }
      })

      pcaAllocs?.forEach(alloc => {
        if (alloc.leave_type !== null || alloc.fte_pca !== 1) {
          if (!overrides[alloc.staff_id]) {
            // For PCA: determine the correct FTE to use
            // If PCA is on leave (leave_type !== null), use fte_pca
            // If PCA is NOT on leave but is special program PCA, use 1.0 (base FTE)
            // This fixes a bug where special program PCAs had fte_pca set to their assigned slots FTE (e.g., 0.25) instead of base FTE
            const isOnLeave = alloc.leave_type !== null
            const isSpecialProgramPCA = alloc.special_program_ids && alloc.special_program_ids.length > 0
            const fte = isOnLeave
              ? parseFloat(alloc.fte_pca.toString()) // On leave: use stored FTE
              : (isSpecialProgramPCA ? 1.0 : parseFloat(alloc.fte_pca.toString())) // Special program: use base FTE 1.0
            // Use centralized type conversion from lib/db/types.ts
            const override: {
              leaveType: LeaveType | null
              fteRemaining: number
              fteSubtraction?: number
              availableSlots?: number[]
              invalidSlot?: number
              leaveComebackTime?: string
              isLeave?: boolean
            } = {
              leaveType: fromDbLeaveType(alloc.leave_type as any, fte, null),
              fteRemaining: fte,
            }

            // Load new fields if they exist
            if (alloc.invalid_slot !== null && alloc.invalid_slot !== undefined) {
              override.invalidSlot = alloc.invalid_slot
            }
            if (alloc.leave_comeback_time) {
              override.leaveComebackTime = alloc.leave_comeback_time
            }
            if (alloc.leave_mode) {
              override.isLeave = alloc.leave_mode === 'leave'
            }
            // Note: fte_subtraction is not stored in database - it's calculated from staffOverrides when needed
            // If the column exists in future migrations, we can load it here
            // For now, fteSubtraction is calculated from fte_pca and other fields when needed

            // Reconstruct available slots from slot assignments (exclude invalid slot)
            const invalidSlot = (alloc as any).invalid_slot
            const availableSlots: number[] = []
            if (alloc.slot1 && (invalidSlot !== 1 || alloc.slot1 === alloc.team)) availableSlots.push(1)
            if (alloc.slot2 && (invalidSlot !== 2 || alloc.slot2 === alloc.team)) availableSlots.push(2)
            if (alloc.slot3 && (invalidSlot !== 3 || alloc.slot3 === alloc.team)) availableSlots.push(3)
            if (alloc.slot4 && (invalidSlot !== 4 || alloc.slot4 === alloc.team)) availableSlots.push(4)
            // Actually, invalid slot is still assigned to team, so we need to include it but mark it separately
            // The availableSlots should be all slots assigned to team, and invalidSlot is separate
            const allSlots: number[] = []
            if (alloc.slot1 === alloc.team) allSlots.push(1)
            if (alloc.slot2 === alloc.team) allSlots.push(2)
            if (alloc.slot3 === alloc.team) allSlots.push(3)
            if (alloc.slot4 === alloc.team) allSlots.push(4)
            // Available slots = all slots minus invalid slot
            override.availableSlots = invalidSlot ? allSlots.filter(s => s !== invalidSlot) : allSlots

            overrides[alloc.staff_id] = override
          }
        }
      })
    }
    
    setStaffOverrides(overrides)
    setSavedOverrides(overrides) // Track what's saved

    // Runtime validation/repair for baseline snapshot (staff coverage, legacy wrapping, etc.).
    // This is runtime-only; persistence happens on Save (auto-repair-on-save todo).
    if ((scheduleData as any)?.baseline_snapshot) {
      try {
        const referencedIds = extractReferencedStaffIds({
          therapistAllocs: therapistAllocs as any,
          pcaAllocs: pcaAllocs as any,
          staffOverrides: overrides,
        })

        const result = await validateAndRepairBaselineSnapshot({
          storedSnapshot: (scheduleData as any)?.baseline_snapshot,
          referencedStaffIds: referencedIds,
          fetchLiveStaffByIds: async (ids) => {
            if (ids.length === 0) return []
            const attempt = await supabase
              .from('staff')
              .select('id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program')
              .in('id', ids)
            if (!attempt.error) return (attempt.data || []) as any[]
            // Legacy fallback: older schemas may not have status/buffer_fte columns
            if (attempt.error.message?.includes('column') || (attempt.error as any)?.code === '42703') {
              const fallback = await supabase.from('staff').select('*').in('id', ids)
              return (fallback.data || []) as any[]
            }
            return (attempt.data || []) as any[]
          },
          buildFallbackBaseline: buildBaselineSnapshotFromCurrentState,
          sourceForNewEnvelope: 'save',
        })

        setSnapshotHealthReport(result.report)
        // If repaired, apply immediately so UI/algos have required staff rows.
        if (result.report.status !== 'ok') {
          applyBaselineSnapshot(result.data)
        }
      } catch (e) {
        console.warn('Snapshot validation failed (runtime-only):', e)
        setSnapshotHealthReport({
          status: 'fallback',
          issues: ['validationException'],
          referencedStaffCount: 0,
          snapshotStaffCount: baselineSnapshot?.staff?.length || 0,
          missingReferencedStaffCount: 0,
        })
      }
    } else {
      setSnapshotHealthReport(null)
    }
    
    // OPTIMIZATION: Prefer persisted schedule_calculations table (already saved on Save).
    // Fallback to snapshot.calculatedValues if schedule_calculations is empty.
    let storedCalculations: Record<Team, ScheduleCalculations | null> | null = null
    let calculationsSource: 'schedule_calculations' | 'snapshot.calculatedValues' | 'none' = 'none'

    if (scheduleCalcsRows.length > 0) {
      const byTeam: Record<Team, ScheduleCalculations | null> = {
        FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null,
      }
      scheduleCalcsRows.forEach((row: any) => {
        const t = row?.team as Team | undefined
        if (!t) return
        byTeam[t] = row as ScheduleCalculations
      })
      storedCalculations = byTeam
      calculationsSource = 'schedule_calculations'
    } else if (hasBaselineSnapshot) {
      const snapshotData = unwrapBaselineSnapshotStored(rawBaselineSnapshotStored as BaselineSnapshotStored).data
      if (snapshotData.calculatedValues && snapshotData.calculatedValues.calculations) {
        // Use stored calculations if available and valid for current step
        const calculatedForStep = snapshotData.calculatedValues.calculatedForStep
        const currentStepForValidation = effectiveWorkflowState?.currentStep || 'leave-fte'
        // Only use if calculated for same or earlier step (earlier steps' calculations are still valid)
        const stepOrder: Record<string, number> = {
          'leave-fte': 1,
          'therapist-pca': 2,
          'floating-pca': 3,
          'bed-relieving': 4,
          'review': 5,
        }
        const calculatedStepOrder = stepOrder[calculatedForStep] || 0
        const currentStepOrder = stepOrder[currentStepForValidation] || 0
        if (calculatedStepOrder <= currentStepOrder) {
          storedCalculations = snapshotData.calculatedValues.calculations
          calculationsSource = 'snapshot.calculatedValues'
          console.log(`[ScheduleLoad] Using pre-calculated values from snapshot (calculated for step: ${calculatedForStep})`)
        } else {
        }
      }
    }
    
    const baselineSnapshotData = hasBaselineSnapshot
      ? unwrapBaselineSnapshotStored(rawBaselineSnapshotStored as BaselineSnapshotStored).data
      : null

    let snapshotBytes: number | null = null
    if (hasBaselineSnapshot) {
      try {
        snapshotBytes = JSON.stringify(rawBaselineSnapshotStored as any).length
      } catch {
        snapshotBytes = null
      }
    }
    
    // Cache the loaded data for fast navigation
    cacheSchedule(dateStr, {
      scheduleId,
      overrides,
      bedCountsOverridesByTeam: bedCountsByTeamForCache,
      bedRelievingNotesByToTeam: bedRelievingByToTeamForCache,
      allocationNotesDoc: allocationNotesDocForCache,
      tieBreakDecisions: tieBreakDecisionsForCache,
      therapistAllocs: therapistAllocs || [],
      pcaAllocs: pcaAllocs || [],
      bedAllocs: bedAllocs || [],
      baselineSnapshot: baselineSnapshotData,
      workflowState: effectiveWorkflowState,
      calculations: storedCalculations,
      cachedAt: Date.now(),
    })
    
    // Return allocations and metadata so we can use saved allocations directly instead of regenerating
    return {
      scheduleId,
      overrides,
      pcaAllocs: pcaAllocs || [],
      therapistAllocs: therapistAllocs || [],
      bedAllocs: bedAllocs || [],
      baselineSnapshot: baselineSnapshotData,
      workflowState: effectiveWorkflowState,
      calculations: storedCalculations,
      meta: {
        rpcUsed,
        batchedQueriesUsed,
        baselineSnapshotUsed: !!baselineSnapshotData,
        calculationsSource,
        counts: {
          therapistAllocs: (therapistAllocs || []).length,
          pcaAllocs: (pcaAllocs || []).length,
          bedAllocs: (bedAllocs || []).length,
          calculationsRows: scheduleCalcsRows.length,
        },
        snapshotBytes,
      },
    } as any
  }
  
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
        
        // Position to the left if it would be cut off on the right
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
          position: { x: popoverX, y: popoverY },
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
    
    // Reuse the calculation logic from useSavedAllocations
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
    
    const bedsForRelieving: Record<Team, number> = {
      FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
    }

    // IMPORTANT: Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
    // Otherwise the global sum of bedsForRelieving becomes positive (e.g. +15) and Block 3 cannot match Block 5.
    const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
    const bedsDesignatedByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

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
      bedsDesignatedByTeam[team] = totalBedsDesignated
    })

    const totalBedsEffectiveAllTeams = TEAMS.reduce((sum, t) => sum + (bedsDesignatedByTeam[t] || 0), 0)
    const overallBedsPerPT = totalPTOnDutyAllTeams > 0 ? totalBedsEffectiveAllTeams / totalPTOnDutyAllTeams : 0

    TEAMS.forEach(team => {
      const expectedBeds = overallBedsPerPT * ptPerTeamByTeam[team]
      bedsForRelieving[team] = expectedBeds - bedsDesignatedByTeam[team]
    })
    
    const formatWardName = (ward: { name: string; total_beds: number; team_assignments: Record<Team, number>; team_assignment_portions?: Record<Team, string> }, team: Team): string => {
      // Prefer stored portion text if available
      const storedPortion = ward.team_assignment_portions?.[team]
      if (storedPortion) {
        return `${storedPortion} ${ward.name}`
      }
      
      // Fallback to computed fraction from numeric values
      const teamBeds = ward.team_assignments[team] || 0
      const totalBeds = ward.total_beds
      if (teamBeds === totalBeds) return ward.name
      const fraction = teamBeds / totalBeds
      const validFractions = [
        { num: 1, den: 2, value: 0.5 },
        { num: 1, den: 3, value: 1/3 },
        { num: 2, den: 3, value: 2/3 },
        { num: 3, den: 4, value: 0.75 }
      ]
      for (const f of validFractions) {
        if (Math.abs(fraction - f.value) < 0.01) {
          return `${f.num}/${f.den} ${ward.name}`
        }
      }
      return ward.name
    }
    
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
      const designatedWards = teamWards.map(w => formatWardName(w, team))
      
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
    const totalBedsAllTeams = wards.reduce((sum, ward) => sum + ward.total_beds, 0)
    const totalPTOnDutyAllTeams = TEAMS.reduce((sum, team) => {
      return sum + therapistAllocations[team].reduce((teamSum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_therapist || 0)
        const hasFTE = currentFTE > 0
        return teamSum + (isTherapist && hasFTE ? currentFTE : 0)
      }, 0)
    }, 0)

    const bedsForRelieving: Record<Team, number> = {
      FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
    }

    // IMPORTANT: Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
    const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
    const bedsDesignatedByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

    TEAMS.forEach(team => {
      const ptPerTeam = therapistAllocations[team].reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_therapist || 0)
        const hasFTE = currentFTE > 0
        return sum + (isTherapist && hasFTE ? currentFTE : 0)
      }, 0)
      ptPerTeamByTeam[team] = ptPerTeam

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
      bedsDesignatedByTeam[team] = totalBedsDesignated
    })

    const totalBedsEffectiveAllTeams = TEAMS.reduce((sum, t) => sum + (bedsDesignatedByTeam[t] || 0), 0)
    const overallBedsPerPT = totalPTOnDutyAllTeams > 0 ? totalBedsEffectiveAllTeams / totalPTOnDutyAllTeams : 0
    TEAMS.forEach(team => {
      const expectedBeds = overallBedsPerPT * ptPerTeamByTeam[team]
      bedsForRelieving[team] = expectedBeds - bedsDesignatedByTeam[team]
    })

    const bedContext: BedAllocationContext = {
      bedsForRelieving,
      wards: wards.map(w => ({ name: w.name, team_assignments: w.team_assignments })),
    }
    const bedResult = allocateBeds(bedContext)
    setBedAllocations(bedResult.allocations)
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

  // Use saved allocations directly from database without regenerating.
  // IMPORTANT: This path should be cheap (no recalculation, no bed algorithm).
  const useSavedAllocations = (
    therapistAllocs: any[],
    pcaAllocs: any[],
    _overrides: Record<string, any>,
    staffForLookup: Staff[] = staff
  ) => {
    setLoading(true)

    const staffById = new Map<string, Staff>()
    ;(staffForLookup || []).forEach(s => staffById.set(s.id, s))

    const therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = {
      FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
    }

    ;(therapistAllocs || []).forEach((alloc: any) => {
      const staffMember = staffById.get(alloc.staff_id)
      if (staffMember && alloc.team) {
        therapistByTeam[alloc.team as Team].push({
          ...alloc,
          staff: staffMember,
        })
      }
    })

    TEAMS.forEach(team => {
      therapistByTeam[team].sort((a, b) => {
        const aIsAPPT = a.staff?.rank === 'APPT'
        const bIsAPPT = b.staff?.rank === 'APPT'
        if (aIsAPPT && !bIsAPPT) return -1
        if (!aIsAPPT && bIsAPPT) return 1
        const aName = a.staff?.name ?? ''
        const bName = b.staff?.name ?? ''
        return aName.localeCompare(bName)
      })
    })

    const pcaByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
      FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
    }

    ;(pcaAllocs || []).forEach((alloc: any) => {
      const staffMember = staffById.get(alloc.staff_id)
      if (!staffMember) return
      const allocationWithStaff = { ...alloc, staff: staffMember }

      if (alloc.team) {
        pcaByTeam[alloc.team as Team].push(allocationWithStaff)
      }

      // Floating PCAs may appear in multiple teams for display (slot1-4 teams).
      const slotTeams = new Set<Team>()
      if (alloc.slot1 && alloc.slot1 !== alloc.team) slotTeams.add(alloc.slot1 as Team)
      if (alloc.slot2 && alloc.slot2 !== alloc.team) slotTeams.add(alloc.slot2 as Team)
      if (alloc.slot3 && alloc.slot3 !== alloc.team) slotTeams.add(alloc.slot3 as Team)
      if (alloc.slot4 && alloc.slot4 !== alloc.team) slotTeams.add(alloc.slot4 as Team)
      slotTeams.forEach(slotTeam => {
        pcaByTeam[slotTeam].push(allocationWithStaff)
      })
    })

    TEAMS.forEach(team => {
      pcaByTeam[team].sort((a, b) => {
        const aIsNonFloating = !(a.staff?.floating ?? true)
        const bIsNonFloating = !(b.staff?.floating ?? true)
        if (aIsNonFloating && !bIsNonFloating) return -1
        if (!aIsNonFloating && bIsNonFloating) return 1
        const aName = a.staff?.name ?? ''
        const bName = b.staff?.name ?? ''
        return aName.localeCompare(bName)
      })
    })

    // Single setState calls (critical for cold-start performance).
    setTherapistAllocations(therapistByTeam)
    setPcaAllocations(pcaByTeam)
    setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })

    setHasSavedAllocations(true)
    setLoading(false)
  }

  const handleSaveStaffEdit = async (staffId: string, leaveType: LeaveType | null, fteRemaining: number, fteSubtraction?: number, availableSlots?: number[], invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>, amPmSelection?: 'AM' | 'PM', specialProgramAvailable?: boolean) => {
    // Store the override for this staff member
    const newOverrides = {
      ...staffOverrides,
      [staffId]: { leaveType, fteRemaining, fteSubtraction, availableSlots, invalidSlots, amPmSelection, specialProgramAvailable }
    }
    setStaffOverrides(newOverrides)

    // Clear saved allocations flag and step 2 result since inputs changed
    setHasSavedAllocations(false)
    setStep2Result(null)
    
    // Clear initialized steps - user must re-run algorithms after editing
    setInitializedSteps(new Set())
    
    // Mark Step 1 as modified (not completed) - user needs to advance to regenerate
    setStepStatus(prev => ({
      ...prev,
      'leave-fte': 'modified',
      'therapist-pca': 'pending', // Reset subsequent steps
      'floating-pca': 'pending',
      'bed-relieving': 'pending',
      'review': 'pending',
    }))
    
    // Keep user on Step 1 until they explicitly advance
    if (currentStep !== 'leave-fte') {
      setCurrentStep('leave-fte')
    }
    
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

  const generateAllocationsWithOverrides = async (overrides: Record<string, { leaveType: LeaveType | null; fteRemaining: number; team?: Team; fteSubtraction?: number; availableSlots?: number[]; invalidSlot?: number; leaveComebackTime?: string; isLeave?: boolean }>) => {
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
            leaveComebackTime: override?.leaveComebackTime,
            isLeave: override?.isLeave,
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

      // Helper function to format ward name with fraction if applicable
      const formatWardName = (ward: { name: string; total_beds: number; team_assignments: Record<Team, number>; team_assignment_portions?: Record<Team, string> }, team: Team): string => {
      // Prefer stored portion text if available
      const storedPortion = ward.team_assignment_portions?.[team]
      if (storedPortion) {
        return `${storedPortion} ${ward.name}`
      }
      
      // Fallback to computed fraction from numeric values
        const teamBeds = ward.team_assignments[team] || 0
        const totalBeds = ward.total_beds
        
        // If team handles all beds, just return the name
        if (teamBeds === totalBeds) {
          return ward.name
        }
        
        // Calculate the fraction
        const fraction = teamBeds / totalBeds
        
        // Valid fractions with denominators 2, 3, or 4 (excluding 1/4)
        // 1/2, 1/3, 2/3, 3/4
        const validFractions = [
          { num: 1, den: 2, value: 0.5 },
          { num: 1, den: 3, value: 1/3 },
          { num: 2, den: 3, value: 2/3 },
          { num: 3, den: 4, value: 0.75 }
        ]
        
        // Find the best matching valid fraction (within 0.01 tolerance)
        let bestMatch: { num: number; den: number } | null = null
        let bestError = Infinity
        
        for (const validFrac of validFractions) {
          const error = Math.abs(fraction - validFrac.value)
          if (error < 0.01 && error < bestError) {
            bestMatch = { num: validFrac.num, den: validFrac.den }
            bestError = error
          }
        }
        
        // If we found a good match, format with fraction
        if (bestMatch) {
          return `${bestMatch.num}/${bestMatch.den} ${ward.name}`
        }
        
        // Otherwise, just return the name without fraction
        return ward.name
      }
      
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
        const designatedWards = teamWards.map(w => formatWardName(w, team))
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

  const generateAllocations = async () => {
    await generateAllocationsWithOverrides(staffOverrides)
  }

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
          invalidSlot: override?.invalidSlot,
          leaveComebackTime: override?.leaveComebackTime,
          isLeave: override?.isLeave,
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
  const generateStep2_TherapistAndNonFloatingPCA = async (cleanedOverrides?: typeof staffOverrides): Promise<Record<Team, (PCAAllocation & { staff: Staff })[]>> => {
    if (staff.length === 0) return createEmptyTeamRecord<Array<PCAAllocation & { staff: Staff }>>([])

    setLoading(true)
    try {
      const overridesBase = cleanedOverrides ?? staffOverrides

      

      // Buffer non-floating PCA substitution (whole-day)
      // If a team has a non-floating PCA with FTE=0 (unavailable) AND there is a buffer PCA configured as non-floating for that team,
      // treat the buffer PCA as the whole-day substitute and prevent Step 2.1 from allocating an additional floating substitute.
      //
      // Implementation approach:
      // - Mark the missing non-floating PCA as "team: null" in pcaData so it doesn't generate a substitution need.
      // - Add staffOverrides.substitutionFor on the buffer PCA so the schedule UI can underline + green-highlight it as a substitute.
      const replacedNonFloatingIds = new Set<string>()
      const bufferSubstitutionUpdates: Record<
        string,
        {
          substitutionFor: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
          availableSlots?: number[]
        }
      > = {}

      try {
        const bufferNonFloatingByTeam = new Map<Team, Staff[]>()
        staff
          // Only consider FULL-DAY non-floating buffer PCAs (buffer_fte = 1.0)
          .filter(s => {
            if (s.rank !== 'PCA') return false
            if (s.status !== 'buffer') return false
            if (s.floating) return false
            if (!s.team) return false
            const bf = (s as any)?.buffer_fte
            if (typeof bf !== 'number') return false
            return bf >= 0.999
          })
          .forEach(s => {
            const t = s.team as Team
            const list = bufferNonFloatingByTeam.get(t) ?? []
            list.push(s)
            bufferNonFloatingByTeam.set(t, list)
          })

        // Only apply when the team's regular non-floating PCA is unavailable (fteRemaining === 0)
        for (const team of TEAMS) {
          const bufferSubs = bufferNonFloatingByTeam.get(team) ?? []
          if (bufferSubs.length === 0) continue

          const missingRegular = staff.find(s => {
            if (s.rank !== 'PCA') return false
            if (s.status === 'buffer') return false
            if (s.floating) return false
            if (s.team !== team) return false
            return overridesBase[s.id]?.fteRemaining === 0
          })
          if (!missingRegular) continue

          const bufferSub = bufferSubs[0]
          replacedNonFloatingIds.add(missingRegular.id)

          bufferSubstitutionUpdates[bufferSub.id] = {
            substitutionFor: {
              nonFloatingPCAId: missingRegular.id,
              nonFloatingPCAName: missingRegular.name,
              team,
              slots: [1, 2, 3, 4],
            },
            // Whole-day substitute intent
            availableSlots: [1, 2, 3, 4],
          }
        }
      } catch {}

      const overrides = {
        ...overridesBase,
        ...Object.fromEntries(
          Object.entries(bufferSubstitutionUpdates).map(([id, patch]) => [
            id,
            {
              ...(overridesBase[id] ?? { leaveType: null, fteRemaining: 1.0 }),
              ...patch,
            },
          ])
        ),
      } as typeof staffOverrides

      // Transform staff data for algorithms
      const weekday = getWeekday(selectedDate)
      const sptAddonByStaffId = new Map<string, number>()
      for (const a of sptAllocations) {
        if (a.weekdays?.includes(weekday)) {
          const raw = (a as any).fte_addon
          const fte = typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
          if (Number.isFinite(fte)) sptAddonByStaffId.set(a.staff_id, fte)
        }
      }

      const staffData: StaffData[] = staff.map(s => {
        const override = overrides[s.id]
        // For buffer staff, use buffer_fte as base FTE
        const isBufferStaff = s.status === 'buffer'
        const baseFTE =
          s.rank === 'SPT'
            ? (sptAddonByStaffId.get(s.id) ?? 1.0)
            : (isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0)
        const effectiveFTE = override ? override.fteRemaining : baseFTE
        const isOnDuty = isOnDutyLeaveType(override?.leaveType as any)
        const isAvailable =
          s.rank === 'SPT'
            ? (override
                ? (override.fteRemaining > 0 || (override.fteRemaining === 0 && isOnDuty))
                : effectiveFTE >= 0) // SPT can be on-duty with configured FTE=0
            : (override ? override.fteRemaining > 0 : effectiveFTE > 0)
        return {
          id: s.id,
          name: s.name,
          rank: s.rank,
          team: override?.team ?? s.team, // Use team from override if present
          special_program: s.special_program,
          fte_therapist: effectiveFTE,
          leave_type: override ? override.leaveType : null,
          is_available: isAvailable,
          availableSlots: override?.availableSlots,
        }
      })

      // Apply special program overrides:
      // - Therapists: add substituted therapists to program.staff_ids + fte_subtraction for this weekday
      // - PCAs: force the user-selected PCA to the front of pca_preference_order so Step 2 respects the override
      const modifiedSpecialPrograms = specialPrograms.map(program => {
        const programOverrides: Array<{ staffId: string; therapistId?: string; therapistFTESubtraction?: number }> = []
        const pcaOverrides: Array<{ pcaId: string }> = []
        
        // Find all staff with specialProgramOverrides for this program
        Object.entries(overrides).forEach(([staffId, override]) => {
          if (override.specialProgramOverrides) {
            const spOverride = override.specialProgramOverrides.find(spo => spo.programId === program.id)
            if (spOverride && spOverride.therapistId) {
              programOverrides.push({
                staffId: spOverride.therapistId,
                therapistId: spOverride.therapistId,
                therapistFTESubtraction: spOverride.therapistFTESubtraction,
              })
            }
            if (spOverride && spOverride.pcaId && program.name !== 'DRM') {
              pcaOverrides.push({ pcaId: spOverride.pcaId })
            }
          }
        })
        
        // Create modified program (only when we have something to modify)
        if (programOverrides.length === 0 && pcaOverrides.length === 0) {
          return program
        }

        const modifiedProgram = { ...program }
        
        // Add substituted therapists to staff_ids if not already present
        programOverrides.forEach(override => {
          if (!modifiedProgram.staff_ids.includes(override.therapistId!)) {
            modifiedProgram.staff_ids = [...modifiedProgram.staff_ids, override.therapistId!]
          }
          
          // Add FTE subtraction for substituted therapist
          if (!modifiedProgram.fte_subtraction[override.therapistId!]) {
            modifiedProgram.fte_subtraction[override.therapistId!] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }
          }
          if (override.therapistFTESubtraction !== undefined) {
            modifiedProgram.fte_subtraction[override.therapistId!][weekday] = override.therapistFTESubtraction
          }
        })

        // Force the selected PCA (from Step 2.0) to the front of preference order.
        // This makes allocatePCA pick it first (CRP/Robotic and other programs).
        if (pcaOverrides.length > 0) {
          const chosenPcaId = pcaOverrides[0]?.pcaId
          if (chosenPcaId) {
            const existing = (modifiedProgram as any).pca_preference_order as string[] | undefined
            const next = [
              chosenPcaId,
              ...((Array.isArray(existing) ? existing : []).filter(id => id !== chosenPcaId)),
            ]
            ;(modifiedProgram as any).pca_preference_order = next
          }
        }
        
        return modifiedProgram
      })

      // Generate therapist allocations
      // Include SPT allocation in step 2 when "Initialize Algo" is clicked
      const therapistContext: AllocationContext = {
        date: selectedDate,
        previousSchedule: null,
        staff: staffData,
        specialPrograms: modifiedSpecialPrograms, // Use modified programs with substitutions
        // Apply SPT leave/FTE overrides by overriding fte_addon with the edited remaining FTE (Step 1).
        sptAllocations: sptAllocations.map(a => {
          const o = overrides[a.staff_id]
          if (!o) return a
          const staffMember = staff.find(s => s.id === a.staff_id)
          if (staffMember?.rank !== 'SPT') return a
          return { ...a, fte_addon: o.fteRemaining }
        }),
        manualOverrides: {},
        includeSPTAllocation: true, // Include SPT allocation in step 2
      }

      const therapistResult = allocateTherapists(therapistContext)

      // Group therapist allocations by team
      const therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = {
        FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
      }

      therapistResult.allocations.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (staffMember) {
          const override = overrides[alloc.staff_id]
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

      // Prepare PCA data
      // For PCA: fte_pca = Base_FTE_remaining = 1.0 - fteSubtraction (for display and team requirement calculation)
      // For buffer PCA: use buffer_fte as base
      const pcaData: PCAData[] = staff
        .filter(s => s.rank === 'PCA')
        .map(s => {
          const override = overrides[s.id]
          // For buffer staff, use buffer_fte as base
          const isBufferStaff = s.status === 'buffer'
          const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
          // Calculate base_FTE_remaining = baseFTE - fteSubtraction (excluding special program subtraction)
          const baseFTERemaining = override && override.fteSubtraction !== undefined
            ? Math.max(0, baseFTE - override.fteSubtraction)
            : (override ? override.fteRemaining : baseFTE) // Fallback to fteRemaining if fteSubtraction not available

          // If this is a missing regular non-floating PCA that has a buffer non-floating substitute,
          // remove its team assignment for THIS algorithm run to prevent generating a Step 2.1 substitution need.
          const effectiveTeam = replacedNonFloatingIds.has(s.id) ? null : s.team
          
          return {
            id: s.id,
            name: s.name,
            floating: s.floating || false,
            special_program: s.special_program,
            fte_pca: baseFTERemaining, // Base_FTE_remaining = baseFTE - fteSubtraction (for display and team requirements)
            leave_type: override ? override.leaveType : null,
            is_available: override ? (override.fteRemaining > 0) : true, // Use fteRemaining (includes special program) for availability check
            team: effectiveTeam,
            availableSlots: override?.availableSlots, // Will be undefined if cleared, which defaults to [1,2,3,4] in algorithm
            invalidSlot: override?.invalidSlot,
            leaveComebackTime: override?.leaveComebackTime,
            isLeave: override?.isLeave,
            // Needed for floor PCA sorting/grouping in substitution dialog
            floor_pca: s.floor_pca || null,
          }
        })

      // Calculate average PCA per team
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
          if (isTherapist && fte > 0) {
            ptPerTeamFromResult[alloc.team] += fte
            totalPTOnDuty += fte
          }
        }
      })

      const rawAveragePCAPerTeam: Record<Team, number> = {} as Record<Team, number>
      TEAMS.forEach(team => {
        if (totalPTOnDuty > 0) {
          rawAveragePCAPerTeam[team] = (ptPerTeamFromResult[team] * totalPCA) / totalPTOnDuty
        } else {
          rawAveragePCAPerTeam[team] = totalPCA / 8
        }
      })

      // DRM Program add-on
      const drmProgram = specialPrograms.find(p => p.name === 'DRM')
      if (drmProgram && drmProgram.weekdays.includes(weekday)) {
        rawAveragePCAPerTeam['DRO'] += 0.4
      }

      // Run PCA allocation with phase = 'non-floating-with-special' 
      // This allocates non-floating PCAs + special program PCAs (no tie-breakers, no floating PCA)
      // Get existing allocations (from saved data) so the substitution list can:
      // - treat already-assigned special-program PCAs as unavailable (keep them excluded)
      // - and also allow Step 2.1 to pre-detect already-assigned floating PCAs (e.g. saved buffer substitution)
      const { existingAllocations: existingAllocsRaw } = recalculateFromCurrentState()

      // Callback for non-floating PCA substitution - called DURING algorithm execution
      const handleNonFloatingSubstitution = async (
        substitutions: Array<{
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
          }>
        }>
      ): Promise<Record<string, { floatingPCAId: string; slots: number[] }>> => {
        // Pre-detect any existing, persisted substitution selections from staffOverrides.
        // If present, we should show them as the current selection (and avoid allocating a second PCA).
        const preSelections: Record<string, { floatingPCAId: string; slots: number[] }> = {}
        try {
          for (const sub of substitutions) {
            const key = `${sub.team}-${sub.nonFloatingPCAId}`
            // If already detected for this key, keep it.
            if (preSelections[key]) continue

            // Find a floating PCA override that already targets this non-floating PCA + team
            const match = Object.entries(overrides).find(([, o]) => {
              const sf = (o as any)?.substitutionFor
              return sf?.team === sub.team && sf?.nonFloatingPCAId === sub.nonFloatingPCAId
            })
            if (!match) continue
            const [floatingPCAId, o] = match
            const sf = (o as any).substitutionFor as { slots: number[] } | undefined
            if (!sf || !Array.isArray(sf.slots) || sf.slots.length === 0) continue

            // Ensure this chosen PCA is still a valid option for THIS substitution need.
            const allowedIds = new Set(sub.availableFloatingPCAs.map(p => p.id))
            if (!allowedIds.has(floatingPCAId)) continue

            preSelections[key] = { floatingPCAId, slots: sf.slots }
          }
        } catch {}

        // If no staffOverride-based selection exists, attempt to infer an "already-selected" substitute
        // from saved/current allocations (e.g. a buffer PCA already allocated to cover this team's missing slots).
        // This prevents Step 2.1 from allocating a second, duplicate substitute when rerunning Step 2.
        try {
          for (const sub of substitutions) {
            const key = `${sub.team}-${sub.nonFloatingPCAId}`
            if (preSelections[key]) continue

            const allowedIds = new Set(sub.availableFloatingPCAs.map(p => p.id))
            if (allowedIds.size === 0) continue

            // Consider only floating allocations WITHOUT special_program_ids (special-program allocations are not substitution).
            const candidateAllocs = existingAllocsRaw
              .filter(a => {
                const staffMember = staff.find(s => s.id === a.staff_id)
                if (!staffMember?.floating) return false
                if (a.special_program_ids && a.special_program_ids.length > 0) return false
                return allowedIds.has(a.staff_id)
              })
              .map(a => {
                const overlapSlots: number[] = []
                if (sub.missingSlots.includes(1) && a.slot1 === sub.team) overlapSlots.push(1)
                if (sub.missingSlots.includes(2) && a.slot2 === sub.team) overlapSlots.push(2)
                if (sub.missingSlots.includes(3) && a.slot3 === sub.team) overlapSlots.push(3)
                if (sub.missingSlots.includes(4) && a.slot4 === sub.team) overlapSlots.push(4)
                return { alloc: a, overlapSlots }
              })
              .filter(x => x.overlapSlots.length > 0)
              .sort((a, b) => b.overlapSlots.length - a.overlapSlots.length)

            const best = candidateAllocs[0]
            if (!best) continue

            preSelections[key] = { floatingPCAId: best.alloc.staff_id, slots: best.overlapSlots }
          }
        } catch {}

        // Group substitutions by team - use factory to create unique array instances per team
        const substitutionsByTeam = createEmptyTeamRecordFactory<Array<typeof substitutions[0]>>(() => [])
        substitutions.forEach(sub => {
          substitutionsByTeam[sub.team].push(sub)
        })

        // Only include teams that actually have substitutions (FTE ≠ 1)
        const teamsWithSubstitutions = TEAMS.filter(
          team => substitutionsByTeam[team].length > 0
        )

        if (teamsWithSubstitutions.length === 0) {
          return {} // No substitutions needed
        }

        // Show wizard dialog only if multiple teams need substitution, otherwise simple dialog
        const isWizardMode = teamsWithSubstitutions.length > 1

        // Show dialog and wait for user selections
        return new Promise((resolve) => {
          setSubstitutionWizardData({
            teams: teamsWithSubstitutions,
            substitutionsByTeam: substitutionsByTeam as Record<Team, typeof substitutions>,
            isWizardMode
            ,initialSelections: Object.keys(preSelections).length > 0 ? preSelections : undefined
          })
          setSubstitutionWizardOpen(true)

          // Store resolver to be called when user confirms
          const resolver = (selections: Record<string, { floatingPCAId: string; slots: number[] }>) => {
            const keys = Object.keys(selections)
            // If user skips/cancels (empty selections) but we already had a persisted selection, keep it.
            const effectiveSelections =
              keys.length === 0 && Object.keys(preSelections).length > 0
                ? preSelections
                : selections
            setSubstitutionWizardOpen(false)
            setSubstitutionWizardData(null)
            resolve(effectiveSelections)
          }

          // Store resolver in ref so it can be accessed from handler
          substitutionWizardResolverRef.current = resolver
        })
      }

      // Get existing allocations (from saved data) so the substitution list can:
      // - treat already-assigned special-program PCAs as unavailable (keep them excluded)
      // - but NOT block all candidates just because they were previously assigned as floating PCAs in the saved schedule
      //   (we are re-running Step 2, so clear non-special-program floating allocations)
      const existingAllocsForSubstitution = existingAllocsRaw.filter(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (!staffMember) return false
        // Always keep non-floating allocations (they're not candidates anyway)
        if (!staffMember.floating) return true
        // Keep only floating allocations that are special-program assignments
        return !!(alloc.special_program_ids && alloc.special_program_ids.length > 0)
      })
      
      const pcaContext: PCAAllocationContext = {
        date: selectedDate,
        totalPCAAvailable: totalPCA,
        pcaPool: pcaData,
        averagePCAPerTeam: rawAveragePCAPerTeam,
        specialPrograms: modifiedSpecialPrograms,
        pcaPreferences,
        // gymSchedules removed - now comes from pcaPreferences
        phase: 'non-floating-with-special', // Non-floating + special program PCAs
        onNonFloatingSubstitution: handleNonFloatingSubstitution, // Callback for substitution dialog
        existingAllocations: existingAllocsForSubstitution, // Pass existing allocations to check for special program assignments
      }

      const pcaResult = await allocatePCA(pcaContext)

      // Extract and store errors (for Step 2 - non-floating PCA + special program)
      if (pcaResult.errors) {
        setPcaAllocationErrors(prev => ({
          ...prev,
          missingSlotSubstitution: pcaResult.errors?.missingSlotSubstitution,
          specialProgramAllocation: pcaResult.errors?.specialProgramAllocation,
        }))
      }

      // Group non-floating PCA allocations by team
      const pcaByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
        FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
      }

      pcaResult.allocations.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (!staffMember) return
        const override = overrides[alloc.staff_id]
        if (override) {
          alloc.leave_type = override.leaveType
        }
        const allocationWithStaff = { ...alloc, staff: staffMember }
        pcaByTeam[alloc.team].push(allocationWithStaff)
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
      setPendingPCAFTEPerTeam(pcaResult.pendingPCAFTEPerTeam)

      // Persist buffer-substitution display intent into staffOverrides state (day-level override).
      // This ensures the buffer non-floating substitute is UNDERLINED and its slots are GREEN on the schedule page.
      if (Object.keys(bufferSubstitutionUpdates).length > 0) {
        setStaffOverrides(prev => {
          const next = { ...prev }
          for (const [bufferId, patch] of Object.entries(bufferSubstitutionUpdates)) {
            const staffMember = staff.find(s => s.id === bufferId)
            const baseFTE =
              staffMember?.status === 'buffer' && staffMember.buffer_fte !== undefined ? staffMember.buffer_fte : 1.0
            next[bufferId] = {
              ...(next[bufferId] ?? { leaveType: null, fteRemaining: baseFTE }),
              ...patch,
            } as any
          }
          return next
        })
      }

      // Store intermediate state for Step 3
      setStep2Result({
        pcaData,
        teamPCAAssigned: pcaResult.teamPCAAssigned || { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 },
        nonFloatingAllocations: pcaResult.allocations,
        rawAveragePCAPerTeam,
      })

      // NOTE: recalculateScheduleCalculations will be called automatically via useEffect
      // when therapistAllocations or pcaAllocations change (see useEffect above)

      // Update step status (don't auto-advance)
      setStepStatus(prev => ({ ...prev, 'therapist-pca': 'completed' }))

      // Return the allocations for use in substitution detection
      return pcaByTeam
    } catch (error) {
      console.error('Error in Step 2:', error)
      // Return empty allocations on error
      return createEmptyTeamRecord<Array<PCAAllocation & { staff: Staff }>>([])
    } finally {
      setLoading(false)
    }
  }

  /**
   * Step 3: Generate Floating PCA allocations
   * This is where tie-breakers happen.
   * Uses recalculated data from current state to respect any user edits made after Step 2.
   * 
   * @param userAdjustedPendingFTE - Optional: user-adjusted pending FTE values from Step 3.1 dialog
   * @param userTeamOrder - Optional: user-specified team allocation order from Step 3.1 dialog
   */
  const generateStep3_FloatingPCA = async (
    userAdjustedPendingFTE?: Record<Team, number>,
    userTeamOrder?: Team[]
  ) => {
    if (!step2Result) {
      console.error('Step 2 must be completed before Step 3')
      return
    }

    setLoading(true)
    try {
      // Recalculate from current state to pick up any user edits after Step 2
      // Now includes both non-floating AND floating allocations with slots assigned (substitutions)
      const { teamPCAAssigned, existingAllocations } = recalculateFromCurrentState()
      const pcaData = buildPCADataFromCurrentState()
      
            
      // Calculate total PCA available from current state
      const totalPCAAvailable = pcaData
        .filter(p => p.is_available)
        .reduce((sum, p) => sum + p.fte_pca, 0)

      // Tie-breaking callback - only used if Step 3.1 dialog was skipped or didn't resolve all ties
      const handleTieBreak = async (teams: Team[], pendingFTE: number): Promise<Team> => {
        // If we have a user-specified order, use it to resolve ties
        if (userTeamOrder) {
          // Find the first team in the order that's in the tied teams
          const orderedTeam = userTeamOrder.find(t => teams.includes(t))
          if (orderedTeam) {
            return orderedTeam
          }
        }

        const sortedTeams = [...teams].sort().join(',')
        const tieBreakKey = `${sortedTeams}:${pendingFTE.toFixed(4)}`

        if (tieBreakDecisions[tieBreakKey]) {
          return tieBreakDecisions[tieBreakKey]
        }

        return new Promise((resolve) => {
          setTieBreakTeams(teams)
          setTieBreakPendingFTE(pendingFTE)
          const resolver = (selectedTeam: Team) => {
            setTieBreakDecisions((prevDecisions) => ({
              ...prevDecisions,
              [tieBreakKey]: selectedTeam,
            }))
            resolve(selectedTeam)
          }
          setTieBreakResolver(() => resolver)
          tieBreakResolverRef.current = resolver
          setTieBreakDialogOpen(true)
        })
      }

      // Run PCA allocation with phase = 'floating' (no special program - already done in Step 2)
      const pcaContext: PCAAllocationContext = {
        date: selectedDate,
        totalPCAAvailable,
        pcaPool: pcaData,
        averagePCAPerTeam: step2Result.rawAveragePCAPerTeam, // Use persisted target from Step 2
        specialPrograms,
        pcaPreferences,
        // gymSchedules removed - now comes from pcaPreferences
        onTieBreak: handleTieBreak,
        phase: 'floating', // Only allocate floating PCAs (special program already done in Step 2)
        existingAllocations: existingAllocations, // Now includes floating PCAs with slots assigned
        existingTeamPCAAssigned: teamPCAAssigned, // Recalculated from current state
        // Step 3.1 overrides: user-adjusted pending FTE and team order
        userAdjustedPendingFTE,
        userTeamOrder,
      }

      const pcaResult = await allocatePCA(pcaContext)
      
      
      // Note: Special program errors are now handled in Step 2, not here
      // Step 3 only handles floating PCA allocation errors (if any)

      // Group all PCA allocations by team (including floating)
      const pcaByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
        FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
      }

      const overrides = staffOverrides
      pcaResult.allocations.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (!staffMember) return
        const override = overrides[alloc.staff_id]
        if (override) {
          alloc.leave_type = override.leaveType
        }
        const allocationWithStaff = { ...alloc, staff: staffMember }

        // Add to primary team
        pcaByTeam[alloc.team].push(allocationWithStaff)

        // Add to slot teams for floating PCAs
        const slotTeams = new Set<Team>()
        if (alloc.slot1) slotTeams.add(alloc.slot1)
        if (alloc.slot2) slotTeams.add(alloc.slot2)
        if (alloc.slot3) slotTeams.add(alloc.slot3)
        if (alloc.slot4) slotTeams.add(alloc.slot4)

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
      setPendingPCAFTEPerTeam(pcaResult.pendingPCAFTEPerTeam)
      // NOTE: Do NOT update calculations.average_pca_per_team here
      // The target from Step 1 (using staffOverrides) should persist through Steps 2-4

      // Update step status and mark as initialized (don't auto-advance)
      setStepStatus(prev => ({ ...prev, 'floating-pca': 'completed' }))
      setInitializedSteps(prev => new Set(prev).add('floating-pca'))

    } catch (error) {
      console.error('Error in Step 3:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Step 4: Calculate Bed Relieving
   * This is a derived calculation based on therapist allocations
   */
  const calculateStep4_BedRelieving = () => {
    const totalBedsAllTeams = wards.reduce((sum, ward) => sum + ward.total_beds, 0)

    const totalPTOnDutyAllTeams = TEAMS.reduce((sum, team) => {
      return sum + therapistAllocations[team].reduce((teamSum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const hasFTE = (alloc.fte_therapist || 0) > 0
        return teamSum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
      }, 0)
    }, 0)

    const bedsForRelieving: Record<Team, number> = {
      FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
    }

    // Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
    const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
    const bedsDesignatedByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

    TEAMS.forEach(team => {
      const ptPerTeam = therapistAllocations[team].reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const hasFTE = (alloc.fte_therapist || 0) > 0
        return sum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
      }, 0)
      ptPerTeamByTeam[team] = ptPerTeam

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
      bedsDesignatedByTeam[team] = totalBedsDesignated
    })

    const totalBedsEffectiveAllTeams = TEAMS.reduce((sum, t) => sum + (bedsDesignatedByTeam[t] || 0), 0)
    const overallBedsPerPT = totalPTOnDutyAllTeams > 0 ? totalBedsEffectiveAllTeams / totalPTOnDutyAllTeams : 0
    TEAMS.forEach(team => {
      const expectedBeds = overallBedsPerPT * ptPerTeamByTeam[team]
      bedsForRelieving[team] = expectedBeds - bedsDesignatedByTeam[team]
    })

    const bedContext: BedAllocationContext = {
      bedsForRelieving,
      wards: wards.map(w => ({ name: w.name, team_assignments: w.team_assignments })),
    }

    const bedResult = allocateBeds(bedContext)
    setBedAllocations(bedResult.allocations)

    // Update step status (don't auto-advance)
    setStepStatus(prev => ({ ...prev, 'bed-relieving': 'completed' }))
  }

  /**
   * Handle advancing to the next step (navigation only, no algorithm)
   */
  const handleNextStep = async () => {
    // Only navigate, don't run algorithms
    switch (currentStep) {
      case 'leave-fte':
        setCurrentStep('therapist-pca')
        break
      case 'therapist-pca':
        // No validation needed - buffer therapists in the pool don't need to be assigned
        // Only buffer therapists that have been dragged to teams are in allocations
        // Buffer therapists that haven't been assigned remain in the pool and don't need validation
        setCurrentStep('floating-pca')
        break
      case 'floating-pca':
        setCurrentStep('bed-relieving')
        break
      case 'bed-relieving':
        setCurrentStep('review')
        break
      default:
        break
    }
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
            }>) => {
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
              
              // RESET Step 2-related data when initializing the algorithm
              // This ensures the algorithm computes based on fresh state, not from previous Step 2/3 runs
              // Clear availableSlots for floating PCAs from staffOverrides (preserve Step 1 data)
              const cleanedOverrides = { ...mergedOverrides }
              
              // Find all floating PCA staff IDs
              const floatingPCAIds = new Set(
                staff
                  .filter(s => s.rank === 'PCA' && s.floating)
                  .map(s => s.id)
              )
              
              
              // Clear availableSlots for floating PCAs, but preserve other override data (leaveType, fteRemaining, etc.)
              floatingPCAIds.forEach(pcaId => {
                if (cleanedOverrides[pcaId]) {
                  const staffMember = staff.find(s => s.id === pcaId)
                  const isBuffer = staffMember?.status === 'buffer'
                  if (isBuffer) return
                  const { availableSlots, ...otherOverrides } = cleanedOverrides[pcaId]
                  // Keep the override with other data (leaveType, fteRemaining, etc.)
                  cleanedOverrides[pcaId] = otherOverrides
                }
              })
              
              
              // Update state with cleaned overrides
              setStaffOverrides(cleanedOverrides)
              
              
              // Run Step 2 algorithm with cleaned overrides - it will pause for substitution dialog if needed
              generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides).then(() => {
                setInitializedSteps(prev => new Set(prev).add('therapist-pca'))
                resolve()
              })
            }
            
            setSpecialProgramOverrideResolver(() => resolver)
            specialProgramOverrideResolverRef.current = resolver
            setShowSpecialProgramOverrideDialog(true)
          })
        }
        
        // No active special programs - proceed directly to Step 2 algorithm
        // RESET Step 2-related data when initializing the algorithm
        // This ensures the algorithm computes based on fresh state, not from previous Step 2/3 runs
        // Clear availableSlots for floating PCAs from staffOverrides (preserve Step 1 data)
        const cleanedOverrides = { ...staffOverrides }
        
        // Find all floating PCA staff IDs
        const floatingPCAIds = new Set(
          staff
            .filter(s => s.rank === 'PCA' && s.floating)
            .map(s => s.id)
        )
        
        // Clear availableSlots for floating PCAs, but preserve other override data (leaveType, fteRemaining, etc.)
        floatingPCAIds.forEach(pcaId => {
          if (cleanedOverrides[pcaId]) {
            const { availableSlots, ...otherOverrides } = cleanedOverrides[pcaId]
            // Keep the override with other data (leaveType, fteRemaining, etc.)
            cleanedOverrides[pcaId] = otherOverrides
          }
        })
        
        // Update state with cleaned overrides
        setStaffOverrides(cleanedOverrides)
        
        // Run Step 2 algorithm with cleaned overrides - it will pause for substitution dialog if needed
        await generateStep2_TherapistAndNonFloatingPCA(cleanedOverrides)
        setInitializedSteps(prev => new Set(prev).add('therapist-pca'))
        break
      case 'floating-pca':
        // Step 3.1: Recalculate pending FTE with proper rounding timing
        // For teams with buffer floating PCA: round avg FIRST, then subtract assignments
        // For teams without buffer floating PCA: round avg, then subtract non-floating only
        if (!step2Result) {
          showActionToast('Step 2 must be completed before Step 3.', 'warning')
          return
        }

        
        
        // RESET Step 3-related data when re-running the algorithm
        // This ensures the algorithm computes based on fresh state, not from previous Step 3 runs
        
        // 1. Clear floating PCA allocations from pcaAllocations (keep non-floating PCA from Step 2)
        // IMPORTANT: Preserve floating PCA allocations that have special_program_ids (from Step 2)
        // Calculate cleaned allocations FIRST (before state update) so we can use it for pending FTE calculation
        const cleanedPcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
          FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
        }
        
        TEAMS.forEach(team => {
          // Keep:
          // 1. Non-floating PCA allocations (from Step 2)
          // 2. Floating PCA allocations with special_program_ids (from Step 2 special program allocation)
          // 3. Floating PCA allocations used as substitutions for non-floating missing slots (Step 2.1 / Step 2.0)
          const preservedAllocs = (pcaAllocations[team] || []).filter(alloc => {
            const staffMember = staff.find(s => s.id === alloc.staff_id)
            if (!staffMember) return false
            
            // Keep non-floating PCAs
            if (!staffMember.floating) return true
            
            // Keep floating PCAs that have special_program_ids (allocated to special programs in Step 2)
            if (alloc.special_program_ids && alloc.special_program_ids.length > 0) {
              return true
            }

            // Keep floating PCAs that are explicitly substituting for a non-floating PCA for THIS team
            const sf = staffOverrides[alloc.staff_id]?.substitutionFor
            if (sf && sf.team === team) {
              return true
            }
            
            // Remove other floating PCA allocations (will be re-allocated in Step 3)
            return false
          })
          cleanedPcaAllocations[team] = preservedAllocs
        })

        
        
        // Now update state with cleaned allocations
        setPcaAllocations(cleanedPcaAllocations)
        
        // 2. Clear slotOverrides for floating PCAs from staffOverrides (preserve Step 1 & 2 data)
        setStaffOverrides(prev => {
          const cleaned = { ...prev }
          
          // Find all floating PCA staff IDs
          const floatingPCAIds = new Set(
            staff
              .filter(s => s.rank === 'PCA' && s.floating)
              .map(s => s.id)
          )
          
          // Clear slotOverrides for floating PCAs, but preserve other override data (leaveType, fteRemaining, substitutionFor, etc.)
          floatingPCAIds.forEach(pcaId => {
            if (cleaned[pcaId]) {
              const { slotOverrides, ...otherOverrides } = cleaned[pcaId]
              // CRITICAL: Preserve substitutionFor - it's needed for Step 3.2 to exclude substitution slots
              // Always keep the override if it has substitutionFor, even if no other properties
              const hasSubstitutionFor = !!otherOverrides.substitutionFor
              const hasOtherKeys = Object.keys(otherOverrides).length > 0
              
              if (hasSubstitutionFor || hasOtherKeys) {
                cleaned[pcaId] = otherOverrides
              } else {
                delete cleaned[pcaId]
              }
            }
          })
          
          return cleaned
        })
        
        const recalculatedPendingFTE: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        
        // Calculate buffer floating PCA slots assigned per team
        // Note: After reset, buffer floating PCA allocations should also be cleared
        // But we check the current state before reset for buffer PCA that might have been manually assigned
        const bufferFloatingPCAFTEPerTeam: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        
        // After reset, pcaAllocations no longer has floating PCAs, so buffer floating PCA count will be 0
        // This is correct - buffer floating PCA should be re-assigned by the algorithm
        
        // Calculate assigned PCA per team from CLEANED allocations (not state)
        // - nonFloatingPCAAssignedPerTeam: only non-floating PCAs
        // - preservedFloatingAssignedPerTeam: preserved floating PCAs (special programs + substitutions)
        const nonFloatingPCAAssignedPerTeam: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        const preservedFloatingAssignedPerTeam: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        
        Object.entries(cleanedPcaAllocations).forEach(([team, allocs]) => {
          allocs.forEach(alloc => {
            const staffMember = staff.find(s => s.id === alloc.staff_id)
            if (!staffMember) return
            
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
            if (!staffMember.floating) {
              nonFloatingPCAAssignedPerTeam[team as Team] += slotsInTeam * 0.25
              return
            }

            // Floating PCAs are only counted here if they are preserved (special programs or substitutions)
            const hasSpecial = Array.isArray(alloc.special_program_ids) && alloc.special_program_ids.length > 0
            const sf = staffOverrides[alloc.staff_id]?.substitutionFor
            const isSubForThisTeam = !!sf && sf.team === (team as Team)
            if (hasSpecial || isSubForThisTeam) {
              preservedFloatingAssignedPerTeam[team as Team] += slotsInTeam * 0.25
            }
          })
        })
        
        TEAMS.forEach(team => {
          // Use displayed avg PCA/team from calculations (accounts for CRP -0.4 therapist FTE adjustment for CPPC)
          // This matches what the user sees in Block 6, not the raw value from step2Result
          // For DRO: use the final value (with +0.4 DRM add-on) since the add-on is part of DRO's requirement
          const displayedAvgPCA = calculations[team]?.average_pca_per_team || 0
          
          // Get non-floating PCA assigned (only non-floating, excluding floating substitutions)
          const nonFloatingPCAAssigned = nonFloatingPCAAssignedPerTeam[team] || 0

          // Get preserved floating PCA assigned (special programs + non-floating substitutions)
          const preservedFloatingAssigned = preservedFloatingAssignedPerTeam[team] || 0
          
          // Get buffer floating PCA slots assigned (manually assigned in Step 3)
          // After reset, this will be 0, which is correct
          const bufferFloatingFTE = bufferFloatingPCAFTEPerTeam[team] || 0
          
          // Calculate pending: displayedAvg - nonFloating - preservedFloating - bufferFloating (subtract FIRST, then round)
          // This ensures mathematical consistency: rounding happens on the actual pending amount, not the requirement
          const rawPending = Math.max(0, displayedAvgPCA - nonFloatingPCAAssigned - preservedFloatingAssigned - bufferFloatingFTE)
          const pending = roundToNearestQuarterWithMidpoint(rawPending)
          
          recalculatedPendingFTE[team] = pending
        })

        
        
        setPendingPCAFTEPerTeam(recalculatedPendingFTE)
        // Step 3.1: Open the configuration dialog instead of running algo directly
        setFloatingPCAConfigOpen(true)
        break
      case 'bed-relieving':
        calculateStep4_BedRelieving()
        setInitializedSteps(prev => new Set(prev).add('bed-relieving'))
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
    const dateStr = formatDateForInput(selectedDate)

    const baselineTherapistByTeam = createEmptyTherapistAllocationsByTeam()
    staff.forEach(s => {
      if (!s.team) return
      if (!['SPT', 'APPT', 'RPT'].includes(s.rank)) return
      const o = overrides?.[s.id]
      const fte = typeof o?.fteRemaining === 'number' ? o.fteRemaining : 1.0
      if (fte <= 0) return
      baselineTherapistByTeam[s.team as Team].push({
        id: `baseline-therapist:${dateStr}:${s.id}:${s.team}`,
        schedule_id: '',
        staff_id: s.id,
        team: s.team as Team,
        fte_therapist: fte,
        fte_remaining: Math.max(0, 1.0 - fte),
        slot_whole: null,
        slot1: null,
        slot2: null,
        slot3: null,
        slot4: null,
        leave_type: (o?.leaveType ?? null) as any,
        special_program_ids: null,
        is_substitute_team_head: false,
        spt_slot_display: null,
        is_manual_override: false,
        manual_override_note: null,
        staff: s,
      } as any)
    })
    setTherapistAllocations(baselineTherapistByTeam)

    const baselinePCAByTeam = createEmptyPCAAllocationsByTeam()
    staff.forEach(s => {
      if (!s.team) return
      if (s.rank !== 'PCA') return
      if (s.floating) return
      const o = overrides?.[s.id]
      const baseFTE = s.status === 'buffer' && s.buffer_fte != null ? (s.buffer_fte as any) : 1.0
      const fte = typeof o?.fteRemaining === 'number' ? o.fteRemaining : baseFTE
      if (fte <= 0) return
      baselinePCAByTeam[s.team as Team].push({
        id: `baseline-pca:${dateStr}:${s.id}:${s.team}`,
        schedule_id: '',
        staff_id: s.id,
        team: s.team as Team,
        fte_pca: fte,
        fte_remaining: fte,
        slot_assigned: 0,
        slot_whole: null,
        slot1: null,
        slot2: null,
        slot3: null,
        slot4: null,
        leave_type: (o?.leaveType ?? null) as any,
        special_program_ids: null,
        invalid_slot: null,
        leave_comeback_time: null,
        leave_mode: null,
        staff: s,
      } as any)
    })
    TEAMS.forEach(team => {
      baselinePCAByTeam[team].sort((a, b) => (a.staff?.name ?? '').localeCompare(b.staff?.name ?? ''))
    })
    setPcaAllocations(baselinePCAByTeam)
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
    const cleaned: Record<string, any> = {}
    Object.entries(overrides ?? {}).forEach(([staffId, raw]) => {
      if (!raw || typeof raw !== 'object') return
      const o = { ...(raw as any) }

      // Step 2.0 + 2.1 inputs
      delete o.specialProgramOverrides
      delete o.substitutionFor

      // Step 2 emergency team transfer overrides for therapists (APPT/RPT/SPT)
      const staffMember = staff.find(s => s.id === staffId)
      if (staffMember && ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)) {
        delete o.team
      }

      if (Object.keys(o).length > 0) {
        cleaned[staffId] = o
      }
    })
    return cleaned
  }

  const clearStep3StateOnly = () => {
    // Step 3 wizard state + tracking
    setFloatingPCAConfigOpen(false)
    setAdjustedPendingFTE(null)
    setTeamAllocationOrder(null)
    setAllocationTracker(null)
    setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })
    setPcaAllocationErrors(prev => ({ ...prev, preferredSlotUnassigned: undefined }))
  }

  const clearStep4StateOnly = () => {
    setBedAllocations([])
    setBedRelievingNotesByToTeam({})
  }

  const clearStep3AllocationsPreserveStep2 = () => {
    // Remove floating PCA allocations except: (a) special program allocations from Step 2, (b) Step 2.1 substitutions.
    const cleanedPcaAllocations = createEmptyPCAAllocationsByTeam()
    TEAMS.forEach(team => {
      const preservedAllocs = (pcaAllocations[team] || []).filter(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (!staffMember) return false
        if (!staffMember.floating) return true
        if (alloc.special_program_ids && alloc.special_program_ids.length > 0) return true
        const sf = staffOverrides[alloc.staff_id]?.substitutionFor
        if (sf && sf.team === team) return true
        return false
      })
      cleanedPcaAllocations[team] = preservedAllocs
    })
    setPcaAllocations(cleanedPcaAllocations)

    // Clear slotOverrides for floating PCAs (preserve Step 1 + Step 2 fields like substitutionFor).
    setStaffOverrides(prev => {
      const cleaned = { ...prev }
      const floatingPCAIds = new Set(staff.filter(s => s.rank === 'PCA' && s.floating).map(s => s.id))
      floatingPCAIds.forEach(pcaId => {
        if (!cleaned[pcaId]) return
        const { slotOverrides, ...otherOverrides } = cleaned[pcaId]
        const hasSubstitutionFor = !!otherOverrides.substitutionFor
        const hasOtherKeys = Object.keys(otherOverrides).length > 0
        if (hasSubstitutionFor || hasOtherKeys) {
          cleaned[pcaId] = otherOverrides
        } else {
          delete cleaned[pcaId]
        }
      })
      return cleaned
    })

    // Recompute pending needs from cleaned allocations (so Step 3 re-entry has correct starting point).
    const recalculatedPendingFTE: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
    const nonFloatingPCAAssignedPerTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
    const preservedFloatingAssignedPerTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

    Object.entries(cleanedPcaAllocations).forEach(([team, allocs]) => {
      allocs.forEach(alloc => {
        const staffMember = staff.find(s => s.id === alloc.staff_id)
        if (!staffMember) return
        let slotsInTeam = 0
        if (alloc.slot1 === team) slotsInTeam++
        if (alloc.slot2 === team) slotsInTeam++
        if (alloc.slot3 === team) slotsInTeam++
        if (alloc.slot4 === team) slotsInTeam++

        const invalidSlot = (alloc as any).invalid_slot
        if (invalidSlot) {
          const slotField = `slot${invalidSlot}` as keyof PCAAllocation
          if (alloc[slotField] === team) slotsInTeam = Math.max(0, slotsInTeam - 1)
        }

        if (!staffMember.floating) {
          nonFloatingPCAAssignedPerTeam[team as Team] += slotsInTeam * 0.25
          return
        }

        const hasSpecial = Array.isArray(alloc.special_program_ids) && alloc.special_program_ids.length > 0
        const sf = staffOverrides[alloc.staff_id]?.substitutionFor
        const isSubForThisTeam = !!sf && sf.team === (team as Team)
        if (hasSpecial || isSubForThisTeam) {
          preservedFloatingAssignedPerTeam[team as Team] += slotsInTeam * 0.25
        }
      })
    })

    TEAMS.forEach(team => {
      const displayedAvgPCA = calculations[team]?.average_pca_per_team || 0
      const rawPending = Math.max(
        0,
        displayedAvgPCA - (nonFloatingPCAAssignedPerTeam[team] || 0) - (preservedFloatingAssignedPerTeam[team] || 0)
      )
      recalculatedPendingFTE[team] = roundToNearestQuarterWithMidpoint(rawPending)
    })
    setPendingPCAFTEPerTeam(recalculatedPendingFTE)
  }

  const clearStepOnly = async (stepId: ScheduleStepId) => {
    switch (stepId) {
      case 'leave-fte': {
        setStaffOverrides({})
        setPcaAllocationErrors({})
        setStep2Result(null)
        clearStep3StateOnly()
        clearStep4StateOnly()
        applyBaselineViewAllocations({})
        setStepStatus(prev => ({
          ...prev,
          'leave-fte': 'pending',
          'therapist-pca': 'pending',
          'floating-pca': 'pending',
          'bed-relieving': 'pending',
          review: 'pending',
        }))
        return
      }
      case 'therapist-pca': {
        const cleanedOverrides = removeStep2KeysFromOverrides(staffOverrides)
        setStaffOverrides(cleanedOverrides)
        setPcaAllocationErrors({})
        setStep2Result(null)
        clearStep3StateOnly()
        clearStep4StateOnly()
        applyBaselineViewAllocations(cleanedOverrides)
        setInitializedSteps(prev => {
          const next = new Set(prev)
          next.delete('therapist-pca')
          return next
        })
        setStepStatus(prev => ({
          ...prev,
          'therapist-pca': 'pending',
          'floating-pca': 'pending',
          'bed-relieving': 'pending',
          review: 'pending',
        }))
        return
      }
      case 'floating-pca': {
        clearStep3StateOnly()
        clearStep3AllocationsPreserveStep2()
        setInitializedSteps(prev => {
          const next = new Set(prev)
          next.delete('floating-pca')
          return next
        })
        setStepStatus(prev => ({
          ...prev,
          'floating-pca': 'pending',
          'bed-relieving': 'pending',
          review: 'pending',
        }))
        return
      }
      case 'bed-relieving': {
        clearStep4StateOnly()
        setInitializedSteps(prev => {
          const next = new Set(prev)
          next.delete('bed-relieving')
          return next
        })
        setStepStatus(prev => ({
          ...prev,
          'bed-relieving': 'pending',
          review: 'pending',
        }))
        return
      }
      default:
        return
    }
  }

  const clearFromStep = async (stepId: ScheduleStepId) => {
    // Clear the selected step and all later steps.
    const stepsToClear = (() => {
      if (stepId === 'leave-fte') return ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving'] as ScheduleStepId[]
      if (stepId === 'therapist-pca') return ['therapist-pca', 'floating-pca', 'bed-relieving'] as ScheduleStepId[]
      if (stepId === 'floating-pca') return ['floating-pca', 'bed-relieving'] as ScheduleStepId[]
      if (stepId === 'bed-relieving') return ['bed-relieving'] as ScheduleStepId[]
      return [] as ScheduleStepId[]
    })()

    // Close any step dialogs to avoid dangling resolvers.
    setShowSpecialProgramOverrideDialog(false)
    setSpecialProgramOverrideResolver(null)
    specialProgramOverrideResolverRef.current = null
    setSubstitutionWizardOpen(false)
    setSubstitutionWizardData(null)
    substitutionWizardResolverRef.current = null
    setFloatingPCAConfigOpen(false)

    if (stepsToClear.includes('leave-fte')) {
      setStaffOverrides({})
      setPcaAllocationErrors({})
      setStep2Result(null)
      clearStep3StateOnly()
      clearStep4StateOnly()
      applyBaselineViewAllocations({})
    } else if (stepsToClear.includes('therapist-pca')) {
      const cleanedOverrides = removeStep2KeysFromOverrides(staffOverrides)
      setStaffOverrides(cleanedOverrides)
      setPcaAllocationErrors({})
      setStep2Result(null)
      clearStep3StateOnly()
      clearStep4StateOnly()
      applyBaselineViewAllocations(cleanedOverrides)
    } else if (stepsToClear.includes('floating-pca')) {
      clearStep3StateOnly()
      clearStep3AllocationsPreserveStep2()
      if (stepsToClear.includes('bed-relieving')) {
        clearStep4StateOnly()
      }
    } else if (stepsToClear.includes('bed-relieving')) {
      clearStep4StateOnly()
    }

    setInitializedSteps(prev => {
      const next = new Set(prev)
      if (stepsToClear.includes('therapist-pca')) next.delete('therapist-pca')
      if (stepsToClear.includes('floating-pca')) next.delete('floating-pca')
      if (stepsToClear.includes('bed-relieving')) next.delete('bed-relieving')
      return next
    })

    setStepStatus(prev => {
      const next = { ...prev }
      stepsToClear.forEach(s => {
        next[s] = 'pending'
      })
      next.review = 'pending'
      return next
    })
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
      setPcaAllocationErrors(prev => ({
        ...prev,
        preferredSlotUnassigned: result.errors!.preferredSlotUnassigned!.join('; ')
      }))
    }
    
    // Mark Step 3 as initialized and completed
    setInitializedSteps(prev => new Set(prev).add('floating-pca'))
    setStepStatus(prev => ({ ...prev, 'floating-pca': 'completed' }))
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
    selections: Record<string, { floatingPCAId: string; slots: number[] }>
  ) => {
    // Resolve the promise in the algorithm callback
    if (substitutionWizardResolverRef.current) {
      substitutionWizardResolverRef.current(selections)
      substitutionWizardResolverRef.current = null
    }
    
    // Also update staffOverrides for persistence
    const newOverrides = { ...staffOverrides }

    // Apply all selections to staffOverrides
    Object.entries(selections).forEach(([key, selection]) => {
      // Key format is `${team}-${nonFloatingPCAId}` but nonFloatingPCAId is a UUID containing '-'.
      // So we must split ONLY on the first '-' to avoid truncating the UUID.
      const dashIdx = key.indexOf('-')
      const team = (dashIdx >= 0 ? key.slice(0, dashIdx) : key) as Team
      const nonFloatingPCAId = dashIdx >= 0 ? key.slice(dashIdx + 1) : ''

      const nonFloatingPCA = staff.find(s => s.id === nonFloatingPCAId)
      if (!nonFloatingPCA) return

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

    setStaffOverrides(newOverrides)

    

    // Note: pcaAllocations will be updated by the algorithm after it receives the selections
  }

  /**
   * Handle cancel from NonFloatingSubstitutionDialog
   * Resolves with empty selections (algorithm will use automatic fallback)
   */
  const handleSubstitutionWizardCancel = () => {
    if (substitutionWizardResolverRef.current) {
      substitutionWizardResolverRef.current({})
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
    switch (currentStep) {
      case 'therapist-pca':
        setCurrentStep('leave-fte')
        break
      case 'floating-pca':
        setCurrentStep('therapist-pca')
        break
      case 'bed-relieving':
        setCurrentStep('floating-pca')
        break
      case 'review':
        setCurrentStep('bed-relieving')
        break
      default:
        break
    }
  }

  /**
   * Reset to baseline - clear all staff overrides and start fresh
   */
  const resetToBaseline = () => {
    setStaffOverrides({})
    setSavedOverrides({})
    setBedCountsOverridesByTeam({})
    setSavedBedCountsOverridesByTeam({})
    setBedRelievingNotesByToTeam({})
    setSavedBedRelievingNotesByToTeam({})
    setAllocationNotesDoc(null)
    setSavedAllocationNotesDoc(null)
    setStep2Result(null)
    setTherapistAllocations({ FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] })
    setPcaAllocations({ FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] })
    setBedAllocations([])
    setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })
    setStepStatus({
      'leave-fte': 'pending',
      'therapist-pca': 'pending',
      'floating-pca': 'pending',
      'bed-relieving': 'pending',
      'review': 'pending',
    })
    setCurrentStep('leave-fte')
    setTieBreakDecisions({})
  }

  // Save all changes to database (batch save)
  const saveScheduleToDatabase = async () => {
    const timer = createTimingCollector()
    let usedRpc = false
    let snapshotWritten = false
    let snapshotBytes: number | null = null
    let specialProgramsBytes: number | null = null
    let saveError: unknown = null
    startTopLoading(0.06)
    bumpTopLoadingTo(0.12)

    // Get the latest staff overrides - use current state
    let overridesToSave = { ...staffOverrides }
    let scheduleId = currentScheduleId
    
    if (!scheduleId) {
      const result = await loadScheduleForDate(selectedDate)
      if (!result || !result.scheduleId) {
        showActionToast('Could not create schedule. Please try again.', 'error')
        timer.stage('ensureScheduleRow')
        setLastSaveTiming(timer.finalize({ ok: false }))
        finishTopLoading()
        return
      }
      scheduleId = result.scheduleId
      // Merge loaded overrides with current overrides (current takes precedence)
      overridesToSave = { ...result.overrides, ...staffOverrides }
    }
    timer.stage('ensureScheduleRow')
    bumpTopLoadingTo(0.2)

    // Build persisted staff_overrides payload (includes schedule-level bed count overrides).
    const staffOverridesPayloadForDb: Record<string, any> = {
      ...overridesToSave,
      __bedCounts: { byTeam: bedCountsOverridesByTeam },
      __bedRelieving: { byToTeam: bedRelievingNotesByToTeam },
      __allocationNotes: { doc: allocationNotesDoc ?? null, updatedAt: new Date().toISOString() },
    }

    setSaving(true)
    try {
      // Collect all allocations that need to be saved
      // IMPORTANT: Save ALL allocations (both with and without overrides) to ensure complete persistence
      const allocationsToSave: Array<{
        staffId: string
        isTherapist: boolean
        team: Team
        fteRemaining: number
        leaveType: LeaveType | null
        alloc: TherapistAllocation | PCAAllocation | null
        invalidSlot?: number
        leaveComebackTime?: string
        isLeave?: boolean
        fteSubtraction?: number // NEW: For PCA base_FTE_remaining calculation
      }> = []

      // First, collect allocations from current state (therapist and PCA allocations)
      const processedStaffIds = new Set<string>()

      // Save all therapist allocations (only actual therapists, not PCAs)
      TEAMS.forEach(team => {
        therapistAllocations[team]?.forEach(alloc => {
          if (processedStaffIds.has(alloc.staff_id)) return
          
          const staffMember = staff.find(s => s.id === alloc.staff_id)
          if (!staffMember) return
          
          // Only save as therapist if staff is actually a therapist rank
          const isActualTherapist = ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
          if (!isActualTherapist) return // Skip PCAs that might be in therapist allocations
          
          processedStaffIds.add(alloc.staff_id)
          
          const override = overridesToSave[alloc.staff_id]
          allocationsToSave.push({
            staffId: alloc.staff_id,
            isTherapist: true,
            team: override?.team ?? alloc.team, // Use team from override if present
            fteRemaining: override ? override.fteRemaining : alloc.fte_therapist,
            leaveType: override ? override.leaveType : alloc.leave_type,
            alloc: alloc
          })
        })
      })

      // Save all PCA allocations
      TEAMS.forEach(team => {
        pcaAllocations[team]?.forEach(alloc => {
          if (processedStaffIds.has(alloc.staff_id)) return
          processedStaffIds.add(alloc.staff_id)
          
          const staffMember = staff.find(s => s.id === alloc.staff_id)
          if (!staffMember) return
          
          const override = overridesToSave[alloc.staff_id]
          allocationsToSave.push({
            staffId: alloc.staff_id,
            isTherapist: false,
            team: alloc.team,
            fteRemaining: override ? override.fteRemaining : alloc.fte_pca,
            leaveType: override ? override.leaveType : alloc.leave_type,
            alloc: alloc,
            invalidSlot: override?.invalidSlot,
            leaveComebackTime: override?.leaveComebackTime,
            isLeave: override?.isLeave,
            fteSubtraction: override?.fteSubtraction // Pass fteSubtraction to save function
          })
        })
      })

      // Also save any overrides that don't have allocations yet (e.g., staff on full leave)
      Object.entries(overridesToSave).forEach(([staffId, override]) => {
        if (processedStaffIds.has(staffId)) return // Already processed above
        
        const staffMember = staff.find(s => s.id === staffId)
        if (!staffMember) return
        
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
        const isPCA = staffMember.rank === 'PCA'
        
        if (!isTherapist && !isPCA) return
        
        // Find team from staff data or from current allocation
        let team: Team = staffMember.team || 'FO'
        
        // Try to find current allocation to get full allocation data
        let currentAlloc: TherapistAllocation | PCAAllocation | null = null
        if (isTherapist) {
          for (const t of TEAMS) {
            const alloc = therapistAllocations[t]?.find(a => a.staff_id === staffId)
            if (alloc) {
              currentAlloc = alloc
              team = alloc.team
              break
            }
          }
        } else if (isPCA) {
          for (const t of TEAMS) {
            const alloc = pcaAllocations[t]?.find(a => a.staff_id === staffId)
            if (alloc) {
              currentAlloc = alloc
              team = alloc.team
              break
            }
          }
        }
        
        allocationsToSave.push({
          staffId,
          isTherapist,
          team,
          fteRemaining: override.fteRemaining,
          leaveType: override.leaveType,
          alloc: currentAlloc,
          invalidSlot: override.invalidSlot,
          leaveComebackTime: override.leaveComebackTime,
          isLeave: override.isLeave,
          fteSubtraction: override.fteSubtraction // Pass fteSubtraction to save function
        })
      })
      timer.stage('collectAllocations')
      bumpTopLoadingTo(0.32)

      // Build special programs reference for UUID conversion
      const specialProgramsRef: SpecialProgramRef[] = specialPrograms.map(sp => ({ id: sp.id, name: sp.name }))

      // Prepare bulk rows for upsert/insert
      const therapistRows: any[] = []
      const pcaRows: any[] = []

      for (const item of allocationsToSave) {
        if (item.isTherapist) {
          const alloc = item.alloc as TherapistAllocation | null
          const rawTherapist = {
            schedule_id: scheduleId,
            staff_id: item.staffId,
            team: item.team,
            fte_therapist: item.fteRemaining,
            fte_remaining: Math.max(0, 1 - item.fteRemaining),
            slot_whole: (alloc as any)?.slot_whole ?? null,
            slot1: alloc?.slot1 ?? item.team,
            slot2: alloc?.slot2 ?? item.team,
            slot3: alloc?.slot3 ?? item.team,
            slot4: alloc?.slot4 ?? item.team,
            leave_type: item.leaveType,
            special_program_ids: alloc?.special_program_ids ?? null,
            is_substitute_team_head: alloc?.is_substitute_team_head ?? false,
            spt_slot_display: alloc?.spt_slot_display ?? null,
            is_manual_override: alloc?.is_manual_override ?? false,
            manual_override_note: alloc?.manual_override_note ?? null,
          }

          therapistRows.push(
            prepareTherapistAllocationForDb({
              allocation: rawTherapist,
              specialPrograms: specialProgramsRef,
            })
          )
        } else {
          const alloc = item.alloc as PCAAllocation | null

          // Base FTE comes from override (Step 1 single source of truth) if present,
          // otherwise fall back to existing allocation value.
          const override = overridesToSave[item.staffId]
          const baseFTEPCA = override?.fteRemaining ?? alloc?.fte_pca ?? item.fteRemaining
          const slotAssigned = (alloc as any)?.slot_assigned ?? (alloc as any)?.fte_assigned ?? 0
          const fteRemaining = Math.max(0, baseFTEPCA - slotAssigned)

          const rawPCA = {
            schedule_id: scheduleId,
            staff_id: item.staffId,
            team: item.team,
            fte_pca: baseFTEPCA,
            fte_remaining: fteRemaining,
            slot_assigned: slotAssigned,
            slot_whole: (alloc as any)?.slot_whole ?? null,
            slot1: (alloc as any)?.slot1 ?? item.team,
            slot2: (alloc as any)?.slot2 ?? item.team,
            slot3: (alloc as any)?.slot3 ?? item.team,
            slot4: (alloc as any)?.slot4 ?? item.team,
            leave_type: item.leaveType,
            special_program_ids: (alloc as any)?.special_program_ids ?? null,
            invalid_slot: item.invalidSlot ?? (alloc as any)?.invalid_slot ?? null,
            leave_comeback_time: item.leaveComebackTime ?? (alloc as any)?.leave_comeback_time ?? null,
            leave_mode:
              item.isLeave !== undefined
                ? item.isLeave
                  ? 'leave'
                  : 'come_back'
                : ((alloc as any)?.leave_mode ?? null),
          }

          pcaRows.push(
            preparePCAAllocationForDb({
              allocation: rawPCA,
              specialPrograms: specialProgramsRef,
            })
          )
        }
      }
      timer.stage('buildDbRows')
      bumpTopLoadingTo(0.42)

      let missingStaffIdsForSave: string[] = []

      // Preflight: verify all allocation staff_ids exist in DB (helps debug FK failures)
      try {
        const submittedIds = Array.from(new Set<string>([
          ...therapistRows.map(r => (r as any)?.staff_id).filter(Boolean),
          ...pcaRows.map(r => (r as any)?.staff_id).filter(Boolean),
        ]))
        const badFormatIds = submittedIds.filter(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        const { data: existingStaff, error: staffCheckError } = await supabase
          .from('staff')
          .select('id')
          .in('id', submittedIds)
        const existingSet = new Set((existingStaff || []).map((r: any) => r?.id).filter(Boolean))
        const missingIds = submittedIds.filter(id => !existingSet.has(id))
        missingStaffIdsForSave = missingIds
        void badFormatIds
        void staffCheckError
      } catch {}

      // If any referenced staff IDs are missing from the staff table, saving allocations will fail
      // due to FK constraints. In this case we (1) warn, (2) strip those rows from the save payload,
      // and (3) remove them from in-memory state so the UI aligns with what can be persisted.
      if (missingStaffIdsForSave.length > 0) {
        showActionToast(
          `Cannot save allocations for ${missingStaffIdsForSave.length} staff record(s) that no longer exist. ` +
            `They will be removed from this schedule (e.g. ${missingStaffIdsForSave[0]}).`,
          'warning'
        )

        // Strip from save payload
        for (let i = therapistRows.length - 1; i >= 0; i--) {
          const sid = (therapistRows[i] as any)?.staff_id
          if (sid && missingStaffIdsForSave.includes(sid)) therapistRows.splice(i, 1)
        }
        for (let i = pcaRows.length - 1; i >= 0; i--) {
          const sid = (pcaRows[i] as any)?.staff_id
          if (sid && missingStaffIdsForSave.includes(sid)) pcaRows.splice(i, 1)
        }

        // Strip from overrides payload (avoid accumulating unreachable keys)
        try {
          missingStaffIdsForSave.forEach(staffId => {
            delete (staffOverridesPayloadForDb as any)[staffId]
            delete (overridesToSave as any)[staffId]
          })
        } catch {
          // ignore
        }

        // Sync UI state to match what can be persisted
        try {
          setStaff(prev => prev.filter(s => !missingStaffIdsForSave.includes((s as any)?.id)))
          setInactiveStaff(prev => prev.filter(s => !missingStaffIdsForSave.includes((s as any)?.id)))
          setBufferStaff(prev => prev.filter(s => !missingStaffIdsForSave.includes((s as any)?.id)))
          setTherapistAllocations(prev => {
            const next: any = { ...prev }
            TEAMS.forEach(team => {
              next[team] = (next[team] || []).filter((a: any) => !missingStaffIdsForSave.includes(a?.staff_id))
            })
            return next
          })
          setPcaAllocations(prev => {
            const next: any = { ...prev }
            TEAMS.forEach(team => {
              next[team] = (next[team] || []).filter((a: any) => !missingStaffIdsForSave.includes(a?.staff_id))
            })
            return next
          })
        } catch {
          // ignore
        }
      }

      // Schedule calculations: upsert per (schedule_id, team) if available
      const calcRows = TEAMS.map(team => calculations[team])
        .filter((c): c is ScheduleCalculations => !!c)
        .map(c => ({
          schedule_id: scheduleId,
          team: c.team,
          designated_wards: c.designated_wards ?? [],
          total_beds_designated: c.total_beds_designated,
          total_beds: c.total_beds,
          total_pt_on_duty: normalizeFTE(c.total_pt_on_duty),
          beds_per_pt: normalizeFTE(c.beds_per_pt),
          pt_per_team: normalizeFTE(c.pt_per_team),
          beds_for_relieving: normalizeFTE(c.beds_for_relieving),
          pca_on_duty: normalizeFTE(c.pca_on_duty),
          total_pt_per_pca: normalizeFTE(c.total_pt_per_pca),
          total_pt_per_team: normalizeFTE(c.total_pt_per_team),
          average_pca_per_team: normalizeFTE(c.average_pca_per_team),
        }))

      // Bed allocations: replace as a whole (fast + avoids requiring extra unique constraints)
      const bedRows = bedAllocations.map(b => ({
        schedule_id: scheduleId,
        from_team: b.from_team,
        to_team: b.to_team,
        ward: b.ward,
        num_beds: b.num_beds,
        slot: b.slot ?? null,
      }))

      // Persist schedule-level metadata (tie-break decisions, staff_overrides, workflow_state)
      const completedStepsForWorkflow = ALLOCATION_STEPS
        .filter(step => stepStatus[step.id] === 'completed')
        .map(step => step.id) as WorkflowState['completedSteps']

      const workflowStateToSave: WorkflowState = {
        currentStep: currentStep as WorkflowState['currentStep'],
        completedSteps: completedStepsForWorkflow,
      }

      // Optional fast path: server-side RPC transaction (falls back to client-side batch writes)
      if (cachedSaveScheduleRpcAvailable !== false) {
        bumpTopLoadingTo(0.55)
        startSoftAdvance(0.86)
        const rpcRes = await supabase.rpc('save_schedule_v1', {
          p_schedule_id: scheduleId,
          therapist_allocations: therapistRows,
          pca_allocations: pcaRows,
          bed_allocations: bedRows,
          calculations: calcRows,
          tie_break_decisions: tieBreakDecisions,
          staff_overrides: staffOverridesPayloadForDb,
          workflow_state: workflowStateToSave,
        })

        if (!rpcRes.error) {
          cachedSaveScheduleRpcAvailable = true
          usedRpc = true
        } else {
          // Cache "not available" only for "function missing" style errors.
          const msg = rpcRes.error.message || ''
          if (
            msg.includes('save_schedule_v1') ||
            msg.includes('Could not find the function') ||
            (rpcRes.error as any)?.code === 'PGRST202'
          ) {
            cachedSaveScheduleRpcAvailable = false
          }
          console.warn('save_schedule_v1 RPC failed, falling back to client-side save:', rpcRes.error)
        }
      }

      if (!usedRpc) {
        bumpTopLoadingTo(0.55)
        startSoftAdvance(0.82)
        // Client-side bulk writes (dramatically fewer round-trips than per-row update/insert)
        const upsertPromises: PromiseLike<any>[] = []
        if (therapistRows.length > 0) {
          upsertPromises.push(
            supabase
              .from('schedule_therapist_allocations')
              .upsert(therapistRows, { onConflict: 'schedule_id,staff_id' })
          )
        }
        if (pcaRows.length > 0) {
          upsertPromises.push(
            supabase
              .from('schedule_pca_allocations')
              .upsert(pcaRows, { onConflict: 'schedule_id,staff_id' })
          )
        }
        if (calcRows.length > 0) {
          upsertPromises.push(
            supabase.from('schedule_calculations').upsert(calcRows, { onConflict: 'schedule_id,team' })
          )
        }

        const bedDeletePromise = supabase.from('schedule_bed_allocations').delete().eq('schedule_id', scheduleId)
        const [bedDeleteRes, ...upsertResults] = await Promise.all([bedDeletePromise, ...upsertPromises])

        const firstWriteError =
          (bedDeleteRes as any)?.error || upsertResults.find(r => (r as any)?.error)?.error
        if (firstWriteError) {
          console.error('Error saving schedule:', firstWriteError)
          showActionToast(`Error saving schedule: ${firstWriteError.message || 'Unknown error'}`, 'error')
          saveError = firstWriteError
          timer.stage('writeAllocations.error')
          return
        }

        if (bedRows.length > 0) {
          const bedInsertRes = await supabase.from('schedule_bed_allocations').insert(bedRows)
          if (bedInsertRes.error) {
            console.error('Error saving bed allocations:', bedInsertRes.error)
            showActionToast(
              `Error saving bed allocations: ${bedInsertRes.error.message || 'Unknown error'}`,
              'error'
            )
            saveError = bedInsertRes.error
            timer.stage('writeAllocations.error')
            return
          }
        }
      }
      stopSoftAdvance()
      timer.stage('writeAllocations')
      bumpTopLoadingTo(0.86)
      
      // Update saved state
      setSavedOverrides({ ...overridesToSave })
      setStaffOverrides({ ...overridesToSave }) // Also update staffOverrides with the merged data
      setSavedBedCountsOverridesByTeam({ ...(bedCountsOverridesByTeam as any) })
      setSavedBedRelievingNotesByToTeam({ ...(bedRelievingNotesByToTeam as any) })
      setSavedAllocationNotesDoc(allocationNotesDoc)
      
      // OPTIMIZATION: Clear cache for this date after save to force fresh load next time
      const year = selectedDate.getFullYear()
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const day = String(selectedDate.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      clearCachedSchedule(dateStr)

      // Conditional snapshot refresh:
      // - Avoid rewriting baseline_snapshot on every save (large JSONB write).
      // - Refresh only when snapshot health is not ok, referenced staff are missing, legacy/raw detected,
      //   or when RPT/APPT team transfer overrides need to be reflected in snapshot staff.team.
      try {
        const referencedIds = extractReferencedStaffIds({
          therapistAllocs: allocationsToSave.filter(a => a.isTherapist).map(a => ({ staff_id: a.staffId })),
          pcaAllocs: allocationsToSave.filter(a => !a.isTherapist).map(a => ({ staff_id: a.staffId })),
          staffOverrides: overridesToSave,
        })

        const baselineStaffById = new Map<string, any>()
        ;(baselineSnapshot?.staff || []).forEach((s: any) => s?.id && baselineStaffById.set(s.id, s))

        const missingReferencedIds: string[] = []
        referencedIds.forEach(id => {
          if (!baselineStaffById.has(id)) missingReferencedIds.push(id)
        })

        const hasLegacyWrappedIssue = !!snapshotHealthReport?.issues?.includes('wrappedLegacySnapshot')
        const needsRepairRefresh =
          !baselineSnapshot ||
          !snapshotHealthReport ||
          snapshotHealthReport.status !== 'ok' ||
          missingReferencedIds.length > 0 ||
          hasLegacyWrappedIssue

        // Team transfer overrides for fixed-team therapists (APPT/RPT) should be reflected in snapshot staff.team
        // to keep per-date isolation consistent for subsequent loads/copies.
        let hasTeamOverrideChange = false
        if (baselineSnapshot?.staff && baselineSnapshot.staff.length > 0) {
          for (const [staffId, o] of Object.entries(overridesToSave)) {
            const nextTeam = (o as any)?.team as Team | undefined
            if (!nextTeam) continue
            const snapRow = baselineStaffById.get(staffId)
            if (!snapRow) continue
            const rank = snapRow?.rank
            if (rank !== 'APPT' && rank !== 'RPT') continue
            const snapTeam = snapRow?.team ?? null
            if (snapTeam !== nextTeam) {
              hasTeamOverrideChange = true
              break
            }
          }
        }

        if (needsRepairRefresh || hasTeamOverrideChange) {
          let nextSnapshot: BaselineSnapshot
          let nextReport: SnapshotHealthReport | null = snapshotHealthReport

          if (needsRepairRefresh) {
            const { data: existingScheduleRow } = await supabase
              .from('daily_schedules')
              .select('baseline_snapshot')
              .eq('id', scheduleId)
              .maybeSingle()

            const existingBaselineStored = (existingScheduleRow as any)?.baseline_snapshot as
              | BaselineSnapshotStored
              | undefined

            const result = await validateAndRepairBaselineSnapshot({
              storedSnapshot: existingBaselineStored,
              referencedStaffIds: referencedIds,
              fetchLiveStaffByIds: async (ids) => {
                if (ids.length === 0) return []
                const attempt = await supabase
                  .from('staff')
                  .select('id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program')
                  .in('id', ids)
                if (!attempt.error) return (attempt.data || []) as any[]
                // Legacy fallback: older schemas may not have status/buffer_fte columns
                if (attempt.error.message?.includes('column') || (attempt.error as any)?.code === '42703') {
                  const fallback = await supabase.from('staff').select('*').in('id', ids)
                  return (fallback.data || []) as any[]
                }
                return (attempt.data || []) as any[]
              },
              buildFallbackBaseline: buildBaselineSnapshotFromCurrentState,
              sourceForNewEnvelope: 'save',
            })

            nextSnapshot = result.data
            nextReport = result.report
          } else {
            nextSnapshot = baselineSnapshot
          }

          // Apply APPT/RPT team overrides onto snapshot staff rows when needed
          if (hasTeamOverrideChange && nextSnapshot?.staff) {
            const patchedStaff = nextSnapshot.staff.map((s: any) => {
              const o = overridesToSave[s.id]
              const nextTeam = (o as any)?.team as Team | undefined
              if (!nextTeam) return s
              if (s.rank !== 'APPT' && s.rank !== 'RPT') return s
              if ((s.team ?? null) === nextTeam) return s
              return { ...s, team: nextTeam }
            })
            nextSnapshot = { ...(nextSnapshot as any), staff: patchedStaff }
          }

          // Persist updated snapshot back. Always store v1 envelope.
          // OPTIMIZATION: Include pre-calculated values to avoid recalculation on load
          const minifiedSnapshot: BaselineSnapshot = {
            ...(nextSnapshot as any),
            specialPrograms: minifySpecialProgramsForSnapshot((nextSnapshot as any).specialPrograms || []) as any,
            calculatedValues: {
              calculations: calculations,
              calculatedAt: new Date().toISOString(),
              calculatedForStep: currentStep as ScheduleStepId,
            },
          }
          if (userRole === 'developer') {
            try {
              specialProgramsBytes = JSON.stringify((minifiedSnapshot as any).specialPrograms || []).length
              snapshotBytes = JSON.stringify(buildBaselineSnapshotEnvelope({ data: minifiedSnapshot, source: 'save' }) as any).length
            } catch {
              // ignore
            }
          }
          const envelopeToSave = buildBaselineSnapshotEnvelope({ data: minifiedSnapshot, source: 'save' })
          await supabase.from('daily_schedules').update({ baseline_snapshot: envelopeToSave as any }).eq('id', scheduleId)
          snapshotWritten = true

          setBaselineSnapshot(minifiedSnapshot)
          if (nextReport) setSnapshotHealthReport(nextReport)
        }
      } catch (e) {
        console.warn('Failed to refresh baseline snapshot during save (skipped):', e)
      }
      timer.stage('snapshotRefresh')
      bumpTopLoadingTo(0.92)

      if (!usedRpc) {
        const { error: scheduleMetaError } = await supabase
          .from('daily_schedules')
          .update({
            tie_break_decisions: tieBreakDecisions,
            staff_overrides: staffOverridesPayloadForDb,
            workflow_state: workflowStateToSave,
          })
          .eq('id', scheduleId)

        if (scheduleMetaError) {
          console.error('Error saving schedule metadata:', scheduleMetaError)
        } else {
          setPersistedWorkflowState(workflowStateToSave)
        }
      } else {
        // RPC already persisted metadata transactionally.
        setPersistedWorkflowState(workflowStateToSave)
      }
      timer.stage('metadata')
      bumpTopLoadingTo(0.96)
      
      // Unmet PCA needs tracking removed - feature no longer used
      
      showActionToast('Saved successfully.', 'success')
    } catch (error) {
      console.error('Error saving schedule:', error)
      saveError = error
      showActionToast('Failed to save. Please try again.', 'error')
    } finally {
      setSaving(false)
      // Persist timing report (developer-only tooltip, but collection is cheap)
      if (userRole === 'developer' && specialProgramsBytes == null) {
        try {
          const prog = baselineSnapshot?.specialPrograms ?? specialPrograms
          specialProgramsBytes = JSON.stringify(minifySpecialProgramsForSnapshot(prog as any)).length
        } catch {
          // ignore
        }
      }
      setLastSaveTiming(
        timer.finalize({
          ok: !saveError,
          rpcUsed: usedRpc,
          snapshotWritten,
          snapshotHasMinifiedPrograms: true,
          snapshotBytes,
          specialProgramsBytes,
        })
      )
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
    const timer = createTimingCollector()
    let serverTiming: any = null
    let copyError: unknown = null

    setCopying(true)
    startTopLoading(0.06)
    bumpTopLoadingTo(0.18)
    startSoftAdvance(0.72)

    try {
      const res = await fetch('/api/schedules/copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromDate: formatDateForInput(fromDate),
          toDate: formatDateForInput(toDate),
          mode,
          includeBufferStaff,
        }),
      })
      timer.stage('fetch')
      bumpTopLoadingTo(0.72)

      let data: any = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      serverTiming = data?.timings ?? null
      timer.stage('parseResponse')
      stopSoftAdvance()
      bumpTopLoadingTo(0.8)

      if (!res.ok) {
        const message = data?.error ? String(data.error) : 'Failed to copy schedule.'
        throw new Error(message)
      }

      // Close wizard after success (non-modal feedback will be shown via toast).
      setCopyWizardOpen(false)
      setCopyWizardConfig(null)
      setCopyMenuOpen(false)
      timer.stage('closeWizard')
      bumpTopLoadingTo(0.86)

      // Highlight the newly-loaded date label briefly.
      setHighlightDateKey(formatDateForInput(toDate))

      // Navigate to copied schedule date and reload schedule metadata
      setSelectedDate(toDate)
      setScheduleLoadedForDate(null)
      timer.stage('navigate')
      bumpTopLoadingTo(0.92)

      // Non-blocking refresh: optimistically mark the target date as having data,
      // then refresh the full set in the background (no await).
      setDatesWithData(prev => {
        const next = new Set(prev)
        next.add(formatDateForInput(toDate))
        return next
      })
      loadDatesWithData({ force: true })
      timer.stage('refreshDates')
      bumpTopLoadingTo(0.98)

      showActionToast(`Copied schedule to ${formatDateDDMMYYYY(toDate)}.`, 'success')

      return {
        copiedUpToStep: (data as any).copiedUpToStep as string | undefined,
      }
    } catch (e) {
      copyError = e
      throw e
    } finally {
      setCopying(false)
      setLastCopyTiming(
        timer.finalize({
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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = parseDateFromInput(e.target.value)
    if (!isNaN(newDate.getTime())) {
      setSelectedDate(newDate)
      setCalendarOpen(false) // Close calendar dialog when date is selected
    }
  }

  const currentWeekday = getWeekday(selectedDate)
  const weekdayName = WEEKDAY_NAMES[WEEKDAYS.indexOf(currentWeekday)]

  // ---------------------------------------------------------------------------
  // Copy button helpers (dynamic labels and source/target resolution)
  // ---------------------------------------------------------------------------
  const selectedDateStr = formatDateForInput(selectedDate)
  const currentHasData = datesWithData.has(selectedDateStr)

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

  const sptBaseFteByStaffId = useMemo(() => {
    const next: Record<string, number> = {}
    for (const a of sptAllocations) {
      if (!a.weekdays?.includes(currentWeekday)) continue
      const raw = (a as any).fte_addon
      const fte = typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
      if (Number.isFinite(fte)) next[a.staff_id] = fte
    }
    return next
  }, [sptAllocations, currentWeekday])

  // SPT leave edit enhancement:
  // Nullify legacy auto-filled "FTE Cost due to Leave" for SPT where it was derived from (1.0 - remaining),
  // even when there is no real leave. New model:
  // - Base SPT FTE comes from spt_allocations.fte_addon (dashboard) unless overridden.
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
      const cfg = sptAllocations.find(a => a.staff_id === s.id && a.weekdays?.includes(currentWeekday))
      const cfgFTEraw = (cfg as any)?.fte_addon
      const cfgFTE =
        typeof cfgFTEraw === 'number'
          ? cfgFTEraw
          : cfgFTEraw != null
            ? parseFloat(String(cfgFTEraw))
            : NaN
      if (!Number.isFinite(cfgFTE)) continue

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
  }, [staff, sptAllocations, staffOverrides, currentWeekday])

  // Filter out buffer staff from regular pools (they appear in Buffer Staff Pool)
  const therapists = staff.filter(s => ['SPT', 'APPT', 'RPT'].includes(s.rank) && s.status !== 'buffer')
  const pcas = staff.filter(s => s.rank === 'PCA' && s.status !== 'buffer')

  // Helper function to calculate popover position with viewport boundary detection
  const calculatePopoverPosition = (cardRect: { left: number; top: number; width: number; height: number }, popoverWidth: number) => {
    const padding = 10
    const estimatedPopoverHeight = 250 // Estimate based on max slots (4) + header + padding
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
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
    
    return { x: popoverX, y: popoverY }
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
    
    // For multi-slot PCAs, show slot selection when leaving source team
    if (pcaDragState.availableSlots.length > 1 && !pcaDragState.showSlotSelection && isOverDifferentTeam) {
      // Calculate popover position from the current drag position
      // Use the initial rect of the dragged element (where it started)
      const activeRect = active.rect.current.initial
      const translatedRect = active.rect.current.translated
      const cardRect = activeRect || translatedRect
      
      const popoverPos = cardRect ? calculatePopoverPosition(cardRect, 150) : { x: 100, y: 100 }
      
      setPcaDragState(prev => ({
        ...prev,
        showSlotSelection: true,
        popoverPosition: popoverPos,
      }))
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
      
      return {
        ...prev,
        [staffId]: {
          ...current,
          slotOverrides: updatedSlotOverrides,
        },
      }
    })
  }
  
  // Perform the actual slot transfer
  const performSlotTransfer = (targetTeam: Team) => {
    const staffId = pcaDragState.staffId
    const sourceTeam = pcaDragState.sourceTeam
    const selectedSlots = pcaDragState.selectedSlots
    
    if (!staffId || selectedSlots.length === 0) {
      handleCloseSlotSelection()
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
        leave_comeback_time: undefined,
        leave_mode: undefined,
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
          fteRemaining: bufferFTE,
        },
      }))
      
      // Update pending FTE per team (reduce target team's pending by buffer PCA FTE)
      const fteTransferred = bufferFTE
      setPendingPCAFTEPerTeam(prev => ({
        ...prev,
        [targetTeam]: Math.max(0, (prev[targetTeam] || 0) - fteTransferred),
      }))
      
      handleCloseSlotSelection()
      return
    }
    
    // If no existing allocation and not buffer staff, can't proceed
    if (!currentAllocation) {
      handleCloseSlotSelection()
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
    handleCloseSlotSelection()
  }

  // Handle drag and drop for therapist staff cards (RPT and SPT only) AND PCA slot transfers
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const activeId = active.id as string
    // Extract staff ID from composite ID (format: staffId or staffId::team)
    const staffId = activeId.includes('::') ? activeId.split('::')[0] : activeId
    const staffMember = staff.find(s => s.id === staffId)
    
    
    // Show popover again after unsuccessful drag from popover
    const showPopoverAgain = () => {
      setPcaDragState(prev => ({
        ...prev,
        isActive: false,
        isDraggingFromPopover: false,
        showSlotSelection: true,
      }))
    }
    
    // Keep popover visible but mark drag as inactive (for multi-slot selection)
    const pausePcaDrag = () => {
      setPcaDragState(prev => ({
        ...prev,
        isActive: false,
        isDraggingFromPopover: false,
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
            popoverPosition: prev.popoverPosition || calculatePopoverPosition({ left: 100, top: 100, width: 0, height: 0 }, 150),
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
            popoverPosition: prev.popoverPosition || calculatePopoverPosition({ left: 100, top: 100, width: 0, height: 0 }, 150),
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
          showPopoverAgain()
          return
        }
        if (pcaDragState.showSlotSelection && pcaDragState.availableSlots.length > 1) {
          pausePcaDrag()
          return
        }
        resetPcaDragState()
        return
      }
      
      // If no slots selected but multi-slot, keep popover visible
      if (selectedSlots.length === 0) {
        if (pcaDragState.availableSlots.length > 1) {
          pausePcaDrag()
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

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      {/* Thin top loading bar (Save/Copy). Shown for everyone. */}
      {topLoadingVisible && (
        <div className="fixed top-0 left-0 right-0 h-[6px] z-[99999] bg-transparent">
          <div
            className="h-full bg-sky-500 transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(topLoadingProgress * 100)}%` }}
          />
        </div>
      )}
      {/* PCA Slot Selection Popover */}
      {pcaDragState.showSlotSelection && pcaDragState.popoverPosition && pcaDragState.staffName && (
        <SlotSelectionPopover
          staffName={pcaDragState.staffName}
          availableSlots={pcaDragState.availableSlots}
          selectedSlots={pcaDragState.selectedSlots}
          onSlotToggle={handleSlotToggle}
          onClose={handleCloseSlotSelection}
          onStartDrag={handleStartDragFromPopover}
          position={pcaDragState.popoverPosition}
          isDiscardMode={pcaDragState.isDiscardMode}
        />
      )}
      
      
      {/* Warning Popover for leave arrangement edit after step 1 */}
      {leaveEditWarningPopover.show && leaveEditWarningPopover.position && (
        <div
          className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-3 w-[200px]"
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
          className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-3 w-[200px]"
          style={{
            left: bedRelievingEditWarningPopover.position.x,
            top: bedRelievingEditWarningPopover.position.y,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setBedRelievingEditWarningPopover({ show: false, position: null })
            }}
            className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1 pr-4">
            Bed Relieving Edit Not Available
          </div>
          <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
            Bed relieving note editing is only available in Step 4 (Bed Relieving). Please return to Step 4 to edit.
          </div>
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
      <DragOverlay />
      
      <div className="container mx-auto p-4 min-w-[1360px]">
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
                setActionToast(prev => (prev && prev.id === actionToast.id ? null : prev))
              }}
            />
          </div>
        )}
        {showBackButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
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
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Button>
        )}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            {userRole === 'developer' ? (
              <Tooltip
                side="bottom"
                className="p-0 bg-transparent border-0 shadow-none whitespace-normal"
                content={
                  <div className="w-[360px] bg-slate-800 border border-slate-700 rounded-md shadow-lg">
                    <div className="border-b border-slate-700 px-3 py-2 text-xs text-slate-500">
                      Load diagnostics
                    </div>
                    <div className="px-3 py-2 text-xs text-slate-200 space-y-2">
                      {lastLoadTiming ? (
                        <>
                          <div>
                            <span className="text-slate-400">total:</span>{' '}
                            {Math.round(lastLoadTiming.totalMs)}ms
                          </div>
                          {(() => {
                            const meta = (lastLoadTiming.meta as any) || {}
                            const snapshotKb =
                              typeof meta.snapshotBytes === 'number'
                                ? Math.round(meta.snapshotBytes / 1024)
                                : null
                            return (
                              <div className="text-[11px] text-slate-400 space-y-0.5">
                                <div>
                                  rpc:{meta.rpcUsed ? 'yes' : 'no'}
                                  {meta.batchedQueriesUsed ? ', batched:yes' : ', batched:no'}
                                  {meta.baselineSnapshotUsed ? ', snapshot:yes' : ', snapshot:no'}
                                </div>
                                <div>
                                  calcs:{meta.calculationsSource || 'unknown'}
                                  {snapshotKb != null ? `, snapshot:${snapshotKb}KB` : ''}
                                </div>
                                {meta.counts ? (
                                  <div>
                                    rows: th={meta.counts.therapistAllocs ?? 0}, pca={meta.counts.pcaAllocs ?? 0},
                                    bed={meta.counts.bedAllocs ?? 0}, calcsRows={meta.counts.calculationsRows ?? 0}
                                  </div>
                                ) : null}
                              </div>
                            )
                          })()}
                          {lastLoadTiming.stages.length > 0 ? (
                            <div className="pt-1 text-[11px] text-slate-300 space-y-0.5">
                              {lastLoadTiming.stages.map(s => (
                                <div key={`load-${s.name}`}>
                                  <span className="text-slate-400">{s.name}:</span>{' '}
                                  {Math.round(s.ms)}ms
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="text-slate-500">No load timing captured yet.</div>
                      )}
                    </div>
                  </div>
                }
              >
                <h1 className="text-2xl font-bold">Schedule Allocation</h1>
              </Tooltip>
            ) : (
              <h1 className="text-2xl font-bold">Schedule Allocation</h1>
            )}
            <div className="flex items-center space-x-2 relative">
              {(() => {
                const prevWorkingDay = getPreviousWorkingDay(selectedDate)
                const nextWorkingDay = getNextWorkingDay(selectedDate)
                const prevLabel = `${formatDateDDMMYYYY(prevWorkingDay)} (${WEEKDAY_NAMES[WEEKDAYS.indexOf(getWeekday(prevWorkingDay))]})`
                const nextLabel = `${formatDateDDMMYYYY(nextWorkingDay)} (${WEEKDAY_NAMES[WEEKDAYS.indexOf(getWeekday(nextWorkingDay))]})`

                return (
                  <div className="inline-flex items-center border border-border rounded-md overflow-hidden bg-background shadow-sm">
                    <Tooltip side="bottom" content={`Previous working day: ${prevLabel}`}>
                      <button
                        type="button"
                        aria-label="Previous working day"
                        onClick={() => {
                          setCalendarOpen(false)
                          setSelectedDate(prevWorkingDay)
                        }}
                        className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 hover:scale-110 active:scale-95 border-r border-border"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </Tooltip>

                    <button
                      type="button"
                      aria-label="Go to today"
                      onClick={() => {
                        setCalendarOpen(false)
                        const today = new Date()
                        const target = isWorkingDay(today) ? today : getNextWorkingDay(today)
                        setSelectedDate(target)
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 hover:scale-105 active:scale-95 border-r border-border"
                    >
                      Today
                    </button>

                    <Tooltip side="bottom" content={`Next working day: ${nextLabel}`}>
                      <button
                        type="button"
                        aria-label="Next working day"
                        onClick={() => {
                          setCalendarOpen(false)
                          setSelectedDate(nextWorkingDay)
                        }}
                        className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 hover:scale-110 active:scale-95"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                )
              })()}
              <span
                className={`text-lg font-semibold rounded px-2 py-1 transition-shadow transition-colors ${
                  isDateHighlighted
                    ? 'bg-amber-50 ring-2 ring-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
                    : ''
                }`}
              >
                {formatDateDDMMYYYY(selectedDate)} ({weekdayName})
              </span>
              <button
                ref={calendarButtonRef}
                onClick={() => setCalendarOpen(!calendarOpen)}
                className="cursor-pointer flex items-center"
                type="button"
                aria-label="Open date picker"
              >
                <Tooltip side="bottom" content="Open calendar">
                  <span className="inline-flex">
                    <Calendar className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                  </span>
                </Tooltip>
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-2">
              {/* Copy dropdown button */}
              <div className="relative">
                {userRole === 'developer' ? (
                  <Tooltip
                    side="bottom"
                    className="p-0 bg-transparent border-0 shadow-none whitespace-normal"
                    content={
                      <div className="w-56 bg-slate-800 border border-slate-700 rounded-md shadow-lg">
                        <div className="border-b border-slate-700 px-3 py-2 text-xs text-slate-500">
                          Admin diagnostics
                        </div>

                        {snapshotHealthReport ? (
                          <div className="px-3 pt-2 text-xs text-slate-200 space-y-1">
                            <div>
                              <span className="text-slate-400">snapshotHealth:</span>{' '}
                              {snapshotHealthReport.status}
                            </div>
                            {snapshotHealthReport.issues?.length > 0 && (
                              <div>
                                <span className="text-slate-400">issues:</span>{' '}
                                {snapshotHealthReport.issues.join(', ')}
                              </div>
                            )}
                            <div>
                              <span className="text-slate-400">staff:</span>{' '}
                              {snapshotHealthReport.snapshotStaffCount} (missing referenced:{' '}
                              {snapshotHealthReport.missingReferencedStaffCount})
                            </div>
                            {(snapshotHealthReport.schemaVersion || snapshotHealthReport.source) && (
                              <div>
                                <span className="text-slate-400">meta:</span>{' '}
                                {snapshotHealthReport.schemaVersion
                                  ? `v${snapshotHealthReport.schemaVersion}`
                                  : 'v?'}
                                {snapshotHealthReport.source ? `, ${snapshotHealthReport.source}` : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="px-3 pt-2 text-xs text-slate-500">snapshotHealth: (none)</div>
                        )}

                        <div className="border-t border-slate-700 mt-2 px-3 py-2 text-[11px] text-slate-500">
                          Copy timing
                        </div>
                        <div className="px-3 pb-3 text-xs text-slate-200 space-y-1">
                          {lastCopyTiming ? (
                            <>
                              <div>
                                <span className="text-slate-400">client total:</span>{' '}
                                {Math.round(lastCopyTiming.totalMs)}ms
                              </div>
                              {lastCopyTiming.stages.length > 0 && (
                                <div className="text-[11px] text-slate-300 space-y-0.5">
                                  {lastCopyTiming.stages.map(s => (
                                    <div key={`copy-client-${s.name}`}>
                                      <span className="text-slate-400">{s.name}:</span>{' '}
                                      {Math.round(s.ms)}ms
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
                                      <span className="text-slate-400">server total:</span>{' '}
                                      {Math.round(server.totalMs ?? 0)}ms{' '}
                                      {typeof server?.meta?.rpcUsed === 'boolean'
                                        ? `(rpc:${server.meta.rpcUsed ? 'yes' : 'no'})`
                                        : null}
                                      {typeof server?.meta?.baselineBytes === 'number' ? (
                                        <span className="text-slate-400">
                                          {' '}
                                          baseline:{Math.round(server.meta.baselineBytes / 1024)}KB
                                        </span>
                                      ) : null}
                                      {typeof server?.meta?.specialProgramsBytes === 'number' ? (
                                        <span className="text-slate-400">
                                          {' '}
                                          sp:{Math.round(server.meta.specialProgramsBytes / 1024)}KB
                                        </span>
                                      ) : null}
                                    </div>
                                    {Array.isArray(server.stages) && server.stages.length > 0 && (
                                      <div className="text-[11px] text-slate-300 space-y-0.5">
                                        {server.stages.map((s: any) => (
                                          <div key={`copy-server-${s.name}`}>
                                            <span className="text-slate-400">{s.name}:</span>{' '}
                                            {Math.round(s.ms ?? 0)}ms
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
              {userRole === 'developer' ? (
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
              {/* Dev/Testing Dropdown Menu */}
              <div className="relative">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setShowDevMenu(!showDevMenu)}
                  title="More Options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
                {showDevMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-50">
                    <div className="p-1">
                      <button
                        className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-slate-700 rounded"
                        onClick={() => {
                          setShowDevMenu(false)
                          generateAllocations()
                        }}
                        disabled={loading}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate All (with current edits)
                      </button>
                      <button
                        className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-slate-700 rounded text-red-400"
                        onClick={() => {
                          setShowDevMenu(false)
                          resetToBaseline()
                        }}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset to Baseline (clear all edits)
                      </button>
                    </div>
                    <div className="border-t border-slate-700 px-3 py-2 text-xs text-slate-500">
                      Dev/Testing Options
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>

        {/* Step Indicator with Navigation */}
        <div className="mb-4">
          <StepIndicator
            steps={ALLOCATION_STEPS}
            currentStep={currentStep}
            stepStatus={stepStatus}
            onStepClick={(stepId) => setCurrentStep(stepId)}
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

        <div className="relative flex gap-4 min-w-0">
          {/* Grid loading overlay: dim only below StepIndicator */}
          {gridLoading && (
            <div className="absolute inset-0 z-50 pointer-events-auto">
              <div className="absolute inset-0 bg-slate-950/25 backdrop-blur-[1px]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingAnimation className="w-[200px] h-[200px]" />
              </div>
            </div>
          )}
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

            <div className="flex-1 min-h-0">
              <StaffPool
                therapists={therapists}
                pcas={pcas}
                inactiveStaff={inactiveStaff}
                bufferStaff={bufferStaff}
                onEditStaff={handleEditStaff}
                staffOverrides={staffOverrides}
                specialPrograms={specialPrograms}
                pcaAllocations={pcaAllocations}
                currentStep={currentStep}
                initializedSteps={initializedSteps}
                weekday={selectedDate ? getWeekday(selectedDate) : undefined}
                onBufferStaffCreated={loadStaff}
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
            </div>
          </div>

          <div className="flex-1 min-w-0 bg-background">
            {/* Sticky Team headers row (Excel-like freeze) */}
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
              <div ref={teamHeaderScrollRef} className="overflow-x-auto bg-background">
                <div className="grid grid-cols-8 gap-2 py-2 min-w-[960px]">
                  {TEAMS.map((team) => (
                    <h2 key={`header-${team}`} className="text-lg font-bold text-center">
                      {team}
                    </h2>
                  ))}
                </div>
              </div>
            </div>

            {/* Team grid content (horizontal scroller) */}
            <div ref={teamGridScrollRef} className="overflow-x-auto bg-background">
              <div className="min-w-[960px]">
                {/* Height anchor for Staff Pool column: stop at bottom of PCA Dedicated table (exclude notes board). */}
                <div ref={rightContentRef}>
                
                {/* Block 1: Therapist Allocation */}
                <div className="mb-4">
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
                        onEditStaff={handleEditStaff}
                        staffOverrides={staffOverrides}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Block 2: PCA Allocation */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-center mb-2">PCA Allocation</h3>
                  <div className="grid grid-cols-8 gap-2">
                    {TEAMS.map((team) => (
                      <Fragment key={`pca-${team}`}>
                        <PCABlock
                          team={team}
                          allocations={pcaAllocations[team]}
                          onEditStaff={handleEditStaff}
                          requiredPCA={calculations[team]?.required_pca_per_team}
                          averagePCAPerTeam={calculations[team]?.average_pca_per_team}
                          baseAveragePCAPerTeam={calculations[team]?.base_average_pca_per_team}
                        specialPrograms={specialPrograms}
                          allPCAAllocations={Object.values(pcaAllocations).flat()}
                          staffOverrides={staffOverrides}
                          allPCAStaff={pcas}
                          currentStep={currentStep}
                          step2Initialized={initializedSteps.has('therapist-pca')}
                          initializedSteps={initializedSteps}
                          weekday={getWeekday(selectedDate)}
                          externalHover={popoverDragHoverTeam === team}
                          allocationLog={allocationTracker?.[team]}
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
                          currentStep={currentStep}
                          onInvalidEditAttempt={(position) => {
                            setBedRelievingEditWarningPopover({ show: true, position })
                            setTimeout(() => {
                              setBedRelievingEditWarningPopover(prev => ({ ...prev, show: false }))
                            }, 5000)
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
                      // Include staff with leave_type set OR staff with FTE = 0 (full leave)
                      // Prioritize staffOverrides leave type over allocation leave type
                      const therapistLeaves = therapistAllocations[team]
                        .filter(alloc => {
                          const override = staffOverrides[alloc.staff.id]
                          const hasLeaveType = override?.leaveType !== null && override?.leaveType !== undefined
                          const hasLeaveTypeInAlloc = alloc.leave_type !== null
                          const hasZeroFTE = (alloc.fte_therapist || 0) === 0
                          return hasLeaveType || hasLeaveTypeInAlloc || hasZeroFTE
                        })
                        .map(alloc => {
                          const override = staffOverrides[alloc.staff.id]
                          // Use override leave type if available, otherwise use allocation leave type
                          const leaveType = override?.leaveType !== null && override?.leaveType !== undefined
                            ? override.leaveType
                            : (alloc.leave_type || 'On Leave')
                          // Use override FTE if available, otherwise use allocation FTE
                          const fteRemaining = override?.fteRemaining !== undefined
                            ? override.fteRemaining
                            : (alloc.fte_therapist || 0)
                          return { 
                            ...alloc.staff, 
                            leave_type: leaveType,
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
                          return isTherapist && staffMember.team === team && override.leaveType !== null && override.leaveType !== undefined
                        })
                        .map(([staffId, override]) => {
                          const staffMember = staff.find(s => s.id === staffId)!
                          return {
                            ...staffMember,
                            leave_type: override.leaveType || 'On Leave',
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
                />
                </div>

                <AllocationNotesBoard doc={allocationNotesDoc} onSave={saveAllocationNotes} />
              </div>
            </div>
          </div>
        </div>

        {editingBedTeam && (() => {
          const team = editingBedTeam

          const formatWardLabel = (
            ward: { name: string; total_beds: number; team_assignments: Record<Team, number>; team_assignment_portions?: Record<Team, string> },
            t: Team
          ): string => {
            const storedPortion = ward.team_assignment_portions?.[t]
            if (storedPortion) return `${storedPortion} ${ward.name}`
            const teamBeds = ward.team_assignments[t] || 0
            const totalBeds = ward.total_beds
            if (teamBeds === totalBeds) return ward.name
            const fraction = totalBeds > 0 ? teamBeds / totalBeds : 0
            const validFractions = [
              { num: 1, den: 2, value: 0.5 },
              { num: 1, den: 3, value: 1 / 3 },
              { num: 2, den: 3, value: 2 / 3 },
              { num: 3, den: 4, value: 0.75 },
            ]
            for (const f of validFractions) {
              if (Math.abs(fraction - f.value) < 0.01) return `${f.num}/${f.den} ${ward.name}`
            }
            return ward.name
          }

          const wardRows: BedCountsWardRow[] = wards
            .filter(w => (w.team_assignments[team] || 0) > 0)
            .map(w => ({
              wardName: w.name,
              wardLabel: formatWardLabel(w, team),
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

        {editingStaffId && (() => {
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
                // Note: fte_subtraction is not stored in database - calculate from fte_pca
                // fte_pca represents base_FTE_remaining = 1.0 - fteSubtraction
                // Handle both slot_assigned (new) and fte_assigned (old) during migration transition
                // allocation can be null in some paths; guard it to avoid runtime crash
                const slotAssigned = (allocation as any)?.slot_assigned ?? (allocation as any)?.fte_assigned ?? 0
                currentFTERemaining = allocation.fte_pca ?? ((allocation.fte_remaining ?? 0) + slotAssigned)
                // Calculate fteSubtraction from fte_pca
                currentFTESubtraction = 1.0 - currentFTERemaining
                
                // Load invalid slot fields from allocation if not in override
                // For backward compatibility, convert single invalid_slot to array format
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

          // SPT leave edit enhancement:
          // - Base SPT FTE comes from spt_allocations.fte_addon (dashboard)
          // - "FTE Cost due to Leave" is user-input (stored in staffOverrides[staffId].fteSubtraction)
          // - "FTE Remaining on Duty" = baseFTE - leaveCost (stored in staffOverrides[staffId].fteRemaining)
          if (staffMember.rank === 'SPT') {
            const cfg = sptAllocations.find(a => a.staff_id === editingStaffId && a.weekdays?.includes(currentWeekday))
            const cfgFTEraw = (cfg as any)?.fte_addon
            const cfgFTE =
              typeof cfgFTEraw === 'number'
                ? cfgFTEraw
                : cfgFTEraw != null
                  ? parseFloat(String(cfgFTEraw))
                  : NaN
            // If this SPT is not configured for this weekday, treat base FTE as 0 (not on duty today).
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

            // Base FTE: prefer (remaining + leaveCost) if user has ever saved a leave cost; otherwise use dashboard.
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

        {copyWizardConfig && (
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
        )}

        {/* Step 3.1-3.2: Floating PCA Configuration Dialog (Wizard) */}
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

        {/* Step 2.0: Special Program Override Dialog */}
        <SpecialProgramOverrideDialog
          open={showSpecialProgramOverrideDialog}
          onOpenChange={(open) => {
            setShowSpecialProgramOverrideDialog(open)
            if (!open) {
              const resolver = specialProgramOverrideResolverRef.current
              if (resolver) {
                // User closed dialog without confirming - skip (use empty overrides)
                resolver({})
                setSpecialProgramOverrideResolver(null)
                specialProgramOverrideResolverRef.current = null
              }
            }
          }}
          specialPrograms={specialPrograms}
          // `staff` already includes buffer staff (loaded via loadStaff()).
          // Dedupe to avoid buffer staff appearing twice in dropdowns.
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
              // Skip - use empty overrides
              resolver({})
              setSpecialProgramOverrideResolver(null)
              specialProgramOverrideResolverRef.current = null
            }
            setShowSpecialProgramOverrideDialog(false)
          }}
          onStaffRefresh={() => {
            // Refresh staff list after buffer creation (so the new buffer staff appears immediately)
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

        {substitutionWizardData && (
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
            currentAllocations={[]} // Not needed - algorithm handles allocations
            staffOverrides={staffOverrides}
            onConfirm={handleSubstitutionWizardConfirm}
            onCancel={handleSubstitutionWizardCancel}
            onSkip={handleSubstitutionWizardSkip}
          />
        )}

        {/* Calendar Popover */}
        {calendarOpen && (
          <>
            {/* Backdrop to close on click outside */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setCalendarOpen(false)}
            />
            {/* Calendar popover */}
            <div
              ref={calendarPopoverRef}
              className="fixed z-50 bg-background border border-border rounded-lg shadow-lg"
              style={{
                top: calendarButtonRef.current
                  ? calendarButtonRef.current.getBoundingClientRect().bottom + 8
                  : 0,
                left: calendarButtonRef.current
                  ? Math.max(
                      8,
                      Math.min(
                        calendarButtonRef.current.getBoundingClientRect().left,
                        window.innerWidth - 320
                      )
                    )
                  : 0,
              }}
            >
              <CalendarGrid
                selectedDate={selectedDate}
                onDateSelect={(date) => {
                  setSelectedDate(date)
                  setCalendarOpen(false)
                }}
                datesWithData={datesWithData}
                holidays={holidays}
              />
            </div>
          </>
        )}
      </div>
    </DndContext>
  )
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-4 min-w-[1360px]">Loading...</div>}>
      <SchedulePageContent />
    </Suspense>
  )
}
