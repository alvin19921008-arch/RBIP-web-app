'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CalendarGrid } from '@/components/ui/calendar-grid'
import { Staff } from '@/types/staff'
import { formatDate } from '@/lib/utils/dateHelpers'

function formatDateIso(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type CopyMode = 'full' | 'hybrid'

type FlowType = 'next-working-day' | 'last-working-day' | 'specific-date'

interface ScheduleCopyWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Source/target dates as Date objects (already resolved for next/last working day flows)
  sourceDate: Date
  initialTargetDate: Date | null
  flowType: FlowType
  // Direction relative to the currently viewed schedule: 'to' (copy FROM current TO other) or 'from' (copy FROM other TO current)
  direction: 'to' | 'from'
  datesWithData: Set<string>
  holidays: Map<string, string>
  // Called when user confirms copy in final step. Should perform API call and return copiedUpToStep if source incomplete.
  onConfirmCopy: (params: {
    fromDate: Date
    toDate: Date
    mode: CopyMode
    includeBufferStaff: boolean
  }) => Promise<{ copiedUpToStep?: string } | void>
}

export function ScheduleCopyWizard({
  open,
  onOpenChange,
  sourceDate,
  initialTargetDate,
  flowType,
  direction,
  datesWithData,
  holidays,
  onConfirmCopy,
}: ScheduleCopyWizardProps) {
  // Step 1 is only used for specific-date flows; next/last working day starts at Step 2
  const [step, setStep] = useState(flowType === 'specific-date' ? 1 : 2)
  const [copyMode, setCopyMode] = useState<CopyMode | null>(null)
  const [includeBuffer, setIncludeBuffer] = useState(true)
  const [targetDate, setTargetDate] = useState<Date | null>(initialTargetDate)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedUpToStep, setCopiedUpToStep] = useState<string | null>(null)
  const [sourceBufferStaff, setSourceBufferStaff] = useState<Staff[]>([])
  const [bufferStaffLoading, setBufferStaffLoading] = useState(false)

  const sourceDateStr = useMemo(() => formatDate(sourceDate), [sourceDate])
  const targetDateStr = useMemo(
    () => (targetDate ? formatDate(targetDate) : ''),
    [targetDate]
  )

  const isSpecificDateFlow = flowType === 'specific-date'

  // Helper function to resolve from/to dates based on direction and flow type
  const resolveFromAndTo = (): { fromDate: Date | null; toDate: Date | null } => {
    if (direction === 'to') {
      // Standard case: copy FROM sourceDate TO targetDate
      return { fromDate: sourceDate, toDate: targetDate }
    }
    // direction === 'from'
    if (flowType === 'next-working-day' || flowType === 'last-working-day') {
      // For next/last working day flows we pass actual source/target explicitly
      return { fromDate: sourceDate, toDate: targetDate }
    }
    // Specific-date + direction 'from':
    // User selects a source date, current schedule date is the target.
    return { fromDate: targetDate, toDate: sourceDate }
  }

  const effectiveFromDateStr = useMemo(() => {
    const resolved = resolveFromAndTo()
    return resolved.fromDate ? formatDate(resolved.fromDate) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, flowType, sourceDate, targetDate])

  // Load buffer staff actually used in the *source schedule* (allocations + staff_overrides),
  // not the global buffer staff pool. For "copy from a specific date", this updates after Step 1.
  useEffect(() => {
    if (!open) return
    if (!effectiveFromDateStr) return
    ;(async () => {
      try {
        setBufferStaffLoading(true)
        const res = await fetch(`/api/schedules/buffer-staff?date=${encodeURIComponent(effectiveFromDateStr)}`)
        if (!res.ok) {
          setSourceBufferStaff([])
          return
        }
        const data = await res.json()
        const list = (data?.bufferStaff || []) as Staff[]
        const rankCounts = list.reduce<Record<string, number>>((acc, s) => {
          const r = (s as any)?.rank ?? 'unknown'
          acc[r] = (acc[r] || 0) + 1
          return acc
        }, {})
        setSourceBufferStaff(list)
      } catch (e) {
        console.error('Error loading source buffer staff:', e)
        setSourceBufferStaff([])
      } finally {
        setBufferStaffLoading(false)
      }
    })()
  }, [open, effectiveFromDateStr])

  const handleClose = () => {
    // Reset internal state when closing
    setStep(isSpecificDateFlow ? 1 : 2)
    setCopyMode(null)
    setIncludeBuffer(true)
    setIsSubmitting(false)
    setError(null)
    setCopiedUpToStep(null)
    setSourceBufferStaff([])
    setBufferStaffLoading(false)
    onOpenChange(false)
  }

  const validateSpecificDate = (): string | null => {
    if (!isSpecificDateFlow) return null
    if (!targetDate) return 'Please select a working day.'

    const iso = targetDateStr
    const hasData = datesWithData.has(iso)

    if (direction === 'to') {
      // Copy TO a specific date: target must be a working day without existing data
      if (hasData) return 'Target date already has schedule data.'
    } else {
      // Copy FROM a specific date: source must have existing data
      if (!hasData) return 'Selected source date has no schedule data.'
    }

    return null
  }

  const canGoNextFromStep1 = () => {
    if (!isSpecificDateFlow || step !== 1) return true
    return validateSpecificDate() === null
  }

  const canGoNextFromStep2 = () => {
    return copyMode !== null
  }

  const isCalendarDateDisabled = useCallback(
    (date: Date) => {
      // Disable weekends + HK public holidays/Sundays.
      // IMPORTANT: Do NOT call isHongKongHoliday() here; it instantiates heavy holiday logic per cell render.
      const day = date.getDay()
      const isWeekend = day === 0 || day === 6
      if (isWeekend) return true

      const iso = formatDateIso(date)
      if (holidays.has(iso)) return true

      const hasData = datesWithData.has(iso)
      if (direction === 'to') {
        // Copy TO: only allow empty dates
        return hasData
      }
      // direction === 'from': only allow filled dates
      return !hasData
    },
    [datesWithData, direction, holidays]
  )

  const handleNext = () => {
    if (step === 1) {
      const validationError = validateSpecificDate()
      if (validationError) {
        setError(validationError)
        return
      }
      setError(null)
      setStep(2)
    } else if (step === 2) {
      if (!copyMode) {
        setError('Please choose Full copy or Partial copy.')
        return
      }
      setError(null)
      setStep(3)
    }
  }

  const handleBack = () => {
    if (step === 3) {
      setStep(2)
      setError(null)
    } else if (step === 2 && isSpecificDateFlow) {
      setStep(1)
      setError(null)
    }
  }

  const handleConfirmCopy = async () => {
    if (!copyMode) {
      setError('Please choose Full copy or Partial copy.')
      return
    }

    const { fromDate, toDate } = resolveFromAndTo()
    if (!fromDate || !toDate) {
      setError('Both source and target dates must be selected.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const clientRankCounts = sourceBufferStaff.reduce<Record<string, number>>((acc, s) => {
        const r = (s as any)?.rank ?? 'unknown'
        acc[r] = (acc[r] || 0) + 1
        return acc
      }, {})
      const result = await onConfirmCopy({
        fromDate,
        toDate,
        mode: copyMode,
        includeBufferStaff: includeBuffer,
      })
      if (result && (result as any).copiedUpToStep) {
        setCopiedUpToStep((result as any).copiedUpToStep as string)
      }
    } catch (e) {
      console.error('Error confirming copy:', e)
      setError('Failed to copy schedule. Please try again.')
      return
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStepTitle = () => {
    if (step === 1) return 'Choose date'
    if (step === 2) return 'Choose copy type'
    return 'Buffer staff in copied schedule'
  }

  const renderStepIndicator = () => {
    const totalSteps = isSpecificDateFlow ? 3 : 2
    const currentStep = isSpecificDateFlow ? step : step - 1
    return (
      <p className="text-xs text-muted-foreground mb-1">
        Step {currentStep} of {totalSteps}
      </p>
    )
  }

  const renderStep1 = () => {
    if (!isSpecificDateFlow) return null

    const label =
      direction === 'to'
        ? 'Select the target date to copy schedule to'
        : 'Select the source date to copy schedule from'

    return (
      <>
        <DialogDescription className="mb-3">
          {label}. Only working days with appropriate data availability will be accepted.
        </DialogDescription>
        <div className="border border-border rounded-lg overflow-hidden">
          <CalendarGrid
            selectedDate={targetDate ?? sourceDate}
            onDateSelect={(date) => setTargetDate(date)}
            datesWithData={datesWithData}
            holidays={holidays}
            isDateDisabled={isCalendarDateDisabled}
          />
        </div>
      </>
    )
  }

  const renderStep2 = () => {
    const fullSelected = copyMode === 'full'
    const partialSelected = copyMode === 'hybrid'

    return (
      <>
        <DialogDescription className="mb-3">
          Choose how much of the source schedule to copy from{' '}
          <span className="font-semibold whitespace-nowrap">{sourceDateStr}</span> to{' '}
          <span className="font-semibold whitespace-nowrap">{targetDateStr || '...'}</span>.
        </DialogDescription>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            className={`border rounded-md p-3 text-left text-xs ${
              fullSelected ? 'border-blue-600 bg-blue-50' : 'border-border bg-background'
            }`}
            onClick={() => setCopyMode('full')}
          >
            <p className="font-semibold mb-1">Full copy</p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground">
              <li>Copies all steps (1–4), including bed allocations.</li>
              <li>
                Preserves all staff edits/overrides, including bed count overrides (Total beds, SHS,
                Students) and manual slot transfers.
              </li>
              <li>Keeps tie-break decisions and workflow state.</li>
            </ul>
          </button>
          <button
            type="button"
            className={`border rounded-md p-3 text-left text-xs ${
              partialSelected ? 'border-blue-600 bg-blue-50' : 'border-border bg-background'
            }`}
            onClick={() => setCopyMode('hybrid')}
          >
            <p className="font-semibold mb-1">Partial copy</p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground">
              <li>Copies Step 1 &amp; Step 2 setup and outputs.</li>
              <li>Resets floating PCA allocations (Step 3) and bed relieving (Step 4).</li>
              <li>
                Keeps leave/FTE choices, substitutions, special program overrides, and bed count
                overrides (Total beds, SHS, Students).
              </li>
            </ul>
          </button>
        </div>
      </>
    )
  }

  const renderStep3 = () => {
    const bufferTherapists = sourceBufferStaff.filter(s => ['SPT', 'APPT', 'RPT'].includes(s.rank))
    const bufferPCAs = sourceBufferStaff.filter(s => s.rank === 'PCA')

    return (
      <>
        <DialogDescription className="mb-3">
          Detected buffer staff in the current configuration. Choose whether to keep them as buffer
          staff in the copied schedule.
        </DialogDescription>
        {bufferStaffLoading ? (
          <p className="text-xs text-muted-foreground mb-4">Detecting buffer staff in source schedule...</p>
        ) : sourceBufferStaff.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-4">
            No buffer staff found. This setting will have no effect.
          </p>
        ) : (
          <div className="mb-3 space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
            {bufferTherapists.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold mb-1">Buffer therapists</p>
                <ul className="text-[11px] text-muted-foreground space-y-0.5">
                  {bufferTherapists.map(s => (
                    <li key={s.id}>
                      {s.name} ({s.rank}){s.team ? ` – ${s.team}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {bufferPCAs.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold mb-1">Buffer PCAs</p>
                <ul className="text-[11px] text-muted-foreground space-y-0.5">
                  {bufferPCAs.map(s => (
                    <li key={s.id}>
                      {s.name} ({s.rank}){s.team ? ` – ${s.team}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-3 w-3"
              checked={includeBuffer}
              onChange={(e) => setIncludeBuffer(e.target.checked)}
            />
            <span>
              Keep buffer staff in copied schedule (uncheck to convert them to inactive and hide
              them).
            </span>
          </label>
        </div>
        {copiedUpToStep && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Note: Source schedule only has data up to <span className="font-semibold">{copiedUpToStep}</span>.
            Later steps were not copied.
          </p>
        )}
      </>
    )
  }

  const renderBody = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    return renderStep3()
  }

  const { fromDate, toDate } = resolveFromAndTo()
  const fromLabel = fromDate ? formatDate(fromDate) : (direction === 'to' ? sourceDateStr : '(choose date)')
  const toLabel = toDate ? formatDate(toDate) : (direction === 'to' ? targetDateStr || '(choose date)' : sourceDateStr)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          {renderStepIndicator()}
          <DialogTitle>{renderStepTitle()}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <p className="text-xs text-muted-foreground">
            Copy schedule from{' '}
            <span className="font-semibold">{fromLabel}</span> to{' '}
            <span className="font-semibold">{toLabel}</span>.
          </p>
          {renderBody()}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <div className="flex-1" />
          {step > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={isSubmitting}
            >
              Back
            </Button>
          )}
          {step < 3 && (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={isSubmitting || (step === 1 && !canGoNextFromStep1()) || (step === 2 && !canGoNextFromStep2())}
            >
              Next
            </Button>
          )}
          {step === 3 && (
            <Button
              size="sm"
              onClick={handleConfirmCopy}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Copying...' : 'Confirm copy'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

