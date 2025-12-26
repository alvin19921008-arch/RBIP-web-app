'use client'

import { Team } from '@/types/staff'
import { ScheduleCalculations } from '@/types/schedule'
import { Card, CardContent } from '@/components/ui/card'

interface PCACalculationBlockProps {
  team: Team
  calculations: ScheduleCalculations | null
}

export function PCACalculationBlock({ team, calculations }: PCACalculationBlockProps) {
  if (!calculations) {
    return (
      <Card>
        <CardContent className="p-2 pt-1">
          <p className="text-xs text-muted-foreground">No calculations available</p>
        </CardContent>
      </Card>
    )
  }

  const expectedBeds = calculations.expected_beds_per_team ?? 0
  const averagePCAPerTeam = calculations.average_pca_per_team ?? 0

  return (
    <Card>
      <CardContent className="p-2 pt-1 space-y-1 text-xs">
        <div>
          <span className="font-semibold">Daily bed load:</span> {expectedBeds.toFixed(1)}
        </div>
        <div>
          <span className="font-semibold">Avg PCA/team:</span> {averagePCAPerTeam.toFixed(2)}
        </div>
      </CardContent>
    </Card>
  )
}

