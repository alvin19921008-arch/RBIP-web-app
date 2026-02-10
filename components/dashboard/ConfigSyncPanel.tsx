'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast-provider'
import { useRouter } from 'next/navigation'
import type { BaselineSnapshot, BaselineSnapshotStored, GlobalHeadAtCreation } from '@/types/schedule'
import { unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import { diffBaselineSnapshot } from '@/lib/features/schedule/snapshotDiff'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'
import {
  fetchSnapshotDiffLiveInputs,
  SNAPSHOT_DIFF_LIVE_INPUTS_DEFAULT_TTL_MS,
} from '@/lib/features/schedule/snapshotDiffLiveInputs'

type CategoryKey =
  | 'staffProfile'
  | 'teamConfig'
  | 'wardConfig'
  | 'specialPrograms'
  | 'sptAllocations'
  | 'pcaPreferences'

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  staffProfile: 'Staff Profile',
  teamConfig: 'Team Configuration',
  wardConfig: 'Ward Config and Bed Stat',
  specialPrograms: 'Special Programs',
  sptAllocations: 'SPT Allocations',
  pcaPreferences: 'PCA Preferences',
}

type ThresholdUnit = 'days' | 'weeks' | 'months'
type ThresholdMode = 'off' | 'always' | 'custom'

function getThresholdMode(value: number, unit: ThresholdUnit): ThresholdMode {
  if (Number.isFinite(value) && value === 0) return 'always'
  // We treat very large day thresholds as “off” (matches Schedule logic).
  if (unit === 'days' && Number.isFinite(value) && value >= 3650) return 'off'
  return 'custom'
}

function formatFriendlyDateTime(value: unknown): string {
  const raw = typeof value === 'string' ? value : ''
  if (!raw) return '--'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return d.toLocaleString()
  }
}

function getThresholdFromHead(head: any): { value: number; unit: ThresholdUnit } {
  const raw = head?.drift_notification_threshold
  const unit: ThresholdUnit = raw?.unit === 'weeks' || raw?.unit === 'months' ? raw.unit : 'days'
  const value = typeof raw?.value === 'number' ? raw.value : Number(raw?.value ?? 30)
  return { value: Number.isFinite(value) && value >= 0 ? value : 30, unit }
}

