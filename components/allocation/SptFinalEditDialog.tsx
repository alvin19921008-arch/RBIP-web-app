'use client'

import * as React from 'react'
import { Check, Plus, RotateCcw, Trash2, ArrowLeft, Briefcase, AlertCircle, X } from 'lucide-react'

import type { Staff, Team, Weekday, LeaveType } from '@/types/staff'
import type { SptWeekdayComputed } from '@/lib/features/schedule/sptConfig'
import type { StaffOverrideState, SptOnDayOverrideState } from '@/lib/features/schedule/controller/useScheduleController'

import { cn } from '@/lib/utils'
import { RBIP_WIDE_DIALOG_WIDTH_CLASS } from '@/lib/layoutWidth'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HorizontalCardCarousel } from '@/components/ui/horizontal-card-carousel'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

const LEAVE_TYPES: Exclude<LeaveType, null>[] = [
  'VL',
  'half day VL',
  'TIL',
  'half day TIL',
  'SDO',
  'sick leave',
  'study leave',
  'medical follow-up',
  'others',
]

const SPT_FULL_LEAVE_TYPES_FORCE_DISABLE = new Set<string>(['VL', 'SDO', 'TIL', 'sick leave'])

type SlotMode = 'AND' | 'OR'
type SlotModeChoice = SlotMode | null

type SPTState = 'working' | 'leave' | 'off'

function normalizeSlotModes(m: any): { am: SlotMode; pm: SlotMode } {
  const am: SlotMode = m?.am === 'OR' ? 'OR' : 'AND'
  const pm: SlotMode = m?.pm === 'OR' ? 'OR' : 'AND'
  return { am, pm }
}

function clampSlotModeChoices(args: { slots: number[]; slotModes: { am: SlotModeChoice; pm: SlotModeChoice } }): { am: SlotModeChoice; pm: SlotModeChoice } {
  const slots = uniqueSortedSlots(args.slots)
  const amSlots = slots.filter((s) => s === 1 || s === 2)
  const pmSlots = slots.filter((s) => s === 3 || s === 4)
  const needsAMMode = amSlots.length > 1
  const needsPMMode = pmSlots.length > 1
  return {
    am: needsAMMode ? (args.slotModes.am ?? 'AND') : null,
    pm: needsPMMode ? (args.slotModes.pm ?? 'AND') : null,
  }
}

function uniqueSortedSlots(slots: number[]): number[] {
  const set = new Set<number>()
  for (const s of Array.isArray(slots) ? slots : []) {
    if ([1, 2, 3, 4].includes(s)) set.add(s)
  }
  return Array.from(set).sort((a, b) => a - b)
}

function computeEffectiveSlotCountForHalfDay(slots: number[], mode: SlotMode): number {
  if (slots.length === 0) return 0
  if (mode === 'OR' && slots.length > 1) return 1
  return slots.length
}

function deriveSlotDisplay(slots: number[]): { hasAM: boolean; hasPM: boolean; slotDisplay: 'AM' | 'PM' | 'AM+PM' | null } {
  const hasAM = slots.some((s) => s === 1 || s === 2)
  const hasPM = slots.some((s) => s === 3 || s === 4)
  const slotDisplay = hasAM && hasPM ? 'AM+PM' : hasAM ? 'AM' : hasPM ? 'PM' : null
  return { hasAM, hasPM, slotDisplay }
}

function computeConfiguredBaseFte(args: {
  enabled: boolean
  contributesFte: boolean
  slots: number[]
  slotModes: { am: SlotModeChoice; pm: SlotModeChoice }
}): { effectiveSlots: { am: number; pm: number; total: number }; baseFte: number; slotDisplay: 'AM' | 'PM' | 'AM+PM' | null } {
  const slots = uniqueSortedSlots(args.slots)
  const slotModes = normalizeSlotModes(args.slotModes)
  const amSlots = slots.filter((s) => s === 1 || s === 2)
  const pmSlots = slots.filter((s) => s === 3 || s === 4)
  const effectiveAM = computeEffectiveSlotCountForHalfDay(amSlots, slotModes.am)
  const effectivePM = computeEffectiveSlotCountForHalfDay(pmSlots, slotModes.pm)
  const effectiveTotal = effectiveAM + effectivePM
  const baseFte = args.enabled && args.contributesFte ? effectiveTotal * 0.25 : 0
  const { slotDisplay } = deriveSlotDisplay(slots)
  return { effectiveSlots: { am: effectiveAM, pm: effectivePM, total: effectiveTotal }, baseFte, slotDisplay }
}

function buildSlotDisplayText(effectiveSlots: { am: number; pm: number }): string {
  const amFte = effectiveSlots.am * 0.25
  const pmFte = effectiveSlots.pm * 0.25
  if (amFte > 0 && pmFte > 0) return `${formatFteShort(amFte)} AM + ${formatFteShort(pmFte)} PM`
  if (amFte > 0) return `${formatFteShort(amFte)} AM`
  if (pmFte > 0) return `${formatFteShort(pmFte)} PM`
  return '—'
}

