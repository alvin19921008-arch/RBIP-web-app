'use client'

import { useEffect, useState, useMemo } from 'react'
import { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { Staff } from '@/types/staff'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTeamFloor, isFloorPCAForTeam, getTeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { PCAData } from '@/lib/algorithms/pcaAllocation'
import { getSlotTime, formatTimeRange } from '@/lib/utils/slotHelpers'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

// Step 2.1 Wizard team themes:
// Used to visually differentiate teams when multiple teams need non-floating substitution on the same day.
// NOTE: We intentionally keep these light (50 backgrounds, 200 borders, 700 text) for readability.
// Added 2 more themes to reduce early recycling (4th+ team).
const TEAM_THEME_PALETTE = [
  { badge: 'border-sky-200 bg-sky-50 text-sky-700', panel: 'border-sky-200 bg-sky-50/40 text-sky-950' },
  { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', panel: 'border-emerald-200 bg-emerald-50/40 text-emerald-950' },
  { badge: 'border-violet-200 bg-violet-50 text-violet-700', panel: 'border-violet-200 bg-violet-50/40 text-violet-950' },
  // New themes (to avoid quick recycling)
  { badge: 'border-teal-200 bg-teal-50 text-teal-700', panel: 'border-teal-200 bg-teal-50/40 text-teal-950' },
  { badge: 'border-rose-200 bg-rose-50 text-rose-700', panel: 'border-rose-200 bg-rose-50/40 text-rose-950' },
] as const

interface NonFloatingSubstitutionDialogProps {
  open: boolean
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
      blockedSlotsInfo?: Array<{ slot: number; reasons: string[] }>
    }>
  }>>
  isWizardMode: boolean // true if multiple teams (wizard), false if single team (simple dialog)
  allStaff: Staff[]
  pcaPreferences: PCAPreference[]
  specialPrograms: SpecialProgram[]
  weekday: string
  currentAllocations: PCAAllocation[]
  staffOverrides: Record<string, { availableSlots?: number[] }>
  initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  onConfirm: (selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>) => void
  onCancel: () => void
  onSkip: () => void
  /** Optional: show a Back button to previous Step 2 sub-step. */
  onBack?: () => void
}

interface AvailableFloatingPCA {
  id: string
  name: string
  availableSlots: number[]
  isPreferred: boolean
  isFloorPCA: boolean
  specialPrograms: string[]
  blockedSlotsInfo?: Array<{ slot: number; reasons: string[] }>
}

interface FloatingPCAUsage {
  selectionKey: string
  team: Team
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  slots: number[]
}

