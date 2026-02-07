'use client'

import type { ReactNode } from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import type { TimingReport } from '@/lib/utils/timing'

type NavTiming = {
  targetHref: string
  startMs: number
  loadingShownMs: number | null
  mountedMs: number | null
  gridReadyMs: number
}

type PerfStat = {
  commits: number
  totalActualMs: number
  maxActualMs: number
  lastActualMs: number
  lastPhase: 'mount' | 'update' | 'nested-update'
}

export function ScheduleTitleWithLoadDiagnostics(props: {
  userRole?: 'developer' | 'admin' | 'user'
  showDiagnostics?: boolean
  title: string
  currentDateKey?: string
  lastLoadTiming: TimingReport | null
  navToScheduleTiming: NavTiming | null
  perfTick: number
  perfStats: Record<string, PerfStat | undefined>
}) {
  const shouldShow = typeof props.showDiagnostics === 'boolean' ? props.showDiagnostics : props.userRole === 'developer'
  if (!shouldShow) {
    return <h1 className="text-2xl font-bold">{props.title}</h1>
  }

  return (
    <Tooltip
      side="bottom"
      className="p-0 bg-transparent border-0 shadow-none whitespace-normal"
      content={
        <div className="w-[360px] bg-slate-800 border border-slate-700 rounded-md shadow-lg">
          <div className="border-b border-slate-700 px-3 py-2 text-xs text-slate-500">Load diagnostics</div>
          <div className="px-3 py-2 text-xs text-slate-200 space-y-2">
            {props.lastLoadTiming ? (
              <>
                <div>
                  <span className="text-slate-400">total:</span> {Math.round(props.lastLoadTiming.totalMs)}ms
                </div>
                <LoadMetaBlock
                  meta={(props.lastLoadTiming.meta as any) || {}}
                  currentDateKey={props.currentDateKey}
                  navToScheduleTiming={props.navToScheduleTiming}
                  perfTick={props.perfTick}
                  perfStats={props.perfStats}
                />
                {props.lastLoadTiming.stages.length > 0 ? (
                  <div className="pt-1 text-[11px] text-slate-300 space-y-0.5">
                    {props.lastLoadTiming.stages.map((s) => (
                      <div key={`load-${s.name}`}>
                        <span className="text-slate-400">{s.name}:</span> {Math.round(s.ms)}ms
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="text-slate-500">No load timing captured yet.</div>
                <LoadNavFallback navToScheduleTiming={props.navToScheduleTiming} />
              </>
            )}
          </div>
        </div>
      }
    >
      <h1 className="text-2xl font-bold">{props.title}</h1>
    </Tooltip>
  )
}

function LoadMetaBlock(props: {
  meta: any
  currentDateKey?: string
  navToScheduleTiming: NavTiming | null
  perfTick: number
  perfStats: Record<string, PerfStat | undefined>
}) {
  const meta = props.meta || {}
  const timingDateKey = typeof meta.dateStr === 'string' ? meta.dateStr : null
  const currentDateKey = props.currentDateKey ?? null
  const isStale = !!(timingDateKey && currentDateKey && timingDateKey !== currentDateKey)
  const isPending = !!meta.pending
  const snapshotKb = typeof meta.snapshotBytes === 'number' ? Math.round(meta.snapshotBytes / 1024) : null
  const nav = (meta.nav as NavTiming | undefined) ?? (props.navToScheduleTiming ?? undefined)
  const fmtDelta = (from: number, to: number) => `${Math.max(0, Math.round(to - from))}ms`

  return (
    <div className="text-[11px] text-slate-400 space-y-0.5">
      <div>
        rpc:{meta.rpcUsed ? 'yes' : 'no'}
        {meta.batchedQueriesUsed ? ', batched:yes' : ', batched:no'}
        {meta.baselineSnapshotUsed ? ', snapshot:yes' : ', snapshot:no'}
      </div>
      <div>
        cache(read):{isPending ? 'pending' : isStale ? 'stale' : meta.cacheHit ? 'hit' : 'miss'}
        {isPending ? (meta.cacheHit ? ' (cached)' : ' (not cached)') : null}
        {!isPending && !isStale && !meta.cacheHit ? ' (stored)' : ''}
        {typeof meta.cacheSize === 'number' ? `, size:${meta.cacheSize}` : ''}
      </div>
      <div>
        date(load):{timingDateKey ?? 'unknown'}
        {currentDateKey ? `, current:${currentDateKey}` : ''}
      </div>
      <div>
        calcs:{meta.calculationsSource || 'unknown'}
        {snapshotKb != null ? `, snapshot:${snapshotKb}KB` : ''}
      </div>

      {nav && typeof nav.startMs === 'number' ? (
        <div className="pt-1 space-y-0.5">
          <div className="text-slate-500">nav → schedule</div>
          <div>
            <span className="text-slate-400">start→loading.tsx:</span>{' '}
            {nav.loadingShownMs != null ? fmtDelta(nav.startMs, nav.loadingShownMs) : 'n/a'}
          </div>
          <div>
            <span className="text-slate-400">start→mount:</span> {nav.mountedMs != null ? fmtDelta(nav.startMs, nav.mountedMs) : 'n/a'}
          </div>
          <div>
            <span className="text-slate-400">start→gridReady:</span> {fmtDelta(nav.startMs, nav.gridReadyMs)}
          </div>
        </div>
      ) : null}

      {meta.counts ? (
        <div>
          rows: th={meta.counts.therapistAllocs ?? 0}, pca={meta.counts.pcaAllocs ?? 0}, bed={meta.counts.bedAllocs ?? 0},
          calcsRows={meta.counts.calculationsRows ?? 0}
        </div>
      ) : null}

      {Array.isArray(meta.stages) && meta.stages.length > 0 ? (
        <div className="pt-1">
          <div className="text-slate-500">loadScheduleForDate stages</div>
          <div className="space-y-0.5">
            {meta.stages.slice(0, 12).map((s: any) => (
              <div key={`inner-${s.name}`}>
                <span className="text-slate-400">{s.name}:</span> {Math.round(s.ms ?? 0)}ms
              </div>
            ))}
            {meta.stages.length > 12 ? <div className="text-slate-500">…and {meta.stages.length - 12} more</div> : null}
          </div>
        </div>
      ) : null}

      {meta.rpcServerMs ? (
        <div className="pt-1">
          <div className="text-slate-500">rpc server breakdown</div>
          <div className="space-y-0.5">
            {Object.entries(meta.rpcServerMs as any).map(([k, v]) => (
              <div key={`rpcms-${k}`}>
                <span className="text-slate-400">{k}:</span> {Math.round((v as any) ?? 0)}ms
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <RenderPerfBlock perfTick={props.perfTick} perfStats={props.perfStats} />
    </div>
  )
}

function LoadNavFallback(props: { navToScheduleTiming: NavTiming | null }) {
  const nav = props.navToScheduleTiming ?? undefined
  if (!nav || typeof nav.startMs !== 'number') return null
  const fmtDelta = (from: number, to: number) => `${Math.max(0, Math.round(to - from))}ms`
  return (
    <div className="pt-1 text-[11px] text-slate-400 space-y-0.5">
      <div className="text-slate-500">nav → schedule</div>
      <div>
        <span className="text-slate-400">start→loading.tsx:</span>{' '}
        {nav.loadingShownMs != null ? fmtDelta(nav.startMs, nav.loadingShownMs) : 'n/a'}
      </div>
      <div>
        <span className="text-slate-400">start→mount:</span> {nav.mountedMs != null ? fmtDelta(nav.startMs, nav.mountedMs) : 'n/a'}
      </div>
      <div>
        <span className="text-slate-400">start→gridReady:</span> {fmtDelta(nav.startMs, nav.gridReadyMs)}
      </div>
    </div>
  )
}

function RenderPerfBlock(props: { perfTick: number; perfStats: Record<string, PerfStat | undefined> }) {
  // Force this subtree to re-render when new perf stats come in.
  void props.perfTick

  const ids = [
    'TeamGrid',
    'StaffPool',
    'PCADedicatedTable',
    'AllocationNotesBoard',
    'SplitPane',
    'SplitMainPane',
    'SplitReferencePane',
    'ReferenceBlocks',
  ]
  const rows = ids
    .map((id) => ({ id, s: props.perfStats[id] }))
    .filter((r) => !!r.s && (r.s as any).commits > 0) as Array<{ id: string; s: PerfStat }>

  if (rows.length === 0) return null

  return (
    <div className="pt-1">
      <div className="text-slate-500">render perf</div>
      <div className="space-y-0.5">
        {rows.map(({ id, s }) => {
          const avg = s.commits > 0 ? s.totalActualMs / s.commits : 0
          return (
            <div key={`perf-${id}`}>
              <span className="text-slate-400">{id}:</span> last {Math.round(s.lastActualMs)}ms ({s.lastPhase}), max{' '}
              {Math.round(s.maxActualMs)}ms, avg {Math.round(avg)}ms, commits {s.commits}
            </div>
          )
        })}
      </div>
    </div>
  )
}

