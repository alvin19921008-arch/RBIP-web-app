'use client'

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { Team, LeaveType } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff } from '@/types/staff'
import type { SpecialProgram } from '@/types/allocation'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-provider'
import { useAutoHideFlag } from '@/lib/hooks/useAutoHideFlag'
import { useIsolatedWheelScroll } from '@/lib/hooks/useIsolatedWheelScroll'
import { normalizeSubstitutionForBySlot } from '@/lib/utils/substitutionFor'

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

type StaffOverridesLike = Record<
  string,
  {
    leaveType?: LeaveType | any
    fteRemaining?: number
    fteSubtraction?: number
    availableSlots?: number[]
    invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
    invalidSlot?: number
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
    substitutionForBySlot?: Partial<Record<1 | 2 | 3 | 4, { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team }>>
    extraCoverageBySlot?: Partial<Record<1 | 2 | 3 | 4, true>>
  }
>

type StepStatus = Record<string, 'pending' | 'completed' | 'modified'>

interface PCADedicatedScheduleTableProps {
  allPCAStaff: Staff[] // should include buffer PCAs too
  pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff: Staff }>>
  staffOverrides: StaffOverridesLike
  specialPrograms: SpecialProgram[]
  weekday?: Weekday
  stepStatus: StepStatus
  initializedSteps: Set<string>
  /** Developer-only helper to map UI cards ↔ staff_id. */
  showStaffIds?: boolean
  /** Render mode: interactive (scrollable) vs export (stacked, non-scroll). */
  renderMode?: 'interactive' | 'export'
  /** In export mode, max PCA staff columns per table chunk. */
  maxColumnsPerChunk?: number
}

type CellKind =
  | { kind: 'empty' }
  | { kind: 'team'; team: Team; isSubstitution?: boolean; isExtraCoverage?: boolean }
  | { kind: 'teamAndProgram'; team: Team; programName: string; isSubstitution?: boolean; isExtraCoverage?: boolean }
  | { kind: 'naLeave'; leaveType: string }
  | { kind: 'invalidSlot'; team: Team; timeRange: { start: string; end: string }; isSubstitution?: boolean; isExtraCoverage?: boolean }
  | { kind: 'mainPost'; team: Team }

type RowSlot = 1 | 2 | 3 | 4

type CellSpec = {
  rowSpan: number
  hidden: boolean
  cell: CellKind
}

function isValidSlot(n: number): n is RowSlot {
  return n === 1 || n === 2 || n === 3 || n === 4
}

