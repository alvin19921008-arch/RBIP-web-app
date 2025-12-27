'use client'

import { useState, useEffect } from 'react'
import { LeaveType, LEAVE_TYPE_FTE_MAP } from '@/types/staff'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

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
  currentInvalidSlot?: number
  currentLeaveComebackTime?: string
  currentIsLeave?: boolean
  onSave: (staffId: string, leaveType: LeaveType | null, fteRemaining: number, fteSubtraction?: number, availableSlots?: number[], invalidSlot?: number, leaveComebackTime?: string, isLeave?: boolean) => void
}

const LEAVE_TYPES: Exclude<LeaveType, null>[] = ['VL', 'half day VL', 'TIL', 'SDO', 'sick leave', 'study leave', 'medical follow-up', 'others']

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
  currentInvalidSlot,
  currentLeaveComebackTime,
  currentIsLeave,
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
  const [invalidSlot, setInvalidSlot] = useState<number | undefined>(currentInvalidSlot)
  const [leaveComebackTime, setLeaveComebackTime] = useState<string>(currentLeaveComebackTime || '')
  const [timeInputValue, setTimeInputValue] = useState<string>('')
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM')
  const [isLeave, setIsLeave] = useState<boolean>(currentIsLeave ?? true)
  const [showCustomInput, setShowCustomInput] = useState(false)

  useEffect(() => {
    if (open) {
      setLeaveType(currentLeaveType)
      setFteRemaining(roundTo2Decimals(currentFTERemaining))
      const calculatedSubtraction = currentFTESubtraction ?? (1.0 - currentFTERemaining - totalSpecialProgramFTE)
      setFteSubtraction(roundTo2Decimals(Math.max(0, calculatedSubtraction)))
      setFteRemainingInput(roundTo2Decimals(currentFTERemaining).toFixed(2))
      setFteSubtractionInput(roundTo2Decimals(Math.max(0, calculatedSubtraction)).toFixed(2))
      setAvailableSlots(currentAvailableSlots ?? [])
      setInvalidSlot(currentInvalidSlot)
      setLeaveComebackTime(currentLeaveComebackTime || '')
      // Parse time input from stored time (HH:MM format)
      if (currentLeaveComebackTime) {
        const [hours, minutes] = currentLeaveComebackTime.split(':').map(Number)
        const hour24 = hours
        let hour12 = hour24
        let period: 'AM' | 'PM' = 'AM'
        
        if (hour24 === 0) {
          hour12 = 12
          period = 'AM'
        } else if (hour24 === 12) {
          hour12 = 12
          period = 'PM'
        } else if (hour24 > 12) {
          hour12 = hour24 - 12
          period = 'PM'
        } else {
          hour12 = hour24
          period = 'AM'
        }
        
        setTimeInputValue(`${String(hour12).padStart(2, '0')}${String(minutes).padStart(2, '0')}`)
        setTimePeriod(period)
      } else {
        setTimeInputValue('')
        setTimePeriod('AM')
      }
      setIsLeave(currentIsLeave ?? true)
      setShowCustomInput(currentLeaveType === 'others')
      setCustomLeaveType('')
    }
  }, [open, currentLeaveType, currentFTERemaining, currentFTESubtraction, currentAvailableSlots, currentInvalidSlot, currentLeaveComebackTime, currentIsLeave, totalSpecialProgramFTE])

  const maxFTE = 1.0 - totalSpecialProgramFTE
  const fteIsMultipleOfQuarter = isMultipleOfQuarter(fteRemaining)
  // Hide slot-related fields for therapist ranks (RPT, APPT, SPT)
  const isTherapistRank = staffRank && ['RPT', 'APPT', 'SPT'].includes(staffRank)
  const showSlotFields = !isTherapistRank

  const handleFTESubtractionInputChange = (value: string) => {
    // Allow free typing - only update the input string
    setFteSubtractionInput(value)
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
    
    // Clear invalid slot if FTE becomes multiple of 0.25
    if (isMultipleOfQuarter(calculatedRemaining)) {
      setInvalidSlot(undefined)
      setLeaveComebackTime('')
      setTimeInputValue('')
    }
  }

  const handleFTERemainingInputChange = (value: string) => {
    // Allow free typing - only update the input string
    setFteRemainingInput(value)
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
    
    // Clear invalid slot if FTE becomes multiple of 0.25
    if (isMultipleOfQuarter(newRemaining)) {
      setInvalidSlot(undefined)
      setLeaveComebackTime('')
      setTimeInputValue('')
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
  }

  const handleInvalidSlotToggle = (slot: number) => {
    if (invalidSlot === slot) {
      setInvalidSlot(undefined)
    } else {
      setInvalidSlot(slot)
    }
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
      setInvalidSlot(undefined)
      setLeaveComebackTime('')
      setTimeInputValue('')
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
      
      // Clear invalid slot if FTE is multiple of 0.25
      if (isMultipleOfQuarter(adjustedFTE)) {
        setInvalidSlot(undefined)
        setLeaveComebackTime('')
        setTimeInputValue('')
      }
    }
  }

  // Convert time input (e.g., "0815") to 24-hour format (e.g., "08:15")
  const convertTimeInputTo24Hour = (input: string, period: 'AM' | 'PM'): string => {
    if (!input || input.length < 3) return ''
    
    // Parse input: "0815" -> hours: 08, minutes: 15
    let hours = 0
    let minutes = 0
    
    if (input.length === 3) {
      // "815" -> 8 hours, 15 minutes
      hours = parseInt(input[0]) || 0
      minutes = parseInt(input.slice(1)) || 0
    } else if (input.length === 4) {
      // "0815" -> 08 hours, 15 minutes
      hours = parseInt(input.slice(0, 2)) || 0
      minutes = parseInt(input.slice(2)) || 0
    }
    
    // Validate hours and minutes
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return ''
    }
    
    // Convert to 24-hour format
    let hour24 = hours
    if (period === 'AM') {
      if (hours === 12) hour24 = 0
    } else { // PM
      if (hours !== 12) hour24 = hours + 12
    }
    
    return `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const handleTimeInputChange = (value: string) => {
    // Only allow digits, max 4 characters
    const digitsOnly = value.replace(/\D/g, '').slice(0, 4)
    setTimeInputValue(digitsOnly)
    
    // Auto-update leaveComebackTime if valid
    if (digitsOnly.length >= 3) {
      const time24 = convertTimeInputTo24Hour(digitsOnly, timePeriod)
      if (time24) {
        setLeaveComebackTime(time24)
      }
    } else {
      setLeaveComebackTime('')
    }
  }

  const handleTimePeriodChange = (period: 'AM' | 'PM') => {
    setTimePeriod(period)
    // Update leaveComebackTime with new period
    if (timeInputValue.length >= 3) {
      const time24 = convertTimeInputTo24Hour(timeInputValue, period)
      if (time24) {
        setLeaveComebackTime(time24)
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
    let finalInvalidSlot: number | undefined = invalidSlot
    let finalTime: string | undefined = leaveComebackTime
    let finalIsLeave: boolean | undefined = isLeave
    
    // Convert time input to 24-hour format if provided
    if (showSlotFields && timeInputValue.length >= 3) {
      const time24 = convertTimeInputTo24Hour(timeInputValue, timePeriod)
      if (time24) {
        finalTime = time24
      }
    }
    
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
      finalInvalidSlot = undefined
      finalTime = undefined
      finalIsLeave = undefined
    }
    
    onSave(staffId, finalLeaveType, finalRemaining, roundTo2Decimals(maxFTE - finalRemaining), finalSlots, finalInvalidSlot, finalTime, finalIsLeave)
    onOpenChange(false)
  }

  const isValid = fteRemaining >= 0 && fteRemaining <= maxFTE

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
            {!isValid && (
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

          {/* Show slot fields only for non-therapist ranks */}
          {showSlotFields && fteRemaining > 0 && fteRemaining < maxFTE && (
            <div className="space-y-2">
              <Label>
                Available Slots
              </Label>
              <div className="flex gap-4">
                {[1, 2, 3, 4].map(slot => (
                  <label key={slot} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={availableSlots.includes(slot)}
                      onChange={() => handleSlotToggle(slot)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Slot {slot}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Always show time picker and leave/come back slot selection for non-therapist ranks */}
          {showSlotFields && fteRemaining > 0 && fteRemaining < maxFTE && (
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="leave-comeback-time">What time to leave/come back</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="leave-comeback-time"
                  type="text"
                  inputMode="numeric"
                  value={timeInputValue}
                  onChange={(e) => handleTimeInputChange(e.target.value)}
                  placeholder="0815"
                  maxLength={4}
                  className="flex-1"
                />
                <select
                  value={timePeriod}
                  onChange={(e) => handleTimePeriodChange(e.target.value as 'AM' | 'PM')}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              {timeInputValue && timeInputValue.length >= 3 && (
                <p className="text-xs text-muted-foreground">
                  {timeInputValue.length === 3 
                    ? `Time: ${timeInputValue[0]}:${timeInputValue.slice(1)} ${timePeriod}`
                    : `Time: ${timeInputValue.slice(0, 2)}:${timeInputValue.slice(2)} ${timePeriod}`
                  }
                </p>
              )}
              
              <div className="space-y-2">
                <Label>Leave or Come Back</Label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="leave-comeback"
                      checked={isLeave}
                      onChange={() => setIsLeave(true)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Leave</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="leave-comeback"
                      checked={!isLeave}
                      onChange={() => setIsLeave(false)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Come Back</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Slot to Leave/Come Back</Label>
                <div className="flex gap-4">
                  {[1, 2, 3, 4].map(slot => (
                    <label key={slot} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="invalid-slot"
                        checked={invalidSlot === slot}
                        onChange={() => handleInvalidSlotToggle(slot)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">Slot {slot}</span>
                    </label>
                  ))}
                </div>
                {invalidSlot && (
                  <p className="text-xs text-muted-foreground">
                    Slot {invalidSlot} will still be assigned but not counted as a valid slot allocation to the team.
                  </p>
                )}
              </div>
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

