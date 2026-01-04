'use client'

import { useState, useEffect } from 'react'
import { LeaveType, LEAVE_TYPE_FTE_MAP } from '@/types/staff'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SpecialProgram } from '@/types/allocation'
import { TimeIntervalSlider } from './TimeIntervalSlider'
import { getSlotTime, formatTimeRange } from '@/lib/utils/slotHelpers'
import { roundToNearestQuarter } from '@/lib/utils/rounding'

interface SpecialProgramFTEInfo {
  name: string
  fteSubtraction: number
}

interface StaffEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffName: string
  staffId: string
  staffRank?: string // Staff rank to determine if slot fields should be shown
  currentLeaveType: LeaveType | null
  currentFTERemaining: number
  specialProgramFTESubtraction?: number // FTE subtracted due to special programs (deprecated, use specialProgramFTEInfo)
  specialProgramFTEInfo?: SpecialProgramFTEInfo[] // Special programs causing FTE subtraction with program names
  currentFTESubtraction?: number
  currentAvailableSlots?: number[]
  // REMOVED: currentInvalidSlot, currentLeaveComebackTime, currentIsLeave
  // NEW:
  currentInvalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  currentAmPmSelection?: 'AM' | 'PM' | ''
  currentSpecialProgramAvailable?: boolean
  specialPrograms?: SpecialProgram[]  // To get slot times
  weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'  // Current weekday

  onSave: (
    staffId: string,
    leaveType: LeaveType | null,
    fteRemaining: number,
    fteSubtraction?: number,
    availableSlots?: number[],
    invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>,  // NEW
    amPmSelection?: 'AM' | 'PM',  // NEW
    specialProgramAvailable?: boolean  // NEW
  ) => void
}

const LEAVE_TYPES: Exclude<LeaveType, null>[] = ['VL', 'half day VL', 'TIL', 'half day TIL', 'SDO', 'sick leave', 'study leave', 'medical follow-up', 'others']

// Helper function to check if a number is a multiple of 0.25
const isMultipleOfQuarter = (value: number): boolean => {
  const remainder = value % 0.25
  return Math.abs(remainder) < 0.001 || Math.abs(remainder - 0.25) < 0.001
}

// Helper function to round to 2 decimal places
const roundTo2Decimals = (value: number): number => {
  return Math.round(value * 100) / 100
}

