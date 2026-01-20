'use client'

import { useReducer, useRef, type SetStateAction } from 'react'
import type { Team, LeaveType, Staff } from '@/types/staff'
import type { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import type { Weekday } from '@/types/staff'
import type {
  BaselineSnapshot,
  BaselineSnapshotStored,
  BedAllocation,
  PCAAllocation,
  ScheduleCalculations,
  ScheduleStepId,
  SnapshotHealthReport,
  StaffStatusOverridesById,
  StaffStatusOverrideEntry,
  TherapistAllocation,
  WorkflowState,
} from '@/types/schedule'
import { ALLOCATION_STEPS, TEAMS } from '@/lib/features/schedule/constants'
import { formatDateForInput, getWeekday } from '@/lib/features/schedule/date'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { allocateTherapists, type StaffData, type AllocationContext } from '@/lib/algorithms/therapistAllocation'
import {
  allocatePCA,
  type PCAAllocationContext,
  type PCAData,
} from '@/lib/algorithms/pcaAllocation'
import { allocateBeds, type BedAllocationContext } from '@/lib/algorithms/bedAllocation'
import { computeBedsDesignatedByTeam, computeBedsForRelieving } from '@/lib/features/schedule/bedMath'
import { computeStep3ResetForReentry } from '@/lib/features/schedule/stepReset'
import { buildBaselineSnapshotEnvelope, unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import { extractReferencedStaffIds, validateAndRepairBaselineSnapshot } from '@/lib/utils/snapshotValidation'
import { minifySpecialProgramsForSnapshot } from '@/lib/utils/snapshotMinify'
import { fetchGlobalHeadAtCreation } from '@/lib/features/config/globalHead'
import { cacheSchedule, clearCachedSchedule, getCachedSchedule, getCacheSize } from '@/lib/utils/scheduleCache'
import { createTimingCollector, type TimingReport } from '@/lib/utils/timing'
import {
  normalizeFTE,
  prepareTherapistAllocationForDb,
  preparePCAAllocationForDb,
  SpecialProgramRef,
} from '@/lib/db/types'
import {
  buildStaffByIdMap,
  groupTherapistAllocationsByTeam,
  groupPcaAllocationsByTeamWithSlotTeams,
  sortTherapistApptFirstThenName,
  sortPcaNonFloatingFirstOnly,
  sortPcaNonFloatingFirstThenName,
} from '@/lib/features/schedule/grouping'

export type ScheduleWardRow = {
  name: string
  total_beds: number
  team_assignments: Record<Team, number>
  team_assignment_portions?: Record<Team, string>
}

export type SpecialProgramOverrideEntry = {
  programId: string
  therapistId?: string
  pcaId?: string
  slots?: number[]
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
}

export type StaffOverrideState = {
  leaveType: LeaveType | null
  fteRemaining: number
  team?: Team
  fteSubtraction?: number
  availableSlots?: number[]
  // Backward-compatible leave/come-back fields (used by PCA allocation algorithm + DB columns)
  invalidSlot?: number
  leaveComebackTime?: string
  isLeave?: boolean
  // Invalid slots with time ranges
  invalidSlots?: Array<{
    slot: number
    timeRange: { start: string; end: string }
  }>
  // Therapist AM/PM selection
  amPmSelection?: 'AM' | 'PM'
  // Therapist special program availability
  specialProgramAvailable?: boolean
  // Step 2.0: special program overrides
  specialProgramOverrides?: SpecialProgramOverrideEntry[]
  slotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null }
  // Step 3: Manual buffer floating PCA assignments (persist across Step 3 resets)
  bufferManualSlotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null }
  substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
  // Therapist per-team split/merge overrides (ad hoc fallback)
  therapistTeamFTEByTeam?: Partial<Record<Team, number>>
  therapistNoAllocation?: boolean
  // Staff card fill color (schedule grid only)
  cardColorByTeam?: Partial<Record<Team, string>>
}

export type BedCountsOverridesByTeam = Partial<Record<Team, import('@/components/allocation/BedCountsEditDialog').BedCountsOverrideState>>
export type BedRelievingNotesByToTeam = import('@/types/schedule').BedRelievingNotesByToTeam

export type PCAAllocationErrors = {
  missingSlotSubstitution?: string
  specialProgramAllocation?: string
  preferredSlotUnassigned?: string
}

type ScheduleDomainState = {
  // Core schedule date
  selectedDate: Date

  // Domain data
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]>
  bedAllocations: BedAllocation[]
  calculations: Record<Team, ScheduleCalculations | null>
  hasLoadedStoredCalculations: boolean
  isHydratingSchedule: boolean

  staff: Staff[]
  inactiveStaff: Staff[]
  bufferStaff: Staff[]
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  wards: ScheduleWardRow[]
  pcaPreferences: PCAPreference[]

  loading: boolean
  gridLoading: boolean
  deferBelowFold: boolean

  // Schedule persistence state
  currentScheduleId: string | null
  staffOverrides: Record<string, StaffOverrideState>
  savedOverrides: Record<string, StaffOverrideState>
  saving: boolean
  scheduleLoadedForDate: string | null
  hasSavedAllocations: boolean

  bedCountsOverridesByTeam: BedCountsOverridesByTeam
  savedBedCountsOverridesByTeam: BedCountsOverridesByTeam
  bedRelievingNotesByToTeam: BedRelievingNotesByToTeam
  savedBedRelievingNotesByToTeam: BedRelievingNotesByToTeam
  allocationNotesDoc: any
  savedAllocationNotesDoc: any

  // Workflow / snapshot domain state
  currentStep: string
  stepStatus: Record<string, 'pending' | 'completed' | 'modified'>
  initializedSteps: Set<string>
  pendingPCAFTEPerTeam: Record<Team, number>

  persistedWorkflowState: WorkflowState | null
  baselineSnapshot: BaselineSnapshot | null
  snapshotHealthReport: SnapshotHealthReport | null

  step2Result: any
  pcaAllocationErrors: PCAAllocationErrors
  tieBreakDecisions: Record<string, Team>
}

type ScheduleDomainAction =
  | { type: 'set'; key: keyof ScheduleDomainState; value: unknown }
  | { type: 'patch'; patch: Partial<ScheduleDomainState> }

function applySetStateAction<T>(prev: T, action: SetStateAction<T>): T {
  return typeof action === 'function' ? (action as (p: T) => T)(prev) : action
}

function scheduleDomainReducer(state: ScheduleDomainState, action: ScheduleDomainAction): ScheduleDomainState {
  switch (action.type) {
    case 'patch': {
      return { ...state, ...(action.patch as any) }
    }
    case 'set': {
      const key = action.key
      const prevVal = (state as any)[key]
      const nextVal = applySetStateAction(prevVal, action.value as any)
      return { ...(state as any), [key]: nextVal }
    }
    default:
      return state
  }
}

function createInitialScheduleDomainState(defaultDate: Date): ScheduleDomainState {
  return {
    selectedDate: defaultDate,

    therapistAllocations: { FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] },
    pcaAllocations: { FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: [] },
    bedAllocations: [],
    calculations: { FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null },
    hasLoadedStoredCalculations: false,
    isHydratingSchedule: false,

    staff: [],
    inactiveStaff: [],
    bufferStaff: [],
    specialPrograms: [],
    sptAllocations: [],
    wards: [],
    pcaPreferences: [],

    loading: false,
    gridLoading: true,
    deferBelowFold: true,

    currentScheduleId: null,
    staffOverrides: {},
    savedOverrides: {},
    saving: false,
    scheduleLoadedForDate: null,
    hasSavedAllocations: false,

    bedCountsOverridesByTeam: {},
    savedBedCountsOverridesByTeam: {},
    bedRelievingNotesByToTeam: {},
    savedBedRelievingNotesByToTeam: {},
    allocationNotesDoc: null,
    savedAllocationNotesDoc: null,

    currentStep: 'leave-fte',
    stepStatus: {
      'leave-fte': 'pending',
      'therapist-pca': 'pending',
      'floating-pca': 'pending',
      'bed-relieving': 'pending',
      review: 'pending',
    },
    initializedSteps: new Set(),
    pendingPCAFTEPerTeam: { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 },

    persistedWorkflowState: null,
    baselineSnapshot: null,
    snapshotHealthReport: null,

    step2Result: null,
    pcaAllocationErrors: {},
    tieBreakDecisions: {},
  }
}

// Cache RPC availability to avoid repeated failing calls when migrations aren't applied yet.
let cachedLoadScheduleRpcAvailable: boolean | null = null
let cachedSaveScheduleRpcAvailable: boolean | null = null

