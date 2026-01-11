'use client'

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { Team, LeaveType } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff } from '@/types/staff'
import type { SpecialProgram } from '@/types/allocation'
import { Button } from '@/components/ui/button'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'

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
    leaveComebackTime?: string
    isLeave?: boolean
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
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
}

type CellKind =
  | { kind: 'empty' }
  | { kind: 'team'; team: Team; isSubstitution?: boolean }
  | { kind: 'teamAndProgram'; team: Team; programName: string; isSubstitution?: boolean }
  | { kind: 'naLeave'; leaveType: string }
  | { kind: 'invalidSlot'; team: Team; timeRange: { start: string; end: string }; isSubstitution?: boolean }
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

export function PCADedicatedScheduleTable({
  allPCAStaff,
  pcaAllocationsByTeam,
  staffOverrides,
  specialPrograms,
  weekday,
  stepStatus,
  initializedSteps,
}: PCADedicatedScheduleTableProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [controlsVisible, setControlsVisible] = useState(false)
  const hideControlsTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onWheelNative = (ev: WheelEvent) => {
      const hasOverflow = el.scrollWidth > el.clientWidth + 1
      if (!hasOverflow) return

      // Convert wheel vertical -> horizontal, and block page scroll.
      ev.preventDefault()
      ev.stopPropagation()

      const delta = Math.abs(ev.deltaY) > Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX
      el.scrollLeft += delta
    }

    el.addEventListener('wheel', onWheelNative, { passive: false })

    return () => {
      el.removeEventListener('wheel', onWheelNative as EventListener)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current)
    }
  }, [])

  const pokeControls = useCallback(() => {
    setControlsVisible(true)
    if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  const hideControlsNow = useCallback(() => {
    if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = null
    setControlsVisible(false)
  }, [])

  const stage = useMemo(() => getFurthestPCAStage(stepStatus, initializedSteps), [stepStatus, initializedSteps])

  const columns = useMemo(() => {
    // De-dupe by id, keep latest name fields from incoming list
    const byId = new Map<string, Staff>()
    allPCAStaff.forEach((s) => byId.set(s.id, s))
    const deduped = Array.from(byId.values())
    return sortPCAColumns(deduped)
  }, [allPCAStaff, refreshKey])

  const allAllocations = useMemo(() => {
    // Flatten, de-dupe by allocation id + staff_id + team (defensive; schedule page sometimes duplicates in slot teams)
    const flat = Object.values(pcaAllocationsByTeam).flat()
    const seen = new Set<string>()
    const unique: Array<PCAAllocation & { staff: Staff }> = []
    for (const a of flat) {
      const k = `${a.id}:${a.staff_id}:${a.team}`
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
    if (!weekday) return byStaff

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

      // Backward-compat fallback to allocation.invalid_slot + leave_comeback_time if needed
      if (Object.keys(m).length === 0) {
        const a = allocationByStaffId.get(s.id)
        const legacySlot = (a as any)?.invalid_slot as number | undefined
        const legacyTime = (a as any)?.leave_comeback_time as string | undefined
        if (typeof legacySlot === 'number' && isValidSlot(legacySlot) && typeof legacyTime === 'string') {
          // We cannot accurately reconstruct interval without direction (leave/come_back),
          // so fall back to showing the raw HH:MM as HHMM-HHMM by using slot bounds.
          const slotBounds: Record<RowSlot, { start: string; end: string }> = {
            1: { start: '0900', end: '1030' },
            2: { start: '1030', end: '1200' },
            3: { start: '1330', end: '1500' },
            4: { start: '1500', end: '1630' },
          }
          const time4 = legacyTime.replace(':', '')
          const base = slotBounds[legacySlot]
          m[legacySlot] = { start: base.start, end: time4 || base.end }
        }
      }

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
      const substitution = o?.substitutionFor
      const substitutedTeam = substitution?.team
      const substitutedSlots = new Set<number>(Array.isArray(substitution?.slots) ? substitution!.slots : [])

      if (!s.floating || isPreAlgo) {
        // Non-floating PCA: show 主位 for available-slot runs; NA for unavailable slots with leaveType.
        const homeTeam: Team | null = (s.team as Team | null) ?? (alloc?.team ?? null)
        const availableSlots =
          Array.isArray(o?.availableSlots) && o.availableSlots.length > 0
            ? o.availableSlots.filter((x) => typeof x === 'number' && isValidSlot(x)).sort((a, b) => a - b)
            : [1, 2, 3, 4]

        // If whole day on-duty and no special program and no invalid slots, show a single 主位 cell.
        const hasAnySpecialProgramSlot = !isPreAlgo && Object.keys(programBySlot).length > 0
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
          const prog = !isPreAlgo ? programBySlot[slot] : undefined

          if (inv && homeTeam) {
            baseCells[slot] = { kind: 'invalidSlot', team: homeTeam, timeRange: inv }
            continue
          }

          const isAvailable = availableSlots.includes(slot)
          if (isAvailable) {
            if (!isPreAlgo && homeTeam && prog) {
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
            if (runLen >= 2) {
              specs[slot] = { rowSpan: runLen, hidden: false, cell: { kind: 'mainPost', team } }
              for (let k = i + 1; k < j; k++) {
                const hiddenSlot = slots[k]
                specs[hiddenSlot] = { rowSpan: 1, hidden: true, cell: { kind: 'empty' } }
              }
            } else {
              // single available slot: show team (not 主位 merge)
              specs[slot] = { rowSpan: 1, hidden: false, cell: { kind: 'team', team } }
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
      for (const slot of [1, 2, 3, 4] as const) {
        const assignedTeam = slotTeams[slot]
        const inv = invalids[slot]
        const prog = programBySlot[slot]

        const isSubstitution =
          !!assignedTeam && assignedTeam === substitutedTeam && substitutedSlots.has(slot)

        if (!assignedTeam) {
          specs[slot] = { rowSpan: 1, hidden: false, cell: { kind: 'empty' } }
          continue
        }

        if (inv) {
          specs[slot] = {
            rowSpan: 1,
            hidden: false,
            cell: { kind: 'invalidSlot', team: assignedTeam, timeRange: inv, isSubstitution },
          }
          continue
        }

        if (prog) {
          specs[slot] = {
            rowSpan: 1,
            hidden: false,
            cell: { kind: 'teamAndProgram', team: assignedTeam, programName: prog, isSubstitution },
          }
        } else {
          specs[slot] = { rowSpan: 1, hidden: false, cell: { kind: 'team', team: assignedTeam, isSubstitution } }
        }
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
      const teamClass = cell.isSubstitution ? 'text-green-700 underline font-medium' : 'font-medium'
      return (
        <div className="flex flex-col items-center justify-center px-1">
          <div className={`${commonLine1} ${teamClass}`}>{cell.team}</div>
          <div className={`${commonLine2} text-blue-600 text-xs`}>
            ({cell.timeRange.start}-{cell.timeRange.end})
          </div>
        </div>
      )
    }

    if (cell.kind === 'teamAndProgram') {
      const teamClass = cell.isSubstitution ? 'text-green-700 underline font-medium' : 'font-medium'
      return (
        <div className="flex flex-col items-center justify-center px-1">
          <div className={`${commonLine1} ${teamClass}`}>{cell.team}</div>
          <div className={`${commonLine2} text-red-600 text-xs font-medium`}>{cell.programName}</div>
        </div>
      )
    }

    if (cell.kind === 'team') {
      const teamClass = cell.isSubstitution ? 'text-green-700 underline font-medium' : 'font-medium'
      return (
        <div className="flex items-center justify-center px-1">
          <div className={`${commonLine1} ${teamClass}`}>{cell.team}</div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-center">PCA Dedicated Schedule</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-60 hover:opacity-100"
          onClick={() => setRefreshKey((x) => x + 1)}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        className="relative w-full border rounded-md"
        onMouseEnter={pokeControls}
        onMouseMove={pokeControls}
        onMouseLeave={hideControlsNow}
      >
        <style jsx>{`
          .pca-scroll-container::-webkit-scrollbar {
            height: 12px;
          }
          .pca-scroll-container::-webkit-scrollbar-track {
            background: #e5e7eb;
            border-bottom-right-radius: 0.375rem;
            border-bottom-left-radius: 0.375rem;
          }
          .pca-scroll-container::-webkit-scrollbar-thumb {
            background-color: #9ca3af;
            border-radius: 6px;
            border: 3px solid #e5e7eb;
          }
          .pca-scroll-container::-webkit-scrollbar-thumb:hover {
            background-color: #6b7280;
          }
          :global(.dark) .pca-scroll-container::-webkit-scrollbar-track {
            background: #1f2937;
            border: 3px solid #1f2937;
          }
          :global(.dark) .pca-scroll-container::-webkit-scrollbar-thumb {
            background-color: #4b5563;
            border: 3px solid #1f2937;
          }
          :global(.dark) .pca-scroll-container::-webkit-scrollbar-thumb:hover {
            background-color: #6b7280;
          }

          .pca-scroll-container--hidden {
            scrollbar-width: none;
          }
          .pca-scroll-container--hidden::-webkit-scrollbar {
            height: 0px;
          }
          .pca-scroll-container--hidden::-webkit-scrollbar-track {
            background: transparent;
          }
          .pca-scroll-container--hidden::-webkit-scrollbar-thumb {
            background: transparent;
            border: 0;
          }
        `}</style>
        <div
          ref={scrollRef}
          className={`w-full overflow-x-auto overscroll-x-contain pca-scroll-container ${
            controlsVisible ? '' : 'pca-scroll-container--hidden'
          }`}
        >
          <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background border-b border-r px-1 py-1 text-center text-xs font-semibold min-w-[72px]">
                {/* empty corner */}
              </th>
              {columns.map((s) => (
                <th
                  key={s.id}
                  className="border-b border-r px-1 py-1 text-center text-xs font-semibold min-w-[80px] max-w-[100px]"
                >
                  <div className="whitespace-normal break-words leading-tight">{s.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([1, 2, 3, 4] as const).map((slot) => (
              <tr key={slot}>
                <th className="sticky left-0 z-10 bg-background border-b border-r px-1 py-1 text-center text-xs font-semibold min-w-[72px]">
                  Slot {slot}
                </th>
                {columns.map((s) => {
                  const spec = tableSpecs.get(s.id)?.[slot]
                  if (!spec || spec.hidden) return null

                  return (
                    <td
                      key={`${s.id}-${slot}`}
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
        </div>

        {/* Horizontal scroll controls - ensuring z-index to stay on top */}
        <button
          type="button"
          className={`absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-background/90 border shadow-sm flex items-center justify-center hover:bg-accent/80 z-20 transition-opacity ${
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
          className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-background/90 border shadow-sm flex items-center justify-center hover:bg-accent/80 z-20 transition-opacity ${
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

