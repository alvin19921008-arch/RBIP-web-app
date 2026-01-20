'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SpecialProgram } from '@/types/allocation'
import { Staff, Team } from '@/types/staff'
import { Weekday } from '@/types/staff'
import { getSlotLabel } from '@/lib/utils/slotHelpers'
import { createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { Trash2, Edit2, ChevronUp, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast-provider'
import { useDashboardExpandableCard } from '@/hooks/useDashboardExpandableCard'
import { DashboardConfigMetaBanner } from '@/components/dashboard/DashboardConfigMetaBanner'

interface StaffSpecialProgram {
  name: string
  staff: Staff[]
}

interface StaffProgramConfig {
  staff_id: string
  weekdayConfigs: Record<Weekday, {
    slots: number[]
    fte_subtraction: number
    enabled?: boolean  // Add enabled flag
  }>
}

interface OverlapInfo {
  team: Team
  weekday: Weekday
  staffIds: string[]
}

export function SpecialProgramPanel() {
  const [programs, setPrograms] = useState<SpecialProgram[]>([])
  const [staffPrograms, setStaffPrograms] = useState<StaffSpecialProgram[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [editingProgram, setEditingProgram] = useState<SpecialProgram | null>(null)
  const [editingStaffProgram, setEditingStaffProgram] = useState<{ name: string; configs: StaffProgramConfig[] } | null>(null)
  const [overlaps, setOverlaps] = useState<OverlapInfo[]>([])
  const [preferenceOrders, setPreferenceOrders] = useState<Record<Team, string[]>>(createEmptyTeamRecordFactory<string[]>(() => []))
  const [pcaPreferenceOrder, setPcaPreferenceOrder] = useState<string[]>([])
  const [savedTherapistPreferenceOrder, setSavedTherapistPreferenceOrder] = useState<Record<Team, string[]>>(createEmptyTeamRecordFactory<string[]>(() => []))
  const [showPreferenceDialog, setShowPreferenceDialog] = useState(false)
  const [pendingSave, setPendingSave] = useState<(() => Promise<void>) | null>(null)
  const expand = useDashboardExpandableCard<string>({ animationMs: 220 })
  const supabase = createClientComponentClient()
  const toast = useToast()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [programsRes, staffRes] = await Promise.all([
        supabase.from('special_programs').select('*').order('name'),
        supabase.from('staff').select('*').order('name'),
      ])

      if (programsRes.data) setPrograms(programsRes.data as any)
      if (staffRes.data) {
        setStaff(staffRes.data)
        
        // Extract special programs from staff data
        const programMap = new Map<string, Staff[]>()
        staffRes.data.forEach((s: Staff) => {
          if (s.special_program && Array.isArray(s.special_program)) {
            s.special_program.forEach((prog: string) => {
              if (!programMap.has(prog)) {
                programMap.set(prog, [])
              }
              programMap.get(prog)!.push(s)
            })
          }
        })
        
        const staffProgs: StaffSpecialProgram[] = Array.from(programMap.entries()).map(([name, staffList]) => ({
          name,
          staff: staffList,
        }))
        setStaffPrograms(staffProgs)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEditStaffProgram = (programName: string) => {
    // Find existing program config or create new
    const existingProgram = programs.find(p => p.name === programName)
    const staffInProgram = staffPrograms.find(sp => sp.name === programName)?.staff || []
    
    // Build staff configs from existing data or defaults
    const configs: StaffProgramConfig[] = staffInProgram.map(s => {
      // Initialize weekday configs
      const weekdayConfigs: Record<Weekday, { slots: number[], fte_subtraction: number, enabled?: boolean }> = {
        mon: { slots: [], fte_subtraction: 0, enabled: false },
        tue: { slots: [], fte_subtraction: 0, enabled: false },
        wed: { slots: [], fte_subtraction: 0, enabled: false },
        thu: { slots: [], fte_subtraction: 0, enabled: false },
        fri: { slots: [], fte_subtraction: 0, enabled: false },
      }
      
      if (existingProgram) {
        // Load slots: { staff_id: { weekday: [slots] } }
        const staffSlots = (existingProgram.slots as any)?.[s.id] || {}
        // Load FTE: { staff_id: { weekday: fte_value } }
        const staffFTE = (existingProgram.fte_subtraction as any)?.[s.id] || {}
        
        // Populate weekday configs from saved data
        ;(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).forEach(day => {
          if (staffSlots[day] || staffFTE[day] !== undefined) {
            if (staffSlots[day]) {
              weekdayConfigs[day].slots = staffSlots[day]
            }
            if (staffFTE[day] !== undefined) {
              weekdayConfigs[day].fte_subtraction = staffFTE[day]
            }
            weekdayConfigs[day].enabled = true
          }
        })
      }
      
      return {
        staff_id: s.id,
        weekdayConfigs,
      }
    })
    
    setEditingStaffProgram({ name: programName, configs })
    
    // Initialize PCA preference order from existing program or empty
    const existingPcaOrder = existingProgram?.pca_preference_order || []
    // Get PCA staff in the program
    const pcaStaffInProgram = staffInProgram.filter(s => s.rank === 'PCA')
    // If no existing order, use current order of PCA staff
    const initialPcaOrder = existingPcaOrder.length > 0 
      ? existingPcaOrder.filter(id => pcaStaffInProgram.some(s => s.id === id))
      : pcaStaffInProgram.map(s => s.id)
    // Add any missing PCA staff to the end
    pcaStaffInProgram.forEach(s => {
      if (!initialPcaOrder.includes(s.id)) {
        initialPcaOrder.push(s.id)
      }
    })
    
    setPcaPreferenceOrder(initialPcaOrder)
    
    // Load saved therapist preference order from existing program
    const savedTherapistOrder = existingProgram?.therapist_preference_order || {}
    setSavedTherapistPreferenceOrder(savedTherapistOrder as Record<Team, string[]>)

    // Expand + auto-scroll the edit card into view
    expand.open(`staffprog:${programName}`)
  }

  const handleAddStaffToProgram = async (programName: string, staffIds: string[]) => {
    // Update staff's special_program array for each selected staff
    const updates = staffIds.map(staffId => {
      const staffMember = staff.find(s => s.id === staffId)
      if (!staffMember) return null
      
      const currentPrograms = staffMember.special_program || []
      if (!currentPrograms.includes(programName as any)) {
        const updatedPrograms = [...currentPrograms, programName]
        return supabase
          .from('staff')
          .update({ special_program: updatedPrograms })
          .eq('id', staffId)
      }
      return null
    }).filter(Boolean)
    
    await Promise.all(updates)
    await loadData()
    
    // Refresh the edit form with new staff
    handleEditStaffProgram(programName)
  }

  const handleRemoveStaffFromProgram = async (programName: string, staffId: string) => {
    try {
      // 1. Remove program from staff's special_program array
      const staffMember = staff.find(s => s.id === staffId)
      if (staffMember) {
        const currentPrograms = staffMember.special_program || []
        const updatedPrograms = currentPrograms.filter(p => p !== programName)
        const { error: staffError } = await supabase
          .from('staff')
          .update({ special_program: updatedPrograms })
          .eq('id', staffId)
        
        if (staffError) {
          console.error('Error removing program from staff:', staffError)
          toast.error('Failed to remove staff from program. Please try again.')
          return
        }
      }
      
      // 2. Remove staff from special_programs table (staff_ids, slots, fte_subtraction)
      const existingProgram = programs.find(p => p.name === programName)
      if (existingProgram) {
        // Remove staff_id from staff_ids array
        const currentStaffIds = existingProgram.staff_ids || []
        const updatedStaffIds = currentStaffIds.filter(id => id !== staffId)
        
        // Remove staff's slots data
        const currentSlots = (existingProgram.slots as any) || {}
        const updatedSlots = { ...currentSlots }
        delete updatedSlots[staffId]
        
        // Remove staff's FTE data
        const currentFTE = (existingProgram.fte_subtraction as any) || {}
        const updatedFTE = { ...currentFTE }
        delete updatedFTE[staffId]
        
        // Update the special_programs record
        const { error: programError } = await supabase
          .from('special_programs')
          .update({
            staff_ids: updatedStaffIds,
            slots: updatedSlots,
            fte_subtraction: updatedFTE
          })
          .eq('id', existingProgram.id)
        
        if (programError) {
          console.error('Error removing staff from program:', programError)
          toast.error('Failed to remove staff from program data. Please try again.')
          return
        }
      }
      
      // 3. Remove from local editing state immediately
      if (editingStaffProgram) {
        const newConfigs = editingStaffProgram.configs.filter(c => c.staff_id !== staffId)
        setEditingStaffProgram({ ...editingStaffProgram, configs: newConfigs })
      }
      
      // 4. Reload data to sync
      await loadData()
      toast.success('Removed staff from program.')
    } catch (err) {
      console.error('Error removing staff from program:', err)
      toast.error('Failed to remove staff from program. Please try again.')
    }
  }

  // Detect overlaps: multiple THERAPISTS in same team with same program on same weekday
  // Note: PCA overlaps are handled separately via the PCA preference order UI (up/down buttons)
  // A therapist and a PCA can be in the same team on a given day without triggering this dialog
  const detectOverlaps = (): OverlapInfo[] => {
    if (!editingStaffProgram) return []
    
    const overlaps: OverlapInfo[] = []
    const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
    
    // Therapist ranks that should be grouped together for overlap detection
    const therapistRanks = ['SPT', 'APPT', 'RPT']
    
    weekdays.forEach(weekday => {
      // Group THERAPIST staff by team for this weekday (not PCA)
      const therapistsByTeam: Record<Team, string[]> = {
        FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
      }
      
      editingStaffProgram.configs.forEach(config => {
        const dayConfig = config.weekdayConfigs[weekday]
        if (dayConfig.enabled && (dayConfig.slots.length > 0 || dayConfig.fte_subtraction > 0)) {
          const staffMember = staff.find(s => s.id === config.staff_id)
          // Only include therapists (not PCA) for this overlap detection
          if (staffMember && staffMember.team && therapistRanks.includes(staffMember.rank)) {
            therapistsByTeam[staffMember.team].push(config.staff_id)
          }
        }
      })
      
      // Find teams with multiple therapists
      Object.entries(therapistsByTeam).forEach(([team, staffIds]) => {
        if (staffIds.length > 1) {
          overlaps.push({
            team: team as Team,
            weekday,
            staffIds
          })
        }
      })
    })
    
    return overlaps
  }

  const handleSaveStaffProgram = async () => {
    if (!editingStaffProgram) return
    
    // Detect overlaps before saving
    const detectedOverlaps = detectOverlaps()
    
    if (detectedOverlaps.length > 0) {
      // Show preference dialog
      setOverlaps(detectedOverlaps)
      
      // Initialize preference orders from existing program or default to current order
      const existingProgram = programs.find(p => p.name === editingStaffProgram.name)
      const initialOrders: Partial<Record<Team, string[]>> = {}
      
      detectedOverlaps.forEach(overlap => {
        if (existingProgram?.therapist_preference_order?.[overlap.team]) {
          // Use existing preference, but filter to only include staff in overlap
          const existingOrder = existingProgram.therapist_preference_order[overlap.team]
          initialOrders[overlap.team] = existingOrder.filter(id => overlap.staffIds.includes(id))
          // Add any missing staff to the end
          overlap.staffIds.forEach(id => {
            if (!initialOrders[overlap.team]?.includes(id)) {
              initialOrders[overlap.team]?.push(id)
            }
          })
        } else {
          // Default to current order (as they appear in configs)
          initialOrders[overlap.team] = overlap.staffIds
        }
      })
      
      setPreferenceOrders(initialOrders as Record<Team, string[]>)
      setShowPreferenceDialog(true)
      
      // Store the save function to call after preferences are set
      setPendingSave(() => async () => {
        await performSave(initialOrders as Record<Team, string[]>)
      })
      
      return
    }
    
    // No overlaps, save directly
    await performSave(createEmptyTeamRecordFactory<string[]>(() => []))
  }

  const performSave = async (preferenceOrdersToSave: Record<Team, string[]>) => {
    if (!editingStaffProgram) return
    
    try {
      const programName = editingStaffProgram.name
      const staffIds = editingStaffProgram.configs.map(c => c.staff_id)
      
      // Build slots object: { staff_id: { weekday: [slots] } }
      const slots: Record<string, Partial<Record<Weekday, number[]>>> = {}
      editingStaffProgram.configs.forEach(config => {
        slots[config.staff_id] = {}
        ;(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).forEach(day => {
          if (config.weekdayConfigs[day].slots.length > 0) {
            slots[config.staff_id][day] = config.weekdayConfigs[day].slots
          }
        })
      })
      
      // Build fte_subtraction object: { staff_id: { weekday: fte_value } }
      const fte_subtraction: Record<string, Partial<Record<Weekday, number>>> = {}
      editingStaffProgram.configs.forEach(config => {
        fte_subtraction[config.staff_id] = {}
        ;(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).forEach(day => {
          const value = config.weekdayConfigs[day].fte_subtraction
          const enabled = config.weekdayConfigs[day].enabled === true

          // CRP edge: therapist subtraction can be intentionally 0 and must be persisted,
          // otherwise Step 2.0 cannot auto-map it back.
          if (programName === 'CRP') {
            if (enabled && typeof value === 'number' && value >= 0) {
              fte_subtraction[config.staff_id][day] = value
            }
            return
          }

          if (value > 0) {
            fte_subtraction[config.staff_id][day] = value
          }
        })
      })
      
      // Get all unique weekdays from all staff
      const allWeekdays = new Set<Weekday>()
      editingStaffProgram.configs.forEach(config => {
        ;(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).forEach(day => {
          const enabled = config.weekdayConfigs[day].enabled === true
          const hasSlots = config.weekdayConfigs[day].slots.length > 0
          const hasPositiveFte = config.weekdayConfigs[day].fte_subtraction > 0
          const isCRPEnabledDay = programName === 'CRP' && enabled

          if (hasSlots || hasPositiveFte || isCRPEnabledDay) {
            allWeekdays.add(day)
          }
        })
      })
      
      // Build programData with proper defaults matching schema
      const programData: any = {
        name: programName,
        staff_ids: staffIds,
        weekdays: Array.from(allWeekdays),
        slots,
        fte_subtraction,
        pca_required: null,
      }
      
      // Only include preference_order fields if they have values
      // Don't send empty values to avoid type mismatch errors with database defaults
      // therapist_preference_order - only include when it has values
      if (Object.keys(preferenceOrdersToSave).length > 0) {
        programData.therapist_preference_order = preferenceOrdersToSave
      }
      // Note: if empty, we don't include it at all - database will use its default
      
      // pca_preference_order - only include when it has values
      if (pcaPreferenceOrder.length > 0) {
        programData.pca_preference_order = pcaPreferenceOrder
      }
      // Note: if empty, we don't include it at all - database will use its default
      
      // Check if program already exists
      const existingProgram = programs.find(p => p.name === programName)
      
      if (existingProgram) {
        const { error } = await supabase
          .from('special_programs')
          .update(programData)
          .eq('id', existingProgram.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase.from('special_programs').insert(programData)
        
        if (error) throw error
      }
      
      await loadData()
      expand.close(() => {
        setEditingStaffProgram(null)
        setShowPreferenceDialog(false)
        setOverlaps([])
        setPreferenceOrders(createEmptyTeamRecordFactory<string[]>(() => []))
        setPcaPreferenceOrder([])
        setPendingSave(null)
      })
    } catch (err) {
      console.error('Error saving staff program:', err)
      toast.error('Failed to save program. Please try again.')
    }
  }

  const handleConfirmPreferences = async () => {
    // Use current preferenceOrders state instead of the closure-captured initialOrders
    await performSave(preferenceOrders)
    // Update the saved state to reflect the new order
    setSavedTherapistPreferenceOrder(prev => ({
      ...prev,
      ...preferenceOrders
    }))
  }

  const moveStaffInOrder = (team: Team, staffId: string, direction: 'up' | 'down') => {
    const currentOrder = preferenceOrders[team] || []
    const index = currentOrder.indexOf(staffId)
    
    if (index === -1) return
    
    const newOrder = [...currentOrder]
    if (direction === 'up' && index > 0) {
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
    }
    
    setPreferenceOrders(prev => ({
      ...prev,
      [team]: newOrder
    }))
  }

  const handleSaveProgram = async (program: Partial<SpecialProgram>) => {
    try {
      if (editingProgram?.id) {
        await supabase
          .from('special_programs')
          .update(program)
          .eq('id', editingProgram.id)
      } else {
        await supabase.from('special_programs').insert(program)
      }
      await loadData()
      expand.close(() => setEditingProgram(null))
      toast.success('Special program saved.')
    } catch (err) {
      console.error('Error saving program:', err)
      toast.error('Error saving special program.', err instanceof Error ? err.message : String(err))
    }
  }

  const handleDeleteProgram = async (programId: string) => {
    if (!confirm('Are you sure you want to delete this special program configuration?')) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('special_programs')
        .delete()
        .eq('id', programId)
      
      if (error) throw error
      await loadData()
      toast.success('Special program deleted.')
    } catch (err) {
      console.error('Error deleting program:', err)
      toast.error('Failed to delete program. Please try again.')
    }
  }

  const getStaffName = (staffId: string) => {
    return staff.find(s => s.id === staffId)?.name || 'Unknown'
  }

  const getStaffRank = (staffId: string) => {
    return staff.find(s => s.id === staffId)?.rank || 'Unknown'
  }

  // Filter out programs that exist in staff data from configured programs
  const configuredProgramsOnly = programs.filter(p => 
    !staffPrograms.some(sp => sp.name === p.name)
  )

  return (
    <>
      <Card>
        <CardContent className="pt-6">
        <DashboardConfigMetaBanner />
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-6">
            {/* Existing Special Programs from Staff Data */}
            {staffPrograms.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Existing Special Programs (from Staff Data)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {staffPrograms.map((sp) => {
                    const existingProgram = programs.find(p => p.name === sp.name)
                    const isEditing = editingStaffProgram?.name === sp.name
                    
                    if (isEditing) {
                      return (
                        <div
                          key={sp.name}
                          ref={expand.expandedRef}
                          className={`col-span-full ${expand.getExpandedAnimationClass(`staffprog:${sp.name}`)}`}
                        >
                          <Card className="p-4 border-2">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="text-lg font-semibold">Edit: {sp.name}</h3>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => expand.close(() => setEditingStaffProgram(null))}
                              >
                                Cancel
                              </Button>
                            </div>
                            
                            <div className="space-y-6">
                              {/* Add Staff Section */}
                              <div className="border p-4 rounded">
                                <h4 className="font-semibold mb-3">Add Staff to Program</h4>
                                {editingStaffProgram.name === 'DRM' && (
                                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                                    <p className="font-medium mb-1">PCA Note:</p>
                                    <p>PCA would not carry DRM as special program property, therefore N/A to choose from. User can still choose PCA to assign into DRO in PCA Preference Dashboard.</p>
                                  </div>
                                )}
                                {editingStaffProgram.name === 'Robotic' && (
                                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                                    <p className="font-medium mb-1">Robotic Note:</p>
                                    <p>The allocation algorithm would only assign PCA to Robotic, so only PCA is needed to be included here.</p>
                                  </div>
                                )}
                                <div className="max-h-40 overflow-y-auto border rounded p-2 pr-1 scrollbar-visible">
                                  {staff
                                    .filter(s => {
                                      // For DRM, filter out PCA staff
                                      if (editingStaffProgram.name === 'DRM' && s.rank === 'PCA') {
                                        return false
                                      }
                                      // For Robotic, filter to only show PCA staff
                                      if (editingStaffProgram.name === 'Robotic' && s.rank !== 'PCA') {
                                        return false
                                      }
                                      // Filter out staff already in program
                                      return !editingStaffProgram.configs.some(c => c.staff_id === s.id)
                                    })
                                    .map((s) => (
                                      <label key={s.id} className="flex items-center space-x-2 py-1">
                                        <input
                                          type="checkbox"
                                          onChange={async (e) => {
                                            if (e.target.checked) {
                                              await handleAddStaffToProgram(editingStaffProgram.name, [s.id])
                                            }
                                          }}
                                        />
                                        <span>{s.name} ({s.rank})</span>
                                      </label>
                                    ))}
                                </div>
                              </div>

                              {/* Staff Configuration */}
                              {editingStaffProgram.configs.map((config, idx) => {
                                return (
                                  <div key={config.staff_id} className="border p-4 rounded space-y-4">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-semibold">
                                        {getStaffName(config.staff_id)} ({getStaffRank(config.staff_id)})
                                      </h4>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => {
                                          if (confirm(`Remove ${getStaffName(config.staff_id)} from ${editingStaffProgram.name}?`)) {
                                            handleRemoveStaffFromProgram(editingStaffProgram.name, config.staff_id)
                                          }
                                        }}
                                        title={`Remove ${getStaffName(config.staff_id)} from program`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    
                                    {/* Weekdays Selection */}
                                    <div>
                                      <label className="block text-sm font-medium mb-2">Weekdays</label>
                                      <div className="flex space-x-2">
                                        {(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).map((day) => {
                                          const isEnabled = config.weekdayConfigs[day].enabled ?? 
                                                            (config.weekdayConfigs[day].slots.length > 0 || 
                                                             config.weekdayConfigs[day].fte_subtraction > 0)
                                          return (
                                            <button
                                              key={day}
                                              type="button"
                                              onClick={() => {
                                                const newConfigs = [...editingStaffProgram.configs]
                                                const dayConfig = newConfigs[idx].weekdayConfigs[day]
                                                
                                                if (isEnabled) {
                                                  // Disable: clear slots and FTE
                                                  dayConfig.slots = []
                                                  dayConfig.fte_subtraction = 0
                                                  dayConfig.enabled = false
                                                } else {
                                                  // Enable: set enabled flag
                                                  dayConfig.enabled = true
                                                }
                                                setEditingStaffProgram({ ...editingStaffProgram, configs: newConfigs })
                                              }}
                                              className={`px-3 py-1 rounded text-sm ${
                                                isEnabled ? 'bg-blue-600 text-white' : 'bg-secondary'
                                              }`}
                                            >
                                              {day}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </div>
                                    
                                    {/* Slots and FTE in Table Format */}
                                    <div className="overflow-x-auto">
                                      <label className="block text-sm font-medium mb-2">Schedule Configuration</label>
                                      <table className="w-full border-collapse text-sm">
                                        <thead>
                                          <tr className="border-b">
                                            <th className="text-left p-2 font-medium">Weekday</th>
                                            <th className="text-left p-2 font-medium">Slots</th>
                                            <th className="text-left p-2 font-medium">
                                              {(() => {
                                                const programName = editingStaffProgram.name
                                                const staffRank = getStaffRank(config.staff_id)
                                                // For CRP and Robotic: always show "FTE cost by special program"
                                                if (programName === 'CRP' || programName === 'Robotic') {
                                                  return 'FTE cost by special program'
                                                }
                                                // For DRM: only show "FTE cost by special program" for therapist rank
                                                if (programName === 'DRM' && ['SPT', 'APPT', 'RPT'].includes(staffRank)) {
                                                  return 'FTE cost by special program'
                                                }
                                                // Default: show "FTE"
                                                return 'FTE'
                                              })()}
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).map((day) => {
                                            const isEnabled = config.weekdayConfigs[day].enabled ?? 
                                                              (config.weekdayConfigs[day].slots.length > 0 || 
                                                               config.weekdayConfigs[day].fte_subtraction > 0)
                                            if (!isEnabled) return null
                                            
                                            return (
                                              <tr key={day} className="border-b">
                                                <td className="p-2 font-medium capitalize">{day}</td>
                                                <td className="py-2 pl-2 pr-1">
                                                  <div className="flex flex-wrap gap-1">
                                                    {[1, 2, 3, 4].map((slot) => (
                                                      <button
                                                        key={slot}
                                                        type="button"
                                                        onClick={() => {
                                                          const newConfigs = [...editingStaffProgram.configs]
                                                          const dayConfig = newConfigs[idx].weekdayConfigs[day]
                                                          dayConfig.slots = dayConfig.slots.includes(slot)
                                                            ? dayConfig.slots.filter(s => s !== slot)
                                                            : [...dayConfig.slots, slot]
                                                          setEditingStaffProgram({ ...editingStaffProgram, configs: newConfigs })
                                                        }}
                                                        className={`px-2 py-1 rounded text-xs min-w-[2.5rem] ${
                                                          config.weekdayConfigs[day].slots.includes(slot)
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-secondary hover:bg-secondary/80'
                                                        }`}
                                                      >
                                                        {getSlotLabel(slot)}
                                                      </button>
                                                    ))}
                                                  </div>
                                                </td>
                                                <td className="py-2 pl-1 pr-2">
                                                  <input
                                                    type="number"
                                                    step="0.05"
                                                    min="0"
                                                    max="1"
                                                    value={config.weekdayConfigs[day].fte_subtraction}
                                                    onChange={(e) => {
                                                      const newConfigs = [...editingStaffProgram.configs]
                                                      newConfigs[idx].weekdayConfigs[day].fte_subtraction = parseFloat(e.target.value) || 0
                                                      setEditingStaffProgram({ ...editingStaffProgram, configs: newConfigs })
                                                    }}
                                                    className="w-20 px-2 py-1 border rounded-md text-sm"
                                                    placeholder="0.00"
                                                  />
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                      <p className="text-xs text-muted-foreground mt-2">
                                        FTE: Example values - 0.4 for therapist, 0.25 for PCA
                                      </p>
                                    </div>
                                  </div>
                                )
                              })}
                              
                              {/* PCA Preference Order Section */}
                              {(() => {
                                // For DRM, PCA doesn't carry the special program property, so hide this section
                                if (editingStaffProgram.name === 'DRM') return null
                                
                                const pcaStaffInProgram = editingStaffProgram.configs
                                  .map(c => staff.find(s => s.id === c.staff_id))
                                  .filter(s => s && s.rank === 'PCA') as Staff[]
                                
                                if (pcaStaffInProgram.length === 0) return null
                                
                                // Validate: check if non-floating appears before floating
                                const hasValidationWarning = pcaPreferenceOrder.some((id, index) => {
                                  const staffMember = pcaStaffInProgram.find(s => s.id === id)
                                  if (!staffMember) return false
                                  const isNonFloating = !staffMember.floating
                                  if (!isNonFloating) return false
                                  
                                  // Check if there's a floating PCA after this non-floating one
                                  return pcaPreferenceOrder.slice(index + 1).some(laterId => {
                                    const laterStaff = pcaStaffInProgram.find(s => s.id === laterId)
                                    return laterStaff && laterStaff.floating
                                  })
                                })
                                
                                return (
                                  <div className="border p-4 rounded">
                                    <h4 className="font-semibold mb-2">PCA Preference Order</h4>
                                    <p className="text-sm text-muted-foreground mb-3">
                                      Set the priority order for PCA staff in this special program. Floating PCA should be prioritized first.
                                    </p>
                                    
                                    {hasValidationWarning && (
                                      <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                                        ⚠️ Warning: Non-floating PCA appears before floating PCA in the preference order. Consider prioritizing floating PCA first.
                                      </div>
                                    )}
                                    
                                    <div className="space-y-2">
                                      {pcaPreferenceOrder.map((pcaId, index) => {
                                        const pcaStaff = pcaStaffInProgram.find(s => s.id === pcaId)
                                        if (!pcaStaff) return null
                                        
                                        return (
                                          <div key={pcaId} className="flex items-center gap-2 p-2 border rounded">
                                            <span className="flex-1">
                                              {pcaStaff.name} ({pcaStaff.floating ? 'Floating' : 'Non-floating'})
                                            </span>
                                            <div className="flex gap-1">
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => {
                                                  if (index > 0) {
                                                    const newOrder = [...pcaPreferenceOrder]
                                                    const temp = newOrder[index - 1]
                                                    newOrder[index - 1] = newOrder[index]
                                                    newOrder[index] = temp
                                                    setPcaPreferenceOrder(newOrder)
                                                  }
                                                }}
                                                disabled={index === 0}
                                              >
                                                <ChevronUp className="h-4 w-4" />
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => {
                                                  if (index < pcaPreferenceOrder.length - 1) {
                                                    const newOrder = [...pcaPreferenceOrder]
                                                    const temp = newOrder[index]
                                                    newOrder[index] = newOrder[index + 1]
                                                    newOrder[index + 1] = temp
                                                    setPcaPreferenceOrder(newOrder)
                                                  }
                                                }}
                                                disabled={index === pcaPreferenceOrder.length - 1}
                                              >
                                                <ChevronDown className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })()}
                              
                              {/* Therapist Preference Order Display */}
                              {(() => {
                                const hasTherapistOrder = Object.keys(savedTherapistPreferenceOrder).length > 0
                                
                                // Get therapists in this program
                                const therapistRanks = ['SPT', 'APPT', 'RPT']
                                const therapistsInProgram = editingStaffProgram.configs
                                  .map(c => staff.find(s => s.id === c.staff_id))
                                  .filter(s => s && therapistRanks.includes(s.rank)) as Staff[]
                                
                                // Check if there are overlapping therapists (same team)
                                const teamTherapistCounts: Record<Team, Staff[]> = {
                                  FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
                                }
                                therapistsInProgram.forEach(t => {
                                  if (t.team) teamTherapistCounts[t.team].push(t)
                                })
                                const teamsWithMultipleTherapists = Object.entries(teamTherapistCounts)
                                  .filter(([, therapists]) => therapists.length > 1)
                                  .map(([team]) => team as Team)
                                
                                if (teamsWithMultipleTherapists.length === 0) return null
                                
                                return (
                                  <div className="border p-4 rounded">
                                    <h4 className="font-semibold mb-2">Therapist Preference Order</h4>
                                    <p className="text-sm text-muted-foreground mb-3">
                                      Priority order for therapists when multiple are in the same team for this program.
                                    </p>
                                    
                                    {hasTherapistOrder ? (
                                      <div className="space-y-3">
                                        {teamsWithMultipleTherapists.map(team => {
                                          const orderForTeam = savedTherapistPreferenceOrder[team] || []
                                          const therapistsInTeam = teamTherapistCounts[team]
                                          
                                          // Get ordered list
                                          const orderedTherapists = orderForTeam
                                            .map(id => therapistsInTeam.find(t => t.id === id))
                                            .filter(Boolean) as Staff[]
                                          // Add any missing therapists
                                          therapistsInTeam.forEach(t => {
                                            if (!orderedTherapists.some(ot => ot.id === t.id)) {
                                              orderedTherapists.push(t)
                                            }
                                          })
                                          
                                          return (
                                            <div key={team} className="bg-gray-50 p-2 rounded">
                                              <span className="font-medium text-sm">{team}:</span>
                                              <span className="ml-2 text-sm">
                                                {orderedTherapists.map(t => t.name).join(' → ')}
                                              </span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground italic">
                                        No therapist preference order set. Click "Edit Therapist Order" to configure.
                                      </p>
                                    )}
                                    
                                    <Button 
                                      variant="outline" 
                                      className="mt-3"
                                      onClick={() => {
                                        // Detect overlaps and show preference dialog
                                        const detectedOverlaps = detectOverlaps()
                                        if (detectedOverlaps.length > 0) {
                                          setOverlaps(detectedOverlaps)
                                          
                                          // Initialize preference orders from saved data or default
                                         const initialOrders: Partial<Record<Team, string[]>> = {}
                                          detectedOverlaps.forEach(overlap => {
                                            if (savedTherapistPreferenceOrder[overlap.team]) {
                                              const existingOrder = savedTherapistPreferenceOrder[overlap.team]
                                              initialOrders[overlap.team] = existingOrder.filter(id => overlap.staffIds.includes(id))
                                              overlap.staffIds.forEach(id => {
                                               if (!initialOrders[overlap.team]?.includes(id)) {
                                                 initialOrders[overlap.team]?.push(id)
                                                }
                                              })
                                            } else {
                                              initialOrders[overlap.team] = overlap.staffIds
                                            }
                                          })
                                          
                                         setPreferenceOrders(initialOrders as Record<Team, string[]>)
                                          setShowPreferenceDialog(true)
                                        }
                                      }}
                                    >
                                      Edit Therapist Order
                                    </Button>
                                  </div>
                                )
                              })()}
                              
                              <div className="flex space-x-2">
                                <Button onClick={() => handleSaveStaffProgram()}>Save All Changes</Button>
                                <Button variant="outline" onClick={() => {
                                  expand.close(() => {
                                    setEditingStaffProgram(null)
                                    setPcaPreferenceOrder([])
                                    setSavedTherapistPreferenceOrder(createEmptyTeamRecordFactory<string[]>(() => []))
                                  })
                                }}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </Card>
                        </div>
                      )
                    }
                    
                    return (
                      <Card key={sp.name} className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-lg">{sp.name}</h4>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditStaffProgram(sp.name)}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2">
                          <p className="text-sm font-medium mb-1">Assigned Staff:</p>
                          {(() => {
                            // Separate therapists and PCAs
                            const therapists = sp.staff.filter(s => ['SPT', 'APPT', 'RPT'].includes(s.rank))
                            const pcas = sp.staff.filter(s => s.rank === 'PCA')
                            
                            // Sort therapists: SPT -> APPT -> RPT
                            const rankOrder = ['SPT', 'APPT', 'RPT']
                            const sortedTherapists = therapists.sort((a, b) => {
                              const aIndex = rankOrder.indexOf(a.rank)
                              const bIndex = rankOrder.indexOf(b.rank)
                              return aIndex - bIndex
                            })
                            
                            return (
                              <>
                                {/* Therapists on first line */}
                                {sortedTherapists.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-1">
                                    {sortedTherapists.map((s) => (
                                      <span
                                        key={s.id}
                                        className="text-xs px-2 py-1 bg-secondary rounded"
                                      >
                                        {s.name} ({s.rank})
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* PCAs on second line */}
                                {pcas.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {pcas.map((s) => (
                                      <span
                                        key={s.id}
                                        className="text-xs px-2 py-1 bg-secondary rounded"
                                      >
                                        {s.name} ({s.rank})
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {sortedTherapists.length === 0 && pcas.length === 0 && (
                                  <div className="mb-2">
                                    <span className="text-xs text-muted-foreground">No staff assigned</span>
                                  </div>
                                )}
                              </>
                            )
                          })()}
                          {existingProgram && (
                            <p className="text-xs text-muted-foreground">
                              Configured with {existingProgram.weekdays?.length || 0} weekdays
                            </p>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Configured Special Programs (only those not in staff data) */}
            {configuredProgramsOnly.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Configured Special Programs</h3>
                  <Button
                    onClick={() => {
                      setEditingProgram({} as SpecialProgram)
                      expand.open('program:new')
                    }}
                  >
                    Add New Program
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {configuredProgramsOnly.map((program) => (
                    <Card key={program.id} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-lg">{program.name}</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProgram(program.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <p>
                          <span className="font-medium">Staff:</span>{' '}
                          {program.staff_ids?.length || 0} assigned
                        </p>
                        {program.weekdays && program.weekdays.length > 0 && (
                          <p>
                            <span className="font-medium">Weekdays:</span>{' '}
                            {program.weekdays.join(', ')}
                          </p>
                        )}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setEditingProgram(program)
                          expand.open(`program:${program.id}`)
                        }}
                      >
                        Edit
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Add New Program Button (if no configured programs) */}
            {configuredProgramsOnly.length === 0 && (
              <div>
                <Button
                  onClick={() => {
                    setEditingProgram({} as SpecialProgram)
                    expand.open('program:new')
                  }}
                >
                  Add New Program
                </Button>
              </div>
            )}


            {/* Edit Configured Program Form */}
            {editingProgram && (
              <div
                ref={expand.expandedRef}
                className={expand.getExpandedAnimationClass(`program:${(editingProgram as any).id ?? 'new'}`)}
              >
                <SpecialProgramForm
                  program={editingProgram}
                  staff={staff}
                  onSave={handleSaveProgram}
                  onCancel={() => expand.close(() => setEditingProgram(null))}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Preference Ordering Dialog */}
    <Dialog open={showPreferenceDialog} onOpenChange={setShowPreferenceDialog}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set Therapist Preference Order</DialogTitle>
          <DialogDescription>
            Multiple therapists in the same team have this special program enabled on the same day.
            Please set the preference order (use up/down arrows). The system will assign the program to the first available therapist in order.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {overlaps.map((overlap, idx) => {
            const teamStaff = overlap.staffIds.map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[]
            const currentOrder = preferenceOrders[overlap.team] || overlap.staffIds
            const orderedStaff = currentOrder.map(id => teamStaff.find(s => s.id === id)).filter(Boolean) as Staff[]
            
            return (
              <div key={`${overlap.team}-${overlap.weekday}-${idx}`} className="border p-4 rounded">
                <h4 className="font-semibold mb-2">
                  {overlap.team} - {overlap.weekday.charAt(0).toUpperCase() + overlap.weekday.slice(1)}
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Order: {orderedStaff.map(s => s.name).join(' → ')}
                </p>
                <div className="space-y-2">
                  {orderedStaff.map((staffMember, staffIdx) => (
                    <div key={staffMember.id} className="flex items-center gap-2 p-2 border rounded">
                      <span className="flex-1">{staffMember.name} ({staffMember.rank})</span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveStaffInOrder(overlap.team, staffMember.id, 'up')}
                          disabled={staffIdx === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveStaffInOrder(overlap.team, staffMember.id, 'down')}
                          disabled={staffIdx === orderedStaff.length - 1}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowPreferenceDialog(false)
            setOverlaps([])
            setPreferenceOrders(createEmptyTeamRecordFactory<string[]>(() => []))
            setPendingSave(null)
          }}>
            Cancel
          </Button>
          <Button onClick={handleConfirmPreferences}>
            Save Preferences & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function SpecialProgramForm({
  program,
  staff,
  onSave,
  onCancel,
}: {
  program: Partial<SpecialProgram>
  staff: Staff[]
  onSave: (program: Partial<SpecialProgram>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(program.name || '')
  const [selectedStaff, setSelectedStaff] = useState<string[]>(program.staff_ids || [])
  const [weekdays, setWeekdays] = useState<Weekday[]>(program.weekdays || [])
  const [slots, setSlots] = useState<Record<Weekday, number[]>>(
    program.slots || { mon: [], tue: [], wed: [], thu: [], fri: [] }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name,
      staff_ids: selectedStaff,
      weekdays,
      slots,
      fte_subtraction: program.fte_subtraction || {},
      pca_required: program.pca_required || null,
    })
  }

  const toggleWeekday = (day: Weekday) => {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const toggleSlot = (day: Weekday, slot: number) => {
    setSlots(prev => ({
      ...prev,
      [day]: prev[day].includes(slot)
        ? prev[day].filter(s => s !== slot)
        : [...prev[day], slot],
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border p-4 rounded">
      <div>
        <label className="block text-sm font-medium mb-1">Program Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Assigned Staff</label>
        <div className="max-h-40 overflow-y-auto border rounded p-2 pr-1 scrollbar-visible">
          {staff.map((s) => (
            <label key={s.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedStaff.includes(s.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedStaff([...selectedStaff, s.id])
                  } else {
                    setSelectedStaff(selectedStaff.filter(id => id !== s.id))
                  }
                }}
              />
              <span>{s.name} ({s.rank})</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Weekdays</label>
        <div className="flex space-x-2">
          {(['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]).map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleWeekday(day)}
              className={`px-3 py-1 rounded ${
                weekdays.includes(day) ? 'bg-blue-600 text-white' : 'bg-secondary'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {weekdays.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1">Slots per Day</label>
          {weekdays.map((day) => (
            <div key={day} className="mb-2">
              <span className="text-sm font-medium">{day}:</span>
              <div className="flex space-x-2 mt-1">
                {[1, 2, 3, 4].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(day, slot)}
                    className={`px-2 py-1 rounded text-xs ${
                      slots[day]?.includes(slot) ? 'bg-blue-600 text-white' : 'bg-secondary'
                    }`}
                  >
                    {getSlotLabel(slot)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex space-x-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

