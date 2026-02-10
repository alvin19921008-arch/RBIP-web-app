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
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTeamFloor, isFloorPCAForTeam, getTeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { PCAData } from '@/lib/algorithms/pcaAllocation'

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

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose substitutes</DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground">
              Step 2.1 ·{' '}
              <Badge
                variant="outline"
                className={cn(
                  'select-none px-2 py-0.5 text-[11px] font-medium align-middle',
                  isWizardMode ? currentTheme.badge : 'border-amber-200 bg-amber-50 text-amber-700'
                )}
              >
                {currentTeam}
              </Badge>
              {isWizardMode ? ` · ${currentTeamIndex + 1} / ${teams.length}` : ''}
            </span>
            <span className="mt-1 block">
              Assign floating PCAs to cover missing non-floating slots.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground pb-2 border-b">
          <span className="px-2.5 py-1 rounded-md">2.0 Programs</span>
          <ChevronRight className="h-3 w-3" />
          <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 font-semibold text-primary">2.1 Substitute</span>
          <ChevronRight className="h-3 w-3" />
          <span className="px-2.5 py-1 rounded-md">2.2 SPT</span>
        </div>

        {/* Navigation - only show for wizard mode */}
        {isWizardMode && (
          <div className="flex items-center justify-between py-4 border-b">
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
            {isLastTeam ? (
              <Button
                onClick={handleConfirm}
                disabled={!isAllTeamsComplete}
                className="flex items-center gap-2"
              >
                Confirm All
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleNext}
                disabled={!isCurrentTeamComplete}
                className="flex items-center gap-2"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
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
                if (selectedIds.has(pca.id)) return false
                const coverable = remainingSlots.filter((slot) => pca.availableSlots.includes(slot))
                return coverable.length > 0
              })
              const extraGroups = groupPCAsByCategory(extraCandidates)

              return (
                <div key={sub.nonFloatingPCAId} className="border rounded-lg p-4 space-y-4">
                  <div>
                    <h3 className="font-semibold">{sub.nonFloatingPCAName}</h3>
                    <p className="text-sm text-muted-foreground">
                      FTE: {sub.fte.toFixed(2)} (Missing: Slots {sub.missingSlots.join(', ')})
                    </p>
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
                          <div className="space-y-1">
                            {currentSelections.map((sel, idx) => {
                              const staffName =
                                availablePCAs.find((p) => p.id === sel.floatingPCAId)?.name ??
                                allStaff.find((s) => s.id === sel.floatingPCAId)?.name ??
                                sel.floatingPCAId
                              return (
                                <div key={`${sel.floatingPCAId}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                                  <div className="flex-1">
                                    <span className="font-medium">{staffName}</span>
                                    <span className="text-muted-foreground"> — covering slots: {sel.slots.join(', ')}</span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => removeCoverSelection(sub.nonFloatingPCAId, sel.floatingPCAId)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              )
                            })}
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
                              const coverableSlots = sub.missingSlots.filter((slot) => pca.availableSlots.includes(slot))
                              const reservedLabel = Array.isArray(pca.blockedSlotsInfo) && pca.blockedSlotsInfo.length > 0
                                ? pca.blockedSlotsInfo
                                    .map((b) => {
                                      const names = Array.isArray(b.reasons) && b.reasons.length > 0 ? b.reasons.join(', ') : 'Special program'
                                      return `Slot ${b.slot}: ${names}`
                                    })
                                    .join(', ')
                                : null
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, coverableSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {pca.name} ({getDisplaySlotsCount(pca.id, pca.availableSlots)} slots available)
                                    {reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
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
                              const coverableSlots = sub.missingSlots.filter((slot) => pca.availableSlots.includes(slot))
                              const reservedLabel = Array.isArray(pca.blockedSlotsInfo) && pca.blockedSlotsInfo.length > 0
                                ? pca.blockedSlotsInfo
                                    .map((b) => {
                                      const names = Array.isArray(b.reasons) && b.reasons.length > 0 ? b.reasons.join(', ') : 'Special program'
                                      return `Slot ${b.slot}: ${names}`
                                    })
                                    .join(', ')
                                : null
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, coverableSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {pca.name} ({getDisplaySlotsCount(pca.id, pca.availableSlots)} slots available)
                                    {reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
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
                              const coverableSlots = sub.missingSlots.filter((slot) => pca.availableSlots.includes(slot))
                              const reservedLabel = Array.isArray(pca.blockedSlotsInfo) && pca.blockedSlotsInfo.length > 0
                                ? pca.blockedSlotsInfo
                                    .map((b) => {
                                      const names = Array.isArray(b.reasons) && b.reasons.length > 0 ? b.reasons.join(', ') : 'Special program'
                                      return `Slot ${b.slot}: ${names}`
                                    })
                                    .join(', ')
                                : null
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, coverableSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {pca.name} ({getDisplaySlotsCount(pca.id, pca.availableSlots)} slots available)
                                    {reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {primarySelection && remainingSlots.length > 0 ? (
                        <div className="border-t pt-4 space-y-2">
                          <div className="text-sm font-medium">
                            Cover remaining slots: {remainingSlots.join(', ')}
                          </div>
                          {extraCandidates.length === 0 ? (
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
                                      const coverable = remainingSlots.filter((slot) => pca.availableSlots.includes(slot))
                                      const reservedLabel =
                                        Array.isArray(pca.blockedSlotsInfo) && pca.blockedSlotsInfo.length > 0
                                          ? pca.blockedSlotsInfo
                                              .map((b) => {
                                                const names =
                                                  Array.isArray(b.reasons) && b.reasons.length > 0 ? b.reasons.join(', ') : 'Special program'
                                                return `Slot ${b.slot}: ${names}`
                                              })
                                              .join(', ')
                                          : null
                                      return (
                                        <div key={`extra-${pca.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            checked={false}
                                            onCheckedChange={(checked) => {
                                              if (checked) addCoverSelection(sub.nonFloatingPCAId, pca.id, coverable)
                                            }}
                                          />
                                          <label
                                            htmlFor={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            className="text-sm cursor-pointer flex-1"
                                          >
                                            {pca.name} ({getDisplaySlotsCount(pca.id, pca.availableSlots)} slots available)
                                            {reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
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
                                      const coverable = remainingSlots.filter((slot) => pca.availableSlots.includes(slot))
                                      const reservedLabel =
                                        Array.isArray(pca.blockedSlotsInfo) && pca.blockedSlotsInfo.length > 0
                                          ? pca.blockedSlotsInfo
                                              .map((b) => {
                                                const names =
                                                  Array.isArray(b.reasons) && b.reasons.length > 0 ? b.reasons.join(', ') : 'Special program'
                                                return `Slot ${b.slot}: ${names}`
                                              })
                                              .join(', ')
                                          : null
                                      return (
                                        <div key={`extra-${pca.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            checked={false}
                                            onCheckedChange={(checked) => {
                                              if (checked) addCoverSelection(sub.nonFloatingPCAId, pca.id, coverable)
                                            }}
                                          />
                                          <label
                                            htmlFor={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            className="text-sm cursor-pointer flex-1"
                                          >
                                            {pca.name} ({getDisplaySlotsCount(pca.id, pca.availableSlots)} slots available)
                                            {reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
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
                                      const coverable = remainingSlots.filter((slot) => pca.availableSlots.includes(slot))
                                      const reservedLabel =
                                        Array.isArray(pca.blockedSlotsInfo) && pca.blockedSlotsInfo.length > 0
                                          ? pca.blockedSlotsInfo
                                              .map((b) => {
                                                const names =
                                                  Array.isArray(b.reasons) && b.reasons.length > 0 ? b.reasons.join(', ') : 'Special program'
                                                return `Slot ${b.slot}: ${names}`
                                              })
                                              .join(', ')
                                          : null
                                      return (
                                        <div key={`extra-${pca.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            checked={false}
                                            onCheckedChange={(checked) => {
                                              if (checked) addCoverSelection(sub.nonFloatingPCAId, pca.id, coverable)
                                            }}
                                          />
                                          <label
                                            htmlFor={`extra-${sub.nonFloatingPCAId}-${pca.id}`}
                                            className="text-sm cursor-pointer flex-1"
                                          >
                                            {pca.name} ({getDisplaySlotsCount(pca.id, pca.availableSlots)} slots available)
                                            {reservedLabel ? <span className="ml-2 text-xs text-muted-foreground">{reservedLabel}</span> : null}
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

        <DialogFooter className="flex justify-between">
          {onBack ? (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to 2.0
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <div className="relative inline-block group">
              <Button variant="outline" onClick={onSkip}>
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
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {isWizardMode ? (
              isLastTeam ? (
                <Button onClick={handleConfirm}>
                  Confirm All
                </Button>
              ) : (
                <Button onClick={handleNext} variant="outline">
                  Next Team
                </Button>
              )
            ) : (
              <Button onClick={handleConfirm} disabled={!isCurrentTeamComplete}>
                Confirm
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
