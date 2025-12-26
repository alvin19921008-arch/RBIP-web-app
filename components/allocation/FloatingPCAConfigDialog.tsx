'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { PCAData } from '@/lib/algorithms/pcaAllocation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TeamPendingCard, TIE_BREAKER_COLORS } from './TeamPendingCard'
import { TeamReservationCard } from './TeamReservationCard'
import { TeamAdjacentSlotCard } from './TeamAdjacentSlotCard'
import { ChevronRight, ArrowLeft, ArrowRight, Lightbulb } from 'lucide-react'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
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

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

// Mini-step within Step 3
type MiniStep = '3.1' | '3.2' | '3.3'

interface FloatingPCAConfigDialogProps {
  open: boolean
  initialPendingFTE: Record<Team, number>  // Raw pending FTE from Step 2
  pcaPreferences: PCAPreference[]  // Team preferences from database
  floatingPCAs: PCAData[]  // Floating PCAs with their current FTE
  existingAllocations: PCAAllocation[]  // Allocations from Step 2
  specialPrograms: SpecialProgram[]  // Special program definitions
  onSave: (
    adjustedFTE: Record<Team, number>, 
    order: Team[],
    slotAssignments: SlotAssignment[]
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
  initialPendingFTE,
  pcaPreferences,
  floatingPCAs,
  existingAllocations,
  specialPrograms,
  onSave,
  onCancel,
}: FloatingPCAConfigDialogProps) {
  // Current mini-step
  const [currentMiniStep, setCurrentMiniStep] = useState<MiniStep>('3.1')
  
  // Step 3.1: adjusted pending FTE values (rounded)
  const [adjustedFTE, setAdjustedFTE] = useState<Record<Team, number>>({} as Record<Team, number>)
  
  // State: original rounded pending FTE values (for reference and max constraint)
  const [originalRoundedFTE, setOriginalRoundedFTE] = useState<Record<Team, number>>({} as Record<Team, number>)
  
  // State: current team order (for display and saving)
  const [teamOrder, setTeamOrder] = useState<Team[]>([])
  
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
  
  // Initialize state when dialog opens
  useEffect(() => {
    if (open) {
      // Reset to step 3.1
      setCurrentMiniStep('3.1')
      setSlotSelections([])
      setTeamReservations(null)
      setPCASlotReservations({})
      
      // Reset Step 3.3 state
      setStep32Assignments([])
      setAdjacentReservations(null)
      setStep33Selections([])
      setUpdatedAllocations([...existingAllocations])
      
      // Round initial values - these are the original values (max allowed)
      const rounded: Record<Team, number> = {} as Record<Team, number>
      TEAMS.forEach(team => {
        rounded[team] = roundToNearestQuarterWithMidpoint(initialPendingFTE[team] || 0)
      })
      setOriginalRoundedFTE(rounded)
      setAdjustedFTE(rounded) // Start with original values
      
      // Initialize expectedFTE and currentPendingFTE from adjustedFTE
      setExpectedFTE(rounded)
      setCurrentPendingFTE(rounded)
      
      // Initial sort by descending pending FTE
      const sorted = sortTeamsByPendingFTE(TEAMS, rounded, TEAMS)
      setTeamOrder(sorted)
    }
  }, [open, initialPendingFTE, existingAllocations])
  
  // Compute tie groups from current adjusted FTE
  const tieGroups = useMemo(() => identifyTieGroups(adjustedFTE), [adjustedFTE])
  
  // Map team -> tie group info for quick lookup
  const teamTieInfo = useMemo(() => {
    const info: Record<Team, { isTied: boolean; groupIndex: number | null }> = {} as Record<Team, { isTied: boolean; groupIndex: number | null }>
    TEAMS.forEach(team => {
      info[team] = { isTied: false, groupIndex: null }
    })
    
    tieGroups.forEach(group => {
      group.teams.forEach(team => {
        info[team] = { isTied: true, groupIndex: group.colorIndex }
      })
    })
    
    return info
  }, [tieGroups])
  
  // Check if step 3.2 should be skipped (no reservations available)
  const hasAnyReservations = useMemo(() => {
    if (!teamReservations) return false
    return TEAMS.some(team => teamReservations[team] !== null)
  }, [teamReservations])
  
  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  )
  
  // Handle value change from +/- buttons (Step 3.1)
  const handleValueChange = (team: Team, newValue: number) => {
    const newAdjusted = { ...adjustedFTE, [team]: newValue }
    setAdjustedFTE(newAdjusted)
    
    // Re-sort teams by new values, preserving order within unchanged ties
    const newOrder = sortTeamsByPendingFTE(TEAMS, newAdjusted, teamOrder)
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
  
  // Handle proceeding from Step 3.1 to Step 3.2
  const handleProceedToStep32 = () => {
    // Set expectedFTE as the constant reference from 3.1
    setExpectedFTE({ ...adjustedFTE })
    // Initialize currentPendingFTE from adjustedFTE
    setCurrentPendingFTE({ ...adjustedFTE })
    // Store existing allocations for later updates
    setUpdatedAllocations([...existingAllocations])
    
    // Compute reservations based on Step 3.1 output
    const result = computeReservations(
      pcaPreferences,
      adjustedFTE,
      floatingPCAs,
      existingAllocations
    )
    
    setTeamReservations(result.teamReservations)
    setPCASlotReservations(result.pcaSlotReservations)
    setSlotSelections([])
    
    // If no reservations, check for adjacent slots or skip to final save
    if (!result.hasAnyReservations) {
      // Check if there are adjacent slots available
      const adjacentResult = computeAdjacentSlotReservations(
        adjustedFTE,
        existingAllocations,
        floatingPCAs,
        specialPrograms
      )
      
      if (adjacentResult.hasAnyAdjacentReservations) {
        setAdjacentReservations(adjacentResult.adjacentReservations)
        setCurrentMiniStep('3.3')
      } else {
        // No reservations and no adjacent slots - skip to final save
        onSave(adjustedFTE, teamOrder, [])
      }
    } else {
      setCurrentMiniStep('3.2')
    }
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
    
    // Execute 3.2 assignments to get updated state
    const result = executeSlotAssignments(
      slotSelections,
      currentPendingFTE,
      updatedAllocations,
      floatingPCAs
    )
    
    // Update state with 3.2 results
    setCurrentPendingFTE(result.updatedPendingFTE)
    setUpdatedAllocations(result.updatedAllocations)
    
    // Compute adjacent slot reservations based on updated state
    const adjacentResult = computeAdjacentSlotReservations(
      result.updatedPendingFTE,
      result.updatedAllocations,
      floatingPCAs,
      specialPrograms
    )
    
    setAdjacentReservations(adjacentResult.adjacentReservations)
    setStep33Selections([])
    
    // Skip 3.3 if no adjacent slots available
    if (!adjacentResult.hasAnyAdjacentReservations) {
      // Finalize with 3.2 assignments only
      onSave(result.updatedPendingFTE, teamOrder, slotSelections)
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
  
  // Handle final save (combines all assignments from 3.2 and 3.3)
  const handleFinalSave = () => {
    // Combine all assignments
    const allAssignments = [...step32Assignments, ...step33Selections]
    
    // Execute 3.3 assignments to get final pending FTE
    const result = executeSlotAssignments(
      step33Selections,
      currentPendingFTE,
      updatedAllocations,
      floatingPCAs
    )
    
    // Pass the final currentPendingFTE to the algorithm
    onSave(result.updatedPendingFTE, teamOrder, allAssignments)
  }
  
  // Handle skip assignments in Step 3.2 (skip to 3.3 or final)
  const handleSkipStep32 = () => {
    // Execute with empty assignments to check for adjacent slots
    const adjacentResult = computeAdjacentSlotReservations(
      currentPendingFTE,
      updatedAllocations,
      floatingPCAs,
      specialPrograms
    )
    
    if (adjacentResult.hasAnyAdjacentReservations) {
      setStep32Assignments([])
      setAdjacentReservations(adjacentResult.adjacentReservations)
      setStep33Selections([])
      setCurrentMiniStep('3.3')
    } else {
      // No adjacent slots - skip to final save with no assignments
      onSave(currentPendingFTE, teamOrder, [])
    }
  }
  
  // Handle skip assignments in Step 3.3
  const handleSkipStep33 = () => {
    // Finalize with only 3.2 assignments
    onSave(currentPendingFTE, teamOrder, step32Assignments)
  }
  
  // Render Step 3.1 content
  const renderStep31 = () => (
    <>
      <DialogDescription>
        Adjust the pending PCA's slot(s) a team would be receiving (if needed). The value shown here is already after the assignment of fixed-team PCA.
        <br />
        <span className="flex items-center gap-1.5 mt-1">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <strong>Suggestion:</strong> If among the tie-breaker group, the pending slots value is high (&gt;= 0.75) or there are &gt;=3 teams within same tie-breaker condition, manual force adjustment of the pending value may be needed.
        </span>
      </DialogDescription>
      
      <div className="py-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={teamOrder}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex flex-nowrap gap-1.5 justify-center items-center overflow-x-auto">
              {teamOrder.map((team, index) => (
                <div key={team} className="flex items-center gap-1.5">
                  <TeamPendingCard
                    team={team}
                    pendingFTE={adjustedFTE[team] || 0}
                    originalPendingFTE={originalRoundedFTE[team] || 0}
                    maxValue={originalRoundedFTE[team] || 0}
                    tieGroupIndex={teamTieInfo[team]?.groupIndex ?? null}
                    isTied={teamTieInfo[team]?.isTied ?? false}
                    onValueChange={handleValueChange}
                  />
                  {index < teamOrder.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        
        {/* Legend */}
        {tieGroups.length > 0 && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>Colored borders indicate tie-breaker groups. Drag within a group to set priority order.</p>
            <p className="mt-1 font-bold">This order would set the final team order the floating PCA algorithm would process.</p>
          </div>
        )}
      </div>
      
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleProceedToStep32}>
          Continue to 3.2 <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </DialogFooter>
    </>
  )
  
  // Render Step 3.2 content
  const renderStep32 = () => (
    <>
      <DialogDescription>
        Approve which preferred PCA slots to assign to each team.
        Same slot of same PCA can only be assigned to one team.
        <br />
        <span className="text-xs mt-1 block">
          Note: If you skip assignments, these reserved slots will remain available for the next step or the final floating PCA allocation algorithm.
        </span>
      </DialogDescription>
      
      <div className="py-4">
        <div className="flex flex-nowrap gap-1.5 justify-center items-center overflow-x-auto">
          {teamOrder.map((team, index) => (
            <Fragment key={team}>
              <TeamReservationCard
                team={team}
                pendingFTE={expectedFTE[team] || 0}
                reservation={teamReservations?.[team] || null}
                selections={slotSelections}
                onSelectionChange={handleSelectionChange}
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
      
      <DialogFooter className="flex justify-between">
        <Button variant="outline" onClick={handleBackToStep31}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to 3.1
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleSkipStep32}
            title="Skip to check for adjacent slots or final allocation"
          >
            Skip Assignments
          </Button>
          <Button onClick={handleProceedToStep33}>
            Assign & Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </DialogFooter>
    </>
  )
  
  // Render Step 3.3 content
  const renderStep33 = () => (
    <>
      <DialogDescription>
        Assign adjacent slots from special program PCAs to the same team.
        <br />
        <span className="text-xs mt-1 block">
          Gray items show slots already assigned in Step 3.2. Checkboxes show adjacent slots available from special program assignments.
        </span>
      </DialogDescription>
      
      <div className="py-4">
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
      
      <DialogFooter className="flex justify-between">
        <Button variant="outline" onClick={handleBackToStep32}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to 3.2
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleSkipStep33}
            title="Skip adjacent slot assignments and proceed to final allocation"
          >
            Skip Assignments
          </Button>
          <Button onClick={handleFinalSave}>
            Complete Configuration
          </Button>
        </div>
      </DialogFooter>
    </>
  )
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Configure Floating PCA Allocation - Step {currentMiniStep}
          </DialogTitle>
        </DialogHeader>
        
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
          <span className={currentMiniStep === '3.1' ? 'font-bold text-primary' : ''}>
            3.1 Adjust
          </span>
          <ChevronRight className="h-4 w-4" />
          <span className={currentMiniStep === '3.2' ? 'font-bold text-primary' : ''}>
            3.2 Preferred
          </span>
          <ChevronRight className="h-4 w-4" />
          <span className={currentMiniStep === '3.3' ? 'font-bold text-primary' : ''}>
            3.3 Adjacent
          </span>
        </div>
        
        {currentMiniStep === '3.1' && renderStep31()}
        {currentMiniStep === '3.2' && renderStep32()}
        {currentMiniStep === '3.3' && renderStep33()}
      </DialogContent>
    </Dialog>
  )
}
