'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Staff } from '@/types/staff'

export function FloorPCAMappingPanel() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [upperPCAs, setUpperPCAs] = useState<Set<string>>(new Set())
  const [lowerPCAs, setLowerPCAs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('staff')
        .select('*')
        .eq('rank', 'PCA')
        .order('name')

      if (data) {
        setStaff(data as Staff[])
        
        // Initialize state from loaded data
        const upperSet = new Set<string>()
        const lowerSet = new Set<string>()
        
        data.forEach((s: Staff) => {
          if (s.floor_pca) {
            if (s.floor_pca.includes('upper')) {
              upperSet.add(s.id)
            }
            if (s.floor_pca.includes('lower')) {
              lowerSet.add(s.id)
            }
          }
        })
        
        setUpperPCAs(upperSet)
        setLowerPCAs(lowerSet)
      }
    } catch (err) {
      console.error('Error loading data:', err)
      alert('Failed to load PCA staff data')
    } finally {
      setLoading(false)
    }
  }

  const togglePCA = (pcaId: string, floorType: 'upper' | 'lower') => {
    if (floorType === 'upper') {
      setUpperPCAs(prev => {
        const newSet = new Set(prev)
        if (newSet.has(pcaId)) {
          newSet.delete(pcaId)
        } else {
          newSet.add(pcaId)
        }
        return newSet
      })
    } else {
      setLowerPCAs(prev => {
        const newSet = new Set(prev)
        if (newSet.has(pcaId)) {
          newSet.delete(pcaId)
        } else {
          newSet.add(pcaId)
        }
        return newSet
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Update each PCA's floor_pca property
      const updates = staff.map(async (pca) => {
        const floorTypes: ('upper' | 'lower')[] = []
        if (upperPCAs.has(pca.id)) {
          floorTypes.push('upper')
        }
        if (lowerPCAs.has(pca.id)) {
          floorTypes.push('lower')
        }
        
        // floor_pca is TEXT[] - direct mapping, no conversion needed
        const floor_pca = floorTypes.length > 0 ? floorTypes : null
        
        const { error } = await supabase
          .from('staff')
          .update({ floor_pca })
          .eq('id', pca.id)
        
        if (error) throw error
      })

      await Promise.all(updates)
      alert('Floor PCA mapping saved successfully!')
    } catch (err) {
      console.error('Error saving floor PCA mapping:', err)
      alert(`Error saving floor PCA mapping: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const isInBoth = (pcaId: string) => {
    return upperPCAs.has(pcaId) && lowerPCAs.has(pcaId)
  }

  if (loading) {
    return <p>Loading...</p>
  }

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upper Floor PCA Section */}
          <div className="border rounded p-4">
            <h3 className="font-semibold text-lg mb-3">Upper Floor PCA</h3>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {staff.map((pca) => {
                const isUpper = upperPCAs.has(pca.id)
                const inBoth = isInBoth(pca.id)
                return (
                  <label
                    key={pca.id}
                    className={`flex items-center space-x-2 p-2 rounded ${
                      inBoth ? 'bg-yellow-100 dark:bg-yellow-900' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isUpper}
                      onChange={() => togglePCA(pca.id, 'upper')}
                    />
                    <span className={isUpper ? 'font-medium' : ''}>
                      {pca.name}
                      {inBoth && (
                        <span className="ml-2 text-xs text-yellow-700 dark:text-yellow-300">
                          (Both)
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Lower Floor PCA Section */}
          <div className="border rounded p-4">
            <h3 className="font-semibold text-lg mb-3">Lower Floor PCA</h3>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {staff.map((pca) => {
                const isLower = lowerPCAs.has(pca.id)
                const inBoth = isInBoth(pca.id)
                return (
                  <label
                    key={pca.id}
                    className={`flex items-center space-x-2 p-2 rounded ${
                      inBoth ? 'bg-yellow-100 dark:bg-yellow-900' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isLower}
                      onChange={() => togglePCA(pca.id, 'lower')}
                    />
                    <span className={isLower ? 'font-medium' : ''}>
                      {pca.name}
                      {inBoth && (
                        <span className="ml-2 text-xs text-yellow-700 dark:text-yellow-300">
                          (Both)
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>Note:</strong> A PCA can belong to both types if selected in both sections. 
            PCAs selected in both sections are highlighted in yellow.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Floor PCA Mapping'}
          </Button>
        </div>
    </div>
  )
}

