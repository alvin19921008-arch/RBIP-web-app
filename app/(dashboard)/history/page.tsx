'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [topLoadingVisible, setTopLoadingVisible] = useState(false)
  const [topLoadingProgress, setTopLoadingProgress] = useState(0)
  const loadingBarIntervalRef = useRef<number | null>(null)
  const loadingBarHideTimeoutRef = useRef<number | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const startTopLoading = (initialProgress: number = 0.05) => {
    if (loadingBarHideTimeoutRef.current) {
      window.clearTimeout(loadingBarHideTimeoutRef.current)
      loadingBarHideTimeoutRef.current = null
    }
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
    setTopLoadingVisible(true)
    setTopLoadingProgress(Math.max(0, Math.min(1, initialProgress)))
  }

  const bumpTopLoadingTo = (target: number) => {
    setTopLoadingProgress(prev => Math.max(prev, Math.max(0, Math.min(1, target))))
  }

  const startSoftAdvance = (cap: number = 0.9) => {
    if (loadingBarIntervalRef.current) return
    loadingBarIntervalRef.current = window.setInterval(() => {
      setTopLoadingProgress(prev => {
        const max = Math.max(prev, Math.min(0.98, cap))
        if (prev >= max) return prev
        const step = Math.min(0.015 + Math.random() * 0.02, max - prev)
        return prev + step
      })
    }, 180)
  }

  const stopSoftAdvance = () => {
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
  }

  const finishTopLoading = () => {
    stopSoftAdvance()
    bumpTopLoadingTo(1)
    loadingBarHideTimeoutRef.current = window.setTimeout(() => {
      setTopLoadingVisible(false)
      setTopLoadingProgress(0)
      loadingBarHideTimeoutRef.current = null
    }, 350)
  }

  useEffect(() => {
    return () => {
      if (loadingBarIntervalRef.current) window.clearInterval(loadingBarIntervalRef.current)
      if (loadingBarHideTimeoutRef.current) window.clearTimeout(loadingBarHideTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    setLoading(true)
    startTopLoading(0.05)
    try {
      // Query all schedules that have any allocation data
      // Prefer workflow_state for completion badges when available (legacy-safe fallback).
      bumpTopLoadingTo(0.15)
      let { data: scheduleData, error: scheduleError } = await supabase
        .from('daily_schedules')
        .select('id, date, workflow_state')
        .order('date', { ascending: false })

      if (scheduleError && scheduleError.message?.includes('column')) {
        bumpTopLoadingTo(0.2)
        const fallback = await supabase
          .from('daily_schedules')
          .select('id, date')
          .order('date', { ascending: false })
        scheduleData = fallback.data as any
        scheduleError = fallback.error as any
      }

      if (scheduleError) {
        console.error('Error loading schedules:', scheduleError)
        finishTopLoading()
        setLoading(false)
        return
      }

      if (!scheduleData || scheduleData.length === 0) {
        setSchedules([])
        finishTopLoading()
        setLoading(false)
        return
      }

      // For each schedule, check which allocation tables have data
      const scheduleIds = scheduleData.map(s => s.id)
      bumpTopLoadingTo(0.3)
      startSoftAdvance(0.7)
      
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

      stopSoftAdvance()
      bumpTopLoadingTo(0.85)

      // Create sets of schedule IDs that have each type of allocation
      const hasTherapist = new Set(therapistData.data?.map(a => a.schedule_id) || [])
      const hasPCA = new Set(pcaData.data?.map(a => a.schedule_id) || [])
      const hasBed = new Set(bedData.data?.map(a => a.schedule_id) || [])

      // Filter schedules to only those with at least one type of allocation
      const schedulesWithData = scheduleData.filter(s => 
        hasTherapist.has(s.id) || hasPCA.has(s.id) || hasBed.has(s.id)
      )

      bumpTopLoadingTo(0.92)

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

      bumpTopLoadingTo(0.98)
      setSchedules(entries)
      finishTopLoading()
    } catch (error) {
      console.error('Error loading schedule history:', error)
      finishTopLoading()
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
      const { error, data } = await supabase
        .from('daily_schedules')
        .delete()
        .in('id', scheduleIds)
        .select()

      if (error) {
        console.error('Error deleting schedules:', error)
        alert(`Failed to delete schedules: ${error.message}`)
        return
      }

      // Check if any rows were actually deleted (RLS might silently block)
      if (!data || data.length === 0) {
        alert('Failed to delete schedules: Permission denied. Only admins can delete schedules.')
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
      {/* Thin top loading bar */}
      {topLoadingVisible && (
        <div className="fixed top-0 left-0 right-0 h-[3px] z-[99999] bg-transparent">
          <div
            className="h-full bg-sky-500 transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(topLoadingProgress * 100)}%` }}
          />
        </div>
      )}
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
