'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Team } from '@/types/staff'
import { Ward } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast-provider'
import { 
  ChevronDown, 
  LayoutGrid, 
  BedDouble, 
  Settings2, 
  ArrowRight, 
  Plus,
  Users,
  GitMerge,
  X
} from 'lucide-react'
import type { MergedPcaPreferencesOverride } from '@/lib/utils/teamMerge'
import { getMainTeamDisplayName } from '@/lib/utils/teamMerge'

type TeamSettingsRow = {
  team: Team
  display_name: string
  merged_into: Team | null
  merge_label_override: string | null
  merged_pca_preferences_override: MergedPcaPreferencesOverride | null
}

type PcaPreferenceRow = {
  team: Team
  preferred_pca_ids: string[] | null
  preferred_slots: number[] | null
  avoid_gym_schedule: boolean | null
  gym_schedule: number | null
  floor_pca_selection: 'upper' | 'lower' | null
}

type StaffLite = {
  id: string
  name: string
  team: Team | null
  rank: string
  floating: boolean
  active?: boolean | null
  status?: 'active' | 'inactive' | 'buffer' | null
}

type OverrideMode = 'main' | 'mergedAway' | 'custom'

const EMPTY_OVERRIDE: MergedPcaPreferencesOverride = {
  preferred_pca_ids: [],
  preferred_slots: [],
  avoid_gym_schedule: false,
  gym_schedule: null,
  floor_pca_selection: null,
}

