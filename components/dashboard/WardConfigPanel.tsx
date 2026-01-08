'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Ward } from '@/types/allocation'
import { Team } from '@/types/staff'
import { WardEditDialog } from './WardEditDialog'
import { Edit2, Trash2, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast-provider'

const INITIAL_WARDS = [
  'R7B', 'R7C', 'R8A', 'R8B', 'R8C',
  'R9A', 'R9C', 'R10A', 'R10B', 'R10C',
  'R11A', 'R11B', 'R11C'
]

// Parse floor from ward name (e.g., "R7A" → 7, "R11B" → 11)
function getFloorFromWardName(name: string): number | null {
  const match = name.match(/^R(\d+)[A-Z]$/i)
  return match ? parseInt(match[1], 10) : null
}

export function WardConfigPanel() {
  const [wards, setWards] = useState<Ward[]>([])
  const [loading, setLoading] = useState(false)
  const [editingWard, setEditingWard] = useState<Ward | Partial<Ward> | null>(null)
  const [deletingWardId, setDeletingWardId] = useState<string | null>(null)
  const supabase = createClientComponentClient()
  const toast = useToast()

  useEffect(() => {
    loadWards()
  }, [])

  const loadWards = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('wards')
        .select('*')
        .order('name')

      if (error) {
        console.error('Error loading wards:', error)
        return
      }

      if (data) {
        setWards(data.map((ward: any) => ({
          id: ward.id,
          name: ward.name,
          total_beds: ward.total_beds,
          team_assignments: ward.team_assignments || {},
        })))
      }
    } catch (err) {
      console.error('Error loading wards:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (wardData: Partial<Ward>): Promise<void> => {
    if (editingWard?.id) {
      // Update existing ward
      const { error } = await supabase
        .from('wards')
        .update({
          name: wardData.name,
          total_beds: wardData.total_beds,
        })
        .eq('id', editingWard.id)

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation
          throw new Error('Ward name already exists')
        }
        throw new Error(error.message || 'Failed to update ward')
      }
    } else {
      // Insert new ward
      const { error } = await supabase
        .from('wards')
        .insert({
          name: wardData.name,
          total_beds: wardData.total_beds,
          team_assignments: {},
        })

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation
          throw new Error('Ward name already exists')
        }
        throw new Error(error.message || 'Failed to create ward')
      }
    }

    await loadWards()
    setEditingWard(null)
  }

  const handleDelete = async () => {
    if (!deletingWardId) return

    try {
      const { error } = await supabase
        .from('wards')
        .delete()
        .eq('id', deletingWardId)

      if (error) throw error

      await loadWards()
      setDeletingWardId(null)
      toast.success('Ward deleted.')
    } catch (err) {
      console.error('Error deleting ward:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      toast.error('Error deleting ward.', errorMsg)
    }
  }

  // Organize wards by floor
  const wardsByFloor: Record<number, Ward[]> = { 7: [], 8: [], 9: [], 10: [], 11: [] }

  wards.forEach(ward => {
    const floor = getFloorFromWardName(ward.name)
    if (floor && floor >= 7 && floor <= 11) {
      if (!wardsByFloor[floor]) {
        wardsByFloor[floor] = []
      }
      wardsByFloor[floor].push(ward)
    }
  })

  // Sort wards within each floor alphabetically
  Object.keys(wardsByFloor).forEach(floorStr => {
    const floor = parseInt(floorStr, 10)
    wardsByFloor[floor].sort((a, b) => a.name.localeCompare(b.name))
  })

  // Render a ward card
  const renderWardCard = (ward: Ward) => {
    const isDeletable = !INITIAL_WARDS.includes(ward.name)

    // Get teams assigned to this ward (filter out teams with 0 or undefined beds)
    const assignedTeams = Object.entries(ward.team_assignments || {})
      .filter(([_, bedCount]) => bedCount && bedCount > 0)
      .map(([team, bedCount]) => ({ team: team as Team, bedCount }))

    // Format team display text
    const formatTeamsText = () => {
      if (assignedTeams.length === 0) {
        return 'No teams assigned'
      } else if (assignedTeams.length === 1) {
        // Single team: just show team name
        return assignedTeams[0].team
      } else {
        // Multiple teams: show team name and bed count in brackets
        return assignedTeams.map(({ team, bedCount }) => `${team} (${bedCount})`).join(', ')
      }
    }

    return (
      <Card key={ward.id} className="p-4">
        <div className="flex flex-col space-y-2">
          <div>
            <h4 className="font-semibold text-lg">{ward.name}</h4>
            <p className="text-sm text-muted-foreground">{ward.total_beds} beds</p>
            <p className="text-sm text-muted-foreground">{formatTeamsText()}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingWard(ward)}
              className="flex-1"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {isDeletable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingWardId(ward.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
  }

  // Render floor row
  const renderFloorRow = (floor: number) => {
    const floorWards = wardsByFloor[floor] || []
    if (floorWards.length === 0) return null

    return (
      <div key={floor} className="space-y-2">
        <h3 className="text-sm font-medium">Floor {floor}</h3>
        <div className="grid grid-cols-3 gap-4">
          {floorWards.map(ward => renderWardCard(ward))}
        </div>
      </div>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="space-y-6">
              <Button onClick={() => setEditingWard({})}>
                <Plus className="h-4 w-4 mr-2" />
                Add New Ward
              </Button>

              {/* Render floors in reverse order (11 → 7) */}
              {[11, 10, 9, 8, 7].map(floor => renderFloorRow(floor))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Add Dialog */}
      {editingWard !== null && (
        <WardEditDialog
          ward={editingWard}
          existingWards={wards}
          onSave={handleSave}
          onCancel={() => setEditingWard(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletingWardId !== null} onOpenChange={() => setDeletingWardId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Ward</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action is irreversible. Are you sure you want to delete this ward?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingWardId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}