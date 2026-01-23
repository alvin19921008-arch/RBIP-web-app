'use client'

import { useMemo, useState, useEffect } from 'react'
import { Staff } from '@/types/staff'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { BufferStaffConvertDialog } from './BufferStaffConvertDialog'
import { StaffCard } from './StaffCard'
import { SpecialProgram } from '@/types/allocation'
import { ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { DragValidationTooltip } from './DragValidationTooltip'
import { useToast } from '@/components/ui/toast-provider'
import { SearchWithSuggestions, type SearchSuggestionItem } from '@/components/ui/SearchWithSuggestions'

interface BufferStaffPoolProps {
  inactiveStaff: Staff[]
  bufferStaff?: Staff[]
  snapshotDateLabel?: string
  onConvertInactiveToBuffer?: (args: { staff: Staff; bufferFTE: number; availableSlots?: number[] }) => void
  specialPrograms?: SpecialProgram[]
  currentStep?: string
  pcaAllocations?: Record<string, any[]>
  staffOverrides?: Record<string, { leaveType?: any; fteRemaining?: number; fteSubtraction?: number; availableSlots?: number[]; invalidSlot?: number }>
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  onOpenStaffContextMenu?: (staffId: string, event?: React.MouseEvent) => void
  disableDragging?: boolean
}


export function BufferStaffPool({
  inactiveStaff,
  bufferStaff = [],
  snapshotDateLabel,
  onConvertInactiveToBuffer,
  specialPrograms = [],
  currentStep,
  pcaAllocations = {},
  staffOverrides = {},
  weekday,
  onOpenStaffContextMenu,
  disableDragging = false,
}: BufferStaffPoolProps) {
  const [sourceMode, setSourceMode] = useState<'select' | 'create' | 'search' | null>(null)
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set())
  const [showInactiveMenu, setShowInactiveMenu] = useState(false)
  const [showInactiveSplitMenu, setShowInactiveSplitMenu] = useState(false)
  const [inactiveSearch, setInactiveSearch] = useState('')
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [pcaStaffToConvert, setPcaStaffToConvert] = useState<Staff[]>([])
  const [currentPcaIndex, setCurrentPcaIndex] = useState(0)
  const [staffToConvert, setStaffToConvert] = useState<Staff | null>(null)
  const [isBufferStaffExpanded, setIsBufferStaffExpanded] = useState(true)
  const [isPoolCollapsed, setIsPoolCollapsed] = useState(false)
  const toast = useToast()

  // Load special programs if not provided
  const [loadedSpecialPrograms, setLoadedSpecialPrograms] = useState<SpecialProgram[]>(specialPrograms)
  
  useEffect(() => {
    if (loadedSpecialPrograms.length === 0) {
      // Snapshot-local: special programs should come from the date snapshot.
      setLoadedSpecialPrograms(specialPrograms)
    }
  }, [loadedSpecialPrograms.length, specialPrograms])

  // Sort staff by rank: SPT -> APPT -> RPT -> PCA
  const sortStaffByRank = (staffList: Staff[]): Staff[] => {
    const rankOrder: Record<string, number> = { SPT: 0, APPT: 1, RPT: 2, PCA: 3 }
    return [...staffList].sort((a, b) => {
      const orderA = rankOrder[a.rank] ?? 999
      const orderB = rankOrder[b.rank] ?? 999
      if (orderA !== orderB) return orderA - orderB
      // If same rank, sort by name
      return a.name.localeCompare(b.name)
    })
  }

  const effectiveInactiveStaff = inactiveStaff

  const inactiveStaffByRank = {
    SPT: sortStaffByRank(effectiveInactiveStaff.filter(s => s.rank === 'SPT')),
    APPT: sortStaffByRank(effectiveInactiveStaff.filter(s => s.rank === 'APPT')),
    RPT: sortStaffByRank(effectiveInactiveStaff.filter(s => s.rank === 'RPT')),
    PCA: sortStaffByRank(effectiveInactiveStaff.filter(s => s.rank === 'PCA')),
  }

  // Group buffer staff by rank
  const bufferStaffByRank = {
    SPT: sortStaffByRank(bufferStaff.filter(s => s.rank === 'SPT' && s.status === 'buffer')),
    APPT: sortStaffByRank(bufferStaff.filter(s => s.rank === 'APPT' && s.status === 'buffer')),
    RPT: sortStaffByRank(bufferStaff.filter(s => s.rank === 'RPT' && s.status === 'buffer')),
    PCA: sortStaffByRank(bufferStaff.filter(s => s.rank === 'PCA' && s.status === 'buffer')),
  }

  // Helper function to calculate Base_FTE-remaining (after leave, excluding special program)
  const getBaseFTERemaining = (staffId: string, staff?: Staff): number => {
    // For buffer staff, use buffer_fte as base
    if (staff?.status === 'buffer' && staff.buffer_fte !== undefined) {
      const override = staffOverrides[staffId]
      if (override?.fteSubtraction !== undefined) {
        return Math.max(0, staff.buffer_fte - override.fteSubtraction)
      }
      return staff.buffer_fte
    }
    return 1.0
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
      if (staff.status === 'buffer' && staff.buffer_fte !== undefined) {
        // Calculate slots from buffer_fte (e.g., 0.5 FTE = 2 slots)
        const numSlots = Math.round(staff.buffer_fte / 0.25)
        availableSlots = [1, 2, 3, 4].slice(0, numSlots)
      } else {
        availableSlots = [1, 2, 3, 4]
      }
    }
    
    // Capacity FTE:
    // - For buffer PCA, capacity should be driven by buffer_fte (or explicit override.fteRemaining), NOT by a [1,2,3,4] list.
    // - For regular PCA, capacity is driven by availableSlots length.
    const slotCapacityFTE = availableSlots.length * 0.25
    const baseCapacityFTE =
      staff.status === 'buffer' && staff.buffer_fte !== undefined
        ? staff.buffer_fte
        : slotCapacityFTE
    const capacityFTE =
      typeof override?.fteRemaining === 'number'
        ? Math.max(0, Math.min(override.fteRemaining, baseCapacityFTE, slotCapacityFTE))
        : Math.max(0, Math.min(baseCapacityFTE, slotCapacityFTE))

    let trueFTE = capacityFTE
    
    // Subtract special program FTE (only if Step 2 has run - special programs are assigned in Step 2)
    // In Step 1, don't subtract special program FTE yet
    if (currentStep !== 'leave-fte' && specialPrograms && weekday) {
      const staffPrograms = staff.special_program || []
      for (const programName of staffPrograms) {
        const program = specialPrograms.find(p => p.name === programName)
        if (program && program.weekdays.includes(weekday)) {
          const programFTE = program.fte_subtraction?.[staffId]?.[weekday] || 0
          trueFTE -= programFTE
        }
      }
    }
    
    // Subtract already assigned slots (from pcaAllocations)
    let assignedSlots = 0
    Object.values(pcaAllocations).forEach((teamAllocs: any[]) => {
      teamAllocs.forEach((alloc: any) => {
        if (alloc.staff_id === staffId) {
          // Count slots assigned to any team
          if (alloc.slot1) assignedSlots++
          if (alloc.slot2) assignedSlots++
          if (alloc.slot3) assignedSlots++
          if (alloc.slot4) assignedSlots++
        }
      })
    })
    const assignedFTE = assignedSlots * 0.25
    
    // Final True-FTE = capacity - special program - assigned
    return Math.max(0, trueFTE - assignedFTE)
  }

  const toggleStaffSelection = (staffId: string) => {
    setSelectedStaffIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(staffId)) {
        newSet.delete(staffId)
      } else {
        newSet.add(staffId)
      }
      return newSet
    })
  }

  const handleConvertToBuffer = async () => {
    if (selectedStaffIds.size === 0) return

    const selectedStaff = effectiveInactiveStaff.filter(s => selectedStaffIds.has(s.id))
    
    // Show convert dialog for first staff member
    if (selectedStaff.length > 0) {
      setStaffToConvert(selectedStaff[0])
      setPcaStaffToConvert(selectedStaff)
      setCurrentPcaIndex(0)
      setShowConvertDialog(true)
    }
  }

  const handleConvertDialogSave = () => {
    // Move to next staff or finish
    if (currentPcaIndex < pcaStaffToConvert.length - 1) {
      setCurrentPcaIndex(currentPcaIndex + 1)
      setStaffToConvert(pcaStaffToConvert[currentPcaIndex + 1])
    } else {
      // All staff converted
      setShowConvertDialog(false)
      setStaffToConvert(null)
      setPcaStaffToConvert([])
      setCurrentPcaIndex(0)
      setSelectedStaffIds(new Set())
      setShowInactiveMenu(false)
      setSourceMode(null)
    }
  }

  const handleSelectFromInactive = () => {
    setShowInactiveMenu(true)
    setSourceMode('select')
  }

  const openSearchInactive = () => {
    setShowInactiveSplitMenu(false)
    setShowInactiveMenu(false)
    setSelectedStaffIds(new Set())
    setInactiveSearch('')
    setSourceMode('search')
  }

  // Get all inactive staff for checkbox menu (max 5 visible, scrollable)
  const allInactiveStaff = sortStaffByRank(effectiveInactiveStaff)
  const visibleStaff = allInactiveStaff.slice(0, 5)
  const remainingStaff = allInactiveStaff.slice(5)

  const inactiveSearchItems = useMemo<SearchSuggestionItem[]>(() => {
    return allInactiveStaff.map((s) => ({
      id: s.id,
      label: s.name,
      subLabel: [s.rank].filter(Boolean).join(' • ') || undefined,
      keywords: [s.name, s.rank].filter(Boolean),
    }))
  }, [allInactiveStaff])

  return (
    <>
      <Card>
        <CardHeader className="pb-1 pt-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Buffer Staff Pool</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPoolCollapsed(!isPoolCollapsed)}
              className="h-5 w-5 p-0"
              title={isPoolCollapsed ? "Expand buffer staff pool" : "Retract all buffer staff pool"}
            >
              {isPoolCollapsed ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </Button>
          </div>
        </CardHeader>
        {!isPoolCollapsed && (
          <CardContent className="space-y-2 p-2">
            {!sourceMode && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 w-full">
                  <Tooltip
                    wrapperClassName="inline-flex flex-1 min-w-0"
                    side="top"
                    className="whitespace-normal max-w-[280px]"
                    content={
                      <div className="space-y-1 whitespace-normal leading-snug">
                        <div className="font-medium">Inactive staff list</div>
                        <div>
                          This uses the saved snapshot for{' '}
                          <span className="font-medium">{snapshotDateLabel ?? 'this date'}</span>.
                        </div>
                        <div className="text-muted-foreground">
                          If published (Global) staff config differs, use Dashboard → Sync / Publish.
                        </div>
                      </div>
                    }
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectFromInactive}
                      className="h-6 w-full rounded-r-none px-2 text-[11px] leading-none min-w-0"
                      disabled={effectiveInactiveStaff.length === 0}
                    >
                      <span className="truncate">From Inactive Staff</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowInactiveSplitMenu((v) => !v)}
                      className="h-6 w-7 px-0 rounded-l-none border-l-0"
                      disabled={effectiveInactiveStaff.length === 0}
                      aria-label="More inactive staff options"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    {showInactiveSplitMenu ? (
                      <div className="absolute left-0 top-full mt-1 w-full bg-background border border-border rounded-md shadow-lg z-50">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent rounded-md"
                          onClick={openSearchInactive}
                        >
                          Search inactive…
                        </button>
                      </div>
                    ) : null}
                  </Tooltip>
                </div>
              </div>
            )}

          {sourceMode === 'search' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold">Search inactive staff to convert:</div>
              <SearchWithSuggestions
                value={inactiveSearch}
                onValueChange={setInactiveSearch}
                items={inactiveSearchItems}
                placeholder="Type a name…"
                onSelect={(it) => {
                  const staff = effectiveInactiveStaff.find((s) => s.id === it.id)
                  if (!staff) return
                  setStaffToConvert(staff)
                  setPcaStaffToConvert([staff])
                  setCurrentPcaIndex(0)
                  setShowConvertDialog(true)
                  setSourceMode(null)
                  setInactiveSearch('')
                }}
                inputClassName="h-7 text-xs"
              />
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSourceMode(null)
                    setInactiveSearch('')
                  }}
                  className="text-xs h-7 flex-1 px-1 min-w-0"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {sourceMode === 'select' && showInactiveMenu && (
            <div className="space-y-2">
              <div className="text-xs font-semibold mb-1">Select inactive staff to convert:</div>
              <div className="border rounded-md p-2 max-h-48 overflow-y-auto">
                {Object.entries(inactiveStaffByRank).map(([rank, staffList]) => {
                  if (staffList.length === 0) return null
                  
                  return (
                    <div key={rank} className="mb-2">
                      <div className="text-xs font-medium mb-1">{rank}</div>
                      {staffList.map((staff) => (
                        <label
                          key={staff.id}
                          className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-accent/50 rounded px-1"
                        >
                          <Checkbox
                            checked={selectedStaffIds.has(staff.id)}
                            onCheckedChange={() => toggleStaffSelection(staff.id)}
                          />
                          <span className="text-xs">{staff.name}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConvertToBuffer}
                  disabled={selectedStaffIds.size === 0}
                  className="text-xs h-7 flex-1 px-1 min-w-0"
                >
                  Convert ({selectedStaffIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowInactiveMenu(false)
                    setSourceMode(null)
                    setSelectedStaffIds(new Set())
                    setShowInactiveSplitMenu(false)
                  }}
                  className="text-xs h-7 flex-1 px-1 min-w-0"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {sourceMode === 'create' ? null : null}

            {/* Display existing buffer staff, grouped by rank */}
            {Object.values(bufferStaffByRank).some(list => list.length > 0) && (
              <div className="space-y-2 mt-2 border-t pt-2">
                <button
                  onClick={() => setIsBufferStaffExpanded(!isBufferStaffExpanded)}
                  className="flex items-center gap-1 text-xs font-semibold mb-1 hover:text-primary transition-colors"
                >
                  {isBufferStaffExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Buffer Staff
                </button>
                {isBufferStaffExpanded && (
                  <>
                    {Object.entries(bufferStaffByRank).map(([rank, staffList]) => {
                      if (staffList.length === 0) return null
                      
                      return (
                        <div key={rank} className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">{rank}</div>
                          <div className="space-y-1">
                      {staffList.map((staff) => {
                        const isFloatingPCA = staff.rank === 'PCA' && staff.floating === true
                        const isBufferTherapist = ['SPT', 'APPT', 'RPT'].includes(staff.rank)
                        const baseFTE = getBaseFTERemaining(staff.id, staff)
                        const trueFTE = isFloatingPCA ? getTrueFTERemaining(staff.id, staff) : undefined
                        
                        // Buffer therapists are draggable in Step 2 only
                        const canDragBufferTherapist = isBufferTherapist && currentStep === 'therapist-pca'
                        // Buffer floating PCA is draggable in Step 3 only
                        const canDragBufferFloatingPCA = isFloatingPCA && currentStep === 'floating-pca'
                        const isInCorrectStep = isFloatingPCA ? canDragBufferFloatingPCA : canDragBufferTherapist
                        
                        // Always allow dragging (will snap back if not in correct step, like regular staff)
                        // Create StaffCard with convert to inactive callback
                        const staffCard = (
                          <StaffCard
                            key={staff.id}
                            staff={staff}
                            useDragOverlay={true}
                            draggable={!disableDragging}
                            showFTE={isBufferTherapist}
                            fteRemaining={staff.buffer_fte}
                            baseFTE={isFloatingPCA ? baseFTE : undefined}
                            trueFTE={trueFTE}
                            isFloatingPCA={isFloatingPCA}
                            borderColor={undefined}
                            currentStep={currentStep}
                            onEdit={(e) => onOpenStaffContextMenu?.(staff.id, e)}
                            onOpenContextMenu={(e) => onOpenStaffContextMenu?.(staff.id, e)}
                          />
                        )
                        
                        // Add tooltip for buffer floating PCA when not in correct step
                        // Tooltip only shows when dragging is detected (not on hover)
                        if (isFloatingPCA && !isInCorrectStep) {
                          return (
                            <DragValidationTooltip 
                              key={staff.id}
                              staffId={staff.id}
                              allowMultiLine={true}
                              content="Floating PCA slot dragging-&-allocating is only available in Step 3 only."
                            >
                              {staffCard}
                            </DragValidationTooltip>
                          )
                        }
                        
                        // Add tooltip for buffer therapist when not in correct step
                        if (isBufferTherapist && !isInCorrectStep) {
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
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {showConvertDialog && staffToConvert && (
        <BufferStaffConvertDialog
          open={showConvertDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowConvertDialog(false)
              setStaffToConvert(null)
              setPcaStaffToConvert([])
              setCurrentPcaIndex(0)
              setSelectedStaffIds(new Set())
              setShowInactiveMenu(false)
              setSourceMode(null)
            }
          }}
          staff={staffToConvert}
          onConfirm={({ bufferFTE, availableSlots }) => {
            if (!staffToConvert) return
            onConvertInactiveToBuffer?.({ staff: staffToConvert, bufferFTE, availableSlots })
            handleConvertDialogSave()
          }}
        />
      )}
    </>
  )
}
