'use client'

import { useState, useEffect, useMemo, type SetStateAction } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Staff, Team } from '@/types/staff'
import { Ward } from '@/types/allocation'
import { TEAMS } from '@/lib/utils/types'
import { Checkbox } from '@/components/ui/checkbox'
import {
  X,
  Users,
  GitMerge,
  ChevronRight,
  ChevronDown,
  Search,
  Plus,
  Info,
  User
} from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast-context'
import { useDashboardExpandableCard } from '@/hooks/useDashboardExpandableCard'
import { TeamMergePanel } from '@/components/dashboard/TeamMergePanel'
import { showDashboardSnapshotReminderToast } from '@/lib/utils/dashboardSnapshotReminderToast'
import { 
  computeMergedIntoMap, 
  getTeamMergeStatus, 
  computeDisplayNames,
  TeamMergeBadge 
} from '@/lib/utils/teamMergeHelpers'
import { filterStaff, groupStaffByTeam, sortStaffByName } from '@/lib/utils/staffFilters'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface TeamSettings {
  team: Team
  display_name: string
  merged_into?: Team | null
  merge_label_override?: string | null
  merged_pca_preferences_override?: Record<string, unknown> | null
}

interface PortionPopoverState {
  wardId: string
  wardName: string
  totalBeds: number
  currentBeds: number
  currentPortion: string | null
}

type Rank = 'APPT' | 'RPT' | 'PCA'
type RankBucket<T> = Record<Rank, T>

function createRankBucket<T>(factory: () => T): RankBucket<T> {
  return {
    APPT: factory(),
    RPT: factory(),
    PCA: factory(),
  }
}

function resolveSetStateAction<T>(prev: T, updater: SetStateAction<T>): T {
  return typeof updater === 'function' ? (updater as (value: T) => T)(prev) : updater
}

type StaffUpdatePayload = {
  team: Team | null
  floating?: boolean
  status?: 'active'
}

const rankStaffUpdateConfig: Record<Rank, {
  assign: (team: Team) => StaffUpdatePayload
  unassign: StaffUpdatePayload
}> = {
  APPT: {
    assign: (team) => ({ team }),
    unassign: { team: null },
  },
  RPT: {
    assign: (team) => ({ team }),
    unassign: { team: null },
  },
  PCA: {
    assign: (team) => ({ team, floating: false }),
    unassign: { team: null, floating: true },
  },
}

// Helper to compute fraction from numeric values
function computeFractionFromBeds(teamBeds: number, totalBeds: number): string | null {
  if (teamBeds === totalBeds || teamBeds === 0) return null
  
  const fraction = teamBeds / totalBeds
  const knownFractions = [
    { num: 1, den: 2, value: 0.5 },
    { num: 1, den: 3, value: 1/3 },
    { num: 2, den: 3, value: 2/3 },
    { num: 3, den: 4, value: 0.75 }
  ]
  
  for (const f of knownFractions) {
    if (Math.abs(fraction - f.value) < 0.01) {
      return `${f.num}/${f.den}`
    }
  }
  return null
}

// Helper to format ward label with portion
function formatWardLabel(ward: Ward, team: Team, editPortions?: Record<string, string | null>, editBeds?: Record<string, number>): string {
  // Use editPortions if provided (for edit mode)
  const portion = editPortions ? editPortions[ward.id] : ward.team_assignment_portions?.[team]
  if (portion) {
    return `${portion} ${ward.name}`
  }
  
  // Use editBeds if provided (for edit mode), otherwise use ward.team_assignments
  const teamBeds = editBeds ? (editBeds[ward.id] ?? ward.team_assignments[team] ?? 0) : (ward.team_assignments[team] || 0)
  if (teamBeds < ward.total_beds && teamBeds > 0) {
    const computedFraction = computeFractionFromBeds(teamBeds, ward.total_beds)
    if (computedFraction) {
      return `${computedFraction} ${ward.name}`
    }
  }
  
  return ward.name
}

