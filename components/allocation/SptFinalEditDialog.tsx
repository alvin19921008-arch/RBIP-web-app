'use client'

import * as React from 'react'
import { Check, Plus, RotateCcw, Trash2, ArrowLeft, ArrowLeftRight, ChevronRight } from 'lucide-react'

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
      const leaveCost = typeof existing?.fteSubtraction === 'number' ? existing.fteSubtraction : 0

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
        enabled,
        contributesFte,
        slots,
        slotModes,
        displayText,
        leaveType,
        leaveCostInput: String(Math.max(0, leaveCost)),
        teamChoice: seedTeam ?? 'AUTO',
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
      const slotModes = normalizeSlotModes(card.slotModes)
      const slots = uniqueSortedSlots(card.slots)
      const { baseFte, effectiveSlots } = computeConfiguredBaseFte({
        enabled: card.enabled,
        contributesFte: card.contributesFte,
        slots,
        slotModes,
      })
      const useDetailedDisplay = typeof card.displayText === 'string' && card.displayText.trim() !== ''
      const resolvedDisplayText =
        useDetailedDisplay && effectiveSlots.total === 3 ? buildSlotDisplayText(effectiveSlots) : null

      const leaveCostRaw = parseFloat(card.leaveCostInput)
      const leaveCost = clampLeaveCost(leaveCostRaw, baseFte)
      const fteRemaining = Math.max(0, baseFte - leaveCost)
      const suggested = computeSuggestedTeam(card, fteRemaining)
      const team = card.teamChoice === 'AUTO' ? suggested : card.teamChoice

      updates[card.staffId] = {
        leaveType: card.leaveType ?? null,
        fteSubtraction: leaveCost,
        fteRemaining,
        team,
        sptOnDayOverride: {
          enabled: card.enabled,
          contributesFte: card.contributesFte,
          slots,
          slotModes,
          displayText: resolvedDisplayText,
          assignedTeam: team,
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
        <DialogHeader>
          <DialogTitle>SPT day overrides</DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground">
              Step 2.2 ·{' '}
              <Badge
                variant="secondary"
                className="ml-1 align-middle text-[11px] font-semibold tracking-wide uppercase"
              >
                {weekday.toUpperCase()}
              </Badge>{' '}
              · Per-day only
            </span>
            <span className="mt-1 block">
              Review and override SPT weekday configuration for this day. This won&apos;t change dashboard settings.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground pb-2 border-b">
          <span className="px-2.5 py-1 rounded-md">2.0 Programs</span>
          <ChevronRight className="h-3 w-3" />
          <span className="px-2.5 py-1 rounded-md">2.1 Substitute</span>
          <ChevronRight className="h-3 w-3" />
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
                const computed = computeConfiguredBaseFte({
                  enabled: card.enabled,
                  contributesFte: card.contributesFte,
                  slots: card.slots,
                  slotModes: card.slotModes,
                })
                const leaveCostRaw = parseFloat(card.leaveCostInput)
                const leaveCost = clampLeaveCost(leaveCostRaw, computed.baseFte)
                const fteRemaining = Math.max(0, computed.baseFte - leaveCost)
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

                return (
                  <Card
                    key={card.staffId}
                    className="min-w-[360px] max-w-[420px] w-[min(420px,calc(100vw-120px))] flex-shrink-0 h-full max-h-full min-h-0 overflow-y-auto overscroll-contain"
                  >
                    <CardHeader className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>{card.staffName}</CardTitle>
                          <div className="text-xs text-muted-foreground">
                            Suggested team: <span className="font-medium">{suggestedTeam}</span>
                          </div>
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

                      <div className="text-xs space-y-1">
                        <div className="text-muted-foreground">
                          Dashboard: base FTE <span className="font-medium text-foreground">{formatFte(card.dashboard.baseFte)}</span>
                          {card.dashboard.slots.length ? (
                            <> · slots <span className="font-medium text-foreground">{card.dashboard.slots.join(', ')}</span></>
                          ) : (
                            <> · slots <span className="font-medium text-foreground">—</span></>
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          On-day: base FTE <span className="font-medium text-foreground">{formatFte(computed.baseFte)}</span> · remaining{' '}
                          <span className="font-medium text-foreground">{formatFte(fteRemaining)}</span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label>Enabled</Label>
                          <div className="text-xs text-muted-foreground">Include this SPT on this day</div>
                        </div>
                        <Switch
                          checked={card.enabled}
                          onCheckedChange={(v) => updateCard(card.staffId, { enabled: v })}
                        />
                      </div>

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

                      <div className="space-y-2">
                        <Label>Slots (must match configured FTE)</Label>
                        <div className="grid grid-cols-4 gap-2">
                          {[1, 2, 3, 4].map((slot) => {
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
                                disabled={!card.enabled}
                              >
                                {selected ? <Check className="h-4 w-4 mr-1" /> : null}
                                {slot}
                              </Button>
                            )
                          })}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">
                              AM slot mode{amSlotsCount === 1 ? ' (not needed for single slot)' : ''}
                            </div>
                            <div className="flex gap-2">
                              {(['AND', 'OR'] as SlotMode[]).map((m) => (
                                <Button
                                  key={m}
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    'h-8 px-3',
                                    card.slotModes.am === m
                                      ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                      : 'bg-gray-100 text-gray-700'
                                  )}
                                  onClick={() => updateCard(card.staffId, { slotModes: { ...card.slotModes, am: m } })}
                                  disabled={!card.enabled || !needsAmMode}
                                >
                                  {m}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">
                              PM slot mode{pmSlotsCount === 1 ? ' (not needed for single slot)' : ''}
                            </div>
                            <div className="flex gap-2">
                              {(['AND', 'OR'] as SlotMode[]).map((m) => (
                                <Button
                                  key={m}
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    'h-8 px-3',
                                    card.slotModes.pm === m
                                      ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                      : 'bg-gray-100 text-gray-700'
                                  )}
                                  onClick={() => updateCard(card.staffId, { slotModes: { ...card.slotModes, pm: m } })}
                                  disabled={!card.enabled || !needsPmMode}
                                >
                                  {m}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                          <div>
                            Slot display: <span className="font-medium">{currentDisplayText}</span> · Effective slots:{' '}
                            <span className="font-medium">{computed.effectiveSlots.total}</span>
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
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Leave type</Label>
                          <Select
                            value={card.leaveType ?? '__NONE__'}
                            onValueChange={(v) => updateCard(card.staffId, { leaveType: v === '__NONE__' ? null : (v as any) })}
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

                        <div className="space-y-2">
                          <Label>Leave FTE cost</Label>
                          <Input
                            type="number"
                            step="0.25"
                            min={0}
                            max={computed.baseFte}
                            value={card.leaveCostInput}
                            onChange={(e) => updateCard(card.staffId, { leaveCostInput: e.target.value })}
                            onBlur={() => {
                              const v = clampLeaveCost(parseFloat(card.leaveCostInput), computed.baseFte)
                              updateCard(card.staffId, { leaveCostInput: String(v) })
                            }}
                            disabled={!card.enabled}
                          />
                          <div className="text-xs text-muted-foreground">
                            Remaining: <span className="font-medium">{formatFte(fteRemaining)}</span>
                          </div>
                        </div>
                      </div>

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
                            <SelectItem value="AUTO">Auto (suggest)</SelectItem>
                            {allowedTeams.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {card.enabled && card.contributesFte && card.slots.length === 0 && (
                        <div className="text-xs p-2 rounded border border-yellow-200 bg-yellow-50 text-yellow-900">
                          Enabled + contributing requires at least 1 slot.
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

