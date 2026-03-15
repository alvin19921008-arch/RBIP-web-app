'use client'

import * as React from 'react'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'

import type { LeaveType, SharedTherapistAllocationMode, Staff, Team } from '@/types/staff'
import {
  buildSharedTherapistTeamFteByTeam,
  getEffectiveSharedTherapistAllocationMode,
  getSharedTherapistBaseAllocationMode,
  type SharedTherapistSlotTeams,
} from '@/lib/features/schedule/sharedTherapistStep'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { buildStep2WizardStepperSteps } from '@/lib/features/schedule/step2WizardStepper'
import {
  applySharedTherapistTeamAssignment,
  getSharedTherapistDialogPresentation,
  getSharedTherapistQuickSelectPresentation,
  toggleSharedTherapistSelectedSlot,
} from '@/lib/features/schedule/sharedTherapistDialogPresentation'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
const SLOT_KEYS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4]

type SharedTherapistCardState = {
  staffId: string
  staffName: string
  role: 'APPT' | 'RPT'
  leaveType: LeaveType | null
  availableFte: number
  availableSlots: Array<1 | 2 | 3 | 4>
  allocationMode: SharedTherapistAllocationMode
  suggestedTeam: Team
  mode: 'auto' | 'custom'
  expanded: boolean
  assignedTeam: Team
  slotTeamBySlot: SharedTherapistSlotTeams
  selectedSlots: Array<1 | 2 | 3 | 4>
  initial: {
    assignedTeam: Team
    mode: 'auto' | 'custom'
    slotTeamBySlot: SharedTherapistSlotTeams
  }
}

type StaffOverrideLike = {
  leaveType?: LeaveType | null
  fteRemaining?: number
  availableSlots?: number[]
  team?: Team
  sharedTherapistModeOverride?: SharedTherapistAllocationMode
  therapistTeamFTEByTeam?: Partial<Record<Team, number>>
  sharedTherapistSlotTeams?: SharedTherapistSlotTeams
}

type CurrentAllocation = {
  teamFteByTeam: Partial<Record<Team, number>>
  slotTeamBySlot: SharedTherapistSlotTeams
} | null