function toOverrideFromPreference(pref: PcaPreferenceRow | undefined, source: OverrideMode): MergedPcaPreferencesOverride {
  if (!pref) return { ...EMPTY_OVERRIDE, source }
  return {
    preferred_pca_ids: [...(pref.preferred_pca_ids || [])],
    preferred_slots: [...(pref.preferred_slots || [])],
    avoid_gym_schedule: !!pref.avoid_gym_schedule,
    gym_schedule: pref.gym_schedule ?? null,
    floor_pca_selection: pref.floor_pca_selection ?? null,
    source,
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const e = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
      error_description?: unknown
    }
    const parts = [e.message, e.details, e.hint, e.error_description]
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .map((v) => String(v))
    if (parts.length > 0) return parts.join(' | ')
    if (typeof e.code === 'string' && e.code.trim().length > 0) return e.code
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

export function TeamMergePanel() {
  const supabase = createClientComponentClient()
  const toast = useToast()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [teamSettings, setTeamSettings] = useState<TeamSettingsRow[]>([])
  const [pcaPreferences, setPcaPreferences] = useState<PcaPreferenceRow[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [wards, setWards] = useState<Ward[]>([])

  const [editingMergedAwayTeam, setEditingMergedAwayTeam] = useState<Team | null>(null)
  const [isEditorVisible, setIsEditorVisible] = useState(false)
  const [mergedAwayTeam, setMergedAwayTeam] = useState<Team>(TEAMS[0])
  const [mainTeam, setMainTeam] = useState<Team>(TEAMS[1] ?? TEAMS[0])
  const [mergeLabelOverride, setMergeLabelOverride] = useState('')
  const [overrideMode, setOverrideMode] = useState<OverrideMode>('main')
  const [overrideState, setOverrideState] = useState<MergedPcaPreferencesOverride>({ ...EMPTY_OVERRIDE })

  const loadData = async () => {
    setLoading(true)
    try {
      const [settingsRes, prefRes, staffRes, wardsRes] = await Promise.all([
        supabase
          .from('team_settings')
          .select('team,display_name,merged_into,merge_label_override,merged_pca_preferences_override')
          .order('team'),
        supabase
          .from('pca_preferences')
          .select('team,preferred_pca_ids,preferred_slots,avoid_gym_schedule,gym_schedule,floor_pca_selection'),
        supabase
          .from('staff')
          .select('id,name,team,rank,floating,status')
          .in('rank', ['APPT', 'RPT', 'PCA'])
          .order('name'),
        supabase.from('wards').select('*').order('name'),
      ])

      if (settingsRes.error) throw settingsRes.error
      if (prefRes.error) throw prefRes.error
      if (staffRes.error) throw staffRes.error
      if (wardsRes.error) throw wardsRes.error

      setTeamSettings((settingsRes.data || []) as TeamSettingsRow[])
      setPcaPreferences((prefRes.data || []) as PcaPreferenceRow[])
      setStaff((staffRes.data || []) as StaffLite[])
      setWards((wardsRes.data || []) as Ward[])
    } catch (error) {
      toast.error('Failed to load team merge settings.', getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const teamSettingsByTeam = useMemo(() => {
    const map = new Map<Team, TeamSettingsRow>()
    teamSettings.forEach((row) => map.set(row.team, row))
    return map
  }, [teamSettings])

  const pcaPreferencesByTeam = useMemo(() => {
    const map = new Map<Team, PcaPreferenceRow>()
    pcaPreferences.forEach((row) => map.set(row.team, row))
    return map
  }, [pcaPreferences])

  const mergedIntoMap = useMemo(() => {
    const out: Partial<Record<Team, Team>> = {}
    teamSettings.forEach((row) => {
      if (row.merged_into && row.merged_into !== row.team) {
        out[row.team] = row.merged_into
      }
    })
    return out
  }, [teamSettings])

  const displayNames = useMemo(() => {
    const out: Partial<Record<Team, string>> = {}
    teamSettings.forEach((row) => {
      out[row.team] = row.display_name || row.team
    })
    TEAMS.forEach((team) => {
      if (!out[team]) out[team] = team
    })
    return out
  }, [teamSettings])

  const activeMerges = useMemo(
    () => teamSettings.filter((row) => row.merged_into && row.merged_into !== row.team),
    [teamSettings]
  )

  const teamsInAnyMerge = useMemo(() => {
    const inMerge = new Set<Team>()
    activeMerges.forEach((row) => {
      inMerge.add(row.team)
      inMerge.add(row.merged_into as Team)
    })
    return inMerge
  }, [activeMerges])

  const mergedAwayOptions = useMemo(() => {
    // If editing an existing merge, keep selected merged-away team available.
    return TEAMS.filter((team) => !teamsInAnyMerge.has(team) || team === editingMergedAwayTeam)
  }, [teamsInAnyMerge, editingMergedAwayTeam])

  const mainTeamOptions = useMemo(() => {
    return TEAMS.filter((team) => team !== mergedAwayTeam && (!teamsInAnyMerge.has(team) || team === mainTeam))
  }, [mergedAwayTeam, teamsInAnyMerge, mainTeam])

  const selectedMainDisplayName = useMemo(() => displayNames[mainTeam] || mainTeam, [displayNames, mainTeam])
  const selectedMergedAwayDisplayName = useMemo(
    () => displayNames[mergedAwayTeam] || mergedAwayTeam,
    [displayNames, mergedAwayTeam]
  )
  const labelPreview = useMemo(() => {
    return getMainTeamDisplayName({
      mainTeam,
      mergedInto: { ...mergedIntoMap, [mergedAwayTeam]: mainTeam },
      displayNames,
      mergeLabelOverrideByTeam: mergeLabelOverride.trim() ? { [mainTeam]: mergeLabelOverride.trim() } : {},
    })
  }, [mainTeam, mergedAwayTeam, mergedIntoMap, displayNames, mergeLabelOverride])

  const availablePcas = useMemo(() => {
    const teamSet = new Set<Team>([mainTeam, mergedAwayTeam])
    return staff.filter((s) => {
      if (s.rank !== 'PCA') return false
      if (s.floating) return false
      if (!s.team || !teamSet.has(s.team)) return false
      if (s.status && s.status !== 'active') return false
      return true
    })
  }, [staff, mainTeam, mergedAwayTeam])

  const resetEditor = () => {
    const first = TEAMS[0]
    const second = TEAMS[1] ?? TEAMS[0]
    setEditingMergedAwayTeam(null)
    setMergedAwayTeam(first)
    setMainTeam(second === first ? TEAMS[2] ?? first : second)
    setMergeLabelOverride('')
    setOverrideMode('main')
    setOverrideState({ ...EMPTY_OVERRIDE, source: 'main' })
    setIsEditorVisible(false)
  }

  const openCreate = () => {
    resetEditor()
    setIsEditorVisible(true)
  }

  const openEdit = (row: TeamSettingsRow) => {
    const targetMain = row.merged_into || row.team
    setEditingMergedAwayTeam(row.team)
    setMergedAwayTeam(row.team)
    setMainTeam(targetMain)
    setMergeLabelOverride((teamSettingsByTeam.get(targetMain)?.merge_label_override || '').trim())
    const existingOverride = teamSettingsByTeam.get(targetMain)?.merged_pca_preferences_override || null
    if (existingOverride && typeof existingOverride === 'object') {
      const source =
        existingOverride.source === 'main' || existingOverride.source === 'mergedAway' || existingOverride.source === 'custom'
          ? existingOverride.source
          : 'custom'
      setOverrideMode(source)
      setOverrideState({ ...EMPTY_OVERRIDE, ...existingOverride, source })
    } else {
      setOverrideMode('main')
      setOverrideState(toOverrideFromPreference(pcaPreferencesByTeam.get(targetMain), 'main'))
    }
    setIsEditorVisible(true)
  }

  const applyOverrideFromMode = (mode: OverrideMode, nextMain: Team, nextMergedAway: Team) => {
    if (mode === 'custom') return
    const baselineTeam = mode === 'main' ? nextMain : nextMergedAway
    setOverrideState(toOverrideFromPreference(pcaPreferencesByTeam.get(baselineTeam), mode))
  }

  useEffect(() => {
    applyOverrideFromMode(overrideMode, mainTeam, mergedAwayTeam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideMode, mainTeam, mergedAwayTeam, pcaPreferencesByTeam])

  const saveMerge = async () => {
    if (mergedAwayTeam === mainTeam) {
      toast.warning('Main team and Merged-away team must be different.')
      return
    }
    if (teamsInAnyMerge.has(mergedAwayTeam) && mergedAwayTeam !== editingMergedAwayTeam) {
      toast.warning('This Merged-away team is already in a merge.')
      return
    }
    if (teamsInAnyMerge.has(mainTeam) && mainTeam !== (teamSettingsByTeam.get(editingMergedAwayTeam || mergedAwayTeam)?.merged_into || mainTeam)) {
      toast.warning('This Main team is already in a merge.')
      return
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()

      const overrideToSave: MergedPcaPreferencesOverride =
        overrideMode === 'custom'
          ? {
              ...overrideState,
              source: 'custom',
              updatedAt: now,
            }
          : {
              ...toOverrideFromPreference(
                pcaPreferencesByTeam.get(overrideMode === 'main' ? mainTeam : mergedAwayTeam),
                overrideMode
              ),
              updatedAt: now,
            }

      const updates: PromiseLike<any>[] = [
        supabase
          .from('team_settings')
          .upsert({
            team: mergedAwayTeam,
            display_name: displayNames[mergedAwayTeam] || mergedAwayTeam,
            merged_into: mainTeam,
            updated_at: now,
          }),
        supabase
          .from('team_settings')
          .upsert({
            team: mainTeam,
            display_name: displayNames[mainTeam] || mainTeam,
            merge_label_override: mergeLabelOverride.trim() || null,
            merged_pca_preferences_override: overrideToSave,
            updated_at: now,
          }),
      ]

      // If editing and merged-away team changed, clear previous row.
      if (editingMergedAwayTeam && editingMergedAwayTeam !== mergedAwayTeam) {
        updates.push(
          supabase
            .from('team_settings')
            .upsert({
              team: editingMergedAwayTeam,
              display_name: displayNames[editingMergedAwayTeam] || editingMergedAwayTeam,
              merged_into: null,
              updated_at: now,
            })
        )
      }

      const results = await Promise.all(updates)
      const firstError = results.find((r: any) => r?.error)?.error
      if (firstError) throw firstError

      toast.success('Team merge saved.')
      await loadData()
      resetEditor()
    } catch (error) {
      toast.error('Failed to save team merge.', getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const unmerge = async (row: TeamSettingsRow) => {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const main = row.merged_into as Team
      const [awayRes, mainRes] = await Promise.all([
        supabase
          .from('team_settings')
          .upsert({
            team: row.team,
            display_name: displayNames[row.team] || row.team,
            merged_into: null,
            updated_at: now,
          }),
        supabase
          .from('team_settings')
          .upsert({
            team: main,
            display_name: displayNames[main] || main,
            merge_label_override: null,
            merged_pca_preferences_override: null,
            updated_at: now,
          }),
      ])
      if ((awayRes as any)?.error) throw (awayRes as any).error
      if ((mainRes as any)?.error) throw (mainRes as any).error
      toast.success('Teams unmerged.')
      await loadData()
      if (editingMergedAwayTeam === row.team) resetEditor()
    } catch (error) {
      toast.error('Failed to unmerge teams.', getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const togglePreferredPca = (staffId: string, checked: boolean) => {
    const current = new Set(overrideState.preferred_pca_ids || [])
    if (checked) current.add(staffId)
    else current.delete(staffId)
    setOverrideState((prev) => ({ ...prev, preferred_pca_ids: Array.from(current), source: 'custom' }))
  }

  const isStaffActive = (person: StaffLite) => {
    if (typeof person.active === 'boolean') return person.active
    if (person.status) return person.status === 'active'
    return true
  }

  const computeFractionFromBeds = (teamBeds: number, totalBeds: number): string | null => {
    if (teamBeds === totalBeds || teamBeds === 0) return null
    const fraction = teamBeds / totalBeds
    const knownFractions = [
      { num: 1, den: 2, value: 0.5 },
      { num: 1, den: 3, value: 1 / 3 },
      { num: 2, den: 3, value: 2 / 3 },
      { num: 3, den: 4, value: 0.75 },
    ]
    for (const f of knownFractions) {
      if (Math.abs(fraction - f.value) < 0.01) return `${f.num}/${f.den}`
    }
    return null
  }

  const formatWardLabelForTeam = (ward: Ward, team: Team) => {
    const portion = ward.team_assignment_portions?.[team]
    if (portion) return `${portion} ${ward.name}`
    const teamBeds = ward.team_assignments[team] || 0
    if (teamBeds < ward.total_beds && teamBeds > 0) {
      const fraction = computeFractionFromBeds(teamBeds, ward.total_beds)
      if (fraction) return `${fraction} ${ward.name}`
    }
    return ward.name
  }

  const getTeamPreviewDetails = (team: Team) => {
    const teamHeads = staff.filter((s) => s.rank === 'APPT' && s.team === team && isStaffActive(s))
    const teamRpts = staff.filter((s) => s.rank === 'RPT' && s.team === team && isStaffActive(s))
    const teamPcas = staff.filter((s) => s.rank === 'PCA' && s.team === team && !s.floating && isStaffActive(s))
    const teamWards = wards.filter((w) => (w.team_assignments[team] || 0) > 0)
    const totalBeds = wards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
    return {
      heads: teamHeads.map((s) => s.name),
      rpts: teamRpts.map((s) => s.name),
      pcas: teamPcas.map((s) => s.name),
      wardLabels: teamWards.map((w) => `${formatWardLabelForTeam(w, team)} (${w.team_assignments[team] || 0})`),
      totalBeds,
    }
  }

  const combineUnique = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]))

  const combineWards = (teamA: Team, teamB: Team) => {
    return wards
      .map((w) => {
        const beds = (w.team_assignments[teamA] || 0) + (w.team_assignments[teamB] || 0)
        if (beds <= 0) return null
        return `${w.name} (${beds})`
      })
      .filter((v): v is string => !!v)
  }

  const mergedAwayStats = getTeamPreviewDetails(mergedAwayTeam)
  const mainTeamStats = getTeamPreviewDetails(mainTeam)
  const combinedStats = {
    heads: combineUnique(mainTeamStats.heads, mergedAwayStats.heads),
    rpts: combineUnique(mainTeamStats.rpts, mergedAwayStats.rpts),
    pcas: combineUnique(mainTeamStats.pcas, mergedAwayStats.pcas),
    wardLabels: combineWards(mainTeam, mergedAwayTeam),
    totalBeds: mainTeamStats.totalBeds + mergedAwayStats.totalBeds,
  }

  const renderTeamSummary = (
    title: string,
    details: { heads: string[]; rpts: string[]; pcas: string[]; wardLabels: string[]; totalBeds: number },
    className: string,
    valueClassName: string
  ) => (
    <div className={className}>
      <div className="text-xs font-medium mb-2 text-center truncate" title={title}>
        {title}
      </div>
      <div className="space-y-1.5 text-sm">
        <p className="text-xs">
          <span className="text-muted-foreground">Heads:</span>{' '}
          <span className={valueClassName}>{details.heads.length > 0 ? details.heads.join(', ') : '-'}</span>
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">RPT:</span>{' '}
          <span className={valueClassName}>{details.rpts.length > 0 ? details.rpts.join(', ') : '-'}</span>
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">Non-floating PCA:</span>{' '}
          <span className={valueClassName}>{details.pcas.length > 0 ? details.pcas.join(', ') : '-'}</span>
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">Wards:</span>{' '}
          <span className={valueClassName}>{details.wardLabels.length > 0 ? details.wardLabels.join(', ') : '-'}</span>
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">Total bed counts:</span>{' '}
          <span className={valueClassName}>{details.totalBeds}</span>
        </p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Team Merge</CardTitle>
          <CardDescription>
            Main team = team column that stays visible. Merged-away team = team column hidden and counted under Main team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? <p>Loading...</p> : null}

          {/* Active Merges Section */}
          <div className="space-y-3">
            <div className="text-sm font-semibold">Active merges</div>
            {activeMerges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active merges.</p>
            ) : (
              <div className="space-y-2">
                {activeMerges.map((row) => {
                  const main = row.merged_into as Team
                  const mainLabel = getMainTeamDisplayName({
                    mainTeam: main,
                    mergedInto: mergedIntoMap,
                    displayNames,
                    mergeLabelOverrideByTeam: {
                      [main]: (teamSettingsByTeam.get(main)?.merge_label_override || '').trim(),
                    },
                  })

                  return (
                    <div key={`merge-${row.team}`} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex items-center gap-3 text-sm">
                        <Badge variant="outline" className="font-mono">{row.team}</Badge>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <Badge variant="secondary" className="font-mono">{main}</Badge>
                        <span className="text-muted-foreground ml-2">→ {mainLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)} disabled={saving}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void unmerge(row)} disabled={saving}>
                          Unmerge
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            
            {!isEditorVisible && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={openCreate} 
                disabled={saving}
                className="gap-1"
              >
                <Plus className="w-4 h-4" />
                Create merge
              </Button>
            )}
          </div>

          {/* Merge Editor - Progressive Disclosure */}
          {isEditorVisible && (
            <div className="space-y-6 border-t pt-6">
              {/* Editor Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {editingMergedAwayTeam ? `Edit merge: ${editingMergedAwayTeam} → ${mainTeam}` : 'Create merge'}
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetEditor} 
                  disabled={saving}
                  className="gap-1 text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </div>

              {/* Team Selection */}
              <div className="grid grid-cols-3 gap-4 items-end">
                <div>
                  <Label htmlFor="merged-away-team" className="text-sm text-muted-foreground">Merged-away team</Label>
                  <select
                    id="merged-away-team"
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={mergedAwayTeam}
                    onChange={(e) => setMergedAwayTeam(e.target.value as Team)}
                    disabled={saving || !!editingMergedAwayTeam}
                  >
                    {mergedAwayOptions.map((team) => (
                      <option key={`merged-away-opt-${team}`} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-center pb-2">
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>

                <div>
                  <Label htmlFor="main-team" className="text-sm text-muted-foreground">Main team</Label>
                  <select
                    id="main-team"
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={mainTeam}
                    onChange={(e) => setMainTeam(e.target.value as Team)}
                    disabled={saving}
                  >
                    {mainTeamOptions.map((team) => (
                      <option key={`main-opt-${team}`} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Side-by-Side Merge Preview */}
              <div className="bg-muted/30 rounded-lg p-5">
                <h4 className="text-xs font-medium text-muted-foreground mb-4 text-center uppercase tracking-wide">
                  Merge Preview
                </h4>
                
                <div className="grid grid-cols-5 gap-3 items-stretch">
                  {/* Column 1: Merged-away team */}
                  {renderTeamSummary(
                    selectedMergedAwayDisplayName,
                    mergedAwayStats,
                    'bg-background rounded-md p-3 border',
                    'font-medium'
                  )}

                  {/* Column 2: Arrow */}
                  <div className="flex flex-col items-center justify-center gap-1">
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>

                  {/* Column 3: Main team */}
                  {renderTeamSummary(
                    selectedMainDisplayName,
                    mainTeamStats,
                    'bg-background rounded-md p-3 border',
                    'font-medium'
                  )}

                  {/* Column 4: Equals */}
                  <div className="flex items-center justify-center">
                    <span className="text-lg font-medium text-muted-foreground">=</span>
                  </div>

                  {/* Column 5: Combined result */}
                  {renderTeamSummary(
                    labelPreview,
                    combinedStats,
                    'bg-primary/5 rounded-md p-3 border border-primary/20',
                    'font-medium text-primary'
                  )}
                </div>

                {/* Label Override */}
                <div className="mt-4 pt-4 border-t">
                  <Label htmlFor="merge-label-override" className="text-xs text-muted-foreground">
                    Display label override (optional)
                  </Label>
                  <Input
                    id="merge-label-override"
                    className="mt-1 text-sm"
                    value={mergeLabelOverride}
                    onChange={(e) => setMergeLabelOverride(e.target.value)}
                    placeholder={`${selectedMainDisplayName}+${selectedMergedAwayDisplayName}`}
                  />
                </div>
              </div>

              {/* PCA Preferences Configuration */}
              <div className="space-y-3">
                <Label className="text-sm">PCA preferences source</Label>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      className="rounded-full"
                      checked={overrideMode === 'main'}
                      onChange={() => setOverrideMode('main')}
                    />
                    <span>Use {selectedMainDisplayName}</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      className="rounded-full"
                      checked={overrideMode === 'mergedAway'}
                      onChange={() => setOverrideMode('mergedAway')}
                    />
                    <span>Use {selectedMergedAwayDisplayName}</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      className="rounded-full"
                      checked={overrideMode === 'custom'}
                      onChange={() => setOverrideMode('custom')}
                    />
                    <span>Custom</span>
                  </label>
                </div>
              </div>

              {overrideMode === 'custom' && (
                <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                  <div>
                    <Label className="text-sm">Preferred non-floating PCA</Label>
                    <div className="mt-2 max-h-40 overflow-y-auto rounded border bg-background p-2 space-y-1">
                      {availablePcas.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No non-floating PCA in these two teams.</p>
                      ) : (
                        availablePcas.map((person) => {
                          const checked = (overrideState.preferred_pca_ids || []).includes(person.id)
                          return (
                            <label key={`pref-pca-${person.id}`} className="flex items-center space-x-2 py-1 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => togglePreferredPca(person.id, !!next)}
                              />
                              <span>{person.name}</span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="merged-pref-slot" className="text-xs">Preferred slot</Label>
                      <select
                        id="merged-pref-slot"
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={(overrideState.preferred_slots || [])[0] ?? ''}
                        onChange={(e) =>
                          setOverrideState((prev) => ({
                            ...prev,
                            preferred_slots: e.target.value ? [Number(e.target.value)] : [],
                            source: 'custom',
                          }))
                        }
                      >
                        <option value="">None</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="merged-gym-slot" className="text-xs">Gym schedule</Label>
                      <select
                        id="merged-gym-slot"
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={overrideState.gym_schedule ?? ''}
                        onChange={(e) =>
                          setOverrideState((prev) => ({
                            ...prev,
                            gym_schedule: e.target.value ? Number(e.target.value) : null,
                            source: 'custom',
                          }))
                        }
                      >
                        <option value="">None</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="merged-floor-selection" className="text-xs">Floor</Label>
                      <select
                        id="merged-floor-selection"
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={overrideState.floor_pca_selection ?? ''}
                        onChange={(e) =>
                          setOverrideState((prev) => ({
                            ...prev,
                            floor_pca_selection: e.target.value ? (e.target.value as 'upper' | 'lower') : null,
                            source: 'custom',
                          }))
                        }
                      >
                        <option value="">None</option>
                        <option value="upper">Upper</option>
                        <option value="lower">Lower</option>
                      </select>
                    </div>
                  </div>

                  <label className="inline-flex items-center space-x-2 text-sm">
                    <Checkbox
                      checked={!!overrideState.avoid_gym_schedule}
                      onCheckedChange={(next) =>
                        setOverrideState((prev) => ({
                          ...prev,
                          avoid_gym_schedule: !!next,
                          source: 'custom',
                        }))
                      }
                    />
                    <span>Avoid gym schedule</span>
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetEditor} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={() => void saveMerge()} disabled={saving || loading}>
                  {saving ? 'Saving...' : editingMergedAwayTeam ? 'Save changes' : 'Create merge'}
                </Button>
              </div>
            </div>
          )}

          {/* Merge Effects Reference - Categorized Cards */}
          <MergeEffectsReference />
        </CardContent>
      </Card>
    </div>
  )
}

// Merge Effects Reference Component
function MergeEffectsReference() {
  const [isOpen, setIsOpen] = useState(false)

  const categories = [
    {
      id: 'visual',
      icon: LayoutGrid,
      title: 'Visual Layer',
      items: [
        { field: 'Schedule columns / headers', effect: 'Visible Main teams only' },
        { field: 'Staff.team grouping', effect: 'Staff appear under Main team' },
      ],
    },
    {
      id: 'patient-care',
      icon: BedDouble,
      title: 'Patient Care',
      items: [
        { field: 'Ward bed counts', effect: 'Sum of designated beds from both teams' },
        { field: 'Non-floating PCA status', effect: 'Unchanged (follows staff.floating)' },
        { field: 'PCA preferences', effect: 'Choose: Main / Merged-away / Custom' },
      ],
    },
    {
      id: 'system',
      icon: Settings2,
      title: 'System Behavior',
      items: [
        { field: 'SPT allocation teams', effect: 'Uses Main team keys (auto-canonicalized)' },
        { field: 'Special program therapist preference', effect: 'Uses Main team keys' },
        { field: 'Special program PCA order', effect: 'Global rule (unchanged)' },
        { field: 'staffOverrides team references', effect: 'Uses Main team keys (auto-canonicalized)' },
      ],
    },
  ]

  return (
    <div className="border-t pt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-foreground transition-colors"
      >
        <span>Merge Effects Reference</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="grid grid-cols-3 gap-3 pt-3">
          {categories.map((category) => (
            <div 
              key={category.id} 
              className="rounded-lg border bg-card/50 overflow-hidden"
            >
              {/* Category header with icon */}
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
                <category.icon className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category.title}
                </h4>
              </div>
              
              {/* Items as rows */}
              <div className="divide-y">
                {category.items.map((item) => (
                  <Tooltip 
                    key={item.field} 
                    content={`${item.field}: ${item.effect}`}
                  >
                    <div className="grid grid-cols-2 items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-help">
                      <span className="text-sm text-foreground">
                        {item.field}
                      </span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ArrowRight className="w-3 h-3" />
                        {item.effect}
                      </span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
