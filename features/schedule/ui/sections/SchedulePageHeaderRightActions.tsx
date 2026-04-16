'use client'

import { CircleHelp, Copy } from 'lucide-react'
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react'

import { ScheduleSaveButton } from '@/features/schedule/ui/layout/ScheduleSaveButton'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { FeatureId } from '@/lib/access/types'
import type { TimingReport } from '@/lib/utils/timing'

/** Shared shell for diagnostics / save developer tooltips (theme-aware popover surface). */
const SCHEDULE_HEADER_DEV_TOOLTIP_PANEL_CLASS =
  'w-56 bg-popover text-popover-foreground border border-border shadow-lg rounded-md'

export type ScheduleCopyWizardLaunchConfig = {
  sourceDate: Date
  targetDate: Date | null
  flowType: 'next-working-day' | 'last-working-day' | 'specific-date'
  direction: 'to' | 'from'
}

type AccessGate = { can: (featureId: FeatureId) => boolean }

export type SchedulePageHeaderRightActionsProps = {
  userRole: 'developer' | 'admin' | 'user'
  isViewingMode: boolean
  saving: boolean
  copying: boolean
  access: AccessGate
  onOpenHelp: () => void
  onOpenLeaveSim: () => void
  snapshotHealthReport: {
    status: string
    issues?: string[]
    snapshotStaffCount: number
    missingReferencedStaffCount: number
    schemaVersion?: number | string
    source?: string
  } | null
  lastCopyTiming: TimingReport | null
  prefetchScheduleCopyWizard: () => Promise<unknown>
  loadDatesWithData: () => void | Promise<void>
  copyMenuOpen: boolean
  setCopyMenuOpen: Dispatch<SetStateAction<boolean>>
  datesWithDataLoadedAtRef: MutableRefObject<number | null>
  datesWithDataLoading: boolean
  nextWorkingLabel: string
  nextWorkingEnabled: boolean
  nextWorkingSourceDate: Date | null
  nextWorkingTargetDate: Date | null
  nextWorkingDirection: 'to' | 'from'
  setCopyWizardConfig: Dispatch<SetStateAction<ScheduleCopyWizardLaunchConfig | null>>
  setCopyWizardOpen: Dispatch<SetStateAction<boolean>>
  selectedDate: Date
  specificEnabled: boolean
  specificDirection: 'to' | 'from'
  specificLabel: string
  exportAction: ReactNode
  lastSaveTiming: TimingReport | null
  hasUnsavedChanges: boolean
  onSaveSchedule: () => void | Promise<void>
}

