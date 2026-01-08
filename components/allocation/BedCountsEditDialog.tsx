'use client'

import { useEffect, useMemo, useState } from 'react'
import { Team } from '@/types/staff'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type BedCountsOverridePayload = {
  wardBedCounts: Record<string, number | null>
  shsBedCounts: number | null
  studentPlacementBedCounts: number | null
}

export type BedCountsOverrideState = Partial<BedCountsOverridePayload>

export type BedCountsWardRow = {
  wardName: string
  wardLabel: string
  wardTotalBeds: number
  baselineTeamBeds: number
}

function parseNullableNonNegativeInt(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null }
  if (!/^\d+$/.test(trimmed)) return { value: null, error: 'Please enter a whole number.' }
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return { value: null, error: 'Invalid number.' }
  if (n < 0) return { value: null, error: 'Must be ≥ 0.' }
  return { value: n }
}

export interface BedCountsEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: Team
  wardRows: BedCountsWardRow[]
  initialOverrides?: BedCountsOverrideState
  onSave: (payload: BedCountsOverridePayload) => void
}

export function BedCountsEditDialog({
  open,
  onOpenChange,
  team,
  wardRows,
  initialOverrides,
  onSave,
}: BedCountsEditDialogProps) {
  const [wardInputs, setWardInputs] = useState<Record<string, string>>({})
  const [shsInput, setShsInput] = useState('')
  const [studentInput, setStudentInput] = useState('')
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Reset local state when opening / switching teams
  useEffect(() => {
    if (!open) return
    const nextWardInputs: Record<string, string> = {}
    for (const row of wardRows) {
      const overrideCandidate = initialOverrides?.wardBedCounts?.[row.wardName]
      const effective =
        typeof overrideCandidate === 'number' ? overrideCandidate : row.baselineTeamBeds
      nextWardInputs[row.wardName] = String(effective)
    }
    setWardInputs(nextWardInputs)
    setShsInput(
      initialOverrides?.shsBedCounts != null && initialOverrides.shsBedCounts > 0
        ? String(initialOverrides.shsBedCounts)
        : ''
    )
    setStudentInput(
      initialOverrides?.studentPlacementBedCounts != null && initialOverrides.studentPlacementBedCounts > 0
        ? String(initialOverrides.studentPlacementBedCounts)
        : ''
    )
    setShowAdjustments(false)
    setFormError(null)
  }, [open, team, wardRows, initialOverrides])

  const wardErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    for (const row of wardRows) {
      const raw = wardInputs[row.wardName] ?? ''
      const parsed = parseNullableNonNegativeInt(raw)
      if (parsed.error) {
        errors[row.wardName] = parsed.error
        continue
      }
      if (parsed.value != null && parsed.value > row.wardTotalBeds) {
        errors[row.wardName] = `Cannot exceed ward total bed stat (${row.wardTotalBeds}).`
      }
    }
    return errors
  }, [wardInputs, wardRows])

  const effectiveBaseTotal = useMemo(() => {
    let sum = 0
    for (const row of wardRows) {
      const raw = wardInputs[row.wardName] ?? ''
      const parsed = parseNullableNonNegativeInt(raw)
      const effective = parsed.value == null ? row.baselineTeamBeds : parsed.value
      sum += effective
    }
    return sum
  }, [wardInputs, wardRows])

  const shsParsed = useMemo(() => parseNullableNonNegativeInt(shsInput), [shsInput])
  const studentParsed = useMemo(() => parseNullableNonNegativeInt(studentInput), [studentInput])

  const deductionError = useMemo(() => {
    if (shsParsed.error) return `SHS: ${shsParsed.error}`
    if (studentParsed.error) return `Students: ${studentParsed.error}`
    const shs = shsParsed.value ?? 0
    const students = studentParsed.value ?? 0
    if (shs + students > effectiveBaseTotal) {
      return `SHS + Students cannot exceed base total (${effectiveBaseTotal}).`
    }
    return null
  }, [shsParsed, studentParsed, effectiveBaseTotal])

  const finalTotal = useMemo(() => {
    const shs = shsParsed.value ?? 0
    const students = studentParsed.value ?? 0
    return Math.max(0, effectiveBaseTotal - shs - students)
  }, [effectiveBaseTotal, shsParsed.value, studentParsed.value])

  const hasErrors =
    Object.keys(wardErrors).length > 0 ||
    !!deductionError ||
    wardRows.length === 0

  const adjustmentsSummary = useMemo(() => {
    const shs = shsParsed.value ?? 0
    const students = studentParsed.value ?? 0
    if (shs <= 0 && students <= 0) return 'None'
    const parts: string[] = []
    if (shs > 0) parts.push(`SHS ${shs}`)
    if (students > 0) parts.push(`Students ${students}`)
    return parts.join(', ')
  }, [shsParsed.value, studentParsed.value])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit bed counts — {team}</DialogTitle>
        </DialogHeader>

        {wardRows.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">
            No designated wards found for {team}. Configure ward responsibilities in Dashboard → Team configuration.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-3 border rounded-md p-3">
              <div>
                <p className="text-sm font-medium">Base total bed counts (derived)</p>
                <p className="text-xs text-muted-foreground">Sum of the per-ward bed counts below.</p>
              </div>
              <div className="text-lg font-semibold tabular-nums">{effectiveBaseTotal}</div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Per-ward bed counts</p>
              <div className="max-h-72 overflow-y-auto border rounded-md">
                <div className="p-3 space-y-3">
                  {wardRows.map((row) => {
                    const error = wardErrors[row.wardName]
                    const inputId = `ward-bed-${team}-${row.wardName}`
                    return (
                      <div key={row.wardName} className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <Label htmlFor={inputId} className="text-sm font-medium">
                              {row.wardLabel}
                            </Label>
                            <div className="text-[11px] text-muted-foreground">
                              Ward total bed stat: <span className="font-medium">{row.wardTotalBeds}</span>
                              {' • '}
                              Current baseline for {team}:{' '}
                              <span className="font-medium">{row.baselineTeamBeds}</span>
                            </div>
                          </div>
                          <div className="shrink-0 w-28">
                            <Input
                              id={inputId}
                              type="number"
                              inputMode="numeric"
                              value={wardInputs[row.wardName] ?? ''}
                              onChange={(e) => {
                                const next = e.target.value
                                setWardInputs((prev) => ({ ...prev, [row.wardName]: next }))
                                setFormError(null)
                              }}
                              className={error ? 'border-red-500 focus-visible:ring-red-500' : ''}
                            />
                          </div>
                        </div>
                        {error ? <p className="text-xs text-red-600">{error}</p> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="border rounded-md">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-sm"
                onClick={() => setShowAdjustments((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">Adjustments (optional)</span>
                  <span className="text-xs text-muted-foreground">SHS, Student placements</span>
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{adjustmentsSummary}</span>
                  <span className="font-mono">{showAdjustments ? '▾' : '▸'}</span>
                </span>
              </button>

              {showAdjustments ? (
                <div className="border-t p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="shsBedCounts">SHS bed counts</Label>
                      <Input
                        id="shsBedCounts"
                        type="number"
                        inputMode="numeric"
                        placeholder="(optional)"
                        value={shsInput}
                        onChange={(e) => {
                          setShsInput(e.target.value)
                          setFormError(null)
                        }}
                        className={deductionError?.startsWith('SHS') ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="studentBedCounts">Student placement bed counts</Label>
                      <Input
                        id="studentBedCounts"
                        type="number"
                        inputMode="numeric"
                        placeholder="(optional)"
                        value={studentInput}
                        onChange={(e) => {
                          setStudentInput(e.target.value)
                          setFormError(null)
                        }}
                        className={deductionError?.startsWith('Students') ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    These values subtract from the base total for today.
                  </p>
                  {deductionError ? <p className="text-xs text-red-600">{deductionError}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border rounded-md p-3">
              <div>
                <p className="text-sm font-medium">Final total beds (for today)</p>
                <p className="text-xs text-muted-foreground">Base total minus SHS/Students.</p>
              </div>
              <div className="text-lg font-semibold tabular-nums">{finalTotal}</div>
            </div>

            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          </div>
        )}

        <DialogFooter className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={hasErrors}
            onClick={() => {
              if (wardRows.length === 0) {
                setFormError('No designated wards available to edit.')
                return
              }
              if (Object.keys(wardErrors).length > 0) {
                setFormError('Please fix the per-ward errors before saving.')
                return
              }
              if (deductionError) {
                setFormError('Please fix the SHS/Students errors before saving.')
                return
              }

              const wardBedCounts: Record<string, number | null> = {}
              for (const row of wardRows) {
                const raw = wardInputs[row.wardName] ?? ''
                const parsed = parseNullableNonNegativeInt(raw)
                const n = parsed.value
                // Normalize: if equals baseline, store null to mean “use baseline”
                wardBedCounts[row.wardName] = n == null || n === row.baselineTeamBeds ? null : n
              }

              const shsVal = shsParsed.value ?? 0
              const studentVal = studentParsed.value ?? 0

              onSave({
                wardBedCounts,
                shsBedCounts: shsVal > 0 ? shsVal : null,
                studentPlacementBedCounts: studentVal > 0 ? studentVal : null,
              })
              onOpenChange(false)
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

