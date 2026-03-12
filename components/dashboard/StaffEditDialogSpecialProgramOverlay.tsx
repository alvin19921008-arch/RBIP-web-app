'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SpecialProgram as StaffSpecialProgram, Weekday } from '@/types/staff'
import { getSlotLabel } from '@/lib/utils/slotHelpers'
import {
  buildSpecialProgramSummaryFromConfig,
  createEmptySpecialProgramConfig,
  type SpecialProgramDraftConfig,
  type SpecialProgramOverlaySummary,
} from '@/lib/utils/staffEditDrafts'

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
}

interface StaffEditDialogSpecialProgramOverlayProps {
  staffName: string
  programName: StaffSpecialProgram
  initialConfig: SpecialProgramDraftConfig
  showUnsavedHint?: boolean
  onDone: () => void
  onSaved: (config: SpecialProgramDraftConfig, summary: SpecialProgramOverlaySummary) => void
}

export function StaffEditDialogSpecialProgramOverlay({
  staffName,
  programName,
  initialConfig,
  showUnsavedHint = false,
  onDone,
  onSaved,
}: StaffEditDialogSpecialProgramOverlayProps) {
  const [weekdayConfig, setWeekdayConfig] = useState<SpecialProgramDraftConfig>(initialConfig)

  useEffect(() => {
    setWeekdayConfig(initialConfig ?? createEmptySpecialProgramConfig())
  }, [initialConfig, programName])

  const summary = useMemo(
    () => buildSpecialProgramSummaryFromConfig(weekdayConfig, programName),
    [programName, weekdayConfig]
  )

  const toggleDayEnabled = (day: Weekday) => {
    setWeekdayConfig((prev) => {
      const current = prev[day]
      if (current.enabled) {
        return {
          ...prev,
          [day]: { enabled: false, slots: [], fteSubtraction: 0 },
        }
      }

      return {
        ...prev,
        [day]: { ...current, enabled: true },
      }
    })
  }

  const toggleSlot = (day: Weekday, slot: number) => {
    setWeekdayConfig((prev) => {
      const current = prev[day]
      const slots = current.slots.includes(slot)
        ? current.slots.filter((existing) => existing !== slot)
        : [...current.slots, slot].sort((a, b) => a - b)
      return {
        ...prev,
        [day]: { ...current, slots },
      }
    })
  }

  const handleSave = () => {
    onSaved(weekdayConfig, summary)
    onDone()
  }

  return (
    <div>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-sm font-medium">{staffName}</div>
          {showUnsavedHint ? (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Unsaved changes in this overlay.
            </p>
          ) : null}
        </div>

        <div>
          <Label className="mb-2 block text-sm font-medium">Weekdays</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const current = weekdayConfig[day]
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDayEnabled(day)}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    current.enabled ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {WEEKDAY_LABELS[day]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Label className="mb-2 block text-sm font-medium">Schedule configuration</Label>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left font-medium">Weekday</th>
                <th className="p-2 text-left font-medium">Slots</th>
                <th className="p-2 text-left font-medium">
                  {programName === 'CRP' || programName === 'Robotic' ? 'FTE cost by special program' : 'FTE'}
                </th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((day) => {
                const current = weekdayConfig[day]
                if (!current.enabled) return null

                return (
                  <tr key={day} className="border-b">
                    <td className="p-2 font-medium">{WEEKDAY_LABELS[day]}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4].map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => toggleSlot(day, slot)}
                            className={`min-w-[2.5rem] rounded px-2 py-1 text-xs ${
                              current.slots.includes(slot)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {getSlotLabel(slot)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={current.fteSubtraction}
                        onChange={(event) => {
                          const nextValue = parseFloat(event.target.value)
                          setWeekdayConfig((prev) => ({
                            ...prev,
                            [day]: {
                              ...prev[day],
                              fteSubtraction: Number.isFinite(nextValue) ? nextValue : 0,
                            },
                          }))
                        }}
                        className="w-20 rounded-md border px-2 py-1 text-sm"
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Example FTE values: `0.4` for therapist support, `0.25` for one PCA slot.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-sm font-medium">{summary.exists ? 'Current summary' : 'Not configured yet'}</div>
          <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
            {summary.exists
              ? summary.displayText
              : 'Enable at least one weekday to configure this program for this staff member.'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSave}>
            Apply to draft
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Discard changes
          </Button>
        </div>
      </div>
    </div>
  )
}
