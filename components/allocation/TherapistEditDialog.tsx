'use client'

import { useState } from 'react'
import { Team } from '@/types/staff'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface TeamAllocation {
  team: Team
  fte: number
}

interface TherapistEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffName: string
  currentAllocations: TeamAllocation[]
  onSave: (allocations: TeamAllocation[]) => void
}

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

export function TherapistEditDialog({
  open,
  onOpenChange,
  staffName,
  currentAllocations,
  onSave,
}: TherapistEditDialogProps) {
  const [allocations, setAllocations] = useState<TeamAllocation[]>(currentAllocations)

  const totalFTE = allocations.reduce((sum, a) => sum + a.fte, 0)
  const isValid = totalFTE <= 1 && totalFTE >= 0

  const addAllocation = () => {
    setAllocations([...allocations, { team: 'FO', fte: 0 }])
  }

  const removeAllocation = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index))
  }

  const updateAllocation = (index: number, field: keyof TeamAllocation, value: Team | number) => {
    const updated = [...allocations]
    updated[index] = { ...updated[index], [field]: value }
    setAllocations(updated)
  }

  const handleSave = () => {
    if (isValid) {
      onSave(allocations.filter(a => a.fte > 0))
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Team Allocation - {staffName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            {allocations.map((allocation, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={allocation.team}
                  onChange={(e) => updateAllocation(index, 'team', e.target.value as Team)}
                  className="flex-1 px-3 py-2 border rounded-md"
                >
                  {TEAMS.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.25"
                  value={allocation.fte}
                  onChange={(e) => updateAllocation(index, 'fte', parseFloat(e.target.value) || 0)}
                  className="w-24 px-3 py-2 border rounded-md"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeAllocation(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={addAllocation}>
            Add Team Allocation
          </Button>

          <div className="text-sm">
            <span className="font-semibold">Total FTE: </span>
            <span className={isValid ? 'text-green-600' : 'text-red-600'}>
              {totalFTE.toFixed(2)}
            </span>
            {!isValid && (
              <span className="text-red-600 ml-2">
                (Must be between 0 and 1)
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

