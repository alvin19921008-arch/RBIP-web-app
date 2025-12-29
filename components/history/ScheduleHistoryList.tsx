'use client'

import { ScheduleHistoryEntry } from '@/lib/utils/scheduleHistory'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ScheduleHistoryListProps {
  schedule: ScheduleHistoryEntry
  isSelected: boolean
  onSelect: (scheduleId: string) => void
  onDelete: (scheduleId: string) => void
  onNavigate: (date: string) => void
}

export function ScheduleHistoryList({
  schedule,
  isSelected,
  onSelect,
  onDelete,
  onNavigate
}: ScheduleHistoryListProps) {
  const getStatusBadge = () => {
    if (schedule.completionStatus === 'complete') {
      return null
    }
    
    const statusLabels: Record<ScheduleHistoryEntry['completionStatus'], string> = {
      'step1': 'Step 1',
      'step2': 'Step 2',
      'step3.2': 'Step 3.2',
      'complete': 'Complete'
    }
    
    return (
      <Badge variant="outline" className="text-xs">
        {statusLabels[schedule.completionStatus]}
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-2 p-2 hover:bg-accent/50 rounded border-b">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onSelect(schedule.id)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4"
      />
      <div
        className="flex-1 flex items-center gap-2 cursor-pointer"
        onClick={() => onNavigate(schedule.date)}
      >
        <span className="text-sm font-medium">
          {schedule.date} ({schedule.weekdayName})
        </span>
        {getStatusBadge()}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(schedule.id)
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
