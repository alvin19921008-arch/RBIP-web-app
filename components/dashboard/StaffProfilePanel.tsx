'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Staff, StaffRank, Team, StaffStatus, SpecialProgram as StaffSpecialProgram } from '@/types/staff'
import { TEAMS } from '@/lib/utils/types'
import { SpecialProgram } from '@/types/allocation'
import { Edit2, Trash2, Plus, X, Loader2, ArrowUpDown, ChevronDown } from 'lucide-react'
import { StaffEditDialog } from './StaffEditDialog'
import { BufferStaffConvertDialog } from '@/components/allocation/BufferStaffConvertDialog'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-provider'
import { SearchWithSuggestions, type SearchSuggestionItem } from '@/components/ui/SearchWithSuggestions'
import { DashboardConfigMetaBanner } from '@/components/dashboard/DashboardConfigMetaBanner'

const RANK_ORDER: StaffRank[] = ['SPT', 'APPT', 'RPT', 'PCA', 'workman']

type RankSortValue = 'APPT' | 'RPT' | 'PCA' | 'SPT'
type StaffSortConfig =
  | { column: null; value: null }
  | { column: 'rank'; value: RankSortValue }
  | { column: 'team'; value: Team }
  | { column: 'floating'; value: 'yes' | 'no' }
  | { column: 'floorPCA'; value: 'upper' | 'lower' | 'both' }
  | { column: 'specialProgram'; value: StaffSpecialProgram }

