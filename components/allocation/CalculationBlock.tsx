'use client'

import { Team } from '@/types/staff'
import { ScheduleCalculations } from '@/types/schedule'
import { Card, CardContent } from '@/components/ui/card'
import { useState } from 'react'

interface CalculationBlockProps {
  team: Team
  calculations: ScheduleCalculations | null
  onBedsChange?: (team: Team, newBeds: number) => void
}

export function CalculationBlock({ team, calculations, onBedsChange }: CalculationBlockProps) {
  const [isEditingBeds, setIsEditingBeds] = useState(false)
  const [editedBeds, setEditedBeds] = useState(calculations?.total_beds_designated || 0)

  if (!calculations) {
    return (
      <Card>
        <CardContent className="p-2 pt-1">
          <p className="text-xs text-muted-foreground">No calculations available</p>
        </CardContent>
      </Card>
    )
  }

  const handleBedsClick = () => {
    setIsEditingBeds(true)
    setEditedBeds(calculations.total_beds_designated)
  }

  const handleBedsBlur = () => {
    setIsEditingBeds(false)
    if (onBedsChange && editedBeds !== calculations.total_beds_designated) {
      onBedsChange(team, editedBeds)
      // Trigger save by updating calculations - this will mark as unsaved
      // The parent component should detect this change and enable save button
    }
  }

  const handleBedsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBedsBlur()
    } else if (e.key === 'Escape') {
      setIsEditingBeds(false)
      setEditedBeds(calculations.total_beds_designated)
    }
  }

  const relievingBeds = calculations.beds_for_relieving
  const isNegative = relievingBeds < 0
  const relievingText = isNegative 
    ? `Releases ${Math.abs(relievingBeds).toFixed(2)} beds`
    : `Takes ${relievingBeds.toFixed(2)} beds`

  return (
    <Card>
      <CardContent className="p-2 pt-1 space-y-1 text-xs">
        <div>
          <span className="font-semibold">Wards:</span>{' '}
          {calculations.designated_wards.join(', ') || 'None'}
        </div>
        <div>
          <span className="font-semibold">Bed No.:</span>{' '}
          {isEditingBeds ? (
            <input
              type="number"
              value={editedBeds}
              onChange={(e) => setEditedBeds(Number(e.target.value))}
              onBlur={handleBedsBlur}
              onKeyDown={handleBedsKeyDown}
              className="w-16 px-1 border rounded text-xs"
              autoFocus
            />
          ) : (
            <span 
              className="cursor-pointer underline"
              onClick={handleBedsClick}
            >
              {calculations.total_beds_designated}
            </span>
          )}
        </div>
        <div>
          <span className="font-semibold">PT:</span> {calculations.pt_per_team.toFixed(2)}
        </div>
        <div>
          <span className="font-semibold">Relieving:</span>{' '}
          <span className={isNegative ? 'text-red-600' : 'text-green-600'}>
            {relievingText}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