export function NonFloatingSubstitutionDialog({
  open,
  teams,
  substitutionsByTeam,
  isWizardMode,
  allStaff,
  pcaPreferences,
  specialPrograms,
  weekday,
  currentAllocations,
  staffOverrides,
  initialSelections,
  onConfirm,
  onCancel,
  onSkip,
  onBack,
}: NonFloatingSubstitutionDialogProps) {
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0)
  const [selections, setSelections] = useState<Record<string, Array<{ floatingPCAId: string; slots: number[] }>>>(
    () => initialSelections ?? {}
  )

  // When dialog opens, seed selections from initialSelections (if provided)
  useEffect(() => {
    if (!open) return
    setCurrentTeamIndex(0)
    setSelections(initialSelections ?? {})
  }, [open, initialSelections])

  // For single team mode, always use the first (and only) team
  const currentTeam = isWizardMode ? teams[currentTeamIndex] : teams[0]
  const currentSubstitutions = substitutionsByTeam[currentTeam] || []
  const currentTheme = TEAM_THEME_PALETTE[currentTeamIndex % TEAM_THEME_PALETTE.length]

  // Use availableFloatingPCAs directly from substitution data (already filtered and sorted by algorithm)
  const availablePCAsByNonFloating = useMemo(() => {
    const result: Record<string, AvailableFloatingPCA[]> = {}
    currentSubstitutions.forEach(sub => {
      // Convert from algorithm format to dialog format
      result[sub.nonFloatingPCAId] = sub.availableFloatingPCAs.map(pca => ({
        id: pca.id,
        name: pca.name,
        availableSlots: pca.availableSlots,
        isPreferred: pca.isPreferred,
        isFloorPCA: pca.isFloorPCA,
        specialPrograms: [], // Not needed for display, already filtered
        blockedSlotsInfo: (pca as any).blockedSlotsInfo,
      }))
    })
    return result
  }, [currentSubstitutions])

  const handleSelectionChange = (
    nonFloatingPCAId: string,
    floatingPCAId: string,
    slots: number[],
    selected: boolean
  ) => {
    const key = `${currentTeam}-${nonFloatingPCAId}`
    if (selected) {
      setSelections(prev => ({
        ...prev,
        // Primary selection replaces any existing selections for this non-floating PCA.
        [key]: [{ floatingPCAId, slots }]
      }))
    } else {
      setSelections((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const addCoverSelection = (nonFloatingPCAId: string, floatingPCAId: string, slots: number[]) => {
    const key = `${currentTeam}-${nonFloatingPCAId}`
    setSelections((prev) => {
      const existing = prev[key] ?? []
      // Prevent duplicates of same PCA
      if (existing.some((s) => s.floatingPCAId === floatingPCAId)) return prev
      return { ...prev, [key]: [...existing, { floatingPCAId, slots }] }
    })
  }

  const removeCoverSelection = (nonFloatingPCAId: string, floatingPCAId: string) => {
    const key = `${currentTeam}-${nonFloatingPCAId}`
    setSelections((prev) => {
      const existing = prev[key] ?? []
      const nextArr = existing.filter((s) => s.floatingPCAId !== floatingPCAId)
      const next = { ...prev }
      if (nextArr.length === 0) delete next[key]
      else next[key] = nextArr
      return next
    })
  }

  const handlePrevious = () => {
    if (currentTeamIndex > 0) {
      setCurrentTeamIndex(currentTeamIndex - 1)
    }
  }

  const handleNext = () => {
    if (currentTeamIndex < teams.length - 1) {
      setCurrentTeamIndex(currentTeamIndex + 1)
    }
  }

  const handleConfirm = () => {
    onConfirm(selections)
  }

  const isFirstTeam = currentTeamIndex === 0
  const isLastTeam = currentTeamIndex === teams.length - 1

  const isSubstitutionComplete = (team: Team, nonFloatingPCAId: string, missingSlots: number[]): boolean => {
    const key = `${team}-${nonFloatingPCAId}`
    const sels = selections[key] ?? []
    const covered = new Set(sels.flatMap((s) => s.slots))
    return missingSlots.every((slot) => covered.has(slot))
  }

  const isCurrentTeamComplete = currentSubstitutions.every((sub) =>
    isSubstitutionComplete(currentTeam, sub.nonFloatingPCAId, sub.missingSlots)
  )

  const isAllTeamsComplete = TEAMS.filter((t) => (substitutionsByTeam[t] ?? []).length > 0).every((team) =>
    (substitutionsByTeam[team] ?? []).every((sub) => isSubstitutionComplete(team, sub.nonFloatingPCAId, sub.missingSlots))
  )

  // Group available PCAs by category for display
  const groupPCAsByCategory = (pcas: AvailableFloatingPCA[]) => {
    const preferred: AvailableFloatingPCA[] = []
    const floor: AvailableFloatingPCA[] = []
    const nonFloor: AvailableFloatingPCA[] = []

    pcas.forEach(pca => {
      if (pca.isPreferred) {
        preferred.push(pca)
      } else if (pca.isFloorPCA) {
        floor.push(pca)
      } else {
        nonFloor.push(pca)
      }
    })

    return { preferred, floor, nonFloor }
  }

  const getDisplaySlotsCount = (pcaId: string, availableSlots: number[]) => {
    const staff = allStaff.find(s => s.id === pcaId)
    if (staff?.status === 'buffer' && typeof (staff as any)?.buffer_fte === 'number') {
      const override = staffOverrides?.[pcaId]
      const capFte =
        typeof (override as any)?.fteRemaining === 'number'
          ? Math.max(0, Math.min((override as any).fteRemaining, (staff as any).buffer_fte))
          : (staff as any).buffer_fte
      const capSlots = Math.max(0, Math.min(4, Math.round(capFte / 0.25)))
      return capSlots
    }
    return Array.isArray(availableSlots) ? availableSlots.length : 0
  }

  const nonFloatingNameById = useMemo(() => {
    const names = new Map<string, string>()
    TEAMS.forEach((team) => {
      ;(substitutionsByTeam[team] || []).forEach((sub) => {
        names.set(sub.nonFloatingPCAId, sub.nonFloatingPCAName)
      })
    })
    return names
  }, [substitutionsByTeam])

  const floatingUsageById = useMemo(() => {
    const usage: Record<string, FloatingPCAUsage[]> = {}
    Object.entries(selections || {}).forEach(([selectionKey, entries]) => {
      const dashIdx = selectionKey.indexOf('-')
      const team = (dashIdx >= 0 ? selectionKey.slice(0, dashIdx) : selectionKey) as Team
      const nonFloatingPCAId = dashIdx >= 0 ? selectionKey.slice(dashIdx + 1) : ''
      const nonFloatingPCAName = nonFloatingNameById.get(nonFloatingPCAId) ?? nonFloatingPCAId
      ;(entries || []).forEach((entry) => {
        const floatingPCAId = entry?.floatingPCAId
        if (!floatingPCAId) return
        usage[floatingPCAId] = usage[floatingPCAId] ?? []
        usage[floatingPCAId].push({
          selectionKey,
          team,
          nonFloatingPCAId,
          nonFloatingPCAName,
          slots: Array.isArray(entry.slots) ? entry.slots : [],
        })
      })
    })
    return usage
  }, [selections, nonFloatingNameById])

  const getReservedLabel = (pca: AvailableFloatingPCA): string | null => {
    return Array.isArray(pca.blockedSlotsInfo) && pca.blockedSlotsInfo.length > 0
      ? pca.blockedSlotsInfo
          .map((b) => {
            const names = Array.isArray(b.reasons) && b.reasons.length > 0 ? b.reasons.join(', ') : 'Special program'
            return `Slot ${b.slot}: ${names}`
          })
          .join(', ')
      : null
  }

  const getUsageForOtherSelection = (selectionKey: string, pcaId: string): FloatingPCAUsage[] => {
    const usage = floatingUsageById[pcaId] ?? []
    return usage.filter((u) => u.selectionKey !== selectionKey)
  }

  const getUsedSlotsByOtherSelection = (selectionKey: string, pcaId: string): number[] => {
    const used = new Set<number>()
    getUsageForOtherSelection(selectionKey, pcaId).forEach((u) => {
      ;(u.slots || []).forEach((slot) => {
        if ([1, 2, 3, 4].includes(slot)) used.add(slot)
      })
    })
    return [...used].sort((a, b) => a - b)
  }

  const getEffectiveAvailableSlots = (selectionKey: string, pca: AvailableFloatingPCA): number[] => {
    const usedSlots = new Set(getUsedSlotsByOtherSelection(selectionKey, pca.id))
    return (Array.isArray(pca.availableSlots) ? pca.availableSlots : [])
      .filter((slot) => !usedSlots.has(slot))
      .sort((a, b) => a - b)
  }

  const formatUsageSummary = (usages: FloatingPCAUsage[]): string => {
    if (usages.length === 0) return ''
    const rows = usages.map((u) => `${u.team}, slots: ${u.slots.length > 0 ? u.slots.join(',') : '-'}`)
    return rows.join(' · ')
  }

  const getPcaOptionText = (pca: AvailableFloatingPCA, selectionKey: string): string => {
    const usages = getUsageForOtherSelection(selectionKey, pca.id)
    if (usages.length > 0) {
      return `${pca.name} — covering ${formatUsageSummary(usages)}`
    }
    return `${pca.name} (${getDisplaySlotsCount(pca.id, pca.availableSlots)} slots available)`
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-4xl flex-col overflow-hidden sm:h-auto sm:w-full sm:max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>Choose substitutes</DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground">
              Step 2.1{isWizardMode ? ` · ${currentTeamIndex + 1} / ${teams.length}` : ''}
            </span>
            <span className="mt-1 block">
              Assign floating PCAs to cover missing non-floating slots.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain pr-1">
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="px-2.5 py-1 rounded-md">2.0 Programs</span>
            <span aria-hidden="true">·</span>
            <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 font-semibold text-primary">2.1 Substitute</span>
            <span aria-hidden="true">·</span>
            <span className="px-2.5 py-1 rounded-md">2.2 SPT</span>
          </div>

          {/* Navigation - only show for wizard mode */}
          {isWizardMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b py-4">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={isFirstTeam}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-sm font-medium">
                <span className="inline-flex items-center gap-2">
                  <span>
                    Team {currentTeamIndex + 1} of {teams.length}:
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('select-none px-2 py-0.5 text-[11px] font-medium', currentTheme.badge)}
                  >
                    {currentTeam}
                  </Badge>
                </span>
              </div>
              {!isLastTeam ? (
                <Button
                  variant="outline"
                  onClick={handleNext}
                  disabled={!isCurrentTeamComplete}
                  className="flex items-center gap-2"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                // Keep layout stable (footer has confirm action).
                <div className="hidden w-[104px] sm:block" />
              )}
            </div>
          )}

          {/* Content */}
          <div className="space-y-6 py-4">
          {currentSubstitutions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No non-floating PCAs need substitution for this team.
            </div>
          ) : (
            currentSubstitutions.map((sub) => {
              const availablePCAs = availablePCAsByNonFloating[sub.nonFloatingPCAId] || []
              const { preferred, floor, nonFloor } = groupPCAsByCategory(availablePCAs)
              const selectionKey = `${currentTeam}-${sub.nonFloatingPCAId}`
              const currentSelections = selections[selectionKey] ?? []
              const primarySelection = currentSelections[0] ?? null
              const selectedIds = new Set(currentSelections.map((s) => s.floatingPCAId))
              const coveredSlots = new Set(currentSelections.flatMap((s) => s.slots))
              const remainingSlots = sub.missingSlots.filter((slot) => !coveredSlots.has(slot))
              const teamFloor = getTeamFloor(currentTeam, pcaPreferences)

              const extraCandidates = availablePCAs.filter((pca) => {
                if (primarySelection?.floatingPCAId === pca.id) return false
                const effectiveAvailable = getEffectiveAvailableSlots(selectionKey, pca)
                const coverable = remainingSlots.filter((slot) => effectiveAvailable.includes(slot))
                if (selectedIds.has(pca.id)) return true
                return coverable.length > 0
              })
              const extraGroups = groupPCAsByCategory(extraCandidates)

              return (
                <div key={sub.nonFloatingPCAId} className="border rounded-lg p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{sub.nonFloatingPCAName}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'select-none px-2 py-0.5 text-[11px] font-medium',
                        currentTheme.badge
                      )}
                    >
                      {currentTeam}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Missing slots: {sub.missingSlots.join(', ')}
                    </span>
                  </div>
                  {availablePCAs.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">
                      No available floating PCAs found for substitution.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {currentSelections.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Selected covers</div>
                          <div className="overflow-x-auto rounded-md border">
                            <table className="w-full min-w-[680px] text-sm">
                              <caption className="px-3 py-2 text-left text-sm font-semibold">
                                {sub.nonFloatingPCAName}
                              </caption>
                              <thead className="bg-muted/40">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium">Floating PCA</th>
                                  {[1, 2, 3, 4].map((slot) => (
                                    <th key={`head-${slot}`} className="px-2 py-2 text-center font-medium">
                                      <div>Slot {slot}</div>
                                      <div className="text-xs font-normal text-muted-foreground">
                                        {formatTimeRange(getSlotTime(slot))}
                                      </div>
                                    </th>
                                  ))}
                                  <th className="px-3 py-2 text-right font-medium">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-t bg-muted/10">
                                  <td className="px-3 py-2 align-top">
                                    <div className="text-xs font-medium text-muted-foreground">Need coverage</div>
                                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                                      FTE: {sub.fte.toFixed(2)} · Missing slots: {sub.missingSlots.join(', ')}
                                    </div>
                                  </td>
                                  {[1, 2, 3, 4].map((slot) => {
                                    const needed = sub.missingSlots.includes(slot)
                                    return (
                                      <td key={`need-${slot}`} className="px-2 py-2 text-center text-xs">
                                        {needed ? (
                                          <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700">
                                            Need
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    )
                                  })}
                                  <td className="px-3 py-2" />
                                </tr>
                                {currentSelections.map((sel, idx) => {
                                  const staffName =
                                    availablePCAs.find((p) => p.id === sel.floatingPCAId)?.name ??
                                    allStaff.find((s) => s.id === sel.floatingPCAId)?.name ??
                                    sel.floatingPCAId
                                  const coveredBySel = new Set(sel.slots)
                                  return (
                                    <tr key={`${sel.floatingPCAId}-${idx}`} className="border-t">
                                      <td className="px-3 py-2 font-medium">{staffName}</td>
                                      {[1, 2, 3, 4].map((slot) => {
                                        const covers = coveredBySel.has(slot)
                                        return (
                                          <td key={`${sel.floatingPCAId}-${slot}`} className="px-2 py-2 text-center">
                                            {covers ? (
                                              <span className="inline-flex rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                                Cover
                                              </span>
                                            ) : (
                                              <span className="text-muted-foreground">—</span>
                                            )}
                                          </td>
                                        )
                                      })}
                                      <td className="px-3 py-2 text-right">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => removeCoverSelection(sub.nonFloatingPCAId, sel.floatingPCAId)}
                                        >
                                          Remove
                                        </Button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}

                      {/* Preferred PCAs */}
                      {preferred.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">Preferred PCAs</div>
                          <div className="space-y-2">
                            {preferred.map(pca => {
                              const isSelected = primarySelection?.floatingPCAId === pca.id
                              const effectiveAvailable = getEffectiveAvailableSlots(selectionKey, pca)
                              const coverableSlots = sub.missingSlots.filter((slot) => effectiveAvailable.includes(slot))
                              const reservedLabel = getReservedLabel(pca)
                              const disabledByUsage = coverableSlots.length === 0 && !isSelected
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    disabled={disabledByUsage}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, coverableSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className={cn('text-sm flex-1', disabledByUsage ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                                  >
                                    {getPcaOptionText(pca, selectionKey)}
                                    {!disabledByUsage && reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Floor PCAs */}
                      {floor.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">
                            Floor PCAs ({teamFloor === 'upper' ? 'Upper' : teamFloor === 'lower' ? 'Lower' : 'N/A'})
                          </div>
                          <div className="space-y-2">
                            {floor.map(pca => {
                              const isSelected = primarySelection?.floatingPCAId === pca.id
                              const effectiveAvailable = getEffectiveAvailableSlots(selectionKey, pca)
                              const coverableSlots = sub.missingSlots.filter((slot) => effectiveAvailable.includes(slot))
                              const reservedLabel = getReservedLabel(pca)
                              const disabledByUsage = coverableSlots.length === 0 && !isSelected
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    disabled={disabledByUsage}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, coverableSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className={cn('text-sm flex-1', disabledByUsage ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                                  >
                                    {getPcaOptionText(pca, selectionKey)}
                                    {!disabledByUsage && reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Non-Floor PCAs */}
                      {nonFloor.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">Non-Floor PCAs</div>
                          <div className="space-y-2">
                            {nonFloor.map(pca => {
                              const isSelected = primarySelection?.floatingPCAId === pca.id
                              const effectiveAvailable = getEffectiveAvailableSlots(selectionKey, pca)
                              const coverableSlots = sub.missingSlots.filter((slot) => effectiveAvailable.includes(slot))
                              const reservedLabel = getReservedLabel(pca)
                              const disabledByUsage = coverableSlots.length === 0 && !isSelected
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    disabled={disabledByUsage}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, coverableSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className={cn('text-sm flex-1', disabledByUsage ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                                  >
                                    {getPcaOptionText(pca, selectionKey)}
                                    {!disabledByUsage && reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {currentSelections.length > 0 ? (
                        <div className="border-t pt-4 space-y-2">
                          <div className="text-sm font-medium flex items-center gap-2">
                            {remainingSlots.length === 0 ? (
                              <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                <span className="absolute inset-0 rounded-full bg-emerald-500/10" />
                                <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" />
                                <svg
                                  viewBox="0 0 24 24"
                                  className="relative h-3.5 w-3.5 text-emerald-700"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              </span>
                            ) : null}
                            <span>
                              {remainingSlots.length > 0
                                ? `Cover remaining slots: ${remainingSlots.join(', ')}`
                                : 'All missing slots are covered'}
                            </span>
                          </div>
                          {remainingSlots.length === 0 ? (
                            <div className="sr-only">All missing slots are covered</div>
                          ) : extraCandidates.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              No additional floating PCAs can cover the remaining slot(s).
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {extraGroups.preferred.length > 0 ? (
                                <div>
                                  <div className="text-sm font-medium mb-2">Preferred PCAs</div>
                                  <div className="space-y-2">
                                    {extraGroups.preferred.map((pca) => {
                                      const effectiveAvailable = getEffectiveAvailableSlots(selectionKey, pca)
                                      const coverable = remainingSlots.filter((slot) => effectiveAvailable.includes(slot))
                                      const reservedLabel = getReservedLabel(pca)
                                      const isSelected = selectedIds.has(pca.id)
                                      const disabledByUsage = !isSelected && coverable.length === 0
                                      return (
                                        <div key={`extra-${pca.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            checked={isSelected}
                                            disabled={disabledByUsage}
                                            onCheckedChange={(checked) => {
                                              if (checked) addCoverSelection(sub.nonFloatingPCAId, pca.id, coverable)
                                              else removeCoverSelection(sub.nonFloatingPCAId, pca.id)
                                            }}
                                          />
                                          <label
                                            htmlFor={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            className={cn('text-sm flex-1', disabledByUsage ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                                          >
                                            {getPcaOptionText(pca, selectionKey)}
                                            {!disabledByUsage && reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
                                          </label>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {extraGroups.floor.length > 0 ? (
                                <div>
                                  <div className="text-sm font-medium mb-2">
                                    Floor PCAs ({teamFloor === 'upper' ? 'Upper' : teamFloor === 'lower' ? 'Lower' : 'N/A'})
                                  </div>
                                  <div className="space-y-2">
                                    {extraGroups.floor.map((pca) => {
                                      const effectiveAvailable = getEffectiveAvailableSlots(selectionKey, pca)
                                      const coverable = remainingSlots.filter((slot) => effectiveAvailable.includes(slot))
                                      const reservedLabel = getReservedLabel(pca)
                                      const isSelected = selectedIds.has(pca.id)
                                      const disabledByUsage = !isSelected && coverable.length === 0
                                      return (
                                        <div key={`extra-${pca.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            checked={isSelected}
                                            disabled={disabledByUsage}
                                            onCheckedChange={(checked) => {
                                              if (checked) addCoverSelection(sub.nonFloatingPCAId, pca.id, coverable)
                                              else removeCoverSelection(sub.nonFloatingPCAId, pca.id)
                                            }}
                                          />
                                          <label
                                            htmlFor={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            className={cn('text-sm flex-1', disabledByUsage ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                                          >
                                            {getPcaOptionText(pca, selectionKey)}
                                            {!disabledByUsage && reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
                                          </label>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {extraGroups.nonFloor.length > 0 ? (
                                <div>
                                  <div className="text-sm font-medium mb-2">Non-Floor PCAs</div>
                                  <div className="space-y-2">
                                    {extraGroups.nonFloor.map((pca) => {
                                      const effectiveAvailable = getEffectiveAvailableSlots(selectionKey, pca)
                                      const coverable = remainingSlots.filter((slot) => effectiveAvailable.includes(slot))
                                      const reservedLabel = getReservedLabel(pca)
                                      const isSelected = selectedIds.has(pca.id)
                                      const disabledByUsage = !isSelected && coverable.length === 0
                                      return (
                                        <div key={`extra-${pca.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            checked={isSelected}
                                            disabled={disabledByUsage}
                                            onCheckedChange={(checked) => {
                                              if (checked) addCoverSelection(sub.nonFloatingPCAId, pca.id, coverable)
                                              else removeCoverSelection(sub.nonFloatingPCAId, pca.id)
                                            }}
                                          />
                                          <label
                                            htmlFor={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            className={cn('text-sm flex-1', disabledByUsage ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                                          >
                                            {getPcaOptionText(pca, selectionKey)}
                                            {!disabledByUsage && reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
                                          </label>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })
          )}
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-10 mt-4 flex-row flex-wrap items-center gap-2 border-t bg-background/95 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:justify-between sm:px-0">
          {onBack ? (
            <Button variant="outline" onClick={onBack} className="mr-auto max-w-full whitespace-normal">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to 2.0
            </Button>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative group">
              <Button variant="outline" onClick={onSkip} className="max-w-full whitespace-normal">
                {isWizardMode ? 'Skip All' : 'Skip'}
              </Button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-popover border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none whitespace-normal">
                <p className="text-xs text-popover-foreground mb-2 font-medium">
                  Should the algorithm automatically assign floating PCAs to substitute for non-floating PCAs?
                </p>
                <ul className="text-xs text-popover-foreground space-y-1 list-disc list-inside">
                  <li><strong>Skip:</strong> Algorithm will automatically assign floating PCAs based on preferences and availability</li>
                  <li><strong>Cancel:</strong> Exit dialog without changes</li>
                  <li><strong>Confirm:</strong> Apply your manual substitution selections</li>
                </ul>
              </div>
            </div>
            <Button variant="outline" onClick={onCancel} className="max-w-full whitespace-normal">
              Cancel
            </Button>
            {!isWizardMode ? (
              <Button onClick={handleConfirm} disabled={!isCurrentTeamComplete} className="max-w-full whitespace-normal">
                Confirm
              </Button>
            ) : (
              <Button onClick={handleConfirm} disabled={!isAllTeamsComplete} className="max-w-full whitespace-normal">
                Confirm All
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