function sortPCAColumns(staff: Staff[]): Staff[] {
  // Order: floating (including buffer) first, then non-floating; then name.
  return [...staff].sort((a, b) => {
    if (a.floating !== b.floating) return a.floating ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function getBaseFTEForStaff(s: Staff): number {
  if (s.status === 'buffer' && typeof s.buffer_fte === 'number') return s.buffer_fte
  return 1.0
}

function getProgramSlotsForWeekday(program: SpecialProgram, day: Weekday, staffId?: string): number[] {
  const rawSlots: any = (program as any).slots
  if (!rawSlots) return []

  // Shape A: weekday-keyed (ideal)
  const direct = rawSlots?.[day]
  if (Array.isArray(direct)) {
    return (direct as any[]).filter((s) => typeof s === 'number').sort((a, b) => a - b)
  }

  // Shape B: staffId-keyed
  if (staffId) {
    const staffDaySlots = rawSlots?.[staffId]?.[day]
    if (Array.isArray(staffDaySlots)) {
      return (staffDaySlots as any[]).filter((s) => typeof s === 'number').sort((a, b) => a - b)
    }
  }

  // Fallback: union across all staff configs for this weekday
  const set = new Set<number>()
  Object.values(rawSlots).forEach((v: any) => {
    const daySlots = v?.[day]
    if (Array.isArray(daySlots)) {
      daySlots.forEach((s: any) => {
        if (typeof s === 'number') set.add(s)
      })
    }
  })
  return Array.from(set).sort((a, b) => a - b)
}

function getFurthestPCAStage(stepStatus: StepStatus, initializedSteps: Set<string>): 'none' | 'step2' | 'step3' {
  const step3Progressed =
    initializedSteps.has('floating-pca') || (stepStatus['floating-pca'] && stepStatus['floating-pca'] !== 'pending')
  if (step3Progressed) return 'step3'

  const step2Progressed =
    initializedSteps.has('therapist-pca') || (stepStatus['therapist-pca'] && stepStatus['therapist-pca'] !== 'pending')
  if (step2Progressed) return 'step2'

  return 'none'
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size || 1))
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export function PCADedicatedScheduleTable({
  allPCAStaff,
  pcaAllocationsByTeam,
  staffOverrides,
  specialPrograms,
  weekday,
  stepStatus,
  initializedSteps,
  showStaffIds = false,
  renderMode = 'interactive',
  maxColumnsPerChunk = 10,
}: PCADedicatedScheduleTableProps) {
  const toast = useToast()
  const [refreshKey, setRefreshKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { visible: controlsVisible, poke: pokeControls, hideNow: hideControlsNow } = useAutoHideFlag({
    hideAfterMs: 3000,
  })

  useIsolatedWheelScroll(scrollRef, {
    enabled: true,
    mode: 'horizontal',
    horizontalUsesDominantDelta: true,
    onlyWhenOverflowing: true,
  })

  const stage = useMemo(() => getFurthestPCAStage(stepStatus, initializedSteps), [stepStatus, initializedSteps])

  const columns = useMemo(() => {
    // De-dupe by id, keep latest name fields from incoming list
    const byId = new Map<string, Staff>()
    // Defensive: snapshot/DB repair can occasionally surface partial/null rows.
    allPCAStaff.forEach((s) => {
      if (!s || typeof (s as any).id !== 'string') return
      byId.set((s as any).id, s)
    })
    const deduped = Array.from(byId.values())
    return sortPCAColumns(deduped)
  }, [allPCAStaff, refreshKey])

  const isExport = renderMode === 'export'
  const exportChunks = useMemo(() => {
    if (!isExport) return [columns]
    return chunkArray(columns, maxColumnsPerChunk)
  }, [columns, isExport, maxColumnsPerChunk])

  const allAllocations = useMemo(() => {
    // Flatten, de-dupe by allocation id + staff_id + team (defensive; schedule page sometimes duplicates in slot teams)
    const flat = Object.values(pcaAllocationsByTeam).flat()
    const seen = new Set<string>()
    const unique: Array<PCAAllocation & { staff: Staff }> = []
    for (const a of flat) {
      if (!a || typeof (a as any).staff_id !== 'string') continue
      const k = `${(a as any).id ?? 'no-id'}:${(a as any).staff_id}:${(a as any).team ?? 'no-team'}`
      if (seen.has(k)) continue
      seen.add(k)
      unique.push(a)
    }
    return unique
  }, [pcaAllocationsByTeam, refreshKey])

  const allocationByStaffId = useMemo(() => {
    // Prefer a single "canonical" allocation object per staff (to read leave_type/special_program_ids).
    const map = new Map<string, PCAAllocation & { staff: Staff }>()
    for (const a of allAllocations) {
      if (!map.has(a.staff_id)) map.set(a.staff_id, a)
    }
    return map
  }, [allAllocations, refreshKey])

  const slotTeamByStaffId = useMemo(() => {
    const map = new Map<string, Record<RowSlot, Team | null>>()
    for (const a of allAllocations) {
      const prev = map.get(a.staff_id) ?? { 1: null, 2: null, 3: null, 4: null }
      const next: Record<RowSlot, Team | null> = { ...prev }
      if (a.slot1) next[1] = a.slot1
      if (a.slot2) next[2] = a.slot2
      if (a.slot3) next[3] = a.slot3
      if (a.slot4) next[4] = a.slot4
      map.set(a.staff_id, next)
    }
    return map
  }, [allAllocations, refreshKey])

  const programNameByStaffIdBySlot = useMemo(() => {
    const byStaff = new Map<string, Partial<Record<RowSlot, string>>>()
    if (!weekday) {
      return byStaff
    }

    for (const a of allAllocations) {
      if (!Array.isArray(a.special_program_ids) || a.special_program_ids.length === 0) continue
      const staffSlots = byStaff.get(a.staff_id) ?? {}

      for (const programId of a.special_program_ids) {
        const program = specialPrograms.find((p) => p.id === programId)
        if (!program) continue
        if (!program.weekdays?.includes(weekday)) continue

        // Robotic & CRP have explicit slot-team mappings (same logic as existing UI).
        if (program.name === 'Robotic') {
          if (a.slot1 === 'SMM') staffSlots[1] = 'Robotic'
          if (a.slot2 === 'SMM') staffSlots[2] = 'Robotic'
          if (a.slot3 === 'SFM') staffSlots[3] = 'Robotic'
          if (a.slot4 === 'SFM') staffSlots[4] = 'Robotic'
          continue
        }
        if (program.name === 'CRP') {
          if (a.slot2 === 'CPPC') staffSlots[2] = 'CRP'
          continue
        }

        const slots = getProgramSlotsForWeekday(program, weekday, a.staff_id)
        for (const s of slots) {
          if (!isValidSlot(s)) continue
          // Mark program name for this slot if allocation actually assigns this slot somewhere
          const assignedTeam = (s === 1 ? a.slot1 : s === 2 ? a.slot2 : s === 3 ? a.slot3 : a.slot4) as Team | null
          if (assignedTeam) staffSlots[s] = program.name
        }
      }

      byStaff.set(a.staff_id, staffSlots)
    }

    return byStaff
  }, [allAllocations, specialPrograms, weekday, refreshKey])

  const invalidSlotByStaffId = useMemo(() => {
    const map = new Map<string, Partial<Record<RowSlot, { start: string; end: string }>>>()
    for (const s of columns) {
      const o = staffOverrides[s.id]
      const invalids = o?.invalidSlots ?? []
      const m: Partial<Record<RowSlot, { start: string; end: string }>> = {}
      invalids.forEach((inv) => {
        if (isValidSlot(inv.slot)) {
          m[inv.slot] = { start: inv.timeRange.start, end: inv.timeRange.end }
        }
      })

      if (Object.keys(m).length > 0) map.set(s.id, m)
    }
    return map
  }, [columns, staffOverrides, allocationByStaffId, refreshKey])

  const tableSpecs = useMemo(() => {
    const isPreAlgo = stage === 'none'

    const specsByStaffId = new Map<string, Record<RowSlot, CellSpec>>()

    for (const s of columns) {
      const o = staffOverrides[s.id]
      const alloc = allocationByStaffId.get(s.id)

      const leaveTypeRaw = (o?.leaveType ?? alloc?.leave_type ?? null) as LeaveType | null
      const onDuty = isOnDutyLeaveType(leaveTypeRaw)
      const leaveTypeLabel =
        !onDuty && typeof leaveTypeRaw === 'string' && leaveTypeRaw.trim() !== '' ? leaveTypeRaw : null

      const baseFTE = getBaseFTEForStaff(s)
      const remaining =
        typeof o?.fteRemaining === 'number'
          ? o.fteRemaining
          : typeof alloc?.fte_remaining === 'number'
            ? alloc.fte_remaining
            : baseFTE

      const leaveCost =
        typeof o?.fteSubtraction === 'number' ? o.fteSubtraction : Math.max(0, Math.min(baseFTE, baseFTE - remaining))

      const isFullDayLeaveCostOne = !onDuty && Math.abs(leaveCost - 1.0) < 0.01

      // Pre-fill specs with defaults
      const specs: Record<RowSlot, CellSpec> = {
        1: { rowSpan: 1, hidden: false, cell: { kind: 'empty' } },
        2: { rowSpan: 1, hidden: false, cell: { kind: 'empty' } },
        3: { rowSpan: 1, hidden: false, cell: { kind: 'empty' } },
        4: { rowSpan: 1, hidden: false, cell: { kind: 'empty' } },
      }

      // Full-day leave merge (cost due to leave = 1.0)
      if (isFullDayLeaveCostOne && leaveTypeLabel) {
        specs[1] = { rowSpan: 4, hidden: false, cell: { kind: 'naLeave', leaveType: leaveTypeLabel } }
        specs[2] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
        specs[3] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
        specs[4] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
        specsByStaffId.set(s.id, specs)
        continue
      }

      const invalids = invalidSlotByStaffId.get(s.id) ?? {}
      const programBySlot = programNameByStaffIdBySlot.get(s.id) ?? {}
      const slotTeams = slotTeamByStaffId.get(s.id) ?? { 1: null, 2: null, 3: null, 4: null }
      const substitutionBySlotEntry = normalizeSubstitutionForBySlot(o as any)

      if (!s.floating || isPreAlgo) {
        // Non-floating PCA: show 主位 for available-slot runs; NA for unavailable slots with leaveType.
        const homeTeam: Team | null = (s.team as Team | null) ?? (alloc?.team ?? null)
        const availableSlots =
          Array.isArray(o?.availableSlots) && o.availableSlots.length > 0
            ? o.availableSlots.filter((x) => typeof x === 'number' && isValidSlot(x)).sort((a, b) => a - b)
            : [1, 2, 3, 4]

        // If whole day on-duty and no special program and no invalid slots, show a single 主位 cell.
        // Special programs come from persisted allocations, so show them even pre-algorithm.
        const hasAnySpecialProgramSlot = Object.keys(programBySlot).length > 0
        const hasAnyInvalid = Object.keys(invalids).length > 0
        if (
          !s.floating &&
          !isPreAlgo &&
          homeTeam &&
          availableSlots.length === 4 &&
          !hasAnySpecialProgramSlot &&
          !hasAnyInvalid &&
          onDuty
        ) {
          specs[1] = { rowSpan: 4, hidden: false, cell: { kind: 'mainPost', team: homeTeam } }
          specs[2] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
          specs[3] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
          specs[4] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
          specsByStaffId.set(s.id, specs)
          continue
        }

        // Build per-slot base cell (before 主位 merging)
        const baseCells: Record<RowSlot, CellKind> = { 1: { kind: 'empty' }, 2: { kind: 'empty' }, 3: { kind: 'empty' }, 4: { kind: 'empty' } }
        for (const slot of [1, 2, 3, 4] as const) {
          const inv = invalids[slot]
          // Show special program labels even in stage 'none' (pre-algorithm).
          const prog = programBySlot[slot]
          // FIX: Also check if slot is assigned in allocation (for post-algorithm display)
          // This ensures slot 4 shows correctly even when slot 3 is invalid
          const isAssignedInAllocation = slotTeams[slot] !== null

          if (inv && homeTeam) {
            baseCells[slot] = { kind: 'invalidSlot', team: homeTeam, timeRange: inv }
            continue
          }

          // FIX: For non-floating PCA, if slot is assigned in allocation, show it even if not in availableSlots
          // (This handles edge cases where availableSlots might be incomplete)
          const isAvailable = availableSlots.includes(slot) || (isAssignedInAllocation && slotTeams[slot] === homeTeam)
          if (isAvailable) {
            if (homeTeam && prog) {
              baseCells[slot] = { kind: 'teamAndProgram', team: homeTeam, programName: prog }
            } else if (homeTeam) {
              // candidate for 主位 merge
              baseCells[slot] = { kind: 'team', team: homeTeam }
            } else {
              baseCells[slot] = { kind: 'empty' }
            }
          } else {
            // Not available: show NA + (leaveType) if leaveType exists, else empty
            if (leaveTypeLabel) {
              baseCells[slot] = { kind: 'naLeave', leaveType: leaveTypeLabel }
            } else {
              baseCells[slot] = { kind: 'empty' }
            }
          }
        }

        // Merge adjacent available slots into 主位 blocks where base cell is plain team (no program/invalid).
        const slots = [1, 2, 3, 4] as const
        if (!s.floating) {
          // Non-floating: enable 主位 merging
          let i = 0
          while (i < slots.length) {
            const slot = slots[i]
            const cell = baseCells[slot]
            const canMerge = cell.kind === 'team'
            if (!canMerge) {
              specs[slot] = { rowSpan: 1, hidden: false, cell }
              i += 1
              continue
            }

            // find run length
            let j = i
            while (j < slots.length && baseCells[slots[j]].kind === 'team') j += 1
            const runLen = j - i

            const team = (cell as any).team as Team
            // Even a single isolated non-floating slot should still display "<Team> 主位"
            // (otherwise non-adjacent runs break the 主位 pattern when a slot is used for special programs).
            specs[slot] = { rowSpan: runLen, hidden: false, cell: { kind: 'mainPost', team } }
            for (let k = i + 1; k < j; k++) {
              const hiddenSlot = slots[k]
              specs[hiddenSlot] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
            }
            i = j
          }
        } else {
          // Pre-algorithm floating PCA: no merging, just base cells
          for (const slot of slots) {
            specs[slot] = { rowSpan: 1, hidden: false, cell: baseCells[slot] }
          }
        }

        specsByStaffId.set(s.id, specs)
        continue
      }

      // Floating PCA (Step 2/3): show team assignment per slot; program line if applicable.
      // First, build base cells for each slot
      const baseCells: Record<RowSlot, CellKind> = { 1: { kind: 'empty' }, 2: { kind: 'empty' }, 3: { kind: 'empty' }, 4: { kind: 'empty' } }
      const substitutionBySlot: Record<RowSlot, boolean> = { 1: false, 2: false, 3: false, 4: false }

      // For floating PCAs, `availableSlots` can encode partial-day leave (e.g. half-day VL).
      // When a slot is NOT available and has no team assignment, we still want to show NA + leaveType.
      const availableSlotsForFloating =
        Array.isArray(o?.availableSlots) && o.availableSlots.length > 0
          ? o.availableSlots.filter((x) => typeof x === 'number' && isValidSlot(x)).sort((a, b) => a - b)
          : null
      
      for (const slot of [1, 2, 3, 4] as const) {
        const assignedTeam = slotTeams[slot]
        const inv = invalids[slot]
        const prog = programBySlot[slot]
        const isExtraCoverage = !!(o as any)?.extraCoverageBySlot?.[slot]

        const substitutionEntry = substitutionBySlotEntry[slot]
        const isSubstitution = !!assignedTeam && !!substitutionEntry && substitutionEntry.team === assignedTeam
        substitutionBySlot[slot] = isSubstitution

        // Invalid slots should render even if this slot isn't assigned (displayTeam comes from paired slot).
        if (inv) {
          const pairedSlot: RowSlot | null = slot === 1 ? 2 : slot === 2 ? 1 : slot === 3 ? 4 : slot === 4 ? 3 : null
          const pairedTeam = pairedSlot ? slotTeams[pairedSlot] : null
          const displayTeam = pairedTeam ?? assignedTeam
          const slotSubEntry = substitutionBySlotEntry[slot]
          const pairedSubEntry = pairedSlot ? substitutionBySlotEntry[pairedSlot] : undefined
          const invIsSub = !!displayTeam && (
            (!!slotSubEntry && slotSubEntry.team === displayTeam) ||
            (!!pairedSubEntry && pairedSubEntry.team === displayTeam)
          )

          if (!displayTeam) {
            // No team context → show empty.
            baseCells[slot] = { kind: 'empty' }
          } else {
            baseCells[slot] = { kind: 'invalidSlot', team: displayTeam, timeRange: inv, isSubstitution: invIsSub, isExtraCoverage }
          }
          continue
        }

        if (!assignedTeam) {
          // If slot is unavailable (via availableSlots) and we have a leave label, show NA(leave).
          if (availableSlotsForFloating && !availableSlotsForFloating.includes(slot) && leaveTypeLabel) {
            baseCells[slot] = { kind: 'naLeave', leaveType: leaveTypeLabel }
          } else {
            baseCells[slot] = { kind: 'empty' }
          }
          continue
        }

        if (prog) {
          baseCells[slot] = { kind: 'teamAndProgram', team: assignedTeam, programName: prog, isSubstitution, isExtraCoverage }
        } else {
          baseCells[slot] = { kind: 'team', team: assignedTeam, isSubstitution, isExtraCoverage }
        }
      }

      // Merge adjacent slots assigned to the same team (only for plain 'team' cells, not program/invalid)
      const slots = [1, 2, 3, 4] as const
      let i = 0
      while (i < slots.length) {
        const slot = slots[i]
        const cell = baseCells[slot]
        
        // Merge plain 'team' cells and adjacent NA(leave) cells (same leaveType).
        const canMerge = cell.kind === 'team' || cell.kind === 'naLeave'
        if (!canMerge) {
          specs[slot] = { rowSpan: 1, hidden: false, cell }
          i += 1
          continue
        }

        // Find run length: adjacent slots with same team, same substitution status, and no program/invalid
        let j = i
        const firstTeam = cell.kind === 'team' ? ((cell as any).team as Team) : null
        const firstLeaveType = cell.kind === 'naLeave' ? ((cell as any).leaveType as string) : null
        const firstSubstitution = cell.kind === 'team' ? substitutionBySlot[slot] : false
        
        while (j < slots.length) {
          const checkSlot = slots[j]
          const checkCell = baseCells[checkSlot]
          
          // Can merge if:
          // 1. Same kind ('team')
          // 2. Same team
          // 3. Same substitution status
          if (cell.kind === 'team') {
            if (
              checkCell.kind === 'team' &&
              (checkCell as any).team === firstTeam &&
              substitutionBySlot[checkSlot] === firstSubstitution
            ) {
              j += 1
              continue
            }
            break
          }

          // NA leave merge: same leave type, no substitution dimension.
          if (cell.kind === 'naLeave') {
            if (checkCell.kind === 'naLeave' && (checkCell as any).leaveType === firstLeaveType) {
              j += 1
              continue
            }
            break
          }
        }
        
        const runLen = j - i
        
        if (runLen >= 2) {
          // Merge adjacent slots: show first slot with rowSpan, hide others
          specs[slot] = { 
            rowSpan: runLen, 
            hidden: false, 
            cell // Use the original cell (already verified to have same team/substitution)
          }
          for (let k = i + 1; k < j; k++) {
            const hiddenSlot = slots[k]
            specs[hiddenSlot] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
          }
        } else {
          // Single slot: show as-is
          specs[slot] = { rowSpan: 1, hidden: false, cell }
        }
        
        i = j
      }

      specsByStaffId.set(s.id, specs)
    }

    return specsByStaffId
  }, [
    stage,
    columns,
    staffOverrides,
    allocationByStaffId,
    slotTeamByStaffId,
    programNameByStaffIdBySlot,
    invalidSlotByStaffId,
    refreshKey,
  ])

  const renderCellContent = (cell: CellKind) => {
    const commonLine1 = 'text-center leading-tight'
    const commonLine2 = 'text-center leading-tight whitespace-normal break-words'
    const substitutionTeamClass =
      'text-green-700 dark:text-green-400 underline underline-offset-2 decoration-2 font-bold'

    if (cell.kind === 'empty') return null

    if (cell.kind === 'naLeave') {
      return (
        <div className="flex flex-col items-center justify-center px-1">
          <div className={commonLine1}>NA</div>
          <div className={`${commonLine2} text-xs text-muted-foreground max-w-[7.5rem]`}>({cell.leaveType})</div>
        </div>
      )
    }

    if (cell.kind === 'mainPost') {
      return (
        <div className="flex items-center justify-center px-1">
          <div className="text-center font-medium leading-tight whitespace-normal">
            <span>{cell.team} </span>
            <span className="whitespace-nowrap">主位</span>
          </div>
        </div>
      )
    }

    if (cell.kind === 'invalidSlot') {
      const teamClass = cell.isSubstitution ? substitutionTeamClass : 'font-medium'
      const teamLabel = cell.isSubstitution ? `${cell.team} 替位` : cell.team
      return (
        <div className="flex flex-col items-center justify-center px-1">
          <div className={`${commonLine1} ${teamClass}`}>
            {teamLabel}
            {cell.isExtraCoverage ? (
              <span className="ml-1 text-[10px] font-semibold text-purple-700 dark:text-purple-300">Extra</span>
            ) : null}
          </div>
          <div className={`${commonLine2} text-blue-600 text-xs`}>
            ({cell.timeRange.start}-{cell.timeRange.end})
          </div>
        </div>
      )
    }

    if (cell.kind === 'teamAndProgram') {
      const teamClass = cell.isSubstitution ? substitutionTeamClass : 'font-medium'
      const teamLabel = cell.isSubstitution ? `${cell.team} 替位` : cell.team
      return (
        <div className="flex flex-col items-center justify-center px-1">
          <div className={`${commonLine1} ${teamClass}`}>
            {teamLabel}
            {cell.isExtraCoverage ? (
              <span className="ml-1 text-[10px] font-semibold text-purple-700 dark:text-purple-300">Extra</span>
            ) : null}
          </div>
          <div className={`${commonLine2} text-red-600 text-xs font-medium`}>{cell.programName}</div>
        </div>
      )
    }

    if (cell.kind === 'team') {
      const teamClass = cell.isSubstitution ? substitutionTeamClass : 'font-medium'
      const teamLabel = cell.isSubstitution ? `${cell.team} 替位` : cell.team
      return (
        <div className="flex items-center justify-center px-1">
          <div className={`${commonLine1} ${teamClass}`}>
            {teamLabel}
            {cell.isExtraCoverage ? (
              <span className="ml-1 text-[10px] font-semibold text-purple-700 dark:text-purple-300">Extra</span>
            ) : null}
          </div>
        </div>
      )
    }

    return null
  }

  const tableNodeForColumns = (cols: Staff[], keyPrefix: string, opts?: { stickyLeft?: boolean }) => {
    const sticky = opts?.stickyLeft !== false
    // Keep sticky just above normal cells, but below overlay controls (scroll buttons).
    // NOTE: Table paint order with border-collapse can cause sticky cells to appear "non-sticky"
    // if they are painted underneath scrolled cells. Give them a high z-index so they always stay visible.
    const stickyClass = sticky ? 'sticky left-0 z-50 rbip-sticky-col-divider' : ''
    const stickyBg = 'bg-background'
    return (
      <table className={cn('border-collapse', sticky ? 'w-full min-w-max' : 'w-full')}>
        <thead>
          <tr>
            <th
              className={cn(
                stickyClass,
                stickyBg,
                'border-b border-r px-1 py-1 text-center text-xs font-semibold min-w-[72px]'
              )}
            >
              {/* empty corner */}
            </th>
            {cols.map((s) => (
              <th
                key={s.id}
                className="border-b border-r px-1 py-1 text-center text-xs font-semibold min-w-[80px] max-w-[100px]"
              >
                <div className="whitespace-normal break-words leading-tight">{s.name}</div>
                {showStaffIds ? (
                  <div
                    className="mt-0.5 font-normal text-[10px] leading-tight text-muted-foreground whitespace-normal break-all"
                    title={s.id}
                  >
                    {s.id.slice(0, 8)}
                  </div>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {([1, 2, 3, 4] as const).map((slot) => (
            <tr key={`${keyPrefix}-slot-${slot}`}>
              <th
                className={cn(
                  stickyClass,
                  stickyBg,
                  'border-b border-r px-1 py-1 text-center text-xs font-semibold min-w-[72px]'
                )}
              >
                Slot {slot}
              </th>
              {cols.map((s) => {
                const spec = tableSpecs.get(s.id)?.[slot]
                if (!spec || spec.hidden) return null

                return (
                  <td
                    key={`${keyPrefix}-${s.id}-${slot}`}
                    rowSpan={spec.rowSpan}
                    className="border-b border-r px-1 py-1 align-middle text-center min-w-[80px] max-w-[100px]"
                  >
                    {renderCellContent(spec.cell)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (isExport) {
    return (
      <div className="mt-3">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h3 className="text-xs font-semibold text-center">PCA Dedicated Schedule</h3>
        </div>

        <div className="space-y-2">
          {exportChunks.map((cols, idx) => (
            <div key={`export-chunk-${idx}`} className="w-full border rounded-md overflow-hidden">
              {exportChunks.length > 1 ? (
                <div className="border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
                  PCA columns {idx + 1}/{exportChunks.length}
                </div>
              ) : null}
              <div className="w-full">
                {tableNodeForColumns(cols, `export-${idx}`, { stickyLeft: false })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-center">PCA Dedicated Schedule</h3>
        <Tooltip side="top" content="Refresh">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh table"
            className="h-6 w-6 opacity-60 hover:opacity-100 rbip-hover-scale rbip-refresh-action"
            onClick={() => {
              setRefreshKey((x) => x + 1)
              toast.success('Table refreshed')
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>

      <div
        className="relative w-full border rounded-md"
        onMouseEnter={pokeControls}
        onMouseMove={pokeControls}
        onMouseLeave={hideControlsNow}
      >
        <div
          ref={scrollRef}
          className={`w-full overflow-x-auto overscroll-x-contain pca-like-scrollbar ${
            controlsVisible ? '' : 'pca-like-scrollbar--hidden'
          }`}
        >
          {tableNodeForColumns(columns, 'interactive', { stickyLeft: true })}
        </div>

        {/* Horizontal scroll controls - ensuring z-index to stay on top */}
        <button
          type="button"
          className={`absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-background/90 border border-border shadow-xs flex items-center justify-center hover:bg-accent/80 z-70 transition-opacity ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => {
            const el = scrollRef.current
            if (!el) return
            el.scrollBy({ left: -160, behavior: 'smooth' })
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-background/90 border border-border shadow-xs flex items-center justify-center hover:bg-accent/80 z-70 transition-opacity ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => {
            const el = scrollRef.current
            if (!el) return
            el.scrollBy({ left: 160, behavior: 'smooth' })
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

