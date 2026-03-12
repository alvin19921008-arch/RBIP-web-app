'use client'

import { useMemo } from 'react'
import { Staff, Team } from '@/types/staff'
import { SPTAllocation } from '@/types/allocation'
import { SPTAllocationForm } from '@/components/dashboard/SPTAllocationPanel'

const SPT_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

type SptOverlaySaveSummary = {
  specialty: string | null
  isRbipSupervisor: boolean
  teams: Team[]
  enabledDays: Array<(typeof SPT_WEEKDAYS)[number]>
}

interface StaffEditDialogSPTOverlayProps {
  staff: Staff
  allocation: Partial<SPTAllocation>
  showUnsavedHint?: boolean
  onDone: () => void
  onSaved: (allocation: Partial<SPTAllocation>, next: SptOverlaySaveSummary) => void
}

export function StaffEditDialogSPTOverlay({
  staff,
  allocation,
  showUnsavedHint = false,
  onDone,
  onSaved,
}: StaffEditDialogSPTOverlayProps) {
  const draftStaffId = staff.id || '__draft_staff__'
  const staffForSelect = useMemo(() => [{ ...staff, id: draftStaffId }], [draftStaffId, staff])

  const handleSave = async (next: Partial<SPTAllocation>) => {
    const payload: Partial<SPTAllocation> = {
      ...next,
      staff_id: staff.id || undefined,
    }

    const cfgByDay = (payload.config_by_weekday as Record<
      (typeof SPT_WEEKDAYS)[number],
      { enabled?: boolean } | undefined
    > | null) ?? null
    const enabledDays = SPT_WEEKDAYS.filter((day) => {
      const cfg = cfgByDay?.[day]
      if (!cfgByDay) {
        return Array.isArray(payload.weekdays) && payload.weekdays.includes(day as any)
      }
      return cfg?.enabled !== false
    })

    onSaved(payload, {
      specialty: (payload.specialty as any) ?? null,
      isRbipSupervisor: !!(payload.is_rbip_supervisor as any),
      teams: Array.isArray(payload.teams) ? (payload.teams as Team[]) : [],
      enabledDays,
    })
    onDone()
  }

  return (
    <div className="space-y-4">
      {showUnsavedHint ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Unsaved changes in this overlay.
        </p>
      ) : null}
      <SPTAllocationForm
        allocation={{
          ...allocation,
          staff_id: allocation.staff_id || draftStaffId,
        }}
        staff={staffForSelect}
        saveButtonLabel="Apply to draft"
        cancelButtonLabel="Discard changes"
        onSave={handleSave}
        onCancel={onDone}
      />
    </div>
  )
}