function formatFteShort(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function normalizeAvailableSlots(rawSlots: number[] | undefined, availableFte: number): Array<1 | 2 | 3 | 4> {
  const normalized = Array.isArray(rawSlots)
    ? Array.from(new Set(rawSlots.filter((slot): slot is 1 | 2 | 3 | 4 => SLOT_KEYS.includes(slot as 1 | 2 | 3 | 4)))).sort((a, b) => a - b)
    : []
  if (normalized.length > 0) return normalized
  const slotCount = Math.max(0, Math.min(4, Math.round(availableFte / 0.25)))
  return SLOT_KEYS.slice(0, slotCount)
}

function buildAutoSlotMap(team: Team, availableSlots: Array<1 | 2 | 3 | 4>): SharedTherapistSlotTeams {
  return Object.fromEntries(
    availableSlots.map((slot) => [slot, team])
  ) as SharedTherapistSlotTeams
}

function buildCoverageSummary(args: {
  allocationMode: SharedTherapistAllocationMode
  mode: 'auto' | 'custom'
  team: Team
  availableFte: number
  slotTeamBySlot: SharedTherapistSlotTeams
}): string {
  if (args.allocationMode === 'single-team') {
    if (Math.abs(args.availableFte - 1) < 0.001) return `whole day -> ${args.team}`
    return `${formatFteShort(args.availableFte)} -> ${args.team}`
  }
  const byTeam = new Map<Team, number[]>()
  for (const slot of SLOT_KEYS) {
    const team = args.slotTeamBySlot[slot]
    if (!team) continue
    const current = byTeam.get(team) ?? []
    current.push(slot)
    byTeam.set(team, current)
  }

  // Slot-based full day (all 4 slots to same team) -> "whole day -> team"
  const entries = Array.from(byTeam.entries())
  if (entries.length === 1 && entries[0][1].length === 4) return `whole day -> ${entries[0][0]}`
  if (args.mode === 'auto' && Math.abs(args.availableFte - 1) < 0.001) return `slots 1,2,3,4 -> ${args.team}`

  const fragments = entries.map(([team, slots]) => `slots ${slots.join(',')} -> ${team}`)
  return fragments.length > 0 ? fragments.join(' · ') : 'No slots assigned'
}

function formatAvailabilityLabel(availableFte: number): string {
  if (Math.abs(availableFte - 1) < 0.001) return '1.0 whole day'
  return `${formatFteShort(availableFte)} available`
}

export function SharedTherapistEditDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sharedTherapists: Staff[]
  staffOverrides: Record<string, StaffOverrideLike>
  currentAllocationByStaffId: Record<string, CurrentAllocation>
  ptPerTeamByTeam: Record<Team, number>
  showSubstituteStep?: boolean
  onConfirm: (updates: Record<string, {
    leaveType: LeaveType | null
    fteRemaining: number
    team?: Team
    therapistTeamFTEByTeam?: Partial<Record<Team, number>>
    sharedTherapistSlotTeams?: SharedTherapistSlotTeams
  }>) => void
  onSkip: () => void
  onBack?: () => void
}) {
  const {
    open,
    onOpenChange,
    sharedTherapists,
    staffOverrides,
    currentAllocationByStaffId,
    ptPerTeamByTeam,
    showSubstituteStep = true,
    onConfirm,
    onSkip,
    onBack,
  } = props

  const computeSuggestedTeam = React.useCallback(
    (staffId: string, availableFte: number): Team => {
      const current = currentAllocationByStaffId[staffId]
      const base: Record<Team, number> = { ...ptPerTeamByTeam }
      Object.entries(current?.teamFteByTeam ?? {}).forEach(([team, fte]) => {
        if (!TEAMS.includes(team as Team) || typeof fte !== 'number') return
        base[team as Team] = Math.max(0, (base[team as Team] ?? 0) - fte)
      })

      return (
        TEAMS
          .map((team) => ({ team, ptAfter: (base[team] ?? 0) + availableFte }))
          .sort((a, b) => a.ptAfter - b.ptAfter)[0]?.team ?? 'FO'
      )
    },
    [currentAllocationByStaffId, ptPerTeamByTeam]
  )

  const buildInitialCards = React.useCallback((): SharedTherapistCardState[] => {
    return sharedTherapists
      .filter((staff) => staff.rank === 'APPT' || staff.rank === 'RPT')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((staff) => {
        const override = staffOverrides?.[staff.id]
        const current = currentAllocationByStaffId[staff.id]
        const availableFte = typeof override?.fteRemaining === 'number' ? override.fteRemaining : 1
        const allocationMode = getEffectiveSharedTherapistAllocationMode({
          staffMode: getSharedTherapistBaseAllocationMode(staff),
          overrideMode: override?.sharedTherapistModeOverride,
        })
        const suggestedTeam = computeSuggestedTeam(staff.id, availableFte)
        const availableSlots = normalizeAvailableSlots(override?.availableSlots, availableFte)
        const existingSplitMap = override?.therapistTeamFTEByTeam
        const existingSlotMap = override?.sharedTherapistSlotTeams
        const hasCustomSlotState =
          !!existingSplitMap && Object.keys(existingSplitMap).length > 0 &&
          !!existingSlotMap && Object.keys(existingSlotMap).length > 0
        const currentAssignedTeam =
          (override?.team as Team | undefined) ??
          (Object.entries(current?.teamFteByTeam ?? {}).find(([, fte]) => typeof fte === 'number' && fte > 0)?.[0] as Team | undefined) ??
          suggestedTeam

        const slotTeamBySlot =
          hasCustomSlotState
            ? { ...(existingSlotMap ?? {}) }
            : current?.slotTeamBySlot && Object.keys(current.slotTeamBySlot).length > 0
              ? { ...current.slotTeamBySlot }
              : buildAutoSlotMap(currentAssignedTeam, availableSlots)

        const mode: 'auto' | 'custom' =
          allocationMode === 'slot-based'
            ? (hasCustomSlotState ? 'custom' : 'auto')
            : currentAssignedTeam !== suggestedTeam
              ? 'custom'
              : 'auto'

        return {
          staffId: staff.id,
          staffName: staff.name,
          role: staff.rank,
          leaveType: override?.leaveType ?? null,
          availableFte,
          availableSlots,
          allocationMode,
          suggestedTeam,
          mode,
          expanded: false,
          assignedTeam: currentAssignedTeam,
          slotTeamBySlot,
          selectedSlots: [],
          initial: {
            assignedTeam: currentAssignedTeam,
            mode,
            slotTeamBySlot: { ...slotTeamBySlot },
          },
        }
      })
  }, [computeSuggestedTeam, currentAllocationByStaffId, sharedTherapists, staffOverrides])

  const [cards, setCards] = React.useState<SharedTherapistCardState[]>([])

  React.useEffect(() => {
    if (!open) return
    setCards(buildInitialCards())
  }, [open, buildInitialCards])

  const updateCard = React.useCallback((staffId: string, updater: (card: SharedTherapistCardState) => SharedTherapistCardState) => {
    setCards((prev) => prev.map((card) => (card.staffId === staffId ? updater(card) : card)))
  }, [])

  const stepperSteps = React.useMemo(() => {
    return buildStep2WizardStepperSteps({
      showSubstituteStep,
      showSharedTherapistStep: true,
    })
  }, [showSubstituteStep])

  const presentation = React.useMemo(
    () => getSharedTherapistDialogPresentation(cards.length),
    [cards.length]
  )
  const quickSelectPresentation = React.useMemo(
    () => getSharedTherapistQuickSelectPresentation(),
    []
  )

  const handleCustomize = (staffId: string) => {
    updateCard(staffId, (card) => ({
      ...card,
      mode: 'custom',
      expanded: true,
      assignedTeam: card.assignedTeam ?? card.suggestedTeam,
      slotTeamBySlot:
        Object.keys(card.slotTeamBySlot).length > 0 ? card.slotTeamBySlot : buildAutoSlotMap(card.suggestedTeam, card.availableSlots),
      selectedSlots: [],
    }))
  }

  const handleUseAuto = (staffId: string) => {
    updateCard(staffId, (card) => ({
      ...card,
      mode: 'auto',
      expanded: false,
      assignedTeam: card.suggestedTeam,
      slotTeamBySlot: buildAutoSlotMap(card.suggestedTeam, card.availableSlots),
      selectedSlots: [],
    }))
  }

  const handleReset = (staffId: string) => {
    updateCard(staffId, (card) => ({
      ...card,
      mode: card.initial.mode,
      expanded: false,
      assignedTeam: card.initial.assignedTeam,
      slotTeamBySlot: { ...card.initial.slotTeamBySlot },
      selectedSlots: [],
    }))
  }

  const handleAssignTeam = (staffId: string, team: Team) => {
    updateCard(staffId, (card) => {
      if (card.selectedSlots.length === 0) return card
      const nextAssignment = applySharedTherapistTeamAssignment(
        card.slotTeamBySlot,
        card.selectedSlots,
        team
      )
      return {
        ...card,
        mode: 'custom',
        slotTeamBySlot: nextAssignment.slotTeamBySlot,
        selectedSlots: nextAssignment.selectedSlots,
      }
    })
  }

  const handleConfirm = () => {
    const updates: Record<string, {
      leaveType: LeaveType | null
      fteRemaining: number
      team?: Team
      therapistTeamFTEByTeam?: Partial<Record<Team, number>>
      sharedTherapistSlotTeams?: SharedTherapistSlotTeams
    }> = {}

    cards.forEach((card) => {
      if (card.allocationMode === 'single-team') {
        updates[card.staffId] = {
          leaveType: card.leaveType,
          fteRemaining: card.availableFte,
          team: card.mode === 'auto' ? card.suggestedTeam : card.assignedTeam,
        }
        return
      }

      if (card.mode === 'auto' && card.availableSlots.length === 4) {
        updates[card.staffId] = {
          leaveType: card.leaveType,
          fteRemaining: card.availableFte,
          team: card.suggestedTeam,
        }
        return
      }

      updates[card.staffId] = {
        leaveType: card.leaveType,
        fteRemaining: card.availableFte,
        therapistTeamFTEByTeam: buildSharedTherapistTeamFteByTeam({
          slotTeamBySlot: card.slotTeamBySlot,
        }),
        sharedTherapistSlotTeams: card.slotTeamBySlot,
      }
    })

    onConfirm(updates)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${presentation.dialogWidthClass} max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className={presentation.desktopStepperClass}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {stepperSteps.map(({ step, label }, index) => (
              <React.Fragment key={step}>
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <span className={cn('px-2.5 py-1 rounded-md', step === '2.3' && 'bg-slate-100 dark:bg-slate-700 font-semibold text-primary')}>
                  {step} {label}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <DialogHeader className={presentation.headerClass}>
          <DialogTitle>Shared therapist allocation</DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground">
              Step 2.3{cards.length > 0 ? ` · 1 / ${cards.length}` : ''}
            </span>
            <span className="mt-1 block">Review shared therapist allocation for today.</span>
            <span className="mt-1 block">Default assignment is automatic. Customize only when needed.</span>
            <div className="mt-3 flex sm:hidden flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {stepperSteps.map(({ step, label }, index) => (
                <React.Fragment key={step}>
                  {index > 0 ? <span aria-hidden="true">·</span> : null}
                  <span className={cn('px-2.5 py-1 rounded-md', step === '2.3' && 'bg-slate-100 dark:bg-slate-700 font-semibold text-primary')}>
                    {step} {label}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4">
          {cards.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No shared therapists for this day.
            </div>
          ) : (
            <div className={presentation.cardsGridClass}>
              {cards.map((card) => {
                const coverageSummary = buildCoverageSummary({
                  allocationMode: card.allocationMode,
                  mode: card.mode,
                  team: card.mode === 'auto' ? card.suggestedTeam : card.assignedTeam,
                  availableFte: card.availableFte,
                  slotTeamBySlot: card.slotTeamBySlot,
                })

                return (
                  <Card key={card.staffId} className="h-fit">
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <CardTitle className="text-lg">{card.staffName}</CardTitle>
                        <Badge variant="secondary" className="text-[11px] font-semibold tracking-wide uppercase">
                          {card.role}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          {formatAvailabilityLabel(card.availableFte)}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          {card.allocationMode === 'slot-based' ? 'Slot-based' : 'Single-team'}
                        </Badge>
                        {card.allocationMode === 'slot-based' ? (
                          <>
                            <Badge variant="secondary" className="text-[11px]">
                              {card.mode === 'auto' ? 'Auto' : 'Customized'}
                            </Badge>
                            <Badge variant="secondary" className="text-[11px]">
                              Suggested: {card.suggestedTeam}
                            </Badge>
                          </>
                        ) : null}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        Lowest projected PT-FTE after Step 2: {card.suggestedTeam}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {card.allocationMode === 'single-team' ? (
                          <Select
                            value={card.mode === 'auto' ? card.suggestedTeam : card.assignedTeam}
                            onValueChange={(value) => {
                              const team = value as Team
                              if (team === card.suggestedTeam) {
                                handleUseAuto(card.staffId)
                              } else {
                                updateCard(card.staffId, (current) => ({
                                  ...current,
                                  mode: 'custom',
                                  assignedTeam: team,
                                }))
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 w-auto min-w-0 px-3 text-sm font-medium">
                              <span className="flex items-center gap-1.5">
                                {card.mode === 'auto'
                                  ? `Use auto (${card.suggestedTeam})`
                                  : `Customized: ${card.assignedTeam}`}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {TEAMS.map((team) => (
                                <SelectItem key={team} value={team}>
                                  {team === card.suggestedTeam ? `${team} (Auto)` : team}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleUseAuto(card.staffId)}>
                              Use auto
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (card.expanded) {
                                  updateCard(card.staffId, (current) => ({ ...current, expanded: false, selectedSlots: [] }))
                                } else {
                                  handleCustomize(card.staffId)
                                }
                              }}
                            >
                              {card.expanded ? (
                                <>
                                  Collapse <ChevronUp className="ml-1 h-4 w-4 shrink-0" aria-hidden />
                                </>
                              ) : (
                                <>
                                  Customize <ChevronDown className="ml-1 h-4 w-4 shrink-0" aria-hidden />
                                </>
                              )}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleReset(card.staffId)}>
                              Reset
                            </Button>
                          </>
                        )}
                      </div>

                      <div className="text-sm text-foreground">
                        <span className="font-medium text-muted-foreground">Coverage today:</span>{' '}
                        <span>{coverageSummary}</span>
                      </div>
                    </CardHeader>

                    {card.expanded && card.allocationMode === 'slot-based' ? (
                      <>
                        <Separator />
                        <CardContent className="space-y-4 pt-4">
                              <div className="text-xs text-muted-foreground">
                                Select one or more slots, then choose a team below.
                              </div>

                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  {SLOT_KEYS.map((slot) => {
                                    const isAvailable = card.availableSlots.includes(slot)
                                    const team = card.slotTeamBySlot[slot]
                                    const selected = card.selectedSlots.includes(slot)
                                    const isAssigned = !!team
                                    return (
                                      <button
                                        key={slot}
                                        type="button"
                                        disabled={!isAvailable}
                                        onClick={() =>
                                          updateCard(card.staffId, (current) => ({
                                            ...current,
                                            selectedSlots: toggleSharedTherapistSelectedSlot(current.selectedSlots, slot),
                                          }))
                                        }
                                        className={cn(
                                          'rounded-md border px-3 py-2 text-left transition-colors',
                                          selected
                                            ? 'border-blue-600 ring-2 ring-blue-200 bg-background text-foreground'
                                            : !isAvailable
                                              ? 'border-border bg-muted text-muted-foreground opacity-50'
                                            : isAssigned
                                              ? 'border-blue-200 bg-blue-50 text-blue-900'
                                              : 'border-border bg-gray-100 text-gray-700'
                                        )}
                                      >
                                        <div className="text-[11px] font-semibold">Slot {slot}</div>
                                        <div className="text-sm font-medium">{isAvailable ? (team ?? '—') : 'N/A'}</div>
                                      </button>
                                    )
                                  })}
                                </div>
                                <div className={quickSelectPresentation.helperRowClass}>
                                  <span className="font-medium">AM</span>
                                  <span>Slots 1-2</span>
                                  <span className="font-medium">PM</span>
                                  <span>Slots 3-4</span>
                                  <span
                                    aria-hidden="true"
                                    className={quickSelectPresentation.separatorClass}
                                  >
                                    ·
                                  </span>
                                  <div className={quickSelectPresentation.quickSelectGroupClass}>
                                    <span className={quickSelectPresentation.quickSelectLabelClass}>Quick select:</span>
                                    {[
                                      { label: 'All', slots: [1, 2, 3, 4] as Array<1 | 2 | 3 | 4> },
                                      { label: 'AM', slots: [1, 2] as Array<1 | 2 | 3 | 4> },
                                      { label: 'PM', slots: [3, 4] as Array<1 | 2 | 3 | 4> },
                                    ].map((action) => (
                                      <Button
                                        key={action.label}
                                        type="button"
                                        variant="ghost"
                                        className={quickSelectPresentation.chipButtonClass}
                                        onClick={() =>
                                          updateCard(card.staffId, (current) => ({
                                            ...current,
                                            selectedSlots: action.slots.filter((slot) => current.availableSlots.includes(slot)),
                                          }))
                                        }
                                      >
                                        {action.label}
                                      </Button>
                                    ))}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className={quickSelectPresentation.chipButtonClass}
                                      onClick={() => updateCard(card.staffId, (current) => ({ ...current, selectedSlots: [] }))}
                                    >
                                      Clear
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-medium text-muted-foreground">Assign to</div>
                                  {card.selectedSlots.length > 0 ? (
                                    <div className="text-[11px] text-muted-foreground">
                                      Selection clears after assignment.
                                    </div>
                                  ) : null}
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  {TEAMS.map((team) => (
                                    <button
                                      key={team}
                                      type="button"
                                      disabled={card.selectedSlots.length === 0}
                                      onClick={() => handleAssignTeam(card.staffId, team)}
                                      className={cn(
                                        'rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                        card.selectedSlots.length > 0 ? 'border-border bg-gray-100 text-gray-700 hover:border-blue-300' : 'border-border bg-muted text-muted-foreground'
                                      )}
                                    >
                                      {team}
                                    </button>
                                  ))}
                                </div>
                              </div>
                        </CardContent>
                      </>
                    ) : null}
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 flex-row flex-wrap items-center gap-2 border-t bg-background/95 px-1 pt-3 sm:justify-between sm:px-0">
          {onBack ? (
            <Button variant="outline" onClick={onBack} className="mr-auto">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back to 2.2</span>
            </Button>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={onSkip}>
              Skip
            </Button>
            <Button onClick={handleConfirm}>Confirm</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