export function TeamConfigurationPanel() {
  const [teamSettings, setTeamSettings] = useState<Record<Team, TeamSettings>>({} as Record<Team, TeamSettings>)
  const [staff, setStaff] = useState<Staff[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [loading, setLoading] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [saving, setSaving] = useState(false)
  const [portionPopover, setPortionPopover] = useState<PortionPopoverState | null>(null)
  const [activeTab, setActiveTab] = useState<'teams' | 'team-merge'>('teams')
  const supabase = createClientComponentClient()
  const toast = useToast()
  const teamConfigCheckboxClass =
    'data-[state=checked]:bg-blue-600 data-[state=checked]:text-white'
  const expand = useDashboardExpandableCard<string>({ animationMs: 220 })

  // Compute merged-into mapping and contributing teams
  const mergedIntoMap = useMemo(() => {
    return computeMergedIntoMap(Object.values(teamSettings))
  }, [teamSettings])

  // Compute display names from team settings
  const displayNames = useMemo(() => {
    return computeDisplayNames(Object.values(teamSettings))
  }, [teamSettings])

  // Edit state for current team
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editSelectedByRank, setEditSelectedByRank] = useState<RankBucket<Set<string>>>(() => createRankBucket(() => new Set<string>()))
  const [editRemovedByRank, setEditRemovedByRank] = useState<RankBucket<Set<string>>>(() => createRankBucket(() => new Set<string>()))
  const [pendingDeleteByRank, setPendingDeleteByRank] = useState<RankBucket<string | null>>(() => createRankBucket(() => null))

  // Backward-compatible aliases during migration (keeps JSX stable)
  const editSelectedAPPT = editSelectedByRank.APPT
  const editSelectedRPT = editSelectedByRank.RPT
  const editSelectedPCA = editSelectedByRank.PCA
  const editRemovedAPPT = editRemovedByRank.APPT
  const editRemovedRPT = editRemovedByRank.RPT
  const editRemovedPCA = editRemovedByRank.PCA
  const pendingDeleteAPPT = pendingDeleteByRank.APPT
  const pendingDeleteRPT = pendingDeleteByRank.RPT
  const pendingDeletePCA = pendingDeleteByRank.PCA

  const setEditSelectedAPPT = (updater: SetStateAction<Set<string>>) => {
    setEditSelectedByRank(prev => ({ ...prev, APPT: resolveSetStateAction(prev.APPT, updater) }))
  }
  const setEditSelectedRPT = (updater: SetStateAction<Set<string>>) => {
    setEditSelectedByRank(prev => ({ ...prev, RPT: resolveSetStateAction(prev.RPT, updater) }))
  }
  const setEditSelectedPCA = (updater: SetStateAction<Set<string>>) => {
    setEditSelectedByRank(prev => ({ ...prev, PCA: resolveSetStateAction(prev.PCA, updater) }))
  }
  const setEditRemovedAPPT = (updater: SetStateAction<Set<string>>) => {
    setEditRemovedByRank(prev => ({ ...prev, APPT: resolveSetStateAction(prev.APPT, updater) }))
  }
  const setEditRemovedRPT = (updater: SetStateAction<Set<string>>) => {
    setEditRemovedByRank(prev => ({ ...prev, RPT: resolveSetStateAction(prev.RPT, updater) }))
  }
  const setEditRemovedPCA = (updater: SetStateAction<Set<string>>) => {
    setEditRemovedByRank(prev => ({ ...prev, PCA: resolveSetStateAction(prev.PCA, updater) }))
  }
  const setPendingDeleteAPPT = (updater: SetStateAction<string | null>) => {
    setPendingDeleteByRank(prev => ({ ...prev, APPT: resolveSetStateAction(prev.APPT, updater) }))
  }
  const setPendingDeleteRPT = (updater: SetStateAction<string | null>) => {
    setPendingDeleteByRank(prev => ({ ...prev, RPT: resolveSetStateAction(prev.RPT, updater) }))
  }
  const setPendingDeletePCA = (updater: SetStateAction<string | null>) => {
    setPendingDeleteByRank(prev => ({ ...prev, PCA: resolveSetStateAction(prev.PCA, updater) }))
  }

  // New state for consolidated "Add Members" section
  const [showAddMembersPanel, setShowAddMembersPanel] = useState(false)
  const [addMembersSearchQuery, setAddMembersSearchQuery] = useState('')
  const [expandedSourceTeams, setExpandedSourceTeams] = useState<Set<string>>(new Set(['unassigned']))
  const [editSelectedWards, setEditSelectedWards] = useState<Set<string>>(new Set())
  const [editWardBeds, setEditWardBeds] = useState<Record<string, number>>({})
  const [editWardPortions, setEditWardPortions] = useState<Record<string, string | null>>({})
  const [showWardSelector, setShowWardSelector] = useState(false)
  const [newlyAddedWardIds, setNewlyAddedWardIds] = useState<Set<string>>(new Set())
  const [pendingDeleteWardId, setPendingDeleteWardId] = useState<string | null>(null)

  const resetRankEditState = () => {
    setEditSelectedByRank(createRankBucket(() => new Set<string>()))
    setEditRemovedByRank(createRankBucket(() => new Set<string>()))
    setPendingDeleteByRank(createRankBucket(() => null))
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [settingsRes, staffRes, wardsRes] = await Promise.all([
        supabase.from('team_settings').select('*'),
        supabase.from('staff').select('*').order('name'),
        supabase.from('wards').select('*').order('name'),
      ])

      if (settingsRes.data) {
        const settingsMap: Record<Team, TeamSettings> = {} as Record<Team, TeamSettings>
        settingsRes.data.forEach((s: any) => {
          settingsMap[s.team as Team] = {
            team: s.team,
            display_name: s.display_name,
            merged_into: s.merged_into ?? null,
            merge_label_override: s.merge_label_override ?? null,
            merged_pca_preferences_override: s.merged_pca_preferences_override ?? null,
          }
        })
        // Ensure all teams have settings
        TEAMS.forEach(team => {
          if (!settingsMap[team]) {
            settingsMap[team] = {
              team,
              display_name: team,
              merged_into: null,
              merge_label_override: null,
              merged_pca_preferences_override: null,
            }
          }
        })
        setTeamSettings(settingsMap)
      }

      if (staffRes.data) {
        setStaff(staffRes.data as Staff[])
      }

      if (wardsRes.data) {
        const wardsData = (wardsRes.data as any[]).map(w => ({
          id: w.id,
          name: w.name,
          total_beds: w.total_beds,
          team_assignments: w.team_assignments || {},
          team_assignment_portions: w.team_assignment_portions || {},
        }))
        setWards(wardsData)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team)
    expand.open(team)
    const settings = teamSettings[team]
    setEditDisplayName(settings?.display_name || team)

    // Clear selections and pending delete state
    resetRankEditState()

    // Load current ward assignments
    const selectedWardsSet = new Set<string>()
    const wardBedsMap: Record<string, number> = {}
    const wardPortionsMap: Record<string, string | null> = {}
    
    wards.forEach(ward => {
      const teamBeds = ward.team_assignments[team] || 0
      if (teamBeds > 0) {
        selectedWardsSet.add(ward.id)
        wardBedsMap[ward.id] = teamBeds
        wardPortionsMap[ward.id] = ward.team_assignment_portions?.[team] || null
      }
    })
    
    setEditSelectedWards(selectedWardsSet)
    setEditWardBeds(wardBedsMap)
    setEditWardPortions(wardPortionsMap)
    setNewlyAddedWardIds(new Set())
    setPendingDeleteWardId(null)
  }

  const handleCancelEdit = () => {
    expand.close(() => {
      setEditingTeam(null)
      setPortionPopover(null)
      setShowAddMembersPanel(false)
      setAddMembersSearchQuery('')
      setExpandedSourceTeams(new Set(['unassigned']))
      setShowWardSelector(false)
      setNewlyAddedWardIds(new Set())
      setPendingDeleteWardId(null)
    })
  }

  const handleSave = async () => {
    if (!editingTeam) return

    setSaving(true)
    try {
      const runChecked = async (
        label: string,
        op: PromiseLike<{ error: unknown }>
      ) => {
        const res = await op
        if (res.error) {
          throw new Error(`${label}: ${String(res.error)}`)
        }
      }

      // Validate ward over-allocation
      const wardTotals: Record<string, number> = {}
      wards.forEach(ward => {
        let sum = 0
        TEAMS.forEach(team => {
          if (team === editingTeam) {
            sum += editWardBeds[ward.id] || 0
          } else {
            sum += ward.team_assignments[team] || 0
          }
        })
        wardTotals[ward.id] = sum
      })

      const overAllocatedWards = wards.filter(ward => {
        const total = wardTotals[ward.id] || 0
        return total > ward.total_beds
      })

      if (overAllocatedWards.length > 0) {
        const details = overAllocatedWards
          .map(w => `${w.name}: ${wardTotals[w.id]} / ${w.total_beds}`)
          .join(' • ')
        toast.warning('Cannot save: ward bed over-allocation.', details)
        setSaving(false)
        return
      }

      // Save team settings
      await runChecked(
        `Save team settings for ${editingTeam}`,
        supabase
          .from('team_settings')
          .upsert({
            team: editingTeam,
            display_name: editDisplayName,
            updated_at: new Date().toISOString(),
          })
      )

      // Update staff assignments by rank
      const selectedByRank: RankBucket<Set<string>> = {
        APPT: editSelectedAPPT,
        RPT: editSelectedRPT,
        PCA: editSelectedPCA,
      }
      const removedByRank: RankBucket<Set<string>> = {
        APPT: editRemovedAPPT,
        RPT: editRemovedRPT,
        PCA: editRemovedPCA,
      }

      for (const rank of ['APPT', 'RPT', 'PCA'] as const) {
        const config = rankStaffUpdateConfig[rank]
        for (const staffId of removedByRank[rank]) {
          await runChecked(
            `Unassign ${rank} staff ${staffId}`,
            supabase
              .from('staff')
              .update(config.unassign)
              .eq('id', staffId)
          )
        }
        for (const staffId of selectedByRank[rank]) {
          const selectedStaff = staff.find((s) => s.id === staffId)
          const assignPayload: StaffUpdatePayload =
            selectedStaff?.status === 'inactive'
              ? { ...config.assign(editingTeam), status: 'active' }
              : config.assign(editingTeam)
          await runChecked(
            `Assign ${rank} staff ${staffId} to ${editingTeam}`,
            supabase
              .from('staff')
              .update(assignPayload)
              .eq('id', staffId)
          )
        }
      }

      // Update ward assignments
      for (const ward of wards) {
        const isSelected = editSelectedWards.has(ward.id)
        const currentBeds = ward.team_assignments[editingTeam] || 0
        const newBeds = editWardBeds[ward.id] || 0
        const newPortion = editWardPortions[ward.id] || null

        if (isSelected) {
          // Update team_assignments
          const updatedAssignments = { ...ward.team_assignments }
          updatedAssignments[editingTeam] = newBeds
          
          // Update team_assignment_portions
          const updatedPortions = { ...(ward.team_assignment_portions || {}) }
          if (newPortion) {
            updatedPortions[editingTeam] = newPortion
          } else {
            delete updatedPortions[editingTeam]
          }

          await runChecked(
            `Update ward assignment for ${ward.name}`,
            supabase
              .from('wards')
              .update({
                team_assignments: updatedAssignments,
                team_assignment_portions: updatedPortions,
                updated_at: new Date().toISOString(),
              })
              .eq('id', ward.id)
          )
        } else if (currentBeds > 0) {
          // Remove team assignment
          const updatedAssignments = { ...ward.team_assignments }
          updatedAssignments[editingTeam] = 0
          
          const updatedPortions = { ...(ward.team_assignment_portions || {}) }
          delete updatedPortions[editingTeam]

          await runChecked(
            `Remove ward assignment for ${ward.name}`,
            supabase
              .from('wards')
              .update({
                team_assignments: updatedAssignments,
                team_assignment_portions: updatedPortions,
                updated_at: new Date().toISOString(),
              })
              .eq('id', ward.id)
          )
        }
      }

      await loadData()
      expand.close(() => {
        setEditingTeam(null)
        setPortionPopover(null)
      })
      showDashboardSnapshotReminderToast(toast, 'Team configuration saved.')
    } catch (err) {
      console.error('Error saving team configuration:', err)
      toast.error('Error saving team configuration.', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleWardToggle = (wardId: string) => {
    const ward = wards.find(w => w.id === wardId)
    if (!ward) return

    const newSelected = new Set(editSelectedWards)
    if (newSelected.has(wardId)) {
      newSelected.delete(wardId)
      const newBeds = { ...editWardBeds }
      const newPortions = { ...editWardPortions }
      delete newBeds[wardId]
      delete newPortions[wardId]
      setEditWardBeds(newBeds)
      setEditWardPortions(newPortions)
    } else {
      newSelected.add(wardId)
      const newBeds = { ...editWardBeds }
      newBeds[wardId] = ward.total_beds // Default to full ward
      setEditWardBeds(newBeds)
    }
    setEditSelectedWards(newSelected)
  }

  const handlePortionClick = (wardId: string) => {
    const ward = wards.find(w => w.id === wardId)
    if (!ward || !editingTeam) return

    const currentBeds = editWardBeds[wardId] || ward.team_assignments[editingTeam] || 0
    const currentPortion = editWardPortions[wardId] || ward.team_assignment_portions?.[editingTeam] || null

    setPortionPopover({
      wardId,
      wardName: ward.name,
      totalBeds: ward.total_beds,
      currentBeds,
      currentPortion,
    })
  }

  const handlePortionSave = (portion: string | null, actualBeds: number) => {
    if (!portionPopover) return

    const newBeds = { ...editWardBeds }
    const newPortions = { ...editWardPortions }
    
    newBeds[portionPopover.wardId] = actualBeds
    if (portion) {
      newPortions[portionPopover.wardId] = portion
    } else {
      delete newPortions[portionPopover.wardId]
    }

    setEditWardBeds(newBeds)
    setEditWardPortions(newPortions)
    setPortionPopover(null)
  }

  // Get staff for a team (for preview) - only active staff
  const getTeamStaff = (team: Team, rank: 'APPT' | 'RPT' | 'PCA') => {
    return filterStaff(staff, {
      rank,
      team,
      activeOnly: true,
      floating: rank === 'PCA' ? false : undefined,
    })
  }

  // Get wards for a team (for preview)
  const getTeamWards = (team: Team) => {
    return wards.filter(w => (w.team_assignments[team] || 0) > 0)
  }

  // Calculate total beds for a team
  const getTotalBeds = (team: Team) => {
    return wards.reduce((sum, w) => sum + (w.team_assignments[team] || 0), 0)
  }

  // Get selected wards total beds (for edit mode)
  const getSelectedWardsTotalBeds = () => {
    return Array.from(editSelectedWards).reduce((sum, wardId) => {
      return sum + (editWardBeds[wardId] || 0)
    }, 0)
  }

  // Get unassigned staff for a rank (team === null)
  const getUnassignedStaff = (rank: 'APPT' | 'RPT' | 'PCA') => {
    return filterStaff(staff, {
      rank,
      team: null,
      activeOnly: true,
      floating: rank === 'PCA' ? false : undefined,
    })
  }

  // Get staff from other teams for transfer
  const getStaffFromOtherTeams = (rank: 'APPT' | 'RPT' | 'PCA', excludeTeam: Team) => {
    return filterStaff(staff, {
      rank,
      activeOnly: true,
      floating: rank === 'PCA' ? false : undefined,
    }).filter(s => s.team !== null && s.team !== excludeTeam)
  }

  // Sort wards with selected at top
  const sortWardsWithSelectedFirst = (selectedIds: Set<string>) => {
    const selected = wards.filter(w => selectedIds.has(w.id))
    const unselected = wards.filter(w => !selectedIds.has(w.id))
    return [...selected, ...unselected]
  }

  if (loading) {
    return (
      <div className="pt-6">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <>
      <div className="pt-6 space-y-4">
        <div className="mb-4 inline-flex items-center gap-1 rounded-md border bg-background p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('teams')}
              className={[
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                activeTab === 'teams'
                  ? 'bg-amber-100 text-amber-950'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              ].join(' ')}
            >
              Teams
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('team-merge')}
              className={[
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                activeTab === 'team-merge'
                  ? 'bg-amber-100 text-amber-950'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              ].join(' ')}
            >
              Team merge
            </button>
          </div>

          {activeTab === 'teams' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TEAMS.map((team) => {
              const settings = teamSettings[team]
              const isEditing = editingTeam === team
              const teamAPPT = getTeamStaff(team, 'APPT')
              const teamRPT = getTeamStaff(team, 'RPT')
              const teamPCA = getTeamStaff(team, 'PCA')
              const teamWards = getTeamWards(team)
              const totalBeds = getTotalBeds(team)

              if (isEditing) {
                // Expanded edit mode - flat design with inline expand for "Add Members"
                const currentAPPT = getTeamStaff(team, 'APPT')
                const currentRPT = getTeamStaff(team, 'RPT')
                const currentPCA = getTeamStaff(team, 'PCA')
                const unassignedAPPT = getUnassignedStaff('APPT')
                const unassignedRPT = getUnassignedStaff('RPT')
                const unassignedPCA = getUnassignedStaff('PCA')
                const staffFromOtherTeams = {
                  APPT: getStaffFromOtherTeams('APPT', team),
                  RPT: getStaffFromOtherTeams('RPT', team),
                  PCA: getStaffFromOtherTeams('PCA', team),
                }
                const sortedWards = sortWardsWithSelectedFirst(editSelectedWards)
                const selectedUnassignedAPPT = Array.from(editSelectedAPPT)
                  .map(id => unassignedAPPT.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedUnassignedRPT = Array.from(editSelectedRPT)
                  .map(id => unassignedRPT.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedUnassignedPCA = Array.from(editSelectedPCA)
                  .map(id => unassignedPCA.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedTransferAPPT = Array.from(editSelectedAPPT)
                  .map(id => staffFromOtherTeams.APPT.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedTransferRPT = Array.from(editSelectedRPT)
                  .map(id => staffFromOtherTeams.RPT.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedTransferPCA = Array.from(editSelectedPCA)
                  .map(id => staffFromOtherTeams.PCA.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const inactiveByRank = {
                  APPT: filterStaff(staff, { rank: 'APPT' }).filter(s => s.status === 'inactive'),
                  RPT: filterStaff(staff, { rank: 'RPT' }).filter(s => s.status === 'inactive'),
                  PCA: filterStaff(staff, { rank: 'PCA', floating: false }).filter(s => s.status === 'inactive'),
                }
                const selectedInactiveAPPT = Array.from(editSelectedAPPT)
                  .map(id => inactiveByRank.APPT.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedInactiveRPT = Array.from(editSelectedRPT)
                  .map(id => inactiveByRank.RPT.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedInactivePCA = Array.from(editSelectedPCA)
                  .map(id => inactiveByRank.PCA.find(s => s.id === id))
                  .filter((s): s is Staff => !!s)
                const selectedInactiveTotal =
                  selectedInactiveAPPT.length + selectedInactiveRPT.length + selectedInactivePCA.length
                const selectedTransferTotal =
                  selectedTransferAPPT.length + selectedTransferRPT.length + selectedTransferPCA.length

                return (
                  <Card
                    key={team}
                    ref={expand.expandedRef}
                    className={`p-4 border-2 col-span-full ${expand.getExpandedAnimationClass(team)}`}
                  >
                    {/* Header with workflow guidance banner */}
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-semibold">Edit: {displayNames[team] || team}</h3>
                      <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>

                    {/* Workflow guidance banner */}
                      <div className="mt-3 w-full bg-blue-50/40 border border-blue-100/60 rounded-xl p-3 shadow-sm">
                      <div className="flex items-start gap-2 text-sm text-blue-900">
                        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                        <span>
                          To add new staff, use the <strong>Staff Profile</strong> panel. Set their rank and team property there, then return here to assign them.
                        </span>
                      </div>
                    </div>

                    <div className="space-y-5">
                      {/* Team name - flat, minimal nesting */}
                      <div className="space-y-1.5">
                        <Label htmlFor="team-name" className="text-sm font-medium">
                          Team name
                        </Label>
                        <Input
                          id="team-name"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="h-9 w-24 max-w-[120px]"
                        />
                      </div>

                      <RankMemberSection
                        title="Team head (APPT)"
                        assignedCount={currentAPPT.length - editRemovedAPPT.size + editSelectedAPPT.size}
                        currentStaff={currentAPPT}
                        removedIds={editRemovedAPPT}
                        pendingDeleteId={pendingDeleteAPPT}
                        removeTooltip="Remove from team"
                        unassignedSelectedStaff={selectedUnassignedAPPT}
                        transferSelectedStaff={selectedTransferAPPT}
                        inactiveSelectedStaff={selectedInactiveAPPT}
                        displayNames={displayNames}
                        emptyText="No APPT staff assigned."
                        onSetPendingDelete={setPendingDeleteAPPT}
                        onCancelPendingDelete={() => setPendingDeleteAPPT(null)}
                        onConfirmRemoveCurrent={(staffId) => {
                          setEditRemovedAPPT(prev => {
                            const next = new Set(prev)
                            next.add(staffId)
                            return next
                          })
                          setPendingDeleteAPPT(null)
                        }}
                        onRemoveSelected={(staffId) => {
                          setEditSelectedAPPT(prev => {
                            const next = new Set(prev)
                            next.delete(staffId)
                            return next
                          })
                        }}
                      />

                      <RankMemberSection
                        title="Team's RPT"
                        assignedCount={currentRPT.length - editRemovedRPT.size + editSelectedRPT.size}
                        currentStaff={currentRPT}
                        removedIds={editRemovedRPT}
                        pendingDeleteId={pendingDeleteRPT}
                        removeTooltip="Remove"
                        unassignedSelectedStaff={selectedUnassignedRPT}
                        transferSelectedStaff={selectedTransferRPT}
                        inactiveSelectedStaff={selectedInactiveRPT}
                        displayNames={displayNames}
                        emptyText="No RPT staff assigned."
                        onSetPendingDelete={setPendingDeleteRPT}
                        onCancelPendingDelete={() => setPendingDeleteRPT(null)}
                        onConfirmRemoveCurrent={(staffId) => {
                          setEditRemovedRPT(prev => {
                            const next = new Set(prev)
                            next.add(staffId)
                            return next
                          })
                          setPendingDeleteRPT(null)
                        }}
                        onRemoveSelected={(staffId) => {
                          setEditSelectedRPT(prev => {
                            const next = new Set(prev)
                            next.delete(staffId)
                            return next
                          })
                        }}
                      />

                      <RankMemberSection
                        title="Non-floating PCA"
                        assignedCount={currentPCA.length - editRemovedPCA.size + editSelectedPCA.size}
                        currentStaff={currentPCA}
                        removedIds={editRemovedPCA}
                        pendingDeleteId={pendingDeletePCA}
                        removeTooltip="Remove"
                        unassignedSelectedStaff={selectedUnassignedPCA}
                        transferSelectedStaff={selectedTransferPCA}
                        inactiveSelectedStaff={selectedInactivePCA}
                        displayNames={displayNames}
                        emptyText="No PCA staff assigned."
                        onSetPendingDelete={setPendingDeletePCA}
                        onCancelPendingDelete={() => setPendingDeletePCA(null)}
                        onConfirmRemoveCurrent={(staffId) => {
                          setEditRemovedPCA(prev => {
                            const next = new Set(prev)
                            next.add(staffId)
                            return next
                          })
                          setPendingDeletePCA(null)
                        }}
                        onRemoveSelected={(staffId) => {
                          setEditSelectedPCA(prev => {
                            const next = new Set(prev)
                            next.delete(staffId)
                            return next
                          })
                        }}
                      />

                      {/* Consolidated Add Members Section */}
                      <div className="pt-4 border-t">
                        {showAddMembersPanel ? (
                          <div className="rounded-md border bg-muted/20 p-4 space-y-4">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">Add Team Members</span>
                                <span className="text-xs text-muted-foreground">
                                  ({unassignedAPPT.length + unassignedRPT.length + unassignedPCA.length} unassigned)
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setShowAddMembersPanel(false)
                                  setAddMembersSearchQuery('')
                                }}
                              >
                                <ChevronDown className="mr-1 h-3.5 w-3.5" />
                                Collapse
                              </Button>
                            </div>

                            {/* Search */}
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search staff by name…"
                                value={addMembersSearchQuery}
                                onChange={(e) => setAddMembersSearchQuery(e.target.value)}
                                className="pl-9 h-9 max-w-xs"
                              />
                            </div>

                            {/* Unassigned Section - Always Expanded */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                <ChevronDown className="h-3.5 w-3.5" />
                                Unassigned
                                <span className="text-muted-foreground">({unassignedAPPT.length + unassignedRPT.length + unassignedPCA.length})</span>
                              </div>
                              <div className="pl-4 space-y-1 max-h-40 overflow-y-auto pr-1">
                                {/* Filter unassigned staff using filterStaff utility */}
                                {(() => {
                                  const allUnassigned = filterStaff(staff, {
                                    rank: ['APPT', 'RPT', 'PCA'],
                                    team: null,
                                    activeOnly: true,
                                  }).filter(s => s.rank !== 'PCA' || !s.floating)
                                  
                                  const filtered = addMembersSearchQuery.trim()
                                    ? filterStaff(allUnassigned, { searchQuery: addMembersSearchQuery, activeOnly: true })
                                    : allUnassigned
                                  
                                  if (filtered.length === 0) {
                                    return (
                                      <p className="text-sm text-muted-foreground py-2">
                                        {addMembersSearchQuery.trim() ? 'No matching staff found.' : 'No unassigned staff available.'}
                                      </p>
                                    )
                                  }
                                  
                                  return filtered.map((s) => {
                                    const isSelected = editSelectedAPPT.has(s.id) || editSelectedRPT.has(s.id) || editSelectedPCA.has(s.id)
                                    const setSelected = s.rank === 'APPT' ? setEditSelectedAPPT : s.rank === 'RPT' ? setEditSelectedRPT : setEditSelectedPCA
                                    
                                    return (
                                      <label
                                        key={s.id}
                                        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer"
                                      >
                                        <Checkbox
                                          className={teamConfigCheckboxClass}
                                          checked={isSelected}
                                          onCheckedChange={(checked) => {
                                            const newSet = new Set(s.rank === 'APPT' ? editSelectedAPPT : s.rank === 'RPT' ? editSelectedRPT : editSelectedPCA)
                                            if (checked) newSet.add(s.id)
                                            else newSet.delete(s.id)
                                            setSelected(newSet)
                                          }}
                                        />
                                        <span className="text-sm">{s.name}</span>
                                        <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0">
                                          {s.rank}
                                        </Badge>
                                      </label>
                                    )
                                  })
                                })()}
                              </div>
                            </div>

                            {/* From Other Teams - Masonry 2-Column Layout */}
                            {(() => {
                              const fromOtherTeams = filterStaff(staff, {
                                rank: ['APPT', 'RPT', 'PCA'],
                                activeOnly: true,
                              }).filter(s => s.team !== null && s.team !== team && (s.rank !== 'PCA' || !s.floating))
                              
                              if (fromOtherTeams.length === 0) return null
                              
                              // Group by source team
                              const bySourceTeam = new Map<string, typeof fromOtherTeams>()
                              fromOtherTeams.forEach(s => {
                                const key = s.team!
                                const list = bySourceTeam.get(key) || []
                                list.push(s)
                                bySourceTeam.set(key, list)
                              })
                              
                              return (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2 border-t">
                                    From Other Teams
                                  </div>
                                  {/* Masonry-style 2-column grid */}
                                  <div className="grid grid-cols-2 gap-3">
                                    {Array.from(bySourceTeam.entries()).map(([sourceTeam, teamStaff]) => {
                                      const isExpanded = expandedSourceTeams.has(sourceTeam) || (addMembersSearchQuery.trim() && filterStaff(teamStaff, { searchQuery: addMembersSearchQuery, activeOnly: true }).length > 0)
                                      const filteredTeamStaff = addMembersSearchQuery.trim()
                                        ? filterStaff(teamStaff, { searchQuery: addMembersSearchQuery, activeOnly: true })
                                        : teamStaff

                                      if (filteredTeamStaff.length === 0 && addMembersSearchQuery.trim()) return null

                                      return (
                                        <div
                                          key={sourceTeam}
                                          className={`bg-muted/20 rounded-md p-2 ${isExpanded ? 'col-span-2' : ''}`}
                                        >
                                          {/* Clickable team header - minimal text style */}
                                          <button
                                            className="w-full flex items-center justify-between text-sm hover:text-primary transition-colors"
                                            onClick={() => {
                                              setExpandedSourceTeams(prev => {
                                                const next = new Set(prev)
                                                if (next.has(sourceTeam)) next.delete(sourceTeam)
                                                else next.add(sourceTeam)
                                                return next
                                              })
                                            }}
                                          >
                                            <div className="flex items-center gap-1.5">
                                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                              <span className="font-medium">{displayNames[sourceTeam as Team] || sourceTeam}</span>
                                              <span className="text-xs text-muted-foreground">({filteredTeamStaff.length})</span>
                                            </div>
                                          </button>

                                          {/* Expanded content - auto height, also shown when search matches */}
                                          {isExpanded && (
                                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                                              {filteredTeamStaff.map((s) => {
                                                const isSelected = editSelectedAPPT.has(s.id) || editSelectedRPT.has(s.id) || editSelectedPCA.has(s.id)
                                                const setSelected = s.rank === 'APPT' ? setEditSelectedAPPT : s.rank === 'RPT' ? setEditSelectedRPT : setEditSelectedPCA

                                                return (
                                                  <label
                                                    key={s.id}
                                                    className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-accent/50 cursor-pointer"
                                                  >
                                                    <Checkbox
                                                      className={teamConfigCheckboxClass}
                                                      checked={isSelected}
                                                      onCheckedChange={(checked) => {
                                                        const newSet = new Set(s.rank === 'APPT' ? editSelectedAPPT : s.rank === 'RPT' ? editSelectedRPT : editSelectedPCA)
                                                        if (checked) newSet.add(s.id)
                                                        else newSet.delete(s.id)
                                                        setSelected(newSet)
                                                      }}
                                                    />
                                                    <span className="text-sm truncate">{s.name}</span>
                                                    <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0">
                                                      {s.rank}
                                                    </Badge>
                                                  </label>
                                                )
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })()}
                            {(() => {
                              const search = addMembersSearchQuery.trim()
                              if (!search) return null

                              const inactiveMatches = filterStaff(staff, {
                                rank: ['APPT', 'RPT', 'PCA'],
                                searchQuery: search,
                              }).filter(s => s.status === 'inactive' && (s.rank !== 'PCA' || !s.floating))

                              if (inactiveMatches.length === 0) return null

                              return (
                                <div className="space-y-2 pt-2 border-t">
                                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Inactive Staff
                                    <span className="text-muted-foreground">({inactiveMatches.length})</span>
                                  </div>
                                  <div className="pl-4 space-y-1 max-h-40 overflow-y-auto pr-1">
                                    {inactiveMatches.map((s) => {
                                      const isSelected = editSelectedAPPT.has(s.id) || editSelectedRPT.has(s.id) || editSelectedPCA.has(s.id)
                                      const setSelected = s.rank === 'APPT' ? setEditSelectedAPPT : s.rank === 'RPT' ? setEditSelectedRPT : setEditSelectedPCA

                                      return (
                                        <label
                                          key={s.id}
                                          className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer"
                                        >
                                          <Checkbox
                                            className={teamConfigCheckboxClass}
                                            checked={isSelected}
                                            onCheckedChange={(checked) => {
                                              const newSet = new Set(s.rank === 'APPT' ? editSelectedAPPT : s.rank === 'RPT' ? editSelectedRPT : editSelectedPCA)
                                              if (checked) newSet.add(s.id)
                                              else newSet.delete(s.id)
                                              setSelected(newSet)
                                            }}
                                          />
                                          <span className="text-sm">{s.name}</span>
                                          <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0">
                                            {s.rank}
                                          </Badge>
                                          <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground border-muted-foreground/30 flex-shrink-0">
                                            Inactive
                                          </Badge>
                                          {s.team && (
                                            <span className="text-xs text-muted-foreground truncate">
                                              Last team: {displayNames[s.team] || s.team}
                                            </span>
                                          )}
                                        </label>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => {
                              setShowAddMembersPanel(true)
                              setAddMembersSearchQuery('')
                            }}
                            disabled={unassignedAPPT.length + unassignedRPT.length + unassignedPCA.length === 0 &&
                              staffFromOtherTeams.APPT.length + staffFromOtherTeams.RPT.length + staffFromOtherTeams.PCA.length === 0}
                          >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Add team members
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              ({unassignedAPPT.length + unassignedRPT.length + unassignedPCA.length} unassigned)
                            </span>
                          </Button>
                        )}
                      </div>

                      {/* Ward assignment - inline expand design */}
                      <div className="space-y-3 pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Wards assigned</Label>
                          <span className="text-xs text-muted-foreground">
                            ({editSelectedWards.size} selected)
                          </span>
                        </div>
                        
                        {/* Selected wards - always visible */}
                        <div className="space-y-2">
                          {wards.filter(w => editSelectedWards.has(w.id)).map((ward) => {
                            const teamBeds = editWardBeds[ward.id] || 0
                            const portion = editWardPortions[ward.id] || null
                            const isNew = newlyAddedWardIds.has(ward.id)
                            const isPendingDelete = pendingDeleteWardId === ward.id
                            
                            return (
                              <div
                                key={ward.id}
                                className={`rounded-md p-3 ${isNew ? 'bg-green-50 border border-green-200' : 'bg-muted/30'}`}
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-medium text-sm ${isNew ? 'text-green-900' : ''}`}>{ward.name}</span>
                                  {isNew && (
                                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-300 text-green-700">
                                      +Assign
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    ({ward.total_beds} beds total)
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <Label className="text-xs mb-0 whitespace-nowrap">Beds:</Label>
                                  <Input
                                    type="number"
                                    value={teamBeds}
                                    onChange={(e) => {
                                      const value = parseInt(e.target.value, 10) || 0
                                      const newBeds = { ...editWardBeds }
                                      newBeds[ward.id] = Math.max(0, Math.min(value, ward.total_beds))
                                      setEditWardBeds(newBeds)
                                    }}
                                    className="w-20 h-8 text-sm"
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setPortionPopover({
                                        wardId: ward.id,
                                        wardName: ward.name,
                                        totalBeds: ward.total_beds,
                                        currentBeds: teamBeds,
                                        currentPortion: portion,
                                      })
                                    }}
                                    className="text-xs h-8"
                                  >
                                    {portion ? 'Edit portion' : 'Set portion'}
                                  </Button>
                                  {isPendingDelete ? (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          const newSet = new Set(editSelectedWards)
                                          const newBeds = { ...editWardBeds }
                                          newSet.delete(ward.id)
                                          delete newBeds[ward.id]
                                          setEditSelectedWards(newSet)
                                          setEditWardBeds(newBeds)
                                          setNewlyAddedWardIds(prev => {
                                            const next = new Set(prev)
                                            next.delete(ward.id)
                                            return next
                                          })
                                          setPendingDeleteWardId(null)
                                        }}
                                      >
                                        Confirm?
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setPendingDeleteWardId(null)}
                                      >
                                        ×
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={`h-7 w-7 flex-shrink-0 ${isNew ? 'text-green-700 hover:text-green-900' : 'text-muted-foreground hover:text-destructive'}`}
                                      onClick={() => setPendingDeleteWardId(ward.id)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          
                          {editSelectedWards.size === 0 && (
                            <p className="text-sm text-muted-foreground py-2">
                              No wards assigned to this team.
                            </p>
                          )}
                        </div>
                        
                        {/* Total beds summary */}
                        {editSelectedWards.size > 0 && (
                          <div className="text-sm">
                            <span className="font-medium">Total beds: {getSelectedWardsTotalBeds()}</span>
                          </div>
                        )}
                        
                        {/* Inline expand - Add ward selector */}
                        {(() => {
                          const unselectedWards = wards.filter(w => !editSelectedWards.has(w.id))
                          
                          if (unselectedWards.length === 0) return null
                          
                          return (
                            <div className="pt-1">
                              {showWardSelector ? (
                                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Select wards to assign</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => setShowWardSelector(false)}
                                    >
                                      <ChevronDown className="mr-1 h-3.5 w-3.5" />
                                      Collapse
                                    </Button>
                                  </div>
                                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                    {unselectedWards.map((ward) => (
                                      <label
                                        key={ward.id}
                                        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer"
                                      >
                                        <Checkbox
                                          className={teamConfigCheckboxClass}
                                          checked={false}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              const newSet = new Set(editSelectedWards)
                                              const newBeds = { ...editWardBeds }
                                              newSet.add(ward.id)
                                              newBeds[ward.id] = ward.total_beds
                                              setEditSelectedWards(newSet)
                                              setEditWardBeds(newBeds)
                                              setNewlyAddedWardIds(prev => new Set(prev).add(ward.id))
                                            }
                                          }}
                                        />
                                        <span className="text-sm">{ward.name}</span>
                                        <span className="text-xs text-muted-foreground">({ward.total_beds} beds)</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  onClick={() => setShowWardSelector(true)}
                                >
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Assign wards
                                  <span className="ml-1.5 text-xs text-muted-foreground">({unselectedWards.length} available)</span>
                                </Button>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>

                    {selectedInactiveTotal > 0 && (
                      <div className="mt-3 w-full max-w-2xl bg-amber-50/40 border border-amber-100/60 rounded-xl p-3 shadow-sm">
                        <div className="flex items-start gap-2 text-sm text-amber-900">
                          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                          <span>
                            Saving will activate {selectedInactiveTotal} inactive {selectedInactiveTotal === 1 ? 'staff member' : 'staff members'} and assign them to this team.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action buttons - black only for Save */}
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                      <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-[#0f172a] hover:bg-[#1e293b] text-white"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </Card>
                )
              }

              // Collapsed preview mode
              const mergeStatus = getTeamMergeStatus(team, mergedIntoMap)
              const displayName = displayNames[team] || team

              return (
                <Card key={team} data-team={team} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-lg">{displayName}</h4>
                      <TeamMergeBadge mergeStatus={mergeStatus} displayNames={displayNames} />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditTeam(team)}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="space-y-1 text-sm text-foreground">
                    {teamAPPT.length > 0 && (
                      <p>
                        <span className="font-medium text-muted-foreground">Heads:</span>{' '}
                        <span className="font-medium">{teamAPPT.map(s => s.name).join(', ')}</span>
                      </p>
                    )}
                    {teamRPT.length > 0 && (
                      <p>
                        <span className="font-medium text-muted-foreground">RPT:</span>{' '}
                        <span className="font-medium">{teamRPT.map(s => s.name).join(', ')}</span>
                      </p>
                    )}
                    {teamPCA.length > 0 && (
                      <p>
                        <span className="font-medium text-muted-foreground">Non-floating PCA:</span>{' '}
                        <span className="font-medium">{teamPCA.map(s => s.name).join(', ')}</span>
                      </p>
                    )}
                    {teamWards.length > 0 && (
                      <p>
                        <span className="font-medium text-muted-foreground">Wards:</span>{' '}
                        <span>{teamWards.map(w => {
                          const label = formatWardLabel(w, team)
                          const beds = w.team_assignments[team] || 0
                          return `${label} (${beds})`
                        }).join(', ')}</span>
                      </p>
                    )}
                    <p className="font-semibold pt-1">
                      Total bed counts: {totalBeds}
                    </p>
                  </div>
                </Card>
              )
            })}
            </div>
          ) : (
            <TeamMergePanel />
          )}
      </div>

      {/* Portion Popover Dialog */}
      {portionPopover && (
        <PortionPopoverDialog
          popover={portionPopover}
          onSave={handlePortionSave}
          onCancel={() => setPortionPopover(null)}
        />
      )}
    </>
  )
}

interface RankMemberSectionProps {
  title: string
  assignedCount: number
  currentStaff: Staff[]
  removedIds: Set<string>
  pendingDeleteId: string | null
  removeTooltip: string
  unassignedSelectedStaff: Staff[]
  transferSelectedStaff: Staff[]
  inactiveSelectedStaff: Staff[]
  displayNames: Partial<Record<Team, string>>
  emptyText: string
  onSetPendingDelete: (staffId: string) => void
  onCancelPendingDelete: () => void
  onConfirmRemoveCurrent: (staffId: string) => void
  onRemoveSelected: (staffId: string) => void
}

function RankMemberSection({
  title,
  assignedCount,
  currentStaff,
  removedIds,
  pendingDeleteId,
  removeTooltip,
  unassignedSelectedStaff,
  transferSelectedStaff,
  inactiveSelectedStaff,
  displayNames,
  emptyText,
  onSetPendingDelete,
  onCancelPendingDelete,
  onConfirmRemoveCurrent,
  onRemoveSelected,
}: RankMemberSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium">{title}</Label>
        <span className="text-xs text-muted-foreground">({assignedCount} assigned)</span>
      </div>

      <div className="space-y-1">
        {currentStaff.map((s) => {
          if (removedIds.has(s.id)) return null

          return (
            <div key={s.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
              <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm truncate">{s.name}</span>
              {pendingDeleteId === s.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onConfirmRemoveCurrent(s.id)}
                  >
                    Confirm?
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onCancelPendingDelete}
                  >
                    ×
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip content={removeTooltip} side="right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onSetPendingDelete(s.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                </div>
              )}
            </div>
          )
        })}

        {unassignedSelectedStaff.map((s) => (
          <div key={`new-${s.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-900 truncate">{s.name}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-300 text-green-700">
                +Add
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-700 hover:text-green-900"
                onClick={() => onRemoveSelected(s.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {transferSelectedStaff.length > 0 && (
          <p className="text-xs text-amber-600 pt-1">
            Pending transfer — applies only after Save.
          </p>
        )}

        {transferSelectedStaff.map((s) => (
          <div key={`transfer-${s.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-900 truncate">{s.name}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-300 text-green-700">
                Transfer
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-700 hover:text-green-900"
                onClick={() => onRemoveSelected(s.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {inactiveSelectedStaff.map((s) => (
          <div key={`inactive-${s.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-900 truncate">{s.name}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-300 text-green-700">
                Inactive to Active
              </Badge>
              {s.team && (
                <span className="text-xs text-green-700">
                  Last team: {displayNames[s.team] || s.team}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-700 hover:text-green-900"
                onClick={() => onRemoveSelected(s.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {currentStaff.length === 0 && unassignedSelectedStaff.length === 0 && transferSelectedStaff.length === 0 && inactiveSelectedStaff.length === 0 && (
          <p className="text-sm text-muted-foreground py-1 px-2">{emptyText}</p>
        )}
      </div>
    </div>
  )
}

function PortionPopoverDialog({
  popover,
  onSave,
  onCancel,
}: {
  popover: PortionPopoverState
  onSave: (portion: string | null, actualBeds: number) => void
  onCancel: () => void
}) {
  const [portion, setPortion] = useState(popover.currentPortion || '')
  const [actualBeds, setActualBeds] = useState(popover.currentBeds)
  const [portionError, setPortionError] = useState<string | null>(null)
  const [actualBedsError, setActualBedsError] = useState<string | null>(null)
  const [manualOverride, setManualOverride] = useState(false)

  useEffect(() => {
    if (!manualOverride && portion) {
      // Auto-calculate beds from portion
      const match = portion.match(/^(\d+)\/(\d+)$/)
      if (match) {
        const numerator = parseInt(match[1], 10)
        const denominator = parseInt(match[2], 10)
        if (denominator > 0) {
          const calculated = Math.round((numerator / denominator) * popover.totalBeds)
          setActualBeds(calculated)
          setPortionError(null)
        }
      }
    }
  }, [portion, popover.totalBeds, manualOverride])

  const handlePortionChange = (value: string) => {
    setPortion(value)
    setManualOverride(false)
    
    // Validate format
    if (value && !/^\d+\/\d+$/.test(value)) {
      setPortionError('Portion must be in format x/y (e.g., 1/3, 2/3)')
      return
    }
    
    const match = value.match(/^(\d+)\/(\d+)$/)
    if (match) {
      const denominator = parseInt(match[2], 10)
      if (denominator === 0) {
        setPortionError('Denominator cannot be zero')
        return
      }
    }
    
    setPortionError(null)
  }

  const handleActualBedsChange = (value: number) => {
    setActualBeds(value)
    setManualOverride(true)
    // Clear error when user types
    if (actualBedsError && value <= popover.totalBeds) {
      setActualBedsError(null)
    }
  }

  const handleSave = () => {
    setActualBedsError(null)
    setPortionError(null)

    // Validation
    if (portion && !/^\d+\/\d+$/.test(portion)) {
      setPortionError('Portion must be in format x/y (e.g., 1/3, 2/3)')
      return
    }

    if (portion) {
      const match = portion.match(/^(\d+)\/(\d+)$/)
      if (match) {
        const denominator = parseInt(match[2], 10)
        if (denominator === 0) {
          setPortionError('Denominator cannot be zero')
          return
        }
      }
    }

    // Validate actual beds cannot exceed total beds
    if (actualBeds > popover.totalBeds) {
      setActualBedsError(`Actual beds (${actualBeds}) cannot exceed ward total beds (${popover.totalBeds})`)
      return
    }

    if (portion && !portion.trim()) {
      setPortionError('If portion mode is enabled, portion must be provided')
      return
    }

    onSave(portion ? portion.trim() : null, actualBeds)
  }

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Portion for {popover.wardName}</DialogTitle>
            <button
              onClick={onCancel}
              className="p-1 hover:bg-accent rounded"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Bed stat</Label>
            <p className="text-sm text-muted-foreground">{popover.totalBeds}</p>
          </div>

          <div>
            <Label htmlFor="portion">
              Portion
            </Label>
            <Input
              id="portion"
              value={portion}
              onChange={(e) => handlePortionChange(e.target.value)}
              placeholder="e.g., 1/3, 2/3, 3/4"
              className="mt-1"
            />
            {portionError && (
              <p className="text-sm text-destructive mt-1">{portionError}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Enter fraction in format x/y (e.g., 1/3, 2/3, 3/4)
            </p>
          </div>

          <div>
            <Label htmlFor="actual-beds">Actual bed number</Label>
            <Input
              id="actual-beds"
              type="number"
              min="0"
              max={popover.totalBeds}
              value={actualBeds}
              onChange={(e) => handleActualBedsChange(parseInt(e.target.value, 10) || 0)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Auto-calculated from portion; you can manually override
            </p>
          </div>

          {actualBedsError && (
            <p className="text-sm text-destructive mt-1">{actualBedsError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
