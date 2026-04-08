'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PCAPreference } from '@/types/allocation'
import { Staff, Team } from '@/types/staff'
import { getSlotLabel } from '@/lib/utils/slotHelpers'
import { RankedSlotPreferencesEditor } from '@/components/dashboard/RankedSlotPreferencesEditor'
import { FloorPCAMappingPanel } from '@/components/dashboard/FloorPCAMappingPanel'
import { useToast } from '@/components/ui/toast-context'
import { useDashboardExpandableCard } from '@/hooks/useDashboardExpandableCard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccessControl } from '@/lib/access/useAccessControl'
import { ArrowRight, Users, GitMerge, MoveUp, MoveDown, X } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { 
  computeMergedIntoMap, 
  getTeamMergeStatus, 
  computeDisplayNames,
} from '@/lib/utils/teamMergeHelpers'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TeamSettingsRow = {
  team: Team
  display_name: string | null
  merged_into: Team | null
}

function normalizeRankedSlots(raw: number[] | null | undefined): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const s of raw ?? []) {
    if (typeof s === 'number' && s >= 1 && s <= 4 && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

function rankedSlotsSummaryLine(slots: number[] | null | undefined): string {
  const n = normalizeRankedSlots(slots)
  if (n.length === 0) return 'None'
  return n.map((s) => getSlotLabel(s)).join(' → ')
}

export function PCAPreferencePanel() {
  const [preferences, setPreferences] = useState<PCAPreference[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [teamSettings, setTeamSettings] = useState<TeamSettingsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editingPreference, setEditingPreference] = useState<PCAPreference | null>(null)
  const [editingFloorMapping, setEditingFloorMapping] = useState(false)
  const [globalHead, setGlobalHead] = useState<any>(null)
  const [scarcityShortageSlots, setScarcityShortageSlots] = useState<string>('2')
  const [scarcityBehavior, setScarcityBehavior] = useState<'remind_only' | 'off'>('remind_only')
  const [savingScarcity, setSavingScarcity] = useState(false)
  const expand = useDashboardExpandableCard<string>({ animationMs: 220 })
  const expandFloor = useDashboardExpandableCard<string>({ animationMs: 220 })
  const supabase = createClientComponentClient()
  const toast = useToast()
  const access = useAccessControl()

  // Compute merge configuration using shared utilities
  const mergedIntoMap = useMemo(() => {
    return computeMergedIntoMap(teamSettings)
  }, [teamSettings])

  const displayNames = useMemo(() => {
    return computeDisplayNames(teamSettings)
  }, [teamSettings])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [preferencesRes, staffRes, settingsRes] = await Promise.all([
        supabase.from('pca_preferences').select('*').order('team'),
        supabase.from('staff').select('*').eq('rank', 'PCA').order('name'), // Load all PCA for name display
        supabase.from('team_settings').select('team,display_name,merged_into').order('team'),
      ])

      if (preferencesRes.data) setPreferences(preferencesRes.data as any)
      if (staffRes.data) setStaff(staffRes.data)
      if (settingsRes.data) setTeamSettings(settingsRes.data as TeamSettingsRow[])

      // Load global head for scarcity threshold
      const headRes = await supabase.rpc('get_config_global_head_v1')
      if (!headRes.error) {
        const head = headRes.data
        setGlobalHead(head)
        const raw = (head as any)?.floating_pca_scarcity_threshold
        // Backward compatible read: DB stores slack_slots; UI interprets it as shortage-slots threshold.
        const shortageSlots =
          typeof raw?.shortage_slots === 'number'
            ? raw.shortage_slots
            : typeof raw?.slack_slots === 'number'
              ? raw.slack_slots
              : Number(raw?.shortage_slots ?? raw?.shortageSlots ?? raw?.slack_slots ?? raw?.slackSlots ?? 2)
        const behaviorRaw = String(raw?.behavior ?? 'remind_only')
        const shortageSafe = Number.isFinite(shortageSlots) && shortageSlots >= 0 ? Math.round(shortageSlots) : 2
        // Legacy: map auto_select → remind_only; only remind_only and off are supported.
        const behaviorSafe: 'remind_only' | 'off' =
          behaviorRaw === 'remind_only' || behaviorRaw === 'off' ? behaviorRaw : 'remind_only'
        setScarcityShortageSlots(String(shortageSafe))
        setScarcityBehavior(behaviorSafe)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const canEditScarcityThreshold =
    (access.role === 'admin' || access.role === 'developer') &&
    access.can('dashboard.pca-preferences.scarcity-threshold')

  const handleSaveScarcityThreshold = async () => {
    const shortageSlots = Number(scarcityShortageSlots)
    if (!Number.isFinite(shortageSlots) || shortageSlots < 0) {
      toast.error('Invalid shortage slots', 'Enter an integer ≥ 0 (slots of 0.25 FTE each).')
      return
    }

    setSavingScarcity(true)
    try {
      const res = await supabase.rpc('set_floating_pca_scarcity_threshold_v4', {
        // RPC still stores this as slack_slots; UI interprets as shortage-slots threshold.
        p_slack_slots: Math.round(shortageSlots),
        // Legacy field retained for backward compatibility; Step 3.1 no longer uses it.
        p_min_teams: 1,
        p_behavior: scarcityBehavior,
      })
      if (res.error) {
        const msg = res.error.message || ''
        if (msg.includes('set_floating_pca_scarcity_threshold_v4')) {
          toast.error(
            'Missing database function',
            'Please apply the latest Supabase migration: `supabase/migrations/update_floating_pca_scarcity_threshold_v4.sql`.'
          )
        } else {
          toast.error('Failed to save threshold', msg)
        }
        return
      }
      setGlobalHead(res.data)
      const raw = (res.data as any)?.floating_pca_scarcity_threshold
      const shortageSaved =
        typeof raw?.shortage_slots === 'number'
          ? raw.shortage_slots
          : typeof raw?.slack_slots === 'number'
            ? raw.slack_slots
            : Number(raw?.shortage_slots ?? raw?.shortageSlots ?? raw?.slack_slots ?? raw?.slackSlots ?? shortageSlots)
      const behaviorSaved = String(raw?.behavior ?? scarcityBehavior)
      const shortageSafe = Number.isFinite(shortageSaved) && shortageSaved >= 0 ? Math.round(shortageSaved) : Math.round(shortageSlots)
      // Legacy: map auto_select → remind_only; only remind_only and off are supported.
      const behaviorSafe: 'remind_only' | 'off' =
        behaviorSaved === 'remind_only' || behaviorSaved === 'off' ? behaviorSaved : 'remind_only'
      setScarcityShortageSlots(String(shortageSafe))
      setScarcityBehavior(behaviorSafe)
      toast.success('Scarcity threshold saved.')
    } catch (e) {
      toast.error('Failed to save threshold', (e as any)?.message || undefined)
    } finally {
      setSavingScarcity(false)
    }
  }

  const handleSave = async (preference: Partial<PCAPreference>) => {
    try {
      let result
      if (editingPreference?.id) {
        result = await supabase
          .from('pca_preferences')
          .update(preference)
          .eq('id', editingPreference.id)
      } else {
        result = await supabase.from('pca_preferences').insert(preference)
      }
      
      if (result.error) {
        console.error('Error saving preference:', result.error)
        const errorMsg = result.error.message || result.error.code || 'Unknown error'
        toast.error(
          'Error saving preference.',
          `${errorMsg}. If you see "column gym_schedule does not exist", run supabase/migrations/add_gym_schedule_to_pca_preferences.sql.`
        )
        return
      }
      
      await loadData()
      expand.close(() => setEditingPreference(null))
      toast.success('Preference saved.')
    } catch (err) {
      console.error('Error saving preference:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      toast.error(
        'Error saving preference.',
        `${errorMsg}. If you see "column gym_schedule does not exist", run supabase/migrations/add_gym_schedule_to_pca_preferences.sql.`
      )
    }
  }

  const allTeams: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  // Helper to scroll to a team card
  const scrollToTeam = (targetTeam: Team) => {
    const element = document.querySelector(`[data-team-card="${targetTeam}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
      setTimeout(() => element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2000)
    }
  }

  return (
    <div className="pt-6 space-y-4">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allTeams.map((team) => {
              const pref = preferences.find(p => p.team === team)
              const isEditing = editingPreference?.team === team
              const mergeStatus = getTeamMergeStatus(team, mergedIntoMap)
              const isMergedAway = mergeStatus.type === 'merged-away'
              const isMainTeam = mergeStatus.type === 'main'
              const displayName = displayNames[team] || team

              if (isEditing) {
                return (
                  <Card
                    key={team}
                    ref={expand.expandedRef}
                    className={`p-4 border-2 col-span-full ${expand.getExpandedAnimationClass(team)}`}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Edit: {displayName}</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => expand.close(() => setEditingPreference(null))}
                      >
                        Cancel
                      </Button>
                    </div>
                    <PCAPreferenceForm
                      key={`${editingPreference.team}-${editingPreference.id ?? 'new'}`}
                      preference={editingPreference}
                      staff={staff}
                      onSave={handleSave}
                      onCancel={() => expand.close(() => setEditingPreference(null))}
                    />
                  </Card>
                )
              }

              // Render merged-away team card (muted, read-only)
              if (isMergedAway && mergeStatus.mainTeam) {
                const mainTeamDisplayName = displayNames[mergeStatus.mainTeam] || mergeStatus.mainTeam

                return (
                  <Card
                    key={team}
                    data-team-card={team}
                    className="p-4 bg-muted/30 border-muted"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-lg text-muted-foreground">{displayName}</h4>
                      <Badge variant="outline" className="flex items-center gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                        <GitMerge className="h-3 w-3" />
                        Follows canonical team: {mainTeamDisplayName}
                      </Badge>
                    </div>

                    <div className="mb-3 rounded-md border border-dashed bg-background/50 p-3">
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <GitMerge className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          PCA preferences for this team use the same settings as{' '}
                          <strong className="text-foreground">{mainTeamDisplayName}</strong>. Edit them on the
                          canonical team&apos;s card.
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => scrollToTeam(mergeStatus.mainTeam!)}
                    >
                      Open {mainTeamDisplayName} preferences <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Card>
                )
              }

              // Render standard team card (or main team with contributing teams badge)
              return (
                <Card key={team} data-team-card={team} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-lg">{displayName}</h4>
                      {isMainTeam && mergeStatus.contributingTeams && mergeStatus.contributingTeams.length > 0 && (
                        <Badge 
                          variant="outline" 
                          className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground flex items-center gap-1"
                          title={`Merged with: ${mergeStatus.contributingTeams.map(t => displayNames[t] || t).join(', ')}`}
                        >
                          <Users className="w-3 h-3" />
                          +{mergeStatus.contributingTeams.map(t => displayNames[t] || t).join(', ')}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const openTeamEditor = () => {
                          if (pref) {
                            setEditingPreference(pref)
                          } else {
                            setEditingPreference({ team } as PCAPreference)
                          }
                          expand.open(team)
                        }

                        // Ensure only one expanded card at a time for correct scroll/reposition.
                        if (editingFloorMapping) {
                          expandFloor.close(() => {
                            setEditingFloorMapping(false)
                            openTeamEditor()
                          })
                          return
                        }

                        openTeamEditor()
                      }}
                    >
                      {pref ? 'Edit' : 'Add'}
                    </Button>
                  </div>
                  {pref ? (
                    <div className="space-y-2">
                      {pref.floor_pca_selection && (
                        <p className="text-sm text-black">
                          Floor PCA: {pref.floor_pca_selection === 'upper' ? 'Upper' : 'Lower'}
                        </p>
                      )}
                      {pref.preferred_pca_ids && pref.preferred_pca_ids.length > 0 && (() => {
                          const activeIds = pref.preferred_pca_ids.filter((id: string) => {
                            const pca = staff.find(s => s.id === id)
                            return pca && (pca.status ?? 'active') !== 'inactive'
                          })
                          if (activeIds.length === 0) return null
                          return (
                            <p className="text-sm text-black">
                              Preferred: {activeIds.map((id: string) => {
                                const pca = staff.find(s => s.id === id)
                                return pca ? pca.name : id
                              }).join(', ')}
                            </p>
                          )
                        })()}
                      <p className="text-sm text-black">
                        Ranked: {rankedSlotsSummaryLine(pref.preferred_slots)}
                      </p>
                      <p className="text-sm text-black">
                        Gym: {pref.gym_schedule ? getSlotLabel(pref.gym_schedule) : 'None'}
                      </p>
                      {pref.avoid_gym_schedule !== undefined && (
                        <p className="text-sm text-black">
                          Avoid gym: {pref.avoid_gym_schedule ? 'Yes' : 'No'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-black">No preferences set</p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
        
        {/* Floor PCA Mapping (same expand/collapse UX as other cards) */}
        <div className="mt-6">
          {editingFloorMapping ? (
            <Card
              ref={expandFloor.expandedRef}
              className={`p-4 border-2 ${expandFloor.getExpandedAnimationClass('floor-mapping')}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-semibold text-lg">Floor PCA Mapping</h4>
                  <p className="text-sm text-muted-foreground">Assign PCAs to Upper and/or Lower floors</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => expandFloor.close(() => setEditingFloorMapping(false))}
                >
                  Cancel
                </Button>
              </div>
              <CardContent className="p-0 pt-2">
                <FloorPCAMappingPanel />
              </CardContent>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-semibold text-lg">Floor PCA Mapping</h4>
                  <p className="text-sm text-muted-foreground">Assign PCAs to Upper and/or Lower floors</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const openFloor = () => {
                      setEditingFloorMapping(true)
                      expandFloor.open('floor-mapping')
                    }

                    // Ensure only one expanded card at a time for correct scroll/reposition.
                    if (editingPreference) {
                      expand.close(() => {
                        setEditingPreference(null)
                        openFloor()
                      })
                      return
                    }

                    openFloor()
                  }}
                >
                  Edit
                </Button>
              </div>
            </Card>
          )}
        </div>

        {canEditScarcityThreshold ? (
          <div className="mt-6">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-lg">Balanced mode trigger (Scarcity)</h4>
                  <p className="text-sm text-muted-foreground">
                    When <span className="font-medium text-foreground">global shortage</span> is ≥ <span className="font-medium text-foreground">S</span> slot(s), show a reminder to consider Balanced mode in Step 3.1.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 max-w-sm">
                <div className="grid gap-2">
                  <Label>When threshold is met</Label>
                  <div className="flex gap-1">
                    {(['remind_only', 'off'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setScarcityBehavior(v)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          scarcityBehavior === v
                            ? 'bg-blue-600 text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {v === 'remind_only' ? 'Remind' : 'Off'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scarcity-shortage-slots">Shortage threshold S (slots)</Label>
                <Input
                    id="scarcity-shortage-slots"
                  inputMode="numeric"
                    value={scarcityShortageSlots}
                    onChange={(e) => setScarcityShortageSlots(e.target.value)}
                    placeholder="2"
                />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveScarcityThreshold}
                    disabled={savingScarcity || loading}
                  >
                    Save
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Current: {(() => {
                      const raw = (globalHead as any)?.floating_pca_scarcity_threshold
                      const shortageSlots =
                        typeof raw?.shortage_slots === 'number'
                          ? raw.shortage_slots
                          : typeof raw?.slack_slots === 'number'
                            ? raw.slack_slots
                            : Number(raw?.shortage_slots ?? raw?.shortageSlots ?? raw?.slack_slots ?? raw?.slackSlots ?? 2)
                      const behavior = String(raw?.behavior ?? 'remind_only')
                      const shortageSafe = Number.isFinite(shortageSlots) ? Math.round(shortageSlots) : 2
                      const behaviorLabel = behavior === 'remind_only' ? 'Remind' : behavior === 'off' ? 'Off' : 'Remind'
                      return `shortage ≥ ${shortageSafe} slot(s) • ${behaviorLabel}`
                    })()}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
    </div>
  )
}

function PCAPreferenceForm({
  preference,
  staff,
  onSave,
  onCancel,
}: {
  preference: Partial<PCAPreference>
  staff: Staff[]
  onSave: (preference: Partial<PCAPreference>) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [preferredPCA, setPreferredPCA] = useState<string[]>(preference.preferred_pca_ids || [])
  const [preferredSlots, setPreferredSlots] = useState<number[]>(() =>
    normalizeRankedSlots(preference.preferred_slots || [])
  )
  const [gymSchedule, setGymSchedule] = useState<number | null>(preference.gym_schedule ?? null)
  const [avoidGymSchedule, setAvoidGymSchedule] = useState<boolean>(preference.avoid_gym_schedule ?? true)
  const [floorPCASelection, setFloorPCASelection] = useState<'upper' | 'lower' | null>(preference.floor_pca_selection ?? null)
  
  const [pcaIdsToAdd, setPcaIdsToAdd] = useState<Set<string>>(new Set())
  const [pcaIdPendingDelete, setPcaIdPendingDelete] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (preferredPCA.length > 2) {
      toast.warning('Maximum 2 preferred PCAs allowed')
      return
    }
    if (preferredSlots.length > 4) {
      toast.warning('Maximum 4 ranked slots allowed')
      return
    }
    const unique = new Set(preferredSlots)
    if (unique.size !== preferredSlots.length) {
      toast.warning('Duplicate ranked slots', 'Each interval can only appear once in the rank.')
      return
    }
    onSave({
      team: preference.team,
      preferred_pca_ids: preferredPCA,
      preferred_slots: normalizeRankedSlots(preferredSlots),
      gym_schedule: gymSchedule,
      avoid_gym_schedule: avoidGymSchedule,
      floor_pca_selection: floorPCASelection,
    })
  }

  const handleAddPCAs = () => {
    const newPCAs = Array.from(pcaIdsToAdd)
    setPreferredPCA(prev => {
      const combined = [...prev, ...newPCAs].slice(0, 2)
      return combined
    })
    setPcaIdsToAdd(new Set())
  }

  const handleRemovePCA = (pcaId: string) => {
    setPreferredPCA(prev => prev.filter(id => id !== pcaId))
    setPcaIdPendingDelete(null)
  }

  const movePCAInOrder = (pcaId: string, direction: 'up' | 'down') => {
    const index = preferredPCA.indexOf(pcaId)
    if (index === -1) return
    if (direction === 'up' && index > 0) {
      const newOrder = [...preferredPCA]
      ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
      setPreferredPCA(newOrder)
    } else if (direction === 'down' && index < preferredPCA.length - 1) {
      const newOrder = [...preferredPCA]
      ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
      setPreferredPCA(newOrder)
    }
  }

  const togglePCAToAdd = (pcaId: string) => {
    setPcaIdsToAdd(prev => {
      const next = new Set(prev)
      if (next.has(pcaId)) {
        next.delete(pcaId)
      } else {
        next.add(pcaId)
      }
      return next
    })
  }

  const eligiblePCAs = staff.filter(s => {
    if ((s.status ?? 'active') === 'inactive') return false
    if (!s.floating) return false
    return !preferredPCA.includes(s.id)
  })
  const regularPCAs = eligiblePCAs.filter(s => s.status !== 'buffer')
  const bufferPCAs = eligiblePCAs.filter(s => s.status === 'buffer')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Floor PCA Selection
        </h4>
        <div className="flex gap-2">
          {(['none', 'upper', 'lower'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFloorPCASelection(opt === 'none' ? null : opt)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                (opt === 'none' ? null : floorPCASelection) === opt
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt === 'none' ? 'None' : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Select the floor type for this team to filter compatible PCAs
        </p>
      </section>

      <hr className="border-border" />

      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add Preferred PCA
        </h4>
        <p className="text-xs text-muted-foreground mb-2">
          Scroll to see full list. Select PCA to add.
        </p>
        <div className="max-h-40 overflow-y-auto bg-muted/30 rounded p-2 pr-1 scrollbar-visible">
          {regularPCAs.map((s) => (
            <label key={s.id} className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-muted/50 rounded px-1">
              <input
                type="checkbox"
                checked={pcaIdsToAdd.has(s.id)}
                onChange={() => togglePCAToAdd(s.id)}
              />
              <span>{s.name}</span>
            </label>
          ))}
          {bufferPCAs.length > 0 && regularPCAs.length > 0 && (
            <hr className="border-border my-2" />
          )}
          {bufferPCAs.map((s) => (
            <label key={s.id} className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-muted/50 rounded px-1">
              <input
                type="checkbox"
                checked={pcaIdsToAdd.has(s.id)}
                onChange={() => togglePCAToAdd(s.id)}
              />
              <span>{s.name} (Buffer)</span>
            </label>
          ))}
          {eligiblePCAs.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No eligible PCA to add.</p>
          )}
        </div>

        {pcaIdsToAdd.size > 0 && (
          <div className="mt-3 w-full max-w-2xl bg-blue-50/40 border border-blue-100/60 rounded-xl p-3 shadow-sm">
            <h4 className="text-[13px] font-semibold text-blue-900/90 mb-2">
              Confirm to add {pcaIdsToAdd.size} PCA to {preference.team}:
            </h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {Array.from(pcaIdsToAdd).map(id => {
                const s = staff.find(st => st.id === id)
                if (!s) return null
                return (
                  <span key={id} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-blue-100/80 rounded-md text-xs font-medium text-blue-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    {s.name}
                    <button
                      type="button"
                      onClick={() => togglePCAToAdd(id)}
                      className="hover:text-blue-900 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 px-3 text-xs font-medium bg-[#0f172a] text-white rounded-md hover:bg-[#1e293b] transition-all"
                onClick={handleAddPCAs}
              >
                Add Selected ({pcaIdsToAdd.size})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200 rounded-md transition-all"
                onClick={() => setPcaIdsToAdd(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </section>

      <hr className="border-border" />

      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Configured Preferred PCA
        </h4>
        <p className="text-xs text-muted-foreground mb-2">(max 2)</p>
        {preferredPCA.length > 0 ? (
          <div className="bg-muted/30 rounded p-3 space-y-2">
            {preferredPCA.map((pcaId, idx) => {
              const pca = staff.find(s => s.id === pcaId)
              if (!pca) return null
              const showUpArrow = preferredPCA.length > 1 && idx > 0
              const showDownArrow = preferredPCA.length > 1 && idx < preferredPCA.length - 1
              return (
                <div key={pcaId} className="group flex items-center gap-2 py-1.5 rounded-md px-2 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-1">
                    {showUpArrow && (
                      <button
                        type="button"
                        onClick={() => movePCAInOrder(pcaId, 'up')}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <MoveUp className="h-4 w-4" />
                      </button>
                    )}
                    {showDownArrow && (
                      <button
                        type="button"
                        onClick={() => movePCAInOrder(pcaId, 'down')}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <MoveDown className="h-4 w-4" />
                      </button>
                    )}
                    {!showUpArrow && !showDownArrow && (
                      <span className="w-8" />
                    )}
                    <span className="text-sm font-medium w-6">{idx + 1}.</span>
                    <span className="text-sm">{pca.name}</span>
                  </div>

                  {/* Delete button - appears on hover, next to name */}
                  {pcaIdPendingDelete === pcaId ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleRemovePCA(pcaId)}
                      >
                        Confirm?
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPcaIdPendingDelete(null)}
                      >
                        ×
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip content={`Remove ${pca.name}`} side="right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPcaIdPendingDelete(pcaId)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">No preferred PCA configured.</p>
        )}
        {preferredPCA.length > 1 && (
          <p className="text-xs text-muted-foreground mt-2">
            Order: {preferredPCA.map(id => staff.find(s => s.id === id)?.name).join(' → ')}
          </p>
        )}
      </section>

      <hr className="border-border" />

      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Rank the preferred slots
        </h4>
        <p className="mb-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Top = most important</span> when floating PCAs are placed.
          <span className="font-medium text-foreground"> Ranked slots</span> get higher priority first;{' '}
          <span className="font-medium text-foreground">unranked slots</span> are used after that if the day still
          needs them.
          <br />
          Add only the slots you want ranked.
        </p>
        <RankedSlotPreferencesEditor
          rankedSlots={preferredSlots}
          onRankedSlotsChange={setPreferredSlots}
          gymSchedule={gymSchedule}
          avoidGymSchedule={avoidGymSchedule}
        />
      </section>

      <hr className="border-border" />

      <section>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Gym Schedule
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={gymSchedule == null ? 'none' : String(gymSchedule)}
            onValueChange={(v) => setGymSchedule(v === 'none' ? null : Number(v))}
          >
            <SelectTrigger className="h-10 w-[min(100%,12rem)]">
              <SelectValue placeholder="No gym schedule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No gym schedule</SelectItem>
              {[1, 2, 3, 4].map((slot) => (
                <SelectItem key={slot} value={String(slot)}>
                  {getSlotLabel(slot)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="inline-flex rounded-md border border-input overflow-hidden">
            <button
              type="button"
              onClick={() => setAvoidGymSchedule(true)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                avoidGymSchedule
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Avoid
            </button>
            <button
              type="button"
              onClick={() => setAvoidGymSchedule(false)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap border-l border-input ${
                !avoidGymSchedule
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Not to avoid
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {avoidGymSchedule
            ? "Floating PCA will avoid this team's gym interval when other paths exist."
            : 'Floating PCA can be assigned to this team’s gym interval.'}
        </p>
      </section>

      <div className="flex gap-2 pt-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

