'use client'

import { useState, useEffect, useRef, Fragment, useCallback, Suspense } from 'react'
import { DndContext, DragOverlay, DragEndEvent, DragStartEvent, DragMoveEvent, Active } from '@dnd-kit/core'
import { Team, Weekday, LeaveType } from '@/types/staff'
import { TherapistAllocation, PCAAllocation, BedAllocation, ScheduleCalculations, AllocationTracker } from '@/types/schedule'
import { Staff } from '@/types/staff'
import { TeamColumn } from '@/components/allocation/TeamColumn'
import { StaffPool } from '@/components/allocation/StaffPool'
import { TherapistBlock } from '@/components/allocation/TherapistBlock'
import { PCABlock } from '@/components/allocation/PCABlock'
import { BedBlock } from '@/components/allocation/BedBlock'
import { LeaveBlock } from '@/components/allocation/LeaveBlock'
import { CalculationBlock } from '@/components/allocation/CalculationBlock'
import { PCACalculationBlock } from '@/components/allocation/PCACalculationBlock'
import { SummaryColumn } from '@/components/allocation/SummaryColumn'
import { Button } from '@/components/ui/button'
import { StaffEditDialog } from '@/components/allocation/StaffEditDialog'
import { TieBreakDialog } from '@/components/allocation/TieBreakDialog'
import { StepIndicator } from '@/components/allocation/StepIndicator'
import { FloatingPCAConfigDialog } from '@/components/allocation/FloatingPCAConfigDialog'
import { NonFloatingSubstitutionDialog } from '@/components/allocation/NonFloatingSubstitutionDialog'
import { SpecialProgramOverrideDialog } from '@/components/allocation/SpecialProgramOverrideDialog'
import { SlotSelectionPopover } from '@/components/allocation/SlotSelectionPopover'
import { Save, Calendar, MoreVertical, RefreshCw, RotateCcw, X, ArrowLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CalendarGrid } from '@/components/ui/calendar-grid'
import { getHongKongHolidays } from '@/lib/utils/hongKongHolidays'
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
} from '@/lib/db/types'
import { useAllocationSync } from '@/lib/hooks/useAllocationSync'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

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
  const [selectedDate, setSelectedDate] = useState<Date>(DEFAULT_DATE)
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
  const [staff, setStaff] = useState<Staff[]>([])
  const [inactiveStaff, setInactiveStaff] = useState<Staff[]>([])
  const [bufferStaff, setBufferStaff] = useState<Staff[]>([])
  const [specialPrograms, setSpecialPrograms] = useState<SpecialProgram[]>([])
  const [sptAllocations, setSptAllocations] = useState<SPTAllocation[]>([])
  const [wards, setWards] = useState<{ name: string; total_beds: number; team_assignments: Record<Team, number>; team_assignment_portions?: Record<Team, string> }[]>([])
  const [pcaPreferences, setPcaPreferences] = useState<PCAPreference[]>([])
  const [loading, setLoading] = useState(false)
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
  // Store staff leave/FTE overrides for the current date
  const [staffOverrides, setStaffOverrides] = useState<Record<string, {
    leaveType: LeaveType | null;
    fteRemaining: number;
    team?: Team;
    fteSubtraction?: number;
    availableSlots?: number[];
    // REMOVED: invalidSlot, leaveComebackTime, isLeave
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
    // REMOVED: invalidSlot, leaveComebackTime, isLeave
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
    slotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null };
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
  }>>({})
  const [saving, setSaving] = useState(false)
  const [scheduleLoadedForDate, setScheduleLoadedForDate] = useState<string | null>(null) // Track which date's schedule is loaded
  const [hasSavedAllocations, setHasSavedAllocations] = useState(false) // Track if we loaded allocations from DB (to skip regeneration)
  const [editableBeds, setEditableBeds] = useState<Record<Team, number>>({
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
  })
  const [pendingPCAFTEPerTeam, setPendingPCAFTEPerTeam] = useState<Record<Team, number>>({
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
  })
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set())
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map())
  const calendarButtonRef = useRef<HTMLButtonElement>(null)
  const calendarPopoverRef = useRef<HTMLDivElement>(null)
  const [savedEditableBeds, setSavedEditableBeds] = useState<Record<Team, number>>({
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
  })
  // Step-wise allocation workflow state
  const [currentStep, setCurrentStep] = useState<string>('leave-fte')
  const [stepStatus, setStepStatus] = useState<Record<string, 'pending' | 'completed' | 'modified'>>({
    'leave-fte': 'pending',
    'therapist-pca': 'pending',
    'floating-pca': 'pending',
    'bed-relieving': 'pending',
    'review': 'pending',
  })
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
  const [specialProgramOverrideResolver, setSpecialProgramOverrideResolver] = useState<((overrides: Record<string, { specialProgramOverrides?: Array<{ programId: string; therapistId?: string; pcaId?: string; slots?: number[]; therapistFTESubtraction?: number; pcaFTESubtraction?: number; drmAddOn?: number }> }>) => void) | null>(null)
  const specialProgramOverrideResolverRef = useRef<((overrides: Record<string, { specialProgramOverrides?: Array<{ programId: string; therapistId?: string; pcaId?: string; slots?: number[]; therapistFTESubtraction?: number; pcaFTESubtraction?: number; drmAddOn?: number }> }>) => void) | null>(null)
  
  // Keep ref in sync with state
  useEffect(() => {
    specialProgramOverrideResolverRef.current = specialProgramOverrideResolver
  }, [specialProgramOverrideResolver])
  
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
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadAllData()
    loadDatesWithData()
  }, [])
  // Check for return path from history page
  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') {
      const returnPath = sessionStorage.getItem('scheduleReturnPath')
      setShowBackButton(!!returnPath)
    }
  }, [])


  // Load schedule when date changes OR when staff becomes available (initial load)
  useEffect(() => {
    // Use local date components to avoid timezone issues
    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    // Only load if staff is available AND we haven't loaded this date's schedule yet
    if (staff.length > 0 && scheduleLoadedForDate !== dateStr) {
      setHasSavedAllocations(false) // Reset when changing date
      loadScheduleForDate(selectedDate).then((result) => {
        setScheduleLoadedForDate(dateStr) // Mark this date's schedule as loaded
        if (staff.length > 0 && specialPrograms.length >= 0 && sptAllocations.length >= 0) {
          // If we have saved PCA allocations, use them directly instead of regenerating
          const resultAny = result as any
          if (resultAny && resultAny.pcaAllocs && resultAny.pcaAllocs.length > 0) {
            // Use saved allocations directly - no need to re-run algorithm
            useSavedAllocations(resultAny.therapistAllocs, resultAny.pcaAllocs, resultAny.overrides)
            // Mark steps as initialized if data exists
            setInitializedSteps(new Set(['therapist-pca', 'floating-pca', 'bed-relieving']))
            
            // Determine which steps are completed based on data existence
            const hasLeaveData = resultAny.overrides && Object.keys(resultAny.overrides).length > 0
            const hasTherapistData = resultAny.therapistAllocs && resultAny.therapistAllocs.length > 0
            const hasPCAData = resultAny.pcaAllocs && resultAny.pcaAllocs.length > 0
            
            // Mark steps as completed if we have saved data
            const newStepStatus = {
              'leave-fte': hasLeaveData ? 'completed' as const : 'pending' as const,
              'therapist-pca': hasTherapistData ? 'completed' as const : 'pending' as const,
              'floating-pca': hasPCAData ? 'completed' as const : 'pending' as const,
              'bed-relieving': 'completed' as const, // Bed allocations are always calculated
              'review': 'pending' as const,
            }
            
            setStepStatus(newStepStatus)
            
            // Check if all steps are completed
            const allStepsCompleted = 
              hasLeaveData &&
              hasTherapistData &&
              hasPCAData
            
            if (allStepsCompleted) {
              // Go directly to Review step
              setCurrentStep('review')
              setStepStatus(prev => ({ ...prev, 'review': 'completed' }))
            }
          } else if (result && result.overrides) {
            // No saved PCA allocations, generate new ones
            generateAllocationsWithOverrides(result.overrides)
          } else {
            generateAllocations()
          }
        }
      })
    }
  }, [selectedDate, staff.length]) // Added staff.length to re-run when staff becomes available

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
      // For fresh schedules with no overrides, auto-generate using old method (backward compatible)
      generateAllocationsWithOverrides(staffOverrides)
    }
  }, [staff, specialPrograms, sptAllocations, wards, pcaPreferences, scheduleLoadedForDate, hasSavedAllocations])
  // NOTE: staffOverrides intentionally removed from dependencies - step-wise workflow controls regeneration

  // Load dates that have schedule data
  const loadDatesWithData = async () => {
    try {
      // Query all schedules
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('daily_schedules')
        .select('id, date')
        .order('date', { ascending: false })

      if (scheduleError) {
        console.error('Error loading schedules:', scheduleError)
        return
      }

      if (!scheduleData || scheduleData.length === 0) {
        setDatesWithData(new Set())
        return
      }

      // For each schedule, check which allocation tables have data
      const scheduleIds = scheduleData.map(s => s.id)
      
      const [therapistData, pcaData, bedData] = await Promise.all([
        supabase
          .from('schedule_therapist_allocations')
          .select('schedule_id')
          .in('schedule_id', scheduleIds),
        supabase
          .from('schedule_pca_allocations')
          .select('schedule_id')
          .in('schedule_id', scheduleIds),
        supabase
          .from('schedule_bed_allocations')
          .select('schedule_id')
          .in('schedule_id', scheduleIds)
      ])

      // Create sets of schedule IDs that have each type of allocation
      const hasTherapist = new Set(therapistData.data?.map(a => a.schedule_id) || [])
      const hasPCA = new Set(pcaData.data?.map(a => a.schedule_id) || [])
      const hasBed = new Set(bedData.data?.map(a => a.schedule_id) || [])

      // Filter schedules to only those with at least one type of allocation
      const schedulesWithData = scheduleData.filter(s => 
        hasTherapist.has(s.id) || hasPCA.has(s.id) || hasBed.has(s.id)
      )

      // Build Set of date strings
      const dateSet = new Set<string>(schedulesWithData.map(s => s.date))
      setDatesWithData(dateSet)
    } catch (error) {
      console.error('Error loading dates with data:', error)
    }
  }

  // Load holidays when calendar opens
  useEffect(() => {
    if (calendarOpen) {
      loadDatesWithData()
      // Generate holidays for current year and next year
      const currentYear = new Date().getFullYear()
      const holidaysMap = new Map<string, string>()
      const currentYearHolidays = getHongKongHolidays(currentYear)
      const nextYearHolidays = getHongKongHolidays(currentYear + 1)
      currentYearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      nextYearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      setHolidays(holidaysMap)
    }
  }, [calendarOpen])

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
        .select('*')
        .eq('status', 'active')  // Load active staff for allocations
        .order('rank', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('staff')
        .select('*')
        .eq('status', 'inactive')  // Load inactive staff for inactive pool
        .order('rank', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('staff')
        .select('*')
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
    const { data } = await supabase.from('special_programs').select('*')
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

  // Load schedule for date and restore saved overrides
  const loadScheduleForDate = async (date: Date): Promise<{ scheduleId: string; overrides: Record<string, { leaveType: LeaveType | null; fteRemaining: number; fteSubtraction?: number; availableSlots?: number[] }> } | null> => {
    // Use local date components to avoid timezone issues
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    
    // Get or create schedule for this date
    // First try with tie_break_decisions column, fall back to without it if column doesn't exist
    let { data: scheduleData, error: queryError } = await supabase
      .from('daily_schedules')
      .select('id, is_tentative, tie_break_decisions')
      .eq('date', dateStr)
      .maybeSingle() as { data: { id: string; is_tentative: boolean; tie_break_decisions?: Record<string, string> } | null; error: any }
    
    // If query failed due to missing column, retry without tie_break_decisions
    if (queryError && queryError.message?.includes('tie_break_decisions')) {
      const fallbackResult = await supabase
        .from('daily_schedules')
        .select('id, is_tentative')
        .eq('date', dateStr)
        .maybeSingle()
      scheduleData = fallbackResult.data as { id: string; is_tentative: boolean; tie_break_decisions?: Record<string, string> } | null
      queryError = fallbackResult.error
    }
    
    let scheduleId: string
    if (!scheduleData) {
      // Create new schedule if it doesn't exist
      const { data: newSchedule, error } = await supabase
        .from('daily_schedules')
        .insert({ date: dateStr, is_tentative: true })
        .select('id')
        .single()
      if (error) {
        console.error('Error creating schedule:', error)
        return null
      }
      scheduleId = newSchedule?.id || ''
    } else {
      scheduleId = scheduleData.id
      // Ensure schedule is tentative (required by RLS policy)
      if (!scheduleData.is_tentative) {
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
    if (scheduleData?.tie_break_decisions) {
      setTieBreakDecisions(scheduleData.tie_break_decisions as Record<string, Team>)
    } else {
      setTieBreakDecisions({})
    }
    
    // Load therapist allocations
    const { data: therapistAllocs } = await supabase
      .from('schedule_therapist_allocations')
      .select('*')
      .eq('schedule_id', scheduleId)
    
    // Load PCA allocations
    const { data: pcaAllocs } = await supabase
      .from('schedule_pca_allocations')
      .select('*')
      .eq('schedule_id', scheduleId)
    
    
    // Build overrides from saved allocations
    // Use centralized fromDbLeaveType from lib/db/types.ts for type conversion
    const overrides: Record<string, { leaveType: LeaveType | null; fteRemaining: number; fteSubtraction?: number; availableSlots?: number[]; invalidSlot?: number; leaveComebackTime?: string; isLeave?: boolean }> = {}
    
    therapistAllocs?.forEach(alloc => {
      if (alloc.leave_type !== null || alloc.fte_therapist !== 1) {
        const fte = parseFloat(alloc.fte_therapist.toString())
        // Use centralized type conversion that handles manual_override_note
        const leaveType = fromDbLeaveType(alloc.leave_type as any, fte, alloc.manual_override_note)
        overrides[alloc.staff_id] = {
          leaveType: leaveType,
          fteRemaining: fte
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
            ? parseFloat(alloc.fte_pca.toString())  // On leave: use stored FTE
            : (isSpecialProgramPCA ? 1.0 : parseFloat(alloc.fte_pca.toString()))  // Special program: use base FTE 1.0
          // Use centralized type conversion from lib/db/types.ts
          const override: { leaveType: LeaveType | null; fteRemaining: number; fteSubtraction?: number; availableSlots?: number[]; invalidSlot?: number; leaveComebackTime?: string; isLeave?: boolean } = {
            leaveType: fromDbLeaveType(alloc.leave_type as any, fte, null),
            fteRemaining: fte
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
    
    setStaffOverrides(overrides)
    setSavedOverrides(overrides) // Track what's saved
    
    // Return pcaAllocs so we can use saved allocations directly instead of regenerating
    return { scheduleId, overrides, pcaAllocs: pcaAllocs || [], therapistAllocs: therapistAllocs || [] } as any
  }

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
    
    const overallBedsPerPT = totalPTOnDutyAllTeams > 0 ? totalBedsAllTeams / totalPTOnDutyAllTeams : 0
    
    TEAMS.forEach(team => {
      const ptPerTeam = therapistByTeam[team].reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        // Use staffOverrides for current FTE, fallback to alloc.fte_therapist
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_therapist || 0)
        const hasFTE = currentFTE > 0
        return sum + (isTherapist && hasFTE ? currentFTE : 0)
      }, 0)
      
      const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
      const calculatedBeds = teamWards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
      const totalBedsDesignated = editableBeds[team] > 0 ? editableBeds[team] : calculatedBeds
      const expectedBeds = overallBedsPerPT * ptPerTeam
      bedsForRelieving[team] = expectedBeds - totalBedsDesignated
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
    const bedsPerPCA = totalPCAOnDuty > 0 ? totalBedsAllTeams / totalPCAOnDuty : 0
    
    const scheduleCalcs: Record<Team, ScheduleCalculations | null> = {
      FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null
    }
    
    TEAMS.forEach(team => {
      const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
      const calculatedBeds = teamWards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
      const totalBedsDesignated = editableBeds[team] > 0 ? editableBeds[team] : calculatedBeds
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
        ? (totalBedsAllTeams / totalPTOnDutyAllTeams) * ptPerTeam 
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
  }, [pcaAllocations, therapistAllocations, staffOverrides, wards, editableBeds, selectedDate, specialPrograms, staff, currentStep])

  // Auto-recalculate when allocations change (e.g., after Step 2 algo)
  useEffect(() => {
    const hasAllocations = Object.keys(pcaAllocations).some(team => pcaAllocations[team as Team]?.length > 0)
    if (hasAllocations) {
      recalculateScheduleCalculations()
    }
  }, [therapistAllocations, pcaAllocations, recalculateScheduleCalculations])

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
  })

  // Use saved allocations directly from database without regenerating
  const useSavedAllocations = (therapistAllocs: any[], pcaAllocs: any[], overrides: Record<string, any>) => {
    setLoading(true)
    
    // Build therapist allocations by team
    const therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = {
      FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
    }
    
    therapistAllocs.forEach((alloc: any) => {
      const staffMember = staff.find(s => s.id === alloc.staff_id)
      if (staffMember && alloc.team) {
        therapistByTeam[alloc.team as Team].push({
          ...alloc,
          staff: staffMember
        })
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
    
    // Build PCA allocations by team - handle floating PCAs that may appear in multiple teams
    const pcaByTeam: Record<Team, (PCAAllocation & { staff: Staff })[]> = {
      FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
    }
    
    pcaAllocs.forEach((alloc: any) => {
      const staffMember = staff.find(s => s.id === alloc.staff_id)
      if (staffMember) {
        const allocationWithStaff = { ...alloc, staff: staffMember }
        
        // Add to primary team
        if (alloc.team) {
          pcaByTeam[alloc.team as Team].push(allocationWithStaff)
        }
        
        // For floating PCAs, also add to teams they have slots assigned to
        const slotTeams = new Set<Team>()
        if (alloc.slot1 && alloc.slot1 !== alloc.team) slotTeams.add(alloc.slot1 as Team)
        if (alloc.slot2 && alloc.slot2 !== alloc.team) slotTeams.add(alloc.slot2 as Team)
        if (alloc.slot3 && alloc.slot3 !== alloc.team) slotTeams.add(alloc.slot3 as Team)
        if (alloc.slot4 && alloc.slot4 !== alloc.team) slotTeams.add(alloc.slot4 as Team)
        
        slotTeams.forEach(slotTeam => {
          pcaByTeam[slotTeam].push(allocationWithStaff)
        })
      }
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
    
    // Calculate pending PCA FTE per team from saved allocations
    // This is the unmet PCA demand that wasn't filled
    const calculatedPendingFTE: Record<Team, number> = {
      FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
    }
    // For now, set pending to 0 since saved allocations represent the final state
    // In real implementation, we'd need to store/load the pending values too
    setPendingPCAFTEPerTeam(calculatedPendingFTE)
    
    // Calculate bed allocations based on therapist data
    const totalBedsAllTeams = wards.reduce((sum, ward) => sum + ward.total_beds, 0)
    const totalPTOnDutyAllTeams = TEAMS.reduce((sum, team) => {
      return sum + therapistByTeam[team].reduce((teamSum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const hasFTE = (alloc.fte_therapist || 0) > 0
        return teamSum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
      }, 0)
    }, 0)
    
    const bedsForRelieving: Record<Team, number> = {
      FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
    }
    
    const overallBedsPerPT = totalPTOnDutyAllTeams > 0 ? totalBedsAllTeams / totalPTOnDutyAllTeams : 0
    
    TEAMS.forEach(team => {
      const ptPerTeam = therapistByTeam[team].reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const hasFTE = (alloc.fte_therapist || 0) > 0
        return sum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
      }, 0)
      
      const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
      const calculatedBeds = teamWards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
      
      if (editableBeds[team] === 0 && calculatedBeds > 0) {
        setEditableBeds(prev => ({ ...prev, [team]: calculatedBeds }))
      }
      
      const totalBedsDesignated = editableBeds[team] > 0 ? editableBeds[team] : calculatedBeds
      const expectedBeds = overallBedsPerPT * ptPerTeam
      bedsForRelieving[team] = expectedBeds - totalBedsDesignated
    })
    
    const bedContext: BedAllocationContext = {
      bedsForRelieving,
      wards: wards.map(w => ({ name: w.name, team_assignments: w.team_assignments })),
    }
    
    const bedResult = allocateBeds(bedContext)
    setBedAllocations(bedResult.allocations)
    
    // Calculate schedule calculations for Block 5 and 6
    const scheduleCalcs: Record<Team, ScheduleCalculations | null> = {
      FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null
    }
    
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
    
    // Calculate totals for PCA formulas
    // CRITICAL: Use totalPCAOnDuty (from staff DB) for STABLE requirement calculation
    // This ensures avg PCA/team doesn't fluctuate as floating PCAs get assigned/unassigned
    const totalPCAOnDuty = staff
      .filter(s => s.rank === 'PCA')
      .reduce((sum, s) => {
        const overrideFTE = staffOverrides[s.id]?.fteRemaining
        // For buffer staff, use buffer_fte as base
        const isBufferStaff = s.status === 'buffer'
        const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
        const isOnLeave = staffOverrides[s.id]?.leaveType && staffOverrides[s.id]?.fteRemaining === 0
        return sum + (isOnLeave ? 0 : (overrideFTE !== undefined ? overrideFTE : baseFTE))
      }, 0)
    
    // Also calculate totalPCAFromAllocations for reference/debugging
    const totalPCAFromAllocations = TEAMS.reduce((sum, team) => {
      return sum + pcaByTeam[team].reduce((teamSum, alloc) => {
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
        return teamSum + currentFTE
    }, 0)
    }, 0)
    
    // Use totalPCAOnDuty (stable) for bedsPerPCA calculation
    const bedsPerPCA = totalPCAOnDuty > 0 ? totalBedsAllTeams / totalPCAOnDuty : 0
    
    TEAMS.forEach(team => {
      const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
      const calculatedBeds = teamWards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
      const totalBedsDesignated = editableBeds[team] > 0 ? editableBeds[team] : calculatedBeds
      const designatedWards = teamWards.map(w => formatWardName(w, team))
      
      const teamTherapists = therapistByTeam[team]
      const ptPerTeam = teamTherapists.reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const hasFTE = (alloc.fte_therapist || 0) > 0
        return sum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
      }, 0)
      
      const bedsPerPT = ptPerTeam > 0 ? totalBedsDesignated / ptPerTeam : 0
      
      const teamPCAs = pcaByTeam[team]
      // Use staffOverrides if available to get the current FTE
      const pcaOnDuty = teamPCAs.reduce((sum, alloc) => {
        const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
        const currentFTE = overrideFTE !== undefined ? overrideFTE : (alloc.fte_pca || 0)
        return sum + currentFTE
      }, 0)
      const totalPTPerPCA = pcaOnDuty > 0 ? ptPerTeam / pcaOnDuty : 0
      
      // Calculate averagePCAPerTeam using totalPCAOnDuty (from staff DB) for STABLE value
      // This ensures avg PCA/team doesn't fluctuate during step transitions
      const averagePCAPerTeam = totalPTOnDutyAllTeams > 0
        ? (ptPerTeam * totalPCAOnDuty) / totalPTOnDutyAllTeams
        : (totalPCAOnDuty / TEAMS.length) // Fallback to equal distribution
      
      const expectedBedsPerTeam = totalPTOnDutyAllTeams > 0 
        ? (totalBedsAllTeams / totalPTOnDutyAllTeams) * ptPerTeam 
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
      // Transform staff data for algorithms, applying overrides if they exist
      const staffData: StaffData[] = staff.map(s => {
        const override = overrides[s.id]
        const transformed = {
          id: s.id,
          name: s.name,
          rank: s.rank,
          team: override?.team ?? s.team, // Use team from override if present, otherwise use staff's default team
          special_program: s.special_program,
          fte_therapist: override ? override.fteRemaining : 1, // Default to 1 if no override
          leave_type: override ? override.leaveType : null,
          is_available: override ? (override.fteRemaining > 0) : true, // Default to available
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
      // True-FTE remaining for allocation = (availableSlots.length * 0.25) - specialProgramFTESubtraction (calculated during allocation)
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
      const weekday = getWeekday(selectedDate)
      const drmProgram = specialPrograms.find(p => p.name === 'DRM')
      const drmPcaFteAddon = 0.4 // Fixed add-on value for DRM program
      
      if (drmProgram && drmProgram.weekdays.includes(weekday)) {
        // Add fixed 0.4 FTE to DRO team's average PCA (this is an add-on, not subtraction)
        // This increases the required PCA for DRO team, which the allocation algorithm will consider
        rawAveragePCAPerTeam['DRO'] += drmPcaFteAddon
        averagePCAPerTeam['DRO'] += drmPcaFteAddon
      }

      // Tie-breaking callback for PCA allocation
      const handleTieBreak = async (teams: Team[], pendingFTE: number): Promise<Team> => {
        // Create a unique key for this tie-breaker situation
        const sortedTeams = [...teams].sort().join(',')
        const tieBreakKey = `${sortedTeams}:${pendingFTE.toFixed(4)}`
        
        // Check if we have a stored decision for this tie-breaker
        if (tieBreakDecisions[tieBreakKey]) {
          return tieBreakDecisions[tieBreakKey]
        }
        
        // In step 1, we should NOT prompt for tie-breakers
        // - With loaded data: allocations are already done, just recalculating values
        // - With fresh data: allocation shouldn't run yet (wait until step 2)
        // If no stored decision exists, use alphabetical order to avoid prompting user
        if (currentStep === 'leave-fte') {
          // Return first team alphabetically to avoid prompting
          return sortedTeams.split(',')[0] as Team
        }
        
        // No stored decision - ask the user
        return new Promise((resolve) => {
          setTieBreakTeams(teams)
          setTieBreakPendingFTE(pendingFTE)
          const resolver = (selectedTeam: Team) => {
            // Store the decision using functional update to avoid stale closure
            setTieBreakDecisions((prevDecisions) => {
              const newDecisions = { ...prevDecisions, [tieBreakKey]: selectedTeam }
              return newDecisions
            })
            resolve(selectedTeam)
          }
          // Wrap in arrow function to prevent React from treating resolver as a functional update
          setTieBreakResolver(() => resolver)
          tieBreakResolverRef.current = resolver
          setTieBreakDialogOpen(true)
        })
      }

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
        onTieBreak: handleTieBreak,
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

      // Store pending PCA FTE per team for unmet needs tracking
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
        const calculatedBeds = teamWards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
        // Initialize editableBeds if not set
        if (editableBeds[team] === 0 && calculatedBeds > 0) {
          setEditableBeds(prev => ({ ...prev, [team]: calculatedBeds }))
        }
        const totalBedsDesignated = editableBeds[team] > 0 ? editableBeds[team] : calculatedBeds
        
        // Expected beds for this team based on overall beds per PT ratio
        const expectedBeds = overallBedsPerPT * ptPerTeam
        // Relieving beds = expected beds - actual designated beds
        bedsForRelieving[team] = expectedBeds - totalBedsDesignated
      })

      const bedContext: BedAllocationContext = {
        bedsForRelieving,
        wards: wards.map(w => ({ name: w.name, team_assignments: w.team_assignments })),
      }

      const bedResult = allocateBeds(bedContext)
      setBedAllocations(bedResult.allocations)

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
        const calculatedBeds = teamWards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
        // Use editable beds if set, otherwise use calculated designated beds
        // Initialize editableBeds if not set
        if (editableBeds[team] === 0 && calculatedBeds > 0) {
          setEditableBeds(prev => ({ ...prev, [team]: calculatedBeds }))
        }
        const totalBedsDesignated = editableBeds[team] > 0 ? editableBeds[team] : calculatedBeds
        
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
          fte_pca: baseFTERemaining,
          leave_type: override?.leaveType || null,
          is_available: baseFTERemaining > 0,
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
      const staffData: StaffData[] = staff.map(s => {
        const override = overrides[s.id]
        // For buffer staff, use buffer_fte as base FTE
        const isBufferStaff = s.status === 'buffer'
        const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
        return {
          id: s.id,
          name: s.name,
          rank: s.rank,
          team: override?.team ?? s.team, // Use team from override if present
          special_program: s.special_program,
          fte_therapist: override ? override.fteRemaining : baseFTE,
          leave_type: override ? override.leaveType : null,
          is_available: override ? (override.fteRemaining > 0) : true,
          availableSlots: override?.availableSlots,
        }
      })

      // Apply special program overrides: add substituted therapists to program.staff_ids
      const modifiedSpecialPrograms = specialPrograms.map(program => {
        const programOverrides: Array<{ staffId: string; therapistId?: string; therapistFTESubtraction?: number }> = []
        
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
          }
        })
        
        if (programOverrides.length === 0) {
          return program // No substitutions for this program
        }
        
        // Create modified program with substituted therapists added to staff_ids
        const modifiedProgram = { ...program }
        const weekday = getWeekday(selectedDate)
        
        // Add substituted therapists to staff_ids if not already present
        programOverrides.forEach(override => {
          if (!modifiedProgram.staff_ids.includes(override.therapistId!)) {
            modifiedProgram.staff_ids = [...modifiedProgram.staff_ids, override.therapistId!]
          }
          
          // Add FTE subtraction for substituted therapist
          if (!modifiedProgram.fte_subtraction[override.therapistId!]) {
            modifiedProgram.fte_subtraction[override.therapistId!] = {}
          }
          if (override.therapistFTESubtraction !== undefined) {
            modifiedProgram.fte_subtraction[override.therapistId!][weekday] = override.therapistFTESubtraction
          }
        })
        
        return modifiedProgram
      })

      // Generate therapist allocations
      // Include SPT allocation in step 2 when "Initialize Algo" is clicked
      const therapistContext: AllocationContext = {
        date: selectedDate,
        previousSchedule: null,
        staff: staffData,
        specialPrograms: modifiedSpecialPrograms, // Use modified programs with substitutions
        sptAllocations,
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
      const weekday = getWeekday(selectedDate)
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
        specialPrograms,
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

    const overallBedsPerPT = totalPTOnDutyAllTeams > 0 ? totalBedsAllTeams / totalPTOnDutyAllTeams : 0

    TEAMS.forEach(team => {
      const ptPerTeam = therapistAllocations[team].reduce((sum, alloc) => {
        const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
        const hasFTE = (alloc.fte_therapist || 0) > 0
        return sum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
      }, 0)

      const teamWards = wards.filter(w => w.team_assignments[team] && w.team_assignments[team] > 0)
      const calculatedBeds = teamWards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
      const totalBedsDesignated = editableBeds[team] > 0 ? editableBeds[team] : calculatedBeds

      const expectedBeds = overallBedsPerPT * ptPerTeam
      bedsForRelieving[team] = expectedBeds - totalBedsDesignated
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
          alert(`Non-floating PCA buffer staff (${names}*) must be assigned to a team before proceeding. Please assign them in Step 2.`)
          return
        }
        
        // Check for active special programs - show override dialog if any exist
        const weekday = getWeekday(selectedDate)
        const activeSpecialPrograms = specialPrograms.filter(p => p.weekdays.includes(weekday))
        
        if (activeSpecialPrograms.length > 0) {
          // Show special program override dialog and wait for user confirmation
          return new Promise<void>((resolve) => {
            const resolver = (overrides: Record<string, { specialProgramOverrides?: Array<{ programId: string; therapistId?: string; pcaId?: string; slots?: number[]; therapistFTESubtraction?: number; pcaFTESubtraction?: number; drmAddOn?: number }> }>) => {
              // #region agent log
              try {
                const pcaOverrideStaffIds = Object.entries(overrides)
                  .filter(([, v]) => (v.specialProgramOverrides ?? []).some(o => !!o.pcaId))
                  .map(([staffId]) => staffId)
                const staffHas = pcaOverrideStaffIds.filter(id => staff.some(s => s.id === id))
                const staffMeta = staffHas.slice(0, 5).map(id => {
                  const s = staff.find(x => x.id === id)
                  return { id, floating: s?.floating, status: (s as any)?.status }
                })
                fetch('http://127.0.0.1:7243/ingest/054248da-79b3-435d-a6ab-d8bae8859cea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'schedule/page.tsx:resolver',message:'SP overrides confirm (PCA) vs current staff state',data:{pcaOverrideStaffIdsCount:pcaOverrideStaffIds.length,staffHasCount:staffHas.length,staffMeta},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              } catch {}
              // #endregion

              // Merge special program overrides into staffOverrides
              const mergedOverrides = { ...staffOverrides }
              Object.entries(overrides).forEach(([staffId, override]) => {
                if (mergedOverrides[staffId]) {
                  mergedOverrides[staffId] = {
                    ...mergedOverrides[staffId],
                    specialProgramOverrides: override.specialProgramOverrides,
                  }
                } else {
                  mergedOverrides[staffId] = {
                    leaveType: null,
                    fteRemaining: 1.0,
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
          alert('Step 2 must be completed before Step 3')
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
          const preservedAllocs = (pcaAllocations[team] || []).filter(alloc => {
            const staffMember = staff.find(s => s.id === alloc.staff_id)
            if (!staffMember) return false
            
            // Keep non-floating PCAs
            if (!staffMember.floating) return true
            
            // Keep floating PCAs that have special_program_ids (allocated to special programs in Step 2)
            if (alloc.special_program_ids && alloc.special_program_ids.length > 0) {
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
        
        // Calculate non-floating PCA assigned per team from CLEANED allocations (not state)
        // Only count non-floating PCA allocations (exclude floating PCA substitutions)
        const nonFloatingPCAAssignedPerTeam: Record<Team, number> = {
          FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
        }
        
        Object.entries(cleanedPcaAllocations).forEach(([team, allocs]) => {
          allocs.forEach(alloc => {
            // Only count non-floating PCA allocations
            const staffMember = staff.find(s => s.id === alloc.staff_id)
            if (!staffMember || staffMember.floating) return
            
            // Calculate slots assigned to this team for this non-floating PCA
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
            nonFloatingPCAAssignedPerTeam[team as Team] += slotsInTeam * 0.25
          })
        })
        
        TEAMS.forEach(team => {
          // Use displayed avg PCA/team from calculations (accounts for CRP -0.4 therapist FTE adjustment for CPPC)
          // This matches what the user sees in Block 6, not the raw value from step2Result
          // For DRO: use the final value (with +0.4 DRM add-on) since the add-on is part of DRO's requirement
          const displayedAvgPCA = calculations[team]?.average_pca_per_team || 0
          
          // Get non-floating PCA assigned (only non-floating, excluding floating substitutions)
          const nonFloatingPCAAssigned = nonFloatingPCAAssignedPerTeam[team] || 0
          
          // Get buffer floating PCA slots assigned (manually assigned in Step 3)
          // After reset, this will be 0, which is correct
          const bufferFloatingFTE = bufferFloatingPCAFTEPerTeam[team] || 0
          
          // Calculate pending: displayedAvg - nonFloating - bufferFloating (subtract FIRST, then round)
          // This ensures mathematical consistency: rounding happens on the actual pending amount, not the requirement
          const rawPending = Math.max(0, displayedAvgPCA - nonFloatingPCAAssigned - bufferFloatingFTE)
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
    // Get the latest overrides - use current state
    let overridesToSave = { ...staffOverrides }
    let scheduleId = currentScheduleId
    
    if (!scheduleId) {
      const result = await loadScheduleForDate(selectedDate)
      if (!result || !result.scheduleId) {
        alert('Error: Could not create schedule. Please try again.')
        return
      }
      scheduleId = result.scheduleId
      // Merge loaded overrides with current overrides (current takes precedence)
      overridesToSave = { ...result.overrides, ...staffOverrides }
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

      // Save all allocations
      const promises: Promise<any>[] = []

      // Build special programs reference for UUID conversion
      const specialProgramsRef: SpecialProgramRef[] = specialPrograms.map(sp => ({ id: sp.id, name: sp.name }))

      for (const item of allocationsToSave) {
        if (item.isTherapist) {
          const alloc = item.alloc as TherapistAllocation | null
          
          // Use centralized type conversion utilities from lib/db/types.ts
          const dbLeaveType = toDbLeaveType(item.leaveType)
          const customLeaveTypeNote = isCustomLeaveType(item.leaveType) ? item.leaveType : null
          
          // Convert special program names to UUIDs if needed
          let programIds = alloc?.special_program_ids || []
          if (programIds.length > 0) {
            // Validate/convert to UUIDs
            const converted = programNamesToIds(programIds, specialProgramsRef)
            programIds = converted || []
          }
          
          // Validate UUIDs before save
          try {
            assertValidSpecialProgramIds(programIds, `therapist ${item.staffId}`)
          } catch (validationError) {
            console.error('Validation error:', validationError)
            programIds = [] // Reset to empty on validation failure
          }
          
          const allocationData = {
            schedule_id: scheduleId,
            staff_id: item.staffId,
            team: item.team,
            fte_therapist: normalizeFTE(item.fteRemaining),
            fte_remaining: normalizeFTE(Math.max(0, 1 - item.fteRemaining)),
            leave_type: dbLeaveType,
            slot1: alloc?.slot1 || item.team,
            slot2: alloc?.slot2 || item.team,
            slot3: alloc?.slot3 || item.team,
            slot4: alloc?.slot4 || item.team,
            special_program_ids: programIds,
            is_substitute_team_head: alloc?.is_substitute_team_head || false,
            spt_slot_display: alloc?.spt_slot_display || null,
            is_manual_override: alloc?.is_manual_override || !!customLeaveTypeNote,
            manual_override_note: customLeaveTypeNote !== null ? customLeaveTypeNote : (alloc?.manual_override_note || null),
          }

          // Check if exists
          const { data: existing, error: checkError } = await supabase
            .from('schedule_therapist_allocations')
            .select('id')
            .eq('schedule_id', scheduleId)
            .eq('staff_id', item.staffId)
            .maybeSingle()

          if (existing) {
            const updatePromise = supabase
              .from('schedule_therapist_allocations')
              .update(allocationData)
              .eq('id', existing.id)
              .select() // Add select to verify update persisted
            promises.push(updatePromise as unknown as Promise<any>)
          } else {
            const insertPromise = supabase
              .from('schedule_therapist_allocations')
              .insert(allocationData)
              .select() // Add select to verify insert succeeded
            promises.push(insertPromise as unknown as Promise<any>)
          }
        } else {
          const alloc = item.alloc as PCAAllocation | null
          
          // Use centralized type conversion utilities from lib/db/types.ts
          const dbLeaveType = toDbLeaveType(item.leaveType)
          
          // Use actual fte_pca value (no longer rounded down) and calculate fte_remaining/slot_assigned
          // Handle both slot_assigned (new) and fte_assigned (old) during migration transition
          const baseFTEPCA = alloc?.fte_pca ?? item.fteRemaining
          const slotAssigned = (alloc as any).slot_assigned ?? (alloc as any).fte_assigned ?? 0
          const fteRemaining = alloc?.fte_remaining ?? Math.max(0, baseFTEPCA - slotAssigned)
          
          // Convert special program names to UUIDs if needed
          let programIds = alloc?.special_program_ids || []
          if (programIds.length > 0) {
            const converted = programNamesToIds(programIds, specialProgramsRef)
            programIds = converted || []
          }
          
          // Validate UUIDs before save
          try {
            assertValidSpecialProgramIds(programIds, `PCA ${item.staffId}`)
          } catch (validationError) {
            console.error('Validation error:', validationError)
            programIds = [] // Reset to empty on validation failure
          }
          
          const override = overridesToSave[item.staffId]
          const allocationData: any = {
            schedule_id: scheduleId,
            staff_id: item.staffId,
            team: item.team,
            fte_pca: normalizeFTE(baseFTEPCA), // Normalized to 2 decimal places
            fte_remaining: normalizeFTE(fteRemaining),
            slot_assigned: normalizeFTE(slotAssigned), // Renamed from fte_assigned - use batch migration to update DB
            leave_type: dbLeaveType,
            slot1: alloc?.slot1 || item.team,
            slot2: alloc?.slot2 || item.team,
            slot3: alloc?.slot3 || item.team,
            slot4: alloc?.slot4 || item.team,
            special_program_ids: programIds,
            // Always include optional fields (null if not set)
            invalid_slot: item.invalidSlot ?? alloc?.invalid_slot ?? null,
            leave_comeback_time: item.leaveComebackTime ?? alloc?.leave_comeback_time ?? null,
            leave_mode: item.isLeave !== undefined 
              ? (item.isLeave ? 'leave' : 'come_back')
              : (alloc?.leave_mode ?? null),
            // Note: fte_subtraction is not stored in database - it's calculated from staffOverrides when needed
          }

          // Check if exists
          const { data: existing, error: checkError } = await supabase
            .from('schedule_pca_allocations')
            .select('id')
            .eq('schedule_id', scheduleId)
            .eq('staff_id', item.staffId)
            .maybeSingle()

          if (existing) {
            const updatePromise = supabase
              .from('schedule_pca_allocations')
              .update(allocationData)
              .eq('id', existing.id)
              .select()
            promises.push(updatePromise as unknown as Promise<any>)
          } else {
            const insertPromise = supabase
              .from('schedule_pca_allocations')
              .insert(allocationData)
              .select()
            promises.push(insertPromise as unknown as Promise<any>)
          }
        }
      }

      const results = await Promise.all(promises)
      
      // Check for errors
      const errors = results.filter(r => r.error)
      if (errors.length > 0) {
        console.error('Errors saving schedule:', errors)
        alert(`Error saving schedule: ${errors[0].error?.message || 'Unknown error'}`)
        setSaving(false)
        return
      }
      
      // Update saved state
      setSavedOverrides({ ...overridesToSave })
      setStaffOverrides({ ...overridesToSave }) // Also update staffOverrides with the merged data
      setSavedEditableBeds({ ...editableBeds }) // Save current bed edits
      
      // Save tie-breaker decisions to database
      if (Object.keys(tieBreakDecisions).length > 0) {
        const { error: tieBreakError } = await supabase
          .from('daily_schedules')
          .update({ tie_break_decisions: tieBreakDecisions })
          .eq('id', scheduleId)
        
        if (tieBreakError) {
          console.error('Error saving tie-breaker decisions:', tieBreakError)
        }
      }
      
      // Log unmet PCA needs (only for past schedules)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const scheduleDate = new Date(selectedDate)
      scheduleDate.setHours(0, 0, 0, 0)
      
      if (scheduleDate <= today) {
        // Check which teams received floating PCA assignments
        const teamsWithFloatingPCA = new Set<Team>()
        
        for (const item of allocationsToSave) {
          if (!item.isTherapist && item.alloc) {
            const alloc = item.alloc as PCAAllocation
            const staffMember = staff.find(s => s.id === item.staffId)
            if (staffMember && staffMember.floating) {
              // This is a floating PCA allocation
              // Add all teams where slots are assigned
              if (alloc.slot1) teamsWithFloatingPCA.add(alloc.slot1)
              if (alloc.slot2) teamsWithFloatingPCA.add(alloc.slot2)
              if (alloc.slot3) teamsWithFloatingPCA.add(alloc.slot3)
              if (alloc.slot4) teamsWithFloatingPCA.add(alloc.slot4)
            }
          }
        }
        
        // Log teams with pending > 0 but no floating PCA assigned
        const unmetNeedsPromises: Promise<any>[] = []
        TEAMS.forEach(team => {
          const pending = pendingPCAFTEPerTeam[team]
          if (pending > 0 && !teamsWithFloatingPCA.has(team)) {
            // Delete existing record for this schedule and team (if any)
            const deletePromise = supabase
              .from('pca_unmet_needs_tracking')
              .delete()
              .eq('schedule_id', scheduleId)
              .eq('team', team)
            
            // Insert new record
            const insertPromise = supabase
              .from('pca_unmet_needs_tracking')
              .insert({
                schedule_id: scheduleId,
                date: formatDateForInput(selectedDate),
                team: team,
                pending_pca_fte: pending,
              })
            
            unmetNeedsPromises.push(deletePromise as unknown as Promise<any>, insertPromise as unknown as Promise<any>)
          } else if (pending <= 0 || teamsWithFloatingPCA.has(team)) {
            // Remove record if pending is now 0 or team received floating PCA
            const deletePromise = supabase
              .from('pca_unmet_needs_tracking')
              .delete()
              .eq('schedule_id', scheduleId)
              .eq('team', team)
            unmetNeedsPromises.push(deletePromise as unknown as Promise<any>)
          }
        })
        
        if (unmetNeedsPromises.length > 0) {
          await Promise.all(unmetNeedsPromises)
        }
      }
      
      alert('Schedule saved successfully!')
    } catch (error) {
      console.error('Error saving schedule:', error)
      alert('Error saving schedule. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Check if there are unsaved changes (staff overrides or bed edits)
  const hasUnsavedChanges = JSON.stringify(staffOverrides) !== JSON.stringify(savedOverrides) ||
    JSON.stringify(editableBeds) !== JSON.stringify(savedEditableBeds)

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = parseDateFromInput(e.target.value)
    if (!isNaN(newDate.getTime())) {
      setSelectedDate(newDate)
      setCalendarOpen(false) // Close calendar dialog when date is selected
    }
  }

  const currentWeekday = getWeekday(selectedDate)
  const weekdayName = WEEKDAY_NAMES[WEEKDAYS.indexOf(currentWeekday)]

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
      
      <div className="container mx-auto p-4">
        {showBackButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const returnPath = sessionStorage.getItem('scheduleReturnPath')
              if (returnPath) {
                sessionStorage.removeItem('scheduleReturnPath')
                router.push(returnPath)
              } else {
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
            <h1 className="text-2xl font-bold">Schedule Allocation</h1>
            <div className="flex items-center space-x-2 relative">
              <button
                ref={calendarButtonRef}
                onClick={() => setCalendarOpen(!calendarOpen)}
                className="cursor-pointer flex items-center"
                type="button"
              >
                <Calendar className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
              <span className="text-lg font-semibold">
                {formatDateDDMMYYYY(selectedDate)} ({weekdayName})
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* Summary Column */}
            {(() => {
              const totalBeds = wards.reduce((sum, ward) => sum + ward.total_beds, 0)
              const totalPT = TEAMS.reduce((sum, team) => {
                return sum + therapistAllocations[team].reduce((teamSum, alloc) => {
                  // Only count therapists (SPT, APPT, RPT) with FTE > 0
                  const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
                  const hasFTE = (alloc.fte_therapist || 0) > 0
                  return teamSum + (isTherapist && hasFTE ? (alloc.fte_therapist || 0) : 0)
                }, 0)
              }, 0)
              const bedsPerPT = totalPT > 0 ? totalBeds / totalPT : 0
              
              return (
                <SummaryColumn
                  totalBeds={totalBeds}
                  totalPTOnDuty={totalPT}
                  bedsPerPT={bedsPerPT}
                />
              )
            })()}
            <div className="flex items-center space-x-2">
              <Button 
                onClick={saveScheduleToDatabase} 
                disabled={saving || !hasUnsavedChanges}
                variant={hasUnsavedChanges ? "default" : "outline"}
                className={hasUnsavedChanges ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Schedule' : 'Saved'}
              </Button>
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

        <div className="flex gap-4">
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

          <div className="flex-1 overflow-x-auto">
            {/* Team Columns */}
            <div className="flex-1">
                {/* Team headers row */}
                <div className="grid grid-cols-8 gap-2 mb-4">
                  {TEAMS.map((team) => (
                    <h2 key={`header-${team}`} className="text-lg font-bold text-center">
                      {team}
                    </h2>
                  ))}
                </div>
                
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
                    {TEAMS.map((team) => (
                      <BedBlock
                        key={`bed-${team}`}
                        team={team}
                        allocations={bedAllocations}
                      />
                    ))}
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
                    {TEAMS.map((team) => (
                      <CalculationBlock
                        key={`calc-${team}`}
                        team={team}
                        calculations={calculations[team]}
                        onBedsChange={(team, newBeds) => {
                          setEditableBeds(prev => ({ ...prev, [team]: newBeds }))
                          // Regenerate allocations with new beds
                          generateAllocationsWithOverrides(staffOverrides)
                          // This will trigger hasUnsavedChanges to become true
                        }}
                      />
                    ))}
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
              </div>
            </div>
          </div>

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

          // Calculate special program FTE subtraction for this staff on current weekday
          // Also collect program names for display
          let specialProgramFTESubtraction = 0
          const specialProgramFTEInfo: { name: string; fteSubtraction: number }[] = []
          const addedProgramIds = new Set<string>() // Track added programs to prevent duplicates
          if (currentWeekday && specialPrograms.length > 0) {
            // Check therapist allocations for special programs
            for (const team of TEAMS) {
              const alloc = therapistAllocations[team].find(a => a.staff_id === editingStaffId)
              if (alloc && alloc.special_program_ids && alloc.special_program_ids.length > 0) {
                alloc.special_program_ids.forEach(programId => {
                  // Skip if we've already processed this program
                  if (addedProgramIds.has(programId)) return
                  
                  const program = specialPrograms.find(p => p.id === programId)
                  if (program && program.weekdays.includes(currentWeekday)) {
                    const staffFTE = program.fte_subtraction[editingStaffId]
                    const subtraction = staffFTE?.[currentWeekday] || 0
                    if (subtraction > 0) {
                      specialProgramFTESubtraction += subtraction
                      specialProgramFTEInfo.push({ name: program.name, fteSubtraction: subtraction })
                      addedProgramIds.add(programId) // Mark as added
                    }
                  }
                })
                break
              }
            }
          }

          // If no override, check allocations
          if (!override) {
            // Check therapist allocations first
            for (const team of TEAMS) {
              const alloc = therapistAllocations[team].find(a => a.staff_id === editingStaffId)
              if (alloc) {
                currentLeaveType = alloc.leave_type
                currentFTERemaining = alloc.fte_therapist || 1.0
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
                const slotAssigned = (allocation as any).slot_assigned ?? (allocation as any).fte_assigned ?? 0
                currentFTERemaining = allocation.fte_pca || ((allocation.fte_remaining ?? 0) + slotAssigned)
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

          return (
            <StaffEditDialog
              open={editDialogOpen}
              onOpenChange={setEditDialogOpen}
              staffName={staffMember.name}
              staffId={editingStaffId}
              staffRank={staffMember.rank}
              currentLeaveType={currentLeaveType}
              currentFTERemaining={currentFTERemaining}
              specialProgramFTESubtraction={specialProgramFTESubtraction}
              specialProgramFTEInfo={specialProgramFTEInfo}
              currentFTESubtraction={currentFTESubtraction}
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
    <Suspense fallback={<div className="container mx-auto p-4">Loading...</div>}>
      <SchedulePageContent />
    </Suspense>
  )
}
