'use client'

import { MonthGroup } from '@/lib/utils/scheduleHistory'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScheduleHistoryList } from './ScheduleHistoryList'

interface MonthSectionProps {
  monthGroup: MonthGroup
  selectedScheduleIds: Set<string>
  onSelectSchedule: (scheduleId: string) => void
  onDeleteSchedule?: (scheduleId: string) => void
  onNavigate: (date: string) => void
}

export function MonthSection({
  monthGroup,
  selectedScheduleIds,
  onSelectSchedule,
  onDeleteSchedule,
  onNavigate
}: MonthSectionProps) {
  const canDelete = typeof onDeleteSchedule === 'function'
  const allSelected =
    canDelete &&
    monthGroup.schedules.length > 0 &&
    monthGroup.schedules.every((s) => selectedScheduleIds.has(s.id))
  
  const handleSelectAll = () => {
    if (!canDelete) return
    if (allSelected) {
      // Deselect all in this month
      monthGroup.schedules.forEach(s => {
        onSelectSchedule(s.id) // Toggle will deselect if already selected
      })
    } else {
      // Select all in this month
      monthGroup.schedules.forEach(s => {
        if (!selectedScheduleIds.has(s.id)) {
          onSelectSchedule(s.id) // Toggle will select if not selected
        }
      })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{monthGroup.monthName}</CardTitle>
          {canDelete ? (
            <Button variant="outline" size="sm" onClick={handleSelectAll} className="text-xs h-6 px-2">
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[350px] overflow-y-auto">
          {monthGroup.schedules.map((schedule) => (
            <ScheduleHistoryList
              key={schedule.id}
              schedule={schedule}
              isSelected={selectedScheduleIds.has(schedule.id)}
              onSelect={onSelectSchedule}
              onDelete={onDeleteSchedule}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
