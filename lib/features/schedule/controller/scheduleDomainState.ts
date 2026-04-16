import type { SetStateAction } from 'react'
import type { Team, Staff } from '@/types/staff'
import type { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import type {
  BaselineSnapshot,
  BedAllocation,
  PCAAllocation,
  ScheduleCalculations,
  StepStatus,
  SnapshotHealthReport,
  TherapistAllocation,
  WorkflowState,
} from '@/types/schedule'
import type {
  BedCountsOverridesByTeam,
  BedRelievingNotesByToTeam,
  PCAAllocationErrors,
  ScheduleWardRow,
  StaffOverrideState,
} from './scheduleControllerTypes'

const UNDO_STACK_LIMIT = 30

type UndoSnapshot = {
  staffOverrides: Record<string, StaffOverrideState>
  staffOverridesVersion: number
  bedCountsOverridesByTeam: BedCountsOverridesByTeam
  bedCountsOverridesVersion: number
  bedRelievingNotesByToTeam: BedRelievingNotesByToTeam
  bedRelievingNotesVersion: number
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]>
  pendingPCAFTEPerTeam: Record<Team, number>
  bedAllocations: BedAllocation[]
  calculations: Record<Team, ScheduleCalculations | null>
  currentStep: string
  stepStatus: Record<string, StepStatus>
  initializedSteps: Set<string>
  step2Result: any
  hasSavedAllocations: boolean
  pcaAllocationErrors: PCAAllocationErrors
  tieBreakDecisions: Record<string, Team>
}

export type UndoEntry = {
  label: string
  createdAt: number
  snapshot: UndoSnapshot
}

export type Step2ResultSurplusProjection = {
  rawAveragePCAPerTeam?: Record<Team, number>
}

export type ScheduleDomainState = {
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
  currentScheduleUpdatedAt: string | null
  staffOverrides: Record<string, StaffOverrideState>
  savedOverrides: Record<string, StaffOverrideState>
  saving: boolean
  scheduleLoadedForDate: string | null
  hasSavedAllocations: boolean

  bedCountsOverridesByTeam: BedCountsOverridesByTeam
  savedBedCountsOverridesByTeam: BedCountsOverridesByTeam
  bedRelievingNotesByToTeam: BedRelievingNotesByToTeam
  savedBedRelievingNotesByToTeam: BedRelievingNotesByToTeam
  staffOverridesVersion: number
  savedOverridesVersion: number
  bedCountsOverridesVersion: number
  savedBedCountsOverridesVersion: number
  bedRelievingNotesVersion: number
  savedBedRelievingNotesVersion: number
  allocationNotesDoc: any
  savedAllocationNotesDoc: any

  // Workflow / snapshot domain state
  currentStep: string
  stepStatus: Record<string, StepStatus>
  initializedSteps: Set<string>
  pendingPCAFTEPerTeam: Record<Team, number>

  persistedWorkflowState: WorkflowState | null
  baselineSnapshot: BaselineSnapshot | null
  snapshotHealthReport: SnapshotHealthReport | null

  step2Result: any
  pcaAllocationErrors: PCAAllocationErrors
  tieBreakDecisions: Record<string, Team>
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
}

type ScheduleDomainAction =
  | { type: 'set'; key: keyof ScheduleDomainState; value: unknown }
  | { type: 'patch'; patch: Partial<ScheduleDomainState> }
  | { type: 'setStaffOverrides'; value: SetStateAction<ScheduleDomainState['staffOverrides']> }
  | { type: 'setSavedOverrides'; value: SetStateAction<ScheduleDomainState['savedOverrides']> }
  | { type: 'setBedCountsOverridesByTeam'; value: SetStateAction<ScheduleDomainState['bedCountsOverridesByTeam']> }
  | { type: 'setSavedBedCountsOverridesByTeam'; value: SetStateAction<ScheduleDomainState['savedBedCountsOverridesByTeam']> }
  | { type: 'setBedRelievingNotesByToTeam'; value: SetStateAction<ScheduleDomainState['bedRelievingNotesByToTeam']> }
  | { type: 'setSavedBedRelievingNotesByToTeam'; value: SetStateAction<ScheduleDomainState['savedBedRelievingNotesByToTeam']> }
  | { type: 'pushUndoEntry'; entry: UndoEntry; clearRedo: boolean }
  | { type: 'clearUndoRedoHistory' }
  | {
      type: 'restoreFromHistory'
      snapshot: UndoSnapshot
      undoStack: UndoEntry[]
      redoStack: UndoEntry[]
    }