/** Schedule toolbar: Help, Leave Sim, Copy (+ diagnostics), Export, Save (Phase 2d). */
export function SchedulePageHeaderRightActions({
  userRole,
  isViewingMode,
  saving,
  copying,
  access,
  onOpenHelp,
  onOpenLeaveSim,
  snapshotHealthReport,
  lastCopyTiming,
  prefetchScheduleCopyWizard,
  loadDatesWithData,
  copyMenuOpen,
  setCopyMenuOpen,
  datesWithDataLoadedAtRef,
  datesWithDataLoading,
  nextWorkingLabel,
  nextWorkingEnabled,
  nextWorkingSourceDate,
  nextWorkingTargetDate,
  nextWorkingDirection,
  setCopyWizardConfig,
  setCopyWizardOpen,
  selectedDate,
  specificEnabled,
  specificDirection,
  specificLabel,
  exportAction,
  lastSaveTiming,
  hasUnsavedChanges,
  onSaveSchedule,
}: SchedulePageHeaderRightActionsProps) {
  return (
    <>
      <Button data-tour="schedule-help" variant="outline" type="button" onClick={onOpenHelp} disabled={saving || copying}>
        <CircleHelp className="h-4 w-4 mr-1.5" />
        Help
      </Button>
      {isViewingMode ? null : (
        <>
          {userRole === 'developer' ? (
            <Tooltip side="bottom" content="Developer-only: seeded leave simulation harness (generate/apply/replay + invariants).">
              <Button variant="outline" type="button" onClick={onOpenLeaveSim} disabled={saving || copying}>
                Leave Sim
              </Button>
            </Tooltip>
          ) : null}

          <div data-tour="schedule-copy" className="relative">
            {access.can('schedule.diagnostics.copy') || access.can('schedule.diagnostics.snapshot-health') ? (
              <Tooltip
                side="bottom"
                className="p-0 bg-transparent border-0 shadow-none whitespace-normal"
                content={
                  <div className={SCHEDULE_HEADER_DEV_TOOLTIP_PANEL_CLASS}>
                    <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Diagnostics</div>

                    {access.can('schedule.diagnostics.snapshot-health') ? (
                      snapshotHealthReport ? (
                        <div className="px-3 pt-2 text-xs text-foreground space-y-1">
                          <div>
                            <span className="text-muted-foreground">snapshotHealth:</span> {snapshotHealthReport.status}
                          </div>
                          {snapshotHealthReport.issues && snapshotHealthReport.issues.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">issues:</span> {snapshotHealthReport.issues.join(', ')}
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">staff:</span> {snapshotHealthReport.snapshotStaffCount} (missing
                            referenced: {snapshotHealthReport.missingReferencedStaffCount})
                          </div>
                          {(snapshotHealthReport.schemaVersion || snapshotHealthReport.source) && (
                            <div>
                              <span className="text-muted-foreground">meta:</span>{' '}
                              {snapshotHealthReport.schemaVersion ? `v${snapshotHealthReport.schemaVersion}` : 'v?'}
                              {snapshotHealthReport.source ? `, ${snapshotHealthReport.source}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="px-3 pt-2 text-xs text-muted-foreground">snapshotHealth: (none)</div>
                      )
                    ) : null}

                    {access.can('schedule.diagnostics.copy') ? (
                      <>
                        <div className="border-t border-border mt-2 px-3 py-2 text-[11px] text-muted-foreground">Copy timing</div>
                        <div className="px-3 pb-3 text-xs text-foreground space-y-1">
                          {lastCopyTiming ? (
                            <>
                              <div>
                                <span className="text-muted-foreground">client total:</span> {Math.round(lastCopyTiming.totalMs)}ms
                              </div>
                              {lastCopyTiming.stages.length > 0 && (
                                <div className="text-[11px] text-muted-foreground space-y-0.5">
                                  {lastCopyTiming.stages.map((s) => (
                                    <div key={`copy-client-${s.name}`}>
                                      <span className="text-muted-foreground">{s.name}:</span> {Math.round(s.ms)}ms
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(() => {
                                const server = (lastCopyTiming.meta as any)?.server
                                if (!server) return null
                                return (
                                  <div className="pt-1">
                                    <div>
                                      <span className="text-muted-foreground">server total:</span> {Math.round(server.totalMs ?? 0)}ms{' '}
                                      {typeof server?.meta?.rpcUsed === 'boolean'
                                        ? `(rpc:${server.meta.rpcUsed ? 'yes' : 'no'})`
                                        : null}
                                      {typeof server?.meta?.baselineBytes === 'number' ? (
                                        <span className="text-muted-foreground"> baseline:{Math.round(server.meta.baselineBytes / 1024)}KB</span>
                                      ) : null}
                                      {typeof server?.meta?.specialProgramsBytes === 'number' ? (
                                        <span className="text-muted-foreground"> sp:{Math.round(server.meta.specialProgramsBytes / 1024)}KB</span>
                                      ) : null}
                                      {server?.meta?.rpcError ? (
                                        <span className="text-amber-700 dark:text-amber-400">
                                          {' '}
                                          rpcError:{String((server.meta.rpcError as any)?.message || 'unknown')}
                                        </span>
                                      ) : null}
                                    </div>
                                    {Array.isArray(server.stages) && server.stages.length > 0 && (
                                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                                        {server.stages.map((s: any) => (
                                          <div key={`copy-server-${s.name}`}>
                                            <span className="text-muted-foreground">{s.name}:</span> {Math.round(s.ms ?? 0)}ms
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </>
                          ) : (
                            <div className="text-muted-foreground">No copy timing captured yet.</div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                }
              >
                <Button
                  variant="outline"
                  onClick={() => {
                    const next = !copyMenuOpen
                    setCopyMenuOpen(next)
                    if (next) void loadDatesWithData()
                  }}
                  onMouseEnter={() => {
                    prefetchScheduleCopyWizard().catch(() => {})
                  }}
                  onFocus={() => {
                    prefetchScheduleCopyWizard().catch(() => {})
                  }}
                  type="button"
                  className="flex items-center"
                  disabled={copying || saving}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copying ? 'Copying...' : 'Copy'}
                </Button>
              </Tooltip>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  const next = !copyMenuOpen
                  setCopyMenuOpen(next)
                  if (next) void loadDatesWithData()
                }}
                onMouseEnter={() => {
                  prefetchScheduleCopyWizard().catch(() => {})
                }}
                onFocus={() => {
                  prefetchScheduleCopyWizard().catch(() => {})
                }}
                type="button"
                className="flex items-center"
                disabled={copying || saving}
              >
                <Copy className="h-4 w-4 mr-2" />
                {copying ? 'Copying...' : 'Copy'}
              </Button>
            )}
            {copyMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-background border border-border rounded-md shadow-lg z-50">
                {!datesWithDataLoadedAtRef.current && datesWithDataLoading ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Loading schedule dates…</div>
                ) : (
                  <div className="p-1">
                    <button
                      type="button"
                      className="w-full flex items-center px-3 py-2 text-xs text-left hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!nextWorkingEnabled}
                      onClick={() => {
                        setCopyMenuOpen(false)
                        if (!nextWorkingEnabled || !nextWorkingSourceDate || !nextWorkingTargetDate) {
                          return
                        }
                        setCopyWizardConfig({
                          sourceDate: nextWorkingSourceDate,
                          targetDate: nextWorkingTargetDate,
                          flowType: nextWorkingDirection === 'from' ? 'last-working-day' : 'next-working-day',
                          direction: nextWorkingDirection,
                        })
                        setCopyWizardOpen(true)
                      }}
                    >
                      {nextWorkingLabel}
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center px-3 py-2 text-xs text-left hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!specificEnabled}
                      onClick={() => {
                        setCopyMenuOpen(false)
                        setCopyWizardConfig({
                          sourceDate: selectedDate,
                          targetDate: null,
                          flowType: 'specific-date',
                          direction: specificDirection,
                        })
                        setCopyWizardOpen(true)
                      }}
                    >
                      {specificLabel}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {exportAction}
          {access.can('schedule.diagnostics.save') ? (
            <Tooltip
              side="bottom"
              className="p-0 bg-transparent border-0 shadow-none whitespace-normal"
              content={
                <div className={SCHEDULE_HEADER_DEV_TOOLTIP_PANEL_CLASS}>
                  <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Save timing</div>
                  <div className="px-3 py-2 text-xs text-foreground space-y-1">
                    {lastSaveTiming ? (
                      <>
                        <div>
                          <span className="text-muted-foreground">total:</span> {Math.round(lastSaveTiming.totalMs)}ms
                        </div>
                        {(() => {
                          const meta = lastSaveTiming.meta as any
                          if (!meta) return null
                          return (
                            <>
                              <div className="text-[11px] text-muted-foreground">
                                rpc:{meta.rpcUsed ? 'yes' : 'no'}
                                {typeof meta.rpcAttempted === 'boolean' ? `, attempted:${meta.rpcAttempted ? 'yes' : 'no'}` : null}
                                {typeof meta.rpcProxyUsed === 'boolean' ? `, proxy:${meta.rpcProxyUsed ? 'yes' : 'no'}` : null}
                                {meta.rpcFallbackReason ? `, fallback:${meta.rpcFallbackReason}` : null}
                                {meta.rpcErrorCode ? `, rpcErr:${meta.rpcErrorCode}` : null}
                                {typeof meta.snapshotWritten === 'boolean' ? `, snapshotWrite:${meta.snapshotWritten ? 'yes' : 'no'}` : null}
                                {typeof meta.snapshotBytes === 'number' ? `, baseline:${Math.round(meta.snapshotBytes / 1024)}KB` : null}
                                {typeof meta.specialProgramsBytes === 'number' ? `, sp:${Math.round(meta.specialProgramsBytes / 1024)}KB` : null}
                                {meta.rowCounts
                                  ? `, rows:t${meta.rowCounts.therapist ?? 0}/p${meta.rowCounts.pca ?? 0}/b${meta.rowCounts.bed ?? 0}/c${meta.rowCounts.calc ?? 0}`
                                  : null}
                                {typeof meta.payloadBytes?.total === 'number' ? `, payload:${Math.round(meta.payloadBytes.total / 1024)}KB` : null}
                                {typeof meta.rpcServerDiagnostics?.timings?.total_ms === 'number'
                                  ? `, rpcMs:${Math.round(meta.rpcServerDiagnostics.timings.total_ms)}`
                                  : null}
                              </div>
                              {typeof meta.rpcProxyError === 'string' && meta.rpcProxyError.length > 0 ? (
                                <div className="text-[10px] text-amber-700 dark:text-amber-400 truncate" title={meta.rpcProxyError}>
                                  proxyMsg: {meta.rpcProxyError}
                                </div>
                              ) : null}
                              {typeof meta.rpcErrorMessage === 'string' && meta.rpcErrorMessage.length > 0 ? (
                                <div className="text-[10px] text-amber-700 dark:text-amber-400 truncate" title={meta.rpcErrorMessage}>
                                  rpcMsg: {meta.rpcErrorMessage}
                                </div>
                              ) : null}
                              {meta.rpcServerDiagnostics?.timings ? (
                                <div className="text-[10px] text-muted-foreground truncate">
                                  rpcServer:
                                  {' '}th {Math.round(meta.rpcServerDiagnostics.timings.therapist_ms ?? 0)}ms
                                  {' '}| pca {Math.round(meta.rpcServerDiagnostics.timings.pca_ms ?? 0)}ms
                                  {' '}| bed {Math.round(meta.rpcServerDiagnostics.timings.bed_ms ?? 0)}ms
                                  {' '}| calc {Math.round(meta.rpcServerDiagnostics.timings.calc_ms ?? 0)}ms
                                  {' '}| meta {Math.round(meta.rpcServerDiagnostics.timings.metadata_ms ?? 0)}ms
                                </div>
                              ) : null}
                            </>
                          )
                        })()}
                        {lastSaveTiming.stages.length > 0 && (
                          <div className="pt-1 text-[11px] text-muted-foreground space-y-0.5">
                            {lastSaveTiming.stages.map((s) => (
                              <div key={`save-${s.name}`}>
                                <span className="text-muted-foreground">{s.name}:</span> {Math.round(s.ms)}ms
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-muted-foreground">No save timing captured yet.</div>
                    )}
                  </div>
                </div>
              }
            >
              <ScheduleSaveButton saving={saving} hasUnsavedChanges={hasUnsavedChanges} onSave={onSaveSchedule} />
            </Tooltip>
          ) : (
            <ScheduleSaveButton saving={saving} hasUnsavedChanges={hasUnsavedChanges} onSave={onSaveSchedule} />
          )}
        </>
      )}
    </>
  )
}
