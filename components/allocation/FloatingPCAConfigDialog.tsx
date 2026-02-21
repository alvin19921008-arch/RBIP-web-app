'use client'

import { useState, useEffect, useMemo, useRef, Fragment, useCallback } from 'react'
import { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { PCAData } from '@/lib/algorithms/pcaAllocation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { TeamPendingCard, TIE_BREAKER_COLORS } from './TeamPendingCard'
import { TeamReservationCard } from './TeamReservationCard'
import { TeamAdjacentSlotCard } from './TeamAdjacentSlotCard'
import { ChevronRight, ArrowLeft, ArrowRight, Lightbulb, GripVertical, Check, Circle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { roundDownToQuarter, roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { 
  computeReservations, 
  executeSlotAssignments,
  computeAdjacentSlotReservations,
  TeamReservations,
  SlotAssignment,
  PCASlotReservations,
  AdjacentSlotReservations,
  AdjacentSlotInfo,
} from '@/lib/utils/reservationLogic'
import { 
  allocateFloatingPCA_v2,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/pcaAllocation'
import { AllocationTracker } from '@/types/schedule'
import { Staff } from '@/types/staff'
import {
  recordAssignment,
  getTeamFloor,
  isFloorPCAForTeam,
  getTeamPreferenceInfo,
  finalizeTrackerSummary,
} from '@/lib/utils/floatingPCAHelpers'
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { createClientComponentClient } from '@/lib/supabase/client'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

// Mini-step within Step 3
type MiniStep = '3.0' | '3.1' | '3.2' | '3.3' | '3.4'

interface FloatingPCAConfigDialogProps {
  open: boolean
  teams?: Team[]
  initialPendingFTE: Record<Team, number>  // Raw pending FTE from Step 2
  pcaPreferences: PCAPreference[]  // Team preferences from database
  floatingPCAs: PCAData[]  // Floating PCAs with their current FTE
  existingAllocations: PCAAllocation[]  // Allocations from Step 2
  specialPrograms: SpecialProgram[]  // Special program definitions
  bufferStaff?: Staff[]  // Buffer staff (for Step 3.0 detection)
  staffOverrides?: Record<string, {
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
    [key: string]: any
  }>  // Staff overrides including substitution info (for excluding substitution slots in Step 3.2)
  onSave: (
    result: FloatingPCAAllocationResultV2,
    teamOrder: Team[],
    step32Assignments: SlotAssignment[],
    step33Assignments: SlotAssignment[]
  ) => void
  onCancel: () => void
}

interface TieGroup {
  value: number
  teams: Team[]
  colorIndex: number
}

/**
 * Identifies tie-breaker groups from pending FTE values.
 * A tie group is 2+ teams with the same rounded pending FTE > 0.
 */
function identifyTieGroups(pendingFTE: Record<Team, number>): TieGroup[] {
  // Group teams by their rounded pending FTE
  const valueMap = new Map<number, Team[]>()
  
  Object.entries(pendingFTE).forEach(([team, value]) => {
    const roundedValue = roundToNearestQuarterWithMidpoint(value)
    if (roundedValue > 0) {
      const existing = valueMap.get(roundedValue) || []
      existing.push(team as Team)
      valueMap.set(roundedValue, existing)
    }
  })
  
  // Filter to only groups with 2+ teams (actual ties)
  const tieGroups: TieGroup[] = []
  let colorIndex = 0
  
  // Sort by value descending to assign colors consistently
  const sortedEntries = Array.from(valueMap.entries()).sort((a, b) => b[0] - a[0])
  
  sortedEntries.forEach(([value, teams]) => {
    if (teams.length >= 2) {
      tieGroups.push({
        value,
        teams,
        colorIndex: colorIndex % TIE_BREAKER_COLORS.length,
      })
      colorIndex++
    }
  })
  
  return tieGroups
}

/**
 * Sorts teams by their pending FTE (descending), preserving order within tie groups.
 */
function sortTeamsByPendingFTE(
  teams: Team[],
  pendingFTE: Record<Team, number>,
  currentOrder: Team[]
): Team[] {
  // Create a map of team -> current position for stable sorting within ties
  const positionMap = new Map<Team, number>()
  currentOrder.forEach((team, index) => positionMap.set(team, index))
  
  return [...teams].sort((a, b) => {
    const aRounded = roundToNearestQuarterWithMidpoint(pendingFTE[a])
    const bRounded = roundToNearestQuarterWithMidpoint(pendingFTE[b])
    
    // Primary: descending by rounded value
    if (aRounded !== bRounded) {
      return bRounded - aRounded
    }
    
    // Secondary: preserve current relative order
    return (positionMap.get(a) ?? 0) - (positionMap.get(b) ?? 0)
  })
}

export function FloatingPCAConfigDialog({
  open,
  teams = TEAMS,
  initialPendingFTE,
  pcaPreferences,
  floatingPCAs,
  existingAllocations,
  specialPrograms,
  bufferStaff = [],
  staffOverrides = {},
  onSave,
  onCancel,
}: FloatingPCAConfigDialogProps) {
  const activeTeams = useMemo(
    () => (Array.isArray(teams) && teams.length > 0 ? teams : TEAMS),
    [teams]
  )
  const supabase = createClientComponentClient()
  // Current mini-step
  const [currentMiniStep, setCurrentMiniStep] = useState<MiniStep>('3.0')
  
  // Step 3.0: Buffer PCA detection and confirmation
  const [bufferPCAFullyAssigned, setBufferPCAFullyAssigned] = useState<Staff[]>([])
  const [bufferPCAPartiallyAssigned, setBufferPCAPartiallyAssigned] = useState<Staff[]>([])
  const [bufferPCAPendingToAssign, setBufferPCAPendingToAssign] = useState<Staff[]>([])
  // Remaining capacity > 0 (includes partial + pending)
  const [bufferPCAUnassigned, setBufferPCAUnassigned] = useState<Staff[]>([])
  const [bufferPCAConfirmed, setBufferPCAConfirmed] = useState(false)
  
  // Step 3.1: adjusted pending FTE values (rounded)
  const [adjustedFTE, setAdjustedFTE] = useState<Record<Team, number>>({} as Record<Team, number>)
  
  // State: original rounded pending FTE values (for reference and max constraint)
  const [originalRoundedFTE, setOriginalRoundedFTE] = useState<Record<Team, number>>({} as Record<Team, number>)
  
  // State: current team order (for display and saving)
  const [teamOrder, setTeamOrder] = useState<Team[]>([])

  // Step 3.4: allocation mode (Standard vs Balanced)
  const [allocationMode, setAllocationMode] = useState<'standard' | 'balanced'>('standard')
  // Scarcity config (global head): treat threshold as "shortage slots" (0.25 FTE per slot)
  const [scarcityShortageSlotsThreshold, setScarcityShortageSlotsThreshold] = useState<number>(2)
  const [scarcityAutoSelected, setScarcityAutoSelected] = useState(false)
  // IMPORTANT: default to 'off' until config is loaded, to avoid auto-select firing before RPC returns.
  const [scarcityBehavior, setScarcityBehavior] = useState<'auto_select' | 'remind_only' | 'off'>('off')
  const [scarcityConfigLoaded, setScarcityConfigLoaded] = useState(false)

  type Step31PreviewState =
    | { status: 'idle' }
    | { status: 'loading' }
    | {
        status: 'ready'
        computedAt: number
        standardZeroTeams: Team[]
        balancedShortTeams: Team[]
      }
    | { status: 'error'; message: string }

  const [step31Preview, setStep31Preview] = useState<Step31PreviewState>({ status: 'idle' })
  const previewRunIdRef = useRef(0)
  const previewDebounceRef = useRef<number | null>(null)
  const previewIdleHandleRef = useRef<number | null>(null)
  const previewLastHashRef = useRef<string>('')
  const step31InitializedForOpenRef = useRef(false)
  const teamOrderStripRef = useRef<HTMLDivElement | null>(null)
  const [teamOrderScrollMeta, setTeamOrderScrollMeta] = useState({
    visible: false,
    thumbWidthPct: 100,
    thumbOffsetPct: 0,
  })
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  const cancelPreviewWork = useCallback(() => {
    if (previewDebounceRef.current != null) {
      window.clearTimeout(previewDebounceRef.current)
      previewDebounceRef.current = null
    }
    const w = window as any
    if (previewIdleHandleRef.current != null) {
      if (typeof w.cancelIdleCallback === 'function') {
        w.cancelIdleCallback(previewIdleHandleRef.current)
      }
      previewIdleHandleRef.current = null
    }
  }, [])

  useEffect(() => {
    const detect = () => {
      const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
      const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      setIsMobileViewport(narrow || coarse)
    }
    detect()
    window.addEventListener('resize', detect)
    return () => window.removeEventListener('resize', detect)
  }, [])

  // Reset per-open state on close to avoid stale preview hash.
  useEffect(() => {
    if (open) return
    step31InitializedForOpenRef.current = false
    previewLastHashRef.current = ''
    cancelPreviewWork()
    setStep31Preview({ status: 'idle' })
  }, [open, cancelPreviewWork])

  // Load scarcity threshold from global config head (once per open)
  useEffect(() => {
    if (!open) return
    setScarcityConfigLoaded(false)
    let cancelled = false
    ;(async () => {
      const res = await supabase.rpc('get_config_global_head_v1')
      if (cancelled) return
      if (res.error) {
        setScarcityConfigLoaded(true)
        return
      }
      const raw = (res.data as any)?.floating_pca_scarcity_threshold
      // Backward compatible read: historical key is slack_slots; we now interpret as shortage-slots threshold.
      const shortageSlots =
        typeof raw?.shortage_slots === 'number'
          ? raw.shortage_slots
          : typeof raw?.slack_slots === 'number'
            ? raw.slack_slots
            : Number(raw?.shortage_slots ?? raw?.shortageSlots ?? raw?.slack_slots ?? raw?.slackSlots ?? 2)
      const behaviorRaw = String(raw?.behavior ?? 'auto_select')
      const shortageSafe = Number.isFinite(shortageSlots) && shortageSlots >= 0 ? Math.round(shortageSlots) : 2
      const behaviorSafe =
        behaviorRaw === 'remind_only' || behaviorRaw === 'off' || behaviorRaw === 'auto_select'
          ? (behaviorRaw as any)
          : 'auto_select'
      setScarcityShortageSlotsThreshold(shortageSafe)
      setScarcityBehavior(behaviorSafe)
      setScarcityAutoSelected(false)
      setScarcityConfigLoaded(true)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, supabase])

  const roundedPendingByTeam = useMemo(() => {
    const out: Record<Team, number> = {} as any
    activeTeams.forEach((t) => {
      out[t] = roundToNearestQuarterWithMidpoint(adjustedFTE[t] || 0)
    })
    return out
  }, [activeTeams, adjustedFTE])

  const maxRoundedPending = useMemo(() => {
    return Math.max(0, ...activeTeams.map((t) => roundedPendingByTeam[t] || 0))
  }, [activeTeams, roundedPendingByTeam])

  const scarcityMetrics = useMemo(() => {
    const teamsNeeding = activeTeams.filter((t) => (roundedPendingByTeam[t] || 0) > 0)
    const teamsNeedingCount = teamsNeeding.length
    const neededSlots = teamsNeeding.reduce((sum, t) => sum + Math.round((roundedPendingByTeam[t] || 0) / 0.25), 0)

    const floatingIds = new Set(floatingPCAs.map((p) => p.id))
    const usedSlotsByPcaId = new Map<string, Set<1 | 2 | 3 | 4>>()
    const markUsed = (id: string, slot: 1 | 2 | 3 | 4) => {
      const s = usedSlotsByPcaId.get(id) ?? new Set<1 | 2 | 3 | 4>()
      s.add(slot)
      usedSlotsByPcaId.set(id, s)
    }

    // Used slots from allocations (already assigned in Step 2 / special programs / prior work)
    for (const alloc of existingAllocations) {
      if (!floatingIds.has(alloc.staff_id)) continue
      if (alloc.slot1) markUsed(alloc.staff_id, 1)
      if (alloc.slot2) markUsed(alloc.staff_id, 2)
      if (alloc.slot3) markUsed(alloc.staff_id, 3)
      if (alloc.slot4) markUsed(alloc.staff_id, 4)
      const inv = (alloc as any)?.invalid_slot as 1 | 2 | 3 | 4 | null | undefined
      if (inv === 1 || inv === 2 || inv === 3 || inv === 4) markUsed(alloc.staff_id, inv)
    }

    // Used slots from overrides (may exist even if allocations weren't rebuilt yet)
    floatingIds.forEach((pcaId) => {
      const o: any = (staffOverrides as any)?.[pcaId]
      const manual = o?.bufferManualSlotOverrides ?? o?.slotOverrides
      if (!manual) return
      if (manual.slot1) markUsed(pcaId, 1)
      if (manual.slot2) markUsed(pcaId, 2)
      if (manual.slot3) markUsed(pcaId, 3)
      if (manual.slot4) markUsed(pcaId, 4)
    })

    let availableSlots = 0
    for (const p of floatingPCAs) {
      const fteSlots = Math.max(0, Math.round(roundDownToQuarter(p.fte_pca ?? 0) / 0.25))
      let candidateSlots: number[] = Array.isArray(p.availableSlots) && p.availableSlots.length > 0 ? p.availableSlots : [1, 2, 3, 4]
      const inv = (p as any)?.invalidSlot as number | null | undefined
      if (inv === 1 || inv === 2 || inv === 3 || inv === 4) {
        candidateSlots = candidateSlots.filter((s) => s !== inv)
      }
      const used = usedSlotsByPcaId.get(p.id)
      const remainingSlotCapacity = used ? candidateSlots.filter((s) => !used.has(s as any)).length : candidateSlots.length
      availableSlots += Math.min(fteSlots, remainingSlotCapacity)
    }

    const slackSlots = availableSlots - neededSlots
    return { teamsNeedingCount, neededSlots, availableSlots, slackSlots }
  }, [activeTeams, roundedPendingByTeam, floatingPCAs, existingAllocations, staffOverrides])

  const shortageSlots = Math.max(0, scarcityMetrics.neededSlots - scarcityMetrics.availableSlots)

  const scarcityTriggered =
    scarcityBehavior !== 'off' &&
    scarcityMetrics.neededSlots > 0 &&
    scarcityShortageSlotsThreshold >= 0 &&
    shortageSlots >= scarcityShortageSlotsThreshold

  // Auto-select Balanced once when entering Step 3.1 (do not fight user toggles afterwards).
  useEffect(() => {
    if (
      scarcityConfigLoaded &&
      scarcityTriggered &&
      scarcityBehavior === 'auto_select' &&
      currentMiniStep === '3.1' &&
      allocationMode !== 'balanced' &&
      !scarcityAutoSelected
    ) {
      setAllocationMode('balanced')
      setScarcityAutoSelected(true)
    }
  }, [
    scarcityMetrics,
    scarcityShortageSlotsThreshold,
    scarcityBehavior,
    scarcityTriggered,
    scarcityConfigLoaded,
    currentMiniStep,
    allocationMode,
    scarcityAutoSelected,
  ])

  // Step 3.1 preview: run BOTH standard + balanced (dry-run) and summarize risks.
  useEffect(() => {
    const canRun =
      open &&
      bufferPCAConfirmed &&
      currentMiniStep === '3.1' &&
      floatingPCAs.length > 0 &&
      teamOrder.length > 0

    if (!canRun) {
      cancelPreviewWork()
      setStep31Preview({ status: 'idle' })
      return
    }

    const hash = (() => {
      const orderKey = teamOrder.join(',')
      const pendingKey = activeTeams.map((t) => `${t}:${roundedPendingByTeam[t].toFixed(2)}`).join('|')
      const allocKey = [...existingAllocations]
        .sort((a, b) => String(a.staff_id ?? '').localeCompare(String(b.staff_id ?? '')))
        .map((a) => {
          const inv = (a as any)?.invalid_slot ?? ''
          return `${a.staff_id}:${a.slot1 ?? ''}${a.slot2 ?? ''}${a.slot3 ?? ''}${a.slot4 ?? ''}:${inv}`
        })
        .join('|')
      const poolKey = [...floatingPCAs]
        .sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
        .map((p) => `${p.id}:${(p.fte_pca ?? 0).toFixed(2)}:${Array.isArray(p.availableSlots) ? p.availableSlots.join('') : ''}`)
        .join('|')
      return `${orderKey}__${pendingKey}__${allocKey}__${poolKey}`
    })()

    if (hash === previewLastHashRef.current) return
    previewLastHashRef.current = hash

    cancelPreviewWork()

    const runId = ++previewRunIdRef.current
    setStep31Preview({ status: 'loading' })

    const runPreview = async () => {
      const standardPending = { ...roundedPendingByTeam }
      const balancedPending = { ...roundedPendingByTeam }
      const standardAllocations = existingAllocations.map((a) => ({ ...a }))
      const balancedAllocations = existingAllocations.map((a) => ({ ...a }))

      const [standardRes, balancedRes] = await Promise.all([
        allocateFloatingPCA_v2({
          mode: 'standard',
          teamOrder,
          currentPendingFTE: standardPending,
          existingAllocations: standardAllocations,
          pcaPool: floatingPCAs,
          pcaPreferences,
          specialPrograms,
        }),
        allocateFloatingPCA_v2({
          mode: 'balanced',
          teamOrder,
          currentPendingFTE: balancedPending,
          existingAllocations: balancedAllocations,
          pcaPool: floatingPCAs,
          pcaPreferences,
          specialPrograms,
        }),
      ])

      if (runId !== previewRunIdRef.current) return

      const teamsNeeding = activeTeams.filter((t) => (roundedPendingByTeam[t] || 0) > 0)

      const standardZeroTeams = teamsNeeding.filter((t) => {
        const count = (standardRes.tracker?.[t]?.assignments || []).filter((a) => a.assignedIn === 'step34').length
        return count === 0
      })

      const balancedShortTeams = teamsNeeding.filter((t) => {
        const left = roundToNearestQuarterWithMidpoint((balancedRes.pendingPCAFTEPerTeam as any)?.[t] || 0)
        return left >= 0.25
      })

      setStep31Preview({
        status: 'ready',
        computedAt: Date.now(),
        standardZeroTeams,
        balancedShortTeams,
      })
    }

    const w = window as any
    if (typeof w.requestIdleCallback === 'function') {
      previewIdleHandleRef.current = w.requestIdleCallback(
        () => {
          previewIdleHandleRef.current = null
          runPreview().catch((e) => {
            if (runId !== previewRunIdRef.current) return
            const msg = e instanceof Error ? e.message : String(e)
            setStep31Preview({ status: 'error', message: msg })
          })
        },
        { timeout: 650 }
      )
    } else {
      previewDebounceRef.current = window.setTimeout(() => {
        previewDebounceRef.current = null
        runPreview().catch((e) => {
          if (runId !== previewRunIdRef.current) return
          const msg = e instanceof Error ? e.message : String(e)
          setStep31Preview({ status: 'error', message: msg })
        })
      }, 0)
    }

    return () => {
      cancelPreviewWork()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    bufferPCAConfirmed,
    currentMiniStep,
    activeTeams,
    teamOrder,
    roundedPendingByTeam,
    existingAllocations,
    floatingPCAs,
    pcaPreferences,
    specialPrograms,
    cancelPreviewWork,
  ])
  
  // Step 3.2: reservations computed from Step 3.1 output
  const [teamReservations, setTeamReservations] = useState<TeamReservations | null>(null)
  const [pcaSlotReservations, setPCASlotReservations] = useState<PCASlotReservations>({})
  
  // Step 3.2: user selections for slot assignments
  const [slotSelections, setSlotSelections] = useState<SlotAssignment[]>([])
  
  // Step 3.2 -> 3.3 transition: store completed 3.2 assignments
  const [step32Assignments, setStep32Assignments] = useState<SlotAssignment[]>([])
  
  // Step 3.3: adjacent slot reservations from special program PCAs
  const [adjacentReservations, setAdjacentReservations] = useState<AdjacentSlotReservations | null>(null)
  
  // Step 3.3: user selections for adjacent slot assignments
  const [step33Selections, setStep33Selections] = useState<SlotAssignment[]>([])
  
  // "Expected" FTE - constant reference from 3.1 (for display in 3.2/3.3)
  const [expectedFTE, setExpectedFTE] = useState<Record<Team, number>>({} as Record<Team, number>)
  
  // "Current" pending FTE - updated after 3.2/3.3 assignments
  const [currentPendingFTE, setCurrentPendingFTE] = useState<Record<Team, number>>({} as Record<Team, number>)
  
  // Updated allocations after 3.2 assignments (for 3.3 computation)
  const [updatedAllocations, setUpdatedAllocations] = useState<PCAAllocation[]>([])
  
  // Detect buffer PCA assignment status
  useEffect(() => {
    if (open && bufferStaff.length > 0) {
      // Filter buffer staff to only PCA rank
      const bufferPCAs = bufferStaff.filter(s => s.rank === 'PCA' && s.status === 'buffer' && s.floating)
      
      const fullyAssigned: Staff[] = []
      const partiallyAssigned: Staff[] = []
      const pendingToAssign: Staff[] = []
      const unassigned: Staff[] = [] // remaining capacity > 0
      
      bufferPCAs.forEach(pca => {
        const baseFTE = pca.buffer_fte || 0
        const totalSlots = Math.max(0, Math.min(4, Math.round(baseFTE / 0.25)))
        
        // Find all allocations for this buffer PCA
        const allocations = existingAllocations.filter(alloc => alloc.staff_id === pca.id)
        
        // Calculate assigned slots from all allocations
        const assignedSlots: number[] = []
        allocations.forEach(alloc => {
          if (alloc.slot1) assignedSlots.push(1)
          if (alloc.slot2) assignedSlots.push(2)
          if (alloc.slot3) assignedSlots.push(3)
          if (alloc.slot4) assignedSlots.push(4)
        })
        
        // Remove duplicates
        const uniqueAssignedSlots = Array.from(new Set(assignedSlots))
        
        // Calculate remaining FTE
        const assignedFTE = uniqueAssignedSlots.length * 0.25
        const remainingFTE = Math.max(0, baseFTE - assignedFTE)
        const assignedCount = uniqueAssignedSlots.length
        const remainingSlots = Math.max(0, totalSlots - assignedCount)
        
        if (totalSlots === 0) return

        // Fully assigned: no a/v slots remaining
        if (remainingSlots === 0) {
          fullyAssigned.push(pca)
          return
        }

        // Partially assigned: some slots assigned, some remaining
        if (assignedCount > 0) {
          partiallyAssigned.push(pca)
          unassigned.push(pca)
          return
        }

        // Pending to assign: nothing assigned yet
        pendingToAssign.push(pca)
        unassigned.push(pca)
      })
      
      setBufferPCAFullyAssigned(fullyAssigned)
      setBufferPCAPartiallyAssigned(partiallyAssigned)
      setBufferPCAPendingToAssign(pendingToAssign)
      setBufferPCAUnassigned(unassigned)
      
      // If all assigned (no remaining capacity) or none exist, proceed to 3.1
      if (unassigned.length === 0) {
        setCurrentMiniStep('3.1')
        setBufferPCAConfirmed(true)
      } else {
        // Some have remaining capacity - show Step 3.0 confirmation
        setCurrentMiniStep('3.0')
        setBufferPCAConfirmed(false)
      }
    } else if (open) {
      // No buffer staff - proceed directly to 3.1
      setCurrentMiniStep('3.1')
      setBufferPCAConfirmed(true)
    }
  }, [open, bufferStaff, existingAllocations])
  
  // Calculate buffer floating PCA FTE assigned per team
  const bufferFloatingPCAFTEPerTeam = useMemo(() => {
    const result: Record<Team, number> = {
      FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
    }
    
    if (bufferStaff.length === 0) return result
    
    // Get buffer floating PCA staff IDs
    const bufferFloatingPCAIds = new Set(
      bufferStaff
        .filter(s => s.rank === 'PCA' && s.status === 'buffer' && s.floating)
        .map(s => s.id)
    )
    
    // Count buffer-floating manual assignments from BOTH:
    // - existingAllocations (already materialized allocations)
    // - staffOverrides (slotOverrides / bufferManualSlotOverrides), which can exist even if allocations weren't rebuilt yet
    //
    // IMPORTANT: this "Assigned" value is intended to explain Step 3.1 pending reductions due to Step 3.0,
    // and should NOT include special-program assignments / non-floating / substitution logic.
    const slotsByPcaIdByTeam = new Map<string, Map<Team, Set<1 | 2 | 3 | 4>>>()
    const ensure = (pcaId: string, team: Team) => {
      const byTeam = slotsByPcaIdByTeam.get(pcaId) ?? new Map<Team, Set<1 | 2 | 3 | 4>>()
      const set = byTeam.get(team) ?? new Set<1 | 2 | 3 | 4>()
      byTeam.set(team, set)
      slotsByPcaIdByTeam.set(pcaId, byTeam)
      return set
    }

    // 1) From allocations
    existingAllocations.forEach((alloc) => {
      if (!bufferFloatingPCAIds.has(alloc.staff_id)) return
      activeTeams.forEach((team) => {
        if (alloc.slot1 === team) ensure(alloc.staff_id, team).add(1)
        if (alloc.slot2 === team) ensure(alloc.staff_id, team).add(2)
        if (alloc.slot3 === team) ensure(alloc.staff_id, team).add(3)
        if (alloc.slot4 === team) ensure(alloc.staff_id, team).add(4)
      })
    })

    // 2) From overrides (slotOverrides / bufferManualSlotOverrides)
    bufferFloatingPCAIds.forEach((pcaId) => {
      const o: any = (staffOverrides as any)?.[pcaId]
      const manual = o?.bufferManualSlotOverrides ?? o?.slotOverrides
      if (!manual) return
      activeTeams.forEach((team) => {
        if (manual.slot1 === team) ensure(pcaId, team).add(1)
        if (manual.slot2 === team) ensure(pcaId, team).add(2)
        if (manual.slot3 === team) ensure(pcaId, team).add(3)
        if (manual.slot4 === team) ensure(pcaId, team).add(4)
      })
    })

    // Reduce into per-team totals
    slotsByPcaIdByTeam.forEach((byTeam) => {
      byTeam.forEach((slots, team) => {
        result[team] += slots.size * 0.25
      })
    })
    
    return result
  }, [activeTeams, bufferStaff, existingAllocations, staffOverrides])
  
  // Calculate non-floating PCA assigned (check if any non-floating PCA exists in allocations)
  // Since existingAllocations includes non-floating PCA from Step 2, we can check by looking at floatingPCAs
  // Non-floating PCA are those NOT in floatingPCAs list
  const hasNonFloatingPCAAssigned = useMemo(() => {
    if (existingAllocations.length === 0) return false
    const floatingPCAIds = new Set(floatingPCAs.map(p => p.id))
    // Check if there are any allocations that are NOT in floatingPCAs (i.e., non-floating)
    return existingAllocations.some(alloc => !floatingPCAIds.has(alloc.staff_id))
  }, [existingAllocations, floatingPCAs])
  
  // Initialize state when dialog opens
  useEffect(() => {
    if (open && bufferPCAConfirmed && !step31InitializedForOpenRef.current) {
      step31InitializedForOpenRef.current = true
      // Reset to step 3.1 (after Step 3.0 is confirmed)
      setSlotSelections([])
      setTeamReservations(null)
      setPCASlotReservations({})
      
      // Reset Step 3.3 state
      setStep32Assignments([])
      setAdjacentReservations(null)
      setStep33Selections([])
      setUpdatedAllocations([...existingAllocations])
      
      // Round initial values - these are the original values (max allowed)
      // If buffer PCA was assigned, pending FTE should already be updated
      const rounded: Record<Team, number> = {} as Record<Team, number>
      activeTeams.forEach(team => {
        rounded[team] = roundToNearestQuarterWithMidpoint(initialPendingFTE[team] || 0)
      })
      
      setOriginalRoundedFTE(rounded)
      setAdjustedFTE(rounded) // Start with original values
      
      // Initialize expectedFTE and currentPendingFTE from adjustedFTE
      setExpectedFTE(rounded)
      setCurrentPendingFTE(rounded)
      
      // Initial sort by descending pending FTE
      const sorted = sortTeamsByPendingFTE(activeTeams, rounded, activeTeams)
      setTeamOrder(sorted)
    }
    // We intentionally initialize once per open session to avoid starving Step 3.1 preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bufferPCAConfirmed, activeTeams, initialPendingFTE, existingAllocations])
  
  // Compute tie groups from current adjusted FTE
  const tieGroups = useMemo(() => identifyTieGroups(adjustedFTE), [adjustedFTE])

  const maxTieGroupSize = useMemo(() => {
    return Math.max(0, ...tieGroups.map((g) => g.teams.length))
  }, [tieGroups])
  
  // Map team -> tie group info for quick lookup
  const teamTieInfo = useMemo(() => {
    const info: Record<Team, { isTied: boolean; groupIndex: number | null }> = {} as Record<Team, { isTied: boolean; groupIndex: number | null }>
    activeTeams.forEach(team => {
      info[team] = { isTied: false, groupIndex: null }
    })
    
    tieGroups.forEach(group => {
      group.teams.forEach(team => {
        info[team] = { isTied: true, groupIndex: group.colorIndex }
      })
    })
    
    return info
  }, [activeTeams, tieGroups])
  
  // Check if step 3.2 should be skipped (no reservations available)
  const hasAnyReservations = useMemo(() => {
    if (!teamReservations) return false
    return activeTeams.some(team => teamReservations[team] !== null)
  }, [activeTeams, teamReservations])
  
  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  )

  const updateTeamOrderScrollMeta = useCallback(() => {
    const el = teamOrderStripRef.current
    if (!el) {
      setTeamOrderScrollMeta((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      return
    }
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 1) {
      setTeamOrderScrollMeta((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      return
    }

    const rawThumbWidthPct = (el.clientWidth / el.scrollWidth) * 100
    const thumbWidthPct = Math.max(14, Math.min(100, rawThumbWidthPct))
    const trackTravelPct = Math.max(0, 100 - thumbWidthPct)
    const thumbOffsetPct = trackTravelPct * (el.scrollLeft / maxScroll)

    setTeamOrderScrollMeta((prev) => {
      const next = {
        visible: true,
        thumbWidthPct,
        thumbOffsetPct,
      }
      if (
        prev.visible === next.visible &&
        Math.abs(prev.thumbWidthPct - next.thumbWidthPct) < 0.1 &&
        Math.abs(prev.thumbOffsetPct - next.thumbOffsetPct) < 0.1
      ) {
        return prev
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const el = teamOrderStripRef.current
    if (!el) {
      setTeamOrderScrollMeta((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      return
    }

    const onScrollOrResize = () => {
      updateTeamOrderScrollMeta()
    }

    el.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScrollOrResize) : null
    resizeObserver?.observe(el)
    if (el.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(el.firstElementChild)
    }

    const rafId = window.requestAnimationFrame(onScrollOrResize)

    return () => {
      window.cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onScrollOrResize)
      el.removeEventListener('scroll', onScrollOrResize)
    }
  }, [open, currentMiniStep, teamOrder, updateTeamOrderScrollMeta])
  
  // Handle value change from +/- buttons (Step 3.1)
  const handleValueChange = (team: Team, newValue: number) => {
    const newAdjusted = { ...adjustedFTE, [team]: newValue }
    setAdjustedFTE(newAdjusted)
    
    // Re-sort teams by new values, preserving order within unchanged ties
    const newOrder = sortTeamsByPendingFTE(activeTeams, newAdjusted, teamOrder)
    setTeamOrder(newOrder)
  }
  
  // Handle drag end - only allow reordering within same tie group (Step 3.1)
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over || active.id === over.id) return
    
    const activeTeam = active.id as Team
    const overTeam = over.id as Team
    
    // Check if both teams are in the same tie group
    const activeInfo = teamTieInfo[activeTeam]
    const overInfo = teamTieInfo[overTeam]
    
    if (!activeInfo.isTied || !overInfo.isTied) return
    if (activeInfo.groupIndex !== overInfo.groupIndex) return
    
    // Same tie group - allow reordering
    const oldIndex = teamOrder.indexOf(activeTeam)
    const newIndex = teamOrder.indexOf(overTeam)
    
    setTeamOrder(arrayMove(teamOrder, oldIndex, newIndex))
  }

  const evaluateAdjacentAvailability = useCallback(
    (pendingFTE: Record<Team, number>, allocations: PCAAllocation[]) => {
      return computeAdjacentSlotReservations(
        pendingFTE,
        allocations,
        floatingPCAs,
        specialPrograms
      )
    },
    [floatingPCAs, specialPrograms]
  )

  const evaluateStep31Path = useCallback(() => {
    const reservations = computeReservations(
      pcaPreferences,
      adjustedFTE,
      floatingPCAs,
      existingAllocations,
      staffOverrides
    )

    const adjacent = evaluateAdjacentAvailability(adjustedFTE, existingAllocations)

    const next =
      reservations.hasAnyReservations ? ('3.2' as const)
      : adjacent.hasAnyAdjacentReservations ? ('3.3' as const)
      : ('final' as const)

    return { reservations, adjacent, next }
  }, [
    pcaPreferences,
    adjustedFTE,
    floatingPCAs,
    existingAllocations,
    staffOverrides,
    evaluateAdjacentAvailability,
  ])

  const evaluateStep32Path = useCallback((assignments: SlotAssignment[]) => {
    const execution = executeSlotAssignments(
      assignments,
      currentPendingFTE,
      updatedAllocations,
      floatingPCAs
    )

    const adjacent = evaluateAdjacentAvailability(
      execution.updatedPendingFTE,
      execution.updatedAllocations
    )

    const next = adjacent.hasAnyAdjacentReservations ? ('3.3' as const) : ('final' as const)
    return { execution, adjacent, next }
  }, [currentPendingFTE, updatedAllocations, floatingPCAs, evaluateAdjacentAvailability])

  const step31Flow = useMemo(() => {
    const { reservations, adjacent, next } = evaluateStep31Path()
    return {
      showStep32: reservations.hasAnyReservations,
      showStep33: adjacent.hasAnyAdjacentReservations,
      next,
      nextLabel:
        next === '3.2' ? 'Continue to 3.2' : next === '3.3' ? 'Continue to 3.3' : 'Run final allocation',
      tooltip:
        next === 'final'
          ? 'No Step 3.2 / 3.3 actions available today; continuing will run the final allocation and close this dialog.'
          : null,
    }
  }, [evaluateStep31Path])

  const step32Flow = useMemo(() => {
    const { next, adjacent } = evaluateStep32Path(slotSelections)
    return {
      showStep33: adjacent.hasAnyAdjacentReservations,
      next,
      nextLabel: next === '3.3' ? 'Assign & Continue' : 'Run final allocation',
      skipLabel: next === '3.3' ? 'Skip to 3.3' : 'Run final allocation',
      tooltip:
        next === 'final'
          ? 'No Step 3.3 adjacent-slot actions available after Step 3.2 selections; continuing will run the final allocation and close this dialog.'
          : null,
      skipTooltip:
        next === '3.3'
          ? 'Skip Step 3.2 reservations and continue to Step 3.3 adjacent-slot actions.'
          : 'No Step 3.3 adjacent-slot actions available; skipping will run the final allocation and close this dialog.',
    }
  }, [evaluateStep32Path, slotSelections])
  
  // Handle proceeding from Step 3.1 to Step 3.2
  const handleProceedToStep32 = () => {
    // Set expectedFTE as the constant reference from 3.1
    setExpectedFTE({ ...adjustedFTE })
    // Initialize currentPendingFTE from adjustedFTE
    setCurrentPendingFTE({ ...adjustedFTE })
    // Store existing allocations for later updates
    setUpdatedAllocations([...existingAllocations])
    
    // Compute route from Step 3.1 using shared preview logic.
    const { reservations, adjacent, next } = evaluateStep31Path()
    
    setTeamReservations(reservations.teamReservations)
    setPCASlotReservations(reservations.pcaSlotReservations)
    setSlotSelections([])
    
    if (next === '3.2') {
      setCurrentMiniStep('3.2')
      return
    }

    if (next === '3.3') {
      setAdjacentReservations(adjacent.adjacentReservations)
      setCurrentMiniStep('3.3')
      return
    }

    // No 3.2/3.3 actions available -> run final directly.
    setStep32Assignments([])
    setStep33Selections([])
    setTimeout(() => handleFinalSave(), 0)
  }
  
  // Handle going back from Step 3.2 to Step 3.1
  const handleBackToStep31 = () => {
    setCurrentMiniStep('3.1')
    setSlotSelections([])
  }
  
  // Handle selection change in Step 3.2
  const handleSelectionChange = (team: Team, slot: number, pcaId: string, pcaName: string, selected: boolean) => {
    if (selected) {
      // Remove any existing selection for this team (only one PCA per slot)
      const filtered = slotSelections.filter(s => s.team !== team)
      filtered.push({ team, slot, pcaId, pcaName })
      setSlotSelections(filtered)
    } else {
      // Remove this selection
      setSlotSelections(slotSelections.filter(
        s => !(s.team === team && s.slot === slot && s.pcaId === pcaId)
      ))
    }
  }
  
  // Handle proceeding from Step 3.2 to Step 3.3
  const handleProceedToStep33 = () => {
    // Save 3.2 assignments
    setStep32Assignments([...slotSelections])
    
    // Execute 3.2 assignments and compute 3.3 availability with shared logic.
    const { execution, adjacent, next } = evaluateStep32Path(slotSelections)
    
    // Update state with 3.2 results
    setCurrentPendingFTE(execution.updatedPendingFTE)
    setUpdatedAllocations(execution.updatedAllocations)
    
    setAdjacentReservations(adjacent.adjacentReservations)
    setStep33Selections([])
    
    if (next === 'final') {
      // Finalize with 3.2 assignments only - run final algorithm
      setTimeout(() => handleFinalSave(), 0)
    } else {
      setCurrentMiniStep('3.3')
    }
  }
  
  // Handle going back from Step 3.3 to Step 3.2
  const handleBackToStep32 = () => {
    setCurrentMiniStep('3.2')
    setStep33Selections([])
    // Reset currentPendingFTE and updatedAllocations to pre-3.2 state
    setCurrentPendingFTE({ ...expectedFTE })
    setUpdatedAllocations([...existingAllocations])
  }
  
  // Handle selection change in Step 3.3
  const handleStep33SelectionChange = (team: Team, slot: number, pcaId: string, pcaName: string, selected: boolean) => {
    if (selected) {
      // Add selection (multiple selections allowed per team in 3.3)
      setStep33Selections([...step33Selections, { team, slot, pcaId, pcaName }])
    } else {
      // Remove this selection
      setStep33Selections(step33Selections.filter(
        s => !(s.team === team && s.slot === slot && s.pcaId === pcaId)
      ))
    }
  }
  
  // State: algorithm running indicator
  const [isRunningAlgorithm, setIsRunningAlgorithm] = useState(false)
  
  const runFinalAlgorithm = async (params: {
    mode: 'standard' | 'balanced'
    basePendingFTE: Record<Team, number>
    baseAllocations: PCAAllocation[]
    step32Assignments: SlotAssignment[]
    step33Assignments: SlotAssignment[]
  }) => {
    const {
      mode,
      basePendingFTE,
      baseAllocations,
      step32Assignments,
      step33Assignments,
    } = params

    // First, execute any 3.3 assignments (they happen before the main algorithm).
    let finalPendingFTE = basePendingFTE
    let finalAllocations = baseAllocations
    if (step33Assignments.length > 0) {
      const result = executeSlotAssignments(
        step33Assignments,
        basePendingFTE,
        baseAllocations,
        floatingPCAs
      )
      finalPendingFTE = result.updatedPendingFTE
      finalAllocations = result.updatedAllocations
    }

    const algorithmResult = await allocateFloatingPCA_v2({
      mode,
      teamOrder: teamOrder,
      currentPendingFTE: finalPendingFTE,
      existingAllocations: finalAllocations,
      pcaPool: floatingPCAs,
      pcaPreferences: pcaPreferences,
      specialPrograms: specialPrograms,
      extraCoverageMode: 'round-robin-team-order',
    })

    // Add Step 3.2 and 3.3 assignments to the tracker for visibility.
    const allocationOrderMap = new Map<Team, number>()
    teamOrder.forEach((team, index) => {
      allocationOrderMap.set(team, index + 1)
    })

    for (const assignment of step32Assignments) {
      const pca = floatingPCAs.find(p => p.id === assignment.pcaId)
      if (!pca) continue

      const teamPref = getTeamPreferenceInfo(assignment.team, pcaPreferences)
      const teamFloor = getTeamFloor(assignment.team, pcaPreferences)
      const isPreferredPCA = teamPref.preferredPCAIds.includes(assignment.pcaId)
      const isPreferredSlot = teamPref.preferredSlot === assignment.slot

      recordAssignment(algorithmResult.tracker, assignment.team, {
        slot: assignment.slot,
        pcaId: assignment.pcaId,
        pcaName: assignment.pcaName,
        assignedIn: 'step32',
        wasPreferredSlot: isPreferredSlot,
        wasPreferredPCA: isPreferredPCA,
        wasFloorPCA: isFloorPCAForTeam(pca, teamFloor),
        allocationOrder: allocationOrderMap.get(assignment.team),
      })
    }

    for (const assignment of step33Assignments) {
      const pca = floatingPCAs.find(p => p.id === assignment.pcaId)
      if (!pca) continue

      const teamPref = getTeamPreferenceInfo(assignment.team, pcaPreferences)
      const teamFloor = getTeamFloor(assignment.team, pcaPreferences)
      const isPreferredPCA = teamPref.preferredPCAIds.includes(assignment.pcaId)
      const isPreferredSlot = teamPref.preferredSlot === assignment.slot

      recordAssignment(algorithmResult.tracker, assignment.team, {
        slot: assignment.slot,
        pcaId: assignment.pcaId,
        pcaName: assignment.pcaName,
        assignedIn: 'step33',
        wasPreferredSlot: isPreferredSlot,
        wasPreferredPCA: isPreferredPCA,
        wasFloorPCA: isFloorPCAForTeam(pca, teamFloor),
        allocationOrder: allocationOrderMap.get(assignment.team),
      })
    }

    finalizeTrackerSummary(algorithmResult.tracker)
    onSave(algorithmResult, teamOrder, step32Assignments, step33Assignments)
  }

  // Handle final save from Step 3.3 (runs the full floating PCA algorithm v2).
  const handleFinalSave = async (modeOverride?: 'standard' | 'balanced') => {
    setIsRunningAlgorithm(true)
    try {
      await runFinalAlgorithm({
        mode: modeOverride ?? allocationMode,
        basePendingFTE: currentPendingFTE,
        baseAllocations: updatedAllocations,
        step32Assignments,
        step33Assignments: step33Selections,
      })
    } catch (error) {
      console.error('Error running floating PCA algorithm:', error)
    } finally {
      setIsRunningAlgorithm(false)
    }
  }

  // Shortcut: run Balanced mode directly after Step 3.1 (skips 3.2/3.3).
  const handleRunBalancedNow = async () => {
    setIsRunningAlgorithm(true)
    try {
      await runFinalAlgorithm({
        mode: 'balanced',
        basePendingFTE: { ...adjustedFTE },
        baseAllocations: [...existingAllocations],
        step32Assignments: [],
        step33Assignments: [],
      })
    } catch (error) {
      console.error('Error running floating PCA algorithm (balanced):', error)
    } finally {
      setIsRunningAlgorithm(false)
    }
  }
  
  // Handle skip assignments in Step 3.2 (skip to 3.3 or final)
  const handleSkipStep32 = () => {
    const { adjacent, next } = evaluateStep32Path([])
    if (next === '3.3') {
      setStep32Assignments([])
      setAdjacentReservations(adjacent.adjacentReservations)
      setStep33Selections([])
      setCurrentMiniStep('3.3')
    } else {
      // No adjacent slots - skip directly to final algorithm
      setStep32Assignments([])
      setStep33Selections([])
      handleFinalSave()
    }
  }
  
  // Handle skip assignments in Step 3.3
  const handleSkipStep33 = () => {
    // Skip 3.3 and run final algorithm with only 3.2 assignments
    setStep33Selections([])
    handleFinalSave()
  }
  
  // Handle reset to original values
  const handleResetToOriginal = () => {
    setAdjustedFTE({ ...originalRoundedFTE })
    // Re-sort teams by original values
    const sorted = sortTeamsByPendingFTE(activeTeams, originalRoundedFTE, activeTeams)
    setTeamOrder(sorted)
  }

  // Render Step 3.0 content (Buffer PCA detection and confirmation)
  const renderStep30 = () => {
    if (bufferPCAUnassigned.length === 0) {
      // All assigned - auto-proceed to 3.1
      return null
    }
    
    // Helper function to calculate remaining FTE and assigned slots for a buffer PCA
    const getBufferPCAStatus = (pca: Staff) => {
      const baseFTE = pca.buffer_fte || 0
      
      // Find all allocations for this buffer PCA
      const allocations = existingAllocations.filter(alloc => alloc.staff_id === pca.id)
      
      // Calculate assigned slots from all allocations
      const assignedSlots: number[] = []
      allocations.forEach(alloc => {
        if (alloc.slot1) assignedSlots.push(1)
        if (alloc.slot2) assignedSlots.push(2)
        if (alloc.slot3) assignedSlots.push(3)
        if (alloc.slot4) assignedSlots.push(4)
      })
      
      // Remove duplicates (in case of multiple allocations, though unlikely)
      const uniqueAssignedSlots = Array.from(new Set(assignedSlots)).sort((a, b) => a - b)
      
      // Calculate remaining FTE
      const assignedFTE = uniqueAssignedSlots.length * 0.25
      const remainingFTE = Math.max(0, baseFTE - assignedFTE)
      
      return {
        remainingFTE,
        assignedSlots: uniqueAssignedSlots,
        baseFTE
      }
    }
    
    return (
      <div className="space-y-4">
        <DialogDescription>
          Buffer PCA staff detected but not yet assigned to teams.
        </DialogDescription>
        
        <div className="space-y-2">
          <p className="text-sm font-medium">Unassigned Buffer PCA Staff:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {bufferPCAUnassigned.map(pca => {
              const status = getBufferPCAStatus(pca)
              const assignedSlotsText = status.assignedSlots.length > 0
                ? ` - Slot ${status.assignedSlots.join(',')} assigned`
                : ''
              
              return (
                <li key={pca.id}>
                  {pca.name}* ({status.remainingFTE.toFixed(2)} FTE remaining{assignedSlotsText})
                </li>
              )
            })}
          </ul>
        </div>
        
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm mb-2">
            Should the algorithm process these buffer PCA staff as regular floating PCA?
          </p>
          <p className="text-xs text-muted-foreground">
            • <strong>Yes</strong>: Algorithm will treat them as regular floating PCA and assign them automatically
            <br />
            • <strong>No</strong>: Exit dialog so you can assign them manually first
          </p>
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              // No - exit dialog
              onCancel()
            }}
          >
            No, Exit Dialog
          </Button>
          <Button
            onClick={() => {
              // Yes - proceed to 3.1, algo will treat as regular floating PCA
              setBufferPCAConfirmed(true)
              setCurrentMiniStep('3.1')
            }}
          >
            Yes, Continue to Step 3.1
          </Button>
        </DialogFooter>
      </div>
    )
  }
  
  const renderBufferNameChips = (list: Staff[]) => (
    <span className="ml-2 inline-flex flex-wrap gap-1">
      {list.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center rounded-md border bg-background px-1.5 py-0.5 text-[12px] font-semibold text-foreground"
        >
          {p.name}*
        </span>
      ))}
    </span>
  )

  // Render Step 3.1 content
  const renderStep31 = () => (
    <>
      <DialogDescription>
        Set the floating PCA processing order: drag <GripVertical className="inline h-3 w-3 mx-0.5" /> within the colored tie-breaker groups.
        <span className="mt-1 block text-sm">
          Usually: keep the numbers as-is and only adjust order when ties feel unfair.
        </span>
      </DialogDescription>

      {/* Must be outside DialogDescription (<p>) to avoid invalid HTML nesting */}
      <details className="mt-3 rounded-md border bg-muted/30 p-3">
        <summary className="cursor-pointer select-none font-medium text-foreground">
          How to read this (click to expand)
        </summary>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>
            Values shown are <span className="underline">after</span> fixed-team PCA assignment.
          </li>
          <li>
            <span className="font-medium text-foreground">Assigned</span>: floating PCA slots already allocated from Step 3 onwards.
          </li>
          <li>
            <span className="font-medium text-foreground">Pending</span>: remaining floating PCA slots the team should receive.
          </li>
          <li className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 text-amber-500 flex-shrink-0" />
            <span>
              {step31Preview.status === 'loading'
                ? 'Preview is calculating…'
                : step31Preview.status === 'idle'
                  ? 'Preview is preparing…'
                  : step31Preview.status === 'error'
                  ? 'Preview unavailable today (you can still continue).'
                  : maxTieGroupSize >= 3 || maxRoundedPending >= 0.75
                      ? 'Consider manual adjustment when many teams are tied or the top pending is high.'
                      : 'No obvious risk detected from the preview today.'}
            </span>
          </li>
        </ul>
      </details>

      {/* Scarcity callout (inline, no toast) */}
      {scarcityTriggered ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700 flex-shrink-0" />
            <div className="min-w-0 space-y-0.5">
              <div className="font-semibold">
                {scarcityBehavior === 'auto_select'
                  ? 'Scarcity detected — Balanced auto-selected'
                  : 'Scarcity detected — Balanced recommended'}
              </div>
              <div className="text-amber-900/80 text-xs leading-relaxed space-y-0.5">
                <div>
                  Trigger: global shortage ≥ {scarcityShortageSlotsThreshold} slot(s)
                </div>
                <div>
                  Today: need {scarcityMetrics.neededSlots}, available {scarcityMetrics.availableSlots} → shortage {shortageSlots}
                </div>
                <div>
                  {scarcityBehavior === 'remind_only'
                    ? 'Standard keeps Step 3.2/3.3; Balanced may reduce 0-slot teams.'
                    : 'Switch back to Standard if you want Step 3.2/3.3.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tick-to-do list (must be outside DialogDescription since it renders a <p>) */}
      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {bufferStaff.some(s => s.rank === 'PCA' && s.status === 'buffer' && s.floating) && (
          <>
            {bufferPCAFullyAssigned.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative h-4 w-4 flex items-center justify-center">
                  <div className="absolute inset-0 bg-green-600 rounded-full" />
                  <Check className="h-3 w-3 relative text-white stroke-[3]" />
                </div>
                <span className="text-muted-foreground">Buffer floating PCA fully assigned:</span>
                {renderBufferNameChips(bufferPCAFullyAssigned)}
              </div>
            )}

            {bufferPCAPartiallyAssigned.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative h-4 w-4 rounded-full border-2 border-green-600 overflow-hidden">
                  <div className="absolute left-0 top-0 h-full w-1/2 bg-green-600" />
                </div>
                <span className="text-muted-foreground">Buffer floating PCA partially assigned:</span>
                {renderBufferNameChips(bufferPCAPartiallyAssigned)}
              </div>
            )}

            {bufferPCAPendingToAssign.length > 0 && (
              <div className="flex items-center gap-2">
                <Circle className="h-4 w-4 text-green-600 border-2 border-green-600 rounded-full" />
                <span className="text-muted-foreground">Buffer floating PCA pending to be assigned:</span>
                {renderBufferNameChips(bufferPCAPendingToAssign)}
              </div>
            )}
          </>
        )}
        {hasNonFloatingPCAAssigned && (
          <div className="flex items-center gap-2">
            <div className="relative h-4 w-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-green-600 rounded-full" />
              <Check className="h-3 w-3 relative text-white stroke-[3]" />
            </div>
            <span>Non-floating PCA assigned</span>
          </div>
        )}
      </div>

      <div className="py-4">
        <DndContext
          sensors={sensors}
          autoScroll={false}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={teamOrder}
            strategy={horizontalListSortingStrategy}
          >
            <div
              ref={teamOrderStripRef}
              className="floating-pca-team-strip--mobile-native-scrollbar-hidden flex flex-nowrap gap-1.5 justify-center max-[480px]:justify-start items-center overflow-x-auto max-[480px]:overflow-x-scroll min-h-[120px] py-2 scrollbar-visible [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
            >
              {teamOrder.map((team, index) => (
                <div key={team} className="flex items-center gap-1.5 flex-shrink-0">
                  <TeamPendingCard
                    team={team}
                    pendingFTE={(() => {
                      const value = adjustedFTE[team] || 0
                      return value
                    })()}
                    originalPendingFTE={originalRoundedFTE[team] || 0}
                    maxValue={originalRoundedFTE[team] || 0}
                    tieGroupIndex={teamTieInfo[team]?.groupIndex ?? null}
                    isTied={teamTieInfo[team]?.isTied ?? false}
                    onValueChange={handleValueChange}
                    assignedFTE={bufferFloatingPCAFTEPerTeam[team] > 0 ? bufferFloatingPCAFTEPerTeam[team] : undefined}
                    orderPosition={index + 1}
                  />
                  {index < teamOrder.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
            {teamOrderScrollMeta.visible ? (
              <div className="mt-1 hidden max-[480px]:block" aria-hidden={true}>
                <div className="relative h-1.5 rounded-full bg-muted/70">
                  <div
                    className="absolute top-0 h-full rounded-full bg-border transition-[left,width] duration-150 ease-out"
                    style={{
                      left: `${teamOrderScrollMeta.thumbOffsetPct}%`,
                      width: `${teamOrderScrollMeta.thumbWidthPct}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-center text-[10px] text-muted-foreground">
                  Swipe left/right to see all teams
                </div>
              </div>
            ) : null}
          </SortableContext>
        </DndContext>
      </div>

      <div className="rounded-md border bg-muted/30 p-3">
        <div className="text-sm font-medium text-foreground">Allocation method (Step 3.4)</div>
        <div
          className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Allocation method"
        >
          <div
            role="radio"
            aria-checked={allocationMode === 'standard'}
            tabIndex={0}
            onClick={() => setAllocationMode('standard')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setAllocationMode('standard')
              }
            }}
            className={cn(
              'rounded-md border bg-background p-3 text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              allocationMode === 'standard' ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-muted/40'
            )}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">Standard</div>
                <div className="text-xs text-muted-foreground">Manual-friendly (keeps Step 3.2/3.3)</div>
              </div>
            </div>

            <div className="mt-2 text-sm text-foreground">
              {step31Preview.status === 'loading' ? (
                <span className="text-muted-foreground">Preview: calculating…</span>
              ) : step31Preview.status === 'idle' ? (
                <span className="text-muted-foreground">Preview: preparing…</span>
              ) : step31Preview.status === 'error' ? (
                <span className="text-muted-foreground">Preview: unavailable</span>
              ) : (
                <>
                  Teams with 0 floating PCA (if run now):{' '}
                  <span className="font-semibold">{step31Preview.standardZeroTeams.length}</span>
                </>
              )}
            </div>
            {step31Preview.status === 'ready' && step31Preview.standardZeroTeams.length > 0 ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {step31Preview.standardZeroTeams.slice(0, 4).join(', ')}
                {step31Preview.standardZeroTeams.length > 4 ? ` +${step31Preview.standardZeroTeams.length - 4}` : ''}
              </div>
            ) : null}

            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground/90">
                Pros & cons
              </summary>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <span className="font-medium text-foreground">Pros</span>: continue to Step 3.2/3.3 so you can pick preferred/adjacent slots.
                </li>
                <li>
                  <span className="font-medium text-foreground">Cons</span>: under tight manpower, a high-need team can end up with near-zero floating slots.
                </li>
                <li>
                  <span className="font-medium text-foreground">Always enforced</span>: avoid the team’s gym slot.
                </li>
              </ul>
            </details>
          </div>

          <div
            role="radio"
            aria-checked={allocationMode === 'balanced'}
            tabIndex={0}
            onClick={() => setAllocationMode('balanced')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setAllocationMode('balanced')
              }
            }}
            className={cn(
              'rounded-md border bg-background p-3 text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              allocationMode === 'balanced' ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-muted/40'
            )}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">Balanced (take turns)</div>
                <div className="text-xs text-muted-foreground">Fairness-first (skips Step 3.2/3.3)</div>
              </div>
            </div>

            <div className="mt-2 text-sm text-foreground">
              {step31Preview.status === 'loading' ? (
                <span className="text-muted-foreground">Preview: calculating…</span>
              ) : step31Preview.status === 'idle' ? (
                <span className="text-muted-foreground">Preview: preparing…</span>
              ) : step31Preview.status === 'error' ? (
                <span className="text-muted-foreground">Preview: unavailable</span>
              ) : (
                <>
                  Teams still short after allocation (if run now):{' '}
                  <span className="font-semibold">{step31Preview.balancedShortTeams.length}</span>
                </>
              )}
            </div>
            {step31Preview.status === 'ready' && step31Preview.balancedShortTeams.length > 0 ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {step31Preview.balancedShortTeams.slice(0, 4).join(', ')}
                {step31Preview.balancedShortTeams.length > 4 ? ` +${step31Preview.balancedShortTeams.length - 4}` : ''}
              </div>
            ) : null}

            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground/90">
                Pros & cons
              </summary>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <span className="font-medium text-foreground">Pros</span>: gives teams turns (1 slot at a time) to reduce “0-slot” outcomes.
                </li>
                <li>
                  <span className="font-medium text-foreground">Cons</span>: skips Step 3.2/3.3 (no preferred/adjacent manual picking).
                </li>
                <li>
                  <span className="font-medium text-foreground">Always enforced</span>: avoid the team’s gym slot.
                </li>
                <li>
                  <span className="font-medium text-foreground">May relax</span>: floor matching and “reserved preferred PCA of other teams” if needed.
                </li>
              </ul>
            </details>
          </div>
        </div>
      </div>
      
      <DialogFooter className="sticky bottom-0 z-10 mt-4 flex-row flex-wrap items-center gap-2 border-t bg-background/95 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:justify-between sm:px-0">
        <Button variant="outline" onClick={handleResetToOriginal} className="mr-auto max-w-full whitespace-normal">
          Reset
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} className="max-w-full whitespace-normal">
            Cancel
          </Button>
          {allocationMode === 'balanced' ? (
            <Button
              type="button"
              onClick={handleRunBalancedNow}
              disabled={isRunningAlgorithm}
              title="Balanced mode runs the allocation directly (skips Step 3.2 and 3.3)"
              className="max-w-full whitespace-normal"
            >
              Run Balanced now
            </Button>
          ) : (
            step31Flow.tooltip ? (
              <Tooltip content={step31Flow.tooltip} side="top" zIndex={120000} wrapperClassName="max-w-full">
                <Button onClick={handleProceedToStep32} className="max-w-full whitespace-normal">
                  {isMobileViewport && step31Flow.nextLabel === 'Continue to 3.2' ? 'Continue' : step31Flow.nextLabel}
                  <ArrowRight className={cn('ml-2 h-4 w-4', isMobileViewport ? 'hidden' : 'inline-flex')} />
                </Button>
              </Tooltip>
            ) : (
              <Button onClick={handleProceedToStep32} className="max-w-full whitespace-normal">
                {isMobileViewport && step31Flow.nextLabel === 'Continue to 3.2' ? 'Continue' : step31Flow.nextLabel}
                <ArrowRight className={cn('ml-2 h-4 w-4', isMobileViewport ? 'hidden' : 'inline-flex')} />
              </Button>
            )
          )}
        </div>
      </DialogFooter>
    </>
  )
  
  // Render Step 3.2 content
  const renderStep32 = () => (
    <>
      <DialogDescription>
        Reserve preferred PCA/slot pairs (optional).
        <span className="mt-1 block text-xs">
          Each PCA slot can be reserved once. Skip to keep all slots available for the next step/final run.
        </span>
      </DialogDescription>
      
      <div className="py-4">
        <div className="mb-2 text-sm font-medium text-muted-foreground">Team Order:</div>
        <div className="flex flex-nowrap gap-1.5 justify-center items-center overflow-x-auto">
          {teamOrder.map((team, index) => (
            <Fragment key={team}>
              <TeamReservationCard
                team={team}
                pendingFTE={expectedFTE[team] || 0}
                reservation={teamReservations?.[team] || null}
                selections={slotSelections}
                onSelectionChange={handleSelectionChange}
                orderPosition={index + 1}
              />
              {index < teamOrder.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </Fragment>
          ))}
        </div>
        
        {/* Conflict warning */}
        {slotSelections.length > 0 && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>{slotSelections.length} slot(s) selected for assignment.</p>
          </div>
        )}
      </div>
      
      <DialogFooter className="sticky bottom-0 z-10 mt-4 flex-row flex-wrap items-center gap-2 border-t bg-background/95 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:justify-between sm:px-0">
        <Button variant="outline" onClick={handleBackToStep31} className="mr-auto max-w-full whitespace-normal">
          <ArrowLeft className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Back to 3.1</span>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Tooltip content={step32Flow.skipTooltip} side="top" zIndex={120000} wrapperClassName="max-w-full">
            <Button
              variant="outline"
              onClick={handleSkipStep32}
              title={step32Flow.skipTooltip}
              className="max-w-full whitespace-normal"
            >
              {isMobileViewport && step32Flow.skipLabel === 'Skip to 3.3' ? 'Skip' : step32Flow.skipLabel}
            </Button>
          </Tooltip>
          {step32Flow.tooltip ? (
            <Tooltip content={step32Flow.tooltip} side="top" zIndex={120000} wrapperClassName="max-w-full">
              <Button onClick={handleProceedToStep33} className="max-w-full whitespace-normal">
                {isMobileViewport && step32Flow.nextLabel === 'Assign & Continue' ? 'Assign' : step32Flow.nextLabel}
                <ArrowRight className={cn('ml-2 h-4 w-4', isMobileViewport ? 'hidden' : 'inline-flex')} />
              </Button>
            </Tooltip>
          ) : (
            <Button onClick={handleProceedToStep33} className="max-w-full whitespace-normal">
              {isMobileViewport && step32Flow.nextLabel === 'Assign & Continue' ? 'Assign' : step32Flow.nextLabel}
              <ArrowRight className={cn('ml-2 h-4 w-4', isMobileViewport ? 'hidden' : 'inline-flex')} />
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
  
  // Render Step 3.3 content
  const renderStep33 = () => (
    <>
      <DialogDescription>
        Assign adjacent slots from special program PCAs (optional).
        <span className="mt-1 block text-xs">
          Gray = already reserved in 3.2. Checkboxes = available adjacent slots.
        </span>
      </DialogDescription>
      
      <div className="py-4">
        <div className="mb-2 text-sm font-medium text-muted-foreground">Team Order:</div>
        <div className="flex flex-nowrap gap-1.5 justify-center items-center overflow-x-auto">
          {teamOrder.map((team, index) => (
            <Fragment key={team}>
              <TeamAdjacentSlotCard
                team={team}
                expectedFTE={expectedFTE[team] || 0}
                currentPendingFTE={currentPendingFTE[team] || 0}
                step32Assignments={step32Assignments.filter(a => a.team === team)}
                adjacentSlots={adjacentReservations?.[team] || []}
                selections={step33Selections}
                onSelectionChange={handleStep33SelectionChange}
                orderPosition={index + 1}
              />
              {index < teamOrder.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </Fragment>
          ))}
        </div>
        
        {/* Selection count */}
        {step33Selections.length > 0 && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>{step33Selections.length} adjacent slot(s) selected for assignment.</p>
          </div>
        )}
      </div>
      
      <DialogFooter className="sticky bottom-0 z-10 mt-4 flex-row flex-wrap items-center gap-2 border-t bg-background/95 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:justify-between sm:px-0">
        <Button variant="outline" onClick={handleBackToStep32} className="mr-auto max-w-full whitespace-normal">
          <ArrowLeft className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Back to 3.2</span>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={handleSkipStep33}
            title="Skip adjacent slot assignments and proceed to final allocation"
            className="max-w-full whitespace-normal"
          >
            {isMobileViewport ? 'Skip' : 'Skip Assignments'}
          </Button>
          <Button onClick={() => handleFinalSave('standard')} disabled={isRunningAlgorithm} className="max-w-full whitespace-normal">
            {isMobileViewport ? 'Assign' : 'Complete (Standard)'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="flex h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-4xl flex-col overflow-hidden sm:h-auto sm:w-full sm:max-h-[calc(100dvh-96px)]">
        <DialogHeader>
          <DialogTitle>Floating PCA allocation</DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground">
              Step {currentMiniStep}
              {currentMiniStep === '3.1'
                ? ' · Adjust'
                : currentMiniStep === '3.2'
                  ? ' · Preferred'
                  : currentMiniStep === '3.3'
                    ? ' · Adjacent'
                    : currentMiniStep === '3.0'
                      ? ' · Manual pre-assign'
                      : ''}
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain pr-1">
          {/* Step indicator */}
          {currentMiniStep !== '3.0' && (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              {(() => {
                const steps: Array<{ id: MiniStep; label: string }> = [{ id: '3.1', label: '3.1 Adjust' }]
                const showStep32InIndicator =
                  step31Flow.showStep32 || currentMiniStep === '3.2' || currentMiniStep === '3.3'
                const showStep33InIndicator =
                  currentMiniStep === '3.3'
                    ? true
                    : currentMiniStep === '3.2'
                      ? step32Flow.showStep33
                      : step31Flow.showStep33

                if (showStep32InIndicator) steps.push({ id: '3.2', label: '3.2 Preferred' })
                if (showStep33InIndicator) steps.push({ id: '3.3', label: '3.3 Adjacent' })

                return steps.map((s, idx) => (
                  <Fragment key={s.id}>
                    <span
                      className={cn(
                        'rounded-lg px-3 py-1.5 transition-colors',
                        currentMiniStep === s.id ? 'bg-slate-100 font-bold text-primary dark:bg-slate-700' : ''
                      )}
                    >
                      {s.label}
                    </span>
                    {idx < steps.length - 1 ? (
                      <span className="text-muted-foreground/70" aria-hidden="true">
                        ·
                      </span>
                    ) : null}
                  </Fragment>
                ))
              })()}
            </div>
          )}

          {currentMiniStep === '3.0' && renderStep30()}
          {currentMiniStep === '3.1' && renderStep31()}
          {currentMiniStep === '3.2' && renderStep32()}
          {currentMiniStep === '3.3' && renderStep33()}
        </div>
      </DialogContent>
    </Dialog>
  )
}