function applySetStateAction<T>(prev: T, action: SetStateAction<T>): T {
  return typeof action === 'function' ? (action as (p: T) => T)(prev) : action
}

export function pushHistoryEntry(stack: UndoEntry[], entry: UndoEntry): UndoEntry[] {
  const next = [...stack, entry]
  if (next.length <= UNDO_STACK_LIMIT) return next
  return next.slice(next.length - UNDO_STACK_LIMIT)
}

export function deepCloneSnapshotValue<T>(value: T): T {
  const cloneFn = (globalThis as any).structuredClone as (<U>(input: U) => U) | undefined
  if (typeof cloneFn === 'function') {
    try {
      return cloneFn(value)
    } catch {
      // Fall through to manual clone.
    }
  }
  if (value instanceof Set) {
    return new Set(Array.from(value.values())) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneSnapshotValue(item)) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      out[k] = deepCloneSnapshotValue(v)
    })
    return out as T
  }
  return value
}

export function buildUndoSnapshotFromState(state: ScheduleDomainState): UndoSnapshot {
  return {
    staffOverrides: deepCloneSnapshotValue(state.staffOverrides),
    staffOverridesVersion: state.staffOverridesVersion,
    bedCountsOverridesByTeam: deepCloneSnapshotValue(state.bedCountsOverridesByTeam),
    bedCountsOverridesVersion: state.bedCountsOverridesVersion,
    bedRelievingNotesByToTeam: deepCloneSnapshotValue(state.bedRelievingNotesByToTeam),
    bedRelievingNotesVersion: state.bedRelievingNotesVersion,
    therapistAllocations: deepCloneSnapshotValue(state.therapistAllocations),
    pcaAllocations: deepCloneSnapshotValue(state.pcaAllocations),
    pendingPCAFTEPerTeam: deepCloneSnapshotValue(state.pendingPCAFTEPerTeam),
    bedAllocations: deepCloneSnapshotValue(state.bedAllocations),
    calculations: deepCloneSnapshotValue(state.calculations),
    currentStep: state.currentStep,
    stepStatus: deepCloneSnapshotValue(state.stepStatus),
    initializedSteps: new Set(state.initializedSteps),
    step2Result: deepCloneSnapshotValue(state.step2Result),
    hasSavedAllocations: state.hasSavedAllocations,
    pcaAllocationErrors: deepCloneSnapshotValue(state.pcaAllocationErrors),
    tieBreakDecisions: deepCloneSnapshotValue(state.tieBreakDecisions),
  }
}