type CardState = {
  staffId: string
  staffName: string
  allowedTeams: Team[]
  origin: 'initial' | 'added'

  // Dashboard baseline (read-only)
  dashboard: {
    enabled: boolean
    contributesFte: boolean
    slots: number[]
    slotModes: { am: SlotMode; pm: SlotMode }
    displayText: string | null
    baseFte: number
  }

  // Primary state - determines which fields are shown
  state: SPTState

  // Editable on-day config
  enabled: boolean
  contributesFte: boolean
  slots: number[]
  slotModes: { am: SlotModeChoice; pm: SlotModeChoice }
  displayText: string | null

  leaveType: LeaveType | null
  leaveCostInput: string
  customLeaveType?: string // For 'others' leave type with custom text

  /** 'AUTO' means use suggested team at confirm time. */
  teamChoice: Team | 'AUTO'
}

function formatFte(x: number): string {
  if (!Number.isFinite(x)) return '0.00'
  return x.toFixed(2)
}

function formatFteShort(x: number): string {
  if (!Number.isFinite(x)) return '0'
  return x
    .toFixed(2)
    .replace(/\.?0+$/, '')
}

function clampLeaveCost(raw: number, baseFte: number): number {
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(raw, baseFte))
}

export function SptFinalEditDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekday: Weekday

  /** All SPT staff that can be added. */
  sptStaff: Staff[]
  /** Dashboard weekday config (computed) */
  sptWeekdayByStaffId: Record<string, SptWeekdayComputed>
  /** Allowed teams from SPT dashboard config (staff_id -> teams[]) */
  sptTeamsByStaffId?: Record<string, Team[]>

  staffOverrides: Record<string, StaffOverrideState>
  /** Current allocations (after Step 2 algo), used for team suggestion + preview. */
  currentAllocationByStaffId: Record<string, { team: Team; fte: number } | null>
  /** Current PT-FTE/team (from calculations). */
  ptPerTeamByTeam: Record<Team, number>

  onConfirm: (updates: Record<string, {
    leaveType: LeaveType | null
    fteSubtraction: number
    fteRemaining: number
    team?: Team
    sptOnDayOverride: SptOnDayOverrideState
  }>) => void
  onSkip: () => void
  onBack?: () => void
}) {
  const {
    open,
    onOpenChange,
    weekday,
    sptStaff,
    sptWeekdayByStaffId,
    sptTeamsByStaffId,
    staffOverrides,
    currentAllocationByStaffId,
    ptPerTeamByTeam,
    onConfirm,
    onSkip,
    onBack,
  } = props

  const staffById = React.useMemo(() => {
    const m = new Map<string, Staff>()
    sptStaff.forEach((s) => m.set(s.id, s))
    return m
  }, [sptStaff])

  const [cards, setCards] = React.useState<CardState[]>([])
  const [addStaffId, setAddStaffId] = React.useState<string>('')
  const [deletedInitialStaffIds, setDeletedInitialStaffIds] = React.useState<string[]>([])

  const candidateAddList = React.useMemo(() => {
    const existing = new Set(cards.map((c) => c.staffId))
    return sptStaff
      .filter((s) => !existing.has(s.id))
      // Only show SPTs that have NO configured duty for this weekday (dashboard baseFte=0),
      // but are still on-duty today (not on leave) so they can be added ad hoc.
      .filter((s) => {
        const cfgBase = sptWeekdayByStaffId?.[s.id]?.baseFte ?? 0
        if (cfgBase > 0) return false
        const o = staffOverrides?.[s.id]
        // If user marked them as fully not on duty (leave), exclude.
        if (o && typeof o.fteRemaining === 'number' && o.fteRemaining <= 0 && !isOnDutyLeaveType(o.leaveType as any)) {
          return false
        }
        return true
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [cards, sptStaff, sptWeekdayByStaffId, staffOverrides])

  const buildInitialCards = React.useCallback((): CardState[] => {
    const visible = new Set<string>()

    // 1) Show all SPTs configured as enabled for this weekday (dashboard baseline).
    Object.entries(sptWeekdayByStaffId).forEach(([staffId, cfg]) => {
      // Only show SPTs that actually have duty on this day (baseFte > 0).
      // This matches the intent: Step 2.2 is a final preview for on-duty SPTs.
      if ((cfg?.baseFte ?? 0) > 0) visible.add(staffId)
    })

    // 2) Also show any SPTs that already have an on-day override (only if it would allocate).
    Object.entries(staffOverrides || {}).forEach(([staffId, o]) => {
      const onDay = (o as any)?.sptOnDayOverride
      const enabled = !!onDay?.enabled
      const slots = Array.isArray(onDay?.slots) ? onDay.slots : []
      if (enabled && slots.length > 0) visible.add(staffId)
    })

    // 3) Also show any SPT that is already allocated by Step 2 results.
    Object.entries(currentAllocationByStaffId || {}).forEach(([staffId, alloc]) => {
      if (alloc?.team) visible.add(staffId)
    })

    const list = Array.from(visible)
      .map((id) => staffById.get(id))
      .filter((s): s is Staff => !!s)
      .sort((a, b) => a.name.localeCompare(b.name))

    return list.map((s) => {
      const dash = sptWeekdayByStaffId[s.id]
      const dashEnabled = !!dash?.enabled
      const dashContrib = !!dash?.contributesFte
      const dashSlots = uniqueSortedSlots(dash?.slots ?? [])
      const dashModes = normalizeSlotModes(dash?.slotModes ?? { am: 'AND', pm: 'AND' })
      const dashDisplayText = typeof dash?.displayText === 'string' ? dash.displayText : null
      const dashBaseFte = typeof dash?.baseFte === 'number' ? dash.baseFte : 0

      const existing = staffOverrides[s.id]
      const existingOnDay = existing?.sptOnDayOverride

      const enabled = existingOnDay ? !!existingOnDay.enabled : dashEnabled
      const contributesFte = existingOnDay ? !!existingOnDay.contributesFte : dashContrib
      const slots = uniqueSortedSlots(existingOnDay?.slots ?? dashSlots)
      const slotModes = clampSlotModeChoices({
        slots: uniqueSortedSlots(existingOnDay?.slots ?? dashSlots),
        slotModes: {
          am: (existingOnDay?.slotModes as any)?.am ?? dashModes.am,
          pm: (existingOnDay?.slotModes as any)?.pm ?? dashModes.pm,
        },
      })
      const displayText =
        existingOnDay && 'displayText' in existingOnDay
          ? (existingOnDay.displayText ?? null)
          : dashDisplayText

      // Handle leave type - if it's a custom type (not in standard list), split it into 'others' + custom text
      let rawLeaveType = existing?.leaveType ?? null
      let leaveType: LeaveType | null = rawLeaveType
      let customLeaveType: string | undefined = undefined
      
      if (rawLeaveType && !LEAVE_TYPES.includes(rawLeaveType as any)) {
        // Custom leave type stored as the actual text - split into 'others' + custom text
        leaveType = 'others'
        customLeaveType = rawLeaveType
      }
      
      const forceDisableByLeave =
        typeof leaveType === 'string' && SPT_FULL_LEAVE_TYPES_FORCE_DISABLE.has(leaveType)
      const leaveCost =
        typeof existing?.fteSubtraction === 'number'
          ? existing.fteSubtraction
          : forceDisableByLeave
            ? dashBaseFte
            : 0

      const alloc = currentAllocationByStaffId[s.id]
      const seedTeam =
        (existingOnDay?.assignedTeam ?? existing?.team ?? alloc?.team ?? null) as Team | null

      const allowedTeamsRaw = sptTeamsByStaffId?.[s.id]
      const allowedTeams = Array.isArray(allowedTeamsRaw) && allowedTeamsRaw.length > 0 ? allowedTeamsRaw : TEAMS

      // Determine initial state based on existing data
      // If SPT has any leave type set (and it's not an on-duty leave type like attending course), show as leave
      let initialState: SPTState
      const hasNonOnDutyLeave = leaveType && !isOnDutyLeaveType(leaveType)
      if (forceDisableByLeave || hasNonOnDutyLeave) {
        initialState = 'leave'
      } else if (!enabled) {
        initialState = 'off'
      } else {
        initialState = 'working'
      }

      return {
        staffId: s.id,
        staffName: s.name,
        allowedTeams,
        origin: 'initial',
        dashboard: {
          enabled: dashEnabled,
          contributesFte: dashContrib,
          slots: dashSlots,
          slotModes: dashModes,
          displayText: dashDisplayText,
          baseFte: dashBaseFte,
        },
        state: initialState,
        enabled: forceDisableByLeave ? false : enabled,
        contributesFte: forceDisableByLeave ? false : contributesFte,
        slots,
        slotModes,
        displayText,
        leaveType,
        leaveCostInput: String(Math.max(0, leaveCost)),
        customLeaveType,
        teamChoice: forceDisableByLeave ? 'AUTO' : (seedTeam ?? 'AUTO'),
      }
    })
  }, [currentAllocationByStaffId, sptTeamsByStaffId, sptWeekdayByStaffId, staffById, staffOverrides])

  React.useEffect(() => {
    if (!open) return
    setCards(buildInitialCards())
    setAddStaffId('')
    setDeletedInitialStaffIds([])
  }, [open, buildInitialCards])

  const updateCard = (staffId: string, patch: Partial<CardState>) => {
    setCards((prev) => prev.map((c) => (c.staffId === staffId ? { ...c, ...patch } : c)))
  }

  const toggleSlot = (staffId: string, slot: number) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.staffId !== staffId) return c
        const slots = uniqueSortedSlots(
          c.slots.includes(slot) ? c.slots.filter((s) => s !== slot) : [...c.slots, slot]
        )
        const slotModes = clampSlotModeChoices({ slots, slotModes: c.slotModes })
        return { ...c, slots, slotModes }
      })
    )
  }

  const computeSuggestedTeam = React.useCallback(
    (card: CardState, fteRemaining: number): Team => {
      const current = currentAllocationByStaffId[card.staffId]
      const base: Record<Team, number> = { ...ptPerTeamByTeam }
      if (current?.team && typeof current?.fte === 'number') {
        base[current.team] = Math.max(0, (base[current.team] ?? 0) - current.fte)
      }

      const candidates = (card.allowedTeams?.length ? card.allowedTeams : TEAMS).filter((t) => TEAMS.includes(t))
      const best =
        candidates
          .map((t) => ({ team: t, ptAfter: (base[t] ?? 0) + fteRemaining }))
          .sort((a, b) => a.ptAfter - b.ptAfter)[0]?.team ?? 'FO'
      return best
    },
    [currentAllocationByStaffId, ptPerTeamByTeam]
  )

  const handleAdd = () => {
    const staffId = addStaffId
    if (!staffId) return
    const s = staffById.get(staffId)
    if (!s) return

    const allowedTeamsRaw = sptTeamsByStaffId?.[s.id]
    const allowedTeams = Array.isArray(allowedTeamsRaw) && allowedTeamsRaw.length > 0 ? allowedTeamsRaw : TEAMS

    setCards((prev) => [
      ...prev,
      {
        staffId: s.id,
        staffName: s.name,
        allowedTeams,
        origin: 'added',
        dashboard: {
          enabled: false,
          contributesFte: true,
          slots: [],
          slotModes: { am: 'AND', pm: 'AND' },
          displayText: null,
          baseFte: 0,
        },
        state: 'working',
        enabled: true,
        contributesFte: true,
        slots: [],
        slotModes: { am: null, pm: null },
        displayText: null,
        leaveType: null,
        leaveCostInput: '0',
        customLeaveType: undefined,
        teamChoice: 'AUTO',
      },
    ])
    setAddStaffId('')
  }

  const handleDeleteCard = (staffId: string) => {
    setCards((prev) => {
      const target = prev.find((c) => c.staffId === staffId)
      // Only track deletions for cards that already existed before this dialog session.
      if (target?.origin === 'initial') {
        setDeletedInitialStaffIds((ids) => (ids.includes(staffId) ? ids : [...ids, staffId]))
      }
      return prev.filter((c) => c.staffId !== staffId)
    })
    setAddStaffId((v) => (v === staffId ? '' : v))
  }

  const handleResetToDashboard = (staffId: string) => {
    const dash = sptWeekdayByStaffId[staffId]
    const dashEnabled = !!dash?.enabled
    const dashContrib = !!dash?.contributesFte
    const dashSlots = uniqueSortedSlots(dash?.slots ?? [])
    const dashModes = normalizeSlotModes(dash?.slotModes ?? { am: 'AND', pm: 'AND' })
    const dashDisplayText = typeof dash?.displayText === 'string' ? dash.displayText : null

    const slots = uniqueSortedSlots(dash?.slots ?? [])
    const slotModes = clampSlotModeChoices({
      slots,
      slotModes: { am: dashModes.am, pm: dashModes.pm },
    })
    // Determine state based on dashboard config
    const newState: SPTState = dashEnabled ? 'working' : 'off'

    updateCard(staffId, {
      state: newState,
      enabled: dashEnabled,
      contributesFte: dashContrib,
      slots,
      slotModes,
      displayText: dashDisplayText,
      leaveType: null,
      leaveCostInput: '0',
      teamChoice: 'AUTO',
    })
  }

  const handleConfirm = () => {
    const updates: Record<string, {
      leaveType: LeaveType | null
      fteSubtraction: number
      fteRemaining: number
      team?: Team
      sptOnDayOverride: SptOnDayOverrideState
    }> = {}

    for (const card of cards) {
      const forceDisableByLeave =
        typeof card.leaveType === 'string' && SPT_FULL_LEAVE_TYPES_FORCE_DISABLE.has(card.leaveType)

      const slotModes = normalizeSlotModes(card.slotModes)
      const slots = uniqueSortedSlots(card.slots)
      const { baseFte: onDayBaseFte, effectiveSlots } = computeConfiguredBaseFte({
        enabled: card.enabled,
        contributesFte: card.contributesFte,
        slots,
        slotModes,
      })
      const useDetailedDisplay = typeof card.displayText === 'string' && card.displayText.trim() !== ''
      const resolvedDisplayText =
        useDetailedDisplay && effectiveSlots.total === 3 ? buildSlotDisplayText(effectiveSlots) : null

      // Leave cost should be clamped against the correct "base":
      // - Normal: on-day computed baseFte (from enabled + contributes + slots)
      // - Full-leave types (VL/SDO/TIL/sick leave): dashboard-configured baseFte, even though we force-disable on-day.
      const leaveBaseFte = forceDisableByLeave ? (card.dashboard.baseFte ?? 0) : onDayBaseFte
      const leaveCostRaw = parseFloat(card.leaveCostInput)
      const mappedFullLeaveCost = clampLeaveCost(leaveCostRaw, leaveBaseFte)
      const fteRemaining = Math.max(0, leaveBaseFte - mappedFullLeaveCost)
      const shouldAllocate = !forceDisableByLeave && card.enabled
      const suggested = computeSuggestedTeam(card, fteRemaining)
      const resolvedTeam: Team | undefined =
        shouldAllocate ? (card.teamChoice === 'AUTO' ? suggested : card.teamChoice) : undefined

      // Determine final leave type: if 'others' with custom text, use the custom text; otherwise use the type
      const finalLeaveType: LeaveType | null =
        card.leaveType === 'others' && card.customLeaveType?.trim()
          ? (card.customLeaveType.trim() as LeaveType)
          : card.leaveType ?? null

      updates[card.staffId] = {
        leaveType: finalLeaveType,
        fteSubtraction: mappedFullLeaveCost,
        fteRemaining,
        ...(resolvedTeam ? { team: resolvedTeam } : {}),
        sptOnDayOverride: {
          // For full-leave types, always force-disable SPT allocation on this day.
          enabled: shouldAllocate,
          contributesFte: shouldAllocate ? card.contributesFte : false,
          slots,
          slotModes,
          displayText: resolvedDisplayText,
          assignedTeam: resolvedTeam ?? null,
        },
      }
    }

    // If user deleted a previously-added (persisted) ad-hoc SPT card, send an explicit "remove" update
    // so existing allocations/overrides get cleared.
    for (const staffId of deletedInitialStaffIds) {
      if (updates[staffId]) continue
      const existing = staffOverrides?.[staffId]
      updates[staffId] = {
        leaveType: existing?.leaveType ?? null,
        fteSubtraction: typeof (existing as any)?.fteSubtraction === 'number' ? (existing as any).fteSubtraction : 0,
        fteRemaining: typeof existing?.fteRemaining === 'number' ? existing.fteRemaining : 0,
        sptOnDayOverride: {
          enabled: false,
          contributesFte: false,
          slots: [],
          slotModes: { am: 'AND', pm: 'AND' },
          displayText: null,
          assignedTeam: null,
        },
      }
    }

    onConfirm(updates)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${RBIP_WIDE_DIALOG_WIDTH_CLASS} max-h-[90vh] flex flex-col overflow-hidden`}>
        <DialogHeader className="space-y-3">
          <DialogTitle>SPT day overrides</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="text-[11px] font-semibold tracking-wide">Step 2.2</span>
            <span aria-hidden="true">·</span>
            <Badge
              variant="secondary"
              className="text-[11px] font-semibold tracking-wide uppercase"
            >
              {weekday.toUpperCase()}
            </Badge>
            <span aria-hidden="true">·</span>
            <span>Per-day only</span>
          </div>
          <DialogDescription>
            Adjust SPT duty for this day. Dashboard weekday settings stay unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="px-2.5 py-1 rounded-md">2.0 Programs</span>
          <span aria-hidden="true">·</span>
          <span className="px-2.5 py-1 rounded-md">2.1 Substitute</span>
          <span aria-hidden="true">·</span>
          <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 font-semibold text-primary">2.2 SPT</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain py-4 flex flex-col">
          {cards.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No SPT configured for this weekday. You can add one below.
            </div>
          ) : (
            <HorizontalCardCarousel recomputeKey={open} fill={true} showDots={false} containerClassName="h-full">
              {cards.map((card) => {
                const forceDisableByLeave =
                  typeof card.leaveType === 'string' && SPT_FULL_LEAVE_TYPES_FORCE_DISABLE.has(card.leaveType)
                const effectiveEnabled = card.enabled && !forceDisableByLeave
                const computed = computeConfiguredBaseFte({
                  enabled: card.enabled,
                  contributesFte: card.contributesFte,
                  slots: card.slots,
                  slotModes: card.slotModes,
                })
                const leaveBaseFte = forceDisableByLeave ? (card.dashboard.baseFte ?? 0) : computed.baseFte
                const leaveCostRaw = parseFloat(card.leaveCostInput)
                const leaveCost = clampLeaveCost(leaveCostRaw, leaveBaseFte)
                const fteRemaining = Math.max(0, leaveBaseFte - leaveCost)
                const suggestedTeam = computeSuggestedTeam(card, fteRemaining)
                const amSlotsCount = card.slots.filter((s) => s === 1 || s === 2).length
                const pmSlotsCount = card.slots.filter((s) => s === 3 || s === 4).length
                const needsAmMode = amSlotsCount > 1
                const needsPmMode = pmSlotsCount > 1
                const slotDisplayText = buildSlotDisplayText(computed.effectiveSlots)
                const simpleSlotDisplayText = computed.baseFte > 0 ? formatFteShort(computed.baseFte) : '—'
                const hasExplicitDisplay = typeof card.displayText === 'string' && card.displayText.trim() !== ''
                const showToggle = computed.effectiveSlots.total === 3
                const showDetailedDisplay = showToggle && hasExplicitDisplay
                const currentDisplayText = showToggle
                  ? (showDetailedDisplay ? slotDisplayText : simpleSlotDisplayText)
                  : slotDisplayText

                const teamValue = card.teamChoice === 'AUTO' ? 'AUTO' : card.teamChoice
                const allowedTeams = (card.allowedTeams?.length ? card.allowedTeams : TEAMS).filter((t) => TEAMS.includes(t))
                const needsSlotsWarning = effectiveEnabled && card.contributesFte && card.slots.length === 0
                const slotsChipText = card.slots.length > 0 ? card.slots.join(', ') : '—'
                const fteChipText =
                  !effectiveEnabled
                    ? '—'
                    : formatFteShort(fteRemaining)

                // Status badge and icon helpers
                const StatusIcon = card.state === 'working' ? Briefcase : card.state === 'leave' ? AlertCircle : X
                const statusColors = {
                  working: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
                  leave: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
                  off: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
                }
                const statusLabel = card.state === 'working' ? 'Working' : card.state === 'leave' ? 'Leave' : 'Off'

                return (
                  <Card
                    key={card.staffId}
                    className="min-w-[340px] max-w-[400px] w-[min(400px,calc(100vw-120px))] flex-shrink-0 h-full max-h-full min-h-0 overflow-y-auto overscroll-contain"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <StatusIcon className={cn('h-4 w-4', 
                            card.state === 'working' ? 'text-emerald-600' : 
                            card.state === 'leave' ? 'text-rose-600' : 'text-slate-500'
                          )} />
                          <CardTitle className="text-lg">{card.staffName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                          {!(card.dashboard.enabled && card.dashboard.slots.length > 0) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCard(card.staffId)}
                              title="Remove this ad-hoc SPT card"
                              className="text-destructive hover:text-destructive h-7 w-7 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetToDashboard(card.staffId)}
                            title="Reset config to dashboard baseline"
                            className="h-7 w-7 p-0"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge
                          variant="secondary"
                          className={cn('border text-[10px] px-1.5 py-0.5', statusColors[card.state])}
                        >
                          {statusLabel}
                        </Badge>

                        {card.state === 'working' && effectiveEnabled && (
                          <>
                            <Badge variant="secondary" className="border border-border/60 text-[10px] px-1.5 py-0.5">
                              Slots: {card.slots.length > 0 ? card.slots.join(', ') : '—'}
                            </Badge>
                            <Badge variant="secondary" className="border border-border/60 text-[10px] px-1.5 py-0.5">
                              {showDetailedDisplay ? slotDisplayText : `${formatFteShort(fteRemaining)} FTE`}
                              {showToggle && (
                                <button
                                  onClick={() => updateCard(card.staffId, { displayText: showDetailedDisplay ? null : slotDisplayText })}
                                  className="ml-1 underline opacity-60 hover:opacity-100"
                                >
                                  {showDetailedDisplay ? 'Simple' : 'Detail'}
                                </button>
                              )}
                            </Badge>
                          </>
                        )}

                        {card.state === 'leave' && card.leaveType && (
                          <Badge variant="secondary" className="border border-rose-200 text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700">
                            {/* Show custom text if available, otherwise show the leave type */}
                            {card.customLeaveType?.trim() || String(card.leaveType)}
                          </Badge>
                        )}

                        {card.state === 'working' && (
                          <Badge variant="secondary" className="border border-border/60 text-[10px] px-1.5 py-0.5">
                            {card.teamChoice === 'AUTO' ? `Auto: ${suggestedTeam}` : card.teamChoice}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <Separator />

                    <CardContent className="pt-2 space-y-2">
                      {/* Three-state Toggle */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Status</Label>
                        <ToggleGroup
                          type="single"
                          value={card.state}
                          onValueChange={(v) => {
                            if (!v) return
                            const newState = v as SPTState
                            if (newState === 'working') {
                              updateCard(card.staffId, { 
                                state: 'working', 
                                enabled: true,
                                leaveType: null,
                                leaveCostInput: '0'
                              })
                            } else if (newState === 'leave') {
                              updateCard(card.staffId, { 
                                state: 'leave', 
                                enabled: false,
                                teamChoice: 'AUTO'
                              })
                            } else {
                              updateCard(card.staffId, { 
                                state: 'off', 
                                enabled: false, 
                                teamChoice: 'AUTO',
                                leaveType: null,
                                leaveCostInput: '0'
                              })
                            }
                          }}
                          className="flex w-full"
                        >
                          <ToggleGroupItem value="working" className="flex-1 text-xs h-8" aria-label="Working">
                            <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                            Working
                          </ToggleGroupItem>
                          <ToggleGroupItem value="leave" className="flex-1 text-xs h-8" aria-label="Leave">
                            <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                            Leave
                          </ToggleGroupItem>
                          <ToggleGroupItem value="off" className="flex-1 text-xs h-8" aria-label="Off">
                            <X className="h-3.5 w-3.5 mr-1.5" />
                            Off
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>

                      {/* Working State Content */}
                      {card.state === 'working' && (
                        <>
                          <div className="flex items-center justify-between py-1">
                            <div className="space-y-0.5">
                              <Label className="text-xs">Contribute FTE</Label>
                              <div className="text-[10px] text-muted-foreground">If off, base FTE becomes 0</div>
                            </div>
                            <Switch
                              checked={card.contributesFte}
                              onCheckedChange={(v) => updateCard(card.staffId, { contributesFte: v })}
                              className="scale-90"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs">Slots</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-md border p-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="text-[10px] font-medium text-muted-foreground">AM (1–2)</div>
                                  {needsAmMode ? (
                                    <div className="flex gap-0.5">
                                      {(['AND', 'OR'] as SlotMode[]).map((m) => (
                                        <Button
                                          key={m}
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className={cn(
                                            'h-5 px-1.5 text-[9px] py-0',
                                            (card.slotModes.am ?? 'AND') === m
                                              ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                              : 'bg-gray-100 text-gray-700'
                                          )}
                                          onClick={() => updateCard(card.staffId, { slotModes: { ...card.slotModes, am: m } })}
                                        >
                                          {m}
                                        </Button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                  {[1, 2].map((slot) => {
                                    const selected = card.slots.includes(slot)
                                    return (
                                      <Button
                                        key={slot}
                                        type="button"
                                        variant="outline"
                                        className={cn(
                                          'h-7 text-xs',
                                          selected ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'bg-gray-100 text-gray-700'
                                        )}
                                        onClick={() => toggleSlot(card.staffId, slot)}
                                      >
                                        {selected ? <Check className="h-3 w-3 mr-0.5" /> : null}
                                        {slot}
                                      </Button>
                                    )
                                  })}
                                </div>
                              </div>

                              <div className="rounded-md border p-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="text-[10px] font-medium text-muted-foreground">PM (3–4)</div>
                                  {needsPmMode ? (
                                    <div className="flex gap-0.5">
                                      {(['AND', 'OR'] as SlotMode[]).map((m) => (
                                        <Button
                                          key={m}
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className={cn(
                                            'h-5 px-1.5 text-[9px] py-0',
                                            (card.slotModes.pm ?? 'AND') === m
                                              ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                              : 'bg-gray-100 text-gray-700'
                                          )}
                                          onClick={() => updateCard(card.staffId, { slotModes: { ...card.slotModes, pm: m } })}
                                        >
                                          {m}
                                        </Button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                  {[3, 4].map((slot) => {
                                    const selected = card.slots.includes(slot)
                                    return (
                                      <Button
                                        key={slot}
                                        type="button"
                                        variant="outline"
                                        className={cn(
                                          'h-7 text-xs',
                                          selected ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'bg-gray-100 text-gray-700'
                                        )}
                                        onClick={() => toggleSlot(card.staffId, slot)}
                                      >
                                        {selected ? <Check className="h-3 w-3 mr-0.5" /> : null}
                                        {slot}
                                      </Button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs shrink-0">Team Assignment Override</Label>
                              <Switch
                                checked={card.teamChoice !== 'AUTO'}
                                onCheckedChange={(v) => {
                                  if (!v) {
                                    updateCard(card.staffId, { teamChoice: 'AUTO' })
                                    return
                                  }
                                  const seed = allowedTeams.includes(suggestedTeam) ? suggestedTeam : allowedTeams[0] ?? 'FO'
                                  updateCard(card.staffId, { teamChoice: seed })
                                }}
                                className="scale-90"
                              />
                            </div>
                            {card.teamChoice === 'AUTO' ? (
                              <div className="text-[10px] text-muted-foreground">
                                Auto: <span className="font-medium text-foreground">{suggestedTeam}</span>
                              </div>
                            ) : (
                              <Select
                                value={teamValue}
                                onValueChange={(v) => updateCard(card.staffId, { teamChoice: v as Team })}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TEAMS.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </>
                      )}

                      {/* Leave State Content */}
                      {card.state === 'leave' && (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Leave Type</Label>
                            <Select
                              value={card.leaveType ?? '__NONE__'}
                              onValueChange={(v) => {
                                if (v === '__NONE__') {
                                  updateCard(card.staffId, { 
                                    state: 'off',
                                    leaveType: null,
                                    customLeaveType: undefined,
                                    leaveCostInput: '0',
                                    enabled: false 
                                  })
                                  return
                                }
                                const nextLeaveType = v as Exclude<LeaveType, null>
                                const shouldForceDisable = SPT_FULL_LEAVE_TYPES_FORCE_DISABLE.has(nextLeaveType)
                                // If changing FROM others TO something else, clear custom text
                                // If changing TO others, keep any existing custom text or start empty
                                const nextCustomLeaveType = nextLeaveType === 'others' 
                                  ? (card.customLeaveType || '')
                                  : undefined
                                updateCard(card.staffId, { 
                                  leaveType: nextLeaveType,
                                  customLeaveType: nextCustomLeaveType,
                                  leaveCostInput: shouldForceDisable 
                                    ? String(card.dashboard.baseFte ?? 0)
                                    : card.leaveCostInput,
                                  enabled: false,
                                  contributesFte: false,
                                  teamChoice: 'AUTO',
                                })
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select leave type" />
                              </SelectTrigger>
                              <SelectContent>
                                {LEAVE_TYPES.map((t) => (
                                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Custom Leave Type text field when 'others' is selected */}
                          {card.leaveType === 'others' && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">Custom Leave Type</Label>
                              <Input
                                type="text"
                                value={card.customLeaveType || ''}
                                onChange={(e) => updateCard(card.staffId, { customLeaveType: e.target.value })}
                                placeholder="Enter leave type description"
                                className="h-8 text-xs"
                              />
                            </div>
                          )}

                          {card.leaveType && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">FTE Cost</Label>
                              <Input
                                type="number"
                                step="0.25"
                                min={0}
                                max={leaveBaseFte}
                                value={card.leaveCostInput}
                                onChange={(e) => updateCard(card.staffId, { leaveCostInput: e.target.value })}
                                onBlur={() => {
                                  const v = clampLeaveCost(parseFloat(card.leaveCostInput), leaveBaseFte)
                                  updateCard(card.staffId, { leaveCostInput: String(v) })
                                }}
                                className="h-8 text-xs"
                              />
                              <div className="text-[10px] text-muted-foreground">
                                Remaining: <span className="font-medium">{formatFte(fteRemaining)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Off State Content */}
                      {card.state === 'off' && (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          <X className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                          <p>Not working today</p>
                          <p className="text-[10px] mt-1">No allocation will be made for this SPT</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </HorizontalCardCarousel>
          )}
        </div>

        {/* Keep Add section OUTSIDE the carousel scroller to avoid “underlay” peeking */}
        <div className="border-t px-6 py-2 bg-background">
          <div className="space-y-1">
            <Label>Add SPT not configured on this day</Label>

            <div className="flex flex-wrap items-center gap-2">
            <div className="w-[180px] max-w-[180px]">
                <Select value={addStaffId || '__NONE__'} onValueChange={(v) => setAddStaffId(v === '__NONE__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select SPT" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Select SPT</SelectItem>
                    {candidateAddList.length === 0 ? (
                      <SelectItem value="__NONE__" disabled>
                        No eligible SPT to add
                      </SelectItem>
                    ) : (
                      candidateAddList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleAdd} disabled={!addStaffId || candidateAddList.length === 0}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Add an on-duty SPT who is not configured for this weekday (ad hoc help).
            </div>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-10 mt-4 flex-row flex-wrap items-center gap-2 border-t bg-background/95 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:justify-between sm:px-0">
          {onBack ? (
            <Button variant="outline" onClick={onBack} className="mr-auto max-w-full whitespace-normal">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to 2.1
            </Button>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="max-w-full whitespace-normal">
              Cancel
            </Button>
            <div className="relative group">
              <Button variant="outline" onClick={onSkip} className="max-w-full whitespace-normal">
                Skip
              </Button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-popover border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none whitespace-normal">
                <p className="text-xs text-popover-foreground mb-2 font-medium">
                  Should Step 2 continue without applying any Step 2.2 SPT overrides?
                </p>
                <ul className="text-xs text-popover-foreground space-y-1 list-disc list-inside">
                  <li><strong>Skip:</strong> Keep Step 2 results as-is (no Step 2.2 changes)</li>
                  <li><strong>Cancel:</strong> Close dialog without changes</li>
                  <li><strong>Confirm:</strong> Apply your per-day SPT edits</li>
                </ul>
              </div>
            </div>
            <Button
              onClick={handleConfirm}
              disabled={cards.some((c) => c.enabled && c.contributesFte && c.slots.length === 0)}
              className="max-w-full whitespace-normal"
            >
              Confirm
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

