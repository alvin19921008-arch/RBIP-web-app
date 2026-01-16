import React from 'react'
import { ScheduleLoadingMetricsPing } from './schedule-loading-metrics-ping'

export default function ScheduleLoading() {
  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
          <div className="h-5 w-80 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-10 rounded-md bg-muted animate-pulse" />
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="h-24 rounded-lg border border-border bg-card animate-pulse" />
        <div className="h-[420px] rounded-lg border border-border bg-card animate-pulse" />
        <div className="h-40 rounded-lg border border-border bg-card animate-pulse" />
      </div>

      {/* Diagnostics ping (dev tooltip uses it) */}
      <div className="sr-only">
        <ScheduleLoadingMetricsPing />
      </div>
    </div>
  )
}

