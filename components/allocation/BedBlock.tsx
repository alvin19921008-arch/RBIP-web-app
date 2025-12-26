'use client'

import { Team } from '@/types/staff'
import { BedAllocation } from '@/types/schedule'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BedBlockProps {
  team: Team
  allocations: BedAllocation[]
}

export function BedBlock({ team, allocations }: BedBlockProps) {
  const receiving = allocations.filter(a => a.to_team === team)
  const releasing = allocations.filter(a => a.from_team === team)

  return (
    <Card>
      <CardContent className="p-2 pt-1">
        <div className="space-y-1">
          {receiving.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-600 mb-1">Takes:</p>
              {receiving.map((allocation) => (
                <div key={allocation.id} className="text-xs">
                  {allocation.num_beds} beds from {allocation.from_team}
                </div>
              ))}
            </div>
          )}
          {releasing.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 mb-1">Releases:</p>
              {releasing.map((allocation) => (
                <div key={allocation.id} className="text-xs">
                  {allocation.num_beds} beds to {allocation.to_team}
                </div>
              ))}
            </div>
          )}
          {receiving.length === 0 && releasing.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No bed allocation
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