export function ConfigSyncPanel() {
  const supabase = createClientComponentClient()
  const toast = useToast()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')

  const [globalHead, setGlobalHead] = useState<any>(null)

  const [snapshotEnvelope, setSnapshotEnvelope] = useState<any>(null)
  const [snapshotData, setSnapshotData] = useState<BaselineSnapshot | null>(null)
  const [diff, setDiff] = useState<SnapshotDiffResult | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [snapshotReloadToken, setSnapshotReloadToken] = useState(0)

  const [selectedCategories, setSelectedCategories] = useState<Record<CategoryKey, boolean>>({
    staffProfile: true,
    teamConfig: true,
    wardConfig: true,
    specialPrograms: true,
    sptAllocations: true,
    pcaPreferences: true,
  })

  // Draft values for Custom mode (so Off/Always selections don't overwrite the user's custom draft).
  const [customThresholdValue, setCustomThresholdValue] = useState<number>(30)
  const [customThresholdUnit, setCustomThresholdUnit] = useState<ThresholdUnit>('days')
  const [thresholdUiMode, setThresholdUiMode] = useState<ThresholdMode>('custom')

  const [backupNote, setBackupNote] = useState('')
  const [backups, setBackups] = useState<any[]>([])

  const reloadGlobalHead = async () => {
    const res = await supabase.rpc('get_config_global_head_v1')
    if (res.error) throw res.error
    setGlobalHead(res.data)
    const { value, unit } = getThresholdFromHead(res.data)
    const mode = getThresholdMode(value, unit)
    setThresholdUiMode(mode)
    if (mode === 'custom') {
      setCustomThresholdValue(value)
      setCustomThresholdUnit(unit)
    }
  }

  const reloadBackups = async () => {
    const { data, error } = await supabase
      .from('config_global_backups')
      .select('id, created_at, created_by, note')
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error
    setBackups(data || [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [{ data: schedRows, error: schedErr }] = await Promise.all([
          supabase.from('daily_schedules').select('date').order('date', { ascending: false }).limit(120),
        ])
        if (schedErr) throw schedErr
        const dates = (schedRows || [])
          .map((r: any) => String(r.date ?? ''))
          .filter(Boolean)
        if (!cancelled) {
          setAvailableDates(dates)
          setSelectedDate((prev) => prev || dates[0] || '')
        }

        await reloadGlobalHead()
        await reloadBackups()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) toast.error('Failed to load sync data.', msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const computeDiff = async (baseline: BaselineSnapshot) => {
    const liveInputs = await fetchSnapshotDiffLiveInputs({
      supabase,
      includeTeamSettings: true,
      cacheKey: `config-sync-snapshot-diff:${selectedDate}|reload:${snapshotReloadToken}`,
      ttlMs: SNAPSHOT_DIFF_LIVE_INPUTS_DEFAULT_TTL_MS,
    })

    return diffBaselineSnapshot({
      snapshot: baseline,
      live: liveInputs,
    })
  }

  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false
    ;(async () => {
      setDiffError(null)
      setDiff(null)
      setSnapshotEnvelope(null)
      setSnapshotData(null)
      try {
        const { data: row, error } = await supabase
          .from('daily_schedules')
          .select('baseline_snapshot')
          .eq('date', selectedDate)
          .maybeSingle()
        if (error) throw error

        const stored = (row as any)?.baseline_snapshot as BaselineSnapshotStored | null | undefined
        const { envelope, data } = unwrapBaselineSnapshotStored(stored)

        if (cancelled) return
        setSnapshotEnvelope(envelope as any)
        setSnapshotData(data)

        const d = await computeDiff(data)
        if (cancelled) return
        setDiff(d)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setDiffError(msg)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, snapshotReloadToken])

  const categorySummary = useMemo(() => {
    if (!diff) return null

    const staffProfileFieldCount = diff.staff.changed.reduce((sum, row) => {
      const nonTeam = row.changes.filter((c) => c.field !== 'team')
      return sum + nonTeam.length
    }, 0)
    const teamFieldCountFromStaff = diff.staff.changed.reduce((sum, row) => {
      const onlyTeam = row.changes.filter((c) => c.field === 'team')
      return sum + onlyTeam.length
    }, 0)

    const wardConfigFieldCount = diff.wards.changed.reduce((sum, w) => {
      const wc = w.changes.filter((c) => c.field === 'name' || c.field === 'total_beds')
      return sum + wc.length
    }, 0)
    const teamFieldCountFromWards = diff.wards.changed.reduce((sum, w) => {
      const tc = w.changes.filter(
        (c) => c.field === 'team_assignments' || c.field === 'team_assignment_portions'
      )
      return sum + tc.length
    }, 0)

    const staffProfileChanged =
      diff.staff.added.length + diff.staff.removed.length + staffProfileFieldCount > 0
    const teamConfigChanged = teamFieldCountFromStaff + teamFieldCountFromWards + diff.teamSettings.changed.length > 0
    const wardConfigChanged = diff.wards.added.length + diff.wards.removed.length + wardConfigFieldCount > 0
    const specialProgramsChanged =
      diff.specialPrograms.added.length + diff.specialPrograms.removed.length + diff.specialPrograms.changed.length > 0
    const sptAllocationsChanged =
      diff.sptAllocations.added.length + diff.sptAllocations.removed.length + diff.sptAllocations.changed.length > 0
    const pcaPreferencesChanged = diff.pcaPreferences.changed.length > 0

    const counts: Record<CategoryKey, number> = {
      staffProfile: diff.staff.added.length + diff.staff.removed.length + staffProfileFieldCount,
      teamConfig: teamFieldCountFromStaff + teamFieldCountFromWards + diff.teamSettings.changed.length,
      wardConfig: diff.wards.added.length + diff.wards.removed.length + wardConfigFieldCount,
      specialPrograms:
        diff.specialPrograms.added.length + diff.specialPrograms.removed.length + diff.specialPrograms.changed.length,
      sptAllocations:
        diff.sptAllocations.added.length + diff.sptAllocations.removed.length + diff.sptAllocations.changed.length,
      pcaPreferences: diff.pcaPreferences.changed.length,
    }

    const changed: Record<CategoryKey, boolean> = {
      staffProfile: staffProfileChanged,
      teamConfig: teamConfigChanged,
      wardConfig: wardConfigChanged,
      specialPrograms: specialProgramsChanged,
      sptAllocations: sptAllocationsChanged,
      pcaPreferences: pcaPreferencesChanged,
    }

    return { changed, counts }
  }, [diff])

  const selectedCategoryList = () =>
    (Object.keys(selectedCategories) as CategoryKey[]).filter((k) => selectedCategories[k])

  const handleSaveThreshold = async (value: number, unit: ThresholdUnit) => {
    try {
      const res = await supabase.rpc('set_drift_notification_threshold_v1', { p_value: value, p_unit: unit })
      if (res.error) throw res.error
      setGlobalHead(res.data)
      const { value: nextValue, unit: nextUnit } = getThresholdFromHead(res.data)
      const mode = getThresholdMode(nextValue, nextUnit)
      setThresholdUiMode(mode)
      if (mode === 'custom') {
        setCustomThresholdValue(nextValue)
        setCustomThresholdUnit(nextUnit)
      }
      toast.success('Drift notification threshold updated.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Failed to update threshold.', msg)
    }
  }

  const handleCreateBackup = async () => {
    try {
      const res = await supabase.rpc('create_config_global_backup_v1', { p_note: backupNote || null })
      if (res.error) throw res.error
      toast.success('Backup created.')
      setBackupNote('')
      await reloadBackups()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Failed to create backup.', msg)
    }
  }

  const handleRestoreBackup = async (backupId: string) => {
    if (!confirm('Restore from this backup? A safety backup will be created first.')) return
    try {
      const res = await supabase.rpc('restore_config_global_backup_v1', {
        p_backup_id: backupId,
        p_note: 'Restore requested from Dashboard Sync / Publish',
      })
      if (res.error) throw res.error
      toast.success('Restore completed.')
      await reloadGlobalHead()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Failed to restore backup.', msg)
    }
  }

  const handlePublish = async () => {
    if (!selectedDate) return
    const cats = selectedCategoryList()
    if (cats.length === 0) {
      toast.warning('Select at least 1 category to publish.')
      return
    }
    if (!confirm(`Publish selected categories to Global from snapshot ${selectedDate}? A backup will be created first.`)) return
    try {
      const res = await supabase.rpc('publish_snapshot_to_global_v1', {
        p_date: selectedDate,
        p_categories: cats,
        p_expected_global_version: typeof globalHead?.global_version === 'number' ? globalHead.global_version : null,
        p_note: 'Publish snapshot → global from Dashboard Sync / Publish',
      })
      if (res.error) throw res.error
      toast.success('Published to Global.')
      await reloadGlobalHead()
      await reloadBackups()
      if (snapshotData) {
        const d = await computeDiff(snapshotData)
        setDiff(d)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Publish failed.', msg)
    }
  }

  const handlePull = async () => {
    if (!selectedDate) return
    const cats = selectedCategoryList()
    if (cats.length === 0) {
      toast.warning('Select at least 1 category to pull.')
      return
    }
    if (!confirm(`Pull Global into snapshot ${selectedDate} for selected categories? This overwrites the snapshot slices.`)) return
    try {
      const res = await supabase.rpc('pull_global_to_snapshot_v1', {
        p_date: selectedDate,
        p_categories: cats,
        p_note: 'Pull global → snapshot from Dashboard Sync / Publish',
      })
      if (res.error) throw res.error
      toast.success('Snapshot refreshed from Global.')
      // Reload snapshot + diff
      setSnapshotReloadToken((n) => n + 1)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Pull failed.', msg)
    }
  }

  const snapshotHead = (snapshotEnvelope as any)?.globalHeadAtCreation as GlobalHeadAtCreation | null | undefined
  const globalUpdatedAt = formatFriendlyDateTime(globalHead?.global_updated_at)
  const snapshotCreatedAt = formatFriendlyDateTime(snapshotEnvelope?.createdAt)
  const snapshotGlobalUpdatedAt = formatFriendlyDateTime(snapshotHead?.global_updated_at)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sync / Publish</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Published configuration (Global)</div>
              <div className="text-sm text-muted-foreground">
                Global config:{' '}
                <span className="font-medium text-foreground">{globalUpdatedAt}</span>
                {typeof globalHead?.global_version === 'number' ? (
                  <Tooltip
                    side="top"
                    content={
                      <>
                        Internal Config ID: <span className="font-medium">v{globalHead.global_version}</span>
                      </>
                    }
                  >
                    <span className="ml-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 cursor-help">
                      v{globalHead.global_version}
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold">Source snapshot</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/history?mode=cleanup')}
                >
                  Clean up schedules
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="snapshotDate" className="text-sm">
                  Date
                </Label>
                <select
                  id="snapshotDate"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-muted-foreground">
                Snapshot created: <span className="font-medium text-foreground">{snapshotCreatedAt}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {snapshotHead ? (
                  <>
                    Based on Global config:{' '}
                    <span className="font-medium text-foreground">{snapshotGlobalUpdatedAt}</span>
                    {typeof snapshotHead.global_version === 'number' ? (
                      <Tooltip
                        side="top"
                        content={
                          <>
                            Internal Config ID at snapshot creation:{' '}
                            <span className="font-medium">v{snapshotHead.global_version}</span>
                          </>
                        }
                      >
                        <span className="ml-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 cursor-help">
                          v{snapshotHead.global_version}
                        </span>
                      </Tooltip>
                    ) : null}
                  </>
                ) : (
                  <>Based on Global config: unknown (older snapshot)</>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            {(() => {
              const { value, unit } = getThresholdFromHead(globalHead)
              const activeMode = getThresholdMode(value, unit)
              const isActive = (m: ThresholdMode) => activeMode === m
              const isUiSelected = (m: ThresholdMode) => thresholdUiMode === m
              const btnBase =
                'px-3 py-1.5 text-sm rounded-md transition-colors select-none'
              const btnInactive = 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              const btnOffActive = 'bg-muted text-foreground'
              const btnAlwaysActive = 'bg-amber-100 text-amber-950'
              const btnCustomActive = 'bg-sky-100 text-sky-950'

              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Schedule setup reminders</div>
                      <div className="text-xs text-muted-foreground">
                        When the published setup changes, older schedules may still use their saved setup. Choose when to show a reminder on the Schedule page.
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="inline-flex items-center gap-1 rounded-md border bg-background p-1">
                        <Tooltip
                          side="bottom"
                          className="whitespace-normal max-w-[280px]"
                          content="Do not show reminders on the Schedule page."
                        >
                          <button
                            type="button"
                            className={[
                              btnBase,
                              isUiSelected('off') ? btnOffActive : btnInactive,
                              isActive('off') ? '' : '',
                            ].join(' ')}
                            onClick={() => {
                              setThresholdUiMode('off')
                              void handleSaveThreshold(3650, 'days')
                            }}
                          >
                            Off
                          </button>
                        </Tooltip>

                        <Tooltip
                          side="bottom"
                          className="whitespace-normal max-w-[280px]"
                          content="Always remind when the saved setup differs from the current published setup."
                        >
                          <button
                            type="button"
                            className={[btnBase, isUiSelected('always') ? btnAlwaysActive : btnInactive].join(' ')}
                            onClick={() => {
                              setThresholdUiMode('always')
                              void handleSaveThreshold(0, 'days')
                            }}
                          >
                            Always
                          </button>
                        </Tooltip>

                        <Tooltip
                          side="bottom"
                          className="whitespace-normal max-w-[280px]"
                          content="Only remind when the schedule is older than a chosen time window."
                        >
                          <button
                            type="button"
                            className={[btnBase, isUiSelected('custom') ? btnCustomActive : btnInactive].join(' ')}
                            onClick={() => setThresholdUiMode('custom')}
                          >
                            Custom
                          </button>
                        </Tooltip>
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        Current: {activeMode === 'off' ? 'Off' : activeMode === 'always' ? 'Always' : `Custom (${value} ${unit})`}
                        {thresholdUiMode !== activeMode ? ' · Not saved' : ''}
                      </div>
                    </div>
                  </div>

                  {thresholdUiMode === 'custom' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-sm">Remind me when older than</Label>
                      <Input
                        className="w-24"
                        type="number"
                        min={0}
                        max={3650}
                        value={Number.isFinite(customThresholdValue) ? customThresholdValue : 30}
                        onChange={(e) => setCustomThresholdValue(Number(e.target.value))}
                      />
                      <select
                        value={customThresholdUnit}
                        onChange={(e) => setCustomThresholdUnit(e.target.value as ThresholdUnit)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="days">days</option>
                        <option value="weeks">weeks</option>
                        <option value="months">months</option>
                      </select>
                      <Button size="sm" onClick={() => handleSaveThreshold(customThresholdValue, customThresholdUnit)}>
                        Save
                      </Button>
                    </div>
                  ) : null}
                </>
              )
            })()}
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Categories</div>
                <div className="text-xs text-muted-foreground">
                  Select categories to publish snapshot → global (default) or pull global → snapshot (secondary).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelectedCategories({
                      staffProfile: true,
                      teamConfig: true,
                      wardConfig: true,
                      specialPrograms: true,
                      sptAllocations: true,
                      pcaPreferences: true,
                    })
                  }
                >
                  Select all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelectedCategories({
                      staffProfile: false,
                      teamConfig: false,
                      wardConfig: false,
                      specialPrograms: false,
                      sptAllocations: false,
                      pcaPreferences: false,
                    })
                  }
                >
                  Clear
                </Button>
              </div>
            </div>

            {diffError ? (
              <div className="text-sm text-destructive">Failed to compute differences: {diffError}</div>
            ) : !diff ? (
              <div className="text-sm text-muted-foreground">{loading ? 'Loading…' : 'Computing differences…'}</div>
            ) : (
              <div className="space-y-2">
                {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((k) => {
                  const checked = selectedCategories[k]
                  const changed = categorySummary?.changed[k] ?? false
                  const count = categorySummary?.counts[k] ?? 0
                  return (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => setSelectedCategories((prev) => ({ ...prev, [k]: v === true }))}
                        />
                        <div className="text-sm truncate">{CATEGORY_LABELS[k]}</div>
                      </div>
                      <div className="text-xs text-muted-foreground flex-shrink-0">
                        {changed ? (
                          <span className="text-amber-700">Different ({count})</span>
                        ) : (
                          <span className="text-emerald-700">In sync</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button onClick={handlePublish}>Publish snapshot → Global</Button>
              <Tooltip content="Secondary action. Overwrites selected parts of the snapshot with current Global config.">
                <Button variant="outline" onClick={handlePull}>
                  Pull Global → snapshot
                </Button>
              </Tooltip>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="text-sm font-semibold">Backups</div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Optional note for backup…"
                value={backupNote}
                onChange={(e) => setBackupNote(e.target.value)}
                className="min-w-[260px] flex-1"
              />
              <Button variant="outline" onClick={handleCreateBackup}>
                Create backup now
              </Button>
            </div>

            {backups.length === 0 ? (
              <div className="text-sm text-muted-foreground">No backups found.</div>
            ) : (
              <div className="space-y-2">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{b.note || '(no note)'}</div>
                      <div className="text-xs text-muted-foreground">{formatFriendlyDateTime(b.created_at)}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleRestoreBackup(String(b.id))}>
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

