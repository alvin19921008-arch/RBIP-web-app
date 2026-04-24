'use client'

import { useCallback, useRef, useState, Profiler, type ReactNode } from 'react'

export type SchedulePageUserRole = 'developer' | 'admin' | 'user'

export type SchedulePerfStatsEntry = {
  commits: number
  totalActualMs: number
  maxActualMs: number
  lastActualMs: number
  lastPhase: 'mount' | 'update' | 'nested-update'
  lastCommitAtMs: number
}

export function useSchedulePageDevPerf({ userRole }: { userRole: SchedulePageUserRole }) {
  const perfStatsRef = useRef<Record<string, SchedulePerfStatsEntry>>({})
  const lastPerfTickAtRef = useRef(0)
  const [perfTick, setPerfTick] = useState(0)

  const onPerfRender = useCallback(
    (
      id: string,
      phase: 'mount' | 'update' | 'nested-update',
      actualDuration: number,
      _baseDuration: number,
      _startTime: number,
      commitTime: number
    ) => {
      if (userRole !== 'developer') return
      const current = perfStatsRef.current[id] ?? {
        commits: 0,
        totalActualMs: 0,
        maxActualMs: 0,
        lastActualMs: 0,
        lastPhase: 'mount' as const,
        lastCommitAtMs: 0,
      }
      current.commits += 1
      current.totalActualMs += actualDuration
      current.maxActualMs = Math.max(current.maxActualMs, actualDuration)
      current.lastActualMs = actualDuration
      current.lastPhase = phase
      current.lastCommitAtMs = commitTime
      perfStatsRef.current[id] = current

      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()
      if (now - lastPerfTickAtRef.current > 750) {
        lastPerfTickAtRef.current = now
        setPerfTick((t) => t + 1)
      }
    },
    [userRole]
  )

  const MaybeProfiler = useCallback(
    ({ id, children }: { id: string; children: ReactNode }) => {
      if (userRole !== 'developer') return <>{children}</>
      return (
        <Profiler id={id} onRender={onPerfRender}>
          {children}
        </Profiler>
      )
    },
    [onPerfRender, userRole]
  )

  return { perfStatsRef, perfTick, MaybeProfiler }
}
