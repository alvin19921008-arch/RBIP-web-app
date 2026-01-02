'use client'

import { useState, useMemo } from 'react'
import { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { Staff } from '@/types/staff'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTeamFloor, isFloorPCAForTeam, getTeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { PCAData } from '@/lib/algorithms/pcaAllocation'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

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
    }>
  }>>
  isWizardMode: boolean // true if multiple teams (wizard), false if single team (simple dialog)
  allStaff: Staff[]
  pcaPreferences: PCAPreference[]
  specialPrograms: SpecialProgram[]
  weekday: string
  currentAllocations: PCAAllocation[]
  staffOverrides: Record<string, { availableSlots?: number[] }>
  onConfirm: (selections: Record<string, { floatingPCAId: string; slots: number[] }>) => void
  onCancel: () => void
  onSkip: () => void
}

interface AvailableFloatingPCA {
  id: string
  name: string
  availableSlots: number[]
  isPreferred: boolean
  isFloorPCA: boolean
  specialPrograms: string[]
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
  onConfirm,
  onCancel,
  onSkip,
}: NonFloatingSubstitutionDialogProps) {
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0)
  const [selections, setSelections] = useState<Record<string, { floatingPCAId: string; slots: number[] }>>({})

  // For single team mode, always use the first (and only) team
  const currentTeam = isWizardMode ? teams[currentTeamIndex] : teams[0]
  const currentSubstitutions = substitutionsByTeam[currentTeam] || []

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
        specialPrograms: [] // Not needed for display, already filtered
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
        [key]: { floatingPCAId, slots }
      }))
    } else {
      const newSelections = { ...selections }
      delete newSelections[key]
      setSelections(newSelections)
    }
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

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isWizardMode 
              ? 'Non-Floating PCA Substitution' 
              : `Non-Floating PCA Substitution - ${currentTeam} Team`}
          </DialogTitle>
          <DialogDescription>
            {isWizardMode 
              ? `Select floating PCAs to substitute for non-floating PCAs with reduced FTE (${teams.length} team${teams.length > 1 ? 's' : ''} need substitution)`
              : 'Select floating PCAs to substitute for non-floating PCAs with reduced FTE'}
          </DialogDescription>
        </DialogHeader>

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
              Team {currentTeamIndex + 1} of {teams.length}: {currentTeam}
            </div>
            {isLastTeam ? (
              <Button
                onClick={handleConfirm}
                className="flex items-center gap-2"
              >
                Confirm All
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleNext}
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
              const currentSelection = selections[selectionKey]
              const teamFloor = getTeamFloor(currentTeam, pcaPreferences)

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
                      {/* Preferred PCAs */}
                      {preferred.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">Preferred PCAs</div>
                          <div className="space-y-2">
                            {preferred.map(pca => {
                              const isSelected = currentSelection?.floatingPCAId === pca.id
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, sub.missingSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {pca.name} ({pca.availableSlots.length} slots available)
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
                              const isSelected = currentSelection?.floatingPCAId === pca.id
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, sub.missingSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {pca.name} ({pca.availableSlots.length} slots available)
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
                              const isSelected = currentSelection?.floatingPCAId === pca.id
                              return (
                                <div key={pca.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      handleSelectionChange(sub.nonFloatingPCAId, pca.id, sub.missingSlots, checked as boolean)
                                    }
                                  />
                                  <label
                                    htmlFor={`${sub.nonFloatingPCAId}-${pca.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {pca.name} ({pca.availableSlots.length} slots available)
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={onSkip}>
            {isWizardMode ? 'Skip All' : 'Skip'}
          </Button>
          <div className="flex gap-2">
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
              <Button onClick={handleConfirm}>
                Confirm
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