export function useScheduleController(params: { defaultDate: Date; supabase: any }) {
  const [domainState, dispatch] = useReducer(
    scheduleDomainReducer,
    params.defaultDate,
    createInitialScheduleDomainState
  )

  const setterCacheRef = useRef<Partial<Record<keyof ScheduleDomainState, unknown>>>({})

  const makeSetter = <K extends keyof ScheduleDomainState>(key: K) => {
    const existing = setterCacheRef.current[key]
    if (existing) return existing as (next: SetStateAction<ScheduleDomainState[K]>) => void

    const fn = (next: SetStateAction<any>) => {
      dispatch({ type: 'set', key, value: next })
    }
    setterCacheRef.current[key] = fn
    return fn as (next: SetStateAction<ScheduleDomainState[K]>) => void
  }

  const patchState = (patch: Partial<ScheduleDomainState>) => {
    dispatch({ type: 'patch', patch })
  }

  // Stable setter-style actions (keeps page.tsx wiring unchanged)
  const setSelectedDate = makeSetter('selectedDate')

  const setTherapistAllocations = makeSetter('therapistAllocations')
  const setPcaAllocations = makeSetter('pcaAllocations')
  const setBedAllocations = makeSetter('bedAllocations')
  const setCalculations = makeSetter('calculations')
  const setHasLoadedStoredCalculations = makeSetter('hasLoadedStoredCalculations')
  const setIsHydratingSchedule = makeSetter('isHydratingSchedule')

  const setStaff = makeSetter('staff')
  const setInactiveStaff = makeSetter('inactiveStaff')
  const setBufferStaff = makeSetter('bufferStaff')
  const setSpecialPrograms = makeSetter('specialPrograms')
  const setSptAllocations = makeSetter('sptAllocations')
  const setWards = makeSetter('wards')
  const setPcaPreferences = makeSetter('pcaPreferences')

  const setLoading = makeSetter('loading')
  const setGridLoading = makeSetter('gridLoading')
  const setDeferBelowFold = makeSetter('deferBelowFold')

  const setCurrentScheduleId = makeSetter('currentScheduleId')
  const setStaffOverrides = makeSetter('staffOverrides')
  const setSavedOverrides = makeSetter('savedOverrides')
  const setSaving = makeSetter('saving')
  const setScheduleLoadedForDate = makeSetter('scheduleLoadedForDate')
  const setHasSavedAllocations = makeSetter('hasSavedAllocations')

  const setBedCountsOverridesByTeam = makeSetter('bedCountsOverridesByTeam')
  const setSavedBedCountsOverridesByTeam = makeSetter('savedBedCountsOverridesByTeam')
  const setBedRelievingNotesByToTeam = makeSetter('bedRelievingNotesByToTeam')
  const setSavedBedRelievingNotesByToTeam = makeSetter('savedBedRelievingNotesByToTeam')
  const setAllocationNotesDoc = makeSetter('allocationNotesDoc')
  const setSavedAllocationNotesDoc = makeSetter('savedAllocationNotesDoc')

  const setCurrentStep = makeSetter('currentStep')
  const setStepStatus = makeSetter('stepStatus')
  const setInitializedSteps = makeSetter('initializedSteps')
  const setPendingPCAFTEPerTeam = makeSetter('pendingPCAFTEPerTeam')

  const setPersistedWorkflowState = makeSetter('persistedWorkflowState')
  const setBaselineSnapshot = makeSetter('baselineSnapshot')
  const setSnapshotHealthReport = makeSetter('snapshotHealthReport')

  const setStep2Result = makeSetter('step2Result')
  const setPcaAllocationErrors = makeSetter('pcaAllocationErrors')
  const setTieBreakDecisions = makeSetter('tieBreakDecisions')

  // Destructure domain state into local vars for minimal code churn below
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
  } = domainState


  function getStaffStatusOverridesFromScheduleOverrides(overrides: any): StaffStatusOverridesById {
    const raw = overrides?.__staffStatusOverrides
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return raw as StaffStatusOverridesById
  }

  function buildPlaceholderStaffFromStatusOverride(params: {
    staffId: string
    override: StaffStatusOverrideEntry
  }): Staff {
    const name = (params.override?.nameAtTime || '').trim()
    return {
      id: params.staffId,
      name: name || '(Missing staff in snapshot)',
      rank: (params.override?.rankAtTime as any) || 'PCA',
      special_program: null,
      team: null,
      floating: false,
      floor_pca: null,
      status: params.override.status,
      buffer_fte: typeof params.override.buffer_fte === 'number' ? params.override.buffer_fte : undefined,
    }
  }

  function applyScheduleLocalStatusOverridesToSnapshotStaff(params: {
    snapshotStaff: Staff[]
    statusOverrides: StaffStatusOverridesById
  }): Staff[] {
    const { snapshotStaff, statusOverrides } = params
    if (!snapshotStaff || snapshotStaff.length === 0) {
      // Snapshot missing roster entirely: return placeholders for any schedule-local overrides.
      return Object.entries(statusOverrides).map(([staffId, o]) =>
        buildPlaceholderStaffFromStatusOverride({ staffId, override: o })
      )
    }

    const byId = new Map<string, Staff>()
    snapshotStaff.forEach((s) => {
      if (!s?.id) return
      byId.set(s.id, s)
    })

    // Patch existing snapshot rows
    Object.entries(statusOverrides).forEach(([staffId, o]) => {
      const existing = byId.get(staffId)
      if (!existing) return
      byId.set(staffId, {
        ...existing,
        status: o.status,
        buffer_fte: typeof o.buffer_fte === 'number' ? o.buffer_fte : existing.buffer_fte,
      })
    })

    // Add placeholders for overrides that refer to missing staff ids
    Object.entries(statusOverrides).forEach(([staffId, o]) => {
      if (byId.has(staffId)) return
      byId.set(staffId, buildPlaceholderStaffFromStatusOverride({ staffId, override: o }))
    })

    return Array.from(byId.values())
  }

  const applyBaselineSnapshot = (snapshot: BaselineSnapshot, overridesForDerive?: any) => {
    setBaselineSnapshot(snapshot)

    // Derive staff pools from snapshot staff list
    if (snapshot.staff && Array.isArray(snapshot.staff)) {
      const statusOverrides = getStaffStatusOverridesFromScheduleOverrides(overridesForDerive)
      const effectiveStaffRows = applyScheduleLocalStatusOverridesToSnapshotStaff({
        snapshotStaff: snapshot.staff as any,
        statusOverrides,
      })

      const activeStaff: Staff[] = []
      const inactiveStaffList: Staff[] = []
      const bufferStaffList: Staff[] = []

      effectiveStaffRows.forEach((raw: any) => {
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
    all.forEach((s: any) => {
      if (!s?.id) return
      const status = (s as any).status ?? (bufferStaff.some((b) => b.id === s.id) ? 'buffer' : 'active')
      // Snapshot should be a minimal projection to reduce JSONB size.
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

  const loadScheduleForDate = async (
    date: Date,
    opts?: { prefetchOnly?: boolean }
  ): Promise<any | null> => {
    const supabase = params.supabase
    const innerTimer = createTimingCollector()
    // Use local date components to avoid timezone issues
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    // Check cache first (for fast navigation)
    const cached = getCachedSchedule(dateStr)
    if (cached) {
      innerTimer.stage('cacheHit')
      if (!opts?.prefetchOnly) {
        setCurrentScheduleId(cached.scheduleId)
        if (cached.baselineSnapshot) {
          applyBaselineSnapshot(cached.baselineSnapshot, cached.overrides)
        }
        if (cached.workflowState) {
          setPersistedWorkflowState(cached.workflowState)
        }
        if (cached.calculations) {
          setCalculations(cached.calculations)
          setHasLoadedStoredCalculations(true)
        }
        if ((cached as any).tieBreakDecisions) {
          setTieBreakDecisions((cached as any).tieBreakDecisions as any)
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
      }
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
          cacheHit: true,
          cacheSize: getCacheSize(),
          stages: innerTimer.finalize().stages,
          calculationsSource: cached.calculations ? 'schedule_calculations' : 'none',
          counts: {
            therapistAllocs: (cached.therapistAllocs || []).length,
            pcaAllocs: (cached.pcaAllocs || []).length,
            bedAllocs: (cached.bedAllocs || []).length,
            calculationsRows: cached.calculations
              ? Object.keys(cached.calculations).filter((k) => (cached.calculations as any)[k]).length
              : 0,
          },
          snapshotBytes: null,
        },
      }
    }

    innerTimer.stage('cacheMiss')
    let rpcUsed = false
    let batchedQueriesUsed = false
    let rpcBundle: any | null = null
    let rpcServerMs: any = null

    if (cachedLoadScheduleRpcAvailable !== false) {
      const rpcAttempt = await supabase.rpc('load_schedule_v1', { p_date: dateStr })
      innerTimer.stage('rpc:load_schedule_v1')
      if (!rpcAttempt.error) {
        cachedLoadScheduleRpcAvailable = true
        rpcBundle = rpcAttempt.data as any
        if ((rpcBundle as any)?.schedule?.id) {
          rpcUsed = true
        }
        rpcServerMs = (rpcBundle as any)?.meta?.rpcServerMs ?? null
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
    let scheduleData: any = rpcUsed ? (rpcBundle as any).schedule : null
    let queryError: any = null
    let createdSeededStaffOverrides: Record<string, any> | null = null

    if (!scheduleData) {
      const initialResult = (await supabase
        .from('daily_schedules')
        .select('id, is_tentative, tie_break_decisions, baseline_snapshot, staff_overrides, workflow_state')
        .eq('date', dateStr)
        .maybeSingle()) as any
      innerTimer.stage('select:daily_schedules')

      scheduleData = initialResult.data as any
      queryError = initialResult.error

      if (queryError && queryError.message?.includes('column')) {
        const fallbackResult = await supabase
          .from('daily_schedules')
          .select('id, is_tentative')
          .eq('date', dateStr)
          .maybeSingle()
        innerTimer.stage('select:daily_schedules:fallback')
        scheduleData = fallbackResult.data as { id: string; is_tentative: boolean } | null
        queryError = (fallbackResult as any).error
      }
    }

    let scheduleId: string
    let effectiveWorkflowState: WorkflowState | null = null
    if (!scheduleData) {
      const baselineSnapshotToSave = buildBaselineSnapshotFromCurrentState()
      const globalHeadAtCreation = await fetchGlobalHeadAtCreation(supabase)
      const baselineEnvelopeToSave = buildBaselineSnapshotEnvelope({
        data: baselineSnapshotToSave,
        source: 'save',
        globalHeadAtCreation,
      })
      const initialWorkflowState: WorkflowState = { currentStep: 'leave-fte', completedSteps: [] }
      effectiveWorkflowState = initialWorkflowState

      // Seed schedule-level allocation notes from previous working day (if available).
      let seededStaffOverrides: Record<string, any> = {}
      try {
        const prevDate = new Date(date.getTime())
        // naive "previous day" fallback; caller may retry with base tables anyway.
        prevDate.setDate(prevDate.getDate() - 1)
        const py = prevDate.getFullYear()
        const pm = String(prevDate.getMonth() + 1).padStart(2, '0')
        const pd = String(prevDate.getDate()).padStart(2, '0')
        const prevDateStr = `${py}-${pm}-${pd}`

        const prevRes = await supabase
          .from('daily_schedules')
          .select('staff_overrides')
          .eq('date', prevDateStr)
          .maybeSingle()
        innerTimer.stage('select:prev_daily_schedules')
        const prevOverrides = (prevRes.data as any)?.staff_overrides
        if (prevOverrides && typeof prevOverrides === 'object') {
          const allocationNotes = (prevOverrides as any)?.__allocationNotes
          if (allocationNotes) {
            seededStaffOverrides.__allocationNotes = allocationNotes
          }
        }
      } catch {
        // ignore
      }
      createdSeededStaffOverrides = seededStaffOverrides

      const insertAttempt = await supabase
        .from('daily_schedules')
        .insert({
          date: dateStr,
          is_tentative: true,
          baseline_snapshot: baselineEnvelopeToSave as any,
          staff_overrides: seededStaffOverrides,
          workflow_state: initialWorkflowState as any,
          tie_break_decisions: {},
        } as any)
        .select('id, is_tentative, baseline_snapshot, staff_overrides, workflow_state, tie_break_decisions')
        .single()
      innerTimer.stage('insert:daily_schedules')

      if (insertAttempt.error) {
        // Fallback if columns don't exist
        const fallbackInsert = await supabase
          .from('daily_schedules')
          .insert({ date: dateStr, is_tentative: true } as any)
          .select('id, is_tentative')
          .single()
        innerTimer.stage('insert:daily_schedules:fallback')
        scheduleData = fallbackInsert.data as any
        queryError = (fallbackInsert as any).error
      } else {
        scheduleData = insertAttempt.data as any
      }
    }

    if (queryError) {
      return null
    }

    scheduleId = scheduleData.id
    setCurrentScheduleId(scheduleId)

    // Extract baseline snapshot and workflow state if present
    const rawBaselineSnapshotStored = (scheduleData as any).baseline_snapshot as BaselineSnapshotStored | null | undefined
    const hasBaselineSnapshot = !!rawBaselineSnapshotStored
    const rawWorkflowState = (scheduleData as any).workflow_state as WorkflowState | null | undefined
    effectiveWorkflowState = effectiveWorkflowState ?? (rawWorkflowState ?? null)

    // Tie-break decisions
    if ((scheduleData as any).tie_break_decisions) {
      setTieBreakDecisions((scheduleData as any).tie_break_decisions as Record<string, Team>)
    } else {
      setTieBreakDecisions({})
    }
    const tieBreakDecisionsForCache = ((scheduleData as any)?.tie_break_decisions || {}) as any

    // Staff overrides + step metadata
    const overrides = ((scheduleData as any).staff_overrides || {}) as any
    setStaffOverrides(overrides || {})
    setSavedOverrides(overrides || {})

    setPersistedWorkflowState(effectiveWorkflowState ?? null)

    // Load allocations
    let therapistAllocs: any[] = rpcUsed ? ((rpcBundle as any).therapist_allocations as any[]) : []
    let pcaAllocs: any[] = rpcUsed ? ((rpcBundle as any).pca_allocations as any[]) : []
    let bedAllocs: any[] = rpcUsed ? ((rpcBundle as any).bed_allocations as any[]) : []
    let scheduleCalcsRows: any[] = rpcUsed ? ((rpcBundle as any).calculations as any[]) : []

    if (!rpcUsed) {
      // Non-RPC fallback: separate queries
      const [tRes, pRes, bRes, cRes] = await Promise.all([
        supabase.from('schedule_therapist_allocations').select('*').eq('schedule_id', scheduleId),
        supabase.from('schedule_pca_allocations').select('*').eq('schedule_id', scheduleId),
        supabase.from('schedule_bed_allocations').select('*').eq('schedule_id', scheduleId),
        supabase.from('schedule_calculations').select('*').eq('schedule_id', scheduleId),
      ])
      innerTimer.stage('select:allocations')
      therapistAllocs = (tRes.data as any[]) || []
      pcaAllocs = (pRes.data as any[]) || []
      bedAllocs = (bRes.data as any[]) || []
      scheduleCalcsRows = (cRes.data as any[]) || []
    }

    // Baseline snapshot: validate/repair and apply AFTER we know which staff ids are referenced.
    if (hasBaselineSnapshot) {
      try {
        const referencedStaffIds = extractReferencedStaffIds({
          therapistAllocs,
          pcaAllocs,
          staffOverrides: overrides,
        })

        const validated = await validateAndRepairBaselineSnapshot({
          storedSnapshot: rawBaselineSnapshotStored as any,
          referencedStaffIds,
          fetchLiveStaffByIds: async (ids: string[]) => {
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
          sourceForNewEnvelope: 'migration',
        })
        innerTimer.stage('validate:baseline_snapshot')
        setSnapshotHealthReport(validated.report)
        applyBaselineSnapshot(validated.data, overrides)
      } catch {
        setSnapshotHealthReport(null)
      }
    } else {
      setSnapshotHealthReport(null)
    }

    // Bed overrides + notes + allocation notes (in staff_overrides JSON)
    const bedCountsByTeamForCache = (overrides as any)?.__bedCounts?.byTeam || {}
    const bedRelievingByToTeamForCache = (overrides as any)?.__bedRelieving?.byToTeam || {}
    const allocationNotesDocForCache = (overrides as any)?.__allocationNotes?.doc ?? null
    setBedCountsOverridesByTeam(bedCountsByTeamForCache || {})
    setSavedBedCountsOverridesByTeam(bedCountsByTeamForCache || {})
    setBedRelievingNotesByToTeam(bedRelievingByToTeamForCache || {})
    setSavedBedRelievingNotesByToTeam(bedRelievingByToTeamForCache || {})
    setAllocationNotesDoc(allocationNotesDocForCache)
    setSavedAllocationNotesDoc(allocationNotesDocForCache)

    // Stored calculations
    let storedCalculations: Record<Team, ScheduleCalculations | null> | null = null
    let calculationsSource: 'schedule_calculations' | 'snapshot.calculatedValues' | 'none' = 'none'
    if (scheduleCalcsRows.length > 0) {
      const byTeam: Record<Team, ScheduleCalculations | null> = {
        FO: null,
        SMM: null,
        SFM: null,
        CPPC: null,
        MC: null,
        GMC: null,
        NSM: null,
        DRO: null,
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
        storedCalculations = snapshotData.calculatedValues.calculations
        calculationsSource = 'snapshot.calculatedValues'
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
    } as any)
    innerTimer.stage('cacheWrite')

    if (opts?.prefetchOnly) {
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
          cacheHit: false,
          cacheSize: getCacheSize(),
          stages: innerTimer.finalize().stages,
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
        cacheHit: false,
        cacheSize: getCacheSize(),
        stages: innerTimer.finalize().stages,
        rpcServerMs,
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

  const state = domainState

  // Use saved allocations directly from database without regenerating.
  // IMPORTANT: This path should be cheap (no recalculation, no bed algorithm).
  const applySavedAllocationsFromDb = (args: {
    therapistAllocs: any[]
    pcaAllocs: any[]
    staffForLookup?: Staff[]
  }) => {
    setLoading(true)

    const staffById = buildStaffByIdMap(args.staffForLookup || staff || [])

    const therapistByTeam = groupTherapistAllocationsByTeam({
      teams: TEAMS,
      allocations: args.therapistAllocs || [],
      staffById,
      sort: sortTherapistApptFirstThenName,
    })

    const pcaByTeam = groupPcaAllocationsByTeamWithSlotTeams({
      teams: TEAMS,
      allocations: args.pcaAllocs || [],
      staffById,
      sort: sortPcaNonFloatingFirstThenName,
    })

    // Single setState calls (critical for cold-start performance).
    setTherapistAllocations(therapistByTeam)
    setPcaAllocations(pcaByTeam)
    setPendingPCAFTEPerTeam({ FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 })

    setHasSavedAllocations(true)
    setLoading(false)
  }

  const loadAndHydrateDate = async (args: {
    date: Date
    signal?: AbortSignal
    loadAllDataFallback?: () => Promise<void>
    recalculateScheduleCalculations?: () => void
  }) => {
    const timer = createTimingCollector()
    const date = args.date
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    try {
      setIsHydratingSchedule(true)
      setHasSavedAllocations(false)
      setDeferBelowFold(true)

      let resultAny: any = await loadScheduleForDate(date)
      timer.stage('loadScheduleForDate')
      if (args.signal?.aborted) return null

      // Fallback for legacy schedules without baseline_snapshot: load base tables once, then retry.
      const snapshotStaff0: any[] = (resultAny?.baselineSnapshot?.staff || []) as any[]
      const needsBaseDataFallback =
        !resultAny?.meta?.baselineSnapshotUsed &&
        snapshotStaff0.length === 0 &&
        staff.length === 0 &&
        (Array.isArray(resultAny?.therapistAllocs) || Array.isArray(resultAny?.pcaAllocs))

      if (needsBaseDataFallback && args.loadAllDataFallback) {
        await args.loadAllDataFallback()
        timer.stage('loadAllDataFallback')
        if (args.signal?.aborted) return null
        resultAny = await loadScheduleForDate(date)
        timer.stage('retryLoadScheduleForDate')
        if (args.signal?.aborted) return null
      }

      if (!resultAny) {
        setScheduleLoadedForDate(dateStr)
        return timer.finalize({ dateStr, result: 'null' })
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
        applySavedAllocationsFromDb({
          therapistAllocs: resultAny.therapistAllocs,
          pcaAllocs: resultAny.pcaAllocs,
          staffForLookup: staffFromSnapshot,
        })
        timer.stage('applySavedAllocations')

        setInitializedSteps(
          new Set<string>([
            'therapist-pca',
            'floating-pca',
            ...(hasBedData ? ['bed-relieving'] : []),
          ])
        )

        if (!resultAny.calculations && typeof queueMicrotask === 'function' && args.recalculateScheduleCalculations) {
          queueMicrotask(() => {
            args.recalculateScheduleCalculations?.()
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
          workflowState.completedSteps.forEach((stepId) => {
            if (newStepStatus[stepId]) newStepStatus[stepId] = 'completed'
          })
          if (workflowState.currentStep) {
            setCurrentStep(workflowState.currentStep)
          }
        } else if (hasLeaveData && hasTherapistData && hasPCAData) {
          setCurrentStep('review')
          newStepStatus = { ...newStepStatus, review: 'completed' }
        }
        setStepStatus(newStepStatus)
      } else if (resultAny && resultAny.overrides) {
        // Step 1 baseline view (no saved allocations): show leave/FTE only.
        const overrides = (resultAny as any).overrides || {}

        const baselineTherapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = {
          FO: [],
          SMM: [],
          SFM: [],
          CPPC: [],
          MC: [],
          GMC: [],
          NSM: [],
          DRO: [],
        }
        staffFromSnapshot.forEach((s: any) => {
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
            staff: s as Staff,
          } as any)
        })
        setTherapistAllocations(baselineTherapistByTeam)

        const baselinePCAByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
          FO: [],
          SMM: [],
          SFM: [],
          CPPC: [],
          MC: [],
          GMC: [],
          NSM: [],
          DRO: [],
        }
        staffFromSnapshot.forEach((s: any) => {
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
            staff: s as Staff,
          } as any)
        })
        TEAMS.forEach((team) => {
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
          ws.completedSteps.forEach((stepId) => {
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

      setScheduleLoadedForDate(dateStr)
      return timer.finalize({
        dateStr,
        rpcUsed: !!resultAny?.meta?.rpcUsed,
        batchedQueriesUsed: !!resultAny?.meta?.batchedQueriesUsed,
        baselineSnapshotUsed: !!resultAny?.meta?.baselineSnapshotUsed,
        cacheHit: !!resultAny?.meta?.cacheHit,
        cacheSize: typeof resultAny?.meta?.cacheSize === 'number' ? resultAny.meta.cacheSize : getCacheSize(),
        stages: Array.isArray(resultAny?.meta?.stages) ? resultAny.meta.stages : undefined,
        rpcServerMs: resultAny?.meta?.rpcServerMs ?? null,
        calculationsSource: resultAny?.meta?.calculationsSource,
        counts: resultAny?.meta?.counts,
        snapshotBytes: resultAny?.meta?.snapshotBytes,
      })
    } catch (e: any) {
      return timer.finalize({ dateStr, error: e?.message || String(e) })
    }
  }

  const beginDateTransition = (
    nextDate: Date,
    options?: { resetLoadedForDate?: boolean }
  ) => {
    // Prevent editing stale grid content while the next date's data is still loading.
    setGridLoading(true)
    setSelectedDate(nextDate)
    if (options?.resetLoadedForDate) {
      setScheduleLoadedForDate(null)
    }
  }

  const goToStep = (stepId: ScheduleStepId) => {
    setCurrentStep(stepId)
  }

  const goToNextStep = () => {
    const current = currentStep as ScheduleStepId
    const next =
      current === 'leave-fte'
        ? 'therapist-pca'
        : current === 'therapist-pca'
          ? 'floating-pca'
          : current === 'floating-pca'
            ? 'bed-relieving'
            : current === 'bed-relieving'
              ? 'review'
              : 'review'
    setCurrentStep(next)
  }

  const goToPreviousStep = () => {
    const current = currentStep as ScheduleStepId
    const prev =
      current === 'therapist-pca'
        ? 'leave-fte'
        : current === 'floating-pca'
          ? 'therapist-pca'
          : current === 'bed-relieving'
            ? 'floating-pca'
            : current === 'review'
              ? 'bed-relieving'
              : 'leave-fte'
    setCurrentStep(prev)
  }

  const applyStaffEditDomain = (args: {
    staffId: string
    leaveType: LeaveType | null
    fteRemaining: number
    fteSubtraction?: number
    availableSlots?: number[]
    invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
    amPmSelection?: 'AM' | 'PM'
    specialProgramAvailable?: boolean
  }) => {
    const nextOverrides: Record<string, StaffOverrideState> = {
      ...(staffOverrides as any),
      [args.staffId]: {
        leaveType: args.leaveType,
        fteRemaining: args.fteRemaining,
        fteSubtraction: args.fteSubtraction,
        availableSlots: args.availableSlots,
        invalidSlots: args.invalidSlots,
        amPmSelection: args.amPmSelection,
        specialProgramAvailable: args.specialProgramAvailable,
      },
    }

    setStaffOverrides(nextOverrides)

    // Any manual edit invalidates “saved allocations” assumptions and downstream steps.
    setHasSavedAllocations(false)
    setStep2Result(null)
    setInitializedSteps(new Set())
    setStepStatus((prev) => ({
      ...(prev as any),
      'leave-fte': 'modified',
      'therapist-pca': 'pending',
      'floating-pca': 'pending',
      'bed-relieving': 'pending',
      review: 'pending',
    }))

    if (currentStep !== 'leave-fte') {
      setCurrentStep('leave-fte')
    }

    return nextOverrides
  }

  const setScheduleStaffStatusOverride = (args: {
    staffId: string
    status: 'active' | 'inactive' | 'buffer'
    bufferFTE?: number | null
    nameAtTime?: string | null
    rankAtTime?: Staff['rank'] | null
  }) => {
    const prevAny = (staffOverrides as any) || {}
    const prevMap = getStaffStatusOverridesFromScheduleOverrides(prevAny)
    const nextMap: StaffStatusOverridesById = {
      ...prevMap,
      [args.staffId]: {
        status: args.status,
        buffer_fte: typeof args.bufferFTE === 'number' ? args.bufferFTE : null,
        nameAtTime: args.nameAtTime ?? null,
        rankAtTime: (args.rankAtTime ?? null) as any,
        updatedAt: new Date().toISOString(),
      },
    }

    const nextOverrides = {
      ...prevAny,
      __staffStatusOverrides: nextMap,
    } as any

    setStaffOverrides(nextOverrides)
    setHasSavedAllocations(false)

    // Re-derive pools from snapshot roster + overrides immediately (no global reload).
    if (baselineSnapshot) {
      applyBaselineSnapshot(baselineSnapshot as any, nextOverrides)
    }

    return nextOverrides
  }

  const clearScheduleStaffStatusOverride = (staffId: string) => {
    const prevAny = (staffOverrides as any) || {}
    const prevMap = getStaffStatusOverridesFromScheduleOverrides(prevAny)
    if (!prevMap[staffId]) return prevAny
    const nextMap = { ...prevMap }
    delete (nextMap as any)[staffId]
    const nextOverrides = {
      ...prevAny,
      __staffStatusOverrides: nextMap,
    } as any
    setStaffOverrides(nextOverrides)
    setHasSavedAllocations(false)
    if (baselineSnapshot) {
      applyBaselineSnapshot(baselineSnapshot as any, nextOverrides)
    }
    return nextOverrides
  }

  const updateBedRelievingNotes = (args: {
    toTeam: Team
    notes: Partial<Record<Team, any[]>>
  }) => {
    setBedRelievingNotesByToTeam((prev) => ({
      ...(prev as any),
      [args.toTeam]: args.notes,
    }))
    setStepStatus((prev) => ({
      ...(prev as any),
      'bed-relieving': 'modified',
    }))
  }

  const applyBaselineViewAllocations = (overrides: Record<string, any>) => {
    const dateStr = formatDateForInput(selectedDate)

    const baselineTherapistByTeam = createEmptyTeamRecordFactory<(TherapistAllocation & { staff: Staff })[]>(() => [])
    staff.forEach((s) => {
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
    setTherapistAllocations(baselineTherapistByTeam as any)

    const baselinePCAByTeam = createEmptyTeamRecordFactory<(PCAAllocation & { staff: Staff })[]>(() => [])
    staff.forEach((s) => {
      if (!s.team) return
      if (s.rank !== 'PCA') return
      if (s.floating) return
      const o = overrides?.[s.id]
      const baseFTE = s.status === 'buffer' && (s as any).buffer_fte != null ? (s as any).buffer_fte : 1.0
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
    TEAMS.forEach((team) => {
      baselinePCAByTeam[team].sort((a, b) => (a.staff?.name ?? '').localeCompare(b.staff?.name ?? ''))
    })
    setPcaAllocations(baselinePCAByTeam as any)
  }

  const removeStep2KeysFromOverrides = (overrides: Record<string, any>) => {
    const cleaned: Record<string, any> = {}
    Object.entries(overrides ?? {}).forEach(([staffId, raw]) => {
      if (!raw || typeof raw !== 'object') return
      const o = { ...(raw as any) }

      delete o.specialProgramOverrides
      delete o.substitutionFor

      const staffMember = staff.find((s) => s.id === staffId)
      if (staffMember && ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)) {
        delete o.team
      }

      if (Object.keys(o).length > 0) cleaned[staffId] = o
    })
    return cleaned
  }

  const resetStep3ForReentry = () => {
    const averagePcaByTeam = TEAMS.reduce((acc, team) => {
      acc[team] = (calculations as any)[team]?.average_pca_per_team || 0
      return acc
    }, {} as Record<Team, number>)

    const res = computeStep3ResetForReentry({
      pcaAllocations: pcaAllocations as any,
      staff,
      bufferStaff,
      staffOverrides,
      averagePcaByTeam,
      allocationIdPrefix: formatDateForInput(selectedDate),
      scheduleId: currentScheduleId || '',
    })

    setPcaAllocations(res.cleanedPcaAllocations as any)
    setStaffOverrides(res.cleanedStaffOverrides as any)
    setPendingPCAFTEPerTeam(res.pendingPCAFTEPerTeam as any)
  }

  const clearDomainFromStep = (stepId: ScheduleStepId) => {
    if (stepId === 'leave-fte') {
      setStaffOverrides({})
      setPcaAllocationErrors({})
      setStep2Result(null)
      setBedAllocations([])
      setBedRelievingNotesByToTeam({})
      setInitializedSteps(new Set())
      applyBaselineViewAllocations({})
      setStepStatus({
        'leave-fte': 'pending',
        'therapist-pca': 'pending',
        'floating-pca': 'pending',
        'bed-relieving': 'pending',
        review: 'pending',
      })
      return
    }

    if (stepId === 'therapist-pca') {
      const cleanedOverrides = removeStep2KeysFromOverrides(staffOverrides as any)
      setStaffOverrides(cleanedOverrides as any)
      setPcaAllocationErrors({})
      setStep2Result(null)
      setBedAllocations([])
      setBedRelievingNotesByToTeam({})
      applyBaselineViewAllocations(cleanedOverrides)
      setInitializedSteps((prev) => {
        const next = new Set(prev)
        next.delete('therapist-pca')
        next.delete('floating-pca')
        next.delete('bed-relieving')
        return next
      })
      setStepStatus((prev) => ({
        ...(prev as any),
        'therapist-pca': 'pending',
        'floating-pca': 'pending',
        'bed-relieving': 'pending',
        review: 'pending',
      }))
      return
    }

    if (stepId === 'floating-pca') {
      resetStep3ForReentry()
      setBedAllocations([])
      setBedRelievingNotesByToTeam({})
      setInitializedSteps((prev) => {
        const next = new Set(prev)
        next.delete('floating-pca')
        next.delete('bed-relieving')
        return next
      })
      setStepStatus((prev) => ({
        ...(prev as any),
        'floating-pca': 'pending',
        'bed-relieving': 'pending',
        review: 'pending',
      }))
      return
    }

    if (stepId === 'bed-relieving') {
      setBedAllocations([])
      setBedRelievingNotesByToTeam({})
      setInitializedSteps((prev) => {
        const next = new Set(prev)
        next.delete('bed-relieving')
        return next
      })
      setStepStatus((prev) => ({
        ...(prev as any),
        'bed-relieving': 'pending',
        review: 'pending',
      }))
      return
    }
  }

  const markStepCompleted = (stepId: ScheduleStepId) => {
    setStepStatus((prev) => ({
      ...(prev as any),
      [stepId]: 'completed',
    }))
    setInitializedSteps((prev) => {
      const next = new Set(prev)
      next.add(stepId)
      return next
    })
  }

  const saveScheduleToDatabase = async (args: {
    userRole: 'developer' | 'admin' | 'user'
    toast?: (title: string, variant?: any, description?: string) => void
    onProgress?: (next: number) => void
    startSoftAdvance?: (cap: number) => void
    stopSoftAdvance?: () => void
  }): Promise<TimingReport> => {
    const timer = createTimingCollector()
    const toast = args.toast ?? (() => {})
    const onProgress = args.onProgress ?? (() => {})
    const startSoftAdvance = args.startSoftAdvance ?? (() => {})
    const stopSoftAdvance = args.stopSoftAdvance ?? (() => {})

    let usedRpc = false
    let snapshotWritten = false
    let snapshotBytes: number | null = null
    let specialProgramsBytes: number | null = null
    let saveError: unknown = null

    onProgress(0.12)

    // Get the latest staff overrides - use current state
    let overridesToSave = { ...(staffOverrides as any) }
    let scheduleId = currentScheduleId

    if (!scheduleId) {
      const result = await loadScheduleForDate(selectedDate)
      timer.stage('ensureScheduleRow')
      if (!result || !result.scheduleId) {
        toast('Could not create schedule. Please try again.', 'error')
        return timer.finalize({ ok: false })
      }
      scheduleId = result.scheduleId
      overridesToSave = { ...(result.overrides || {}), ...(staffOverrides as any) }
    }
    if (!scheduleId) {
      throw new Error('Missing schedule id after ensureScheduleRow')
    }

    onProgress(0.2)

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
        fteSubtraction?: number
      }> = []

      const processedPcaStaffIds = new Set<string>()
      const therapistStaffIdsInAllocations = new Set<string>()
      const processedTherapistKeys = new Set<string>() // `${staffId}::${team}`

      for (const team of TEAMS) {
        ;(therapistAllocations[team] || []).forEach((alloc: any) => {
          const staffMember = staff.find((s) => s.id === alloc.staff_id)
          if (!staffMember) return
          const isActualTherapist = ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
          if (!isActualTherapist) return

          therapistStaffIdsInAllocations.add(alloc.staff_id)

          const override = overridesToSave[alloc.staff_id] as any
          const splitMap = override?.therapistTeamFTEByTeam as Partial<Record<Team, number>> | undefined
          const hasSplitMap = !!splitMap && Object.keys(splitMap).length > 0
          const effectiveTeam: Team = hasSplitMap ? alloc.team : (override?.team ?? alloc.team)

          const dedupeKey = `${alloc.staff_id}::${effectiveTeam}`
          if (processedTherapistKeys.has(dedupeKey)) return
          processedTherapistKeys.add(dedupeKey)

          const effectiveFteRemaining =
            hasSplitMap && typeof splitMap?.[effectiveTeam] === 'number'
              ? (splitMap[effectiveTeam] as number)
              : override
                ? override.fteRemaining
                : alloc.fte_therapist

          allocationsToSave.push({
            staffId: alloc.staff_id,
            isTherapist: true,
            team: effectiveTeam,
            fteRemaining: effectiveFteRemaining,
            leaveType: override ? override.leaveType : alloc.leave_type,
            alloc: alloc,
          })
        })
      }

      for (const team of TEAMS) {
        ;(pcaAllocations[team] || []).forEach((alloc: any) => {
          if (processedPcaStaffIds.has(alloc.staff_id)) return
          processedPcaStaffIds.add(alloc.staff_id)
          const staffMember = staff.find((s) => s.id === alloc.staff_id)
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
            fteSubtraction: override?.fteSubtraction,
          })
        })
      }

      Object.entries(overridesToSave).forEach(([staffId, override]) => {
        if (processedPcaStaffIds.has(staffId) || therapistStaffIdsInAllocations.has(staffId)) return
        const staffMember = staff.find((s) => s.id === staffId)
        if (!staffMember) return

        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
        const isPCA = staffMember.rank === 'PCA'
        if (!isTherapist && !isPCA) return

        let team: Team = staffMember.team || 'FO'
        let currentAlloc: TherapistAllocation | PCAAllocation | null = null
        if (isTherapist) {
          for (const t of TEAMS) {
            const alloc = (therapistAllocations[t] || []).find((a: any) => a.staff_id === staffId)
            if (alloc) {
              currentAlloc = alloc
              team = alloc.team
              break
            }
          }
        } else if (isPCA) {
          for (const t of TEAMS) {
            const alloc = (pcaAllocations[t] || []).find((a: any) => a.staff_id === staffId)
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
          fteRemaining: (override as any).fteRemaining,
          leaveType: (override as any).leaveType,
          alloc: currentAlloc,
          invalidSlot: (override as any).invalidSlot,
          leaveComebackTime: (override as any).leaveComebackTime,
          isLeave: (override as any).isLeave,
          fteSubtraction: (override as any).fteSubtraction,
        })
      })

      timer.stage('collectAllocations')
      onProgress(0.32)

      const specialProgramsRef: SpecialProgramRef[] = (specialPrograms || []).map((sp: any) => ({ id: sp.id, name: sp.name }))

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
            slot1: (alloc as any)?.slot1 ?? item.team,
            slot2: (alloc as any)?.slot2 ?? item.team,
            slot3: (alloc as any)?.slot3 ?? item.team,
            slot4: (alloc as any)?.slot4 ?? item.team,
            leave_type: item.leaveType,
            special_program_ids: (alloc as any)?.special_program_ids ?? null,
            is_substitute_team_head: (alloc as any)?.is_substitute_team_head ?? false,
            spt_slot_display: (alloc as any)?.spt_slot_display ?? null,
            is_manual_override: (alloc as any)?.is_manual_override ?? false,
            manual_override_note: (alloc as any)?.manual_override_note ?? null,
          }
          therapistRows.push(
            prepareTherapistAllocationForDb({
              allocation: rawTherapist as any,
              specialPrograms: specialProgramsRef,
            })
          )
        } else {
          const alloc = item.alloc as PCAAllocation | null
          const override = overridesToSave[item.staffId]
          const baseFTEPCA = (override as any)?.fteRemaining ?? (alloc as any)?.fte_pca ?? item.fteRemaining
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
              allocation: rawPCA as any,
              specialPrograms: specialProgramsRef,
            })
          )
        }
      }

      timer.stage('buildDbRows')
      onProgress(0.42)

      // Preflight: verify all allocation staff_ids exist in DB
      let missingStaffIdsForSave: string[] = []
      try {
        const submittedIds = Array.from(new Set<string>([
          ...therapistRows.map((r) => (r as any)?.staff_id).filter(Boolean),
          ...pcaRows.map((r) => (r as any)?.staff_id).filter(Boolean),
        ]))
        const { data: existingStaff } = await params.supabase.from('staff').select('id').in('id', submittedIds)
        const existingSet = new Set((existingStaff || []).map((r: any) => r?.id).filter(Boolean))
        missingStaffIdsForSave = submittedIds.filter((id) => !existingSet.has(id))
      } catch {}

      if (missingStaffIdsForSave.length > 0) {
        toast(
          `Cannot save allocations for ${missingStaffIdsForSave.length} staff record(s) that no longer exist. ` +
            `They will be removed from this schedule (e.g. ${missingStaffIdsForSave[0]}).`,
          'warning'
        )

        for (let i = therapistRows.length - 1; i >= 0; i--) {
          const sid = (therapistRows[i] as any)?.staff_id
          if (sid && missingStaffIdsForSave.includes(sid)) therapistRows.splice(i, 1)
        }
        for (let i = pcaRows.length - 1; i >= 0; i--) {
          const sid = (pcaRows[i] as any)?.staff_id
          if (sid && missingStaffIdsForSave.includes(sid)) pcaRows.splice(i, 1)
        }
        try {
          missingStaffIdsForSave.forEach((staffId) => {
            delete (staffOverridesPayloadForDb as any)[staffId]
            delete (overridesToSave as any)[staffId]
          })
        } catch {}

        try {
          setStaff((prev) => prev.filter((s: any) => !missingStaffIdsForSave.includes(s?.id)))
          setInactiveStaff((prev) => prev.filter((s: any) => !missingStaffIdsForSave.includes(s?.id)))
          setBufferStaff((prev) => prev.filter((s: any) => !missingStaffIdsForSave.includes(s?.id)))
          setTherapistAllocations((prev: any) => {
            const next: any = { ...prev }
            TEAMS.forEach((team) => {
              next[team] = (next[team] || []).filter((a: any) => !missingStaffIdsForSave.includes(a?.staff_id))
            })
            return next
          })
          setPcaAllocations((prev: any) => {
            const next: any = { ...prev }
            TEAMS.forEach((team) => {
              next[team] = (next[team] || []).filter((a: any) => !missingStaffIdsForSave.includes(a?.staff_id))
            })
            return next
          })
        } catch {}
      }

      // Schedule calculations: upsert per (schedule_id, team) if available
      const calcRows = TEAMS.map((team) => calculations[team])
        .filter((c): c is ScheduleCalculations => !!c)
        .map((c) => ({
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

      const bedRows = (bedAllocations || []).map((b) => ({
        schedule_id: scheduleId,
        from_team: (b as any).from_team,
        to_team: (b as any).to_team,
        ward: (b as any).ward,
        num_beds: (b as any).num_beds,
        slot: (b as any).slot ?? null,
      }))

      const completedStepsForWorkflow = ALLOCATION_STEPS
        .filter((step: any) => stepStatus[step.id] === 'completed')
        .map((step: any) => step.id) as WorkflowState['completedSteps']

      const workflowStateToSave: WorkflowState = {
        currentStep: currentStep as WorkflowState['currentStep'],
        completedSteps: completedStepsForWorkflow,
      }

      if (cachedSaveScheduleRpcAvailable !== false) {
        onProgress(0.55)
        startSoftAdvance(0.86)
        const rpcRes = await params.supabase.rpc('save_schedule_v1', {
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
          const msg = rpcRes.error.message || ''
          if (
            msg.includes('save_schedule_v1') ||
            msg.includes('Could not find the function') ||
            (rpcRes.error as any)?.code === 'PGRST202'
          ) {
            cachedSaveScheduleRpcAvailable = false
          }
        }
      }

      if (!usedRpc) {
        onProgress(0.55)
        startSoftAdvance(0.82)
        const upsertPromises: PromiseLike<any>[] = []
        if (pcaRows.length > 0) {
          upsertPromises.push(
            params.supabase.from('schedule_pca_allocations').upsert(pcaRows, { onConflict: 'schedule_id,staff_id' })
          )
        }
        if (calcRows.length > 0) {
          upsertPromises.push(params.supabase.from('schedule_calculations').upsert(calcRows, { onConflict: 'schedule_id,team' }))
        }

        const therapistDeletePromise: PromiseLike<any> = params.supabase
          .from('schedule_therapist_allocations')
          .delete()
          .eq('schedule_id', scheduleId)
        const bedDeletePromise: PromiseLike<any> = params.supabase.from('schedule_bed_allocations').delete().eq('schedule_id', scheduleId)

        const [therapistDeleteRes, bedDeleteRes, ...upsertResults] = await Promise.all([
          therapistDeletePromise,
          bedDeletePromise,
          ...upsertPromises,
        ])

        const firstWriteError =
          (therapistDeleteRes as any)?.error ||
          (bedDeleteRes as any)?.error ||
          upsertResults.find((r) => (r as any)?.error)?.error
        if (firstWriteError) {
          toast(`Error saving schedule: ${firstWriteError.message || 'Unknown error'}`, 'error')
          saveError = firstWriteError
          timer.stage('writeAllocations.error')
          return timer.finalize({ ok: false })
        }

        if (therapistRows.length > 0) {
          const therapistInsertRes = await params.supabase.from('schedule_therapist_allocations').insert(therapistRows)
          if (therapistInsertRes.error) {
            toast(`Error saving therapist allocations: ${therapistInsertRes.error.message || 'Unknown error'}`, 'error')
            saveError = therapistInsertRes.error
            timer.stage('writeAllocations.error')
            return timer.finalize({ ok: false })
          }
        }

        if (bedRows.length > 0) {
          const bedInsertRes = await params.supabase.from('schedule_bed_allocations').insert(bedRows)
          if (bedInsertRes.error) {
            toast(`Error saving bed allocations: ${bedInsertRes.error.message || 'Unknown error'}`, 'error')
            saveError = bedInsertRes.error
            timer.stage('writeAllocations.error')
            return timer.finalize({ ok: false })
          }
        }
      }

      stopSoftAdvance()
      timer.stage('writeAllocations')
      onProgress(0.86)

      setSavedOverrides({ ...overridesToSave })
      setStaffOverrides({ ...overridesToSave })
      setSavedBedCountsOverridesByTeam({ ...(bedCountsOverridesByTeam as any) })
      setSavedBedRelievingNotesByToTeam({ ...(bedRelievingNotesByToTeam as any) })
      setSavedAllocationNotesDoc(allocationNotesDoc)

      const y = selectedDate.getFullYear()
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const d = String(selectedDate.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${d}`
      clearCachedSchedule(dateStr)

      // Conditional snapshot refresh (same logic as page.tsx previously)
      try {
        const referencedIds = extractReferencedStaffIds({
          therapistAllocs: allocationsToSave.filter((a) => a.isTherapist).map((a) => ({ staff_id: a.staffId })),
          pcaAllocs: allocationsToSave.filter((a) => !a.isTherapist).map((a) => ({ staff_id: a.staffId })),
          staffOverrides: overridesToSave,
        })

        const baselineStaffById = new Map<string, any>()
        ;((baselineSnapshot as any)?.staff || []).forEach((s: any) => s?.id && baselineStaffById.set(s.id, s))

        const missingReferencedIds: string[] = []
        referencedIds.forEach((id) => {
          if (!baselineStaffById.has(id)) missingReferencedIds.push(id)
        })

        const hasLegacyWrappedIssue = !!(snapshotHealthReport as any)?.issues?.includes('wrappedLegacySnapshot')
        const needsRepairRefresh =
          !baselineSnapshot ||
          !snapshotHealthReport ||
          (snapshotHealthReport as any).status !== 'ok' ||
          missingReferencedIds.length > 0 ||
          hasLegacyWrappedIssue

        let hasTeamOverrideChange = false
        if ((baselineSnapshot as any)?.staff && (baselineSnapshot as any).staff.length > 0) {
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
            const { data: existingScheduleRow } = await params.supabase
              .from('daily_schedules')
              .select('baseline_snapshot')
              .eq('id', scheduleId)
              .maybeSingle()
            const existingBaselineStored = (existingScheduleRow as any)?.baseline_snapshot as BaselineSnapshotStored | undefined

            const result = await validateAndRepairBaselineSnapshot({
              storedSnapshot: existingBaselineStored,
              referencedStaffIds: referencedIds,
              fetchLiveStaffByIds: async (ids: string[]) => {
                if (ids.length === 0) return []
                const attempt = await params.supabase
                  .from('staff')
                  .select('id,name,rank,team,floating,status,buffer_fte,floor_pca,special_program')
                  .in('id', ids)
                if (!attempt.error) return (attempt.data || []) as any[]
                if (attempt.error.message?.includes('column') || (attempt.error as any)?.code === '42703') {
                  const fallback = await params.supabase.from('staff').select('*').in('id', ids)
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
            nextSnapshot = baselineSnapshot as any
          }

          if (hasTeamOverrideChange && (nextSnapshot as any)?.staff) {
            const patchedStaff = (nextSnapshot as any).staff.map((s: any) => {
              const o = overridesToSave[s.id]
              const nextTeam = (o as any)?.team as Team | undefined
              if (!nextTeam) return s
              if (s.rank !== 'APPT' && s.rank !== 'RPT') return s
              if ((s.team ?? null) === nextTeam) return s
              return { ...s, team: nextTeam }
            })
            nextSnapshot = { ...(nextSnapshot as any), staff: patchedStaff }
          }

          const minifiedSnapshot: BaselineSnapshot = {
            ...(nextSnapshot as any),
            specialPrograms: minifySpecialProgramsForSnapshot((nextSnapshot as any).specialPrograms || []) as any,
            calculatedValues: {
              calculations: calculations as any,
              calculatedAt: new Date().toISOString(),
              calculatedForStep: currentStep as ScheduleStepId,
            },
          }

          const globalHeadAtCreation = await fetchGlobalHeadAtCreation(params.supabase)

          if (args.userRole === 'developer') {
            try {
              specialProgramsBytes = JSON.stringify((minifiedSnapshot as any).specialPrograms || []).length
              snapshotBytes = JSON.stringify(
                buildBaselineSnapshotEnvelope({ data: minifiedSnapshot, source: 'save', globalHeadAtCreation }) as any
              ).length
            } catch {}
          }

          const envelopeToSave = buildBaselineSnapshotEnvelope({ data: minifiedSnapshot, source: 'save', globalHeadAtCreation })
          await params.supabase.from('daily_schedules').update({ baseline_snapshot: envelopeToSave as any }).eq('id', scheduleId)
          snapshotWritten = true

          setBaselineSnapshot(minifiedSnapshot)
          if (nextReport) setSnapshotHealthReport(nextReport)
        }
      } catch {
        // ignore snapshot refresh failures
      }

      timer.stage('snapshotRefresh')
      onProgress(0.92)

      if (!usedRpc) {
        const { error: scheduleMetaError } = await params.supabase
          .from('daily_schedules')
          .update({
            tie_break_decisions: tieBreakDecisions,
            staff_overrides: staffOverridesPayloadForDb,
            workflow_state: workflowStateToSave,
          })
          .eq('id', scheduleId)
        if (!scheduleMetaError) {
          setPersistedWorkflowState(workflowStateToSave)
        }
      } else {
        setPersistedWorkflowState(workflowStateToSave)
      }

      timer.stage('metadata')
      onProgress(0.96)

      toast('Saved successfully.', 'success')
    } catch (e) {
      saveError = e
      toast('Failed to save. Please try again.', 'error')
    } finally {
      setSaving(false)
      if (args.userRole === 'developer' && specialProgramsBytes == null) {
        try {
          const prog = (baselineSnapshot as any)?.specialPrograms ?? specialPrograms
          specialProgramsBytes = JSON.stringify(minifySpecialProgramsForSnapshot(prog as any)).length
        } catch {}
      }
    }

    return timer.finalize({
      ok: !saveError,
      rpcUsed: usedRpc,
      snapshotWritten,
      snapshotHasMinifiedPrograms: true,
      snapshotBytes,
      specialProgramsBytes,
    })
  }

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
      review: 'pending',
    })
    setCurrentStep('leave-fte')
    setTieBreakDecisions({})
  }

  const copySchedule = async (args: {
    fromDate: Date
    toDate: Date
    mode: 'full' | 'hybrid'
    includeBufferStaff: boolean
    onProgress?: (next: number) => void
    startSoftAdvance?: (cap: number) => void
    stopSoftAdvance?: () => void
  }): Promise<{ copiedUpToStep?: string; timing: TimingReport }> => {
    const timer = createTimingCollector()
    const onProgress = args.onProgress ?? (() => {})
    const startSoftAdvance = args.startSoftAdvance ?? (() => {})
    const stopSoftAdvance = args.stopSoftAdvance ?? (() => {})

    let serverTiming: any = null
    let copyError: unknown = null

    onProgress(0.18)
    startSoftAdvance(0.72)

    try {
      const res = await fetch('/api/schedules/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate: formatDateForInput(args.fromDate),
          toDate: formatDateForInput(args.toDate),
          mode: args.mode,
          includeBufferStaff: args.includeBufferStaff,
        }),
      })
      timer.stage('fetch')
      onProgress(0.72)

      let data: any = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      serverTiming = data?.timings ?? null
      timer.stage('parseResponse')
      stopSoftAdvance()
      onProgress(0.8)

      if (!res.ok) {
        const message = data?.error ? String(data.error) : 'Failed to copy schedule.'
        throw new Error(message)
      }

      return {
        copiedUpToStep: (data as any)?.copiedUpToStep as string | undefined,
        timing: timer.finalize({ ok: true, server: serverTiming }),
      }
    } catch (e) {
      copyError = e
      const timing = timer.finalize({ ok: false, server: serverTiming })
      ;(e as any).timing = timing
      ;(e as any).serverTiming = serverTiming
      throw e
    } finally {
      stopSoftAdvance()
      void copyError
    }
  }

  /**
   * Step 2: Generate therapist allocations + non-floating PCA allocations + special program PCA.
   * This step does NOT trigger tie-breakers (floating PCA handled in Step 3).
   *
   * UI remains in the page: when substitutions are needed, we call `onNonFloatingSubstitutionWizard`
   * to open the dialog and wait for user selections.
   */
  const runStep2TherapistAndNonFloatingPCA = async (args: {
    cleanedOverrides?: Record<string, StaffOverrideState>
    toast?: (title: string, variant?: any, description?: string) => void
    onNonFloatingSubstitutionWizard?: (params: {
      teams: Team[]
      substitutionsByTeam: Record<Team, any[]>
      isWizardMode: boolean
      initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
    }) => Promise<Record<string, Array<{ floatingPCAId: string; slots: number[] }>>>
  }): Promise<Record<Team, (PCAAllocation & { staff: Staff })[]>> => {
    if (staff.length === 0) return createEmptyTeamRecord<Array<PCAAllocation & { staff: Staff }>>([])

    const toast = args.toast ?? (() => {})
    setLoading(true)
    try {
      const overridesBase = (args.cleanedOverrides ?? (staffOverrides as any)) as Record<string, StaffOverrideState>

      // Buffer non-floating PCA substitution (whole-day).
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
          .filter((s) => {
            if (s.rank !== 'PCA') return false
            if (s.status !== 'buffer') return false
            if (s.floating) return false
            if (!s.team) return false
            const bf = (s as any)?.buffer_fte
            if (typeof bf !== 'number') return false
            return bf >= 0.999
          })
          .forEach((s) => {
            const t = s.team as Team
            const list = bufferNonFloatingByTeam.get(t) ?? []
            list.push(s)
            bufferNonFloatingByTeam.set(t, list)
          })

        for (const team of TEAMS) {
          const bufferSubs = bufferNonFloatingByTeam.get(team) ?? []
          if (bufferSubs.length === 0) continue

          const missingRegular = staff.find((s) => {
            if (s.rank !== 'PCA') return false
            if (s.status === 'buffer') return false
            if (s.floating) return false
            if (s.team !== team) return false
            return (overridesBase as any)[s.id]?.fteRemaining === 0
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
      } as Record<string, StaffOverrideState>

      // Transform staff data for algorithms
      const weekday: Weekday = getWeekday(selectedDate)
      const sptAddonByStaffId = new Map<string, number>()
      for (const a of sptAllocations) {
        if ((a as any).weekdays?.includes(weekday)) {
          const raw = (a as any).fte_addon
          const fte = typeof raw === 'number' ? raw : raw != null ? parseFloat(String(raw)) : NaN
          if (Number.isFinite(fte)) sptAddonByStaffId.set((a as any).staff_id, fte)
        }
      }

      const staffData: StaffData[] = staff.map((s) => {
        const override = overrides[s.id]
        const isBufferStaff = s.status === 'buffer'
        const baseFTE =
          s.rank === 'SPT'
            ? (sptAddonByStaffId.get(s.id) ?? 1.0)
            : isBufferStaff && (s as any).buffer_fte !== undefined
              ? (s as any).buffer_fte
              : 1.0
        const effectiveFTE = override ? override.fteRemaining : baseFTE
        const isOnDuty = isOnDutyLeaveType(override?.leaveType as any)
        const isAvailable =
          s.rank === 'SPT'
            ? override
              ? override.fteRemaining > 0 || (override.fteRemaining === 0 && isOnDuty)
              : effectiveFTE >= 0
            : override
              ? override.fteRemaining > 0
              : effectiveFTE > 0

        return {
          id: s.id,
          name: s.name,
          rank: s.rank,
          team: override?.team ?? s.team,
          special_program: (s as any).special_program,
          fte_therapist: effectiveFTE,
          leave_type: override ? override.leaveType : null,
          is_available: isAvailable,
          availableSlots: override?.availableSlots,
        }
      })

      // Apply special program overrides:
      // - Therapists: add substituted therapists to program.staff_ids + fte_subtraction for this weekday
      // - PCAs: force the user-selected PCA to the front of pca_preference_order so Step 2 respects the override
      const modifiedSpecialPrograms: SpecialProgram[] = (specialPrograms || []).map((program: any) => {
        const programOverrides: Array<{ therapistId?: string; therapistFTESubtraction?: number }> = []
        const pcaOverrides: Array<{ pcaId: string }> = []

        Object.values(overrides).forEach((override) => {
          const list = (override as any)?.specialProgramOverrides as any[] | undefined
          if (!Array.isArray(list)) return
          const spOverride = list.find((spo) => spo?.programId === program.id)
          if (!spOverride) return
          if (spOverride.therapistId) {
            programOverrides.push({
              therapistId: spOverride.therapistId,
              therapistFTESubtraction: spOverride.therapistFTESubtraction,
            })
          }
          if (spOverride.pcaId && program.name !== 'DRM') {
            pcaOverrides.push({ pcaId: spOverride.pcaId })
          }
        })

        if (programOverrides.length === 0 && pcaOverrides.length === 0) return program

        const modifiedProgram: any = { ...program }

        programOverrides.forEach((o) => {
          if (!o.therapistId) return
          if (!modifiedProgram.staff_ids.includes(o.therapistId)) {
            modifiedProgram.staff_ids = [...modifiedProgram.staff_ids, o.therapistId]
          }
          if (!modifiedProgram.fte_subtraction[o.therapistId]) {
            modifiedProgram.fte_subtraction[o.therapistId] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }
          }
          if (o.therapistFTESubtraction !== undefined) {
            modifiedProgram.fte_subtraction[o.therapistId][weekday] = o.therapistFTESubtraction
          }
        })

        if (pcaOverrides.length > 0) {
          const chosenPcaId = pcaOverrides[0]?.pcaId
          if (chosenPcaId) {
            const existing = modifiedProgram.pca_preference_order as string[] | undefined
            modifiedProgram.pca_preference_order = [
              chosenPcaId,
              ...((Array.isArray(existing) ? existing : []).filter((id) => id !== chosenPcaId)),
            ]
          }
        }

        return modifiedProgram
      })

      // Generate therapist allocations (include SPT allocation in step 2)
      const therapistContext: AllocationContext = {
        date: selectedDate,
        previousSchedule: null,
        staff: staffData,
        specialPrograms: modifiedSpecialPrograms,
        sptAllocations: (sptAllocations || []).map((a: any) => {
          const o = overrides[a.staff_id]
          if (!o) return a
          const staffMember = staff.find((s) => s.id === a.staff_id)
          if (staffMember?.rank !== 'SPT') return a
          return { ...a, fte_addon: o.fteRemaining }
        }),
        manualOverrides: {},
        includeSPTAllocation: true,
      }

      const therapistResult = allocateTherapists(therapistContext)

      const therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = createEmptyTeamRecordFactory(() => [])
      ;(therapistResult.allocations || []).forEach((alloc: any) => {
        const staffMember = staff.find((s) => s.id === alloc.staff_id)
        if (!staffMember) return
        const override = overrides[alloc.staff_id]
        if (override) {
          alloc.fte_therapist = override.fteRemaining
          alloc.leave_type = override.leaveType
          if (override.team) alloc.team = override.team
        }
        therapistByTeam[alloc.team as Team].push({ ...alloc, staff: staffMember })
      })

      // Sort: APPT first (preserve existing behavior)
      TEAMS.forEach((team) => {
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
      const pcaData: PCAData[] = staff
        .filter((s) => s.rank === 'PCA')
        .map((s) => {
          const override = overrides[s.id]
          const isBufferStaff = s.status === 'buffer'
          const baseFTE = isBufferStaff && (s as any).buffer_fte !== undefined ? (s as any).buffer_fte : 1.0
          const baseFTERemaining =
            override && override.fteSubtraction !== undefined
              ? Math.max(0, baseFTE - override.fteSubtraction)
              : override
                ? override.fteRemaining
                : baseFTE
          const effectiveTeam = replacedNonFloatingIds.has(s.id) ? null : s.team
          const effectiveAvailableSlots = override?.availableSlots

          return {
            id: s.id,
            name: s.name,
            floating: (s as any).floating || false,
            special_program: (s as any).special_program,
            fte_pca: baseFTERemaining,
            leave_type: override ? override.leaveType : null,
            is_available: override ? override.fteRemaining > 0 : true,
            team: effectiveTeam as any,
            availableSlots: effectiveAvailableSlots,
            invalidSlot: (override as any)?.invalidSlot,
            leaveComebackTime: (override as any)?.leaveComebackTime,
            isLeave: (override as any)?.isLeave,
            floor_pca: (s as any).floor_pca || null,
          }
        })

      // Calculate average PCA per team (keep same logic as page)
      const totalPCA = staff
        .filter((s) => s.rank === 'PCA')
        .reduce((sum, s) => {
          const overrideFTE = overrides[s.id]?.fteRemaining
          const isOnLeave = overrides[s.id]?.leaveType && overrides[s.id]?.fteRemaining === 0
          const currentFTE = overrideFTE !== undefined ? overrideFTE : isOnLeave ? 0 : 1
          return sum + currentFTE
        }, 0)

      const ptPerTeamFromResult = createEmptyTeamRecord<number>(0)
      let totalPTOnDuty = 0
      ;(therapistResult.allocations || []).forEach((alloc: any) => {
        const staffMember = staff.find((s) => s.id === alloc.staff_id)
        if (!staffMember) return
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(staffMember.rank)
        const override = overrides[alloc.staff_id]
        const fte = override ? override.fteRemaining : alloc.fte_therapist || 0
        if (isTherapist && fte > 0) {
          ptPerTeamFromResult[alloc.team as Team] += fte
          totalPTOnDuty += fte
        }
      })

      const rawAveragePCAPerTeam = createEmptyTeamRecord<number>(0)
      TEAMS.forEach((team) => {
        rawAveragePCAPerTeam[team] = totalPTOnDuty > 0 ? (ptPerTeamFromResult[team] * totalPCA) / totalPTOnDuty : totalPCA / 8
      })

      const drmProgram = (specialPrograms || []).find((p: any) => p.name === 'DRM')
      if (drmProgram && (drmProgram as any).weekdays?.includes(weekday)) {
        rawAveragePCAPerTeam.DRO += 0.4
      }

      // Build "existing allocations" (unique per staff_id) from current state for substitution inference.
      const existingAllocationsRaw: PCAAllocation[] = []
      try {
        const added = new Set<string>()
        Object.values(pcaAllocations).forEach((allocs: any[]) => {
          allocs.forEach((alloc: any) => {
            if (!alloc?.staff_id) return
            if (added.has(alloc.staff_id)) return
            const staffMember = staff.find((s) => s.id === alloc.staff_id)
            if (!staffMember) return
            const hasSlots = alloc.slot1 != null || alloc.slot2 != null || alloc.slot3 != null || alloc.slot4 != null
            if (!staffMember.floating || hasSlots) {
              existingAllocationsRaw.push(alloc)
              added.add(alloc.staff_id)
            }
          })
        })
      } catch {}

      const onNonFloatingSubstitution = async (subs: any[]) => {
        // Pre-detect persisted substitution selections from staffOverrides.
        const preSelections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>> = {}
        try {
          for (const sub of subs || []) {
            const key = `${sub.team}-${sub.nonFloatingPCAId}`
            const matches = Object.entries(overrides).filter(([, o]) => {
              const sf = (o as any)?.substitutionFor
              return sf?.team === sub.team && sf?.nonFloatingPCAId === sub.nonFloatingPCAId
            })
            if (matches.length === 0) continue
            const allowedIds = new Set((sub.availableFloatingPCAs || []).map((p: any) => p.id))
            for (const [floatingPCAId, o] of matches) {
              if (!allowedIds.has(floatingPCAId)) continue
              const sf = (o as any)?.substitutionFor as { slots: number[] } | undefined
              if (!sf || !Array.isArray(sf.slots) || sf.slots.length === 0) continue
              preSelections[key] = preSelections[key] ?? []
              preSelections[key].push({ floatingPCAId, slots: sf.slots })
            }
          }
        } catch {}

        // Infer "already-selected" substitute from saved/current allocations.
        try {
          for (const sub of subs || []) {
            const key = `${sub.team}-${sub.nonFloatingPCAId}`
            if (Array.isArray(preSelections[key]) && preSelections[key]!.length > 0) continue

            const allowedIds = new Set((sub.availableFloatingPCAs || []).map((p: any) => p.id))
            if (allowedIds.size === 0) continue

            const candidateAllocs = existingAllocationsRaw
              .filter((a: any) => {
                const staffMember = staff.find((s) => s.id === a.staff_id)
                if (!staffMember?.floating) return false
                if (a.special_program_ids && a.special_program_ids.length > 0) return false
                return allowedIds.has(a.staff_id)
              })
              .map((a: any) => {
                const overlapSlots: number[] = []
                if ((sub.missingSlots || []).includes(1) && a.slot1 === sub.team) overlapSlots.push(1)
                if ((sub.missingSlots || []).includes(2) && a.slot2 === sub.team) overlapSlots.push(2)
                if ((sub.missingSlots || []).includes(3) && a.slot3 === sub.team) overlapSlots.push(3)
                if ((sub.missingSlots || []).includes(4) && a.slot4 === sub.team) overlapSlots.push(4)
                return { alloc: a, overlapSlots }
              })
              .filter((x: any) => x.overlapSlots.length > 0)
              .sort((a: any, b: any) => b.overlapSlots.length - a.overlapSlots.length)

            const best = candidateAllocs[0]
            if (!best) continue
            preSelections[key] = [{ floatingPCAId: best.alloc.staff_id, slots: best.overlapSlots }]
          }
        } catch {}

        const substitutionsByTeam = createEmptyTeamRecordFactory<any[]>(() => [])
        ;(subs || []).forEach((sub: any) => {
          substitutionsByTeam[sub.team as Team].push(sub)
        })
        const teamsWithSubstitutions = TEAMS.filter((team) => substitutionsByTeam[team].length > 0)
        if (teamsWithSubstitutions.length === 0) return {}

        const isWizardMode = teamsWithSubstitutions.length > 1

        if (!args.onNonFloatingSubstitutionWizard) {
          return Object.keys(preSelections).length > 0 ? preSelections : {}
        }

        const selections = await args.onNonFloatingSubstitutionWizard({
          teams: teamsWithSubstitutions,
          substitutionsByTeam,
          isWizardMode,
          initialSelections: Object.keys(preSelections).length > 0 ? preSelections : undefined,
        })

        const keys = Object.keys(selections || {})
        return keys.length === 0 && Object.keys(preSelections).length > 0 ? preSelections : (selections || {})
      }

      const existingAllocsForSubstitution = existingAllocationsRaw.filter((alloc: any) => {
        const staffMember = staff.find((s) => s.id === alloc.staff_id)
        if (!staffMember) return false
        if (!staffMember.floating) return true
        return !!(alloc.special_program_ids && alloc.special_program_ids.length > 0)
      })

      const pcaContext: PCAAllocationContext = {
        date: selectedDate,
        totalPCAAvailable: totalPCA,
        pcaPool: pcaData,
        averagePCAPerTeam: rawAveragePCAPerTeam,
        specialPrograms: modifiedSpecialPrograms,
        pcaPreferences,
        phase: 'non-floating-with-special',
        onNonFloatingSubstitution,
        existingAllocations: existingAllocsForSubstitution as any,
      }

      const pcaResult = await allocatePCA(pcaContext)

      // Extract and store errors (for Step 2 - non-floating PCA + special program)
      if ((pcaResult as any).errors) {
        setPcaAllocationErrors((prev: PCAAllocationErrors) => ({
          ...prev,
          missingSlotSubstitution: (pcaResult as any).errors?.missingSlotSubstitution,
          specialProgramAllocation: (pcaResult as any).errors?.specialProgramAllocation,
        }))
      }

      const pcaByTeam = createEmptyTeamRecordFactory<Array<PCAAllocation & { staff: Staff }>>(() => [])
      ;(pcaResult as any).allocations.forEach((alloc: any) => {
        const staffMember = staff.find((s) => s.id === alloc.staff_id)
        if (!staffMember) return
        const override = overrides[alloc.staff_id]
        if (override) {
          alloc.leave_type = override.leaveType
        }
        pcaByTeam[alloc.team as Team].push({ ...alloc, staff: staffMember })
      })

      // Sort: non-floating first, then floating
      TEAMS.forEach((team) => {
        pcaByTeam[team].sort((a, b) => {
          const aIsNonFloating = !(a.staff?.floating ?? true)
          const bIsNonFloating = !(b.staff?.floating ?? true)
          if (aIsNonFloating && !bIsNonFloating) return -1
          if (!aIsNonFloating && bIsNonFloating) return 1
          return 0
        })
      })

      setPcaAllocations(pcaByTeam)
      setPendingPCAFTEPerTeam((pcaResult as any).pendingPCAFTEPerTeam)

      // Persist buffer-substitution display intent into staffOverrides state (day-level override).
      if (Object.keys(bufferSubstitutionUpdates).length > 0) {
        setStaffOverrides((prev: any) => {
          const next = { ...prev }
          for (const [bufferId, patch] of Object.entries(bufferSubstitutionUpdates)) {
            const staffMember = staff.find((s) => s.id === bufferId)
            const baseFTE =
              staffMember?.status === 'buffer' && (staffMember as any).buffer_fte !== undefined
                ? (staffMember as any).buffer_fte
                : 1.0
            next[bufferId] = {
              ...(next[bufferId] ?? { leaveType: null, fteRemaining: baseFTE }),
              ...patch,
            }
          }
          return next
        })
      }

      setStep2Result({
        pcaData,
        teamPCAAssigned: (pcaResult as any).teamPCAAssigned || createEmptyTeamRecord<number>(0),
        nonFloatingAllocations: (pcaResult as any).allocations,
        rawAveragePCAPerTeam,
      })

      setStepStatus((prev: any) => ({ ...prev, 'therapist-pca': 'completed' }))
      setInitializedSteps((prev) => {
        const next = new Set(prev)
        next.add('therapist-pca')
        return next
      })
      toast('Step 2 allocation completed.', 'success', 'Therapist & non-floating PCA allocations updated.')

      return pcaByTeam
    } catch (error) {
      console.error('Error in Step 2:', error)
      return createEmptyTeamRecord<Array<PCAAllocation & { staff: Staff }>>([])
    } finally {
      setLoading(false)
    }
  }

  /**
   * Step 3: Generate floating PCA allocations (tie-breakers happen here).
   * UI remains in the page: tie-break dialog is provided via `onTieBreak`.
   */
  const runStep3FloatingPCA = async (args: {
    userAdjustedPendingFTE?: Record<Team, number>
    userTeamOrder?: Team[]
    onTieBreak?: (params: { teams: Team[]; pendingFTE: number; tieBreakKey: string }) => Promise<Team>
  }) => {
    if (!step2Result) {
      console.error('Step 2 must be completed before Step 3')
      return
    }

    setLoading(true)
    try {
      // Recalculate from current state to pick up any user edits after Step 2.
      const teamPCAAssigned = createEmptyTeamRecord<number>(0)
      const existingAllocations: PCAAllocation[] = []
      const addedStaffIds = new Set<string>()

      Object.entries(pcaAllocations).forEach(([team, allocs]) => {
        ;(allocs || []).forEach((alloc: any) => {
          let slotsInTeam = 0
          if (alloc.slot1 === team) slotsInTeam++
          if (alloc.slot2 === team) slotsInTeam++
          if (alloc.slot3 === team) slotsInTeam++
          if (alloc.slot4 === team) slotsInTeam++

          const invalidSlot = (alloc as any).invalid_slot
          if (invalidSlot) {
            const slotField = `slot${invalidSlot}` as keyof PCAAllocation
            if ((alloc as any)[slotField] === team) {
              slotsInTeam = Math.max(0, slotsInTeam - 1)
            }
          }

          teamPCAAssigned[team as Team] += slotsInTeam * 0.25

          const staffMember = staff.find((s) => s.id === alloc.staff_id)
          if (!staffMember) return
          if (addedStaffIds.has(alloc.staff_id)) return

          const hasSlots = alloc.slot1 != null || alloc.slot2 != null || alloc.slot3 != null || alloc.slot4 != null
          if (!staffMember.floating || hasSlots) {
            existingAllocations.push(alloc)
            addedStaffIds.add(alloc.staff_id)
          }
        })
      })

      const pcaData: PCAData[] = staff
        .filter((s) => s.rank === 'PCA')
        .map((s) => {
          const override = (staffOverrides as any)[s.id]
          const isBufferStaff = s.status === 'buffer'
          const baseFTE = isBufferStaff && (s as any).buffer_fte !== undefined ? (s as any).buffer_fte : 1.0
          const baseFTERemaining =
            override && override.fteSubtraction !== undefined
              ? Math.max(0, baseFTE - override.fteSubtraction)
              : override
                ? override.fteRemaining
                : baseFTE

          const effectiveBaseFTERemaining = isBufferStaff ? Math.min(baseFTE, baseFTERemaining) : baseFTERemaining

          let availableSlots = override?.availableSlots
          if (s.floating && override?.substitutionFor) {
            const substitutionSlots = override.substitutionFor.slots
            const baseAvailableSlots =
              availableSlots && availableSlots.length > 0 ? availableSlots : [1, 2, 3, 4]
            availableSlots = baseAvailableSlots.filter((slot: number) => !substitutionSlots.includes(slot))
          }

          return {
            id: s.id,
            name: s.name,
            floating: (s as any).floating || false,
            special_program: (s as any).special_program as string[] | null,
            team: s.team,
            fte_pca: effectiveBaseFTERemaining,
            leave_type: override ? override.leaveType : null,
            is_available: override ? override.fteRemaining > 0 : true,
            availableSlots,
            invalidSlot: override?.invalidSlot,
            leaveComebackTime: override?.leaveComebackTime,
            isLeave: override?.isLeave,
            floor_pca: (s as any).floor_pca || null,
          }
        })

      const totalPCAAvailable = pcaData.filter((p) => (p as any).is_available).reduce((sum, p) => sum + p.fte_pca, 0)

      const handleTieBreak = async (teams: Team[], pendingFTE: number): Promise<Team> => {
        if (args.userTeamOrder) {
          const orderedTeam = args.userTeamOrder.find((t) => teams.includes(t))
          if (orderedTeam) return orderedTeam
        }

        const sortedTeams = [...teams].sort().join(',')
        const tieBreakKey = `${sortedTeams}:${pendingFTE.toFixed(4)}`

        if ((tieBreakDecisions as any)[tieBreakKey]) {
          return (tieBreakDecisions as any)[tieBreakKey]
        }

        const chosen =
          args.onTieBreak != null
            ? await args.onTieBreak({ teams, pendingFTE, tieBreakKey })
            : [...teams].sort()[0]

        setTieBreakDecisions((prevDecisions: any) => ({
          ...prevDecisions,
          [tieBreakKey]: chosen,
        }))

        return chosen
      }

      const avg = (step2Result as any)?.rawAveragePCAPerTeam
      if (!avg) {
        console.error('Missing Step 2 average PCA per team (step2Result.rawAveragePCAPerTeam)')
      }

      const pcaContext: PCAAllocationContext = {
        date: selectedDate,
        totalPCAAvailable,
        pcaPool: pcaData,
        averagePCAPerTeam: avg ?? createEmptyTeamRecord<number>(0),
        specialPrograms,
        pcaPreferences,
        onTieBreak: handleTieBreak,
        phase: 'floating',
        existingAllocations,
        existingTeamPCAAssigned: teamPCAAssigned,
        userAdjustedPendingFTE: args.userAdjustedPendingFTE,
        userTeamOrder: args.userTeamOrder,
      }

      const pcaResult = await allocatePCA(pcaContext)

      const overrides = staffOverrides as any
      ;((pcaResult as any).allocations || []).forEach((alloc: any) => {
        const override = overrides[alloc.staff_id]
        if (override) {
          alloc.leave_type = override.leaveType
        }
      })

      const staffById = buildStaffByIdMap(staff || [])
      const pcaByTeam = groupPcaAllocationsByTeamWithSlotTeams({
        teams: TEAMS,
        allocations: (pcaResult as any).allocations || [],
        staffById,
        sort: sortPcaNonFloatingFirstOnly,
      })

      setPcaAllocations(pcaByTeam)
      setPendingPCAFTEPerTeam((pcaResult as any).pendingPCAFTEPerTeam)

      setStepStatus((prev: any) => ({ ...prev, 'floating-pca': 'completed' }))
      setInitializedSteps((prev) => {
        const next = new Set(prev)
        next.add('floating-pca')
        return next
      })
    } catch (error) {
      console.error('Error in Step 3:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Step 4: Calculate bed relieving allocations (derived from therapist allocations + ward bed counts).
   * No UI required; page can still show a toast via `toast` callback.
   */
  const runStep4BedRelieving = (args?: {
    toast?: (title: string, variant?: any, description?: string) => void
  }) => {
    const toast = args?.toast ?? (() => {})

    // Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
    const ptPerTeamByTeam = createEmptyTeamRecord<number>(0)
    TEAMS.forEach((team) => {
      const ptPerTeam = (therapistAllocations[team] || []).reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes((alloc as any).staff?.rank)
        const hasFTE = ((alloc as any).fte_therapist || 0) > 0
        return sum + (isTherapist && hasFTE ? ((alloc as any).fte_therapist || 0) : 0)
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
      wards: (wards || []).map((w: any) => ({ name: w.name, team_assignments: w.team_assignments })),
    }

    const bedResult = allocateBeds(bedContext)
    setBedAllocations(bedResult.allocations)

    setStepStatus((prev: any) => ({ ...prev, 'bed-relieving': 'completed' }))
    setInitializedSteps((prev) => {
      const next = new Set(prev)
      next.add('bed-relieving')
      return next
    })
    toast('Step 4 calculation completed.', 'success', 'Bed relieving values updated.')
  }

  const _unsafe = {
    // Core date (prefer beginDateTransition/goToStep instead)
    setSelectedDate,

    // Domain data
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

    // Persistence
    setCurrentScheduleId,
    setStaffOverrides,
    setSavedOverrides,
    setSaving,
    setScheduleLoadedForDate,
    setHasSavedAllocations,
    setBedCountsOverridesByTeam,
    setSavedBedCountsOverridesByTeam,
    setBedRelievingNotesByToTeam,
    setSavedBedRelievingNotesByToTeam,
    setAllocationNotesDoc,
    setSavedAllocationNotesDoc,

    // Workflow / snapshot
    setCurrentStep,
    setStepStatus,
    setInitializedSteps,
    setPendingPCAFTEPerTeam,
    setPersistedWorkflowState,
    setBaselineSnapshot,
    setSnapshotHealthReport,
    setStep2Result,
    setPcaAllocationErrors,
    setTieBreakDecisions,
  }

  const actions = {
    // Date / navigation
    beginDateTransition,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    applyStaffEditDomain,
    setScheduleStaffStatusOverride,
    clearScheduleStaffStatusOverride,
    updateBedRelievingNotes,
    applyBaselineViewAllocations,
    removeStep2KeysFromOverrides,
    resetStep3ForReentry,
    clearDomainFromStep,
    markStepCompleted,

    // Load/save/copy
    loadScheduleForDate,
    loadAndHydrateDate,
    saveScheduleToDatabase,
    copySchedule,
    resetToBaseline,

    // Step runners
    runStep2TherapistAndNonFloatingPCA,
    runStep3FloatingPCA,
    runStep4BedRelieving,

    // Legacy helpers still referenced by page/controller
    buildBaselineSnapshotFromCurrentState,
    applySavedAllocationsFromDb,

    // Escape hatch (temporary, should shrink over time)
    _unsafe,
  }

  return { state, actions }
}

