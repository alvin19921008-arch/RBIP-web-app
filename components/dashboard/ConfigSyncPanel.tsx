'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Info, CloudUpload, CloudDownload } from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast-provider'
import { useRouter } from 'next/navigation'
import { CalendarGrid } from '@/components/ui/calendar-grid'
import { formatDateForInput, parseDateFromInput } from '@/lib/features/schedule/date'
import { formatDateDisplay } from '@/lib/utils/dateHelpers'
import { useAccessControl } from '@/lib/access/useAccessControl'
import type { BaselineSnapshot, BaselineSnapshotStored, GlobalHeadAtCreation } from '@/types/schedule'
import { unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'
import { diffBaselineSnapshot } from '@/lib/features/schedule/snapshotDiff'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'
import type { TeamSettingsMergeRow } from '@/lib/utils/teamMerge'
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

function normalizeDateKey(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  if (!raw) return null
  // Accept exact date keys and timestamp-like strings by extracting leading YYYY-MM-DD.
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

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

function formatDisplayConfigId(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '#00000'
  return `#${String(Math.trunc(n)).padStart(5, '0')}`
}

function getThresholdFromHead(head: any): { value: number; unit: ThresholdUnit } {
  const raw = head?.drift_notification_threshold
  const unit: ThresholdUnit = raw?.unit === 'weeks' || raw?.unit === 'months' ? raw.unit : 'days'
  const value = typeof raw?.value === 'number' ? raw.value : Number(raw?.value ?? 30)
  return { value: Number.isFinite(value) && value >= 0 ? value : 30, unit }
}

function summarizeActiveGlobalMerges(rows: TeamSettingsMergeRow[]): Array<{ from: string; to: string; label?: string }> {
  const byTeam = new Map<string, TeamSettingsMergeRow>()
  rows.forEach((row) => {
    if (row?.team) byTeam.set(row.team, row)
  })
  const out: Array<{ from: string; to: string; label?: string }> = []
  rows.forEach((row) => {
    const from = row?.team
    const to = row?.merged_into ?? null
    if (!from || !to || to === from) return
    const label = (byTeam.get(to)?.merge_label_override || '').trim() || undefined
    out.push({ from, to, label })
  })
  out.sort((a, b) => `${a.to}:${a.from}`.localeCompare(`${b.to}:${b.from}`))
  return out
}

export function ConfigSyncPanel() {
  const supabase = createClientComponentClient()
  const toast = useToast()
  const router = useRouter()
  const access = useAccessControl()
  const canShowInternalVersion =
    (access.role === 'admin' || access.role === 'developer') &&
    access.can('dashboard.sync-publish.show-internal-config-version')

  const [loading, setLoading] = useState(false)
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [snapshotDatePickerOpen, setSnapshotDatePickerOpen] = useState(false)

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

  const [pendingPublish, setPendingPublish] = useState(false)
  const [pendingPull, setPendingPull] = useState(false)
  const [backupNote, setBackupNote] = useState('')
  const [backups, setBackups] = useState<any[]>([])
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null)
  const [teamSettingsRows, setTeamSettingsRows] = useState<TeamSettingsMergeRow[]>([])

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
          supabase
            .from('daily_schedules')
            .select('date, baseline_snapshot')
            .order('date', { ascending: false })
            .limit(240),
        ])
        if (schedErr) throw schedErr
        const dates = (schedRows || [])
          .filter((r: any) => (r?.baseline_snapshot ?? null) != null)
          .map((r: any) => normalizeDateKey(r?.date))
          .filter((d): d is string => Boolean(d))
        const uniqueDates = Array.from(new Set(dates))
        if (!cancelled) {
          setAvailableDates(uniqueDates)
          setSelectedDate((prev) => (prev && uniqueDates.includes(prev) ? prev : (uniqueDates[0] || '')))
        }

        await reloadGlobalHead()
        await reloadBackups()
        const teamSettingsRes = await supabase
          .from('team_settings')
          .select('team,display_name,merged_into,merge_label_override,merged_pca_preferences_override')
          .order('team')
        if (teamSettingsRes.error) throw teamSettingsRes.error
        if (!cancelled) setTeamSettingsRows((teamSettingsRes.data || []) as TeamSettingsMergeRow[])
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
    const activeMerges = summarizeActiveGlobalMerges(teamSettingsRows)
    const includesTeamConfig = cats.includes('teamConfig')
    let confirmMessage = `Pull Global into snapshot ${selectedDate} for selected categories? This overwrites the snapshot slices.`
    if (includesTeamConfig && activeMerges.length > 0) {
      const mergeLines = activeMerges
        .map((m) => `- ${m.from} -> ${m.to}${m.label ? ` (${m.label})` : ''}`)
        .join('\n')
      confirmMessage = [
        `WARNING: Global Team Merge is active.`,
        '',
        `Pulling Team Configuration into this snapshot will write current merge mapping into that date.`,
        `This can alter historical view/allocations for that schedule date if it previously had no teamMerge snapshot.`,
        '',
        `Active global merges:`,
        mergeLines,
        '',
        `Proceed with pull for ${selectedDate}?`,
      ].join('\n')
    }
    if (!confirm(confirmMessage)) return
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
  const availableSnapshotDateSet = useMemo(() => new Set(availableDates), [availableDates])
  const activeGlobalMerges = useMemo(() => summarizeActiveGlobalMerges(teamSettingsRows), [teamSettingsRows])
  const hasSnapshotDrift = !!categorySummary && Object.values(categorySummary.changed).some(Boolean)
  const syncStatusBadge = !selectedDate
    ? null
    : diffError
      ? { label: 'Status unavailable', className: 'bg-destructive/10 text-destructive border-destructive/20' }
      : !diff
        ? { label: 'Checking sync...', className: 'bg-muted text-muted-foreground border-border' }
        : hasSnapshotDrift
          ? { label: 'Snapshot behind', className: 'bg-amber-100 text-amber-950 border-amber-200' }
          : { label: 'In sync', className: 'bg-emerald-100 text-emerald-900 border-emerald-200' }

  return (
    <div className="pt-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Published configuration (Global)</h3>
              <div className="text-sm text-muted-foreground">
                Global config:{' '}
                <span className="font-medium text-foreground">{globalUpdatedAt}</span>
                {canShowInternalVersion && typeof globalHead?.global_version === 'number' ? (
                  <Tooltip
                    side="top"
                    content={
                      <>
                        Display ID: <span className="font-medium">{formatDisplayConfigId(globalHead.global_version)}</span>
                        <br />
                        Internal Config ID: <span className="font-medium">v{globalHead.global_version}</span>
                      </>
                    }
                  >
                    <span className="ml-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 cursor-help">
                      {formatDisplayConfigId(globalHead.global_version)}
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Source snapshot</h3>
                  {syncStatusBadge ? (
                    <Badge variant="outline" className={`text-[11px] ${syncStatusBadge.className}`}>
                      {syncStatusBadge.label}
                    </Badge>
                  ) : null}
                </div>
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
                <Popover open={snapshotDatePickerOpen} onOpenChange={setSnapshotDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="snapshotDate"
                      variant="outline"
                      size="sm"
                      className="min-w-[170px] justify-between font-normal"
                      aria-label="Choose snapshot date"
                      disabled={availableDates.length === 0}
                    >
                      <span>
                        {selectedDate ? formatDateDisplay(selectedDate) : 'No snapshots'}
                      </span>
                      <Calendar className="ml-2 h-4 w-4 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="z-[70] w-auto rounded-lg border border-border bg-background p-0 shadow-lg"
                    align="start"
                    sideOffset={8}
                  >
                    <CalendarGrid
                      selectedDate={
                        selectedDate
                          ? parseDateFromInput(selectedDate)
                          : (availableDates[0] ? parseDateFromInput(availableDates[0]) : new Date())
                      }
                      onDateSelect={(date) => {
                        setSelectedDate(formatDateForInput(date))
                        setSnapshotDatePickerOpen(false)
                      }}
                      datesWithData={availableSnapshotDateSet}
                      emphasizeDatesWithData
                      isDateDisabled={(date) => {
                        const key = formatDateForInput(date)
                        return !availableSnapshotDateSet.has(key)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="text-sm text-muted-foreground">
                Snapshot created: <span className="font-medium text-foreground">{snapshotCreatedAt}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {snapshotHead ? (
                  <>
                    Based on Global config:{' '}
                    <span className="font-medium text-foreground">{snapshotGlobalUpdatedAt}</span>
                    {canShowInternalVersion && typeof snapshotHead.global_version === 'number' ? (
                      <Tooltip
                        side="top"
                        content={
                          <>
                            Display ID at snapshot creation:{' '}
                            <span className="font-medium">{formatDisplayConfigId(snapshotHead.global_version)}</span>
                            <br />
                            Internal Config ID at snapshot creation:{' '}
                            <span className="font-medium">v{snapshotHead.global_version}</span>
                          </>
                        }
                      >
                        <span className="ml-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 cursor-help">
                          {formatDisplayConfigId(snapshotHead.global_version)}
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

            {activeGlobalMerges.length > 0 ? (
              <div className="w-full bg-amber-50/40 border border-amber-100/60 rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <div>
                    <div className="font-medium">Global team merge detected.</div>
                    <div className="mt-0.5">
                      Pulling with Team Configuration selected will copy the active merge mapping into this snapshot date.{' '}
                      <span className="text-amber-700">
                        {activeGlobalMerges
                          .map((m) => `${m.from} → ${m.to}${m.label ? ` (${m.label})` : ''}`)
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

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

            {(() => {
              const dateLabel = selectedDate ? formatDateDisplay(selectedDate) : null
              return (
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {/* Publish */}
                  {pendingPublish ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Publish{dateLabel ? <> (<span className="font-medium text-foreground">{dateLabel}</span>)</> : ''} snapshot → Global?
                      </span>
                      <Button size="sm" className="h-7 text-xs" onClick={() => { setPendingPublish(false); void handlePublish() }}>
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPendingPublish(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => setPendingPublish(true)}>
                      <CloudUpload className="mr-2 h-4 w-4 flex-shrink-0" />
                      Publish
                      {dateLabel && <span className="ml-1 text-[11px] font-normal opacity-80">({dateLabel})</span>}
                      <span className="ml-1">snapshot → Global</span>
                    </Button>
                  )}

                  {/* Pull */}
                  {pendingPull ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Pull Global →{dateLabel ? <> (<span className="font-medium text-foreground">{dateLabel}</span>)</> : ''} snapshot?
                      </span>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setPendingPull(false); void handlePull() }}>
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPendingPull(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Tooltip content="Secondary action. Overwrites selected parts of the snapshot with current Global config.">
                      <Button variant="outline" onClick={() => setPendingPull(true)}>
                        <CloudDownload className="mr-2 h-4 w-4 flex-shrink-0" />
                        Pull Global →
                        {dateLabel && <span className="ml-1 text-[11px] font-normal opacity-80">({dateLabel})</span>}
                        <span className="ml-1">snapshot</span>
                      </Button>
                    </Tooltip>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="space-y-3 pt-4 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Backups
            </h4>

            <div className="flex flex-wrap items-center gap-2 bg-muted/30 rounded-md p-3">
              <Input
                placeholder="Optional note for backup…"
                value={backupNote}
                onChange={(e) => setBackupNote(e.target.value)}
                className="min-w-[240px] flex-1"
              />
              <Button variant="outline" onClick={handleCreateBackup}>
                Create backup now
              </Button>
            </div>

            {backups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No backups found.</p>
            ) : (
              <div className="divide-y">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{b.note || '(no note)'}</div>
                      <div className="text-xs text-muted-foreground">{formatFriendlyDateTime(b.created_at)}</div>
                    </div>
                    {pendingRestoreId === b.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            void handleRestoreBackup(String(b.id))
                            setPendingRestoreId(null)
                          }}
                        >
                          Confirm?
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setPendingRestoreId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingRestoreId(String(b.id))}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
    </div>
  )
}