export function StaffEditDialog({
  open,
  onOpenChange,
  staffName,
  staffId,
  staffRank,
  currentLeaveType,
  currentFTERemaining,
  specialProgramFTESubtraction = 0,
  specialProgramFTEInfo = [],
  currentFTESubtraction,
  currentAvailableSlots,
  // REMOVED: currentInvalidSlot, currentLeaveComebackTime, currentIsLeave
  // NEW:
  currentInvalidSlots,
  currentAmPmSelection,
  currentSpecialProgramAvailable,
  specialPrograms = [],
  weekday,
  onSave,
}: StaffEditDialogProps) {
  // Calculate total special program FTE subtraction (use specialProgramFTEInfo if available, fallback to specialProgramFTESubtraction)
  const totalSpecialProgramFTE = specialProgramFTEInfo.length > 0
    ? specialProgramFTEInfo.reduce((sum, info) => sum + info.fteSubtraction, 0)
    : specialProgramFTESubtraction
  
  const [leaveType, setLeaveType] = useState<LeaveType | null>(currentLeaveType)
  const [customLeaveType, setCustomLeaveType] = useState<string>('')
  const [fteRemaining, setFteRemaining] = useState<number>(currentFTERemaining)
  const [fteSubtraction, setFteSubtraction] = useState<number>(currentFTESubtraction ?? (1.0 - currentFTERemaining - totalSpecialProgramFTE))
  const [fteRemainingInput, setFteRemainingInput] = useState<string>(currentFTERemaining.toFixed(2))
  const [fteSubtractionInput, setFteSubtractionInput] = useState<string>((currentFTESubtraction ?? (1.0 - currentFTERemaining - totalSpecialProgramFTE)).toFixed(2))
  const [availableSlots, setAvailableSlots] = useState<number[]>(currentAvailableSlots ?? [])
  // REMOVED: invalidSlot, leaveComebackTime, timeInputValue, timePeriod, isLeave
  // NEW: Invalid slots with time ranges
  const [invalidSlots, setInvalidSlots] = useState<Array<{
    slot: number
    timeRange: { start: string; end: string }
  }>>(currentInvalidSlots ?? [])
  const [showCustomInput, setShowCustomInput] = useState(false)
  // NEW: Therapist AM/PM selection
  const [amPmSelection, setAmPmSelection] = useState<'AM' | 'PM' | ''>(currentAmPmSelection ?? '')
  // NEW: Therapist special program availability
  const [specialProgramAvailable, setSpecialProgramAvailable] = useState<boolean>(currentSpecialProgramAvailable ?? false)
  // NEW: Unavailable slots (auto-populated from available slots)
  const [unavailableSlots, setUnavailableSlots] = useState<number[]>([])
  // FTE validation error state
  const [fteValidationError, setFteValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // Reset all state when dialog opens
      setLeaveType(currentLeaveType)
      setFteRemaining(roundTo2Decimals(currentFTERemaining))
      const calculatedSubtraction = currentFTESubtraction ?? (1.0 - currentFTERemaining - totalSpecialProgramFTE)
      setFteSubtraction(roundTo2Decimals(Math.max(0, calculatedSubtraction)))
      setFteRemainingInput(roundTo2Decimals(currentFTERemaining).toFixed(2))
      setFteSubtractionInput(roundTo2Decimals(Math.max(0, calculatedSubtraction)).toFixed(2))
      setAvailableSlots(currentAvailableSlots ?? [])
      // NEW: Reset invalid slots - only keep those that are still valid (in currentInvalidSlots)
      setInvalidSlots(currentInvalidSlots ?? [])
      // NEW: Reset AM/PM selection
      setAmPmSelection(currentAmPmSelection ?? '')
      // NEW: Reset special program availability
      setSpecialProgramAvailable(currentSpecialProgramAvailable ?? false)
      setShowCustomInput(currentLeaveType === 'others')
      setCustomLeaveType('')
      // Reset unavailable slots - will be auto-populated after 2 seconds
      setUnavailableSlots([])
    }
  }, [open, currentLeaveType, currentFTERemaining, currentFTESubtraction, currentAvailableSlots, currentInvalidSlots, currentAmPmSelection, currentSpecialProgramAvailable, totalSpecialProgramFTE])

  // Auto-populate unavailable slots immediately when available slots change
  useEffect(() => {
    if (availableSlots.length > 0) {
      const unavailable = [1, 2, 3, 4].filter(s => !availableSlots.includes(s))
      setUnavailableSlots(unavailable)
      
      // CRITICAL: Remove invalid slots that are no longer in unavailable slots
      // If a slot becomes available again, it shouldn't be marked as invalid
      setInvalidSlots(prev => prev.filter(is => unavailable.includes(is.slot)))
    } else {
      setUnavailableSlots([])
      // If no available slots, clear all invalid slots
      setInvalidSlots([])
    }
  }, [availableSlots])

  const maxFTE = 1.0 - totalSpecialProgramFTE
  const fteIsMultipleOfQuarter = isMultipleOfQuarter(fteRemaining)
  // Hide slot-related fields for therapist ranks (RPT, APPT, SPT)
  const isTherapistRank = staffRank && ['RPT', 'APPT', 'SPT'].includes(staffRank)
  const showSlotFields = !isTherapistRank

  // Determine if staff has special programs (for therapist special program availability)
  const staffHasSpecialProgram = isTherapistRank && specialPrograms.some(p =>
    p.staff_ids.includes(staffId) && p.weekdays.includes(weekday || 'mon') && p.name !== 'DRO'
  )

  // Get special program name and slot time for display
  const specialProgram = staffHasSpecialProgram ?
    specialPrograms.find(p =>
      p.staff_ids.includes(staffId) && p.weekdays.includes(weekday || 'mon') && p.name !== 'DRO'
    ) : null

  const programName = specialProgram?.name || ''
  const currentWeekday = weekday || 'mon'
  // CRITICAL: Slots structure is Record<staffId, Record<Weekday, number[]>>, not Record<Weekday, number[]>
  // So we need to access slots by staffId first, then by weekday
  const staffSlots = specialProgram?.slots?.[staffId]
  const programSlots = staffSlots?.[currentWeekday]
  const slotTime = specialProgram && programSlots && Array.isArray(programSlots) && programSlots.length > 0 ?
    (() => {
      const firstSlot = programSlots[0]
      if (firstSlot && [1, 2, 3, 4].includes(firstSlot)) {
        // Use helper function to get slot time and format it
        const timeRange = getSlotTime(firstSlot)
        return formatTimeRange(timeRange)  // Converts "09:00-10:30" to "0900-1030"
      }
      return '0900-1030'  // Fallback
    })()
    : ''

  const handleFTESubtractionInputChange = (value: string) => {
    // Allow free typing - only update the input string
    setFteSubtractionInput(value)
    // Clear validation error when user changes input
    setFteValidationError(null)
  }

  const handleFTESubtractionBlur = () => {
    // Validate and update on blur
    const numValue = parseFloat(fteSubtractionInput) || 0
    const newSubtraction = roundTo2Decimals(Math.max(0, Math.min(numValue, maxFTE)))
    setFteSubtraction(newSubtraction)
    setFteSubtractionInput(newSubtraction.toFixed(2))
    
    // Calculate remaining FTE
    const calculatedRemaining = roundTo2Decimals(maxFTE - newSubtraction)
    setFteRemaining(Math.max(0, calculatedRemaining))
    setFteRemainingInput(Math.max(0, calculatedRemaining).toFixed(2))
    
    // Auto-select slots based on FTE (for PCA allocation hint) - only if slots are empty or match expected
    const expectedSlots = Math.round(calculatedRemaining / 0.25)
    const currentSlotsFTE = roundTo2Decimals(availableSlots.length * 0.25)
    // Only auto-update slots if they're empty or don't match the FTE
    if (availableSlots.length === 0 || Math.abs(currentSlotsFTE - calculatedRemaining) > 0.01) {
      if (expectedSlots > 0 && expectedSlots <= 4 && calculatedRemaining > 0) {
        setAvailableSlots([1, 2, 3, 4].slice(0, expectedSlots))
      } else {
        setAvailableSlots([])
      }
    }
    
    // Clear invalid slots if FTE becomes multiple of 0.25
    if (isMultipleOfQuarter(calculatedRemaining)) {
      setInvalidSlots([])
    }
  }

  const handleFTERemainingInputChange = (value: string) => {
    // Allow free typing - only update the input string
    setFteRemainingInput(value)
    // Clear validation error when user changes input
    setFteValidationError(null)
  }

  const handleFTERemainingBlur = () => {
    // Validate and update on blur
    const numValue = parseFloat(fteRemainingInput) || 0
    const newRemaining = roundTo2Decimals(Math.max(0, Math.min(numValue, maxFTE)))
    setFteRemaining(newRemaining)
    setFteRemainingInput(newRemaining.toFixed(2))
    
    // Calculate subtraction
    const calculatedSubtraction = roundTo2Decimals(maxFTE - newRemaining)
    setFteSubtraction(Math.max(0, calculatedSubtraction))
    setFteSubtractionInput(Math.max(0, calculatedSubtraction).toFixed(2))
    
    // Auto-select slots based on FTE - only if slots are empty or don't match
    const expectedSlots = Math.round(newRemaining / 0.25)
    const currentSlotsFTE = roundTo2Decimals(availableSlots.length * 0.25)
    // Only auto-update slots if they're empty or don't match the FTE
    if (availableSlots.length === 0 || Math.abs(currentSlotsFTE - newRemaining) > 0.01) {
      if (expectedSlots > 0 && expectedSlots <= 4 && newRemaining > 0) {
        setAvailableSlots([1, 2, 3, 4].slice(0, expectedSlots))
      } else {
        setAvailableSlots([])
      }
    }
    
    // Clear invalid slots if FTE becomes multiple of 0.25
    if (isMultipleOfQuarter(newRemaining)) {
      setInvalidSlots([])
    }
  }

  const handleSlotToggle = (slot: number) => {
    // Only update slots, don't auto-calculate FTE - slots and FTE are independent
    setAvailableSlots(prev => {
      if (prev.includes(slot)) {
        return prev.filter(s => s !== slot)
      } else {
        return [...prev, slot].sort((a, b) => a - b)
      }
    })
    // Clear validation error when slots change
    setFteValidationError(null)
  }

  const handleLeaveTypeChange = (value: string) => {
    if (value === 'none') {
      setLeaveType(null)
      const newRemaining = roundTo2Decimals(maxFTE)
      const newSubtraction = 0
      setFteRemaining(newRemaining)
      setFteSubtraction(newSubtraction)
      setFteRemainingInput(newRemaining.toFixed(2))
      setFteSubtractionInput(newSubtraction.toFixed(2))
      setAvailableSlots([1, 2, 3, 4])
      setInvalidSlots([])
      setShowCustomInput(false)
      setCustomLeaveType('')
    } else if (value === 'others') {
      setLeaveType('others')
      setShowCustomInput(true)
      // Keep current FTE or default to maxFTE
      if (fteRemaining === maxFTE) {
        const newRemaining = roundTo2Decimals(maxFTE)
        const newSubtraction = 0
        setFteRemaining(newRemaining)
        setFteSubtraction(newSubtraction)
        setFteRemainingInput(newRemaining.toFixed(2))
        setFteSubtractionInput(newSubtraction.toFixed(2))
        setAvailableSlots([1, 2, 3, 4])
      }
    } else {
      const selectedType = value as Exclude<LeaveType, null | 'others'>
      setLeaveType(selectedType)
      setShowCustomInput(false)
      setCustomLeaveType('')
      // Apply default FTE mapping
      const defaultFTE = LEAVE_TYPE_FTE_MAP[selectedType] ?? 0
      const adjustedFTE = roundTo2Decimals(Math.min(defaultFTE, maxFTE))
      const newSubtraction = roundTo2Decimals(maxFTE - adjustedFTE)
      setFteRemaining(adjustedFTE)
      setFteSubtraction(newSubtraction)
      setFteRemainingInput(adjustedFTE.toFixed(2))
      setFteSubtractionInput(newSubtraction.toFixed(2))
      // Auto-select slots based on FTE
      const expectedSlots = Math.round(adjustedFTE / 0.25)
      setAvailableSlots(expectedSlots > 0 && expectedSlots <= 4 ? [1, 2, 3, 4].slice(0, expectedSlots) : [])
      
      // Clear invalid slots if FTE is multiple of 0.25
      if (isMultipleOfQuarter(adjustedFTE)) {
        setInvalidSlots([])
      }
    }
  }

  const handleSave = () => {
    // Validate FTE inputs first
    const fteRemainingNum = parseFloat(fteRemainingInput) || 0
    const fteSubtractionNum = parseFloat(fteSubtractionInput) || 0
    
    // Validate FTE values
    const validatedRemaining = roundTo2Decimals(Math.max(0, Math.min(fteRemainingNum, maxFTE)))
    const validatedSubtraction = roundTo2Decimals(Math.max(0, Math.min(fteSubtractionNum, maxFTE)))
    
    // Check if FTE remaining + FTE subtraction matches maxFTE (with small tolerance)
    const sum = roundTo2Decimals(validatedRemaining + validatedSubtraction)
    const expectedSum = roundTo2Decimals(maxFTE)
    
    if (Math.abs(sum - expectedSum) > 0.01) {
      // Auto-correct: use remaining as primary, calculate subtraction
      const finalRemaining = validatedRemaining
      const finalSubtraction = roundTo2Decimals(maxFTE - finalRemaining)
      setFteRemaining(finalRemaining)
      setFteSubtraction(finalSubtraction)
    } else {
      setFteRemaining(validatedRemaining)
      setFteSubtraction(validatedSubtraction)
    }
    
    // FTE remaining and available slots are independent - no validation needed
    // FTE remaining can be non-multiples of 0.25 (used for Avg PCA/team calculations)
    // Available slots represent which slots the staff is actually available for
    const finalRemaining = roundTo2Decimals(Math.max(0, Math.min(fteRemainingNum, maxFTE)))
    let finalSlots: number[] | undefined = availableSlots
    // NEW: Final invalid slots array
    let finalInvalidSlots: Array<{ slot: number; timeRange: { start: string; end: string } }> | undefined = invalidSlots
    // NEW: Final AM/PM selection
    let finalAmPmSelection: 'AM' | 'PM' | undefined = amPmSelection || undefined
    // NEW: Final special program availability
    let finalSpecialProgramAvailable: boolean | undefined = specialProgramAvailable

    // If leave type is 'others', use custom leave type text if provided
    let finalLeaveType: LeaveType | null = leaveType
    if (leaveType === 'others') {
      if (customLeaveType.trim()) {
        finalLeaveType = customLeaveType.trim() as LeaveType
      } else {
        finalLeaveType = 'others'
      }
    }

    // For therapist ranks, don't include slot-related fields
    if (!showSlotFields) {
      finalSlots = undefined
      finalInvalidSlots = undefined
    }

    // FTE Validation: Check if rounded FTE remaining is far off from available slots FTE
    if (showSlotFields && finalSlots && finalSlots.length > 0) {
      const roundedFTE = roundToNearestQuarter(finalRemaining)
      const trueFTEFromSlots = finalSlots.length * 0.25
      const difference = Math.abs(roundedFTE - trueFTEFromSlots)
      
      // Consider it "far off" if there's any difference (tolerance for floating point: 0.01)
      if (difference > 0.01) {
        // Calculate suggested number of slots based on rounded FTE
        const suggestedSlots = Math.round(roundedFTE / 0.25)
        const direction = roundedFTE > trueFTEFromSlots ? 'greater than' : 'less than'
        setFteValidationError(
          `FTE remaining (${finalRemaining.toFixed(2)}) rounded to ${roundedFTE.toFixed(2)} is ${direction} available slots FTE (${trueFTEFromSlots.toFixed(2)}). ` +
          `Please select ${suggestedSlots} slot${suggestedSlots !== 1 ? 's' : ''} in Available Slots.`
        )
        return // Don't save, show error
      }
    }
    
    // Clear validation error if validation passes
    setFteValidationError(null)

    onSave(staffId, finalLeaveType, finalRemaining, roundTo2Decimals(maxFTE - finalRemaining), finalSlots, finalInvalidSlots, finalAmPmSelection, finalSpecialProgramAvailable)
    onOpenChange(false)
  }

  const isValid = fteRemaining >= 0 && fteRemaining <= maxFTE && !fteValidationError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Staff - {staffName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="leave-type">Leave Type</Label>
            <select
              id="leave-type"
              value={leaveType || 'none'}
              onChange={(e) => handleLeaveTypeChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="none">On Duty (No Leave)</option>
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {showCustomInput && (
            <div className="space-y-2">
              <Label htmlFor="custom-leave-type">Custom Leave Type</Label>
              <Input
                id="custom-leave-type"
                value={customLeaveType}
                onChange={(e) => setCustomLeaveType(e.target.value)}
                placeholder="Enter leave type"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="fte-subtraction">FTE Cost due to Leave</Label>
                <Input
                  id="fte-subtraction"
                  type="text"
                  inputMode="decimal"
                  value={fteSubtractionInput}
                  onChange={(e) => handleFTESubtractionInputChange(e.target.value)}
                  onBlur={handleFTESubtractionBlur}
                  className={!isValid ? 'border-red-500' : ''}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fte-remaining">FTE Remaining on Duty</Label>
                <Input
                  id="fte-remaining"
                  type="text"
                  inputMode="decimal"
                  value={fteRemainingInput}
                  onChange={(e) => handleFTERemainingInputChange(e.target.value)}
                  onBlur={handleFTERemainingBlur}
                  className={!isValid ? 'border-red-500' : ''}
                  placeholder="0.00"
                />
              </div>
            </div>
            {(fteRemaining < 0 || fteRemaining > maxFTE) && (
              <p className="text-sm text-red-500">
                {totalSpecialProgramFTE > 0 
                  ? `FTE must be between 0 and ${maxFTE.toFixed(2)} (1.0 - ${totalSpecialProgramFTE.toFixed(2)} special program FTE)`
                  : 'FTE must be between 0 and 1'}
              </p>
            )}
            {specialProgramFTEInfo.length > 0 && (
              <div className="space-y-1">
                {specialProgramFTEInfo.map((info, index) => (
                  <p key={index} className="text-sm text-foreground">
                    There is an FTE cost {info.fteSubtraction.toFixed(2)} due to {info.name} for this staff.
                  </p>
                ))}
              </div>
            )}
            {leaveType && leaveType !== 'others' && LEAVE_TYPE_FTE_MAP[leaveType as Exclude<LeaveType, null | 'others' | 'medical follow-up'>] !== undefined && (
              <p className="text-xs text-muted-foreground">
                Default for {leaveType}: {LEAVE_TYPE_FTE_MAP[leaveType as Exclude<LeaveType, null | 'others' | 'medical follow-up'>].toFixed(2)} FTE
              </p>
            )}
          </div>

          {/* AM/PM Selection for therapists when FTE = 0.5 or 0.25 */}
          {isTherapistRank && (fteRemaining === 0.5 || fteRemaining === 0.25) && (
            <div className="space-y-2">
              <Label htmlFor="am-pm-selection">AM/PM Selection</Label>
              <select
                id="am-pm-selection"
                value={amPmSelection}
                onChange={(e) => setAmPmSelection(e.target.value as 'AM' | 'PM' | '')}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Select...</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          )}

          {/* Special Program Availability for therapists */}
          {isTherapistRank && staffHasSpecialProgram && slotTime && (
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={specialProgramAvailable}
                  onChange={(e) => setSpecialProgramAvailable(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  Available during special program <strong>({programName})</strong> slot{' '}
                  <strong className="whitespace-nowrap">"{slotTime}"</strong>?
                </span>
              </label>
            </div>
          )}

          {/* Show slot fields only for non-therapist ranks */}
          {showSlotFields && fteRemaining > 0 && fteRemaining < maxFTE && (
            <div className="space-y-2">
              <Label>
                Available Slots
              </Label>
              <div className="flex gap-2">
                {[
                  { slot: 1, time: '0900-1030' },
                  { slot: 2, time: '1030-1200' },
                  { slot: 3, time: '1330-1500' },
                  { slot: 4, time: '1500-1630' },
                ].map(({ slot, time }) => (
                  <Button
                    key={slot}
                    type="button"
                    onClick={() => handleSlotToggle(slot)}
                    className={cn(
                      'px-3 py-2 rounded text-sm font-medium',
                      availableSlots.includes(slot)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    {time}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Unavailable Slots (auto-populated after available slot selection) */}
          {showSlotFields && unavailableSlots.length > 0 && (
            <div className="space-y-2">
              <Label>
                Unavailable Slots
              </Label>
              <div className="space-y-2">
                {unavailableSlots.map(slot => {
                  const slotTime = (() => {
                    const ranges: Record<number, string> = {
                      1: '0900-1030',
                      2: '1030-1200',
                      3: '1330-1500',
                      4: '1500-1630',
                    }
                    return ranges[slot] || '0900-1030'
                  })()

                  const isInvalid = invalidSlots.some(is => is.slot === slot)
                  const invalidSlotData = invalidSlots.find(is => is.slot === slot)

                  return (
                    <div key={slot} className="border rounded-lg p-4 space-y-2">
                      <div className="font-medium">{slotTime}</div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isInvalid}
                          onChange={(e) => {
                            if (e.target.checked) {
                              // Add or update invalid slot with default time range (full slot)
                              const newInvalidSlot = {
                                slot,
                                timeRange: {
                                  start: slotTime.split('-')[0],
                                  end: slotTime.split('-')[1]
                                }
                              }
                              setInvalidSlots(prev => {
                                // Check if slot already exists, replace it; otherwise add it
                                const existingIndex = prev.findIndex(is => is.slot === slot)
                                if (existingIndex >= 0) {
                                  // Replace existing entry
                                  const updated = [...prev]
                                  updated[existingIndex] = newInvalidSlot
                                  return updated
                                } else {
                                  // Add new entry
                                  return [...prev, newInvalidSlot]
                                }
                              })
                            } else {
                              // Remove invalid slot
                              setInvalidSlots(prev => prev.filter(is => is.slot !== slot))
                            }
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Partially present (not counted as FTE)</span>
                      </label>
                      {isInvalid && (
                        <TimeIntervalSlider
                          slot={slot}
                          startTime={slotTime.split('-')[0]}
                          endTime={slotTime.split('-')[1]}
                          value={invalidSlotData?.timeRange}
                          onChange={(timeRange) => {
                            setInvalidSlots(prev =>
                              prev.map(is =>
                                is.slot === slot
                                  ? { ...is, timeRange }
                                  : is
                              )
                            )
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* FTE Validation Error */}
          {fteValidationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{fteValidationError}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

