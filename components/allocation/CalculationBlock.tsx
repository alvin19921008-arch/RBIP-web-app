'use client'

import { Team } from '@/types/staff'
import { ScheduleCalculations } from '@/types/schedule'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useState, memo } from 'react'
import { Pencil } from 'lucide-react'

interface CalculationBlockProps {
  team: Team
  calculations: ScheduleCalculations | null
  shsBedCounts?: number | null
  studentPlacementBedCounts?: number | null
  onEditBedCounts?: (team: Team) => void
}

function AcademicCapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3 1 9l11 6 9-4.909V17h2V9L12 3Zm-7.244 8.224L12 15.174l7.244-3.95L12 7.274l-7.244 3.95Z" />
      <path d="M5 12.6V16c0 .552.447 1.05 1.12 1.416C7.69 18.28 9.79 19 12 19c2.21 0 4.31-.72 5.88-1.584.673-.366 1.12-.864 1.12-1.416v-3.4l-7 3.818-7-3.818Z" />
    </svg>
  )
}

export const CalculationBlock = memo(function CalculationBlock({
  team,
  calculations,
  shsBedCounts,
  studentPlacementBedCounts,
  onEditBedCounts,
}: CalculationBlockProps) {
  const [isHovering, setIsHovering] = useState(false)

  if (!calculations) {
    return (
      <Card>
        <CardContent className="p-2 pt-1">
          <p className="text-xs text-muted-foreground">No calculations available</p>
        </CardContent>
      </Card>
    )
  }

  const relievingBeds = calculations.beds_for_relieving
  const isNegative = relievingBeds < 0
  const relievingText = isNegative 
    ? `Releases ${Math.abs(relievingBeds).toFixed(2)} beds`
    : `Takes ${relievingBeds.toFixed(2)} beds`

  const shs = shsBedCounts ?? 0
  const students = studentPlacementBedCounts ?? 0
  const showAdjustmentsLine = shs > 0 || students > 0

  return (
    <Card>
      <CardContent className="p-2 pt-1 space-y-1 text-xs">
        <div>
          <span className="font-semibold">Wards:</span>{' '}
          {calculations.designated_wards.join(', ') || 'None'}
        </div>
        <div>
          <span className="font-semibold">Total beds:</span>{' '}
          <span
            className="inline-flex items-center gap-1"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <span className={onEditBedCounts ? 'underline' : ''}>
              {calculations.total_beds_designated}
            </span>
            {onEditBedCounts && isHovering && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onEditBedCounts(team)
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </span>
        </div>

        {showAdjustmentsLine ? (
          <div className="text-[11px] text-muted-foreground flex items-center gap-3">
            {shs > 0 ? <span className="whitespace-nowrap">SHS:{shs}</span> : null}
            {students > 0 ? (
              <Tooltip content="Student placement bed counts" side="top">
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <AcademicCapIcon className="h-3 w-3" />
                  <span>{students}</span>
                </span>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
        <div>
          <span className="font-semibold">PT:</span> {calculations.pt_per_team.toFixed(2)}
        </div>
        <div>
          <span className={isNegative ? 'text-red-600' : 'text-green-600'}>
            {relievingText}
          </span>
        </div>
      </CardContent>
    </Card>
  )
})
