'use client'

import { useState, useEffect } from 'react'
import { Team } from '@/types/staff'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { formatFTE } from '@/lib/utils/rounding'

interface TieBreakDialogProps {
  open: boolean
  teams: Team[]
  pendingFTE: number
  onSelect: (team: Team) => void
}

export function TieBreakDialog({ open, teams, pendingFTE, onSelect }: TieBreakDialogProps) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  useEffect(() => {
    if (open) {
      // Reset selection when dialog opens
      setSelectedTeam(null)
    }
  }, [open])

  const handleConfirm = () => {
    if (selectedTeam) {
      onSelect(selectedTeam)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>PCA Allocation Tie-Break</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Multiple teams need {formatFTE(pendingFTE)} FTE of PCA after assigning fix-team PCA. Which team should be fulfilled first?
          </p>
          
          <div className="space-y-2">
            <Label>Select Team</Label>
            <div className="space-y-2">
              {teams.map((team) => (
                <label key={team} className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-accent rounded">
                  <input
                    type="radio"
                    name="team"
                    value={team}
                    checked={selectedTeam === team}
                    onChange={() => setSelectedTeam(team)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">{team}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedTeam}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
