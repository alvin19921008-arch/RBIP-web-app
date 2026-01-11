'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Staff } from '@/types/staff'
import { StaffCard } from './StaffCard'
import { DragValidationTooltip } from './DragValidationTooltip'
import { TeamTransferWarningTooltip } from './TeamTransferWarningTooltip'
import { InactiveStaffPool } from './InactiveStaffPool'
import { BufferStaffPool } from './BufferStaffPool'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react'

interface StaffPoolProps {
  therapists: Staff[]
  pcas: Staff[]
  inactiveStaff?: Staff[]
  bufferStaff?: Staff[]
  onEditStaff?: (staffId: string, event?: React.MouseEvent) => void
  staffOverrides?: Record<string, { leaveType?: any; fteRemaining?: number; fteSubtraction?: number; availableSlots?: number[]; invalidSlot?: number; leaveComebackTime?: string; isLeave?: boolean }>
  specialPrograms?: any[]
  pcaAllocations?: Record<string, any[]>
  currentStep?: string
  initializedSteps?: Set<string>
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  onSlotTransfer?: (staffId: string, targetTeam: string, slots: number[]) => void
  onBufferStaffCreated?: () => void
}

export function StaffPool({ therapists, pcas, inactiveStaff = [], bufferStaff = [], onEditStaff, staffOverrides = {}, specialPrograms = [], pcaAllocations = {}, currentStep, initializedSteps, weekday, onSlotTransfer, onBufferStaffCreated }: StaffPoolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollbarVisible, setScrollbarVisible] = useState(false)
  const hideScrollbarTimerRef = useRef<number | null>(null)
  const [expandedRanks, setExpandedRanks] = useState<Record<string, boolean>>({
    SPT: false,
    APPT: false,
    RPT: false,
    PCA: false,
  })
  const [showFTEFilter, setShowFTEFilter] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onWheelNative = (ev: WheelEvent) => {
      const hasOverflow = el.scrollHeight > el.clientHeight + 1
      if (!hasOverflow) return

      // Isolate scroll to Staff Pool (block page scroll).
      ev.preventDefault()
      ev.stopPropagation()

      el.scrollTop += ev.deltaY
    }

    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheelNative as EventListener)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (hideScrollbarTimerRef.current) window.clearTimeout(hideScrollbarTimerRef.current)
    }
  }, [])

  const pokeScrollbar = useCallback(() => {
    setScrollbarVisible(true)
    if (hideScrollbarTimerRef.current) window.clearTimeout(hideScrollbarTimerRef.current)
    hideScrollbarTimerRef.current = window.setTimeout(() => setScrollbarVisible(false), 3000)
  }, [])

  const hideScrollbarNow = useCallback(() => {
    if (hideScrollbarTimerRef.current) window.clearTimeout(hideScrollbarTimerRef.current)
    hideScrollbarTimerRef.current = null
    setScrollbarVisible(false)
  }, [])

  // Helper function to calculate Base_FTE-remaining (after leave, excluding special program)
  const getBaseFTERemaining = (staffId: string, staff?: Staff): number => {
    const override = staffOverrides[staffId]

    // For floating PCA, the outer border should reflect the "base on-duty FTE" (capacity),
    // which is driven by the explicit Step 1/Step 3 override.fteRemaining when present.
    // This avoids incorrectly deriving baseFTE from fteSubtraction (which can leave a misleading 0.25 remainder).
    if (staff?.rank === 'PCA' && staff.floating) {
      if (typeof override?.fteRemaining === 'number') {
        return Math.max(0, Math.min(1.0, override.fteRemaining))
      }
      // Fallback: derive from available slots (capacity), defaulting to whole-day.
      const slots =
        Array.isArray(override?.availableSlots)
          ? override!.availableSlots
          : [1, 2, 3, 4]
      return Math.max(0, Math.min(1.0, slots.length * 0.25))
    }

    // For buffer staff, use buffer_fte as base
    if (staff?.status === 'buffer' && staff.buffer_fte !== undefined) {
      if (override?.fteSubtraction !== undefined) {
        return Math.max(0, staff.buffer_fte - override.fteSubtraction)
      }
      return staff.buffer_fte
    }
    // For regular staff
    if (override?.fteSubtraction !== undefined) {
      return Math.max(0, 1.0 - override.fteSubtraction)
    }
    return 1.0
  }

  // Helper function to check if a staff member is on leave (FTE ≠ 1)
  const isOnLeave = (staffId: string): boolean => {
    const baseFTE = getBaseFTERemaining(staffId)
    return baseFTE !== 1.0
  }

  // Helper function to calculate True-FTE-remaining for floating PCA
  const getTrueFTERemaining = (staffId: string, staff: Staff): number => {
    if (staff.rank !== 'PCA' || !staff.floating) {
      // For buffer therapist, return buffer_fte if available
      if (staff.status === 'buffer' && staff.buffer_fte !== undefined) {
        return staff.buffer_fte
      }
      return 1.0
    }
    
    const override = staffOverrides[staffId]
    // For buffer PCA, use buffer_fte to determine available slots if not overridden
    let availableSlots = override?.availableSlots
    if (!availableSlots) {
      // If explicitly set to 0 FTE, treat as no availability
      if (override?.fteRemaining === 0) {
        availableSlots = []
      }
      if (staff.status === 'buffer' && staff.buffer_fte !== undefined) {
        // Calculate slots from buffer_fte (e.g., 0.5 FTE = 2 slots)
        const numSlots = Math.round(staff.buffer_fte / 0.25)
        availableSlots = [1, 2, 3, 4].slice(0, numSlots)
      } else {
        availableSlots = [1, 2, 3, 4]
      }
    }
    
    // Capacity FTE for the day:
    // Prefer explicit override.fteRemaining (Step 1 leave/FTE), but cap to slot capacity.
    const slotCapacityFTE = availableSlots.length * 0.25
    const capacityFTE =
      typeof override?.fteRemaining === 'number'
        ? Math.max(0, Math.min(override.fteRemaining, slotCapacityFTE))
        : slotCapacityFTE
    
    // Subtract already assigned slots (from pcaAllocations)
    // This includes both regular assignments and special program assignments
    const assignedSlotSet = new Set<number>()
    Object.values(pcaAllocations).forEach((teamAllocs: any[]) => {
      teamAllocs.forEach((alloc: any) => {
        if (alloc.staff_id === staffId) {
          // Count slots assigned to any team
          if (alloc.slot1) assignedSlotSet.add(1)
          if (alloc.slot2) assignedSlotSet.add(2)
          if (alloc.slot3) assignedSlotSet.add(3)
          if (alloc.slot4) assignedSlotSet.add(4)
        }
      })
    })
    const assignedFTE = assignedSlotSet.size * 0.25
    
    // Final True-FTE = capacity - assigned slots
    return Math.max(0, capacityFTE - assignedFTE)
  }

  // Filter staff by FTE if filter is active
  const filterStaffByFTE = (staffList: Staff[]): Staff[] => {
    if (!showFTEFilter) return staffList
    return staffList.filter(s => isOnLeave(s.id))
  }

  // Handle filter toggle - expand relevant ranks when filter is activated
  const handleFTEFilterToggle = () => {
    const newFilterState = !showFTEFilter
    setShowFTEFilter(newFilterState)
    
    // If activating filter, expand ranks that have staff on leave
    if (newFilterState) {
      const ranksToExpand: Record<string, boolean> = { ...expandedRanks }
      
      // Check each rank for staff on leave
      const hasSPTOnLeave = therapists.some(t => t.rank === 'SPT' && isOnLeave(t.id))
      const hasAPPTOnLeave = therapists.some(t => t.rank === 'APPT' && isOnLeave(t.id))
      const hasRPTOnLeave = therapists.some(t => t.rank === 'RPT' && isOnLeave(t.id))
      const hasPCAOnLeave = pcas.some(p => isOnLeave(p.id))
      
      if (hasSPTOnLeave) ranksToExpand.SPT = true
      if (hasAPPTOnLeave) ranksToExpand.APPT = true
      if (hasRPTOnLeave) ranksToExpand.RPT = true
      if (hasPCAOnLeave) ranksToExpand.PCA = true
      
      setExpandedRanks(ranksToExpand)
    }
  }

  // Sort staff by rank: SPT -> APPT -> RPT -> PCA
  const sortStaffByRank = (staffList: Staff[]): Staff[] => {
    const rankOrder: Record<string, number> = { SPT: 0, APPT: 1, RPT: 2, PCA: 3 }
    return [...staffList].sort((a, b) => {
      const orderA = rankOrder[a.rank] ?? 999
      const orderB = rankOrder[b.rank] ?? 999
      return orderA - orderB
    })
  }

  const therapistsByRank = {
    SPT: sortStaffByRank(filterStaffByFTE(therapists.filter(t => t.rank === 'SPT'))),
    APPT: sortStaffByRank(filterStaffByFTE(therapists.filter(t => t.rank === 'APPT'))),
    RPT: sortStaffByRank(filterStaffByFTE(therapists.filter(t => t.rank === 'RPT'))),
  }
  const filteredPCAs = sortStaffByRank(filterStaffByFTE(pcas))

  // Check if all ranks are expanded
  const allExpanded = expandedRanks.SPT && expandedRanks.APPT && expandedRanks.RPT && expandedRanks.PCA
  
  // Check if any therapist rank is expanded
  const anyTherapistExpanded = expandedRanks.SPT || expandedRanks.APPT || expandedRanks.RPT

  const handleShowAll = () => {
    if (allExpanded) {
      // Retract all
      setExpandedRanks({
        SPT: false,
        APPT: false,
        RPT: false,
        PCA: false,
      })
    } else {
      // Show all
    setExpandedRanks({
      SPT: true,
      APPT: true,
      RPT: true,
      PCA: true,
    })
    }
  }

  const toggleRank = (rank: string) => {
    setExpandedRanks(prev => ({
      ...prev,
      [rank]: !prev[rank]
    }))
  }

  // If collapsed, show only a button to expand
  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setIsExpanded(true)
          // When expanding, show all ranks except inactive staff pool
          setExpandedRanks({
            SPT: true,
            APPT: true,
            RPT: true,
            PCA: true,
          })
        }}
        className="h-8 px-2 flex items-center gap-1"
        title="Show Staff Pool"
      >
        <ChevronRight className="h-4 w-4" />
        <span className="text-xs">Staff Pool</span>
      </Button>
    )
  }

  return (
    <div
      className="w-40 flex flex-col gap-2 min-h-0 h-full"
      onMouseEnter={pokeScrollbar}
      onMouseMove={pokeScrollbar}
      onMouseLeave={hideScrollbarNow}
    >
      <div className="flex items-center justify-between gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(false)}
          className="h-6 w-6 p-0"
          title="Hide Staff Pool"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant={showFTEFilter ? "default" : "ghost"}
            size="sm"
            onClick={handleFTEFilterToggle}
            className="text-xs h-6 px-2"
          >
            On leave
        </Button>
        <Button
            variant={allExpanded ? "default" : "ghost"}
          size="sm"
          onClick={handleShowAll}
          className="text-xs h-6 px-2"
        >
          Show All
        </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain pca-like-scrollbar ${
          scrollbarVisible ? '' : 'pca-like-scrollbar--hidden'
        }`}
        style={{ direction: 'rtl' }}
      >
        <div className="flex flex-col gap-4" style={{ direction: 'ltr' }}>
          <Card>
            <CardHeader className="pb-1 pt-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Therapist Pool</CardTitle>
                {anyTherapistExpanded && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setExpandedRanks(prev => ({
                        ...prev,
                        SPT: false,
                        APPT: false,
                        RPT: false,
                      }))
                    }}
                    className="h-5 w-5 p-0"
                    title="Retract all therapists"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-1">
              {Object.entries(therapistsByRank).map(([rank, staffList]) => (
                <div key={rank}>
                  <button
                    onClick={() => toggleRank(rank)}
                    className="flex items-center gap-1 text-xs font-semibold mb-1 hover:text-primary transition-colors"
                  >
                    {expandedRanks[rank] ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {rank}
                  </button>
                  {expandedRanks[rank] && (
                    <div className="space-y-1 ml-4">
                      {staffList.map((staff) => {
                        const baseFTE = getBaseFTERemaining(staff.id, staff)
                        const showFTE =
                          staff.rank !== 'SPT' && (baseFTE > 0 && baseFTE < 1 || baseFTE === 0)
                        // For buffer staff, always show FTE if it's not 1.0
                        const shouldShowFTE =
                          showFTE ||
                          (staff.status === 'buffer' &&
                            staff.buffer_fte !== undefined &&
                            staff.buffer_fte !== 1.0)
                        const isBufferStaff = staff.status === 'buffer'
                        const isTherapistRank = ['SPT', 'APPT', 'RPT'].includes(staff.rank)
                        const isInCorrectStep = currentStep === 'therapist-pca'
                        // Check if this is a fixed-team staff (APPT, RPT) that can be transferred with warning
                        const isFixedTeamStaff =
                          !isBufferStaff && (staff.rank === 'APPT' || staff.rank === 'RPT')

                        const staffCard = (
                          <StaffCard
                            key={staff.id}
                            staff={staff}
                            onEdit={(e) => onEditStaff?.(staff.id, e)}
                            fteRemaining={shouldShowFTE ? baseFTE : undefined}
                            showFTE={shouldShowFTE}
                            draggable={true} // Always allow dragging (will snap back if not in correct step)
                          />
                        )

                        // For fixed-team staff (APPT, RPT), show warning tooltip when dragging (if in correct step)
                        if (isFixedTeamStaff && isInCorrectStep) {
                          return (
                            <TeamTransferWarningTooltip
                              key={staff.id}
                              staffId={staff.id}
                              content="Team transfer for fixed-team staff detected."
                            >
                              {staffCard}
                            </TeamTransferWarningTooltip>
                          )
                        }

                        // Add tooltip for regular therapist when not in correct step (buffer staff handled in BufferStaffPool)
                        if (!isBufferStaff && isTherapistRank && !isInCorrectStep) {
                          return (
                            <DragValidationTooltip
                              key={staff.id}
                              staffId={staff.id}
                              content="Therapist slot dragging-&-allocating is only available in Step 2 only."
                            >
                              {staffCard}
                            </DragValidationTooltip>
                          )
                        }

                        return staffCard
                      })}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">PCA Pool</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleRank('PCA')}
                  className="h-5 w-5 p-0"
                  title={expandedRanks.PCA ? "Retract PCA" : "Expand PCA"}
                >
                  {expandedRanks.PCA ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-1">
              {expandedRanks.PCA && (
                <div className="space-y-1 ml-4">
                  {filteredPCAs.map((pca) => {
                    const baseFTE = getBaseFTERemaining(pca.id, pca)
                    const trueFTE = getTrueFTERemaining(pca.id, pca)
                    const showFTE = (baseFTE > 0 && baseFTE < 1) || baseFTE === 0
                    // For buffer PCA, always show FTE if buffer_fte is set
                    const shouldShowFTE =
                      showFTE ||
                      (pca.status === 'buffer' && pca.buffer_fte !== undefined && pca.buffer_fte !== 1.0)
                    const isFloatingPCA = pca.floating === true
                    const isBufferStaff = pca.status === 'buffer'

                    // Enable drag for floating PCA (slot transfer will be validated in handleDragStart)
                    // Apply border-green-700 to non-floating PCA (same as schedule page)
                    // For buffer floating PCA, also show green border
                    const borderColor = !isFloatingPCA
                      ? 'border-green-700'
                      : pca.status === 'buffer'
                        ? 'border-green-700'
                        : undefined
                    const isInCorrectStep = currentStep === 'floating-pca'

                    const staffCard = (
                      <StaffCard
                        key={pca.id}
                        staff={pca}
                        onEdit={() => onEditStaff?.(pca.id)}
                        fteRemaining={shouldShowFTE ? (isFloatingPCA ? trueFTE : baseFTE) : undefined}
                        showFTE={shouldShowFTE}
                        baseFTE={isFloatingPCA ? Math.max(0, Math.min(baseFTE, 1.0)) : undefined}
                        trueFTE={isFloatingPCA ? trueFTE : undefined}
                        isFloatingPCA={isFloatingPCA}
                        currentStep={currentStep}
                        initializedSteps={initializedSteps}
                        draggable={true} // Always allow dragging (will snap back if not in correct step)
                        borderColor={borderColor}
                      />
                    )

                    // Add tooltip for regular floating PCA when not in correct step (buffer staff handled in BufferStaffPool)
                    if (!isBufferStaff && isFloatingPCA && !isInCorrectStep) {
                      return (
                        <DragValidationTooltip
                          key={pca.id}
                          staffId={pca.id}
                          content="Floating PCA slot dragging-&-allocating is only available in Step 3 only."
                        >
                          {staffCard}
                        </DragValidationTooltip>
                      )
                    }

                    return staffCard
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <BufferStaffPool
            inactiveStaff={inactiveStaff.filter(s => (s.status ?? 'active') === 'inactive')}
            bufferStaff={bufferStaff}
            onBufferStaffCreated={onBufferStaffCreated || (() => {
              // Fallback: reload page if no callback provided
              window.location.reload()
            })}
            specialPrograms={specialPrograms}
            currentStep={currentStep}
            pcaAllocations={pcaAllocations}
            staffOverrides={staffOverrides}
            weekday={weekday}
          />

          {inactiveStaff.length > 0 && (
            <InactiveStaffPool 
              inactiveStaff={showFTEFilter ? inactiveStaff.filter(s => {
                const baseFTE = getBaseFTERemaining(s.id)
                return baseFTE !== 1.0
              }) : inactiveStaff}
              onEditStaff={onEditStaff}
              staffOverrides={staffOverrides}
            />
          )}
        </div>
      </div>
    </div>
  )
}

