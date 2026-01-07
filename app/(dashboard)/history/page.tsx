'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { MonthSection } from '@/components/history/MonthSection'
import { DeleteConfirmDialog } from '@/components/history/DeleteConfirmDialog'
import {
  ScheduleHistoryEntry,
  groupSchedulesByMonth,
  getWeekday,
  getWeekdayName,
  getCompletionStatus,
  getCompletionStatusFromWorkflowState,
} from '@/lib/utils/scheduleHistory'

export default function HistoryPage() {
  const [schedules, setSchedules] = useState<ScheduleHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    setLoading(true)
    try {
      // Query all schedules that have any allocation data
      // Prefer workflow_state for completion badges when available (legacy-safe fallback).
      let { data: scheduleData, error: scheduleError } = await supabase
        .from('daily_schedules')
        .select('id, date, workflow_state')
        .order('date', { ascending: false })

      if (scheduleError && scheduleError.message?.includes('column')) {
        const fallback = await supabase
          .from('daily_schedules')
          .select('id, date')
          .order('date', { ascending: false })
        scheduleData = fallback.data as any
        scheduleError = fallback.error as any
      }

      if (scheduleError) {
        console.error('Error loading schedules:', scheduleError)
        setLoading(false)
        return
      }

      if (!scheduleData || scheduleData.length === 0) {
        setSchedules([])
        setLoading(false)
        return
      }

      // For each schedule, check which allocation tables have data
      const scheduleIds = scheduleData.map(s => s.id)
      
      const [therapistData, pcaData, bedData] = await Promise.all([
        supabase
          .from('schedule_therapist_allocations')
          .select('schedule_id')
          .in('schedule_id', scheduleIds),
        supabase
          .from('schedule_pca_allocations')
          .select('schedule_id')
          .in('schedule_id', scheduleIds),
        supabase
          .from('schedule_bed_allocations')
          .select('schedule_id')
          .in('schedule_id', scheduleIds)
      ])

      // Create sets of schedule IDs that have each type of allocation
      const hasTherapist = new Set(therapistData.data?.map(a => a.schedule_id) || [])
      const hasPCA = new Set(pcaData.data?.map(a => a.schedule_id) || [])
      const hasBed = new Set(bedData.data?.map(a => a.schedule_id) || [])

      // Filter schedules to only those with at least one type of allocation
      const schedulesWithData = scheduleData.filter(s => 
        hasTherapist.has(s.id) || hasPCA.has(s.id) || hasBed.has(s.id)
      )

      // Build schedule entries
      const entries: ScheduleHistoryEntry[] = schedulesWithData.map(schedule => {
        const date = new Date(schedule.date)
        const weekday = getWeekday(date)
        const weekdayName = getWeekdayName(weekday)
        const hasTherapistAllocs = hasTherapist.has(schedule.id)
        const hasPCAAllocs = hasPCA.has(schedule.id)
        const hasBedAllocs = hasBed.has(schedule.id)
        const workflowState = (schedule as any).workflow_state ?? null
        const completionStatus =
          getCompletionStatusFromWorkflowState(workflowState) ??
          getCompletionStatus(hasTherapistAllocs, hasPCAAllocs, hasBedAllocs)

        return {
          id: schedule.id,
          date: schedule.date,
          weekday,
          weekdayName,
          hasTherapistAllocations: hasTherapistAllocs,
          hasPCAAllocations: hasPCAAllocs,
          hasBedAllocations: hasBedAllocs,
          workflowState,
          completionStatus
        }
      })

      setSchedules(entries)
    } catch (error) {
      console.error('Error loading schedule history:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleScheduleSelection = (scheduleId: string) => {
    setSelectedScheduleIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scheduleId)) {
        newSet.delete(scheduleId)
      } else {
        newSet.add(scheduleId)
      }
      return newSet
    })
  }

  const handleDelete = async () => {
    if (selectedScheduleIds.size === 0) return

    const scheduleIds = Array.from(selectedScheduleIds)
    
    try {
      // Delete schedules (cascade will handle related allocations)
      const { error } = await supabase
        .from('daily_schedules')
        .delete()
        .in('id', scheduleIds)

      if (error) {
        console.error('Error deleting schedules:', error)
        alert('Failed to delete schedules. Please try again.')
        return
      }

      // Reload schedules
      await loadSchedules()
      setSelectedScheduleIds(new Set())
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error('Error deleting schedules:', error)
      alert('Failed to delete schedules. Please try again.')
    }
  }

  const handleNavigate = (date: string) => {
    // Store return path in sessionStorage
    sessionStorage.setItem('scheduleReturnPath', '/history')
    router.push(`/schedule?date=${date}`)
  }

  const monthGroups = groupSchedulesByMonth(schedules)

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule History</h1>
        {selectedScheduleIds.size > 0 && (
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected ({selectedScheduleIds.size})
          </Button>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p>Loading schedule history...</p>
          </CardContent>
        </Card>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No schedule history found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {monthGroups.map((monthGroup) => (
            <MonthSection
              key={`${monthGroup.year}-${monthGroup.month}`}
              monthGroup={monthGroup}
              selectedScheduleIds={selectedScheduleIds}
              onSelectSchedule={toggleScheduleSelection}
              onDeleteSchedule={(scheduleId) => {
                setSelectedScheduleIds(new Set([scheduleId]))
                setDeleteDialogOpen(true)
              }}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        count={selectedScheduleIds.size}
        onConfirm={handleDelete}
      />
    </div>
  )
}
