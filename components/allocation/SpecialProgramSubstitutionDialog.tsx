'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Staff, StaffRank, SpecialProgram as StaffSpecialProgram } from '@/types/staff'
import { cn } from '@/lib/utils'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'

interface SpecialProgramSubstitutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffType: 'therapist' | 'pca'
  programName: string
  requiredSlots?: number[]  // For PCA only
  minRequiredFTE?: number   // Minimum FTE remaining needed to take the special program
  allStaff: Staff[]
  // Base SPT FTE for this weekday (from dashboard `spt_allocations.fte_addon`)
  // Used to avoid defaulting SPT to 1.0 in substitution list.
  sptBaseFteByStaffId?: Record<string, number>
  staffOverrides: Record<string, {
    leaveType?: any
    fteRemaining?: number
    availableSlots?: number[]
    specialProgramAvailable?: boolean
    specialProgramOverrides?: Array<{
      programId: string
      therapistId?: string
      pcaId?: string
      slots?: number[]
      therapistFTESubtraction?: number
      pcaFTESubtraction?: number
      drmAddOn?: number
    }>
  }>
  sourceType: 'existing' | 'buffer' | 'inactive'
  onConfirm: (selectedStaffId: string) => void
  onCancel: () => void
}

export function SpecialProgramSubstitutionDialog({
  open,
  onOpenChange,
  staffType,
  programName,
  requiredSlots,
  minRequiredFTE,
  allStaff,
  sptBaseFteByStaffId,
  staffOverrides,
  sourceType,
  onConfirm,
  onCancel,
}: SpecialProgramSubstitutionDialogProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  const getEffectiveFTERemaining = (s: Staff): number => {
    const override = staffOverrides[s.id]
    if (typeof override?.fteRemaining === 'number') return override.fteRemaining
    if (override?.leaveType && !isOnDutyLeaveType(override.leaveType as any)) return 0
    if (s.status === 'buffer' && typeof s.buffer_fte === 'number') return s.buffer_fte
    if (s.rank === 'SPT' && sptBaseFteByStaffId && typeof sptBaseFteByStaffId[s.id] === 'number') {
      return sptBaseFteByStaffId[s.id]!
    }
    return 1.0
  }

  // Filter and sort staff based on type and source
  const availableStaff = useMemo(() => {
    let filtered = allStaff.filter(s => {
      // Filter by rank
      if (staffType === 'therapist') {
        if (!['SPT', 'APPT', 'RPT'].includes(s.rank)) return false
      } else {
        if (s.rank !== 'PCA') return false
      }

      // Filter by source type
      if (sourceType === 'buffer') {
        if (s.status !== 'buffer') return false
      } else if (sourceType === 'inactive') {
        if (s.status !== 'inactive') return false
      } else {
        // existing staff: active or no status (default active)
        if (s.status === 'inactive' || s.status === 'buffer') return false
      }

      // Must have special program property
      if (!s.special_program?.includes(programName as StaffSpecialProgram)) return false

      // Must have FTE > 0 (except on-duty SPT with FTE=0 edge case)
      const fteRemaining = getEffectiveFTERemaining(s)
      const isOnDuty = isOnDutyLeaveType(staffOverrides[s.id]?.leaveType as any)
      if (fteRemaining <= 0) {
        if (!(s.rank === 'SPT' && isOnDuty)) return false
      }

      // Must have enough FTE remaining to cover special program requirement
      if (typeof minRequiredFTE === 'number' && minRequiredFTE > 0) {
        if (fteRemaining < minRequiredFTE) return false
      }

      // For therapists: check specialProgramAvailable if override exists
      if (staffType === 'therapist') {
        const override = staffOverrides[s.id]
        if (override?.specialProgramAvailable !== undefined) {
          if (override.specialProgramAvailable !== true) return false
        }
      }

      // For PCAs: check slot availability
      if (staffType === 'pca' && requiredSlots && requiredSlots.length > 0) {
        const availableSlots = staffOverrides[s.id]?.availableSlots || [1, 2, 3, 4]
        if (!requiredSlots.every(slot => availableSlots.includes(slot))) return false
      }

      return true
    })

    // Sort staff
    if (staffType === 'therapist') {
      // Sort by rank: SPT → APPT → RPT
      const rankOrder: Record<StaffRank, number> = { 'SPT': 1, 'APPT': 2, 'RPT': 3, 'PCA': 99, 'workman': 99 }
      filtered.sort((a, b) => {
        const rankDiff = (rankOrder[a.rank] || 99) - (rankOrder[b.rank] || 99)
        return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name)
      })
    } else {
      // Sort PCAs: Floating first, then non-floating
      filtered.sort((a, b) => {
        if (a.floating !== b.floating) return a.floating ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }

    return filtered
  }, [allStaff, staffType, programName, requiredSlots, staffOverrides, sourceType, minRequiredFTE])

  const handleConfirm = () => {
    if (selectedStaffId) {
      onConfirm(selectedStaffId)
      setSelectedStaffId(null)
    }
  }

  const sourceTypeLabel = {
    existing: 'Existing Staff',
    buffer: 'Buffer Staff',
    inactive: 'Inactive Staff',
  }[sourceType]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select {staffType === 'therapist' ? 'Therapist' : 'PCA'} from {sourceTypeLabel}</DialogTitle>
          <DialogDescription>
            Select a {staffType === 'therapist' ? 'therapist' : 'PCA'} to substitute for {programName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {availableStaff.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No available {staffType === 'therapist' ? 'therapists' : 'PCAs'} found in {sourceTypeLabel.toLowerCase()}.
            </div>
          ) : (
            <div className="space-y-2">
              {availableStaff.map(staff => {
                const isSelected = selectedStaffId === staff.id
                const fteRemaining = getEffectiveFTERemaining(staff)

                return (
                  <div key={staff.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-accent/50">
                    <Checkbox
                      id={staff.id}
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setSelectedStaffId(checked ? staff.id : null)
                      }}
                    />
                    <label
                      htmlFor={staff.id}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {staffType === 'therapist' ? (
                        <span>
                          {staff.name} ({staff.rank}) - FTE: {fteRemaining.toFixed(2)}
                        </span>
                      ) : (
                        <span>
                          {staff.name} ({staff.floating ? 'Floating' : 'Non-floating'}) - FTE: {fteRemaining.toFixed(2)}
                        </span>
                      )}
                    </label>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStaffId}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
