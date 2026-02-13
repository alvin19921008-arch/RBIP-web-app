'use client'

import * as React from 'react'
import { Check, Plus, RotateCcw, Trash2, ArrowLeft, ArrowLeftRight } from 'lucide-react'

import type { Staff, Team, Weekday, LeaveType } from '@/types/staff'
import type { SptWeekdayComputed } from '@/lib/features/schedule/sptConfig'
import type { StaffOverrideState, SptOnDayOverrideState } from '@/lib/features/schedule/controller/useScheduleController'

import { cn } from '@/lib/utils'
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

  // Editable on-day config
  enabled: boolean
  contributesFte: boolean
  slots: number[]
  slotModes: { am: SlotModeChoice; pm: SlotModeChoice }
  displayText: string | null

  leaveType: LeaveType | null
  leaveCostInput: string

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
  const [moreOptionsOpenByStaffId, setMoreOptionsOpenByStaffId] = React.useState<Record<string, boolean>>({})
  const leaveTypeAnchorRefs = React.useRef<Record<string, HTMLDivElement | null>>({})

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

      const leaveType = existing?.leaveType ?? null
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
        enabled: forceDisableByLeave ? false : enabled,
        contributesFte: forceDisableByLeave ? false : contributesFte,
        slots,
        slotModes,
        displayText,
        leaveType,
        leaveCostInput: String(Math.max(0, leaveCost)),
        teamChoice: forceDisableByLeave ? 'AUTO' : (seedTeam ?? 'AUTO'),
      }
    })
  }, [currentAllocationByStaffId, sptTeamsByStaffId, sptWeekdayByStaffId, staffById, staffOverrides])

  React.useEffect(() => {
    if (!open) return
    setCards(buildInitialCards())
    setAddStaffId('')
    setDeletedInitialStaffIds([])
    setMoreOptionsOpenByStaffId({})
  }, [open, buildInitialCards])

  const updateCard = (staffId: string, patch: Partial<CardState>) => {
    setCards((prev) => prev.map((c) => (c.staffId === staffId ? { ...c, ...patch } : c)))
  }

  const openMoreOptionsAndScrollToLeave = React.useCallback((staffId: string) => {
    setMoreOptionsOpenByStaffId((prev) => ({ ...prev, [staffId]: true }))
    // Wait for <details open> + content to render, then scroll within card.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        leaveTypeAnchorRefs.current[staffId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }, [])

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
        enabled: true,
        contributesFte: true,
        slots: [],
        slotModes: { am: null, pm: null },
        displayText: null,
        leaveType: null,
        leaveCostInput: '0',
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
    updateCard(staffId, {
      enabled: dashEnabled,
      contributesFte: dashContrib,
      slots,
      slotModes,
      displayText: dashDisplayText,
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

      updates[card.staffId] = {
        leaveType: card.leaveType ?? null,
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
      <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
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

                return (
                  <Card
                    key={card.staffId}
                    className="min-w-[360px] max-w-[420px] w-[min(420px,calc(100vw-120px))] flex-shrink-0 h-full max-h-full min-h-0 overflow-y-auto overscroll-contain"
                  >
                    <CardHeader className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>{card.staffName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                          {!(card.dashboard.enabled && card.dashboard.slots.length > 0) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteCard(card.staffId)}
                              title="Remove this ad-hoc SPT card"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResetToDashboard(card.staffId)}
                            title="Reset config to dashboard baseline"
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reset to dashboard
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'border',
                            effectiveEnabled
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                          )}
                        >
                          {effectiveEnabled ? 'On' : 'Off'}
                        </Badge>

                        {card.leaveType && !isOnDutyLeaveType(card.leaveType as any) ? (
                          <Badge className="border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                            Leave: <span className="ml-1 font-medium">{String(card.leaveType)}</span>
                          </Badge>
                        ) : null}

                        {effectiveEnabled ? (
                          <Badge variant="secondary" className="border border-border/60">
                            Slots: <span className="ml-1 font-medium text-foreground">{slotsChipText}</span>
                          </Badge>
                        ) : null}

                        <Badge variant="secondary" className="border border-border/60">
                          FTE: <span className="ml-1 font-medium text-foreground">{fteChipText}</span>
                        </Badge>

                        {effectiveEnabled ? (
                          <Badge variant="secondary" className="border border-border/60">
                            {card.teamChoice === 'AUTO' ? (
                              <>
                                Auto: <span className="ml-1 font-medium text-foreground">{suggestedTeam}</span>
                              </>
                            ) : (
                              <>
                                Team: <span className="ml-1 font-medium text-foreground">{card.teamChoice}</span>
                              </>
                            )}
                          </Badge>
                        ) : null}

                        {needsSlotsWarning ? (
                          <Badge className="border border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-200">
                            Needs slots
                          </Badge>
                        ) : null}
                      </div>

                      <details className="rounded-md border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none font-medium text-foreground">
                          Baseline & details
                        </summary>
                        <div className="mt-2 space-y-1">
                          <div>
                            Dashboard: base FTE{' '}
                            <span className="font-medium text-foreground">{formatFte(card.dashboard.baseFte)}</span> · slots{' '}
                            <span className="font-medium text-foreground">
                              {card.dashboard.slots.length ? card.dashboard.slots.join(', ') : '—'}
                            </span>
                          </div>
                          <div>
                            On-day: base FTE{' '}
                            <span className="font-medium text-foreground">{formatFte(computed.baseFte)}</span> · remaining{' '}
                            <span className="font-medium text-foreground">{formatFte(fteRemaining)}</span>
                          </div>
                          <div>
                            Slot display: <span className="font-medium text-foreground">{currentDisplayText}</span> · effective slots{' '}
                            <span className="font-medium text-foreground">{computed.effectiveSlots.total}</span>
                          </div>
                          {card.teamChoice !== 'AUTO' ? (
                            <div>
                              Suggested team (if Auto): <span className="font-medium text-foreground">{suggestedTeam}</span>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label>Enabled</Label>
                          <div className="text-xs text-muted-foreground">
                            {forceDisableByLeave
                              ? 'Disabled automatically due to selected leave type'
                              : 'Include this SPT on this day'}
                          </div>
                        </div>
                        <Switch
                          checked={effectiveEnabled}
                          onCheckedChange={(v) => {
                            if (!v) {
                              // When disabling, clear any manual team override and prompt user to set leave (optional).
                              updateCard(card.staffId, { enabled: false, teamChoice: 'AUTO' })
                              openMoreOptionsAndScrollToLeave(card.staffId)
                              return
                            }
                            updateCard(card.staffId, { enabled: true })
                          }}
                          disabled={forceDisableByLeave}
                        />
                      </div>

                      {effectiveEnabled ? (
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <Label>Contribute FTE</Label>
                            <div className="text-xs text-muted-foreground">If off, base FTE becomes 0</div>
                          </div>
                          <Switch
                            checked={card.contributesFte}
                            onCheckedChange={(v) => updateCard(card.staffId, { contributesFte: v })}
                          />
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label>Slots</Label>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-md border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-muted-foreground">AM (1–2)</div>
                              {card.enabled && needsAmMode ? (
                                <div className="flex gap-1">
                                  {(['AND', 'OR'] as SlotMode[]).map((m) => (
                                    <Button
                                      key={m}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        'h-7 px-2 text-[11px]',
                                        (card.slotModes.am ?? 'AND') === m
                                          ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                          : 'bg-gray-100 text-gray-700'
                                      )}
                                      onClick={() => updateCard(card.staffId, { slotModes: { ...card.slotModes, am: m } })}
                                      disabled={!effectiveEnabled}
                                    >
                                      {m}
                                    </Button>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              {[1, 2].map((slot) => {
                                const selected = card.slots.includes(slot)
                                return (
                                  <Button
                                    key={slot}
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                      'h-9',
                                      selected ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'bg-gray-100 text-gray-700'
                                    )}
                                    onClick={() => toggleSlot(card.staffId, slot)}
                                    disabled={!effectiveEnabled}
                                  >
                                    {selected ? <Check className="h-4 w-4 mr-1" /> : null}
                                    {slot}
                                  </Button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="rounded-md border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-muted-foreground">PM (3–4)</div>
                              {card.enabled && needsPmMode ? (
                                <div className="flex gap-1">
                                  {(['AND', 'OR'] as SlotMode[]).map((m) => (
                                    <Button
                                      key={m}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        'h-7 px-2 text-[11px]',
                                        (card.slotModes.pm ?? 'AND') === m
                                          ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                          : 'bg-gray-100 text-gray-700'
                                      )}
                                      onClick={() => updateCard(card.staffId, { slotModes: { ...card.slotModes, pm: m } })}
                                      disabled={!effectiveEnabled}
                                    >
                                      {m}
                                    </Button>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              {[3, 4].map((slot) => {
                                const selected = card.slots.includes(slot)
                                return (
                                  <Button
                                    key={slot}
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                      'h-9',
                                      selected ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'bg-gray-100 text-gray-700'
                                    )}
                                    onClick={() => toggleSlot(card.staffId, slot)}
                                    disabled={!effectiveEnabled}
                                  >
                                    {selected ? <Check className="h-4 w-4 mr-1" /> : null}
                                    {slot}
                                  </Button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <details
                        className="rounded-md border bg-muted/10 px-3 py-2"
                        open={!!moreOptionsOpenByStaffId[card.staffId]}
                        onToggle={(e) => {
                          const el = e.currentTarget
                          setMoreOptionsOpenByStaffId((prev) => ({ ...prev, [card.staffId]: el.open }))
                        }}
                      >
                        <summary className="cursor-pointer select-none text-sm font-medium">
                          More options
                        </summary>

                        <div className="mt-3 space-y-4">
                          {effectiveEnabled && fteRemaining > 0 ? (
                            <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                              <div>
                                Slot display: <span className="font-medium text-foreground">{currentDisplayText}</span> · effective slots:{' '}
                                <span className="font-medium text-foreground">{computed.effectiveSlots.total}</span>
                              </div>
                              {showToggle ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    'h-6 px-2 text-[11px] font-medium rounded-full',
                                    'border-border/70 bg-background/90 shadow-xs',
                                    'text-muted-foreground hover:text-foreground'
                                  )}
                                  onClick={() =>
                                    updateCard(card.staffId, {
                                      displayText: showDetailedDisplay ? null : slotDisplayText,
                                    })
                                  }
                                >
                                  <ArrowLeftRight className="h-3 w-3 mr-1 opacity-70" />
                                  {showDetailedDisplay ? 'Simplify' : 'Detail'}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="grid grid-cols-2 gap-3">
                            <div
                              className="space-y-2"
                              ref={(el) => {
                                leaveTypeAnchorRefs.current[card.staffId] = el
                              }}
                            >
                              <Label>Leave type</Label>
                              <Select
                                value={card.leaveType ?? '__NONE__'}
                                onValueChange={(v) => {
                                  if (v === '__NONE__') {
                                    const wasForced =
                                      typeof card.leaveType === 'string' && SPT_FULL_LEAVE_TYPES_FORCE_DISABLE.has(card.leaveType)
                                    if (wasForced) {
                                      const dashSlots = uniqueSortedSlots(card.dashboard.slots ?? [])
                                      const slotModes = clampSlotModeChoices({
                                        slots: dashSlots,
                                        slotModes: {
                                          am: card.dashboard.slotModes?.am ?? 'AND',
                                          pm: card.dashboard.slotModes?.pm ?? 'AND',
                                        },
                                      })
                                      updateCard(card.staffId, {
                                        leaveType: null,
                                        leaveCostInput: '0',
                                        enabled: !!card.dashboard.enabled,
                                        contributesFte: !!card.dashboard.contributesFte,
                                        slots: dashSlots,
                                        slotModes,
                                        displayText: card.dashboard.displayText ?? null,
                                      })
                                      return
                                    }
                                    updateCard(card.staffId, { leaveType: null, leaveCostInput: '0' })
                                    return
                                  }
                                  const nextLeaveType = v as any
                                  const shouldForceDisable =
                                    typeof nextLeaveType === 'string' && SPT_FULL_LEAVE_TYPES_FORCE_DISABLE.has(nextLeaveType)
                                  if (shouldForceDisable) {
                                    updateCard(card.staffId, {
                                      leaveType: nextLeaveType,
                                      // Map full-leave types to dashboard-configured base FTE cost.
                                      leaveCostInput: String(card.dashboard.baseFte ?? 0),
                                      enabled: false,
                                      contributesFte: false,
                                      teamChoice: 'AUTO',
                                    })
                                    openMoreOptionsAndScrollToLeave(card.staffId)
                                    return
                                  }
                                  updateCard(card.staffId, { leaveType: nextLeaveType })
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__NONE__">None</SelectItem>
                                  {LEAVE_TYPES.map((t) => (
                                    <SelectItem key={t} value={t}>
                                      {t}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {card.leaveType ? (
                              <div className="space-y-2">
                                <Label>Leave FTE cost</Label>
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
                                />
                                <div className="text-xs text-muted-foreground">
                                  Remaining: <span className="font-medium">{formatFte(fteRemaining)}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground flex items-center">
                                Leave cost applies only when a leave type is selected.
                              </div>
                            )}
                          </div>

                          {effectiveEnabled ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <Label className="shrink-0">Manual team override</Label>
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
                                />
                              </div>

                              {card.teamChoice === 'AUTO' ? (
                                <div className="text-xs text-muted-foreground">
                                  Auto assignment will use suggested team: <span className="font-medium text-foreground">{suggestedTeam}</span>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <Label className="shrink-0">Assign to team</Label>
                                  <Select
                                    value={teamValue}
                                    onValueChange={(v) => updateCard(card.staffId, { teamChoice: v === 'AUTO' ? 'AUTO' : (v as Team) })}
                                  >
                                    <SelectTrigger className="w-[220px] max-w-full">
                                      <SelectValue placeholder="Auto" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {allowedTeams.map((t) => (
                                        <SelectItem key={t} value={t}>
                                          {t}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              Team assignment is disabled when this SPT is off.
                            </div>
                          )}
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                )
              })}
            </HorizontalCardCarousel>
          )}
        </div>

        {/* Keep Add section OUTSIDE the carousel scroller to avoid “underlay” peeking */}
        <div className="border-t px-6 py-4 bg-background">
          <div className="space-y-2">
            <Label>Add SPT not configured on this day</Label>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[280px] max-w-full">
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
              Add an on-duty SPT who is not configured for this weekday (ad hoc help). You’ll then pick slots and contribute-FTE.
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {onBack ? (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to 2.1
            </Button>
          ) : (
            <div />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="relative inline-block group">
              <Button variant="outline" onClick={onSkip}>
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
            >
              Confirm
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

