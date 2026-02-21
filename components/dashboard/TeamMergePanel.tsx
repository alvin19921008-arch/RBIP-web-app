'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Team } from '@/types/staff'
import { TEAMS } from '@/lib/utils/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast-provider'
import { Info } from 'lucide-react'
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

  const [editingMergedAwayTeam, setEditingMergedAwayTeam] = useState<Team | null>(null)
  const [mergedAwayTeam, setMergedAwayTeam] = useState<Team>(TEAMS[0])
  const [mainTeam, setMainTeam] = useState<Team>(TEAMS[1] ?? TEAMS[0])
  const [mergeLabelOverride, setMergeLabelOverride] = useState('')
  const [overrideMode, setOverrideMode] = useState<OverrideMode>('main')
  const [overrideState, setOverrideState] = useState<MergedPcaPreferencesOverride>({ ...EMPTY_OVERRIDE })

  const loadData = async () => {
    setLoading(true)
    try {
      const [settingsRes, prefRes, staffRes] = await Promise.all([
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
          .eq('rank', 'PCA')
          .order('name'),
      ])

      if (settingsRes.error) throw settingsRes.error
      if (prefRes.error) throw prefRes.error
      if (staffRes.error) throw staffRes.error

      setTeamSettings((settingsRes.data || []) as TeamSettingsRow[])
      setPcaPreferences((prefRes.data || []) as PcaPreferenceRow[])
      setStaff((staffRes.data || []) as StaffLite[])
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
  }

  const openCreate = () => {
    resetEditor()
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Team Merge</CardTitle>
          <CardDescription>
            Main team = team column that stays visible. Merged-away team = team column hidden and counted under Main team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p>Loading...</p> : null}

          <div className="space-y-2">
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
                    <div key={`merge-${row.team}`} className="flex items-center justify-between rounded-md border p-3">
                      <div className="text-sm">
                        <span className="font-semibold">{row.team}</span>
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="font-semibold">{main}</span>
                        <span className="ml-2 text-muted-foreground">Label: {mainLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)} disabled={saving}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void unmerge(row)} disabled={saving}>
                          Unmerge
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div>
              <Button size="sm" variant="outline" onClick={openCreate} disabled={saving}>
                Create merge
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="text-sm font-semibold">{editingMergedAwayTeam ? 'Edit merge' : 'Merge editor'}</div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="merged-away-team">Merged-away team</Label>
                <select
                  id="merged-away-team"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={mergedAwayTeam}
                  onChange={(e) => setMergedAwayTeam(e.target.value as Team)}
                  disabled={saving}
                >
                  {mergedAwayOptions.map((team) => (
                    <option key={`merged-away-opt-${team}`} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="main-team">Main team</Label>
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

            <div className="text-xs text-muted-foreground">
              Preview: {selectedMergedAwayDisplayName} joins {selectedMainDisplayName} → {labelPreview}
            </div>

            <div>
              <Label htmlFor="merge-label-override">Merged label override (optional)</Label>
              <Input
                id="merge-label-override"
                className="mt-1"
                value={mergeLabelOverride}
                onChange={(e) => setMergeLabelOverride(e.target.value)}
                placeholder={`${selectedMainDisplayName}+${selectedMergedAwayDisplayName}`}
              />
            </div>

            <div className="space-y-2">
              <Label>PCA preferences for merged team (effective config)</Label>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={overrideMode === 'main'}
                    onChange={() => setOverrideMode('main')}
                  />
                  Use Main team
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={overrideMode === 'mergedAway'}
                    onChange={() => setOverrideMode('mergedAway')}
                  />
                  Use Merged-away team
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={overrideMode === 'custom'}
                    onChange={() => setOverrideMode('custom')}
                  />
                  Custom
                </label>
              </div>
            </div>

            {overrideMode === 'custom' ? (
              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <Label>Preferred non-floating PCA</Label>
                  <div className="mt-1 max-h-40 overflow-y-auto rounded border p-2 space-y-1">
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

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label htmlFor="merged-pref-slot">Preferred slot</Label>
                    <select
                      id="merged-pref-slot"
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
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
                    <Label htmlFor="merged-gym-slot">Gym schedule</Label>
                    <select
                      id="merged-gym-slot"
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
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
                    <Label htmlFor="merged-floor-selection">Floor selection</Label>
                    <select
                      id="merged-floor-selection"
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
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
                    onCheckedChange={(checked) =>
                      setOverrideState((prev) => ({
                        ...prev,
                        avoid_gym_schedule: !!checked,
                        source: 'custom',
                      }))
                    }
                  />
                  <span>Avoid gym schedule</span>
                </label>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button onClick={() => void saveMerge()} disabled={saving || loading}>
                {saving ? 'Saving...' : 'Save merge'}
              </Button>
              <Button variant="outline" onClick={resetEditor} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Merge effects</div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2">Category / Field</th>
                    <th className="px-3 py-2">While merged (effective owner)</th>
                    <th className="px-3 py-2">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  <RuleRow
                    category="Schedule columns / headers"
                    owner="Visible Main teams only"
                    rule="Auto"
                    tooltip="Columns are rendered using visible main teams only."
                  />
                  <RuleRow
                    category="Staff.team (RPT/APPT/PCA)"
                    owner="Main team"
                    rule="Main team rule"
                    tooltip="Staff are grouped to Main team for schedule rendering while merged."
                  />
                  <RuleRow
                    category="Non-floating PCA property"
                    owner="Unchanged"
                    rule="Unchanged"
                    tooltip="Non-floating status stays from staff.floating. Merge does not change this."
                  />
                  <RuleRow
                    category="Ward bed counts (designated)"
                    owner="Main team"
                    rule="Main team rule"
                    tooltip="Team designated beds are treated as sum of contributing teams when merged."
                  />
                  <RuleRow
                    category="SPT allocation teams[]"
                    owner="Main team"
                    rule="Main team rule"
                    tooltip="Hard-coded: SPT teams are canonicalized to Main team so SPT never targets hidden columns."
                  />
                  <RuleRow
                    category="Special program therapist preference"
                    owner="Main team key"
                    rule="Main team rule"
                    tooltip="Hard-coded: therapist preference uses Main team keys to match visible columns."
                  />
                  <RuleRow
                    category="PCA preferences (pca_preferences)"
                    owner="Main team"
                    rule="Choose in merge"
                    tooltip="Pick baseline from Main or Merged-away team, or set a custom override for merged mode."
                  />
                  <RuleRow
                    category="Special program PCA order"
                    owner="Global"
                    rule="Global rule"
                    tooltip="Global special program PCA preference order remains unchanged during merge."
                  />
                  <RuleRow
                    category="staffOverrides team references"
                    owner="Main team"
                    rule="Main team rule"
                    tooltip="Hard-coded: override team keys are canonicalized on read/write to avoid hidden-team targets."
                  />
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RuleRow(props: { category: string; owner: string; rule: string; tooltip: string }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2">{props.category}</td>
      <td className="px-3 py-2 text-muted-foreground">{props.owner}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <span>{props.rule}</span>
          <Tooltip side="top" content={props.tooltip}>
            <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        </span>
      </td>
    </tr>
  )
}
