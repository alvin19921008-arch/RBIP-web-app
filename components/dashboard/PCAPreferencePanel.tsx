'use client'

import { useState, useEffect, useRef } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PCAPreference } from '@/types/allocation'
import { Staff, Team } from '@/types/staff'
import { getSlotLabel, getSlotTime } from '@/lib/utils/slotHelpers'
import { FloorPCAMappingPanel } from '@/components/dashboard/FloorPCAMappingPanel'
import { useToast } from '@/components/ui/toast-provider'

export function PCAPreferencePanel() {
  const [preferences, setPreferences] = useState<PCAPreference[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [editingPreference, setEditingPreference] = useState<PCAPreference | null>(null)
  const [showFloorMapping, setShowFloorMapping] = useState(false)
  const editFormRef = useRef<HTMLDivElement>(null)
  const supabase = createClientComponentClient()
  const toast = useToast()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [preferencesRes, staffRes] = await Promise.all([
        supabase.from('pca_preferences').select('*').order('team'),
        supabase.from('staff').select('*').eq('rank', 'PCA').order('name'), // Load all PCA for name display
      ])

      if (preferencesRes.data) setPreferences(preferencesRes.data as any)
      if (staffRes.data) setStaff(staffRes.data)
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
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
      setEditingPreference(null)
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

  return (
    <Card>
      <CardContent className="pt-6">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allTeams.map((team) => {
              const pref = preferences.find(p => p.team === team)
              const isEditing = editingPreference?.team === team
              
              if (isEditing) {
                return (
                  <Card key={team} className="p-4 border-2 col-span-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Edit: {team}</h3>
                      <Button variant="ghost" size="sm" onClick={() => setEditingPreference(null)}>
                        Cancel
                      </Button>
                    </div>
                    <PCAPreferenceForm
                      preference={editingPreference}
                      staff={staff}
                      onSave={handleSave}
                      onCancel={() => setEditingPreference(null)}
                    />
                  </Card>
                )
              }
              
              return (
                <Card key={team} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-lg">{team}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (pref) {
                          setEditingPreference(pref)
                        } else {
                          setEditingPreference({ team } as PCAPreference)
                        }
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
                      {pref.preferred_pca_ids && pref.preferred_pca_ids.length > 0 && (
                      <p className="text-sm text-black">
                          Preferred: {pref.preferred_pca_ids.map(id => {
                            const pca = staff.find(s => s.id === id)
                            return pca ? pca.name : id
                          }).join(', ')}
                      </p>
                      )}
                      {pref.preferred_slots && pref.preferred_slots.length > 0 && (
                        <p className="text-sm text-black">
                          Preferred slot: {getSlotTime(pref.preferred_slots[0])}
                        </p>
                      )}
                      {pref.gym_schedule && (
                        <p className="text-sm text-black">
                          Gym schedule: {getSlotTime(pref.gym_schedule)}
                        </p>
                      )}
                      {pref.avoid_gym_schedule !== undefined && (
                        <p className="text-sm text-black">
                          Avoid gym schedule: {pref.avoid_gym_schedule ? 'Yes' : 'No'}
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
        
        {/* Floor PCA Mapping Subcard */}
        <div className="mt-6">
          <Card
            className={`cursor-pointer hover:border-primary ${
              showFloorMapping ? 'border-primary' : ''
            }`}
            onClick={() => setShowFloorMapping(!showFloorMapping)}
          >
            <CardHeader>
              <CardTitle className="text-lg">Floor PCA Mapping</CardTitle>
              <CardDescription>
                Assign PCAs to Upper and/or Lower floors
              </CardDescription>
            </CardHeader>
            {showFloorMapping && (
              <CardContent>
                <FloorPCAMappingPanel />
              </CardContent>
            )}
          </Card>
        </div>
      </CardContent>
    </Card>
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
  const [preferredSlots, setPreferredSlots] = useState<number[]>(preference.preferred_slots || [])
  const [gymSchedule, setGymSchedule] = useState<number | null>(preference.gym_schedule ?? null)
  const [avoidGymSchedule, setAvoidGymSchedule] = useState<boolean>(preference.avoid_gym_schedule ?? true)
  const [floorPCASelection, setFloorPCASelection] = useState<'upper' | 'lower' | null>(preference.floor_pca_selection ?? null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Validation: max 2 preferred PCAs, max 1 preferred slot
    if (preferredPCA.length > 2) {
      toast.warning('Maximum 2 preferred PCAs allowed')
      return
    }
    if (preferredSlots.length > 1) {
      toast.warning('Maximum 1 preferred slot allowed')
      return
    }
    onSave({
      team: preference.team,
      preferred_pca_ids: preferredPCA,
      preferred_slots: preferredSlots,
      gym_schedule: gymSchedule,
      avoid_gym_schedule: avoidGymSchedule,
      floor_pca_selection: floorPCASelection,
    })
  }

  const togglePCA = (pcaId: string) => {
    setPreferredPCA(prev => {
      if (prev.includes(pcaId)) {
        return prev.filter(id => id !== pcaId)
      } else {
        // Max 2 preferred PCAs
        if (prev.length >= 2) {
          return prev
        }
        return [...prev, pcaId]
      }
    })
  }

  const handleSlotChange = (slot: number) => {
    // Radio button behavior: select only this slot (max 1)
    // If clicking the same slot that's already selected, deselect it
    if (preferredSlots.includes(slot)) {
      setPreferredSlots([])
    } else {
      setPreferredSlots([slot])
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border p-4 rounded">
      <div>
        <label className="block text-sm font-medium mb-1">Team: {preference.team}</label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Floor PCA Selection</label>
        <select
          value={floorPCASelection || ''}
          onChange={(e) => setFloorPCASelection(e.target.value === '' ? null : e.target.value as 'upper' | 'lower')}
          className="px-3 py-1 border rounded w-full"
        >
          <option value="">None</option>
          <option value="upper">Upper</option>
          <option value="lower">Lower</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Select the floor type for this team to filter compatible PCAs
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Preferred PCA (max 2) {preferredPCA.length > 0 && `(${preferredPCA.length}/2)`}
        </label>
        <div className="max-h-40 overflow-y-auto border rounded p-2">
          {staff.filter(s => s.floating).map((s) => (
            <label key={s.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={preferredPCA.includes(s.id)}
                disabled={!preferredPCA.includes(s.id) && preferredPCA.length >= 2}
                onChange={(e) => togglePCA(s.id)}
              />
              <span className={!preferredPCA.includes(s.id) && preferredPCA.length >= 2 ? 'text-muted-foreground' : ''}>
                {s.name}
              </span>
            </label>
          ))}
        </div>
        {preferredPCA.length > 1 && (
          <p className="text-xs text-muted-foreground mt-1">
            Order: {preferredPCA.map(id => staff.find(s => s.id === id)?.name).join(' → ')}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Preferred Slot (1 only)</label>
        <div className="flex space-x-2">
          {[1, 2, 3, 4].map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => handleSlotChange(slot)}
              className={`px-3 py-1 rounded ${
                preferredSlots.includes(slot) ? 'bg-blue-600 text-white' : 'bg-secondary'
              }`}
            >
              {getSlotLabel(slot)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Gym Schedule</label>
        <div className="flex items-center space-x-2">
          <select
            value={gymSchedule || ''}
            onChange={(e) => setGymSchedule(e.target.value ? parseInt(e.target.value) : null)}
            className="px-3 py-1 border rounded"
          >
            <option value="">No gym schedule</option>
            {[1, 2, 3, 4].map((slot) => (
              <option key={slot} value={slot}>
                {getSlotTime(slot)}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-md border border-input overflow-hidden">
            <button
              type="button"
              onClick={() => setAvoidGymSchedule(true)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                avoidGymSchedule
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Not to avoid
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {avoidGymSchedule 
            ? 'Floating PCA will avoid this team\'s gym schedule slot'
            : 'Floating PCA can be assigned to this team\'s gym schedule slot'}
        </p>
      </div>

      <div className="flex space-x-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