export function StaffProfilePanel() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [specialPrograms, setSpecialPrograms] = useState<SpecialProgram[]>([])
  const [rbipSupervisorIds, setRbipSupervisorIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState({
    rank: null as StaffRank[] | null,
    specialProgram: null as StaffSpecialProgram[] | null,
    floorPCA: null as 'upper' | 'lower' | 'both' | null,
    status: null as 'active' | 'inactive' | 'buffer' | null,
  })
  const [sortConfig, setSortConfig] = useState<StaffSortConfig>({ column: null, value: null })
  const [search, setSearch] = useState('')
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState<string>('')
  const [savingNameId, setSavingNameId] = useState<string | null>(null)
  const [inactiveTogglePopover, setInactiveTogglePopover] = useState<{ staffId: string; name: string; position: { x: number; y: number } } | null>(null)
  const [openStatusMenu, setOpenStatusMenu] = useState<{ staffId: string; left: number; top: number } | null>(null)
  const [showBufferSlotDialog, setShowBufferSlotDialog] = useState(false)
  const [pcaStaffForBuffer, setPcaStaffForBuffer] = useState<Staff | null>(null)
  const supabase = createClientComponentClient()
  const toast = useToast()

  // Close status menu when clicking elsewhere / scroll / resize.
  useEffect(() => {
    if (!openStatusMenu) return

    const onMouseDown = (e: MouseEvent) => {
      const anchor = document.getElementById(`status-menu-anchor:${openStatusMenu.staffId}`)
      if (anchor && anchor.contains(e.target as Node)) return
      const menuEl = document.getElementById('staff-status-menu')
      if (menuEl && menuEl.contains(e.target as Node)) return
      setOpenStatusMenu(null)
    }
    const close = () => setOpenStatusMenu(null)

    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [openStatusMenu])

  useEffect(() => {
    loadData()
  }, [])

  // Helper functions for display (used in sorting)
  const getFloorPCADisplay = (staff: Staff): string => {
    if (staff.rank !== 'PCA' || !staff.floor_pca || staff.floor_pca.length === 0) return '--'
    if (staff.floor_pca.includes('upper') && staff.floor_pca.includes('lower')) return 'Both'
    if (staff.floor_pca.includes('upper')) return 'Upper'
    if (staff.floor_pca.includes('lower')) return 'Lower'
    return '--'
  }

  const getSpecialProgramDisplay = (staff: Staff): string => {
    if (!staff.special_program || staff.special_program.length === 0) return '--'
    return staff.special_program.join(', ')
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [staffRes, programsRes, sptAllocationsRes] = await Promise.all([
        supabase.from('staff').select('*').order('rank').order('name'),
        supabase.from('special_programs').select('*').order('name'),
        supabase.from('spt_allocations').select('staff_id, is_rbip_supervisor').eq('is_rbip_supervisor', true),
      ])

      if (staffRes.data) {
        setStaff(staffRes.data as Staff[])
      }
      if (programsRes.data) {
        setSpecialPrograms(programsRes.data as SpecialProgram[])
      }
      if (sptAllocationsRes.data) {
        const supervisorIds = new Set(
          sptAllocationsRes.data
            .filter((alloc: any) => alloc.is_rbip_supervisor)
            .map((alloc: any) => alloc.staff_id)
        )
        setRbipSupervisorIds(supervisorIds)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter staff
  const filteredStaff = staff.filter((s) => {
    const q = search.trim().toLowerCase()
    if (q && !s.name.toLowerCase().includes(q)) return false
    if (filters.rank && !filters.rank.includes(s.rank)) return false
    if (filters.status !== null) {
      const staffStatus = s.status ?? 'active'
      if (staffStatus !== filters.status) return false
    }
    if (filters.specialProgram && filters.specialProgram.length > 0) {
      const hasProgram = s.special_program?.some((prog) => filters.specialProgram!.includes(prog))
      if (!hasProgram) return false
    }
    if (filters.floorPCA && s.rank === 'PCA' && s.floor_pca) {
      if (filters.floorPCA === 'both') {
        if (!(s.floor_pca.includes('upper') && s.floor_pca.includes('lower'))) return false
      } else {
        if (!s.floor_pca.includes(filters.floorPCA)) return false
      }
    }
    if (filters.floorPCA && s.rank !== 'PCA') return false
    return true
  })

  const staffSearchItems = useMemo<SearchSuggestionItem[]>(() => {
    return staff
      .map((s) => ({
        id: s.id,
        label: s.name,
        subLabel: [s.rank, s.team ?? '', s.status ?? 'active'].filter(Boolean).join(' • '),
        keywords: [s.name, s.rank, s.team ?? '', s.status ?? 'active', ...(s.special_program ?? [])].filter(Boolean),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [staff])

  // Apply sorting
  const filteredAndSortedStaff = [...filteredStaff].sort((a, b) => {
    // Primary sort: RBIP supervisors first - always applied
    const aIsSupervisor = rbipSupervisorIds.has(a.id)
    const bIsSupervisor = rbipSupervisorIds.has(b.id)
    if (aIsSupervisor !== bIsSupervisor) {
      return aIsSupervisor ? -1 : 1
    }

    // Secondary sort: status order (active → buffer → inactive) - always applied
    const statusOrder: Record<string, number> = { active: 0, buffer: 1, inactive: 2 }
    const aStatus = a.status ?? 'active'
    const bStatus = b.status ?? 'active'
    const aStatusOrder = statusOrder[aStatus] ?? 999
    const bStatusOrder = statusOrder[bStatus] ?? 999
    if (aStatusOrder !== bStatusOrder) {
      return aStatusOrder - bStatusOrder
    }

    // Tertiary sort: "cycle/pin-to-top" sorting
    if (sortConfig.column) {
      switch (sortConfig.column) {
        case 'rank': {
          const targetRank = sortConfig.value
          const aIsTarget = a.rank === targetRank
          const bIsTarget = b.rank === targetRank
          if (aIsTarget !== bIsTarget) return aIsTarget ? -1 : 1
          break
        }
        case 'team': {
          const targetTeam = sortConfig.value
          const aIsTarget = a.team === targetTeam
          const bIsTarget = b.team === targetTeam
          if (aIsTarget !== bIsTarget) return aIsTarget ? -1 : 1
          break
        }
        case 'floating': {
          const target = sortConfig.value
          const wantsFloating = target === 'yes'
          const aGroup =
            a.rank === 'PCA' ? (a.floating === wantsFloating ? 0 : 1) : 2
          const bGroup =
            b.rank === 'PCA' ? (b.floating === wantsFloating ? 0 : 1) : 2
          if (aGroup !== bGroup) return aGroup - bGroup
          break
        }
        case 'floorPCA': {
          const target = sortConfig.value
          const hasTarget = (s: Staff) => {
            if (s.rank !== 'PCA') return false
            const fp = s.floor_pca ?? []
            if (target === 'both') return fp.includes('upper') && fp.includes('lower')
            return fp.includes(target)
          }
          const aIsTarget = hasTarget(a)
          const bIsTarget = hasTarget(b)
          if (aIsTarget !== bIsTarget) return aIsTarget ? -1 : 1
          break
        }
        case 'specialProgram': {
          const target = sortConfig.value
          const aIsTarget = a.special_program?.includes(target) ?? false
          const bIsTarget = b.special_program?.includes(target) ?? false
          if (aIsTarget !== bIsTarget) return aIsTarget ? -1 : 1
          break
        }
      }
    }

    // Quaternary sort: default rank order (for non-sorted columns)
    const aRankIndex = RANK_ORDER.indexOf(a.rank)
    const bRankIndex = RANK_ORDER.indexOf(b.rank)
    if (aRankIndex !== bRankIndex) {
      return aRankIndex - bRankIndex
    }

    // Quinary sort: name
    return a.name.localeCompare(b.name)
  })

  // Split into active, buffer, and inactive
  const activeStaff = filteredAndSortedStaff.filter((s) => (s.status ?? 'active') === 'active')
  const bufferStaff = filteredAndSortedStaff.filter((s) => s.status === 'buffer')
  const inactiveStaff = filteredAndSortedStaff.filter((s) => s.status === 'inactive')

  const handleInlineNameEdit = (staff: Staff) => {
    setEditingNameId(staff.id)
    setEditingNameValue(staff.name)
  }

  const handleInlineNameSave = async (staffId: string) => {
    const newName = editingNameValue.trim()
    if (!newName) {
      // Revert if empty
      setEditingNameId(null)
      return
    }

    setSavingNameId(staffId)
    try {
      const { error } = await supabase
        .from('staff')
        .update({ name: newName })
        .eq('id', staffId)

      if (error) {
        console.error('Error updating name:', error)
        toast.error('Failed to update name. Please try again.')
        // Revert to original
        const originalStaff = staff.find((s) => s.id === staffId)
        if (originalStaff) setEditingNameValue(originalStaff.name)
      } else {
        // Success - update local state
        setStaff((prev) => prev.map((s) => (s.id === staffId ? { ...s, name: newName } : s)))
        setEditingNameId(null)
        toast.success('Name updated.')
      }
    } catch (err) {
      console.error('Error updating name:', err)
      toast.error('Failed to update name. Please try again.')
    } finally {
      setSavingNameId(null)
    }
  }

  const handleInlineNameCancel = () => {
    setEditingNameId(null)
    setEditingNameValue('')
  }

  const handleStatusChange = async (staffId: string, newStatus: 'active' | 'inactive' | 'buffer') => {
    const staffMember = staff.find((s) => s.id === staffId)
    if (!staffMember) return
    
    // For any staff converting to buffer (from inactive), show convert dialog
    if (newStatus === 'buffer' && staffMember.status === 'inactive') {
      setPcaStaffForBuffer(staffMember)
      setShowBufferSlotDialog(true)
      return
    }
    
    // For other status changes, update directly
    await updateStaffStatus(staffId, newStatus, staffMember)
  }
  
  const updateStaffStatus = async (staffId: string, newStatus: 'active' | 'inactive' | 'buffer', staffMember: Staff, bufferFTE?: number) => {
    try {
      // If setting to inactive or buffer, also set team to null
      const updateData: { status: 'active' | 'inactive' | 'buffer'; team?: Team | null; buffer_fte?: number | null } = {
        status: newStatus,
      }
      
      if (newStatus === 'inactive' || newStatus === 'buffer') {
        updateData.team = null
      }
      
      // For buffer staff, set buffer_fte if provided
      if (newStatus === 'buffer' && bufferFTE !== undefined) {
        updateData.buffer_fte = bufferFTE
      }
      
      const { error } = await supabase
        .from('staff')
        .update(updateData)
        .eq('id', staffId)

      if (error) {
        console.error('Error updating status:', error)
        toast.error('Failed to update status. Please try again.')
      } else {
        // Update local state
        setStaff((prev) => prev.map((s) => 
          s.id === staffId 
            ? { ...s, status: newStatus, team: (newStatus === 'inactive' || newStatus === 'buffer') ? null : s.team, buffer_fte: newStatus === 'buffer' && bufferFTE !== undefined ? bufferFTE : s.buffer_fte } 
            : s
        ))
        toast.success('Status updated.')
      }
    } catch (err) {
      console.error('Error updating status:', err)
      toast.error('Failed to update status. Please try again.')
    }
  }
  
  const handleBufferConvertSave = () => {
    // Reload data after conversion
    loadData()
    setShowBufferSlotDialog(false)
    setPcaStaffForBuffer(null)
  }

  const handleBatchStatusChange = async (status: 'active' | 'inactive' | 'buffer') => {
    if (selectedStaffIds.size === 0) return

    try {
      // If setting to inactive or buffer, also set team to null
      const updateData: { status: 'active' | 'inactive' | 'buffer'; team?: Team | null } = {
        status,
      }
      
      if (status === 'inactive' || status === 'buffer') {
        updateData.team = null
      }

      const { error } = await supabase
        .from('staff')
        .update(updateData)
        .in('id', Array.from(selectedStaffIds))

      if (error) {
        console.error('Error batch updating status:', error)
        toast.error('Failed to update status. Please try again.')
      } else {
        // Update local state
        setStaff((prev) =>
          prev.map((s) => 
            selectedStaffIds.has(s.id) 
              ? { ...s, status, team: (status === 'inactive' || status === 'buffer') ? null : s.team } 
              : s
          )
        )
        toast.success(`Updated status for ${selectedStaffIds.size} staff.`)
        setSelectedStaffIds(new Set())
      }
    } catch (err) {
      console.error('Error batch updating status:', err)
      toast.error('Failed to update status. Please try again.')
    }
  }

  const handleDelete = async () => {
    if (selectedStaffIds.size === 0) return

    const count = selectedStaffIds.size
    if (!confirm(`Are you sure you want to delete ${count} staff member${count > 1 ? 's' : ''}? This action is irreversible.`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .in('id', Array.from(selectedStaffIds))

      if (error) {
        console.error('Error deleting staff:', error)
        toast.error('Failed to delete staff. Please try again.')
      } else {
        await loadData()
        toast.success(`Deleted ${count} staff member${count > 1 ? 's' : ''}.`)
        setSelectedStaffIds(new Set())
      }
    } catch (err) {
      console.error('Error deleting staff:', err)
      toast.error('Failed to delete staff. Please try again.')
    }
  }

  const handleDeleteSingle = async (staffId: string, staffName: string) => {
    if (!confirm(`Are you sure you want to delete ${staffName}? This action is irreversible.`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffId)

      if (error) {
        console.error('Error deleting staff:', error)
        toast.error('Failed to delete staff. Please try again.')
      } else {
        await loadData()
        toast.success(`Deleted ${staffName}.`)
        // Remove from selection if selected
        setSelectedStaffIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(staffId)
          return newSet
        })
      }
    } catch (err) {
      console.error('Error deleting staff:', err)
      toast.error('Failed to delete staff. Please try again.')
    }
  }

  const handleSaveStaff = async (staffData: Partial<Staff> & { isRbipSupervisor?: boolean; specialty?: string | null }) => {
    try {
      const { isRbipSupervisor, specialty, ...staffFields } = staffData
      const staffId = editingStaff?.id

      // If setting to inactive or buffer, also set team to null
      if (staffFields.status === 'inactive' || staffFields.status === 'buffer') {
        staffFields.team = null
      }

      if (staffId) {
        // Update existing staff
        const { error: staffError } = await supabase
          .from('staff')
          .update(staffFields)
          .eq('id', staffId)

        if (staffError) throw staffError

        // Handle SPT allocation updates
        if (staffFields.rank === 'SPT') {
          const { data: existingAllocation } = await supabase
            .from('spt_allocations')
            .select('id')
            .eq('staff_id', staffId)
            .maybeSingle()

          if (existingAllocation) {
            // Update existing SPT allocation
            await supabase
              .from('spt_allocations')
              .update({
                specialty: specialty ?? null,
                is_rbip_supervisor: isRbipSupervisor ?? false,
              })
              .eq('id', existingAllocation.id)
          } else if (specialty || isRbipSupervisor) {
            // Create SPT allocation if it doesn't exist but has SPT-specific data
            await supabase.from('spt_allocations').insert({
              staff_id: staffId,
              specialty: specialty ?? null,
              is_rbip_supervisor: isRbipSupervisor ?? false,
              teams: [],
              weekdays: [],
              slots: {},
              fte_addon: 0,
              substitute_team_head: false,
              status: 'active' as StaffStatus,
            })
          }
        }
      } else {
        // Insert new staff
        const { data: newStaff, error: staffError } = await supabase
          .from('staff')
          .insert({
            ...staffFields,
            status: staffFields.status ?? 'active',
          })
          .select()
          .single()

        if (staffError) throw staffError

        // Create SPT allocation if needed
        if (staffFields.rank === 'SPT' && (specialty || isRbipSupervisor)) {
          await supabase.from('spt_allocations').insert({
            staff_id: newStaff.id,
            specialty: specialty ?? null,
            is_rbip_supervisor: isRbipSupervisor ?? false,
            teams: [],
            weekdays: [],
            slots: {},
            fte_addon: 0,
            substitute_team_head: false,
            status: 'active' as StaffStatus,
          })
        }
      }

      await loadData()
      setEditingStaff(null)
      toast.success(staffId ? 'Staff updated.' : 'Staff created.')
    } catch (err) {
      console.error('Error saving staff:', err)
      toast.error('Failed to save staff. Please try again.')
    }
  }

  const handleSort = (column: 'rank' | 'team' | 'floating' | 'floorPCA' | 'specialProgram') => {
    // Rank: APPT -> RPT -> PCA -> SPT -> APPT (loop)
    if (column === 'rank') {
      const cycle: RankSortValue[] = ['APPT', 'RPT', 'PCA', 'SPT']
      if (sortConfig.column !== 'rank') {
        setSortConfig({ column: 'rank', value: cycle[0] })
        return
      }
      const current = sortConfig.value
      const idx = cycle.indexOf(current)
      const next = cycle[(idx + 1) % cycle.length]
      setSortConfig({ column: 'rank', value: next })
      return
    }

    // Team: each click pins 1 team to the top; after last team -> reset neutral
    if (column === 'team') {
      const cycle = TEAMS as readonly Team[]
      if (cycle.length === 0) return
      if (sortConfig.column !== 'team') {
        setSortConfig({ column: 'team', value: cycle[0] })
        return
      }
      const current = sortConfig.value
      const idx = cycle.indexOf(current)
      if (idx === -1 || idx === cycle.length - 1) {
        setSortConfig({ column: null, value: null })
        return
      }
      setSortConfig({ column: 'team', value: cycle[idx + 1] })
      return
    }

    // Floating: Yes -> No -> reset neutral
    if (column === 'floating') {
      if (sortConfig.column !== 'floating') {
        setSortConfig({ column: 'floating', value: 'yes' })
        return
      }
      const current = sortConfig.value
      if (current === 'yes') {
        setSortConfig({ column: 'floating', value: 'no' })
        return
      }
      setSortConfig({ column: null, value: null })
      return
    }

    // Floor PCA: Upper -> Lower -> Both -> reset neutral
    if (column === 'floorPCA') {
      const cycle: Array<'upper' | 'lower' | 'both'> = ['upper', 'lower', 'both']
      if (sortConfig.column !== 'floorPCA') {
        setSortConfig({ column: 'floorPCA', value: cycle[0] })
        return
      }
      const current = sortConfig.value
      const idx = cycle.indexOf(current)
      if (idx === -1 || idx === cycle.length - 1) {
        setSortConfig({ column: null, value: null })
        return
      }
      setSortConfig({ column: 'floorPCA', value: cycle[idx + 1] })
      return
    }

    // Special Program: each click pins 1 program to the top; after last program -> reset neutral
    if (column === 'specialProgram') {
      const cycle = availableSpecialPrograms
      if (!cycle || cycle.length === 0) {
        setSortConfig({ column: null, value: null })
        return
      }
      if (sortConfig.column !== 'specialProgram') {
        setSortConfig({ column: 'specialProgram', value: cycle[0] })
        return
      }
      const current = sortConfig.value
      const idx = cycle.indexOf(current)
      if (idx === -1 || idx === cycle.length - 1) {
        setSortConfig({ column: null, value: null })
        return
      }
      setSortConfig({ column: 'specialProgram', value: cycle[idx + 1] })
    }
  }

  const getSortIcon = (column: 'rank' | 'team' | 'floating' | 'floorPCA' | 'specialProgram') => {
    const isActive = sortConfig.column === column
    return (
      <ArrowUpDown
        className={cn('h-3 w-3 ml-1', isActive ? 'text-foreground' : 'text-muted-foreground')}
      />
    )
  }

  const toggleStaffSelection = (staffId: string) => {
    setSelectedStaffIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(staffId)) {
        newSet.delete(staffId)
      } else {
        newSet.add(staffId)
      }
      return newSet
    })
  }

  const toggleAllSelection = () => {
    if (selectedStaffIds.size === filteredAndSortedStaff.length) {
      setSelectedStaffIds(new Set())
    } else {
      setSelectedStaffIds(new Set(filteredAndSortedStaff.map((s) => s.id)))
    }
  }

  const renderStaffRow = (staffMember: Staff) => {
    const isSelected = selectedStaffIds.has(staffMember.id)
    const isEditingName = editingNameId === staffMember.id
    const isSavingName = savingNameId === staffMember.id

    return (
      <tr key={staffMember.id} className={cn('border-b hover:bg-accent/50', (staffMember.status ?? 'active') === 'inactive' && 'opacity-60')}>
        <td className="p-2">
          <div className={cn((staffMember.status ?? 'active') === 'inactive' && 'opacity-100')}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleStaffSelection(staffMember.id)}
              className="h-4 w-4"
            />
          </div>
        </td>
        <td className="p-2">
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                onBlur={() => handleInlineNameSave(staffMember.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleInlineNameSave(staffMember.id)
                  } else if (e.key === 'Escape') {
                    handleInlineNameCancel()
                  }
                }}
                autoFocus
                className="px-2 py-1 border rounded text-sm"
                disabled={isSavingName}
              />
              {isSavingName && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          ) : (
            <button
              onClick={() => handleInlineNameEdit(staffMember)}
              className="text-left hover:underline cursor-pointer text-sm font-medium"
            >
              {staffMember.name}
              {rbipSupervisorIds.has(staffMember.id) && (
                <span className="ml-1 text-yellow-500" title="RBIP Supervisor">★</span>
              )}
            </button>
          )}
        </td>
        <td className="p-2 text-sm">{staffMember.rank}</td>
        <td className="p-2 text-sm">{staffMember.team || '--'}</td>
        <td className="p-2 text-sm">{staffMember.rank === 'PCA' ? (staffMember.floating ? 'Yes' : 'No') : '--'}</td>
        <td className="p-2 text-sm">{getFloorPCADisplay(staffMember)}</td>
        <td className="p-2 text-sm">{getSpecialProgramDisplay(staffMember)}</td>
        <td className="p-2">
          {(() => {
            const currentStatus = staffMember.status ?? 'active'
            const getStatusColor = (status: 'active' | 'inactive' | 'buffer') => {
              switch (status) {
                case 'active':
                  return 'bg-green-500 hover:bg-green-600'
                case 'inactive':
                  return 'bg-gray-400 hover:bg-gray-500'
                case 'buffer':
                  return 'bg-[#a4b1ed] hover:bg-[#8b9ae8]'
                default:
                  return 'bg-gray-400 hover:bg-gray-500'
              }
            }
            
            const label = currentStatus === 'active' ? 'Active' : currentStatus === 'inactive' ? 'Inactive' : 'Buffer'
            return (
              <div className="flex items-center gap-1">
                <div
                  className={cn(
                    // Badge-style pill sized to text (no fixed min-width)
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent text-white',
                    getStatusColor(currentStatus)
                  )}
                >
                  {label}
                </div>
                <div className="relative" id={`status-menu-anchor:${staffMember.id}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7',
                      currentStatus === 'active'
                        ? 'focus-visible:ring-green-500'
                        : currentStatus === 'inactive'
                          ? 'focus-visible:ring-gray-400'
                          : 'focus-visible:ring-[#a4b1ed]'
                    )}
                    title="Change status"
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                      const desiredLeft = rect.left
                      const desiredTop = rect.bottom + 6
                      const menuWidth = 160
                      const clampedLeft = Math.max(8, Math.min(desiredLeft, window.innerWidth - menuWidth - 8))
                      setOpenStatusMenu((prev) =>
                        prev?.staffId === staffMember.id ? null : { staffId: staffMember.id, left: clampedLeft, top: desiredTop }
                      )
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })()}
        </td>
        <td className="p-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditingStaff(staffMember)}
              className="p-1 hover:bg-accent rounded"
              title="Edit staff"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDeleteSingle(staffMember.id, staffMember.name)}
              className="p-1 hover:bg-accent rounded text-destructive hover:text-destructive"
              title="Delete staff"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  // Get unique special program names from staff
  const availableSpecialPrograms: StaffSpecialProgram[] = Array.from(
    new Set(staff.flatMap((s) => s.special_program || []).filter(Boolean))
  ).sort()

  // Calculate headcount by rank (excluding inactive and buffer staff)
  const activeStaffOnly = staff.filter((s) => (s.status ?? 'active') === 'active')
  const headcountByRank = {
    SPT: activeStaffOnly.filter((s) => s.rank === 'SPT').length,
    APPT: activeStaffOnly.filter((s) => s.rank === 'APPT').length,
    RPT: activeStaffOnly.filter((s) => s.rank === 'RPT').length,
    PCA: activeStaffOnly.filter((s) => s.rank === 'PCA').length,
    workman: activeStaffOnly.filter((s) => s.rank === 'workman').length,
  }
  const totalActiveStaff = activeStaffOnly.length

  return (
    <>
      <div className="pt-6 space-y-4">
        <DashboardConfigMetaBanner />
          <div className="mb-4 pb-4 border-b">
            <div className="flex flex-wrap gap-4 text-sm" style={{ color: 'black' }}>
              <span>
                <span className="font-semibold">SPT:</span> {headcountByRank.SPT}
              </span>
              <span>
                <span className="font-semibold">APPT:</span> {headcountByRank.APPT}
              </span>
              <span>
                <span className="font-semibold">RPT:</span> {headcountByRank.RPT}
              </span>
              <span>
                <span className="font-semibold">PCA:</span> {headcountByRank.PCA}
              </span>
              {headcountByRank.workman > 0 && (
                <span>
                  <span className="font-semibold">Workman:</span> {headcountByRank.workman}
                </span>
              )}
              <span className="font-semibold">
                Total: {totalActiveStaff}
              </span>
            </div>
          </div>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Rank</label>
                  <select
                    value={filters.rank && filters.rank.length === 1 ? filters.rank[0] : 'all'}
                    onChange={(e) => {
                      const value = e.target.value
                      setFilters((prev) => ({
                        ...prev,
                        rank: value === 'all' ? null : [value as StaffRank],
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="all">All</option>
                    {RANK_ORDER.map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Special Program</label>
                  <select
                    value={filters.specialProgram && filters.specialProgram.length === 1 ? filters.specialProgram[0] : 'all'}
                    onChange={(e) => {
                      const value = e.target.value
                      setFilters((prev) => ({
                        ...prev,
                        specialProgram: value === 'all' ? null : [value as StaffSpecialProgram],
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="all">All</option>
                    {availableSpecialPrograms.map((prog) => (
                      <option key={prog} value={prog}>
                        {prog}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Floor PCA</label>
                  <select
                    value={filters.floorPCA || 'all'}
                    onChange={(e) => {
                      const value = e.target.value
                      setFilters((prev) => ({
                        ...prev,
                        floorPCA: value === 'all' ? null : (value as 'upper' | 'lower' | 'both'),
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="all">All</option>
                    <option value="upper">Upper</option>
                    <option value="lower">Lower</option>
                    <option value="both">Both</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={filters.status === null ? 'all' : filters.status}
                    onChange={(e) => {
                      const value = e.target.value
                      setFilters((prev) => ({
                        ...prev,
                        status: value === 'all' ? null : (value as 'active' | 'inactive' | 'buffer'),
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="buffer">Buffer</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button onClick={() => setEditingStaff({} as Staff)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Staff
                  </Button>
                  {selectedStaffIds.size > 0 && (
                    <>
                      <div className="flex gap-2">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleBatchStatusChange(e.target.value as 'active' | 'inactive' | 'buffer')
                            }
                          }}
                          className="h-9 px-3 py-2 border rounded-md text-sm"
                          defaultValue=""
                        >
                          <option value="" disabled>Set Status...</option>
                          <option value="active">Set Active ({selectedStaffIds.size})</option>
                          <option value="inactive">Set Inactive ({selectedStaffIds.size})</option>
                          <option value="buffer">Set Buffer ({selectedStaffIds.size})</option>
                        </select>
                      </div>
                      <Button variant="destructive" onClick={handleDelete}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedStaffIds.size})
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <SearchWithSuggestions
                    value={search}
                    onValueChange={setSearch}
                    items={staffSearchItems}
                    placeholder="Search staff name…"
                    className="w-[260px]"
                    onSelect={(it) => setSearch(it.label)}
                  />
                </div>
              </div>

              {/* Staff Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-y-auto max-h-[calc(100vh-400px)] scrollbar-visible">
                  <table className="w-full">
                    <thead className="bg-muted sticky top-0 z-10">
                    <tr>
                      <th className="p-2 text-left text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={selectedStaffIds.size > 0 && selectedStaffIds.size === filteredAndSortedStaff.length}
                          onChange={toggleAllSelection}
                          className="h-4 w-4"
                        />
                      </th>
                      <th className="p-2 text-left text-sm font-semibold">Name</th>
                      <th className="p-2 text-left text-sm font-semibold">
                        <button
                          onClick={() => handleSort('rank')}
                          className="flex items-center hover:text-primary transition-colors"
                        >
                          Rank
                          {getSortIcon('rank')}
                        </button>
                      </th>
                      <th className="p-2 text-left text-sm font-semibold">
                        <button
                          onClick={() => handleSort('team')}
                          className="flex items-center hover:text-primary transition-colors"
                        >
                          Team
                          {getSortIcon('team')}
                        </button>
                      </th>
                      <th className="p-2 text-left text-sm font-semibold">
                        <button
                          onClick={() => handleSort('floating')}
                          className="flex items-center hover:text-primary transition-colors"
                        >
                          Floating
                          {getSortIcon('floating')}
                        </button>
                      </th>
                      <th className="p-2 text-left text-sm font-semibold">
                        <button
                          onClick={() => handleSort('floorPCA')}
                          className="flex items-center hover:text-primary transition-colors"
                        >
                          Floor PCA
                          {getSortIcon('floorPCA')}
                        </button>
                      </th>
                      <th className="p-2 text-left text-sm font-semibold">
                        <button
                          onClick={() => handleSort('specialProgram')}
                          className="flex items-center hover:text-primary transition-colors"
                        >
                          Special Program
                          {getSortIcon('specialProgram')}
                        </button>
                      </th>
                      <th className="p-2 text-left text-sm font-semibold">Status</th>
                      <th className="p-2 text-left text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStaff.map(renderStaffRow)}
                    {inactiveStaff.length > 0 && activeStaff.length > 0 && (
                      <tr>
                        <td colSpan={9} className="p-2 border-t-2 border-b">
                          <div className="h-px bg-border"></div>
                        </td>
                      </tr>
                    )}
                    {inactiveStaff.map(renderStaffRow)}
                    {bufferStaff.length > 0 && (activeStaff.length > 0 || inactiveStaff.length > 0) && (
                      <tr>
                        <td colSpan={9} className="p-2 border-t-2 border-b">
                          <div className="h-px bg-border"></div>
                        </td>
                      </tr>
                    )}
                    {bufferStaff.map(renderStaffRow)}
                    </tbody>
                  </table>
                  {filteredAndSortedStaff.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      No staff found matching the selected filters.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Floating staff status menu (fixed-position) to avoid clipping inside overflow containers */}
      {openStatusMenu ? (
        <div
          id="staff-status-menu"
          className="fixed z-[9999] w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg p-1"
          style={{ left: openStatusMenu.left, top: openStatusMenu.top }}
        >
          {(['active', 'inactive', 'buffer'] as const).map((status) => (
            <button
              key={`status-${openStatusMenu.staffId}-${status}`}
              type="button"
              className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent"
              onClick={() => {
                void handleStatusChange(openStatusMenu.staffId, status)
                setOpenStatusMenu(null)
              }}
            >
              {status === 'active' ? 'Active' : status === 'inactive' ? 'Inactive' : 'Buffer'}
            </button>
          ))}
        </div>
      ) : null}

      {editingStaff && (
        <StaffEditDialog
          staff={editingStaff}
          specialPrograms={specialPrograms}
          onSave={handleSaveStaff}
          onCancel={() => setEditingStaff(null)}
        />
      )}

      {showBufferSlotDialog && pcaStaffForBuffer && (
        <BufferStaffConvertDialog
          open={showBufferSlotDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowBufferSlotDialog(false)
              setPcaStaffForBuffer(null)
            }
          }}
          staff={pcaStaffForBuffer}
          onConfirm={async ({ bufferFTE }) => {
            await updateStaffStatus(pcaStaffForBuffer.id, 'buffer', pcaStaffForBuffer, bufferFTE)
            handleBufferConvertSave()
          }}
        />
      )}

      {/* Inactive toggle popover - positioned at click location */}
      {inactiveTogglePopover && (
        <div
          className="fixed z-[9999] w-56 p-3 border-2 border-gray-300 rounded-md shadow-2xl text-xs"
          style={{
            left: `${inactiveTogglePopover.position.x}px`,
            top: `${inactiveTogglePopover.position.y}px`,
            transform: 'translateX(-50%)',
            backgroundColor: '#ffffff',
            color: '#000000',
          }}
        >
          <p className="pr-6 font-medium">
            {inactiveTogglePopover.name} has been moved to the inactive section below.
          </p>
          <button
            onClick={() => setInactiveTogglePopover(null)}
            className="absolute top-2 right-2 text-gray-600 hover:text-black"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </>
  )
}
