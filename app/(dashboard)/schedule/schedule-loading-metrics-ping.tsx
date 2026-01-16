'use client'

import * as React from 'react'

export function ScheduleLoadingMetricsPing() {
  React.useEffect(() => {
    try {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      window.sessionStorage.setItem('rbip_nav_schedule_loading_shown_ms', String(now))
    } catch {
      // ignore
    }
  }, [])

  return null
}

