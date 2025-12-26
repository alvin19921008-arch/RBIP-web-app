'use client'

import { Card, CardContent } from '@/components/ui/card'

interface SummaryColumnProps {
  totalBeds: number
  totalPTOnDuty: number
  bedsPerPT: number
}

export function SummaryColumn({ totalBeds, totalPTOnDuty, bedsPerPT }: SummaryColumnProps) {
  return (
    <Card className="bg-slate-50 border-slate-300">
      <CardContent className="p-2 pt-1 space-y-1 text-xs">
        <div>
          <span className="font-semibold">Total Beds:</span> {totalBeds}
        </div>
        <div>
          <span className="font-semibold">Total PT:</span> {totalPTOnDuty.toFixed(2)}
        </div>
        <div>
          <span className="font-semibold">Beds/PT:</span> {bedsPerPT.toFixed(2)}
        </div>
      </CardContent>
    </Card>
  )
}