export function scheduleDomainReducer(state: ScheduleDomainState, action: ScheduleDomainAction): ScheduleDomainState {
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
    case 'setStaffOverrides': {
      const nextVal = applySetStateAction(state.staffOverrides, action.value)
      return {
        ...state,
        staffOverrides: nextVal,
        staffOverridesVersion: state.staffOverridesVersion + 1,
      }
    }
    case 'setSavedOverrides': {
      const nextVal = applySetStateAction(state.savedOverrides, action.value)
      return {
        ...state,
        savedOverrides: nextVal,
        savedOverridesVersion: state.staffOverridesVersion,
      }
    }
    case 'setBedCountsOverridesByTeam': {
      const nextVal = applySetStateAction(state.bedCountsOverridesByTeam, action.value)
      return {
        ...state,
        bedCountsOverridesByTeam: nextVal,
        bedCountsOverridesVersion: state.bedCountsOverridesVersion + 1,
      }
    }
    case 'setSavedBedCountsOverridesByTeam': {
      const nextVal = applySetStateAction(state.savedBedCountsOverridesByTeam, action.value)
      return {
        ...state,
        savedBedCountsOverridesByTeam: nextVal,
        savedBedCountsOverridesVersion: state.bedCountsOverridesVersion,
      }
    }
    case 'setBedRelievingNotesByToTeam': {
      const nextVal = applySetStateAction(state.bedRelievingNotesByToTeam, action.value)
      return {
        ...state,
        bedRelievingNotesByToTeam: nextVal,
        bedRelievingNotesVersion: state.bedRelievingNotesVersion + 1,
      }
    }
    case 'setSavedBedRelievingNotesByToTeam': {
      const nextVal = applySetStateAction(state.savedBedRelievingNotesByToTeam, action.value)
      return {
        ...state,
        savedBedRelievingNotesByToTeam: nextVal,
        savedBedRelievingNotesVersion: state.bedRelievingNotesVersion,
      }
    }
    case 'pushUndoEntry': {
      return {
        ...state,
        undoStack: pushHistoryEntry(state.undoStack, action.entry),
        ...(action.clearRedo ? { redoStack: [] } : {}),
      }
    }
    case 'clearUndoRedoHistory': {
      if (state.undoStack.length === 0 && state.redoStack.length === 0) return state
      return {
        ...state,
        undoStack: [],
        redoStack: [],
      }
    }
    case 'restoreFromHistory': {
      const s = action.snapshot
      return {
        ...state,
        staffOverrides: deepCloneSnapshotValue(s.staffOverrides),
        staffOverridesVersion: s.staffOverridesVersion,
        bedCountsOverridesByTeam: deepCloneSnapshotValue(s.bedCountsOverridesByTeam),
        bedCountsOverridesVersion: s.bedCountsOverridesVersion,
        bedRelievingNotesByToTeam: deepCloneSnapshotValue(s.bedRelievingNotesByToTeam),
        bedRelievingNotesVersion: s.bedRelievingNotesVersion,
        therapistAllocations: deepCloneSnapshotValue(s.therapistAllocations),
        pcaAllocations: deepCloneSnapshotValue(s.pcaAllocations),
        pendingPCAFTEPerTeam: deepCloneSnapshotValue(s.pendingPCAFTEPerTeam),
        bedAllocations: deepCloneSnapshotValue(s.bedAllocations),
        calculations: deepCloneSnapshotValue(s.calculations),
        currentStep: s.currentStep,
        stepStatus: deepCloneSnapshotValue(s.stepStatus),
        initializedSteps: new Set(s.initializedSteps),
        step2Result: deepCloneSnapshotValue(s.step2Result),
        hasSavedAllocations: s.hasSavedAllocations,
        pcaAllocationErrors: deepCloneSnapshotValue(s.pcaAllocationErrors),
        tieBreakDecisions: deepCloneSnapshotValue(s.tieBreakDecisions),
        undoStack: action.undoStack,
        redoStack: action.redoStack,
      }
    }
    default:
      return state
  }
}

export function createInitialScheduleDomainState(defaultDate: Date): ScheduleDomainState {
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
    currentScheduleUpdatedAt: null,
    staffOverrides: {},
    savedOverrides: {},
    saving: false,
    scheduleLoadedForDate: null,
    hasSavedAllocations: false,

    bedCountsOverridesByTeam: {},
    savedBedCountsOverridesByTeam: {},
    bedRelievingNotesByToTeam: {},
    savedBedRelievingNotesByToTeam: {},
    staffOverridesVersion: 0,
    savedOverridesVersion: 0,
    bedCountsOverridesVersion: 0,
    savedBedCountsOverridesVersion: 0,
    bedRelievingNotesVersion: 0,
    savedBedRelievingNotesVersion: 0,
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
    undoStack: [],
    redoStack: [],
  }
}
